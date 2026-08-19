(() => {
  const nativeFetch = window.MusikBotFetch?.nativeFetch || window.fetch.bind(window);

  function authHeaders(headers = {}) {
    const token = window.MusikBotFetch?.getAuth?.();
    const out = new Headers(headers);
    if (token && !out.has('Authorization')) out.set('Authorization', token);
    return out;
  }

  async function playNow(item) {
    const response = await nativeFetch('/api/play', {
      method: 'POST',
      headers: authHeaders({ 'Content-Type': 'application/json' }),
      body: JSON.stringify({
        playNow: true,
        items: [{ id: item.id || crypto.randomUUID(), title: item.title, url: item.url, source: item.source, artist: item.artist || '' }]
      })
    });
    const body = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(body.error || `HTTP ${response.status}`);
    return body;
  }

  // Compatibility shim only. Search playback is owned by search-play-fix.js.
  // This file deliberately does not replace window.fetch or register a second click handler.
  window.MusikBotPlayNow = Object.assign(window.MusikBotPlayNow || {}, { playNow });
})();
