#!/usr/bin/env bash
set -euo pipefail
[[ $EUID -eq 0 ]] || { echo 'Bitte mit sudo/root ausführen.' >&2; exit 1; }
apt-get update
DEBIAN_FRONTEND=noninteractive apt-get install -y curl python3
BASE="$(mktemp)"
trap 'rm -f "$BASE"' EXIT
curl -fsSL https://raw.githubusercontent.com/jonascool19-pixel/radiobot/main/install-final-dashboard-fix.sh -o "$BASE"
chmod +x "$BASE"
bash "$BASE"

python3 - <<'PY'
from pathlib import Path
root = Path('/opt/radiobot')
backend = root / 'backend/src'
frontend = root / 'frontend'

# Always prefer a connected playback instance; do not let a stale/empty activeInstance cause HTTP 400.
idx = backend / 'index.ts'
s = idx.read_text()
old = "function bot(id = config.activeInstance): any { return discord.get(id) ?? ts3.get(id); }"
new = """function bot(id = config.activeInstance): any {
  if (id) {
    const selected = discord.get(id) ?? ts3.get(id);
    if (selected) return selected;
  }
  for (const instance of discord.values()) { try { if (instance.state?.().connected) return instance; } catch {} }
  for (const instance of ts3.values()) { try { if (instance.state?.().connected) return instance; } catch {} }
  return discord.values().next().value ?? ts3.values().next().value;
}"""
if old in s:
    s = s.replace(old, new, 1)
idx.write_text(s)

# Replace network telemetry with persistent totals and robust interface parsing.
net = root / 'scripts/network-telemetry.sh'
net.write_text(r'''#!/usr/bin/env bash
set -euo pipefail
OUT=/opt/radiobot/frontend/network.json
TOTAL=/var/lib/radiobot/network-total.json
mkdir -p "$(dirname "$OUT")" "$(dirname "$TOTAL")"
prev_rx=0; prev_tx=0; prev_at=0
persist_rx=0; persist_tx=0
if [[ -s "$TOTAL" ]]; then
  read -r persist_rx persist_tx < <(python3 - <<'PY'
import json
from pathlib import Path
p=Path('/var/lib/radiobot/network-total.json')
try:
 d=json.loads(p.read_text())
 print(int(d.get('rxTotal',0)), int(d.get('txTotal',0)))
except Exception:
 print(0,0)
PY
)
fi
read_totals() {
  awk -F'[: ]+' '/^[[:space:]]*[^:]+:/{iface=$1; if(iface!="lo" && $2 ~ /^[0-9]+$/){rx+=$2; tx+=$10}} END{printf "%d %d\n", rx+0, tx+0}' /proc/net/dev
}
while :; do
  now=$(date +%s)
  read -r rx tx < <(read_totals)
  rx_rate=0; tx_rate=0
  if [[ "$prev_at" -gt 0 && "$now" -gt "$prev_at" ]]; then
    seconds=$((now-prev_at))
    drx=$((rx-prev_rx)); dtx=$((tx-prev_tx))
    ((drx < 0)) && drx=0; ((dtx < 0)) && dtx=0
    rx_rate=$((drx/seconds)); tx_rate=$((dtx/seconds))
    persist_rx=$((persist_rx+drx)); persist_tx=$((persist_tx+dtx))
    printf '{"rxTotal":%d,"txTotal":%d}\n' "$persist_rx" "$persist_tx" > "$TOTAL.tmp"
    mv "$TOTAL.tmp" "$TOTAL"
  fi
  printf '{"rx":%d,"tx":%d,"rxTotal":%d,"txTotal":%d,"at":%d}\n' "$rx_rate" "$tx_rate" "$persist_rx" "$persist_tx" "$now" > "$OUT.tmp"
  mv "$OUT.tmp" "$OUT"
  prev_rx=$rx; prev_tx=$tx; prev_at=$now
  sleep 2
done
''')
net.chmod(0o755)

# New frontend layer: playback status, fixed dashboard by default, and a Network tab next to Errors.
v2 = frontend / 'dashboard-v2.js'
v2.write_text(r'''(() => {
  const api = (url, options={}) => fetch(url,{credentials:'include',headers:{'Content-Type':'application/json',...(options.headers||{})},...options}).then(async r=>{const d=await r.json().catch(()=>({}));if(!r.ok)throw new Error(d.error||`HTTP ${r.status}`);return d;});
  const fmt = bytes => { let n=Number(bytes)||0,u=['B','KB','MB','GB','TB'],i=0; while(n>=1024&&i<u.length-1){n/=1024;i++;} return `${n.toFixed(i?1:0)} ${u[i]}`; };
  const esc = v=>String(v??'').replace(/[&<>\"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','\"':'&quot;',"'":'&#39;'}[c]));
  let edit=false;

  function liveInstance(){const xs=Array.isArray(state?.instances)?state.instances:[];return xs.find(x=>x.connected&&x.playing)||xs.find(x=>x.connected)||xs.find(x=>x.playing)||xs.find(x=>x.id===state.activeInstance)||xs[0]||null;}
  function artwork(i){if(i?.artwork)return i.artwork;const m=String(i?.currentInput||'').match(/(?:youtube\.com\/(?:watch\?v=|shorts\/)|youtu\.be\/)([A-Za-z0-9_-]{6,})/i);return m?`https://i.ytimg.com/vi/${m[1]}/hqdefault.jpg`:'';}

  function dashboardLock(){
    const grid=document.querySelector('#grid'); if(!grid)return;
    document.querySelectorAll('#grid .tile').forEach(t=>t.draggable=edit);
    grid.classList.toggle('dashboard-locked',!edit);
    if(!grid.dataset.v2bound){
      grid.dataset.v2bound='1';
      grid.addEventListener('dragstart',e=>{if(!edit){e.preventDefault();e.stopImmediatePropagation();}},true);
      grid.addEventListener('dragover',e=>{if(!edit){e.preventDefault();e.stopImmediatePropagation();}},true);
      grid.addEventListener('drop',e=>{if(!edit){e.preventDefault();e.stopImmediatePropagation();}},true);
    }
    const toolbar=document.querySelector('.dashboard-toolbar') || document.querySelector('.dashboard-grid')?.previousElementSibling;
    if(toolbar && !toolbar.querySelector('.v2-edit')){
      const b=document.createElement('button');b.type='button';b.className='v2-edit';b.textContent='Bearbeiten';b.onclick=()=>{edit=!edit;b.textContent=edit?'Fertig':'Bearbeiten';dashboardLock();};toolbar.appendChild(b);
    }
  }

  function refreshHero(){
    const tile=document.querySelector('[data-tile="hero"]'); if(!tile)return; const i=liveInstance();
    const title=i?.playing||'Keine Wiedergabe';
    const h=tile.querySelector('.now-playing h2');if(h)h.textContent=title;
    const p=tile.querySelector('.now-playing p');if(p)p.textContent=i?.name||'Keine aktive Instanz';
    const cover=tile.querySelector('.cover'); const art=artwork(i); if(cover) cover.innerHTML=art?`<img src="${esc(art)}" alt="Cover" style="width:100%;height:100%;object-fit:cover;border-radius:10px">`:'♫';
  }

  async function refreshNetworkTile(){
    try{const r=await fetch(`/network.json?ts=${Date.now()}`,{cache:'no-store'});const d=await r.json();let t=document.querySelector('[data-tile="network-total"]');const g=document.querySelector('#grid');if(!t&&g){t=document.createElement('article');t.className='tile system-tile network-total-tile';t.dataset.tile='network-total';t.innerHTML='<header class="tile-head"><strong>Netzwerk</strong><span class="drag-handle">☷</span></header><div class="v2-network-grid"></div>';g.appendChild(t);}if(t){t.draggable=edit;const c=t.querySelector('.v2-network-grid');if(c)c.innerHTML=`<div><span>Gesamt</span><b>${fmt((d.rxTotal||0)+(d.txTotal||0))}</b></div><div><span>↓ Download</span><b>${fmt(d.rxTotal||0)}</b></div><div><span>↑ Upload</span><b>${fmt(d.txTotal||0)}</b></div>`;}}
    catch{}
  }

  function settingsNetworkTab(){
    if(currentPage!=='settings')return;
    const tabs=document.querySelector('.settings-tabs');const view=document.querySelector('#settingsView');if(!tabs||!view)return;
    let b=tabs.querySelector('[data-settab="network-total"]');
    if(!b){b=document.createElement('button');b.type='button';b.dataset.settab='network-total';b.textContent='Netzwerkverbrauch';tabs.appendChild(b);}
    if(!b.dataset.bound){b.dataset.bound='1';b.onclick=async()=>{tabs.querySelectorAll('[data-settab]').forEach(x=>x.classList.remove('active'));b.classList.add('active');try{const r=await fetch(`/network.json?ts=${Date.now()}`,{cache:'no-store'});const d=await r.json();view.innerHTML=`<div class="page-panel"><div class="page-head"><div><h2>Netzwerkverbrauch</h2><p class="muted">Seit Installation kumulierter Netzwerkverkehr des Hosts.</p></div></div><div class="v2-net-cards"><div><span>Gesamt</span><strong>${fmt((d.rxTotal||0)+(d.txTotal||0))}</strong></div><div><span>Download</span><strong>${fmt(d.rxTotal||0)}</strong></div><div><span>Upload</span><strong>${fmt(d.txTotal||0)}</strong></div></div></div>`;}catch(e){view.innerHTML=`<div class="page-panel"><p>${esc(e.message)}</p></div>`;}};}
  }

  const s=document.createElement('style');s.textContent='.dashboard-locked .drag-handle{opacity:.35;pointer-events:none}.v2-edit{margin-left:10px}.network-total-tile{grid-column:span 2;min-height:150px}.v2-network-grid,.v2-net-cards{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:12px}.v2-network-grid>div,.v2-net-cards>div{padding:16px;border:1px solid rgba(255,255,255,.08);border-radius:12px}.v2-network-grid span,.v2-net-cards span{display:block;opacity:.7}.v2-network-grid b,.v2-net-cards strong{display:block;font-size:1.35rem;margin-top:7px}@media(max-width:800px){.network-total-tile{grid-column:span 1}.v2-network-grid,.v2-net-cards{grid-template-columns:1fr}}';document.head.appendChild(s);

  setInterval(()=>{if(currentPage==='dashboard'){dashboardLock();refreshHero();void refreshNetworkTile();}if(currentPage==='settings')settingsNetworkTab();},1200);
  setTimeout(()=>{dashboardLock();refreshHero();void refreshNetworkTile();settingsNetworkTab();},1000);
})();
''')

idxf=frontend/'index.html'
h=idxf.read_text()
tag='<script src="/dashboard-v2.js"></script>'
if tag not in h:h=h.replace('</body>',tag+'</body>')
idxf.write_text(h)
PY

cd /opt/radiobot/backend
npm install --include=dev --no-audit --no-fund
npm run build
npm prune --omit=dev --no-audit --no-fund
chown -R radiobot:radiobot /opt/radiobot /var/lib/radiobot
systemctl restart radiobot
systemctl restart radiobot-network
sleep 2
systemctl is-active --quiet radiobot
systemctl is-active --quiet radiobot-network
printf '\033[1;32mDashboard-V2-Fix installiert.\033[0m\n'
