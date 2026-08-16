(() => {
  const $x = (s) => document.querySelector(s);
  const fmt = (n) => { if (n < 1024) return `${Math.round(n)} B`; if (n < 1048576) return `${(n/1024).toFixed(1)} KB`; if (n < 1073741824) return `${(n/1048576).toFixed(1)} MB`; return `${(n/1073741824).toFixed(1)} GB`; };
  const state = { prev: null, timer: null };

  function injectHeader() {
    const header = document.querySelector('header');
    if (!header || document.querySelector('#musikbot-livebar')) return;
    const live = document.createElement('div');
    live.id = 'musikbot-livebar';
    live.className = 'livebar';
    live.innerHTML = `
      <span class="live-chip" id="live-cpu">CPU —</span>
      <span class="live-chip" id="live-ram">RAM —</span>
      <span class="live-chip" id="live-net">NET ↓ — · ↑ —</span>
      <span class="live-chip live-select-wrap"><span id="live-active">Kein Ausgang</span></span>
      <span class="live-chip clock-chip" id="live-clock">--:--:--</span>
      <button class="live-button" id="live-system">⚡ System</button>
      <button class="live-button" id="live-theme" title="Theme umschalten">◐</button>
      <button class="live-button" id="live-settings" title="Einstellungen">⚙</button>`;
    const actions = header.querySelector('.header-actions');
    header.insertBefore(live, actions || null);
    $x('#live-system').onclick = () => window.setView?.('settings');
    $x('#live-settings').onclick = () => window.setView?.('settings');
    $x('#live-theme').onclick = () => {
      document.documentElement.classList.toggle('light-mode');
      localStorage.setItem('musikbot187Theme', document.documentElement.classList.contains('light-mode') ? 'light' : 'dark');
    };
    if (localStorage.musikbot187Theme === 'light') document.documentElement.classList.add('light-mode');
  }

  function clock() { const el = $x('#live-clock'); if (el) el.textContent = new Date().toLocaleTimeString('de-DE'); }

  async function updateHeader() {
    injectHeader(); clock();
    if (!window.token && !localStorage.musikbot187Token) return;
    try {
      const [s, net] = await Promise.all([api('/api/state'), api('/api/network')]);
      const cpu = Math.min(100, Math.round((s.load?.[0] || 0) / Math.max(1, (await api('/api/system')).cores) * 100));
      const sys = await api('/api/system');
      $x('#live-cpu').textContent = `CPU ${cpu}%`;
      $x('#live-ram').textContent = `RAM ${Math.round((sys.ram.used / Math.max(1, sys.ram.total)) * 100)}%`;
      const selected = net.interfaces.find(x => x.name === s.settings.networkInterface) || net.interfaces[0];
      if (selected && state.prev && state.prev.name === selected.name) {
        const dr = Math.max(0, selected.rx - state.prev.rx) * 0.2;
        const du = Math.max(0, selected.tx - state.prev.tx) * 0.2;
        $x('#live-net').textContent = `NET ↓ ${fmt(dr)}/s · ↑ ${fmt(du)}/s`;
      } else if (selected) $x('#live-net').textContent = `NET ↓ ${fmt(selected.rx)} · ↑ ${fmt(selected.tx)}`;
      if (selected) state.prev = selected;
      const active = s.discord.find(x => s.settings.activeOutputType === 'discord' && x.id === s.settings.activeInstanceId) || s.ts3.find(x => s.settings.activeOutputType === 'ts3' && x.id === s.settings.activeInstanceId);
      $x('#live-active').textContent = active ? `${s.settings.activeOutputType === 'discord' ? 'Discord' : 'TS3'} · ${active.name}` : 'Kein Ausgang';
      injectSetupBanner();
    } catch (e) { console.debug('livebar', e); }
  }

  async function injectSetupBanner() {
    if (window.view !== 'dashboard') return;
    const content = $x('#content');
    if (!content) return;
    if ($x('#setup-link-banner')) return;
    try {
      const setup = await fetch('/api/setup').then(r => r.json());
      if (!setup.initialized) return;
      const link = window.location.origin + '/';
      const banner = document.createElement('div');
      banner.id = 'setup-link-banner';
      banner.className = 'setup-link-banner';
      banner.innerHTML = `<div><div class="setup-link-title">✨ Musikbot 187 ist bereit</div><div class="setup-link-text">Einrichtungs-/Zugangslink</div></div><code>${link}</code><div class="setup-actions"><button id="copy-setup-link">Link kopieren</button><button id="open-setup-link">Öffnen</button></div>`;
      content.prepend(banner);
      $x('#copy-setup-link').onclick = async () => { try { await navigator.clipboard.writeText(link); $x('#copy-setup-link').textContent = '✓ Kopiert'; } catch {} };
      $x('#open-setup-link').onclick = () => window.open(link, '_blank');
    } catch {}
  }

  async function loadGuilds(id, selectedId) {
    try {
      const guilds = await api(`/api/discord/${id}/guilds`);
      const sel = $x(`#d187-guild-${id}`);
      if (!sel) return;
      sel.innerHTML = `<option value="">Server auswählen…</option>` + guilds.map(g => `<option value="${esc(g.id)}" ${g.id===selectedId?'selected':''}>${esc(g.name)} · ${esc(g.id)}</option>`).join('');
      if (selectedId) await loadChannels(id, selectedId, $x(`#d187-channel-${id}`)?.dataset.selected || '');
    } catch {}
  }

  async function loadChannels(id, guildId, selectedId) {
    if (!guildId) return;
    try {
      const channels = await api(`/api/discord/${id}/guilds/${guildId}/channels`);
      const sel = $x(`#d187-channel-${id}`);
      if (!sel) return;
      sel.innerHTML = `<option value="">Voice-Channel auswählen…</option>` + channels.map(c => `<option value="${esc(c.id)}" ${c.id===selectedId?'selected':''}>${esc(c.name)} · ${esc(c.id)}</option>`).join('');
    } catch {}
  }

  async function saveDiscord187(id) {
    const body = { id, name: $x(`#d187-name-${id}`).value, clientId: $x(`#d187-client-${id}`).value, guildId: $x(`#d187-guild-${id}`).value, channelId: $x(`#d187-channel-${id}`).value, prefix: $x(`#d187-prefix-${id}`).value };
    const token = $x(`#d187-token-${id}`).value.trim();
    if (token) body.token = token;
    await post('/api/discord', body);
    await loadGuilds(id, body.guildId);
    alert('Discord-Instanz gespeichert.');
  }

  async function addDiscord187() {
    const id = crypto.randomUUID();
    await post('/api/discord', { id, name: 'Discord', clientId: '', token: '', guildId: '', channelId: '', prefix: '!' });
    await window.instances();
  }

  async function enhanceDiscordInstances() {
    const content = $x('#content'); if (!content) return;
    const data = await api('/api/discord');
    const wrapper = document.createElement('div'); wrapper.className = 'discord-settings-modern';
    wrapper.innerHTML = `<div class="card"><div class="row"><div style="flex:1"><h2 style="margin:0">🎧 Discord-Instanzen</h2><p class="muted small">Mehrere Bots gleichzeitig verwalten. Server und Voice-Channel werden nach der Verbindung automatisch angezeigt.</p></div><button id="add-discord-187">＋ Instanz</button></div></div>`;
    data.forEach((x) => {
      const invite = x.clientId ? `https://discord.com/oauth2/authorize?client_id=${encodeURIComponent(x.clientId)}&scope=bot%20applications.commands&permissions=36700160` : '';
      const card = document.createElement('div'); card.className = 'card discord-editor';
      card.innerHTML = `<div class="discord-editor-head"><div><h3>${esc(x.name)}</h3><span class="status-pill ${x.hasToken?'ok':'warn'}">${x.hasToken?'Token gespeichert':'Token fehlt'}</span></div><div class="actions">${invite?`<a href="${invite}" target="_blank" class="button-link">➕ Bot zu Discord hinzufügen</a><button data-copy="${esc(invite)}">Link kopieren</button>`:''}</div></div><div class="form-grid"><label>Name<input id="d187-name-${x.id}" value="${esc(x.name)}"></label><label>Prefix<input id="d187-prefix-${x.id}" value="${esc(x.prefix||'!')}"></label><label>Bot-Token<input id="d187-token-${x.id}" type="password" placeholder="leer = vorhandenen Token behalten"></label><label>Client-ID<input id="d187-client-${x.id}" value="${esc(x.clientId||'')}"></label><label>Discord-Server<select id="d187-guild-${x.id}"><option value="">Verbinden, um Server zu laden…</option></select></label><label>Voice-Channel<select id="d187-channel-${x.id}" data-selected="${esc(x.channelId||'')}"><option value="">Server zuerst auswählen…</option></select></label></div><div class="discord-id-note">Guild-ID und Voice-Channel-ID werden automatisch aus Discord übernommen; du musst keine IDs auswendig eingeben.</div><div class="row discord-editor-actions"><button class="primary" data-save="${x.id}">Speichern / verbinden</button><button data-connect="${x.id}">Neu verbinden</button><button data-join="${x.id}">Voice verbinden</button><button data-disconnect="${x.id}">Trennen</button></div>`;
      wrapper.appendChild(card);
      setTimeout(() => loadGuilds(x.id, x.guildId), 0);
    });
    content.innerHTML = '';
    content.appendChild(wrapper);
    $x('#add-discord-187').onclick = addDiscord187;
    wrapper.querySelectorAll('[data-copy]').forEach(b => b.onclick = async () => { await navigator.clipboard.writeText(b.dataset.copy); b.textContent='✓ Kopiert'; });
    wrapper.querySelectorAll('[data-save]').forEach(b => b.onclick = async () => { try { await saveDiscord187(b.dataset.save); } catch(e) { alert(e.message); } });
    wrapper.querySelectorAll('[data-connect]').forEach(b => b.onclick = async () => { try { await post(`/api/discord/${b.dataset.connect}/connect`); await enhanceDiscordInstances(); } catch(e){ alert(e.message); } });
    wrapper.querySelectorAll('[data-join]').forEach(b => b.onclick = async () => { try { await post(`/api/discord/${b.dataset.join}/join`); alert('Voice-Verbindung hergestellt.'); } catch(e){ alert(e.message); } });
    wrapper.querySelectorAll('[data-disconnect]').forEach(b => b.onclick = async () => { await post(`/api/discord/${b.dataset.disconnect}/disconnect`); alert('Discord getrennt.'); });
    wrapper.querySelectorAll('select[id^="d187-guild-"]').forEach(sel => sel.onchange = () => loadChannels(sel.id.replace('d187-guild-',''), sel.value, ''));
  }

  const originalInstances = window.instances;
  if (originalInstances) window.instances = async function(){ await originalInstances(); await enhanceDiscordInstances(); };
  setInterval(clock, 1000);
  setInterval(updateHeader, 5000);
  document.addEventListener('DOMContentLoaded', () => { setTimeout(injectHeader, 100); setTimeout(updateHeader, 300); });
  window.addEventListener('load', () => { injectHeader(); updateHeader(); });
})();
