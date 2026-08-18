(() => {
  const params = new URLSearchParams(window.location.search);
  const hash = window.location.hash.match(/^#setup=([^&]+)$/);
  const token = params.get('setup')?.trim() || (hash ? decodeURIComponent(hash[1]) : '');
  if (!token) return;

  const renderSetup = () => {
    const app = document.querySelector('#app');
    if (!app || document.querySelector('#musikbot-setup')) return;
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
        const clean = window.location.pathname + window.location.search.replace(/([?&])setup=[^&]*&?/, (_, prefix) => prefix === '?' ? '?' : '').replace(/[?&]$/, '');
        history.replaceState(null, '', clean || window.location.pathname);
        window.location.reload();
      } catch (error) {
        if (errorNode) errorNode.textContent = error.message || String(error);
        button.disabled = false;
      }
    }, { once: true });
  };

  renderSetup();
  window.addEventListener('DOMContentLoaded', renderSetup, { once: true });
  const timer = setInterval(() => {
    renderSetup();
    if (document.querySelector('#musikbot-setup')) clearInterval(timer);
  }, 50);
  setTimeout(() => clearInterval(timer), 5000);
})();
