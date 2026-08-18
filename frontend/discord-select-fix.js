(() => {
  const nativeFetch = () => window.MusikBotFetch?.nativeFetch || window.fetch.bind(window);
  const auth = () => window.MusikBotFetch?.getAuth?.() || '';

  const api = async path => {
    const headers = new Headers();
    const token = auth();
    if (token) headers.set('Authorization', token);
    const response = await nativeFetch()(path, { headers });
    const body = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(body.error || `HTTP ${response.status}`);
    return body;
  };

  const setOptions = (select, items, placeholder) => {
    if (!select) return;
    select.replaceChildren(new Option(placeholder, ''));
    for (const item of Array.isArray(items) ? items : []) {
      select.add(new Option(item.name || item.id, String(item.id)));
    }
  };

  const loadGuilds = async () => {
    const id = document.querySelector('#did')?.value?.trim();
    const select = document.querySelector('#dg');
    if (!id || !select) return;
    select.disabled = true;
    try {
      const guilds = await api(`/api/discord/${encodeURIComponent(id)}/guilds`);
      setOptions(select, guilds, 'Discord-Server auswählen');
    } finally {
      select.disabled = false;
    }
  };

  const loadChannels = async () => {
    const id = document.querySelector('#did')?.value?.trim();
    const guild = document.querySelector('#dg')?.value?.trim();
    const select = document.querySelector('#dv');
    if (!id || !guild || !select) return;
    select.disabled = true;
    try {
      const channels = await api(`/api/discord/${encodeURIComponent(id)}/guilds/${encodeURIComponent(guild)}/channels`);
      setOptions(select, channels, 'Voice-Kanal auswählen');
    } finally {
      select.disabled = false;
    }
  };

  document.addEventListener('click', event => {
    const target = event.target?.closest?.('#dgrefresh, #dvrefresh');
    if (!target) return;
    event.preventDefault();
    event.stopImmediatePropagation();
    void (target.id === 'dgrefresh' ? loadGuilds() : loadChannels()).catch(error => {
      const notice = document.querySelector('#notice');
      if (notice) {
        notice.textContent = error.message || String(error);
        notice.classList.add('show');
      }
    });
  }, true);
})();
