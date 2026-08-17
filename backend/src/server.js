import Fastify from "fastify";
import cors from "@fastify/cors";
import statik from "@fastify/static";
import path from "node:path";
import { mkdir } from "node:fs/promises";
import { randomUUID, scryptSync } from "node:crypto";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { fileURLToPath } from "node:url";
import { db, load, save, createAdmin, login, user, publicDiscord, publicTS3, setDiscord } from "./store.js";
import { youtubeSearch, radioSearch, spotifySearch } from "./media.js";
import { Player } from "./player.js";
import { DiscordManager } from "./discord.js";
import { TS3Manager } from "./ts3.js";
import { networkInfo, storageInfo, systemInfo } from "./system.js";

const exec = promisify(execFile);
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const FRONTEND_DIR = path.join(ROOT, "frontend");
const HOST = process.env.HOST || "0.0.0.0";
const PORT = Number(process.env.PORT || 3000);

await load();
await mkdir(db().settings.filesDirectory, { recursive: true });
const app = Fastify({ logger: true });
const player = new Player(db().settings);
const discord = new DiscordManager(player);
const ts3 = new TS3Manager();

function recordDiagnostic(message) { db().diagnostics.unshift({ time: new Date().toISOString(), message: String(message) }); db().diagnostics = db().diagnostics.slice(0, 100); void save(); }
player.on("audio", (data) => { const s = db().settings; if (s.outputType === "discord") discord.writeAudio(data, s.outputId); if (s.outputType === "ts3") ts3.writeAudio(data, s.outputId); });
player.on("diagnostic", recordDiagnostic);
await app.register(cors, { origin: true });
await app.register(statik, { root: FRONTEND_DIR, prefix: "/" });
const currentUser = (request) => user(request.headers.authorization);
function auth(request, reply) { const u = currentUser(request); if (!u) { void reply.code(401).send({ error: "Nicht angemeldet" }); return null; } return u; }
function admin(request, reply) { const u = auth(request, reply); if (!u) return null; if (u.role !== "admin") { void reply.code(403).send({ error: "Administratorrechte erforderlich" }); return null; } return u; }
function searchSource(source) { return ["all", "youtube", "radio", "spotify"].includes(source) ? source : "all"; }

app.get("/api/health", async () => ({ ok: true, name: "MusikBot187", version: "2.0.1" }));
app.get("/api/setup", async () => ({ initialized: db().users.length > 0 }));
app.get("/api/setup-link", async (request) => { const env = process.env.MUSIKBOT187_PUBLIC_URL?.trim(); if (env) return { url: env.replace(/\/$/, "") + "/" }; const host = String(request.headers["x-forwarded-host"] || request.headers.host || `localhost:${PORT}`); const proto = String(request.headers["x-forwarded-proto"] || "http").split(",")[0]; return { url: `${proto}://${host}/` }; });
app.post("/api/setup", async (request, reply) => { if (db().users.length) return reply.code(409).send({ error: "Bereits eingerichtet" }); const name = String(request.body?.name || "").trim(); const password = String(request.body?.password || ""); if (!name || password.length < 5) return reply.code(400).send({ error: "Name und Passwort mit mindestens 5 Zeichen erforderlich" }); createAdmin(name, password); await save(); return login(name, password); });
app.post("/api/login", async (request, reply) => { const session = login(String(request.body?.name || "").trim(), String(request.body?.password || "")); return session || reply.code(401).send({ error: "Ungültige Anmeldung" }); });
app.get("/api/state", async (request, reply) => { if (!auth(request, reply)) return; return { ...player.snapshot(), settings: db().settings, dashboard: db().dashboard, discord: publicDiscord(), ts3: publicTS3() }; });
app.get("/api/search", async (request, reply) => { if (!auth(request, reply)) return; const q = String(request.query?.q || "").trim(); const source = searchSource(String(request.query?.source || "all")); if (!q) return { youtube: [], radio: [], spotify: [] }; const out = { youtube: [], radio: [], spotify: [] }; await Promise.allSettled([(source === "all" || source === "youtube") ? youtubeSearch(q).then(v => { out.youtube = v; }) : Promise.resolve(), (source === "all" || source === "radio") ? radioSearch(q).then(v => { out.radio = v; }) : Promise.resolve(), (source === "all" || source === "spotify") ? spotifySearch(q, db().integration).then(v => { out.spotify = v; }) : Promise.resolve()]); return out; });
app.post("/api/play", async (request, reply) => { if (!auth(request, reply)) return; await player.enqueue(Array.isArray(request.body?.items) ? request.body.items : []); return player.snapshot(); });
app.post("/api/play/:action", async (request, reply) => { if (!auth(request, reply)) return; const action = String(request.params.action || ""); const body = request.body || {}; if (action === "pause") player.pause(); else if (action === "resume") player.resume(); else if (action === "stop") player.stop(); else if (action === "skip") player.skip(); else if (action === "clear") player.clear(); else if (action === "volume") { const value = Number(body.value); if (!Number.isFinite(value)) return reply.code(400).send({ error: "Ungültige Lautstärke" }); player.setVolume(value); } else if (action === "mode") { if (!["queue", "repeat", "shuffle"].includes(body.mode)) return reply.code(400).send({ error: "Ungültiger Modus" }); player.setMode(body.mode); } else return reply.code(400).send({ error: "Ungültige Player-Aktion" }); db().settings.volume = player.volume; db().settings.mode = player.mode; await save(); return player.snapshot(); });
app.delete("/api/queue/:index", async (request, reply) => { if (!auth(request, reply)) return; const index = Number(request.params.index); if (!Number.isInteger(index) || index < 0 || index >= player.queue.length) return reply.code(400).send({ error: "Ungültiger Queue-Index" }); await player.remove(index); return player.snapshot(); });
app.get("/api/playlists", async (request, reply) => { if (!auth(request, reply)) return; return db().playlists; });
app.post("/api/playlists", async (request, reply) => { if (!auth(request, reply)) return; const p = { id: randomUUID(), name: String(request.body?.name || "Neue Playlist").trim() || "Neue Playlist", items: [] }; db().playlists.push(p); await save(); return p; });
app.get("/api/playlists/:id", async (request, reply) => { if (!auth(request, reply)) return; const p = db().playlists.find(x => x.id === request.params.id); return p || reply.code(404).send({ error: "Playlist nicht gefunden" }); });
app.post("/api/playlists/:id/items", async (request, reply) => { if (!auth(request, reply)) return; const p = db().playlists.find(x => x.id === request.params.id); if (!p) return reply.code(404).send({ error: "Playlist nicht gefunden" }); if (Array.isArray(request.body?.items)) p.items.push(...request.body.items.filter(x => x && typeof x.url === "string" && x.url.trim())); await save(); return p; });
app.post("/api/playlists/:id/play", async (request, reply) => { if (!auth(request, reply)) return; const p = db().playlists.find(x => x.id === request.params.id); if (!p) return reply.code(404).send({ error: "Playlist nicht gefunden" }); await player.enqueue(p.items); return player.snapshot(); });
app.delete("/api/playlists/:id/items/:itemId", async (request, reply) => { if (!auth(request, reply)) return; const p = db().playlists.find(x => x.id === request.params.id); if (!p) return reply.code(404).send({ error: "Playlist nicht gefunden" }); p.items = p.items.filter(x => x.id !== request.params.itemId); await save(); return p; });
app.get("/api/network", async (request, reply) => { if (!auth(request, reply)) return; return networkInfo(db().settings.networkInterface); });
app.get("/api/system", async (request, reply) => { if (!auth(request, reply)) return; return systemInfo(); });
app.get("/api/storage", async (request, reply) => { if (!auth(request, reply)) return; return storageInfo(db().settings.filesDirectory); });
app.get("/api/files", async (request, reply) => { if (!auth(request, reply)) return; const { readdir } = await import("node:fs/promises"); const dir = path.resolve(db().settings.filesDirectory); await mkdir(dir, { recursive: true }); return readdir(dir, { withFileTypes: true }).then(items => items.map(x => ({ name: x.name, directory: x.isDirectory(), path: path.join(dir, x.name) }))); });
app.put("/api/settings", async (request, reply) => { if (!admin(request, reply)) return; const b = request.body || {}; if (typeof b.volume === "number") player.setVolume(b.volume); if (typeof b.mode === "string") { if (!["queue", "repeat", "shuffle"].includes(b.mode)) return reply.code(400).send({ error: "Ungültiger Modus" }); player.setMode(b.mode); } if (typeof b.outputType === "string") { if (!["discord", "ts3", "none"].includes(b.outputType)) return reply.code(400).send({ error: "Ungültiges Ausgabeziel" }); db().settings.outputType = b.outputType; } if (typeof b.outputId === "string") db().settings.outputId = b.outputId; if (typeof b.networkInterface === "string") db().settings.networkInterface = b.networkInterface; if (typeof b.filesDirectory === "string" && b.filesDirectory.trim()) { db().settings.filesDirectory = path.resolve(b.filesDirectory.trim()); await mkdir(db().settings.filesDirectory, { recursive: true }); } if (typeof b.theme === "string") db().settings.theme = b.theme; db().settings.volume = player.volume; db().settings.mode = player.mode; await save(); return db().settings; });
app.put("/api/integration/spotify", async (request, reply) => { if (!admin(request, reply)) return; db().integration.spotifyClientId = String(request.body?.clientId || ""); db().integration.spotifyClientSecret = String(request.body?.clientSecret || ""); await save(); return { ok: true }; });
app.get("/api/users", async (request, reply) => { if (!admin(request, reply)) return; return db().users.map(({ id, name, role }) => ({ id, name, role })); });
app.post("/api/users", async (request, reply) => { if (!admin(request, reply)) return; const name = String(request.body?.name || "").trim(); const password = String(request.body?.password || ""); if (!name || password.length < 5) return reply.code(400).send({ error: "Name und Passwort erforderlich; Passwort mindestens 5 Zeichen" }); const role = request.body?.role === "user" ? "user" : "admin"; if (db().users.some(x => x.name === name)) return reply.code(409).send({ error: "Benutzername bereits vorhanden" }); db().users.push({ id: randomUUID(), name, hash: scryptSync(password, "musikbot187", 32).toString("hex"), role }); await save(); return { ok: true }; });
app.get("/api/diagnostics", async (request, reply) => { if (!admin(request, reply)) return; return db().diagnostics; });
app.get("/api/discord", async (request, reply) => { if (!auth(request, reply)) return; return publicDiscord(); });
app.post("/api/discord", async (request, reply) => { if (!admin(request, reply)) return; const b = request.body || {}; const old = db().discord.find(x => x.id === b.id); const x = { id: String(b.id || randomUUID()), name: String(b.name || old?.name || "Discord"), enabled: b.enabled !== false, token: b.token ? String(b.token) : String(old?.token || ""), clientId: String(b.clientId || old?.clientId || ""), guildId: String(b.guildId || old?.guildId || ""), channelId: String(b.channelId || old?.channelId || ""), prefix: String(b.prefix || old?.prefix || "!") }; if (x.clientId && !/^\d{17,20}$/.test(x.clientId)) return reply.code(400).send({ error: "Discord Client-ID muss aus 17–20 Ziffern bestehen" }); setDiscord(x); await save(); return publicDiscord(); });
app.delete("/api/discord/:id", async (request, reply) => { if (!admin(request, reply)) return; await discord.disconnect(request.params.id); db().discord = db().discord.filter(x => x.id !== request.params.id); await save(); return publicDiscord(); });
app.post("/api/discord/:id/connect", async (request, reply) => { if (!admin(request, reply)) return; const x = db().discord.find(y => y.id === request.params.id); if (!x) return reply.code(404).send({ error: "Instanz nicht gefunden" }); try { await discord.connect(x); return discord.status(); } catch (e) { const m = e instanceof Error ? e.message : String(e); recordDiagnostic(`Discord ${x.name}: ${m}`); return reply.code(400).send({ error: m }); } });
app.post("/api/discord/:id/disconnect", async (request, reply) => { if (!admin(request, reply)) return; await discord.disconnect(request.params.id); return discord.status(); });
app.post("/api/discord/:id/join", async (request, reply) => { if (!admin(request, reply)) return; try { await discord.join(request.params.id); db().settings.outputType = "discord"; db().settings.outputId = request.params.id; await save(); return discord.status(); } catch (e) { const m = e instanceof Error ? e.message : String(e); recordDiagnostic(`Discord Voice ${request.params.id}: ${m}`); return reply.code(400).send({ error: m }); } });
app.get("/api/discord/:id/guilds", async (request, reply) => { if (!admin(request, reply)) return; return discord.guilds(request.params.id); });
app.get("/api/discord/:id/guilds/:guildId/channels", async (request, reply) => { if (!admin(request, reply)) return; return discord.channels(request.params.id, request.params.guildId); });
app.get("/api/ts3", async (request, reply) => { if (!auth(request, reply)) return; return publicTS3(); });
app.put("/api/ts3", async (request, reply) => { if (!admin(request, reply)) return; db().ts3 = Array.isArray(request.body?.instances) ? request.body.instances : []; await save(); return publicTS3(); });
app.post("/api/ts3/:id/connect", async (request, reply) => { if (!admin(request, reply)) return; const x = db().ts3.find(y => y.id === request.params.id); if (!x) return reply.code(404).send({ error: "Instanz nicht gefunden" }); try { await ts3.connect(x); db().settings.outputType = "ts3"; db().settings.outputId = x.id; await save(); return publicTS3(); } catch (e) { const m = e instanceof Error ? e.message : String(e); recordDiagnostic(`TS3 ${x.name}: ${m}`); return reply.code(400).send({ error: m }); } });
app.post("/api/ts3/:id/disconnect", async (request, reply) => { if (!admin(request, reply)) return; await ts3.disconnect(request.params.id); return publicTS3(); });
app.post("/api/control", async (request, reply) => { if (!admin(request, reply)) return; const action = String(request.body?.action || ""); if (!["restart-bot", "stop-bot", "restart-system", "shutdown-system"].includes(action)) return reply.code(400).send({ error: "Ungültige Aktion" }); await exec("/usr/bin/sudo", ["/usr/local/sbin/musikbot187-control", action]); return { ok: true }; });
app.get("/", async (_request, reply) => reply.sendFile("index.html"));
app.setErrorHandler((error, _request, reply) => { recordDiagnostic(`HTTP-Fehler: ${error.message}`); app.log.error(error); void reply.code(500).send({ error: "Interner Fehler", detail: error.message }); });
for (const x of db().discord) if (x.enabled && x.token) discord.connect(x).catch(e => recordDiagnostic(`Discord ${x.name}: ${e instanceof Error ? e.message : String(e)}`));
for (const x of db().ts3) if (x.enabled && x.host) ts3.connect(x).catch(e => recordDiagnostic(`TS3 ${x.name}: ${e instanceof Error ? e.message : String(e)}`));
await app.listen({ host: HOST, port: PORT });
console.log(`MusikBot187 läuft auf ${HOST}:${PORT}`);
