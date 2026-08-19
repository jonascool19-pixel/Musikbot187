(() => {
  const q = selector => document.querySelector(selector);
  const esc = value => String(value ?? '').replace(/[&<>\"']/g, char => ({ '&':'&amp;','<':'&lt;','>':'&gt;','\"':'&quot;', "'":'&#39;' }[char]));
  const nativeFetch = () => window.MusikBotFetch?.nativeFetch || window.fetch.bind(window);
  const auth = () => window.MusikBotFetch?.getAuth?.() || '';
  const currentUser = () => { try { return JSON.parse(sessionStorage.getItem('musikbot187.auth') || 'null')?.user || null; } catch { return null; } };
  const can = permission => { const user = currentUser(); return Boolean(user && (user.role === 'admin' || user.permissions?.includes(permission))); };
  let refreshInFlight = false;
  let refreshTimer = null;

  const api = (path, options = {}) => {
    const headers = new Headers(options.headers || {});
    const authorization = auth();
    if (authorization && !headers.has('Authorization')) headers.set('Authorization', authorization);
    return nativeFetch()(path, { ...options, headers }).then(async response => {
      const body = await response.json().catch(() => ({}));
      if (!response.ok) throw Error(body.error || `HTTP ${response.status}`);
      return body;
    });
  };
  const put = (path, body) => api(path, { method:'PUT', headers:{'Content-Type':'application/json'}, body:JSON.stringify(body) });
  const post = (path, body) => api(path, { method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify(body) });

  function note(text) {
    const node = q('#notice');
    if (!node) return;
    node.textContent = text;
    node.classList.add('show');
    clearTimeout(window.__musikbotEnhancementNotice);
    window.__musikbotEnhancementNotice = setTimeout(() => node.classList.remove('show'), 3500);
  }

  function applyTheme(name, accent = '') {
    const theme = window.MusikBotThemes?.apply(name || 'dark', accent) || {};
    document.body.dataset.theme = theme.mode || 'dark';
    document.body.dataset.themeName = name || 'dark';
    if (/^#[0-9a-f]{6}$/i.test(accent) && window.MusikBotThemes) window.MusikBotThemes.saveCustomAccent(accent);
  }

  function renderNetworkPercent() {
    const network = window.__musikbotLastNetwork;
    if (!network) return;
    const percent = value => Number.isFinite(value) ? `${value.toFixed(2)} %` : 'n/a';
    const set = (selector, value) => { const node = q(selector); if (node && node.textContent !== value) node.textContent = value; };
    set('#topNetRx', `RX ${percent(network.rxUtilizationPercent)} · ${formatRate(network.rxBytesPerSecond)}`);
    set('#topNetTx', `TX ${percent(network.txUtilizationPercent)} · ${formatRate(network.txBytesPerSecond)}`);
    set('#topNetTotal', `${percent(network.totalUtilizationPercent)} · ${formatBytes(network.totalRxBytes + network.totalTxBytes)}`);
    set('#sysNetRx', `${percent(network.rxUtilizationPercent)} · ${formatRate(network.rxBytesPerSecond)}`);
    set('#sysNetTx', `${percent(network.txUtilizationPercent)} · ${formatRate(network.txBytesPerSecond)}`);
    set('#sysNetTotal', `${percent(network.totalUtilizationPercent)} · ${formatBytes(network.totalRxBytes)} RX · ${formatBytes(network.totalTxBytes)} TX`);
  }
  const formatBytes = value => {
    if (!Number.isFinite(value) || value < 0) return '-';
    const units = ['B','KB','MB','GB','TB']; let number = value; let index = 0;
    while (number >= 1024 && index < units.length - 1) { number /= 1024; index += 1; }
    return `${number.toFixed(index ? 1 : 0)} ${units[index]}`;
  };
  const formatRate = value => `${formatBytes(value)}/s`;

  function ensureHeaderControls(data) {
    const top = q('.top');
    if (!top || !data) return;
    let box = q('#enhancedControls');
    if (!box) {
      const right = top.querySelector('.clock')?.parentElement || top;
      box = document.createElement('div'); box.id = 'enhancedControls'; box.className = 'enhanced-controls';
      right.insertBefore(box, right.querySelector('.clock'));
    }
    const items = [...data.discord.map(x => ({type:'discord', id:x.id, name:x.name, connected:x.connected})), ...data.ts3.map(x => ({type:'ts3', id:x.id, name:x.name, connected:x.connected}))];
    const selected = `${data.state.settings.outputType}:${data.state.settings.outputId}`;
    const isAdmin = currentUser()?.role === 'admin';
    const canOutput = can('settings.manage');
    const markup = `${canOutput ? `<label class="instance-control">Ausgabe<select id="enhancedOutput"><option value="none:">Keine</option>${items.map(x => `<option value="${esc(x.type)}:${esc(x.id)}" ${selected === `${x.type}:${x.id}` ? 'selected' : ''}>${x.connected ? '🟢' : '🔴'} ${esc(x.name)}</option>`).join('')}</select></label>` : ''}${isAdmin ? '<button id="enhancedBotStart" class="mini-power">▶ Bot Ein / Neu starten</button><button id="enhancedStopBot" class="mini-power danger">⏹ Bot stoppen</button><button id="enhancedRestart" class="mini-power">↻ Ubuntu</button><button id="enhancedShutdown" class="mini-power danger">⏻ Ubuntu</button>' : ''}`;
    if (box.dataset.signature !== markup) {
      box.dataset.signature = markup; box.innerHTML = markup;
      q('#enhancedOutput')?.addEventListener('change', async event => {
        const [type, id] = String(event.target.value).split(':');
        try { await put('/api/settings', { outputType:type, outputId:id || '' }); note('Ausgabeinstanz gespeichert.'); await refresh(); } catch (error) { note(error.message); }
      });
      const wire = (id, action, message, confirmText) => q(id)?.addEventListener('click', async () => {
        if (confirmText && !confirm(confirmText)) return;
        try { await post('/api/control', { action }); note(message); } catch (error) { note(error.message); }
      });
      wire('#enhancedBotStart','start-bot','Bot wird gestartet bzw. aktiviert.');
      wire('#enhancedStopBot','stop-bot','Bot wird gestoppt.','Bot wirklich stoppen?');
      wire('#enhancedRestart','restart-system','System wird neu gestartet.','Ubuntu jetzt neu starten?');
      wire('#enhancedShutdown','shutdown-system','Ubuntu wird heruntergefahren.','Ubuntu jetzt herunterfahren?');
    }
  }

  function renderDiscordDots(data) {
    const heading = [...document.querySelectorAll('h2')].find(node => node.textContent.trim() === 'Discord');
    const section = heading?.closest('section'); if (!section) return;
    const cards = [...section.querySelectorAll('article.card')];
    data.discord.forEach((item, index) => {
      const card = cards[index]; if (!card) return;
      const head = card.querySelector('.sectionhead'); if (!head) return;
      let dot = head.querySelector('.instance-status-dot');
      if (!dot) { dot = document.createElement('span'); dot.className = 'instance-status-dot'; head.querySelector('b')?.appendChild(dot); }
      const text = item.voiceConnected ? ' 🟢' : item.connected ? ' 🟡' : ' 🔴';
      if (dot.textContent !== text) dot.textContent = text;
    });
  }

  function renderDiscordIntentToggle() {
    const form = q('#dp')?.closest('.grid'); if (!form) return;
    let label = q('#dintent')?.closest('label');
    if (!label) { label = document.createElement('label'); label.className = 'checklabel'; label.innerHTML = '<input id="dintent" type="checkbox"> Message Content Intent für Prefix Commands'; form.appendChild(label); }
    const id = q('#did')?.value;
    const current = (window.__musikbotDiscord || []).find(item => item.id === id);
    if (current && q('#dintent')) q('#dintent').checked = current.messageContentIntent === true;
    const saveButton = q('#ds'); if (!saveButton || saveButton.dataset.intentWired) return;
    saveButton.dataset.intentWired = '1';
    saveButton.onclick = async () => {
      const body = { id:q('#did')?.value || '', name:q('#dn')?.value || '', token:q('#dt')?.value || '', clientId:q('#dc')?.value || '', guildId:q('#dg')?.value || '', channelId:q('#dv')?.value || '', prefix:q('#dp')?.value || '', enabled:q('#de')?.checked !== false, messageContentIntent:q('#dintent')?.checked === true };
      try { await api('/api/discord',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)}); note('Discord gespeichert.'); document.querySelector('[data-tab="connections"]')?.click(); } catch (error) { note(error.message); }
    };
  }

  function installDesignTab() {
    const nav = document.querySelector('nav');
    if (!nav || nav.querySelector('[data-extra-tab="design"]') || !can('design.manage')) return;
    const button = document.createElement('button'); button.className = 'navbtn'; button.dataset.extraTab = 'design'; button.textContent = '🎨 Design'; button.title = 'Theme und Farben'; button.onclick = () => openDesign();
    const anchor = nav.querySelector('[data-tab="playlists"]'); if (anchor) anchor.insertAdjacentElement('afterend', button); else nav.appendChild(button);
  }

  async function openDesign() {
    if (!can('design.manage')) return note('Keine Berechtigung für das Design.');
    const buttons = document.querySelectorAll('nav .navbtn'); buttons.forEach(button => button.classList.toggle('active', button.dataset.extraTab === 'design'));
    document.body.dataset.currentTab = 'design';
    try {
      const data = await api('/api/state'); const settings = data.settings || {}; const theme = settings.theme || 'dark'; const accent = settings.accentColor || window.MusikBotThemes?.customAccent?.() || '#0b69b3';
      q('#view').innerHTML = `<section><div class="sectionhead"><div><h2>🎨 Design</h2><small>Theme, Hell/Dunkel-Modus und Akzentfarbe</small></div></div><div class="theme-grid"><label>Theme<select id="designTheme">${window.MusikBotThemes?.options?.() || ''}</select></label><label>Akzentfarbe<input id="designAccent" type="color" value="${esc(accent)}"></label><button id="designReset">Akzentfarbe zurücksetzen</button><button id="designSave">Design speichern</button></div></section>`;
      q('#designTheme').value = theme;
      q('#designTheme').onchange = () => applyTheme(q('#designTheme').value, q('#designAccent').value);
      q('#designAccent').oninput = event => applyTheme(q('#designTheme').value, event.target.value);
      q('#designReset').onclick = () => { q('#designAccent').value = '#0b69b3'; applyTheme(q('#designTheme').value, '#0b69b3'); };
      q('#designSave').onclick = async () => { try { const nextTheme=q('#designTheme').value; const nextAccent=q('#designAccent').value; await put('/api/settings',{theme:nextTheme,accentColor:nextAccent}); applyTheme(nextTheme,nextAccent); note('Design gespeichert.'); } catch(error){ note(error.message); } };
      applyTheme(theme, accent);
    } catch (error) { note(error.message); }
  }

  async function refresh() {
    if (refreshInFlight || !auth()) return;
    refreshInFlight = true;
    try {
      const stateData = await api('/api/state'); const health = await api('/api/health');
      const currentTab = document.body.dataset.currentTab || document.querySelector('nav .navbtn.active')?.dataset.tab || '';
      const needsConnections = ['connections','admin','design'].includes(currentTab) || Boolean(q('#enhancedOutput'));
      const [discord, ts3] = needsConnections ? await Promise.all([api('/api/discord'),api('/api/ts3')]) : [[],[]];
      window.__musikbotLastSnapshot = { state:stateData, health, discord, ts3 }; window.__musikbotDiscord = discord;
      try { window.__musikbotLastNetwork = await api('/api/network'); } catch {}
      ensureHeaderControls({state:stateData, discord, ts3}); renderDiscordDots({discord}); renderDiscordIntentToggle(); installDesignTab();
      window.MusikBotNavigation?.refresh?.(); renderNetworkPercent();
      if (stateData.settings) applyTheme(stateData.settings.theme || 'dark', stateData.settings.accentColor || window.MusikBotThemes?.customAccent?.() || '');
      window.__musikbotEnhanceMusicResults?.();
    } catch (error) { console.warn('MusikBot187 enhancement refresh:', error); }
    finally { refreshInFlight = false; }
  }

  const start = () => { if (!q('#app')) return window.setTimeout(start, 250); void refresh(); };
  start(); refreshTimer = window.setInterval(() => void refresh(), 10000);
  window.__musikbotRegisterCleanup?.(() => { if (refreshTimer) window.clearInterval(refreshTimer); });
  document.addEventListener('click', event => { if (event.target.closest?.('[data-tab="connections"]')) window.setTimeout(renderDiscordIntentToggle, 50); });
  window.__musikbotOpenDesign = openDesign;
})();
