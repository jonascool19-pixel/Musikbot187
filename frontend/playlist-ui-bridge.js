(() => {
  const nativeFetch = () => window.MusikBotFetch?.nativeFetch || window.fetch.bind(window);
  const auth = () => window.MusikBotFetch?.getAuth?.() || '';
  const api = (path, options = {}) => {
    const headers = new Headers(options.headers || {});
    const token = auth(); if (token) headers.set('Authorization', token);
    options.headers = headers;
    return nativeFetch()(path, options).then(async r => {
      const body = await r.json().catch(() => ({}));
      if (!r.ok) throw Error(body.error || `HTTP ${r.status}`);
      return body;
    });
  };
  const post = (path, body = {}) => api(path, { method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify(body) });
  const note = text => { const n=document.querySelector('#notice'); if(!n)return; n.textContent=text; n.classList.add('show'); clearTimeout(window.__playlistBridgeNotice); window.__playlistBridgeNotice=setTimeout(()=>n.classList.remove('show'),3000); };
  const uid = () => globalThis.crypto?.randomUUID?.() || `${Date.now()}-${Math.random().toString(36).slice(2)}`;

  async function addItem(item) {
    if (!item) return note('Kein Titel ausgewählt.');
    if (window.__musikbotPlaylistAdd) return window.__musikbotPlaylistAdd(item);
  }

  async function addQueueItem(index) {
    try { const data = await api('/api/state'); await addItem(data.queue?.[index]); } catch(e) { note(e.message); }
  }

  async function addSearchItem(index) {
    try {
      const input=document.querySelector('#q'); const source=document.querySelector('#src');
      const query=input?.value?.trim(); if(!query) return note('Bitte zuerst suchen.');
      const result=await api(`/api/search?q=${encodeURIComponent(query)}&source=${encodeURIComponent(source?.value || 'all')}`);
      const items=[...(result.youtube||[]),...(result.radio||[]),...(result.spotify||[])];
      await addItem(items[index]);
    } catch(e) { note(e.message); }
  }

  async function addCurrent() {
    try { const data=await api('/api/state'); await addItem(data.current); } catch(e) { note(e.message); }
  }

  function syncPlayer() {
    if(document.body.dataset.currentTab!=='player') return;
    const now=document.querySelector('.now');
    if(!now || document.querySelector('#playlistCurrentAdd')) return;
    const b=document.createElement('button'); b.id='playlistCurrentAdd'; b.type='button'; b.textContent='＋ Playlist'; b.className='playlist-current-add'; b.onclick=addCurrent;
    now.appendChild(b);
  }

  document.addEventListener('click', event => {
    const playlistTab=event.target?.closest?.('[data-tab="playlists"]');
    const playerTab=event.target?.closest?.('[data-tab="player"]');
    if(playlistTab) window.setTimeout(()=>window.__musikbotPlaylistRefresh?.().catch?.(e=>note(e.message)),80);
    if(playerTab) window.setTimeout(syncPlayer,80);
  });

  document.addEventListener('click', event => {
    const b=event.target?.closest?.('[data-plq],[data-pl]');
    if(!b || !window.__musikbotPlaylistAdd) return;
    event.preventDefault(); event.stopImmediatePropagation();
    if(b.dataset.plq!==undefined) void addQueueItem(Number(b.dataset.plq));
    else void addSearchItem(Number(b.dataset.pl));
  }, true);

  const originalSearchResultsHook = window.__musikbotEnhanceMusicResults;
  if (typeof originalSearchResultsHook === 'function') originalSearchResultsHook();
  window.setTimeout(syncPlayer,300);
})();
