import Fastify from "fastify";
import cors from "@fastify/cors";
import statik from "@fastify/static";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import os from "node:os";
import { spawn } from "node:child_process";
import { PassThrough } from "node:stream";
import { randomUUID, scryptSync, timingSafeEqual } from "node:crypto";
import { Client, GatewayIntentBits, ChannelType } from "discord.js";
import { joinVoiceChannel, createAudioPlayer, createAudioResource, StreamType } from "@discordjs/voice";
import { Client as TSClient, generateIdentity } from "@honeybbq/teamspeak-client";
import OpusScript from "opusscript";

type Item = {
  id: string;
  title: string;
  url: string;
  source: string;
  duration?: number;
  thumbnail?: string;
};

type User = { id: string; name: string; hash: string; role: "admin" | "user" };
type DashboardTile = { id: string; title: string; color: string; icon: string; locked: boolean };
type State = {
  users: User[];
  playlists: { id: string; name: string; items: Item[] }[];
  settings: Record<string, unknown>;
  dashboard: DashboardTile[];
  discord: any[];
  ts3: any[];
};

const ROOT = process.env.RADIOBOT_DATA || "/var/lib/radiobot";
const PORT = Number(process.env.PORT || 3000);
const HOST = process.env.HOST || "0.0.0.0";
const FRONTEND = path.resolve(process.env.RADIOBOT_FRONTEND || path.join(process.cwd(), "../frontend"));
const YTDLP = process.env.YTDLP_PATH || "yt-dlp";
const FFMPEG = process.env.FFMPEG_PATH || "ffmpeg";
const DATA = path.join(ROOT, "state.json");

const defaults: State = {
  users: [],
  playlists: [],
  settings: {
    volume: 80,
    mode: "queue",
    activeInstance: "default",
    networkInterface: "auto",
    prefix: "!",
    discordBotClientId: "",
    spotifyConfigured: Boolean(process.env.SPOTIFY_CLIENT_ID && process.env.SPOTIFY_CLIENT_SECRET)
  },
  dashboard: [
    { id: "now", title: "Jetzt läuft", color: "violet", icon: "🎵", locked: true },
    { id: "queue", title: "Queue", color: "blue", icon: "📋", locked: true },
    { id: "search", title: "Suche", color: "green", icon: "🔎", locked: true },
    { id: "radio", title: "Radio", color: "orange", icon: "📻", locked: true },
    { id: "system", title: "System", color: "pink", icon: "🖥️", locked: true },
    { id: "network", title: "Netzwerk", color: "cyan", icon: "🌐", locked: true },
    { id: "instances", title: "Instanzen", color: "indigo", icon: "🎧", locked: true },
    { id: "playlists", title: "Playlists", color: "amber", icon: "💿", locked: true }
  ],
  discord: [],
  ts3: []
};

let state: State = structuredClone(defaults);
let saveTimer: ReturnType<typeof setTimeout> | undefined;
const sessions = new Map<string, string>();

async function save(): Promise<void> {
  if (saveTimer) clearTimeout(saveTimer);
  saveTimer = setTimeout(() => {
    void writeFile(DATA, JSON.stringify(state, null, 2), "utf8");
  }, 50);
}

async function load(): Promise<void> {
  await mkdir(ROOT, { recursive: true });
  try {
    state = JSON.parse(await readFile(DATA, "utf8")) as State;
  } catch {
    await writeFile(DATA, JSON.stringify(state, null, 2), "utf8");
  }
}

function hash(password: string): string {
  return scryptSync(password, "radiobot-v4", 32).toString("hex");
}

function validPassword(user: User, password: string): boolean {
  const a = Buffer.from(user.hash, "hex");
  const b = Buffer.from(hash(password), "hex");
  return a.length === b.length && timingSafeEqual(a, b);
}

function auth(request: { headers: { authorization?: string } }): User | undefined {
  const token = String(request.headers.authorization || "").replace(/^Bearer /, "");
  const id = sessions.get(token);
  return state.users.find((user) => user.id === id);
}

async function json(url: string, init?: RequestInit): Promise<any> {
  const response = await fetch(url, init);
  if (!response.ok) throw new Error(`${response.status} ${response.statusText}`);
  return response.json();
}

function youtubeSearch(query: string): Promise<Item[]> {
  return new Promise((resolve, reject) => {
    const child = spawn(YTDLP, [`ytsearch8:${query}`, "--flat-playlist", "--dump-single-json", "--no-warnings"]);
    let output = "";
    child.stdout.on("data", (data) => { output += data.toString(); });
    child.on("error", reject);
    child.on("close", (code) => {
      if (code !== 0) return reject(new Error("yt-dlp search failed"));
      try {
        const parsed = JSON.parse(output);
        resolve((parsed.entries || []).map((entry: any) => ({
          id: entry.id || randomUUID(),
          title: entry.title,
          url: entry.url || `https://www.youtube.com/watch?v=${entry.id}`,
          duration: entry.duration,
          source: "youtube",
          thumbnail: entry.thumbnails?.[0]?.url
        })));
      } catch (error) {
        reject(error);
      }
    });
  });
}

async function radioSearch(query: string): Promise<Item[]> {
  const data = await json(
    `https://de1.api.radio-browser.info/json/stations/search?limit=15&hidebroken=true&order=clickcount&reverse=true&name=${encodeURIComponent(query)}`
  );
  return data.map((station: any) => ({
    id: station.stationuuid,
    title: station.name,
    url: station.url_resolved || station.url,
    source: "radio",
    thumbnail: station.favicon
  }));
}

let spotifyToken = "";
let spotifyExpiry = 0;
async function spotifySearch(query: string): Promise<Item[]> {
  const clientId = process.env.SPOTIFY_CLIENT_ID;
  const clientSecret = process.env.SPOTIFY_CLIENT_SECRET;
  if (!clientId || !clientSecret) return [];

  if (Date.now() >= spotifyExpiry) {
    const basic = Buffer.from(`${clientId}:${clientSecret}`).toString("base64");
    const token = await json("https://accounts.spotify.com/api/token", {
      method: "POST",
      headers: { Authorization: `Basic ${basic}`, "Content-Type": "application/x-www-form-urlencoded" },
      body: "grant_type=client_credentials"
    });
    spotifyToken = token.access_token;
    spotifyExpiry = Date.now() + ((token.expires_in || 3600) - 60) * 1000;
  }

  const result = await json(
    `https://api.spotify.com/v1/search?type=track&limit=8&q=${encodeURIComponent(query)}`,
    { headers: { Authorization: `Bearer ${spotifyToken}` } }
  );

  return (result.tracks?.items || []).map((track: any) => ({
    id: track.id,
    title: `${track.name} — ${(track.artists || []).map((artist: any) => artist.name).join(", ")}`,
    url: track.external_urls?.spotify || "",
    source: "spotify",
    duration: track.duration_ms / 1000,
    thumbnail: track.album?.images?.[0]?.url
  }));
}

async function streamUrl(item: Item): Promise<string> {
  if (item.source === "radio") return item.url;
  if (item.source === "spotify") {
    const result = await youtubeSearch(item.title);
    if (!result[0]) throw new Error("Kein passendes Medium für Spotify-Titel gefunden");
    return streamUrl(result[0]);
  }

  return new Promise((resolve, reject) => {
    const child = spawn(YTDLP, [item.url, "-g", "-f", "bestaudio/best", "--no-playlist", "--no-warnings"]);
    let output = "";
    child.stdout.on("data", (data) => { output += data.toString(); });
    child.on("error", reject);
    child.on("close", (code) => {
      const url = output.trim().split(/\r?\n/)[0];
      if (code !== 0 || !url) return reject(new Error("stream resolve failed"));
      resolve(url);
    });
  });
}

class Player {
  queue: Item[] = [];
  current: Item | null = null;
  paused = false;
  volume = 80;
  mode: "queue" | "repeat" | "shuffle" = "queue";
  ffmpeg?: ReturnType<typeof spawn>;
  listeners = new Set<(data: Buffer) => void>();

  async enqueue(items: Item[]): Promise<void> {
    this.queue.push(...items);
    if (!this.current) await this.next();
  }

  async next(): Promise<void> {
    this.stopProcess();
    this.current = this.mode === "shuffle" && this.queue.length > 1
      ? this.queue.splice(Math.floor(Math.random() * this.queue.length), 1)[0]
      : this.queue.shift() || null;
    this.paused = false;
    if (!this.current) return;

    try {
      const url = await streamUrl(this.current);
      this.ffmpeg = spawn(FFMPEG, [
        "-hide_banner", "-loglevel", "error",
        "-reconnect", "1", "-reconnect_streamed", "1", "-reconnect_delay_max", "5",
        "-i", url, "-vn", "-f", "s16le", "-ar", "48000", "-ac", "2", "pipe:1"
      ]);
      this.ffmpeg.stdout.on("data", (data) => {
        for (const listener of this.listeners) listener(Buffer.from(data));
      });
      this.ffmpeg.on("close", () => {
        if (this.current && !this.paused) void this.next();
      });
    } catch {
      this.current = null;
      await this.next();
    }
  }

  pause(): void {
    if (this.ffmpeg) {
      this.ffmpeg.kill("SIGSTOP");
      this.paused = true;
    }
  }

  resume(): void {
    if (this.ffmpeg) {
      this.ffmpeg.kill("SIGCONT");
      this.paused = false;
    }
  }

  stop(): void {
    this.stopProcess();
    this.current = null;
    this.paused = false;
  }

  skip(): void {
    this.stopProcess();
    void this.next();
  }

  setVolume(value: number): void {
    this.volume = Math.max(0, Math.min(100, value));
  }

  snapshot() {
    return { current: this.current, queue: this.queue, paused: this.paused, volume: this.volume, mode: this.mode };
  }

  private stopProcess(): void {
    if (this.ffmpeg) {
      this.ffmpeg.kill("SIGTERM");
      this.ffmpeg = undefined;
    }
  }
}

class DiscordOutput {
  instances = new Map<string, any>();

  async connect(config: any) {
    const client = new Client({ intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildVoiceStates] });
    await client.login(config.token);
    this.instances.set(config.id, { ...config, client, voice: undefined, player: undefined, stream: undefined });
    return this.status();
  }

  async disconnect(id: string): Promise<void> {
    const instance = this.instances.get(id);
    if (!instance) return;
    instance.voice?.destroy();
    instance.stream?.end();
    await instance.client.destroy();
    this.instances.delete(id);
  }

  async join(id: string): Promise<void> {
    const instance = this.instances.get(id);
    if (!instance) throw new Error("Discord-Instanz nicht verbunden");
    const guild = instance.client.guilds.cache.get(instance.guildId);
    if (!guild) throw new Error("Guild nicht gefunden");
    instance.voice = joinVoiceChannel({ guildId: guild.id, channelId: instance.channelId, adapterCreator: guild.voiceAdapterCreator });
    instance.player = createAudioPlayer();
    instance.voice.subscribe(instance.player);
    instance.stream = new PassThrough();
    instance.player.play(createAudioResource(instance.stream, { inputType: StreamType.Raw }));
  }

  audio(data: Buffer): void {
    for (const instance of this.instances.values()) instance.stream?.write(data);
  }

  status() {
    return [...this.instances.values()].map((instance) => ({
      id: instance.id,
      name: instance.name,
      connected: true,
      guildId: instance.guildId || "",
      channelId: instance.channelId || "",
      guilds: instance.client.guilds.cache.size,
      prefix: instance.prefix || "!"
    }));
  }

  guilds(id: string) {
    const instance = this.instances.get(id);
    return instance
      ? [...instance.client.guilds.cache.values()].map((guild: any) => ({ id: guild.id, name: guild.name }))
      : [];
  }

  channels(id: string, guildId: string) {
    const instance = this.instances.get(id);
    const guild = instance?.client.guilds.cache.get(guildId);
    return guild
      ? [...guild.channels.cache.values()]
          .filter((channel: any) => channel.type === ChannelType.GuildVoice)
          .map((channel: any) => ({ id: channel.id, name: channel.name }))
      : [];
  }
}

class TSOutput {
  configs: any[] = [];
  clients = new Map<string, any>();
  encoder = new OpusScript(48000, 2, OpusScript.Application.AUDIO);
  pcm = Buffer.alloc(0);

  set(configs: any[]): void { this.configs = configs; }

  async connect(id: string): Promise<any[]> {
    const config = this.configs.find((entry) => entry.id === id);
    if (!config) throw new Error("TS3-Instanz nicht gefunden");
    const client = new TSClient(generateIdentity(8), config.host, config.nickname, {
      serverPassword: config.password,
      defaultChannel: config.channel
    });
    await client.connect();
    await client.waitConnected(AbortSignal.timeout(15000));
    this.clients.set(id, client);
    return this.status();
  }

  async disconnect(id: string): Promise<void> {
    const client = this.clients.get(id);
    if (client) {
      await client.disconnect();
      this.clients.delete(id);
    }
  }

  audio(data: Buffer): void {
    if (!this.clients.size) return;
    this.pcm = Buffer.concat([this.pcm, data]);
    while (this.pcm.length >= 3840) {
      const frame = this.pcm.subarray(0, 3840);
      this.pcm = this.pcm.subarray(3840);
      const opus = this.encoder.encode(frame, 960);
      for (const client of this.clients.values()) client.sendVoice(opus, 4);
    }
  }

  status() {
    return this.configs.map((config) => ({ ...config, password: undefined, connected: this.clients.has(config.id) }));
  }
}

function systemInfo() {
  const total = os.totalmem();
  const free = os.freemem();
  return {
    hostname: os.hostname(),
    platform: process.platform,
    node: process.version,
    cores: os.cpus().length,
    load: os.loadavg(),
    ram: { total, used: total - free, free },
    uptime: os.uptime()
  };
}

async function networkInfo() {
  const interfaces: any[] = [];
  for (const [name, values] of Object.entries(os.networkInterfaces())) {
    const rx = Number(await readFile(`/sys/class/net/${name}/statistics/rx_bytes`, "utf8").catch(() => "0"));
    const tx = Number(await readFile(`/sys/class/net/${name}/statistics/tx_bytes`, "utf8").catch(() => "0"));
    interfaces.push({ name, rx, tx, addresses: (values || []).map((value) => value?.address) });
  }
  return { hostname: os.hostname(), interfaces, selected: state.settings.networkInterface };
}

const player = new Player();
const discord = new DiscordOutput();
const ts3 = new TSOutput();
const app = Fastify({ logger: true });
player.listeners.add((data) => discord.audio(data));
player.listeners.add((data) => ts3.audio(data));

await load();
await app.register(cors, { origin: true });
await app.register(statik, { root: FRONTEND, prefix: "/" });

app.get("/api/setup", () => ({ initialized: state.users.length > 0 }));
app.post("/api/setup", async (request: any, reply) => {
  if (state.users.length) return reply.code(409).send({ error: "already initialized" });
  const body = request.body || {};
  if (!body.name || String(body.password || "").length < 10) {
    return reply.code(400).send({ error: "Benutzername und Passwort (min. 10 Zeichen) erforderlich" });
  }
  state.users.push({ id: randomUUID(), name: body.name, hash: hash(body.password), role: "admin" });
  await save();
  const token = randomUUID();
  sessions.set(token, state.users[0].id);
  return { token, user: { id: state.users[0].id, name: state.users[0].name, role: state.users[0].role } };
});

app.post("/api/login", (request: any, reply) => {
  const body = request.body || {};
  const user = state.users.find((entry) => entry.name === body.name);
  if (!user || !validPassword(user, String(body.password || ""))) {
    return reply.code(401).send({ error: "Ungültige Anmeldung" });
  }
  const token = randomUUID();
  sessions.set(token, user.id);
  return { token, user: { id: user.id, name: user.name, role: user.role } };
});

app.addHook("preHandler", async (request: any, reply) => {
  if (request.url.startsWith("/api/setup") || request.url.startsWith("/api/login") || request.url === "/api/health") return;
  if (request.url.startsWith("/api/") && !auth(request)) {
    return reply.code(401).send({ error: "unauthorized" });
  }
});

app.get("/api/health", () => ({ ok: true, version: "4.0.0" }));
app.get("/api/state", async () => ({ ...player.snapshot(), dashboard: state.dashboard, settings: state.settings, discord: discord.status(), ts3: ts3.status() }));

app.post("/api/play", async (request: any) => {
  const items = (request.body?.items || []).map((item: Item) => ({ ...item, id: item.id || randomUUID() }));
  await player.enqueue(items);
  return player.snapshot();
});

app.post("/api/play/:action", async (request: any) => {
  const params = request.params as { action: string };
  if (params.action === "pause") player.pause();
  else if (params.action === "resume") player.resume();
  else if (params.action === "stop") player.stop();
  else if (params.action === "skip") player.skip();
  else if (params.action === "volume") {
    player.setVolume(Number(request.body?.value));
    state.settings.volume = player.volume;
    await save();
  }
  return player.snapshot();
});

app.get("/api/search", async (request: any) => {
  const query = String(request.query?.q || "").trim();
  const source = String(request.query?.source || "all");
  if (!query) return { youtube: [], radio: [], spotify: [] };
  const result: { youtube: Item[]; radio: Item[]; spotify: Item[] } = { youtube: [], radio: [], spotify: [] };
  await Promise.allSettled([
    source === "all" || source === "youtube" ? youtubeSearch(query).then((items) => { result.youtube = items; }) : Promise.resolve(),
    source === "all" || source === "radio" ? radioSearch(query).then((items) => { result.radio = items; }) : Promise.resolve(),
    source === "all" || source === "spotify" ? spotifySearch(query).then((items) => { result.spotify = items; }) : Promise.resolve()
  ]);
  return result;
});

app.get("/api/playlists", () => state.playlists);
app.post("/api/playlists", async (request: any) => {
  const playlist = { id: randomUUID(), name: String(request.body?.name || "Neue Playlist"), items: [] as Item[] };
  state.playlists.push(playlist);
  await save();
  return playlist;
});
app.get("/api/playlists/:id", (request: any, reply) => {
  const playlist = state.playlists.find((entry) => entry.id === (request.params as { id: string }).id);
  return playlist || reply.code(404).send({ error: "not found" });
});
app.post("/api/playlists/:id/items", async (request: any, reply) => {
  const playlist = state.playlists.find((entry) => entry.id === (request.params as { id: string }).id);
  if (!playlist) return reply.code(404).send({ error: "not found" });
  playlist.items.push(...(request.body?.items || []));
  await save();
  return playlist;
});
app.post("/api/playlists/:id/play", async (request: any) => {
  const playlist = state.playlists.find((entry) => entry.id === (request.params as { id: string }).id);
  if (playlist) await player.enqueue(playlist.items);
  return player.snapshot();
});
app.delete("/api/playlists/:id/items/:itemId", async (request: any, reply) => {
  const params = request.params as { id: string; itemId: string };
  const playlist = state.playlists.find((entry) => entry.id === params.id);
  if (!playlist) return reply.code(404).send({ error: "not found" });
  playlist.items = playlist.items.filter((item) => item.id !== params.itemId);
  await save();
  return playlist;
});

app.get("/api/dashboard", () => ({ tiles: state.dashboard }));
app.put("/api/dashboard", async (request: any) => {
  const ids = Array.isArray(request.body?.tiles) ? request.body.tiles as string[] : [];
  const locked = state.dashboard.filter((tile) => tile.locked).map((tile) => tile.id);
  const ordered = ids.filter((id) => state.dashboard.some((tile) => tile.id === id));
  const missing = state.dashboard.map((tile) => tile.id).filter((id) => !ordered.includes(id));
  const nextIds = [...ordered, ...missing];
  if (locked.length && !locked.every((id) => nextIds.includes(id))) {
    return { tiles: state.dashboard };
  }
  state.dashboard = nextIds.map((id) => state.dashboard.find((tile) => tile.id === id)!).filter(Boolean);
  await save();
  return { tiles: state.dashboard };
});

app.get("/api/settings", () => state.settings);
app.put("/api/settings", async (request: any) => {
  state.settings = { ...state.settings, ...(request.body || {}) };
  if (typeof state.settings.volume === "number") player.setVolume(state.settings.volume);
  await save();
  return state.settings;
});
app.get("/api/system", () => systemInfo());
app.get("/api/network", () => networkInfo());

app.get("/api/discord/status", () => discord.status());
app.post("/api/discord/instances", async (request: any) => {
  state.discord = [...state.discord.filter((entry) => entry.id !== request.body?.id), request.body];
  await save();
  return state.discord;
});
app.post("/api/discord/connect", async (request: any) => discord.connect(request.body));
app.post("/api/discord/:id/disconnect", async (request: any) => {
  await discord.disconnect((request.params as { id: string }).id);
  return discord.status();
});
app.post("/api/discord/:id/join", async (request: any) => {
  await discord.join((request.params as { id: string }).id);
  return discord.status();
});
app.get("/api/discord/:id/guilds", (request: any) => discord.guilds((request.params as { id: string }).id));
app.get("/api/discord/:id/guilds/:gid/channels", (request: any) => {
  const params = request.params as { id: string; gid: string };
  return discord.channels(params.id, params.gid);
});

app.get("/api/ts3", () => ts3.status());
app.put("/api/ts3", async (request: any) => {
  state.ts3 = request.body?.instances || [];
  ts3.set(state.ts3);
  await save();
  return ts3.status();
});
app.post("/api/ts3/:id/connect", async (request: any) => ts3.connect((request.params as { id: string }).id));
app.post("/api/ts3/:id/disconnect", async (request: any) => {
  await ts3.disconnect((request.params as { id: string }).id);
  return ts3.status();
});

app.get("/", async (_request, reply) => reply.sendFile("index.html"));

await app.listen({ port: PORT, host: HOST });
