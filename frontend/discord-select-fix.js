(() => {
  const getAuth = () => window.MusikBotFetch?.getAuth?.() || '';

  async function request(path, options = {}) {
    const headers = new Headers(options.headers || {});
    const token = getAuth();
    if (token) headers.set('Authorization', token);
    const response = await fetch(path, { ...options, headers });
    const body = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(body.error || `HTTP ${response.status}`);
    return body;
  }

  function showError(error) {
    if (window.MusikBotFetch?.showError) return window.MusikBotFetch.showError(error);
    const notice = document.querySelector('#notice');
    if (notice) {
      notice.textContent = error?.message || String(error);
      notice.classList.add('show');
    } else console.error(error);
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
      window.__musikbotDiscordChannelId = select.value;
    } finally {
      button.disabled = false;
    }
  }

  async function saveDiscordCanonically() {
    const instanceId = document.querySelector('#did')?.value?.trim() || '';
    const body = {
      id: instanceId || undefined,
      name: String(document.querySelector('#dn')?.value || 'Discord').trim().slice(0, 128),
      clientId: instanceId,
      token: document.querySelector('#dt')?.value || undefined,
      guildId: document.querySelector('#dg')?.value || '',
      channelId: document.querySelector('#dv')?.value || '',
      prefix: document.querySelector('#dp')?.value || '!',
      enabled: true,
      messageContentIntent: document.querySelector('#dintent')?.checked === true
    };
    const saved = await request('/api/discord', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body)
    });
    const notice = document.querySelector('#notice');
    if (notice) {
      notice.textContent = 'Discord-Instanz gespeichert.';
      notice.classList.add('show');
    }
    document.querySelector('[data-tab="connections"]')?.click();
    return saved;
  }

  function bind() {
    const guildButton = document.querySelector('#dgrefresh');
    const channelButton = document.querySelector('#dvrefresh');
    const saveButton = document.querySelector('#saveDiscord');

    if (guildButton && !guildButton.dataset.discordRefreshBound) {
      guildButton.dataset.discordRefreshBound = '1';
      guildButton.onclick = event => {
        event.preventDefault();
        void refreshGuilds(guildButton).catch(showError);
      };
    }
    if (channelButton && !channelButton.dataset.discordRefreshBound) {
      channelButton.dataset.discordRefreshBound = '1';
      channelButton.onclick = event => {
        event.preventDefault();
        void refreshChannels(channelButton).catch(showError);
      };
    }
    if (saveButton && !saveButton.dataset.discordSaveBound) {
      saveButton.dataset.discordSaveBound = '1';
      saveButton.onclick = event => {
        event.preventDefault();
        void saveDiscordCanonically().catch(showError);
      };
    }

    const guildSelect = document.querySelector('#dg');
    const channelSelect = document.querySelector('#dv');
    if (guildSelect && !guildSelect.dataset.discordChangeBound) {
      guildSelect.dataset.discordChangeBound = '1';
      guildSelect.addEventListener('change', () => {
        window.__musikbotDiscordGuildId = guildSelect.value;
      });
    }
    if (channelSelect && !channelSelect.dataset.discordChangeBound) {
      channelSelect.dataset.discordChangeBound = '1';
      channelSelect.addEventListener('change', () => {
        window.__musikbotDiscordChannelId = channelSelect.value;
      });
    }
  }

  new MutationObserver(bind).observe(document.documentElement, { childList: true, subtree: true });
  bind();
})();
