// Discord voice UI hardening: reliable server/channel loading, refresh buttons,
// automatic persistence of selections and a tolerant join flow.
(function () {
  const originalInstanceView = window.instanceView;

  const esc = (value) => String(value ?? "").replace(/[&<>\"']/g, (c) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#39;",
  })[c]);

  async function saveSelection(id, patch) {
    await window.api("/api/discord", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id, ...patch }),
    });
  }

  async function post(path, body = {}) {
    return window.api(path, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
  }

  function addRefreshButton(select, label, handler) {
    if (!select || select.dataset.refreshReady === "1") return;
    select.dataset.refreshReady = "1";
    const button = document.createElement("button");
    button.type = "button";
    button.title = `${label} aktualisieren`;
    button.textContent = "↻";
    button.setAttribute("aria-label", `${label} aktualisieren`);
    button.style.cssText = "width:40px;min-width:40px;height:40px;padding:0;margin-left:6px;display:inline-flex;align-items:center;justify-content:center;font-size:18px;";
    button.onclick = handler;

    const row = document.createElement("span");
    row.style.cssText = "display:flex;align-items:center;width:100%;";
    select.parentNode.insertBefore(row, select);
    row.appendChild(select);
    row.appendChild(button);
    return button;
  }

  function renameLabels(id) {
    const server = document.querySelector(`#dg-${id}`);
    const channel = document.querySelector(`#dv-${id}`);
    if (server) {
      const label = server.closest("label");
      if (label) label.firstChild.textContent = "Discord-Server ";
    }
    if (channel) {
      const label = channel.closest("label");
      if (label) label.firstChild.textContent = "Channel ";
    }
  }

  async function loadChannels(id, guild, selectedChannel = "") {
    const select = document.querySelector(`#dv-${id}`);
    if (!select || !guild) return [];
    const list = await window.api(`/api/discord/${id}/guilds/${encodeURIComponent(guild)}/channels`);
    select.innerHTML = `<option value="">Channel auswählen…</option>` +
      list.map((x) => `<option value="${esc(x.id)}" ${x.id === selectedChannel ? "selected" : ""}>${esc(x.name)}</option>`).join("");
    renameLabels(id);
    addRefreshButton(select, "Channel", async () => {
      await loadChannels(id, guild, select.value);
    });
    const previous = select.onchange;
    select.onchange = async function (event) {
      if (previous) await previous.call(this, event);
      if (this.value) await saveSelection(id, { guildId: guild, channelId: this.value });
    };
    return list;
  }

  async function loadServers(id, selectedGuild = "", selectedChannel = "") {
    const select = document.querySelector(`#dg-${id}`);
    if (!select) return [];
    const list = await window.api(`/api/discord/${id}/guilds`);
    select.innerHTML = `<option value="">Discord-Server auswählen…</option>` +
      list.map((x) => `<option value="${esc(x.id)}" ${x.id === selectedGuild ? "selected" : ""}>${esc(x.name)}</option>`).join("");
    renameLabels(id);
    addRefreshButton(select, "Discord-Server", async () => {
      await loadServers(id, select.value, document.querySelector(`#dv-${id}`)?.value || selectedChannel);
    });

    const previous = select.onchange;
    select.onchange = async function (event) {
      if (previous) await previous.call(this, event);
      const guild = this.value;
      if (!guild) return;
      await saveSelection(id, { guildId: guild, channelId: "" });
      await loadChannels(id, guild, "");
    };

    if (selectedGuild) await loadChannels(id, selectedGuild, selectedChannel);
    return list;
  }

  async function enhanceInstance(id, instance) {
    const server = document.querySelector(`#dg-${id}`);
    const channel = document.querySelector(`#dv-${id}`);
    if (!server || !channel) return;
    renameLabels(id);
    try {
      const list = await loadServers(id, instance.guildId || "", instance.channelId || "");
      if (!list.length) {
        server.innerHTML = `<option value="">Kein Discord-Server gefunden</option>`;
        channel.innerHTML = `<option value="">Keinen Server verfügbar</option>`;
      }
    } catch (error) {
      server.innerHTML = `<option value="">Nicht verfügbar — Bot verbinden</option>`;
      channel.innerHTML = `<option value="">Server zuerst auswählen…</option>`;
    }
  }

  window.instanceView = async function () {
    await originalInstanceView();
    try {
      const discordInstances = await window.api("/api/discord");
      for (const instance of discordInstances) {
        await enhanceInstance(instance.id, instance);
      }
    } catch (error) {
      console.error("Voice UI refresh failed", error);
    }
  };

  window.joinDiscord = async function (id) {
    try {
      const instances = await window.api("/api/discord");
      const instance = instances.find((x) => x.id === id);
      if (!instance) throw new Error("Discord-Instanz nicht gefunden.");

      let guilds;
      try {
        guilds = await window.api(`/api/discord/${id}/guilds`);
      } catch {
        await post(`/api/discord/${id}/connect`);
        guilds = await window.api(`/api/discord/${id}/guilds`);
      }
      if (!guilds.length) {
        throw new Error("Der Bot ist verbunden, aber in keinem Discord-Server erreichbar. Bitte den Bot zuerst zum gewünschten Server einladen.");
      }
      if (!instance.guildId) throw new Error("Bitte zuerst einen Discord-Server auswählen.");
      if (!instance.channelId) throw new Error("Bitte zuerst einen Channel auswählen.");

      await post(`/api/discord/${id}/join`);
      await window.render();
    } catch (error) {
      alert(error.message || String(error));
    }
  };
})();
