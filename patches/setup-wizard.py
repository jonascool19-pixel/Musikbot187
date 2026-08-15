#!/usr/bin/env python3
from pathlib import Path

p = Path('/opt/radiobot/backend/src/index.ts')
s = p.read_text(encoding='utf-8')

if "const SETUP_TOKEN = process.env.SETUP_TOKEN ?? '';" not in s:
    s = s.replace("const DISCORD_CONTROL_ROLE = process.env.DISCORD_CONTROL_ROLE ?? '';", "const DISCORD_CONTROL_ROLE = process.env.DISCORD_CONTROL_ROLE ?? '';\nconst YOUTUBE_API_KEY = process.env.YOUTUBE_API_KEY ?? '';\nconst SETUP_TOKEN = process.env.SETUP_TOKEN ?? '';\nconst CONFIG_HELPER = '/usr/local/sbin/radiobot-configure';", 1)

old = "app.addHook('preHandler', async (req, reply) => { if (req.url.startsWith('/api/') && !req.url.startsWith('/api/spotify/callback') && !auth(req, reply)) return reply; });"
new = "app.addHook('preHandler', async (req, reply) => { const openSetup = req.url.startsWith('/api/setup'); if (req.url.startsWith('/api/') && !openSetup && !req.url.startsWith('/api/spotify/callback') && !auth(req, reply)) return reply; });"
if old in s:
    s = s.replace(old, new, 1)

insert = r'''app.get('/api/setup/status', async () => ({
  configured: Boolean(process.env.DISCORD_TOKEN),
  requiresSetup: Boolean(SETUP_TOKEN) || !Boolean(process.env.DISCORD_TOKEN),
  spotifyConfigured: Boolean(SPOTIFY_CLIENT_ID && SPOTIFY_CLIENT_SECRET),
  youtubeConfigured: Boolean(YOUTUBE_API_KEY),
  webConfigured: Boolean(WEB_PASSWORD),
  webUser: WEB_USER,
  port: PORT
}));
app.post<{ Body: { setupToken?: string; discordToken?: string; webUser?: string; webPassword?: string; spotifyClientId?: string; spotifyClientSecret?: string; spotifyRedirectUri?: string; youtubeApiKey?: string; discordControlRole?: string; publicUrl?: string; port?: number } }>('/api/setup', async (req, reply) => {
  const b = req.body ?? {};
  if (!SETUP_TOKEN || b.setupToken !== SETUP_TOKEN) return reply.code(403).send('Ungültiger Ersteinrichtungs-Code.');
  if (!b.discordToken?.trim()) return reply.code(400).send('Discord Bot Token ist erforderlich.');
  if (!b.webPassword || b.webPassword.length < 12) return reply.code(400).send('Das Web-Passwort muss mindestens 12 Zeichen haben.');
  const payload = JSON.stringify({ discordToken: b.discordToken.trim(), webUser: b.webUser?.trim() || 'admin', webPassword: b.webPassword, spotifyClientId: b.spotifyClientId?.trim() || '', spotifyClientSecret: b.spotifyClientSecret?.trim() || '', spotifyRedirectUri: b.spotifyRedirectUri?.trim() || '', youtubeApiKey: b.youtubeApiKey?.trim() || '', discordControlRole: b.discordControlRole?.trim() || '', publicUrl: b.publicUrl?.trim() || '', port: Number(b.port || PORT), setupToken: '' });
  await privilegedConfigWrite(payload);
  return { ok: true, message: 'Einrichtung gespeichert. MusikBot187 startet jetzt neu.' };
});
app.get('/api/settings', async () => ({ webUser: WEB_USER, port: PORT, spotifyConfigured: Boolean(SPOTIFY_CLIENT_ID && SPOTIFY_CLIENT_SECRET), youtubeConfigured: Boolean(YOUTUBE_API_KEY), controlRole: DISCORD_CONTROL_ROLE, redirectUri: SPOTIFY_REDIRECT_URI }));
app.post<{ Body: { discordToken?: string; webUser?: string; webPassword?: string; spotifyClientId?: string; spotifyClientSecret?: string; spotifyRedirectUri?: string; youtubeApiKey?: string; discordControlRole?: string; publicUrl?: string; port?: number } }>('/api/settings', async (req, reply) => {
  const b = req.body ?? {};
  if (b.webPassword !== undefined && b.webPassword !== '' && b.webPassword.length < 12) return reply.code(400).send('Das Web-Passwort muss mindestens 12 Zeichen haben.');
  const payload = JSON.stringify({ discordToken: b.discordToken?.trim() || undefined, webUser: b.webUser?.trim() || WEB_USER, webPassword: b.webPassword ?? WEB_PASSWORD, spotifyClientId: b.spotifyClientId?.trim() || SPOTIFY_CLIENT_ID, spotifyClientSecret: b.spotifyClientSecret?.trim() || SPOTIFY_CLIENT_SECRET, spotifyRedirectUri: b.spotifyRedirectUri?.trim() || SPOTIFY_REDIRECT_URI, youtubeApiKey: b.youtubeApiKey?.trim() || YOUTUBE_API_KEY, discordControlRole: b.discordControlRole?.trim() || DISCORD_CONTROL_ROLE, publicUrl: b.publicUrl?.trim() || '', port: Number(b.port || PORT), setupToken: '' });
  await privilegedConfigWrite(payload);
  return { ok: true, message: 'Einstellungen gespeichert. MusikBot187 startet jetzt neu.' };
});
'''

if "app.get('/api/setup/status'" not in s:
    anchor = "app.post('/api/update', async (_req, reply) =>"
    if anchor not in s:
        anchor = "app.get('/api/health'"
    if anchor not in s:
        raise SystemExit('route anchor not found')
    s = s.replace(anchor, insert + "\n" + anchor, 1)

if "app.get('/api/setup/status'" not in s:
    raise SystemExit('setup route was not inserted into generated backend')

p.write_text(s, encoding='utf-8')
print('setup wizard patch applied and verified')
