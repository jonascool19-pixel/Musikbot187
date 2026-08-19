(() => {
  const KEY = 'musikbot187.auth';
  const auth = () => { try { return JSON.parse(sessionStorage.getItem(KEY) || 'null'); } catch { return null; } };
  const esc = value => String(value ?? '').replace(/[&<>\"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','\"':'&quot;',"'":'&#39;'}[c]));
  const permissionLabels = {
    'player.control': 'Player steuern',
    'playlists.manage': 'Playlists verwalten',
    'music.manage': 'Musikbibliothek verwalten',
    'connections.manage': 'Verbindungen verwalten',
    'settings.manage': 'Einstellungen verwalten',
    'design.manage': 'Design verwalten',
    'users.manage': 'Benutzer verwalten',
    'diagnostics.view': 'Diagnose ansehen',
    'system.manage': 'System verwalten'
  };
  const request = async (path, options = {}) => {
    const a = auth(); const headers = new Headers(options.headers || {});
    if (a?.token) headers.set('Authorization', `Bearer ${a.token}`);
    const response = await fetch(path, {...options, headers});
    const body = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(body.error || `HTTP ${response.status}`);
    return body;
  };
  const notice = text => { const node = document.querySelector('#notice'); if (!node) return; node.textContent = text; node.classList.add('show'); clearTimeout(window.__adminNoticeTimer); window.__adminNoticeTimer = setTimeout(() => node.classList.remove('show'), 3000); };
  let busy = false;

  function themeOptions(current) {
    if (window.MusikBotThemes?.options) return window.MusikBotThemes.options();
    return ['dark', 'light', 'ocean', 'purple', 'emerald', 'red', 'amber', 'slate'].map(value => `<option value="${value}">${value}</option>`).join('');
  }

  function permissionText(user) {
    if (user.role === 'admin') return 'Administrator: alle Berechtigungen';
    const permissions = Array.isArray(user.permissions) ? user.permissions : [];
    return permissions.length
      ? permissions.map(key => permissionLabels[key] || key).join(', ')
      : 'Keine Berechtigungen';
  }

  async function renderUsers() {
    const node = document.querySelector('#adminUsersList'); if (!node) return;
    try {
      const users = await request('/api/users');
      node.innerHTML = users.map(user => `<div class="admin-user-row" data-user-id="${esc(user.id)}"><div><strong>${esc(user.name)}</strong><small>${user.role === 'admin' ? 'Administrator' : 'Benutzer'}</small></div><div class="admin-rights">${esc(permissionText(user))}</div></div>`).join('') || '<p class="muted">Keine Benutzer vorhanden.</p>';
    } catch (error) { node.innerHTML = `<p class="muted">${esc(error.message)}</p>`; }
  }

  async function addUser() {
    if (busy) return;
    const name = document.querySelector('#adminNewUser')?.value.trim();
    const password = document.querySelector('#adminNewPassword')?.value || '';
    const role = document.querySelector('#adminNewRole')?.value || 'user';
    if (!name || !password) return notice('Benutzername und Passwort ausfüllen.');
    busy = true;
    try {
      await request('/api/users', { method: 'POST', headers: {'Content-Type': 'application/json'}, body: JSON.stringify({name, password, role}) });
      document.querySelector('#adminNewUser').value = '';
      document.querySelector('#adminNewPassword').value = '';
      notice('Benutzer wurde angelegt.');
      await renderUsers();
    } catch (error) { notice(error.message); } finally { busy = false; }
  }

  async function build() {
    const view = document.querySelector('#view');
    if (!view || document.body.dataset.adminOverhaul === '1') return;
    document.body.dataset.adminOverhaul = '1';
    let live = { settings: { theme: 'dark', accentColor: '#0b69b3', filesDirectory: 'music', volume: 80, mode: 'queue', outputType: 'none', outputId: '', networkInterface: '' } };
    try { live = await request('/api/state'); } catch {}
    const settings = live.settings || {};
    view.innerHTML = `<section class="admin-section"><div class="sectionhead"><div><h2>👥 Benutzer</h2><small>Konten anlegen und Rollen festlegen</small></div></div><div class="admin-create-grid"><label>Benutzername<input id="adminNewUser" autocomplete="off" maxlength="64" placeholder="z. B. Max"></label><label>Passwort<input id="adminNewPassword" type="password" autocomplete="new-password" minlength="5" maxlength="256" placeholder="Mindestens 5 Zeichen"></label><label>Rolle<select id="adminNewRole"><option value="user">Benutzer</option><option value="admin">Administrator</option></select></label><button id="adminAddUser">＋ Benutzer hinzufügen</button></div><div id="adminRolePreview" class="admin-role-help">Benutzer: Player steuern, Playlists verwalten</div><div id="adminUsersList" class="admin-users-list">Lade Benutzer …</div></section><section class="admin-section"><div class="sectionhead"><div><h2>🎨 Design</h2><small>Darstellung und Akzentfarbe</small></div></div><div class="grid"><label>Theme<select id="themeSelect">${themeOptions(settings.theme || 'dark')}</select></label><label>Akzentfarbe<input id="accentColor" type="color" value="${esc(settings.accentColor || '#0b69b3')}"></label><button id="themeSave">Design speichern</button></div></section><section class="admin-section"><div class="sectionhead"><div><h2>🛠 Wiedergabe & Ausgabe</h2><small>Player- und Audio-Ausgabe-Einstellungen</small></div></div><div class="grid"><label>Lautstärke<input id="adminVolume" type="range" min="0" max="100" value="${Number.isFinite(settings.volume) ? settings.volume : 80}"></label><output id="adminVolumeValue">${Number.isFinite(settings.volume) ? settings.volume : 80}%</output><label>Modus<select id="adminMode"><option value="queue">Queue</option><option value="repeat">Repeat</option><option value="shuffle">Shuffle</option></select></label><label>Ausgabe<select id="adminOutputType"><option value="none">Keine Ausgabe</option><option value="discord">Discord</option><option value="ts3">TeamSpeak 3</option></select></label><label>Ausgabe-ID<input id="adminOutputId" value="${esc(settings.outputId || '')}" placeholder="Instanz-ID"></label><label>Netzwerk-Interface<input id="adminNetworkInterface" value="${esc(settings.networkInterface || '')}" placeholder="optional"></label></div></section><section class="admin-section"><div class="sectionhead"><div><h2>🗂 Allgemeine Einstellungen</h2><small>Speicherort für die Musikbibliothek</small></div></div><div class="grid"><label>Dateiverzeichnis<input id="filesDirectory" value="${esc(settings.filesDirectory || 'music')}"></label><button id="settingsSave">Einstellungen speichern</button></div></section><section class="admin-section admin-diagnostics"><button id="diagnosticsToggle" class="admin-collapse" aria-expanded="false"><span>🩺 Diagnose</span><span class="admin-chevron">▼</span></button><div id="diagnosticsPanel" hidden><div id="diagnostics" class="diagnostics">Lade Diagnose …</div></div></section>`;
    document.querySelector('#themeSelect').value = settings.theme || 'dark';
    document.querySelector('#adminMode').value = settings.mode || 'queue';
    document.querySelector('#adminOutputType').value = settings.outputType || 'none';
    document.querySelector('#adminVolume').oninput = event => { document.querySelector('#adminVolumeValue').textContent = `${event.target.value}%`; };
    document.querySelector('#themeSave').onclick = async () => {
      try {
        await request('/api/settings', { method:'PUT', headers:{'Content-Type':'application/json'}, body:JSON.stringify({theme:document.querySelector('#themeSelect').value, accentColor:document.querySelector('#accentColor').value}) });
        document.body.dataset.theme = document.querySelector('#themeSelect').value;
        document.body.dataset.themeName = document.querySelector('#themeSelect').value;
        window.MusikBotThemes?.apply(document.body.dataset.themeName, document.querySelector('#accentColor').value);
        notice('Design gespeichert.');
      } catch (error) { notice(error.message); }
    };
    document.querySelector('#settingsSave').onclick = async () => {
      try {
        await request('/api/settings', { method:'PUT', headers:{'Content-Type':'application/json'}, body:JSON.stringify({
          volume:Number(document.querySelector('#adminVolume').value),
          mode:document.querySelector('#adminMode').value,
          outputType:document.querySelector('#adminOutputType').value,
          outputId:document.querySelector('#adminOutputId').value.trim(),
          networkInterface:document.querySelector('#adminNetworkInterface').value.trim(),
          filesDirectory:document.querySelector('#filesDirectory').value.trim()
        }) });
        notice('Einstellungen gespeichert.');
      } catch (error) { notice(error.message); }
    };
    document.querySelector('#adminAddUser').onclick = addUser;
    document.querySelector('#adminNewRole').onchange = event => { document.querySelector('#adminRolePreview').textContent = event.target.value === 'admin' ? 'Administrator: alle Berechtigungen' : 'Benutzer: Player steuern, Playlists verwalten'; };
    document.querySelector('#diagnosticsToggle').onclick = async event => {
      const button = event.currentTarget; const panel = document.querySelector('#diagnosticsPanel'); const open = !panel.hidden;
      panel.hidden = open; button.setAttribute('aria-expanded', String(!open)); button.querySelector('.admin-chevron').textContent = open ? '▼' : '▲';
      if (!open && !panel.dataset.loaded) {
        try {
          const items = await request('/api/diagnostics');
          document.querySelector('#diagnostics').innerHTML = items.map(item => `<div><span>${esc(item.time)} · ${esc(item.level || '')} · ${esc(item.source || '')}</span><small>${esc(item.message)}</small></div>`).join('') || '<p class="muted">Keine Diagnosemeldungen.</p>';
          panel.dataset.loaded = '1';
        } catch (error) { document.querySelector('#diagnostics').textContent = error.message; }
      }
    };
    void renderUsers();
  }
  const activate = () => { if (!document.querySelector('[data-tab="admin"]') || !document.querySelector('#view')) return; if (document.querySelector('#themeSelect') && document.body.dataset.adminOverhaul === '1') return; setTimeout(build, 0); };
  document.addEventListener('click', event => { if (event.target?.closest?.('[data-tab="admin"]')) { document.body.dataset.adminOverhaul = '0'; activate(); } }, true);
  new MutationObserver(activate).observe(document.body, {childList:true, subtree:true});
})();
