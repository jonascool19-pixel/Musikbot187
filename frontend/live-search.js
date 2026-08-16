(() => {
  const bound = new WeakSet();
  const timers = new WeakMap();

  function bind(root = document) {
    root.querySelectorAll('.search-big input, input[data-search], input[type="search"]').forEach(input => {
      if (bound.has(input)) return;
      bound.add(input);
      input.addEventListener('input', () => {
        const old = timers.get(input);
        if (old) clearTimeout(old);
        const value = String(input.value || '').trim();
        if (value.length < 2) return;
        timers.set(input, window.setTimeout(() => {
          const form = input.closest('form');
          if (form?.requestSubmit) form.requestSubmit();
          else form?.querySelector('button[type="submit"], button')?.click();
        }, 280));
      });
    });
  }

  bind();
  new MutationObserver(() => bind()).observe(document.body, { childList: true, subtree: true });
})();
