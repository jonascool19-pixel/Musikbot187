#!/usr/bin/env bash
set -euo pipefail
[[ $EUID -eq 0 ]] || { echo 'Bitte mit sudo/root ausführen.' >&2; exit 1; }
apt-get update
DEBIAN_FRONTEND=noninteractive apt-get install -y curl python3
BASE="$(mktemp)"
trap 'rm -f "$BASE"' EXIT
curl -fsSL https://raw.githubusercontent.com/jonascool19-pixel/radiobot/main/install-playback-ui-fix.sh -o "$BASE"
chmod +x "$BASE"
bash "$BASE"

python3 - <<'PY'
from pathlib import Path
import re

# Backend: enrich current playback state with artwork + start time + media type.
p = Path('/opt/radiobot/backend/src/discord.ts')
s = p.read_text()
old = """  current?: any;\n  ffmpeg?: ChildProcessWithoutNullStreams;"""
new = """  current?: any;\n  currentStartedAt = 0;\n  ffmpeg?: ChildProcessWithoutNullStreams;"""
if old not in s:
    raise SystemExit('discord current field target not found')
s = s.replace(old, new, 1)

old = """    const title = await mediaTitle(input);\n    const item = { input, title };"""
new = """    const title = await mediaTitle(input);\n    const image = /^https?:\\/\\/(?:www\\.)?(?:youtube\\.com\\/watch\\?v=|youtu\\.be\\/)/i.test(input)\n      ? (() => { const m = input.match(/(?:v=|youtu\\.be\\/)([A-Za-z0-9_-]{6,})/i); return m ? `https://i.ytimg.com/vi/${m[1]}/hqdefault.jpg` : null; })()\n      : null;\n    const item = { input, title, image, kind: /^https?:\\/\\//i.test(input) ? 'stream' : 'music' };"""
if old not in s:
    raise SystemExit('discord add target not found')
s = s.replace(old, new, 1)

old = """    this.current = item;\n    try {"""
new = """    this.current = item;\n    this.currentStartedAt = Date.now();\n    try {"""
if old not in s:
    raise SystemExit('discord current start target not found')
s = s.replace(old, new, 1)

old = """      this.ffmpeg = undefined;\n      this.current = undefined;"""
new = """      this.ffmpeg = undefined;\n      this.current = undefined;\n      this.currentStartedAt = 0;"""
if old not in s:
    raise SystemExit('discord current cleanup target not found')
s = s.replace(old, new, 1)

old = """    return { id:this.cfg.id, name:this.cfg.name, type:'discord', enabled:this.isEnabled(), connected:this.connected, playing:this.current?.title ?? null, queue:this.queue.map(x=>x.title), volume:this.volume, error:this.lastError||null, logs:[...this.logs], inviteUrl:this.inviteUrl||this.buildInviteUrl()||null, botUser:this.client.user?.tag??null, guilds, voiceChannels:this.listVoiceChannels() };"""
new = """    return { id:this.cfg.id, name:this.cfg.name, type:'discord', enabled:this.isEnabled(), connected:this.connected, playing:this.current?.title ?? null, current:this.current ? { title:this.current.title, image:this.current.image ?? null, kind:this.current.kind ?? 'music', startedAt:this.currentStartedAt, input:this.current.input } : null, queue:this.queue.map(x=>x.title), volume:this.volume, error:this.lastError||null, logs:[...this.logs], inviteUrl:this.inviteUrl||this.buildInviteUrl()||null, botUser:this.client.user?.tag??null, guilds, voiceChannels:this.listVoiceChannels() };"""
if old not in s:
    raise SystemExit('discord state target not found')
s = s.replace(old, new, 1)
p.write_text(s)

# Backend: allow /api/play to pass optional artwork metadata through add().
idx = Path('/opt/radiobot/backend/src/index.ts')
s = idx.read_text()
old = "app.post('/api/play', async (request: any, reply: any) => { const user = auth(request, reply); if (!user) return; const active = bot(); if (!active) return reply.code(400).send({ error: 'Keine aktive Instanz.' }); const b = request.body ?? {}; try { const item = await active.add(String(b.input ?? b.url ?? b.search ?? ''), Boolean(b.playNow)); return { ok: true, item }; } catch (e) { return reply.code(400).send({ error: e instanceof Error ? e.message : String(e) }); } });"
new = "app.post('/api/play', async (request: any, reply: any) => { const user = auth(request, reply); if (!user) return; const active = bot(); if (!active) return reply.code(400).send({ error: 'Keine aktive Instanz.' }); const b = request.body ?? {}; try { const item = await active.add(String(b.input ?? b.url ?? b.search ?? ''), Boolean(b.playNow)); if (b.image && item) item.image = String(b.image); if (b.kind && item) item.kind = String(b.kind); return { ok: true, item }; } catch (e) { return reply.code(400).send({ error: e instanceof Error ? e.message : String(e) }); } });"
if old in s:
    s = s.replace(old, new, 1)
idx.write_text(s)

# Frontend: dashboard lock + richer now-playing card + playlist start JSON body.
app = Path('/opt/radiobot/frontend/app.js')
text = app.read_text()
text = text.replace("window.playPlaylist=async id=>{try{await api(`/api/playlist/${id}/play`,{method:'POST'});notify('Playlist gestartet.','success');await load();}catch(error){notify(error.message,'error');}};", "window.playPlaylist=async id=>{try{await api(`/api/playlist/${id}/play`,{method:'POST',body:'{}'});notify('Playlist gestartet.','success');await load();}catch(error){notify(error.message,'error');}};")
app.write_text(text)

# Create a standalone dashboard enhancer so future app.js changes won't reintroduce the lock/UI behavior.
front = Path('/opt/radiobot/frontend/dashboard-enhancements.js')
front.write_text(r'''(() => {
  const STYLE='dashboard-enhancements-style';
  const esc=v=>String(v??'').replace(/[&<>\"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','\"':'&quot;',"'":'&#39;'}[c]));
  let editMode=false;
  function style(){
    if(document.getElementById(STYLE))return;
    const s=document.createElement('style');s.id=STYLE;s.textContent=`
      #dashboardEditControls{display:flex;justify-content:flex-end;gap:8px;margin:0 0 10px}
      .dashboard-grid.dashboard-locked .tile{cursor:default}
      .dashboard-grid.dashboard-locked .tile[draggable="true"]{user-select:auto}
      .dashboard-grid.dashboard-editing .tile{outline:1px dashed rgba(255,255,255,.18);cursor:grab}
      .dashboard-now-art{width:74px;height:74px;border-radius:14px;object-fit:cover;background:rgba(255,255,255,.06);flex:none}
      .dashboard-now-row{display:flex;gap:14px;align-items:center}
      .dashboard-now-kicker{font-size:.8rem;opacity:.62;margin-bottom:3px}
      .dashboard-now-time{font-variant-numeric:tabular-nums;opacity:.72}
    `;document.head.appendChild(s);
  }
  const fmt=sec=>{sec=Math.max(0,Math.floor(Number(sec)||0));const m=Math.floor(sec/60),s=String(sec%60).padStart(2,'0');return `${m}:${s}`;};
  function lock(){const grid=document.querySelector('#grid');if(!grid)return;grid.classList.toggle('dashboard-editing',editMode);grid.classList.toggle('dashboard-locked',!editMode);grid.querySelectorAll('.tile').forEach(tile=>{tile.setAttribute('draggable',editMode?'true':'false');});}
  function controls(){if(!document.querySelector('#dashboardEditControls')){const c=document.createElement('div');c.id='dashboardEditControls';const b=document.createElement('button');b.type='button';b.textContent=editMode?'Bearbeiten beenden':'Dashboard bearbeiten';b.onclick=()=>{editMode=!editMode;b.textContent=editMode?'Bearbeiten beenden':'Dashboard bearbeiten';lock();};c.appendChild(b);const content=document.querySelector('#content');content?.prepend(c);}else{const b=document.querySelector('#dashboardEditControls button');if(b)b.textContent=editMode?'Bearbeiten beenden':'Dashboard bearbeiten';}}
  function hookDrag(){const grid=document.querySelector('#grid');if(!grid||grid.dataset.lockHook)return;grid.dataset.lockHook='1';grid.addEventListener('dragstart',e=>{if(!editMode){e.preventDefault();e.stopPropagation();}},true);grid.addEventListener('dragover',e=>{if(!editMode){e.preventDefault();e.stopPropagation();}},true);}
  function updateNow(instance){const hero=document.querySelector('.hero-tile');if(!hero)return;const now=instance?.current;const title=instance?.playing||now?.title||'Keine Wiedergabe';const img=now?.image||'';let row=hero.querySelector('.dashboard-now-row');if(!row){const existing=hero.querySelector('.now-playing');if(!existing)return;row=document.createElement('div');row.className='dashboard-now-row';existing.innerHTML='';existing.appendChild(row);}row.innerHTML=`${img?`<img class="dashboard-now-art" src="${esc(img)}" alt="Cover">`:'<div class="dashboard-now-art" aria-hidden="true">♫</div>'}<div><div class="dashboard-now-kicker">${now?.kind==='radio'?'Radio':'Jetzt läuft'}</div><h2>${esc(title)}</h2><p>${esc(instance?.name||'')}</p><div class="meta"><span>Zeit</span><b class="dashboard-now-time" data-start="${now?.startedAt||0}">${now?.startedAt?fmt((Date.now()-now.startedAt)/1000):'—'}</b><span>Quelle</span><b>${esc(instance?.type==='discord'?'Discord':instance?.type==='ts3'?'TeamSpeak 3':'—')}</b></div></div>`;}
  async function poll(){try{const r=await fetch('/api/state',{credentials:'include'});if(!r.ok)return;const s=await r.json();const inst=(s.instances||[]).find(x=>x.id===s.activeInstance)||(s.instances||[]).find(x=>x.connected)||(s.instances||[])[0];updateNow(inst);document.querySelectorAll('[data-start]').forEach(el=>{const t=Number(el.dataset.start||0);if(t)el.textContent=fmt((Date.now()-t)/1000);});}catch{}}
  function init(){style();if(!location.pathname)return;controls();hookDrag();lock();setInterval(poll,1000);poll();}
  new MutationObserver(()=>{controls();hookDrag();lock();}).observe(document.body,{childList:true,subtree:true});
  setTimeout(init,300);
})();
''')

# Ensure the enhancer loads last.
idx = Path('/opt/radiobot/frontend/index.html')
html = idx.read_text()
tag='<script src="/dashboard-enhancements.js"></script>'
if tag not in html: html=html.replace('</body>',tag+'</body>'); idx.write_text(html)
PY

cd /opt/radiobot/backend
npm install --include=dev --no-audit --no-fund
npm run build
npm prune --omit=dev --no-audit --no-fund
systemctl restart radiobot
sleep 2
systemctl is-active --quiet radiobot
printf '\033[1;32mDashboard-/Playlist-Fix installiert.\033[0m\n'
