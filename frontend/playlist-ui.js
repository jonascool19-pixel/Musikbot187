(() => {
  const nativeFetch = () => window.MusikBotFetch?.nativeFetch || window.fetch.bind(window);
  const auth = () => window.MusikBotFetch?.getAuth?.() || '';
  const q = s => document.querySelector(s);
  const esc = v => String(v ?? '').replace(/[&<>\"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','\"':'&quot;',"'":'&#39;'}[c]));
  const id = () => (globalThis.crypto?.randomUUID?.() || `${Date.now()}-${Math.random().toString(36).slice(2)}`);
  const api = (path, options = {}) => {
    const headers = new Headers(options.headers || {});
    const token = auth();
    if (token && !headers.has('Authorization')) headers.set('Authorization', token);
    options.headers = headers;
    return nativeFetch()(path, options).then(async r => {
      const body = await r.json().catch(() => ({}));
      if (!r.ok) throw Error(body.error || `HTTP ${r.status}`);
      return body;
    });
  };
  const post = (path, body = {}) => api(path, { method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify(body) });
  const del = path => api(path, { method:'DELETE' });
  const put = (path, body = {}) => api(path, { method:'PUT', headers:{'Content-Type':'application/json'}, body:JSON.stringify(body) });
  const note = text => {
    const n = q('#notice'); if (!n) return;
    n.textContent = text; n.classList.add('show'); clearTimeout(window.__playlistNotice);
    window.__playlistNotice = setTimeout(() => n.classList.remove('show'), 3000);
  };

  let opened = null;
  let cache = [];

  function injectStyle() {
    if (q('#playlistUiStyle')) return;
    const style = document.createElement('style'); style.id = 'playlistUiStyle';
    style.textContent = `
      .playlist-grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(260px,1fr));gap:14px}
      .playlist-tile{cursor:pointer;transition:transform .15s ease,box-shadow .15s ease}
      .playlist-tile:hover{transform:translateY(-2px);box-shadow:0 10px 30px rgba(0,0,0,.18)}
      .playlist-cover{height:150px;border-radius:14px;background:linear-gradient(135deg,var(--accent,#0b69b3),#111827);display:flex;align-items:center;justify-content:center;font-size:44px;margin-bottom:12px}
      .playlist-detail-head{display:flex;gap:16px;align-items:center;justify-content:space-between;flex-wrap:wrap}
      .playlist-detail-title{font-size:28px;margin:0}
      .playlist-track{display:grid;grid-template-columns:44px minmax(0,1fr) auto;gap:12px;align-items:center}
      .playlist-track-number{font-weight:700;opacity:.7;text-align:center}
      .playlist-track-title{min-width:0}.playlist-track-title b{display:block;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
      .playlist-track-title small{opacity:.7}
      .playlist-track-actions{display:flex;gap:6px;flex-wrap:wrap;justify-content:flex-end}
      .playlist-back{margin-bottom:12px}
      @media(max-width:700px){.playlist-track{grid-template-columns:32px minmax(0,1fr)}.playlist-track-actions{grid-column:2;justify-content:flex-start}}
    `;
    document.head.appendChild(style);
  }

  async function saveOrder(playlist, items) {
    // Use the existing public playlist item endpoints so older installations remain compatible.
    for (const item of playlist.items) await del(`/api/playlists/${encodeURIComponent(playlist.id)}/items/${encodeURIComponent(item.id)}`);
    if (items.length) await post(`/api/playlists/${encodeURIComponent(playlist.id)}/items`, { items });
    playlist.items = items;
  }

  async function openPlaylist(idValue) {
    opened = await api(`/api/playlists/${encodeURIComponent(idValue)}`);
    renderDetail();
  }

  async function playPlaylist(playlist) {
    await post(`/api/playlists/${encodeURIComponent(playlist.id)}/play`);
    note(`„${playlist.name}“ wird abgespielt.`);
  }

  async function addItemToPlaylist(item) {
    cache = await api('/api/playlists');
    if (!cache.length) return note('Keine Playlist vorhanden. Erstelle zuerst eine Playlist.');
    showPicker(item);
  }

  function showPicker(item) {
    q('#playlistPicker')?.remove();
    const modal = document.createElement('div'); modal.id = 'playlistPicker'; modal.className = 'modal-backdrop';
    modal.innerHTML = `<div class="modal-card"><div class="sectionhead"><h2>Zur Playlist hinzufügen</h2><button id="ppClose">✕</button></div><div class="list">${cache.map(p => `<button class="listrow" data-pp="${esc(p.id)}"><span>📋 <b>${esc(p.name)}</b></span><small>${p.items.length} Titel</small></button>`).join('')}</div></div>`;
    document.body.appendChild(modal);
    q('#ppClose').onclick = () => modal.remove();
    modal.addEventListener('click', async event => {
      const button = event.target.closest('[data-pp]'); if (!button) return;
      try {
        const p = cache.find(x => x.id === button.dataset.pp); if (!p) return;
        await post(`/api/playlists/${encodeURIComponent(p.id)}/items`, { items:[{id:item.id || id(), title:item.title || item.url, url:item.url, source:item.source || 'youtube', artist:item.artist || ''}] });
        modal.remove(); note(`„${p.name}“ wurde hinzugefügt.`);
      } catch(error) { note(error.message); }
    });
  }

  function renderOverview() {
    const view = q('#view'); if (!view) return;
    view.innerHTML = `<section><div class="sectionhead"><div><h2>Playlists</h2><small>Deine Musiklisten übersichtlich wie eine Mediathek</small></div><button id="plNew">＋ Playlist</button></div><div class="playlist-grid">${cache.length ? cache.map(p => `<article class="card playlist-tile" data-open-pl="${esc(p.id)}"><div class="playlist-cover">🎵</div><div class="sectionhead"><div><b>${esc(p.name)}</b><small>${p.items.length} Titel</small></div><button type="button" data-play-pl="${esc(p.id)}">▶ Play</button></div><button type="button" class="secondary" data-open-pl="${esc(p.id)}">Öffnen</button></article>`).join('') : '<p class="muted">Noch keine Playlists vorhanden.</p>'}</div></section>`;
    q('#plNew').onclick = async () => {
      const name = prompt('Name der neuen Playlist:'); if (!name?.trim()) return;
      try { const p = await post('/api/playlists', { name:name.trim() }); await refresh(); await openPlaylist(p.id); } catch(e) { note(e.message); }
    };
    view.querySelectorAll('[data-open-pl]').forEach(node => node.onclick = event => { event.stopPropagation(); openPlaylist(node.dataset.openPl); });
    view.querySelectorAll('[data-play-pl]').forEach(node => node.onclick = async event => { event.stopPropagation(); const p = cache.find(x => x.id === node.dataset.playPl); if (p) try { await playPlaylist(p); } catch(e) { note(e.message); } });
  }

  function renderDetail() {
    const view = q('#view'); if (!view || !opened) return;
    const p = opened;
    view.innerHTML = `<section><button id="plBack" class="playlist-back">← Alle Playlists</button><div class="playlist-detail-head"><div><h2 class="playlist-detail-title">${esc(p.name)}</h2><small>${p.items.length} Titel</small></div><div class="controls"><button id="plPlay">▶ Playlist abspielen</button><button id="plAdd">＋ Titel hinzufügen</button></div></div></section><section><div class="list">${p.items.length ? p.items.map((item,index) => `<div class="listrow playlist-track"><span class="playlist-track-number">${index+1}</span><div class="playlist-track-title"><b>${esc(item.title || item.url)}</b><small>${esc(item.artist || item.source || '')}</small></div><div class="playlist-track-actions"><button data-up="${index}" ${index===0?'disabled':''}>↑</button><button data-down="${index}" ${index===p.items.length-1?'disabled':''}>↓</button><button data-remove-track="${esc(item.id)}" class="danger">Entfernen</button></div></div>`).join('') : '<p class="muted">Diese Playlist ist leer.</p>'}</div></section>`;
    q('#plBack').onclick = () => { opened = null; renderOverview(); };
    q('#plPlay').onclick = async () => { try { await playPlaylist(p); } catch(e) { note(e.message); } };
    q('#plAdd').onclick = () => {
      const title = prompt('Titel:'); if (!title?.trim()) return;
      const url = prompt('URL / Quelle:'); if (!url?.trim()) return;
      addItemToPlaylist({ id:id(), title:title.trim(), url:url.trim(), source:/^https?:/i.test(url) ? 'direct' : 'youtube' });
    };
    view.querySelectorAll('[data-up]').forEach(b => b.onclick = async () => { const i=Number(b.dataset.up); if(i<=0)return; try { const items=[...p.items]; [items[i-1],items[i]]=[items[i],items[i-1]]; await saveOrder(p,items); await openPlaylist(p.id); } catch(e){ note(e.message); } });
    view.querySelectorAll('[data-down]').forEach(b => b.onclick = async () => { const i=Number(b.dataset.down); if(i<0||i>=p.items.length-1)return; try { const items=[...p.items]; [items[i],items[i+1]]=[items[i+1],items[i]]; await saveOrder(p,items); await openPlaylist(p.id); } catch(e){ note(e.message); } });
    view.querySelectorAll('[data-remove-track]').forEach(b => b.onclick = async () => { try { await del(`/api/playlists/${encodeURIComponent(p.id)}/items/${encodeURIComponent(b.dataset.removeTrack)}`); await openPlaylist(p.id); } catch(e){ note(e.message); } });
  }

  async function refresh() { cache = await api('/api/playlists'); renderOverview(); }

  function hookNavigation() {
    document.addEventListener('click', event => {
      const tab = event.target?.closest?.('[data-tab="playlists"]');
      if (!tab) return;
      window.setTimeout(() => refresh().catch(e => note(e.message)), 50);
    });
  }

  window.__musikbotPlaylistAdd = addItemToPlaylist;
  window.__musikbotRegisterCleanup?.(hookNavigation);
  injectStyle();
})();
