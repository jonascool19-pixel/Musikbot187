(() => {
  const api = (url, options = {}) => fetch(url, { credentials: 'include', headers: { 'Content-Type': 'application/json', ...(options.headers || {}) }, ...options }).then(async r => { const d = await r.json().catch(() => ({})); if (!r.ok) throw new Error(d.error || `HTTP ${r.status}`); return d; });
  const esc = v => String(v ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const fmt = bytes => { let n = Number(bytes) || 0; const u = ['B','KB','MB','GB','TB']; let i = 0; while (n >= 1024 && i < u.length - 1) { n /= 1024; i++; } return `${n.toFixed(i ? 1 : 0)} ${u[i]}`; };
  let editMode = false;

  function liveInstance() {
    const list = Array.isArray(window.state?.instances) ? window.state.instances : [];
    return list.find(x => x.id === window.state?.activeInstance && x.connected) || list.find(x => x.connected) || list.find(x => x.playing) || list[0] || null;
  }

  function artwork(instance) {
    if (instance?.artwork) return instance.artwork;
    const input = String(instance?.currentInput || '');
    const m = input.match(/(?:youtube\.com\/(?:watch\?v=|shorts\/)|youtu\.be\/)([A-Za-z0-9_-]{6,})/i);
    return m ? `https://i.ytimg.com/vi/${m[1]}/hqdefault.jpg` : '';
  }

  function refreshHero() {
    const tile = document.querySelector('[data-tile="hero"]');
    if (!tile) return;
    const i = liveInstance();
    const title = i?.playing || 'Keine Wiedergabe';
    const p = tile.querySelector('.now-playing p');
    const h = tile.querySelector('.now-playing h2');
    const cover = tile.querySelector('.cover');
    if (h) h.textContent = title;
    if (p) p.textContent = i?.name || 'Keine aktive Instanz';
    const a = artwork(i);
    if (cover) cover.innerHTML = a ? `<img src="${esc(a)}" alt="Cover" style="width:100%;height:100%;object-fit:cover;border-radius:10px">` : '♫';
  }

  function lockTiles() {
    document.querySelectorAll('[data-tile]').forEach(t => { t.draggable = editMode; });
    const grid = document.querySelector('#grid');
    if (!grid) return;
    if (!grid.dataset.safeLockBound) {
      grid.dataset.safeLockBound = '1';
      grid.addEventListener('dragstart', e => { if (!editMode) { e.preventDefault(); e.stopPropagation(); } }, true);
      grid.addEventListener('dragover', e => { if (!editMode) { e.preventDefault(); e.stopPropagation(); } }, true);
      grid.addEventListener('drop', e => { if (!editMode) { e.preventDefault(); e.stopPropagation(); } }, true);
    }
    const heading = document.querySelector('.dashboard-grid')?.previousElementSibling;
    if (heading && !heading.querySelector('.safe-dashboard-edit')) {
      const b = document.createElement('button');
      b.className = 'safe-dashboard-edit';
      b.type = 'button';
      b.textContent = 'Bearbeiten';
      b.onclick = () => { editMode = !editMode; b.textContent = editMode ? 'Fertig' : 'Bearbeiten'; lockTiles(); };
      heading.appendChild(b);
    }
  }

  async function network() {
    try {
      const r = await fetch(`/network.json?ts=${Date.now()}`, { cache: 'no-store' });
      const d = await r.json();
      const live = document.querySelector('#topNet');
      if (live) live.textContent = `NET ↓ ${fmt(d.rx || 0)}/s ↑ ${fmt(d.tx || 0)}/s`;
      const values = document.querySelectorAll('.network-safe-total');
      const total = (Number(d.rxTotal) || 0) + (Number(d.txTotal) || 0);
      values.forEach(v => { v.innerHTML = `<div><b>Gesamt</b><strong>${fmt(total)}</strong></div><div><b>Download</b><strong>${fmt(d.rxTotal || 0)}</strong></div><div><b>Upload</b><strong>${fmt(d.txTotal || 0)}</strong></div>`; });
    } catch {}
  }

  function settingsNetworkTab() {
    const tabs = document.querySelector('.settings-tabs');
    const view = document.querySelector('#settingsView');
    if (!tabs || !view) return;
    let b = tabs.querySelector('[data-settab="network-safe"]');
    if (!b) {
      b = document.createElement('button');
      b.type = 'button'; b.dataset.settab = 'network-safe'; b.textContent = 'Netzwerkverbrauch';
      b.onclick = () => {
        tabs.querySelectorAll('[data-settab]').forEach(x => x.classList.remove('active'));
        b.classList.add('active');
        view.innerHTML = '<div class="page-panel"><div class="page-head"><div><h2>Netzwerkverbrauch</h2><p class="muted">Dauerhaft gemessener Netzwerkverkehr des Hosts.</p></div></div><div class="network-safe-total"></div></div>';
        network();
      };
      tabs.appendChild(b);
    }
  }

  async function play(id) {
    const s = await api('/api/state');
    const list = Array.isArray(s.playlists) ? s.playlists : [];
    const p = list.find(x => x.id === id);
    if (!p || !Array.isArray(p.items) || !p.items.length) throw new Error('Playlist ist leer.');
    for (let n = 0; n < p.items.length; n++) await api('/api/play', { method: 'POST', body: JSON.stringify({ input: p.items[n].input, playNow: n === 0, artwork: p.items[n].artwork || '' }) });
    window.notify?.(`${p.name} gestartet.`, 'success');
  }
  window.playPlaylist = play;

  const style = document.createElement('style');
  style.textContent = '.safe-dashboard-edit{margin-left:10px}.network-safe-total{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:14px}.network-safe-total>div{padding:16px;border:1px solid rgba(255,255,255,.08);border-radius:12px}.network-safe-total strong{display:block;font-size:1.35rem;margin-top:6px}@media(max-width:800px){.network-safe-total{grid-template-columns:1fr}}';
  document.head.appendChild(style);

  setInterval(() => { if (window.currentPage === 'dashboard') { refreshHero(); lockTiles(); } if (window.currentPage === 'settings') settingsNetworkTab(); network(); }, 1000);
  refreshHero(); lockTiles(); settingsNetworkTab(); network();
})();
