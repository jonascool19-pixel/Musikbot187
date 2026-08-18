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

  function inviteUrl(clientId) {
    const id = String(clientId || '').trim();
    if (!/^\d{17,20}$/.test(id)) return '';
    return `https://discord.com/oauth2/authorize?client_id=${encodeURIComponent(id)}&scope=bot%20applications.commands&permissions=3148800`;
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
    if (previous && [...select.options].some(option => option.value === previous)) select.value = previous;
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

  function discordBody() {
    const clientId = document.querySelector('#did')?.value?.trim() || '';
    return {
      name: String(document.querySelector('#dn')?.value || 'Discord').trim().slice(0, 128),
      clientId,
      token: document.querySelector('#dt')?.value || undefined,
      guildId: document.querySelector('#dg')?.value || '',
      channelId: document.querySelector('#dv')?.value || '',
      prefix: document.querySelector('#dp')?.value || '!',
      enabled: true,
      messageContentIntent: document.querySelector('#dintent')?.checked === true
    };
  }

  async function saveDiscordCanonically() {
    const saved = await request('/api/discord', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(discordBody())
    });
    const notice = document.querySelector('#notice');
    if (notice) {
      notice.textContent = 'Discord-Instanz gespeichert.';
      notice.classList.add('show');
    }
    document.querySelector('[data-tab="connections"]')?.click();
    return saved;
  }

  async function addBot() {
    const url = inviteUrl(document.querySelector('#did')?.value);
    if (!url) {
      showError(new Error('Bitte zuerst eine gültige Discord-Client-ID eintragen.'));
      document.querySelector('#did')?.focus();
      return;
    }
    window.open(url, '_blank', 'noopener,noreferrer');
  }

  async function enterVoiceChat() {
    let id = document.querySelector('#did')?.value?.trim() || '';
    if (!id || !/^\d{17,20}$/.test(id)) {
      showError(new Error('Bitte zuerst eine gültige Discord-Client-ID eintragen.'));
      document.querySelector('#did')?.focus();
      return;
    }
    const saved = await request('/api/discord', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(discordBody())
    });
    id = String(saved?.id || saved?.instance?.id || id);
    await request(`/api/discord/${encodeURIComponent(id)}/connect`, { method: 'POST' });
    const notice = document.querySelector('#notice');
    if (notice) {
      notice.textContent = 'Voice-Chat-Verbindung wurde gestartet.';
      notice.classList.add('show');
    }
  }

  function ensureActionButtons() {
    const save = document.querySelector('#saveDiscord');
    if (!save) return;
    const controls = save.parentElement;
    if (!controls) return;

    if (!document.querySelector('#addDiscordBot')) {
      const button = document.createElement('button');
      button.id = 'addDiscordBot';
      button.type = 'button';
      button.textContent = '🤖 Bot hinzufügen';
      button.addEventListener('click', event => {
        event.preventDefault();
        void addBot();
      });
      controls.append(button);
    }

    if (!document.querySelector('#enterDiscordVoice')) {
      const button = document.createElement('button');
      button.id = 'enterDiscordVoice';
      button.type = 'button';
      button.textContent = '🎧 Voice-Chat betreten';
      button.addEventListener('click', event => {
        event.preventDefault();
        void enterVoiceChat().catch(showError);
      });
      controls.append(button);
    }
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

  new MutationObserver(ensureActionButtons).observe(document.documentElement, { childList: true, subtree: true });
  ensureActionButtons();
})();
