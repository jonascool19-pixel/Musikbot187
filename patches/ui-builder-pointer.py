#!/usr/bin/env python3
from pathlib import Path
import re

ROOT = Path('/opt/radiobot')
UI_JS = ROOT / 'frontend/ui-builder.js'

s = UI_JS.read_text(encoding='utf-8')
pattern = re.compile(r"  function initDrag\(\)\{.*?\}\n  async function applyPreset", re.S)
replacement = r'''  function initDrag(){
    const grid=document.querySelector('.grid');
    if(!grid||grid.dataset.builderReady)return;
    grid.dataset.builderReady='1';
    let drag=null;
    function begin(kind,el,e){
      if(!state.editing||e.button!==0)return;
      if(kind==='field'&&e.target.closest('input,select,button,a,textarea'))return;
      e.preventDefault();
      const host=kind==='tile'?el.closest('[data-tile-id]'):el;
      if(!host)return;
      drag={kind,id:kind==='tile'?host.dataset.tileId:el.dataset.fieldId,pointerId:e.pointerId,lastKey:''};
      try{el.setPointerCapture(e.pointerId);}catch{}
      host.classList.add('builder-dragging');
    }
    function move(e){
      if(!drag||drag.pointerId!==e.pointerId)return;
      const under=document.elementFromPoint(e.clientX,e.clientY);
      if(drag.kind==='tile'){
        const source=document.querySelector(`[data-tile-id="${CSS.escape(drag.id)}"]`);
        const target=under?.closest?.('[data-tile-id]');
        if(!source||!target||source===target)return;
        const r=target.getBoundingClientRect();
        const before=e.clientY < r.top+r.height/2;
        const key=`tile:${target.dataset.tileId}:${before?'before':'after'}`;
        if(key===drag.lastKey)return;
        const parent=target.parentElement;
        if(before)parent.insertBefore(source,target);else parent.insertBefore(source,target.nextElementSibling);
        drag.lastKey=key;state.layout.preset='custom';
      }else{
        const source=document.querySelector(`.builder-field[data-field-id="${CSS.escape(drag.id)}"]`);
        const targetField=under?.closest?.('.builder-field');
        const targetZone=under?.closest?.('.builder-field-zone');
        if(!source||!targetZone||targetField===source)return;
        const anchor=targetField||targetZone;
        const r=anchor.getBoundingClientRect();
        const before=Boolean(targetField)&&e.clientY < r.top+r.height/2;
        const key=`field:${targetZone.parentElement?.dataset.tileId||''}:${targetField?.dataset.fieldId||'zone'}:${before?'before':'after'}`;
        if(key===drag.lastKey)return;
        if(targetField&&before)targetZone.insertBefore(source,targetField);
        else if(targetField)targetZone.insertBefore(source,targetField.nextElementSibling);
        else targetZone.appendChild(source);
        drag.lastKey=key;state.layout.preset='custom';
      }
    }
    async function end(e){
      if(!drag||drag.pointerId!==e.pointerId)return;
      const current=drag;
      const host=current.kind==='tile'?document.querySelector(`[data-tile-id="${CSS.escape(current.id)}"]`):document.querySelector(`.builder-field[data-field-id="${CSS.escape(current.id)}"]`);
      host?.classList.remove('builder-dragging');
      drag=null;
      await saveLayout(true);
      renderEditor();
    }
    grid.querySelectorAll('.builder-tile-handle').forEach(handle=>{
      handle.draggable=false;
      handle.addEventListener('pointerdown',e=>begin('tile',handle,e));
      handle.addEventListener('pointermove',move);
      handle.addEventListener('pointerup',end);
      handle.addEventListener('pointercancel',end);
    });
    grid.querySelectorAll('.builder-field').forEach(field=>{
      field.draggable=false;
      field.addEventListener('pointerdown',e=>begin('field',field,e));
      field.addEventListener('pointermove',move);
      field.addEventListener('pointerup',end);
      field.addEventListener('pointercancel',end);
    });
  }
  async function applyPreset'''

new_s, n = pattern.subn(replacement, s, count=1)
if n != 1:
    raise SystemExit('ui-builder initDrag function not found')
UI_JS.write_text(new_s, encoding='utf-8')
print('pointer drag patch applied')
