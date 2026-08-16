(() => {
  let editing = false;
  let lastState = null;
  let authenticated = false;
  let setupReady = false;
  let refreshTimer = null;

  const api = async (url, options = {}) => {
    const response = await fetch(url, { credentials: 'include', headers: { 'Content-Type': 'application/json', ...(options.headers || {}) }, ...options });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) {
      const error = new Error(data.error || `HTTP ${response.status}`);
      error.status = response.status;
      throw error;
    }
    return data;
  };

  const esc = value => String(value ?? '').replace(/[&<>\"']/g, c => ({ '&':'&amp;', '<':'&lt;', '>':'&gt;', '\"':'&quot;', "'":'&#39;' }[c]));
  const formatBytes = bytes => { let n = Math.max(0, Number(bytes) || 0), i = 0; const u = ['B','KB','MB','GB','TB']; while (n >= 1024 && i < u.length - 1) { n /= 1024; i++; } return `${n.toFixed(i ? 1 : 0)} ${u[i]}`; };
  const formatTime = sec => { const s = Math.max(0, Math.floor(Number(sec) || 0)); return `${Math.floor(s/60)}:${String(s%60).padStart(2,'0')}`; };
  const activeInstance = s => (s?.instances || []).find(x => x.id === s.activeInstance) || (s?.instances || []).find(x => x.connected) || null;

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
    if (!top || location.pathname !== '/' || !setupReady) return;
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
    if (tile && (!editing || !setupReady)) { e.preventDefault(); e.stopImmediatePropagation(); }
  }, true);
  document.addEventListener('dragover', e => {
    const tile = e.target.closest?.('[data-tile]');
    if (tile && (!editing || !setupReady)) { e.preventDefault(); e.stopImmediatePropagation(); }
  }, true);
  document.addEventListener('drop', e => {
    const tile = e.target.closest?.('[data-tile]');
    if (tile && (!editing || !setupReady)) { e.preventDefault(); e.stopImmediatePropagation(); }
  }, true);

  function renderNowPlaying(instance) {
    const tile = document.querySelector('.hero-tile');
    if (!tile || !instance) return;
    const source = instance.type === 'discord' ? 'Discord' : instance.type === 'ts3' ? 'TeamSpeak 3' : '—';
    const cover = instance.coverUrl
      ? `<img src="${esc(instance.coverUrl)}" alt="" loading="lazy" onerror="this.replaceWith(Object.assign(document.createElement('div'),{className:'cover-fallback',textContent:'♫'}))">`
      : '<div class="cover-fallback">♫</div>';
    const title = instance.playing || 'Keine Wiedergabe';
    const status = instance.playing ? '▶ Wiedergabe' : instance.connected ? '● Verbunden' : '● Offline';
    const current = tile.querySelector('.now-playing');
    if (current) current.innerHTML = `<div class="cover">${cover}</div><div><h2>${esc(title)}</h2><p>${esc(instance.name || 'Keine aktive Instanz')}</p><div class="meta"><span>Quelle</span><b>${esc(source)}</b><span>Zeit</span><b>${formatTime(instance.elapsedSeconds || 0)}</b><span>Status</span><b class="${instance.playing ? 'ok' : 'bad'}">${status}</b></div></div>`;
    if (!tile.querySelector('.stable-volume')) {
      const controls = tile.querySelector('.controls');
      if (controls) controls.insertAdjacentHTML('beforeend', `<label class="stable-volume" title="Lautstärke">🔊 <input id="stableVolume" type="range" min="0" max="100" value="${Number(instance.volume ?? 80)}"></label>`);
      document.querySelector('#stableVolume')?.addEventListener('input', async e => {
        try { await api('/api/control', { method:'POST', body:JSON.stringify({ action:'volume', value:Number(e.target.value) }) }); }
        catch (error) { if (error.status === 401) { authenticated = false; setupReady = false; stopPolling(); } }
      });
    } else {
      const volume=document.querySelector('#stableVolume');
      if(volume&&document.activeElement!==volume) volume.value=Number(instance.volume??80);
    }
  }

  function updateNetwork(s) {
    const net=s?.system||{};
    const top=document.querySelector('#topNet');
    if(top) top.textContent=`NET ↓ ${formatBytes(net.networkRx||0)}/s ↑ ${formatBytes(net.networkTx||0)}/s`;
    const tile=document.querySelector('.system-tile .system-mini');
    if(tile) tile.innerHTML=`<span>NET ↓ ${formatBytes(net.networkRx||0)}/s</span><span>↑ ${formatBytes(net.networkTx||0)}/s</span>`;
  }

  async function checkAuth() {
    try {
      const me = await api('/api/me');
      authenticated = true;
      setupReady = Boolean(me.setupComplete);
      return { authenticated: true, setupReady };
    } catch (error) {
      authenticated = false;
      setupReady = false;
      return { authenticated: false, setupReady: false };
    }
  }

  function stopPolling() {
    if (refreshTimer) {
      clearTimeout(refreshTimer);
      refreshTimer = null;
    }
  }

  function scheduleRefresh(delay = 3000) {
    stopPolling();
    refreshTimer = setTimeout(() => { void refreshStable(); }, delay);
  }

  async function refreshStable() {
    const authState = await checkAuth();
    if (!authState.authenticated || !authState.setupReady) {
      stopPolling();
      scheduleRefresh(5000);
      return;
    }

    try {
      const fresh=await api('/api/state');
      lastState=fresh;
      if(location.pathname==='/') {
        renderNowPlaying(activeInstance(fresh));
        updateNetwork(fresh);
        ensureEditorButton();
      }
      injectNetworkTab();
      injectPlaylistOpeners(fresh.playlists||[]);
    } catch (error) {
      if (error.status === 401 || error.status === 409) {
        authenticated = false;
        setupReady = false;
        stopPolling();
        scheduleRefresh(5000);
        return;
      }
    }
    scheduleRefresh(3000);
  }

  function injectNetworkTab() {
    if (!setupReady) return;
    const tabs=document.querySelector('.settings-tabs'); if(!tabs)return;
    let tab=tabs.querySelector('[data-settab="network"]'); if(tab)return;
    tab=document.createElement('button'); tab.dataset.settab='network'; tab.textContent='Netzwerkverbrauch';
    const errorTab = tabs.querySelector('[data-settab="errors"]');
    if (errorTab) errorTab.after(tab); else tabs.appendChild(tab);
    tab.addEventListener('click',()=>{tabs.querySelectorAll('button').forEach(x=>x.classList.toggle('active',x===tab)); renderNetworkSettings(document.querySelector('#settingsView'));});
  }

  async function renderNetworkSettings(target) {
    if(!target || !setupReady)return;
    const authState = await checkAuth();
    if (!authState.authenticated || !authState.setupReady) return;
    try {
      const [info,stats]=await Promise.all([api('/api/network/interfaces'),api('/api/network/stats')]);
      target.innerHTML=`<section class="page-panel"><div class="page-head"><div><h2>Netzwerkverbrauch</h2><p>Gesamtverbrauch sowie Download und Upload des ausgewählten Interfaces.</p></div></div><div class="form-grid two"><label>Netzwerkkarte<select id="stableNetworkInterface">${(info.interfaces||[]).map(name=>`<option value="${esc(name)}" ${name===info.selected?'selected':''}>${esc(name)}</option>`).join('')}</select></label><div class="metric-card"><span>Ausgewählt</span><strong>${esc(stats.interface)}</strong><small>Interface für die Gesamtzählung</small></div></div><div class="system-cards"><div class="metric-card"><span>Gesamt</span><strong>${formatBytes(stats.total)}</strong><small>RX + TX</small></div><div class="metric-card"><span>Download</span><strong>${formatBytes(stats.rxTotal)}</strong><small>RX</small></div><div class="metric-card"><span>Upload</span><strong>${formatBytes(stats.txTotal)}</strong><small>TX</small></div><div class="metric-card"><span>Live</span><strong>↓ ${formatBytes(stats.rxRate)}/s</strong><small>↑ ${formatBytes(stats.txRate)}/s</small></div></div></section>`;
      document.querySelector('#stableNetworkInterface')?.addEventListener('change',async e=>{await api('/api/settings',{method:'PUT',body:JSON.stringify({settings:{networkInterface:e.target.value}})});await renderNetworkSettings(target);});
    }catch(error){if(error.status===401||error.status===409){authenticated=false;setupReady=false;stopPolling();return;}target.innerHTML=`<div class="page-panel"><div class="empty">${esc(error.message)}</div></div>`;}
  }

  function injectPlaylistOpeners(playlists) {
    if (!setupReady) return;
    document.querySelectorAll('.playlist-card').forEach(card=>{
      if(card.querySelector('.stable-open-playlist'))return;
      const title=card.querySelector('h3')?.textContent?.trim();
      const p=playlists.find(x=>x.name===title); if(!p)return;
      const actions=card.querySelector('div:last-child'); if(!actions)return;
      const b=document.createElement('button'); b.className='stable-open-playlist'; b.textContent='Öffnen'; b.addEventListener('click',()=>openPlaylist(p));
      actions.insertBefore(b,actions.firstChild);
    });
  }

  function openPlaylist(playlist) {
    if (!setupReady) return;
    document.querySelector('#stablePlaylistModal')?.remove();
    const modal=document.createElement('div'); modal.id='stablePlaylistModal'; modal.className='stable-modal-backdrop';
    modal.innerHTML=`<div class="stable-modal"><div class="page-head"><div><h2>${esc(playlist.name)}</h2><p>${playlist.items?.length||0} Titel</p></div><button id="stableClose">✕</button></div><div class="stable-playlist-list">${(playlist.items||[]).map((item,i)=>`<div class="queue-item"><span>${i+1}</span><b>${esc(item.title||item.input)}</b><button data-del="${i}">Löschen</button></div>`).join('')||'<div class="empty">Playlist ist leer.</div>'}</div></div>`;
    document.body.appendChild(modal); modal.querySelector('#stableClose').onclick=()=>modal.remove(); modal.addEventListener('click',e=>{if(e.target===modal)modal.remove();});
    modal.querySelectorAll('[data-del]').forEach(b=>b.addEventListener('click',async()=>{try{await api(`/api/playlist/${playlist.id}/item/${b.dataset.del}`,{method:'DELETE'});modal.remove();await refreshStable();document.querySelector('[data-nav="playlists"]')?.click();}catch(error){if(error.status===401||error.status===409){authenticated=false;setupReady=false;stopPolling();}}}));
  }

  const observer=new MutationObserver(()=>{if(authenticated && setupReady){ensureEditorButton();lockDashboard();injectNetworkTab();}});
  observer.observe(document.body,{childList:true,subtree:true});

  void refreshStable();
})();
