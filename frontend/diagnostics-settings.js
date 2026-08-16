(() => {
  const STYLE_ID = 'diagnostics-settings-style';
  let scheduled = false;
  const saving = new WeakSet();

  const esc = value => String(value ?? '').replace(/[&<>\"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','\"':'&quot;',"'":'&#39;'}[c]));

  async function persistDiscordRuntime(form) {
    if (!form || saving.has(form)) return;
    const id = form.querySelector('[data-f="id"]')?.value;
    if (!id) return;
    const prefix = String(form.querySelector('[data-f="prefix"]')?.value || '!').trim().slice(0, 3) || '!';
    const intent = Boolean(form.querySelector('[data-f="messageContentIntent"]')?.checked);
    saving.add(form);
    try {
      const settings = {
        ...(state.settings || {}),
        discordPrefixes: { ...((state.settings || {}).discordPrefixes || {}), [id]: prefix },
        discordMessageContentIntent: { ...((state.settings || {}).discordMessageContentIntent || {}), [id]: intent }
      };
      const response = await fetch('/api/settings', { method: 'PUT', credentials: 'include', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ settings }) });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.error || `HTTP ${response.status}`);
      state.settings = settings;
      const dot = form.querySelector('.instance-live .dot');
      if (dot) dot.title = `Prefix: ${prefix}`;
      notify('Discord-Befehle gespeichert.', 'success');
    } catch (error) {
      notify(error.message, 'error');
    } finally {
      saving.delete(form);
    }
  }

  function addStyle() {
    if (document.getElementById(STYLE_ID)) return;
    const style = document.createElement('style');
    style.id = STYLE_ID;
    style.textContent = `.diagnostics-error-list{display:grid;gap:8px}.diagnostics-error-card{padding:10px;border:1px solid #402433;border-radius:9px;background:#160d12}.diagnostics-error-card .head{display:flex;justify-content:space-between;gap:10px;font-size:9px}.diagnostics-error-card .msg{margin-top:5px;color:#ffb1ba;font-size:10px;line-height:1.45}.diagnostics-error-card .time{color:#7f8b9a;font:8px ui-monospace,SFMono-Regular,Menlo,monospace}.diagnostics-empty{padding:18px;text-align:center;color:#7f8b9a}`;
    document.head.appendChild(style);
  }

  function renderErrors(view) {
    const rows = [];
    for (const instance of (state.instances || [])) {
      for (const entry of (instance.logs || [])) {
        if (entry?.level === 'ERROR') rows.push({ ...entry, instance: instance.name || instance.id || 'Discord' });
      }
    }
    rows.sort((a, b) => String(b.time).localeCompare(String(a.time)));
    view.innerHTML = `<div class="page-panel"><div class="page-head"><div><h2>Fehlermeldungen</h2><p class="muted">Gesammelte Fehler aus Discord- und anderen Instanzen.</p></div><button onclick="go('settings')">Zurück zu Einstellungen</button></div>${rows.length ? `<div class="diagnostics-error-list">${rows.map(e => `<div class="diagnostics-error-card"><div class="head"><strong>${esc(e.instance)}</strong><span class="time">${esc(e.time)}</span></div><div class="msg">${esc(e.message)}</div></div>`).join('')}</div>` : '<div class="diagnostics-empty">Keine Fehler protokolliert.</div>'}</div>`;
  }

  function ensure() {
    const tabs = document.querySelector('.settings-tabs');
    const view = document.querySelector('#settingsView');
    if (!tabs || !view) return;
    addStyle();

    if (!tabs.querySelector('[data-settab="errors"]')) {
      const button = document.createElement('button');
      button.type = 'button';
      button.dataset.settab = 'errors';
      button.textContent = 'Fehlermeldungen';
      button.addEventListener('click', () => {
        tabs.querySelectorAll('[data-settab]').forEach(tab => tab.classList.toggle('active', tab === button));
        renderErrors(view);
      });
      tabs.appendChild(button);
    }

    document.querySelectorAll('#discordForms .instance-form[data-kind="discord"]').forEach(form => {
      if (!form.querySelector('[data-f="prefix"]')) {
        const grid = form.querySelector('.form-grid');
        if (!grid) return;
        const wrapper = document.createElement('label');
        wrapper.innerHTML = '<span>Prefix</span><input data-f="prefix" maxlength="3" placeholder="!">';
        const stateInstance = (state.instances || []).find(x => x.id === form.querySelector('[data-f="id"]')?.value);
        wrapper.querySelector('input').value = stateInstance?.prefix || state.settings?.discordPrefixes?.[stateInstance?.id] || '!';
        grid.appendChild(wrapper);

        const intent = document.createElement('label');
        intent.innerHTML = '<span>Prefix-Befehle</span><input data-f="messageContentIntent" type="checkbox">';
        intent.querySelector('input').checked = stateInstance?.messageContentIntent !== false;
        grid.appendChild(intent);
      }
      const prefix = form.querySelector('[data-f="prefix"]');
      const intent = form.querySelector('[data-f="messageContentIntent"]');
      if (prefix && !prefix.dataset.boundRuntime) {
        prefix.dataset.boundRuntime = '1';
        prefix.addEventListener('change', () => persistDiscordRuntime(form));
        prefix.addEventListener('blur', () => persistDiscordRuntime(form));
      }
      if (intent && !intent.dataset.boundRuntime) {
        intent.dataset.boundRuntime = '1';
        intent.addEventListener('change', () => persistDiscordRuntime(form));
      }
    });
  }

  function schedule() {
    if (scheduled) return;
    scheduled = true;
    queueMicrotask(() => { scheduled = false; ensure(); });
  }

  new MutationObserver(schedule).observe(document.body, { childList: true, subtree: true });
  ensure();
})();
