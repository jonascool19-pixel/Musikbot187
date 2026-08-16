#!/usr/bin/env bash
set -euo pipefail
[[ $EUID -eq 0 ]] || { echo 'Bitte als root/sudo ausführen.' >&2; exit 1; }
apt-get update
DEBIAN_FRONTEND=noninteractive apt-get install -y curl python3
BASE=$(mktemp)
trap 'rm -f "$BASE"' EXIT
curl -fsSL https://raw.githubusercontent.com/jonascool19-pixel/radiobot/main/install.sh -o "$BASE"
chmod +x "$BASE"
bash "$BASE"

python3 - <<'PY'
from pathlib import Path
import json

root = Path('/opt/radiobot')
backend = root / 'backend/src'
frontend = root / 'frontend'
data = Path('/var/lib/radiobot')

# 1) Keep a healthy Discord voice connection instead of destroying/recreating it for every item.
discord = backend / 'discord.ts'
s = discord.read_text()
if 'voiceChannelId?: string;' not in s:
    s = s.replace('  connection?: VoiceConnection;\n', '  connection?: VoiceConnection;\n  voiceChannelId?: string;\n')
needle = '    this.connection?.destroy();\n    this.log(\'INFO\', `Verbinde mit Voice-Kanal „${channel.name}“ (${channel.id}).`);\n'
repl = '''    if (this.connection && this.voiceChannelId === channel.id) {\n      try {\n        await entersState(this.connection, VoiceConnectionStatus.Ready, 3_000);\n        this.connection.subscribe(this.player);\n        return;\n      } catch {\n        this.connection?.destroy();\n      }\n    }\n    this.connection?.destroy();\n    this.log('INFO', `Verbinde mit Voice-Kanal „${channel.name}“ (${channel.id}).`);\n'''
if needle in s:
    s = s.replace(needle, repl)
else:
    raise SystemExit('discord ensureVoice anchor not found')
s = s.replace('    await entersState(this.connection, VoiceConnectionStatus.Ready, 15_000);\n    this.connection.subscribe(this.player);', '    await entersState(this.connection, VoiceConnectionStatus.Ready, 15_000);\n    this.voiceChannelId = channel.id;\n    this.connection.subscribe(this.player);')
s = s.replace("  async stop() {\n    this.ffmpeg?.kill('SIGTERM');\n    this.connection?.destroy();", "  async stop() {\n    this.ffmpeg?.kill('SIGTERM');\n    this.connection?.destroy();\n    this.voiceChannelId = undefined;")
discord.write_text(s)

# 2) Replace the network telemetry with selectable-interface persistent accounting.
telemetry = root / 'scripts/network-telemetry.sh'
telemetry.write_text(r'''#!/usr/bin/env bash
set -euo pipefail
OUT=/opt/radiobot/frontend/network.json
IFACES=/opt/radiobot/frontend/network-interfaces.json
CONFIG=/var/lib/radiobot/config.json
TOTAL=/var/lib/radiobot/network-total.json
mkdir -p "$(dirname "$OUT")" /var/lib/radiobot

python3 - "$CONFIG" <<'PY' >/dev/null
import json, os, sys
p=sys.argv[1]
try:
    with open(p, 'r', encoding='utf-8') as f: json.load(f)
except Exception: pass
PY

read_interfaces() {
  awk -F: 'BEGIN{printf ""} /^[[:space:]]*[^:]+:/{gsub(/^[[:space:]]+|[[:space:]]+$/, "", $1); if($1!="lo") print $1}' /proc/net/dev
}

read_totals() {
  local wanted="$1"
  awk -F'[: ]+' -v wanted="$wanted" '
    /^[[:space:]]*[^:]+:/ {
      iface=$1; if(iface=="lo") next; if(wanted!="auto" && iface!=wanted) next; rx+=$2; tx+=$10
    }
    END{printf "%s %s\n", rx+0, tx+0}
  ' /proc/net/dev
}

get_selected() {
  python3 - "$CONFIG" <<'PY'
import json,sys
try:
  cfg=json.load(open(sys.argv[1],encoding='utf-8'))
  print(((cfg.get('settings') or {}).get('networkInterface') or 'auto'))
except Exception:
  print('auto')
PY
}

prev_rx=0; prev_tx=0; prev_at=0
while :; do
  mapfile -t IFACE_LIST < <(read_interfaces)
  python3 - "$IFACES" "${IFACE_LIST[@]}" <<'PY'
import json,sys,os
out=sys.argv[1]
items=sys.argv[2:]
obj={'interfaces':[{'name':'auto','label':'Alle Interfaces'}]+[{'name':x,'label':x} for x in items]}
tmp=out+'.tmp'; open(tmp,'w',encoding='utf-8').write(json.dumps(obj,ensure_ascii=False)); os.replace(tmp,out)
PY
  selected=$(get_selected)
  if [[ "$selected" != "auto" ]]; then
    found=0
    for x in "${IFACE_LIST[@]}"; do [[ "$x" == "$selected" ]] && found=1; done
    (( found == 1 )) || selected=auto
  fi
  now=$(date +%s)
  read -r rx tx < <(read_totals "$selected")
  rx_rate=0; tx_rate=0
  if [[ "$prev_at" -gt 0 && "$now" -gt "$prev_at" ]]; then
    seconds=$((now-prev_at))
    rx_rate=$(( (rx-prev_rx) / seconds )); tx_rate=$(( (tx-prev_tx) / seconds ))
    ((rx_rate < 0)) && rx_rate=0; ((tx_rate < 0)) && tx_rate=0
  fi

  total_rx=0; total_tx=0
  if [[ -f "$TOTAL" ]]; then
    read -r total_rx total_tx < <(python3 - "$TOTAL" <<'PY'
import json,sys
try:
 d=json.load(open(sys.argv[1],encoding='utf-8')); print(int(d.get('rxTotal',0)), int(d.get('txTotal',0)))
except Exception: print(0,0)
PY
    )
  fi
  if [[ "$prev_at" -gt 0 ]]; then
    dr=$((rx-prev_rx)); dt=$((tx-prev_tx)); ((dr<0)) && dr=0; ((dt<0)) && dt=0
    total_rx=$((total_rx+dr)); total_tx=$((total_tx+dt))
  fi
  python3 - "$TOTAL" "$total_rx" "$total_tx" <<'PY'
import json,sys,os
obj={'rxTotal':int(sys.argv[2]),'txTotal':int(sys.argv[3])}
tmp=sys.argv[1]+'.tmp'; open(tmp,'w',encoding='utf-8').write(json.dumps(obj)); os.replace(tmp,sys.argv[1])
PY
  python3 - "$OUT" "$selected" "$rx_rate" "$tx_rate" "$total_rx" "$total_tx" "$now" <<'PY'
import json,sys,os
obj={'interface':sys.argv[2],'rx':int(sys.argv[3]),'tx':int(sys.argv[4]),'rxTotal':int(sys.argv[5]),'txTotal':int(sys.argv[6]),'at':int(sys.argv[7])}
tmp=sys.argv[1]+'.tmp'; open(tmp,'w',encoding='utf-8').write(json.dumps(obj,ensure_ascii=False)); os.replace(tmp,sys.argv[1])
PY
  prev_rx=$rx; prev_tx=$tx; prev_at=$now
  sleep 2
done
''')
telemetry.chmod(0o755)

# 3) Allow telemetry to persist totals and read config.
svc = Path('/etc/systemd/system/radiobot-network.service')
if svc.exists():
    txt = svc.read_text()
    txt = txt.replace('ReadWritePaths=/opt/radiobot/frontend', 'ReadWritePaths=/opt/radiobot/frontend /var/lib/radiobot')
    txt = txt.replace('ProtectSystem=strict', 'ProtectSystem=strict')
    svc.write_text(txt)

# 4) Frontend overlay: stable playback card, fixed dashboard with explicit edit mode,
#    selectable network interface and a dedicated network tab next to diagnostics.
overlay = frontend / 'stability-fix.js'
overlay.write_text(r'''(() => {
  const state = { edit: false, startedAt: 0, currentKey: '', previous: null };
  const esc = v => String(v ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const fmtBytes = n => { let v=Number(n)||0, u=['B','KB','MB','GB','TB'], i=0; while(v>=1024&&i<u.length-1){v/=1024;i++;} return `${v.toFixed(i?1:0)} ${u[i]}`; };
  const fmtRate = n => `${fmtBytes(n)}/s`;
  const duration = s => { let t=Math.max(0,Math.floor(Number(s)||0)),m=Math.floor(t/60),q=t%60; return `${m}:${String(q).padStart(2,'0')}`; };
  const api = (url, opts={}) => fetch(url,{credentials:'include',headers:{'Content-Type':'application/json',...(opts.headers||{})},...opts}).then(async r=>{const d=await r.json().catch(()=>({}));if(!r.ok)throw new Error(d.error||`HTTP ${r.status}`);return d;});

  function instance() {
    const list = Array.isArray(window.state?.instances) ? window.state.instances : [];
    return list.find(x=>x.id===window.state?.activeInstance && x.connected)
      || list.find(x=>x.connected)
      || list.find(x=>x.playing || x.queue?.length)
      || list.find(x=>x.id===window.state?.activeInstance)
      || list[0] || null;
  }

  function networkEl() { return document.getElementById('rb-network-card'); }
  async function network() {
    try {
      const [data, ifaces] = await Promise.all([
        fetch(`/network.json?ts=${Date.now()}`,{cache:'no-store'}).then(r=>r.json()),
        fetch(`/network-interfaces.json?ts=${Date.now()}`,{cache:'no-store'}).then(r=>r.json()).catch(()=>({interfaces:[]}))
      ]);
      const total=(Number(data.rxTotal)||0)+(Number(data.txTotal)||0);
      const top=document.getElementById('topNet'); if(top) top.textContent=`NET ↓ ${fmtRate(data.rx||0)} ↑ ${fmtRate(data.tx||0)}`;
      const card=networkEl();
      if(card){card.innerHTML=`<div class="rb-net-grid"><div><span>Gesamt</span><b>${fmtBytes(total)}</b></div><div><span>Download</span><b>${fmtBytes(data.rxTotal||0)}</b></div><div><span>Upload</span><b>${fmtBytes(data.txTotal||0)}</b></div></div><small>Interface: ${esc(data.interface||'auto')}</small>`;}
      const select=document.querySelector('#rb-network-interface');
      if(select && !select.dataset.loaded){select.innerHTML=(ifaces.interfaces||[]).map(x=>`<option value="${esc(x.name)}">${esc(x.label||x.name)}</option>`).join('');select.value=data.interface||'auto';select.dataset.loaded='1';}
    } catch {}
  }

  async function setInterface(value) {
    try {
      const settings = await api('/api/settings');
      const next = {...(settings.settings||{}), networkInterface:value};
      await api('/api/settings',{method:'PUT',body:JSON.stringify({settings:next})});
      const el=document.getElementById('rb-network-interface-status'); if(el) el.textContent='Gespeichert. Messung läuft mit neuem Interface.';
      setTimeout(network,500);
    } catch(e) { const el=document.getElementById('rb-network-interface-status'); if(el) el.textContent=e.message; }
  }

  function playback() {
    const i=instance(); const tile=document.querySelector('[data-tile="hero"]'); if(!tile) return;
    const playing=!!(i?.playing); const key=i?.id+'|'+(i?.playing||''); if(key!==state.currentKey){state.currentKey=key;state.startedAt=playing?Date.now():0;}
    const title=playing?i.playing:'Keine Wiedergabe';
    const p=tile.querySelector('.now-playing'); if(!p)return;
    const h=p.querySelector('h2'); if(h)h.textContent=title;
    const sub=p.querySelector('p'); if(sub)sub.textContent=i?.name||'Keine aktive Instanz';
    const meta=p.querySelector('.meta'); if(meta)meta.innerHTML=`<span>Quelle</span><b>${esc(i?.type==='discord'?'Discord':i?.type==='ts3'?'TeamSpeak 3':'—')}</b><span>Status</span><b class="${playing&&i?.connected?'ok':'bad'}">${playing&&i?.connected?'▶ Wiedergabe':'● Offline'}</b>`;
    const cover=p.querySelector('.cover'); if(cover){ const m=String(i?.currentInput||'').match(/(?:youtube\.com\/(?:watch\?v=|shorts\/)|youtu\.be\/)([A-Za-z0-9_-]{6,})/i); const url=i?.artwork || (m?`https://i.ytimg.com/vi/${m[1]}/hqdefault.jpg`:''); cover.innerHTML=url?`<img src="${esc(url)}" alt="Cover">`:'♫'; }
    let foot=tile.querySelector('.rb-playback-extra'); if(!foot){foot=document.createElement('div');foot.className='rb-playback-extra';tile.appendChild(foot);} const elapsed=state.startedAt?Math.floor((Date.now()-state.startedAt)/1000):0; const vol=Number(i?.volume??80); foot.innerHTML=`<div class="rb-time-row"><span>Laufzeit</span><b>${duration(elapsed)}</b></div><div class="rb-volume-row"><span>🔊</span><input type="range" min="0" max="100" value="${vol}" data-rb-volume><b>${vol}%</b></div>`;
    const range=foot.querySelector('[data-rb-volume]'); if(range && !range.dataset.bound){range.dataset.bound='1';range.addEventListener('input',async e=>{try{await window.control?.('volume',e.target.value);}catch{} foot.querySelector('b:last-child').textContent=`${e.target.value}%`;});}
  }

  function lock() {
    const grid=document.querySelector('#grid'); if(!grid)return;
    grid.querySelectorAll('.tile').forEach(t=>t.draggable=state.edit);
    if(!grid.dataset.rbLock){
      grid.dataset.rbLock='1';
      grid.addEventListener('dragstart',e=>{if(!state.edit){e.preventDefault();e.stopImmediatePropagation();}},true);
      grid.addEventListener('pointerdown',e=>{if(!state.edit && e.target.closest('.drag-handle')){e.preventDefault();e.stopImmediatePropagation();}},true);
    }
    const host=grid.parentElement?.querySelector('.page-head') || grid.parentElement?.firstElementChild;
    if(host && !host.querySelector('#rb-edit-dashboard')){const b=document.createElement('button');b.id='rb-edit-dashboard';b.textContent='Bearbeiten';b.type='button';b.addEventListener('click',()=>{state.edit=!state.edit;b.textContent=state.edit?'Fertig':'Bearbeiten';lock();});host.appendChild(b);}
  }

  function networkTile() {
    const grid=document.querySelector('#grid'); if(!grid || grid.querySelector('#rb-network-card'))return;
    const card=document.createElement('article');card.className='tile rb-network-tile';card.id='rb-network-card';card.dataset.tile='network';card.draggable=state.edit;card.innerHTML='<header class="tile-head"><strong>Netzwerk</strong><span>☷</span></header><div>Messung wird geladen …</div>';grid.appendChild(card);
  }

  function networkSettingsTab() {
    if(window.currentPage!=='settings')return;
    const tabs=document.querySelector('.settings-tabs'); const view=document.querySelector('#settingsView'); if(!tabs||!view)return;
    let b=tabs.querySelector('[data-settab="network"]');
    if(!b){b=document.createElement('button');b.type='button';b.dataset.settab='network';b.textContent='Netzwerkverbrauch';b.addEventListener('click',async()=>{tabs.querySelectorAll('[data-settab]').forEach(x=>x.classList.toggle('active',x===b));const s=await api('/api/settings').catch(()=>({settings:{}}));view.innerHTML=`<div class="page-panel"><div class="page-head"><div><h2>Netzwerkverbrauch</h2><p class="muted">Gesamtverbrauch und Auswahl der Netzwerkkarte.</p></div></div><label class="rb-net-label">Netzwerkkarte<select id="rb-network-interface"></select></label><p id="rb-network-interface-status" class="muted">Aktuell wird die konfigurierte Schnittstelle verwendet.</p><div id="rb-network-detail" class="rb-net-detail"></div></div>`;const sel=document.getElementById('rb-network-interface');if(sel){sel.addEventListener('change',()=>setInterface(sel.value));} await network();});tabs.appendChild(b);}
  }

  const style=document.createElement('style');style.textContent=`#rb-edit-dashboard{margin-left:12px}.rb-network-tile{min-width:420px}.rb-net-grid{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:12px;margin:15px 0}.rb-net-grid>div{padding:12px;border:1px solid #203044;border-radius:10px}.rb-net-grid span{display:block;color:#7f8b9a;font-size:.8rem}.rb-net-grid b{font-size:1.25rem}.rb-network-tile small{color:#7f8b9a}.rb-playback-extra{margin-top:12px;padding-top:12px;border-top:1px solid #203044}.rb-time-row,.rb-volume-row{display:flex;align-items:center;gap:10px;margin:8px 0}.rb-volume-row input{flex:1}.cover img{width:100%;height:100%;object-fit:cover;border-radius:10px}.rb-net-label{display:block;margin:12px 0}.rb-net-label select{display:block;width:100%;margin-top:6px}.rb-net-detail{margin-top:18px}.settings-tabs button[data-settab="network"]{order:99}`;document.head.appendChild(style);

  setInterval(()=>{if(window.currentPage==='dashboard'){lock();networkTile();void network();playback();}else if(window.currentPage==='settings'){networkSettingsTab();}},1000);
})();
''')
overlay_path = frontend / 'stability-fix.js'
overlay.chmod(0o644)

# Include overlay once.
idx = frontend / 'index.html'
html = idx.read_text()
tag = '<script src="/stability-fix.js"></script>'
if tag not in html:
    if '</body>' in html:
        html = html.replace('</body>', tag + '</body>')
    else:
        html += tag
idx.write_text(html)

# Make the network service able to update persistent data and restart cleanly.
svc.write_text('''[Unit]\nDescription=RadioBot network telemetry\nAfter=network-online.target radiobot.service\nWants=network-online.target\n\n[Service]\nType=simple\nUser=radiobot\nGroup=radiobot\nExecStart=/opt/radiobot/scripts/network-telemetry.sh\nRestart=always\nRestartSec=2\nNoNewPrivileges=true\nPrivateTmp=true\nProtectSystem=strict\nProtectHome=true\nReadWritePaths=/opt/radiobot/frontend /var/lib/radiobot\n\n[Install]\nWantedBy=multi-user.target\n''')
PY

chown -R radiobot:radiobot /opt/radiobot /var/lib/radiobot
chmod 0750 /var/lib/radiobot
cd /opt/radiobot/backend
npm install --include=dev --no-audit --no-fund
npm run build
npm prune --omit=dev --no-audit --no-fund
systemctl daemon-reload
systemctl enable radiobot.service radiobot-network.service
systemctl restart radiobot.service
systemctl restart radiobot-network.service
sleep 3
systemctl is-active --quiet radiobot.service
systemctl is-active --quiet radiobot-network.service
printf '\033[1;32mStability-/Netzwerk-Fix installiert.\033[0m\n'
