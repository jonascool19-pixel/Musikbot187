(() => {
  const disabledDiscordMarker = '__RADIOBOT_DISABLED__';
  const disabledTs3Marker = '__RADIOBOT_DISABLED__';

  function liveMap() {
    return new Map((state.instances || []).map(x => [x.id, x]));
  }

  function disabledFor(form) {
    const checkbox = form.querySelector('[data-enabled]');
    return checkbox ? !checkbox.checked : false;
  }

  function syncToggle(form, type) {
    const checkbox = form.querySelector('[data-enabled]');
    if (!checkbox) return;
    const markerField = form.querySelector('[data-f="prefix"], [data-f="identity"]');
    if (!markerField) return;
    if (!checkbox.checked) {
      if (!form.dataset.enabledValue) form.dataset.enabledValue = markerField.value || (type === 'discord' ? '!' : '');
      markerField.value = type === 'discord' ? disabledDiscordMarker : disabledTs3Marker;
    } else {
      markerField.value = form.dataset.enabledValue || (type === 'discord' ? '!' : '');
    }
    const status = form.querySelector('.instance-live-status');
    if (status) {
      status.textContent = checkbox.checked ? 'Aktiviert' : 'Deaktiviert';
      status.className = `instance-live-status ${checkbox.checked ? 'ok' : 'bad'}`;
    }
  }

  function formData(form) {
    const values = Object.fromEntries([...form.querySelectorAll('[data-f]')].map(input => [input.dataset.f, input.value]));
    const checkbox = form.querySelector('[data-enabled]');
    if (checkbox && !checkbox.checked) {
      values.prefix = disabledDiscordMarker;
      values.identity = disabledTs3Marker;
    } else if (checkbox && form.dataset.enabledValue) {
      if (values.prefix === disabledDiscordMarker) values.prefix = form.dataset.enabledValue || '!';
      if (values.identity === disabledTs3Marker) values.identity = form.dataset.enabledValue || '';
    }
    return values;
  }

  async function saveInstanceForms(options = {}) {
    const discord = [...document.querySelectorAll('#discordForms .instance-form')].map(form => formData(form));
    const ts3 = [...document.querySelectorAll('#ts3Forms .instance-form')].map(form => formData(form));
    const settings = await api('/api/settings');
    const spotifyOld = settings.instances.spotify || [];
    const spotify = spotifyOld.length ? [{ clientId: $('#spid')?.value || spotifyOld[0].clientId, clientSecret: $('#spsecret')?.value || spotifyOld[0].clientSecret }] : [];
    await api('/api/settings', { method:'PUT', body:JSON.stringify({ discord, ts3, spotify }) });
    notify(options.message || 'Instanzen gespeichert und neu verbunden.', 'success');
    await load();
  }

  function tokenInviteUrl(token) {
    try {
      const first = String(token || '').split('.')[0];
      if (!first) return '';
      const padded = first.replace(/-/g, '+').replace(/_/g, '/') + '=='.slice((first.length + 3) % 4);
      const clientId = atob(padded).trim();
      if (!/^\d+$/.test(clientId)) return '';
      const permissions = '2150632448';
      return `https://discord.com/oauth2/authorize?client_id=${encodeURIComponent(clientId)}&scope=bot%20applications.commands&permissions=${permissions}`;
    } catch {
      return '';
    }
  }

  function inviteForForm(form) {
    const id = form.querySelector('[data-f="id"]')?.value || '';
    const live = liveMap().get(id);
    const configuredToken = form.querySelector('[data-f="token"]')?.value || '';
    return live?.inviteUrl || tokenInviteUrl(configuredToken);
  }

  window.createDiscordInvite = async button => {
    const form = button.closest('.instance-card');
    const url = form ? inviteForForm(form) : '';
    if (!url) {
      notify('Einladungslink konnte nicht erzeugt werden. Prüfe den Bot-Token.', 'error');
      return;
    }
    let link = form.querySelector('.generated-invite');
    if (!link) {
      link = document.createElement('a');
      link.className = 'invite generated-invite';
      link.target = '_blank';
      link.rel = 'noopener';
      form.querySelector('.discord-actions')?.appendChild(link);
    }
    link.href = url;
    link.textContent = 'Bot zu Discord hinzufügen ↗';
    link.style.display = 'inline-flex';
    notify('Discord-Einladungslink wurde erzeugt.', 'success');
  };

  function makeDiscordForm(x, i, live) {
    const enabled = x.prefix !== disabledDiscordMarker && live?.enabled !== false;
    const error = live?.error || '';
    const invite = live?.inviteUrl || tokenInviteUrl('');
    return `<div class="instance-form instance-card" data-kind="discord">
      <input type="hidden" data-f="id" value="${esc(x.id || `discord-${i+1}`)}">
      <div class="instance-card-head"><div><b>${esc(x.name || `Discord ${i+1}`)}</b><span class="instance-live-status ${enabled ? (live?.connected ? 'ok' : 'bad') : 'bad'}">${enabled ? (live?.connected ? 'Online' : 'Offline') : 'Deaktiviert'}</span></div>
      <label class="instance-switch"><span>Aktiv</span><input type="checkbox" data-enabled ${enabled ? 'checked' : ''}></label></div>
      <div class="form-grid two">
        <label>Name<input data-f="name" value="${esc(x.name || `Discord ${i+1}`)}"></label>
        <label>Bot-Token<input data-f="token" type="password" placeholder="leer = vorhandenen Token behalten"></label>
        <label>Guild-ID<input data-f="guildId" value="${esc(x.guildId || '')}"></label>
        <label>Voice-Channel-ID<input data-f="voiceChannelId" value="${esc(x.voiceChannelId || '')}"></label>
        <label>Prefix<input data-f="prefix" value="${esc(x.prefix === disabledDiscordMarker ? '!' : (x.prefix || '!'))}"></label>
      </div>
      ${error ? `<div class="instance-error">Discord: ${esc(error)}</div>` : ''}
      <div class="discord-actions">
        ${invite ? `<a class="invite generated-invite" href="${esc(invite)}" target="_blank" rel="noopener">Bot zu Discord hinzufügen ↗</a>` : ''}
        <button type="button" onclick="createDiscordInvite(this)">Einladungslink erzeugen</button>
      </div>
      <div class="form-actions"><button class="primary" onclick="saveInstanceSettings(this)">Speichern / verbinden</button><button class="ghost" onclick="restartDiscordInstance(this)">Neu verbinden</button><button class="danger" onclick="removeInstanceCard(this)">Entfernen</button></div>
    </div>`;
  }

  function makeTs3Form(x, i, live) {
    const enabled = x.identity !== disabledTs3Marker && live?.enabled !== false;
    return `<div class="instance-form instance-card" data-kind="ts3">
      <input type="hidden" data-f="id" value="${esc(x.id || `ts3-${i+1}`)}">
      <div class="instance-card-head"><div><b>${esc(x.name || `TS3 ${i+1}`)}</b><span class="instance-live-status ${enabled ? (live?.connected ? 'ok' : 'bad') : 'bad'}">${enabled ? (live?.connected ? 'Online' : 'Offline') : 'Deaktiviert'}</span></div>
      <label class="instance-switch"><span>Aktiv</span><input type="checkbox" data-enabled ${enabled ? 'checked' : ''}></label></div>
      <div class="form-grid two">
        <label>Name<input data-f="name" value="${esc(x.name || `TS3 ${i+1}`)}"></label>
        <label>Host<input data-f="host" value="${esc(x.host || '')}"></label>
        <label>Channel<input data-f="channel" value="${esc(x.channel || '')}"></label>
        <label>Nickname<input data-f="nickname" value="${esc(x.nickname || 'RadioBot TS3')}"></label>
        <input type="hidden" data-f="identity" value="${esc(x.identity === disabledTs3Marker ? '' : (x.identity || ''))}">
      </div>
      <div class="form-actions"><button class="primary" onclick="saveInstanceSettings(this)">Speichern / verbinden</button><button class="danger" onclick="removeInstanceCard(this)">Entfernen</button></div>
    </div>`;
  }

  window.removeInstanceCard = button => { button.closest('.instance-card')?.remove(); };
  window.saveInstanceSettings = button => {
    const form = button?.closest?.('.instance-card');
    if (form) syncToggle(form, form.dataset.kind);
    return saveInstanceForms().catch(error => notify(error.message, 'error'));
  };
  window.restartDiscordInstance = async button => {
    const form = button.closest('.instance-card');
    if (form) syncToggle(form, 'discord');
    await saveInstanceForms({ message:'Discord-Instanz wird neu verbunden.' }).catch(error => notify(error.message, 'error'));
  };
  window.addDiscordInstance = () => {
    const box = $('#discordForms'); if (!box) return;
    const i = box.querySelectorAll('.instance-card').length + 1;
    box.insertAdjacentHTML('beforeend', makeDiscordForm({id:`discord-${Date.now()}-${i}`,name:`Discord ${i}`,prefix:'!'}, i, null));
    bindInstanceSwitches();
  };
  window.addTs3Instance = () => {
    const box = $('#ts3Forms'); if (!box) return;
    const i = box.querySelectorAll('.instance-card').length + 1;
    box.insertAdjacentHTML('beforeend', makeTs3Form({id:`ts3-${Date.now()}-${i}`,name:`TS3 ${i}`,identity:''}, i, null));
    bindInstanceSwitches();
  };

  function bindInstanceSwitches() {
    document.querySelectorAll('.instance-card').forEach(form => {
      const type = form.dataset.kind;
      const checkbox = form.querySelector('[data-enabled]');
      if (!checkbox || checkbox.dataset.bound) return;
      checkbox.dataset.bound = '1';
      checkbox.addEventListener('change', async () => {
        syncToggle(form, type);
        await saveInstanceForms({ message: `${type === 'discord' ? 'Discord' : 'TS3'}-Instanz ${checkbox.checked ? 'aktiviert' : 'deaktiviert'}.` }).catch(error => notify(error.message, 'error'));
      });
    });
  }

  window.showInstanceSettings = async (view, settings) => {
    const live = liveMap();
    const discord = settings.instances.discord || [];
    const ts3 = settings.instances.ts3 || [];
    view.innerHTML = `<div class="settings-grid">
      <div class="page-panel"><div class="page-head"><div><h2>Discord-Instanzen</h2><p>Mehrere Bots gleichzeitig verwalten. Jede Instanz kann einzeln aktiviert oder deaktiviert werden.</p></div><button onclick="addDiscordInstance()">+ Instanz</button></div><div id="discordForms">${discord.map((x,i)=>makeDiscordForm(x,i,live.get(x.id))).join('') || '<div class="empty">Keine Discord-Instanz angelegt.</div>'}</div></div>
      <div class="page-panel"><div class="page-head"><div><h2>TeamSpeak 3</h2><p>Mehrere TS3-Server getrennt verwalten und einzeln schalten.</p></div><button onclick="addTs3Instance()">+ Instanz</button></div><div id="ts3Forms">${ts3.map((x,i)=>makeTs3Form(x,i,live.get(x.id))).join('') || '<div class="empty">Keine TS3-Instanz angelegt.</div>'}</div></div>
    </div>
    <div class="page-panel"><div class="page-head"><div><h2>Spotify</h2><p class="muted">Optionaler Zugriff für Suche und Auflösung.</p></div></div><div class="form-grid two"><label>Client-ID<input id="spid" value="${esc((settings.instances.spotify||[])[0]?.clientId||'')}"></label><label>Client-Secret<input id="spsecret" type="password" placeholder="unverändert lassen"></label></div><button class="primary" onclick="saveInstanceSettings()">Alle Instanzen speichern</button></div>`;
    bindInstanceSwitches();
  };

  window.renderSettings = async function renderSettingsOverride(container) {
    const settings = await api('/api/settings');
    container.innerHTML = `<div class="settings-tabs"><button class="active" data-settab="instances">Instanzen</button><button data-settab="users">Benutzer & Rechte</button><button data-settab="system">System</button><button data-settab="builder">UI-Baukasten</button></div><div id="settingsView"></div>`;
    const tabs = document.querySelectorAll('[data-settab]');
    tabs.forEach(button => button.onclick = () => {
      tabs.forEach(tab => tab.classList.toggle('active', tab === button));
      const key = button.dataset.settab;
      if (key === 'instances') window.showInstanceSettings($('#settingsView'), settings);
      else if (key === 'users') renderUsers($('#settingsView'));
      else if (key === 'system') renderStatus($('#settingsView'));
      else $('#settingsView').innerHTML = `<div class="page-panel"><h2>UI-Baukasten</h2><p class="muted">Kacheln direkt auf dem Dashboard ziehen. Die Reihenfolge wird automatisch gespeichert.</p><button class="primary" onclick="go('dashboard')">Zum Baukasten</button></div>`;
    });
    window.showInstanceSettings($('#settingsView'), settings);
  };
})();
