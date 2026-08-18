(() => {
  const originalFetch = window.fetch.bind(window);

  function refreshConnectionsSoon() {
    window.setTimeout(() => {
      const active = document.querySelector('[data-tab="connections"].active, [data-tab="connections"]');
      if (document.body.dataset.currentTab === 'connections' || active?.classList.contains('active')) active?.click();
    }, 80);
  }

  window.fetch = async (...args) => {
    const input = args[0];
    const options = args[1] || {};
    const method = String(options.method || input?.method || 'GET').toUpperCase();
    const url = typeof input === 'string' ? input : input?.url || '';
    const response = await originalFetch(...args);
    if (method !== 'GET' && /^\/api\/(discord|ts3)(?:\/|$)/.test(url)) refreshConnectionsSoon();
    return response;
  };

  function applyLayout() {
    const style = document.querySelector('#musikbotUiPolishStyle') || document.createElement('style');
    style.id = 'musikbotUiPolishStyle';
    style.textContent = `
      .top > div:first-child > small { display: none !important; }
      .top h1 { margin-bottom: 0 !important; }
      nav { gap: 8px !important; padding: 10px 12px !important; }
      nav .navbtn, nav #logout {
        display: inline-flex !important;
        align-items: center !important;
        justify-content: flex-start !important;
        gap: 8px !important;
        min-width: 0 !important;
        width: auto !important;
        white-space: nowrap !important;
        padding: 10px 12px !important;
      }
      @media (min-width: 900px) {
        nav { flex-wrap: nowrap !important; }
        nav .navbtn, nav #logout { flex: 0 0 auto !important; }
      }
      @media (max-width: 899px) {
        nav { flex-wrap: wrap !important; }
      }
    `;
    if (!style.isConnected) document.head.appendChild(style);
  }

  applyLayout();
  new MutationObserver(applyLayout).observe(document.documentElement, { childList: true, subtree: true });
})();
