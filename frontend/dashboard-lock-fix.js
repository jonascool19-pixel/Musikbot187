(() => {
  const api = async (url, options = {}) => {
    const response = await fetch(url, { credentials: 'include', headers: { 'Content-Type': 'application/json', ...(options.headers || {}) }, ...options });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(data.error || `HTTP ${response.status}`);
    return data;
  };
  const isDashboard = () => location.pathname === '/' || location.pathname === '';
  const builderOpen = () => document.body.classList.contains('dashboard-builder-active');
  const container = () => document.querySelector('[data-tile]')?.parentElement || null;

  function setLocked() {
    if (!isDashboard()) return;
    const unlocked = builderOpen();
    document.querySelectorAll('[data-tile]').forEach(tile => {
      tile.setAttribute('draggable', unlocked ? 'true' : 'false');
      tile.classList.toggle('dashboard-tile-locked', !unlocked);
      const handle = tile.querySelector('.drag-handle');
      if (handle) {
        handle.style.pointerEvents = unlocked ? '' : 'none';
        handle.style.opacity = unlocked ? '' : '0.45';
      }
    });
  }

  function ensureToggle() {
    if (!isDashboard()) return;
    const top = document.querySelector('.top-actions');
    if (!top || !container()) return;
    let button = document.querySelector('#dashboardLockToggle');
    if (!button) {
      button = document.createElement('button');
      button.id = 'dashboardLockToggle';
      button.className = 'icon-btn dashboard-lock-toggle';
      button.type = 'button';
      button.title = 'Dashboard bearbeiten';
      button.addEventListener('click', () => {
        const next = !builderOpen();
        document.body.classList.toggle('dashboard-builder-active', next);
        button.textContent = next ? '✓' : '✦';
        button.title = next ? 'Bearbeiten beenden' : 'Dashboard bearbeiten';
        setLocked();
      });
      const builder = document.querySelector('#widgetBuilderButton');
      top.insertBefore(button, builder || null);
    }
    button.textContent = builderOpen() ? '✓' : '✦';
    button.title = builderOpen() ? 'Bearbeiten beenden' : 'Dashboard bearbeiten';
  }

  document.addEventListener('dragstart', event => {
    const tile = event.target.closest?.('[data-tile]');
    if (tile && !builderOpen()) {
      event.preventDefault();
      event.stopImmediatePropagation();
    }
  }, true);

  document.addEventListener('dragover', event => {
    const tile = event.target.closest?.('[data-tile]');
    if (tile && !builderOpen()) {
      event.preventDefault();
      event.stopImmediatePropagation();
    }
  }, true);

  document.addEventListener('drop', event => {
    const tile = event.target.closest?.('[data-tile]');
    if (tile && !builderOpen()) {
      event.preventDefault();
      event.stopImmediatePropagation();
    }
  }, true);

  document.addEventListener('dragend', event => {
    if (!builderOpen()) event.preventDefault();
  }, true);

  const observer = new MutationObserver(() => {
    ensureToggle();
    setLocked();
  });
  observer.observe(document.body, { childList: true, subtree: true });

  setInterval(() => {
    ensureToggle();
    setLocked();
  }, 500);
})();
