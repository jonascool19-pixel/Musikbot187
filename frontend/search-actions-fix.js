(() => {
  const ACTIONS = 'search-actions-fix';
  const api = (url, options = {}) => fetch(url, { credentials:'include', headers:{'Content-Type':'application/json', ...(options.headers || {})}, ...options }).then(async r => { const d=await r.json().catch(()=>({})); if(!r.ok) throw new Error(d.error || `HTTP ${r.status}`); return d; });
  const inputFrom = row => {
    const button = row.querySelector('button[onclick]');
    const attr = button?.getAttribute('onclick') || '';
    const match = attr.match(/playInput\((.*)\)/);
    if (match) { try { return JSON.parse(match[1]); } catch {} }
    return row.getAttribute('data-input') || row.querySelector('[data-url]')?.getAttribute('data-url') || '';
  };
  const titleFrom = row => row.querySelector('b')?.textContent?.trim() || row.querySelector('span')?.textContent?.trim() || 'Titel';
  async function play(row, button) {
    const input = inputFrom(row); if (!input) return;
    try { button.disabled = true; await api('/api/play',{method:'POST',body:JSON.stringify({input,playNow:true})}); window.notify?.('Wiedergabe gestartet.','success'); } catch(e) { window.notify?.(e?.message || String(e),'error'); } finally { button.disabled=false; }
  }
  async function playlist(row, button) {
    const input = inputFrom(row); if (!input) return;
    try {
      const state = await api('/api/state'); const lists = Array.isArray(state.playlists) ? state.playlists : [];
      let id='';
      if (!lists.length) { const n=prompt('Name der neuen Playlist'); if(!n?.trim()) return; id=(await api('/api/playlist',{method:'POST',body:JSON.stringify({name:n.trim()})})).id; }
      else { const answer=prompt(`Playlist auswählen:\n${lists.map((p,i)=>`${i+1}: ${p.name}`).join('\n')}\n\nNummer oder „neu“:`); if(!answer) return; if(answer.trim().toLowerCase()==='neu'){const n=prompt('Name der neuen Playlist'); if(!n?.trim())return; id=(await api('/api/playlist',{method:'POST',body:JSON.stringify({name:n.trim()})})).id;} else {const i=Number(answer)-1; if(!Number.isInteger(i)||!lists[i]) throw new Error('Ungültige Playlist-Auswahl.'); id=lists[i].id;}}
      await api(`/api/playlist/${encodeURIComponent(id)}/item`,{method:'POST',body:JSON.stringify({input,title:titleFrom(row)})}); button.textContent='✓'; button.title='Zur Playlist hinzugefügt';
    } catch(e) { window.notify?.(e?.message || String(e),'error'); }
  }
  function enhance() {
    document.querySelectorAll('.result-row').forEach(row=>{
      if (row.querySelector('.'+ACTIONS)) return;
      const playButton=row.querySelector('button[onclick]'); if(!playButton || !inputFrom(row)) return;
      const wrap=document.createElement('div'); wrap.className=ACTIONS; wrap.style.cssText='display:flex;gap:6px;align-items:center';
      playButton.removeAttribute('onclick'); playButton.parentElement?.appendChild(wrap); wrap.appendChild(playButton);
      playButton.addEventListener('click',e=>{e.preventDefault();e.stopPropagation();void play(row,playButton);});
      const plus=document.createElement('button'); plus.type='button'; plus.textContent='＋'; plus.title='In Playlist speichern'; plus.addEventListener('click',e=>{e.preventDefault();e.stopPropagation();void playlist(row,plus);}); wrap.appendChild(plus);
    });
  }
  new MutationObserver(enhance).observe(document.body,{childList:true,subtree:true});
  document.addEventListener('click',e=>{ const t=e.target instanceof Element ? e.target.closest('.result-row button[onclick]') : null; if(!t) return; e.preventDefault(); e.stopImmediatePropagation(); const row=t.closest('.result-row'); if(row) void play(row,t); }, true);
  enhance();
})();
