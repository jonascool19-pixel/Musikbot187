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

  const safeLoad = async () => {
    if (busy) return;
    busy = true;
    try {
      clearInterval(window.clockTimer);
      clearInterval(window.pollTimer);
      const fresh = await window.api('/api/state');
      setGlobal('state', fresh);
      const page = String(window.eval('currentPage'));
      if (typeof window.renderPage === 'function') await window.renderPage(page);
      if (page === 'dashboard' && typeof window.refreshDashboardBits === 'function') window.refreshDashboardBits();
      if (typeof window.startLiveUpdates === 'function') window.startLiveUpdates();
    } catch (error) {
      window.notify?.(error?.message || String(error), 'error');
    } finally {
      busy = false;
    }
  };

  window.go = safeNavigate;
  window.load = safeLoad;
})();
