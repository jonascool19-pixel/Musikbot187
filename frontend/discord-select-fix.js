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

  function replaceOptions(select, items, placeholder) {
    if (!select) return;
    const fragment = document.createDocumentFragment();
    fragment.append(new Option(placeholder, ''));
    for (const item of Array.isArray(items) ? items : []) {
      fragment.append(new Option(item.name || item.id, String(item.id)));
    }
    select.replaceChildren(fragment);
  }

  async function refreshGuilds(button) {
    const id = document.querySelector('#did')?.value?.trim();
    const select = document.querySelector('#dg');
    if (!id || !select) return;
    const previous = select.value;
    button.disabled = true;
    try {
      const guilds = await request(`/api/discord/${encodeURIComponent(id)}/guilds`);
      replaceOptions(select, guilds, 'Server auswählen');
      const configured = String(window.__musikbotDiscordGuildId || '').trim();
      const wanted = configured || previous;
      if (wanted && [...select.options].some(option => option.value === wanted)) select.value = wanted;
      window.__musikbotDiscordGuildId = select.value;
      select.dispatchEvent(new Event('change', { bubbles: true }));
    } finally {
      button.disabled = false;
    }
  }

  async function refreshChannels(button) {
    const id = document.querySelector('#did')?.value?.trim();
    const guild = document.querySelector('#dg')?.value?.trim();
    const select = document.querySelector('#dv');
    if (!id || !guild || !select) return;
    const previous = select.value;
    button.disabled = true;
    try {
      const channels = await request(`/api/discord/${encodeURIComponent(id)}/guilds/${encodeURIComponent(guild)}/channels`);
      replaceOptions(select, channels, 'Voice-Kanal auswählen');
      const wanted = String(window.__musikbotDiscordChannelId || '').trim() || previous;
      if (wanted && [...select.options].some(option => option.value === wanted)) select.value = wanted;
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
