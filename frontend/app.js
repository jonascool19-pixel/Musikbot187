const app = document.getElementById('app');
let state = {};
let currentPage = 'dashboard';
let clockTimer;
let pollTimer;
const $ = (s, r = document) => r.querySelector(s);
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

async function api(url, opt = {}) {
  const r = await fetch(url, { headers: { 'Content-Type': 'application/json', ...(opt.headers || {}) }, credentials: 'include', ...opt });
  const d = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(d.error || `HTTP ${r.status}`);
  return d;
}
function notify(message, type = 'info') {
  let box = $('#toast');
  if (!box) { box = document.createElement('div'); box.id = 'toast'; document.body.appendChild(box); }
  box.className = `toast ${type}`;
  box.textContent = message;
  clearTimeout(box._t);
  box._t = setTimeout(() => box.remove(), 3200);
}
function formatBytes(n) {
  if (!Number.isFinite(n)) return '—';
  const units = ['B','KB','MB','GB','TB']; let i = 0; let x = n;
  while (x >= 1024 && i < units.length - 1) { x /= 1024; i++; }
  return `${x.toFixed(i ? 1 : 0)} ${units[i]}`;
}
function formatDuration(sec) {
  sec = Math.max(0, Math.floor(Number(sec) || 0));
  const h = Math.floor(sec / 3600), m = Math.floor((sec % 3600) / 60), s = sec % 60;
  return h ? `${h}:${String(m).padStart(2,'0')}:${String(s).padStart(2,'0')}` : `${m}:${String(s).padStart(2,'0')}`;
}
async function setupStatus() { return api('/api/setup/status'); }

async function firstUser() {
  app.innerHTML = `<section class="auth-screen"><div class="auth-card"><div class="brand-mark">♫</div><div class="eyebrow">ERSTEINRICHTUNG · 1 / 3</div><h1>Willkommen bei RadioBot</h1><p>Lege zuerst den Administrator an. Danach kannst du die Bots und Instanzen einrichten.</p><form id="userForm"><label>Benutzername<input name="username" required autocomplete="username"></label><label>Passwort<input name="password" type="password" minlength="12" required autocomplete="new-password"></label><label>Passwort wiederholen<input name="password2" type="password" minlength="12" required></label><button class="primary full">Administrator erstellen</button></form><div id="msg" class="form-msg"></div></div></section>`;
  $('#userForm').onsubmit = async e => { e.preventDefault(); const f = new FormData(e.currentTarget); if (f.get('password') !== f.get('password2')) return $('#msg').textContent = 'Passwörter stimmen nicht überein.'; try { await api('/api/setup/user', { method: 'POST', body: JSON.stringify({ username: f.get('username'), password: f.get('password') }) }); showLogin('Administrator erstellt. Jetzt anmelden.'); } catch (err) { $('#msg').textContent = err.message; } };
}
function showLogin(info = '') {
  app.innerHTML = `<section class="auth-screen"><div class="auth-card"><div class="brand-mark">♫</div><div class="eyebrow purple">RADIOBOT</div><h1>Anmelden</h1><p>${esc(info || 'Melde dich an, um das Dashboard zu öffnen.')}</p><form id="login"><label>Benutzername<input name="username" required autocomplete="username"></label><label>Passwort<input name="password" type="password" required autocomplete="current-password"></label><button class="primary full">Anmelden</button></form><div id="msg" class="form-msg"></div></div></section>`;
  $('#login').onsubmit = async e => { e.preventDefault(); const f = new FormData(e.currentTarget); try { await api('/api/auth/login', { method: 'POST', body: JSON.stringify({ username: f.get('username'), password: f.get('password') }) }); await load(); } catch (err) { $('#msg').textContent = err.message; } };
}
async function setupWizard() {
  app.innerHTML = `<section class="auth-screen"><div class="auth-card setup-wide"><div class="eyebrow amber">ERSTEINRICHTUNG · 2 / 3</div><h1>Instanzen verbinden</h1><p>Richte Discord und TeamSpeak 3 ein. Weitere Instanzen kannst du später unter Einstellungen hinzufügen.</p><div class="form-grid two"><div class="panel"><div class="panel-title"><span>Discord</span><span class="pill">BOT</span></div><label>Name<input id="dname" value="Discord Hauptinstanz"></label><label>Bot Token<input id="dtoken" type="password"></label><label>Guild ID<input id="dguild" placeholder="123456789"></label><label>Voice Channel ID<input id="dvoice" placeholder="123456789"></label></div><div class="panel"><div class="panel-title"><span>TeamSpeak 3</span><span class="pill blue">TS3</span></div><label>Name<input id="tname" value="TS3 Hauptinstanz"></label><label>Server / Host<input id="thost" placeholder="ts.example.de"></label><label>Channel<input id="tchan"></label><label>Nickname<input id="tnick" value="RadioBot TS3"></label><label>Serverpasswort<input id="tpass" type="password"></label></div></div><div class="panel"><div class="panel-title"><span>Spotify</span><span class="muted">optional</span></div><div class="form-grid two"><label>Client ID<input id="spid"></label><label>Client Secret<input id="spsecret" type="password"></label></div></div><button id="finish" class="primary full">Speichern & Dashboard öffnen</button><div id="msg" class="form-msg"></div></div></section>`;
  $('#finish').onclick = async () => {
    const discord = [{ id: 'discord-main', name: $('#dname').value, token: $('#dtoken').value, guildId: $('#dguild').value, voiceChannelId: $('#dvoice').value, prefix: '!' }].filter(x => x.token);
    const ts3 = [{ id: 'ts3-main', name: $('#tname').value, host: $('#thost').value, channel: $('#tchan').value, nickname: $('#tnick').value, serverPassword: $('#tpass').value }].filter(x => x.host);
    try { await api('/api/settings', { method: 'PUT', body: JSON.stringify({ discord, ts3, spotify: [{ clientId: $('#spid').value, clientSecret: $('#spsecret').value }].filter(x => x.clientId && x.clientSecret) }) }); await load(); } catch (e) { $('#msg').textContent = e.message; }
  };
}

async function load() {
  clearInterval(pollTimer); clearInterval(clockTimer);
  try { state = await api('/api/state'); renderShell(); renderPage(currentPage); startLiveUpdates(); }
  catch (e) {
    const s = await setupStatus();
    if (!s.userCreated) return firstUser();
    try { await api('/api/me'); } catch { return showLogin(); }
    if (!s.setupComplete) return setupWizard();
    showLogin();
  }
}
function startLiveUpdates() {
  updateClock(); clockTimer = setInterval(updateClock, 1000);
  pollTimer = setInterval(async () => { try { state.system = await api('/api/system/status'); if (currentPage === 'dashboard') refreshLiveBits(); } catch {} }, 3000);
}
function updateClock() {
  const el = $('#clock'); if (!el) return;
  const d = new Date(); el.textContent = d.toLocaleTimeString('de-DE', { hour:'2-digit', minute:'2-digit', second:'2-digit' });
}
function navItem(id, icon, label) { return `<button class="nav-item ${currentPage === id ? 'active' : ''}" data-nav="${id}"><span>${icon}</span><span>${label}</span></button>`; }
function renderShell() {
  const u = state.currentUser || {};
  const instances = state.instances || [];
  app.innerHTML = `<div class="app-shell"><aside class="sidebar"><div class="brand"><span class="brand-icon">♫</span><div><strong>MusikBot187</strong><small>v2.0</small></div></div><nav>${navItem('dashboard','⌂','Dashboard')}${navItem('search','⌕','Suche')}${navItem('radio','◉','Radio')}<span class="nav-badge-row">${navItem('playlists','≡','Playlists')}</span>${navItem('queue','☷','Queue')}${navItem('files','▣','Dateien')}${navItem('settings','⚙','Einstellungen')}${navItem('status','◒','Status')}${navItem('updates','↻','Updates')}</nav><div class="sidebar-bottom"><span class="dot green"></span><span>Online</span><small>${esc(u.username || '')} · ${esc(u.role || '')}</small></div></aside><main class="main"><header class="topbar"><div><div class="eyebrow">DASHBOARD</div><h1 id="pageTitle">${pageTitle(currentPage)}</h1><p id="pageSubtitle">${pageSubtitle(currentPage)}</p></div><div class="top-actions"><select id="instanceSwitch" title="Aktive Instanz">${instances.length ? instances.map(x => `<option value="${esc(x.id)}" ${x.id===state.activeInstance?'selected':''}>${esc(x.name)} · ${esc(x.type?.toUpperCase())}</option>`).join('') : '<option>Keine Instanz</option>'}</select><div id="clock" class="clock">--:--:--</div><button class="ghost" id="updateCheck">◌ Update prüfen</button><button class="primary small" id="updateBtn">↻ Update</button><button class="icon-btn" id="settingsQuick">⚙</button></div></header><section id="content"></section></main></div>`;
  $('#instanceSwitch')?.addEventListener('change', async e => { try { await api('/api/settings',{method:'PUT',body:JSON.stringify({activeInstance:e.target.value})}); await load(); } catch (err) { notify(err.message,'error'); } });
  $('#settingsQuick')?.addEventListener('click', () => go('settings'));
  $('#updateCheck')?.addEventListener('click', () => notify('Der Update-Check ist vorbereitet.','info'));
  $('#updateBtn')?.addEventListener('click', async () => { try { await api('/api/system/restart-bot',{method:'POST'}); notify('Bot wird neu gestartet.','success'); } catch (e) { notify(e.message,'error'); } });
  document.querySelectorAll('[data-nav]').forEach(b => b.addEventListener('click', () => go(b.dataset.nav)));
}
function pageTitle(p) { return ({dashboard:'Dashboard',search:'Suche',radio:'Radio',playlists:'Playlists',queue:'Queue',files:'Dateien',settings:'Einstellungen',status:'Systemauslastung',updates:'Updates'})[p] || 'Dashboard'; }
function pageSubtitle(p) { return ({dashboard:'Übersicht & Steuerung',search:'Titel und Quellen finden',radio:'Radiosender durchsuchen',playlists:'Playlists verwalten',queue:'Warteschlange',files:'Lokale Medien',settings:'Instanzen, Benutzer und System',status:'CPU, RAM und Systemaktionen',updates:'Version und Wartung'})[p] || ''; }
function go(page) { currentPage = page; renderShell(); renderPage(page); updateClock(); }
function activeInstance() { return (state.instances || []).find(x => x.id === state.activeInstance); }
function tile(id, title, body, cls='') { return `<article class="tile ${cls}" data-tile="${id}" draggable="true"><header class="tile-head"><div><strong>${title}</strong></div><span class="drag-handle">☷</span></header>${body}</article>`; }
function meter(label, value, unit='%') { return `<div class="meter-row"><div><span>${label}</span><strong>${Math.round(value)}${unit}</strong></div><div class="meter"><span style="width:${Math.max(0,Math.min(100,value))}%"></span></div></div>`; }
function makeTile(id) {
  const a = activeInstance(); const sys = state.system || {};
  if (id === 'hero') return tile('hero','Jetzt läuft',`<div class="now-playing"><div class="cover">♫</div><div><h2>${esc(a?.playing || 'Keine Wiedergabe')}</h2><p>${esc(a?.name || 'Keine aktive Instanz')}</p><div class="meta"><span>Quelle</span><b>${esc(a?.type === 'discord' ? 'Discord' : a?.type === 'ts3' ? 'TeamSpeak 3' : '—')}</b><span>Status</span><b class="ok">${a?.connected ? '▶ Wiedergabe' : '● Offline'}</b></div></div></div><div class="controls"><button class="primary" onclick="control('pause')">Ⅱ Pause</button><button onclick="control('stop')">■ Stop</button><button onclick="control('skip')">≫ Skip</button></div>`,'hero-tile');
  if (id === 'queue') return tile('queue','Nächstes (Queue)',`<div id="queueBox">${(a?.queue || []).slice(0,5).map((x,i)=>`<div class="queue-row"><span class="num">${i+1}</span><span>${esc(x)}</span></div>`).join('') || '<div class="empty">Queue ist leer.</div>'}</div>`,'queue-tile');
  if (id === 'controls') return tile('controls','Status',`<div class="stat-grid"><div><span>Instanz</span><strong>${esc(a?.name || '—')}</strong></div><div><span>Verbindung</span><strong class="${a?.connected?'ok':'bad'}">${a?.connected?'Wiedergabe':'Offline'}</strong></div><div><span>Aktueller Titel</span><strong>${esc(a?.playing || '—')}</strong></div><div><span>Uptime</span><strong>${formatDuration(sys.processUptime)}</strong></div></div>`,'status-tile');
  if (id === 'mode') return tile('mode','Wiedergabe-Modus',`<div class="toggle-line"><span>Zufallswiedergabe</span><button class="switch on" onclick="this.classList.toggle('on')"><i></i></button></div><div class="select-like">Playlist wiederholen <span>⌄</span></div>${meter('Lautstärke', a?.volume ?? state.settings?.volume ?? 80)}<div class="volume-line"><input type="range" min="0" max="100" value="${a?.volume ?? 80}" oninput="control('volume',this.value)"></div>`,'mode-tile');
  if (id === 'quick') return tile('quick','Schnellzugriff',`<div class="quick-grid"><button class="quick green-bg" onclick="go('search')">⌕<b>Suche</b><small>Musik finden</small></button><button class="quick blue-bg" onclick="go('radio')">◉<b>Radio</b><small>Sender suchen</small></button><button class="quick purple-bg" onclick="go('playlists')">≡<b>Playlists</b><small>Verwalten</small></button><button class="quick amber-bg" onclick="go('files')">▣<b>Dateien</b><small>Lokale Musik</small></button></div>`,'quick-tile');
  if (id === 'system') return tile('system','Systemauslastung',`${meter('CPU',sys.cpuPercent)}${meter('RAM',sys.memoryPercent)}<div class="sys-actions"><button onclick="go('status')">Details</button><button onclick="systemAction('restart-bot')">Bot neu starten</button></div>`,'system-tile');
  if (id === 'discord') return tile('discord','Discord',`<div class="service-state"><span class="dot ${a?.type==='discord'&&a?.connected?'green':'red'}"></span><b>${a?.type==='discord'&&a?.connected?'Online':'Offline'}</b></div><p class="muted">${esc(a?.type==='discord' ? (a.error || a.botUser || 'Discord Bot') : 'Instanzwechsel oben')}</p>${a?.type==='discord' && a?.inviteUrl ? `<a class="invite" href="${esc(a.inviteUrl)}" target="_blank" rel="noreferrer">Bot einladen ↗</a>` : ''}`,'compact');
  if (id === 'ts3') return tile('ts3','TeamSpeak 3',`<div class="service-state"><span class="dot ${a?.type==='ts3'&&a?.connected?'green':'red'}"></span><b>${a?.type==='ts3'&&a?.connected?'Online':'Offline'}</b></div><p class="muted">${esc(a?.type==='ts3' ? (a.error || a.name || 'TS3') : 'Instanzwechsel oben')}</p>`,'compact');
  if (id === 'search') return tile('search','Suche',`<form onsubmit="searchMedia(event)" class="inline-form"><input name="q" placeholder="Titel, Interpret oder URL"><button class="primary">Suchen</button></form><div id="results"></div>`);
  if (id === 'radio') return tile('radio','Radio',`<form onsubmit="searchRadio(event)" class="inline-form"><input name="q" placeholder="Sender suchen"><button class="primary">Suchen</button></form><div id="radioResults"></div>`);
  if (id === 'media') return tile('media','Medien',`<p class="muted">Direkte URL, YouTube, Radio-Stream und weitere Quellen über die gemeinsame Wiedergabe.</p><button class="ghost" onclick="playPrompt()">Quelle abspielen</button>`);
  if (id === 'playlists') return tile('playlists','Playlists',`<div class="list">${(state.playlists||[]).slice(0,5).map(p=>`<div class="row"><span>${esc(p.name)}</span><button onclick="playPlaylist('${p.id}')">▶</button></div>`).join('') || '<div class="empty">Noch keine Playlists.</div>'}</div><button class="ghost" onclick="newPlaylist()">+ Playlist</button>`);
  if (id === 'spotify') return tile('spotify','Spotify',`<form onsubmit="searchSpotify(event)" class="inline-form"><input name="q" placeholder="Song / Interpret"><button class="primary">Suchen</button></form><div id="spotifyResults"></div>`);
  if (id === 'youtube') return tile('youtube','YouTube',`<p class="muted">Suche und Wiedergabe über yt-dlp.</p><button class="ghost" onclick="go('search')">Zur Suche</button>`);
  return '';
}
function renderPage(page) {
  const content = $('#content'); if (!content) return;
  if (page === 'dashboard') { content.innerHTML = `<div class="dashboard-grid" id="grid">${(state.uiOrder || []).map(id => makeTile(id)).join('')}</div><div class="dashboard-footer">${statusChannel()}<div class="footer-meta"><span>RadioBot v2.0</span><span class="dot green"></span><span>Online</span></div></div>`; bindDnD(); refreshLiveBits(); return; }
  if (page === 'settings') return renderSettings(content);
  if (page === 'status') return renderStatus(content);
  if (page === 'search') return renderSearchPage(content);
  if (page === 'radio') return renderRadioPage(content);
  if (page === 'playlists') return renderPlaylistsPage(content);
  if (page === 'queue') return renderQueuePage(content);
  if (page === 'files') return renderFilesPage(content);
  if (page === 'updates') return renderUpdatesPage(content);
}
function refreshLiveBits() {
  const a = activeInstance(); const s = state.system || {};
  const q = $('#queueBox'); if (q) q.innerHTML = (a?.queue || []).slice(0,5).map((x,i)=>`<div class="queue-row"><span class="num">${i+1}</span><span>${esc(x)}</span></div>`).join('') || '<div class="empty">Queue ist leer.</div>';
  const meters = document.querySelectorAll('.system-tile .meter-row'); if (meters[0]) { const v=meters[0].querySelector('.meter span'); if(v)v.style.width=`${s.cpuPercent||0}%`; meters[0].querySelector('strong').textContent=`${Math.round(s.cpuPercent||0)}%`; } if (meters[1]) { const v=meters[1].querySelector('.meter span'); if(v)v.style.width=`${s.memoryPercent||0}%`; meters[1].querySelector('strong').textContent=`${Math.round(s.memoryPercent||0)}%`; }
}
function statusChannel() { return `<section class="status-channel"><div><strong>Status-Kanal</strong><span># musik-bot-status</span><small><span class="dot green"></span> Status-Nachrichten werden angezeigt</small></div><button>Ändern</button></section>`; }
function renderSearchPage(c) { c.innerHTML = `<section class="page-panel"><div class="page-head"><div><h2>Suche</h2><p>Finde Musik und füge sie direkt zur Queue hinzu.</p></div></div><form onsubmit="searchMedia(event)" class="search-big"><input name="q" placeholder="Titel, Interpret, YouTube-URL ..."><button class="primary">Suchen</button></form><div id="results" class="result-grid"></div></section>`; }
function renderRadioPage(c) { c.innerHTML = `<section class="page-panel"><div class="page-head"><div><h2>Radio</h2><p>Radiosender suchen und direkt abspielen.</p></div></div><form onsubmit="searchRadio(event)" class="search-big"><input name="q" placeholder="Sender, Genre, Land ..."><button class="primary">Suchen</button></form><div id="radioResults" class="result-grid"></div></section>`; }
function renderPlaylistsPage(c) { c.innerHTML = `<section class="page-panel"><div class="page-head"><div><h2>Playlists</h2><p>Deine Wiedergabelisten verwalten.</p></div><button class="primary" onclick="newPlaylist()">+ Playlist</button></div><div class="playlist-grid">${(state.playlists||[]).map(p=>`<div class="panel playlist-card"><h3>${esc(p.name)}</h3><span>${p.items?.length||0} Titel</span><div><button class="primary" onclick="playPlaylist('${p.id}')">▶ Starten</button><button onclick="deletePlaylist('${p.id}')">Löschen</button></div></div>`).join('') || '<div class="empty">Noch keine Playlists.</div>'}</div></section>`; }
async function renderQueuePage(c) { try { const q=await api('/api/queue'); c.innerHTML=`<section class="page-panel"><div class="page-head"><div><h2>Queue</h2><p>Aktuelle Wiedergabe und nächste Titel.</p></div><button onclick="control('stop')">Queue leeren</button></div><div class="queue-large"><div class="queue-current"><span>Jetzt läuft</span><strong>${esc(q.current||'—')}</strong></div>${(q.queue||[]).map((x,i)=>`<div class="queue-item"><span>${i+1}</span><b>${esc(x)}</b></div>`).join('')||'<div class="empty">Queue ist leer.</div>'}</div></section>`;}catch(e){c.innerHTML=`<section class="page-panel"><div class="empty">${esc(e.message)}</div></section>`;} }
function renderFilesPage(c) { c.innerHTML = `<section class="page-panel"><h2>Dateien</h2><p class="muted">Lokale Medienintegration ist vorbereitet. Die Wiedergabe kann bereits direkte URLs und Streams nutzen.</p><div class="empty large">Dateiverwaltung folgt als eigener Medienbereich.</div></section>`; }
function renderUpdatesPage(c) { c.innerHTML = `<section class="page-panel"><div class="page-head"><div><h2>Updates</h2><p>Versionsstand und Dienstwartung.</p></div><button class="primary" onclick="systemAction('restart-bot')">Bot neu starten</button></div><div class="panel"><b>RadioBot v2.0</b><p class="muted">Der Dienst startet automatisch mit Ubuntu über systemd.</p></div></section>`; }

async function renderStatus(c) {
  try { const s = await api('/api/system/status'); state.system=s; c.innerHTML=`<section class="status-layout"><div class="system-cards"><div class="metric-card"><span>CPU</span><strong>${s.cpuPercent}%</strong><div class="meter"><span style="width:${s.cpuPercent}%"></span></div><small>${s.cpuCores} Kerne</small></div><div class="metric-card"><span>RAM</span><strong>${s.memoryPercent}%</strong><div class="meter"><span style="width:${s.memoryPercent}%"></span></div><small>${formatBytes(s.memoryUsed)} / ${formatBytes(s.memoryTotal)}</small></div><div class="metric-card"><span>Uptime</span><strong>${formatDuration(s.processUptime)}</strong><small>Bot-Prozess</small></div></div><div class="page-panel"><div class="page-head"><div><h2>Systemaktionen</h2><p>Nur Administratoren dürfen diese Funktionen ausführen.</p></div></div><div class="action-grid"><button onclick="systemAction('restart-bot')">↻ Bot neu starten</button><button onclick="systemAction('reboot')">⟲ Ubuntu neu starten</button><button class="danger" onclick="systemAction('shutdown')">⏻ Ubuntu ausschalten</button></div><div class="panel details"><div><span>Hostname</span><b>${esc(s.hostname)}</b></div><div><span>Node.js</span><b>${esc(s.node)}</b></div><div><span>System-Uptime</span><b>${formatDuration(s.uptime)}</b></div></div></div></section>`; } catch(e) { c.innerHTML=`<section class="page-panel"><div class="empty">${esc(e.message)}</div></section>`; }
}
async function renderSettings(c) {
  const s = await api('/api/settings');
  const st = state.instances || [];
  c.innerHTML = `<div class="settings-tabs"><button class="active" data-settab="instances">Instanzen</button><button data-settab="users">Benutzer & Rechte</button><button data-settab="system">System</button><button data-settab="builder">UI-Baukasten</button></div><div id="settingsView"></div>`;
  document.querySelectorAll('[data-settab]').forEach(b => b.onclick=()=>{document.querySelectorAll('[data-settab]').forEach(x=>x.classList.toggle('active',x===b)); const key=b.dataset.settab; if(key==='instances') showInstanceSettings($('#settingsView'),s); else if(key==='users') showUserSettings($('#settingsView')); else if(key==='system') renderStatus($('#settingsView')); else showBuilderSettings($('#settingsView')); });
  showInstanceSettings($('#settingsView'), s);
}
function showInstanceSettings(v,s) {
  const ds=s.instances.discord||[], ts=s.instances.ts3||[];
  v.innerHTML=`<div class="settings-grid"><div class="page-panel"><div class="page-head"><div><h2>Discord-Instanzen</h2><p>Token speichern, Verbindung prüfen und Bot einladen.</p></div><button onclick="addDiscord()">+ Instanz</button></div><div id="discordForms">${ds.map((x,i)=>instanceForm('discord',x,i)).join('') || '<div class="empty">Keine Discord-Instanz angelegt.</div>'}</div></div><div class="page-panel"><div class="page-head"><div><h2>TeamSpeak 3</h2><p>Mehrere TS3-Server getrennt verwalten.</p></div><button onclick="addTs3()">+ Instanz</button></div><div id="ts3Forms">${ts.map((x,i)=>instanceForm('ts3',x,i)).join('') || '<div class="empty">Keine TS3-Instanz angelegt.</div>'}</div></div></div><div class="page-panel"><div class="page-head"><div><h2>Spotify</h2><p>Optionaler Zugriff für Suche und Auflösung.</p></div></div><div class="form-grid two"><label>Client ID<input id="spid" value="${esc((s.instances.spotify||[])[0]?.clientId||'')}"></label><label>Client Secret<input id="spsecret" type="password" placeholder="unverändert lassen"></label></div><button class="primary" onclick="saveAllInstances()">Alles speichern</button></div>`;
}
function instanceForm(type,x,i) { const canRemove=(type==='discord'?(state.settings||{}).discord?.length:0); if(type==='discord') return `<div class="instance-form" data-kind="discord"><input type="hidden" data-f="id" value="${esc(x.id||'discord-'+(i+1))}"><div class="form-grid two"><label>Name<input data-f="name" value="${esc(x.name||'Discord '+(i+1))}"></label><label>Token<input data-f="token" type="password" placeholder="Token neu eingeben (leer = behalten)"></label><label>Guild ID<input data-f="guildId" value="${esc(x.guildId||'')}"></label><label>Voice Channel ID<input data-f="voiceChannelId" value="${esc(x.voiceChannelId||'')}"></label></div><div class="form-actions"><button onclick="reconnectDiscord('${esc(x.id)}')">Verbindung testen</button><button class="danger" onclick="removeInstance('discord',this)">Entfernen</button></div></div>`; return `<div class="instance-form" data-kind="ts3"><input type="hidden" data-f="id" value="${esc(x.id||'ts3-'+(i+1))}"><div class="form-grid two"><label>Name<input data-f="name" value="${esc(x.name||'TS3 '+(i+1))}"></label><label>Host<input data-f="host" value="${esc(x.host||'')}"></label><label>Channel<input data-f="channel" value="${esc(x.channel||'')}"></label><label>Nickname<input data-f="nickname" value="${esc(x.nickname||'RadioBot TS3')}"></label></div><div class="form-actions"><button class="danger" onclick="removeInstance('ts3',this)">Entfernen</button></div></div>`; }
function addDiscord(){const box=$('#discordForms'); const count=box.querySelectorAll('[data-kind="discord"]').length+1; box.insertAdjacentHTML('beforeend',instanceForm('discord',{id:`discord-${count}`,name:`Discord ${count}`},count-1));}
function addTs3(){const box=$('#ts3Forms'); const count=box.querySelectorAll('[data-kind="ts3"]').length+1; box.insertAdjacentHTML('beforeend',instanceForm('ts3',{id:`ts3-${count}`,name:`TS3 ${count}`},count-1));}
function removeInstance(kind,btn){btn.closest('.instance-form').remove();}
async function saveAllInstances(){
  const discord=[...document.querySelectorAll('#discordForms .instance-form')].map(f=>Object.fromEntries([...f.querySelectorAll('[data-f]')].map(i=>[i.dataset.f,i.value])));
  const ts3=[...document.querySelectorAll('#ts3Forms .instance-form')].map(f=>Object.fromEntries([...f.querySelectorAll('[data-f]')].map(i=>[i.dataset.f,i.value])));
  const oldSpotify=(await api('/api/settings')).instances.spotify||[];
  const spotify=oldSpotify.length?[{clientId:$('#spid').value||oldSpotify[0].clientId,clientSecret:$('#spsecret').value||oldSpotify[0].clientSecret}]:[];
  try{await api('/api/settings',{method:'PUT',body:JSON.stringify({discord,ts3,spotify})});notify('Instanzen gespeichert.','success');await load();}catch(e){notify(e.message,'error');}
}
async function reconnectDiscord(id){ try{await saveAllInstances();}catch{} }
async function showUserSettings(v){
  try { const users=await api('/api/users'); v.innerHTML=`<div class="page-panel"><div class="page-head"><div><h2>Benutzer & Rechte</h2><p>Administratoren, Operatoren und reine Leser verwalten.</p></div><button class="primary" onclick="newUser()">+ Benutzer</button></div><div class="user-table">${users.map(u=>`<div class="user-row"><div><b>${esc(u.username)}</b><small>${esc(u.role)}</small></div><div><select onchange="changeUserRole('${u.id}',this.value)"><option value="admin" ${u.role==='admin'?'selected':''}>Admin</option><option value="operator" ${u.role==='operator'?'selected':''}>Operator</option><option value="viewer" ${u.role==='viewer'?'selected':''}>Viewer</option></select><button class="danger" onclick="deleteUser('${u.id}')">Löschen</button></div></div>`).join('')}</div></div>`; } catch(e) { v.innerHTML=`<div class="page-panel"><div class="empty">${esc(e.message)}</div></div>`; }
}
async function newUser(){const username=prompt('Benutzername'); if(!username)return; const password=prompt('Passwort (mind. 12 Zeichen)'); if(!password)return; const role=prompt('Rolle: admin / operator / viewer','operator')||'operator'; try{await api('/api/users',{method:'POST',body:JSON.stringify({username,password,role})});notify('Benutzer angelegt.','success');document.querySelector('[data-settab="users"]')?.click();}catch(e){notify(e.message,'error');}}
async function changeUserRole(id,role){try{await api('/api/users/'+id,{method:'PUT',body:JSON.stringify({role})});notify('Rechte aktualisiert.','success');}catch(e){notify(e.message,'error');}}
async function deleteUser(id){if(!confirm('Benutzer wirklich löschen?'))return;try{await api('/api/users/'+id,{method:'DELETE'});notify('Benutzer gelöscht.','success');document.querySelector('[data-settab="users"]')?.click();}catch(e){notify(e.message,'error');}}
function showBuilderSettings(v){v.innerHTML=`<div class="page-panel"><h2>UI-Baukasten</h2><p>Ziehe die Kacheln direkt auf dem Dashboard. Die Position wird automatisch gespeichert. Neue Kacheln wie Systemauslastung können dort wie jede andere Kachel platziert werden.</p><button class="primary" onclick="go('dashboard')">Baukasten öffnen</button></div>`;}
function bindDnD(){const grid=$('#grid');if(!grid)return;let drag=null;grid.querySelectorAll('.tile').forEach(el=>{el.addEventListener('dragstart',()=>{drag=el;el.classList.add('dragging')});el.addEventListener('dragend',async()=>{el.classList.remove('dragging');drag=null;const order=[...grid.querySelectorAll('.tile')].map(x=>x.dataset.tile);try{await api('/api/ui/layout',{method:'PUT',body:JSON.stringify({order})});state.uiOrder=order;}catch(e){notify(e.message,'error')}});el.addEventListener('dragover',e=>{e.preventDefault();if(!drag||drag===el)return;const r=el.getBoundingClientRect();el.parentNode.insertBefore(drag,e.clientY<r.top+r.height/2?el:el.nextSibling)});});}
async function searchMedia(e){e.preventDefault();const q=new FormData(e.target).get('q');try{const rows=await api('/api/search?q='+encodeURIComponent(q));$('#results').innerHTML=rows.map(x=>`<div class="result-row"><span>${esc(x.title)}</span><button onclick="playInput(${JSON.stringify(x.url)})">▶</button></div>`).join('')||'<div class="empty">Keine Treffer.</div>';}catch(err){notify(err.message,'error')}}
async function searchRadio(e){e.preventDefault();const q=new FormData(e.target).get('q');try{const rows=await api('/api/radio/search?q='+encodeURIComponent(q));$('#radioResults').innerHTML=rows.map(x=>`<div class="result-row"><span>${esc(x.name)}</span><button onclick="playInput(${JSON.stringify(x.url)})">▶</button></div>`).join('')||'<div class="empty">Keine Treffer.</div>';}catch(err){notify(err.message,'error')}}
async function searchSpotify(e){e.preventDefault();const q=new FormData(e.target).get('q');try{const rows=await api('/api/spotify/search?q='+encodeURIComponent(q));$('#spotifyResults').innerHTML=rows.map(x=>`<div class="result-row"><span>${esc(x.title)} · ${esc(x.artist)}</span><button onclick="playInput(${JSON.stringify(x.search)})">▶</button></div>`).join('')||'<div class="empty">Keine Treffer.</div>';}catch(err){notify(err.message,'error')}}
async function playInput(input){try{await api('/api/play',{method:'POST',body:JSON.stringify({input})});notify('Zur Queue hinzugefügt.','success');await load();}catch(e){notify(e.message,'error')}}
window.playPrompt=async()=>{const input=prompt('Titel, URL oder Stream-URL');if(input)await playInput(input)};
window.control=async(a,v)=>{try{await api('/api/control',{method:'POST',body:JSON.stringify({action:a,value:v})});await load();}catch(e){notify(e.message,'error')}};
window.playPlaylist=async id=>{try{await api('/api/playlist/'+id+'/play',{method:'POST'});notify('Playlist gestartet.','success');await load();}catch(e){notify(e.message,'error')}};
window.newPlaylist=async()=>{const name=prompt('Name');if(name){try{await api('/api/playlist',{method:'POST',body:JSON.stringify({name})});await load();}catch(e){notify(e.message,'error')}}};
window.deletePlaylist=async id=>{if(!confirm('Playlist löschen?'))return;try{await api('/api/playlist/'+id,{method:'DELETE'});await load();}catch(e){notify(e.message,'error')}};
window.systemAction=async action=>{if(!confirm(action==='shutdown'?'Ubuntu wirklich ausschalten?':action==='reboot'?'Ubuntu wirklich neu starten?':'Bot wirklich neu starten?'))return;try{await api('/api/system/'+action,{method:'POST'});notify(action==='restart-bot'?'Bot wird neu gestartet.':'Systemaktion ausgelöst.','success');}catch(e){notify(e.message,'error')}};
window.searchMedia=searchMedia; window.searchRadio=searchRadio; window.searchSpotify=searchSpotify; window.go=go; window.control=window.control; window.systemAction=window.systemAction;
load();
