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

  // Compatibility wrapper only. The actual login form and successful state
  // transition are owned by app.js. Do not intercept form submissions here.
  window.fetch = (input, init = {}) => {
    const url = typeof input === 'string' ? input : input?.url || '';
    if (url.endsWith('/api/login')) return nativeFetch(input, normalizeLoginInit(init));
    return nativeFetch(input, init);
  };
})();
