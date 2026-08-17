import Fastify from "fastify";
import cors from "@fastify/cors";
import multipart from "@fastify/multipart";
import statik from "@fastify/static";
import path from "node:path";
import net from "node:net";
import { createWriteStream } from "node:fs";
import { mkdir, readdir, stat, unlink, readFile } from "node:fs/promises";
import { pipeline } from "node:stream/promises";
import { randomUUID, timingSafeEqual } from "node:crypto";
import { fileURLToPath } from "node:url";
import { db, load, save, createAdmin, createUser, login, user, logout, changePassword, validateCredentialInput, publicDiscord, publicTS3, setDiscord, DATA_DIR } from "./store.js";
import { youtubeSearch, radioSearch, spotifySearch } from "./media.js";
import { Player } from "./player.js";
import { DiscordManager } from "./discord.js";
import { TS3Manager } from "./ts3.js";
import { networkInfo, storageInfo, systemInfo } from "./system.js";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const FRONTEND_DIR = path.join(ROOT, "frontend");
const HOST = process.env.HOST || "0.0.0.0";
const PORT = Number(process.env.PORT || 3000);
const SETUP_TOKEN = process.env.MUSIKBOT187_SETUP_TOKEN?.trim() || "";
const MUSIC_EXTENSIONS = new Set([".mp3", ".wav", ".flac", ".ogg", ".opus", ".m4a", ".aac", ".webm"]);
const THEMES = new Set(["dark", "light", "ocean", "purple", "emerald", "red", "amber", "slate"]);
const DATA_ROOT = path.resolve(DATA_DIR);
const DEFAULT_MUSIC_DIR = path.join(DATA_ROOT, "music");
const MAX_JSON_BODY = 1024 * 1024;
const MAX_UPLOAD = 128 * 1024 * 1024;
const MAX_MUSIC_QUOTA = 10 * 1024 * 1024 * 1024;
const CONTROL_SOCKET = process.env.MUSIKBOT187_CONTROL_SOCKET || "/run/musikbot187/control.sock";
const CORS_ORIGINS = (process.env.MUSIKBOT187_CORS_ORIGINS || "").split(",").map(x => x.trim()).filter(Boolean);
function validSetupToken(provided) { if (!SETUP_TOKEN || !provided) return false; const a = Buffer.from(SETUP_TOKEN, "utf8"); const b = Buffer.from(String(provided), "utf8"); return a.length === b.length && timingSafeEqual(a, b); }
function setupAuthorized(request) { return validSetupToken(request.headers["x-musikbot-setup-token"]); }
function recordDiagnostic(message) { db().diagnostics.unshift({ time: new Date().toISOString(), message: String(message).slice(0, 1000) }); db().diagnostics = db().diagnostics.slice(0, 100); void save(); }
function auth(request, reply) { const u = user(request.headers.authorization); if (!u) { void reply.code(401).send({ error: "Nicht angemeldet" }); return null; } return u; }
function admin(request, reply) { const u = auth(request, reply); if (!u) return null; if (u.role !== "admin") { void reply.code(403).send({ error: "Administratorrechte erforderlich" }); return null; } return u; }
function searchSource(source) { return ["all", "youtube", "radio", "spotify"].includes(source) ? source : "all"; }
function isWithin(root, target) { const resolvedRoot = path.resolve(root); const resolvedTarget = path.resolve(target); return resolvedTarget === resolvedRoot || resolvedTarget.startsWith(`${resolvedRoot}${path.sep}`); }
function safeMusicDir() { const configured = path.resolve(db().settings.filesDirectory || DEFAULT_MUSIC_DIR); if (!isWithin(DATA_ROOT, configured)) throw new Error("Musikverzeichnis muss innerhalb des Datenverzeichnisses liegen"); return configured; }
function safeMusicPath(name) { const clean = path.basename(String(name || "")).replace(/[\u0000]/g, ""); const ext = path.extname(clean).toLowerCase(); if (!clean || !MUSIC_EXTENSIONS.has(ext) || clean === "." || clean === "..") throw new Error("Nicht unterstütztes Audioformat"); const dir = safeMusicDir(); const target = path.resolve(dir, clean); if (!isWithin(dir, target)) throw new Error("Ungültiger Dateiname"); return target; }
function safeAccentColor(value) { const color = String(value || "").trim(); return /^#[0-9a-f]{6}$/i.test(color) ? color.toLowerCase() : "#0b69b3"; }
function normalizePlaylistItem(item) {
  if (!item || typeof item.url !== "string") return null;
  const source = String(item.source || "youtube").toLowerCase();
  const rawUrl = item.url.trim().slice(0, 4096);
  if (!rawUrl) return null;
  const normalized = { id: String(item.id || randomUUID()).slice(0, 80), title: String(item.title || rawUrl).trim().slice(0, 300), url: rawUrl, source };
  if (source === "file") {
    const dir = safeMusicDir();
    const candidate = path.isAbsolute(rawUrl) ? path.relative(dir, path.resolve(rawUrl)) : rawUrl;
    if (!candidate || candidate.startsWith("..") || path.isAbsolute(candidate)) return null;
    normalized.url = path.basename(candidate);
  }
  return normalized;
}
async function directorySize(dir) {
  let total = 0;
  for (const item of await readdir(dir, { withFileTypes: true })) if (item.isFile()) { try { total += (await stat(path.join(dir, item.name))).size; } catch {} if (total >= MAX_MUSIC_QUOTA) break; }
  return total;
}
function validAudioHeader(buffer, ext) {
  if (ext === ".wav") return buffer.length >= 12 && buffer.toString("ascii", 0, 4) === "RIFF" && buffer.toString("ascii", 8, 12) === "WAVE";
  if (ext === ".flac") return buffer.toString("ascii", 0, 4) === "fLaC";
  if (ext === ".ogg" || ext === ".opus") return buffer.toString("ascii", 0, 4) === "OggS";
  if (ext === ".webm") return buffer.length >= 4 && buffer.readUInt32BE(0) === 0x1a45dfa3;
  if (ext === ".m4a") return buffer.length >= 12 && buffer.toString("ascii", 4, 8) === "ftyp";
  if (ext === ".aac") return buffer.length >= 2 && buffer[0] === 0xff && (buffer[1] & 0xf6) === 0xf0;
  if (ext === ".mp3") return buffer.toString("ascii", 0, 3) === "ID3" || (buffer.length >= 2 && buffer[0] === 0xff && (buffer[1] & 0xe0) === 0xe0);
  return false;
}
async function controlAction(action) {
  return await new Promise((resolve, reject) => {
    const socket = net.createConnection(CONTROL_SOCKET);
    let data = "";
    const timer = setTimeout(() => { socket.destroy(); reject(new Error("Control-Dienst antwortet nicht")); }, 8000);
    socket.on("connect", () => socket.end(JSON.stringify({ action }) + "\n"));
    socket.on("data", chunk => { data += String(chunk); if (data.length > 8192) { socket.destroy(); reject(new Error("Ungültige Control-Antwort")); } });
    socket.on("error", error => { clearTimeout(timer); reject(error); });
    socket.on("close", () => { clearTimeout(timer); try { const result = JSON.parse(data.trim()); result.ok ? resolve(result) : reject(new Error(result.error || "Control-Aktion fehlgeschlagen")); } catch (error) { reject(error); } });
  });
}

await load();
try { db().settings.filesDirectory = safeMusicDir(); } catch { db().settings.filesDirectory = DEFAULT_MUSIC_DIR; await save(); }
for (const playlist of db().playlists) playlist.items = (Array.isArray(playlist.items) ? playlist.items : []).map(normalizePlaylistItem).filter(Boolean).slice(0, 500);
await mkdir(safeMusicDir(), { recursive: true });
const app = Fastify({ logger: true, bodyLimit: MAX_JSON_BODY });
await app.register(multipart, { limits: { fileSize: MAX_UPLOAD, files: 1, parts: 4, fields: 3 } });
const player = new Player(db().settings);
const discord = new DiscordManager(player);
const ts3 = new TS3Manager((message) => recordDiagnostic(message));
player.on("audio", data => { const s = db().settings; if (s.outputType === "discord") discord.writeAudio(data, s.outputId); if (s.outputType === "ts3") ts3.writeAudio(data, s.outputId); });
player.on("diagnostic", recordDiagnostic);
await app.register(cors, { origin: CORS_ORIGINS.length ? CORS_ORIGINS : false, credentials: false });
await app.register(statik, { root: FRONTEND_DIR, prefix: "/" });
app.addHook("onRequest", async (request, reply) => {
  const length = Number(request.headers["content-length"] || 0);
  const isMultipart = String(request.headers["content-type"] || "").startsWith("multipart/form-data");
  if (length > MAX_JSON_BODY && !isMultipart) return reply.code(413).send({ error: "Anfrage ist zu groß" });
  const pathName = request.url.split("?")[0];
  if (pathName === "/api/health") reply.header("Cache-Control", "no-store");
});
app.addHook("onSend", async (request, reply, payload) => {
  reply.header("X-Content-Type-Options", "nosniff"); reply.header("X-Frame-Options", "DENY"); reply.header("Referrer-Policy", "no-referrer"); reply.header("Permissions-Policy", "geolocation=(), microphone=(), camera=()"); reply.header("Cache-Control", "no-store");
  if (!CORS_ORIGINS.length) reply.removeHeader?.("access-control-allow-origin");
  if (request.url.startsWith("/api/health")) {
    try { return JSON.stringify({ ok: true, name: "MusikBot187" }); } catch {}
  }
  return payload;
});
app.get("/api/health", async () => ({ ok: true, name: "MusikBot187" }));
app.get("/api/setup", async () => ({ initialized: db().users.length > 0, requiresToken: db().users.length === 0 && !!SETUP_TOKEN }));
app.get("/api/setup-link", async request => { const env = process.env.MUSIKBOT187_PUBLIC_URL?.trim(); if (env) return { url: env.replace(/\/$/, "") + "/" }; const host = String(request.hostname || "localhost"); const proto = String(request.protocol || "http"); const port = request.headers.host?.includes(":") ? `:${PORT}` : ""; return { url: `${proto}://${host}${port}/` }; });
app.post("/api/setup", async (request, reply) => { if (db().users.length) return reply.code(409).send({ error: "Bereits eingerichtet" }); if (!setupAuthorized(request)) return reply.code(403).send({ error: "Ungültiger Einrichtungslink" }); let credentials; try { credentials = validateCredentialInput(request.body?.name, request.body?.password); } catch (e) { return reply.code(400).send({ error: e.message }); } createAdmin(credentials.name, credentials.password); await save(); return login(credentials.name, credentials.password, request.ip); });
app.post("/api/login", async (request, reply) => { const session = login(String(request.body?.name || "").trim(), String(request.body?.password || ""), request.ip); return session || reply.code(401).send({ error: "Ungültige Anmeldung" }); });
app.post("/api/logout", async (request, reply) => { if (!logout(request.headers.authorization)) return reply.code(401).send({ error: "Nicht angemeldet" }); return { ok: true }; });
app.put("/api/password", async (request, reply) => { const u = auth(request, reply); if (!u) return; try { const current = String(request.body?.currentPassword || ""); const next = String(request.body?.newPassword || ""); if (next.length < 5 || next.length > 256) throw new Error("Neues Passwort muss 5–256 Zeichen lang sein"); changePassword(u.id, current, next); await save(); return { ok: true }; } catch (error) { return reply.code(400).send({ error: error instanceof Error ? error.message : String(error) }); } });
app.get("/api/state", async (request, reply) => { if (!auth(request, reply)) return; return { ...player.snapshot(), settings: db().settings, dashboard: db().dashboard, discord: publicDiscord(), ts3: publicTS3() }; });
app.get("/api/search", async (request, reply) => { if (!auth(request, reply)) return; const q = String(request.query?.q || "").trim().slice(0, 200); const source = searchSource(String(request.query?.source || "all")); if (!q) return { youtube: [], radio: [], spotify: [] }; const out = { youtube: [], radio: [], spotify: [] }; await Promise.allSettled([source === "all" || source === "youtube" ? youtubeSearch(q).then(v => { out.youtube = v; }) : Promise.resolve(), source === "all" || source === "radio" ? radioSearch(q).then(v => { out.radio = v; }) : Promise.resolve(), source === "all" || source === "spotify" ? spotifySearch(q, db().integration).then(v => { out.spotify = v; }) : Promise.resolve()]); return out; });
app.post("/api/play", async (request, reply) => { if (!auth(request, reply)) return; if (!Array.isArray(request.body?.items) || request.body.items.length > 100) return reply.code(413).send({ error: "Zu viele Queue-Einträge" }); await player.enqueue(request.body.items); return player.snapshot(); });
app.post("/api/play/:action", async (request, reply) => { if (!auth(request, reply)) return; const action = String(request.params.action || ""); const body = request.body || {}; if (action === "pause") player.pause(); else if (action === "resume") player.resume(); else if (action === "stop") player.stop(); else if (action === "skip") player.skip(); else if (action === "clear") player.clear(); else if (action === "volume") { const value = Number(body.value); if (!Number.isFinite(value)) return reply.code(400).send({ error: "Ungültige Lautstärke" }); player.setVolume(value); } else if (action === "mode") { if (!["queue", "repeat", "shuffle"].includes(body.mode)) return reply.code(400).send({ error: "Ungültiger Modus" }); player.setMode(body.mode); } else return reply.code(400).send({ error: "Ungültige Player-Aktion" }); db().settings.volume = player.volume; db().settings.mode = player.mode; await save(); return player.snapshot(); });
app.delete("/api/queue/:index", async (request, reply) => { if (!auth(request, reply)) return; const index = Number(request.params.index); if (!Number.isInteger(index) || index < 0 || index >= player.queue.length) return reply.code(400).send({ error: "Ungültiger Queue-Index" }); await player.remove(index); return player.snapshot(); });
app.get("/api/playlists", async (request, reply) => { if (!auth(request, reply)) return; return db().playlists; });
app.post("/api/playlists", async (request, reply) => { if (!auth(request, reply)) return; const name = String(request.body?.name || "Neue Playlist").trim().slice(0, 128) || "Neue Playlist"; if (db().playlists.length >= 500) return reply.code(413).send({ error: "Zu viele Playlists" }); const p = { id: randomUUID(), name, items: [] }; db().playlists.push(p); await save(); return p; });
app.get("/api/playlists/:id", async (request, reply) => { if (!auth(request, reply)) return; const p = db().playlists.find(x => x.id === request.params.id); return p || reply.code(404).send({ error: "Playlist nicht gefunden" }); });
app.post("/api/playlists/:id/items", async (request, reply) => { if (!auth(request, reply)) return; const p = db().playlists.find(x => x.id === request.params.id); if (!p) return reply.code(404).send({ error: "Playlist nicht gefunden" }); if (!Array.isArray(request.body?.items) || request.body.items.length > 100) return reply.code(413).send({ error: "Zu viele Playlist-Einträge" }); const items = request.body.items.map(normalizePlaylistItem).filter(Boolean); if (p.items.length + items.length > 500) return reply.code(413).send({ error: "Playlist ist zu groß" }); p.items.push(...items); await save(); return p; });
app.post("/api/playlists/:id/play", async (request, reply) => { if (!auth(request, reply)) return; const p = db().playlists.find(x => x.id === request.params.id); if (!p) return reply.code(404).send({ error: "Playlist nicht gefunden" }); await player.enqueue(p.items.slice(0, 100)); return player.snapshot(); });
app.delete("/api/playlists/:id/items/:itemId", async (request, reply) => { if (!auth(request, reply)) return; const p = db().playlists.find(x => x.id === request.params.id); if (!p) return reply.code(404).send({ error: "Playlist nicht gefunden" }); p.items = p.items.filter(x => x.id !== request.params.itemId); await save(); return p; });
app.get("/api/network", async (request, reply) => { if (!auth(request, reply)) return; return networkInfo(db().settings.networkInterface); });
app.get("/api/system", async (request, reply) => { if (!auth(request, reply)) return; return systemInfo(); });
app.get("/api/storage", async (request, reply) => { if (!auth(request, reply)) return; return storageInfo(safeMusicDir()); });
app.get("/api/files", async (request, reply) => { if (!auth(request, reply)) return; const dir = safeMusicDir(); await mkdir(dir, { recursive: true }); return readdir(dir, { withFileTypes: true }).then(items => items.filter(x => x.isFile()).map(x => ({ name: x.name, directory: false }))); });
app.post("/api/music/upload", async (request, reply) => {
  if (!admin(request, reply)) return;
  let target = null;
  try {
    const dir = safeMusicDir();
    await mkdir(dir, { recursive: true });
    if ((await directorySize(dir)) >= MAX_MUSIC_QUOTA) return reply.code(413).send({ error: "Musikverzeichnis ist voll" });
    const data = await request.file();
    if (!data) return reply.code(400).send({ error: "Keine Datei hochgeladen" });
    target = safeMusicPath(data.filename);
    const output = createWriteStream(target, { flags: "wx", mode: 0o640 });
    try { await pipeline(data.file, output); } catch (error) { try { await unlink(target); } catch {}; throw error; }
    if (data.file.truncated) { try { await unlink(target); } catch {}; return reply.code(413).send({ error: "Datei ist zu groß" }); }
    const info = await stat(target);
    if (!info.size || info.size > MAX_UPLOAD || (await directorySize(dir)) > MAX_MUSIC_QUOTA) { await unlink(target); return reply.code(413).send({ error: "Datei überschreitet die Speichergrenze" }); }
    const signature = await readFile(target, { encoding: null }).then(buffer => buffer.subarray(0, 16));
    if (!validAudioHeader(signature, path.extname(target).toLowerCase())) { await unlink(target); return reply.code(415).send({ error: "Dateiinhalt passt nicht zur Audio-Endung" }); }
    return { ok: true, file: { name: path.basename(target), size: info.size } };
  } catch (error) {
    if (target) { try { await unlink(target); } catch {} }
    return reply.code(error?.code === "EEXIST" ? 409 : error?.code === "FST_REQ_FILE_TOO_LARGE" ? 413 : 400).send({ error: error instanceof Error ? error.message : String(error) });
  }
});
app.delete("/api/music/:name", async (request, reply) => { if (!admin(request, reply)) return; try { await unlink(safeMusicPath(request.params.name)); return { ok: true }; } catch (error) { return reply.code(error?.code === "ENOENT" ? 404 : 400).send({ error: error instanceof Error ? error.message : String(error) }); } });
app.put("/api/settings", async (request, reply) => { if (!admin(request, reply)) return; const b = request.body || {}; if (typeof b.volume === "number") player.setVolume(b.volume); if (typeof b.mode === "string") { if (!["queue", "repeat", "shuffle"].includes(b.mode)) return reply.code(400).send({ error: "Ungültiger Modus" }); player.setMode(b.mode); } if (typeof b.outputType === "string") { if (!["discord", "ts3", "none"].includes(b.outputType)) return reply.code(400).send({ error: "Ungültiges Ausgabeziel" }); db().settings.outputType = b.outputType; } if (typeof b.outputId === "string") db().settings.outputId = b.outputId.slice(0, 100); if (typeof b.networkInterface === "string") db().settings.networkInterface = b.networkInterface.slice(0, 128); if (typeof b.filesDirectory === "string" && b.filesDirectory.trim()) { const candidate = path.resolve(b.filesDirectory.trim()); if (!isWithin(DATA_ROOT, candidate)) return reply.code(400).send({ error: "Musikverzeichnis muss innerhalb des Datenverzeichnisses liegen" }); db().settings.filesDirectory = candidate; await mkdir(candidate, { recursive: true }); } if (typeof b.theme === "string") { if (!THEMES.has(b.theme)) return reply.code(400).send({ error: "Ungültiges Theme" }); db().settings.theme = b.theme; } if (typeof b.accentColor === "string") db().settings.accentColor = safeAccentColor(b.accentColor); db().settings.volume = player.volume; db().settings.mode = player.mode; await save(); return db().settings; });
app.put("/api/integration/spotify", async (request, reply) => { if (!admin(request, reply)) return; db().integration.spotifyClientId = String(request.body?.clientId || "").slice(0, 200); db().integration.spotifyClientSecret = String(request.body?.clientSecret || "").slice(0, 256); await save(); return { ok: true }; });
app.get("/api/users", async (request, reply) => { if (!admin(request, reply)) return; return db().users.map(({ id, name, role }) => ({ id, name, role })); });
app.post("/api/users", async (request, reply) => { if (!admin(request, reply)) return; let credentials; try { credentials = validateCredentialInput(request.body?.name, request.body?.password); } catch (e) { return reply.code(400).send({ error: e.message }); } const role = request.body?.role === "user" ? "user" : "admin"; if (db().users.some(x => x.name.toLowerCase() === credentials.name.toLowerCase())) return reply.code(409).send({ error: "Benutzername bereits vorhanden" }); createUser(credentials.name, credentials.password, role); await save(); return { ok: true }; });
app.get("/api/diagnostics", async (request, reply) => { if (!admin(request, reply)) return; return db().diagnostics; });
app.get("/api/discord", async (request, reply) => { if (!auth(request, reply)) return; const runtime = new Map(discord.status().map(x => [x.id, x])); return publicDiscord().map(x => ({ ...x, connected: runtime.has(x.id), voiceConnected: runtime.get(x.id)?.voiceConnected === true })); });
app.post("/api/discord", async (request, reply) => { if (!admin(request, reply)) return; const b = request.body || {}; const old = db().discord.find(x => x.id === b.id); const x = { id: String(b.id || randomUUID()).slice(0, 80), name: String(b.name || old?.name || "Discord").slice(0, 128), enabled: b.enabled !== false, token: b.token ? String(b.token).slice(0, 512) : String(old?.token || ""), clientId: String(b.clientId || old?.clientId || "").slice(0, 32), guildId: String(b.guildId || old?.guildId || "").slice(0, 32), channelId: String(b.channelId || old?.channelId || "").slice(0, 32), prefix: String(b.prefix ?? old?.prefix ?? "").slice(0, 16), messageContentIntent: b.messageContentIntent === true }; if (x.clientId && !/^\d{17,20}$/.test(x.clientId)) return reply.code(400).send({ error: "Discord Client-ID muss aus 17–20 Ziffern bestehen" }); setDiscord(x); await save(); return publicDiscord(); });
app.delete("/api/discord/:id", async (request, reply) => { if (!admin(request, reply)) return; await discord.disconnect(request.params.id); db().discord = db().discord.filter(x => x.id !== request.params.id); await save(); return publicDiscord(); });
app.post("/api/discord/:id/connect", async (request, reply) => { if (!admin(request, reply)) return; const x = db().discord.find(y => y.id === request.params.id); if (!x) return reply.code(404).send({ error: "Instanz nicht gefunden" }); try { await discord.connect(x); return discord.status(); } catch (e) { const m = e instanceof Error ? e.message : String(e); recordDiagnostic(`Discord ${x.name}: ${m}`); return reply.code(400).send({ error: m }); } });
app.post("/api/discord/:id/disconnect", async (request, reply) => { if (!admin(request, reply)) return; await discord.disconnect(request.params.id); return discord.status(); });
app.post("/api/discord/:id/join", async (request, reply) => { if (!admin(request, reply)) return; try { await discord.join(request.params.id); db().settings.outputType = "discord"; db().settings.outputId = request.params.id; await save(); return discord.status(); } catch (e) { const m = e instanceof Error ? e.message : String(e); recordDiagnostic(`Discord Voice ${request.params.id}: ${m}`); return reply.code(400).send({ error: m }); } });
app.get("/api/discord/:id/guilds", async (request, reply) => { if (!admin(request, reply)) return; return discord.guilds(request.params.id); });
app.get("/api/discord/:id/guilds/:guildId/channels", async (request, reply) => { if (!admin(request, reply)) return; return discord.channels(request.params.id, request.params.guildId); });
app.get("/api/ts3", async (request, reply) => { if (!auth(request, reply)) return; const connected = new Set(ts3.status()); return publicTS3().map(x => ({ ...x, connected: connected.has(x.id) })); });
app.put("/api/ts3", async (request, reply) => { if (!admin(request, reply)) return; const incoming = Array.isArray(request.body?.instances) ? request.body.instances.slice(0, 16) : []; db().ts3 = incoming.map(x => { const old = db().ts3.find(y => y.id === x.id); return { id: String(x.id || randomUUID()).slice(0, 80), name: String(x.name || "TS3").slice(0, 128), enabled: x.enabled !== false, host: String(x.host || "").trim().slice(0, 255), port: Number(x.port || 9987), nickname: String(x.nickname || "MusikBot187").trim().slice(0, 64), channel: String(x.channel || "").trim().slice(0, 255), password: x.password ? String(x.password).slice(0, 256) : String(old?.password || "") }; }); await save(); return publicTS3(); });
app.post("/api/ts3/:id/connect", async (request, reply) => { if (!admin(request, reply)) return; const x = db().ts3.find(y => y.id === request.params.id); if (!x) return reply.code(404).send({ error: "Instanz nicht gefunden" }); try { await ts3.connect(x); db().settings.outputType = "ts3"; db().settings.outputId = x.id; await save(); return publicTS3(); } catch (e) { const m = e instanceof Error ? e.message : String(e); recordDiagnostic(`TS3 ${x.name}: ${m}`); return reply.code(400).send({ error: m }); } });
app.post("/api/ts3/:id/disconnect", async (request, reply) => { if (!admin(request, reply)) return; await ts3.disconnect(request.params.id); return publicTS3(); });
app.post("/api/control", async (request, reply) => { if (!admin(request, reply)) return; const action = String(request.body?.action || ""); if (!["start-bot", "restart-bot", "stop-bot", "restart-system", "shutdown-system"].includes(action)) return reply.code(400).send({ error: "Ungültige Control-Aktion" }); try { await controlAction(action); return { ok: true }; } catch (error) { return reply.code(503).send({ error: error instanceof Error ? error.message : String(error) }); } });
app.get("/", async (_request, reply) => reply.sendFile("index.html"));
app.setErrorHandler((error, _request, reply) => { recordDiagnostic(`HTTP-Fehler: ${error.message}`); app.log.error(error); const status = Number(error.statusCode) >= 400 && Number(error.statusCode) < 500 ? Number(error.statusCode) : 500; void reply.code(status).send({ error: status === 500 ? "Interner Fehler" : error.message }); });
if (db().settings.outputType === "discord" && db().settings.outputId) { const x = db().discord.find(y => y.id === db().settings.outputId); if (x?.enabled && x.token) discord.connect(x).catch(e => recordDiagnostic(`Discord ${x.name}: ${e instanceof Error ? e.message : String(e)}`)); }
if (db().settings.outputType === "ts3" && db().settings.outputId) { const x = db().ts3.find(y => y.id === db().settings.outputId); if (x?.enabled && x.host) ts3.connect(x).catch(e => recordDiagnostic(`TS3 ${x.name}: ${e instanceof Error ? e.message : String(e)}`)); }
const shutdown = async () => { try { await player.shutdown(); } catch {} for (const x of db().discord) await discord.disconnect(x.id).catch(() => {}); for (const x of db().ts3) await ts3.disconnect(x.id).catch(() => {}); try { await app.close(); } catch {} };
process.once("SIGTERM", () => { void shutdown().finally(() => process.exit(0)); });
process.once("SIGINT", () => { void shutdown().finally(() => process.exit(0)); });
await app.listen({ host: HOST, port: PORT });
console.log(`MusikBot187 läuft auf ${HOST}:${PORT}`);
