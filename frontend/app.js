const $ = s => document.querySelector(s);
let guildId = '';
let instanceId = 'discord';
window._searchItems = [];
async function api(url, options = {}) { const r = await fetch(url, { headers: { 'Content-Type': 'application/json', ...(options.headers || {}) }, ...options }); if (!r.ok) throw new Error(await r.text()); return r.status === 204 ? null : r.json(); }
function esc(v) { return String(v ?? '').replace(/[&<>"']/g, c => ({ '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;' }[c])); }
function message(text) { alert(text); }
function ts3Control(action, extra = {}) { return api('/api/instances/ts3/control', { method:'POST', body: JSON.stringify({ action, ...extra }) }); }
async function loadGuilds() { const g = await api('/api/guilds'); $('#guild').innerHTML = g.map(x => `<option value="${x.id}">${esc(x.name)}</option>`).join(''); if (g[0]) { guildId = g[0].id; await loadGuildState(); } }
async function loadGuildState() {
  guildId = $('#guild').value; if (!guildId) return;
  const [channels, state] = await Promise.all([api(`/api/guilds/${guildId}/channels`), api(`/api/state/${guildId}`)]);
  $('#voice').innerHTML = channels.voice.map(x => `<option value="${x.id}">${esc(x.name)}</option>`).join('');
  $('#statusChannel').innerHTML = `<option value="">Kein Status-Channel</option>` + channels.text.map(x => `<option value="${x.id}">${esc(x.name)}</option>`).join('');
  if (state.voiceChannelId) $('#voice').value = state.voiceChannelId;
  if (state.statusChannelId) $('#statusChannel').value = state.statusChannelId;
  $('#volume').value = state.volume ?? 80; $('#pause').textContent = state.paused ? 'Resume' : 'Pause';
  $('#nowTitle').textContent = state.playing || 'Noch nichts aktiv';
  $('#nowMeta').textContent = state.playing ? `${esc(state.currentPlaylist || 'Direkt')} · ${state.playingType || ''} · ${state.paused ? 'pausiert' : 'läuft'} · Discord` : 'Verbinde einen Voice-Channel und wähle Musik.';
  await loadQueue();
}
async function loadTs3State() {
  const state = await api('/api/instances/ts3');
  $('#ts3Info').innerHTML = state.enabled ? `<b>${state.connected ? '🟢 verbunden' : '🔴 nicht verbunden'}</b><small>${esc(state.host || 'TS3')} · Kanal: ${esc(state.channel || '—')}</small>` : 'TeamSpeak 3 ist nicht aktiviert.';
  $('#ts3Volume').value = state.volume ?? 80;
  $('#nowTitle').textContent = state.playing || 'Noch nichts aktiv';
  $('#nowMeta').textContent = state.enabled ? `${state.host || 'TeamSpeak 3'} · ${state.playing ? (state.paused ? 'pausiert' : 'läuft') : 'bereit'} · TS3` : 'TeamSpeak 3 ist nicht aktiviert.';
  $('#pause').textContent = state.paused ? 'Resume' : 'Pause';
  await loadQueue();
}
async function loadQueue() {
  if (instanceId === 'ts3') {
    const state = await api('/api/instances/ts3');
    $('#queue').innerHTML = state.queue?.length ? state.queue.map((x, i) => `${i + 1}. <b>${esc(x.label)}</b> <small>TS3</small>`).join('<br>') : 'Queue ist leer.';
    $('#queueInstanceLabel').textContent = 'TeamSpeak 3';
    return;
  }
  if (!guildId) return;
  const q = await api(`/api/state/${guildId}/queue`); $('#queue').innerHTML = q.length ? q.map((x, i) => `${i + 1}. <b>${esc(x.label)}</b> <small>${esc(x.playlistName || x.kind)}</small>`).join('<br>') : 'Queue ist leer.'; $('#queueInstanceLabel').textContent = 'Discord';
}
async function loadRadios() { const r = await api('/api/radios'); $('#radios').innerHTML = r.map(x => `<div class="item"><div><b>${esc(x.name)}</b><small>${esc(x.url)}</small></div><div><button onclick="playRadio('${x.id}',false)">▶</button><button onclick="playRadio('${x.id}',true)">＋</button><button onclick="delRadio('${x.id}')">✕</button></div></div>`).join('') || '<div class="empty">Keine Sender.</div>'; }
async function loadMedia() { const m = await api('/api/media'); $('#media').innerHTML = m.map(x => `<div class="item"><div><b>${esc(x)}</b><small>Lokal</small></div><div><button onclick="playFile(${JSON.stringify(x)},false)">▶</button><button onclick="playFile(${JSON.stringify(x)},true)">＋</button></div></div>`).join('') || '<div class="empty">Keine Dateien.</div>'; }
async function loadPlaylists() { const p = await api('/api/playlists'); $('#playlists').innerHTML = p.map(x => `<div class="item"><div><b>${esc(x.name)}</b><small>${esc(x.kind)} · ${x.count} Titel</small></div><div><button onclick="playPlaylist('${x.id}',false)">▶</button><button onclick="playPlaylist('${x.id}',true)">＋</button><button onclick="delPlaylist('${x.id}')">✕</button></div></div>`).join('') || '<div class="empty">Keine Playlists.</div>'; }
async function refreshStatus() { try { const h = await api('/api/health'); $('#status').textContent = h.discord ? 'online' : 'web-only'; document.body.classList.toggle('online', h.discord); } catch { $('#status').textContent = 'offline'; } }
async function loadInstanceState() { if (instanceId === 'ts3') return loadTs3State(); return loadGuildState(); }
async function switchInstance() {
  instanceId = $('#instance').value;
  const ts3 = instanceId === 'ts3';
  $('#discordPanel').hidden = ts3;
  $('#ts3Panel').hidden = !ts3;
  $('#instance').value = instanceId;
  await loadInstanceState();
}
window.playRadio = async (id, append) => { if (instanceId === 'ts3') { const radios = await api('/api/radios'); const r = radios.find(x => x.id === id); if (!r) throw new Error('Radio nicht gefunden.'); await ts3Control(append ? 'queue' : 'play', { input:r.url, label:r.name }); await loadTs3State(); return; } await api(`/api/state/${guildId}/radio`, { method:'POST', body:JSON.stringify({ radioId:id, append }) }); await loadGuildState(); };
window.delRadio = async id => { await api(`/api/radios/${id}`, { method:'DELETE' }); await loadRadios(); };
window.playFile = async (file, append) => { if (instanceId === 'ts3') { await ts3Control(append ? 'queue' : 'play', { input:file, label:file }); await loadTs3State(); return; } await api(`/api/state/${guildId}/file`, { method:'POST', body:JSON.stringify({ file, append }) }); await loadGuildState(); };
window.playPlaylist = async (id, append) => { if (instanceId === 'ts3') { await api(`/api/instances/ts3/playlist/${id}`, { method:'POST', body:JSON.stringify({ append }) }); await loadTs3State(); return; } await api(`/api/playlists/${id}/play/${guildId}`, { method:'POST', body:JSON.stringify({ append }) }); await loadGuildState(); };
window.delPlaylist = async id => { await api(`/api/playlists/${id}`, { method:'DELETE' }); await loadPlaylists(); };
$('#instance').addEventListener('change', switchInstance);
$('#guild').addEventListener('change', loadGuildState);
$('#voice').addEventListener('change', async () => { if (guildId && instanceId === 'discord') await api(`/api/state/${guildId}/voice`, { method:'POST', body:JSON.stringify({ voiceChannelId:$('#voice').value }) }); });
$('#statusChannel').addEventListener('change', async () => { if (!guildId || instanceId !== 'discord') return; await api(`/api/state/${guildId}/status-channel`, { method:'POST', body:JSON.stringify({ statusChannelId:$('#statusChannel').value }) }); });
$('#join').onclick = async () => { try { await api(`/api/state/${guildId}/voice`, { method:'POST', body:JSON.stringify({ voiceChannelId:$('#voice').value }) }); message('Voice-Channel gespeichert.'); } catch (e) { message(e.message); } };
$('#disconnect').onclick = async () => { await api(`/api/state/${guildId}/stop`, { method:'POST' }); await loadGuildState(); };
$('#stop').onclick = async () => { if (instanceId === 'ts3') await ts3Control('stop'); else await api(`/api/state/${guildId}/stop`, { method:'POST' }); await loadInstanceState(); };
$('#skip').onclick = async () => { if (instanceId === 'ts3') await ts3Control('skip'); else await api(`/api/state/${guildId}/skip`, { method:'POST' }); await loadInstanceState(); };
$('#pause').onclick = async () => { if (instanceId === 'ts3') { const state = await api('/api/instances/ts3'); await ts3Control(state.paused ? 'resume' : 'pause'); await loadTs3State(); return; } const state = await api(`/api/state/${guildId}`); await api(`/api/state/${guildId}/${state.paused ? 'resume' : 'pause'}`, { method:'POST' }); await loadGuildState(); };
let volumeTimer; $('#volume').oninput = () => { if (instanceId !== 'discord') return; clearTimeout(volumeTimer); volumeTimer = setTimeout(async () => { await api(`/api/state/${guildId}/volume`, { method:'POST', body:JSON.stringify({ volume:Number($('#volume').value) }) }); }, 150); };
$('#ts3Volume').oninput = () => { clearTimeout(volumeTimer); volumeTimer = setTimeout(async () => { await ts3Control('volume', { volume:Number($('#ts3Volume').value) }); await loadTs3State(); }, 150); };
$('#addRadio').onclick = async () => { const name = $('#radioName').value.trim(), url = $('#radioUrl').value.trim(); if (!name || !url) return; await api('/api/radios', { method:'POST', body:JSON.stringify({ name, url }) }); $('#radioName').value=''; $('#radioUrl').value=''; await loadRadios(); };
$('#createPlaylist').onclick = async () => { const name = $('#playlistName').value.trim(); if (!name) return; await api('/api/playlists', { method:'POST', body:JSON.stringify({ name }) }); $('#playlistName').value=''; await loadPlaylists(); };
async function playSearchItem(x, append=false) {
  if (instanceId === 'ts3') {
    if (x.kind === 'spotify') throw new Error('Spotify-Treffer sind nur für Import/Suche.');
    return ts3Control(append ? 'queue' : 'play', { input:x.value, label:x.label });
  }
  if (x.kind === 'file') return api(`/api/state/${guildId}/file`, { method:'POST', body:JSON.stringify({ file:x.value, append }) });
  if (x.kind === 'radio') { const radios = await api('/api/radios'); const r = radios.find(y => y.url === x.value || y.name === x.label); if (!r) throw new Error('Radio nicht gefunden.'); return api(`/api/state/${guildId}/radio`, { method:'POST', body:JSON.stringify({ radioId:r.id, append }) }); }
  if (x.kind === 'youtube') return fetch('/api/playlists', { method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify({ name:`_search_${Date.now()}`, kind:'youtube', items:[{ kind:'youtube', value:x.value, label:x.label }] }) }).then(r=>r.json()).then(p=>api(`/api/playlists/${p.id}/play/${guildId}`, { method:'POST', body:JSON.stringify({ append }) }));
  throw new Error('Diese Quelle ist keine Audioquelle.');
}
$('#searchBtn').onclick = async () => { const q = $('#search').value.trim(); if (!q) return; try { const data = await api(`/api/search?q=${encodeURIComponent(q)}`); window._searchItems = [...data.local, ...data.radios, ...data.youtube, ...data.spotify]; $('#searchResults').innerHTML = window._searchItems.map((x, i) => { const playable = x.kind !== 'spotify'; const action = playable ? `<button onclick="searchPlay(${i})">▶</button><button onclick="searchQueue(${i})">＋</button>` : `<a href="${esc(x.url || '#')}" target="_blank" rel="noopener">↗</a>`; return `<div class="item"><div><b>${esc(x.label || x.name)}</b><small>${esc(x.meta || x.artist || x.channel || x.kind)}</small></div><div>${action}</div></div>`; }).join('') || '<div class="empty">Nichts gefunden.</div>'; } catch (e) { message(e.message); } };
window.searchPlay = async i => { const x = window._searchItems?.[i]; if (!x || x.kind === 'spotify') return; try { await playSearchItem(x, false); await loadInstanceState(); } catch (e) { message(e.message); } };
window.searchQueue = async i => { const x = window._searchItems?.[i]; if (!x || x.kind === 'spotify') return; try { await playSearchItem(x, true); await loadInstanceState(); } catch (e) { message(e.message); } };
$('#spotifyLogin').onclick = () => location.href = '/api/spotify/login';
$('#spotifyImport').onclick = async () => { const url = $('#spotifyUrl').value.trim(); if (!url) return; try { const p = await api('/api/spotify/import-playlist', { method:'POST', body:JSON.stringify({ url }) }); $('#spotifyUrl').value=''; $('#spotifyStatus').textContent=`Importiert: ${p.name} (${p.items.length} Titel)`; await loadPlaylists(); } catch (e) { message(e.message); } };
$('#youtubeImport').onclick = async () => { const url = $('#youtubeUrl').value.trim(); if (!url) return; try { const p = await api('/api/youtube/import-playlist', { method:'POST', body:JSON.stringify({ url }) }); $('#youtubeUrl').value=''; message(`Importiert: ${p.name} (${p.items.length} Titel)`); await loadPlaylists(); } catch (e) { message(e.message); } };
$('#update').onclick = async () => { if (!confirm('RadioBot jetzt aktualisieren? Der Dienst startet danach automatisch neu.')) return; try { const r = await api('/api/update', { method:'POST' }); $('#updateStatus').textContent = r.message; setTimeout(() => location.reload(), 12000); } catch (e) { message(e.message); } };
async function loadUpdateStatus() { try { const r = await api('/api/update/status'); if (r.status && r.status !== 'idle') $('#updateStatus').textContent = r.status; } catch {} }
$('#refresh').onclick = async () => { await Promise.all([refreshStatus(), loadInstanceState(), loadRadios(), loadMedia(), loadPlaylists(), loadUpdateStatus()]); };
(async () => { await refreshStatus(); await loadGuilds(); const instances = await api('/api/instances'); const ts3 = instances.find(x => x.id === 'ts3'); if (!ts3?.enabled) { const opt = [...$('#instance').options].find(o => o.value === 'ts3'); if (opt) opt.textContent = 'TeamSpeak 3 (nicht aktiviert)'; } await loadInstanceState(); await loadRadios(); await loadMedia(); await loadPlaylists(); await loadUpdateStatus(); setInterval(async () => { await refreshStatus(); await loadInstanceState(); }, 10000); })();