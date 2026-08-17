const browserErrors = [];
let authHeader = "";
document.addEventListener("click", event => { if (event.target.closest?.("#logout")) authHeader = ""; }, true);
const originalFetch = window.fetch.bind(window);
window.fetch = async (input, init = {}) => {
  const headers = new Headers(init.headers || (input instanceof Request ? input.headers : undefined));
  const authorization = headers.get("Authorization");
  if (authorization) authHeader = authorization;
  try {
    const response = await originalFetch(input, init);
    if (!response.ok) {
      const url = typeof input === "string" ? input : input?.url || "";
      browserErrors.unshift({ time: new Date().toISOString(), type: "HTTP", message: `${response.status} ${response.statusText} – ${url}` });
      browserErrors.splice(100);
    }
    return response;
  } catch (error) {
    const url = typeof input === "string" ? input : input?.url || "";
    browserErrors.unshift({ time: new Date().toISOString(), type: "NETWORK", message: `${error?.message || error} – ${url}` });
    browserErrors.splice(100);
    throw error;
  }
};
window.addEventListener("error", event => {
  browserErrors.unshift({ time: new Date().toISOString(), type: "BROWSER", message: `${event.message || "JavaScript-Fehler"} (${event.filename || "unbekannte Datei"}:${event.lineno || 0}:${event.colno || 0})` });
  browserErrors.splice(100);
});
window.addEventListener("unhandledrejection", event => {
  browserErrors.unshift({ time: new Date().toISOString(), type: "PROMISE", message: String(event.reason?.stack || event.reason || "Unbehandelter Promise-Fehler") });
  browserErrors.splice(100);
});
function safe(text) { return String(text ?? "").replace(/[&<>\"']/g, c => ({ "&":"&amp;", "<":"&lt;", ">":"&gt;", "\"":"&quot;", "'":"&#39;" }[c])); }
function formatLog(items) { return items.map(x => `[${x.time || "-"}] ${x.type || "BOT"}: ${x.message || ""}`).join("\n\n"); }
async function loadServerDiagnostics() {
  if (!authHeader) return [];
  try {
    const response = await originalFetch("/api/diagnostics", { headers: { Authorization: authHeader } });
    if (!response.ok) return [];
    const data = await response.json();
    return Array.isArray(data) ? data : [];
  } catch { return []; }
}
async function openErrorLog() {
  const server = await loadServerDiagnostics();
  const all = [...server.map(x => ({ ...x, type: "BOT/SYSTEM" })), ...browserErrors].sort((a, b) => String(b.time).localeCompare(String(a.time)));
  const view = document.querySelector("#view");
  if (!view) return;
  const text = formatLog(all);
  view.innerHTML = `<section><div class="sectionhead"><div><h2>🧾 Fehlerlog</h2><small>Gesammelte Bot-, System-, API- und Browser-Fehler · maximal 100 Server-/100 Browser-Einträge</small></div><div class="controls"><button id="elog-refresh">↻ Aktualisieren</button><button id="elog-copy">📋 Alles kopieren</button><button id="elog-clear">🗑 Lokale Fehler löschen</button></div></div><p class="muted">Serverfehler werden vom Bot gespeichert. Zusätzlich sammelt diese Ansicht Browser- und Netzwerkfehler, damit du mir bei einem Problem einfach den kompletten Bericht schicken kannst.</p><textarea id="elog-text" readonly spellcheck="false" style="width:100%;min-height:420px;font-family:monospace;white-space:pre;resize:vertical">${safe(text || "Keine Fehlermeldungen vorhanden.")}</textarea></section>`;
  document.querySelector("#elog-refresh").onclick = openErrorLog;
  document.querySelector("#elog-copy").onclick = async () => { const value = document.querySelector("#elog-text").value; try { await navigator.clipboard.writeText(value); window.dispatchEvent(new CustomEvent("musikbot187:notice", { detail: "Fehlerlog kopiert." })); } catch { document.querySelector("#elog-text").select(); document.execCommand("copy"); } };
  document.querySelector("#elog-clear").onclick = () => { browserErrors.length = 0; openErrorLog(); };
}
function installErrorLogButton() {
  if (!document.querySelector("nav") || document.querySelector("#errorlog-nav")) return;
  const buttons = [...document.querySelectorAll("nav .navbtn")];
  const adminButton = buttons.find(b => b.textContent.includes("Admin"));
  if (!adminButton) return;
  const button = document.createElement("button");
  button.id = "errorlog-nav";
  button.className = "navbtn";
  button.textContent = "🧾 Fehlerlog";
  button.title = "Gesammelte Fehlermeldungen anzeigen";
  button.onclick = openErrorLog;
  adminButton.insertAdjacentElement("afterend", button);
}
window.addEventListener("musikbot187:notice", event => { const notice = document.querySelector("#notice"); if (notice) { notice.textContent = event.detail; notice.classList.add("show"); setTimeout(() => notice.classList.remove("show"), 3500); } });
new MutationObserver(installErrorLogButton).observe(document.documentElement, { childList: true, subtree: true });
installErrorLogButton();
