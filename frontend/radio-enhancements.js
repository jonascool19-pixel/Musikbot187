(() => {
  const api = async (url, options = {}) => {
    const response = await fetch(url, { headers: { 'Content-Type': 'application/json', ...(options.headers || {}) }, ...options });
    const text = await response.text();
    let data; try { data = text ? JSON.parse(text) : {}; } catch { data = text; }
    if (!response.ok) throw new Error(typeof data === 'string' ? data : (data.message || 'Anfrage fehlgeschlagen'));
    return data;
  };

  let radioPlaylistId = null;
  let shuffle = false;
  let repeatMode = 'all';

  const getGuild = () => document.querySelector('#guild')?.value || '';
  const esc = (v) => String(v ?? '').replace(/[&<>\"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','\"':'&quot;',"'":'&#39;'}[c]));

  async function loadRadioPlaylist() {
    const playlists = await api('/api/playlists');
    const radio = playlists.find(p => p.name.toLowerCase() === 'radio');
    radioPlaylistId = radio?.id || null;
  }

  async function addStation(station, play = false) {
    const result = await api('/api/radio/add', {
      method: 'POST', body: JSON.stringify({ name: station.name, url: station.url })
    });
    radioPlaylistId = result.playlist.id;
    if (play) {
      const guild = getGuild();
      if (!guild) throw new Error('Bitte zuerst einen Discord-Server auswählen.');
      await api(`/api/playlists/${radioPlaylistId}/play/${guild}`, { method: 'POST', body: JSON.stringify({ append: false }) });
      await setMode();
    }
  }

  async function searchRadio() {
    const input = document.querySelector('#rbRadioSearch');
    const results = document.querySelector('#rbRadioResults');
    const q = input.value.trim();
    if (!q) return;
    results.innerHTML = '<div class="hint">Suche Radiosender …</div>';
    try {
      const stations = await api(`/api/radio/search?q=${encodeURIComponent(q)}`);
      results.innerHTML = stations.length ? stations.map((s, i) => `
        <div class="rb-radio-result">
          <div class="rb-radio-main"><strong>${esc(s.name)}</strong><small>${esc([s.country, s.language, s.codec, s.bitrate ? `${s.bitrate} kbps` : ''].filter(Boolean).join(' · '))}</small></div>
          <div class="row"><button data-rb-save="${i}">Speichern</button><button data-rb-play="${i}">▶ Spielen</button></div>
        </div>`).join('') : '<div class="hint">Keine Sender gefunden.</div>';
      results._stations = stations;
      results.querySelectorAll('[data-rb-save]').forEach(btn => btn.onclick = async () => { try { await addStation(stations[Number(btn.dataset.rbSave)]); btn.textContent = '✓ Gespeichert'; } catch (e) { alert(e.message); } });
      results.querySelectorAll('[data-rb-play]').forEach(btn => btn.onclick = async () => { try { await addStation(stations[Number(btn.dataset.rbPlay)], true); btn.textContent = '✓ Läuft'; } catch (e) { alert(e.message); } });
    } catch (e) { results.innerHTML = `<div class="hint">${esc(e.message)}</div>`; }
  }

  async function topRadio() {
    const results = document.querySelector('#rbRadioResults');
    results.innerHTML = '<div class="hint">Beliebte Sender werden geladen …</div>';
    try {
      const stations = await api('/api/radio/top');
      results.innerHTML = stations.map((s, i) => `
        <div class="rb-radio-result"><div class="rb-radio-main"><strong>${esc(s.name)}</strong><small>${esc([s.country, s.language, s.codec].filter(Boolean).join(' · '))}</small></div>
        <div class="row"><button data-rb-save="${i}">Speichern</button><button data-rb-play="${i}">▶ Spielen</button></div></div>`).join('');
      results._stations = stations;
      results.querySelectorAll('[data-rb-save]').forEach(btn => btn.onclick = async () => { try { await addStation(stations[Number(btn.dataset.rbSave)]); btn.textContent = '✓ Gespeichert'; } catch (e) { alert(e.message); } });
      results.querySelectorAll('[data-rb-play]').forEach(btn => btn.onclick = async () => { try { await addStation(stations[Number(btn.dataset.rbPlay)], true); btn.textContent = '✓ Läuft'; } catch (e) { alert(e.message); } });
    } catch (e) { results.innerHTML = `<div class="hint">${esc(e.message)}</div>`; }
  }

  async function setMode() {
    await loadRadioPlaylist();
    const guild = getGuild();
    if (!guild || !radioPlaylistId) return;
    await api(`/api/state/${guild}/playback-mode`, {
      method: 'POST', body: JSON.stringify({ playlistId: radioPlaylistId, mode: repeatMode, shuffle })
    });
  }

  async function playRadioPlaylist() {
    await loadRadioPlaylist();
    const guild = getGuild();
    if (!guild) return alert('Bitte zuerst einen Discord-Server auswählen.');
    if (!radioPlaylistId) return alert('Die Radio-Playlist ist noch leer. Speichere zuerst einen Sender.');
    await api(`/api/playlists/${radioPlaylistId}/play/${guild}`, { method: 'POST', body: JSON.stringify({ append: false }) });
    await setMode();
  }

  function mount() {
    if (document.querySelector('#rbRadioPanel')) return;
    const panel = document.createElement('article');
    panel.id = 'rbRadioPanel';
    panel.innerHTML = `
      <h2>📻 Radio</h2>
      <div class="row"><input id="rbRadioSearch" placeholder="Sender suchen – z. B. Beck FM, Rock, Deutschland"><button id="rbRadioSearchBtn">Suchen</button><button id="rbRadioTopBtn">Top</button></div>
      <div id="rbRadioResults" class="list"></div>
      <div class="card">
        <b>Radio-Playlist</b>
        <div class="row" style="margin-top:8px"><button id="rbRadioPlay">▶ Playlist starten</button><label>Wiederholung<select id="rbRepeat"><option value="off">Aus</option><option value="one">Titel/Sender wiederholen</option><option value="all" selected>Playlist wiederholen</option></select></label><label><input id="rbShuffle" type="checkbox"> Zufallswiedergabe</label></div>
      </div>`;
    const grid = document.querySelector('main .grid');
    (grid || document.querySelector('main')).prepend(panel);
    document.querySelector('#rbRadioSearchBtn').onclick = searchRadio;
    document.querySelector('#rbRadioTopBtn').onclick = topRadio;
    document.querySelector('#rbRadioSearch').onkeydown = (e) => { if (e.key === 'Enter') searchRadio(); };
    document.querySelector('#rbRadioPlay').onclick = () => playRadioPlaylist().catch(e => alert(e.message));
    document.querySelector('#rbRepeat').onchange = (e) => { repeatMode = e.target.value; setMode().catch(e => alert(e.message)); };
    document.querySelector('#rbShuffle').onchange = (e) => { shuffle = e.target.checked; setMode().catch(e => alert(e.message)); };
    loadRadioPlaylist().catch(() => undefined);
  }

  const style = document.createElement('style');
  style.textContent = `#rbRadioPanel{grid-column:1/-1} .rb-radio-result{display:flex;gap:12px;justify-content:space-between;align-items:center;padding:10px 0;border-bottom:1px solid rgba(148,163,184,.12)} .rb-radio-main{display:flex;flex-direction:column;min-width:0}.rb-radio-main small{opacity:.68;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;max-width:70vw}`;
  document.head.appendChild(style);
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', mount); else mount();
})();
