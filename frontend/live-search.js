(() => {
  let timer = null;
  let lastQuery = "";
  function bindLiveSearch() {
    const input = document.querySelector("#q");
    const button = document.querySelector("#go");
    const results = document.querySelector("#results");
    if (!input || !button || input.dataset.liveSearchBound) return;
    input.dataset.liveSearchBound = "1";
    input.addEventListener("input", () => {
      clearTimeout(timer);
      const query = input.value.trim();
      if (query.length < 2) {
        lastQuery = "";
        if (results) results.innerHTML = "";
        return;
      }
      if (query === lastQuery) return;
      timer = setTimeout(() => {
        if (document.querySelector("#q") === input && input.value.trim() === query) {
          lastQuery = query;
          button.click();
        }
      }, 450);
    });
  }
  document.addEventListener("click", event => {
    if (event.target?.closest?.('[data-tab="player"]')) window.setTimeout(bindLiveSearch, 50);
  });
  window.setTimeout(bindLiveSearch, 300);
  window.setInterval(bindLiveSearch, 1000);
})();
