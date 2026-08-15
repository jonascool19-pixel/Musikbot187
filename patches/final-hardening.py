#!/usr/bin/env python3
from pathlib import Path
ROOT=Path('/opt/radiobot')
backend=ROOT/'backend/src/index.ts'; metrics=ROOT/'scripts/system-metrics.py'; metrics_js=ROOT/'frontend/metrics-panel.js'; app_js=ROOT/'frontend/app.js'
s=backend.read_text(encoding='utf-8')
s=s.replace("await app.register(cors, { origin: true });","await app.register(cors, { origin: false });",1)
s=s.replace("function saveJson(file: string, value: unknown) { fs.writeFileSync(file, JSON.stringify(value, null, 2), { mode: 0o600 }); }","function saveJson(file: string, value: unknown) { const tmp = `${file}.${process.pid}.tmp`; fs.writeFileSync(tmp, JSON.stringify(value, null, 2), { mode: 0o600 }); fs.renameSync(tmp, file); }",1)
s=s.replace("  activePlaylistId?: string; repeatMode: 'off' | 'one' | 'all'; shuffle: boolean; lastItem?: QueueItem;\n};","  activePlaylistId?: string; repeatMode: 'off' | 'one' | 'all'; shuffle: boolean; lastItem?: QueueItem; manualStop?: boolean;\n};",1)
s=s.replace("s.shuffle ??= false; return s;","s.shuffle ??= false; s.manualStop ??= false; return s;",1)
s=s.replace("player.on(AudioPlayerStatus.Idle, () => { ffmpegs.get(guildId)?.kill('SIGTERM'); ffmpegs.delete(guildId); playNext(guildId).catch(console.error); });","player.on(AudioPlayerStatus.Idle, () => { ffmpegs.get(guildId)?.kill('SIGTERM'); ffmpegs.delete(guildId); const state = guildState(guildId); if (state.manualStop) { state.manualStop = false; saveJson(DB_FILE, db); updateStatus(guildId).catch(() => undefined); return; } playNext(guildId).catch(console.error); });",1)
s=s.replace("const state = guildState(guildId); state.queue = []; state.playing = undefined; state.playingType = undefined; state.currentPlaylist = undefined;","const state = guildState(guildId); state.manualStop = true; state.queue = []; state.playing = undefined; state.playingType = undefined; state.currentPlaylist = undefined; state.activePlaylistId = undefined; state.lastItem = undefined;",1)
s=s.replace("state.playing = item.label; state.playingType = item.kind;","state.lastItem = { ...item }; state.playing = item.label; state.playingType = item.kind;",1)
if '/api/metrics' not in s:
    marker="app.get('/api/health', async () => ({ ok: true, discord: client.isReady(), version: '2.0.0', youtube: fs.existsSync(YTDLP), spotify: Boolean(spotify.refreshToken) }));"
    s=s.replace(marker, marker+"\napp.get('/api/metrics', async (_req, reply) => { const file = path.join(DATA_DIR, 'metrics.json'); if (!fs.existsSync(file)) return reply.code(404).send({ error: 'metrics unavailable' }); return JSON.parse(fs.readFileSync(file, 'utf8')); });",1)
s=s.replace("['📻 **RadioBot Status**'","['📻 **MusikBot187 Status**'",1)
backend.write_text(s,encoding='utf-8')
metrics.write_text(metrics.read_text(encoding='utf-8').replace("OUT = Path('/opt/radiobot/frontend/metrics.json')","OUT = Path('/var/lib/radiobot/metrics.json')",1),encoding='utf-8')
metrics_js.write_text(metrics_js.read_text(encoding='utf-8').replace("fetch('/metrics.json'","fetch('/api/metrics'",1),encoding='utf-8')
old="if (x.kind === 'youtube') { return fetch('/api/playlists', { method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify({ name:`_search_${Date.now()}`, kind:'youtube', items:[{ kind:'youtube', value:x.value, label:x.label }] }) }).then(r=>r.json()).then(p=>api(`/api/playlists/${p.id}/play/${guildId}`, { method:'POST', body:JSON.stringify({ append }) })); }"
new="if (x.kind === 'youtube') return api(`/api/state/${guildId}/youtube`, { method:'POST', body:JSON.stringify({ value:x.value, label:x.label, append }) });"
app_js.write_text(app_js.read_text(encoding='utf-8').replace(old,new,1),encoding='utf-8')
helper=Path('/usr/local/sbin/radiobot-configure')
if helper.exists():
    c=helper.read_text(encoding='utf-8').replace("        current[key]=value\n","        if key in {'WEB_PASSWORD','SPOTIFY_CLIENT_SECRET','YOUTUBE_API_KEY','DISCORD_TOKEN'} and value == '' and current.get(key):\n            continue\n        current[key]=value\n",1)
    helper.write_text(c,encoding='utf-8')
print('final hardening applied')
