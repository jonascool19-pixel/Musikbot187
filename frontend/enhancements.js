(() => {
  let authHeader = '';
  const nativeFetch = window.fetch.bind(window);
  window.fetch = async (input, init = {}) => {
    try {
      const headers = new Headers(init.headers || (input instanceof Request ? input.headers : undefined));
      const auth = headers.get('Authorization');
      if (auth) authHeader = auth;
    } catch {}
    return nativeFetch(input, init);
  };
  const q = s => document.querySelector(s);
  const esc = v => String(v ?? '').replace(/[&<>\"']/g, c => ({ '&':'&amp;', '<':'&lt;', '>':'&gt;', '\"':'&quot;', "'":'&#39;' }[c]));
  const api = (path, options = {}) => {
    const headers = new Headers(options.headers || {});
    if (authHeader && !headers.has('Authorization')) headers.set('Authorization', authHeader);
    options.headers = headers;
    return nativeFetch(path, options).then(async r => { const b = await r.json().catch(() => ({})); if (!r.ok) throw Error(b.error || `HTTP ${r.status}`); return b; });
  };
  const post = (path, body = {}) => api(path, { method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify(body) });
  const put = (path, body = {}) => api(path, { method:'PUT', headers:{'Content-Type':'application/json'}, body:JSON.stringify(body) });
  function note(text) { const n = q('#notice'); if (!n) return; n.textContent = text; n.classList.add('show'); setTimeout(() => n.classList.remove('show'), 3500); }
  async function snapshot() {
    if (!authHeader) return null;
    try {
      const [state, system, network, health, discord, ts3] = await Promise.all([api('/api/state'), api('/api/system'), api('/api/network'), api('/api/health'), api('/api/discord'), api('/api/ts3')]);
      return { state, system, network, health, discord, ts3 };
    } catch { return null; }
  }
  function applyTheme(name, accent = '') {
    const theme = window.MusikBotThemes?.apply(name || 'dark', accent) || {};
    document.body.dataset.theme = theme.mode || 'dark';
    document.body.dataset.themeName = name || 'dark';
    if (accent && window.MusikBotThemes) window.MusikBotThemes.saveCustomAccent(accent);
  }
  async function saveTheme(name, accent) {
    try { await put('/api/settings', { theme: name, accentColor: accent || '' }); applyTheme(name, accent); note('Design gespeichert.'); }
    catch (e) { note(e.message); }
  }
  function renderThemePanel(stateData) {
    const admin = document.querySelector('#view section h2')?.textContent === 'Allgemeine Einstellungen';
    if (!admin || q('#themePanel')) return;
    const host = document.querySelector('#view section');
    if (!host) return;
    const saved = stateData?.settings || {};
    const theme = saved.theme || document.body.dataset.themeName || 'dark';
    const accent = saved.accentColor || window.MusikBotThemes?.customAccent?.() || '#0b69b3';
    const panel = document.createElement('section');
    panel.id = 'themePanel';
    panel.innerHTML = `<div class="sectionhead"><div><h2>Design</h2><small>Farbschema, Hell/Dunkel-Modus und eigene Akzentfarbe</small></div></div><div class="theme-grid"><label>Theme<select id="themeSelect">${window.MusikBotThemes?.options?.() || ''}</select></label><label>Eigene Akzentfarbe<input id="accentColor" type="color" value="${esc(accent)}"></label><button id="themeReset">Akzentfarbe zurücksetzen</button><button id="themeSave">Design speichern</button></div>`;
    host.parentElement.insertBefore(panel, host.nextSibling);
    q('#themeSelect').value = theme;
    q('#themeSave').onclick = () => saveTheme(q('#themeSelect').value, q('#accentColor').value);
    q('#themeReset').onclick = () => { const value = '#0b69b3'; q('#accentColor').value = value; applyTheme(q('#themeSelect').value, value); note('Akzentfarbe zurückgesetzt.'); };
    q('#themeSelect').onchange = () => applyTheme(q('#themeSelect').value, q('#accentColor').value);
    q('#accentColor').oninput = e => applyTheme(q('#themeSelect').value, e.target.value);
  }
  function ensureHeader() {
    const top = q('.top'); if (!top || q('#enhancedControls')) return;
    const right = top.querySelector('.clock')?.parentElement || top;
    const box = document.createElement('div'); box.id = 'enhancedControls'; box.className = 'enhanced-controls'; right.insertBefore(box, right.querySelector('.clock'));
  }
  function renderControls(data) {
    ensureHeader(); const box = q('#enhancedControls'); if (!box || !data) return;
    const items = [...data.discord.map(x => ({ type:'discord', id:x.id, name:x.name, connected:x.connected })), ...data.ts3.map(x => ({ type:'ts3', id:x.id, name:x.name, connected:x.connected }))];
    const selected = `${data.state.settings.outputType}:${data.state.settings.outputId}`;
    box.innerHTML = `<label class="instance-control">Ausgabe<select id="enhancedOutput"><option value="none:">Keine</option>${items.map(x => `<option value="${esc(x.type)}:${esc(x.id)}" ${selected === `${x.type}:${x.id}` ? 'selected' : ''}>${x.connected ? '🟢' : '🔴'} ${esc(x.name)}</option>`).join('')}</select></label><button id="enhancedBot" class="mini-power">⏻ Bot ${data.health.ok ? 'Ein' : 'Aus'}</button><button id="enhancedRestart" class="mini-power">↻ Ubuntu</button><button id="enhancedShutdown" class="mini-power danger">⏻ Ubuntu</button>`;
    q('#enhancedOutput').onchange = async e => { const [type,id] = String(e.target.value).split(':'); try { await put('/api/settings', { outputType:type, outputId:id || '' }); note('Ausgabeinstanz gespeichert.'); await refresh(); } catch (e) { note(e.message); } };
    q('#enhancedBot').onclick = async () => { const action = data.health.ok ? 'stop-bot' : 'start-bot'; try { await post('/api/control', { action }); note(action === 'stop-bot' ? 'Bot wird gestoppt.' : 'Bot wird gestartet.'); setTimeout(refresh, 1000); } catch (e) { note(e.message); } };
    q('#enhancedRestart').onclick = async () => { if (!confirm('Ubuntu jetzt neu starten?')) return; try { await post('/api/control', { action:'restart-system' }); } catch (e) { note(e.message); } };
    q('#enhancedShutdown').onclick = async () => { if (!confirm('Ubuntu jetzt herunterfahren?')) return; try { await post('/api/control', { action:'shutdown-system' }); } catch (e) { note(e.message); } };
  }
  function renderMetrics(data) {
    const set = (id, value) => { const n = q(id); if (n) n.textContent = value; };
    set('#topCpu', `${Number(data.system.cpuPercent).toFixed(1)} %`); set('#topRam', `${Number(data.system.memory.percent).toFixed(1)} %`); set('#topNetRx', `↓ ${data.network.rxUtilizationPercent ?? 0}%`); set('#topNetTx', `↑ ${data.network.txUtilizationPercent ?? 0}%`); set('#topNetTotal', `${((data.network.totalRxBytes + data.network.totalTxBytes) / 1024).toFixed(1)} KB`);
    set('#sysCpu', `${Number(data.system.cpuPercent).toFixed(1)} %`); set('#sysRam', `${Number(data.system.memory.percent).toFixed(1)} %`); set('#sysRamDetail', `${data.system.memory.used} / ${data.system.memory.total}`); set('#sysNetRx', `${data.network.rxUtilizationPercent ?? 0}%`); set('#sysNetTx', `${data.network.txUtilizationPercent ?? 0}%`); set('#sysNetTotal', `${((data.network.totalRxBytes + data.network.totalTxBytes) / 1024).toFixed(1)} KB`);
  }
  function renderDiscordDots(data) {
    const heading = [...document.querySelectorAll('h2')].find(x => x.textContent.trim() === 'Discord'); if (!heading) return;
    const section = heading.closest('section'); if (!section) return;
    const cards = [...section.querySelectorAll('article.card')];
    data.discord.forEach((item, index) => { const card = cards[index]; if (!card) return; const head = card.querySelector('.sectionhead'); if (!head) return; let dot = head.querySelector('.instance-status-dot'); if (!dot) { dot = document.createElement('span'); dot.className = 'instance-status-dot'; head.querySelector('b')?.appendChild(dot); } dot.textContent = item.connected ? ' 🟢' : ' 🔴'; dot.title = item.connected ? 'Discord verbunden' : 'Discord getrennt'; });
  }
  async function refresh() {
    const data = await snapshot(); if (!data) return;
    renderControls(data); renderMetrics(data); renderDiscordDots(data); renderThemePanel(data.state);
    if (data.state?.settings) applyTheme(data.state.settings.theme || 'dark', data.state.settings.accentColor || window.MusikBotThemes?.customAccent?.() || '');
  }
  const start = () => { if (!q('#app')) return setTimeout(start, 250); void refresh(); setInterval(refresh, 1000); };
  start();
})();
