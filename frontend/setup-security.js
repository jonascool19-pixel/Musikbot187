(() => {
  const hashMatch = window.location.hash.match(/^#setup=([^&]+)$/);
  const queryToken = new URLSearchParams(window.location.search).get('setup') || '';
  const setupToken = hashMatch ? decodeURIComponent(hashMatch[1]) : queryToken.trim();
  const originalFetch = window.fetch.bind(window);

  const setupHeaders = init => {
    const headers = new Headers(init?.headers || '');
    if (setupToken) headers.set('X-MusikBot-Setup-Token', setupToken);
    headers.set('Content-Type', 'application/json');
    return headers;
  };

  window.fetch = (input, init = {}) => {
    const url = typeof input === 'string' ? input : input?.url || '';
    if (!setupToken || !url.endsWith('/api/setup')) return originalFetch(input, init);
    return originalFetch(input, { ...init, headers: setupHeaders(init) }).then(response => {
      if (response.ok) {
        const cleanUrl = window.location.pathname + window.location.search.replace(/([?&])setup=[^&]*&?/, (_, prefix) => prefix === '?' ? '?' : '').replace(/[?&]$/, '');
        history.replaceState(null, '', cleanUrl || window.location.pathname);
      }
      return response;
    });
  };

  function showSetup() {
    if (!setupToken) return;
    const app = document.querySelector('#app');
    if (!app || document.querySelector('#musikbot-setup')) return;
    app.innerHTML = `<main id="musikbot-setup" class="setup-shell"><section class="card setup-card"><h1>MusikBot187 Ersteinrichtung</h1><p>Lege jetzt den ersten Administrator-Benutzer an.</p><form id="musikbot-setup-form"><label>Benutzername<input id="setupName" name="name" autocomplete="username" minlength="3" maxlength="64" required></label><label>Passwort<input id="setupPassword" name="password" type="password" autocomplete="new-password" minlength="5" maxlength="256" required></label><button type="submit">Administrator erstellen</button><p id="setupError" class="muted" aria-live="polite"></p></form></section></main>`;
    const form = document.querySelector('#musikbot-setup-form');
    form?.addEventListener('submit', async event => {
      event.preventDefault();
      const errorNode = document.querySelector('#setupError');
      const button = form.querySelector('button[type="submit"]');
      button.disabled = true;
      if (errorNode) errorNode.textContent = '';
      try {
        const response = await window.fetch('/api/setup', { method: 'POST', body: JSON.stringify({ name: document.querySelector('#setupName')?.value || '', password: document.querySelector('#setupPassword')?.value || '' }) });
        const body = await response.json().catch(() => ({}));
        if (!response.ok) throw new Error(body.error || `HTTP ${response.status}`);
        const cleanUrl = window.location.pathname + window.location.search.replace(/([?&])setup=[^&]*&?/, (_, prefix) => prefix === '?' ? '?' : '').replace(/[?&]$/, '') || window.location.pathname;
        history.replaceState(null, '', cleanUrl);
        window.location.reload();
      } catch (error) {
        if (errorNode) errorNode.textContent = error.message || String(error);
        button.disabled = false;
      }
    });
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', showSetup, { once: true });
  else showSetup();
})();
