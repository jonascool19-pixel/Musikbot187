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
      values.prefix = values.prefix || disabledDiscordMarker;
      values.identity = values.identity || disabledTs3Marker;
    }
    return values;
  }
  async function saveInstanceForms() {
    const discord = [...document.querySelectorAll('#discordForms .instance-form')].map(form => formData(form));
    const ts3 = [...document.querySelectorAll('#ts3Forms .instance-form')].map(form => formData(form));
    const settings = await api('/api/settings');
    const spotifyOld = settings.instances.spotify || [];
    const spotify = spotifyOld.length ? [{ clientId: $('#spid')?.value || spotifyOld[0].clientId, clientSecret: $('#spsecret')?.value || spotifyOld[0].clientSecret }] : [];
    await api('/api/settings', { method:'PUT', body:JSON.stringify({ discord, ts3, spotify }) });
    notify('Instanzen gespeichert und neu verbunden.', 'success');
    await load();
  }
  function makeDiscordForm(x, i, live) {
    const enabled = x.prefix !== disabledDiscordMarker && live?.enabled !== false;
    const error = live?.error || '';
    return `<div class="instance-form instance-card" data-kind="discord">
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
      ${live?.inviteUrl ? `<a class="invite" href="${esc(live.inviteUrl)}" target="_blank" rel="noopener">Bot zu Discord hinzufügen ↗</a>` : '<div class="muted">Einladungslink wird nach dem Discord-Login angezeigt.</div>'}
      <div class="form-actions"><button class="primary" onclick="saveInstanceSettings()">Speichern / verbinden</button><button class="danger" onclick="removeInstanceCard(this)">Entfernen</button></div>
    </div>`;
  }
  function makeTs3Form(x, i, live) {
    const enabled = x.identity !== disabledTs3Marker && live?.enabled !== false;
    return `<div class="instance-form instance-card" data-kind="ts3">
      <div class="instance-card-head"><div><b>${esc(x.name || `TS3 ${i+1}`)}</b><span class="instance-live-status ${enabled ? (live?.connected ? 'ok' : 'bad') : 'bad'}">${enabled ? (live?.connected ? 'Online' : 'Offline') : 'Deaktiviert'}</span></div>
      <label class="instance-switch"><span>Aktiv</span><input type="checkbox" data-enabled ${enabled ? 'checked' : ''}></label></div>
      <div class="form-grid two">
        <label>Name<input data-f="name" value="${esc(x.name || `TS3 ${i+1}`)}"></label>
        <label>Host<input data-f="host" value="${esc(x.host || '')}"></label>
        <label>Channel<input data-f="channel" value="${esc(x.channel || '')}"></label>
        <label>Nickname<input data-f="nickname" value="${esc(x.nickname || 'RadioBot TS3')}"></label>
        <input type="hidden" data-f="identity" value="${esc(x.identity === disabledTs3Marker ? '' : (x.identity || ''))}">
      </div>
      <div class="form-actions"><button class="primary" onclick="saveInstanceSettings()">Speichern / verbinden</button><button class="danger" onclick="removeInstanceCard(this)">Entfernen</button></div>
    </div>`;
  }
  window.removeInstanceCard = button => { button.closest('.instance-card')?.remove(); };
  window.saveInstanceSettings = () => saveInstanceForms().catch(error => notify(error.message, 'error'));
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
      checkbox.addEventListener('change', () => syncToggle(form, type));
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
})();
