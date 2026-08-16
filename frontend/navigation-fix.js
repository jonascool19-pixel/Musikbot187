(() => {
  let busy = false;

  const setGlobal = (name, value) => {
    try { window.eval(`${name} = ${JSON.stringify(value)}`); } catch {}
  };

  const safeNavigate = async page => {
    if (busy) return;
    busy = true;
    try {
      setGlobal('currentPage', page);
      const titleMap = { dashboard:'Dashboard', search:'Suche', radio:'Radio', playlists:'Playlists', queue:'Queue', files:'Dateien', settings:'Einstellungen', status:'Systemauslastung', updates:'Updates' };
      const subtitleMap = { dashboard:'Übersicht & Steuerung', search:'Titel und Quellen finden', radio:'Radiosender durchsuchen', playlists:'Wiedergabelisten verwalten', queue:'Warteschlange', files:'Lokale Medien', settings:'Instanzen, Benutzer und System', status:'CPU, RAM, Netzwerk und Systemaktionen', updates:'Version und Wartung' };
      const heading = document.querySelector('.page-heading h1');
      const subtitle = document.querySelector('.page-heading p');
      if (heading) heading.textContent = titleMap[page] || 'Dashboard';
      if (subtitle) subtitle.textContent = subtitleMap[page] || '';
      document.querySelectorAll('[data-nav]').forEach(button => button.classList.toggle('active', button.dataset.nav === page));
      if (typeof window.renderPage === 'function') await window.renderPage(page);
      if (page === 'dashboard' && typeof window.refreshDashboardBits === 'function') window.refreshDashboardBits();
      if (typeof window.updateClock === 'function') window.updateClock();
    } catch (error) {
      window.notify?.(error?.message || String(error), 'error');
    } finally {
      busy = false;
    }
  };

  // Do not override window.load here. The original app.js load() contains the
  // first-user/setup-required state machine. Overriding it makes a fresh install
  // treat the expected 409 SETUP_REQUIRED response as a fatal login error.
  window.go = safeNavigate;
})();
