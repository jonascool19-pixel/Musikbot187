#!/usr/bin/env python3
from pathlib import Path

ROOT = Path('/opt/radiobot')
backend = ROOT / 'backend/src/index.ts'
frontend = ROOT / 'frontend/index.html'
s = backend.read_text(encoding='utf-8')

# Node socket client for the narrowly scoped root controller.
if "import net from 'node:net';" not in s:
    s = s.replace("import crypto from 'node:crypto';", "import crypto from 'node:crypto';\nimport net from 'node:net';", 1)

s = s.replace(
    "const YTDLP = process.env.YTDLP_PATH ?? '/usr/local/bin/yt-dlp';",
    "const YTDLP = process.env.YTDLP_PATH ?? '/usr/local/bin/yt-dlp';\nconst PRIVILEGED_SOCKET = '/run/radiobot-privileged.sock';\nconst DISCORD_COOLDOWN_MS = 1200;\nconst DISCORD_SEARCH_COOLDOWN_MS = 4500;\nconst discordCooldowns = new Map<string, number>();\nlet searchInFlight = 0;\nconst MAX_SEARCH_IN_FLIGHT = 2;",
    1,
)

# Safe default: no configured control role means Discord administrators only.
s = s.replace(
    "function controlAllowed(member: any) { if (!DISCORD_CONTROL_ROLE) return true; return Boolean(member?.permissions?.has('Administrator') || member?.roles?.cache?.has(DISCORD_CONTROL_ROLE)); }",
    "function controlAllowed(member: any) { if (!DISCORD_CONTROL_ROLE) return Boolean(member?.permissions?.has('Administrator')); return Boolean(member?.permissions?.has('Administrator') || member?.roles?.cache?.has(DISCORD_CONTROL_ROLE)); }",
    1,
)

# Persist a dashboard-level bot enabled flag without breaking old DB files.
s = s.replace(
    "type Db = { radios: Radio[]; guilds: Record<string, GuildState>; playlists: Playlist[] };",
    "type Db = { radios: Radio[]; guilds: Record<string, GuildState>; playlists: Playlist[]; botEnabled?: boolean };",
    1,
)
s = s.replace("db.playlists ??= [];", "db.playlists ??= [];\ndb.botEnabled ??= true;", 1)

# Add cooldown + bounded expensive-search concurrency.
marker = "async function unifiedSearch(query: string) {"
if marker in s and "MAX_SEARCH_IN_FLIGHT" in s:
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
    s = s.replace(old, new, 1)

# Privileged operations never invoke sudo from the sandboxed bot process.
priv = r'''
async function privilegedAction(action: 'bot-restart' | 'server-reboot' | 'server-shutdown') {
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

# Add web operations before the health route.
health = "app.get('/api/health'"
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
    s = s.replace(health, ops + "\n" + health, 1)

# Gate all Discord interactions while the bot is intentionally disabled and silently drop rapid repeats.
needle = "client.on('interactionCreate', async interaction => {\n  try {"
replacement = "client.on('interactionCreate', async interaction => {\n  try {\n    if (interaction.guildId && !db.botEnabled) { if (interaction.isRepliable()) await interaction.reply({ content: '🛑 Der Bot ist derzeit über das Webinterface deaktiviert.', ephemeral: true }); return; }\n    if (interaction.guildId && !consumeDiscordCooldown(interaction)) return;"
if needle in s:
    s = s.replace(needle, replacement, 1)
else:
    raise SystemExit('interactionCreate marker missing')

backend.write_text(s, encoding='utf-8')

# Add the UI controls once; keep the HTML small and accessible.
html = frontend.read_text(encoding='utf-8')
if 'id="systemOpen"' not in html:
    html = html.replace(
        '<div class="row"><button id="metricsOpen" title="Systemleistung und Netzwerk">Leistung</button><button id="update" title="MusikBot187 aktualisieren">Update</button><button id="refresh" title="Aktualisieren">↻</button></div>',
        '<div class="row"><button id="metricsOpen" title="Systemleistung und Netzwerk">Leistung</button><button id="systemOpen" title="Bot- und Serversteuerung">System</button><button id="update" title="MusikBot187 aktualisieren">Update</button><button id="refresh" title="Aktualisieren">↻</button></div>',
        1,
    )
    html = html.replace('</main><script src="/app.js"></script>', '</main><script src="/app.js"></script>', 1)
    frontend.write_text(html, encoding='utf-8')

print('system operations + Discord cooldown patch applied')
'''
