(() => {
  const bound = new WeakSet();
  let timer = 0;

  function bind(root = document) {
    root.querySelectorAll('.search-big input, input[data-search], input[type="search"]').forEach(input => {
      if (bound.has(input)) return;
      bound.add(input);
      input.addEventListener('input', () => {
        clearTimeout(timer);
        const form = input.closest('form');
        const button = form?.querySelector('button[type="submit"], button');
        if (!String(input.value || '').trim()) return;
        timer = window.setTimeout(() => {
          if (form?.requestSubmit) form.requestSubmit();
          else button?.click();
        }, 280);
      });
    });
  }

  bind();
  new MutationObserver(() => bind()).observe(document.body, { childList: true, subtree: true });
})();
