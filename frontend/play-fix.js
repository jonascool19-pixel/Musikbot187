(() => {
  // Make the visible Play buttons start the selected source immediately.
  window.playInput = async function playInputImmediate(input) {
    try {
      await api('/api/play', {
        method: 'POST',
        body: JSON.stringify({ input, playNow: true })
      });
      notify('Wiedergabe gestartet.', 'success');
      await load();
    } catch (error) {
      notify(error?.message || String(error), 'error');
    }
  };
})();
