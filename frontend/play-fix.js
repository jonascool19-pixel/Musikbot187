(() => {
  const STYLE_ID = 'media-result-actions-style';
  let scheduled = false;

  const escAttr = value => String(value ?? '').replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

  async function apiLocal(url, options = {}) {
    const response = await fetch(url, {
      credentials: 'include',
      headers: { 'Content-Type': 'application/json', ...(options.headers || {}) },
      ...options
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(data.error || `HTTP ${response.status}`);
    return data;
  }

  function addStyle() {
    if (document.getElementById(STYLE_ID)) return;
    const style = document.createElement('style');
    style.id = STYLE_ID;
    style.textContent = '.media-result-actions{display:flex;gap:6px;align-items:center}.media-result-actions button{min-width:34px}.media-result-actions .playlist-added{opacity:.65}';
    document.head.appendChild(style);
  }

  function resultData(row) {
    const play = row.querySelector('button[onclick*="playInput"]');
    if (!play) return null;
    const source = play.getAttribute('onclick') || '';
    const match = source.match(/playInput\((.*)\)/);
    if (!match) return null;
    let input;
    try { input = JSON.parse(match[1]); } catch { return null; }
    const title = row.querySelector('b')?.textContent?.trim() || 'Titel';
    return { input, title, play };
  }

  async function playNow(input) {
    await apiLocal('/api/play', {
      method: 'POST',
      body: JSON.stringify({ input, playNow: true })
    });
    if (typeof notify === 'function') notify('Wiedergabe gestartet.', 'success');
    if (typeof load === 'function') await load();
  }

  async function addToPlaylist(input, title, button) {
    const state = await apiLocal('/api/state');
    const playlists = state.playlists || [];
    let selected = '';
    if (!playlists.length) {
      const name = prompt('Name der neuen Playlist');
      if (!name?.trim()) return;
      const playlist = await apiLocal('/api/playlist', { method: 'POST', body: JSON.stringify({ name: name.trim() }) });
      selected = playlist.id;
    } else {
      const choices = playlists.map((p, i) => `${i + 1}: ${p.name}`).join('\n');
      const answer = prompt(`Playlist auswählen:\n${choices}\n\nNummer eingeben oder „neu“ für eine neue Playlist.`);
      if (!answer) return;
      if (answer.trim().toLowerCase() === 'neu') {
        const name = prompt('Name der neuen Playlist');
        if (!name?.trim()) return;
        const playlist = await apiLocal('/api/playlist', { method: 'POST', body: JSON.stringify({ name: name.trim() }) });
        selected = playlist.id;
      } else {
        const index = Number(answer) - 1;
        if (!Number.isInteger(index) || !playlists[index]) throw new Error('Ungültige Playlist-Auswahl.');
        selected = playlists[index].id;
      }
    }
    await apiLocal(`/api/playlist/${encodeURIComponent(selected)}/item`, {
      method: 'POST',
      body: JSON.stringify({ input, title })
    });
    button.textContent = '✓';
    button.title = 'Zur Playlist hinzugefügt';
    button.classList.add('playlist-added');
  }

  function enhance(container) {
    if (!container) return;
    container.querySelectorAll('.result-row').forEach(row => {
      if (row.querySelector('.media-result-actions')) return;
      const data = resultData(row);
      if (!data) return;
      const actions = document.createElement('div');
      actions.className = 'media-result-actions';
      data.play.replaceWith(actions);
      actions.appendChild(data.play);
      const plus = document.createElement('button');
      plus.type = 'button';
      plus.textContent = '＋';
      plus.title = 'In Playlist speichern';
      plus.addEventListener('click', event => {
        event.preventDefault();
        event.stopPropagation();
        addToPlaylist(data.input, data.title, plus).catch(error => {
          if (typeof notify === 'function') notify(error?.message || String(error), 'error');
          else alert(error?.message || String(error));
        });
      });
      actions.appendChild(plus);
    });
  }

  function enhanceAll() {
    addStyle();
    enhance(document.getElementById('results'));
    enhance(document.getElementById('radioResults'));
    enhance(document.getElementById('spotifyResults'));
  }

  document.addEventListener('click', event => {
    const button = event.target instanceof Element ? event.target.closest('.result-row button') : null;
    if (!button) return;
    const row = button.closest('.result-row');
    if (!row) return;
    const data = resultData(row);
    if (!data) return;
    if (button.textContent?.trim() !== '▶') return;
    event.preventDefault();
    event.stopImmediatePropagation();
    playNow(data.input).catch(error => {
      if (typeof notify === 'function') notify(error?.message || String(error), 'error');
      else alert(error?.message || String(error));
    });
  }, true);

  new MutationObserver(() => {
    if (scheduled) return;
    scheduled = true;
    queueMicrotask(() => {
      scheduled = false;
      enhanceAll();
    });
  }).observe(document.body, { childList: true, subtree: true });

  enhanceAll();
})();
