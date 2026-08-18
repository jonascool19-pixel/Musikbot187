(() => {
  const transport = window.MusikBotFetch;
  if (!transport?.nativeFetch || transport.nativeFetch.__musikbotPerformance) return;

  const baseFetch = transport.nativeFetch;
  const cache = new Map();
  const TTL = {
    '/api/system': 1500,
    '/api/network': 1500,
    '/api/health': 5000,
    '/api/state': 500,
    '/api/discord': 2000,
    '/api/ts3': 2000
  };

  const cloneJsonResponse = (value) => new Response(JSON.stringify(value), {
    status: 200,
    headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' }
  });

  const keyFor = (input, init) => {
    const url = typeof input === 'string' ? input : input?.url || '';
    if (init?.method && String(init.method).toUpperCase() !== 'GET') return null;
    const path = new URL(url, window.location.href).pathname;
    if (!Object.prototype.hasOwnProperty.call(TTL, path)) return null;
    const headers = new Headers(init?.headers || (input instanceof Request ? input.headers : undefined));
    return `${path}|${headers.get('Authorization') || ''}`;
  };

  const cachedFetch = async (input, init = {}) => {
    const key = keyFor(input, init);
    if (!key) return baseFetch(input, init);
    const ttl = TTL[key.split('|', 1)[0]];
    const now = Date.now();
    const hit = cache.get(key);
    if (hit && now - hit.time < ttl) return cloneJsonResponse(hit.value);
    if (hit?.pending) return cloneJsonResponse(await hit.pending);

    const pending = baseFetch(input, init).then(async response => {
      const body = await response.json().catch(() => ({}));
      if (response.ok) cache.set(key, { time: Date.now(), value: body });
      else cache.delete(key);
      return body;
    }).finally(() => {
      const current = cache.get(key);
      if (current?.pending) delete current.pending;
    });
    cache.set(key, { time: now, value: null, pending });
    const body = await pending;
    return cloneJsonResponse(body);
  };

  cachedFetch.__musikbotPerformance = true;
  transport.nativeFetch = cachedFetch;
  window.__musikbotInvalidateReadCache = (paths = []) => {
    for (const key of cache.keys()) {
      if (!paths.length || paths.some(path => key.startsWith(`${path}|`))) cache.delete(key);
    }
  };
})();
