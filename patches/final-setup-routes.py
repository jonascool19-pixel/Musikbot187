#!/usr/bin/env python3
from pathlib import Path
import re

ROOT = Path('/opt/radiobot')
backend = ROOT / 'backend/src/index.ts'
s = backend.read_text(encoding='utf-8')

# Ensure the setup token constants exist without depending on later route patches.
if "const SETUP_TOKEN = process.env.SETUP_TOKEN ?? '';" not in s:
    marker = "const DISCORD_CONTROL_ROLE = process.env.DISCORD_CONTROL_ROLE ?? '';"
    replacement = marker + "\nconst YOUTUBE_API_KEY = process.env.YOUTUBE_API_KEY ?? '';\nconst SETUP_TOKEN = process.env.SETUP_TOKEN ?? '';"
    if marker in s:
        s = s.replace(marker, replacement, 1)

route_block = r'''app.get('/api/setup/status', async () => ({
  configured: Boolean(process.env.DISCORD_TOKEN),
  requiresSetup: Boolean(SETUP_TOKEN) || !Boolean(process.env.DISCORD_TOKEN),
  requiresUserCreation: !Boolean(WEB_PASSWORD),
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
  await privilegedConfigWrite(JSON.stringify({ bootstrapUserOnly: true, webUser: username, webPassword: password, setupToken: SETUP_TOKEN }));
  return { ok: true, message: 'Benutzer erstellt. Der Server startet jetzt neu. Danach meldest du dich mit diesem Benutzer an und schließt die Ersteinrichtung ab.' };
});
app.post<{ Body: { setupToken?: string; discordToken?: string; spotifyClientId?: string; spotifyClientSecret?: string; spotifyRedirectUri?: string; youtubeApiKey?: string; discordControlRole?: string; publicUrl?: string; port?: number } }>('/api/setup', async (req, reply) => {
  const b = req.body ?? {};
  if (!SETUP_TOKEN || b.setupToken !== SETUP_TOKEN) return reply.code(403).send('Ungültiger Ersteinrichtungs-Code.');
  if (!WEB_PASSWORD) return reply.code(403).send('Bitte zuerst einen Web-Benutzer anlegen.');
  if (!b.discordToken?.trim()) return reply.code(400).send('Discord Bot Token ist erforderlich.');
  await privilegedConfigWrite(JSON.stringify({ discordToken: b.discordToken.trim(), webUser: WEB_USER || 'admin', webPassword: WEB_PASSWORD, spotifyClientId: b.spotifyClientId?.trim() || '', spotifyClientSecret: b.spotifyClientSecret?.trim() || '', spotifyRedirectUri: b.spotifyRedirectUri?.trim() || '', youtubeApiKey: b.youtubeApiKey?.trim() || '', discordControlRole: b.discordControlRole?.trim() || '', publicUrl: b.publicUrl?.trim() || '', port: Number(b.port || PORT), setupToken: '' }));
  return { ok: true, message: 'Einrichtung gespeichert. MusikBot187 startet jetzt neu.' };
});
'''

first_user_route_re = re.compile(r"app\.post(?:<[^>]+>)?\('/api/setup/user'")
if not first_user_route_re.search(s):
    app_match = re.search(r"^const app = Fastify\([^\n]*\);\n", s, re.M)
    if not app_match:
        raise SystemExit('first-user route insertion failed: Fastify app declaration not found')
    insert_at = app_match.end()
    s = s[:insert_at] + route_block + "\n" + s[insert_at:]

new_hook = "app.addHook('preHandler', async (req, reply) => { const openSetup = req.url === '/api/setup/status' || req.url === '/api/setup/user'; if (req.url === '/api/setup' && !WEB_PASSWORD) return reply.code(403).send('Bitte zuerst einen Web-Benutzer anlegen.'); if (req.url.startsWith('/api/') && !openSetup && !req.url.startsWith('/api/spotify/callback') && !auth(req, reply)) return reply; });"
hook_match = re.search(r"app\.addHook\('preHandler'.*?\n", s)
if hook_match:
    s = s[:hook_match.start()] + new_hook + "\n" + s[hook_match.end():]
elif 'app.addHook' not in s and re.search(r"^const app = Fastify\(", s, re.M):
    app_match = re.search(r"^const app = Fastify\([^\n]*\);\n", s, re.M)
    assert app_match is not None
    s = s[:app_match.end()] + new_hook + "\n" + s[app_match.end():]

metrics_block = "app.get('/api/metrics', async (_req, reply) => { const file = '/var/lib/radiobot/metrics.json'; if (!fs.existsSync(file)) return reply.send({ ok: true, ts: Date.now(), cpuTotal: 0, cpuIdle: 0, cpuCount: 1, load1: 0, memoryTotal: 0, memoryUsed: 0, diskTotal: 0, diskUsed: 0, networkRx: 0, networkTx: 0, stale: true }); try { return reply.send(JSON.parse(fs.readFileSync(file, 'utf8'))); } catch { return reply.send({ ok: true, ts: Date.now(), cpuTotal: 0, cpuIdle: 0, cpuCount: 1, load1: 0, memoryTotal: 0, memoryUsed: 0, diskTotal: 0, diskUsed: 0, networkRx: 0, networkTx: 0, stale: true }); } });"
if "app.get('/api/metrics'" not in s:
    app_match = re.search(r"^const app = Fastify\([^\n]*\);\n", s, re.M)
    if not app_match:
        raise SystemExit('metrics insertion failed: Fastify app declaration not found')
    s = s[:app_match.end()] + metrics_block + "\n" + s[app_match.end():]

system_routes = r'''app.post('/api/system/bot/disable', async () => { db.botEnabled = false; for (const guild of client.guilds.cache.values()) { try { await stopGuild(guild.id); } catch {} } saveJson(DB_FILE, db); return { ok: true, enabled: false }; });
app.post('/api/system/bot/enable', async () => { db.botEnabled = true; saveJson(DB_FILE, db); return { ok: true, enabled: true }; });
app.post('/api/system/restart', async (_req, reply) => { await privilegedAction('bot-restart'); return reply.code(202).send({ ok: true, action: 'bot-restart' }); });
app.post('/api/system/reboot', async (_req, reply) => { await privilegedAction('server-reboot'); return reply.code(202).send({ ok: true, action: 'server-reboot' }); });
app.post('/api/system/shutdown', async (_req, reply) => { await privilegedAction('server-shutdown'); return reply.code(202).send({ ok: true, action: 'server-shutdown' }); });
'''
if "'/api/system/bot/disable'" not in s:
    app_match = re.search(r"^const app = Fastify\([^\n]*\);\n", s, re.M)
    if not app_match:
        raise SystemExit('system route insertion failed: Fastify app declaration not found')
    s = s[:app_match.end()] + system_routes + "\n" + s[app_match.end():]

if "app.get('/api/setup/status'" not in s:
    raise SystemExit('missing final setup marker: setup status')
if not first_user_route_re.search(s):
    raise SystemExit('missing final setup marker: first-user route')
if "Bitte zuerst einen Web-Benutzer anlegen." not in s:
    raise SystemExit('missing final setup marker: first-user gate')
if "app.get('/api/metrics'" not in s:
    raise SystemExit('missing final setup marker: metrics')

backend.write_text(s, encoding='utf-8')
print('final setup + first-user + metrics + system route patch applied')
