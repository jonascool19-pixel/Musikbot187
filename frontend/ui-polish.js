(() => {
  const originalFetch = window.fetch.bind(window);
  const returnTab = sessionStorage.getItem('musikbot187.returnTab');
  if (returnTab) sessionStorage.removeItem('musikbot187.returnTab');

  window.fetch = async (...args) => {
    const input = args[0];
    const options = args[1] || {};
    const method = String(options.method || input?.method || 'GET').toUpperCase();
    const url = typeof input === 'string' ? input : input?.url || '';
    const response = await originalFetch(...args);
    if (method !== 'GET' && /^\/api\/(discord|ts3)(?:\/|$)/.test(url) && response.ok) {
      const active = document.body.dataset.currentTab || document.querySelector('[data-tab].active')?.dataset.tab || 'connections';
      sessionStorage.setItem('musikbot187.returnTab', active);
      window.setTimeout(() => window.location.reload(), 120);
    }
    return response;
  };

  const style = document.createElement('style');
  style.id = 'musikbotUiPolishStyle';
  style.textContent = `
    .top > div:first-child > small { display: none !important; }
    .top h1 { margin-bottom: 0 !important; }
    nav { gap: 8px !important; padding: 10px 12px !important; }
    nav::before { content: '🎵  MusikBot187' !important; white-space: nowrap !important; }
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
    @media (min-width: 901px) {
      nav { width: 190px !important; }
      .top, main { margin-left: 190px !important; }
      .live-metrics { margin-left: 190px !important; }
      nav { flex-wrap: nowrap !important; }
      nav .navbtn, nav #logout { flex: 0 0 auto !important; }
    }
    @media (min-width: 701px) and (max-width: 900px) {
      nav { width: 178px !important; }
      .top, main { margin-left: 178px !important; }
      .live-metrics { margin-left: 178px !important; }
      nav { flex-wrap: wrap !important; }
    }
    @media (max-width: 700px) {
      nav::before { content: '🎵' !important; white-space: normal !important; }
    }
  `;
  document.head.appendChild(style);

  if (returnTab) {
    const restore = () => {
      const button = document.querySelector(`[data-tab="${CSS.escape(returnTab)}"]`);
      if (button) { button.click(); return true; }
      return false;
    };
    if (!restore()) {
      const timer = setInterval(() => { if (restore()) clearInterval(timer); }, 50);
      setTimeout(() => clearInterval(timer), 5000);
    }
  }
})();
