// Top livebar output selector: show the selected Discord/TS3 instance as a real dropdown.
(function () {
  const originalLivebar = window.livebar;
  window.livebar = function (state, sys, net) {
    const selected = net.interfaces.find(x => x.name === state.settings.networkInterface) || net.interfaces.find(x => x.name !== "lo") || net.interfaces[0];
    const cpu = Math.min(100, Math.round((sys.load?.[0] || 0) / Math.max(1, sys.cores) * 100));
    const ram = Math.round(sys.ram.used / Math.max(1, sys.ram.total) * 100);
    const pct = selected && typeof window.networkPercent === "function" ? window.networkPercent(selected) : { down: 0, up: 0 };
    const current = `${state.settings.outputType || "none"}:${state.settings.outputId || ""}`;
    const discord = (state.discord || []).map(x => `<option value="discord:${esc(x.id)}" ${current === `discord:${x.id}` ? "selected" : ""}>Discord · ${esc(x.name)}</option>`).join("");
    const ts3 = (state.ts3 || []).map(x => `<option value="ts3:${esc(x.id)}" ${current === `ts3:${x.id}` ? "selected" : ""}>TS3 · ${esc(x.name)}</option>`).join("");
    const live = document.querySelector("#livebar");
    if (!live) return originalLivebar(state, sys, net);
    live.innerHTML = `<span class="chip">CPU ${cpu}%</span><span class="chip">RAM ${ram}%</span><span class="chip">NET ↓${pct.down}% ↑${pct.up}%</span><select class="chip active-output-select" aria-label="Aktive Instanz" onchange="setOut(this.value)"><option value="none:" ${current === "none:" ? "selected" : ""}>Kein Ausgang</option>${discord}${ts3}</select><span class="chip clock" id="clock">${new Date().toLocaleTimeString("de-DE")}</span>`;
    if (typeof window.startClock === "function") window.startClock();
  };
})();
