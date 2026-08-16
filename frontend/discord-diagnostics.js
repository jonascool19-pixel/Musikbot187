(() => {
  const STYLE_ID = 'discord-diagnostics-style';
  const PANEL_CLASS = 'discord-log-panel';
  const renderedSignatures = new WeakMap();

  function esc(value) {
    return String(value ?? '').replace(/[&<>\"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','\"':'&quot;',"'":'&#39;'}[c]));
  }

  function addStyle() {
    if (document.getElementById(STYLE_ID)) return;
    const style = document.createElement('style');
    style.id = STYLE_ID;
    style.textContent = `.discord-log-panel{margin-top:10px;border:1px solid #26384d;border-radius:10px;background:#0c1622;overflow:hidden}.discord-log-panel summary{cursor:pointer;padding:8px 10px;font-size:9px;color:#c9d4e2}.discord-log-body{max-height:240px;overflow:auto;padding:8px 10px;font:9px/1.5 ui-monospace,SFMono-Regular,Menlo,monospace;color:#9fb1c6;white-space:pre-wrap}.discord-log-error{color:#ff8c9a}.discord-log-info{color:#9bc7ff}`;
    document.head.appendChild(style);
  }

  function logsSignature(logs) {
    return logs.slice(-80).map(entry => `${entry.time ?? ''}|${entry.level ?? ''}|${entry.message ?? ''}`).join('\n');
  }

  function render() {
    addStyle();
    const cards = document.querySelectorAll('.instance-card[data-kind="discord"]');
    cards.forEach(card => {
      const id = card.querySelector('[data-f="id"]')?.value;
      const live = (state.instances || []).find(x => x.id === id);
      if (!live) return;

      let panel = card.querySelector(`.${PANEL_CLASS}`);
      if (!panel) {
        panel = document.createElement('details');
        panel.className = PANEL_CLASS;
        card.appendChild(panel);
      }

      const logs = Array.isArray(live.logs) ? live.logs : [];
      const signature = logsSignature(logs);
      const previous = renderedSignatures.get(panel);
      if (previous === signature && panel.querySelector('.discord-log-body')) return;

      renderedSignatures.set(panel, signature);
      panel.innerHTML = `<summary>Fehlerprotokoll & Diagnose${logs.length ? ` (${logs.length})` : ''}</summary><div class="discord-log-body">${logs.length ? logs.slice(-80).map(entry => `<div class="discord-log-${entry.level === 'ERROR' ? 'error' : 'info'}">[${esc(entry.time)}] ${esc(entry.level)} ${esc(entry.message)}</div>`).join('') : 'Noch keine Diagnoseeinträge vorhanden.'}</div>`;
    });
  }

  render();
  new MutationObserver(render).observe(document.body, { childList:true, subtree:true });
  window.setInterval(render, 2500);
})();
