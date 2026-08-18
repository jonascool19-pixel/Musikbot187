(() => {
  const ensureDesignLabel = () => {
    if (document.querySelector('#themeSelect, #accentColor')) {
      const existing = [...document.querySelectorAll('h2,h3,b,strong,label')].some(node => (node.textContent || '').trim() === 'Design');
      if (existing) return;
      const anchor = document.querySelector('#themeSelect')?.closest('section, .card, .grid, .row') || document.querySelector('#themeSelect')?.parentElement;
      if (!anchor) return;
      const heading = document.createElement('h2');
      heading.textContent = 'Design';
      heading.dataset.adminDesignHeading = 'true';
      anchor.parentElement?.insertBefore(heading, anchor);
    }
  };

  const schedule = () => setTimeout(ensureDesignLabel, 0);
  document.addEventListener('click', event => {
    if (event.target?.closest?.('[data-tab="admin"]')) schedule();
  }, true);
  new MutationObserver(schedule).observe(document.body, { childList: true, subtree: true });
  schedule();
})();
