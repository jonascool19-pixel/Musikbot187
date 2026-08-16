(() => {
  let editing = false;
  let lastState = null;
  let refreshTimer = null;

  const api = async (url, options = {}) => {
    const response = await fetch(url, {
      credentials: 'include',
      headers: { 'Content-Type': 'application/json', ...(options.headers || {}) },
      ...options
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) {
      const error = new Error(data.error || `HTTP ${response.status}`);
      error.status = response.status;
      throw error;
    }
    return data;
  };

  const esc = value => String(value ?? '').replace(/[&<>"']/g, c => ({
    '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;'
  }[c]));
  const formatBytes = bytes => {
    let n = Math.max(0, Number(bytes) || 0), i = 0;
    const u = ['B','KB','MB','GB','TB'];
    while (n >= 1024 && i < u.length - 1) { n /= 1024; i++; }
    return `${n.toFixed(i ? 1 : 0)} ${u[i]}`;
  };
  const formatTime = sec => {
    const s = Math.max(0, Math.floor(Number(sec) || 0));
    return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
  };
  const activeInstance = s =>
    (s?.instances || []).find(x => x.playing) ||
    (s?.instances || []).find(x => x.id === s.activeInstance) ||
    (s?.instances || []).find(x => x.connected) ||
    null;

  function installPlaybackStyles() {
    if (document.getElementById('stablePlaybackStyles')) return;
    const style = document.createElement('style');
    style.id = 'stablePlaybackStyles';
    style.textContent = `
      .playback-widget{display:grid;grid-template-columns:96px minmax(0,1fr);gap:18px;align-items:center}
      .playback-art{width:96px;height:96px;border-radius:14px;overflow:hidden;background:rgba(255,255,255,.07);display:grid;place-items:center;font-size:34px}
      .playback-art img{width:100%;height:100%;object-fit:cover;display:block}
      .playback-main{min-width:0}
      .playback-title{font-size:20px;font-weight:800;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
      .playback-sub{margin-top:5px;color:var(--muted,#8fa0b7);white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
      .playback-meta{display:flex;flex-wrap:wrap;gap:8px 16px;margin-top:10px;font-size:12px;color:var(--muted,#8fa0b7)}
      .playback-meta strong{color:inherit}
      .playback-progress{margin-top:14px}
      .playback-progress input{width:100%;margin:0}
      .playback-times{display:flex;justify-content:space-between;margin-top:4px;font-size:11px;color:var(--muted,#8fa0b7)}
      .playback-actions{display:flex;gap:8px;align-items:center;margin-top:12px;flex-wrap:wrap}
      .playback-actions .stable-volume{display:inline-flex;align-items:center;gap:8px;margin-left:auto}
      .playback-actions .stable-volume input{width:150px}
      .playback-empty{display:grid;grid-template-columns:96px minmax(0,1fr);gap:18px;align-items:center}
      .playback-status-online{color:#5bd483}.playback-status-offline{color:#ff6b6b}
      @media (max-width:720px){.playback-widget,.playback-empty{grid-template-columns:72px minmax(0,1fr)}.playback-art{width:72px;height:72px}}
    `;
    document.head.appendChild(style);
  }

  function lockDashboard() {
    const grid = document.querySelector('#grid');
    if (!grid) return;
    grid.querySelectorAll('[data-tile]').forEach(tile => {
      tile.draggable = Boolean(editing);
      tile.classList.toggle('dashboard-tile-locked', !editing);
      const handle = tile.querySelector('.drag-handle');
      if (handle) handle.style.pointerEvents = editing ? 'auto' : 'none';
    });
  }

  function ensureEditorButton() {
    const top = document.querySelector('.top-actions');
    if (!top || location.pathname !== '/') return;
    let button = document.querySelector('#stableDashboardEdit');
    if (!button) {
      button = document.createElement('button');
      button.id = 'stableDashboardEdit';
      button.className = 'icon-btn';
      button.type = 'button';
      button.addEventListener('click', () => {
        editing = !editing;
        button.textContent = editing ? '✓' : '✦';
        button.title = editing ? 'Bearbeiten beenden' : 'Dashboard bearbeiten';
        document.body.classList.toggle('dashboard-editing', editing);
        lockDashboard();
      });
      top.insertBefore(button, document.querySelector('#settingsQuick') || null);
    }
    button.textContent = editing ? '✓' : '✦';
    button.title = editing ? 'Bearbeiten beenden' : 'Dashboard bearbeiten';
    lockDashboard();
  }

  document.addEventListener('dragstart', e => {
    const tile = e.target.closest?.('[data-tile]');
    if (tile && !editing) { e.preventDefault(); e.stopImmediatePropagation(); }
  }, true);
  document.addEventListener('dragover', e => {
    const tile = e.target.closest?.('[data-tile]');
    if (tile && !editing) { e.preventDefault(); e.stopImmediatePropagation(); }
  }, true);
  document.addEventListener('drop', e => {
    const tile = e.target.closest?.('[data-tile]');
    if (tile && !editing) { e.preventDefault(); e.stopImmediatePropagation(); }
  }, true);

  function renderPlaybackWidget(instance) {
    const tile = document.querySelector('.hero-tile');
    if (!tile) return;
    installPlaybackStyles();

    let widget = tile.querySelector('.playback-widget, .playback-empty');
    if (!widget || widget.dataset.ready !== '1') {
      const header = tile.querySelector('.tile-head');
      if (!header) return;
      tile.querySelectorAll(':scope > :not(.tile-head)').forEach(node => node.remove());

      widget = document.createElement('div');
      widget.dataset.ready = '1';
      widget.className = 'playback-empty';
      widget.innerHTML = `
        <div class="playback-art" id="playbackArt">♫</div>
        <div class="playback-main">
          <div class="playback-title" id="playbackTitle">Keine Wiedergabe</div>
          <div class="playback-sub" id="playbackSub">Keine aktive Instanz</div>
          <div class="playback-meta">
            <span>Quelle: <strong id="playbackSource">—</strong></span>
            <span>Status: <strong id="playbackStatus" class="playback-status-offline">● Offline</strong></span>
          </div>
          <div class="playback-progress">
            <input id="playbackProgress" type="range" min="0" max="100" value="0" disabled>
            <div class="playback-times"><span id="playbackElapsed">0:00</span><span id="playbackDuration">0:00</span></div>
          </div>
          <div class="playback-actions">
            <button class="primary" type="button" data-playback-action="pause">Ⅱ Pause</button>
            <button type="button" data-playback-action="stop">■ Stop</button>
            <button type="button" data-playback-action="skip">≫ Skip</button>
            <label class="stable-volume" title="Lautstärke">🔊 <input id="playbackVolume" type="range" min="0" max="100" value="80"></label>
          </div>
        </div>
      `;
      tile.appendChild(widget);

      widget.querySelectorAll('[data-playback-action]').forEach(button => {
        button.addEventListener('click', () => {
          const action = button.dataset.playbackAction;
          if (typeof window.control === 'function') window.control(action);
        });
      });
      widget.querySelector('#playbackVolume')?.addEventListener('input', async event => {
        try {
          await api('/api/control', {
            method: 'POST',
            body: JSON.stringify({ action: 'volume', value: Number(event.target.value) })
          });
        } catch {}
      });
    }

    const playing = Boolean(instance?.playing);
    const elapsed = Number(instance?.elapsedSeconds || 0);
    const duration = Number(instance?.durationSeconds || instance?.duration || 0);
    const percent = duration > 0 ? Math.max(0, Math.min(100, elapsed / duration * 100)) : 0;
    const source = instance?.type === 'discord' ? 'Discord' : instance?.type === 'ts3' ? 'TeamSpeak 3' : (instance?.source || '—');
    const status = playing ? '▶ Wiedergabe' : instance?.connected ? '● Verbunden' : '● Offline';

    widget.classList.toggle('playback-empty', !playing);
    widget.classList.toggle('playback-widget', true);

    const title = widget.querySelector('#playbackTitle');
    const sub = widget.querySelector('#playbackSub');
    const sourceEl = widget.querySelector('#playbackSource');
    const statusEl = widget.querySelector('#playbackStatus');
    const progress = widget.querySelector('#playbackProgress');
    const elapsedEl = widget.querySelector('#playbackElapsed');
    const durationEl = widget.querySelector('#playbackDuration');
    const volume = widget.querySelector('#playbackVolume');
    const art = widget.querySelector('#playbackArt');

    if (title) title.textContent = instance?.playing || 'Keine Wiedergabe';
    if (sub) sub.textContent = instance?.artist ? `${instance.artist} · ${instance?.name || 'Instanz'}` : (instance?.name || 'Keine aktive Instanz');
    if (sourceEl) sourceEl.textContent = source;
    if (statusEl) {
      statusEl.textContent = status;
      statusEl.className = playing || instance?.connected ? 'playback-status-online' : 'playback-status-offline';
    }
    if (progress) progress.value = String(percent);
    if (elapsedEl) elapsedEl.textContent = formatTime(elapsed);
    if (durationEl) durationEl.textContent = formatTime(duration);
    if (volume && document.activeElement !== volume) volume.value = String(Number(instance?.volume ?? 80));

    const cover = instance?.coverUrl;
    if (art && art.dataset.cover !== String(cover || '')) {
      art.dataset.cover = String(cover || '');
      art.innerHTML = cover ? `<img src="${esc(cover)}" alt="" loading="lazy">` : '♫';
      const img = art.querySelector('img');
      if (img) img.addEventListener('error', () => { art.innerHTML = '♫'; }, { once: true });
    }

    const actionButtons = widget.querySelectorAll('[data-playback-action]');
    actionButtons.forEach(button => { button.disabled = !playing && button.dataset.playbackAction !== 'stop'; });
  }

  function updateNetwork(s) {
    const net = s?.system || {};
    const top = document.querySelector('#topNet');
    if (top) top.textContent = `NET ↓ ${formatBytes(net.networkRx || 0)}/s ↑ ${formatBytes(net.networkTx || 0)}/s`;
    const tile = document.querySelector('.system-tile .system-mini');
    if (tile) tile.innerHTML = `<span>NET ↓ ${formatBytes(net.networkRx || 0)}/s</span><span>↑ ${formatBytes(net.networkTx || 0)}/s</span>`;
  }

  function stopPolling() {
    if (refreshTimer) { clearTimeout(refreshTimer); refreshTimer = null; }
  }

  function scheduleRefresh(delay = 3000) {
    stopPolling();
    refreshTimer = setTimeout(() => { void refreshStable(); }, delay);
  }

  async function refreshStable() {
    if (!document.querySelector('.app-shell')) {
      stopPolling();
      scheduleRefresh(5000);
      return;
    }

    try {
      const fresh = await api('/api/state');
      lastState = fresh;
      if (location.pathname === '/') {
        renderPlaybackWidget(activeInstance(fresh));
        updateNetwork(fresh);
        ensureEditorButton();
      }
      injectNetworkTab();
      injectPlaylistOpeners(fresh.playlists || []);
    } catch (error) {
      if (error.status === 401 || error.status === 409) {
        stopPolling();
        scheduleRefresh(5000);
        return;
      }
    }

    scheduleRefresh(3000);
  }

  function injectNetworkTab() {
    const tabs = document.querySelector('.settings-tabs');
    if (!tabs) return;
    let tab = tabs.querySelector('[data-settab="network"]');
    if (tab) return;
    tab = document.createElement('button');
    tab.dataset.settab = 'network';
    tab.textContent = 'Netzwerkverbrauch';
    const errorTab = tabs.querySelector('[data-settab="errors"]');
    if (errorTab) errorTab.after(tab); else tabs.appendChild(tab);
    tab.addEventListener('click', () => {
      tabs.querySelectorAll('button').forEach(x => x.classList.toggle('active', x === tab));
      renderNetworkSettings(document.querySelector('#settingsView'));
    });
  }

  async function renderNetworkSettings(target) {
    if (!target || !document.querySelector('.app-shell')) return;
    try {
      const [info, stats] = await Promise.all([api('/api/network/interfaces'), api('/api/network/stats')]);
      target.innerHTML = `<section class="page-panel"><div class="page-head"><div><h2>Netzwerkverbrauch</h2><p>Gesamtverbrauch sowie Download und Upload des ausgewählten Interfaces.</p></div></div><div class="form-grid two"><label>Netzwerkkarte<select id="stableNetworkInterface">${(info.interfaces || []).map(name => `<option value="${esc(name)}" ${name === info.selected ? 'selected' : ''}>${esc(name)}</option>`).join('')}</select></label><div class="metric-card"><span>Ausgewählt</span><strong>${esc(stats.interface)}</strong><small>Interface für die Gesamtzählung</small></div></div><div class="system-cards"><div class="metric-card"><span>Gesamt</span><strong>${formatBytes(stats.total)}</strong><small>RX + TX</small></div><div class="metric-card"><span>Download</span><strong>${formatBytes(stats.rxTotal)}</strong><small>RX</small></div><div class="metric-card"><span>Upload</span><strong>${formatBytes(stats.txTotal)}</strong><small>TX</small></div><div class="metric-card"><span>Live</span><strong>↓ ${formatBytes(stats.rxRate)}/s</strong><small>↑ ${formatBytes(stats.txRate)}/s</small></div></div></section>`;
      document.querySelector('#stableNetworkInterface')?.addEventListener('change', async e => {
        await api('/api/settings', { method:'PUT', body: JSON.stringify({ settings:{ networkInterface:e.target.value } }) });
        await renderNetworkSettings(target);
      });
    } catch (error) {
      if (error.status === 401 || error.status === 409) return;
      target.innerHTML = `<div class="page-panel"><div class="empty">${esc(error.message)}</div></div>`;
    }
  }

  function injectPlaylistOpeners(playlists) {
    document.querySelectorAll('.playlist-card').forEach(card => {
      if (card.querySelector('.stable-open-playlist')) return;
      const title = card.querySelector('h3')?.textContent?.trim();
      const p = playlists.find(x => x.name === title); if (!p) return;
      const actions = card.querySelector('div:last-child'); if (!actions) return;
      const b = document.createElement('button');
      b.className = 'stable-open-playlist';
      b.textContent = 'Öffnen';
      b.addEventListener('click', () => openPlaylist(p));
      actions.insertBefore(b, actions.firstChild);
    });
  }

  function openPlaylist(playlist) {
    document.querySelector('#stablePlaylistModal')?.remove();
    const modal = document.createElement('div');
    modal.id = 'stablePlaylistModal';
    modal.className = 'stable-modal-backdrop';
    modal.innerHTML = `<div class="stable-modal"><div class="page-head"><div><h2>${esc(playlist.name)}</h2><p>${playlist.items?.length || 0} Titel</p></div><button id="stableClose">✕</button></div><div class="stable-playlist-list">${(playlist.items || []).map((item, i) => `<div class="queue-item"><span>${i + 1}</span><b>${esc(item.title || item.input)}</b><button data-del="${i}">Löschen</button></div>`).join('') || '<div class="empty">Playlist ist leer.</div>'}</div></div>`;
    document.body.appendChild(modal);
    modal.querySelector('#stableClose').onclick = () => modal.remove();
    modal.addEventListener('click', e => { if (e.target === modal) modal.remove(); });
    modal.querySelectorAll('[data-del]').forEach(b => b.addEventListener('click', async () => {
      try {
        await api(`/api/playlist/${playlist.id}/item/${b.dataset.del}`, { method:'DELETE' });
        modal.remove();
        await refreshStable();
        document.querySelector('[data-nav="playlists"]')?.click();
      } catch {}
    }));
  }

  const observer = new MutationObserver(() => {
    if (document.querySelector('.app-shell')) {
      ensureEditorButton();
      lockDashboard();
      injectNetworkTab();
    }
  });
  observer.observe(document.body, { childList:true, subtree:true });

  void refreshStable();
})();
