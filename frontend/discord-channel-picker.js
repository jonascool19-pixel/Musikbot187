(() => {
  const esc = value => String(value ?? '').replace(/[&<>\"']/g, char => ({ '&':'&amp;', '<':'&lt;', '>':'&gt;', '\"':'&quot;', "'":'&#39;' }[char]));

  function activeInstance(id) {
    return (state.instances || []).find(instance => instance.id === id) || null;
  }

  async function refreshForm(form, replacement, input, field) {
    notify('Discord-Daten werden neu gelesen…', 'info');
    try {
      state = await api('/api/state');
      form.dataset.channelPicker = '';
      replacement.remove();
      field?.appendChild(input);
      applyPicker(form);
      const current = activeInstance(form.querySelector('[data-f="id"]')?.value || '');
      if (current?.voiceChannels?.length) notify(`${current.voiceChannels.length} Sprachkanäle gefunden.`, 'success');
      else notify('Keine Sprachkanäle gefunden. Prüfe Guild-ID und Discord-Rechte.', 'error');
    } catch (error) {
      notify(error.message, 'error');
    }
  }

  function applyPicker(form) {
    if (!form || form.dataset.channelPicker === '1') return;
    if (form.dataset.kind !== 'discord') return;
    const input = form.querySelector('[data-f="voiceChannelId"]');
    const idInput = form.querySelector('[data-f="id"]');
    if (!input || !idInput) return;
    const instance = activeInstance(idInput.value);
    if (!instance) return;
    form.dataset.channelPicker = '1';

    const field = input.closest('label');
    const channels = Array.isArray(instance.voiceChannels) ? instance.voiceChannels : [];
    const guilds = Array.isArray(instance.guilds) ? instance.guilds : [];
    const current = input.value || '';
    const replacement = document.createElement('div');
    replacement.className = 'discord-channel-picker';
    replacement.innerHTML = `<div class="discord-channel-row"><select data-f="voiceChannelId" aria-label="Discord Sprachkanal"><option value="">${channels.length ? 'Kanal auswählen…' : 'Keine Sprachkanäle gefunden'}</option>${channels.map(channel => `<option value="${esc(channel.id)}" ${channel.id === current ? 'selected' : ''}>${esc(channel.name)}${channel.type === 13 ? ' · Bühne' : ''}</option>`).join('')}</select><button type="button" class="ghost discord-channel-refresh" title="Discord-Kanäle aktualisieren">↻</button></div><small class="discord-channel-hint">${channels.length ? `${channels.length} Sprachkanäle aus dem Discord-Server gefunden.` : guilds.length ? `Bot ist in: ${guilds.map(g => `${esc(g.name)} (${esc(g.id)})`).join(', ')}. Prüfe die Guild-ID.` : 'Bot ist mit keinem Discord-Server verbunden oder die Guild-ID ist falsch.'}</small>`;

    input.remove();
    field?.appendChild(replacement);
    replacement.querySelector('select')?.addEventListener('change', event => { input.value = event.target.value; });
    replacement.querySelector('.discord-channel-refresh')?.addEventListener('click', async () => refreshForm(form, replacement, input, field));
  }

  function scan() {
    document.querySelectorAll('.instance-card[data-kind="discord"]').forEach(applyPicker);
  }

  new MutationObserver(scan).observe(document.body, { childList: true, subtree: true });
  scan();
})();
