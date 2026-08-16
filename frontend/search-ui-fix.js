(() => {
  const safeApi = async (url, options = {}) => {
    const response = await fetch(url, { credentials: 'include', headers: { 'Content-Type': 'application/json', ...(options.headers || {}) }, ...options });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(data.error || `HTTP ${response.status}`);
    return data;
  };
  const escapeHtml = value => String(value ?? '').replace(/[&<>\"']/g, c => ({ '&':'&amp;', '<':'&lt;', '>':'&gt;', '\"':'&quot;', "'":'&#39;' }[c]));
  const renderRows = (rows, container, kind) => {
    container.innerHTML = rows.map((item, index) => {
      const input = kind === 'spotify' ? item.search : item.url;
      const title = kind === 'radio' ? (item.name || item.title || 'Radio') : (item.title || 'Titel');
      const meta = kind === 'spotify' ? (item.artist || '') : (item.artist || item.country || item.tags || '');
      return `<div class="result-row" data-input="${escapeHtml(input)}" data-title="${escapeHtml(title)}"><div><b>${escapeHtml(title)}</b><span>${escapeHtml(meta)}</span></div><div class="result-actions"><button type="button" data-action="play">▶</button><button type="button" data-action="playlist">＋</button></div></div>`;
    }).join('') || '<div class="empty">Keine Treffer.</div>';
  };
  const search = async (event, url, container, kind) => {
    event.preventDefault();
    const query = new FormData(event.currentTarget).get('q');
    try {
      const rows = await safeApi(`${url}${encodeURIComponent(query)}`);
      renderRows(rows, container, kind);
    } catch (error) { window.notify?.(error.message, 'error'); }
  };
  window.searchMedia = event => search(event, '/api/search?q=', document.getElementById('results'), 'media');
  window.searchRadio = event => search(event, '/api/radio/search?q=', document.getElementById('radioResults'), 'radio');
  window.searchSpotify = event => search(event, '/api/spotify/search?q=', document.getElementById('spotifyResults'), 'spotify');
  document.addEventListener('click', async event => {
    const button = event.target instanceof Element ? event.target.closest('[data-action]') : null;
    if (!button) return;
    const row = button.closest('.result-row');
    if (!row) return;
    const input = row.dataset.input || '';
    const title = row.dataset.title || 'Titel';
    event.preventDefault();
    event.stopPropagation();
    try {
      button.disabled = true;
      if (button.dataset.action === 'play') {
        await safeApi('/api/play', { method: 'POST', body: JSON.stringify({ input, playNow: true }) });
        window.notify?.('Wiedergabe gestartet.', 'success');
      } else {
        const state = await safeApi('/api/state');
        const lists = Array.isArray(state.playlists) ? state.playlists : [];
        let id = '';
        if (!lists.length) {
          const name = prompt('Name der neuen Playlist');
          if (!name?.trim()) return;
          id = (await safeApi('/api/playlist', { method: 'POST', body: JSON.stringify({ name: name.trim() }) })).id;
        } else {
          const answer = prompt(`Playlist auswählen:\n${lists.map((p,i)=>`${i+1}: ${p.name}`).join('\n')}\n\nNummer oder „neu“:`);
          if (!answer) return;
          if (answer.trim().toLowerCase() === 'neu') {
            const name = prompt('Name der neuen Playlist');
            if (!name?.trim()) return;
            id = (await safeApi('/api/playlist', { method: 'POST', body: JSON.stringify({ name: name.trim() }) })).id;
          } else {
            const index = Number(answer) - 1;
            if (!Number.isInteger(index) || !lists[index]) throw new Error('Ungültige Playlist-Auswahl.');
            id = lists[index].id;
          }
        }
        await safeApi(`/api/playlist/${encodeURIComponent(id)}/item`, { method: 'POST', body: JSON.stringify({ input, title }) });
        button.textContent = '✓';
        button.title = 'Zur Playlist hinzugefügt';
      }
    } catch (error) { window.notify?.(error.message, 'error'); }
    finally { button.disabled = false; }
  }, true);
})();
