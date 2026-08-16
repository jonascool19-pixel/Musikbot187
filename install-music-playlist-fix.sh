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
p = Path('/opt/radiobot/backend/src/index.ts')
s = p.read_text()
old = "function bot(id = config.activeInstance): any { return discord.get(id) ?? ts3.get(id); }"
new = """function bot(id = config.activeInstance): any {
  if (id) {
    const selected = discord.get(id) ?? ts3.get(id);
    if (selected) return selected;
  }
  for (const instance of discord.values()) {
    try { if (instance.state?.().connected) return instance; } catch {}
  }
  for (const instance of ts3.values()) {
    try { if (instance.state?.().connected) return instance; } catch {}
  }
  return discord.values().next().value ?? ts3.values().next().value;
}"""
if old not in s:
    raise SystemExit('bot() patch target not found')
s = s.replace(old, new, 1)
needle = "app.delete('/api/playlist/:id', async (request: any, reply: any) => {"
route = """app.delete('/api/playlist/:id/item/:index', async (request: any, reply: any) => { const user = auth(request, reply); if (!user) return; if (user.role === 'viewer') return reply.code(403).send({ error: 'Keine Schreibrechte.' }); const p = config.playlists.find((x: any) => x.id === request.params.id); if (!p) return reply.code(404).send({ error: 'Playlist nicht gefunden.' }); const index = Number(request.params.index); if (!Number.isInteger(index) || index < 0 || index >= (p.items?.length ?? 0)) return reply.code(400).send({ error: 'Ungültiger Playlist-Eintrag.' }); p.items.splice(index, 1); save(); return { ok: true, playlist: p }; });
"""
if route not in s:
    s = s.replace(needle, route + needle, 1)
p.write_text(s)

frontend = Path('/opt/radiobot/frontend/playlist-manager.js')
frontend.write_text(r'''(() => {
  const STYLE = 'playlist-manager-style';
  const esc = v => String(v ?? '').replace(/[&<>\"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','\"':'&quot;',"'":'&#39;'}[c]));
  const api = (url, options={}) => fetch(url, {credentials:'include', headers:{'Content-Type':'application/json', ...(options.headers||{})}, ...options}).then(async r => { const d=await r.json().catch(()=>({})); if(!r.ok) throw new Error(d.error || `HTTP ${r.status}`); return d; });
  function style(){ if(document.getElementById(STYLE))return; const s=document.createElement('style'); s.id=STYLE; s.textContent='.playlist-detail{margin-top:12px;padding:14px;border:1px solid rgba(255,255,255,.08);border-radius:12px}.playlist-detail-item{display:flex;gap:10px;align-items:center;justify-content:space-between;padding:8px 0;border-bottom:1px solid rgba(255,255,255,.06)}.playlist-detail-item:last-child{border-bottom:0}.playlist-detail-actions{display:flex;gap:6px}.playlist-detail-empty{opacity:.65;padding:8px 0}'; document.head.appendChild(s); }
  async function openPlaylist(id){ const state=await api('/api/state'); const p=(state.playlists||[]).find(x=>x.id===id); if(!p) throw new Error('Playlist nicht gefunden.'); const existing=document.querySelector(`.playlist-detail[data-playlist="${CSS.escape(id)}"]`); if(existing){existing.remove();return;} const detail=document.createElement('div'); detail.className='playlist-detail'; detail.dataset.playlist=id; detail.innerHTML=`<div style="display:flex;justify-content:space-between;align-items:center;gap:8px"><strong>${esc(p.name)}</strong><span>${p.items?.length||0} Titel</span></div><div class="playlist-detail-list"></div>`; const list=detail.querySelector('.playlist-detail-list'); (p.items||[]).forEach((item,index)=>{const row=document.createElement('div');row.className='playlist-detail-item';row.innerHTML=`<span>${esc(item.title||item.input)}</span><div class="playlist-detail-actions"><button type="button" class="playlist-item-play">▶</button><button type="button" class="playlist-item-delete">Löschen</button></div>`; row.querySelector('.playlist-item-play').onclick=async()=>{try{const active=await api('/api/state'); if(!(active.instances||[]).some(x=>x.id===active.activeInstance)){ const candidate=(active.instances||[]).find(x=>x.connected)||active.instances?.[0]; if(candidate) await api('/api/settings',{method:'PUT',body:JSON.stringify({activeInstance:candidate.id})}); } await api('/api/play',{method:'POST',body:JSON.stringify({input:item.input,playNow:true})}); window.notify?.('Wiedergabe gestartet.','success');}catch(e){window.notify?.(e.message,'error');}}; row.querySelector('.playlist-item-delete').onclick=async()=>{if(!confirm('Titel aus Playlist löschen?'))return; try{await api(`/api/playlist/${encodeURIComponent(id)}/item/${index}`,{method:'DELETE'}); detail.remove(); await openPlaylist(id);}catch(e){window.notify?.(e.message,'error');}}; list.appendChild(row);}); if(!(p.items||[]).length) list.innerHTML='<div class="playlist-detail-empty">Playlist ist leer.</div>'; const card=document.querySelector(`.playlist-card[data-playlist-id="${CSS.escape(id)}"]`); (card||detail.parentElement)?.appendChild(detail); if(!card) document.querySelector('.playlist-grid')?.appendChild(detail); }
  function enhance(){ style(); document.querySelectorAll('.playlist-card').forEach(card=>{ if(card.querySelector('.playlist-open'))return; const play=card.querySelector('button[onclick*="playPlaylist"]'); const m=play?.getAttribute('onclick')?.match(/playPlaylist\(['\"]([^'\"]+)['\"]\)/); if(!m)return; const id=m[1]; card.dataset.playlistId=id; const b=document.createElement('button'); b.type='button'; b.className='playlist-open'; b.textContent='Öffnen'; b.onclick=()=>void openPlaylist(id); play.parentElement?.appendChild(b); }); }
  new MutationObserver(enhance).observe(document.body,{childList:true,subtree:true}); enhance();
})();
''')

idx = Path('/opt/radiobot/frontend/index.html')
html = idx.read_text()
tag = '<script src="/playlist-manager.js"></script>'
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
printf '\033[1;32mPlay-/Playlist-Fix installiert.\033[0m\n'
