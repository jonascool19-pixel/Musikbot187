import { Client, GatewayIntentBits } from 'discord.js';
import { joinVoiceChannel, createAudioPlayer, createAudioResource, AudioPlayerStatus, NoSubscriberBehavior, StreamType, VoiceConnection } from '@discordjs/voice';
import type { ChildProcessWithoutNullStreams } from 'node:child_process';
import { spawnPcm, mediaTitle } from './media.js';

export class DiscordInstance {
  cfg: any;
  client = new Client({ intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildVoiceStates, GatewayIntentBits.GuildMessages, GatewayIntentBits.MessageContent] });
  player = createAudioPlayer({ behaviors: { noSubscriber: NoSubscriberBehavior.Pause } });
  connection?: VoiceConnection;
  queue: any[] = [];
  current?: any;
  ffmpeg?: ChildProcessWithoutNullStreams;
  volume = 80;
  connected = false;

  constructor(cfg: any) {
    this.cfg = cfg;
    this.client.on('ready', () => { this.connected = true; console.log(`Discord ${cfg.name} online`); });
    this.client.on('messageCreate', m => this.onMessage(m).catch(e => console.error('Discord command', e)));
    this.player.on(AudioPlayerStatus.Idle, () => { void this.next(); });
  }

  async start() { if (this.cfg.token) await this.client.login(this.cfg.token); }
  async stop() { this.ffmpeg?.kill('SIGTERM'); this.connection?.destroy(); this.connected = false; await this.client.destroy(); }

  private async ensureVoice() {
    const guild = this.client.guilds.cache.get(this.cfg.guildId);
    if (!guild) throw new Error('Discord-Server nicht gefunden.');
    const channel = guild.channels.cache.get(this.cfg.voiceChannelId) as any;
    if (!channel?.isVoiceBased?.()) throw new Error('Discord-Sprachkanal nicht gefunden.');
    this.connection = joinVoiceChannel({ channelId: channel.id, guildId: guild.id, adapterCreator: guild.voiceAdapterCreator });
    this.connection.subscribe(this.player);
  }

  async add(input: string, playNow = false) {
    if (!input?.trim()) throw new Error('Keine Quelle angegeben.');
    const title = await mediaTitle(input);
    const item = { input, title };
    if (playNow) { this.ffmpeg?.kill('SIGTERM'); this.queue.unshift(item); this.player.stop(); }
    else this.queue.push(item);
    if (!this.current) await this.next();
    return item;
  }

  async next() {
    if (this.current) return;
    const item = this.queue.shift();
    if (!item) return;
    this.current = item;
    try {
      await this.ensureVoice();
      const ff = await spawnPcm(item.input, this.volume);
      this.ffmpeg = ff;
      this.player.play(createAudioResource(ff.stdout, { inputType: StreamType.Raw }));
      await new Promise<void>(resolve => ff.once('close', () => resolve()));
    } catch (error) { console.error(`Discord playback ${this.cfg.name}`, error); }
    finally { this.ffmpeg = undefined; this.current = undefined; if (this.queue.length) void this.next(); }
  }

  state() { return { id: this.cfg.id, name: this.cfg.name, type: 'discord', connected: this.connected, playing: this.current?.title ?? null, queue: this.queue.map(x => x.title), volume: this.volume }; }

  private async onMessage(message: any) {
    if (message.author.bot) return;
    const prefix = this.cfg.prefix ?? '!';
    if (!message.content.startsWith(prefix)) return;
    const [command, ...rest] = message.content.slice(prefix.length).trim().split(/\s+/);
    const arg = rest.join(' ').trim();
    try {
      switch (command?.toLowerCase()) {
        case 'play': await this.add(arg); await message.reply('▶️ Zur Queue hinzugefügt.'); break;
        case 'radio': await this.add(arg); await message.reply('📻 Radio zur Queue hinzugefügt.'); break;
        case 'queue': await message.reply(this.queue.length ? this.queue.map((x, i) => `${i + 1}. ${x.title}`).join('\n') : 'Queue ist leer.'); break;
        case 'skip': this.ffmpeg?.kill('SIGTERM'); await message.reply('⏭️ Übersprungen.'); break;
        case 'stop': this.queue = []; this.ffmpeg?.kill('SIGTERM'); this.player.stop(); await message.reply('⏹️ Gestoppt.'); break;
        case 'pause': this.player.pause(); await message.reply('⏸️ Pausiert.'); break;
        case 'resume': this.player.unpause(); await message.reply('▶️ Fortgesetzt.'); break;
        case 'volume': this.volume = Math.max(0, Math.min(100, Number(rest[0] ?? 80))); await message.reply(`🔊 ${this.volume}%`); break;
      }
    } catch (error) { await message.reply(`Fehler: ${error instanceof Error ? error.message : String(error)}`).catch(() => undefined); }
  }
}
