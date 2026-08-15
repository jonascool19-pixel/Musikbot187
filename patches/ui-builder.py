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

# Persist TS3 as a first-class dashboard tile in the backend layout model.
backend_source = BACKEND.read_text(encoding='utf-8')
if "'ts3'" not in backend_source.split('const DEFAULT_UI_TILES', 1)[-1].split(';', 1)[0]:
    backend_source = re.sub(
        r"const DEFAULT_UI_TILES: UiTile\[\] = .*?;",
        "const DEFAULT_UI_TILES: UiTile[] = ['ts3','hero','discord','search','radio','media','playlists','spotify','youtube','update','queue'].map(id => ({ id, visible: true, span: 1, rowSpan: 1, icon: id === 'ts3' ? '🗣️' : '◼', label: id === 'ts3' ? 'TeamSpeak 3' : id }));",
        backend_source,
        count=1,
    )
BACKEND.write_text(backend_source, encoding='utf-8')

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
ui_source = UI_JS.read_text(encoding='utf-8')
if "ts3:['ts3','TeamSpeak 3','🗣️']" not in ui_source:
    ui_source = re.sub(
        r"const tileMeta = \{.*?\};",
        "const tileMeta = { ts3:['ts3','TeamSpeak 3','🗣️'], hero:['hero','Now Playing','🎵'], discord:['discord','Discord','🎙️'], search:['search','Suche','🔎'], radio:['radio','Radiosender','📻'], media:['media','Lokale Musik','💿'], playlists:['playlists','Playlists','🎵'], spotify:['spotify','Spotify','🟢'], youtube:['youtube','YouTube','▶️'], update:['update','Update','⚙️'], queue:['queue','Queue','📜'] };",
        ui_source,
        count=1,
    )
# Add TS3 to every built-in preset while preserving the existing preset order.
def add_ts3_to_preset(match):
    block = match.group(0)
    if "'ts3'" not in block:
        block = block.replace("tiles: ['", "tiles: ['ts3','", 1)
    return block
ui_source = re.sub(r"(?:midnight|compact|studio): \{.*?\},", add_ts3_to_preset, ui_source, count=3, flags=re.S)
# Keep custom layouts in the exact saved tile order.
ui_source = re.sub(
    r"const order=DEFAULTS\[l\.preset\]\?\.tiles\|\|DEFAULTS\.midnight\.tiles;",
    "const order=(l.preset==='custom'&&source.length)?source.map(x=>x.id||x):((DEFAULTS[l.preset]?.tiles)||DEFAULTS.midnight.tiles);",
    ui_source,
    count=1,
)
# Persist actual DOM tile order.
if "const tileMap=new Map(state.layout.tiles.map(t=>[t.id,t]));" not in ui_source:
    old = "return{...state.layout,tiles:state.layout.tiles.map(t=>({...t})),fields:fieldData};"
    new = "const tileMap=new Map(state.layout.tiles.map(t=>[t.id,t]));const tileData=tiles().map((el,i)=>{const old=tileMap.get(el.dataset.tileId);return old?{...old,visible:!el.hidden,order:i}:null;}).filter(Boolean).sort((a,b)=>a.order-b.order);return{...state.layout,tiles:tileData,fields:fieldData};"
    if old not in ui_source:
        raise SystemExit('tile persistence marker missing')
    ui_source = ui_source.replace(old, new, 1)
UI_JS.write_text(ui_source, encoding='utf-8')

print('TS3 registered as persistent UI tile')
