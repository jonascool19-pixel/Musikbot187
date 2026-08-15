#!/usr/bin/env python3
from pathlib import Path

p = Path('/opt/radiobot/backend/src/index.ts')
s = p.read_text(encoding='utf-8')

block = r'''async function radioBrowserSearch(query: string) {
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
app.get('/api/radio/top', async () => { const response = await fetch('https://de1.api.radio-browser.info/json/stations/topclick/25', { headers: { 'User-Agent': 'MusikBot187/1.0' }, signal: AbortSignal.timeout(10000) }); if (!response.ok) throw new Error('Radio-Liste nicht erreichbar.'); const data = await response.json() as any[]; return data.map(s => ({ stationuuid: s.stationuuid, name: s.name, url: s.url_resolved || s.url, favicon: s.favicon || null, country: s.country || '', language: s.language || '', tags: s.tags || '', codec: s.codec || '', bitrate: s.bitrate || 0 })).filter(s => s.url); });
app.post<{ Body: { url: string; name: string } }>('/api/radio/add', async req => {
  const name = req.body.name.trim(); const url = req.body.url.trim();
  if (!name || !/^https?:\/\//i.test(url)) throw new Error('Ungültiger Radiosender.');
  let radio = db.radios.find(r => r.url === url || r.name.toLowerCase() === name.toLowerCase());
  if (!radio) { radio = { id: makeId(), name, url, enabled: true }; db.radios.push(radio); }
  let playlist = db.playlists.find(p => p.name.toLowerCase() === 'radio');
  if (!playlist) { playlist = { id: makeId(), name: 'Radio', kind: 'radio', items: [] }; db.playlists.push(playlist); }
  if (!playlist.items.some(i => i.kind === 'radio' && i.value === url)) playlist.items.push({ kind: 'radio', value: url, label: name });
  saveJson(DB_FILE, db); return { radio, playlist };
});
'''

if "app.get('/api/radio/search'" not in s:
    anchor = "app.get('/api/playlists'"
    if anchor not in s:
        anchor = "app.get('/api/health'"
    if anchor not in s:
        raise SystemExit('radio route anchor not found')
    s = s.replace(anchor, block + "\n" + anchor, 1)

if "app.get('/api/radio/search'" not in s:
    raise SystemExit('final radio route insertion failed')

p.write_text(s, encoding='utf-8')
print('final radio route patch applied')
