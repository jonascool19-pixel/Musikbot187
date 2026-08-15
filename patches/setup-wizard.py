#!/usr/bin/env python3
from pathlib import Path

p = Path('/opt/radiobot/backend/src/index.ts')
s = p.read_text(encoding='utf-8')

if "const SETUP_TOKEN = process.env.SETUP_TOKEN ?? '';" not in s:
    marker = "const DISCORD_CONTROL_ROLE = process.env.DISCORD_CONTROL_ROLE ?? '';"
    if marker in s:
        s = s.replace(marker, marker + "\nconst SETUP_TOKEN = process.env.SETUP_TOKEN ?? '';", 1)

old = "app.addHook('preHandler', async (req, reply) => { if (req.url.startsWith('/api/') && !req.url.startsWith('/api/spotify/callback') && !auth(req, reply)) return reply; });"
new = "app.addHook('preHandler', async (req, reply) => { const openSetup = req.url === '/api/setup/status' || req.url === '/api/setup/user'; if (req.url === '/api/setup' && !WEB_PASSWORD) return reply.code(403).send('Bitte zuerst einen Web-Benutzer anlegen.'); if (req.url.startsWith('/api/') && !openSetup && !req.url.startsWith('/api/spotify/callback') && !auth(req, reply)) return reply; });"
if old in s:
    s = s.replace(old, new, 1)
elif new not in s:
    raise SystemExit('API auth hook marker missing')

insert = r'''app.post<{ Body: { setupToken?: string; webUser?: string; webPassword?: string; } }>('/api/setup/user', async (req, reply) => {
  const b = req.body ?? {};
  if (WEB_PASSWORD) return reply.code(409).send('Der Web-Benutzer wurde bereits angelegt.');
  if (!SETUP_TOKEN || b.setupToken !== SETUP_TOKEN) return reply.code(403).send('Ungültiger Ersteinrichtungs-Code.');
  const username = b.webUser?.trim() || '';
  const password = b.webPassword ?? '';
  if (!username) return reply.code(400).send('Benutzername ist erforderlich.');
  if (username.length > 64) return reply.code(400).send('Benutzername ist zu lang.');
  if (password.length < 12) return reply.code(400).send('Das Web-Passwort muss mindestens 12 Zeichen haben.');
  const payload = JSON.stringify({ discordToken: process.env.DISCORD_TOKEN ?? '', webUser: username, webPassword: password, spotifyClientId: SPOTIFY_CLIENT_ID, spotifyClientSecret: SPOTIFY_CLIENT_SECRET, spotifyRedirectUri: SPOTIFY_REDIRECT_URI, youtubeApiKey: process.env.YOUTUBE_API_KEY ?? '', discordControlRole: DISCORD_CONTROL_ROLE, publicUrl: '', port: PORT, setupToken: SETUP_TOKEN });
  await privilegedConfigWrite(payload);
  return { ok: true, message: 'Benutzer erstellt. Der Server startet jetzt neu. Danach meldest du dich mit diesem Benutzer an und schließt die Ersteinrichtung ab.' };
});
'''
if "app.post('/api/setup/user'" not in s:
    anchor = "app.get('/api/setup/status'"
    if anchor not in s:
        anchor = "app.get('/api/health'"
    if anchor not in s:
        raise SystemExit('setup insertion anchor missing')
    s = s.replace(anchor, insert + "\n" + anchor, 1)

if "app.post('/api/setup/user'" not in s:
    raise SystemExit('first-user route was not inserted')

p.write_text(s, encoding='utf-8')
print('setup wizard patch applied: first web user required before setup')
