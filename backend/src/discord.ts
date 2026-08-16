import { Client, GatewayIntentBits, PermissionsBitField } from 'discord.js';
import { joinVoiceChannel, createAudioPlayer, createAudioResource, AudioPlayerStatus, NoSubscriberBehavior, StreamType, VoiceConnection } from '@discordjs/voice';
import type { ChildProcessWithoutNullStreams } from 'node:child_process';
import { spawnPcm, mediaTitle } from './media.js';

export class DiscordInstance {
  cfg: any;
  client: Client;
  player = createAudioPlayer({ behaviors: { noSubscriber: NoSubscriberBehavior.Pause } });
  connection?: VoiceConnection;
  queue: any[] = [];
  current?: any;
  ffmpeg?: ChildProcessWithoutNullStreams;
  volume = 80;
  connected = false;
  lastError = '';
  inviteUrl = '';

  constructor(cfg: any) {
    this.cfg = cfg;
    const intents = [GatewayIntentBits.Guilds, GatewayIntentBits.GuildVoiceStates, GatewayIntentBits.GuildMessages];
    if (cfg.messageContentIntent === true) intents.push(GatewayIntentBits.MessageContent);
    this.client = new Client({ intents });
    this.client.on('ready', () => {
      this.connected = true;
      this.lastError = '';
      this.inviteUrl = this.buildInviteUrl();
      console.log(`Discord ${cfg.name} online`);
    });
    this.client.on('error', error => { this.connected = false; this.lastError = error instanceof Error ? error.message : String(error); });
    this.client.on('shardError', error => { this.connected = false; this.lastError = error instanceof Error ? error.message : String(error); });
    this.client.on('invalidated', () => { this.connected = false; this.lastError = 'Discord-Session wurde ungültig. Token prüfen.'; });
    this.client.on('messageCreate', m => this.onMessage(m).catch(e => console.error('Discord command', e)));
    this.player.on(AudioPlayerStatus.Idle, () => { void this.next(); });
  }

  private botIdFromToken(): string {
    try {
      const first = String(this.cfg.token || '').split('.')[0];
      return first ? Buffer.from(first, 'base64url').toString('utf8').trim() : '';
    } catch { return ''; }
  }

  private buildInviteUrl(): string {
    const clientId = this.client.user?.id || this.botIdFromToken();
    if (!clientId) return '';
    const permissions = new PermissionsBitField([
      PermissionsBitField.Flags.ViewChannel,
      PermissionsBitField.Flags.SendMessages,
      PermissionsBitField.Flags.Connect,
      PermissionsBitField.Flags.Speak,
      PermissionsBitField.Flags.UseApplicationCommands
    ]).bitfield.toString();
    return `https://discord.com/oauth2/authorize?client_id=${encodeURIComponent(clientId)}&scope=bot%20applications.commands&permissions=${permissions}`;
  }

  isEnabled() { return this.cfg.prefix !== '__RADIOBOT_DISABLED__'; }

  async start() {
    if (!this.isEnabled()) { this.connected = false; this.lastError = 'Instanz deaktiviert.'; return; }
    if (!this.cfg.token) { this.connected = false; this.lastError = 'Bot-Token fehlt.'; return; }
    this.inviteUrl = this.buildInviteUrl();
    try { this.lastError = ''; await this.client.login(this.cfg.token); }
    catch (error) { this.connected = false; this.lastError = error instanceof Error ? error.message : String(error); throw error; }
  }

  async stop() { this.ffmpeg?.kill('SIGTERM'); this.connection?.destroy(); this.connected = false; this.inviteUrl = ''; try { await this.client.destroy(); } catch {} }
  async restart() { await this.stop(); await this.start(); }

  listVoiceChannels(guildId = this.cfg.guildId) {
    const guild = this.client.guilds.cache.get(guildId);
    if (!guild) return [];
    return [...guild.channels.cache.values()]
      .filter((channel: any) => typeof channel.isVoiceBased === 'function' && channel.isVoiceBased())
      .map((channel: any) => ({ id: channel.id, name: channel.name, type: channel.type }))
      .sort((a, b) => a.name.localeCompare(b.name, 'de'));
  }

  async fetchVoiceChannels(guildId = this.cfg.guildId) {
    if (!this.client.isReady()) throw new Error('Discord ist noch nicht verbunden.');
    if (!guildId) throw new Error('Guild-ID fehlt.');
    const guild = await this.client.guilds.fetch(guildId);
    const fetched = await guild.channels.fetch();
    return [...fetched.values()]
      .filter((channel: any) => channel && typeof channel.isVoiceBased === 'function' && channel.isVoiceBased())
      .map((channel: any) => ({ id: channel.id, name: channel.name, type: channel.type }))
      .sort((a, b) => a.name.localeCompare(b.name, 'de'));
  }

  private async ensureVoice() {
    const guild = this.client.guilds.cache.get(this.cfg.guildId);
    if (!guild) throw new Error('Discord-Server nicht gefunden. Bitte den Bot über den Einladungslink hinzufügen und die Guild-ID prüfen.');
    const channel = guild.channels.cache.get(this.cfg.voiceChannelId) as any;
    if (!channel?.isVoiceBased?.()) throw new Error('Kein gültiger Discord-Sprachkanal ausgewählt. Bitte unter Einstellungen → Instanzen einen Voice-Kanal auswählen.');
    this.connection = joinVoiceChannel({ channelId: channel.id, guildId: guild.id, adapterCreator: guild.voiceAdapterCreator });
    this.connection.subscribe(this.player);
  }

  async add(input: string, playNow = false) {
    if (!input?.trim()) throw new Error('Keine Quelle angegeben.');
    const title = await mediaTitle(input);
    const item = { input, title };
    if (playNow) { this.ffmpeg?.kill('SIGTERM'); this.queue.unshift(item); this.player.stop(); } else this.queue.push(item);
    if (!this.current) await this.next();
    return item;
  }

  async next() {
    if (this.current) return;
    const item = this.queue.shift(); if (!item) return;
    this.current = item;
    try {
      await this.ensureVoice();
      const ff = await spawnPcm(item.input, this.volume);
      this.ffmpeg = ff;
      this.player.play(createAudioResource(ff.stdout, { inputType: StreamType.Raw }));
      await new Promise<void>(resolve => ff.once('close', () => resolve()));
    } catch (error) { this.lastError = error instanceof Error ? error.message : String(error); console.error(`Discord playback ${this.cfg.name}`, error); }
    finally { this.ffmpeg = undefined; this.current = undefined; if (this.queue.length) void this.next(); }
  }

  state() {
    return {
      id:this.cfg.id,
      name:this.cfg.name,
      type:'discord',
      enabled:this.isEnabled(),
      connected:this.connected,
      playing:this.current?.title ?? null,
      queue:this.queue.map(x=>x.title),
      volume:this.volume,
      error:this.lastError||null,
      inviteUrl:this.inviteUrl||this.buildInviteUrl()||null,
      botUser:this.client.user?.tag??null,
      voiceChannels:this.listVoiceChannels()
    };
  }

  private async onMessage(message: any) {
    if (message.author.bot || this.cfg.messageContentIntent !== true) return;
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
        case 'stop': this.queue=[]; this.ffmpeg?.kill('SIGTERM'); this.player.stop(); await message.reply('⏹️ Gestoppt.'); break;
        case 'pause': this.player.pause(); await message.reply('⏸️ Pausiert.'); break;
        case 'resume': this.player.unpause(); await message.reply('▶️ Fortgesetzt.'); break;
        case 'volume': this.volume=Math.max(0,Math.min(100,Number(rest[0]??80))); await message.reply(`🔊 ${this.volume}%`); break;
      }
    } catch(error){ await message.reply(`Fehler: ${error instanceof Error?error.message:String(error)}`).catch(()=>undefined); }
  }
}
