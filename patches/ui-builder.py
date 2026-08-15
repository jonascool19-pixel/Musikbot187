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

# Persist TS3 as a first-class dashboard tile in the backend layout model.
replace_once(
    BACKEND,
    "const DEFAULT_UI_TILES: UiTile[] = ['hero','discord','search','radio','media','playlists','spotify','youtube','update','queue'].map(id => ({ id, visible: true, span: 1, rowSpan: 1, icon: '◼', label: id }));",
    "const DEFAULT_UI_TILES: UiTile[] = ['ts3','hero','discord','search','radio','media','playlists','spotify','youtube','update','queue'].map(id => ({ id, visible: true, span: 1, rowSpan: 1, icon: id === 'ts3' ? '🗣️' : '◼', label: id === 'ts3' ? 'TeamSpeak 3' : id }));",
    'TS3 default tile',
)

# Keep the UI assets loaded exactly once.
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

# Make TS3 a normal preset tile and a named builder tile, not an unknown DOM child.
replace_once(
    UI_JS,
    "const DEFAULTS = {\n    midnight: { name: 'Midnight', density: 'comfortable', accent: '#7dd3fc', bg: '#070b14', panel: '#111929', tiles: ['hero','discord','search','radio','media','playlists','spotify','youtube','update','queue'] },\n    compact: { name: 'Compact', density: 'compact', accent: '#a78bfa', bg: '#0b0b12', panel: '#171321', tiles: ['hero','discord','search','queue','radio','playlists','media','youtube','spotify','update'] },\n    studio: { name: 'Studio', density: 'spacious', accent: '#86efac', bg: '#06120d', panel: '#102118', tiles: ['hero','search','queue','radio','media','playlists','discord','youtube','spotify','update'] }\n  };",
    "const DEFAULTS = {\n    midnight: { name: 'Midnight', density: 'comfortable', accent: '#7dd3fc', bg: '#070b14', panel: '#111929', tiles: ['ts3','hero','discord','search','radio','media','playlists','spotify','youtube','update','queue'] },\n    compact: { name: 'Compact', density: 'compact', accent: '#a78bfa', bg: '#0b0b12', panel: '#171321', tiles: ['ts3','hero','discord','search','queue','radio','playlists','media','youtube','spotify','update'] },\n    studio: { name: 'Studio', density: 'spacious', accent: '#86efac', bg: '#06120d', panel: '#102118', tiles: ['ts3','hero','search','queue','radio','media','playlists','discord','youtube','spotify','update'] }\n  };",
    'builder defaults',
)
replace_once(
    UI_JS,
    "const tileMeta = { hero:['hero','Now Playing','🎵'], discord:['discord','Discord','🎙️'], search:['search','Suche','🔎'], radio:['radio','Radiosender','📻'], media:['media','Lokale Musik','💿'], playlists:['playlists','Playlists','🎵'], spotify:['spotify','Spotify','🟢'], youtube:['youtube','YouTube','▶️'], update:['update','Update','⚙️'], queue:['queue','Queue','📜'] };",
    "const tileMeta = { ts3:['ts3','TeamSpeak 3','🗣️'], hero:['hero','Now Playing','🎵'], discord:['discord','Discord','🎙️'], search:['search','Suche','🔎'], radio:['radio','Radiosender','📻'], media:['media','Lokale Musik','💿'], playlists:['playlists','Playlists','🎵'], spotify:['spotify','Spotify','🟢'], youtube:['youtube','YouTube','▶️'], update:['update','Update','⚙️'], queue:['queue','Queue','📜'] };",
    'TS3 tile metadata',
)
replace_once(
    UI_JS,
    "const order=(l.preset==='custom'&&source.length)?source.map(x=>x.id||x):((DEFAULTS[l.preset]?.tiles)||DEFAULTS.midnight.tiles);",
    "const order=(l.preset==='custom'&&source.length)?source.map(x=>x.id||x):((DEFAULTS[l.preset]?.tiles)||DEFAULTS.midnight.tiles);",
    'custom tile order',
)

# If the patch has not yet been applied, add the tile-aware persistence rules to the current source.
s = UI_JS.read_text(encoding='utf-8')
if "const tileMap=new Map(state.layout.tiles.map(t=>[t.id,t]));" not in s:
    old = "return{...state.layout,tiles:state.layout.tiles.map(t=>({...t})),fields:fieldData};"
    new = "const tileMap=new Map(state.layout.tiles.map(t=>[t.id,t]));const tileData=tiles().map((el,i)=>{const old=tileMap.get(el.dataset.tileId);return old?{...old,visible:!el.hidden,order:i}:null;}).filter(Boolean).sort((a,b)=>a.order-b.order);return{...state.layout,tiles:tileData,fields:fieldData};"
    if old in s:
        s = s.replace(old,new,1)
    else:
        raise SystemExit('tile persistence marker missing')
    UI_JS.write_text(s, encoding='utf-8')

print('TS3 registered as persistent UI tile')
