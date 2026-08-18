(() => {
  const nativeFetch = window.fetch.bind(window);

  function normalizeLoginInit(init = {}) {
    if (!init?.body) return init;
    try {
      const body = typeof init.body === 'string' ? JSON.parse(init.body) : null;
      if (!body || (!body.username && !body.name)) return init;
      const name = String(body.name || body.username || '').trim();
      if (!name) return init;
      const headers = new Headers(init.headers || {});
      headers.set('Content-Type', 'application/json');
      const payload = { ...body, name };
      delete payload.username;
      return { ...init, headers, body: JSON.stringify(payload) };
    } catch {
      return init;
    }
  }

  window.fetch = (input, init = {}) => {
    const url = typeof input === 'string' ? input : input?.url || '';
    if (url.endsWith('/api/login')) return nativeFetch(input, normalizeLoginInit(init));
    return nativeFetch(input, init);
  };

  // Deterministic fallback for the dynamically rendered login form.
  function bindForm() {
    const form = document.querySelector('#loginForm');
    if (!form || form.dataset.loginFixBound === '1') return;
    form.dataset.loginFixBound = '1';
    form.addEventListener('submit', async event => {
      event.preventDefault();
      event.stopImmediatePropagation();
      const user = document.querySelector('#user')?.value || '';
      const pass = document.querySelector('#pass')?.value || '';
      const button = form.querySelector('button[type="submit"]');
      if (button) button.disabled = true;
      try {
        const response = await nativeFetch('/api/login', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ name: String(user).trim(), password: String(pass) })
        });
        const body = await response.json().catch(() => ({}));
        if (!response.ok) throw new Error(body.error || `HTTP ${response.status}`);
        // Store the successful result so a future app.js build can consume it.
        window.__musikbotLoginResult = body;
        try {
          window.MusikBotLoginBootstrap?.clearSession?.();
          window.MusikBotFetch?.setAuth?.(`Bearer ${body.token}`);
          sessionStorage.setItem('musikbot187.auth', JSON.stringify(body));
        } catch {}
        window.location.reload();
      } catch (error) {
        const notice = document.querySelector('#notice');
        if (notice) {
          notice.textContent = error.message || String(error);
          notice.classList.add('show');
        } else alert(error.message || String(error));
        if (button) button.disabled = false;
      }
    }, true);
  }

  new MutationObserver(bindForm).observe(document.documentElement, { childList: true, subtree: true });
  bindForm();
})();
