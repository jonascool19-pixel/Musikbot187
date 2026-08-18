(() => {
  const nativeFetch = window.fetch.bind(window);
  window.fetch = (input, init = {}) => {
    const url = typeof input === 'string' ? input : input?.url || '';
    if (!url.endsWith('/api/login') || !init.body) return nativeFetch(input, init);
    try {
      const body = JSON.parse(init.body);
      if (body && body.username && !body.name) {
        body.name = body.username;
        delete body.username;
        return nativeFetch(input, { ...init, body: JSON.stringify(body) });
      }
    } catch {}
    return nativeFetch(input, init);
  };
})();
