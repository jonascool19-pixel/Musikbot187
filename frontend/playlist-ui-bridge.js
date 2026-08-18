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
  const note = text => { const n=document.querySelector('#notice'); if(!n)return; n.textContent=text; n.classList.add('show'); clearTimeout(window.__playlistBridgeNotice); window.__playlistBridgeNotice=setTimeout(()=>n.classList.remove('show'),3000); };

  async function addCurrent() {
    try {
      const data = await api('/api/state');
      const item = data.current;
      if (!item) return note('Aktuell läuft kein Titel.');
      if (window.__musikbotPlaylistAdd) await window.__musikbotPlaylistAdd(item);
    } catch(e) { note(e.message); }
  }

  function syncPlayer() {
    const now = document.querySelector('.now');
    const existing = document.querySelector('#playlistCurrentAdd');
    if (!now) { existing?.remove(); return; }
    if (existing && now.contains(existing)) return;
    const title = now.querySelector('strong')?.textContent?.trim();
    if (!title || title === 'Nichts läuft') { existing?.remove(); return; }
    existing?.remove();
    const b=document.createElement('button');
    b.id='playlistCurrentAdd'; b.type='button'; b.textContent='＋ Playlist'; b.className='playlist-current-add';
    b.title='Aktuellen Titel zu einer Playlist hinzufügen'; b.onclick=addCurrent; now.appendChild(b);
  }

  const onNavigation = event => {
    if(event.target?.closest?.('[data-tab="player"]')) window.setTimeout(syncPlayer,100);
  };
  document.addEventListener('click', onNavigation);
  let observedView = null;
  let observer = null;
  const attachObserver = () => {
    const view = document.querySelector('#view');
    if (!view || observedView === view) { syncPlayer(); return; }
    observer?.disconnect();
    observedView = view;
    observer = new MutationObserver(() => syncPlayer());
    observer.observe(view, { childList:true });
    syncPlayer();
  };
  window.setTimeout(attachObserver,350);
  window.__musikbotRegisterCleanup?.(() => {
    document.removeEventListener('click', onNavigation);
    observer?.disconnect(); observer = null; observedView = null;
  });
})();
