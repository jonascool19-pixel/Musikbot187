(() => {
  if (window.__musikbotDiscordInstanceActionsInstalled) return;
  window.__musikbotDiscordInstanceActionsInstalled = true;

  const getAuth = () => window.MusikBotFetch?.getAuth?.() || '';
  const notify = message => {
    if (window.MusikBotFetch?.showError) return window.MusikBotFetch.showError(new Error(message));
    const node = document.querySelector('#notice');
    if (node) {
      node.textContent = message;
      node.classList.add('show');
      return;
    }
    console.warn(message);
  };

  async function request(path, options = {}) {
    const headers = new Headers(options.headers || {});
    const token = getAuth();
    if (token) headers.set('Authorization', token);
    const response = await fetch(path, { ...options, headers });
    const body = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(body.error || `HTTP ${response.status}`);
    return body;
  }

  function inviteUrl(clientId) {
    const id = String(clientId || '').trim();
    if (!/^\d{17,20}$/.test(id)) return '';
    const permissions = 3148800;
    return `https://discord.com/oauth2/authorize?client_id=${encodeURIComponent(id)}&scope=bot%20applications.commands&permissions=${permissions}`;
  }

  function openInvite(item) {
    const url = inviteUrl(item?.clientId);
    if (!url) {
      notify('Bitte zuerst eine gültige Discord-Client-ID speichern.');
      return;
    }
    const popup = window.open(url, '_blank', 'noopener,noreferrer');
    if (!popup) window.location.href = url;
  }

  async function getInstances() {
    const value = await request('/api/discord');
    return new Map((Array.isArray(value) ? value : []).filter(item => item?.id).map(item => [String(item.id), item]));
  }

  async function ensureConnected(id) {
    const instances = await getInstances();
    const item = instances.get(String(id));
    if (!item) throw new Error('Discord-Instanz wurde nicht gefunden.');
    if (!item.connected) {
      await request(`/api/discord/${encodeURIComponent(id)}/connect`, { method: 'POST' });
      return (await getInstances()).get(String(id)) || item;
    }
    return item;
  }

  function rowFor(id) {
    const edit = [...document.querySelectorAll('[data-dedit]')].find(button => button.dataset.dedit === String(id));
    return edit?.closest('.listrow') || null;
  }

  function setBusy(container, busy) {
    container.querySelectorAll('button, select').forEach(node => {
      node.disabled = busy;
    });
  }

  function fillSelect(select, items, placeholder, selected = '') {
    select.replaceChildren(new Option(placeholder, ''));
    for (const item of Array.isArray(items) ? items : []) {
      select.add(new Option(item.name || item.id, String(item.id)));
    }
    if (selected && [...select.options].some(option => option.value === selected)) select.value = selected;
  }

  async function saveSelection(item, guildId, channelId) {
    return request('/api/discord', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        id: item.id,
        name: item.name || 'Discord',
        clientId: item.clientId || '',
        guildId: guildId || '',
        channelId: channelId || '',
        prefix: item.prefix || '!',
        enabled: item.enabled !== false,
        messageContentIntent: item.messageContentIntent === true
      })
    });
  }

  async function loadGuilds(row, item, select, status) {
    setBusy(row, true);
    try {
      const runtime = await ensureConnected(item.id);
      const guilds = await request(`/api/discord/${encodeURIComponent(item.id)}/guilds`);
      fillSelect(select, guilds, 'Discord-Server auswählen', runtime?.guildId || item.guildId || '');
      status.textContent = guilds.length
        ? `${guilds.length} Server gefunden`
        : 'Keine Server gefunden – Bot zuerst hinzufügen';
      if (select.value && select.value !== (item.guildId || '')) {
        await saveSelection(item, select.value, '');
        item.guildId = select.value;
        item.channelId = '';
      }
      if (!guilds.length) {
        notify('Keine Discord-Server gefunden. Prüfe, ob der Bot dem Server hinzugefügt wurde und die nötigen Berechtigungen besitzt.');
      }
    } finally {
      setBusy(row, false);
    }
  }

  async function loadChannels(row, item, guildSelect, channelSelect, status) {
    const guildId = guildSelect.value || item.guildId || '';
    if (!guildId) {
      notify('Bitte zuerst einen Discord-Server auswählen.');
      return;
    }
    setBusy(row, true);
    try {
      await ensureConnected(item.id);
      const channels = await request(`/api/discord/${encodeURIComponent(item.id)}/guilds/${encodeURIComponent(guildId)}/channels`);
      fillSelect(channelSelect, channels, 'Voice-Kanal auswählen', item.channelId || '');
      status.textContent = channels.length
        ? `${channels.length} Voice-Kanäle gefunden`
        : 'Keine Voice-Kanäle gefunden';
      if (guildId !== (item.guildId || '') || channelSelect.value !== (item.channelId || '')) {
        await saveSelection(item, guildId, channelSelect.value || '');
        item.guildId = guildId;
        item.channelId = channelSelect.value || '';
      }
      if (!channels.length) {
        notify('Keine Voice-Kanäle gefunden. Prüfe, ob der Bot Zugriff auf Voice-Kanäle des ausgewählten Servers hat.');
      }
    } finally {
      setBusy(row, false);
    }
  }

  async function joinVoice(row, item, guildSelect, channelSelect, button) {
    const guildId = guildSelect.value || item.guildId || '';
    const channelId = channelSelect.value || item.channelId || '';
    if (!guildId) {
      notify('Bitte zuerst einen Discord-Server auswählen.');
      return;
    }
    if (!channelId) {
      notify('Bitte zuerst einen Voice-Kanal auswählen.');
      return;
    }
    setBusy(row, true);
    button.textContent = '⏳ Verbinde …';
    try {
      await ensureConnected(item.id);
      await saveSelection(item, guildId, channelId);
      await request(`/api/discord/${encodeURIComponent(item.id)}/join`, { method: 'POST' });
      item.guildId = guildId;
      item.channelId = channelId;
      button.textContent = '✅ Voice-Chat verbunden';
      notify(`Voice-Chat „${channelSelect.selectedOptions[0]?.textContent || 'Kanal'}“ betreten.`);
      setTimeout(() => { if (button.isConnected) button.textContent = '🎧 Voice-Chat betreten'; }, 2500);
    } finally {
      setBusy(row, false);
    }
  }

  function decorateRow(row, item) {
    if (!row || row.querySelector('[data-discord-direct-actions]')) return;
    const controls = row.querySelector('.controls');
    if (!controls) return;

    const wrapper = document.createElement('div');
    wrapper.dataset.discordDirectActions = '1';
    wrapper.innerHTML = `
      <div class="discord-direct-actions-row">
        <label class="discord-direct-field">🌐 <span>Discord-Server</span>
          <span class="discord-direct-select-wrap"><select data-dguild="${item.id}"><option value="">Discord-Server auswählen</option></select><button type="button" data-dguild-refresh="${item.id}" title="Server laden">↻</button></span>
        </label>
        <label class="discord-direct-field">🎧 <span>Voice-Kanal</span>
          <span class="discord-direct-select-wrap"><select data-dchannel="${item.id}"><option value="">Voice-Kanal auswählen</option></select><button type="button" data-dchannel-refresh="${item.id}" title="Voice-Kanäle laden">↻</button></span>
        </label>
      </div>
      <div class="discord-direct-actions-buttons">
        <button type="button" data-dbot-invite="${item.id}">🤖 Bot hinzufügen</button>
        <button type="button" data-dvoice-join="${item.id}">🎧 Voice-Chat betreten</button>
        <span class="discord-direct-status" data-dstatus="${item.id}">${item.connected ? 'Verbunden' : 'Nicht verbunden'}</span>
      </div>`;
    row.insertBefore(wrapper, controls);

    const invite = row.querySelector('[data-dinvite]');
    if (invite) {
      invite.textContent = '🤖 Bot hinzufügen';
      invite.title = 'Discord-Bot öffnen';
      invite.dataset.directInvite = '1';
    }

    const guildSelect = wrapper.querySelector('[data-dguild]');
    const channelSelect = wrapper.querySelector('[data-dchannel]');
    if (item.guildId) {
      guildSelect.add(new Option(`Gespeicherter Server (${item.guildId})`, item.guildId, true, true));
    }
    if (item.channelId) {
      channelSelect.add(new Option(`Gespeicherter Voice-Kanal (${item.channelId})`, item.channelId, true, true));
    }
  }

  let decorateTimer = null;
  function scheduleDecorate() {
    clearTimeout(decorateTimer);
    decorateTimer = setTimeout(decorate, 60);
  }

  function decorate() {
    const pending = [...document.querySelectorAll('[data-dedit]')]
      .map(button => button.closest('.listrow'))
      .filter(row => row && !row.querySelector('[data-discord-direct-actions]'));
    if (!pending.length) return;
    void getInstances().then(instances => {
      for (const row of pending) {
        const id = row.querySelector('[data-dedit]')?.dataset.dedit;
        const item = instances.get(String(id));
        if (item) decorateRow(row, item);
      }
    }).catch(() => {});
  }

  document.addEventListener('click', event => {
    const target = event.target?.closest?.('button');
    if (!target) return;

    const id = target.dataset.dbotInvite || target.dataset.directInvite;
    if (id) {
      event.preventDefault();
      event.stopImmediatePropagation();
      void getInstances().then(instances => openInvite(instances.get(String(id)))).catch(error => notify(error.message || String(error)));
      return;
    }

    const guildRefreshId = target.dataset.dguildRefresh;
    if (guildRefreshId) {
      event.preventDefault();
      event.stopImmediatePropagation();
      const row = rowFor(guildRefreshId);
      void getInstances().then(instances => {
        const item = instances.get(String(guildRefreshId));
        const select = row?.querySelector(`[data-dguild="${CSS.escape(String(guildRefreshId))}"]`);
        const status = row?.querySelector(`[data-dstatus="${CSS.escape(String(guildRefreshId))}"]`);
        if (!row || !item || !select || !status) throw new Error('Discord-Instanz konnte nicht geladen werden.');
        return loadGuilds(row, item, select, status);
      }).catch(error => notify(error.message || String(error)));
      return;
    }

    const channelRefreshId = target.dataset.dchannelRefresh;
    if (channelRefreshId) {
      event.preventDefault();
      event.stopImmediatePropagation();
      const row = rowFor(channelRefreshId);
      void getInstances().then(instances => {
        const item = instances.get(String(channelRefreshId));
        const guild = row?.querySelector(`[data-dguild="${CSS.escape(String(channelRefreshId))}"]`);
        const channel = row?.querySelector(`[data-dchannel="${CSS.escape(String(channelRefreshId))}"]`);
        const status = row?.querySelector(`[data-dstatus="${CSS.escape(String(channelRefreshId))}"]`);
        if (!row || !item || !guild || !channel || !status) throw new Error('Discord-Instanz konnte nicht geladen werden.');
        return loadChannels(row, item, guild, channel, status);
      }).catch(error => notify(error.message || String(error)));
      return;
    }

    const joinId = target.dataset.dvoiceJoin;
    if (joinId) {
      event.preventDefault();
      event.stopImmediatePropagation();
      const row = rowFor(joinId);
      void getInstances().then(instances => {
        const item = instances.get(String(joinId));
        const guild = row?.querySelector(`[data-dguild="${CSS.escape(String(joinId))}"]`);
        const channel = row?.querySelector(`[data-dchannel="${CSS.escape(String(joinId))}"]`);
        if (!row || !item || !guild || !channel) throw new Error('Discord-Instanz konnte nicht geladen werden.');
        return joinVoice(row, item, guild, channel, target);
      }).catch(error => notify(error.message || String(error)));
    }
  }, true);

  document.addEventListener('change', event => {
    const select = event.target;
    if (!(select instanceof HTMLSelectElement)) return;
    const row = select.closest('.listrow');
    const id = select.dataset.dguild || select.dataset.dchannel;
    if (!row || !id) return;
    void getInstances().then(instances => {
      const item = instances.get(String(id));
      if (!item) return;
      const guild = row.querySelector(`[data-dguild="${CSS.escape(String(id))}"]`);
      const channel = row.querySelector(`[data-dchannel="${CSS.escape(String(id))}"]`);
      if (select.dataset.dguild) {
        item.guildId = select.value;
        item.channelId = '';
        if (channel) fillSelect(channel, [], 'Voice-Kanal auswählen', '');
        return saveSelection(item, item.guildId, '').then(() => {
          const status = row.querySelector(`[data-dstatus="${CSS.escape(String(id))}"]`);
          if (guild && status && guild.value) void loadChannels(row, item, guild, channel, status);
        });
      }
      item.channelId = select.value;
      return saveSelection(item, item.guildId || guild?.value || '', item.channelId);
    }).catch(error => notify(error.message || String(error)));
  }, true);

  const style = document.createElement('style');
  style.id = 'discord-instance-actions-style';
  style.textContent = `
    [data-discord-direct-actions]{width:100%;display:grid;gap:8px;margin:8px 0}
    .discord-direct-actions-row{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:8px}
    .discord-direct-field{display:grid;gap:4px;font-size:.85rem}
    .discord-direct-select-wrap{display:flex;gap:5px;align-items:center}
    .discord-direct-select-wrap select{flex:1;min-width:0}
    .discord-direct-select-wrap button{min-width:40px;padding:.45rem .6rem}
    .discord-direct-actions-buttons{display:flex;gap:6px;align-items:center;flex-wrap:wrap}
    .discord-direct-actions-buttons button{flex:0 0 auto}
    .discord-direct-status{font-size:.8rem;opacity:.75}
    @media(max-width:760px){.discord-direct-actions-row{grid-template-columns:1fr}}
  `;
  if (!document.getElementById('discord-instance-actions-style')) document.head.appendChild(style);

  new MutationObserver(scheduleDecorate).observe(document.documentElement, { childList: true, subtree: true });
  decorate();
})();
