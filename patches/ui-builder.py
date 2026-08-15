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

# ... existing patch content is preserved by editing only the order selection below.
replace_once(UI_JS,
    "const order=DEFAULTS[l.preset]?.tiles||DEFAULTS.midnight.tiles;",
    "const order=(l.preset==='custom'&&source.length)?source.map(x=>x.id||x):((DEFAULTS[l.preset]?.tiles)||DEFAULTS.midnight.tiles);",
    'custom tile order')
print('custom tile order persistence patch applied')
