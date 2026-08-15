#!/usr/bin/env python3
from pathlib import Path
import re

ROOT = Path('/opt/radiobot')
backend = ROOT / 'backend/src/index.ts'
s = backend.read_text(encoding='utf-8')

# Ensure constants exist without depending on an exact earlier patch layout.
if "const YOUTUBE_API_KEY = process.env.YOUTUBE_API_KEY ?? '';" not in s:
    anchor = "const DISCORD_CONTROL_ROLE = process.env.DISCORD_CONTROL_ROLE ?? '';"
    if anchor not in s:
        raise SystemExit('security constants anchor missing')
    s = s.replace(anchor, anchor + "\nconst YOUTUBE_API_KEY = process.env.YOUTUBE_API_KEY ?? '';", 1)
if "const SETUP_TOKEN = process.env.SETUP_TOKEN ?? '';" not in s:
    anchor = "const YOUTUBE_API_KEY = process.env.YOUTUBE_API_KEY ?? '';"
    if anchor not in s:
        anchor = "const DISCORD_CONTROL_ROLE = process.env.DISCORD_CONTROL_ROLE ?? '';"
    if anchor not in s:
        raise SystemExit('setup token anchor missing')
    s = s.replace(anchor, anchor + "\nconst SETUP_TOKEN = process.env.SETUP_TOKEN ?? '';", 1)

STATUS_ROUTE = r'''app.get('/api/setup/status', async () => ({
  configured: Boolean(process.env.DISCORD_TOKEN),
  requiresSetup: Boolean(SETUP_TOKEN) || !Boolean(process.env.DISCORD_TOKEN),
  requiresUserCreation: !Boolean(WEB_PASSWORD),
  spotifyConfigured: Boolean(SPOTIFY_CLIENT_ID && SPOTIFY_CLIENT_SECRET),
  youtubeConfigured: Boolean(YOUTUBE_API_KEY),
  webConfigured: Boolean(WEB_PASSWORD),
  webUser: WEB_USER,
  port: PORT
}));'''

USER_ROUTE = r'''app.post<{ Body: { setupToken?: string; webUser?: string; webPassword?: string } }>('/api/setup/user', async (req, reply) => {
  const b = req.body ?? {};
  if (WEB_PASSWORD) return reply.code(409).send('Der Web-Benutzer wurde bereits angelegt.');
  if (!SETUP_TOKEN || b.setupToken !== SETUP_TOKEN) return reply.code(403).send('Ungültiger Ersteinrichtungs-Code.');
  const username = b.webUser?.trim() || '';
  const password = b.webPassword ?? '';
  if (!username) return reply.code(400).send('Benutzername ist erforderlich.');
  if (username.length > 64) return reply.code(400).send('Benutzername ist zu lang.');
  if (password.length < 12) return reply.code(400).send('Das Web-Passwort muss mindestens 12 Zeichen haben.');
  const payload = JSON.stringify({ bootstrapUserOnly: true, webUser: username, webPassword: password, setupToken: SETUP_TOKEN });
  await privilegedConfigWrite(payload);
  return { ok: true, message: 'Benutzer erstellt. Der Server startet jetzt neu. Danach meldest du dich mit diesem Benutzer an und schließt die Ersteinrichtung ab.' };
});'''

SETUP_ROUTE = r'''app.post<{ Body: { setupToken?: string; discordToken?: string; webUser?: string; webPassword?: string; spotifyClientId?: string; spotifyClientSecret?: string; spotifyRedirectUri?: string; youtubeApiKey?: string; discordControlRole?: string; publicUrl?: string; port?: number } }>('/api/setup', async (req, reply) => {
  const b = req.body ?? {};
  if (!SETUP_TOKEN || b.setupToken !== SETUP_TOKEN) return reply.code(403).send('Ungültiger Ersteinrichtungs-Code.');
  if (!WEB_PASSWORD) return reply.code(403).send('Bitte zuerst einen Web-Benutzer anlegen.');
  if (!b.discordToken?.trim()) return reply.code(400).send('Discord Bot Token ist erforderlich.');
  if (!b.webPassword || b.webPassword.length < 12) return reply.code(400).send('Das Web-Passwort muss mindestens 12 Zeichen haben.');
  const payload = JSON.stringify({ discordToken: b.discordToken.trim(), webUser: WEB_USER || 'admin', webPassword: b.webPassword, spotifyClientId: b.spotifyClientId?.trim() || '', spotifyClientSecret: b.spotifyClientSecret?.trim() || '', spotifyRedirectUri: b.spotifyRedirectUri?.trim() || '', youtubeApiKey: b.youtubeApiKey?.trim() || '', discordControlRole: b.discordControlRole?.trim() || '', publicUrl: b.publicUrl?.trim() || '', port: Number(b.port || PORT), setupToken: '' });
  await privilegedConfigWrite(payload);
  return { ok: true, message: 'Einrichtung gespeichert. MusikBot187 startet jetzt neu.' };
});'''

# Insert the status route if absent.
if "app.get('/api/setup/status'" not in s:
    anchor = next((a for a in ["app.get('/api/metrics'", "app.get('/api/health'", "app.get('/api/instances'"] if a in s), None)
    if not anchor:
        raise SystemExit('no stable route anchor found for setup status')
    s = s.replace(anchor, STATUS_ROUTE + "\n" + anchor, 1)

# Insert the bootstrap user route if absent. This is intentionally independent of
# the exact formatting/location of any existing /api/setup route.
if "app.post('/api/setup/user'" not in s and 'app.post<{ Body: { setupToken?: string; webUser?: string; webPassword?: string } }>(\'/api/setup/user\'' not in s:
    anchor = next((a for a in ["app.post('/api/setup'", "app.get('/api/metrics'", "app.get('/api/health'", "app.get('/api/instances'"] if a in s), None)
    if not anchor:
        raise SystemExit('no stable route anchor found for first-user route')
    s = s.replace(anchor, USER_ROUTE + "\n" + anchor, 1)

# Replace the main setup route only when present; otherwise add it after the user route.
if "app.post('/api/setup'" in s:
    setup_match = re.search(r"app\.post(?:<[^>]+>)?\('/api/setup'", s)
    if setup_match:
        start = setup_match.start()
        next_route = re.search(r"\napp\.(?:get|post|put|delete)(?:<[^>]+>)?\(", s[start + 1:])
        if next_route:
            end = start + 1 + next_route.start()
            # Do not replace the bootstrap user route if the regex starts before it.
            existing_segment = s[start:end]
            if "'/api/setup/user'" not in existing_segment:
                s = s[:start] + SETUP_ROUTE + "\n" + s[end:]
elif "app.post('/api/setup'" not in s:
    anchor = next((a for a in ["app.get('/api/metrics'", "app.get('/api/health'", "app.get('/api/instances'"] if a in s), None)
    if not anchor:
        raise SystemExit('no stable route anchor found for setup route')
    s = s.replace(anchor, SETUP_ROUTE + "\n" + anchor, 1)

# Normalize the API auth hook without depending on its exact previous formatting.
new_hook = "app.addHook('preHandler', async (req, reply) => { const openSetup = req.url === '/api/setup/status' || req.url === '/api/setup/user'; if (req.url === '/api/setup' && !WEB_PASSWORD) return reply.code(403).send('Bitte zuerst einen Web-Benutzer anlegen.'); if (req.url.startsWith('/api/') && !openSetup && !req.url.startsWith('/api/spotify/callback') && !auth(req, reply)) return reply; });"
hook = re.search(r"app\.addHook\('preHandler'.*?\n", s)
if hook:
    s = s[:hook.start()] + new_hook + "\n" + s[hook.end():]

if "app.post('/api/setup/user'" not in s:
    raise SystemExit("first-user route insertion failed")
if "app.get('/api/setup/status'" not in s:
    raise SystemExit("setup status insertion failed")
if "Bitte zuerst einen Web-Benutzer anlegen." not in s:
    raise SystemExit("first-user gate insertion failed")

backend.write_text(s, encoding='utf-8')
print('final setup routes applied (idempotent)')
