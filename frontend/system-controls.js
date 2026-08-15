(() => {
  const esc = v => String(v ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const api = async (url, options = {}) => {
    const r = await fetch(url, { headers: { 'Content-Type': 'application/json', ...(options.headers || {}) }, ...options });
    if (!r.ok) throw new Error(await r.text());
    return r.status === 204 ? null : r.json();
  };
  const style = document.createElement('style');
  style.textContent = '.system-modal{position:fixed;inset:0;background:rgba(2,6,23,.82);backdrop-filter:blur(10px);display:none;align-items:center;justify-content:center;padding:20px;z-index:1100}.system-modal.open{display:flex}.system-box{width:min(640px,100%);background:#0f172a;border:1px solid rgba(148,163,184,.18);border-radius:20px;padding:22px;box-shadow:0 24px 80px rgba(0,0,0,.5)}.system-grid{display:grid;grid-template-columns:1fr 1fr;gap:12px;margin-top:18px}.system-btn{padding:13px 14px;border:0;border-radius:10px;cursor:pointer}.system-muted{color:#94a3b8;font-size:.88rem}.system-danger{background:#7f1d1d;color:#fff}.system-warn{background:#92400e;color:#fff}.system-ok{background:#14532d;color:#fff}@media(max-width:650px){.system-grid{grid-template-columns:1fr}}';
  document.head.appendChild(style);
  const modal = document.createElement('div');
  modal.className = 'system-modal';
  modal.innerHTML = `<div class="system-box"><div class="row" style="justify-content:space-between"><div><div class="eyebrow">SYSTEM</div><h2 style="margin:.25rem 0">Bot & Server</h2></div><button id="systemClose">✕</button></div><p class="system-muted">Bot deaktivieren lässt das Dashboard online. Server-Neustart und Herunterfahren betreffen das komplette Ubuntu-System.</p><div class="system-grid"><button id="botDisable" class="system-btn system-warn">🛑 Bot deaktivieren</button><button id="botEnable" class="system-btn system-ok">✅ Bot aktivieren</button><button id="botRestart" class="system-btn">🔄 Bot neu starten</button><button id="serverReboot" class="system-btn system-warn">♻️ Ubuntu neu starten</button><button id="serverShutdown" class="system-btn system-danger">⏻ Ubuntu herunterfahren</button></div><p id="systemStatus" class="system-muted" style="margin-top:16px">Bereit.</p></div>`;
  document.body.appendChild(modal);
  const $ = id => document.getElementById(id);
  const close = () => modal.classList.remove('open');
  const run = async (url, message, reloadMs = 0) => {
    try {
      $('systemStatus').textContent = message;
      await api(url, { method: 'POST' });
      $('systemStatus').textContent = 'Befehl angenommen.';
      if (reloadMs) setTimeout(() => location.reload(), reloadMs);
    } catch (e) {
      $('systemStatus').textContent = `Fehler: ${esc(e.message)}`;
    }
  };
  $('systemOpen')?.addEventListener('click', () => modal.classList.add('open'));
  $('systemClose').addEventListener('click', close);
  modal.addEventListener('click', e => { if (e.target === modal) close(); });
  $('botDisable').addEventListener('click', () => { if (confirm('Bot wirklich deaktivieren? Die Discord-Steuerung wird pausiert, das Dashboard bleibt online.')) run('/api/system/bot/disable', 'Bot wird deaktiviert.'); });
  $('botEnable').addEventListener('click', () => run('/api/system/bot/enable', 'Bot wird aktiviert.'));
  $('botRestart').addEventListener('click', () => { if (confirm('Bot-Dienst wirklich neu starten? Die Weboberfläche ist kurz nicht erreichbar.')) run('/api/system/restart', 'Bot wird neu gestartet.', 7000); });
  $('serverReboot').addEventListener('click', () => { if (confirm('Den kompletten Ubuntu-Server wirklich neu starten?')) run('/api/system/reboot', 'Ubuntu wird neu gestartet.', 20000); });
  $('serverShutdown').addEventListener('click', () => { if (confirm('Den kompletten Ubuntu-Server wirklich herunterfahren?')) run('/api/system/shutdown', 'Ubuntu wird heruntergefahren.'); });
})();
