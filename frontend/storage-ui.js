(() => {
  async function storageView() {
    try {
      const d = await api('/api/storage');
      const total = formatStorage(d.total);
      const used = formatStorage(d.used);
      const free = formatStorage(d.free);
      const pct = Math.min(100, Math.max(0, Number(d.percentUsed || 0)));
      const c = document.querySelector('#content');
      if (!c) return;
      c.innerHTML = `<div class="grid">
        <div class="card"><div class="muted">GESAMTSPEICHER</div><h2>${total}</h2><p class="muted">Speicher des Datenträgers, auf dem Musikbot 187 gespeichert ist.</p></div>
        <div class="card"><div class="muted">BELEGT</div><h2>${used}</h2><div class="bar"><i style="width:${pct}%"></i></div><p class="muted">${pct}% belegt</p></div>
        <div class="card"><div class="muted">NOCH FREI</div><h2>${free}</h2><p class="muted">Verfügbarer Speicher für neue Musik und Dateien.</p></div>
      </div>
      <div class="card"><div class="rowline"><div><h2>💾 Musik-Speicher</h2><span class="muted">Pfad: ${escapeStorage(d.path)}</span></div><span class="tag">${pct}% belegt</span></div><div class="bar large"><i style="width:${pct}%"></i></div><p class="muted">${free} stehen aktuell noch zur Verfügung.</p></div>`;
    } catch (e) {
      const c = document.querySelector('#content');
      if (c) c.innerHTML = `<div class="card"><h2>💾 Speicher</h2><p class="muted">Speicherinformationen konnten nicht geladen werden.</p><p>${escapeStorage(e?.message || e)}</p></div>`;
    }
  }
  function formatStorage(bytes) {
    const n = Number(bytes) || 0;
    if (n < 1024 ** 3) return `${(n / 1024 ** 2).toFixed(1)} MB`;
    if (n < 1024 ** 4) return `${(n / 1024 ** 3).toFixed(1)} GB`;
    return `${(n / 1024 ** 4).toFixed(2)} TB`;
  }
  function escapeStorage(value) {
    return String(value ?? '').replace(/[&<>"']/g, (c) => ({ '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;' }[c]));
  }
  window.storageView = storageView;
  function addStorageTab() {
    const tabs = document.querySelector('.tabs');
    if (!tabs || tabs.querySelector('[data-storage-tab]')) return;
    const b = document.createElement('button');
    b.type = 'button';
    b.textContent = '💾 Speicher';
    b.dataset.storageTab = '1';
    b.onclick = storageView;
    tabs.appendChild(b);
  }
  const originalSettingsView = window.settingsView;
  if (typeof originalSettingsView === 'function') {
    window.settingsView = async function () {
      await originalSettingsView();
      addStorageTab();
    };
  }
})();
