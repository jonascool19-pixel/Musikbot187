#!/usr/bin/env python3
from pathlib import Path

ROOT = Path('/opt/radiobot')
backend = ROOT / 'backend/src/index.ts'
frontend = ROOT / 'frontend/index.html'
s = backend.read_text(encoding='utf-8')

if "import net from 'node:net';" not in s:
    s = s.replace("import crypto from 'node:crypto';", "import crypto from 'node:crypto';\nimport net from 'node:net';", 1)

s = s.replace("const YTDLP = process.env.YTDLP_PATH ?? '/usr/local/bin/yt-dlp';", "const YTDLP = process.env.YTDLP_PATH ?? '/usr/local/bin/yt-dlp';\nconst PRIVILEGED_SOCKET = '/run/radiobot-privileged.sock';\nconst DISCORD_COOLDOWN_MS = 1200;\nconst DISCORD_SEARCH_COOLDOWN_MS = 4500;\nconst discordCooldowns = new Map<string, number>();\nlet searchInFlight = 0;\nconst MAX_SEARCH_IN_FLIGHT = 2;", 1)
s = s.replace("function controlAllowed(member: any) { if (!DISCORD_CONTROL_ROLE) return true; return Boolean(member?.permissions?.has('Administrator') || member?.roles?.cache?.has(DISCORD_CONTROL_ROLE)); }", "function controlAllowed(member: any) { if (!DISCORD_CONTROL_ROLE) return Boolean(member?.permissions?.has('Administrator')); return Boolean(member?.permissions?.has('Administrator') || member?.roles?.cache?.has(DISCORD_CONTROL_ROLE)); }", 1)
s = s.replace("type Db = { radios: Radio[]; guilds: Record<string, GuildState>; playlists: Playlist[] };", "type Db = { radios: Radio[]; guilds: Record<string, GuildState>; playlists: Playlist[]; botEnabled?: boolean };", 1)
s = s.replace("db.playlists ??= [];", "db.playlists ??= [];\ndb.botEnabled ??= true;", 1)

queue_old = "if (replace) { await stopGuild(guildId); state.activePlaylistId = playlist.id; state.queue = items; }"
queue_new = "if (replace) { await stopGuild(guildId); state.manualStop = false; state.activePlaylistId = playlist.id; state.queue = items; }"
if queue_old in s:
    s = s.replace(queue_old, queue_new, 1)
else:
    s = s.replace("if (replace) { await stopGuild(guildId); state.queue = items; }", "if (replace) { await stopGuild(guildId); state.manualStop = false; state.queue = items; }", 1)

# Add serialized playback wrapper without changing the playback body or brace structure.
if "const playLocks = new Map" in s:
    if "async function playNextUnlocked(guildId: string)" not in s and "async function playNext(guildId: string)" in s:
        s = s.replace("async function playNext(guildId: string) {", "async function playNextUnlocked(guildId: string) {", 1)
    if "async function playNext(guildId: string)" not in s and "async function playNextUnlocked(guildId: string)" in s:
        wrapper = """async function playNext(guildId: string) {
  const running = playLocks.get(guildId);
  if (running) return running;
  const run = playNextUnlocked(guildId).finally(() => { if (playLocks.get(guildId) === run) playLocks.delete(guildId); });
  playLocks.set(guildId, run);
  return run;
}

"""
        if "async function stopGuild(guildId: string)" in s:
            s = s.replace("async function stopGuild(guildId: string)", wrapper + "async function stopGuild(guildId: string)", 1)

# Ensure stop always clears the transient manual-stop latch even when older hardening did not patch it.
stop_marker = "const state = guildState(guildId); state.queue = []; state.playing = undefined; state.playingType = undefined; state.currentPlaylist = undefined;"
stop_new = "const state = guildState(guildId); state.manualStop = true; state.queue = []; state.playing = undefined; state.playingType = undefined; state.currentPlaylist = undefined; state.activePlaylistId = undefined; state.lastItem = undefined;"
if stop_marker in s:
    s = s.replace(stop_marker, stop_new, 1)

old = """async function unifiedSearch(query: string) {
  const needle = query.toLowerCase();
  const local: SearchItem[] = fs.readdirSync(MUSIC_DIR).filter(f => /\\.(mp3|wav|ogg|flac|m4a)$/i.test(f) && f.toLowerCase().includes(needle)).slice(0, 12).map(f => ({ kind: 'file', value: f, label: f, meta: 'Lokal' }));
  const radios: SearchItem[] = db.radios.filter(r => `${r.name} ${r.url}`.toLowerCase().includes(needle)).slice(0, 12).map(r => ({ kind: 'radio', value: r.url, label: r.name, meta: 'Radio' }));
  const [youtube, sp] = await Promise.all([youtubeSearch(query).catch(() => []), spotifySearch(query)]); return { local, radios, youtube, spotify: sp };
}"""
new = """async function unifiedSearch(query: string) {
  if (query.length > 200) throw new Error('Suchbegriff zu lang.');
  if (searchInFlight >= MAX_SEARCH_IN_FLIGHT) throw new Error('Suche gerade ausgelastet. Bitte kurz warten.');
  searchInFlight += 1;
  try {
    const needle = query.toLowerCase();
    const local: SearchItem[] = fs.readdirSync(MUSIC_DIR).filter(f => /\\.(mp3|wav|ogg|flac|m4a)$/i.test(f) && f.toLowerCase().includes(needle)).slice(0, 12).map(f => ({ kind: 'file', value: f, label: f, meta: 'Lokal' }));
    const radios: SearchItem[] = db.radios.filter(r => `${r.name} ${r.url}`.toLowerCase().includes(needle)).slice(0, 12).map(r => ({ kind: 'radio', value: r.url, label: r.name, meta: 'Radio' }));
    const [youtube, sp] = await Promise.all([youtubeSearch(query).catch(() => []), spotifySearch(query)]); return { local, radios, youtube, spotify: sp };
  } finally {
    searchInFlight -= 1;
  }
}"""
if old in s:
    s = s.replace(old, new, 1)
elif 'searchInFlight' not in s:
    raise SystemExit('unifiedSearch marker missing')

priv = r'''
async function privilegedAction(action: 'bot-restart' | 'bot-update' | 'server-reboot' | 'server-shutdown') {
  return new Promise<void>((resolve, reject) => {
    const socket = net.createConnection(PRIVILEGED_SOCKET);
    let done = false;
    const finish = (error?: Error) => { if (done) return; done = true; socket.destroy(); error ? reject(error) : resolve(); };
    socket.setTimeout(2000, () => finish(new Error('Privilegierter Systemdienst antwortet nicht.')));
    socket.on('error', error => finish(error));
    socket.on('connect', () => socket.end(`${action}\n`));
    socket.on('data', chunk => { const response = String(chunk).trim(); if (response === 'OK') finish(); else finish(new Error('Privilegierte Aktion abgelehnt.')); });
  });
}

function consumeDiscordCooldown(interaction: any) {
  const guildId = String(interaction.guildId ?? 'dm');
  const userId = String(interaction.user?.id ?? 'unknown');
  const search = Boolean(interaction.isChatInputCommand?.() && interaction.commandName === 'search');
  const key = `${guildId}:${userId}:${search ? 'search' : 'command'}`;
  const now = Date.now();
  const delay = search ? DISCORD_SEARCH_COOLDOWN_MS : DISCORD_COOLDOWN_MS;
  const last = discordCooldowns.get(key) ?? 0;
  if (now - last < delay) return false;
  discordCooldowns.set(key, now);
  return true;
}
setInterval(() => {
  const cutoff = Date.now() - 60_000;
  for (const [key, ts] of discordCooldowns) if (ts < cutoff) discordCooldowns.delete(key);
}, 30_000).unref();
'''
if "async function privilegedAction" not in s:
    s = s.replace("async function unifiedSearch(query: string) {", priv + "\nasync function unifiedSearch(query: string) {", 1)

old_hook = "const openSetup = req.url.startsWith('/api/setup') || req.url.startsWith('/api/health') || req.url.startsWith('/api/spotify/callback'); if (req.url.startsWith('/api/') && !openSetup && !req.url.startsWith('/api/spotify/callback') && !auth(req, reply)) return reply; const key = String(req.ip ?? 'unknown'); const now = Date.now(); const bucket = requestBuckets.get(key); if (!bucket || now - bucket.start >= RATE_WINDOW_MS) requestBuckets.set(key, { start: now, count: 1 }); else { bucket.count += 1; if (bucket.count > REQUEST_LIMIT) return reply.code(429).send('Too many requests'); }"
new_hook = "const openSetup = req.url.startsWith('/api/setup') || req.url.startsWith('/api/health') || req.url.startsWith('/api/spotify/callback'); if (req.url.startsWith('/api/') && !openSetup && !req.url.startsWith('/api/spotify/callback') && !auth(req, reply)) return reply; const limited = req.url.startsWith('/api/') && !req.url.startsWith('/api/health') && !req.url.startsWith('/api/setup/status'); if (limited) { const key = String(req.ip ?? 'unknown'); const now = Date.now(); const bucket = requestBuckets.get(key); if (!bucket || now - bucket.start >= RATE_WINDOW_MS) requestBuckets.set(key, { start: now, count: 1 }); else { bucket.count += 1; if (bucket.count > REQUEST_LIMIT) return reply.code(429).send('Too many requests'); } }"
if old_hook in s:
    s = s.replace(old_hook, new_hook, 1)

ops = r'''app.post('/api/system/bot/disable', async () => {
  if (!db.botEnabled) return { ok: true, enabled: false };
  db.botEnabled = false;
  for (const guild of client.guilds.cache.values()) { try { await stopGuild(guild.id); } catch {} }
  saveJson(DB_FILE, db);
  return { ok: true, enabled: false };
});
app.post('/api/system/bot/enable', async () => { db.botEnabled = true; saveJson(DB_FILE, db); return { ok: true, enabled: true }; });
app.post('/api/system/restart', async (_req, reply) => { await privilegedAction('bot-restart'); return reply.code(202).send({ ok: true, action: 'bot-restart' }); });
app.post('/api/system/reboot', async (_req, reply) => { await privilegedAction('server-reboot'); return reply.code(202).send({ ok: true, action: 'server-reboot' }); });
app.post('/api/system/shutdown', async (_req, reply) => { await privilegedAction('server-shutdown'); return reply.code(202).send({ ok: true, action: 'server-shutdown' }); });
'''
if "/api/system/reboot" not in s:
    s = s.replace("app.get('/api/health'", ops + "\napp.get('/api/health'", 1)

old_update = "app.post('/api/update', async (req, reply) => { if (!fs.existsSync('/usr/local/sbin/radiobot-update')) return reply.code(503).send('Update-Helfer ist nicht installiert.'); fs.writeFileSync(UPDATE_LOG, `started ${new Date().toISOString()}\\n`, { mode: 0o600 }); const child = spawn('sudo', ['-n', '/usr/local/sbin/radiobot-update'], { detached: true, stdio: 'ignore' }); child.unref(); return { ok: true, message: 'Update gestartet. Der Dienst wird danach automatisch neu gestartet.' }; });"
new_update = "app.post('/api/update', async (_req, reply) => { if (!fs.existsSync('/usr/local/sbin/radiobot-update')) return reply.code(503).send('Update-Helfer ist nicht installiert.'); fs.writeFileSync(UPDATE_LOG, `started ${new Date().toISOString()}\\n`, { mode: 0o600 }); await privilegedAction('bot-update'); return { ok: true, message: 'Update gestartet. Der Dienst wird danach automatisch neu gestartet.' }; });"
if old_update in s:
    s = s.replace(old_update, new_update, 1)

needle = "client.on('interactionCreate', async interaction => {\n  try {"
replacement = "client.on('interactionCreate', async interaction => {\n  try {\n    if (interaction.guildId && !consumeDiscordCooldown(interaction)) return;\n    if (interaction.guildId && !db.botEnabled) { if (interaction.isRepliable()) await interaction.reply({ content: '🛑 Der Bot ist derzeit über das Webinterface deaktiviert.', ephemeral: true }); return; }"
if needle in s:
    s = s.replace(needle, replacement, 1)
else:
    raise SystemExit('interactionCreate marker missing')

backend.write_text(s, encoding='utf-8')

html = frontend.read_text(encoding='utf-8')
if 'id="systemOpen"' not in html:
    needle = '<div class="row"><button id="metricsOpen" title="Systemleistung und Netzwerk">Leistung</button><button id="update" title="MusikBot187 aktualisieren">Update</button><button id="refresh" title="Aktualisieren">↻</button></div>'
    repl = '<div class="row"><button id="metricsOpen" title="Systemleistung und Netzwerk">Leistung</button><button id="systemOpen" title="Bot- und Serversteuerung">System</button><button id="update" title="MusikBot187 aktualisieren">Update</button><button id="refresh" title="Aktualisieren">↻</button></div>'
    if needle in html:
        html = html.replace(needle, repl, 1)
    else:
        raise SystemExit('header button marker missing')
if 'system-controls.js' not in html:
    html = html.replace('</body>', '<script src="/system-controls.js"></script></body>', 1)
frontend.write_text(html, encoding='utf-8')

print('system operations + Discord cooldown patch applied')
