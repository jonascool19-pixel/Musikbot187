(() => {
  const API = {
    restartBot: '/api/system/restart-bot',
    rebootHost: '/api/system/reboot',
    shutdownHost: '/api/system/shutdown',
    settings: '/api/settings'
  };
  const DISABLED_DISCORD = '__RADIOBOT_DISABLED__';
  const DISABLED_TS3 = '__RADIOBOT_DISABLED__';

  const esc = value => String(value ?? '').replace(/[&<>\"']/g, char => ({ '&':'&amp;', '<':'&lt;', '>':'&gt;', '\"':'&quot;', "'":'&#39;' }[char]));

  async function request(url, options = {}) {
    const response = await fetch(url, {
      credentials: 'include',
      headers: { 'Content-Type': 'application/json', ...(options.headers || {}) },
      ...options
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(data.error || `HTTP ${response.status}`);
    return data;
  }

  function toast(message, type = 'info') {
    let node = document.getElementById('toast');
    if (!node) {
      node = document.createElement('div');
      node.id = 'toast';
      document.body.appendChild(node);
    }
    node.className = `toast ${type}`;
    node.textContent = message;
    clearTimeout(node._timer);
    node._timer = setTimeout(() => node.remove(), 3200);
  }

  async function stopAllBotInstances() {
    if (!window.confirm('Alle Discord- und TS3-Instanzen herunterfahren? Das Webinterface bleibt erreichbar.')) return;
    const settings = await request(API.settings);
    const discord = (settings.instances?.discord || []).map(instance => ({ ...instance, prefix: DISABLED_DISCORD }));
    const ts3 = (settings.instances?.ts3 || []).map(instance => ({ ...instance, identity: DISABLED_TS3 }));
    await request(API.settings, {
      method: 'PUT',
      body: JSON.stringify({ discord, ts3 })
    });
    toast('Alle Bot-Instanzen wurden heruntergefahren.', 'success');
    setTimeout(() => window.location.reload(), 350);
  }

  async function runAction(kind) {
    const messages = {
      restartBot: ['Bot neu starten?', 'Bot wird neu gestartet.'],
      rebootHost: ['Ubuntu neu starten?', 'Ubuntu wird neu gestartet.'],
      shutdownHost: ['Ubuntu herunterfahren?', 'Ubuntu wird heruntergefahren.']
    };
    const [question, accepted] = messages[kind];
    if (!window.confirm(question)) return;
    const endpoint = API[kind];
    try {
      await request(endpoint, { method: 'POST', body: '{}' });
      toast(accepted, 'success');
    } catch (error) {
      toast(error.message, 'error');
    }
  }

  function closeMenu() {
    document.querySelector('.system-control-menu')?.remove();
  }

  function toggleMenu(anchor) {
    const existing = document.querySelector('.system-control-menu');
    if (existing) { existing.remove(); return; }
    const menu = document.createElement('div');
    menu.className = 'system-control-menu';
    menu.innerHTML = `<div class="system-control-title"><strong>Systemsteuerung</strong><span>Administrator</span></div>
      <button data-system-action="restartBot"><span class="system-action-icon">↻</span><span><b>Bot neu starten</b><small>Webinterface bleibt aktiv</small></span></button>
      <button data-system-action="stopBot" class="danger"><span class="system-action-icon">■</span><span><b>Bot herunterfahren</b><small>Discord- und TS3-Instanzen stoppen</small></span></button>
      <div class="system-control-separator"></div>
      <button data-system-action="rebootHost"><span class="system-action-icon">⟳</span><span><b>Ubuntu neu starten</b><small>Der Host wird neu gebootet</small></span></button>
      <button data-system-action="shutdownHost" class="danger"><span class="system-action-icon">⏻</span><span><b>Ubuntu herunterfahren</b><small>Der Host wird ausgeschaltet</small></span></button>`;
    document.body.appendChild(menu);
    const rect = anchor.getBoundingClientRect();
    menu.style.top = `${Math.round(rect.bottom + 8)}px`;
    menu.style.right = `${Math.max(10, Math.round(window.innerWidth - rect.right))}px`;

    menu.querySelectorAll('[data-system-action]').forEach(button => {
      button.addEventListener('click', async () => {
        const action = button.dataset.systemAction;
        closeMenu();
        try {
          if (action === 'stopBot') await stopAllBotInstances();
          else await runAction(action);
        } catch (error) {
          toast(error.message, 'error');
        }
      });
    });
  }

  function ensureButton() {
    const topActions = document.querySelector('.top-actions');
    if (!topActions || topActions.querySelector('#systemControlButton')) return;
    const button = document.createElement('button');
    button.id = 'systemControlButton';
    button.className = 'system-control-button';
    button.title = 'Systemsteuerung';
    button.setAttribute('aria-label', 'Systemsteuerung');
    button.innerHTML = '<span>⏻</span><b>System</b>';
    button.addEventListener('click', event => {
      event.stopPropagation();
      toggleMenu(button);
    });
    topActions.insertBefore(button, topActions.querySelector('#settingsQuick') || null);
  }

  document.addEventListener('click', event => {
    const target = event.target;
    if (target.closest?.('.system-control-menu') || target.closest?.('#systemControlButton')) return;
    closeMenu();
  });
  window.addEventListener('resize', closeMenu);
  window.addEventListener('scroll', closeMenu, true);

  const observer = new MutationObserver(ensureButton);
  observer.observe(document.body, { childList: true, subtree: true });
  ensureButton();
})();
