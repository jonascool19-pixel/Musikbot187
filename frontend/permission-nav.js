(() => {
  const auth = () => {
    try { return JSON.parse(sessionStorage.getItem('musikbot187.auth') || 'null'); } catch { return null; }
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
    setVisibility('[data-extra-tab="design"]', can('design.manage'));
    setVisibility('#enhancedOutput', can('settings.manage'));
  }
  new MutationObserver(apply).observe(document.documentElement, { childList: true, subtree: true });
  window.addEventListener('musikbot:auth-changed', apply);
  apply();
})();
