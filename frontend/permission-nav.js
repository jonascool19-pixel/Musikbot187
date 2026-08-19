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
  function apply() {
    const rules = {
      connections: 'connections.manage',
      system: 'diagnostics.view'
    };
    for (const [tab, permission] of Object.entries(rules)) {
      const button = document.querySelector(`nav [data-tab="${tab}"]`);
      if (button) button.hidden = !can(permission);
    }
  }
  new MutationObserver(apply).observe(document.documentElement, { childList: true, subtree: true });
  apply();
})();
