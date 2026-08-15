#!/usr/bin/env python3
from pathlib import Path

backend = Path('/opt/radiobot/backend/src/index.ts')
s = backend.read_text(encoding='utf-8')

helpers = """const TS3_CONTROL_FILE = '/var/lib/radiobot/ts3-control.json';
const TS3_STATUS_FILE = '/var/lib/radiobot/ts3-status.json';
const TS3_ENV_FILE = '/etc/radiobot/ts3.env';
function ts3Enabled() { return fs.existsSync(TS3_ENV_FILE); }
function readTs3Status() { try { return JSON.parse(fs.readFileSync(TS3_STATUS_FILE, 'utf8')); } catch { return { enabled: ts3Enabled(), connected: false, host: '', channel: '', paused: false, volume: 80, queue: [] }; } }
function writeTs3Command(command: any) {
  const tmp = `${TS3_CONTROL_FILE}.${process.pid}.tmp`;
  let queue: any[] = [];
  try {
    if (fs.existsSync(TS3_CONTROL_FILE)) {
      const raw = JSON.parse(fs.readFileSync(TS3_CONTROL_FILE, 'utf8'));
      queue = Array.isArray(raw) ? raw : [raw];
    }
  } catch { queue = []; }
  queue.push({ id: crypto.randomUUID(), ...command });
  fs.writeFileSync(tmp, JSON.stringify(queue), { mode: 0o600 });
  fs.renameSync(tmp, TS3_CONTROL_FILE);
  return { ok: true };
}
"""
marker = "app.get('/api/health', async () => ({ ok: true, discord: client.isReady(), version: '2.0.0', youtube: fs.existsSync(YTDLP), spotify: Boolean(spotify.refreshToken) }));"
if 'function ts3Enabled()' not in s:
    if marker not in s:
        raise SystemExit('health route marker missing')
    s = s.replace(marker, helpers + marker, 1)

needle = "app.post<{ Body: { action: string; input?: string; label?: string; volume?: number } }>('/api/instances/ts3/control', async req => { if (!ts3Enabled()) throw new Error('TeamSpeak 3 ist nicht aktiviert.'); const allowed = new Set(['play','queue','skip','pause','resume','stop','volume']); if (!allowed.has(req.body.action)) throw new Error('Ungültiger TS3-Befehl.'); return writeTs3Command(req.body); });"
addition = needle + "\napp.post<{ Params: { id: string }; Body: { append?: boolean } }>('/api/instances/ts3/playlist/:id', async req => { if (!ts3Enabled()) throw new Error('TeamSpeak 3 ist nicht aktiviert.'); const p = db.playlists.find(x => x.id === req.params.id); if (!p) throw new Error('Playlist nicht gefunden.'); if (!p.items.length) throw new Error('Playlist ist leer.'); const start = !req.body.append; if (start) writeTs3Command({ action: 'stop' }); for (const [index, item] of p.items.entries()) writeTs3Command({ action: start && index === 0 ? 'play' : 'queue', input: item.value, label: item.label }); return { ok: true, name: p.name, count: p.items.length }; });"
if "'/api/instances/ts3/playlist/:id'" not in s:
    if needle not in s:
        raise SystemExit('TS3 control route marker missing')
    s = s.replace(needle, addition, 1)
backend.write_text(s, encoding='utf-8')
print('instance routing applied')
