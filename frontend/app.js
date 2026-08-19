const state = {
  token: null,
  user: null,
  data: null,
  tab: 'player',
  results: [],
  discord: [],
  ts3: [],
  monitor: { system: null, network: null },
  timer: null,
  monitorTimer: null,
  clockTimer: null
};

const $ = selector => document.querySelector(selector);
const esc = value => String(value ?? '').replace(/[&<>\"']/g, char => ({ '&':'&amp;','<':'&lt;','>':'&gt;','\"':'&quot;', "'":'&#39;' }[char]));
const api = (path, options = {}) => {
  options.headers = { ...(options.headers || {}), ...(state.token ? { Authorization: `Bearer ${state.token}` } : {}) };
  return fetch(path, options).then(async response => {
    const body = await response.json().catch(() => ({}));
    if (!response.ok) throw Error(body.error || `HTTP ${response.status}`);
    return body;
  });
};
const post = (path, body = {}) => api(path, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
const put = (path, body = {}) => api(path, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
const del = path => api(path, { method: 'DELETE' });

function note(message) {
  const node = $('#notice');
  if (!node) return alert(message);
  node.textContent = message;
  node.classList.add('show');
  clearTimeout(state.timer);
  state.timer = setTimeout(() => node.classList.remove('show'), 3500);
}
function fail(error) { note(error.message || String(error)); }
async function load() { state.data = await api('/api/state'); }

function fmtBytes(value) {
  if (!Number.isFinite(value) || value < 0) return '-';
  const units = ['B', 'KB', 'MB', 'GB', 'TB'];
  let number = value;
  let index = 0;
  while (number >= 1024 && index < units.length - 1) { number /= 1024; index += 1; }
  return `${number.toFixed(index ? 1 : 0)} ${units[index]}`;
}
function fmtRate(value) { return `${fmtBytes(value)}/s`; }
function fmtUptime(seconds) {
  if (!Number.isFinite(seconds)) return '-';
  let remaining = Math.max(0, Math.floor(seconds));
  const days = Math.floor(remaining / 86400); remaining %= 86400;
  const hours = Math.floor(remaining / 3600); remaining %= 3600;
  const minutes = Math.floor(remaining / 60);
  return `${days}d ${hours}h ${minutes}m`;
}
function inviteUrl(clientId) {
  const id = String(clientId || '').trim();
  if (!/^\d{17,20}$/.test(id)) return '';
  const permissions = 3148800;
  return `https://discord.com/oauth2/authorize?client_id=${encodeURIComponent(id)}&scope=bot%20applications.commands&permissions=${permissions}`;
}
async function copyText(value) {
  if (!value) return;
  try { await navigator.clipboard.writeText(value); note('Einladungslink wurde kopiert.'); }
  catch { prompt('Einladungslink', value); }
}

function nav() {
  return `<nav>${[
    ['player', '🎵 Player'], ['playlists', '📋 Playlists'], ['connections', '🔌 Verbindungen'], ['system', '🖥 System'],
    ...(state.user.role === 'admin' ? [['admin', '⚙ Admin']] : [])
  ].map(item => `<button class="navbtn ${state.tab === item[0] ? 'active' : ''}" data-tab="${item[0]}">${item[1]}</button>`).join('')}<button id="logout" class="danger">Abmelden</button></nav>`;
}

function topMetrics() {
  const system = state.monitor.system;
  const network = state.monitor.network;
  return `<div id="liveMetrics" class="live-metrics">
    <div><b>💻 CPU</b><span id="topCpu">${Number.isFinite(system?.cpuPercent) ? `${system.cpuPercent.toFixed(1)} %` : '-'}</span></div>
    <div><b>🧠 RAM</b><span id="topRam">${Number.isFinite(system?.memory?.percent) ? `${system.memory.percent.toFixed(1)} %` : '-'}</span></div>
    <div><b>🌐 Netzwerk</b><span id="topNetRx">RX ${network ? fmtRate(network.rxBytesPerSecond) : '-'}</span><small id="topNetTx">TX ${network ? fmtRate(network.txBytesPerSecond) : '-'}</small></div>
    <div><b>📡 Gesamtverkehr</b><span id="topNetTotal">${network ? fmtBytes(network.totalRxBytes + network.totalTxBytes) : '-'}</span><small>RX + TX</small></div>
  </div>`;
}

function updateClock() {
  const element = $('#clock');
  if (!element) return;
  const tick = () => {
    const date = new Date();
    element.textContent = `${date.toLocaleDateString('de-DE')} · ${date.toLocaleTimeString('de-DE', { hour12: false })}`;
  };
  tick();
  clearInterval(state.clockTimer);
  state.clockTimer = setInterval(tick, 1000);
}
function updateMonitorDom() {
  const system = state.monitor.system;
  const network = state.monitor.network;
  if (system && $('#topCpu')) $('#topCpu').textContent = `${system.cpuPercent.toFixed(1)} %`;
  if (system && $('#topRam')) $('#topRam').textContent = `${system.memory.percent.toFixed(1)} %`;
  if (network && $('#topNetRx')) $('#topNetRx').textContent = `RX ${fmtRate(network.rxBytesPerSecond)}`;
  if (network && $('#topNetTx')) $('#topNetTx').textContent = `TX ${fmtRate(network.txBytesPerSecond)}`;
  if (network && $('#topNetTotal')) $('#topNetTotal').textContent = fmtBytes(network.totalRxBytes + network.totalTxBytes);
  if (system && $('#sysCpu')) $('#sysCpu').textContent = `${system.cpuPercent.toFixed(1)} %`;
  if (system && $('#sysRam')) $('#sysRam').textContent = `${system.memory.percent.toFixed(1)} %`;
  if (system && $('#sysRamDetail')) $('#sysRamDetail').textContent = `${fmtBytes(system.memory.used)} / ${fmtBytes(system.memory.total)}`;
  if (system && $('#sysUptime')) $('#sysUptime').textContent = fmtUptime(system.uptime);
  if (system && $('#sysLoad')) $('#sysLoad').textContent = system.load.map(value => value.toFixed(2)).join(' / ');
  if (network && $('#sysNetRx')) $('#sysNetRx').textContent = fmtRate(network.rxBytesPerSecond);
  if (network && $('#sysNetTx')) $('#sysNetTx').textContent = fmtRate(network.txBytesPerSecond);
  if (network && $('#sysNetTotal')) $('#sysNetTotal').textContent = `${fmtBytes(network.totalRxBytes)} RX · ${fmtBytes(network.totalTxBytes)} TX`;
  if (network && $('#sysNetworkJson')) $('#sysNetworkJson').textContent = JSON.stringify(network, null, 2);
}
async function pollMonitor() {
  try {
    const [systemData, networkData] = await Promise.all([api('/api/system'), api('/api/network')]);
    state.monitor.system = systemData;
    state.monitor.network = networkData;
    updateMonitorDom();
  } catch (error) { if (state.token) console.warn('Live-Monitoring:', error); }
}
function startMonitor() {
  clearInterval(state.monitorTimer);
  void pollMonitor();
  state.monitorTimer = setInterval(pollMonitor, 1000);
}
function stopTimers() { clearInterval(state.monitorTimer); clearInterval(state.clockTimer); clearTimeout(state.timer); }

async function render() {
  try {
    await load();
    document.body.dataset.theme = state.data.settings.theme || 'dark';
    $('#app').innerHTML = `<header class="top"><div><h1>MusikBot187</h1><small>${esc(state.user.name)} · ${esc(state.user.role)}</small></div><div id="clock" class="clock" aria-live="polite">--:--:--</div></header>${topMetrics()}${nav()}<div id="notice"></div><main id="view"></main>`;
    document.querySelectorAll('[data-tab]').forEach(button => button.onclick = () => show(button.dataset.tab));
    $('#logout').onclick = () => { stopTimers(); state.token = null; state.user = null; window.MusikBotAuthSession?.clear?.(); loginView(); };
    updateClock();
    startMonitor();
    window.__musikbotSyncMusicTab?.();
    await show(state.tab);
  } catch {
    stopTimers(); state.token = null; state.user = null; loginView();
  }
}
async function show(tab) {
  state.tab = tab;
  try {
    if (tab === 'player') return player();
    if (tab === 'playlists') return playlists();
    if (tab === 'connections') return connections();
    if (tab === 'system') return system();
    if (tab === 'admin') return admin();
  } catch (error) { fail(error); }
}

async function player() {
  const data = state.data;
  $('#view').innerHTML = `<section><div class="sectionhead"><h2>Suche</h2><span>${data.current ? esc(data.current.title) : 'Nichts läuft'}</span></div><div class="row"><input id="q" placeholder="Titel, Interpret, URL oder Radiosender"><select id="src"><option value="all">Alle Quellen</option><option value="youtube">YouTube</option><option value="radio">Radio</option><option value="spotify">Spotify</option></select><button id="go">🔎 Suchen</button></div><div id="results" class="results"></div></section><section><div class="sectionhead"><h2>Player</h2><button id="refresh">↻</button></div><div class="now"><strong>${esc(data.current?.title || 'Nichts läuft')}</strong><span>${data.paused ? '⏸ Pausiert' : '▶ Bereit'} · ${data.volume}% · ${esc(data.mode)} · ${esc(data.settings.outputType)}</span></div><div class="controls">${['pause', 'resume', 'skip', 'stop', 'clear'].map(action => `<button data-a="${action}" class="${action === 'stop' || action === 'clear' ? 'danger' : ''}">${action === 'pause' ? '⏸ Pause' : action === 'resume' ? '▶ Weiter' : action === 'skip' ? '⏭ Skip' : action === 'stop' ? '⏹ Stop' : '🗑 Queue leeren'}</button>`).join('')}</div><div class="row"><label>Lautstärke <input id="vol" type="range" min="0" max="100" value="${data.volume}"></label><output id="vo">${data.volume}%</output><select id="mode"><option value="queue">Queue</option><option value="repeat">Repeat</option><option value="shuffle">Shuffle</option></select><button id="modeSave">Modus speichern</button></div></section><section><div class="sectionhead"><h2>Queue</h2><span>${data.queue.length} Titel</span></div><div class="list">${data.queue.length ? data.queue.map((item, index) => `<div class="listrow"><span><b>${index + 1}.</b> ${esc(item.title || item.url)} <small>${esc(item.artist || item.source || '')}</small></span><div class="controls"><button data-plq="${index}">＋ Playlist</button><button data-rm="${index}" class="danger">Entfernen</button></div></div>`).join('') : '<p class="muted">Queue ist leer.</p>'}</div></section>`;
  $('#mode').value = data.mode;
  $('#q').onkeydown = event => { if (event.key === 'Enter') search(); };
  $('#go').onclick = search;
  $('#refresh').onclick = async () => { await load(); player(); };
  $('#vol').oninput = event => { $('#vo').textContent = `${event.target.value}%`; };
  $('#vol').onchange = async event => { try { await post('/api/play/volume', { value: Number(event.target.value) }); await load(); player(); } catch (error) { fail(error); } };
  $('#modeSave').onclick = async () => { try { await post('/api/play/mode', { mode: $('#mode').value }); await load(); player(); } catch (error) { fail(error); } };
  document.querySelectorAll('[data-a]').forEach(button => button.onclick = async () => { try { await post(`/api/play/${button.dataset.a}`); await load(); player(); } catch (error) { fail(error); } });
  document.querySelectorAll('[data-rm]').forEach(button => button.onclick = async () => { try { await del(`/api/queue/${button.dataset.rm}`); await load(); player(); } catch (error) { fail(error); } });
  document.querySelectorAll('[data-plq]').forEach(button => button.onclick = () => pickPlaylist(data.queue[Number(button.dataset.plq)]));
}
async function search() {
  const query = $('#q').value.trim();
  if (!query) return note('Bitte Suchbegriff oder URL eingeben.');
  $('#results').innerHTML = '<p class="muted">Suche läuft …</p>';
  try {
    const result = await api(`/api/search?q=${encodeURIComponent(query)}&source=${encodeURIComponent($('#src').value)}`);
    state.results = [...result.youtube, ...result.radio, ...result.spotify];
    $('#results').innerHTML = state.results.length ? state.results.map((item, index) => `<div class="result"><div><b>${esc(item.title)}</b><small>${esc(item.artist || item.source || '')} ${item.duration ? `· ${esc(item.duration)}` : ''}</small></div><div class="controls"><button data-play="${index}">▶ Abspielen</button><button data-add="${index}">＋ Queue</button><button data-pl="${index}">＋ Playlist</button></div></div>`).join('') : '<p class="muted">Keine Ergebnisse.</p>';
    document.querySelectorAll('[data-play]').forEach(button => button.onclick = () => queueResult(Number(button.dataset.play)));
    document.querySelectorAll('[data-add]').forEach(button => button.onclick = () => queueResult(Number(button.dataset.add)));
    document.querySelectorAll('[data-pl]').forEach(button => button.onclick = () => pickPlaylist(state.results[Number(button.dataset.pl)]));
  } catch (error) { fail(error); $('#results').innerHTML = ''; }
}
async function queueResult(index) {
  const item = state.results[index]; if (!item) return;
  try { await post('/api/play', { items: [{ id: crypto.randomUUID(), title: item.title, url: item.url, source: item.source, artist: item.artist || '' }] }); await load(); player(); } catch (error) { fail(error); }
}
async function pickPlaylist(item) {
  try {
    const playlistsData = await api('/api/playlists');
    if (!playlistsData.length) return note('Keine Playlist vorhanden.');
    const text = playlistsData.map((playlist, index) => `${index + 1}: ${playlist.name}`).join('\n');
    const answer = prompt(`Playlist auswählen:\n${text}\n\nNummer:`);
    if (answer === null) return;
    const index = Number(answer) - 1;
    if (!playlistsData[index]) return note('Ungültige Auswahl.');
    await post(`/api/playlists/${playlistsData[index].id}/items`, { items: [{ id: item.id || crypto.randomUUID(), title: item.title || item.url, url: item.url, source: item.source || '', artist: item.artist || '' }] });
    note(`Zu „${playlistsData[index].name}“ hinzugefügt.`);
  } catch (error) { fail(error); }
}

async function playlists() {
  const playlistsData = await api('/api/playlists');
  $('#view').innerHTML = `<section><div class="sectionhead"><h2>Playlists</h2><button id="new">＋ Playlist</button></div>${playlistsData.length ? playlistsData.map(playlist => `<article class="card"><div class="sectionhead"><b>${esc(playlist.name)}</b><span>${playlist.items.length} Titel</span></div><div class="controls"><button data-pplay="${playlist.id}">▶ Abspielen</button><button data-popen="${playlist.id}">Öffnen</button><button data-pdel="${playlist.id}" class="danger">Löschen</button></div></article>`).join('') : '<p class="muted">Keine Playlists vorhanden.</p>'}</section>`;
  $('#new').onclick = async () => { const name = prompt('Playlist-Name'); if (!name?.trim()) return; try { await post('/api/playlists', { name: name.trim() }); playlists(); } catch (error) { fail(error); } };
  document.querySelectorAll('[data-pplay]').forEach(button => button.onclick = async () => { try { await post(`/api/playlists/${button.dataset.pplay}/play`); await load(); player(); } catch (error) { fail(error); } });
  document.querySelectorAll('[data-popen]').forEach(button => button.onclick = () => openPlaylist(button.dataset.popen));
  document.querySelectorAll('[data-pdel]').forEach(button => button.onclick = async () => { try { await del(`/api/playlists/${button.dataset.pdel}`); playlists(); } catch (error) { fail(error); } });
}
async function openPlaylist(id) {
  const data = await api('/api/playlists');
  const playlist = data.find(item => item.id === id);
  if (!playlist) return;
  $('#view').innerHTML = `<section><div class="sectionhead"><h2>${esc(playlist.name)}</h2><div class="controls"><button id="backPl">← Zurück</button><button id="playPl">▶ Playlist abspielen</button></div></div><div class="list">${playlist.items.map((item, index) => `<div class="listrow"><span><b>${index + 1}.</b> ${esc(item.title)}</span><div class="controls"><button data-prm="${index}" class="danger">Entfernen</button></div></div>`).join('') || '<p class="muted">Playlist ist leer.</p>'}</div></section>`;
  $('#backPl').onclick = playlists;
  $('#playPl').onclick = async () => { try { await post(`/api/playlists/${playlist.id}/play`); await load(); player(); } catch (error) { fail(error); } };
  document.querySelectorAll('[data-prm]').forEach(button => button.onclick = async () => { try { await del(`/api/playlists/${playlist.id}/items/${button.dataset.prm}`); await openPlaylist(id); } catch (error) { fail(error); } });
}

async function connections() {
  const discord = await api('/api/discord');
  const ts3 = await api('/api/ts3');
  state.discord = discord;
  state.ts3 = ts3;
  $('#view').innerHTML = `<section><div class="sectionhead"><h2>Discord</h2><button id="addDiscord">＋ Instanz</button></div><div class="list">${discord.map(item => `<div class="listrow"><span>💬 <b>${esc(item.name)}</b><small>${item.connected ? 'Verbunden' : 'Nicht verbunden'}</small></span><div class="controls"><button data-dedit="${item.id}">Bearbeiten</button><button data-dinvite="${item.id}">Einladungslink</button><button data-dconnect="${item.id}">Verbinden</button><button data-ddel="${item.id}" class="danger">Löschen</button></div></div>`).join('') || '<p class="muted">Keine Discord-Instanzen.</p>'}</div></section><section><div class="sectionhead"><h2>TeamSpeak 3</h2><button id="addTs3">＋ Instanz</button></div><div class="list">${ts3.map(item => `<div class="listrow"><span>🎧 <b>${esc(item.name)}</b><small>${item.connected ? 'Verbunden' : 'Nicht verbunden'}</small></span><div class="controls"><button data-tedit="${item.id}">Bearbeiten</button><button data-tconnect="${item.id}">Verbinden</button><button data-tdel="${item.id}" class="danger">Löschen</button></div></div>`).join('') || '<p class="muted">Keine TeamSpeak-Instanzen.</p>'}</div></section>`;
  $('#addDiscord').onclick = () => editDiscord(null);
  $('#addTs3').onclick = () => editTs3(null);
  document.querySelectorAll('[data-dedit]').forEach(button => button.onclick = () => editDiscord(button.dataset.dedit));
  document.querySelectorAll('[data-tedit]').forEach(button => button.onclick = () => editTs3(button.dataset.tedit));
  document.querySelectorAll('[data-dinvite]').forEach(button => { button.onclick = () => { const item = discord.find(x => x.id === button.dataset.dinvite); const url = inviteUrl(item?.clientId); if (!url) return note('Bitte zuerst eine gültige Discord-Client-ID speichern.'); void copyText(url); }; });
  document.querySelectorAll('[data-dconnect]').forEach(button => button.onclick = async () => { try { await post(`/api/discord/${button.dataset.dconnect}/connect`); await connections(); } catch (error) { fail(error); } });
  document.querySelectorAll('[data-ddel]').forEach(button => button.onclick = async () => { try { await del(`/api/discord/${button.dataset.ddel}`); await connections(); } catch (error) { fail(error); } });
  document.querySelectorAll('[data-tconnect]').forEach(button => button.onclick = async () => { try { await post(`/api/ts3/${button.dataset.tconnect}/connect`); await connections(); } catch (error) { fail(error); } });
  document.querySelectorAll('[data-tdel]').forEach(button => button.onclick = async () => { try { await del(`/api/ts3/${button.dataset.tdel}`); await connections(); } catch (error) { fail(error); } });
}

async function editDiscord(id) {
  const item = id ? state.discord.find(x => x.id === id) : { id: crypto.randomUUID(), name: 'Discord', clientId: '', prefix: '!' };
  $('#view').innerHTML = `<section><div class="sectionhead"><h2>Discord-Instanz</h2><button id="back">← Zurück</button></div><div class="grid"><label>Name<input id="dn" value="${esc(item.name)}"></label><label>Client-ID<input id="did" value="${esc(item.clientId || '')}"></label><label>Bot-Token<input id="dt" type="password" placeholder="${item.hasToken ? 'Gespeichert' : ''}"></label><label>Prefix<input id="dp" value="${esc(item.prefix || '!')}"></label><label>Discord-Server<select id="dg"><option value="">Discord-Server auswählen</option></select></label><button id="dgrefresh">↻ Server aktualisieren</button><label>Voice-Kanal<select id="dv"><option value="">Voice-Kanal auswählen</option></select></label><button id="dvrefresh">↻ Kanäle aktualisieren</button></div><div class="controls"><button id="saveDiscord">💾 Speichern</button><button id="connectDiscord">🔌 Verbinden</button></div></section>`;
  $('#back').onclick = connections;
  $('#saveDiscord').onclick = async () => {
    try {
      await put(`/api/discord/${item.id}`, { id: item.id, name: $('#dn').value, clientId: $('#did').value, token: $('#dt').value || undefined, prefix: $('#dp').value, guildId: $('#dg').value, voiceChannelId: $('#dv').value });
      note('Discord-Instanz gespeichert.'); await connections();
    } catch (error) { fail(error); }
  };
  $('#connectDiscord').onclick = async () => { try { await post(`/api/discord/${item.id}/connect`); note('Verbindung gestartet.'); await connections(); } catch (error) { fail(error); } };
}
async function editTs3(id) {
  const item = id ? state.ts3.find(x => x.id === id) : { id: crypto.randomUUID(), name: 'TeamSpeak 3', host: '', port: 10011, username: '', serverId: 1 };
  $('#view').innerHTML = `<section><div class="sectionhead"><h2>TeamSpeak 3</h2><button id="back">← Zurück</button></div><div class="grid"><label>Name<input id="tn" value="${esc(item.name)}"></label><label>Host<input id="th" value="${esc(item.host || '')}"></label><label>Port<input id="tp" type="number" value="${Number(item.port) || 10011}"></label><label>Username<input id="tu" value="${esc(item.username || '')}"></label><label>Passwort<input id="tw" type="password" placeholder="${item.hasPassword ? 'Gespeichert' : ''}"></label><label>Server-ID<input id="ts" type="number" value="${Number(item.serverId) || 1}"></label></div><div class="controls"><button id="saveTs3">💾 Speichern</button><button id="connectTs3">🔌 Verbinden</button></div></section>`;
  $('#back').onclick = connections;
  $('#saveTs3').onclick = async () => { try { await put(`/api/ts3/${item.id}`, { id: item.id, name: $('#tn').value, host: $('#th').value, port: Number($('#tp').value), username: $('#tu').value, password: $('#tw').value || undefined, serverId: Number($('#ts').value) }); note('TeamSpeak-Instanz gespeichert.'); await connections(); } catch (error) { fail(error); } };
  $('#connectTs3').onclick = async () => { try { await post(`/api/ts3/${item.id}/connect`); note('Verbindung gestartet.'); await connections(); } catch (error) { fail(error); } };
}
async function system() {
  const [systemData, networkData, storage, files, health, snapshot] = await Promise.all([api('/api/system'), api('/api/network'), api('/api/storage'), api('/api/files'), api('/api/health'), api('/api/state')]);
  state.monitor.system = systemData; state.monitor.network = networkData;
  $('#view').innerHTML = `<section><div class="sectionhead"><div><h2>System</h2><small>Live-Monitoring · aktualisiert jede Sekunde</small></div><button id="sr">↻ Jetzt aktualisieren</button></div><div class="stats"><div><b>🟢 Bot</b><span>${esc(health.ok ? 'Online' : 'Offline')}</span></div><div><b>🕐 Server-Uptime</b><span id="sysUptime">${fmtUptime(systemData.uptime)}</span></div><div><b>💻 CPU</b><span id="sysCpu">${systemData.cpuPercent.toFixed(1)} %</span><small><span id="sysLoad">${systemData.load.map(value => value.toFixed(2)).join(' / ')}</span> · ${systemData.cpus} CPU-Kerne</small></div><div><b>🧠 RAM</b><span id="sysRam">${systemData.memory.percent.toFixed(1)} %</span><small id="sysRamDetail">${fmtBytes(systemData.memory.used)} / ${fmtBytes(systemData.memory.total)}</small></div><div><b>🌐 Netzwerk RX</b><span id="sysNetRx">${fmtRate(networkData.rxBytesPerSecond)}</span></div><div><b>🌐 Netzwerk TX</b><span id="sysNetTx">${fmtRate(networkData.txBytesPerSecond)}</span></div><div><b>📡 Gesamtverkehr</b><span id="sysNetTotal">${fmtBytes(networkData.totalRxBytes)} RX · ${fmtBytes(networkData.totalTxBytes)} TX</span></div><div><b>💾 Speicher</b><span>${fmtBytes(storage.disk?.free ?? 0)} frei</span><small>${esc(storage.path || '-')}</small></div></div><pre class="code" id="sysNetworkJson">${esc(JSON.stringify(networkData, null, 2))}</pre><div class="controls"><button id="restartBot">↻ Bot neu starten</button><button id="stopBot">⏹ Bot stoppen</button><button id="restartOs">↻ Ubuntu neu starten</button><button id="shutdownOs">⏻ Ubuntu herunterfahren</button></div></section><section><div class="sectionhead"><h2>Musik</h2><label class="button">Datei auswählen<input id="musicUpload" type="file" accept="audio/*"></label><button id="musicUploadButton">Hochladen</button></div><div class="list" id="musicList">${files.map(file => `<div class="listrow"><span>🎵 ${esc(file.name)} <small>${fmtBytes(file.size)}</small></span><div class="controls"><button data-fplay="${esc(file.path)}">▶</button><button data-fpl="${esc(file.path)}">＋ Playlist</button><button data-fdel="${esc(file.path)}" class="danger">Entfernen</button></div></div>`).join('') || '<p class="muted">Keine Dateien.</p>'}</div></section>`;
  $('#sr').onclick = async () => { state.tab = 'system'; await system(); };
  $('#restartBot').onclick = () => post('/api/control', { action: 'restart' }).then(() => note('Bot-Neustart ausgelöst.')).catch(fail);
  $('#stopBot').onclick = () => post('/api/control', { action: 'stop' }).then(() => note('Bot wird gestoppt.')).catch(fail);
  $('#restartOs').onclick = () => post('/api/control', { action: 'reboot' }).then(() => note('Ubuntu-Neustart ausgelöst.')).catch(fail);
  $('#shutdownOs').onclick = () => post('/api/control', { action: 'shutdown' }).then(() => note('Ubuntu wird heruntergefahren.')).catch(fail);
}

function admin() {
  $('#view').innerHTML = `<section><h2>Admin</h2><div class="grid"><label>Theme<select id="themeSelect"><option value="dark">Dunkel</option><option value="light">Hell</option><option value="ocean">Ocean</option></select></label><label>Akzentfarbe<input id="accentColor" type="color" value="#0b69b3"></label><button id="themeSave">Design speichern</button></div><h2>Allgemeine Einstellungen</h2><div class="grid"><label>Dateiverzeichnis<input id="filesDirectory" value="${esc(state.data.settings.filesDirectory)}"></label><button id="settingsSave">Einstellungen speichern</button></div><h2>Diagnose</h2><div id="diagnostics">Lade Diagnose …</div></section><section><h2>Benutzer</h2><div id="users">Lade Benutzer …</div></section>`;
  $('#themeSelect').value = state.data.settings.theme;
  $('#themeSave').onclick = async () => { try { await put('/api/settings', { theme: $('#themeSelect').value, accentColor: $('#accentColor').value }); note('Design gespeichert.'); document.body.dataset.theme = $('#themeSelect').value; } catch (error) { fail(error); } };
  $('#settingsSave').onclick = async () => { try { await put('/api/settings', { filesDirectory: $('#filesDirectory').value }); await load(); note('Einstellungen gespeichert.'); } catch (error) { fail(error); } };
  void api('/api/diagnostics').then(items => { $('#diagnostics').innerHTML = items.map(item => `<div class="listrow"><span>${esc(item.time)} · ${esc(item.level)} · ${esc(item.source)}</span><small>${esc(item.message)}</small></div>`).join('') || '<p class="muted">Keine Diagnosemeldungen.</p>'; }).catch(fail);
  void api('/api/users').then(items => { $('#users').innerHTML = items.map(item => `<div class="listrow"><span>${esc(item.name)}</span><small>${esc(item.role)}</small></div>`).join('') || '<p class="muted">Keine Benutzer.</p>'; }).catch(fail);
}

function loginView() {
  stopTimers();
  $('#app').innerHTML = `<main class="login"><h1>MusikBot187</h1><p>Admin-Anmeldung</p><form id="loginForm"><input id="user" autocomplete="username" placeholder="Benutzername" required><input id="pass" type="password" autocomplete="current-password" placeholder="Passwort" required><button type="submit">Anmelden</button></form><p id="setupHint" class="muted"></p></main>`;
  $('#loginForm').onsubmit = async event => {
    event.preventDefault();
    const name = $('#user').value.trim();
    const password = $('#pass').value;
    try {
      const result = await api('/api/login', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name, password }) });
      state.token = result.token;
      state.user = result.user;
      window.MusikBotFetch?.setAuth?.(`Bearer ${state.token}`);
      window.MusikBotLoginBootstrap?.clearSession?.();
      state.tab = 'player';
      await render();
    } catch (error) { note(error.message || 'Anmeldung fehlgeschlagen.'); }
  };
}
(async () => { try { const setup = await api('/api/setup'); if (setup.initialized) loginView(); else window.location.hash.startsWith('#setup=') ? await import('/setup-security.js').then(mod => mod?.default?.()) : loginView(); } catch { loginView(); } })();