import { Client, ChannelType, GatewayIntentBits, REST, Routes, SlashCommandBuilder } from "discord.js";
import { StreamType, VoiceConnectionStatus, createAudioPlayer, createAudioResource, joinVoiceChannel } from "@discordjs/voice";
import { PassThrough } from "node:stream";

export function discordIntents(prefix = "") {
  const intents = [GatewayIntentBits.Guilds, GatewayIntentBits.GuildVoiceStates];
  if (String(prefix || "").trim()) intents.push(GatewayIntentBits.MessageContent);
  return intents;
}

export function discordCommandAllowed(interaction, guildId) {
  return Boolean(interaction?.guildId && guildId && interaction.guildId === guildId);
}

class Runtime {
  constructor(cfg) {
    this.cfg = cfg;
    this.client = new Client({ intents: discordIntents(cfg.prefix) });
    this.connecting = false;
    this.voiceRecovering = false;
    this.voiceRecoveryTimer = null;
  }
}

function commands() {
  return [
    new SlashCommandBuilder().setName("play").setDescription("Musik abspielen").addStringOption((o) => o.setName("suche").setDescription("Titel, Interpret oder URL").setRequired(true)),
    new SlashCommandBuilder().setName("pause").setDescription("Wiedergabe pausieren"),
    new SlashCommandBuilder().setName("resume").setDescription("Wiedergabe fortsetzen"),
    new SlashCommandBuilder().setName("skip").setDescription("Aktuellen Titel überspringen"),
    new SlashCommandBuilder().setName("stop").setDescription("Wiedergabe stoppen"),
    new SlashCommandBuilder().setName("volume").setDescription("Lautstärke setzen").addIntegerOption((o) => o.setName("wert").setDescription("0 bis 100").setRequired(true).setMinValue(0).setMaxValue(100)),
    new SlashCommandBuilder().setName("queue").setDescription("Warteschlange anzeigen")
  ].map((x) => x.toJSON());
}

function makePlayItem(query) {
  const value = String(query).trim();
  const direct = /^https?:\/\//i.test(value);
  if (!direct) return { id: Date.now().toString(), title: value, url: `ytsearch1:${value}`, source: "youtube" };
  const youtube = /(?:youtube\.com|youtu\.be)\//i.test(value);
  return { id: Date.now().toString(), title: value, url: value, source: youtube ? "youtube" : "direct" };
}

export class DiscordManager {
  constructor(music) { this.music = music; this.map = new Map(); }
  async connect(cfg) {
    const existing = this.map.get(cfg.id);
    if (existing?.connecting) throw new Error("Discord-Instanz verbindet bereits");
    await this.disconnect(cfg.id);
    if (!cfg.enabled) throw new Error("Instanz ist ausgeschaltet");
    if (!cfg.token) throw new Error("Bot-Token fehlt");
    const runtime = new Runtime(cfg);
    runtime.connecting = true;
    runtime.client.on("interactionCreate", (interaction) => {
      if (!interaction.isChatInputCommand()) return;
      if (!discordCommandAllowed(interaction, runtime.cfg.guildId)) {
        void interaction.reply({ content: "Dieser Bot-Befehl ist für diesen Discord-Server nicht freigeschaltet.", ephemeral: true }).catch(() => {});
        return;
      }
      this.handleSlash(interaction).catch((e) => this.replyError(interaction, e));
    });
    runtime.client.on("messageCreate", (message) => {
      if (message.author.bot || !message.guild || (cfg.guildId && message.guild.id !== cfg.guildId) || !message.content || !message.content.startsWith(cfg.prefix || "!")) return;
      const parts = message.content.slice((cfg.prefix || "!").length).trim().split(/\s+/);
      const command = parts.shift()?.toLowerCase();
      try {
        if (command === "play") return void this.music.enqueue([makePlayItem(parts.join(" "))]).catch((e) => message.reply(`Fehler: ${e instanceof Error ? e.message : String(e)}`).catch(() => {}));
        if (command === "pause") this.music.pause();
        else if (command === "resume") this.music.resume();
        else if (command === "skip") this.music.skip();
        else if (command === "stop") this.music.stop();
        else if (command === "volume" && parts[0] !== undefined) this.music.setVolume(Number(parts[0]));
        else if (command === "queue") void message.reply(this.music.queue.map((x) => x.title).join("\n") || "Queue ist leer.").catch(() => {});
      } catch (e) { void message.reply(`Fehler: ${e instanceof Error ? e.message : String(e)}`).catch(() => {}); }
    });
    try {
      await runtime.client.login(cfg.token);
      runtime.connecting = false;
      this.map.set(cfg.id, runtime);
      if (runtime.client.user) {
        const rest = new REST({ version: "10" }).setToken(cfg.token);
        void rest.put(Routes.applicationCommands(runtime.client.user.id), { body: commands() }).catch((e) => console.error("Discord command registration failed", e));
      }
    } catch (e) {
      runtime.connecting = false;
      try { await runtime.client.destroy(); } catch {}
      throw new Error(e?.code === "TokenInvalid" ? "Discord-Token ist ungültig" : e?.message || String(e));
    }
  }
  async handleSlash(interaction) {
    switch (interaction.commandName) {
      case "play": { const q = interaction.options.getString("suche", true); await this.music.enqueue([makePlayItem(q)]); return interaction.reply(`▶️ **${q}** wurde zur Wiedergabe hinzugefügt.`); }
      case "pause": this.music.pause(); return interaction.reply("⏸️ Pausiert.");
      case "resume": this.music.resume(); return interaction.reply("▶️ Fortgesetzt.");
      case "skip": this.music.skip(); return interaction.reply("⏭️ Übersprungen.");
      case "stop": this.music.stop(); return interaction.reply("⏹️ Gestoppt.");
      case "volume": { const value = interaction.options.getInteger("wert", true); this.music.setVolume(value); return interaction.reply(`🔊 Lautstärke: **${value}%**`); }
      case "queue": return interaction.reply(this.music.queue.map((x) => x.title).join("\n") || "Queue ist leer.");
    }
  }
  async replyError(interaction, error) { const text = `Fehler: ${error instanceof Error ? error.message : String(error)}`; if (interaction.replied || interaction.deferred) await interaction.followUp({ content: text, ephemeral: true }); else await interaction.reply({ content: text, ephemeral: true }); }
  async disconnect(id) {
    const runtime = this.map.get(id);
    if (!runtime) return;
    if (runtime.voiceRecoveryTimer) clearTimeout(runtime.voiceRecoveryTimer);
    runtime.voiceRecoveryTimer = null;
    runtime.voiceRecovering = false;
    try { runtime.voice?.removeAllListeners("stateChange"); runtime.voice?.destroy(); runtime.stream?.end(); await runtime.client.destroy(); } finally { this.map.delete(id); }
  }
  async join(id) {
    const runtime = this.map.get(id);
    if (!runtime) throw new Error("Instanz nicht verbunden. Erst verbinden.");
    if (!runtime.cfg.guildId || !runtime.cfg.channelId) throw new Error("Bitte zuerst Discord-Server und Voice-Kanal auswählen");
    const guild = runtime.client.guilds.cache.get(runtime.cfg.guildId);
    if (!guild) throw new Error("Discord-Server wurde nicht gefunden");
    const channel = guild.channels.cache.get(runtime.cfg.channelId);
    if (!channel || channel.type !== ChannelType.GuildVoice) throw new Error("Der ausgewählte Voice-Kanal wurde nicht gefunden");
    if (runtime.voiceRecoveryTimer) clearTimeout(runtime.voiceRecoveryTimer);
    runtime.voiceRecoveryTimer = null;
    runtime.voiceRecovering = false;
    if (runtime.voice) { runtime.voice.removeAllListeners("stateChange"); runtime.voice.destroy(); }
    runtime.voice = joinVoiceChannel({ guildId: guild.id, channelId: channel.id, adapterCreator: guild.voiceAdapterCreator });
    runtime.voice.on("stateChange", (oldState, newState) => {
      if (newState.status !== VoiceConnectionStatus.Disconnected || runtime.voiceRecovering) return;
      runtime.voiceRecovering = true;
      runtime.voiceRecoveryTimer = setTimeout(() => {
        runtime.voiceRecoveryTimer = null;
        this.join(id).catch((error) => {
          runtime.voiceRecovering = false;
          console.error(`Discord Voice Recovery ${runtime.cfg.name}:`, error);
          this.music.emit("diagnostic", `Discord Voice ${runtime.cfg.name}: Wiederverbindung fehlgeschlagen: ${error instanceof Error ? error.message : String(error)}`);
        });
      }, 5000);
      this.music.emit("diagnostic", `Discord Voice ${runtime.cfg.name}: Verbindung verloren; Wiederverbindung in 5s.`);
    });
    runtime.player = createAudioPlayer();
    runtime.voice.subscribe(runtime.player);
    runtime.stream = new PassThrough();
    runtime.player.play(createAudioResource(runtime.stream, { inputType: StreamType.Raw }));
  }
  writeAudio(data, id) { const stream = this.map.get(id)?.stream; if (stream && !stream.destroyed) stream.write(data); }
  guilds(id) { const r = this.map.get(id); return r ? [...r.client.guilds.cache.values()].map((g) => ({ id: g.id, name: g.name })) : []; }
  channels(id, guildId) { const g = this.map.get(id)?.client.guilds.cache.get(guildId); return g ? [...g.channels.cache.values()].filter((c) => c.type === ChannelType.GuildVoice).map((c) => ({ id: c.id, name: c.name })) : []; }
  status() { return [...this.map.values()].map((r) => ({ id: r.cfg.id, name: r.cfg.name, enabled: r.cfg.enabled, connected: true, guildId: r.cfg.guildId, channelId: r.cfg.channelId, inviteUrl: r.cfg.clientId && /^\d{17,20}$/.test(r.cfg.clientId) ? `https://discord.com/oauth2/authorize?client_id=${encodeURIComponent(r.cfg.clientId)}&scope=bot%20applications.commands&permissions=36700160` : "" })); }
}
