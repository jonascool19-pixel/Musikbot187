#!/usr/bin/env python3
from pathlib import Path
import re

ROOT = Path('/opt/radiobot')
UI_JS = ROOT / 'frontend/ui-builder.js'

s = UI_JS.read_text(encoding='utf-8')
apply_re = re.compile(r"  function applyFields\(\)\{.*?\}\n  function layoutFromDom", re.S)
apply_new = r'''  function applyFields(){
    prepareFields();
    for(const field of document.querySelectorAll('.builder-field')){
      field.draggable=false;
      field.style.position=field.style.position||'relative';
      let handle=field.querySelector(':scope > .builder-field-handle');
      if(!handle){
        handle=document.createElement('span');
        handle.className='builder-field-handle';
        handle.textContent='☷';
        field.insertBefore(handle,field.firstChild);
      }
      handle.draggable=false;
      handle.hidden=!state.editing;
    }
    const byId=new Map([...document.querySelectorAll('.builder-field')].map(el=>[el.dataset.fieldId,el]));
    const zones=new Map(tiles().map(t=>[t.dataset.tileId,t.querySelector(':scope > .builder-field-zone')]));
    for(const f of [...state.layout.fields].sort((a,b)=>a.order-b.order)){
      const el=byId.get(f.id); const zone=zones.get(f.tileId); if(!el||!zone)continue;
      zone.appendChild(el); el.hidden=f.visible===false;
      el.style.gridColumn=`span ${clamp(f.span,1,4)}`; el.style.gridRow=`span ${clamp(f.rowSpan,1,3)}`;
      el.classList.toggle('builder-field-editing',state.editing);
      const handle=el.querySelector(':scope > .builder-field-handle'); if(handle)handle.hidden=!state.editing;
    }
  }
  function layoutFromDom'''
new_s,n=apply_re.subn(apply_new,s,count=1)
if n!=1: raise SystemExit('applyFields function not found')
s=new_s
init_re = re.compile(r"  function initDrag\(\)\{.*?\}\n  async function applyPreset", re.S)
init_new = r'''  function initDrag(){
    const grid=document.querySelector('.grid');
    if(!grid||grid.dataset.builderReady)return;
    grid.dataset.builderReady='1';
    let drag=null;
    function begin(kind,el,e){
      if(!state.editing||e.button!==0)return;
      e.preventDefault(); e.stopPropagation();
      const host=kind==='tile'?el.closest('[data-tile-id]'):el.closest('.builder-field');
      if(!host)return;
      drag={kind,id:kind==='tile'?host.dataset.tileId:host.dataset.fieldId,pointerId:e.pointerId,lastKey:''};
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
        const r=target.getBoundingClientRect(); const before=e.clientY<r.top+r.height/2;
        const key=`tile:${target.dataset.tileId}:${before?'before':'after'}`; if(key===drag.lastKey)return;
        const parent=target.parentElement; if(before)parent.insertBefore(source,target);else parent.insertBefore(source,target.nextElementSibling);
        drag.lastKey=key;state.layout.preset='custom';
      }else{
        const source=document.querySelector(`.builder-field[data-field-id="${CSS.escape(drag.id)}"]`);
        const targetField=under?.closest?.('.builder-field'); const targetZone=under?.closest?.('.builder-field-zone');
        if(!source||!targetZone||targetField===source)return;
        const anchor=targetField||targetZone; const r=anchor.getBoundingClientRect();
        const before=Boolean(targetField)&&e.clientY<r.top+r.height/2;
        const key=`field:${targetZone.parentElement?.dataset.tileId||''}:${targetField?.dataset.fieldId||'zone'}:${before?'before':'after'}`; if(key===drag.lastKey)return;
        if(targetField&&before)targetZone.insertBefore(source,targetField); else if(targetField)targetZone.insertBefore(source,targetField.nextElementSibling); else targetZone.appendChild(source);
        drag.lastKey=key;state.layout.preset='custom';
      }
    }
    async function end(e){
      if(!drag||drag.pointerId!==e.pointerId)return;
      const current=drag; const host=current.kind==='tile'?document.querySelector(`[data-tile-id="${CSS.escape(current.id)}"]`):document.querySelector(`.builder-field[data-field-id="${CSS.escape(current.id)}"]`);
      host?.classList.remove('builder-dragging'); drag=null; await saveLayout(true); renderEditor();
    }
    grid.querySelectorAll('.builder-tile-handle').forEach(handle=>{
      handle.draggable=false; handle.addEventListener('pointerdown',e=>begin('tile',handle,e)); handle.addEventListener('pointermove',move); handle.addEventListener('pointerup',end); handle.addEventListener('pointercancel',end);
    });
    grid.querySelectorAll('.builder-field-handle').forEach(handle=>{
      handle.draggable=false; handle.addEventListener('pointerdown',e=>begin('field',handle,e)); handle.addEventListener('pointermove',move); handle.addEventListener('pointerup',end); handle.addEventListener('pointercancel',end);
    });
  }
  async function applyPreset'''
new_s,n=init_re.subn(init_new,s,count=1)
if n!=1: raise SystemExit('initDrag function not found')
UI_JS.write_text(new_s,encoding='utf-8')
print('pointer drag + field handle patch applied')
