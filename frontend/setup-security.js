(() => {
  const match = window.location.hash.match(/^#setup=([^&]+)$/);
  const setupToken = match ? decodeURIComponent(match[1]) : "";
  const originalFetch = window.fetch.bind(window);
  window.fetch = (input, init = {}) => {
    const url = typeof input === "string" ? input : input?.url || "";
    if (!setupToken || !url.endsWith("/api/setup")) return originalFetch(input, init);
    const headers = new Headers(init.headers || (input instanceof Request ? input.headers : undefined));
    headers.set("X-MusikBot-Setup-Token", setupToken);
    return originalFetch(input, { ...init, headers }).then(response => {
      if (response.ok) history.replaceState(null, "", window.location.pathname + window.location.search);
      return response;
    });
  };
})();
