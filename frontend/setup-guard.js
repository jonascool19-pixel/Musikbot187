(() => {
  const getToken = () => {
    const params = new URLSearchParams(window.location.search);
    const hash = window.location.hash.match(/^#setup=([^&]+)$/);
    return params.get('setup')?.trim() || (hash ? decodeURIComponent(hash[1]) : '');
  };
  const token = getToken();
  if (!token) return;

  const renderSetup = () => {
    const app = document.querySelector('#app');
    if (!app) return false;
    if (document.querySelector('#musikbot-setup')) return true;
    const login = document.querySelector('#loginForm');
    if (!login && app.querySelector('.login')) return false;
    app.innerHTML = `<main id="musikbot-setup" class="setup-shell"><section class="card setup-card"><h1>MusikBot187 Ersteinrichtung</h1><p>Lege jetzt den ersten Administrator-Benutzer an.</p><form id="musikbot-setup-form"><label>Benutzername<input id="setupName" autocomplete="username" minlength="3" maxlength="64" required></label><label>Passwort<input id="setupPassword" type="password" autocomplete="new-password" minlength="5" maxlength="256" required></label><button type="submit">Administrator erstellen</button><p id="setupError" class="muted" aria-live="polite"></p></form></section></main>`;
    const form = document.querySelector('#musikbot-setup-form');
    form?.addEventListener('submit', async event => {
      event.preventDefault();
      const button = form.querySelector('button[type="submit"]');
      const errorNode = document.querySelector('#setupError');
      button.disabled = true;
      try {
        const response = await fetch('/api/setup', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'X-MusikBot-Setup-Token': token },
          body: JSON.stringify({ name: document.querySelector('#setupName').value, password: document.querySelector('#setupPassword').value })
        });
        const body = await response.json().catch(() => ({}));
        if (!response.ok) throw new Error(body.error || `HTTP ${response.status}`);
        const clean = window.location.pathname;
        history.replaceState(null, '', clean);
        window.location.reload();
      } catch (error) {
        if (errorNode) errorNode.textContent = error.message || String(error);
        button.disabled = false;
      }
    }, { once: true });
    return true;
  };

  window.MusikBotSetupShow = renderSetup;
  const enforce = () => {
    if (!getToken()) return;
    renderSetup();
  };
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', enforce);
  else enforce();
  new MutationObserver(enforce).observe(document.documentElement, { childList: true, subtree: true });
})();
