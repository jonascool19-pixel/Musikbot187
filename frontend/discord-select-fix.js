(() => {
  const getAuth = () => window.MusikBotFetch?.getAuth?.() || '';

  async function request(path) {
    const headers = {};
    const token = getAuth();
    if (token) headers.Authorization = token;
    const response = await fetch(path, { headers });
    const body = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(body.error || `HTTP ${response.status}`);
    return body;
  }

  function replaceOptions(select, items, placeholder, selected = '') {
    if (!select) return;
    const previous = selected || select.value || '';
    const fragment = document.createDocumentFragment();
    fragment.append(new Option(placeholder, ''));
    for (const item of Array.isArray(items) ? items : []) {
      fragment.append(new Option(item.name || item.id, String(item.id)));
    }
    select.replaceChildren(fragment);
    if (previous && [...select.options].some(option => option.value === previous)) {
      select.value = previous;
    }
  }

  async function resolveInstanceId() {
    const field = document.querySelector('#did');
    const value = field?.value?.trim();
    if (value) return value;
    const discord = await request('/api/discord');
    const first = Array.isArray(discord) ? discord.find(item => item?.id) : null;
    return first?.id ? String(first.id) : '';
  }

  async function refreshGuilds(button) {
    const id = await resolveInstanceId();
    const select = document.querySelector('#dg');
    if (!id || !select) return;
    const previous = select.value;
    button.disabled = true;
    try {
      const guilds = await request(`/api/discord/${encodeURIComponent(id)}/guilds`);
      const configured = String(window.__musikbotDiscordGuildId || '').trim();
      replaceOptions(select, guilds, 'Server auswählen', configured || previous);
      window.__musikbotDiscordGuildId = select.value;
      select.dataset.discordInstanceId = id;
      select.dispatchEvent(new Event('change', { bubbles: true }));
    } finally {
      button.disabled = false;
    }
  }

  async function refreshChannels(button) {
    const id = await resolveInstanceId();
    const guildSelect = document.querySelector('#dg');
    const select = document.querySelector('#dv');
    const guild = guildSelect?.value?.trim();
    if (!id || !guild || !select) return;
    const previous = select.value;
    button.disabled = true;
    try {
      const channels = await request(`/api/discord/${encodeURIComponent(id)}/guilds/${encodeURIComponent(guild)}/channels`);
      const configured = String(window.__musikbotDiscordChannelId || '').trim();
      replaceOptions(select, channels, 'Voice-Kanal auswählen', configured || previous);
      select.dataset.discordInstanceId = id;
    } finally {
      button.disabled = false;
    }
  }

  function bind() {
    const guildButton = document.querySelector('#dgrefresh');
    const channelButton = document.querySelector('#dvrefresh');
    if (guildButton && !guildButton.dataset.discordRefreshBound) {
      guildButton.dataset.discordRefreshBound = '1';
      guildButton.onclick = event => {
        event.preventDefault();
        void refreshGuilds(guildButton).catch(error => window.MusikBotFetch?.showError?.(error) || console.error(error));
      };
    }
    if (channelButton && !channelButton.dataset.discordRefreshBound) {
      channelButton.dataset.discordRefreshBound = '1';
      channelButton.onclick = event => {
        event.preventDefault();
        void refreshChannels(channelButton).catch(error => window.MusikBotFetch?.showError?.(error) || console.error(error));
      };
    }
  }

  new MutationObserver(bind).observe(document.documentElement, { childList: true, subtree: true });
  document.addEventListener('change', event => {
    if (event.target?.id === 'dg') window.__musikbotDiscordGuildId = event.target.value;
    if (event.target?.id === 'dv') window.__musikbotDiscordChannelId = event.target.value;
  }, true);
  bind();
})();
