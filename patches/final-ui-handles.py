#!/usr/bin/env python3
from pathlib import Path
import re

UI_JS = Path('/opt/radiobot/frontend/ui-builder.js')
s = UI_JS.read_text(encoding='utf-8')

pattern = re.compile(r"  function applyTiles\(\)\{.*?\}\n  function fieldCandidates", re.S)
replacement = r'''  function applyTiles(){
    const grid=document.querySelector('.grid');
    if(!grid)return;
    for(const t of state.layout.tiles){
      const el=document.querySelector(`[data-tile-id="${CSS.escape(t.id)}"]`);
      if(!el)continue;
      el.style.gridColumn=`span ${t.span}`;
      el.style.gridRow=`span ${t.rowSpan}`;
      el.hidden=!t.visible;
      el.dataset.icon=t.icon;
      el.dataset.label=t.label;
      const title=el.querySelector('[data-tile-title]');
      if(title&&el.id!=='nowTitle')title.textContent=`${t.icon} ${t.label}`;
      let handle=el.querySelector(':scope > .builder-tile-handle');
      if(!handle){
        handle=document.createElement('button');
        handle.type='button';
        handle.className='builder-tile-handle';
        handle.textContent='☷';
        handle.title='Kachel verschieben';
        handle.setAttribute('aria-label',`Kachel verschieben: ${t.label}`);
        el.insertBefore(handle,el.firstChild);
      }
      handle.hidden=!state.editing;
      handle.draggable=false;
      el.draggable=false;
      el.classList.toggle('builder-selected',state.editing);
      grid.appendChild(el);
    }
  }
  function fieldCandidates'''

s, count = pattern.subn(replacement, s, count=1)
if count != 1:
    raise SystemExit('applyTiles marker missing')

UI_JS.write_text(s, encoding='utf-8')
print('final UI tile handles applied')
