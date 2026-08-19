(() => {
  function authHeaders() {
    const headers = new Headers({ 'Content-Type': 'application/json' });
    const token = window.MusikBotFetch?.getAuth?.();
    if (token) headers.set('Authorization', token);
    return headers;
  }

  async function playNow(item) {
    const nativeFetch = window.MusikBotFetch?.nativeFetch || window.fetch.bind(window);
    const response = await nativeFetch('/api/play', {
      method: 'POST',
      headers: authHeaders(),
      body: JSON.stringify({
        playNow: true,
        items: [{ id: item.id || crypto.randomUUID(), title: item.title, url: item.url, source: item.source, artist: item.artist || '' }]
      })
    });
    const body = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(body.error || `HTTP ${response.status}`);
    return body;
  }

  async function refreshPlayerState() {
    const nativeFetch = window.MusikBotFetch?.nativeFetch || window.fetch.bind(window);
    const headers = new Headers();
    const token = window.MusikBotFetch?.getAuth?.();
    if (token) headers.set('Authorization', token);
    const response = await nativeFetch('/api/state', { headers });
    if (!response.ok) return null;
    return response.json().catch(() => null);
  }

  document.addEventListener('click', async event => {
    const button = event.target?.closest?.('[data-play]');
    if (!button) return;
    const cached = window.MusikBotFetch?.getLastSearch?.();
    if (!cached) return;
    const items = [...cached.youtube, ...cached.radio, ...cached.spotify];
    const item = items[Number(button.dataset.play)];
    if (!item) return;

    event.preventDefault();
    event.stopImmediatePropagation();
    const notice = document.querySelector('#notice');
    if (notice) { notice.textContent = '▶ Wird sofort abgespielt …'; notice.classList.add('show'); }
    try {
      await playNow(item);
      const state = await refreshPlayerState();
      const now = document.querySelector('.now');
      if (now && state) {
        const strong = now.querySelector('strong');
        const span = now.querySelector('span');
        if (strong) strong.textContent = state.current?.title || 'Nichts läuft';
        if (span) span.textContent = `${state.paused ? '⏸ Pausiert' : '▶ Bereit'} · ${state.volume}% · ${state.mode} · ${state.settings?.outputType || ''}`;
      }
      if (notice) {
        notice.textContent = `„${item.title}“ wird jetzt direkt abgespielt.`;
        window.clearTimeout(window.__musikbotSearchPlayNotice);
        window.__musikbotSearchPlayNotice = window.setTimeout(() => notice.classList.remove('show'), 2500);
      }
    } catch (error) {
      if (notice) {
        notice.textContent = error.message || String(error);
        window.clearTimeout(window.__musikbotSearchPlayNotice);
        window.__musikbotSearchPlayNotice = window.setTimeout(() => notice.classList.remove('show'), 3500);
      }
    }
  }, true);

  window.__musikbotRegisterCleanup?.(() => {
    window.clearTimeout(window.__musikbotSearchPlayNotice);
  });
})();
