(() => {
  const sync = () => {
    document.querySelectorAll('input[type="password"][name="password"], input[type="password"][name="password2"]').forEach(input => {
      input.minLength = 5;
      input.maxLength = 30;
      input.setAttribute('minlength', '5');
      input.setAttribute('maxlength', '30');
      input.title = 'Passwort: 5 bis 30 Zeichen';
    });
  };
  new MutationObserver(sync).observe(document.documentElement, { childList: true, subtree: true });
  sync();
})();
