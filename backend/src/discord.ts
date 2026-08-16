import { Client, GatewayIntentBits, ChannelType } from "discord.js";
import { createAudioPlayer, createAudioResource, joinVoiceChannel, StreamType, type AudioPlayer, type VoiceConnection } from "@discordjs/voice";
import { PassThrough } from "node:stream";
import type { DiscordInstance } from "./types.js";

class DiscordRuntime {
  client: Client;
  voice?: VoiceConnection;
  player?: AudioPlayer;
  stream?: PassThrough;
  constructor(public readonly config: DiscordInstance) {
    this.client = new Client({ intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildVoiceStates] });
  }
}

export class DiscordManager {
  private runtimes = new Map<string, DiscordRuntime>();
  async connect(config: DiscordInstance): Promise<void> {
    await this.disconnect(config.id);
    if (!config.token) throw new Error(`Discord-Token für ${config.name} fehlt`);
    const runtime = new DiscordRuntime(config);
    await runtime.client.login(config.token);
    this.runtimes.set(config.id, runtime);
  }
  async disconnect(id: string): Promise<void> {
    const runtime = this.runtimes.get(id);
    if (!runtime) return;
    runtime.voice?.destroy(); runtime.stream?.end(); await runtime.client.destroy(); this.runtimes.delete(id);
  }
  async join(id: string): Promise<void> {
    const runtime = this.runtimes.get(id);
    if (!runtime) throw new Error("Discord-Instanz ist nicht verbunden");
    const guild = runtime.client.guilds.cache.get(runtime.config.guildId);
    if (!guild) throw new Error("Guild nicht gefunden");
    if (!runtime.config.channelId) throw new Error("Voice-Channel ist nicht konfiguriert");
    runtime.voice = joinVoiceChannel({ guildId: guild.id, channelId: runtime.config.channelId, adapterCreator: guild.voiceAdapterCreator });
    runtime.player = createAudioPlayer(); runtime.voice.subscribe(runtime.player); runtime.stream = new PassThrough();
    runtime.player.play(createAudioResource(runtime.stream, { inputType: StreamType.Raw }));
  }
  writeAudio(data: Buffer, activeId: string): void { this.runtimes.get(activeId)?.stream?.write(data); }
  status() {
    return [...this.runtimes.values()].map((runtime) => ({ id: runtime.config.id, name: runtime.config.name, connected: true, guildId: runtime.config.guildId, channelId: runtime.config.channelId, prefix: runtime.config.prefix, guilds: runtime.client.guilds.cache.size, inviteUrl: runtime.config.clientId ? `https://discord.com/oauth2/authorize?client_id=${encodeURIComponent(runtime.config.clientId)}&scope=bot%20applications.commands&permissions=36700160` : "" }));
  }
  guilds(id: string) {
    const runtime = this.runtimes.get(id);
    return runtime ? [...runtime.client.guilds.cache.values()].map((guild) => ({ id: guild.id, name: guild.name })) : [];
  }
  channels(id: string, guildId: string) {
    const runtime = this.runtimes.get(id); const guild = runtime?.client.guilds.cache.get(guildId);
    return guild ? [...guild.channels.cache.values()].filter((channel) => channel.type === ChannelType.GuildVoice).map((channel) => ({ id: channel.id, name: channel.name })) : [];
  }
}
