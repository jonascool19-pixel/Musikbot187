(() => {
  const DISABLED_DISCORD = '__RADIOBOT_DISABLED__';
  const DISABLED_TS3 = '__RADIOBOT_DISABLED__';

  async function apiRequest(url, options = {}) {
    const response = await fetch(url, { credentials: 'include', headers: { 'Content-Type': 'application/json', ...(options.headers || {}) }, ...options });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(data.error || `HTTP ${response.status}`);
    return data;
  }

  function instances() { return state.instances || []; }

  function row(instance) {
    const enabled = instance.enabled !== false;
    const online = Boolean(instance.connected);
    const dot = enabled ? (online ? 'online' : 'offline') : 'disabled';
    const type = String(instance.type || '').toUpperCase();
    return `<button class="instance-sidebar-row ${instance.id === state.activeInstance ? 'active' : ''}" data-instance-id="${esc(instance.id)}">
      <span class="instance-status-dot ${dot}"></span>
      <span class="instance-name">${esc(instance.name || instance.id)}</span>
      <span class="instance-type">${esc(type)}</span>
      <span class="instance-sidebar-toggle ${enabled ? 'on' : ''}" data-instance-toggle="${esc(instance.id)}" role="switch" aria-checked="${enabled}"></span>
    </button>`;
  }

  function esc(value) { return String(value ?? '').replace(/[&<>\"']/g, char => ({ '&':'&amp;', '<':'&lt;', '>':'&gt;', '\"':'&quot;', "'":'&#39;' }[char])); }

  async function render() {
    const nav = document.querySelector('.sidebar nav');
    if (!nav) return;
    let section = document.querySelector('.instance-sidebar-section');
    if (!section) {
      section = document.createElement('div');
      section.className = 'instance-sidebar-section';
      nav.insertAdjacentElement('afterend', section);
    }
    const desired = instances().map(row).join('') || '<div class="empty">Keine Instanzen</div>';
    const nextHtml = `<div class="instance-sidebar-title">Instanzen</div><div class="instance-sidebar-list">${desired}</div>`;
    if (section.innerHTML === nextHtml) return;
    section.innerHTML = nextHtml;
    section.querySelectorAll('[data-instance-id]').forEach(button => {
      button.addEventListener('click', async event => {
        if (event.target.closest('[data-instance-toggle]')) return;
        try {
          await apiRequest('/api/settings', { method:'PUT', body:JSON.stringify({ activeInstance: button.dataset.instanceId }) });
          await load();
        } catch (error) { notify(error.message, 'error'); }
      });
    });
    section.querySelectorAll('[data-instance-toggle]').forEach(toggle => {
      toggle.addEventListener('click', async event => {
        event.preventDefault();
        event.stopPropagation();
        const id = toggle.dataset.instanceToggle;
        const instance = instances().find(item => item.id === id);
        if (!instance) return;
        try {
          const settings = await apiRequest('/api/settings');
          const discord = (settings.instances?.discord || []).map(item => ({ ...item, prefix: item.id === id && instance.type === 'discord' && instance.enabled !== false ? DISABLED_DISCORD : item.prefix }));
          const nextDiscord = discord.map(item => ({ ...item, ...(item.id === id && instance.type === 'discord' ? { prefix: instance.enabled === false ? (item.prefix === DISABLED_DISCORD ? '!' : item.prefix || '!') : DISABLED_DISCORD } : {}) }));
          const ts3 = (settings.instances?.ts3 || []).map(item => ({ ...item, ...(item.id === id && instance.type === 'ts3' ? { identity: instance.enabled === false ? (item.identity || '') : DISABLED_TS3 } : {}) }));
          await apiRequest('/api/settings', { method:'PUT', body:JSON.stringify({ discord: nextDiscord, ts3 }) });
          await load();
        } catch (error) { notify(error.message, 'error'); }
      });
    });
  }

  setInterval(() => { void render(); }, 3000);
  void render();
})();
