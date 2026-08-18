(() => {
  const api = async (path, options = {}) => {
    const token = window.MusikBotFetch?.getAuth?.();
    const headers = new Headers(options.headers || {});
    if (token && !headers.has('Authorization')) headers.set('Authorization', token);
    const response = await fetch(path, { ...options, headers });
    const body = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(body.error || `HTTP ${response.status}`);
    return body;
  };

  async function addCurrentToPlaylist(item) {
    if (!item?.url) throw new Error('Aktuell läuft kein Titel.');
    const playlists = await api('/api/playlists');
    if (!Array.isArray(playlists) || !playlists.length) throw new Error('Keine Playlist vorhanden.');
    const text = playlists.map((playlist, index) => `${index + 1}: ${playlist.name}`).join('\n');
    const answer = window.prompt(`Playlist auswählen:\n${text}\n\nNummer:`);
    if (answer === null) return;
    const index = Number(answer) - 1;
    if (!Number.isInteger(index) || !playlists[index]) throw new Error('Ungültige Playlist-Auswahl.');
    await api(`/api/playlists/${playlists[index].id}/items`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        items: [{
          id: item.id || `${Date.now()}`,
          title: item.title || item.url,
          url: item.url,
          source: item.source || '',
          artist: item.artist || ''
        }]
      })
    });
    const notice = document.querySelector('#notice');
    if (notice) {
      notice.textContent = `„${item.title || item.url}“ zu „${playlists[index].name}“ hinzugefügt.`;
      notice.classList.add('show');
      window.setTimeout(() => notice.classList.remove('show'), 3000);
    }
  }

  function addButton() {
    const now = document.querySelector('.now');
    if (!now || now.querySelector('[data-current-playlist]')) return;
    const text = now.querySelector('strong')?.textContent?.trim();
    if (!text || text === 'Nichts läuft') return;
    const button = document.createElement('button');
    button.type = 'button';
    button.dataset.currentPlaylist = '1';
    button.textContent = '＋ Playlist';
    button.title = 'Aktuellen Titel zu einer Playlist hinzufügen';
    button.addEventListener('click', async () => {
      try {
        const data = await fetch('/api/state', {
          headers: window.MusikBotFetch?.getAuth?.() ? { Authorization: window.MusikBotFetch.getAuth() } : {}
        }).then(async response => {
          const body = await response.json().catch(() => ({}));
          if (!response.ok) throw new Error(body.error || `HTTP ${response.status}`);
          return body;
        });
        await addCurrentToPlaylist(data.current);
      } catch (error) {
        const notice = document.querySelector('#notice');
        if (notice) {
          notice.textContent = error.message || String(error);
          notice.classList.add('show');
          window.setTimeout(() => notice.classList.remove('show'), 3500);
        }
      }
    });
    now.appendChild(button);
  }

  const observer = new MutationObserver(addButton);
  observer.observe(document.body, { childList: true, subtree: true });
  document.addEventListener('DOMContentLoaded', addButton);
  addButton();
})();
