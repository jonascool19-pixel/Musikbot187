import Fastify from 'fastify';
import cors from '@fastify/cors';
import fastifyStatic from '@fastify/static';
import { Client, GatewayIntentBits, REST, Routes, SlashCommandBuilder, ChannelType, ActionRowBuilder, ButtonBuilder, ButtonStyle, EmbedBuilder } from 'discord.js';
import { AudioPlayerStatus, NoSubscriberBehavior, VoiceConnection, VoiceConnectionStatus, createAudioPlayer, createAudioResource, joinVoiceChannel, StreamType } from '@discordjs/voice';
import { execFile, spawn } from 'node:child_process';
import { promisify } from 'node:util';
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';

const execFileAsync = promisify(execFile);
const PORT = Number(process.env.PORT ?? 3000);
const APP_ROOT = path.resolve(process.env.APP_ROOT ?? path.join(import.meta.dirname, '../..'));
const DATA_DIR = path.resolve(process.env.DATA_DIR ?? '/var/lib/radiobot');
const MUSIC_DIR = path.join(DATA_DIR, 'music');
const DB_FILE = path.join(DATA_DIR, 'radiobot.json');
const SPOTIFY_FILE = path.join(DATA_DIR, 'spotify.json');
const UPDATE_LOG = path.join(DATA_DIR, 'update.status');
const WEB_USER = process.env.WEB_USER ?? 'admin';
const WEB_PASSWORD = process.env.WEB_PASSWORD ?? '';
const SPOTIFY_CLIENT_ID = process.env.SPOTIFY_CLIENT_ID ?? '';
const SPOTIFY_CLIENT_SECRET = process.env.SPOTIFY_CLIENT_SECRET ?? '';
const SPOTIFY_REDIRECT_URI = process.env.SPOTIFY_REDIRECT_URI ?? '';
const DISCORD_CONTROL_ROLE = process.env.DISCORD_CONTROL_ROLE ?? '';
const YTDLP = process.env.YTDLP_PATH ?? '/usr/local/bin/yt-dlp';

fs.mkdirSync(MUSIC_DIR, { recursive: true });
fs.mkdirSync(DATA_DIR, { recursive: true });

type SourceKind = 'file' | 'radio' | 'youtube';
type Radio = { id: string; name: string; url: string; enabled: boolean };
type QueueItem = { kind: SourceKind; value: string; label: string; playlistName?: string };
type GuildState = {
  guildId: string; voiceChannelId: string; statusChannelId?: string; statusMessageId?: string;
  playing?: string; playingType?: SourceKind; currentPlaylist?: string; volume: number; paused: boolean; queue: QueueItem[];
};
type PlaylistItem = { kind: SourceKind; value: string; label: string };
type Playlist = { id: string; name: string; kind: 'mixed' | 'local' | 'radio' | 'youtube' | 'spotify'; items: PlaylistItem[] };
type Db = { radios: Radio[]; guilds: Record<string, GuildState>; playlists: Playlist[] };
type SpotifyState = { accessToken?: string; refreshToken?: string; expiresAt?: number; displayName?: string };
type SearchItem = { kind: SourceKind | 'spotify'; value: string; label: string; meta?: string; url?: string };

function loadJson<T>(file: string, fallback: T): T { try { return JSON.parse(fs.readFileSync(file, 'utf8')) as T; } catch { return fallback; } }
function saveJson(file: string, value: unknown) { fs.writeFileSync(file, JSON.stringify(value, null, 2), { mode: 0o600 }); }
function makeId() { return crypto.randomBytes(6).toString('hex'); }
function guildState(guildId: string): GuildState { db.guilds[guildId] ??= { guildId, voiceChannelId: '', volume: 80, paused: false, queue: [] }; return db.guilds[guildId]; }
function mediaPath(file: string) { const root = path.resolve(MUSIC_DIR); const target = path.resolve(root, file); if (!target.startsWith(root + path.sep)) throw new Error('Ungültige Mediendatei'); return target; }
function spotifyPlaylistId(input: string) { return input.match(/(?:open\.spotify\.com\/playlist\/|spotify:playlist:)([A-Za-z0-9]+)/)?.[1] ?? null; }
function youtubePlaylistId(input: string) { return input.match(/[?&]list=([A-Za-z0-9_-]+)/)?.[1] ?? null; }
function isYoutubeUrl(input: string) { return /^https?:\/\/(?:www\.)?(?:youtube\.com|youtu\.be)\//i.test(input); }
function controlAllowed(member: any) { if (!DISCORD_CONTROL_ROLE) return true; return Boolean(member?.permissions?.has('Administrator') || member?.roles?.cache?.has(DISCORD_CONTROL_ROLE)); }
function auth(req: any, reply: any) {
  if (!WEB_PASSWORD) return true;
  const h = String(req.headers.authorization ?? '');
  if (!h.startsWith('Basic ')) { reply.header('WWW-Authenticate', 'Basic realm="RadioBot"').code(401).send('Authentication required'); return false; }
  const d = Buffer.from(h.slice(6), 'base64').toString('utf8'); const i = d.indexOf(':');
  const u = i >= 0 ? d.slice(0, i) : ''; const p = i >= 0 ? d.slice(i + 1) : '';
  if (u !== WEB_USER || p !== WEB_PASSWORD) { reply.header('WWW-Authenticate', 'Basic realm="RadioBot"').code(401).send('Invalid credentials'); return false; }
  return true;
}

const db = loadJson<Db>(DB_FILE, { radios: [], guilds: {}, playlists: [] });
db.playlists ??= [];
const spotify = loadJson<SpotifyState>(SPOTIFY_FILE, {});
let spotifyOAuthState = '';
const connections = new Map<string, VoiceConnection>();
const players = new Map<string, ReturnType<typeof createAudioPlayer>>();
const ffmpegs = new Map<string, ReturnType<typeof spawn>>();
const searches = new Map<string, { expires: number; items: SearchItem[] }>();
const client = new Client({ intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildVoiceStates] });

function getPlayer(guildId: string) {
  let player = players.get(guildId);
  if (!player) {
    player = createAudioPlayer({ behaviors: { noSubscriber: NoSubscriberBehavior.Stop } });
    player.on(AudioPlayerStatus.Idle, () => { ffmpegs.get(guildId)?.kill('SIGTERM'); ffmpegs.delete(guildId); playNext(guildId).catch(console.error); });
    player.on('error', e => console.error('audio error', guildId, e));
    players.set(guildId, player);
  }
  return player;
}

async function ensureVoice(guildId: string) {
  const state = guildState(guildId);
  if (!state.voiceChannelId) throw new Error('Kein Voice-Channel konfiguriert.');
  const guild = await client.guilds.fetch(guildId);
  const channel = await guild.channels.fetch(state.voiceChannelId);
  if (!channel || channel.type !== ChannelType.GuildVoice) throw new Error('Voice-Channel nicht gefunden.');
  const old = connections.get(guildId);
  if (old && old.state.status !== VoiceConnectionStatus.Destroyed) return old;
  const connection = joinVoiceChannel({ channelId: channel.id, guildId: guild.id, adapterCreator: guild.voiceAdapterCreator });
  connection.on('error', e => console.error('voice error', guildId, e));
  connection.subscribe(getPlayer(guildId));
  connections.set(guildId, connection);
  return connection;
}

async function resolveYoutube(value: string) {
  const args = isYoutubeUrl(value) ? ['--no-playlist', '--no-warnings', '--get-url', '-f', 'bestaudio/best', value] : ['--no-playlist', '--no-warnings', '--get-url', '-f', 'bestaudio/best', `ytsearch1:${value}`];
  const { stdout } = await execFileAsync(YTDLP, args, { timeout: 30000, maxBuffer: 1024 * 1024 });
  const direct = stdout.trim().split(/\r?\n/).filter(Boolean)[0];
  if (!direct) throw new Error('YouTube-Audio konnte nicht aufgelöst werden.');
  return direct;
}
async function youtubeSearch(query: string): Promise<SearchItem[]> {
  const { stdout } = await execFileAsync(YTDLP, ['--flat-playlist', '--no-warnings', '--dump-single-json', `ytsearch8:${query}`], { timeout: 30000, maxBuffer: 4 * 1024 * 1024 });
  const data = JSON.parse(stdout);
  return (data.entries ?? []).filter((x: any) => x?.id).map((x: any) => ({ kind: 'youtube' as const, value: `https://www.youtube.com/watch?v=${x.id}`, label: x.title ?? x.id, meta: x.uploader ?? 'YouTube', url: `https://www.youtube.com/watch?v=${x.id}` }));
}

async function updateStatus(guildId: string) {
  const state = guildState(guildId);
  if (!state.statusChannelId || !client.isReady()) return;
  try {
    const guild = await client.guilds.fetch(guildId);
    const channel = await guild.channels.fetch(state.statusChannelId);
    if (!channel || channel.type !== ChannelType.GuildText) return;
    const next = state.queue.slice(0, 5).map((x, i) => `${i + 1}. ${x.label}`).join('\n') || '— nichts in der Queue —';
    const content = ['📻 **RadioBot Status**', `🎵 **Jetzt:** ${state.playing ?? 'Nichts läuft'}`, `📂 **Quelle:** ${state.currentPlaylist ?? '—'}`, `⏯️ **Status:** ${state.playing ? (state.paused ? 'Pausiert' : 'Läuft') : 'Bereit'}`, '⏭️ **Als Nächstes:**', next, `🔊 **Lautstärke:** ${state.volume}%`, `🕒 Aktualisiert: <t:${Math.floor(Date.now() / 1000)}:R>`].join('\n');
    const ch = channel as any;
    if (state.statusMessageId) {
      try { const msg = await ch.messages.fetch(state.statusMessageId); await msg.edit(content); return; } catch { state.statusMessageId = undefined; }
    }
    const msg = await ch.send(content); state.statusMessageId = msg.id; saveJson(DB_FILE, db);
  } catch (error) { console.error('status update failed', guildId, error); }
}

async function playNext(guildId: string) {
  const state = guildState(guildId);
  const item = state.queue.shift();
  if (!item) { state.playing = undefined; state.playingType = undefined; state.currentPlaylist = undefined; saveJson(DB_FILE, db); await updateStatus(guildId); return; }
  try {
    const input = item.kind === 'file' ? mediaPath(item.value) : item.kind === 'youtube' ? await resolveYoutube(item.value) : item.value;
    state.playing = item.label; state.playingType = item.kind; state.currentPlaylist = item.playlistName ?? (item.kind === 'radio' ? 'Radio' : 'Direkt'); state.paused = false; saveJson(DB_FILE, db); await updateStatus(guildId);
    const connection = await ensureVoice(guildId);
    const args = item.kind === 'file' ? ['-hide_banner', '-loglevel', 'error', '-i', input, '-vn', '-f', 's16le', '-ar', '48000', '-ac', '2', 'pipe:1'] : ['-hide_banner', '-loglevel', 'error', '-reconnect', '1', '-reconnect_streamed', '1', '-reconnect_delay_max', '5', '-i', input, '-vn', '-f', 's16le', '-ar', '48000', '-ac', '2', 'pipe:1'];
    const ffmpeg = spawn('ffmpeg', args, { stdio: ['ignore', 'pipe', 'inherit'] }); ffmpegs.set(guildId, ffmpeg);
    ffmpeg.on('exit', () => { if (ffmpegs.get(guildId) === ffmpeg) ffmpegs.delete(guildId); });
    const resource = createAudioResource(ffmpeg.stdout, { inputType: StreamType.Raw, inlineVolume: true }); resource.volume?.setVolume(Math.max(0, Math.min(2, state.volume / 100)));
    connection.subscribe(getPlayer(guildId)); getPlayer(guildId).play(resource);
  } catch (error) {
    console.error('playback failed', guildId, error); state.playing = undefined; state.playingType = undefined; saveJson(DB_FILE, db); await updateStatus(guildId); await playNext(guildId);
  }
}

async function stopGuild(guildId: string) {
  const state = guildState(guildId); state.queue = []; state.playing = undefined; state.playingType = undefined; state.currentPlaylist = undefined;
  getPlayer(guildId).stop(true); ffmpegs.get(guildId)?.kill('SIGTERM'); ffmpegs.delete(guildId); connections.get(guildId)?.destroy(); connections.delete(guildId); saveJson(DB_FILE, db); await updateStatus(guildId);
}
function enqueue(guildId: string, item: QueueItem, replace = false) { const state = guildState(guildId); if (replace) state.queue = [item]; else state.queue.push(item); saveJson(DB_FILE, db); updateStatus(guildId).catch(() => undefined); return state; }

async function spotifyToken(): Promise<string> {
  if (spotify.accessToken && spotify.expiresAt && spotify.expiresAt > Date.now() + 30000) return spotify.accessToken;
  if (!SPOTIFY_CLIENT_ID || !SPOTIFY_CLIENT_SECRET || !spotify.refreshToken) throw new Error('Spotify ist noch nicht verbunden.');
  const basic = Buffer.from(`${SPOTIFY_CLIENT_ID}:${SPOTIFY_CLIENT_SECRET}`).toString('base64');
  const response = await fetch('https://accounts.spotify.com/api/token', { method: 'POST', headers: { Authorization: `Basic ${basic}`, 'Content-Type': 'application/x-www-form-urlencoded' }, body: new URLSearchParams({ grant_type: 'refresh_token', refresh_token: spotify.refreshToken }) });
  if (!response.ok) throw new Error(`Spotify token refresh fehlgeschlagen (${response.status})`);
  const data = await response.json() as any; spotify.accessToken = data.access_token; spotify.expiresAt = Date.now() + Number(data.expires_in ?? 3600) * 1000; if (data.refresh_token) spotify.refreshToken = data.refresh_token; saveJson(SPOTIFY_FILE, spotify); return spotify.accessToken!;
}
async function spotifyApi(endpoint: string, init: RequestInit = {}, retry = true): Promise<any> {
  const token = await spotifyToken(); const headers = new Headers(init.headers); headers.set('Authorization', `Bearer ${token}`); if (init.body && !headers.has('Content-Type')) headers.set('Content-Type', 'application/json');
  const response = await fetch(`https://api.spotify.com/v1${endpoint}`, { ...init, headers });
  if (response.status === 401 && retry && spotify.refreshToken) { spotify.expiresAt = 0; await spotifyToken(); return spotifyApi(endpoint, init, false); }
  if (!response.ok) throw new Error(`Spotify API ${response.status}: ${await response.text()}`); if (response.status === 204) return null; return response.json();
}
async function spotifySearch(query: string): Promise<SearchItem[]> { if (!spotify.refreshToken) return []; try { const data = await spotifyApi(`/search?${new URLSearchParams({ q: query, type: 'track', limit: '8' })}`); return data.tracks.items.map((t: any) => ({ kind: 'spotify' as const, value: t.uri, label: t.name, meta: t.artists.map((a: any) => a.name).join(', '), url: t.external_urls?.spotify })); } catch { return []; } }
async function importSpotifyPlaylist(url: string) {
  const id = spotifyPlaylistId(url); if (!id) throw new Error('Ungültige Spotify-Playlist-URL.');
  const data = await spotifyApi(`/playlists/${id}?${new URLSearchParams({ fields: 'id,name,tracks.items(track(name,artists(name)))' })}`);
  const items: PlaylistItem[] = (data.tracks?.items ?? []).filter((x: any) => x.track?.name).map((x: any) => { const label = `${x.track.artists?.map((a: any) => a.name).join(', ')} - ${x.track.name}`; return { kind: 'youtube', value: label, label }; });
  return { name: data.name, items };
}
async function importYoutubePlaylist(url: string) {
  if (!youtubePlaylistId(url)) throw new Error('Keine YouTube-Playlist erkannt.');
  const { stdout } = await execFileAsync(YTDLP, ['--flat-playlist', '--no-warnings', '--dump-single-json', url], { timeout: 30000, maxBuffer: 8 * 1024 * 1024 });
  const data = JSON.parse(stdout); const items: PlaylistItem[] = (data.entries ?? []).filter((x: any) => x?.id).map((x: any) => ({ kind: 'youtube', value: `https://www.youtube.com/watch?v=${x.id}`, label: x.title ?? x.id }));
  return { name: data.title ?? `YouTube Playlist ${youtubePlaylistId(url)}`, items };
}
async function unifiedSearch(query: string) {
  const needle = query.toLowerCase();
  const local: SearchItem[] = fs.readdirSync(MUSIC_DIR).filter(f => /\.(mp3|wav|ogg|flac|m4a)$/i.test(f) && f.toLowerCase().includes(needle)).slice(0, 12).map(f => ({ kind: 'file', value: f, label: f, meta: 'Lokal' }));
  const radios: SearchItem[] = db.radios.filter(r => `${r.name} ${r.url}`.toLowerCase().includes(needle)).slice(0, 12).map(r => ({ kind: 'radio', value: r.url, label: r.name, meta: 'Radio' }));
  const [youtube, sp] = await Promise.all([youtubeSearch(query).catch(() => []), spotifySearch(query)]); return { local, radios, youtube, spotify: sp };
}
async function queuePlaylist(guildId: string, playlist: Playlist, replace: boolean) {
  const items = playlist.items.map(item => ({ kind: item.kind, value: item.value, label: item.label, playlistName: playlist.name } as QueueItem));
  const state = guildState(guildId); if (replace) { await stopGuild(guildId); state.queue = items; } else state.queue.push(...items); saveJson(DB_FILE, db); await updateStatus(guildId); if (!state.playing) await playNext(guildId); return state;
}

const commands = [
  new SlashCommandBuilder().setName('join').setDescription('Bot in deinen Voice-Channel holen'),
  new SlashCommandBuilder().setName('statuschannel').setDescription('Status-Channel setzen').addChannelOption(o => o.setName('channel').setDescription('Text-Channel').setRequired(true).addChannelTypes(ChannelType.GuildText)),
  new SlashCommandBuilder().setName('search').setDescription('Musik suchen').addStringOption(o => o.setName('query').setDescription('Song, Artist oder Radio').setRequired(true)),
  new SlashCommandBuilder().setName('play').setDescription('Suchergebnis abspielen').addStringOption(o => o.setName('query').setDescription('Titel, Artist oder YouTube-URL').setRequired(true)),
  new SlashCommandBuilder().setName('playlist').setDescription('Playlist verwalten').addStringOption(o => o.setName('action').setDescription('list/play/queue').setRequired(true).addChoices({ name: 'list', value: 'list' }, { name: 'play', value: 'play' }, { name: 'queue', value: 'queue' })).addStringOption(o => o.setName('name').setDescription('Playlistname')),
  new SlashCommandBuilder().setName('queue').setDescription('Queue anzeigen'), new SlashCommandBuilder().setName('now').setDescription('Aktuellen Titel anzeigen'),
  new SlashCommandBuilder().setName('pause').setDescription('Pausieren'), new SlashCommandBuilder().setName('resume').setDescription('Fortsetzen'),
  new SlashCommandBuilder().setName('radio').setDescription('Radio starten').addStringOption(o => o.setName('name').setDescription('Sendername').setRequired(true)),
  new SlashCommandBuilder().setName('stop').setDescription('Stoppen'), new SlashCommandBuilder().setName('skip').setDescription('Überspringen'),
  new SlashCommandBuilder().setName('volume').setDescription('Lautstärke').addIntegerOption(o => o.setName('percent').setDescription('0-100').setRequired(true).setMinValue(0).setMaxValue(100))
].map(c => c.toJSON());

client.once('ready', async () => { console.log(`Discord online als ${client.user?.tag}`); try { await new REST({ version: '10' }).setToken(process.env.DISCORD_TOKEN!).put(Routes.applicationCommands(client.user!.id), { body: commands }); } catch (e) { console.error(e); } for (const g of client.guilds.cache.values()) updateStatus(g.id).catch(console.error); });

async function commandSearch(interaction: any, query: string) {
  const result = await unifiedSearch(query); const items = [...result.local, ...result.radios, ...result.youtube, ...result.spotify].slice(0, 20); const token = makeId();
  searches.set(`${interaction.guildId}:${interaction.user.id}:${token}`, { expires: Date.now() + 5 * 60_000, items });
  const lines = items.map((x, i) => `${i + 1}. **${x.label}** — ${x.meta ?? ''}`).join('\n') || 'Nichts gefunden.';
  const buttons = items.filter(x => x.kind !== 'spotify').slice(0, 5).map((_, i) => new ButtonBuilder().setCustomId(`rb:${token}:${i}`).setLabel(`▶ ${i + 1}`).setStyle(ButtonStyle.Primary));
  const row = buttons.length ? new ActionRowBuilder<ButtonBuilder>().addComponents(buttons) : undefined;
  await interaction.reply({ embeds: [new EmbedBuilder().setTitle(`Suche: ${query}`).setDescription(lines).setColor(0x8b5cf6)], components: row ? [row] : [] });
}

client.on('interactionCreate', async interaction => {
  try {
    if (interaction.isButton() && interaction.customId.startsWith('rb:')) {
      if (!interaction.guildId) return; const [, token, raw] = interaction.customId.split(':'); const saved = searches.get(`${interaction.guildId}:${interaction.user.id}:${token}`); const index = Number(raw);
      if (!saved || saved.expires < Date.now() || !saved.items[index]) return void interaction.reply({ content: 'Suche ist abgelaufen.', ephemeral: true });
      const member = await interaction.guild!.members.fetch(interaction.user.id); if (!controlAllowed(member)) return void interaction.reply({ content: 'Du darfst den Bot nicht steuern.', ephemeral: true });
      const item = saved.items[index]; if (item.kind === 'spotify') return void interaction.reply({ content: 'Spotify-Treffer sind nur für Playlist-Import/Suche.', ephemeral: true });
      const state = enqueue(interaction.guildId, { kind: item.kind, value: item.value, label: item.label, playlistName: 'Direkt' }); if (!state.playing) await playNext(interaction.guildId); return void interaction.reply(`▶️ **${item.label}**`);
    }
    if (!interaction.isChatInputCommand() || !interaction.guildId) return;
    const member = await interaction.guild!.members.fetch(interaction.user.id); if (!controlAllowed(member)) return void interaction.reply({ content: 'Du darfst den Bot nicht steuern.', ephemeral: true });
    const state = guildState(interaction.guildId);
    switch (interaction.commandName) {
      case 'join': if (!member.voice.channel || member.voice.channel.type !== ChannelType.GuildVoice) return void interaction.reply('Du musst selbst in einem Voice-Channel sein.'); state.voiceChannelId = member.voice.channel.id; saveJson(DB_FILE, db); await ensureVoice(interaction.guildId); return void interaction.reply(`🔊 Verbunden mit **${member.voice.channel.name}**`);
      case 'statuschannel': { const channel = interaction.options.getChannel('channel', true); state.statusChannelId = channel.id; state.statusMessageId = undefined; saveJson(DB_FILE, db); await updateStatus(interaction.guildId); return void interaction.reply(`📢 Status-Channel gesetzt: <#${channel.id}>`); }
      case 'search': return void commandSearch(interaction, interaction.options.getString('query', true));
      case 'play': {
        const query = interaction.options.getString('query', true).trim(); let item: SearchItem | undefined;
        if (isYoutubeUrl(query)) item = { kind: 'youtube', value: query, label: query, meta: 'YouTube' }; else { const found = await unifiedSearch(query); item = [...found.local, ...found.radios, ...found.youtube].find(x => x.kind !== 'spotify'); }
        if (!item) return void interaction.reply('Nichts direkt abspielbares gefunden.'); await stopGuild(interaction.guildId); enqueue(interaction.guildId, { kind: item.kind, value: item.value, label: item.label, playlistName: 'Direkt' }, true); await playNext(interaction.guildId); return void interaction.reply(`▶️ **${item.label}**`);
      }
      case 'playlist': {
        const action = interaction.options.getString('action', true); const name = interaction.options.getString('name')?.trim(); if (action === 'list') { const text = db.playlists.map(p => `• **${p.name}** (${p.items.length})`).join('\n') || 'Keine Playlists.'; return void interaction.reply(text); }
        if (!name) return void interaction.reply('Bitte einen Playlistnamen angeben.'); const playlist = db.playlists.find(p => p.name.toLowerCase() === name.toLowerCase()); if (!playlist) return void interaction.reply('Playlist nicht gefunden.'); if (!playlist.items.length) return void interaction.reply('Playlist ist leer.'); await queuePlaylist(interaction.guildId, playlist, action === 'play'); return void interaction.reply(`${action === 'play' ? '▶️ gestartet' : '➕ Queue'}: **${playlist.name}**`);
      }
      case 'queue': return void interaction.reply(state.queue.length ? `**Queue**\n${state.queue.slice(0, 20).map((x, i) => `${i + 1}. ${x.label}`).join('\n')}` : 'Queue ist leer.');
      case 'now': return void interaction.reply(state.playing ? `🎵 **${state.playing}**\n📂 ${state.currentPlaylist ?? 'Direkt'}` : 'Nichts läuft.');
      case 'pause': getPlayer(interaction.guildId).pause(); state.paused = true; saveJson(DB_FILE, db); await updateStatus(interaction.guildId); return void interaction.reply('⏸️ Pausiert.');
      case 'resume': getPlayer(interaction.guildId).unpause(); state.paused = false; saveJson(DB_FILE, db); await updateStatus(interaction.guildId); return void interaction.reply('▶️ Fortgesetzt.');
      case 'stop': await stopGuild(interaction.guildId); return void interaction.reply('⏹️ Gestoppt.');
      case 'skip': getPlayer(interaction.guildId).stop(true); return void interaction.reply('⏭️ Übersprungen.');
      case 'volume': state.volume = interaction.options.getInteger('percent', true); saveJson(DB_FILE, db); await updateStatus(interaction.guildId); return void interaction.reply(`🔊 ${state.volume}%`);
      case 'radio': { const name = interaction.options.getString('name', true); const radio = db.radios.find(r => r.name.toLowerCase() === name.toLowerCase()); if (!radio) return void interaction.reply('Sender nicht gefunden.'); await stopGuild(interaction.guildId); enqueue(interaction.guildId, { kind: 'radio', value: radio.url, label: radio.name, playlistName: `Radio: ${radio.name}` }, true); await playNext(interaction.guildId); return void interaction.reply(`📻 ${radio.name}`); }
    }
  } catch (error) { console.error(error); if (interaction.isRepliable() && !interaction.replied) await interaction.reply({ content: `Fehler: ${error instanceof Error ? error.message : 'Unbekannt'}`, ephemeral: true }); }
});

const app = Fastify({ logger: true });
await app.register(cors, { origin: true }); await app.register(fastifyStatic, { root: path.join(APP_ROOT, 'frontend'), prefix: '/', index: ['index.html'] });
app.addHook('preHandler', async (req, reply) => { if (req.url.startsWith('/api/') && !req.url.startsWith('/api/spotify/callback') && !auth(req, reply)) return reply; });

app.get('/api/health', async () => ({ ok: true, discord: client.isReady(), version: '2.0.0', youtube: fs.existsSync(YTDLP), spotify: Boolean(spotify.refreshToken) }));
app.get('/api/guilds', async () => client.guilds.cache.map(g => ({ id: g.id, name: g.name })));
app.get<{ Params: { id: string } }>('/api/guilds/:id/channels', async req => { const g = await client.guilds.fetch(req.params.id); return { voice: g.channels.cache.filter(c => c.type === ChannelType.GuildVoice).map(c => ({ id: c.id, name: c.name })), text: g.channels.cache.filter(c => c.type === ChannelType.GuildText).map(c => ({ id: c.id, name: c.name })) }; });
app.get('/api/radios', async () => db.radios);
app.post<{ Body: { name: string; url: string } }>('/api/radios', async req => { const radio: Radio = { id: makeId(), name: req.body.name.trim(), url: req.body.url.trim(), enabled: true }; if (!radio.name || !/^https?:\/\//i.test(radio.url)) throw new Error('Name und HTTP(S)-Stream-URL erforderlich.'); db.radios.push(radio); saveJson(DB_FILE, db); return radio; });
app.delete<{ Params: { id: string } }>('/api/radios/:id', async req => { db.radios = db.radios.filter(r => r.id !== req.params.id); saveJson(DB_FILE, db); return { ok: true }; });
app.get('/api/media', async () => fs.readdirSync(MUSIC_DIR).filter(f => /\.(mp3|wav|ogg|flac|m4a)$/i.test(f)).sort());
app.get<{ Params: { id: string } }>('/api/state/:id', async req => guildState(req.params.id));
app.post<{ Params: { id: string }; Body: { voiceChannelId: string } }>('/api/state/:id/voice', async req => { const s = guildState(req.params.id); s.voiceChannelId = req.body.voiceChannelId; saveJson(DB_FILE, db); return s; });
app.post<{ Params: { id: string }; Body: { statusChannelId: string } }>('/api/state/:id/status-channel', async req => { const s = guildState(req.params.id); s.statusChannelId = req.body.statusChannelId; s.statusMessageId = undefined; saveJson(DB_FILE, db); await updateStatus(req.params.id); return s; });
app.post<{ Params: { id: string }; Body: { radioId: string; append?: boolean } }>('/api/state/:id/radio', async req => { const r = db.radios.find(x => x.id === req.body.radioId); if (!r) throw new Error('Radio nicht gefunden.'); const s = enqueue(req.params.id, { kind: 'radio', value: r.url, label: r.name, playlistName: `Radio: ${r.name}` }, !req.body.append); if (!s.playing) await playNext(req.params.id); return s; });
app.post<{ Params: { id: string }; Body: { file: string; append?: boolean } }>('/api/state/:id/file', async req => { const file = mediaPath(req.body.file); if (!fs.existsSync(file)) throw new Error('Datei nicht gefunden.'); const s = enqueue(req.params.id, { kind: 'file', value: req.body.file, label: req.body.file, playlistName: 'Direkt / Lokal' }, !req.body.append); if (!s.playing) await playNext(req.params.id); return s; });
app.post<{ Params: { id: string } }>('/api/state/:id/stop', async req => { await stopGuild(req.params.id); return guildState(req.params.id); });
app.post<{ Params: { id: string } }>('/api/state/:id/skip', async req => { getPlayer(req.params.id).stop(true); return guildState(req.params.id); });
app.post<{ Params: { id: string } }>('/api/state/:id/pause', async req => { const s = guildState(req.params.id); getPlayer(req.params.id).pause(); s.paused = true; saveJson(DB_FILE, db); await updateStatus(req.params.id); return s; });
app.post<{ Params: { id: string } }>('/api/state/:id/resume', async req => { const s = guildState(req.params.id); getPlayer(req.params.id).unpause(); s.paused = false; saveJson(DB_FILE, db); await updateStatus(req.params.id); return s; });
app.post<{ Params: { id: string }; Body: { volume: number } }>('/api/state/:id/volume', async req => { const s = guildState(req.params.id); s.volume = Math.max(0, Math.min(100, Number(req.body.volume))); saveJson(DB_FILE, db); await updateStatus(req.params.id); return s; });
app.get<{ Params: { id: string } }>('/api/state/:id/queue', async req => guildState(req.params.id).queue);
app.delete<{ Params: { id: string } }>('/api/state/:id/queue', async req => { guildState(req.params.id).queue = []; saveJson(DB_FILE, db); await updateStatus(req.params.id); return { ok: true }; });
app.get('/api/playlists', async () => db.playlists.map(p => ({ id: p.id, name: p.name, kind: p.kind, count: p.items.length })));
app.post<{ Body: { name: string; kind?: Playlist['kind']; items?: PlaylistItem[] } }>('/api/playlists', async req => { const p: Playlist = { id: makeId(), name: req.body.name.trim() || 'Neue Playlist', kind: req.body.kind ?? 'mixed', items: req.body.items ?? [] }; db.playlists.push(p); saveJson(DB_FILE, db); return p; });
app.delete<{ Params: { id: string } }>('/api/playlists/:id', async req => { db.playlists = db.playlists.filter(p => p.id !== req.params.id); saveJson(DB_FILE, db); return { ok: true }; });
app.post<{ Params: { id: string; guildId: string }; Body: { append?: boolean } }>('/api/playlists/:id/play/:guildId', async req => { const p = db.playlists.find(x => x.id === req.params.id); if (!p) throw new Error('Playlist nicht gefunden.'); return queuePlaylist(req.params.guildId, p, !req.body.append); });
app.get<{ Querystring: { q?: string } }>('/api/search', async req => { const q = String(req.query.q ?? '').trim(); if (!q) return { local: [], radios: [], youtube: [], spotify: [] }; return unifiedSearch(q); });

app.get('/api/spotify/status', async () => ({ configured: Boolean(SPOTIFY_CLIENT_ID && SPOTIFY_CLIENT_SECRET && SPOTIFY_REDIRECT_URI), connected: Boolean(spotify.refreshToken), displayName: spotify.displayName ?? null }));
app.get('/api/spotify/login', async (_req, reply) => { if (!SPOTIFY_CLIENT_ID || !SPOTIFY_CLIENT_SECRET || !SPOTIFY_REDIRECT_URI) return reply.code(400).send('Spotify-Konfiguration fehlt'); spotifyOAuthState = crypto.randomBytes(18).toString('hex'); const q = new URLSearchParams({ response_type: 'code', client_id: SPOTIFY_CLIENT_ID, redirect_uri: SPOTIFY_REDIRECT_URI, scope: 'playlist-read-private playlist-read-collaborative user-read-private', state: spotifyOAuthState }); return reply.redirect(`https://accounts.spotify.com/authorize?${q}`); });
app.get<{ Querystring: { code?: string; state?: string } }>('/api/spotify/callback', async (req, reply) => { if (!req.query.code || !req.query.state || req.query.state !== spotifyOAuthState) return reply.code(400).send('Ungültiger Spotify-OAuth-State.'); spotifyOAuthState = ''; const basic = Buffer.from(`${SPOTIFY_CLIENT_ID}:${SPOTIFY_CLIENT_SECRET}`).toString('base64'); const response = await fetch('https://accounts.spotify.com/api/token', { method: 'POST', headers: { Authorization: `Basic ${basic}`, 'Content-Type': 'application/x-www-form-urlencoded' }, body: new URLSearchParams({ grant_type: 'authorization_code', code: req.query.code, redirect_uri: SPOTIFY_REDIRECT_URI }) }); if (!response.ok) return reply.code(400).send('Spotify-Token konnte nicht erstellt werden.'); const token = await response.json() as any; spotify.accessToken = token.access_token; spotify.refreshToken = token.refresh_token; spotify.expiresAt = Date.now() + Number(token.expires_in ?? 3600) * 1000; const me = await spotifyApi('/me'); spotify.displayName = me.display_name ?? me.id; saveJson(SPOTIFY_FILE, spotify); return reply.redirect('/?spotify=connected'); });
app.post<{ Body: { url: string; name?: string } }>('/api/spotify/import-playlist', async req => { const imported = await importSpotifyPlaylist(req.body.url); const p: Playlist = { id: makeId(), name: req.body.name?.trim() || imported.name, kind: 'spotify', items: imported.items }; db.playlists.push(p); saveJson(DB_FILE, db); return p; });
app.get<{ Querystring: { q?: string } }>('/api/spotify/search', async req => ({ tracks: await spotifySearch(String(req.query.q ?? '')) }));
app.post<{ Body: { url: string; name?: string } }>('/api/youtube/import-playlist', async req => { const imported = await importYoutubePlaylist(req.body.url); const p: Playlist = { id: makeId(), name: req.body.name?.trim() || imported.name, kind: 'youtube', items: imported.items }; db.playlists.push(p); saveJson(DB_FILE, db); return p; });

app.post('/api/update', async (_req, reply) => { if (!fs.existsSync('/usr/local/sbin/radiobot-update')) return reply.code(503).send('Update-Helfer ist nicht installiert.'); fs.writeFileSync(UPDATE_LOG, `started ${new Date().toISOString()}\n`, { mode: 0o600 }); const child = spawn('sudo', ['-n', '/usr/local/sbin/radiobot-update'], { detached: true, stdio: 'ignore' }); child.unref(); return { ok: true, message: 'Update gestartet. Der Dienst wird danach automatisch neu gestartet.' }; });
app.get('/api/update/status', async () => ({ status: fs.existsSync(UPDATE_LOG) ? fs.readFileSync(UPDATE_LOG, 'utf8') : 'idle' }));

await app.listen({ port: PORT, host: '0.0.0.0' });
if (process.env.DISCORD_TOKEN) client.login(process.env.DISCORD_TOKEN).catch(console.error); else console.warn('DISCORD_TOKEN fehlt. Weboberfläche läuft, Discord ist offline.');
