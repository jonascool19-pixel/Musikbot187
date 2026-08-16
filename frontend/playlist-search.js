(() => {
  const STYLE_ID = 'playlist-search-actions-style';
  let scheduled = false;

  function escapeHtml(value) {
    return String(value ?? '').replace(/[&<>\"']/g, c => ({ '&':'&amp;', '<':'&lt;', '>':'&gt;', '\"':'&quot;', "'":'&#39;' }[c]));
  }

  function addStyle() {
    if (document.getElementById(STYLE_ID)) return;
    const style = document.createElement('style');
    style.id = STYLE_ID;
    style.textContent = '.playlist-search-actions{display:flex;gap:6px;align-items:center}.playlist-search-actions button{min-width:34px}.playlist-search-added{opacity:.65}';
    document.head.appendChild(style);
  }

  async function api(url, options = {}) {
    const response = await fetch(url, { credentials:'include', headers:{'Content-Type':'application/json', ...(options.headers || {})}, ...options });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(data.error || `HTTP ${response.status}`);
    return data;
  }

  async function addResultToPlaylist(input, title, button) {
    try {
      const state = await api('/api/state');
      let playlists = state.playlists || [];
      let selected = '';
      if (!playlists.length) {
        const name = prompt('Name der neuen Playlist');
        if (!name?.trim()) return;
        const playlist = await api('/api/playlist', { method:'POST', body:JSON.stringify({name:name.trim()}) });
        selected = playlist.id;
      } else {
        const choices = playlists.map((p, i) => `${i + 1}: ${p.name}`).join('\n');
        const answer = prompt(`Playlist auswählen:\n${choices}\n\nNummer eingeben oder neue Playlist mit „neu“ erstellen.`);
        if (!answer) return;
        if (answer.trim().toLowerCase() === 'neu') {
          const name = prompt('Name der neuen Playlist');
          if (!name?.trim()) return;
          const playlist = await api('/api/playlist', { method:'POST', body:JSON.stringify({name:name.trim()}) });
          selected = playlist.id;
        } else {
          const index = Number(answer) - 1;
          if (!Number.isInteger(index) || !playlists[index]) throw new Error('Ungültige Playlist-Auswahl.');
          selected = playlists[index].id;
        }
      }
      await api(`/api/playlist/${encodeURIComponent(selected)}/item`, { method:'POST', body:JSON.stringify({input, title}) });
      button.textContent = '✓';
      button.title = 'Zur Playlist hinzugefügt';
      button.classList.add('playlist-search-added');
    } catch (error) {
      alert(error.message);
    }
  }

  function resultData(row) {
    const text = row.querySelector('span')?.textContent?.trim() || '';
    const title = row.querySelector('b')?.textContent?.trim() || text || 'Titel';
    const play = row.querySelector('button[onclick*="playInput"]');
    const match = play?.getAttribute('onclick')?.match(/playInput\((.*)\)/);
    if (match) {
      try { return { input: JSON.parse(match[1]), title }; } catch {}
    }
    return null;
  }

  function enhance(container) {
    if (!container) return;
    container.querySelectorAll('.result-row').forEach(row => {
      if (row.querySelector('.playlist-search-actions')) return;
      const data = resultData(row);
      if (!data) return;
      const play = row.querySelector('button[onclick*="playInput"]');
      if (!play) return;
      const actions = document.createElement('div');
      actions.className = 'playlist-search-actions';
      play.parentElement?.appendChild(actions);
      actions.appendChild(play);
      const plus = document.createElement('button');
      plus.type = 'button';
      plus.textContent = '＋';
      plus.title = 'In Playlist speichern';
      plus.addEventListener('click', () => addResultToPlaylist(data.input, data.title, plus));
      actions.appendChild(plus);
    });
  }

  function schedule() {
    if (scheduled) return;
    scheduled = true;
    queueMicrotask(() => { scheduled = false; addStyle(); enhance(document.getElementById('results')); enhance(document.getElementById('radioResults')); enhance(document.getElementById('spotifyResults')); });
  }

  new MutationObserver(schedule).observe(document.body, { childList:true, subtree:true });
  schedule();
})();
