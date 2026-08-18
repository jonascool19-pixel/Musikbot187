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
const esc = value => String(value ?? '').replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[char]));
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
  return `https://discord.com/oauth2/authorize?client_id=${encodeURIComponent(id)}&scope=bot%20applications.commands&permissions=36700160`;
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
    $('#logout').onclick = () => { stopTimers(); state.token = null; state.user = null; loginView(); };
    updateClock();
    startMonitor();
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
  $('#view').innerHTML = `<section><div class="sectionhead"><h2>Playlists</h2><button id="new">＋ Playlist</button></div>${playlistsData.length ? playlistsData.map(playlist => `<article class="card"><div class="sectionhead"><b>${esc(playlist.name)}</b><span>${playlist.items.length} Titel</span></div><div class="list">${playlist.items.map(item => `<div class="listrow"><span>${esc(item.title || item.url)} <small>${esc(item.artist || item.source || '')}</small></span><button data-prm="${esc(playlist.id)}" data-pit="${esc(item.id)}" class="danger">Entfernen</button></div>`).join('') || '<p class="muted">Leer.</p>'}</div><button data-pplay="${esc(playlist.id)}">▶ Playlist abspielen</button></article>`).join('') : '<p class="muted">Noch keine Playlists.</p>'}</section>`;
  $('#new').onclick = async () => { const name = prompt('Playlist-Name'); if (!name?.trim()) return; try { await post('/api/playlists', { name: name.trim() }); playlists(); } catch (error) { fail(error); } };
  document.querySelectorAll('[data-pplay]').forEach(button => button.onclick = async () => { try { await post(`/api/playlists/${button.dataset.pplay}/play`); state.tab = 'player'; await load(); player(); } catch (error) { fail(error); } });
  document.querySelectorAll('[data-prm]').forEach(button => button.onclick = async () => { try { await del(`/api/playlists/${button.dataset.prm}/items/${button.dataset.pit}`); playlists(); } catch (error) { fail(error); } });
}

function setSelectValue(select, value, label = value) {
  if (!select || !value) return;
  if (![...select.options].some(option => option.value === value)) select.add(new Option(label || value, value));
  select.value = value;
}

async function connections() {
  const [discord, ts3] = await Promise.all([api('/api/discord'), api('/api/ts3')]);
  state.discord = discord; state.ts3 = ts3;
  $('#view').innerHTML = `<section><div class="sectionhead"><h2>Discord</h2><span class="muted">Bot, Server und Voice-Kanal direkt verwalten</span></div><div class="card discord-editor"><div class="grid"><label>Instanz-ID<input id="did" placeholder="leer = neue Instanz"></label><label>Name<input id="dn" placeholder="Discord-Instanz"></label><label>Bot-Token<input id="dt" type="password" placeholder="beim Bearbeiten leer lassen"></label><label>Bot-ID / Client-ID<div class="input-action"><input id="dc" inputmode="numeric" placeholder="17–20 Ziffern"><button id="dinvite" title="Einladungslink erstellen">↗</button></div></label><label>Discord-Server<div class="input-action"><select id="dg"><option value="">Server auswählen</option></select><button id="dgrefresh" title="Discord-Server aktualisieren">↻</button></div></label><label>Voice-Kanal<div class="input-action"><select id="dv"><option value="">Voice-Kanal auswählen</option></select><button id="dvrefresh" title="Voice-Kanäle aktualisieren">↻</button></div></label><label>Prefix<input id="dp" value="!"></label><label class="checklabel"><input id="dintent" type="checkbox"> Message Content Intent</label><label class="checklabel"><input id="de" type="checkbox" checked> Aktiv</label></div><div class="controls"><button id="dadd">Bot zum Discord hinzufügen</button><button id="dlink">Einladungslink erstellen</button><button id="ds">Speichern</button><button id="dconnect">Verbinden</button><button id="dreconnect">Neu verbinden</button><button id="dnew">Neu</button></div><p id="dinviteText" class="muted"></p></div><div>${discord.map(item => `<article class="card"><div class="sectionhead"><b>${esc(item.name)}</b><span>${item.enabled ? 'aktiv' : 'inaktiv'}</span></div><small>Bot-ID ${esc(item.clientId || '-')} · Server ${esc(item.guildId || '-')} · Voice ${esc(item.channelId || '-')}</small><div class="controls"><button data-de="${esc(item.id)}">Bearbeiten</button><button data-dco="${esc(item.id)}">Verbinden</button><button data-dre="${esc(item.id)}">Neu verbinden</button><button data-djo="${esc(item.id)}">Voice beitreten</button><button data-dd="${esc(item.id)}">Trennen</button><button data-dinvite="${esc(item.clientId || '')}">Einladungslink</button><button data-dx="${esc(item.id)}" class="danger">Entfernen</button></div></article>`).join('') || '<p class="muted">Keine Discord-Instanz.</p>'}</div></section><section><h2>TeamSpeak 3</h2><div class="card"><div class="grid"><input id="tid" placeholder="ID (leer = neu)"><input id="tn" placeholder="Name"><input id="th" placeholder="Host"><input id="tp" type="number" value="9987"><input id="tni" placeholder="Nickname"><input id="tpa" type="password" placeholder="Passwort"><input id="tch" placeholder="Standard-Channel"><label><input id="te" type="checkbox"> Aktiv</label></div><button id="ts">Speichern</button></div><div>${ts3.map(item => `<article class="card"><div class="sectionhead"><b>${esc(item.name)}</b><span>${item.connected ? 'verbunden' : 'getrennt'}</span></div><small>${esc(item.host)}:${esc(item.port)} · Channel ${esc(item.channel || '-')}</small><div class="controls"><button data-te="${esc(item.id)}">Bearbeiten</button><button data-tc="${esc(item.id)}">Verbinden</button><button data-td="${esc(item.id)}">Trennen</button></div></article>`).join('') || '<p class="muted">Keine TS3-Instanz.</p>'}</div></section>`;
  $('#dadd').onclick = () => { const url = inviteUrl($('#dc').value); if (!url) return note('Bitte zuerst eine gültige Bot-ID / Client-ID eintragen.'); window.open(url, '_blank', 'noopener,noreferrer'); };
  $('#dlink').onclick = async () => { const url = inviteUrl($('#dc').value); if (!url) return note('Bitte zuerst eine gültige Bot-ID / Client-ID eintragen.'); $('#dinviteText').textContent = url; await copyText(url); };
  $('#dinvite').onclick = async () => { const url = inviteUrl($('#dc').value); if (!url) return note('Bitte zuerst eine gültige Bot-ID / Client-ID eintragen.'); $('#dinviteText').textContent = url; await copyText(url); };
  $('#ds').onclick = saveDiscord;
  $('#dconnect').onclick = async () => { try { if (!$('#did').value) return note('Erst speichern, dann verbinden.'); await post(`/api/discord/${$('#did').value}/connect`); note('Discord verbunden.'); await loadGuilds(); } catch (error) { fail(error); } };
  $('#dreconnect').onclick = async () => { try { if (!$('#did').value) return note('Erst eine Discord-Instanz auswählen.'); await post(`/api/discord/${$('#did').value}/disconnect`); await post(`/api/discord/${$('#did').value}/connect`); note('Discord neu verbunden.'); await loadGuilds(); } catch (error) { fail(error); } };
  $('#dnew').onclick = resetDiscordForm;
  $('#dgrefresh').onclick = loadGuilds;
  $('#dvrefresh').onclick = () => loadChannels(true);
  $('#ts').onclick = saveTS;
  document.querySelectorAll('[data-de]').forEach(button => button.onclick = () => editDiscord(button.dataset.de));
  document.querySelectorAll('[data-dco]').forEach(button => button.onclick = async () => { try { await post(`/api/discord/${button.dataset.dco}/connect`); note('Discord verbunden.'); editDiscord(button.dataset.dco); await loadGuilds(); } catch (error) { fail(error); } });
  document.querySelectorAll('[data-dre]').forEach(button => button.onclick = async () => { try { await post(`/api/discord/${button.dataset.dre}/disconnect`); await post(`/api/discord/${button.dataset.dre}/connect`); note('Discord neu verbunden.'); editDiscord(button.dataset.dre); await loadGuilds(); } catch (error) { fail(error); } });
  document.querySelectorAll('[data-djo]').forEach(button => button.onclick = async () => { try { await post(`/api/discord/${button.dataset.djo}/join`); note('Voice verbunden.'); } catch (error) { fail(error); } });
  document.querySelectorAll('[data-dd]').forEach(button => button.onclick = async () => { try { await post(`/api/discord/${button.dataset.dd}/disconnect`); await connections(); } catch (error) { fail(error); } });
  document.querySelectorAll('[data-dinvite]').forEach(button => button.onclick = async () => { const url = inviteUrl(button.dataset.dinvite); if (!url) return note('Keine gültige Bot-ID gespeichert.'); await copyText(url); });
  document.querySelectorAll('[data-dx]').forEach(button => button.onclick = async () => { if (!confirm('Discord-Instanz entfernen?')) return; try { await del(`/api/discord/${button.dataset.dx}`); await connections(); } catch (error) { fail(error); } });
  document.querySelectorAll('[data-te]').forEach(button => button.onclick = () => editTS(button.dataset.te));
  document.querySelectorAll('[data-tc]').forEach(button => button.onclick = async () => { try { await post(`/api/ts3/${button.dataset.tc}/connect`); await connections(); } catch (error) { fail(error); } });
  document.querySelectorAll('[data-td]').forEach(button => button.onclick = async () => { try { await post(`/api/ts3/${button.dataset.td}/disconnect`); await connections(); } catch (error) { fail(error); } });
}
function resetDiscordForm() {
  ['did', 'dn', 'dt', 'dc'].forEach(id => { if ($('#' + id)) $('#' + id).value = ''; });
  if ($('#dp')) $('#dp').value = '!';
  if ($('#dg')) $('#dg').innerHTML = '<option value="">Server auswählen</option>';
  if ($('#dv')) $('#dv').innerHTML = '<option value="">Voice-Kanal auswählen</option>';
  if ($('#dintent')) $('#dintent').checked = false;
  if ($('#de')) $('#de').checked = true;
  if ($('#dinviteText')) $('#dinviteText').textContent = '';
}
function editDiscord(id) {
  const item = state.discord.find(value => value.id === id); if (!item) return;
  $('#did').value = item.id; $('#dn').value = item.name || ''; $('#dt').value = ''; $('#dc').value = item.clientId || ''; $('#dp').value = item.prefix || '!'; $('#dintent').checked = item.messageContentIntent === true; $('#de').checked = item.enabled !== false;
  setSelectValue($('#dg'), item.guildId || '', item.guildId || '');
  setSelectValue($('#dv'), item.channelId || '', item.channelId || '');
  const url = inviteUrl(item.clientId); $('#dinviteText').textContent = url;
  scrollTo(0, 0);
}
async function saveDiscord() {
  try {
    await post('/api/discord', { id: $('#did').value, name: $('#dn').value, token: $('#dt').value, clientId: $('#dc').value, guildId: $('#dg').value, channelId: $('#dv').value, prefix: $('#dp').value, messageContentIntent: $('#dintent').checked, enabled: $('#de').checked });
    note('Discord gespeichert.'); await connections();
  } catch (error) { fail(error); }
}
async function loadGuilds() {
  try {
    const id = $('#did')?.value; if (!id) return note('Erst eine gespeicherte Discord-Instanz auswählen.');
    const guilds = await api(`/api/discord/${id}/guilds`);
    const select = $('#dg'); select.innerHTML = '<option value="">Server auswählen</option>'; guilds.forEach(item => select.add(new Option(item.name, item.id)));
    select.value = state.discord.find(item => item.id === id)?.guildId || select.value;
    if (select.value) await loadChannels(false);
    note(guilds.length ? `${guilds.length} Discord-Server geladen.` : 'Der Bot ist mit keinem Discord-Server verbunden.');
  } catch (error) { fail(error); }
}
async function loadChannels(showNotice = true) {
  try {
    const id = $('#did')?.value; const guildId = $('#dg')?.value;
    if (!id || !guildId) return note('Discord-Instanz und Server auswählen.');
    const channels = await api(`/api/discord/${id}/guilds/${guildId}/channels`);
    const select = $('#dv'); const previous = state.discord.find(item => item.id === id)?.channelId || select.value;
    select.innerHTML = '<option value="">Voice-Kanal auswählen</option>'; channels.forEach(item => select.add(new Option(item.name, item.id))); select.value = previous;
    if (showNotice) note(channels.length ? `${channels.length} Voice-Kanäle geladen.` : 'Keine Voice-Kanäle gefunden.');
  } catch (error) { fail(error); }
}
function editTS(id) {
  const item = state.ts3.find(value => value.id === id); if (!item) return;
  $('#tid').value = item.id; $('#tn').value = item.name || ''; $('#th').value = item.host || ''; $('#tp').value = item.port || 9987; $('#tni').value = item.nickname || 'MusikBot187'; $('#tpa').value = ''; $('#tch').value = item.channel || ''; $('#te').checked = item.enabled === true; scrollTo(0, 0);
}
async function saveTS() {
  try {
    const id = $('#tid').value || crypto.randomUUID();
    await put('/api/ts3', { instances: [...state.ts3.filter(item => item.id !== id), { id, name: $('#tn').value.trim() || 'TS3', host: $('#th').value.trim(), port: Number($('#tp').value || 9987), nickname: $('#tni').value.trim() || 'MusikBot187', password: $('#tpa').value || '', channel: $('#tch').value.trim(), enabled: $('#te').checked }] });
    note('TS3 gespeichert.'); await connections();
  } catch (error) { fail(error); }
}
async function playFile(file) {
  try { await post('/api/play', { items: [{ id: crypto.randomUUID(), title: file.name, url: file.path, source: 'file' }] }); note(`„${file.name}“ zur Wiedergabe hinzugefügt.`); await load(); player(); } catch (error) { fail(error); }
}

async function system() {
  const [systemData, networkData, storage, files, health, snapshot] = await Promise.all([api('/api/system'), api('/api/network'), api('/api/storage'), api('/api/files'), api('/api/health'), api('/api/state')]);
  state.monitor.system = systemData; state.monitor.network = networkData;
  $('#view').innerHTML = `<section><div class="sectionhead"><div><h2>System</h2><small>Live-Monitoring · aktualisiert jede Sekunde</small></div><button id="sr">↻ Jetzt aktualisieren</button></div><div class="stats"><div><b>🟢 Bot</b><span>${esc(health.ok ? 'Online' : 'Offline')}</span></div><div><b>🕐 Server-Uptime</b><span id="sysUptime">${fmtUptime(systemData.uptime)}</span></div><div><b>💻 CPU</b><span id="sysCpu">${systemData.cpuPercent.toFixed(1)} %</span><small><span id="sysLoad">${systemData.load.map(value => value.toFixed(2)).join(' / ')}</span> · ${systemData.cpus} CPU-Kerne</small></div><div><b>🧠 RAM</b><span id="sysRam">${systemData.memory.percent.toFixed(1)} %</span><small id="sysRamDetail">${fmtBytes(systemData.memory.used)} / ${fmtBytes(systemData.memory.total)}</small></div><div><b>🌐 Netzwerk RX</b><span id="sysNetRx">${fmtRate(networkData.rxBytesPerSecond)}</span><small>Empfang</small></div><div><b>🌐 Netzwerk TX</b><span id="sysNetTx">${fmtRate(networkData.txBytesPerSecond)}</span><small>Sendung</small></div><div><b>📡 Gesamtverkehr</b><span id="sysNetTotal">${fmtBytes(networkData.totalRxBytes)} RX · ${fmtBytes(networkData.totalTxBytes)} TX</span><small>seit Beginn der Messung</small></div><div><b>💾 Speicher</b><span>${storage.disk ? `${storage.disk.percent.toFixed(1)} %` : '-'}</span><small>${storage.disk ? `${fmtBytes(storage.disk.used)} / ${fmtBytes(storage.disk.total)}` : 'Nicht verfügbar'}</small></div><div><b>🔊 Ausgabe</b><span>${esc(snapshot.settings.outputType)}</span><small>${snapshot.current ? `▶ ${esc(snapshot.current.title)}` : 'Nichts läuft'}</small></div></div></section><section><h2>Systemdetails</h2><div class="stats">${[['Hostname', systemData.hostname], ['Plattform', systemData.platform], ['Architektur', systemData.arch], ['Node', systemData.node]].map(item => `<div><b>${esc(item[0])}</b><span>${esc(item[1] || '-')}</span></div>`).join('')}</div></section><section><div class="sectionhead"><h2>Netzwerk</h2><span class="muted">Gesamter Verkehr der überwachten Interfaces</span></div><pre id="sysNetworkJson">${esc(JSON.stringify(networkData, null, 2))}</pre></section><section><h2>Speicher / Musikverzeichnis</h2><p>${esc(storage.path)} · ${storage.exists ? 'vorhanden' : 'nicht vorhanden'}</p></section><section><h2>Dateien / Musik</h2><div class="list">${files.map(item => `<div class="listrow"><span>${item.directory ? '📁' : '🎵'} ${esc(item.name)}</span><div class="controls">${item.directory ? '' : `<button data-file-play="${esc(item.path)}">▶ Abspielen</button>`}</div><small>${esc(item.path)}</small></div>`).join('') || '<p class="muted">Keine Dateien.</p>'}</div></section>`;
  $('#sr').onclick = async () => { await pollMonitor(); await system(); };
  document.querySelectorAll('[data-file-play]').forEach(button => button.onclick = () => playFile({ name: button.dataset.filePlay.split('/').pop(), path: button.dataset.filePlay }));
  updateMonitorDom();
}

async function admin() {
  const [snapshot, users, diagnostics] = await Promise.all([api('/api/state'), api('/api/users'), api('/api/diagnostics')]);
  $('#view').innerHTML = `<section><h2>Allgemeine Einstellungen</h2><div class="grid"><label>Lautstärke<input id="av" type="number" min="0" max="100" value="${snapshot.settings.volume}"></label><label>Modus<select id="am"><option value="queue">Queue</option><option value="repeat">Repeat</option><option value="shuffle">Shuffle</option></select></label><label>Ausgabe<select id="ao"><option value="none">Keine</option><option value="discord">Discord</option><option value="ts3">TS3</option></select></label><input id="ai" placeholder="Ausgabe-ID" value="${esc(snapshot.settings.outputId)}"><input id="an" placeholder="Netzwerk-Interface" value="${esc(snapshot.settings.networkInterface)}"><input id="ad" placeholder="Musik-Verzeichnis" value="${esc(snapshot.settings.filesDirectory)}"><select id="at"><option value="dark">Dark</option><option value="light">Light</option></select></div><button id="as">Einstellungen speichern</button></section><section><h2>Benutzer</h2><div class="grid"><input id="un" placeholder="Name"><input id="up" type="password" placeholder="Passwort (min. 5)"><select id="ur"><option value="user">User</option><option value="admin">Admin</option></select></div><button id="ua">Benutzer anlegen</button><div class="list">${users.map(item => `<div class="listrow"><span>${esc(item.name)}</span><small>${esc(item.role)}</small></div>`).join('')}</div></section><section><h2>Spotify</h2><div class="grid"><input id="si" placeholder="Client-ID"><input id="ss" type="password" placeholder="Client-Secret"></div><button id="sp">Spotify speichern</button></section><section><div class="sectionhead"><h2>Diagnose</h2><button id="dr">↻ Aktualisieren</button></div><div class="diagnostics">${diagnostics.map(item => `<div><small>${esc(item.time)}</small><pre>${esc(item.message)}</pre></div>`).join('') || '<p class="muted">Keine Meldungen.</p>'}</div></section><section><h2>Bot/System</h2><div class="controls"><button data-c="restart-bot">Bot neu starten</button><button data-c="stop-bot" class="danger">Bot stoppen</button><button data-c="restart-system">System neu starten</button><button data-c="shutdown-system" class="danger">System herunterfahren</button></div></section>`;
  $('#am').value = snapshot.settings.mode; $('#ao').value = snapshot.settings.outputType; $('#at').value = snapshot.settings.theme || 'dark';
  $('#as').onclick = async () => { try { await put('/api/settings', { volume: Number($('#av').value), mode: $('#am').value, outputType: $('#ao').value, outputId: $('#ai').value, networkInterface: $('#an').value, filesDirectory: $('#ad').value, theme: $('#at').value }); await render(); } catch (error) { fail(error); } };
  $('#ua').onclick = async () => { try { await post('/api/users', { name: $('#un').value.trim(), password: $('#up').value, role: $('#ur').value }); admin(); } catch (error) { fail(error); } };
  $('#sp').onclick = async () => { try { await put('/api/integration/spotify', { clientId: $('#si').value, clientSecret: $('#ss').value }); note('Spotify gespeichert.'); } catch (error) { fail(error); } };
  $('#dr').onclick = admin;
  document.querySelectorAll('[data-c]').forEach(button => button.onclick = async () => { if (!confirm(`${button.textContent}?`)) return; try { await post('/api/control', { action: button.dataset.c }); note('Befehl gesendet.'); } catch (error) { fail(error); } });
}

function setupView() {
  $('#app').innerHTML = '<main class="auth"><h1>MusikBot187</h1><p>Ersteinrichtung</p><form id="setup"><input name="name" placeholder="Benutzername" required><input name="password" type="password" minlength="5" placeholder="Passwort (min. 5 Zeichen)" required><button>Einrichten</button></form></main>';
  $('#setup').onsubmit = async event => { event.preventDefault(); try { const form = new FormData(event.target); const result = await post('/api/setup', { name: form.get('name'), password: form.get('password') }); state.token = result.token; state.user = result.user; await render(); } catch (error) { fail(error); } };
}
function loginView() {
  $('#app').innerHTML = '<main class="auth"><h1>MusikBot187</h1><p>Anmelden</p><form id="login"><input name="name" placeholder="Benutzername" required><input name="password" type="password" placeholder="Passwort" required><button>Anmelden</button></form></main>';
  $('#login').onsubmit = async event => { event.preventDefault(); try { const form = new FormData(event.target); const result = await post('/api/login', { name: form.get('name'), password: form.get('password') }); state.token = result.token; state.user = result.user; await render(); } catch (error) { fail(error); } };
}
async function boot() {
  try { const setup = await api('/api/setup'); setup.initialized ? loginView() : setupView(); }
  catch (error) { $('#app').innerHTML = `<main class="auth"><h1>MusikBot187</h1><p>Backend nicht erreichbar: ${esc(error.message)}</p></main>`; }
}
boot();
