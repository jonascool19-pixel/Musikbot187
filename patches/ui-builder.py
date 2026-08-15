#!/usr/bin/env python3
from pathlib import Path

ROOT = Path('/opt/radiobot')
BACKEND = ROOT / 'backend/src/index.ts'
INDEX = ROOT / 'frontend/index.html'
UI_JS = ROOT / 'frontend/ui-builder.js'


def replace_once(path, old, new, label):
    s = path.read_text(encoding='utf-8')
    if old in s:
        s = s.replace(old, new, 1)
    elif new not in s:
        raise SystemExit(f'missing UI builder marker: {label}')
    path.write_text(s, encoding='utf-8')

replace_once(BACKEND,"const UPDATE_LOG = path.join(DATA_DIR, 'update.status');","const UPDATE_LOG = path.join(DATA_DIR, 'update.status');\nconst UI_LAYOUT_FILE = path.join(DATA_DIR, 'ui-layout.json');",'ui layout path')
replace_once(BACKEND,"type SpotifyState = { accessToken?: string; refreshToken?: string; expiresAt?: number; displayName?: string };","type SpotifyState = { accessToken?: string; refreshToken?: string; expiresAt?: number; displayName?: string };\ntype UiTile = { id: string; visible: boolean; span: number; rowSpan: number; icon: string; label: string };\ntype UiField = { id: string; tileId: string; visible: boolean; span: number; rowSpan: number; order: number };\ntype UiLayout = { preset: string; name: string; density: 'compact' | 'comfortable' | 'spacious'; accent: string; bg: string; panel: string; tiles: UiTile[]; fields: UiField[] };",'ui types')
marker = "const spotify = loadJson<SpotifyState>(SPOTIFY_FILE, {});"
insert = "const spotify = loadJson<SpotifyState>(SPOTIFY_FILE, {});\nconst DEFAULT_UI_TILES: UiTile[] = ['hero','discord','search','radio','media','playlists','spotify','youtube','update','queue'].map(id => ({ id, visible: true, span: 1, rowSpan: 1, icon: '◼', label: id }));\nconst uiLayout: UiLayout = loadJson<UiLayout>(UI_LAYOUT_FILE, { preset: 'midnight', name: 'Mein Dashboard', density: 'comfortable', accent: '#7dd3fc', bg: '#070b14', panel: '#111929', tiles: DEFAULT_UI_TILES, fields: [] });\nif (!Array.isArray(uiLayout.tiles)) uiLayout.tiles = DEFAULT_UI_TILES;\nif (!Array.isArray(uiLayout.fields)) uiLayout.fields = [];"
replace_once(BACKEND, marker, insert, 'ui layout state')
route_marker = "app.get('/api/health', async () => ({ ok: true, discord: client.isReady(), version: '2.0.0', youtube: fs.existsSync(YTDLP), spotify: Boolean(spotify.refreshToken) }));"
route_new = route_marker + "\napp.get('/api/ui/layout', async () => uiLayout);\napp.put<{ Body: UiLayout }>('/api/ui/layout', async req => {\n  const b = req.body ?? ({} as UiLayout);\n  if (!Array.isArray(b.tiles) || b.tiles.length > 32 || !Array.isArray(b.fields) || b.fields.length > 256) throw new Error('Ungültiges UI-Layout.');\n  const allowedTiles = new Set(DEFAULT_UI_TILES.map(t => t.id));\n  const seenTiles = new Set<string>(); const tiles: UiTile[] = [];\n  for (const raw of b.tiles) { const id = String(raw.id ?? ''); if (!allowedTiles.has(id) || seenTiles.has(id)) continue; seenTiles.add(id); tiles.push({ id, visible: raw.visible !== false, span: Math.max(1, Math.min(4, Number(raw.span) || 1)), rowSpan: Math.max(1, Math.min(3, Number(raw.rowSpan) || 1)), icon: String(raw.icon ?? '◼').slice(0, 8), label: String(raw.label ?? id).trim().slice(0, 40) || id }); }\n  for (const def of DEFAULT_UI_TILES) if (!seenTiles.has(def.id)) tiles.push(def);\n  const seenFields = new Set<string>(); const fields: UiField[] = [];\n  for (const raw of b.fields) { const id = String(raw.id ?? '').slice(0, 120); const tileId = String(raw.tileId ?? ''); if (!id || seenFields.has(id) || !allowedTiles.has(tileId)) continue; seenFields.add(id); fields.push({ id, tileId, visible: raw.visible !== false, span: Math.max(1, Math.min(4, Number(raw.span) || 1)), rowSpan: Math.max(1, Math.min(3, Number(raw.rowSpan) || 1)), order: Math.max(0, Math.min(999, Number(raw.order) || 0)) }); }\n  uiLayout.preset = String(b.preset ?? 'custom').slice(0, 24); uiLayout.name = String(b.name ?? 'Mein Dashboard').slice(0, 60); uiLayout.density = (['compact','comfortable','spacious'].includes(String(b.density)) ? String(b.density) : 'comfortable') as UiLayout['density']; uiLayout.accent = /^#[0-9a-f]{6}$/i.test(String(b.accent)) ? String(b.accent) : '#7dd3fc'; uiLayout.bg = /^#[0-9a-f]{6}$/i.test(String(b.bg)) ? String(b.bg) : '#070b14'; uiLayout.panel = /^#[0-9a-f]{6}$/i.test(String(b.panel)) ? String(b.panel) : '#111929'; uiLayout.tiles = tiles; uiLayout.fields = fields.sort((a,b) => a.order - b.order); saveJson(UI_LAYOUT_FILE, uiLayout); return uiLayout;\n});"
replace_once(BACKEND, route_marker, route_new, 'ui routes')
replace_once(INDEX, '<link rel="stylesheet" href="/style.css">', '<link rel="stylesheet" href="/style.css"><link rel="stylesheet" href="/ui-builder.css">', 'builder css')
replace_once(INDEX, '<script src="/setup-wizard.js"></script>', '<script src="/setup-wizard.js"></script><script src="/ui-builder.js"></script>', 'builder js')
replacements = {
    '<section class="hero">': '<section class="hero" data-tile-id="hero">',
    '<article><h2>Discord</h2>': '<article data-tile-id="discord"><h2 data-tile-title>🎙️ Discord</h2>',
    '<article><h2>🔎 Suche überall</h2>': '<article data-tile-id="search"><h2 data-tile-title>🔎 Suche überall</h2>',
    '<article><h2>📻 Radiosender</h2>': '<article data-tile-id="radio"><h2 data-tile-title>📻 Radiosender</h2>',
    '<article><h2>💿 Lokale Musik</h2>': '<article data-tile-id="media"><h2 data-tile-title>💿 Lokale Musik</h2>',
    '<article><h2>🎵 Playlists</h2>': '<article data-tile-id="playlists"><h2 data-tile-title>🎵 Playlists</h2>',
    '<article><h2>Spotify Playlist importieren</h2>': '<article data-tile-id="spotify"><h2 data-tile-title>🟢 Spotify Playlist importieren</h2>',
    '<article><h2>YouTube Playlist</h2>': '<article data-tile-id="youtube"><h2 data-tile-title>▶️ YouTube Playlist</h2>',
    '<article><h2>⚙ Update</h2>': '<article data-tile-id="update"><h2 data-tile-title>⚙️ Update</h2>',
    '<section><h2>Queue</h2>': '<section class="wide-card" data-tile-id="queue"><h2 data-tile-title>📜 Queue</h2>',
    '<h1 id="nowTitle">': '<h1 data-tile-title id="nowTitle">🎵 Noch nichts aktiv</h1>',
}
s = INDEX.read_text(encoding='utf-8')
for old, new in replacements.items():
    if old in s:
        s = s.replace(old, new, 1)
INDEX.write_text(s, encoding='utf-8')

replace_once(
    UI_JS,
    "return{...state.layout,tiles:state.layout.tiles.map(t=>({...t})),fields:fieldData};",
    "const tileMap=new Map(state.layout.tiles.map(t=>[t.id,t]));const tileData=tiles().map((el,i)=>{const old=tileMap.get(el.dataset.tileId);return old?{...old,visible:!el.hidden,order:i}:null;}).filter(Boolean);return{...state.layout,tiles:tileData,fields:fieldData};",
    'tile order persistence',
)
print('ui builder patch applied')
