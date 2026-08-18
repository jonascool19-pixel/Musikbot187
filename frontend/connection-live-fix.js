(() => {
  let busy = false;
  const nativeFetch = () => window.MusikBotFetch?.nativeFetch || window.fetch.bind(window);
  const auth = () => window.MusikBotFetch?.getAuth?.() || '';
  const notice = text => {
    const node = document.querySelector('#notice');
    if (!node) return;
    node.textContent = text;
    node.classList.add('show');
    clearTimeout(window.__musikbotConnectionNotice);
    window.__musikbotConnectionNotice = setTimeout(() => node.classList.remove('show'), 3000);
  };
  const api = async (path, options = {}) => {
    const headers = new Headers(options.headers || {});
    const token = auth();
    if (token && !headers.has('Authorization')) headers.set('Authorization', token);
    const response = await nativeFetch()(path, { ...options, headers });
    const body = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(body.error || `HTTP ${response.status}`);
    return body;
  };
  document.addEventListener('click', async event => {
    const button = event.target?.closest?.('#ds');
    if (!button || busy) return;
    event.preventDefault();
    event.stopImmediatePropagation();
    busy = true;
    button.disabled = true;
    try {
      const value = id => document.querySelector(`#${id}`)?.value || '';
      await api('/api/discord', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          id: value('did'), name: value('dn'), token: value('dt'), clientId: value('dc'),
          guildId: value('dg'), channelId: value('dv'), prefix: value('dp'),
          messageContentIntent: Boolean(document.querySelector('#dintent')?.checked),
          enabled: Boolean(document.querySelector('#de')?.checked)
        })
      });
      notice('Discord gespeichert.');
      const tab = document.querySelector('[data-tab="connections"]');
      if (tab) tab.click();
    } catch (error) {
      notice(error.message || String(error));
    } finally {
      busy = false;
      button.disabled = false;
    }
  }, true);
})();
