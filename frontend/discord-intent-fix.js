(() => {
  const originalFetch = window.fetch.bind(window);
  let discordCache = [];
  let installed = false;

  function installIntentControl() {
    const grid = document.querySelector('.discord-editor .grid');
    if (!grid || document.querySelector('#dintent')) return;
    const label = document.createElement('label');
    label.className = 'checklabel';
    label.innerHTML = '<input id="dintent" type="checkbox"> Message Content Intent';
    grid.appendChild(label);
    const id = document.querySelector('#did')?.value || '';
    const item = discordCache.find(entry => String(entry.id) === String(id));
    label.querySelector('#dintent').checked = item?.messageContentIntent === true;
  }

  function observe() {
    installIntentControl();
    if (installed) return;
    installed = true;
    new MutationObserver(() => installIntentControl()).observe(document.body, { childList: true, subtree: true });
  }

  window.fetch = async (input, init = {}) => {
    const request = input instanceof Request ? input : null;
    const url = new URL(request ? request.url : String(input), window.location.href);
    const method = String(init.method || request?.method || 'GET').toUpperCase();

    if (url.pathname === '/api/discord' && method === 'POST') {
      let payload = {};
      const raw = init.body ?? (request ? await request.clone().text() : '');
      try { payload = raw ? JSON.parse(raw) : {}; } catch { payload = {}; }
      const intent = document.querySelector('#dintent');
      payload.messageContentIntent = intent?.checked === true;
      init = { ...init, method: 'POST', headers: { ...(init.headers || {}), 'Content-Type': 'application/json' }, body: JSON.stringify(payload) };
      const response = await originalFetch(input, init);
      if (response.ok && payload.id) {
        const existing = discordCache.findIndex(entry => String(entry.id) === String(payload.id));
        const updated = { ...(existing >= 0 ? discordCache[existing] : {}), ...payload };
        if (existing >= 0) discordCache[existing] = updated; else discordCache.push(updated);
      }
      return response;
    }

    const response = await originalFetch(input, init);
    if (url.pathname === '/api/discord' && method === 'GET' && response.ok) {
      try { discordCache = await response.clone().json(); } catch { /* keep last good cache */ }
      queueMicrotask(installIntentControl);
    }
    return response;
  };

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', observe, { once: true });
  else observe();
})();
