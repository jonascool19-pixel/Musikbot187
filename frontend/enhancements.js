(() => {
  const q = s => document.querySelector(s);
  const esc = v => String(v ?? '').replace(/[&<>\"']/g, c => ({ '&':'&amp;', '<':'&lt;', '>':'&gt;', '\"':'&quot;', "'":'&#39;' }[c]));
  const nativeFetch = () => window.MusikBotFetch?.nativeFetch || window.fetch.bind(window);
  const api = (path, options = {}) => {
    const headers = new Headers(options.headers || {});
    const auth = window.MusikBotFetch?.getAuth?.();
    if (auth && !headers.has('Authorization')) headers.set('Authorization', auth);
    options.headers = headers;
    return nativeFetch()(path, options).then(async r => { const b = await r.json().catch(() => ({})); if (!r.ok) throw Error(b.error || `HTTP ${r.status}`); return b; });
  };
  const post = (path, body = {}) => api(path, { method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify(body) });
  const put = (path, body = {}) => api(path, { method:'PUT', headers:{'Content-Type':'application/json'}, body:JSON.stringify(body) });
  function note(text) { const n = q('#notice'); if (!n) return; n.textContent = text; n.classList.add('show'); clearTimeout(window.__musikbotNoticeTimer); window.__musikbotNoticeTimer = setTimeout(() => n.classList.remove('show'), 3500); }
  async function snapshot() {
    if (!window.MusikBotFetch?.getAuth?.()) return null;
    try { const [state, health, discord, ts3] = await Promise.all([api('/api/state'), api('/api/health'), api('/api/discord'), api('/api/ts3')]); return { state, health, discord, ts3 }; }
    catch { return null; }
  }
  function applyTheme(name, accent = '') {
    const theme = window.MusikBotThemes?.apply(name || 'dark', accent) || {};
    document.body.dataset.theme = theme.mode || 'dark'; document.body.dataset.themeName = name || 'dark';
    if ((name === 'dark' || name === 'light') && accent && window.MusikBotThemes) window.MusikBotThemes.saveCustomAccent(accent);
  }
  async function saveTheme(name, accent) { try { await put('/api/settings', { theme: name, accentColor: accent || '' }); applyTheme(name, accent); note('Design gespeichert.'); } catch (e) { note(e.message); } }
  function renderThemePanel(stateData) {
    const admin = document.querySelector('#view section h2')?.textContent === 'Allgemeine Einstellungen'; if (!admin || q('#themePanel')) return;
    const host = document.querySelector('#view section'); if (!host) return;
    const saved = stateData?.settings || {}; const theme = saved.theme || document.body.dataset.themeName || 'dark'; const accent = saved.accentColor || window.MusikBotThemes?.customAccent?.() || '#0b69b3';
    const panel = document.createElement('section'); panel.id = 'themePanel';
    panel.innerHTML = `<div class="sectionhead"><div><h2>Design</h2><small>Farbschema, Hell/Dunkel-Modus und eigene Akzentfarbe</small></div></div><div class="theme-grid"><label>Theme<select id="themeSelect">${window.MusikBotThemes?.options?.() || ''}</select></label><label>Eigene Akzentfarbe<input id="accentColor" type="color" value="${esc(accent)}"></label><button id="themeReset">Akzentfarbe zurücksetzen</button><button id="themeSave">Design speichern</button></div>`;
    host.parentElement.insertBefore(panel, host.nextSibling); q('#themeSelect').value = theme;
    q('#themeSave').onclick = () => saveTheme(q('#themeSelect').value, q('#accentColor').value);
    q('#themeReset').onclick = () => { const value = '#0b69b3'; q('#accentColor').value = value; applyTheme(q('#themeSelect').value, value); note('Akzentfarbe zurückgesetzt.'); };
    q('#themeSelect').onchange = () => applyTheme(q('#themeSelect').value, q('#accentColor').value); q('#accentColor').oninput = e => applyTheme(q('#themeSelect').value, e.target.value);
  }
  function ensureHeader() {
    const top = q('.top'); if (!top || q('#enhancedControls')) return;
    const right = top.querySelector('.clock')?.parentElement || top; const box = document.createElement('div'); box.id = 'enhancedControls'; box.className = 'enhanced-controls'; right.insertBefore(box, right.querySelector('.clock'));
  }
  function renderControls(data) {
    ensureHeader(); const box = q('#enhancedControls'); if (!box || !data) return;
    const items = [...data.discord.map(x => ({ type:'discord', id:x.id, name:x.name, connected:x.connected })), ...data.ts3.map(x => ({ type:'ts3', id:x.id, name:x.name, connected:x.connected }))];
    const selected = `${data.state.settings.outputType}:${data.state.settings.outputId}`;
    const isAdmin = Boolean(q('[data-tab="admin"]'));
    box.innerHTML = `<label class="instance-control">Ausgabe<select id="enhancedOutput"><option value="none:">Keine</option>${items.map(x => `<option value="${esc(x.type)}:${esc(x.id)}" ${selected === `${x.type}:${x.id}` ? 'selected' : ''}>${x.connected ? '🟢' : '🔴'} ${esc(x.name)}</option>`).join('')}</select></label>${isAdmin ? '<button id="enhancedBot" class="mini-power">↻ Bot neu starten</button><button id="enhancedStopBot" class="mini-power danger">⏹ Bot stoppen</button><button id="enhancedRestart" class="mini-power">↻ Ubuntu</button><button id="enhancedShutdown" class="mini-power danger">⏻ Ubuntu</button>' : ''}`;
    q('#enhancedOutput').onchange = async e => { const [type,id] = String(e.target.value).split(':'); try { await put('/api/settings', { outputType:type, outputId:id || '' }); note('Ausgabeinstanz gespeichert.'); await refresh(); } catch (e) { note(e.message); } };
    const wire = (id, action, message, confirmText) => q(id)?.addEventListener('click', async () => { if (confirmText && !confirm(confirmText)) return; try { await post('/api/control', { action }); note(message); } catch (e) { note(e.message); } });
    wire('#enhancedBot', 'restart-bot', 'Bot wird neu gestartet.');
    wire('#enhancedStopBot', 'stop-bot', 'Bot wird gestoppt.', 'Bot wirklich stoppen? Das Dashboard ist danach nicht mehr erreichbar, bis der Dienst wieder gestartet wird.');
    wire('#enhancedRestart', 'restart-system', 'System wird neu gestartet.', 'Ubuntu jetzt neu starten?');
    wire('#enhancedShutdown', 'shutdown-system', 'System wird heruntergefahren.', 'Ubuntu jetzt herunterfahren?');
  }
  function renderDiscordDots(data) {
    const heading = [...document.querySelectorAll('h2')].find(x => x.textContent.trim() === 'Discord'); if (!heading) return;
    const section = heading.closest('section'); if (!section) return; const cards = [...section.querySelectorAll('article.card')];
    data.discord.forEach((item, index) => { const card = cards[index]; if (!card) return; const head = card.querySelector('.sectionhead'); if (!head) return; let dot = head.querySelector('.instance-status-dot'); if (!dot) { dot = document.createElement('span'); dot.className = 'instance-status-dot'; head.querySelector('b')?.appendChild(dot); } dot.textContent = item.voiceConnected ? ' 🟢' : item.connected ? ' 🟡' : ' 🔴'; dot.title = item.voiceConnected ? 'Discord verbunden und im Voice-Kanal' : item.connected ? 'Discord verbunden, Voice getrennt' : 'Discord getrennt'; });
  }
  function renderDiscordIntentToggle() {
    const form = q('#dp')?.closest('.grid'); if (!form) return;
    let label = q('#dintent')?.closest('label');
    if (!label) { label = document.createElement('label'); label.className = 'checklabel'; label.innerHTML = '<input id="dintent" type="checkbox"> Message Content Intent für Prefix Commands'; form.appendChild(label); }
    const id = q('#did')?.value; const current = (window.__musikbotDiscord || []).find?.(x => x.id === id); if (current && q('#dintent')) q('#dintent').checked = current.messageContentIntent === true;
  }
  async function saveDiscordWithIntent() {
    const id = q('#did')?.value || '';
    const body = { id, name:q('#dn')?.value || '', token:q('#dt')?.value || '', clientId:q('#dc')?.value || '', guildId:q('#dg')?.value || '', channelId:q('#dv')?.value || '', prefix:q('#dp')?.value || '', enabled:q('#de')?.checked !== false, messageContentIntent:q('#dintent')?.checked === true };
    await api('/api/discord', { method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify(body) }); note('Discord gespeichert.'); q('[data-tab="connections"]')?.click();
  }
  document.addEventListener('click', event => { const button = event.target.closest?.('#ds'); if (!button) return; renderDiscordIntentToggle(); event.preventDefault(); event.stopImmediatePropagation(); saveDiscordWithIntent().catch(error => note(error.message)); }, true);
  const observer = new MutationObserver(() => { renderDiscordIntentToggle(); });
  observer.observe(document.documentElement, { childList:true, subtree:true });
  async function refresh() { const data = await snapshot(); if (!data) return; window.__musikbotDiscord = data.discord; renderControls(data); renderDiscordDots(data); renderDiscordIntentToggle(); renderThemePanel(data.state); if (data.state?.settings) applyTheme(data.state.settings.theme || 'dark', data.state.settings.accentColor || window.MusikBotThemes?.customAccent?.() || ''); }
  const start = () => { if (!q('#app')) return setTimeout(start, 250); void refresh(); setInterval(refresh, 3000); };
  start();
})();
