(() => {
  const KEY = 'musikbot187.auth';
  const nativeFetch = window.fetch.bind(window);
  const protectedPath = path => /^\/api\/(state|system|network|storage|files|playlists|discord|ts3|users|diagnostics|settings|queue|play|search)/.test(path);

  function readAuth() {
    try {
      const value = JSON.parse(sessionStorage.getItem(KEY) || 'null');
      if (!value?.token || !value?.user) return null;
      return value;
    } catch {
      return null;
    }
  }

  function saveAuth(value) {
    if (!value?.token || !value?.user) return;
    sessionStorage.setItem(KEY, JSON.stringify({ token: value.token, user: value.user, createdAt: Date.now() }));
  }

  function withAuth(init = {}, auth) {
    const headers = new Headers(init.headers || {});
    if (!headers.has('Authorization') && auth?.token) headers.set('Authorization', `Bearer ${auth.token}`);
    return { ...init, headers };
  }

  window.MusikBotAuthSession = { readAuth, saveAuth, clear: () => sessionStorage.removeItem(KEY) };

  window.fetch = async (input, init = {}) => {
    const url = typeof input === 'string' ? input : input?.url || '';
    const pathname = (() => { try { return new URL(url, location.href).pathname; } catch { return url; } })();
    let nextInit = init;
    const stored = readAuth();

    if (protectedPath(pathname) && stored) nextInit = withAuth(nextInit, stored);

    const response = await nativeFetch(input, nextInit);

    if (pathname === '/api/login' && response.ok) {
      try { saveAuth(await response.clone().json()); } catch {}
      return response;
    }

    if (protectedPath(pathname) && response.status === 401 && stored?.token) {
      try {
        const retry = await nativeFetch(input, withAuth(init, stored));
        if (retry.ok) return retry;
      } catch {}
    }

    if (pathname === '/api/logout' && response.ok) sessionStorage.removeItem(KEY);
    return response;
  };
})();
