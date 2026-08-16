// Discord voice UI hardening: preserve the selected guild/channel across reloads
// and refuse to call /join when the configuration is incomplete.
(function () {
  const originalLoadChannels = window.loadChannels;
  const originalInstanceView = window.instanceView;

  window.loadChannels = async function (id, guild, selectedChannel = "") {
    const select = document.querySelector(`#dv-${id}`);
    if (!select || !guild) return;
    try {
      const list = await window.api(`/api/discord/${id}/guilds/${guild}/channels`);
      select.innerHTML = `<option value="">Voice-Kanal auswählen…</option>` +
        list.map((x) => `<option value="${window.esc(x.id)}" ${x.id === selectedChannel ? "selected" : ""}>${window.esc(x.name)}</option>`).join("");
    } catch (error) {
      alert(error.message || String(error));
    }
  };

  window.loadServers = async function (id, selectedGuild = "", selectedChannel = "") {
    const select = document.querySelector(`#dg-${id}`);
    if (!select) return;
    try {
      const list = await window.api(`/api/discord/${id}/guilds`);
      select.innerHTML = `<option value="">Server auswählen…</option>` +
        list.map((x) => `<option value="${window.esc(x.id)}" ${x.id === selectedGuild ? "selected" : ""}>${window.esc(x.name)}</option>`).join("");
      if (selectedGuild) await window.loadChannels(id, selectedGuild, selectedChannel);
    } catch (error) {
      select.innerHTML = `<option value="">Nicht verfügbar — erst verbinden</option>`;
    }
  };

  window.instanceView = async function () {
    await originalInstanceView();
    try {
      const discordInstances = await window.api("/api/discord");
      for (const instance of discordInstances) {
        if (instance.connected) {
          await window.loadServers(instance.id, instance.guildId || "", instance.channelId || "");
        }
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
      if (!instance.connected) throw new Error("Discord-Instanz ist nicht verbunden. Bitte zuerst 'Verbinden' drücken.");
      if (!instance.guildId) throw new Error("Bitte zuerst einen Discord-Server auswählen und speichern.");
      if (!instance.channelId) throw new Error("Bitte zuerst einen Voice-Kanal auswählen und speichern.");
      await window.post(`/api/discord/${id}/join`);
      await window.render();
    } catch (error) {
      alert(error.message || String(error));
    }
  };
})();
