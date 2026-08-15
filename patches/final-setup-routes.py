#!/usr/bin/env python3
from pathlib import Path
import re

ROOT = Path('/opt/radiobot')
backend = ROOT / 'backend/src/index.ts'
s = backend.read_text(encoding='utf-8')

if "const SETUP_TOKEN = process.env.SETUP_TOKEN ?? '';" not in s:
    marker = "const DISCORD_CONTROL_ROLE = process.env.DISCORD_CONTROL_ROLE ?? '';"
    replacement = marker + "\nconst YOUTUBE_API_KEY = process.env.YOUTUBE_API_KEY ?? '';\nconst SETUP_TOKEN = process.env.SETUP_TOKEN ?? '';"
    if marker in s:
        s = s.replace(marker, replacement, 1)

first_user_route = r'''app.post<{ Body: { setupToken?: string; webUser?: string; webPassword?: string } }>('/api/setup/user', async (req, reply) => {
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
'''

first_user_route_re = re.compile(r"app\.post(?:<[^>]+>)?\('/api/setup/user'")
if not first_user_route_re.search(s):
    app_match = re.search(r"^const app = Fastify\([^\n]*\);\n", s, re.M)
    if not app_match:
        raise SystemExit('first-user route insertion failed: Fastify app declaration not found')
    s = s[:app_match.end()] + first_user_route + "\n" + s[app_match.end():]

# During bootstrap only the status and first-user endpoints are public. The normal
# bot setup is unavailable until the web account exists, and all other APIs are closed.
new_hook = "app.addHook('preHandler', async (req, reply) => { const openSetup = req.url === '/api/setup/status' || req.url === '/api/setup/user'; if (req.url.startsWith('/api/') && !WEB_PASSWORD && !openSetup) return reply.code(403).send('Bitte zuerst einen Web-Benutzer anlegen.'); if (req.url === '/api/setup' && !WEB_PASSWORD) return reply.code(403).send('Bitte zuerst einen Web-Benutzer anlegen.'); if (req.url.startsWith('/api/') && !openSetup && !req.url.startsWith('/api/spotify/callback') && !auth(req, reply)) return reply; });"
hook_match = re.search(r"app\.addHook\('preHandler'.*?\n", s)
if hook_match:
    s = s[:hook_match.start()] + new_hook + "\n" + s[hook_match.end():]
elif re.search(r"^const app = Fastify\(", s, re.M):
    app_match = re.search(r"^const app = Fastify\([^\n]*\);\n", s, re.M)
    assert app_match is not None
    s = s[:app_match.end()] + new_hook + "\n" + s[app_match.end():]

metrics_block = "app.get('/api/metrics', async (_req, reply) => { const file = '/var/lib/radiobot/metrics.json'; if (!fs.existsSync(file)) return reply.send({ ok: true, ts: Date.now(), cpuTotal: 0, cpuIdle: 0, cpuCount: 1, load1: 0, memoryTotal: 0, memoryUsed: 0, diskTotal: 0, diskUsed: 0, networkRx: 0, networkTx: 0, stale: true }); try { return reply.send(JSON.parse(fs.readFileSync(file, 'utf8'))); } catch { return reply.send({ ok: true, ts: Date.now(), cpuTotal: 0, cpuIdle: 0, cpuCount: 1, load1: 0, memoryTotal: 0, memoryUsed: 0, diskTotal: 0, diskUsed: 0, networkRx: 0, networkTx: 0, stale: true }); } });"
if "app.get('/api/metrics'" not in s:
    app_match = re.search(r"^const app = Fastify\([^\n]*\);\n", s, re.M)
    if not app_match:
        raise SystemExit('metrics insertion failed: Fastify app declaration not found')
    s = s[:app_match.end()] + metrics_block + "\n" + s[app_match.end():]

for marker in ("app.get('/api/setup/status'", "app.get('/api/metrics'"):
    if marker not in s:
        raise SystemExit(f'missing required existing marker: {marker}')
if not first_user_route_re.search(s):
    raise SystemExit('missing final setup marker: first-user route')
if "Bitte zuerst einen Web-Benutzer anlegen." not in s:
    raise SystemExit('missing final setup marker: first-user gate')

backend.write_text(s, encoding='utf-8')
print('first-user route + bootstrap API lock applied without duplicating setup routes')
