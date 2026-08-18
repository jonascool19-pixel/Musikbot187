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

  const cloneJsonResponse = (value, status = 200) => new Response(JSON.stringify(value), {
    status,
    headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' }
  });

  const invalidate = (paths = []) => {
    for (const key of cache.keys()) {
      if (!paths.length || paths.some(path => key.startsWith(`${path}|`))) cache.delete(key);
    }
  };

  const invalidateForWrite = path => {
    if (path.startsWith('/api/discord')) return invalidate(['/api/discord', '/api/state']);
    if (path.startsWith('/api/ts3')) return invalidate(['/api/ts3', '/api/state']);
    if (path.startsWith('/api/settings')) return invalidate(['/api/state', '/api/discord', '/api/ts3']);
    if (path.startsWith('/api/play')) return invalidate(['/api/state']);
    if (path.startsWith('/api/logout')) return invalidate();
  };

  const keyFor = (input, init) => {
    const url = typeof input === 'string' ? input : input?.url || '';
    if (init?.method && String(init.method).toUpperCase() !== 'GET') return null;
    const path = new URL(url, window.location.href).pathname;
    if (!Object.prototype.hasOwnProperty.call(TTL, path)) return null;
    const headers = new Headers(init?.headers || (input instanceof Request ? input.headers : undefined));
    return `${path}|${headers.get('Authorization') || ''}`;
  };

  const cachedFetch = async (input, init = {}) => {
    const url = typeof input === 'string' ? input : input?.url || '';
    const method = String(init?.method || (input instanceof Request ? input.method : 'GET')).toUpperCase();
    const path = new URL(url, window.location.href).pathname;
    if (method !== 'GET') {
      try { const response = await baseFetch(input, init); invalidateForWrite(path); return response; }
      catch (error) { throw error; }
    }

    const key = keyFor(input, init);
    if (!key) return baseFetch(input, init);
    const ttl = TTL[key.split('|', 1)[0]];
    const now = Date.now();
    const hit = cache.get(key);
    if (hit?.pending) return cloneJsonResponse(await hit.pending);
    if (hit && now - hit.time < ttl) return cloneJsonResponse(hit.value, hit.status || 200);

    const pending = baseFetch(input, init).then(async response => {
      const body = await response.json().catch(() => ({}));
      if (response.ok) cache.set(key, { time: Date.now(), value: body, status: response.status });
      else cache.delete(key);
      return { body, status: response.status };
    }).finally(() => {
      const current = cache.get(key);
      if (current?.pending) delete current.pending;
    });
    cache.set(key, { time: now, value: null, pending });
    const result = await pending;
    return cloneJsonResponse(result.body, result.status);
  };

  cachedFetch.__musikbotPerformance = true;
  transport.nativeFetch = cachedFetch;
  window.__musikbotInvalidateReadCache = invalidate;

  document.addEventListener('change', async event => {
    const input = event.target;
    if (!(input instanceof HTMLInputElement) || input.id !== 'vol') return;
    event.preventDefault();
    event.stopImmediatePropagation();
    const value = Number(input.value);
    const token = transport.getAuth?.() || '';
    const headers = new Headers({ 'Content-Type': 'application/json' });
    if (token) headers.set('Authorization', token);
    try {
      const response = await baseFetch('/api/play/volume', { method: 'POST', headers, body: JSON.stringify({ value }) });
      const body = await response.json().catch(() => ({}));
      if (!response.ok) throw Error(body.error || `HTTP ${response.status}`);
      invalidate(['/api/state']);
      const meta = document.querySelector('.now span');
      if (meta) meta.textContent = `${body.paused ? '⏸ Pausiert' : '▶ Bereit'} · ${body.volume}% · ${body.mode} · ${body.outputType || ''}`;
      const out = document.querySelector('#vo');
      if (out) out.textContent = `${value}%`;
      const notice = document.querySelector('#notice');
      if (notice) {
        notice.textContent = `Lautstärke ${value}%`;
        notice.classList.add('show');
        clearTimeout(window.__musikbotVolumeNotice);
        window.__musikbotVolumeNotice = setTimeout(() => notice.classList.remove('show'), 900);
      }
    } catch (error) {
      const notice = document.querySelector('#notice');
      if (notice) { notice.textContent = error.message || String(error); notice.classList.add('show'); }
    }
  }, true);
})();
