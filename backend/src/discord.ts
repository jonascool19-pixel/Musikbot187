import {
  ChannelType,
  Client,
  GatewayIntentBits,
  REST,
  Routes,
  SlashCommandBuilder,
  type ChatInputCommandInteraction,
} from "discord.js";
import {
  AudioPlayer,
  StreamType,
  createAudioPlayer,
  createAudioResource,
  joinVoiceChannel,
  type VoiceConnection,
} from "@discordjs/voice";
import { PassThrough } from "node:stream";
import type { DiscordInstance } from "./types.js";
import type { Player } from "./player.js";

class Runtime {
  client: Client;
  voice?: VoiceConnection;
  player?: AudioPlayer;
  stream?: PassThrough;
  connecting = false;

  constructor(public cfg: DiscordInstance) {
    // No privileged intents required for the basic connection or slash commands.
    this.client = new Client({
      intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildVoiceStates,
      ],
    });
  }
}

function commandData() {
  return [
    new SlashCommandBuilder()
      .setName("play")
      .setDescription("Musik abspielen")
      .addStringOption((o) =>
        o
          .setName("suche")
          .setDescription("Titel, Interpret oder URL")
          .setRequired(true),
      ),
    new SlashCommandBuilder().setName("pause").setDescription("Wiedergabe pausieren"),
    new SlashCommandBuilder().setName("resume").setDescription("Wiedergabe fortsetzen"),
    new SlashCommandBuilder().setName("skip").setDescription("Aktuellen Titel überspringen"),
    new SlashCommandBuilder().setName("stop").setDescription("Wiedergabe stoppen"),
    new SlashCommandBuilder()
      .setName("volume")
      .setDescription("Lautstärke setzen")
      .addIntegerOption((o) =>
        o
          .setName("wert")
          .setDescription("0 bis 100")
          .setRequired(true)
          .setMinValue(0)
          .setMaxValue(100),
      ),
    new SlashCommandBuilder().setName("queue").setDescription("Warteschlange anzeigen"),
  ].map((x) => x.toJSON());
}

function discordError(error: unknown): Error {
  const e = error as { code?: string; message?: string };
  const code = String(e?.code ?? "");
  const message = error instanceof Error ? error.message : String(error);

  if (code === "TokenInvalid") {
    return new Error(
      "Discord-Token ist ungültig. Bitte den Bot-Token aus dem Discord Developer Portal neu kopieren.",
    );
  }
  if (code === "DisallowedIntents") {
    return new Error(
      "Discord verweigert einen privilegierten Gateway-Intent. Diese Version benötigt für die Grundverbindung keine privilegierten Intents.",
    );
  }
  if (code === "50001") {
    return new Error("Discord-Bot hat keinen Zugriff auf den ausgewählten Server.");
  }
  if (code === "50013") {
    return new Error(
      "Discord-Bot fehlen Berechtigungen für den ausgewählten Server oder Voice-Kanal.",
    );
  }
  return new Error(message || "Discord-Verbindung fehlgeschlagen");
}

export class DiscordManager {
  private map = new Map<string, Runtime>();

  constructor(private music: Player) {}

  async connect(cfg: DiscordInstance) {
    const existing = this.map.get(cfg.id);
    if (existing?.connecting) {
      throw new Error("Discord-Instanz verbindet bereits. Bitte kurz warten.");
    }

    await this.disconnect(cfg.id);

    if (!cfg.enabled) throw new Error("Instanz ist ausgeschaltet");
    if (!cfg.token) throw new Error("Bot-Token fehlt");

    const runtime = new Runtime(cfg);
    runtime.connecting = true;

    runtime.client.on("interactionCreate", async (interaction) => {
      if (!interaction.isChatInputCommand()) return;
      try {
        await this.handleSlash(interaction);
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        if (interaction.replied || interaction.deferred) {
          await interaction.followUp({ content: `Fehler: ${message}`, ephemeral: true });
        } else {
          await interaction.reply({ content: `Fehler: ${message}`, ephemeral: true });
        }
      }
    });

    // Prefix commands are intentionally best-effort. Discord Message Content Intent
    // must be enabled in the Developer Portal before message content is available.
    runtime.client.on("messageCreate", async (message) => {
      if (
        message.author.bot ||
        !message.guild ||
        !message.content ||
        !message.content.startsWith(cfg.prefix)
      ) {
        return;
      }

      const [command, ...args] = message.content
        .slice(cfg.prefix.length)
        .trim()
        .split(/\s+/);

      try {
        if (command === "play") {
          await this.music.enqueue([
            {
              id: Date.now().toString(),
              title: args.join(" "),
              url: `ytsearch1:${args.join(" ")}`,
              source: "youtube",
            },
          ]);
        } else if (command === "pause") {
          this.music.pause();
        } else if (command === "resume") {
          this.music.resume();
        } else if (command === "skip") {
          this.music.skip();
        } else if (command === "stop") {
          this.music.stop();
        } else if (command === "volume" && args[0]) {
          this.music.setVolume(Number(args[0]));
        } else if (command === "queue") {
          await message.reply(this.music.queue.map((x) => x.title).join("\n") || "Queue ist leer.");
        }
      } catch (error) {
        await message.reply(`Fehler: ${error instanceof Error ? error.message : String(error)}`);
      }
    });

    try {
      await runtime.client.login(cfg.token);
      runtime.connecting = false;
      this.map.set(cfg.id, runtime);

      // Connecting the bot should not be blocked by REST command registration.
      // Discord can occasionally take tens of seconds for this request. The bot
      // is usable for guild/channel discovery and voice immediately after login.
      if (runtime.client.user) {
        const rest = new REST({ version: "10" }).setToken(cfg.token);
        void rest
          .put(Routes.applicationCommands(runtime.client.user.id), {
            body: commandData(),
          })
          .catch((error) => {
            console.error("Discord command registration failed", error);
          });
      }
    } catch (error) {
      runtime.connecting = false;
      try {
        await runtime.client.destroy();
      } catch {
        // Ignore cleanup failures.
      }
      throw discordError(error);
    }
  }

  private async handleSlash(interaction: ChatInputCommandInteraction) {
    switch (interaction.commandName) {
      case "play": {
        const query = interaction.options.getString("suche", true);
        await this.music.enqueue([
          {
            id: Date.now().toString(),
            title: query,
            url: `ytsearch1:${query}`,
            source: "youtube",
          },
        ]);
        await interaction.reply(`▶️ **${query}** wurde zur Wiedergabe hinzugefügt.`);
        break;
      }
      case "pause":
        this.music.pause();
        await interaction.reply("⏸️ Pausiert.");
        break;
      case "resume":
        this.music.resume();
        await interaction.reply("▶️ Fortgesetzt.");
        break;
      case "skip":
        this.music.skip();
        await interaction.reply("⏭️ Übersprungen.");
        break;
      case "stop":
        this.music.stop();
        await interaction.reply("⏹️ Gestoppt.");
        break;
      case "volume": {
        const value = interaction.options.getInteger("wert", true);
        this.music.setVolume(value);
        await interaction.reply(`🔊 Lautstärke: **${value}%**`);
        break;
      }
      case "queue":
        await interaction.reply(this.music.queue.map((x) => x.title).join("\n") || "Queue ist leer.");
        break;
    }
  }

  async disconnect(id: string) {
    const runtime = this.map.get(id);
    if (!runtime) return;

    try {
      runtime.voice?.destroy();
      runtime.stream?.end();
      await runtime.client.destroy();
    } finally {
      this.map.delete(id);
    }
  }

  async join(id: string) {
    const runtime = this.map.get(id);
    if (!runtime) {
      throw new Error("Instanz nicht verbunden. Erst 'Verbinden' drücken.");
    }
    if (!runtime.cfg.guildId || !runtime.cfg.channelId) {
      throw new Error("Bitte zuerst Discord-Server und Voice-Kanal auswählen.");
    }

    const guild = runtime.client.guilds.cache.get(runtime.cfg.guildId);
    if (!guild) {
      throw new Error(
        "Discord-Server wurde mit diesem Bot nicht gefunden. Prüfe Server-ID und ob der Bot wirklich eingeladen wurde.",
      );
    }

    const channel = guild.channels.cache.get(runtime.cfg.channelId);
    if (!channel || channel.type !== ChannelType.GuildVoice) {
      throw new Error("Der ausgewählte Voice-Kanal wurde nicht gefunden.");
    }

    try {
      runtime.voice = joinVoiceChannel({
        guildId: guild.id,
        channelId: runtime.cfg.channelId,
        adapterCreator: guild.voiceAdapterCreator,
      });
      runtime.player = createAudioPlayer();
      runtime.voice.subscribe(runtime.player);
      runtime.stream = new PassThrough();
      runtime.player.play(
        createAudioResource(runtime.stream, { inputType: StreamType.Raw }),
      );
    } catch (error) {
      throw new Error(
        `Voice-Verbindung fehlgeschlagen: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }

  writeAudio(data: Buffer, id: string) {
    this.map.get(id)?.stream?.write(data);
  }

  guilds(id: string) {
    const runtime = this.map.get(id);
    return runtime
      ? [...runtime.client.guilds.cache.values()].map((guild) => ({
          id: guild.id,
          name: guild.name,
        }))
      : [];
  }

  channels(id: string, guildId: string) {
    const runtime = this.map.get(id);
    const guild = runtime?.client.guilds.cache.get(guildId);
    return guild
      ? [...guild.channels.cache.values()]
          .filter((channel) => channel.type === ChannelType.GuildVoice)
          .map((channel) => ({ id: channel.id, name: channel.name }))
      : [];
  }

  status() {
    return [...this.map.values()].map((runtime) => ({
      id: runtime.cfg.id,
      name: runtime.cfg.name,
      enabled: runtime.cfg.enabled,
      connected: true,
      guildId: runtime.cfg.guildId,
      channelId: runtime.cfg.channelId,
      inviteUrl:
        runtime.cfg.clientId && /^\d{17,20}$/.test(runtime.cfg.clientId)
          ? `https://discord.com/oauth2/authorize?client_id=${encodeURIComponent(runtime.cfg.clientId)}&scope=bot%20applications.commands&permissions=36700160`
          : "",
    }));
  }
}
