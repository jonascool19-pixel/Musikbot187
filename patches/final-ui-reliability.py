#!/usr/bin/env python3
from pathlib import Path
import re

ROOT = Path('/opt/radiobot')
INDEX = ROOT / 'frontend/index.html'
APP = ROOT / 'frontend/app.js'
UI = ROOT / 'frontend/ui-builder.js'

# Ensure UI-builder assets are loaded exactly once.
html = INDEX.read_text(encoding='utf-8')
html = re.sub(r'<link[^>]+href=["\']/ui-builder\.css["\'][^>]*>\s*', '', html)
html = html.replace('<link rel="stylesheet" href="/style.css">', '<link rel="stylesheet" href="/style.css"><link rel="stylesheet" href="/ui-builder.css">', 1)
html = re.sub(r'<script[^>]+src=["\']/ui-builder\.js["\'][^>]*></script>\s*', '', html)
html = html.replace('</body>', '<script src="/ui-builder.js"></script></body>', 1)
INDEX.write_text(html, encoding='utf-8')

# Keep the dashboard alive even while older layouts are missing optional queue elements.
s = APP.read_text(encoding='utf-8')
if "const queueEl = $('#queue'); const queueLabelEl = $('#queueInstanceLabel'); if (!queueEl) return;" not in s:
    s = s.replace(
        "async function loadQueue() {\n",
        "async function loadQueue() {\n  const queueEl = $('#queue'); const queueLabelEl = $('#queueInstanceLabel'); if (!queueEl) return;\n",
        1,
    )
    s = s.replace("$('#queue').innerHTML = state.queue?.length ?", "queueEl.innerHTML = state.queue?.length ?", 1)
    s = s.replace("$('#queueInstanceLabel').textContent = 'TeamSpeak 3';", "if (queueLabelEl) queueLabelEl.textContent = 'TeamSpeak 3';", 1)
    s = s.replace("$('#queue').innerHTML = q.length ?", "queueEl.innerHTML = q.length ?", 1)
    s = s.replace("$('#queueInstanceLabel').textContent = 'Discord';", "if (queueLabelEl) queueLabelEl.textContent = 'Discord';", 1)
APP.write_text(s, encoding='utf-8')

# ui-builder.js may be loaded more than once by patched trees; do not create a second toolbar button.
s = UI.read_text(encoding='utf-8')
needle = "async function load(){try{state.layout=ensureLayout(await api('/api/ui/layout'));}catch{state.layout=ensureLayout(null);}makeBuilderControls();applyTheme();prepareFields();applyTiles();applyFields();updateControls();const btn=document.createElement('button');"
if needle in s:
    s = s.replace(needle, "async function load(){if(document.querySelector('#layoutBuilderOpen'))return;try{state.layout=ensureLayout(await api('/api/ui/layout'));}catch{state.layout=ensureLayout(null);}makeBuilderControls();applyTheme();prepareFields();applyTiles();applyFields();updateControls();const btn=document.createElement('button');", 1)
elif "async function load(){if(document.querySelector('#layoutBuilderOpen'))return;" not in s:
    raise SystemExit('ui builder load marker missing')
UI.write_text(s, encoding='utf-8')
print('final UI reliability patch applied')
