const browserErrors = [];
const nativeFetch = () => window.MusikBotFetch?.nativeFetch || window.fetch.bind(window);
const auth = () => window.MusikBotFetch?.getAuth?.() || '';
const safe = text => String(text ?? '').replace(/[&<>\"']/g, c => ({ "&":"&amp;", "<":"&lt;", ">":"&gt;", "\"":"&quot;", "'":"&#39;" }[c]));
function formatLog(items) { return items.map(x => `[${x.time || "-"}] ${x.type || "BOT"}: ${x.message || ""}`).join("\n\n"); }
async function loadServerDiagnostics() {
  const header = auth(); if (!header) return [];
  try { const response = await nativeFetch()("/api/diagnostics", { headers: { Authorization: header } }); if (!response.ok) return []; const data = await response.json(); return Array.isArray(data) ? data : []; } catch { return []; }
}
async function openErrorLog() {
  const server = await loadServerDiagnostics();
  const all = [...server.map(x => ({ ...x, type: "BOT/SYSTEM" })), ...browserErrors].sort((a, b) => String(b.time).localeCompare(String(a.time)));
  const view = document.querySelector("#view"); if (!view) return;
  const text = formatLog(all);
  view.innerHTML = `<section><div class="sectionhead"><div><h2>🧾 Fehlerlog</h2><small>Gesammelte Bot-, System-, API- und Browser-Fehler</small></div><div class="controls"><button id="elog-refresh">↻ Aktualisieren</button><button id="elog-copy">📋 Alles kopieren</button><button id="elog-clear">🗑 Lokale Fehler löschen</button></div></div><p class="muted">Serverfehler werden vom Bot gespeichert. Diese Ansicht sammelt zusätzlich lokale Browser- und Netzwerkfehler.</p><textarea id="elog-text" readonly spellcheck="false" style="width:100%;min-height:420px;font-family:monospace;white-space:pre;resize:vertical">${safe(text || "Keine Fehlermeldungen vorhanden.")}</textarea></section>`;
  document.querySelector("#elog-refresh").onclick = openErrorLog;
  document.querySelector("#elog-copy").onclick = async () => { const value = document.querySelector("#elog-text").value; try { await navigator.clipboard.writeText(value); window.dispatchEvent(new CustomEvent("musikbot187:notice", { detail: "Fehlerlog kopiert." })); } catch { document.querySelector("#elog-text").select(); document.execCommand("copy"); } };
  document.querySelector("#elog-clear").onclick = () => { browserErrors.length = 0; openErrorLog(); };
}
function installErrorLogButton() {
  if (!document.querySelector("nav") || document.querySelector("#errorlog-nav")) return;
  const adminButton = [...document.querySelectorAll("nav .navbtn")].find(b => b.textContent.includes("Admin")); if (!adminButton) return;
  const button = document.createElement("button"); button.id = "errorlog-nav"; button.className = "navbtn"; button.dataset.extraTab = "errorlog"; button.textContent = "🧾 Fehlerlog"; button.title = "Gesammelte Fehlermeldungen anzeigen"; button.onclick = openErrorLog; adminButton.insertAdjacentElement("afterend", button);
}
window.addEventListener("musikbot187:notice", event => { const notice = document.querySelector("#notice"); if (notice) { notice.textContent = event.detail; notice.classList.add("show"); clearTimeout(window.__musikbotErrorNotice); window.__musikbotErrorNotice = setTimeout(() => notice.classList.remove("show"), 3500); } });
const observer = new MutationObserver(installErrorLogButton);
observer.observe(document.documentElement, { childList: true, subtree: true });
window.__musikbotRegisterCleanup?.(() => observer.disconnect());
installErrorLogButton();
