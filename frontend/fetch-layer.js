(() => {
  if (window.MusikBotFetch) return;
  const nativeFetch = window.fetch.bind(window);
  let authHeader = '';
  window.MusikBotFetch = { nativeFetch, getAuth() { return authHeader; }, setAuth(value) { authHeader = value || ''; } };
  document.addEventListener('click', event => {
    const logout = event.target.closest?.('#logout'); if (!logout) return;
    const header = authHeader; authHeader = '';
    if (header) void nativeFetch('/api/logout', { method: 'POST', headers: { Authorization: header } }).catch(() => {});
  }, true);
  window.fetch = async (input, init = {}) => {
    try { const headers = new Headers(init.headers || (input instanceof Request ? input.headers : undefined)); const authorization = headers.get('Authorization'); if (authorization) authHeader = authorization; } catch {}
    return nativeFetch(input, init);
  };
})();
