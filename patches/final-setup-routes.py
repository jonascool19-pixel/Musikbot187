#!/usr/bin/env python3
from pathlib import Path

p = Path('/opt/radiobot/backend/src/index.ts')
s = p.read_text(encoding='utf-8')

if "const SETUP_TOKEN = process.env.SETUP_TOKEN ?? '';" not in s:
    s = s.replace("const DISCORD_CONTROL_ROLE = process.env.DISCORD_CONTROL_ROLE ?? '';", "const DISCORD_CONTROL_ROLE = process.env.DISCORD_CONTROL_ROLE ?? '';\nconst YOUTUBE_API_KEY = process.env.YOUTUBE_API_KEY ?? '';\nconst SETUP_TOKEN = process.env.SETUP_TOKEN ?? '';", 1)

route_block = r'''app.get('/api/setup/status', async () => ({
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
'''

if "app.get('/api/setup/status'" not in s:
    anchor = "app.get('/api/health'"
    if anchor not in s:
        raise SystemExit('health anchor not found')
    s = s.replace(anchor, route_block + "\n" + anchor, 1)

metrics_block = "app.get('/api/metrics', async (_req, reply) => { const file = '/var/lib/radiobot/metrics.json'; if (!fs.existsSync(file)) return reply.send({ ok: true, cpu: 0, memory: { used: 0, total: 0 }, disk: { used: 0, total: 0 }, network: { rxBytes: 0, txBytes: 0 } }); try { return JSON.parse(fs.readFileSync(file, 'utf8')); } catch { return reply.code(503).send({ error: 'Metrics nicht verfügbar' }); } });"
if "app.get('/api/metrics'" not in s:
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
if "app.get('/api/metrics'" not in s:
    raise SystemExit('final metrics route insertion failed')

p.write_text(s, encoding='utf-8')
print('final setup + metrics + system route patch applied')
