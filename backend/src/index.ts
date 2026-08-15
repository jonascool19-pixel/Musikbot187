import Fastify from 'fastify';
import cors from '@fastify/cors';
import fastifyStatic from '@fastify/static';
import { Client, GatewayIntentBits, REST, Routes, SlashCommandBuilder, ChannelType } from 'discord.js';
import { AudioPlayerStatus, NoSubscriberBehavior, VoiceConnection, VoiceConnectionStatus, createAudioPlayer, createAudioResource, joinVoiceChannel, StreamType } from '@discordjs/voice';
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';

const PORT = Number(process.env.PORT ?? 3000);
const APP_ROOT = path.resolve(process.env.APP_ROOT ?? path.join(import.meta.dirname, '../..'));
const DATA_DIR = path.resolve(process.env.DATA_DIR ?? '/var/lib/radiobot');
const MUSIC_DIR = path.join(DATA_DIR, 'music');
const DB_FILE = path.join(DATA_DIR, 'radiobot.json');
const SPOTIFY_FILE = path.join(DATA_DIR, 'spotify.json');
const WEB_USER = process.env.WEB_USER ?? 'admin';
const WEB_PASSWORD = process.env.WEB_PASSWORD ?? '';
const SPOTIFY_CLIENT_ID = process.env.SPOTIFY_CLIENT_ID ?? '';
const SPOTIFY_CLIENT_SECRET = process.env.SPOTIFY_CLIENT_SECRET ?? '';
const SPOTIFY_REDIRECT_URI = process.env.SPOTIFY_REDIRECT_URI ?? '';

fs.mkdirSync(MUSIC_DIR, { recursive: true });
fs.mkdirSync(DATA_DIR, { recursive: true });

interface Radio { id: string; name: string; url: string; enabled: boolean }
interface GuildState { guildId: string; voiceChannelId: string; radioId?: string; playing?: string; playingType?: 'radio' | 'file'; volume: number; paused: boolean; queue: string[] }
interface Db { radios: Radio[]; guilds: Record<string, GuildState> }
interface SpotifyState { accessToken?: string; refreshToken?: string; expiresAt?: number; displayName?: string; product?: string }

function loadJson<T>(file: string, fallback: T): T {
  try { return JSON.parse(fs.readFileSync(file, 'utf8')) as T; } catch { return fallback; }
}
function saveJson(file: string, value: unknown) { fs.writeFileSync(file, JSON.stringify(value, null, 2), { mode: 0o600 }); }
function id() { return crypto.randomBytes(5).toString('hex'); }
const db = loadJson<Db>(DB_FILE, { radios: [], guilds: {} });
const spotify: SpotifyState = loadJson<SpotifyState>(SPOTIFY_FILE, {});
const connections = new Map<string, VoiceConnection>();
const players = new Map<string, ReturnType<typeof createAudioPlayer>>();
const currentProcesses = new Map<string, ReturnType<typeof spawn>>();

function getState(guildId: string): GuildState {
  db.guilds[guildId] ??= { guildId, voiceChannelId: '', volume: 80, paused: false, queue: [] };
  return db.guilds[guildId];
}

function checkAuth(req: any, reply: any): boolean {
  if (!WEB_PASSWORD) return true;
  const header = String(req.headers.authorization ?? '');
  if (!header.startsWith('Basic ')) { reply.header('WWW-Authenticate', 'Basic realm="RadioBot"').code(401).send('Authentication required'); return false; }
  const decoded = Buffer.from(header.slice(6), 'base64').toString('utf8');
  const [user, password] = decoded.split(':');
  if (user !== WEB_USER || password !== WEB_PASSWORD) { reply.header('WWW-Authenticate', 'Basic realm="RadioBot"').code(401).send('Invalid credentials'); return false; }
  return true;
}

function makePlayer(guildId: string) {
  let player = players.get(guildId);
  if (!player) {
    player = createAudioPlayer({ behaviors: { noSubscriber: NoSubscriberBehavior.Stop } });
    player.on(AudioPlayerStatus.Idle, () => {
      currentProcesses.get(guildId)?.kill('SIGTERM');
      currentProcesses.delete(guildId);
      playNext(guildId).catch(console.error);
    });
    player.on('error', error => console.error('audio error', guildId, error));
    players.set(guildId, player);
  }
  return player;
}

function sourceToPath(source: string): string {
  const name = source.slice(5);
  const resolved = path.resolve(MUSIC_DIR, name);
  if (!resolved.startsWith(MUSIC_DIR + path.sep)) throw new Error('Ungültige Mediendatei');
  return resolved;
}

async function ensureConnection(guildId: string) {
  const state = getState(guildId);
  if (!state.voiceChannelId) throw new Error('Kein Voice-Channel konfiguriert.');
  const guild = await client.guilds.fetch(guildId);
  const channel = await guild.channels.fetch(state.voiceChannelId);
  if (!channel || channel.type !== ChannelType.GuildVoice) throw new Error('Voice-Channel nicht gefunden.');
  const existing = connections.get(guildId);
  if (existing && existing.state.status !== VoiceConnectionStatus.Destroyed) return existing;
  const conn = joinVoiceChannel({ channelId: channel.id, guildId: guild.id, adapterCreator: guild.voiceAdapterCreator });
  conn.on('error', error => console.error('voice error', guildId, error));
  connections.set(guildId, conn);
  conn.subscribe(makePlayer(guildId));
  return conn;
}

async function playNext(guildId: string) {
  const state = getState(guildId);
  const source = state.queue.shift();
  if (!source) { state.playing = undefined; state.playingType = undefined; saveJson(DB_FILE, db); return; }
  state.playing = source.startsWith('file:') ? source.slice(5) : source;
  state.playingType = source.startsWith('file:') ? 'file' : 'radio';
  state.paused = false;
  saveJson(DB_FILE, db);
  const conn = await ensureConnection(guildId);
  const player = makePlayer(guildId);
  const input = source.startsWith('file:') ? sourceToPath(source) : source;
  const args = source.startsWith('file:')
    ? ['-hide_banner', '-loglevel', 'error', '-i', input, '-vn', '-f', 's16le', '-ar', '48000', '-ac', '2', 'pipe:1']
    : ['-hide_banner', '-loglevel', 'error', '-reconnect', '1', '-reconnect_streamed', '1', '-reconnect_delay_max', '5', '-i', input, '-vn', '-f', 's16le', '-ar', '48000', '-ac', '2', 'pipe:1'];
  const ff = spawn('ffmpeg', args, { stdio: ['ignore', 'pipe', 'inherit'] });
  currentProcesses.set(guildId, ff);
  ff.on('exit', () => { if (currentProcesses.get(guildId) === ff) currentProcesses.delete(guildId); });
  const resource = createAudioResource(ff.stdout, { inputType: StreamType.Raw, inlineVolume: true });
  resource.volume?.setVolume(Math.max(0, Math.min(2, state.volume / 100)));
  conn.subscribe(player);
  player.play(resource);
}

async function stopGuild(guildId: string) {
  const state = getState(guildId);
  state.queue = [];
  state.playing = undefined;
  state.playingType = undefined;
  players.get(guildId)?.stop(true);
  currentProcesses.get(guildId)?.kill('SIGTERM');
  currentProcesses.delete(guildId);
  connections.get(guildId)?.destroy();
  connections.delete(guildId);
  saveJson(DB_FILE, db);
}

async function spotifyToken(): Promise<string> {
  if (spotify.accessToken && spotify.expiresAt && spotify.expiresAt > Date.now() + 30_000) return spotify.accessToken;
  if (!SPOTIFY_CLIENT_ID || !SPOTIFY_CLIENT_SECRET || !spotify.refreshToken) throw new Error('Spotify ist noch nicht verbunden.');
  const basic = Buffer.from(`${SPOTIFY_CLIENT_ID}:${SPOTIFY_CLIENT_SECRET}`).toString('base64');
  const response = await fetch('https://accounts.spotify.com/api/token', {
    method: 'POST', headers: { Authorization: `Basic ${basic}`, 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ grant_type: 'refresh_token', refresh_token: spotify.refreshToken })
  });
  if (!response.ok) throw new Error(`Spotify token refresh fehlgeschlagen (${response.status})`);
  const data = await response.json() as any;
  spotify.accessToken = data.access_token;
  spotify.expiresAt = Date.now() + Number(data.expires_in ?? 3600) * 1000;
  if (data.refresh_token) spotify.refreshToken = data.refresh_token;
  saveJson(SPOTIFY_FILE, spotify);
  return spotify.accessToken;
}

async function spotifyApi(endpoint: string, init: RequestInit = {}, retry = true): Promise<any> {
  const token = await spotifyToken();
  const headers = new Headers(init.headers); headers.set('Authorization', `Bearer ${token}`); if (init.body && !headers.has('Content-Type')) headers.set('Content-Type', 'application/json');
  const response = await fetch(`https://api.spotify.com/v1${endpoint}`, { ...init, headers });
  if (response.status === 401 && retry && spotify.refreshToken) { spotify.expiresAt = 0; await spotifyToken(); return spotifyApi(endpoint, init, false); }
  if (!response.ok) { const text = await response.text(); throw new Error(`Spotify API ${response.status}: ${text}`); }
  if (response.status === 204) return null;
  return response.json();
}

function spotifyTrackId(input: string): string | null {
  const match = input.match(/(?:open\.spotify\.com\/track\/|spotify:track:)([A-Za-z0-9]+)/);
  return match?.[1] ?? (input.length === 22 ? input : null);
}
function spotifyPlaylistId(input: string): string | null {
  const match = input.match(/(?:open\.spotify\.com\/playlist\/|spotify:playlist:)([A-Za-z0-9]+)/);
  return match?.[1] ?? null;
}

const client = new Client({ intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildVoiceStates] });
const commands = [
  new SlashCommandBuilder().setName('radio').setDescription('Radio starten').addStringOption(o => o.setName('name').setDescription('Sendername').setRequired(true)),
  new SlashCommandBuilder().setName('stop').setDescription('Wiedergabe stoppen'),
  new SlashCommandBuilder().setName('skip').setDescription('Nächste Quelle abspielen'),
  new SlashCommandBuilder().setName('volume').setDescription('Lautstärke setzen').addIntegerOption(o => o.setName('percent').setDescription('0-100').setRequired(true).setMinValue(0).setMaxValue(100)),
  new SlashCommandBuilder().setName('join').setDescription('Bot in deinen Voice-Channel holen')
].map(c => c.toJSON());

client.once('ready', async () => {
  console.log(`Discord online als ${client.user?.tag}`);
  try { await new REST({ version: '10' }).setToken(process.env.DISCORD_TOKEN!).put(Routes.applicationCommands(client.user!.id), { body: commands }); } catch (e) { console.error(e); }
});
client.on('interactionCreate', async interaction => {
  if (!interaction.isChatInputCommand() || !interaction.guildId) return;
  const state = getState(interaction.guildId);
  try {
    if (interaction.commandName === 'join') {
      const member = await interaction.guild!.members.fetch(interaction.user.id);
      if (!member.voice.channel || member.voice.channel.type !== ChannelType.GuildVoice) return void interaction.reply('Du musst selbst in einem Voice-Channel sein.');
      state.voiceChannelId = member.voice.channel.id; saveJson(DB_FILE, db); await ensureConnection(interaction.guildId); return void interaction.reply(`🔊 Verbunden mit **${member.voice.channel.name}**`);
    }
    if (interaction.commandName === 'stop') { await stopGuild(interaction.guildId); return void interaction.reply('⏹️ Gestoppt.'); }
    if (interaction.commandName === 'skip') { players.get(interaction.guildId)?.stop(true); return void interaction.reply('⏭️ Übersprungen.'); }
    if (interaction.commandName === 'volume') { const value = interaction.options.getInteger('percent', true); state.volume = value; saveJson(DB_FILE, db); return void interaction.reply(`🔊 Lautstärke: ${value}%`); }
    if (interaction.commandName === 'radio') {
      const name = interaction.options.getString('name', true); const radio = db.radios.find(r => r.name.toLowerCase() === name.toLowerCase());
      if (!radio) return void interaction.reply('Sender nicht gefunden.');
      state.queue = [radio.url]; state.radioId = radio.id; saveJson(DB_FILE, db); await playNext(interaction.guildId); return void interaction.reply(`📻 ${radio.name}`);
    }
  } catch (error) { console.error(error); if (!interaction.replied) await interaction.reply(`Fehler: ${error instanceof Error ? error.message : 'Unbekannt'}`); }
});

const app = Fastify({ logger: true });
await app.register(cors, { origin: true });
await app.register(fastifyStatic, { root: path.join(APP_ROOT, 'frontend'), prefix: '/', index: ['index.html'] });

app.addHook('preHandler', async (req, reply) => { if (!req.url.startsWith('/api/')) return; checkAuth(req, reply); });
app.get('/api/health', async () => ({ ok: true, discord: client.isReady(), version: '1.0.0' }));
app.get('/api/guilds', async () => client.guilds.cache.map(g => ({ id: g.id, name: g.name })));
app.get<{ Params: { id: string } }>('/api/guilds/:id/channels', async req => { const guild = await client.guilds.fetch(req.params.id); return guild.channels.cache.filter(c => c.type === ChannelType.GuildVoice).map(c => ({ id: c.id, name: c.name })); });
app.get('/api/radios', async () => db.radios);
app.post<{ Body: { name: string; url: string } }>('/api/radios', async req => { const radio: Radio = { id: id(), name: req.body.name.trim(), url: req.body.url.trim(), enabled: true }; db.radios.push(radio); saveJson(DB_FILE, db); return radio; });
app.delete<{ Params: { id: string } }>('/api/radios/:id', async req => { db.radios = db.radios.filter(r => r.id !== req.params.id); saveJson(DB_FILE, db); return { ok: true }; });
app.get('/api/media', async () => fs.readdirSync(MUSIC_DIR).filter(f => /\.(mp3|wav|ogg|flac|m4a)$/i.test(f)).sort());
app.get<{ Params: { id: string } }>('/api/state/:id', async req => getState(req.params.id));
app.post<{ Params: { id: string }; Body: { voiceChannelId: string } }>('/api/state/:id/voice', async req => { const s = getState(req.params.id); s.voiceChannelId = req.body.voiceChannelId; saveJson(DB_FILE, db); return s; });
app.post<{ Params: { id: string }; Body: { radioId: string } }>('/api/state/:id/radio', async req => { const s = getState(req.params.id); const r = db.radios.find(x => x.id === req.body.radioId); if (!r) throw new Error('Radio nicht gefunden'); s.queue = [r.url]; s.radioId = r.id; saveJson(DB_FILE, db); await playNext(req.params.id); return s; });
app.post<{ Params: { id: string }; Body: { file: string } }>('/api/state/:id/file', async req => { const s = getState(req.params.id); const file = sourceToPath(`file:${req.body.file}`); if (!fs.existsSync(file)) throw new Error('Datei nicht gefunden'); s.queue = [`file:${req.body.file}`]; saveJson(DB_FILE, db); await playNext(req.params.id); return s; });
app.post<{ Params: { id: string } }>('/api/state/:id/stop', async req => { await stopGuild(req.params.id); return getState(req.params.id); });
app.post<{ Params: { id: string } }>('/api/state/:id/skip', async req => { players.get(req.params.id)?.stop(true); return getState(req.params.id); });
app.post<{ Params: { id: string }; Body: { volume: number } }>('/api/state/:id/volume', async req => { const s = getState(req.params.id); s.volume = Math.max(0, Math.min(100, Number(req.body.volume))); saveJson(DB_FILE, db); return s; });

app.get('/api/spotify/status', async () => ({ configured: Boolean(SPOTIFY_CLIENT_ID && SPOTIFY_CLIENT_SECRET && SPOTIFY_REDIRECT_URI), connected: Boolean(spotify.refreshToken), displayName: spotify.displayName ?? null, product: spotify.product ?? null }));
app.get('/api/spotify/login', async (_req, reply) => { if (!SPOTIFY_CLIENT_ID || !SPOTIFY_CLIENT_SECRET || !SPOTIFY_REDIRECT_URI) return reply.code(400).send('Spotify-Konfiguration fehlt'); const state = crypto.randomBytes(18).toString('hex'); const query = new URLSearchParams({ response_type: 'code', client_id: SPOTIFY_CLIENT_ID, redirect_uri: SPOTIFY_REDIRECT_URI, scope: 'user-read-playback-state user-modify-playback-state playlist-read-private playlist-read-collaborative', state }); return reply.redirect(`https://accounts.spotify.com/authorize?${query}`); });
app.get<{ Querystring: { code?: string; state?: string } }>('/api/spotify/callback', async (req, reply) => { if (!req.query.code) return reply.code(400).send('Spotify OAuth fehlgeschlagen.'); const basic = Buffer.from(`${SPOTIFY_CLIENT_ID}:${SPOTIFY_CLIENT_SECRET}`).toString('base64'); const response = await fetch('https://accounts.spotify.com/api/token', { method: 'POST', headers: { Authorization: `Basic ${basic}`, 'Content-Type': 'application/x-www-form-urlencoded' }, body: new URLSearchParams({ grant_type: 'authorization_code', code: req.query.code, redirect_uri: SPOTIFY_REDIRECT_URI }) }); if (!response.ok) return reply.code(400).send('Spotify-Token konnte nicht erstellt werden.'); const token = await response.json() as any; spotify.accessToken = token.access_token; spotify.refreshToken = token.refresh_token; spotify.expiresAt = Date.now() + Number(token.expires_in ?? 3600) * 1000; const me = await spotifyApi('/me'); spotify.displayName = me.display_name ?? me.id; spotify.product = me.product; saveJson(SPOTIFY_FILE, spotify); return reply.redirect('/?spotify=connected'); });
app.get<{ Querystring: { q: string } }>('/api/spotify/search', async req => { const q = String(req.query.q ?? '').trim(); if (!q) return { tracks: [] }; const data = await spotifyApi(`/search?${new URLSearchParams({ q, type: 'track', limit: '20' })}`); return { tracks: data.tracks.items.map((t: any) => ({ id: t.id, uri: t.uri, name: t.name, artist: t.artists.map((a: any) => a.name).join(', '), album: t.album.name, url: t.external_urls.spotify })) }; });
app.get('/api/spotify/devices', async () => { const data = await spotifyApi('/me/player/devices'); return data.devices.map((d: any) => ({ id: d.id, name: d.name, type: d.type, active: d.is_active, volume: d.volume_percent })); });
app.post<{ Body: { uri: string; deviceId?: string } }>('/api/spotify/play', async req => { await spotifyApi('/me/player/play' + (req.body.deviceId ? `?device_id=${encodeURIComponent(req.body.deviceId)}` : ''), { method: 'PUT', body: JSON.stringify({ uris: [req.body.uri] }) }); return { ok: true }; });
app.post('/api/spotify/pause', async () => { await spotifyApi('/me/player/pause', { method: 'PUT' }); return { ok: true }; });
app.post('/api/spotify/next', async () => { await spotifyApi('/me/player/next', { method: 'POST' }); return { ok: true }; });
app.get('/api/spotify/current', async () => { try { const data = await spotifyApi('/me/player'); return data ? { playing: data.is_playing, track: data.item ? { name: data.item.name, artist: data.item.artists?.map((a: any) => a.name).join(', '), url: data.item.external_urls?.spotify } : null, device: data.device?.name ?? null } : { playing: false, track: null, device: null }; } catch { return { playing: false, track: null, device: null }; } });
app.post<{ Body: { url: string } }>('/api/spotify/playlist-info', async req => { const playlistId = spotifyPlaylistId(req.body.url); if (!playlistId) throw new Error('Keine Spotify-Playlist-URL'); const data = await spotifyApi(`/playlists/${playlistId}`); return { id: data.id, name: data.name, url: data.external_urls?.spotify, owner: data.owner?.display_name, tracks: data.tracks?.total ?? 0 }; });

await app.listen({ port: PORT, host: '0.0.0.0' });
if (process.env.DISCORD_TOKEN) client.login(process.env.DISCORD_TOKEN).catch(console.error); else console.warn('DISCORD_TOKEN fehlt. Weboberfläche läuft, Discord ist offline.');
