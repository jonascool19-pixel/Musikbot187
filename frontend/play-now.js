(() => {
  const nativeFetch = window.MusikBotFetch?.nativeFetch || window.fetch.bind(window);
  let latestSearch = [];

  function authHeaders(headers = {}) {
    const token = window.MusikBotFetch?.getAuth?.();
    const out = new Headers(headers);
    if (token && !out.has('Authorization')) out.set('Authorization', token);
    return out;
  }

  window.fetch = async (...args) => {
    const response = await nativeFetch(...args);
    const input = args[0];
    const url = typeof input === 'string' ? input : input?.url || '';
    if (/^\/api\/search(?:\?|$)/.test(url) && response.ok) {
      try {
        const body = await response.clone().json();
        latestSearch = [...(body.youtube || []), ...(body.radio || []), ...(body.spotify || [])];
      } catch {}
    }
    return response;
  };

  async function playNow(item) {
    const playHeaders = authHeaders({ 'Content-Type': 'application/json' });
    const playResponse = await nativeFetch('/api/play', {
      method: 'POST',
      headers: playHeaders,
      body: JSON.stringify({
        playNow: true,
        items: [{ id: item.id || `${Date.now()}`, title: item.title, url: item.url, source: item.source, artist: item.artist || '' }]
      })
    });
    const body = await playResponse.json().catch(() => ({}));
    if (!playResponse.ok) throw new Error(body.error || `HTTP ${playResponse.status}`);
    return body;
  }

  document.addEventListener('click', async event => {
    const button = event.target?.closest?.('[data-play]');
    if (!button || !latestSearch.length) return;
    const index = Number(button.dataset.play);
    const item = latestSearch[index];
    if (!item) return;
    event.preventDefault();
    event.stopImmediatePropagation();
    const notice = document.querySelector('#notice');
    if (notice) { notice.textContent = '▶ Wird sofort abgespielt …'; notice.classList.add('show'); }
    try {
      await playNow(item);
      document.querySelector('#refresh')?.click();
      if (notice) { notice.textContent = `„${item.title}“ wird jetzt abgespielt.`; setTimeout(() => notice.classList.remove('show'), 2500); }
    } catch (error) {
      if (notice) { notice.textContent = error.message || String(error); setTimeout(() => notice.classList.remove('show'), 3500); }
    }
  }, true);
})();
