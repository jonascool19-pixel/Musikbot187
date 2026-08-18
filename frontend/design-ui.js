(() => {
  const q = selector => document.querySelector(selector);
  const esc = value => String(value ?? '').replace(/[&<>\"']/g, char => ({ '&':'&amp;', '<':'&lt;', '>':'&gt;', '\"':'&quot;', "'":'&#39;' }[char]));
  const nativeFetch = () => window.MusikBotFetch?.nativeFetch || window.fetch.bind(window);
  const auth = () => window.MusikBotFetch?.getAuth?.() || '';
  const api = (path, options = {}) => {
    const headers = new Headers(options.headers || {});
    const authorization = auth();
    if (authorization && !headers.has('Authorization')) headers.set('Authorization', authorization);
    options.headers = headers;
    return nativeFetch()(path, options).then(async response => {
      const body = await response.json().catch(() => ({}));
      if (!response.ok) throw Error(body.error || `HTTP ${response.status}`);
      return body;
    });
  };
  const put = (path, body) => api(path, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
  const note = message => {
    const node = q('#notice');
    if (!node) return;
    node.textContent = message;
    node.classList.add('show');
    clearTimeout(window.__musikbotDesignNotice);
    window.__musikbotDesignNotice = setTimeout(() => node.classList.remove('show'), 3500);
  };

  async function loadSettings() {
    const state = await api('/api/state');
    return state.settings || {};
  }

  function applyTheme(name, accent) {
    const theme = window.MusikBotThemes?.apply(name || 'dark', accent || '') || {};
    document.body.dataset.theme = theme.mode || 'dark';
    document.body.dataset.themeName = name || 'dark';
    if ((name === 'dark' || name === 'light') && accent && window.MusikBotThemes) {
      window.MusikBotThemes.saveCustomAccent(accent);
    }
  }

  function addNavButton() {
    const nav = q('nav');
    if (!nav || q('[data-design-tab]')) return;
    const button = document.createElement('button');
    button.className = 'navbtn';
    button.dataset.tab = 'design';
    button.dataset.designTab = '1';
    button.textContent = '🎨 Design';
    const playlist = nav.querySelector('[data-tab="playlists"]');
    if (playlist?.nextSibling) nav.insertBefore(button, playlist.nextSibling);
    else nav.insertBefore(button, nav.firstChild);
    button.addEventListener('click', openDesign);
  }

  function setActive() {
    document.querySelectorAll('nav .navbtn').forEach(button => button.classList.toggle('active', button === q('[data-design-tab]')));
    document.body.dataset.currentTab = 'design';
  }

  function render(settings) {
    const theme = settings.theme || 'dark';
    const accent = settings.accentColor || window.MusikBotThemes?.customAccent?.() || '#0b69b3';
    q('#view').innerHTML = `<section class="design-page"><div class="sectionhead"><div><h2>🎨 Design</h2><small>Theme, Hell/Dunkel-Modus und Akzentfarbe</small></div></div><div class="theme-grid"><label>Theme<select id="designTheme">${window.MusikBotThemes?.options?.() || ''}</select></label><label>Akzentfarbe<input id="designAccent" type="color" value="${esc(accent)}"></label><button id="designReset">Akzentfarbe zurücksetzen</button><button id="designSave">Design speichern</button></div></section>`;
    q('#designTheme').value = theme;
    q('#designTheme').addEventListener('change', event => applyTheme(event.target.value, q('#designAccent').value));
    q('#designAccent').addEventListener('input', event => applyTheme(q('#designTheme').value, event.target.value));
    q('#designReset').addEventListener('click', () => {
      q('#designAccent').value = '#0b69b3';
      applyTheme(q('#designTheme').value, '#0b69b3');
    });
    q('#designSave').addEventListener('click', async () => {
      try {
        const nextTheme = q('#designTheme').value;
        const nextAccent = q('#designAccent').value;
        await put('/api/settings', { theme: nextTheme, accentColor: nextAccent });
        applyTheme(nextTheme, nextAccent);
        note('Design gespeichert.');
      } catch (error) {
        note(error.message || String(error));
      }
    });
  }

  async function openDesign() {
    setActive();
    try {
      const settings = await loadSettings();
      render(settings);
      applyTheme(settings.theme || 'dark', settings.accentColor || window.MusikBotThemes?.customAccent?.() || '');
    } catch (error) {
      note(error.message || String(error));
    }
  }

  const observer = new MutationObserver(() => addNavButton());
  observer.observe(document.documentElement, { childList: true, subtree: true });
  const start = () => {
    addNavButton();
    if (q('[data-design-tab]')) observer.disconnect();
    else setTimeout(start, 250);
  };
  start();
})();
