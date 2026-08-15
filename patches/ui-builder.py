#!/usr/bin/env python3
from pathlib import Path

ROOT = Path('/opt/radiobot')
BACKEND = ROOT / 'backend/src/index.ts'
INDEX = ROOT / 'frontend/index.html'

def replace_once(path, old, new, label):
    s = path.read_text(encoding='utf-8')
    if old in s:
        s = s.replace(old, new, 1)
    elif new not in s:
        raise SystemExit(f'missing UI builder marker: {label}')
    path.write_text(s, encoding='utf-8')

replace_once(
    BACKEND,
    "const UPDATE_LOG = path.join(DATA_DIR, 'update.status');",
    "const UPDATE_LOG = path.join(DATA_DIR, 'update.status');\nconst UI_LAYOUT_FILE = path.join(DATA_DIR, 'ui-layout.json');",
    'ui layout path',
)
replace_once(
    BACKEND,
    "type SpotifyState = { accessToken?: string; refreshToken?: string; expiresAt?: number; displayName?: string };",
    "type SpotifyState = { accessToken?: string; refreshToken?: string; expiresAt?: number; displayName?: string };\ntype UiTile = { id: string; visible: boolean; span: number; rowSpan: number; icon: string; label: string };\ntype UiLayout = { preset: string; name: string; density: 'compact' | 'comfortable' | 'spacious'; accent: string; bg: string; panel: string; tiles: UiTile[] };",
    'ui types',
)
marker = "const spotify = loadJson<SpotifyState>(SPOTIFY_FILE, {});"
insert = "const spotify = loadJson<SpotifyState>(SPOTIFY_FILE, {});\nconst DEFAULT_UI_TILES: UiTile[] = ['hero','discord','search','radio','media','playlists','spotify','youtube','update','queue'].map(id => ({ id, visible: true, span: 1, rowSpan: 1, icon: '◼', label: id }));\nconst uiLayout: UiLayout = loadJson<UiLayout>(UI_LAYOUT_FILE, { preset: 'midnight', name: 'Mein Dashboard', density: 'comfortable', accent: '#7dd3fc', bg: '#070b14', panel: '#111929', tiles: DEFAULT_UI_TILES });\nif (!Array.isArray(uiLayout.tiles)) uiLayout.tiles = DEFAULT_UI_TILES;"
replace_once(BACKEND, marker, insert, 'ui layout state')

route_marker = "app.get('/api/health', async () => ({ ok: true, discord: client.isReady(), version: '2.0.0', youtube: fs.existsSync(YTDLP), spotify: Boolean(spotify.refreshToken) }));"
route_new = route_marker + "\napp.get('/api/ui/layout', async () => uiLayout);\napp.put<{ Body: UiLayout }>('/api/ui/layout', async req => { const b = req.body ?? ({} as UiLayout); if (!Array.isArray(b.tiles) || b.tiles.length > 32) throw new Error('Ungültiges UI-Layout.'); const allowed = new Set(DEFAULT_UI_TILES.map(t => t.id)); const seen = new Set<string>(); const tiles: UiTile[] = []; for (const raw of b.tiles) { const id = String(raw.id ?? ''); if (!allowed.has(id) || seen.has(id)) continue; seen.add(id); tiles.push({ id, visible: raw.visible !== false, span: Math.max(1, Math.min(4, Number(raw.span) || 1)), rowSpan: Math.max(1, Math.min(3, Number(raw.rowSpan) || 1)), icon: String(raw.icon ?? '◼').slice(0, 8), label: String(raw.label ?? id).trim().slice(0, 40) || id }); } for (const def of DEFAULT_UI_TILES) if (!seen.has(def.id)) tiles.push(def); uiLayout.preset = String(b.preset ?? 'custom').slice(0, 24); uiLayout.name = String(b.name ?? 'Mein Dashboard').slice(0, 60); uiLayout.density = (['compact','comfortable','spacious'].includes(String(b.density)) ? String(b.density) : 'comfortable') as UiLayout['density']; uiLayout.accent = /^#[0-9a-f]{6}$/i.test(String(b.accent)) ? String(b.accent) : '#7dd3fc'; uiLayout.bg = /^#[0-9a-f]{6}$/i.test(String(b.bg)) ? String(b.bg) : '#070b14'; uiLayout.panel = /^#[0-9a-f]{6}$/i.test(String(b.panel)) ? String(b.panel) : '#111929'; uiLayout.tiles = tiles; saveJson(UI_LAYOUT_FILE, uiLayout); return uiLayout; });"
replace_once(BACKEND, route_marker, route_new, 'ui routes')

replace_once(
    INDEX,
    '<script src="/setup-wizard.js"></script></body>',
    '<script src="/setup-wizard.js"></script><script src="/ui-builder.js"></script></body>',
    'builder script',
)
print('ui builder patch applied')
