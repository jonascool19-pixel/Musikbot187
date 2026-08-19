(() => {
  if (window.__musikbotApiCompatInstalled) return;
  window.__musikbotApiCompatInstalled = true;

  const nativeFetch = window.fetch.bind(window);

  function jsonBody(init) {
    try { return typeof init?.body === 'string' ? JSON.parse(init.body) : null; } catch { return null; }
  }

  async function ts3Save(id, body, init) {
    const currentResponse = await nativeFetch('/api/ts3', { headers: init?.headers || {} });
    if (!currentResponse.ok) return currentResponse;
    const current = await currentResponse.json();
    const instances = Array.isArray(current) ? current.map(item => ({
      id: item.id,
      name: item.name,
      enabled: item.enabled !== false,
      host: item.host || '',
      port: Number(item.port) || 9987,
      nickname: item.nickname || 'MusikBot187',
      channel: item.channel || ''
    })) : [];
    const normalized = {
      id,
      name: String(body?.name || 'TS3').trim().slice(0, 128),
      enabled: body?.enabled !== false,
      host: String(body?.host || '').trim().slice(0, 255),
      port: Number(body?.port) || 9987,
      nickname: String(body?.nickname || body?.username || 'MusikBot187').trim().slice(0, 64),
      channel: String(body?.channel || '').trim().slice(0, 255),
      ...(body?.password ? { password: String(body.password).slice(0, 256) } : {})
    };
    if (normalized.port === 10011 && !body?.portExplicitlySet) normalized.port = 9987;
    const index = instances.findIndex(item => item.id === id);
    if (index >= 0) instances[index] = { ...instances[index], ...normalized };
    else instances.push(normalized);
    return nativeFetch('/api/ts3', {
      method: 'PUT',
      headers: { ...(init?.headers || {}), 'Content-Type': 'application/json' },
      body: JSON.stringify({ instances: instances.slice(0, 16) })
    });
  }

  window.fetch = (input, init = {}) => {
    const url = typeof input === 'string' ? input : input?.url || '';
    const pathname = (() => { try { return new URL(url, location.href).pathname; } catch { return url; } })();
    const match = pathname.match(/^\/api\/ts3\/([^/]+)$/);
    if (match && String(init.method || 'GET').toUpperCase() === 'PUT') {
      return ts3Save(decodeURIComponent(match[1]), jsonBody(init) || {}, init);
    }
    return nativeFetch(input, init);
  };
})();
