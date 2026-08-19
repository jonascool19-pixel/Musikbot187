(() => {
  let busy = false;

  function readAuth() {
    try {
      const value = window.MusikBotAuthSession?.readAuth?.();
      if (value?.token && value?.user) return value;
    } catch {}
    try {
      const value = JSON.parse(sessionStorage.getItem('musikbot187.auth') || 'null');
      return value?.token && value?.user ? value : null;
    } catch {
      return null;
    }
  }

  async function requestSkip() {
    const auth = readAuth();
    const headers = { 'Content-Type': 'application/json' };
    if (auth?.token) headers.Authorization = `Bearer ${auth.token}`;

    let response = await fetch('/api/play/skip', { method: 'POST', headers });
    if (response.status === 401 && auth?.token) {
      const retryHeaders = { 'Content-Type': 'application/json', Authorization: `Bearer ${auth.token}` };
      response = await fetch('/api/play/skip', { method: 'POST', headers: retryHeaders, cache: 'no-store' });
    }

    const body = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(body.error || `HTTP ${response.status}`);
    return body;
  }

  document.addEventListener('click', async event => {
    const button = event.target?.closest?.('[data-a="skip"]');
    if (!button || busy) return;

    event.preventDefault();
    event.stopImmediatePropagation();
    busy = true;
    button.disabled = true;

    try {
      await requestSkip();
      const refresh = document.querySelector('#refresh');
      if (refresh) refresh.click();
      const notice = document.querySelector('#notice');
      if (notice) {
        notice.textContent = '⏭ Nächster Titel wird abgespielt …';
        notice.classList.add('show');
        clearTimeout(window.__musikbotSkipNotice);
        window.__musikbotSkipNotice = setTimeout(() => notice.classList.remove('show'), 2500);
      }
    } catch (error) {
      const notice = document.querySelector('#notice');
      if (notice) {
        notice.textContent = `Skip fehlgeschlagen: ${error.message || String(error)}`;
        notice.classList.add('show');
        clearTimeout(window.__musikbotSkipNotice);
        window.__musikbotSkipNotice = setTimeout(() => notice.classList.remove('show'), 4000);
      }
    } finally {
      busy = false;
      button.disabled = false;
    }
  }, true);
})();
