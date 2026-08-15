#!/usr/bin/env python3
from pathlib import Path
import re

p = Path('/opt/radiobot/backend/src/index.ts')
s = p.read_text(encoding='utf-8')

if "const SETUP_TOKEN = process.env.SETUP_TOKEN ?? '';" not in s:
    s = s.replace(
        "const DISCORD_CONTROL_ROLE = process.env.DISCORD_CONTROL_ROLE ?? '';",
        "const DISCORD_CONTROL_ROLE = process.env.DISCORD_CONTROL_ROLE ?? '';\nconst YOUTUBE_API_KEY = process.env.YOUTUBE_API_KEY ?? '';\nconst SETUP_TOKEN = process.env.SETUP_TOKEN ?? '';",
        1,
    )

route_block = r'''app.get('/api/setup/status', async () => ({
  configured: Boolean(process.env.DISCORD_TOKEN),
  requiresSetup: Boolean(SETUP_TOKEN) || !Boolean(process.env.DISCORD_TOKEN),
  spotifyConfigured: Boolean(SPOTIFY_CLIENT_ID && SPOTIFY_CLIENT_SECRET),
  youtubeConfigured: Boolean(YOUTUBE_API_KEY),
  webConfigured: Boolean(WEB_PASSWORD),
  webUser: WEB_USER,
  port: PORT
}));
app.post<{ Body: { setupToken?: string; webUser?: string; webPassword?: string } }>('/api/setup/user', async (req, reply) => {
  const b = req.body ?? {};
  if (WEB_PASSWORD) return reply.code(409).send('Der Web-Benutzer wurde bereits angelegt.');
  if (!SETUP_TOKEN || b.setupToken !== SETUP_TOKEN) return reply.code(403).send('Ungültiger Ersteinrichtungs-Code.');
  const username = b.webUser?.trim() || '';
  const password = b.webPassword ?? '';
  if (!username) return reply.code(400).send('Benutzername ist erforderlich.');
  if (username.length > 64) return reply.code(400).send('Benutzername ist zu lang.');
  if (password.length < 12) return reply.code(400).send('Das Web-Passwort muss mindestens 12 Zeichen haben.');
  const payload = JSON.stringify({ discordToken: process.env.DISCORD_TOKEN ?? '', webUser: username, webPassword: password, spotifyClientId: SPOTIFY_CLIENT_ID, spotifyClientSecret: SPOTIFY_CLIENT_SECRET, spotifyRedirectUri: SPOTIFY_REDIRECT_URI, youtubeApiKey: YOUTUBE_API_KEY, discordControlRole: DISCORD_CONTROL_ROLE, publicUrl: '', port: PORT, setupToken: SETUP_TOKEN });
  await privilegedConfigWrite(payload);
  return { ok: true, message: 'Benutzer erstellt. Der Server startet jetzt neu. Danach meldest du dich mit diesem Benutzer an und schließt die Ersteinrichtung ab.' };
});
app.post<{ Body: { setupToken?: string; discordToken?: string; webUser?: string; webPassword?: string; spotifyClientId?: string; spotifyClientSecret?: string; spotifyRedirectUri?: string; youtubeApiKey?: string; discordControlRole?: string; publicUrl?: string; port?: number } }>('/api/setup', async (req, reply) => {
  const b = req.body ?? {};
  if (!SETUP_TOKEN || b.setupToken !== SETUP_TOKEN) return reply.code(403).send('Ungültiger Ersteinrichtungs-Code.');
  if (!b.discordToken?.trim()) return reply.code(400).send('Discord Bot Token ist erforderlich.');
  if (!b.webPassword || b.webPassword.length < 12) return reply.code(400).send('Das Web-Passwort muss mindestens 12 Zeichen haben.');
  const payload = JSON.stringify({ discordToken: b.discordToken.trim(), webUser: b.webUser?.trim() || WEB_USER || 'admin', webPassword: b.webPassword, spotifyClientId: b.spotifyClientId?.trim() || '', spotifyClientSecret: b.spotifyClientSecret?.trim() || '', spotifyRedirectUri: b.spotifyRedirectUri?.trim() || '', youtubeApiKey: b.youtubeApiKey?.trim() || '', discordControlRole: b.discordControlRole?.trim() || '', publicUrl: b.publicUrl?.trim() || '', port: Number(b.port || PORT), setupToken: '' });
  await privilegedConfigWrite(payload);
  return { ok: true, message: 'Einrichtung gespeichert. MusikBot187 startet jetzt neu.' };
});
'''

if "app.get('/api/setup/status'" not in s:
    anchor = "app.get('/api/health'"
    if anchor not in s:
        raise SystemExit('health anchor not found')
    s = s.replace(anchor, route_block + "\n" + anchor, 1)
else:
    start = s.index("app.get('/api/setup/status'")
    anchor = s.find("app.get('/api/metrics'", start)
    if anchor == -1:
        anchor = s.find("app.get('/api/health'", start)
    if anchor == -1:
        raise SystemExit('existing setup route anchor not found')
    s = s[:start] + route_block + "\n" + s[anchor:]

# The setup status endpoint and bootstrap user endpoint stay public only behind the
# one-time setup token. The actual bot setup endpoint requires the newly created
# web account, so the rest of the web API remains protected by Basic Auth.
old_hooks = [
    "app.addHook('preHandler', async (req, reply) => { const openSetup = req.url.startsWith('/api/setup'); if (req.url.startsWith('/api/') && !openSetup && !req.url.startsWith('/api/spotify/callback') && !auth(req, reply)) return reply; });",
    "app.addHook('preHandler', async (req, reply) => { if (req.url.startsWith('/api/') && !req.url.startsWith('/api/spotify/callback') && !auth(req, reply)) return reply; });",
]
new_hook = "app.addHook('preHandler', async (req, reply) => { const openSetup = req.url === '/api/setup/status' || req.url === '/api/setup/user'; if (req.url === '/api/setup' && !WEB_PASSWORD) return reply.code(403).send('Bitte zuerst einen Web-Benutzer anlegen.'); if (req.url.startsWith('/api/') && !openSetup && !req.url.startsWith('/api/spotify/callback') && !auth(req, reply)) return reply; });"
for hook in old_hooks:
    if hook in s:
        s = s.replace(hook, new_hook, 1)
        break

metrics_block = "app.get('/api/metrics', async (_req, reply) => { const file = '/var/lib/radiobot/metrics.json'; if (!fs.existsSync(file)) return reply.send({ ok: true, ts: Date.now(), cpuTotal: 0, cpuIdle: 0, cpuCount: 1, load1: 0, memoryTotal: 0, memoryUsed: 0, diskTotal: 0, diskUsed: 0, networkRx: 0, networkTx: 0, stale: true }); try { return reply.send(JSON.parse(fs.readFileSync(file, 'utf8'))); } catch { return reply.send({ ok: true, ts: Date.now(), cpuTotal: 0, cpuIdle: 0, cpuCount: 1, load1: 0, memoryTotal: 0, memoryUsed: 0, diskTotal: 0, diskUsed: 0, networkRx: 0, networkTx: 0, stale: true }); } });"

metrics_match = re.search(r"app\.get\('/api/metrics'.*?\n", s, re.S)
if metrics_match:
    s = s[:metrics_match.start()] + metrics_block + "\n" + s[metrics_match.end():]
elif "app.get('/api/metrics'" not in s:
    anchor = "app.get('/api/health'"
    if anchor not in s:
        raise SystemExit('health anchor not found for metrics route')
    s = s.replace(anchor, metrics_block + "\n" + anchor, 1)

system_routes = r'''app.post('/api/system/bot/disable', async () => {
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
for route in [
    "'/api/system/bot/disable'",
    "'/api/system/bot/enable'",
    "'/api/system/restart'",
    "'/api/system/reboot'",
    "'/api/system/shutdown'",
]:
    if route not in s:
        anchor = "app.get('/api/health'"
        if anchor not in s:
            raise SystemExit('health anchor not found for system route patch')
        s = s.replace(anchor, system_routes + "\n" + anchor, 1)
        break
for route in [
    "'/api/system/bot/disable'",
    "'/api/system/bot/enable'",
    "'/api/system/restart'",
    "'/api/system/reboot'",
    "'/api/system/shutdown'",
]:
    if route not in s:
        raise SystemExit(f'missing system route: {route}')

listen_marker = "await app.listen({ port: PORT, host: '0.0.0.0' });"
if "setup_route_registered=" not in s and listen_marker in s:
    s = s.replace(listen_marker, "console.log(`setup_route_registered=${app.hasRoute({ method: 'GET', url: '/api/setup/status' })}`);\n" + listen_marker, 1)

if "app.get('/api/setup/status'" not in s:
    raise SystemExit('final setup route insertion failed')
if "app.post('/api/setup/user'" not in s:
    raise SystemExit('first-user setup route insertion failed')
if "Bitte zuerst einen Web-Benutzer anlegen." not in s:
    raise SystemExit('first-user setup gate missing')
if "app.get('/api/metrics'" not in s:
    raise SystemExit('final metrics route insertion failed')

p.write_text(s, encoding='utf-8')
print('final setup + first-user + metrics + system route patch applied')
