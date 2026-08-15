import Fastify from 'fastify';
import cors from '@fastify/cors';
import fastifyStatic from '@fastify/static';
import { randomBytes, scryptSync } from 'node:crypto';
import path from 'node:path';
import { DATA_DIR, readConfig, writeConfig, passwordHash } from './config.js';
import { searchYouTube, searchRadio, searchSpotify } from './media.js';
import { DiscordInstance } from './discord.js';
import { Ts3Instance } from './ts3.js';

const PORT = Number(process.env.PORT ?? 3000);
const HOST = process.env.HOST ?? '0.0.0.0';
const FRONTEND_DIR = process.env.FRONTEND_DIR ?? path.resolve(process.cwd(), '../frontend');
const sessions = new Map<string, number>();
let config = readConfig();
const discord = new Map<string, DiscordInstance>();
const ts3 = new Map<string, Ts3Instance>();

function verifyPassword(password: string, salt: string, hash: string) {
  if (!salt || !hash) return false;
  return scryptSync(password, Buffer.from(salt, 'hex'), 64).toString('hex') === hash;
}
function sessionFromRequest(request: any) {
  const value = String(request.headers.cookie ?? '').split(';').map((x: string) => x.trim()).find((x: string) => x.startsWith('rb_session='));
  const token = value?.slice('rb_session='.length);
  if (!token) return false;
  const expiry = sessions.get(token);
  if (!expiry || expiry < Date.now()) { sessions.delete(token); return false; }
  return true;
}
function auth(request: any, reply: any) {
  if (sessionFromRequest(request)) return true;
  reply.code(401).send({ error: 'Nicht angemeldet.' });
  return false;
}
function save() { writeConfig(config); }
function bot(id = config.activeInstance): any { return discord.get(id) ?? ts3.get(id); }
function publicInstance(x: any, live: any) { return { ...x, token: undefined, clientSecret: undefined, ...(live?.state?.() ?? {}) }; }
async function startInstances() {
  for (const cfg of config.instances.discord ?? []) {
    if (discord.has(cfg.id)) continue;
    const instance = new DiscordInstance(cfg);
    discord.set(cfg.id, instance);
    instance.start().catch(e => console.error(`Discord ${cfg.name}:`, e));
  }
  for (const cfg of config.instances.ts3 ?? []) {
    if (ts3.has(cfg.id)) continue;
    const instance = new Ts3Instance(cfg);
    ts3.set(cfg.id, instance);
    instance.start().catch(e => console.error(`TS3 ${cfg.name}:`, e));
  }
}

const app = Fastify({ logger: true });
await app.register(cors, { origin: true, credentials: true });
await app.register(fastifyStatic, { root: FRONTEND_DIR, prefix: '/', index: 'index.html' });

app.get('/api/setup/status', async () => ({ userCreated: Boolean(config.auth.user), setupComplete: Boolean(config.setupComplete) }));

app.post('/api/setup/user', async (request: any, reply: any) => {
  if (config.auth.user) return reply.code(409).send({ error: 'Benutzer existiert bereits.' });
  const body = request.body ?? {};
  const username = String(body.username ?? '').trim();
  const password = String(body.password ?? '');
  if (!username || password.length < 12) return reply.code(400).send({ error: 'Benutzername erforderlich, Passwort mindestens 12 Zeichen.' });
  const pass = passwordHash(password);
  config.auth = { user: username, salt: pass.salt, hash: pass.hash };
  save();
  return { ok: true };
});

app.post('/api/auth/login', async (request: any, reply: any) => {
  if (!config.auth.user) return reply.code(403).send({ error: 'Zuerst den ersten Benutzer anlegen.' });
  const body = request.body ?? {};
  if (String(body.username ?? '') !== config.auth.user || !verifyPassword(String(body.password ?? ''), config.auth.salt, config.auth.hash)) return reply.code(401).send({ error: 'Anmeldung fehlgeschlagen.' });
  const token = randomBytes(32).toString('hex');
  sessions.set(token, Date.now() + 24 * 60 * 60 * 1000);
  reply.header('Set-Cookie', `rb_session=${token}; Path=/; HttpOnly; SameSite=Lax; Max-Age=86400`);
  return { ok: true, user: config.auth.user };
});

app.post('/api/auth/logout', async (request: any, reply: any) => {
  const value = String(request.headers.cookie ?? '').split(';').map((x: string) => x.trim()).find((x: string) => x.startsWith('rb_session='));
  if (value) sessions.delete(value.slice('rb_session='.length));
  reply.header('Set-Cookie', 'rb_session=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0');
  return { ok: true };
});

app.get('/api/me', async (request: any, reply: any) => {
  if (!auth(request, reply)) return;
  return { user: config.auth.user, setupComplete: config.setupComplete, activeInstance: config.activeInstance };
});

app.get('/api/state', async (request: any, reply: any) => {
  if (!auth(request, reply)) return;
  if (!config.setupComplete) return reply.code(409).send({ error: 'SETUP_REQUIRED' });
  return {
    activeInstance: config.activeInstance,
    instances: [...(config.instances.discord ?? []).map((x: any) => publicInstance(x, discord.get(x.id))), ...(config.instances.ts3 ?? []).map((x: any) => publicInstance(x, ts3.get(x.id)))],
    playlists: config.playlists,
    uiOrder: config.uiOrder
  };
});

app.get('/api/settings', async (request: any, reply: any) => {
  if (!auth(request, reply)) return;
  return {
    setupComplete: config.setupComplete,
    activeInstance: config.activeInstance,
    settings: config.settings,
    instances: {
      discord: (config.instances.discord ?? []).map((x: any) => ({ ...x, token: undefined })),
      ts3: config.instances.ts3 ?? [],
      spotify: (config.instances.spotify ?? []).map((x: any) => ({ ...x, clientSecret: undefined }))
    }
  };
});

app.put('/api/settings', async (request: any, reply: any) => {
  if (!auth(request, reply)) return;
  const body = request.body ?? {};
  if (typeof body.activeInstance === 'string') config.activeInstance = body.activeInstance;
  if (body.settings) config.settings = { ...config.settings, ...body.settings };
  if (Array.isArray(body.discord)) {
    for (const instance of discord.values()) await instance.stop().catch(() => undefined);
    discord.clear();
    config.instances.discord = body.discord.map((x: any, i: number) => ({ id: x.id || `discord-${i + 1}`, name: x.name || `Discord ${i + 1}`, token: x.token || '', guildId: x.guildId || '', voiceChannelId: x.voiceChannelId || '', prefix: x.prefix || '!' }));
  }
  if (Array.isArray(body.ts3)) {
    for (const instance of ts3.values()) await instance.stop().catch(() => undefined);
    ts3.clear();
    config.instances.ts3 = body.ts3.map((x: any, i: number) => ({ id: x.id || `ts3-${i + 1}`, name: x.name || `TS3 ${i + 1}`, host: x.host || '', nickname: x.nickname || 'RadioBot TS3', channel: x.channel || '', channelPassword: x.channelPassword || '', serverPassword: x.serverPassword || '', identity: x.identity || '' }));
  }
  if (Array.isArray(body.spotify)) config.instances.spotify = body.spotify;
  config.setupComplete = true;
  save();
  await startInstances();
  return { ok: true };
});

app.put('/api/ui/layout', async (request: any, reply: any) => {
  if (!auth(request, reply)) return;
  const order = (request.body ?? {}).order;
  if (!Array.isArray(order) || !order.every((x: any) => typeof x === 'string')) return reply.code(400).send({ error: 'Ungültige Reihenfolge.' });
  config.uiOrder = order.slice(0, 30);
  save();
  return { ok: true, order: config.uiOrder };
});

app.get('/api/search', async (request: any, reply: any) => {
  if (!auth(request, reply)) return;
  const q = String(request.query?.q ?? '').trim();
  if (!q) return [];
  try { return await searchYouTube(q); } catch (e) { return reply.code(502).send({ error: e instanceof Error ? e.message : String(e) }); }
});

app.get('/api/radio/search', async (request: any, reply: any) => {
  if (!auth(request, reply)) return;
  const q = String(request.query?.q ?? '').trim();
  if (!q) return [];
  try { return await searchRadio(q); } catch (e) { return reply.code(502).send({ error: e instanceof Error ? e.message : String(e) }); }
});

app.get('/api/spotify/search', async (request: any, reply: any) => {
  if (!auth(request, reply)) return;
  const q = String(request.query?.q ?? '').trim();
  if (!q) return [];
  try { return await searchSpotify(config.instances.spotify?.[0], q); } catch (e) { return reply.code(502).send({ error: e instanceof Error ? e.message : String(e) }); }
});

app.post('/api/play', async (request: any, reply: any) => {
  if (!auth(request, reply)) return;
  const b = request.body ?? {};
  const active = bot();
  if (!active) return reply.code(400).send({ error: 'Keine aktive Instanz.' });
  try { const item = await active.add(String(b.input ?? b.url ?? b.search ?? ''), Boolean(b.playNow)); return { ok: true, item }; }
  catch (e) { return reply.code(400).send({ error: e instanceof Error ? e.message : String(e) }); }
});

app.post('/api/control', async (request: any, reply: any) => {
  if (!auth(request, reply)) return;
  const active: any = bot();
  if (!active) return reply.code(400).send({ error: 'Keine aktive Instanz.' });
  const action = String((request.body ?? {}).action ?? '');
  if (action === 'skip') active.proc?.kill('SIGTERM'), active.ffmpeg?.kill('SIGTERM'), active.player?.stop?.();
  else if (action === 'pause') { active.player?.pause?.(); if (active.proc) active.proc.kill('SIGSTOP'); }
  else if (action === 'resume') { active.player?.unpause?.(); if (active.proc) active.proc.kill('SIGCONT'); }
  else if (action === 'stop') { active.queue = []; active.ffmpeg?.kill('SIGTERM'); active.proc?.kill('SIGTERM'); active.player?.stop?.(); active.current = undefined; }
  else if (action === 'volume') active.volume = Math.max(0, Math.min(100, Number((request.body ?? {}).value ?? 80)));
  return { ok: true };
});

app.get('/api/queue', async (request: any, reply: any) => {
  if (!auth(request, reply)) return;
  const active: any = bot();
  return { current: active?.current?.title ?? null, queue: active?.queue?.map((x: any) => x.title) ?? [] };
});

app.post('/api/playlist', async (request: any, reply: any) => {
  if (!auth(request, reply)) return;
  const name = String((request.body ?? {}).name ?? 'Neue Playlist').trim();
  const playlist = { id: randomBytes(8).toString('hex'), name: name || 'Neue Playlist', items: [] as any[] };
  config.playlists.push(playlist); save(); return playlist;
});
app.post('/api/playlist/:id/item', async (request: any, reply: any) => {
  if (!auth(request, reply)) return;
  const p = config.playlists.find((x: any) => x.id === request.params.id);
  if (!p) return reply.code(404).send({ error: 'Playlist nicht gefunden.' });
  const item = request.body ?? {};
  p.items.push({ input: String(item.input ?? ''), title: String(item.title ?? item.input ?? '') });
  save(); return { ok: true, playlist: p };
});
app.delete('/api/playlist/:id', async (request: any, reply: any) => { if (!auth(request, reply)) return; config.playlists = config.playlists.filter((x: any) => x.id !== request.params.id); save(); return { ok: true }; });
app.post('/api/playlist/:id/play', async (request: any, reply: any) => {
  if (!auth(request, reply)) return;
  const p = config.playlists.find((x: any) => x.id === request.params.id); if (!p) return reply.code(404).send({ error: 'Playlist nicht gefunden.' });
  const active: any = bot(); if (!active) return reply.code(400).send({ error: 'Keine aktive Instanz.' });
  for (const item of p.items ?? []) await active.add(item.input);
  return { ok: true, count: p.items?.length ?? 0 };
});

app.get('/api/system/health', async () => ({ ok: true, uptime: process.uptime(), memory: process.memoryUsage(), node: process.version, dataDir: DATA_DIR }));

await startInstances();
await app.listen({ port: PORT, host: HOST });
console.log(`RadioBot Web läuft auf Port ${PORT}`);
