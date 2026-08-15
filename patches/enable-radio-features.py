#!/usr/bin/env python3
from pathlib import Path

p = Path('/opt/radiobot/backend/src/index.ts')
s = p.read_text(encoding='utf-8')

old = "type GuildState = {\n  guildId: string; voiceChannelId: string; statusChannelId?: string; statusMessageId?: string;\n  playing?: string; playingType?: SourceKind; currentPlaylist?: string; volume: number; paused: boolean; queue: QueueItem[];\n};"
new = "type GuildState = {\n  guildId: string; voiceChannelId: string; statusChannelId?: string; statusMessageId?: string;\n  playing?: string; playingType?: SourceKind; currentPlaylist?: string; volume: number; paused: boolean; queue: QueueItem[];\n  activePlaylistId?: string; repeatMode: 'off' | 'one' | 'all'; shuffle: boolean; lastItem?: QueueItem;\n};"
if old not in s:
    raise SystemExit('GuildState block not found')
s = s.replace(old, new, 1)

old = "function guildState(guildId: string): GuildState { db.guilds[guildId] ??= { guildId, voiceChannelId: '', volume: 80, paused: false, queue: [] }; return db.guilds[guildId]; }"
new = "function guildState(guildId: string): GuildState { db.guilds[guildId] ??= { guildId, voiceChannelId: '', volume: 80, paused: false, queue: [], repeatMode: 'off', shuffle: false }; const s = db.guilds[guildId]; s.repeatMode ??= 'off'; s.shuffle ??= false; return s; }"
if old not in s:
    raise SystemExit('guildState block not found')
s = s.replace(old, new, 1)

marker = "async function playNext(guildId: string) {\n  const state = guildState(guildId);\n  const item = state.queue.shift();"
replacement = """async function playNext(guildId: string) {
  const state = guildState(guildId);
  let item = state.queue.shift();
  if (!item && state.repeatMode === 'one' && state.lastItem) item = { ...state.lastItem };
  if (!item && state.activePlaylistId && state.repeatMode === 'all') {
    const playlist = db.playlists.find(p => p.id === state.activePlaylistId);
    if (playlist?.items.length) {
      const refill = playlist.items.map(x => ({ kind: x.kind, value: x.value, label: x.label, playlistName: playlist.name } as QueueItem));
      if (state.shuffle) refill.sort(() => Math.random() - 0.5);
      state.queue.push(...refill);
      item = state.queue.shift();
    }
  }"""
if marker not in s:
    raise SystemExit('playNext marker not found')
s = s.replace(marker, replacement, 1)

old = "    state.playing = item.label; state.playingType = item.kind; state.currentPlaylist = item.playlistName ?? (item.kind === 'radio' ? 'Radio' : 'Direkt'); state.paused = false; saveJson(DB_FILE, db); await updateStatus(guildId);"
new = "    state.lastItem = { ...item }; state.playing = item.label; state.playingType = item.kind; state.currentPlaylist = item.playlistName ?? (item.kind === 'radio' ? 'Radio' : 'Direkt'); state.paused = false; saveJson(DB_FILE, db); await updateStatus(guildId);"
if old not in s:
    raise SystemExit('playing assignment not found')
s = s.replace(old, new, 1)

old = "async function queuePlaylist(guildId: string, playlist: Playlist, replace: boolean) {\n  const items = playlist.items.map(item => ({ kind: item.kind, value: item.value, label: item.label, playlistName: playlist.name } as QueueItem));\n  const state = guildState(guildId); if (replace) { await stopGuild(guildId); state.queue = items; } else state.queue.push(...items); saveJson(DB_FILE, db); await updateStatus(guildId); if (!state.playing) await playNext(guildId); return state;\n}"
new = """async function queuePlaylist(guildId: string, playlist: Playlist, replace: boolean) {
  let items = playlist.items.map(item => ({ kind: item.kind, value: item.value, label: item.label, playlistName: playlist.name } as QueueItem));
  const state = guildState(guildId);
  state.activePlaylistId = playlist.id;
  if (state.shuffle) items = items.sort(() => Math.random() - 0.5);
  if (replace) { await stopGuild(guildId); state.activePlaylistId = playlist.id; state.queue = items; }
  else state.queue.push(...items);
  saveJson(DB_FILE, db); await updateStatus(guildId); if (!state.playing) await playNext(guildId); return state;
}"""
if old not in s:
    raise SystemExit('queuePlaylist block not found')
s = s.replace(old, new, 1)

marker = "app.get('/api/playlists', async () => db.playlists.map(p => ({ id: p.id, name: p.name, kind: p.kind, count: p.items.length })));"
insert = r'''async function radioBrowserSearch(query: string) {
  const url = new URL('https://de1.api.radio-browser.info/json/stations/search');
  url.searchParams.set('name', query);
  url.searchParams.set('hidebroken', 'true');
  url.searchParams.set('order', 'votes');
  url.searchParams.set('reverse', 'true');
  url.searchParams.set('limit', '25');
  const response = await fetch(url, { headers: { 'User-Agent': 'MusikBot187/1.0' }, signal: AbortSignal.timeout(10000) });
  if (!response.ok) throw new Error(`Radio-Suche fehlgeschlagen (${response.status})`);
  const data = await response.json() as any[];
  return data.map(s => ({ stationuuid: s.stationuuid, name: s.name, url: s.url_resolved || s.url, favicon: s.favicon || null, country: s.country || '', language: s.language || '', tags: s.tags || '', codec: s.codec || '', bitrate: s.bitrate || 0 })).filter(s => s.url);
}
app.get<{ Querystring: { q?: string } }>('/api/radio/search', async req => { const q = String(req.query.q ?? '').trim(); if (!q) return []; return radioBrowserSearch(q); });
app.get<{ Querystring: { q?: string } }>('/api/radio/top', async req => { const url = new URL('https://de1.api.radio-browser.info/json/stations/topclick/25'); const response = await fetch(url, { headers: { 'User-Agent': 'MusikBot187/1.0' }, signal: AbortSignal.timeout(10000) }); if (!response.ok) throw new Error('Radio-Liste nicht erreichbar.'); const data = await response.json() as any[]; return data.map(s => ({ stationuuid: s.stationuuid, name: s.name, url: s.url_resolved || s.url, favicon: s.favicon || null, country: s.country || '', language: s.language || '', tags: s.tags || '', codec: s.codec || '', bitrate: s.bitrate || 0 })).filter(s => s.url); });
app.post<{ Body: { url: string; name: string; playlistId?: string } }>('/api/radio/add', async req => {
  const name = req.body.name.trim(); const url = req.body.url.trim();
  if (!name || !/^https?:\\/\\//i.test(url)) throw new Error('Ungültiger Radiosender.');
  let radio = db.radios.find(r => r.url === url || r.name.toLowerCase() === name.toLowerCase());
  if (!radio) { radio = { id: makeId(), name, url, enabled: true }; db.radios.push(radio); }
  let playlist = db.playlists.find(p => p.name.toLowerCase() === 'radio');
  if (!playlist) { playlist = { id: makeId(), name: 'Radio', kind: 'radio', items: [] }; db.playlists.push(playlist); }
  if (!playlist.items.some(i => i.kind === 'radio' && i.value === url)) playlist.items.push({ kind: 'radio', value: url, label: name });
  saveJson(DB_FILE, db); return { radio, playlist };
});
app.post<{ Params: { id: string }; Body: { item?: PlaylistItem } }>('/api/playlists/:id/items', async req => { const p = db.playlists.find(x => x.id === req.params.id); if (!p) throw new Error('Playlist nicht gefunden.'); if (!req.body.item?.label || !req.body.item.value) throw new Error('Playlist-Element fehlt.'); p.items.push(req.body.item); saveJson(DB_FILE, db); return p; });
app.post<{ Params: { id: string }; Body: { guildId: string; mode: 'off' | 'one' | 'all'; shuffle: boolean } }>('/api/state/:id/playback-mode', async req => { const s = guildState(req.params.id); s.activePlaylistId = req.body.guildId || s.activePlaylistId; s.repeatMode = req.body.mode; s.shuffle = Boolean(req.body.shuffle); if (s.shuffle && s.queue.length > 1) s.queue.sort(() => Math.random() - 0.5); saveJson(DB_FILE, db); await updateStatus(req.params.id); return s; });
'''
if marker not in s:
    raise SystemExit('playlist marker not found')
s = s.replace(marker, insert + marker, 1)

p.write_text(s, encoding='utf-8')
print('patched', p)
