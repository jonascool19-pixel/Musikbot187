(() => {
  if (window.__radioBotDashboardV3) return;
  window.__radioBotDashboardV3 = true;

  let lastKey = '';
  let startedAt = 0;
  let tick = 0;

  const esc = value => String(value ?? '').replace(/[&<>\"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','\"':'&quot;',"'":'&#39;'}[c]));
  const fmtBytes = bytes => {
    let n = Number(bytes) || 0;
    const units = ['B','KB','MB','GB','TB'];
    let i = 0;
    while (n >= 1024 && i < units.length - 1) { n /= 1024; i++; }
    return `${n.toFixed(i ? 1 : 0)} ${units[i]}`;
  };
  const fmtTime = seconds => {
    const s = Math.max(0, Math.floor(Number(seconds) || 0));
    const h = Math.floor(s / 3600);
    const m = Math.floor((s % 3600) / 60);
    const sec = s % 60;
    return h ? `${h}:${String(m).padStart(2,'0')}:${String(sec).padStart(2,'0')}` : `${m}:${String(sec).padStart(2,'0')}`;
  };

  function liveInstance() {
    const list = Array.isArray(state?.instances) ? state.instances : [];
    return list.find(x => x?.playing) ||
      list.find(x => x?.id === state.activeInstance && x?.connected) ||
      list.find(x => x?.connected) ||
      list.find(x => x?.id === state.activeInstance) ||
      list[0] || null;
  }

  function coverFor(instance) {
    if (instance?.artwork) return instance.artwork;
    const input = String(instance?.currentInput || '');
    const m = input.match(/(?:youtube\.com\/(?:watch\?v=|shorts\/)|youtu\.be\/)([A-Za-z0-9_-]{6,})/i);
    return m ? `https://i.ytimg.com/vi/${m[1]}/hqdefault.jpg` : '';
  }

  async function networkData() {
    try {
      const response = await fetch(`/network.json?ts=${Date.now()}`, { cache: 'no-store', credentials: 'same-origin' });
      if (!response.ok) return null;
      return await response.json();
    } catch { return null; }
  }

  async function updateDashboard() {
    if (currentPage !== 'dashboard') return;
    const instance = liveInstance();
    const hero = document.querySelector('[data-tile="hero"]');
    if (hero) {
      const playing = String(instance?.playing || '');
      const key = `${instance?.id || ''}:${playing}`;
      if (playing && key !== lastKey) { lastKey = key; startedAt = Date.now(); }
      if (!playing) { lastKey = ''; startedAt = 0; }

      const title = hero.querySelector('.now-playing h2');
      const source = hero.querySelector('.now-playing p');
      const meta = hero.querySelectorAll('.now-playing .meta b');
      const status = meta?.[1];
      const cover = hero.querySelector('.cover');
      if (title) title.textContent = playing || 'Keine Wiedergabe';
      if (source) source.textContent = instance?.name || 'Keine aktive Instanz';
      if (meta?.[0]) meta[0].textContent = instance?.type === 'discord' ? 'Discord' : instance?.type === 'ts3' ? 'TeamSpeak 3' : '—';
      if (status) {
        status.textContent = playing ? '▶ Wiedergabe' : (instance?.connected ? '● Online' : '● Offline');
        status.classList.toggle('ok', !!playing);
        status.classList.toggle('bad', !playing);
      }
      const art = coverFor(instance);
      if (cover) cover.innerHTML = art ? `<img src="${esc(art)}" alt="Cover" style="width:100%;height:100%;object-fit:cover;border-radius:10px">` : '♫';

      let progress = hero.querySelector('.rb-playback-progress');
      if (!progress) {
        progress = document.createElement('div');
        progress.className = 'rb-playback-progress';
        progress.innerHTML = '<div class="rb-playback-time"><span class="rb-elapsed">0:00</span><span class="rb-state">—</span></div><div class="meter"><span class="rb-time-bar"></span></div><div class="rb-volume-row"><span>Lautstärke</span><input class="range rb-volume" type="range" min="0" max="100" value="80"><b class="rb-volume-value">80%</b></div>';
        const controls = hero.querySelector('.controls');
        if (controls) controls.before(progress);
        const range = progress.querySelector('.rb-volume');
        range.addEventListener('input', () => {
          const value = Number(range.value) || 0;
          if (typeof window.control === 'function') window.control('volume', value);
          const label = progress.querySelector('.rb-volume-value');
          if (label) label.textContent = `${value}%`;
        });
      }
      const volume = Math.max(0, Math.min(100, Number(instance?.volume ?? 80)));
      const range = progress.querySelector('.rb-volume');
      const volumeLabel = progress.querySelector('.rb-volume-value');
      if (range && document.activeElement !== range) range.value = String(volume);
      if (volumeLabel) volumeLabel.textContent = `${volume}%`;
      const elapsed = startedAt ? (Date.now() - startedAt) / 1000 : 0;
      const elapsedLabel = progress.querySelector('.rb-elapsed');
      const stateLabel = progress.querySelector('.rb-state');
      const bar = progress.querySelector('.rb-time-bar');
      if (elapsedLabel) elapsedLabel.textContent = fmtTime(elapsed);
      if (stateLabel) stateLabel.textContent = playing ? 'läuft' : '—';
      if (bar) bar.style.width = playing ? `${Math.min(100, (elapsed % 300) / 300 * 100)}%` : '0%';
    }

    let netTile = document.querySelector('[data-tile="network-v3"]');
    if (!netTile) {
      const grid = document.querySelector('#grid');
      if (grid) {
        netTile = document.createElement('article');
        netTile.className = 'tile system-tile rb-network-tile';
        netTile.dataset.tile = 'network-v3';
        netTile.setAttribute('draggable', 'false');
        netTile.innerHTML = '<header class="tile-head"><strong>Netzwerk</strong><span>Live</span></header><div class="rb-network-grid"><div><span>Download</span><b class="rb-rx">0 B/s</b></div><div><span>Upload</span><b class="rb-tx">0 B/s</b></div><div><span>Gesamt</span><b class="rb-total">0 B</b></div></div>';
        grid.appendChild(netTile);
      }
    }
    const net = await networkData();
    if (netTile && net) {
      const rx = Number(net.rx) || 0, tx = Number(net.tx) || 0;
      const total = (Number(net.rxTotal) || 0) + (Number(net.txTotal) || 0);
      const r = netTile.querySelector('.rb-rx'), t = netTile.querySelector('.rb-tx'), all = netTile.querySelector('.rb-total');
      if (r) r.textContent = `${fmtBytes(rx)}/s`;
      if (t) t.textContent = `${fmtBytes(tx)}/s`;
      if (all) all.textContent = fmtBytes(total);
    }
  }

  function addSettingsTab() {
    if (currentPage !== 'settings') return;
    const tabs = document.querySelector('.settings-tabs');
    const view = document.querySelector('#settingsView');
    if (!tabs || !view || tabs.querySelector('[data-settab="network-usage-v3"]')) return;
    const before = tabs.querySelector('[data-settab="errors"]') || tabs.lastElementChild;
    const button = document.createElement('button');
    button.type = 'button';
    button.dataset.settab = 'network-usage-v3';
    button.textContent = 'Netzwerkverbrauch';
    button.addEventListener('click', async () => {
      tabs.querySelectorAll('[data-settab]').forEach(x => x.classList.toggle('active', x === button));
      const d = await networkData();
      const total = (Number(d?.rxTotal) || 0) + (Number(d?.txTotal) || 0);
      view.innerHTML = `<div class="page-panel rb-network-settings"><div class="page-head"><div><h2>Netzwerkverbrauch</h2><p class="muted">Gesamter gemessener Netzwerkverkehr des RadioBot-Hosts.</p></div></div><div class="rb-network-history"><div class="panel"><span>Gesamt</span><strong>${fmtBytes(total)}</strong></div><div class="panel"><span>Download</span><strong>${fmtBytes(d?.rxTotal || 0)}</strong></div><div class="panel"><span>Upload</span><strong>${fmtBytes(d?.txTotal || 0)}</strong></div></div><div class="page-panel"><h3>Aktueller Durchsatz</h3><p>↓ ${fmtBytes(d?.rx || 0)}/s · ↑ ${fmtBytes(d?.tx || 0)}/s</p><p class="muted">Die Gesamtwerte werden dauerhaft über Neustarts hinweg fortgeschrieben.</p></div></div>`;
    });
    if (before?.nextSibling) tabs.insertBefore(button, before.nextSibling); else tabs.appendChild(button);
  }

  const style = document.createElement('style');
  style.textContent = `
    .rb-playback-progress{margin:10px 15px 0}.rb-playback-time{display:flex;justify-content:space-between;font-size:12px;margin-bottom:5px}.rb-time-bar{display:block;height:100%;width:0;transition:width .8s linear}.rb-volume-row{display:grid;grid-template-columns:auto 1fr auto;gap:10px;align-items:center;margin-top:10px;font-size:12px}.rb-network-tile{grid-column:span 2;min-height:170px}.rb-network-grid{display:grid;grid-template-columns:repeat(3,1fr);gap:12px}.rb-network-grid>div,.rb-network-history .panel{padding:14px;border:1px solid rgba(255,255,255,.08);border-radius:10px}.rb-network-grid span,.rb-network-history span{display:block;font-size:12px;opacity:.75}.rb-network-grid b,.rb-network-history strong{display:block;font-size:22px;margin-top:7px}.rb-network-history{display:grid;grid-template-columns:repeat(3,1fr);gap:12px;margin-bottom:14px}@media(max-width:900px){.rb-network-tile{grid-column:span 1}.rb-network-grid,.rb-network-history{grid-template-columns:1fr}}
  `;
  document.head.appendChild(style);

  setInterval(() => {
    try { addSettingsTab(); } catch {}
    try { void updateDashboard(); } catch {}
    tick = (tick + 1) % 100000;
  }, 1000);
})();
