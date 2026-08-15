#!/usr/bin/env python3
from pathlib import Path
import os
import subprocess

ROOT = Path('/opt/radiobot')
backend = ROOT / 'backend/src/index.ts'
metrics = ROOT / 'scripts/system-metrics.py'
metrics_js = ROOT / 'frontend/metrics-panel.js'
app_js = ROOT / 'frontend/app.js'
s = backend.read_text(encoding='utf-8')

def rep(old, new, label, required=True):
    global s
    if old in s:
        s = s.replace(old, new, 1)
    elif required:
        raise SystemExit(f'missing hardening marker: {label}')

rep("await app.register(cors, { origin: true });", "await app.register(cors, { origin: false });", "cors")
rep("const YTDLP = process.env.YTDLP_PATH ?? '/usr/local/bin/yt-dlp';", "const YTDLP = process.env.YTDLP_PATH ?? '/usr/local/bin/yt-dlp';\nconst REQUEST_LIMIT = 240;\nconst RATE_WINDOW_MS = 60_000;\nconst requestBuckets = new Map<string, { start: number; count: number }>();\nconst playLocks = new Map<string, Promise<void>>();", "security state")
rep("function loadJson<T>(file: string, fallback: T): T { try { return JSON.parse(fs.readFileSync(file, 'utf8')) as T; } catch { return fallback; } }", "function loadJson<T>(file: string, fallback: T): T { try { return JSON.parse(fs.readFileSync(file, 'utf8')) as T; } catch (error) { try { if (fs.existsSync(file)) fs.renameSync(file, `${file}.corrupt-${Date.now()}`); } catch {} console.error(`Invalid JSON in ${file}; preserved corrupt file`, error); return fallback; } }", "loadJson")
rep("function saveJson(file: string, value: unknown) { fs.writeFileSync(file, JSON.stringify(value, null, 2), { mode: 0o600 }); }", "function saveJson(file: string, value: unknown) { const tmp = `${file}.${process.pid}.tmp`; fs.writeFileSync(tmp, JSON.stringify(value, null, 2), { mode: 0o600 }); fs.renameSync(tmp, file); }", "saveJson")
rep("function auth(req: any, reply: any) {\n  if (!WEB_PASSWORD) return true;\n  const h = String(req.headers.authorization ?? '');\n  if (!h.startsWith('Basic ')) { reply.header('WWW-Authenticate', 'Basic realm=\"RadioBot\"').code(401).send('Authentication required'); return false; }\n  const d = Buffer.from(h.slice(6), 'base64').toString('utf8'); const i = d.indexOf(':');\n  const u = i >= 0 ? d.slice(0, i) : ''; const p = i >= 0 ? d.slice(i + 1) : '';\n  if (u !== WEB_USER || p !== WEB_PASSWORD) { reply.header('WWW-Authenticate', 'Basic realm=\"RadioBot\"').code(401).send('Invalid credentials'); return false; }\n  return true;\n}", "function auth(req: any, reply: any) {\n  if (!WEB_PASSWORD) { reply.code(503).send('Web authentication is not configured'); return false; }\n  const origin = String(req.headers.origin ?? '');\n  if (origin) { const host = String(req.headers.host ?? ''); if (origin !== `http://${host}` && origin !== `https://${host}`) { reply.code(403).send('Origin not allowed'); return false; } }\n  const h = String(req.headers.authorization ?? '');\n  if (!h.startsWith('Basic ')) { reply.header('WWW-Authenticate', 'Basic realm=\"RadioBot\"').code(401).send('Authentication required'); return false; }\n  let d = ''; try { d = Buffer.from(h.slice(6), 'base64').toString('utf8'); } catch { reply.code(401).send('Invalid credentials'); return false; }\n  const i = d.indexOf(':'); const u = i >= 0 ? d.slice(0, i) : ''; const p = i >= 0 ? d.slice(i + 1) : '';\n  if (u !== WEB_USER || p !== WEB_PASSWORD) { reply.header('WWW-Authenticate', 'Basic realm=\"RadioBot\"').code(401).send('Invalid credentials'); return false; }\n  return true;\n}", "auth")
rep("const old = connections.get(guildId);\n  if (old && old.state.status !== VoiceConnectionStatus.Destroyed) return old;", "const old = connections.get(guildId);\n  if (old && [VoiceConnectionStatus.Ready, VoiceConnectionStatus.Connecting, VoiceConnectionStatus.Signalling].includes(old.state.status)) return old;\n  if (old) { try { old.destroy(); } catch {} connections.delete(guildId); }", "voice recovery")
rep("    const ffmpeg = spawn('ffmpeg', args, { stdio: ['ignore', 'pipe', 'inherit'] }); ffmpegs.set(guildId, ffmpeg);", "    const ffmpeg = spawn('ffmpeg', args, { stdio: ['ignore', 'pipe', 'inherit'] });\n    ffmpeg.once('error', error => console.error('ffmpeg spawn failed', guildId, error));\n    ffmpegs.set(guildId, ffmpeg);", "ffmpeg error")
rep("    console.error('playback failed', guildId, error); state.playing = undefined; state.playingType = undefined; saveJson(DB_FILE, db); await updateStatus(guildId); await playNext(guildId);", "    console.error('playback failed', guildId, error); state.playing = undefined; state.playingType = undefined; saveJson(DB_FILE, db); await updateStatus(guildId);", "playback recursion removal", required=False)
s = s.replace("app.get<{ Querystring: { q?: string } }>('/api/search', async req => { const q = String(req.query.q ?? '').trim(); if (!q) return { local: [], radios: [], youtube: [], spotify: [] }; return unifiedSearch(q); });", "app.get<{ Querystring: { q?: string } }>('/api/search', async (req, reply) => { const q = String(req.query.q ?? '').trim(); if (q.length > 200) return reply.code(400).send('Suchbegriff zu lang.'); if (!q) return { local: [], radios: [], youtube: [], spotify: [] }; return unifiedSearch(q); });", 1)
s = s.replace("spotifyClientId: b.spotifyClientId?.trim() ?? SPOTIFY_CLIENT_ID, spotifyClientSecret: b.spotifyClientSecret?.trim() ?? SPOTIFY_CLIENT_SECRET, spotifyRedirectUri: b.spotifyRedirectUri?.trim() ?? SPOTIFY_REDIRECT_URI, youtubeApiKey: b.youtubeApiKey?.trim() ?? YOUTUBE_API_KEY, discordControlRole: b.discordControlRole?.trim() ?? DISCORD_CONTROL_ROLE, publicUrl: b.publicUrl?.trim() || '',", "spotifyClientId: b.spotifyClientId?.trim() || SPOTIFY_CLIENT_ID, spotifyClientSecret: b.spotifyClientSecret?.trim() || SPOTIFY_CLIENT_SECRET, spotifyRedirectUri: b.spotifyRedirectUri?.trim() || SPOTIFY_REDIRECT_URI, youtubeApiKey: b.youtubeApiKey?.trim() || YOUTUBE_API_KEY, discordControlRole: b.discordControlRole?.trim() || DISCORD_CONTROL_ROLE, publicUrl: b.publicUrl?.trim() || '',", 1)
backend.write_text(s, encoding='utf-8')
metrics.write_text(metrics.read_text(encoding='utf-8').replace("OUT = Path('/opt/radiobot/frontend/metrics.json')", "OUT = Path('/var/lib/radiobot/metrics.json')", 1), encoding='utf-8')
metrics_js.write_text(metrics_js.read_text(encoding='utf-8').replace("fetch('/metrics.json'", "fetch('/api/metrics'", 1), encoding='utf-8')
old_youtube = "if (x.kind === 'youtube') { return fetch('/api/playlists', { method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify({ name:`_search_${Date.now()}`, kind:'youtube', items:[{ kind:'youtube', value:x.value, label:x.label }] }) }).then(r=>r.json()).then(p=>api(`/api/playlists/${p.id}/play/${guildId}`, { method:'POST', body:JSON.stringify({ append }) })); }"
app_text = app_js.read_text(encoding='utf-8')
if old_youtube in app_text:
    app_js.write_text(app_text.replace(old_youtube, "if (x.kind === 'youtube') return api(`/api/state/${guildId}/youtube`, { method:'POST', body:JSON.stringify({ value:x.value, label:x.label, append }) });", 1), encoding='utf-8')

# Optional standalone TeamSpeak 3 instance. Interactive installation reads from /dev/tty.
ts3_env = Path('/etc/radiobot/ts3.env')
ts3_service = Path('/etc/systemd/system/radiobot-ts3.service')
ts3_dropin = Path('/etc/systemd/system/radiobot.service.d/20-ts3.conf')

def read_tty(prompt: str, secret: bool = False, default: str = '') -> str:
    if not os.access('/dev/tty', os.R_OK | os.W_OK):
        return default
    import getpass
    try:
        if secret:
            with open('/dev/tty', 'w', encoding='utf-8') as tty:
                return getpass.getpass(prompt, stream=tty)
        with open('/dev/tty', 'r+', encoding='utf-8') as tty:
            tty.write(prompt); tty.flush(); return tty.readline().rstrip('\n')
    except Exception:
        return default

ts3_enabled = read_tty('\nTeamSpeak 3 zusätzlich aktivieren? (y/N): ').strip().lower() == 'y'
if ts3_enabled:
    while True:
        ts3_host = read_tty('TS3-Server (Hostname/IP): ').strip()
        if ts3_host: break
    ts3_nickname = read_tty('TS3-Bot-Name [MusikBot187 TS3]: ').strip() or 'MusikBot187 TS3'
    ts3_channel = read_tty('TS3-Kanal [Lobby]: ').strip() or 'Lobby'
    ts3_server_password = read_tty('TS3-Server-Passwort (leer wenn keines): ', secret=True)
    ts3_channel_password = read_tty('TS3-Kanal-Passwort (leer wenn keines): ', secret=True)
    ts3_env.parent.mkdir(parents=True, exist_ok=True)
    ts3_env.write_text(
        f'TEAMSPEAK_HOST={ts3_host}\n'
        f'TEAMSPEAK_NICKNAME={ts3_nickname}\n'
        f'TEAMSPEAK_CHANNEL={ts3_channel}\n'
        f'TEAMSPEAK_SERVER_PASSWORD={ts3_server_password}\n'
        f'TEAMSPEAK_CHANNEL_PASSWORD={ts3_channel_password}\n'
        'YTDLP_PATH=/usr/local/bin/yt-dlp\n'
        'DATA_DIR=/var/lib/radiobot\n', encoding='utf-8')
    os.chmod(ts3_env, 0o600)
    ts3_service.write_text("""[Unit]\nDescription=MusikBot187 TeamSpeak 3 Musik-Instanz\nAfter=network-online.target radiobot.service\nWants=network-online.target\n\n[Service]\nType=simple\nUser=radiobot\nGroup=radiobot\nWorkingDirectory=/opt/radiobot/backend\nEnvironmentFile=/etc/radiobot/ts3.env\nExecStart=/usr/bin/node /opt/radiobot/backend/dist/ts3-bot.js\nRestart=always\nRestartSec=5\nNoNewPrivileges=true\nPrivateTmp=true\nProtectHome=true\nProtectSystem=strict\nReadWritePaths=/var/lib/radiobot\n\n[Install]\nWantedBy=multi-user.target\n""", encoding='utf-8')
    ts3_dropin.parent.mkdir(parents=True, exist_ok=True)
    ts3_dropin.write_text("[Service]\nExecStartPost=/bin/systemctl start radiobot-ts3.service\n", encoding='utf-8')
    print('TeamSpeak 3 Instanz aktiviert.')
else:
    try: ts3_dropin.unlink()
    except FileNotFoundError: pass
    try: subprocess.run(['systemctl', 'disable', '--now', 'radiobot-ts3.service'], check=False, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
    except Exception: pass

print('final hardening applied')
