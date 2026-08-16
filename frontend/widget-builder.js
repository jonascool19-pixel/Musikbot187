(() => {
  const widgets = [
    ['hero','▶','Aktueller Titel','Aktuelle Wiedergabe'],
    ['search','⌕','Suche','Musik suchen'],
    ['radio','◉','Radio','Radiosender'],
    ['system','◒','Systemauslastung','CPU, RAM, Netzwerk'],
    ['queue','☷','Warteschlange','Nächste Titel'],
    ['discord','◌','Discord','Discord-Status'],
    ['ts3','◍','TeamSpeak 3','TS3-Status'],
    ['media','♫','Medien','Mediensteuerung'],
    ['playlists','≡','Playlists','Wiedergabelisten'],
    ['spotify','●','Spotify','Spotify-Status'],
    ['youtube','▶','YouTube','YouTube-Status'],
    ['update','↻','Aktualisierungen','Version & Updates'],
    ['quick','✦','Schnellzugriff','Direkte Aktionen'],
    ['mode','◐','Wiedergabemodus','Lautstärke & Modus']
  ];
  let toolbar;
  let builderOpen = false;
  let saveTimer = 0;

  const api = async (url, options = {}) => {
    const response = await fetch(url, { credentials:'include', headers:{'Content-Type':'application/json', ...(options.headers || {})}, ...options });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(data.error || `HTTP ${response.status}`);
    return data;
  };

  const toast = message => {
    const node = document.createElement('div');
    node.className = 'widget-builder-toast';
    node.textContent = message;
    document.body.appendChild(node);
    setTimeout(() => node.remove(), 2200);
  };

  function tileContainer() {
    const tile = document.querySelector('[data-tile]');
    return tile?.parentElement || null;
  }

  function currentOrder() {
    const container = tileContainer();
    return container ? [...container.querySelectorAll(':scope > [data-tile]')].map(el => el.dataset.tile).filter(Boolean) : [];
  }

  async function persist(order) {
    clearTimeout(saveTimer);
    saveTimer = window.setTimeout(async () => {
      try {
        await api('/api/ui/layout', { method:'PUT', body:JSON.stringify({ order }) });
        toast('Layout gespeichert');
      } catch (error) {
        toast(`Layout konnte nicht gespeichert werden: ${error.message}`);
      }
    }, 120);
  }

  function addRemoveButtons(container) {
    container.querySelectorAll(':scope > [data-tile]').forEach(tile => {
      const head = tile.querySelector('.tile-head');
      if (!head || head.querySelector('.widget-remove')) return;
      const button = document.createElement('button');
      button.type = 'button';
      button.className = 'widget-remove';
      button.textContent = 'Entfernen';
      button.title = 'Widget vom Dashboard entfernen';
      button.addEventListener('click', async event => {
        event.preventDefault();
        event.stopPropagation();
        const id = tile.dataset.tile;
        if (!window.confirm(`Widget „${id}“ vom Dashboard entfernen?`)) return;
        tile.remove();
        await persist(currentOrder());
      });
      head.appendChild(button);
    });
  }

  function wireTileDrop(container) {
    const tiles = [...container.querySelectorAll(':scope > [data-tile]')];
    tiles.forEach(tile => {
      tile.addEventListener('dragover', event => {
        if (!event.dataTransfer.types.includes('application/x-musikbot-widget')) return;
        event.preventDefault();
        const dragging = container.querySelector('.widget-palette-dragging');
        if (dragging === tile) return;
        const box = tile.getBoundingClientRect();
        const after = event.clientY > box.top + box.height / 2;
        container.insertBefore(dragging, after ? tile.nextSibling : tile);
      });
      tile.addEventListener('drop', event => {
        if (!event.dataTransfer.types.includes('application/x-musikbot-widget')) return;
        event.preventDefault();
        persist(currentOrder());
      });
    });
  }

  async function addWidget(id) {
    const order = currentOrder();
    if (order.includes(id)) {
      toast('Dieses Widget ist bereits auf dem Dashboard.');
      return;
    }
    order.push(id);
    try {
      await api('/api/ui/layout', { method:'PUT', body:JSON.stringify({ order }) });
      toast('Widget hinzugefügt');
      window.go?.('dashboard');
    } catch (error) {
      toast(`Widget konnte nicht hinzugefügt werden: ${error.message}`);
    }
  }

  function createToolbar() {
    toolbar = document.createElement('aside');
    toolbar.id = 'widgetBuilderToolbar';
    toolbar.className = 'widget-builder-toolbar';
    toolbar.innerHTML = `<div class="widget-builder-head"><div><strong>Dashboard-Baukasten</strong><small>Widgets per Drag & Drop platzieren</small></div><button class="widget-builder-close" type="button" aria-label="Baukasten schließen">×</button></div><div class="widget-palette"></div><div class="widget-builder-actions"><button type="button" class="ghost" data-builder-reset>Zurücksetzen</button><button type="button" class="primary" data-builder-save>Speichern</button></div><div class="widget-builder-hint">Ziehe ein Widget aus der Liste auf das Dashboard. Vorhandene Kacheln kannst du im Baukasten neu sortieren oder entfernen.</div>`;
    document.body.appendChild(toolbar);
    const palette = toolbar.querySelector('.widget-palette');
    widgets.forEach(([id, icon, title, hint]) => {
      const item = document.createElement('div');
      item.className = 'widget-palette-item';
      item.draggable = true;
      item.dataset.widgetId = id;
      item.innerHTML = `<span class="widget-palette-icon">${icon}</span><span class="widget-palette-text"><b>${title}</b><span>${hint}</span></span>`;
      item.addEventListener('dragstart', event => {
        event.dataTransfer.effectAllowed = 'copy';
        event.dataTransfer.setData('application/x-musikbot-widget', id);
        item.classList.add('widget-palette-dragging');
      });
      item.addEventListener('dragend', () => item.classList.remove('widget-palette-dragging'));
      item.addEventListener('dblclick', () => addWidget(id));
      palette.appendChild(item);
    });
    toolbar.querySelector('.widget-builder-close').addEventListener('click', closeBuilder);
    toolbar.querySelector('[data-builder-save]').addEventListener('click', () => persist(currentOrder()));
    toolbar.querySelector('[data-builder-reset]').addEventListener('click', async () => {
      const defaults = ['hero','discord','search','radio','system','queue','media','playlists','spotify','youtube','update'];
      try {
        await api('/api/ui/layout', { method:'PUT', body:JSON.stringify({ order: defaults }) });
        toast('Standard-Layout wiederhergestellt');
        window.go?.('dashboard');
      } catch (error) { toast(error.message); }
    });
  }

  function openBuilder() {
    if (!toolbar) createToolbar();
    const container = tileContainer();
    if (!container) return toast('Der Dashboard-Baukasten ist nur auf der Startseite verfügbar.');
    builderOpen = true;
    document.body.classList.add('dashboard-builder-active');
    toolbar.classList.add('open');
    addRemoveButtons(container);
    wireTileDrop(container);
  }

  function closeBuilder() {
    builderOpen = false;
    document.body.classList.remove('dashboard-builder-active');
    toolbar?.classList.remove('open');
  }

  function ensureButton() {
    const topActions = document.querySelector('.top-actions');
    const dashboard = document.querySelector('[data-tile]');
    if (!topActions || !dashboard) {
      document.querySelector('#widgetBuilderButton')?.classList.remove('visible');
      return;
    }
    let button = document.querySelector('#widgetBuilderButton');
    if (!button) {
      button = document.createElement('button');
      button.id = 'widgetBuilderButton';
      button.className = 'widget-builder-button icon-btn';
      button.type = 'button';
      button.title = 'Dashboard-Baukasten';
      button.textContent = '✦';
      button.addEventListener('click', () => builderOpen ? closeBuilder() : openBuilder());
      topActions.insertBefore(button, topActions.querySelector('#settingsQuick') || null);
    }
    button.classList.add('visible');
    if (builderOpen) {
      const container = tileContainer();
      if (container) { addRemoveButtons(container); wireTileDrop(container); }
    }
  }

  document.addEventListener('dragover', event => {
    const id = event.dataTransfer?.types?.includes('application/x-musikbot-widget');
    if (!id) return;
    const container = tileContainer();
    if (!container) return;
    event.preventDefault();
    if (!event.target.closest('[data-tile]') && event.target.closest('.tiles, .dashboard-grid, main, #content')) {
      container.classList.add('widget-drop-placeholder');
    }
  });
  document.addEventListener('drop', async event => {
    const id = event.dataTransfer?.getData('application/x-musikbot-widget');
    if (!id) return;
    const container = tileContainer();
    container?.classList.remove('widget-drop-placeholder');
    if (!container) return;
    if (!event.target.closest('[data-tile]')) {
      event.preventDefault();
      await addWidget(id);
    }
  });
  document.addEventListener('dragleave', event => {
    if (!event.relatedTarget) document.querySelectorAll('.widget-drop-placeholder').forEach(x => x.classList.remove('widget-drop-placeholder'));
  });

  const observer = new MutationObserver(() => ensureButton());
  observer.observe(document.body, { childList:true, subtree:true });
  ensureButton();
})();
