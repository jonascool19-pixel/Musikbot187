import { Client, GatewayIntentBits, PermissionsBitField, SlashCommandBuilder, type ChatInputCommandInteraction } from 'discord.js';
import { joinVoiceChannel, createAudioPlayer, createAudioResource, AudioPlayerStatus, NoSubscriberBehavior, StreamType, VoiceConnectionStatus, entersState, type VoiceConnection } from '@discordjs/voice';
import type { ChildProcessWithoutNullStreams } from 'node:child_process';
import { spawnPcm, mediaTitle, searchYouTube, searchRadio } from './media.js';
import { readConfig } from './config.js';

const SLASH_COMMANDS = [
  new SlashCommandBuilder().setName('play').setDescription('Musik oder Radio abspielen').addStringOption(o => o.setName('quelle').setDescription('Titel, Suchbegriff oder URL').setRequired(true)),
  new SlashCommandBuilder().setName('suche').setDescription('Musik bei YouTube suchen').addStringOption(o => o.setName('begriff').setDescription('Suchbegriff').setRequired(true)),
  new SlashCommandBuilder().setName('radio').setDescription('Radiosender suchen').addStringOption(o => o.setName('begriff').setDescription('Sendername').setRequired(true)),
  new SlashCommandBuilder().setName('playlist').setDescription('Playlist anzeigen oder abspielen').addStringOption(o => o.setName('name').setDescription('Playlistname, leer = Liste').setRequired(false)),
  new SlashCommandBuilder().setName('warteschlange').setDescription('Aktuelle Warteschlange anzeigen'),
  new SlashCommandBuilder().setName('skip').setDescription('Aktuellen Titel überspringen'),
  new SlashCommandBuilder().setName('stop').setDescription('Wiedergabe stoppen'),
  new SlashCommandBuilder().setName('pause').setDescription('Wiedergabe pausieren'),
  new SlashCommandBuilder().setName('fortsetzen').setDescription('Wiedergabe fortsetzen'),
  new SlashCommandBuilder().setName('lautstaerke').setDescription('Lautstärke setzen').addIntegerOption(o => o.setName('wert').setDescription('0 bis 100').setMinValue(0).setMaxValue(100).setRequired(true)),
  new SlashCommandBuilder().setName('hilfe').setDescription('Discord-Befehle anzeigen')
].map(command => command.toJSON());

function errorText(error: unknown) { return error instanceof Error ? error.message : String(error); }

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
  private readonly playlistProvider: () => any[];
  private readonly searchResults = new Map<string, any[]>();
  private logs: Array<{ time: string; level: string; message: string }> = [];

  constructor(cfg: any, playlistProvider: () => any[] = () => readConfig().playlists ?? []) {
    this.cfg = cfg;
    this.playlistProvider = playlistProvider;
    const intents = [GatewayIntentBits.Guilds, GatewayIntentBits.GuildVoiceStates];
    if (cfg.messageContentIntent === true) intents.push(GatewayIntentBits.GuildMessages, GatewayIntentBits.MessageContent);
    this.client = new Client({ intents });
    this.client.once('clientReady', () => {
      this.connected = true;
      this.lastError = '';
      this.inviteUrl = this.buildInviteUrl();
      this.log('INFO', `Discord verbunden als ${this.client.user?.tag ?? 'unbekannt'}.`);
      void this.registerSlashCommands();
      if (this.cfg.voiceChannelId) {
        void this.ensureVoice().catch(error => this.recordError(`Automatischer Voice-Beitritt fehlgeschlagen: ${errorText(error)}`));
      } else {
        this.log('INFO', 'Kein Voice-Kanal konfiguriert; der Bot bleibt zunächst im Server-Textkanal online.');
      }
    });
    this.client.on('error', error => { this.connected = false; this.recordError(`Discord-Client: ${errorText(error)}`); });
    this.client.on('shardError', error => { this.connected = false; this.recordError(`Discord-Shard: ${errorText(error)}`); });
    this.client.on('invalidated', () => { this.connected = false; this.recordError('Discord-Session wurde ungültig. Token prüfen.'); });
    this.client.on('interactionCreate', interaction => { void this.onInteraction(interaction); });
    if (cfg.messageContentIntent === true) this.client.on('messageCreate', m => this.onMessage(m).catch(e => this.recordError(`Discord command: ${errorText(e)}`)));
    this.player.on(AudioPlayerStatus.Idle, () => { void this.next(); });
    this.player.on('error', error => this.recordError(`Audio-Player: ${error.message}`));
  }

  private log(level: string, message: string) {
    const entry = { time: new Date().toISOString(), level, message };
    this.logs.push(entry);
    if (this.logs.length > 120) this.logs.splice(0, this.logs.length - 120);
    if (level === 'ERROR') this.lastError = message;
    console.log(`[Discord ${this.cfg.name}] ${level}: ${message}`);
  }

  private recordError(message: string) {
    this.log('ERROR', message);
  }

  clearLogs() {
    this.logs = [];
    this.lastError = '';
  }

  private async registerSlashCommands() {
    try {
      if (!this.client.application) return;
      for (const guild of this.client.guilds.cache.values()) await guild.commands.set(SLASH_COMMANDS);
      this.log('INFO', `Discord-Befehle für ${this.client.guilds.cache.size} Server registriert.`);
    } catch (error) {
      this.recordError(`Discord-Befehle konnten nicht registriert werden: ${errorText(error)}`);
    }
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
      PermissionsBitField.Flags.EmbedLinks,
      PermissionsBitField.Flags.ReadMessageHistory,
      PermissionsBitField.Flags.Connect,
      PermissionsBitField.Flags.Speak,
      PermissionsBitField.Flags.UseApplicationCommands
    ]).bitfield.toString();
    return `https://discord.com/oauth2/authorize?client_id=${encodeURIComponent(clientId)}&scope=bot%20applications.commands&permissions=${permissions}`;
  }

  isEnabled() { return this.cfg.prefix !== '__RADIOBOT_DISABLED__'; }

  async start() {
    if (!this.isEnabled()) { this.connected = false; this.recordError('Instanz deaktiviert.'); return; }
    if (!this.cfg.token) { this.connected = false; this.recordError('Bot-Token fehlt.'); return; }
    this.inviteUrl = this.buildInviteUrl();
    try {
      this.lastError = '';
      await this.client.login(this.cfg.token);
    } catch (error) {
      this.connected = false;
      this.recordError(`Discord-Login fehlgeschlagen: ${errorText(error)}`);
      throw error;
    }
  }

  async stop() {
    this.ffmpeg?.kill('SIGTERM');
    this.connection?.destroy();
    this.connected = false;
    this.inviteUrl = '';
    try { await this.client.destroy(); } catch (error) { this.recordError(`Discord-Stop: ${errorText(error)}`); }
  }

  async restart() { await this.stop(); await this.start(); }

  private guildForChannels(guildId = this.cfg.guildId) {
    const configured = guildId ? this.client.guilds.cache.get(guildId) : undefined;
    if (configured) return configured;
    if (!guildId && this.client.guilds.cache.size === 1) return this.client.guilds.cache.first();
    return this.client.guilds.cache.size === 1 ? this.client.guilds.cache.first() : undefined;
  }

  listVoiceChannels(guildId = this.cfg.guildId) {
    const guild = this.guildForChannels(guildId);
    if (!guild) return [];
    return [...guild.channels.cache.values()]
      .filter((channel: any) => typeof channel.isVoiceBased === 'function' && channel.isVoiceBased())
      .map((channel: any) => ({ id: channel.id, name: channel.name, type: channel.type }))
      .sort((a, b) => a.name.localeCompare(b.name, 'de'));
  }

  async fetchVoiceChannels(guildId = this.cfg.guildId) {
    if (!this.client.isReady()) throw new Error('Discord ist noch nicht verbunden.');
    const guild = this.guildForChannels(guildId);
    if (!guild) throw new Error('Discord-Server nicht gefunden. Prüfe die Guild-ID.');
    const fetched = await guild.channels.fetch();
    const channels = [...fetched.values()]
      .filter((channel: any) => channel && typeof channel.isVoiceBased === 'function' && channel.isVoiceBased())
      .map((channel: any) => ({ id: channel.id, name: channel.name, type: channel.type }))
      .sort((a, b) => a.name.localeCompare(b.name, 'de'));
    if (!channels.length) throw new Error('Keine Sprachkanäle gefunden. Prüfe die Server-/Kanalrechte des Bots.');
    return channels;
  }

  async ensureVoice() {
    if (!this.client.isReady()) throw new Error('Discord ist noch nicht verbunden.');
    const guild = this.guildForChannels(this.cfg.guildId);
    if (!guild) throw new Error('Discord-Server nicht gefunden. Bitte Bot-Einladung und Guild-ID prüfen.');
    const fetched = await guild.channels.fetch(this.cfg.voiceChannelId).catch(() => null) as any;
    const channel = fetched && typeof fetched.isVoiceBased === 'function' && fetched.isVoiceBased() ? fetched : guild.channels.cache.get(this.cfg.voiceChannelId) as any;
    if (!channel?.isVoiceBased?.()) throw new Error('Kein gültiger Discord-Sprachkanal ausgewählt.');
    const me = guild.members.me ?? await guild.members.fetchMe().catch(() => null);
    const permissions = me ? channel.permissionsFor(me) : null;
    if (!permissions?.has(PermissionsBitField.Flags.ViewChannel)) throw new Error(`Discord darf den Kanal „${channel.name}“ nicht sehen (ViewChannel).`);
    if (!permissions?.has(PermissionsBitField.Flags.Connect)) throw new Error(`Discord darf „${channel.name}“ nicht beitreten (Connect).`);
    if (!permissions?.has(PermissionsBitField.Flags.Speak) && channel.type !== 13) throw new Error(`Discord darf in „${channel.name}“ nicht sprechen (Speak).`);
    this.connection?.destroy();
    this.log('INFO', `Verbinde mit Voice-Kanal „${channel.name}“ (${channel.id}).`);
    this.connection = joinVoiceChannel({ channelId: channel.id, guildId: guild.id, adapterCreator: guild.voiceAdapterCreator, selfDeaf: true, selfMute: false });
    this.connection.on(VoiceConnectionStatus.Disconnected, async () => {
      this.recordError('Discord-Voice-Verbindung wurde getrennt.');
      try { await entersState(this.connection!, VoiceConnectionStatus.Signalling, 5_000); } catch { this.connection?.destroy(); }
    });
    await entersState(this.connection, VoiceConnectionStatus.Ready, 15_000);
    this.connection.subscribe(this.player);
    this.log('INFO', `Voice-Kanal „${channel.name}“ ist verbunden.`);
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
      this.log('INFO', `Starte Wiedergabe: ${item.title}`);
      await this.ensureVoice();
      const ff = await spawnPcm(item.input, this.volume);
      this.ffmpeg = ff;
      await new Promise<void>((resolve, reject) => {
        let settled = false;
        const done = (error?: Error) => { if (settled) return; settled = true; error ? reject(error) : resolve(); };
        ff.once('error', error => done(error as Error));
        ff.once('close', code => code === 0 ? done() : done(new Error(`FFmpeg beendet (${code})`)));
        try { this.player.play(createAudioResource(ff.stdout, { inputType: StreamType.Raw })); }
        catch (error) { done(error instanceof Error ? error : new Error(String(error))); }
      });
      this.log('INFO', `Wiedergabe beendet: ${item.title}`);
    } catch (error) {
      this.recordError(`Wiedergabe fehlgeschlagen: ${errorText(error)}`);
    } finally {
      this.ffmpeg = undefined;
      this.current = undefined;
      if (this.queue.length) void this.next();
    }
  }

  state() {
    const guilds = [...this.client.guilds.cache.values()].map((guild: any) => ({ id:guild.id, name:guild.name })).sort((a,b)=>a.name.localeCompare(b.name,'de'));
    return { id:this.cfg.id, name:this.cfg.name, type:'discord', enabled:this.isEnabled(), connected:this.connected, playing:this.current?.title ?? null, queue:this.queue.map(x=>x.title), volume:this.volume, error:this.lastError||null, logs:[...this.logs], inviteUrl:this.inviteUrl||this.buildInviteUrl()||null, botUser:this.client.user?.tag??null, guilds, voiceChannels:this.listVoiceChannels() };
  }

  private playlistReply(interaction: ChatInputCommandInteraction, name?: string) {
    const playlists = this.playlistProvider();
    if (!name) {
      const text = playlists.length ? playlists.map((p, i) => `${i + 1}. ${p.name} (${p.items?.length ?? 0} Titel)`).join('\n') : 'Keine Playlists vorhanden.';
      return interaction.reply({ content: `📚 Playlists\n${text}`, ephemeral: true });
    }
    const normalized = name.trim().toLowerCase();
    const playlist = playlists.find(p => String(p.name).toLowerCase() === normalized) ?? playlists.find(p => String(p.name).toLowerCase().includes(normalized));
    if (!playlist) return interaction.reply({ content: `Playlist „${name}“ nicht gefunden.`, ephemeral: true });
    return this.queuePlaylist(playlist.items ?? [], interaction);
  }

  private async queuePlaylist(items: any[], interaction: ChatInputCommandInteraction) {
    if (!items.length) return interaction.reply({ content: 'Die Playlist ist leer.', ephemeral: true });
    await interaction.deferReply();
    let added = 0;
    for (const item of items) { try { await this.add(String(item.input ?? ''), false); added++; } catch (error) { this.recordError(`Playlist-Eintrag konnte nicht geladen werden: ${errorText(error)}`); } }
    await interaction.editReply(`📚 ${added} Titel zur Queue hinzugefügt.`);
  }

  private async onInteraction(interaction: any) {
    if (!interaction.isChatInputCommand()) return;
    try {
      switch (interaction.commandName) {
        case 'play': {
          const query = interaction.options.getString('quelle', true);
          const item = this.searchResults.get(interaction.user.id)?.[Number(query) - 1];
          await interaction.deferReply({ ephemeral: true });
          const added = await this.add(item?.url ?? query, true);
          await interaction.editReply(`▶️ ${added.title} wird abgespielt.`);
          break;
        }
        case 'suche': {
          const q = interaction.options.getString('begriff', true);
          const results = await searchYouTube(q);
          this.searchResults.set(interaction.user.id, results);
          const text = results.slice(0, 8).map((r: any, i: number) => `${i + 1}. **${r.title}** — ${r.channel || 'YouTube'}`).join('\n');
          await interaction.reply({ content: results.length ? `🔎 Suchergebnisse für „${q}“\n${text}\n\nDanach: /play quelle:<Nummer>` : `Keine Treffer für „${q}“.`, ephemeral: true });
          break;
        }
        case 'radio': {
          const q = interaction.options.getString('begriff', true);
          const results = await searchRadio(q);
          this.searchResults.set(interaction.user.id, results.map((r: any) => ({ ...r, url: r.url })));
          const text = results.slice(0, 8).map((r: any, i: number) => `${i + 1}. **${r.name}** — ${r.country || 'Radio'}`).join('\n');
          await interaction.reply({ content: results.length ? `📻 Radiosender für „${q}“\n${text}\n\nDanach: /play quelle:<Nummer>` : 'Keine Radiosender gefunden.', ephemeral: true });
          break;
        }
        case 'playlist': await this.playlistReply(interaction, interaction.options.getString('name') ?? undefined); break;
        case 'warteschlange': {
          const current = this.current?.title ? `▶️ ${this.current.title}\n` : '';
          const queued = this.queue.length ? this.queue.map((x, i) => `${i + 1}. ${x.title}`).join('\n') : 'Queue ist leer.';
          await interaction.reply({ content: `${current}${queued}`, ephemeral: true });
          break;
        }
        case 'skip': this.ffmpeg?.kill('SIGTERM'); this.player.stop(); await interaction.reply({ content: '⏭️ Übersprungen.', ephemeral: true }); break;
        case 'stop': this.queue=[]; this.ffmpeg?.kill('SIGTERM'); this.player.stop(); this.current=undefined; await interaction.reply({ content: '⏹️ Gestoppt.', ephemeral: true }); break;
        case 'pause': this.player.pause(); await interaction.reply({ content: '⏸️ Pausiert.', ephemeral: true }); break;
        case 'fortsetzen': this.player.unpause(); await interaction.reply({ content: '▶️ Fortgesetzt.', ephemeral: true }); break;
        case 'lautstaerke': this.volume = interaction.options.getInteger('wert', true); await interaction.reply({ content: `🔊 Lautstärke ${this.volume}%`, ephemeral: true }); break;
        case 'hilfe': await interaction.reply({ content: 'Discord-Steuerung: /suche, /play, /radio, /playlist, /warteschlange, /skip, /stop, /pause, /fortsetzen, /lautstaerke', ephemeral: true }); break;
      }
    } catch (error) {
      const message = errorText(error);
      this.recordError(`Discord-Befehl /${interaction.commandName}: ${message}`);
      if (interaction.deferred || interaction.replied) await interaction.editReply(`Fehler: ${message}`).catch(() => undefined);
      else await interaction.reply({ content: `Fehler: ${message}`, ephemeral: true }).catch(() => undefined);
    }
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
        case 'skip': this.ffmpeg?.kill('SIGTERM'); this.player.stop(); await message.reply('⏭️ Übersprungen.'); break;
        case 'stop': this.queue=[]; this.ffmpeg?.kill('SIGTERM'); this.player.stop(); await message.reply('⏹️ Gestoppt.'); break;
        case 'pause': this.player.pause(); await message.reply('⏸️ Pausiert.'); break;
        case 'resume': this.player.unpause(); await message.reply('▶️ Fortgesetzt.'); break;
        case 'volume': this.volume=Math.max(0,Math.min(100,Number(rest[0]??80))); await message.reply(`🔊 ${this.volume}%`); break;
      }
    } catch(error){ const messageText = errorText(error); this.recordError(`Prefix-Befehl ${command || '?'}: ${messageText}`); await message.reply(`Fehler: ${messageText}`).catch(()=>undefined); }
  }
}
