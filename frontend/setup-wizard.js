(() => {
  const q = new URLSearchParams(location.search);
  const hash = new URLSearchParams(location.hash.replace(/^#/, ''));
  const setupCode = q.get('setup') || hash.get('setup') || '';
  const esc = v => String(v ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const api = async (url, options = {}) => { const r = await fetch(url, { headers: {'Content-Type':'application/json', ...(options.headers || {})}, ...options }); if (!r.ok) throw new Error(await r.text()); return r.status === 204 ? null : r.json(); };
  const style = document.createElement('style');
  style.textContent = `.setup-overlay{position:fixed;inset:0;background:rgba(2,6,23,.82);backdrop-filter:blur(12px);z-index:9999;display:grid;place-items:center;padding:20px}.setup-card{width:min(760px,100%);max-height:92vh;overflow:auto;background:#0f172a;border:1px solid #334155;border-radius:22px;padding:28px;box-shadow:0 24px 80px rgba(0,0,0,.45)}.setup-card h1{margin:0 0 8px}.setup-card p{color:#94a3b8}.setup-grid{display:grid;grid-template-columns:1fr 1fr;gap:14px}.setup-card label{display:grid;gap:7px;color:#cbd5e1;font-size:13px}.setup-card input{width:100%;box-sizing:border-box;padding:12px;border-radius:10px;border:1px solid #334155;background:#020617;color:#f8fafc}.setup-wide{grid-column:1/-1}.setup-actions{display:flex;justify-content:flex-end;gap:10px;margin-top:20px}.setup-card button{padding:12px 18px;border:0;border-radius:10px;cursor:pointer}.setup-primary{background:#38bdf8;color:#082f49}.setup-note{font-size:12px;color:#64748b}.setup-step{display:inline-flex;padding:5px 9px;border-radius:999px;background:#082f49;color:#7dd3fc;font-size:12px;font-weight:600;margin-bottom:10px}@media(max-width:700px){.setup-grid{grid-template-columns:1fr}}`;
  document.head.appendChild(style);

  function open(settings = false, status = {}) {
    const old = document.querySelector('.setup-overlay'); if (old) old.remove();
    const userFirst = !settings && !status.webConfigured;
    const overlay = document.createElement('div'); overlay.className='setup-overlay';
    const title = userFirst ? 'Benutzer anlegen' : (settings ? 'Bot konfigurieren' : 'Ersteinrichtung abschließen');
    const intro = userFirst
      ? 'Bevor Discord, Spotify, YouTube oder andere Bot-Dienste eingerichtet werden, musst du zuerst den Web-Benutzer für das Dashboard anlegen.'
      : (settings ? 'Alle wichtigen Zugangsdaten können hier geändert werden. Nach dem Speichern startet der Bot automatisch neu.' : 'Der Web-Benutzer ist bereits vorhanden. Melde dich mit ihm an und schließe jetzt die Bot-Konfiguration ab.');
    const step = userFirst ? 'Schritt 1 von 2' : (settings ? 'Einstellungen' : 'Schritt 2 von 2');
    const setupFields = `<label>Discord Bot Token<input name="discordToken" type="password" autocomplete="off" required></label>
      <label>Web-Benutzer<input name="webUser" value="${esc(status.webUser || '')}" autocomplete="username" readonly></label>
      <label>Web-Passwort<input name="webPassword" type="password" minlength="12" autocomplete="current-password" required></label>
      <label>Discord Control Role ID<input name="discordControlRole" placeholder="optional"></label>
      <label>Port<input name="port" type="number" min="1" max="65535" value="3000"></label>
      <label class="setup-wide">Öffentliche URL<input name="publicUrl" placeholder="https://musik.example.de"></label>
      <label>Spotify Client ID<input name="spotifyClientId" autocomplete="off"></label>
      <label>Spotify Client Secret<input name="spotifyClientSecret" type="password" autocomplete="off"></label>
      <label>Spotify Redirect URI<input name="spotifyRedirectUri" placeholder="https://deine-domain/api/spotify/callback"></label>
      <label>YouTube API Key<input name="youtubeApiKey" type="password" autocomplete="off"></label>`;
    overlay.innerHTML = `<div class="setup-card"><div class="eyebrow">MusikBot187 · ${esc(step)}</div><h1>${esc(title)}</h1><p>${esc(intro)}</p><form class="setup-grid">
      ${userFirst ? `<input type="hidden" name="setupToken" value="${esc(setupCode)}"><label>Benutzername<input name="webUser" value="admin" autocomplete="username" required maxlength="64"></label><label>Passwort<input name="webPassword" type="password" minlength="12" autocomplete="new-password" required placeholder="mindestens 12 Zeichen"></label><label>Passwort wiederholen<input name="webPasswordConfirm" type="password" minlength="12" autocomplete="new-password" required placeholder="Passwort wiederholen"></label><div class="setup-wide setup-note">Dieser Benutzer schützt danach das Dashboard und ist Voraussetzung für die restliche Ersteinrichtung.</div>` : (settings ? '' : `<input type="hidden" name="setupToken" value="${esc(setupCode)}">${setupFields}`)}
      ${settings ? setupFields : ''}
      <div class="setup-wide setup-note">Zugangsdaten und API-Schlüssel werden mit restriktiven Dateirechten in /etc/radiobot/radiobot.env abgelegt. Für einen öffentlichen Zugang HTTPS verwenden.</div>
      <div class="setup-wide setup-actions"><button type="button" class="setup-cancel">Abbrechen</button><button class="setup-primary">${userFirst ? 'Benutzer erstellen' : (settings ? 'Speichern & Neustart' : 'Ersteinrichtung abschließen')}</button></div>
    </form></div>`;
    document.body.appendChild(overlay);
    const form = overlay.querySelector('form');
    if (settings) api('/api/settings').then(s => { for (const [k,v] of Object.entries(s)) { const el=form.elements[k]; if(el && typeof v === 'string') el.value=v; } }).catch(()=>{});
    overlay.querySelector('.setup-cancel').onclick = () => overlay.remove();
    form.onsubmit = async e => {
      e.preventDefault();
      const data=Object.fromEntries(new FormData(form).entries());
      if (userFirst && data.webPassword !== data.webPasswordConfirm) { alert('Die Passwörter stimmen nicht überein.'); return; }
      delete data.webPasswordConfirm;
      if (!userFirst && !settings) data.webUser = status.webUser || '';
      if (!userFirst) data.port=Number(data.port||3000);
      try {
        const endpoint = userFirst ? '/api/setup/user' : (settings ? '/api/settings' : '/api/setup');
        const r=await api(endpoint,{method:'POST',body:JSON.stringify(data)});
        form.innerHTML=`<div class="setup-wide"><h2>${userFirst ? 'Benutzer erstellt' : 'Gespeichert'}</h2><p>${esc(r.message)}</p>${userFirst ? '<p>Bitte danach die Seite neu laden. Dein Browser fordert dann Benutzername und Passwort an. Anschließend erscheint Schritt 2.</p>' : '<p>Bitte einige Sekunden warten und die Seite neu laden.</p>'}</div>`;
        if (!userFirst) setTimeout(()=>location.href='/',9000);
      } catch(err) { alert(err.message); }
    };
  }

  api('/api/setup/status').then(s => {
    if (s.requiresSetup && setupCode) open(false, s);
    const header = document.querySelector('header .row');
    if (header && !document.getElementById('settings') && s.webConfigured) { const b=document.createElement('button'); b.id='settings'; b.textContent='Einstellungen'; b.onclick=()=>open(true,s); header.prepend(b); }
  }).catch(()=>{});
})();
