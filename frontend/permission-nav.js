(() => {
  const KEY = 'musikbot187.auth';
  const auth = () => {
    try {
      return window.MusikBotAuthSession?.readAuth?.() || JSON.parse(sessionStorage.getItem(KEY) || 'null');
    } catch {
      return null;
    }
  };
  const can = permission => {
    const user = auth()?.user;
    if (!user) return false;
    if (user.role === 'admin') return true;
    return Array.isArray(user.permissions) && user.permissions.includes(permission);
  };
  function setVisibility(selector, allowed) {
    document.querySelectorAll(selector).forEach(node => {
      node.hidden = !allowed;
      node.style.display = allowed ? '' : 'none';
      node.setAttribute('aria-hidden', allowed ? 'false' : 'true');
    });
  }
  function apply() {
    setVisibility('nav [data-tab="connections"]', can('connections.manage'));
    setVisibility('nav [data-tab="system"]', can('diagnostics.view'));
    setVisibility('nav [data-tab="admin"]', can('users.manage'));
    setVisibility('[data-extra-tab="design"]', can('design.manage'));
    setVisibility('#enhancedOutput', can('settings.manage'));
  }

  const observer = new MutationObserver(apply);
  observer.observe(document.documentElement, { childList: true, subtree: true });
  window.addEventListener('musikbot:auth-changed', () => {
    apply();
    queueMicrotask(apply);
    setTimeout(apply, 0);
  });

  apply();
  const syncTimer = window.setInterval(() => {
    apply();
    if (!auth()) return;
    window.clearInterval(syncTimer);
  }, 100);
  window.__musikbotRegisterCleanup?.(() => window.clearInterval(syncTimer));
})();
