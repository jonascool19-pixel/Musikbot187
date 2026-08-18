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

  const setOptions = (select, items, placeholder, selected = '') => {
    if (!select) return;
    const previous = selected || select.value || '';
    select.replaceChildren(new Option(placeholder, ''));
    for (const item of Array.isArray(items) ? items : []) {
      select.add(new Option(item.name || item.id, String(item.id)));
    }
    if (previous && [...select.options].some(option => option.value === previous)) {
      select.value = previous;
    }
  };

  const resolveInstanceId = async () => {
    const field = document.querySelector('#did');
    const value = field?.value?.trim();
    if (value) return value;

    // The connection editor can be re-rendered immediately after saving. During
    // that short window #did may not exist yet. Resolve the active/first Discord
    // instance from the authoritative endpoint instead of silently doing nothing.
    const discord = await api('/api/discord');
    const first = Array.isArray(discord) ? discord.find(item => item?.id) : null;
    return first?.id ? String(first.id) : '';
  };

  const loadGuilds = async () => {
    const id = await resolveInstanceId();
    const select = document.querySelector('#dg');
    if (!id || !select) return;
    const previous = select.value;
    select.disabled = true;
    try {
      const guilds = await api(`/api/discord/${encodeURIComponent(id)}/guilds`);
      setOptions(select, guilds, 'Discord-Server auswählen', previous);
      // Expose the resolved instance so a concurrently rendered editor can pick
      // it up without requiring a tab switch.
      select.dataset.discordInstanceId = id;
    } finally {
      select.disabled = false;
    }
  };

  const loadChannels = async () => {
    const id = await resolveInstanceId();
    const guildSelect = document.querySelector('#dg');
    const select = document.querySelector('#dv');
    const guild = guildSelect?.value?.trim();
    if (!id || !guild || !select) return;
    const previous = select.value;
    select.disabled = true;
    try {
      const channels = await api(`/api/discord/${encodeURIComponent(id)}/guilds/${encodeURIComponent(guild)}/channels`);
      setOptions(select, channels, 'Voice-Kanal auswählen', previous);
      select.dataset.discordInstanceId = id;
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
