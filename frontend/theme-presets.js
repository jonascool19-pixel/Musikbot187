(() => {
  const themes = [
    ['default', 'Dunkel', 'Violett', 'swatch-default'],
    ['blue', 'Blau', 'Klar & kühl', 'swatch-blue'],
    ['red', 'Rot', 'Kräftig & kontrastreich', 'swatch-red'],
    ['green', 'Grün', 'Ruhig & frisch', 'swatch-green']
  ];
  const storageKey = 'musikbot187.theme';
  let picker;
  let syncing = false;

  const currentTheme = () => localStorage.getItem(storageKey) || 'default';

  function applyTheme(theme) {
    const valid = themes.some(([id]) => id === theme) ? theme : 'default';
    document.body.dataset.theme = valid;
    localStorage.setItem(storageKey, valid);
    picker?.querySelectorAll('[data-theme-id]').forEach(button => {
      button.classList.toggle('active', button.dataset.themeId === valid);
    });
  }

  function close() {
    picker?.classList.remove('open');
  }

  function createPicker() {
    if (picker) return;
    picker = document.createElement('aside');
    picker.className = 'theme-picker';
    picker.innerHTML = `<div class="theme-picker-head"><div><strong>Oberfläche</strong><span>Wähle ein Farbschema. Deine Widget-Anordnung bleibt erhalten.</span></div><button class="icon-btn" type="button" data-theme-close aria-label="Oberfläche schließen">×</button></div><div class="theme-options"></div><div class="theme-picker-foot">Die Auswahl wird auf diesem Gerät gespeichert.</div>`;
    document.body.appendChild(picker);
    const options = picker.querySelector('.theme-options');
    for (const [id, title, hint, swatch] of themes) {
      const button = document.createElement('button');
      button.type = 'button';
      button.className = 'theme-option';
      button.dataset.themeId = id;
      button.innerHTML = `<span class="theme-swatch ${swatch}"></span><span><b>${title}</b><small>${hint}</small></span>`;
      button.addEventListener('click', () => applyTheme(id));
      options.appendChild(button);
    }
    picker.querySelector('[data-theme-close]').addEventListener('click', close);
  }

  function ensureButton() {
    if (syncing) return;
    const topActions = document.querySelector('.top-actions');
    if (!topActions) return;
    syncing = true;
    try {
      let button = document.querySelector('#themeQuick');
      if (!button) {
        button = document.createElement('button');
        button.id = 'themeQuick';
        button.className = 'icon-btn';
        button.type = 'button';
        button.title = 'Oberfläche';
        button.textContent = '◐';
        button.addEventListener('click', () => {
          if (!picker) createPicker();
          picker.classList.toggle('open');
        });
        topActions.insertBefore(button, topActions.querySelector('#settingsQuick') || null);
      }
      applyTheme(currentTheme());
    } finally {
      syncing = false;
    }
  }

  document.addEventListener('click', event => {
    if (!picker?.classList.contains('open')) return;
    if (picker.contains(event.target) || event.target.closest('#themeQuick')) return;
    close();
  });

  const observer = new MutationObserver(() => {
    if (syncing) return;
    ensureButton();
  });
  observer.observe(document.body, { childList: true, subtree: true });
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', () => { createPicker(); ensureButton(); applyTheme(currentTheme()); });
  else { createPicker(); ensureButton(); applyTheme(currentTheme()); }
})();
