(() => {
  const nativeFetch = () => window.MusikBotFetch?.nativeFetch || window.fetch.bind(window);
  const auth = () => window.MusikBotFetch?.getAuth?.() || '';
  const esc = value => String(value ?? '').replace(/[&<>\"']/g, char => ({ '&':'&amp;', '<':'&lt;', '>':'&gt;', '\"':'&quot;', "'":'&#39;' }[char]));
  const api = (path, options = {}) => {
    const headers = new Headers(options.headers || {});
    const token = auth();
    if (token && !headers.has('Authorization')) headers.set('Authorization', token);
    options.headers = headers;
    return nativeFetch()(path, options).then(async response => {
      const body = await response.json().catch(() => ({}));
      if (!response.ok) throw Error(body.error || `HTTP ${response.status}`);
      return body;
    });
  };
  let lastCurrentId = '';
  let timer = null;

  async function addCurrentToPlaylist() {
    try {
      const state = await api('/api/state');
      const item = state.current;
      if (!item?.url) return;
      const playlists = await api('/api/playlists');
      if (!playlists.length) return window.alert('Keine Playlist vorhanden. Erstelle zuerst eine Playlist.');
      const options = playlists.map((p, i) => `${i + 1}: ${p.name}`).join('\n');
      const answer = window.prompt(`Zur Playlist hinzufügen:\n${options}\n\nNummer:`);
      if (answer === null) return;
      const index = Number(answer) - 1;
      const playlist = playlists[index];
      if (!playlist) return window.alert('Ungültige Auswahl.');
      await api(`/api/playlists/${encodeURIComponent(playlist.id)}/items`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ items: [{ id: item.id || `${Date.now()}-${Math.random().toString(36).slice(2)}`, title: item.title || item.url, url: item.url, source: item.source || 'youtube', artist: item.artist || '' }] })
      });
      const notice = document.querySelector('#notice');
      if (notice) { notice.textContent = `„${playlist.name}“ wurde hinzugefügt.`; notice.classList.add('show'); setTimeout(() => notice.classList.remove('show'), 3000); }
    } catch (error) {
      const notice = document.querySelector('#notice');
      if (notice) { notice.textContent = error.message || String(error); notice.classList.add('show'); setTimeout(() => notice.classList.remove('show'), 3500); }
    }
  }

  function ensureButton() {
    const now = document.querySelector('.now');
    if (!now) return;
    const currentText = now.querySelector('strong')?.textContent || '';
    const playerSection = now.closest('section');
    if (!playerSection) return;
    let button = playerSection.querySelector('[data-current-playlist]');
    if (!currentText || currentText === 'Nichts läuft') {
      button?.remove();
      lastCurrentId = '';
      return;
    }
    if (!button) {
      const controls = playerSection.querySelector('.controls');
      if (!controls) return;
      button = document.createElement('button');
      button.type = 'button';
      button.dataset.currentPlaylist = '1';
      button.textContent = '＋ Playlist';
      button.title = 'Aktuellen Titel zu einer Playlist hinzufügen';
      controls.appendChild(button);
      button.addEventListener('click', addCurrentToPlaylist);
    }
    if (currentText !== lastCurrentId) lastCurrentId = currentText;
  }

  function start() {
    clearInterval(timer);
    ensureButton();
    timer = setInterval(ensureButton, 400);
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start, { once: true });
  else start();
  window.addEventListener('beforeunload', () => clearInterval(timer), { once: true });
})();
