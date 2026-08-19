(() => {
  if (window.MusikBotFetch) return;
  const nativeFetch = window.fetch.bind(window);
  let authHeader = '';
  let lastSearch = null;
  const SEARCH_PATH = '/api/search';
  window.MusikBotFetch = {
    nativeFetch,
    getAuth() { return authHeader; },
    setAuth(value) { authHeader = value || ''; },
    getLastSearch() { return lastSearch; }
  };
  document.addEventListener('click', event => {
    const logout = event.target.closest?.('#logout'); if (!logout) return;
    const header = authHeader; authHeader = '';
    if (header) void nativeFetch('/api/logout', { method: 'POST', headers: { Authorization: header } }).catch(() => {});
  }, true);
  window.fetch = async (input, init = {}) => {
    try { const headers = new Headers(init.headers || (input instanceof Request ? input.headers : undefined)); const authorization = headers.get('Authorization'); if (authorization) authHeader = authorization; } catch {}
    const response = await nativeFetch(input, init);
    const url = typeof input === 'string' ? input : input?.url || '';
    if ((url === SEARCH_PATH || url.startsWith(`${SEARCH_PATH}?`)) && response.ok) {
      void response.clone().json().then(body => {
        lastSearch = {
          youtube: Array.isArray(body?.youtube) ? body.youtube : [],
          radio: Array.isArray(body?.radio) ? body.radio : [],
          spotify: Array.isArray(body?.spotify) ? body.spotify : []
        };
      }).catch(() => {});
    }
    return response;
  };
})();
