(() => {
  const DEFAULTS = {
    midnight: { name: 'Midnight', density: 'comfortable', accent: '#7dd3fc', bg: '#070b14', panel: '#111929', tiles: ['hero','discord','search','radio','media','playlists','spotify','youtube','update','queue'] },
    compact: { name: 'Compact', density: 'compact', accent: '#a78bfa', bg: '#0b0b12', panel: '#171321', tiles: ['hero','discord','search','queue','radio','playlists','media','youtube','spotify','update'] },
    studio: { name: 'Studio', density: 'spacious', accent: '#86efac', bg: '#06120d', panel: '#102118', tiles: ['hero','search','queue','radio','media','playlists','discord','youtube','spotify','update'] }
  };
  const tileMeta = {
    hero:['hero','Now Playing','🎵'], discord:['discord','Discord','🎙️'], search:['search','Suche','🔎'], radio:['radio','Radiosender','📻'], media:['media','Lokale Musik','💿'], playlists:['playlists','Playlists','🎵'], spotify:['spotify','Spotify','🟢'], youtube:['youtube','YouTube','▶️'], update:['update','Update','⚙️'], queue:['queue','Queue','📜']
  };
  const state = { layout:null, editing:false, presets:DEFAULTS };
  const $ = s => document.querySelector(s);
  const esc = v => String(v ?? '').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  async function api(url, options={}) { const r=await fetch(url,{headers:{'Content-Type':'application/json',...(options.headers||{})},...options}); if(!r.ok) throw new Error(await r.text()); return r.status===204?null:r.json(); }
  function currentTiles() { return [...document.querySelectorAll('[data-tile-id]')]; }
  function ensureLayout(layout) {
    const source = Array.isArray(layout?.tiles) ? layout.tiles : DEFAULTS.midnight.tiles;
    const byId = new Map(source.map(x=>[x.id||x, typeof x==='string'?{id:x}:x]));
    const order = layout?.preset && DEFAULTS[layout.preset]?.tiles ? DEFAULTS[layout.preset].tiles : DEFAULTS.midnight.tiles;
    return { preset: layout?.preset || 'midnight', name: layout?.name || 'Mein Layout', density: layout?.density || 'comfortable', accent: layout?.accent || '#7dd3fc', bg: layout?.bg || '#070b14', panel: layout?.panel || '#111929', tiles: order.map(id => byId.get(id) || {id, visible:true, span:1, rowSpan:1, icon:tileMeta[id]?.[2], label:tileMeta[id]?.[1]}).map(x=>({visible:x.visible!==false,span:Math.max(1,Math.min(4,Number(x.span)||1)),rowSpan:Math.max(1,Math.min(3,Number(x.rowSpan)||1)),id:x.id,icon:x.icon||tileMeta[x.id]?.[2]||'◼',label:x.label||tileMeta[x.id]?.[1]||x.id})) };
  }
  function applyTheme(layout) {
    document.documentElement.style.setProperty('--builder-accent',layout.accent);
    document.documentElement.style.setProperty('--builder-bg',layout.bg);
    document.documentElement.style.setProperty('--builder-panel',layout.panel);
    const grid=document.querySelector('.grid'); if(grid) grid.dataset.density=layout.density;
    document.body.classList.toggle('builder-editing',state.editing);
  }
  function applyTileConfig(layout) {
    const grid=document.querySelector('.grid');
    layout.tiles.forEach(t=>{
      const el=document.querySelector(`[data-tile-id="${CSS.escape(t.id)}"]`); if(!el) return;
      el.style.gridColumn=`span ${t.span}`; el.style.gridRow=`span ${t.rowSpan}`; el.hidden=!t.visible;
      el.dataset.icon=t.icon; el.dataset.label=t.label;
      const title=el.querySelector('[data-tile-title]'); if(title) title.textContent=`${t.icon} ${t.label}`;
      el.draggable=state.editing; el.classList.toggle('builder-selected',state.editing);
      if(grid) grid.appendChild(el);
    });
  }
  function layoutFromDom() {
    const byId = new Map((state.layout?.tiles||[]).map(t=>[t.id,t]));
    const tiles=currentTiles().map((el,i)=>{ const base=byId.get(el.dataset.tileId)||{}; return {
      ...base, id:el.dataset.tileId, visible:!el.hidden,
      span:parseInt((el.style.gridColumn||'span 1').match(/\d+/)?.[0]||'1',10), rowSpan:parseInt((el.style.gridRow||'span 1').match(/\d+/)?.[0]||'1',10),
      icon:el.dataset.icon||base.icon||tileMeta[el.dataset.tileId]?.[2]||'◼', label:el.dataset.label||base.label||tileMeta[el.dataset.tileId]?.[1]||el.dataset.tileId, order:i
    }; });
    return {...state.layout, tiles};
  }
  async function saveLayout(silent=false) {
    state.layout=layoutFromDom();
    await api('/api/ui/layout',{method:'PUT',body:JSON.stringify(state.layout)});
    if(!silent) window.dispatchEvent(new CustomEvent('rb:toast',{detail:'Layout gespeichert.'}));
  }
  function makeBuilderControls() {
    if($('#builderPanel')) return;
    const panel=document.createElement('aside'); panel.id='builderPanel'; panel.className='builder-panel';
    panel.innerHTML=`<div class="builder-head"><div><strong>🎨 UI-Baukasten</strong><small>Ziehe Kacheln, ändere Größe und speichere dein Layout.</small></div><button id="builderClose" class="icon-btn">×</button></div>
      <div class="builder-section"><b>Standard-Designs</b><div class="builder-presets"><button data-preset="midnight">🌌 Midnight</button><button data-preset="compact">▦ Compact</button><button data-preset="studio">🎚️ Studio</button></div></div>
      <div class="builder-section"><label>Layout-Name<input id="builderName" placeholder="Mein Dashboard"></label><div class="row"><label>Dichte<select id="builderDensity"><option value="compact">Kompakt</option><option value="comfortable">Komfortabel</option><option value="spacious">Großzügig</option></select></label></div><div class="row"><label>Akzent<input id="builderAccent" type="color"></label><label>Hintergrund<input id="builderBg" type="color"></label><label>Kacheln<input id="builderPanelColor" type="color"></label></div></div>
      <div class="builder-section"><b>Kachel bearbeiten</b><small class="muted">Klicke eine Kachel an, um Icon, Name, Sichtbarkeit und Größe zu ändern.</small><div id="builderTileList"></div></div>
      <div class="builder-actions"><button id="builderSave" class="primary">Speichern</button><button id="builderReset">Standard wiederherstellen</button><button id="builderExit">Bearbeiten beenden</button></div>`;
    document.body.append(panel);
    $('#builderClose').onclick=$('#builderExit').onclick=()=>toggle(false);
    $('#builderSave').onclick=()=>saveLayout();
    $('#builderReset').onclick=()=>applyPreset('midnight');
    document.querySelectorAll('[data-preset]').forEach(b=>b.onclick=()=>applyPreset(b.dataset.preset));
    ['builderName','builderDensity','builderAccent','builderBg','builderPanelColor'].forEach(id=>$('#'+id).addEventListener('input',syncControls));
  }
  function syncControls() {
    if(!state.layout) return;
    state.layout.name=$('#builderName').value||'Mein Dashboard'; state.layout.density=$('#builderDensity').value; state.layout.accent=$('#builderAccent').value; state.layout.bg=$('#builderBg').value; state.layout.panel=$('#builderPanelColor').value; state.layout.preset='custom'; applyTheme(state.layout);
  }
  function renderTileEditor() {
    const list=$('#builderTileList'); if(!list||!state.layout) return; list.innerHTML='';
    state.layout.tiles.forEach(t=>{
      const row=document.createElement('div'); row.className='builder-tile-row'; row.innerHTML=`<div class="builder-tile-main"><span class="drag">☷</span><span class="tile-mini">${esc(t.icon)}</span><input class="tile-label" value="${esc(t.label)}" maxlength="40"><button class="icon-btn tile-visible">${t.visible?'👁️':'🚫'}</button></div><div class="builder-tile-sub"><input class="tile-icon" value="${esc(t.icon)}" maxlength="4" title="Icon"><label>Breite<select class="tile-span"><option value="1" ${t.span===1?'selected':''}>1</option><option value="2" ${t.span===2?'selected':''}>2</option><option value="3" ${t.span===3?'selected':''}>3</option><option value="4" ${t.span===4?'selected':''}>4</option></select></label><label>Höhe<select class="tile-rowspan"><option value="1" ${t.rowSpan===1?'selected':''}>1</option><option value="2" ${t.rowSpan===2?'selected':''}>2</option><option value="3" ${t.rowSpan===3?'selected':''}>3</option></select></label><button class="danger tile-remove">Ausblenden</button></div>`;
      row.querySelector('.tile-label').oninput=e=>{t.label=e.target.value; state.layout.preset='custom'; applyTileConfig(state.layout);};
      row.querySelector('.tile-icon').oninput=e=>{t.icon=e.target.value||'◼'; state.layout.preset='custom'; applyTileConfig(state.layout);};
      row.querySelector('.tile-span').onchange=e=>{t.span=Number(e.target.value); state.layout.preset='custom'; applyTileConfig(state.layout);};
      row.querySelector('.tile-rowspan').onchange=e=>{t.rowSpan=Number(e.target.value); state.layout.preset='custom'; applyTileConfig(state.layout);};
      row.querySelector('.tile-visible').onclick=()=>{t.visible=!t.visible; state.layout.preset='custom'; renderTileEditor(); applyTileConfig(state.layout);};
      row.querySelector('.tile-remove').onclick=()=>{t.visible=false; state.layout.preset='custom'; renderTileEditor(); applyTileConfig(state.layout);};
      list.append(row);
    });
  }
  function updateControls() { $('#builderName').value=state.layout.name; $('#builderDensity').value=state.layout.density; $('#builderAccent').value=state.layout.accent; $('#builderBg').value=state.layout.bg; $('#builderPanelColor').value=state.layout.panel; renderTileEditor(); }
  function initDrag() {
    const grid=document.querySelector('.grid'); if(!grid || grid.dataset.builderReady) return; grid.dataset.builderReady='1';
    let dragId=null;
    grid.addEventListener('dragstart',e=>{ if(!state.editing) return; const card=e.target.closest('[data-tile-id]'); if(!card) return; dragId=card.dataset.tileId; card.classList.add('builder-dragging'); });
    grid.addEventListener('dragend',e=>{ const card=e.target.closest('[data-tile-id]'); card?.classList.remove('builder-dragging'); dragId=null; });
    grid.addEventListener('dragover',e=>{ if(!state.editing||!dragId) return; e.preventDefault(); const card=e.target.closest('[data-tile-id]'); if(card&&card.dataset.tileId!==dragId) card.classList.add('builder-drop-target'); });
    grid.addEventListener('dragleave',e=>e.target.closest('[data-tile-id]')?.classList.remove('builder-drop-target'));
    grid.addEventListener('drop',async e=>{ if(!state.editing||!dragId) return; e.preventDefault(); const target=e.target.closest('[data-tile-id]'); if(!target||target.dataset.tileId===dragId) return; const source=document.querySelector(`[data-tile-id="${CSS.escape(dragId)}"]`); target.classList.remove('builder-drop-target'); target.parentElement.insertBefore(source,target); state.layout.preset='custom'; await saveLayout(true); renderTileEditor(); });
  }
  async function applyPreset(key) { const p=DEFAULTS[key]||DEFAULTS.midnight; state.layout=ensureLayout({preset:key,name:p.name,density:p.density,accent:p.accent,bg:p.bg,panel:p.panel,tiles:p.tiles}); applyTheme(state.layout); applyTileConfig(state.layout); updateControls(); await saveLayout(true); }
  async function toggle(on) { makeBuilderControls(); state.editing=on; document.body.classList.toggle('builder-editing',on); $('#builderPanel').classList.toggle('open',on); if(on){ initDrag(); updateControls(); } else { await saveLayout(true); } }
  async function load() {
    try { state.layout=ensureLayout(await api('/api/ui/layout')); } catch { state.layout=ensureLayout(null); }
    applyTheme(state.layout); makeBuilderControls(); applyTileConfig(state.layout);
    const btn=document.createElement('button'); btn.id='layoutBuilderOpen'; btn.className='icon-btn'; btn.title='UI-Baukasten'; btn.textContent='🎨'; btn.onclick=()=>toggle(true); document.querySelector('header .row')?.prepend(btn);
    initDrag();
  }
  window.RB_UI_BUILDER={open:()=>toggle(true),close:()=>toggle(false),preset:applyPreset};
  window.addEventListener('DOMContentLoaded',load);
})();
