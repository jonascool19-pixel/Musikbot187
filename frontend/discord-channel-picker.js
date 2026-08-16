(() => {
  const DISABLED = '__RADIOBOT_DISABLED__';
  const seen = new WeakSet();
  const esc = value => String(value ?? '').replace(/[&<>\"']/g, char => ({ '&':'&amp;', '<':'&lt;', '>':'&gt;', '\"':'&quot;', "'":'&#39;' }[char]));

  function activeInstance(id) {
    return (state.instances || []).find(instance => instance.id === id) || null;
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
    const current = input.value || '';
    const replacement = document.createElement('div');
    replacement.className = 'discord-channel-picker';
    replacement.innerHTML = `<div class="discord-channel-row"><select data-f="voiceChannelId" aria-label="Discord Sprachkanal"><option value="">Kanal auswählen…</option>${channels.map(channel => `<option value="${esc(channel.id)}" ${channel.id === current ? 'selected' : ''}>${esc(channel.name)}${channel.type === 13 ? ' · Bühne' : ''}</option>`).join('')}</select><button type="button" class="ghost discord-channel-refresh" title="Discord-Kanäle aktualisieren">↻</button></div><small class="discord-channel-hint">Discord-Kanäle werden aus dem ausgewählten Server gelesen.</small>`;
    if (!channels.length) {
      replacement.querySelector('select').disabled = true;
      replacement.querySelector('select').insertAdjacentHTML('beforeend', '<option>Keine Sprachkanäle gefunden</option>');
    }
    input.remove();
    field?.appendChild(replacement);
    replacement.querySelector('select')?.addEventListener('change', event => {
      input.value = event.target.value;
    });
    replacement.querySelector('.discord-channel-refresh')?.addEventListener('click', async () => {
      notify('Discord-Kanäle werden neu gelesen…', 'info');
      try {
        state = await api('/api/state');
        form.dataset.channelPicker = '';
        replacement.remove();
        field?.appendChild(input);
        applyPicker(form);
        notify('Discord-Kanäle aktualisiert.', 'success');
      } catch (error) {
        notify(error.message, 'error');
      }
    });
  }

  function scan() {
    document.querySelectorAll('.instance-card[data-kind="discord"]').forEach(applyPicker);
  }

  const observer = new MutationObserver(scan);
  observer.observe(document.body, { childList: true, subtree: true });
  scan();
})();