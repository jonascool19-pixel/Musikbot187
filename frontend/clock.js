(() => {
  'use strict';

  const timeEl = document.getElementById('webTime');
  const dateEl = document.getElementById('webDate');
  if (!timeEl || !dateEl) return;

  const updateClock = () => {
    const now = new Date();
    timeEl.textContent = new Intl.DateTimeFormat('de-DE', {
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
    }).format(now);
    dateEl.textContent = new Intl.DateTimeFormat('de-DE', {
      weekday: 'short',
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
    }).format(now);
  };

  updateClock();
  window.setInterval(updateClock, 1000);
})();
