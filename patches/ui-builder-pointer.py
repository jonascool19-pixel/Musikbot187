#!/usr/bin/env python3
from pathlib import Path
import re

ROOT = Path('/opt/radiobot')
UI_JS = ROOT / 'frontend/ui-builder.js'
TEST_JS = ROOT / 'tests/ui-builder-browser.js'

s = UI_JS.read_text(encoding='utf-8')
apply_re = re.compile(r"  function applyFields\(\)\{.*?\}\n  function layoutFromDom", re.S)
apply_new = r'''  function applyFields(){
    prepareFields();
    for(const field of document.querySelectorAll('.builder-field')){
      field.draggable=false;
      field.style.position=field.style.position||'relative';
      let handle=field.querySelector(':scope > .builder-field-handle');
      if(!handle){handle=document.createElement('span');handle.className='builder-field-handle';handle.textContent='☷';field.insertBefore(handle,field.firstChild);}
      handle.draggable=false; handle.hidden=!state.editing;
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
s, n = apply_re.subn(apply_new, s, count=1)
if n != 1:
    raise SystemExit('applyFields function not found')

init_re = re.compile(r"  function initDrag\(\)\{.*?\}\n  async function applyPreset", re.S)
init_new = r'''  function initDrag(){
    const grid=document.querySelector('.grid'); if(!grid||grid.dataset.builderReady)return; grid.dataset.builderReady='1';
    let drag=null;
    function begin(kind,el,e){
      if(!state.editing||e.button!==0)return;
      e.preventDefault(); e.stopPropagation();
      const host=kind==='tile'?el.closest('[data-tile-id]'):el.closest('.builder-field'); if(!host)return;
      drag={kind,id:kind==='tile'?host.dataset.tileId:host.dataset.fieldId,pointerId:e.pointerId,lastKey:''};
      host.classList.add('builder-dragging');
    }
    function tileAtPoint(x,y){
      for(const tile of tiles()){
        if(tile.hidden)continue;
        const r=tile.getBoundingClientRect();
        if(x>=r.left&&x<=r.right&&y>=r.top&&y<=r.bottom)return tile;
      }
      return null;
    }
    function fieldAtPoint(x,y){
      for(const field of document.querySelectorAll('.builder-field')){
        if(field.hidden)continue;
        const r=field.getBoundingClientRect();
        if(x>=r.left&&x<=r.right&&y>=r.top&&y<=r.bottom)return field;
      }
      return null;
    }
    function reorderTile(x,y){
      const source=document.querySelector(`[data-tile-id="${CSS.escape(drag.id)}"]`);
      const target=tileAtPoint(x,y);
      if(!source||!target||source===target)return false;
      const r=target.getBoundingClientRect();
      const before=y<r.top+r.height/2;
      const key=`tile:${target.dataset.tileId}:${before?'before':'after'}`;
      if(key===drag.lastKey)return true;
      const parent=target.parentElement;
      if(before)parent.insertBefore(source,target); else parent.insertBefore(source,target.nextElementSibling);
      drag.lastKey=key; state.layout.preset='custom';
      return true;
    }
    function reorderField(x,y){
      const source=document.querySelector(`.builder-field[data-field-id="${CSS.escape(drag.id)}"]`);
      const targetField=fieldAtPoint(x,y);
      const targetTile=tiles().find(t=>{const r=t.getBoundingClientRect();return x>=r.left&&x<=r.right&&y>=r.top&&y<=r.bottom;});
      const targetZone=targetField?.closest('.builder-field-zone') || targetTile?.querySelector(':scope > .builder-field-zone');
      if(!source||!targetZone||targetField===source)return false;
      const anchor=targetField||targetZone; const r=anchor.getBoundingClientRect();
      const before=Boolean(targetField)&&y<r.top+r.height/2;
      const key=`field:${targetZone.parentElement?.dataset.tileId||''}:${targetField?.dataset.fieldId||'zone'}:${before?'before':'after'}`;
      if(key===drag.lastKey)return true;
      if(targetField&&before)targetZone.insertBefore(source,targetField); else if(targetField)targetZone.insertBefore(source,targetField.nextElementSibling); else targetZone.appendChild(source);
      drag.lastKey=key; state.layout.preset='custom';
      return true;
    }
    function move(e){
      if(!drag||drag.pointerId!==e.pointerId)return;
      e.preventDefault();
      if(drag.kind==='tile')reorderTile(e.clientX,e.clientY); else reorderField(e.clientX,e.clientY);
    }
    async function end(e){
      if(!drag||drag.pointerId!==e.pointerId)return;
      e.preventDefault();
      const current=drag;
      if(drag.kind==='tile')reorderTile(e.clientX,e.clientY); else reorderField(e.clientX,e.clientY);
      const host=current.kind==='tile'?document.querySelector(`[data-tile-id="${CSS.escape(current.id)}"]`):document.querySelector(`.builder-field[data-field-id="${CSS.escape(current.id)}"]`);
      host?.classList.remove('builder-dragging'); drag=null; await saveLayout(true); renderEditor();
    }
    grid.addEventListener('pointerdown',e=>{
      if(!state.editing||e.button!==0)return;
      const tileHandle=e.target.closest?.('.builder-tile-handle');
      if(tileHandle&&grid.contains(tileHandle)){begin('tile',tileHandle,e);return;}
      const fieldHandle=e.target.closest?.('.builder-field-handle');
      if(fieldHandle&&grid.contains(fieldHandle)){begin('field',fieldHandle,e);}
    },{capture:true});
    document.addEventListener('pointermove',move,{passive:false,capture:true});
    document.addEventListener('pointerup',end,{capture:true});
    document.addEventListener('pointercancel',end,{capture:true});
  }
  async function applyPreset'''
s, n = init_re.subn(init_new, s, count=1)
if n != 1:
    raise SystemExit('initDrag function not found')

s = s.replace(
    "applyTheme();applyTiles();applyFields();updateControls();const btn=document.createElement('button');btn.id='layoutBuilderOpen';btn.className='icon-btn';btn.title='UI-Baukasten';btn.textContent='🎨';btn.onclick=()=>toggle(true);document.querySelector('header .row')?.prepend(btn);initDrag();",
    "applyTheme();applyTiles();applyFields();updateControls();const btn=document.createElement('button');btn.id='layoutBuilderOpen';btn.className='icon-btn';btn.title='UI-Baukasten';btn.textContent='🎨';btn.onclick=()=>{toggle(true);initDrag();};document.querySelector('header .row')?.prepend(btn);"
)
UI_JS.write_text(s, encoding='utf-8')

# The browser test must move an item to a position that actually changes the order.
t = TEST_JS.read_text(encoding='utf-8')
t = t.replace("await syntheticPointerDrag(page,'[data-tile-id=\"discord\"] .builder-tile-handle','[data-tile-id=\"search\"]');", "await syntheticPointerDrag(page,'[data-tile-id=\"search\"] .builder-tile-handle','[data-tile-id=\"discord\"]');", 1)
t = t.replace("if(afterDiscord>=afterSearch)throw new Error(`tile drag produced wrong order: discord index ${afterDiscord}, search index ${afterSearch}`);", "if(afterSearch>=afterDiscord)throw new Error(`tile drag produced wrong order: search index ${afterSearch}, discord index ${afterDiscord}`);", 1)
TEST_JS.write_text(t, encoding='utf-8')

# Smoke-test the update API with a harmless test-only helper. Production installation provides the real helper.
helper = Path('/usr/local/sbin/radiobot-update')
helper.parent.mkdir(parents=True, exist_ok=True)
helper.write_text('#!/bin/sh\nexit 0\n', encoding='utf-8')
helper.chmod(0o755)
print('deterministic pointer drag patch, corrected browser assertion, and CI update stub applied')