(() => {
  if (window.__musikbotDiscordSelectFixInstalled) return;
  window.__musikbotDiscordSelectFixInstalled = true;

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

  async function refreshGuilds() {
    const id = await resolveInstanceId();
    const select = document.querySelector('#dg');
    const button = document.querySelector('#dgrefresh');
    if (!id || !select || !button) return;
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

  async function refreshChannels() {
    const id = await resolveInstanceId();
    const guildSelect = document.querySelector('#dg');
    const select = document.querySelector('#dv');
    const button = document.querySelector('#dvrefresh');
    const guild = guildSelect?.value?.trim();
    if (!id || !guild || !select || !button) return;
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
    const clientId = document.querySelector('#did')?.value?.trim() || '';
    const body = {
      name: String(document.querySelector('#dn')?.value || 'Discord').trim().slice(0, 128),
      clientId,
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

  function isButton(target, id) {
    return target?.closest?.(`#${id}`);
  }

  document.addEventListener('click', event => {
    if (isButton(event.target, 'dgrefresh')) {
      event.preventDefault();
      event.stopImmediatePropagation();
      void refreshGuilds().catch(showError);
      return;
    }
    if (isButton(event.target, 'dvrefresh')) {
      event.preventDefault();
      event.stopImmediatePropagation();
      void refreshChannels().catch(showError);
      return;
    }
    if (isButton(event.target, 'saveDiscord')) {
      event.preventDefault();
      event.stopImmediatePropagation();
      void saveDiscordCanonically().catch(showError);
    }
  }, true);

  document.addEventListener('change', event => {
    if (event.target?.id === 'dg') window.__musikbotDiscordGuildId = event.target.value;
    if (event.target?.id === 'dv') window.__musikbotDiscordChannelId = event.target.value;
  }, true);
})();
