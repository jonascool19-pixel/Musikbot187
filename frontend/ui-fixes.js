(() => {
  const q = selector => document.querySelector(selector);
  const esc = value => String(value ?? '').replace(/[&<>\"']/g, char => ({ '&':'&amp;', '<':'&lt;', '>':'&gt;', '\"':'&quot;', "'":'&#39;' }[char]));
  const auth = () => window.MusikBotFetch?.getAuth?.() || '';
  const nativeFetch = () => window.MusikBotFetch?.nativeFetch || window.fetch.bind(window);

  const inviteUrl = clientId => {
    const id = String(clientId || '').trim();
    return /^\d{17,20}$/.test(id)
      ? `https://discord.com/oauth2/authorize?client_id=${encodeURIComponent(id)}&scope=bot%20applications.commands&permissions=36700160`
      : '';
  };

  const notice = text => window.dispatchEvent(new CustomEvent('musikbot187:notice', { detail: text }));

  async function copy(value) {
    if (!value) return;
    try { await navigator.clipboard.writeText(value); notice('Einladungslink wurde kopiert.'); }
    catch { window.prompt('Einladungslink', value); }
  }

  function hideAdminThemeSelect() {
    const theme = q('#at');
    const label = theme?.closest('label');
    if (label) label.hidden = true;
  }

  async function preserveGeneralSettingsSave() {
    const button = q('#as');
    if (!button || button.dataset.designFixWired) return;
    button.dataset.designFixWired = '1';
    button.onclick = async () => {
      const settings = window.__musikbotLastSnapshot?.state?.settings || {};
      const currentTheme = document.body.dataset.themeName || settings.theme || 'dark';
      const currentAccent = settings.accentColor || window.MusikBotThemes?.customAccent?.() || '';
      const headers = new Headers({ 'Content-Type': 'application/json' });
      const authorization = auth();
      if (authorization) headers.set('Authorization', authorization);
      try {
        const response = await nativeFetch()('/api/settings', {
          method: 'PUT',
          headers,
          body: JSON.stringify({
            volume: Number(q('#av')?.value || 0),
            mode: q('#am')?.value || 'queue',
            outputType: q('#ao')?.value || 'none',
            outputId: q('#ai')?.value || '',
            networkInterface: q('#an')?.value || '',
            filesDirectory: q('#ad')?.value || '',
            theme: currentTheme,
            accentColor: currentAccent
          })
        });
        const body = await response.json().catch(() => ({}));
        if (!response.ok) throw new Error(body.error || `HTTP ${response.status}`);
        notice('Allgemeine Einstellungen gespeichert.');
      } catch (error) { notice(error.message); }
    };
  }

  function addDiscordInstanceActions() {
    if (document.body.dataset.currentTab !== 'connections') return;
    document.querySelectorAll('article.card').forEach(card => {
      const edit = card.querySelector('[data-de]');
      const invite = card.querySelector('[data-dinvite]');
      if (!edit || !invite || card.querySelector('.instance-actions')) return;
      const clientId = invite.dataset.dinvite || '';
      const row = document.createElement('div');
      row.className = 'controls instance-actions';
      row.innerHTML = `
        <button type="button" data-ix-add>🤖 Bot hinzufügen</button>
        <button type="button" data-ix-link>🔗 Einladungslink</button>
        <button type="button" data-ix-server>🌐 Server laden</button>
        <button type="button" data-ix-voice>🔊 Voice laden</button>`;
      card.appendChild(row);
      row.querySelector('[data-ix-add]').onclick = () => {
        const url = inviteUrl(clientId);
        if (!url) return notice('Keine gültige Bot-ID gespeichert.');
        window.open(url, '_blank', 'noopener,noreferrer');
      };
      row.querySelector('[data-ix-link]').onclick = () => copy(inviteUrl(clientId));
      row.querySelector('[data-ix-server]').onclick = async () => {
        edit.click();
        setTimeout(() => q('#dgrefresh')?.click(), 50);
      };
      row.querySelector('[data-ix-voice]').onclick = async () => {
        edit.click();
        setTimeout(() => q('#dvrefresh')?.click(), 70);
      };
    });
  }

  function addNewInstanceShortcut() {
    if (document.body.dataset.currentTab !== 'connections') return;
    const heading = [...document.querySelectorAll('h2')].find(node => node.textContent.trim() === 'Discord');
    const host = heading?.closest('section')?.querySelector('.sectionhead');
    if (!host || host.querySelector('[data-new-discord]')) return;
    const button = document.createElement('button');
    button.type = 'button';
    button.dataset.newDiscord = '1';
    button.textContent = '＋ Neue Discord-Instanz';
    button.onclick = () => q('#dnew')?.click();
    host.appendChild(button);
  }

  function applyCurrentTabFixes() {
    if (document.body.dataset.currentTab === 'connections') {
      addDiscordInstanceActions();
      addNewInstanceShortcut();
    }
    if (document.body.dataset.currentTab === 'admin') {
      hideAdminThemeSelect();
      preserveGeneralSettingsSave();
    }
  }

  document.addEventListener('click', event => {
    const target = event.target?.closest?.('[data-tab]');
    if (target?.dataset.tab === 'connections' || target?.dataset.tab === 'admin') {
      window.setTimeout(applyCurrentTabFixes, 60);
    }
  });

  window.setTimeout(applyCurrentTabFixes, 250);
  window.setInterval(applyCurrentTabFixes, 1000);
})();
