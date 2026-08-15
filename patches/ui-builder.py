#!/usr/bin/env python3
from pathlib import Path
import re

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

backend_source = BACKEND.read_text(encoding='utf-8')
if 'type UiLayout =' not in backend_source:
    marker = "type SpotifyState = { accessToken?: string; refreshToken?: string; expiresAt?: number; displayName?: string };"
    insert = marker + "\ntype UiTile = { id: string; visible: boolean; span: number; rowSpan: number; icon: string; label: string };\ntype UiField = { id: string; tileId: string; visible: boolean; span: number; rowSpan: number; order: number };\ntype UiLayout = { preset: string; name: string; density: 'compact' | 'comfortable' | 'spacious'; accent: string; bg: string; panel: string; tiles: UiTile[]; fields: UiField[] };"
    if marker not in backend_source:
        raise SystemExit('missing UI state marker')
    backend_source = backend_source.replace(marker, insert, 1)
if "const UI_LAYOUT_FILE = path.join(DATA_DIR, 'ui-layout.json');" not in backend_source:
    marker = "const UPDATE_LOG = path.join(DATA_DIR, 'update.status');"
    if marker not in backend_source:
        raise SystemExit('missing UI layout file marker')
    backend_source = backend_source.replace(marker, marker + "\nconst UI_LAYOUT_FILE = path.join(DATA_DIR, 'ui-layout.json');", 1)
if 'const DEFAULT_UI_TILES:' not in backend_source:
    marker = "const spotify = loadJson<SpotifyState>(SPOTIFY_FILE, {});"
    insert = marker + "\nconst DEFAULT_UI_TILES: UiTile[] = ['ts3','hero','discord','search','radio','media','playlists','spotify','youtube','update','queue'].map(id => ({ id, visible: true, span: 1, rowSpan: 1, icon: id === 'ts3' ? '🗣️' : '◼', label: id === 'ts3' ? 'TeamSpeak 3' : id }));\nconst uiLayout: UiLayout = loadJson<UiLayout>(UI_LAYOUT_FILE, { preset: 'midnight', name: 'Mein Dashboard', density: 'comfortable', accent: '#7dd3fc', bg: '#070b14', panel: '#111929', tiles: DEFAULT_UI_TILES, fields: [] });\nif (!Array.isArray(uiLayout.tiles)) uiLayout.tiles = DEFAULT_UI_TILES;\nif (!Array.isArray(uiLayout.fields)) uiLayout.fields = [];"
    if marker not in backend_source:
        raise SystemExit('missing UI state insertion marker')
    backend_source = backend_source.replace(marker, insert, 1)
else:
    backend_source = re.sub(r"const DEFAULT_UI_TILES: UiTile\[\] = \[(?!'ts3')", "const DEFAULT_UI_TILES: UiTile[] = ['ts3',", backend_source, count=1)
if "'/api/ui/layout'" not in backend_source:
    health = "app.get('/api/health', async () => ({ ok: true, discord: client.isReady(), version: '2.0.0', youtube: fs.existsSync(YTDLP), spotify: Boolean(spotify.refreshToken) }));"
    if health not in backend_source:
        raise SystemExit('health route marker missing')
    routes = health + "\napp.get('/api/ui/layout', async () => uiLayout);\napp.put<{ Body: UiLayout }>('/api/ui/layout', async req => {\n  const b = req.body ?? ({} as UiLayout);\n  if (!Array.isArray(b.tiles) || b.tiles.length > 32 || !Array.isArray(b.fields) || b.fields.length > 256) throw new Error('Ungültiges UI-Layout.');\n  const allowedTiles = new Set(DEFAULT_UI_TILES.map(t => t.id));\n  const seenTiles = new Set<string>(); const tiles: UiTile[] = [];\n  for (const raw of b.tiles) { const id = String(raw.id ?? ''); if (!allowedTiles.has(id) || seenTiles.has(id)) continue; seenTiles.add(id); tiles.push({ id, visible: raw.visible !== false, span: Math.max(1, Math.min(4, Number(raw.span) || 1)), rowSpan: Math.max(1, Math.min(3, Number(raw.rowSpan) || 1)), icon: String(raw.icon ?? '◼').slice(0, 8), label: String(raw.label ?? id).trim().slice(0, 40) || id }); }\n  for (const def of DEFAULT_UI_TILES) if (!seenTiles.has(def.id)) tiles.push(def);\n  const seenFields = new Set<string>(); const fields: UiField[] = [];\n  for (const raw of b.fields) { const id = String(raw.id ?? '').slice(0, 120); const tileId = String(raw.tileId ?? ''); if (!id || seenFields.has(id) || !allowedTiles.has(tileId)) continue; seenFields.add(id); fields.push({ id, tileId, visible: raw.visible !== false, span: Math.max(1, Math.min(4, Number(raw.span) || 1)), rowSpan: Math.max(1, Math.min(3, Number(raw.rowSpan) || 1)), order: Math.max(0, Math.min(999, Number(raw.order) || 0)) }); }\n  uiLayout.preset = String(b.preset ?? 'custom').slice(0, 24); uiLayout.name = String(b.name ?? 'Mein Dashboard').slice(0, 60); uiLayout.density = (['compact','comfortable','spacious'].includes(String(b.density)) ? String(b.density) : 'comfortable') as UiLayout['density']; uiLayout.accent = /^#[0-9a-f]{6}$/i.test(String(b.accent)) ? String(b.accent) : '#7dd3fc'; uiLayout.bg = /^#[0-9a-f]{6}$/i.test(String(b.bg)) ? String(b.bg) : '#070b14'; uiLayout.panel = /^#[0-9a-f]{6}$/i.test(String(b.panel)) ? String(b.panel) : '#111929'; uiLayout.tiles = tiles; uiLayout.fields = fields.sort((a,b) => a.order - b.order); saveJson(UI_LAYOUT_FILE, uiLayout); return uiLayout;\n});"
    backend_source = backend_source.replace(health, routes, 1)
BACKEND.write_text(backend_source, encoding='utf-8')

html = INDEX.read_text(encoding='utf-8')
if 'href="/ui-builder.css"' not in html:
    if '<link rel="stylesheet" href="/style.css">' not in html:
        raise SystemExit('style.css marker missing for builder css')
    html = html.replace('<link rel="stylesheet" href="/style.css">', '<link rel="stylesheet" href="/style.css"><link rel="stylesheet" href="/ui-builder.css">', 1)
if 'src="/ui-builder.js"' not in html:
    marker = '<script src="/setup-wizard.js"></script>'
    if marker in html:
        html = html.replace(marker, marker + '<script src="/ui-builder.js"></script>', 1)
    elif '<script src="/app.js"></script>' in html:
        html = html.replace('<script src="/app.js"></script>', '<script src="/app.js"></script><script src="/ui-builder.js"></script>', 1)
    else:
        raise SystemExit('app/setup script marker missing for builder js')
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
for old, new in replacements.items():
    if old in html:
        html = html.replace(old, new, 1)
INDEX.write_text(html, encoding='utf-8')

ui_source = UI_JS.read_text(encoding='utf-8')
if "ts3:['ts3','TeamSpeak 3','🗣️']" not in ui_source:
    ui_source = re.sub(r"const tileMeta = \{.*?\};", "const tileMeta = { ts3:['ts3','TeamSpeak 3','🗣️'], hero:['hero','Now Playing','🎵'], discord:['discord','Discord','🎙️'], search:['search','Suche','🔎'], radio:['radio','Radiosender','📻'], media:['media','Lokale Musik','💿'], playlists:['playlists','Playlists','🎵'], spotify:['spotify','Spotify','🟢'], youtube:['youtube','YouTube','▶️'], update:['update','Update','⚙️'], queue:['queue','Queue','📜'] };", ui_source, count=1)
def add_ts3(match):
    block = match.group(0)
    if "'ts3'" not in block:
        block = block.replace("tiles: ['", "tiles: ['ts3','", 1)
    return block
ui_source = re.sub(r"(?:midnight|compact|studio): \{.*?\},", add_ts3, ui_source, count=3, flags=re.S)
if "const order=(l.preset==='custom'&&source.length)?source.map(x=>x.id||x):((DEFAULTS[l.preset]?.tiles)||DEFAULTS.midnight.tiles);" not in ui_source:
    ui_source = re.sub(r"const order=DEFAULTS\[l\.preset\]\?\.tiles\|\|DEFAULTS\.midnight\.tiles;", "const order=(l.preset==='custom'&&source.length)?source.map(x=>x.id||x):((DEFAULTS[l.preset]?.tiles)||DEFAULTS.midnight.tiles);", ui_source, count=1)

# Ensure movable fields are discovered even when a previous patch already created an empty zone.
field_fn_old = "function fieldCandidates(tile){const zone=tile.querySelector(':scope > .builder-field-zone');if(zone)return[];return[...tile.children].filter(el=>!el.matches('h1,h2,h3,.eyebrow')&&(el.matches('label,.row,.card,.list,.hint,p,.controls')||el.id==='queue'));}"
field_fn_new = "function fieldCandidates(tile){const zone=tile.querySelector(':scope > .builder-field-zone');const scope=zone?[...tile.children].filter(el=>el!==zone):[...tile.children];return scope.filter(el=>!el.matches('h1,h2,h3,.eyebrow,.builder-tile-handle,.builder-field-zone')&&(el.matches('label,.row,.card,.list,.hint,p,.controls')||el.id==='queue'||el.querySelector?.('input,select,button'))); }"
if field_fn_old in ui_source:
    ui_source = ui_source.replace(field_fn_old, field_fn_new, 1)
elif field_fn_new not in ui_source:
    ui_source = re.sub(r"function fieldCandidates\(tile\)\{.*?\}", field_fn_new, ui_source, count=1, flags=re.S)
if "const tileMap=new Map(state.layout.tiles.map(t=>[t.id,t]));" not in ui_source:
    old = "return{...state.layout,tiles:state.layout.tiles.map(t=>({...t})),fields:fieldData};"
    if old not in ui_source:
        raise SystemExit('tile persistence marker missing')
    ui_source = ui_source.replace(old, "const tileMap=new Map(state.layout.tiles.map(t=>[t.id,t]));const tileData=tiles().map((el,i)=>{const old=tileMap.get(el.dataset.tileId);return old?{...old,visible:!el.hidden,order:i}:null;}).filter(Boolean).sort((a,b)=>a.order-b.order);return{...state.layout,tiles:tileData,fields:fieldData};", 1)
UI_JS.write_text(ui_source, encoding='utf-8')
print('TS3 registered, UI assets/API ensured, and movable-field discovery made idempotent')
