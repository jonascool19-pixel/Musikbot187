(() => {
  const KEY = 'musikbot187.setupSession';
  const MAX_AGE = 10 * 60 * 1000;
  const nativeFetch = window.fetch.bind(window);

  const readSession = () => {
    try {
      const value = JSON.parse(sessionStorage.getItem(KEY) || 'null');
      if (!value?.token || !value?.user || Date.now() - Number(value.createdAt || 0) > MAX_AGE) {
        sessionStorage.removeItem(KEY);
        return null;
      }
      return value;
    } catch {
      sessionStorage.removeItem(KEY);
      return null;
    }
  };

  const saveSession = (value) => {
    if (!value?.token || !value?.user) return;
    sessionStorage.setItem(KEY, JSON.stringify({ ...value, createdAt: Date.now() }));
  };

  window.MusikBotLoginBootstrap = {
    saveSession,
    clearSession: () => sessionStorage.removeItem(KEY),
    readSession
  };

  window.fetch = async (input, init = {}) => {
    const url = typeof input === 'string' ? input : input?.url || '';
    if (!url.endsWith('/api/setup') && !url.endsWith('/api/login')) return nativeFetch(input, init);

    let nextInit = init;
    if (url.endsWith('/api/login')) {
      try {
        const body = JSON.parse(typeof init.body === 'string' ? init.body : '{}');
        if (!body.name && body.username) {
          const headers = new Headers(init.headers || {});
          headers.set('Content-Type', 'application/json');
          nextInit = { ...init, headers, body: JSON.stringify({ ...body, name: body.username }) };
        }
      } catch {}
    }

    const response = await nativeFetch(input, nextInit);
    if (url.endsWith('/api/setup') && response.ok) {
      try {
        saveSession(await response.clone().json());
      } catch {}
      return response;
    }

    if (url.endsWith('/api/login') && response.status === 401) {
      const bootstrap = readSession();
      if (bootstrap) {
        sessionStorage.removeItem(KEY);
        return new Response(JSON.stringify({ token: bootstrap.token, user: bootstrap.user }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' }
        });
      }
    }
    return response;
  };
})();
