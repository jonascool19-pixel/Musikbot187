(() => {
  const permissions = [
    ['player.control', 'Player steuern'],
    ['playlists.manage', 'Playlists verwalten'],
    ['music.manage', 'Musikbibliothek verwalten'],
    ['connections.manage', 'Verbindungen verwalten'],
    ['settings.manage', 'Einstellungen verwalten'],
    ['design.manage', 'Design verwalten'],
    ['users.manage', 'Benutzer verwalten'],
    ['diagnostics.view', 'Diagnose ansehen'],
    ['system.manage', 'System verwalten']
  ];
  const auth = () => window.MusikBotFetch?.getAuth?.() || '';
  const api = async (url, options = {}) => {
    const token = auth();
    const headers = new Headers(options.headers || {});
    if (token) headers.set('Authorization', token);
    const response = await fetch(url, { ...options, headers });
    const body = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(body.error || `HTTP ${response.status}`);
    return body;
  };
  const esc = value => String(value ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const observer = new MutationObserver(() => enhance());
  function enhance() {
    const list = document.querySelector('#adminUsersList');
    if (!list) return;
    for (const row of list.querySelectorAll('.admin-user-row')) {
      if (row.dataset.permissionsEnhanced === '1') continue;
      row.dataset.permissionsEnhanced = '1';
      const name = row.querySelector('strong')?.textContent || '';
      row.dataset.userName = name;
      const button = document.createElement('button');
      button.type = 'button';
      button.className = 'admin-permissions-edit';
      button.textContent = 'Berechtigungen bearbeiten';
      button.addEventListener('click', () => openEditor(row));
      row.querySelector('.admin-rights')?.after(button);
    }
  }
  async function openEditor(row) {
    if (row.querySelector('.admin-permission-editor')) return;
    const name = row.dataset.userName || '';
    try {
      const users = await api('/api/users');
      const currentUser = users.find(item => item.name === name);
      if (!currentUser) throw new Error('Benutzer nicht gefunden');
      const current = new Set(currentUser.permissions || []);
      const editor = document.createElement('div');
      editor.className = 'admin-permission-editor';
      editor.innerHTML = `<div class="admin-permission-title"><strong>Berechtigungen für ${esc(currentUser.name)}</strong><button type="button" data-close>×</button></div><label>Rolle<select data-role><option value="user">Benutzer</option><option value="admin">Administrator</option></select></label><div class="admin-permission-grid">${permissions.map(([key, label]) => `<label><input type="checkbox" value="${key}" ${current.has(key) ? 'checked' : ''}>${esc(label)}</label>`).join('')}</div><div class="admin-permission-actions"><button type="button" data-save>Speichern</button><button type="button" data-close>Abbrechen</button></div>`;
      row.append(editor);
      const role = editor.querySelector('[data-role]');
      role.value = currentUser.role === 'admin' ? 'admin' : 'user';
      const boxes = [...editor.querySelectorAll('input[type="checkbox"]')];
      const syncRole = () => { const isAdmin = role.value === 'admin'; boxes.forEach(box => { box.checked = isAdmin ? true : box.checked; box.disabled = isAdmin; }); };
      role.addEventListener('change', syncRole);
      syncRole();
      editor.querySelectorAll('[data-close]').forEach(btn => btn.addEventListener('click', () => editor.remove()));
      editor.querySelector('[data-save]').addEventListener('click', async event => {
        const button = event.currentTarget;
        button.disabled = true;
        try {
          const roleValue = role.value;
          const selected = boxes.filter(box => box.checked).map(box => box.value);
          const result = await api(`/api/users/${encodeURIComponent(currentUser.id)}/permissions`, { method: 'PUT', headers: {'Content-Type': 'application/json'}, body: JSON.stringify({ role: roleValue, permissions: selected }) });
          const roleLabel = row.querySelector('small');
          if (roleLabel) roleLabel.textContent = result.user.role === 'admin' ? 'Administrator' : 'Benutzer';
          const rights = row.querySelector('.admin-rights');
          if (rights) rights.innerHTML = (result.user.permissions || []).map(key => `<span>${esc(permissions.find(item => item[0] === key)?.[1] || key)}</span>`).join('');
          editor.remove();
          const notice = document.querySelector('#notice');
          if (notice) { notice.textContent = 'Berechtigungen gespeichert.'; notice.classList.add('show'); setTimeout(() => notice.classList.remove('show'), 2500); }
        } catch (error) {
          button.disabled = false;
          const notice = document.querySelector('#notice');
          if (notice) { notice.textContent = error.message; notice.classList.add('show'); }
        }
      });
    } catch (error) {
      const notice = document.querySelector('#notice');
      if (notice) { notice.textContent = error.message; notice.classList.add('show'); }
    }
  }
  const start = () => {
    if (!document.body) return;
    observer.observe(document.body, { childList: true, subtree: true });
    enhance();
  };
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start, { once: true }); else start();
})();
