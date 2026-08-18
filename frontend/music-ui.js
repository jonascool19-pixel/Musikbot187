(() => {
  const nativeFetch = () => window.MusikBotFetch?.nativeFetch || window.fetch.bind(window);
  const auth = () => window.MusikBotFetch?.getAuth?.() || '';
  const q = selector => document.querySelector(selector);
  const esc = value => String(value ?? '').replace(/[&<>\"']/g, char => ({ '&':'&amp;', '<':'&lt;', '>':'&gt;', '\"':'&quot;', "'":'&#39;' }[char]));
  const api = (path, options = {}) => { const headers = new Headers(options.headers || {}); const header = auth(); if (header && !headers.has('Authorization')) headers.set('Authorization', header); options.headers = headers; return nativeFetch()(path, options).then(async response => { const body = await response.json().catch(() => ({})); if (!response.ok) throw Error(body.error || `HTTP ${response.status}`); return body; }); };
  const post = (path, body = {}) => api(path, { method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify(body) });
  function note(text) { const node = q('#notice'); if (!node) return; node.textContent = text; node.classList.add('show'); clearTimeout(window.__musikbotMusicNotice); window.__musikbotMusicNotice = setTimeout(() => node.classList.remove('show'), 3500); }
  async function playlistDialog() { return api('/api/playlists').then(playlists => { if (!playlists.length) { note('Keine Playlist vorhanden.'); return null; } const text = playlists.map((p, i) => `${i + 1}: ${p.name}`).join('\n'); const answer = window.prompt(`Playlist auswählen:\n${text}\n\nNummer:`); if (answer === null) return null; return playlists[Number(answer) - 1] || null; }); }
  async function addToPlaylist(item) { try { const playlist = await playlistDialog(); if (!playlist) return; await post(`/api/playlists/${encodeURIComponent(playlist.id)}/items`, { items: [{ id: crypto.randomUUID(), title: item.title, url: item.url, source: item.source || 'file', artist: item.artist || '' }] }); note(`„${playlist.name}“ wurde hinzugefügt.`); } catch (error) { note(error.message); } }
  async function playFile(file) { try { await post('/api/play', { items: [{ id: crypto.randomUUID(), title: file.name, url: file.name, source: 'file' }] }); note(`„${file.name}“ zur Wiedergabe hinzugefügt.`); } catch (error) { note(error.message); } }
  async function renderMusic() {
    const view = q('#view'); if (!view) return;
    document.querySelectorAll('nav .navbtn').forEach(button => button.classList.toggle('active', button.dataset.extraTab === 'music'));
    try {
      const files = await api('/api/files');
      view.innerHTML = `<section class="music-library"><div class="sectionhead"><div><h2>Musik</h2><small>Eigene Musikdateien im Musikverzeichnis</small></div><button id="musicRefresh">↻ Aktualisieren</button></div><div class="upload-row"><input id="musicUpload" type="file" accept=".mp3,.wav,.flac,.ogg,.opus,.m4a,.aac,.webm,audio/*"><button id="musicUploadButton">⬆ Datei hochladen</button></div><div id="musicList" class="list">${files.length ? files.map(file => `<div class="listrow"><span>🎵 <b>${esc(file.name)}</b></span><div class="controls"><button data-mplay="${esc(file.name)}">▶ Play</button><button data-mpl="${esc(file.name)}">＋ Playlist</button><button data-mdel="${esc(file.name)}" class="danger">Entfernen</button></div></div>`).join('') : '<p class="muted">Noch keine Musik hochgeladen.</p>'}</div></section>`;
      q('#musicRefresh').onclick = renderMusic;
      q('#musicUploadButton').onclick = async () => { const input = q('#musicUpload'); const file = input.files?.[0]; if (!file) return note('Bitte zuerst eine Musikdatei auswählen.'); if (file.size > 128 * 1024 * 1024) return note('Datei ist größer als 128 MB.'); const form = new FormData(); form.append('file', file, file.name); try { await api('/api/music/upload', { method:'POST', body:form }); note(`„${file.name}“ hochgeladen.`); await renderMusic(); } catch (error) { note(error.message); } };
      document.querySelectorAll('[data-mplay]').forEach(button => button.onclick = async () => { const file = files.find(item => item.name === button.dataset.mplay); if (file) await playFile(file); });
      document.querySelectorAll('[data-mpl]').forEach(button => button.onclick = async () => { const file = files.find(item => item.name === button.dataset.mpl); if (file) await addToPlaylist({ title:file.name, url:file.name, source:'file' }); });
      document.querySelectorAll('[data-mdel]').forEach(button => button.onclick = async () => { if (!confirm(`„${button.dataset.mdel}“ wirklich entfernen?`)) return; try { await api(`/api/music/${encodeURIComponent(button.dataset.mdel)}`, { method:'DELETE' }); note('Datei entfernt.'); await renderMusic(); } catch (error) { note(error.message); } });
    } catch (error) { note(error.message); }
  }
  function enhanceSearchResults() { document.querySelectorAll('#results .result').forEach(result => { if (result.querySelector('.music-playlist-plus')) return; const buttons = result.querySelector('.controls'); if (!buttons) return; const playlistButton = [...buttons.querySelectorAll('button')].find(button => /Playlist/.test(button.textContent)); if (playlistButton) { playlistButton.classList.add('music-playlist-plus'); playlistButton.textContent = '＋ Playlist'; } }); }
  window.__musikbotRegisterCleanup?.(window.MusikBotNavigation?.registerExtraTab({ id: 'music', label: '🎼 Musik', title: 'Eigene Musikdateien verwalten', render: renderMusic }));
  const observer = new MutationObserver(enhanceSearchResults); observer.observe(document.documentElement, { childList:true, subtree:true });
  window.__musikbotRegisterCleanup?.(() => observer.disconnect());
  enhanceSearchResults();
})();
