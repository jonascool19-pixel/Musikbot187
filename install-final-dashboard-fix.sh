#!/usr/bin/env bash
set -euo pipefail
[[ $EUID -eq 0 ]] || { echo 'Bitte mit sudo/root ausführen.' >&2; exit 1; }
apt-get update
DEBIAN_FRONTEND=noninteractive apt-get install -y curl python3
BASE="$(mktemp)"
trap 'rm -f "$BASE"' EXIT
curl -fsSL https://raw.githubusercontent.com/jonascool19-pixel/radiobot/main/install.sh -o "$BASE"
chmod +x "$BASE"
bash "$BASE"

python3 - <<'PY'
from pathlib import Path

root = Path('/opt/radiobot')
backend = root / 'backend/src'
frontend = root / 'frontend'

discord = backend / 'discord.ts'
s = discord.read_text()
s = s.replace("async add(input: string, playNow = false) {", "async add(input: string, playNow = false, artwork = '') {")
s = s.replace("const item = { input, title };", "const yt = input.match(/(?:youtube\\.com\\/(?:watch\\?v=|shorts\\/)|youtu\\.be\\/)([A-Za-z0-9_-]{6,})/i);\n    const derivedArtwork = artwork || (yt ? `https://i.ytimg.com/vi/${yt[1]}/hqdefault.jpg` : '');\n    const item = { input, title, artwork: derivedArtwork };")
s = s.replace("playing:this.current?.title ?? null, queue:", "playing:this.current?.title ?? null, currentInput:this.current?.input ?? null, artwork:this.current?.artwork ?? null, queue:")
discord.write_text(s)

media = backend / 'media.ts'
s = media.read_text()
s = s.replace("country: x.country }));", "country: x.country, favicon: x.favicon || '' }));")
media.write_text(s)

index = backend / 'index.ts'
s = index.read_text()
s = s.replace("active.add(String(b.input ?? b.url ?? b.search ?? ''), Boolean(b.playNow))", "active.add(String(b.input ?? b.url ?? b.search ?? ''), Boolean(b.playNow), String(b.artwork ?? ''))")
index.write_text(s)

search_ui = frontend / 'search-ui-fix.js'
s = search_ui.read_text()
s = s.replace("const input = kind === 'spotify' ? item.search : item.url;", "const input = kind === 'spotify' ? item.search : item.url;\n      const artwork = kind === 'radio' ? (item.favicon || '') : (kind === 'spotify' ? (item.albumArt || '') : (item.thumbnail || (item.url && item.url.match(/(?:youtube\\.com\\/(?:watch\\?v=|shorts\\/)|youtu\\.be\\/)([A-Za-z0-9_-]{6,})/i) ? `https://i.ytimg.com/vi/${item.url.match(/(?:youtube\\.com\\/(?:watch\\?v=|shorts\\/)|youtu\\.be\\/)([A-Za-z0-9_-]{6,})/i)[1]}/hqdefault.jpg` : ''))); ")
s = s.replace("data-title=\"${escapeHtml(title)}\">", "data-title=\"${escapeHtml(title)}\" data-artwork=\"${escapeHtml(artwork)}\">")
s = s.replace("body: JSON.stringify({ input, playNow: true })", "body: JSON.stringify({ input, playNow: true, artwork: row.dataset.artwork || '' })")
s = s.replace("body: JSON.stringify({ input, title })", "body: JSON.stringify({ input, title, artwork: row.dataset.artwork || '' })")
search_ui.write_text(s)

fix = frontend / 'dashboard-final-fix.js'
fix.write_text(r'''(() => {
  const api = (url, options={}) => fetch(url, {credentials:'include', headers:{'Content-Type':'application/json', ...(options.headers||{})}, ...options}).then(async r => { const d=await r.json().catch(()=>({})); if(!r.ok) throw new Error(d.error||`HTTP ${r.status}`); return d; });
  const esc = v => String(v ?? '').replace(/[&<>\"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','\"':'&quot;',"'":'&#39;'}[c]));
  const fmt = b => { let n=Number(b)||0, u=['B','KB','MB','GB','TB'], i=0; while(n>=1024&&i<u.length-1){n/=1024;i++;} return `${n.toFixed(i?1:0)} ${u[i]}`; };
  let editMode=false;

  function liveInstance(){
    const list=Array.isArray(state?.instances)?state.instances:[];
    return list.find(x=>x.id===state.activeInstance && x.connected) || list.find(x=>x.connected) || list.find(x=>x.playing || x.queue?.length) || list[0] || null;
  }

  function artworkFor(instance){
    if(instance?.artwork) return instance.artwork;
    const input=instance?.currentInput || '';
    const m=String(input).match(/(?:youtube\.com\/(?:watch\?v=|shorts\/)|youtu\.be\/)([A-Za-z0-9_-]{6,})/i);
    return m ? `https://i.ytimg.com/vi/${m[1]}/hqdefault.jpg` : '';
  }

  function applyHero(){
    const tile=document.querySelector('[data-tile="hero"]'); if(!tile) return;
    const i=liveInstance();
    const title=i?.playing || (i?.queue?.[0] ? i.queue[0] : 'Keine Wiedergabe');
    const art=artworkFor(i);
    const cover=tile.querySelector('.cover');
    if(cover){ cover.innerHTML = art ? `<img src="${esc(art)}" alt="Cover" style="width:100%;height:100%;object-fit:cover;border-radius:10px" onerror="this.style.display='none'">` : '♫'; }
    const h2=tile.querySelector('.now-playing h2'); if(h2) h2.textContent=title;
    const p=tile.querySelector('.now-playing p'); if(p) p.textContent=i?.name || 'Keine aktive Instanz';
    const source=tile.querySelector('.now-playing .meta b'); if(source) source.textContent=i?.type==='discord'?'Discord':i?.type==='ts3'?'TeamSpeak 3':'—';
    const status=[...tile.querySelectorAll('.now-playing .meta b')].find(x=>x.textContent==='▶ Wiedergabe'||x.textContent==='● Offline');
    if(status){status.textContent=i?.connected?'▶ Wiedergabe':'● Offline';status.classList.toggle('ok',!!i?.connected);status.classList.toggle('bad',!i?.connected);}
  }

  async function applyNetwork(){
    try{
      const r=await fetch(`/network.json?ts=${Date.now()}`,{cache:'no-store'}); const d=await r.json();
      let tile=document.querySelector('[data-tile="network-total"]');
      if(!tile){ const grid=document.querySelector('#grid'); if(!grid)return; tile=document.createElement('article'); tile.className='tile system-tile'; tile.dataset.tile='network-total'; tile.draggable=editMode; tile.innerHTML='<header class="tile-head"><strong>Netzwerkverbrauch</strong><span class="drag-handle">☷</span></header><div class="network-total-grid"></div>'; grid.appendChild(tile); }
      const total=(Number(d.rxTotal)||0)+(Number(d.txTotal)||0);
      const c=tile.querySelector('.network-total-grid'); if(c)c.innerHTML=`<div class="metric-card"><span>Gesamt</span><strong>${fmt(total)}</strong></div><div class="metric-card"><span>Download</span><strong>${fmt(d.rxTotal||0)}</strong></div><div class="metric-card"><span>Upload</span><strong>${fmt(d.txTotal||0)}</strong></div>`;
    }catch{}
  }

  function lockDashboard(){
    document.querySelectorAll('#grid .tile').forEach(t=>t.setAttribute('draggable', editMode ? 'true' : 'false'));
    const grid=document.querySelector('#grid'); if(grid && !grid.dataset.lockBound){
      grid.dataset.lockBound='1';
      grid.addEventListener('dragstart',e=>{ if(!editMode){e.preventDefault();e.stopPropagation();} },true);
      grid.addEventListener('dragover',e=>{ if(!editMode){e.preventDefault();e.stopPropagation();} },true);
      grid.addEventListener('drop',e=>{ if(!editMode){e.preventDefault();e.stopPropagation();} },true);
    }
    const head=document.querySelector('.dashboard-grid')?.previousElementSibling;
    if(head && !head.querySelector('.dashboard-edit-toggle')){
      const b=document.createElement('button'); b.className='dashboard-edit-toggle'; b.type='button'; b.textContent='Bearbeiten'; b.onclick=()=>{editMode=!editMode;b.textContent=editMode?'Fertig':'Bearbeiten';lockDashboard();}; head.appendChild(b);
    }
  }

  function fixRenderDashboard(){
    const original=window.renderDashboard;
    if(typeof original!=='function' || original.__wrapped)return;
    async function wrapped(){ await original(); setTimeout(()=>{lockDashboard();applyHero();void applyNetwork();},0); }
    wrapped.__wrapped=true; window.renderDashboard=wrapped;
  }

  async function fixPlaylists(){
    window.playPlaylist = async id => {
      try{
        const s=await api('/api/state'); const p=(s.playlists||[]).find(x=>x.id===id); if(!p)throw new Error('Playlist nicht gefunden.');
        if(!p.items?.length)throw new Error('Die Playlist ist leer.');
        for(let n=0;n<p.items.length;n++) await api('/api/play',{method:'POST',body:JSON.stringify({input:p.items[n].input,playNow:n===0,artwork:p.items[n].artwork||''})});
        window.notify?.(`${p.name} gestartet.`,'success');
      }catch(e){window.notify?.(e.message,'error');}
    };
  }

  async function fixSettings(){
    if(location.hash || currentPage!=='settings')return;
    const target=document.querySelector('#settingsView'); if(!target)return;
    if(target.querySelector('.network-consumption-panel'))return;
    const panel=document.createElement('div'); panel.className='page-panel network-consumption-panel'; panel.innerHTML='<div class="page-head"><div><h2>Netzwerkverbrauch</h2><p class="muted">Gesamter vom Host gemessener Netzwerkverkehr.</p></div></div><div class="form-grid three" id="networkConsumptionValues"><div class="panel"><b>Gesamt</b><strong>—</strong></div><div class="panel"><b>Download</b><strong>—</strong></div><div class="panel"><b>Upload</b><strong>—</strong></div></div>'; target.appendChild(panel);
    try{const r=await fetch(`/network.json?ts=${Date.now()}`,{cache:'no-store'});const d=await r.json();const total=(Number(d.rxTotal)||0)+(Number(d.txTotal)||0);document.querySelector('#networkConsumptionValues').innerHTML=`<div class="panel"><b>Gesamt</b><strong>${fmt(total)}</strong></div><div class="panel"><b>Download</b><strong>${fmt(d.rxTotal||0)}</strong></div><div class="panel"><b>Upload</b><strong>${fmt(d.txTotal||0)}</strong></div>`;}catch{}
  }

  const style=document.createElement('style'); style.textContent='.dashboard-edit-toggle{margin-left:12px}.network-total-grid,.network-consumption-panel .form-grid{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:10px}.network-total-grid .metric-card,.network-consumption-panel .panel{padding:12px}.network-total-grid .metric-card strong,.network-consumption-panel .panel strong{display:block;font-size:1.25rem;margin-top:5px}@media(max-width:800px){.network-total-grid,.network-consumption-panel .form-grid{grid-template-columns:1fr}}'; document.head.appendChild(style);

  const boot=setInterval(()=>{fixRenderDashboard();if(currentPage==='dashboard'){lockDashboard();applyHero();void applyNetwork();}if(currentPage==='settings')void fixSettings();},1000);
  setTimeout(()=>clearInterval(boot),15000);
})();
''')

idx = frontend / 'index.html'
html = idx.read_text()
tag = '<script src="/dashboard-final-fix.js"></script>'
if tag not in html:
    html = html.replace('</body>', tag + '</body>')
idx.write_text(html)
PY

cd /opt/radiobot/backend
npm install --include=dev --no-audit --no-fund
npm run build
npm prune --omit=dev --no-audit --no-fund
systemctl restart radiobot
sleep 2
systemctl is-active --quiet radiobot
printf '\033[1;32mFinal-Dashboard-Fix installiert.\033[0m\n'
