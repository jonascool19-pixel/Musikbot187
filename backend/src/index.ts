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
const WEB_USER = process.env.WEB_USER ?? 'admin';
const WEB_PASSWORD = process.env.WEB_PASSWORD ?? '';
const SPOTIFY_CLIENT_ID = process.env.SPOTIFY_CLIENT_ID ?? '';
const SPOTIFY_CLIENT_SECRET = process.env.SPOTIFY_CLIENT_SECRET ?? '';
const SPOTIFY_REDIRECT_URI = process.env.SPOTIFY_REDIRECT_URI ?? '';
const DISCORD_CONTROL_ROLE = process.env.DISCORD_CONTROL_ROLE ?? '';
const YTDLP = process.env.YTDLP_PATH ?? '/usr/local/bin/yt-dlp';

fs.mkdirSync(MUSIC_DIR, { recursive: true });
fs.mkdirSync(DATA_DIR, { recursive: true });

type Radio = { id: string; name: string; url: string; enabled: boolean };
type SourceKind = 'file' | 'radio' | 'youtube';
type QueueItem = { kind: SourceKind; value: string; label: string };
type GuildState = { guildId: string; voiceChannelId: string; playing?: string; playingType?: SourceKind; volume: number; paused: boolean; queue: QueueItem[] };
type PlaylistItem = { kind: SourceKind | 'spotify'; value: string; label: string };
type Playlist = { id: string; name: string; kind: 'mixed' | 'local' | 'radio' | 'youtube' | 'spotify'; items: PlaylistItem[] };
type Db = { radios: Radio[]; guilds: Record<string, GuildState>; playlists: Playlist[] };
type SpotifyState = { accessToken?: string; refreshToken?: string; expiresAt?: number; displayName?: string };
type SearchItem = { kind: SourceKind | 'spotify'; value: string; label: string; meta?: string; url?: string };

function loadJson<T>(file: string, fallback: T): T { try { return JSON.parse(fs.readFileSync(file, 'utf8')) as T; } catch { return fallback; } }
function saveJson(file: string, value: unknown) { fs.writeFileSync(file, JSON.stringify(value, null, 2), { mode: 0o600 }); }
function makeId() { return crypto.randomBytes(6).toString('hex'); }
function guildState(guildId: string): GuildState { db.guilds[guildId] ??= { guildId, voiceChannelId: '', volume: 80, paused: false, queue: [] }; return db.guilds[guildId]; }
function mediaPath(file: string) { const root = path.resolve(MUSIC_DIR); const target = path.resolve(root, file); if (!target.startsWith(root + path.sep)) throw new Error('Ungültige Mediendatei'); return target; }
function auth(req: any, reply: any) { if (!WEB_PASSWORD) return true; const h = String(req.headers.authorization ?? ''); if (!h.startsWith('Basic ')) { reply.header('WWW-Authenticate', 'Basic realm="RadioBot"').code(401).send('Authentication required'); return false; } const d = Buffer.from(h.slice(6), 'base64').toString('utf8'); const i = d.indexOf(':'); const u = i >= 0 ? d.slice(0, i) : ''; const p = i >= 0 ? d.slice(i + 1) : ''; if (u !== WEB_USER || p !== WEB_PASSWORD) { reply.header('WWW-Authenticate', 'Basic realm="RadioBot"').code(401).send('Invalid credentials'); return false; } return true; }
function spotifyPlaylistId(input: string) { return input.match(/(?:open\.spotify\.com\/playlist\/|spotify:playlist:)([A-Za-z0-9]+)/)?.[1] ?? null; }
function youtubePlaylistId(input: string) { return input.match(/[?&]list=([A-Za-z0-9_-]+)/)?.[1] ?? null; }
function isYoutubeUrl(input: string) { return /^https?:\/\/(?:www\.)?(?:youtube\.com|youtu\.be)\//i.test(input); }
function controlAllowed(member: any) { if (!DISCORD_CONTROL_ROLE) return true; return Boolean(member?.permissions?.has('Administrator') || member?.roles?.cache?.has(DISCORD_CONTROL_ROLE)); }

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
  let p = players.get(guildId);
  if (!p) {
    p = createAudioPlayer({ behaviors: { noSubscriber: NoSubscriberBehavior.Stop } });
    p.on(AudioPlayerStatus.Idle, () => { ffmpegs.get(guildId)?.kill('SIGTERM'); ffmpegs.delete(guildId); playNext(guildId).catch(console.error); });
    p.on('error', e => console.error('audio error', guildId, e));
    players.set(guildId, p);
  }
  return p;
}

async function ensureVoice(guildId: string) {
  const state = guildState(guildId);
  if (!state.voiceChannelId) throw new Error('Kein Voice-Channel konfiguriert.');
  const guild = await client.guilds.fetch(guildId);
  const channel = await guild.channels.fetch(state.voiceChannelId);
  if (!channel || channel.type !== ChannelType.GuildVoice) throw new Error('Voice-Channel nicht gefunden.');
  const existing = connections.get(guildId);
  if (existing && existing.state.status !== VoiceConnectionStatus.Destroyed) return existing;
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

async function playNext(guildId: string) {
  const state = guildState(guildId);
  const item = state.queue.shift();
  if (!item) { state.playing = undefined; state.playingType = undefined; saveJson(DB_FILE, db); return; }
  const input = item.kind === 'file' ? mediaPath(item.value) : item.kind === 'youtube' ? await resolveYoutube(item.value) : item.value;
  state.playing = item.label; state.playingType = item.kind; state.paused = false; saveJson(DB_FILE, db);
  const connection = await ensureVoice(guildId);
  const args = item.kind === 'file' ? ['-hide_banner', '-loglevel', 'error', '-i', input, '-vn', '-f', 's16le', '-ar', '48000', '-ac', '2', 'pipe:1'] : ['-hide_banner', '-loglevel', 'error', '-reconnect', '1', '-reconnect_streamed', '1', '-reconnect_delay_max', '5', '-i', input, '-vn', '-f', 's16le', '-ar', '48000', '-ac', '2', 'pipe:1'];
  const ffmpeg = spawn('ffmpeg', args, { stdio: ['ignore', 'pipe', 'inherit'] });
  ffmpegs.set(guildId, ffmpeg);
  ffmpeg.on('exit', () => { if (ffmpegs.get(guildId) === ffmpeg) ffmpegs.delete(guildId); });
  const resource = createAudioResource(ffmpeg.stdout, { inputType: StreamType.Raw, inlineVolume: true });
  resource.volume?.setVolume(Math.max(0, Math.min(2, state.volume / 100)));
  connection.subscribe(getPlayer(guildId)); getPlayer(guildId).play(resource);
}

async function stopGuild(guildId: string) {
  const state = guildState(guildId); state.queue = []; state.playing = undefined; state.playingType = undefined;
  getPlayer(guildId).stop(true); ffmpegs.get(guildId)?.kill('SIGTERM'); ffmpegs.delete(guildId); connections.get(guildId)?.destroy(); connections.delete(guildId); saveJson(DB_FILE, db);
}
function enqueue(guildId: string, item: QueueItem, replace = false) { const state = guildState(guildId); if (replace) state.queue = [item]; else state.queue.push(item); saveJson(DB_FILE, db); return state; }

async function spotifyToken(): Promise<string> {
  if (spotify.accessToken && spotify.expiresAt && spotify.expiresAt > Date.now() + 30000) return spotify.accessToken;
  if (!SPOTIFY_CLIENT_ID || !SPOTIFY_CLIENT_SECRET || !spotify.refreshToken) throw new Error('Spotify ist noch nicht verbunden.');
  const basic = Buffer.from(`${SPOTIFY_CLIENT_ID}:${SPOTIFY_CLIENT_SECRET}`).toString('base64');
  const response = await fetch('https://accounts.spotify.com/api/token', { method: 'POST', headers: { Authorization: `Basic ${basic}`, 'Content-Type': 'application/x-www-form-urlencoded' }, body: new URLSearchParams({ grant_type: 'refresh_token', refresh_token: spotify.refreshToken }) });
  if (!response.ok) throw new Error(`Spotify token refresh fehlgeschlagen (${response.status})`);
  const data = await response.json() as any;
  spotify.accessToken = data.access_token; spotify.expiresAt = Date.now() + Number(data.expires_in ?? 3600) * 1000; if (data.refresh_token) spotify.refreshToken = data.refresh_token; saveJson(SPOTIFY_FILE, spotify); return spotify.accessToken!;
}
async function spotifyApi(endpoint: string, init: RequestInit = {}, retry = true): Promise<any> {
  const token = await spotifyToken(); const headers = new Headers(init.headers); headers.set('Authorization', `Bearer ${token}`); if (init.body && !headers.has('Content-Type')) headers.set('Content-Type', 'application/json');
  const response = await fetch(`https://api.spotify.com/v1${endpoint}`, { ...init, headers });
  if (response.status === 401 && retry && spotify.refreshToken) { spotify.expiresAt = 0; await spotifyToken(); return spotifyApi(endpoint, init, false); }
  if (!response.ok) throw new Error(`Spotify API ${response.status}: ${await response.text()}`); if (response.status === 204) return null; return response.json();
}
async function spotifySearch(query: string): Promise<SearchItem[]> {
  if (!spotify.refreshToken) return [];
  try { const data = await spotifyApi(`/search?${new URLSearchParams({ q: query, type: 'track', limit: '8' })}`); return data.tracks.items.map((t: any) => ({ kind: 'spotify' as const, value: t.uri, label: t.name, meta: t.artists.map((a: any) => a.name).join(', '), url: t.external_urls?.spotify })); } catch { return []; }
}
async function importSpotifyPlaylist(url: string) {
  const id = spotifyPlaylistId(url); if (!id) throw new Error('Ungültige Spotify-Playlist-URL.');
  const data = await spotifyApi(`/playlists/${id}?${new URLSearchParams({ fields: 'id,name,tracks.items(track(name,uri,artists(name)))' })}`);
  const items = (data.tracks?.items ?? []).filter((x: any) => x.track?.uri).map((x: any) => ({ kind: 'spotify' as const, value: `${x.track.artists?.map((a: any) => a.name).join(', ')} - ${x.track.name}`, label: `${x.track.artists?.map((a: any) => a.name).join(', ')} - ${x.track.name}` }));
  return { name: data.name, items };
}

async function unifiedSearch(query: string) {
  const needle = query.toLowerCase();
  const local: SearchItem[] = fs.readdirSync(MUSIC_DIR).filter(f => /\.(mp3|wav|ogg|flac|m4a)$/i.test(f) && f.toLowerCase().includes(needle)).slice(0, 12).map(f => ({ kind: 'file', value: f, label: f, meta: 'Lokal' }));
  const radios: SearchItem[] = db.radios.filter(r => `${r.name} ${r.url}`.toLowerCase().includes(needle)).slice(0, 12).map(r => ({ kind: 'radio', value: r.url, label: r.name, meta: 'Radio' }));
  const [youtube, spotifyResults] = await Promise.all([youtubeSearch(query).catch(() => []), spotifySearch(query)]);
  return { local, radios, youtube, spotify: spotifyResults };
}

const commands = [
  new SlashCommandBuilder().setName('join').setDescription('Bot in deinen Voice-Channel holen'),
  new SlashCommandBuilder().setName('search').setDescription('Nach Musik suchen').addStringOption(o => o.setName('query').setDescription('Song, Artist oder Radiosender').setRequired(true)),
  new SlashCommandBuilder().setName('play').setDescription('Erstes Suchergebnis abspielen').addStringOption(o => o.setName('query').setDescription('Song, Artist oder YouTube-URL').setRequired(true)),
  new SlashCommandBuilder().setName('playlist').setDescription('Playlist verwalten').addStringOption(o => o.setName('action').setDescription('list/play/queue').setRequired(true).addChoices({ name: 'list', value: 'list' }, { name: 'play', value: 'play' }, { name: 'queue', value: 'queue' })).addStringOption(o => o.setName('name').setDescription('Playlistname')),
  new SlashCommandBuilder().setName('queue').setDescription('Aktuelle Warteschlange anzeigen'),
  new SlashCommandBuilder().setName('now').setDescription('Aktuell laufenden Titel anzeigen'),
  new SlashCommandBuilder().setName('pause').setDescription('Wiedergabe pausieren'),
  new SlashCommandBuilder().setName('resume').setDescription('Wiedergabe fortsetzen'),
  new SlashCommandBuilder().setName('radio').setDescription('Radio starten').addStringOption(o => o.setName('name').setDescription('Sendername').setRequired(true)),
  new SlashCommandBuilder().setName('stop').setDescription('Wiedergabe stoppen'),
  new SlashCommandBuilder().setName('skip').setDescription('Nächste Quelle abspielen'),
  new SlashCommandBuilder().setName('volume').setDescription('Lautstärke setzen').addIntegerOption(o => o.setName('percent').setDescription('0-100').setRequired(true).setMinValue(0).setMaxValue(100))
].map(command => command.toJSON());

client.once('ready', async () => { console.log(`Discord online als ${client.user?.tag}`); try { await new REST({ version: '10' }).setToken(process.env.DISCORD_TOKEN!).put(Routes.applicationCommands(client.user!.id), { body: commands }); } catch (e) { console.error(e); } });

async function commandSearch(interaction: any, query: string) {
  const result = await unifiedSearch(query); const items = [...result.local, ...result.radios, ...result.youtube, ...result.spotify].slice(0, 20); const token = makeId(); searches.set(`${interaction.guildId}:${interaction.user.id}:${token}`, { expires: Date.now() + 5 * 60_000, items });
  const lines = items.map((x, i) => `${i + 1}. **${x.label}** — ${x.meta ?? ''}`).join('\n');
  const buttons = items.filter(x => x.kind !== 'spotify').slice(0, 5).map((_, i) => new ButtonBuilder().setCustomId(`rb:${token}:${i}`).setLabel(`▶ ${i + 1}`).setStyle(ButtonStyle.Primary));
  const row = buttons.length ? new ActionRowBuilder<ButtonBuilder>().addComponents(buttons) : undefined;
  const embed = new EmbedBuilder().setTitle(`Suche: ${query}`).setDescription(lines || 'Nichts gefunden.').setColor(0x8b5cf6).setFooter({ text: 'Spotify-Suchergebnisse sind Links/Importquellen und keine Discord-Audioquellen.' });
  await interaction.reply({ embeds: [embed], components: row ? [row] : [] });
}

client.on('interactionCreate', async interaction => {
  try {
    if (interaction.isButton() && interaction.customId.startsWith('rb:')) {
      if (!interaction.guildId) return; const parts = interaction.customId.split(':'); const token = parts[1]; const index = Number(parts[2]); const saved = searches.get(`${interaction.guildId}:${interaction.user.id}:${token}`);
      if (!saved || saved.expires < Date.now() || !saved.items[index]) return void interaction.reply({ content: 'Diese Suche ist abgelaufen. Bitte erneut suchen.', ephemeral: true });
      const member = await interaction.guild!.members.fetch(interaction.user.id); if (!controlAllowed(member)) return void interaction.reply({ content: 'Du darfst den Bot nicht steuern.', ephemeral: true });
      const item = saved.items[index]; if (item.kind === 'spotify') return void interaction.reply({ content: 'Spotify-Treffer können nicht als Spotify-Audio in Discord ausgegeben werden. Du kannst sie als Playlist importieren.', ephemeral: true });
      const state = enqueue(interaction.guildId, { kind: item.kind, value: item.value, label: item.label }, false); if (!state.playing) await playNext(interaction.guildId); return void interaction.reply(`▶️ **${item.label}**`);
    }
    if (!interaction.isChatInputCommand() || !interaction.guildId) return;
    const member = await interaction.guild!.members.fetch(interaction.user.id); if (!controlAllowed(member)) return void interaction.reply({ content: 'Du darfst den Bot nicht steuern.', ephemeral: true });
    const state = guildState(interaction.guildId);
    if (interaction.commandName === 'join') { if (!member.voice.channel || member.voice.channel.type !== ChannelType.GuildVoice) return void interaction.reply('Du musst selbst in einem Voice-Channel sein.'); state.voiceChannelId = member.voice.channel.id; saveJson(DB_FILE, db); await ensureVoice(interaction.guildId); return void interaction.reply(`🔊 Verbunden mit **${member.voice.channel.name}**`); }
    if (interaction.commandName === 'search') return void commandSearch(interaction, interaction.options.getString('query', true));
    if (interaction.commandName === 'play') { const q = interaction.options.getString('query', true); const found = await unifiedSearch(q); const item = [...found.local, ...found.radios, ...found.youtube][0]; if (!item) return void interaction.reply('Nichts direkt abspielbares gefunden.'); enqueue(interaction.guildId, { kind: item.kind, value: item.value, label: item.label }, true); await playNext(interaction.guildId); return void interaction.reply(`▶️ **${item.label}**`); }
    if (interaction.commandName === 'playlist') { const action = interaction.options.getString('action', true); const name = interaction.options.getString('name')?.trim(); if (action === 'list') { const text = db.playlists.map(p => `• **${p.name}** (${p.items.length})`).join('\n') || 'Keine Playlists.'; return void interaction.reply(text); } if (!name) return void interaction.reply('Bitte einen Playlistnamen angeben.'); const playlist = db.playlists.find(p => p.name.toLowerCase() === name.toLowerCase()); if (!playlist) return void interaction.reply('Playlist nicht gefunden.'); const items = playlist.items.filter(i => i.kind !== 'spotify').map(i => ({ kind: i.kind as SourceKind, value: i.value, label: i.label })); if (!items.length) return void interaction.reply('Diese Playlist enthält keine Discord-abspielbaren Quellen.'); if (action === 'play') state.queue = items; else state.queue.push(...items); saveJson(DB_FILE, db); if (action === 'play') await playNext(interaction.guildId); return void interaction.reply(action === 'play' ? `▶️ Playlist **${playlist.name}** gestartet.` : `➕ Playlist **${playlist.name}** geladen (${items.length} Titel).`); }
    if (interaction.commandName === 'queue') { const text = state.queue.map((x, i) => `${i + 1}. ${x.label}`).join('\n') || 'Queue ist leer.'; return void interaction.reply(`**Queue**\n${text}`); }
    if (interaction.commandName === 'now') return void interaction.reply(state.playing ? `🎵 **${state.playing}**` : 'Nichts läuft.');
    if (interaction.commandName === 'pause') { getPlayer(interaction.guildId).pause(); state.paused = true; saveJson(DB_FILE, db); return void interaction.reply('⏸️ Pausiert.'); }
    if (interaction.commandName === 'resume') { getPlayer(interaction.guildId).unpause(); state.paused = false; saveJson(DB_FILE, db); return void interaction.reply('▶️ Fortgesetzt.'); }
    if (interaction.commandName === 'stop') { await stopGuild(interaction.guildId); return void interaction.reply('⏹️ Gestoppt.'); }
    if (interaction.commandName === 'skip') { getPlayer(interaction.guildId).stop(true); return void interaction.reply('⏭️ Übersprungen.'); }
    if (interaction.commandName === 'volume') { state.volume = interaction.options.getInteger('percent', true); saveJson(DB_FILE, db); return void interaction.reply(`🔊 Lautstärke: ${state.volume}%`); }
    if (interaction.commandName === 'radio') { const name = interaction.options.getString('name', true); const radio = db.radios.find(r => r.name.toLowerCase() === name.toLowerCase()); if (!radio) return void interaction.reply('Sender nicht gefunden.'); state.queue = [{ kind: 'radio', value: radio.url, label: radio.name }]; saveJson(DB_FILE, db); await playNext(interaction.guildId); return void interaction.reply(`📻 ${radio.name}`); }
  } catch (error) { console.error(error); if (interaction.isRepliable() && !interaction.replied) await interaction.reply(`Fehler: ${error instanceof Error ? error.message : 'Unbekannt'}`); }
});

const app = Fastify({ logger: true });
await app.register(cors, { origin: true });
await app.register(fastifyStatic, { root: path.join(APP_ROOT, 'frontend'), prefix: '/', index: ['index.html'] });
app.addHook('preHandler', async (req, reply) => { if (req.url.startsWith('/api/') && !req.url.startsWith('/api/spotify/callback') && !auth(req, reply)) return reply; });
app.get('/api/health', async () => ({ ok: true, discord: client.isReady(), version: '1.3.0', youtube: fs.existsSync(YTDLP), spotify: Boolean(spotify.refreshToken) }));
app.get('/api/guilds', async () => client.guilds.cache.map(g => ({ id: g.id, name: g.name })));
app.get<{ Params: { id: string } }>('/api/guilds/:id/channels', async req => { const g = await client.guilds.fetch(req.params.id); return g.channels.cache.filter(c => c.type === ChannelType.GuildVoice).map(c => ({ id: c.id, name: c.name })); });
app.get('/api/radios', async () => db.radios);
app.post<{ Body: { name: string; url: string } }>('/api/radios', async req => { const radio: Radio = { id: makeId(), name: req.body.name.trim(), url: req.body.url.trim(), enabled: true }; if (!radio.name || !/^https?:\/\//i.test(radio.url)) throw new Error('Name und HTTP(S)-Stream-URL erforderlich.'); db.radios.push(radio); saveJson(DB_FILE, db); return radio; });
app.delete<{ Params: { id: string } }>('/api/radios/:id', async req => { db.radios = db.radios.filter(r => r.id !== req.params.id); saveJson(DB_FILE, db); return { ok: true }; });
app.get('/api/media', async () => fs.readdirSync(MUSIC_DIR).filter(f => /\.(mp3|wav|ogg|flac|m4a)$/i.test(f)).sort());
app.get<{ Params: { id: string } }>('/api/state/:id', async req => guildState(req.params.id));
app.post<{ Params: { id: string }; Body: { voiceChannelId: string } }>('/api/state/:id/voice', async req => { const s = guildState(req.params.id); s.voiceChannelId = req.body.voiceChannelId; saveJson(DB_FILE, db); return s; });
app.post<{ Params: { id: string }; Body: { radioId: string; append?: boolean } }>('/api/state/:id/radio', async req => { const r = db.radios.find(x => x.id === req.body.radioId); if (!r) throw new Error('Radio nicht gefunden.'); const s = enqueue(req.params.id, { kind: 'radio', value: r.url, label: r.name }, !req.body.append); if (!s.playing) await playNext(req.params.id); return s; });
app.post<{ Params: { id: string }; Body: { file: string; append?: boolean } }>('/api/state/:id/file', async req => { const file = mediaPath(req.body.file); if (!fs.existsSync(file)) throw new Error('Datei nicht gefunden.'); const s = enqueue(req.params.id, { kind: 'file', value: req.body.file, label: req.body.file }, !req.body.append); if (!s.playing) await playNext(req.params.id); return s; });
app.post<{ Params: { id: string } }>('/api/state/:id/stop', async req => { await stopGuild(req.params.id); return guildState(req.params.id); });
app.post<{ Params: { id: string } }>('/api/state/:id/skip', async req => { getPlayer(req.params.id).stop(true); return guildState(req.params.id); });
app.post<{ Params: { id: string } }>('/api/state/:id/pause', async req => { const s = guildState(req.params.id); getPlayer(req.params.id).pause(); s.paused = true; saveJson(DB_FILE, db); return s; });
app.post<{ Params: { id: string } }>('/api/state/:id/resume', async req => { const s = guildState(req.params.id); getPlayer(req.params.id).unpause(); s.paused = false; saveJson(DB_FILE, db); return s; });
app.post<{ Params: { id: string }; Body: { volume: number } }>('/api/state/:id/volume', async req => { const s = guildState(req.params.id); s.volume = Math.max(0, Math.min(100, Number(req.body.volume))); saveJson(DB_FILE, db); return s; });
app.get<{ Params: { id: string } }>('/api/state/:id/queue', async req => guildState(req.params.id).queue);
app.delete<{ Params: { id: string } }>('/api/state/:id/queue', async req => { guildState(req.params.id).queue = []; saveJson(DB_FILE, db); return { ok: true }; });
app.get('/api/playlists', async () => db.playlists.map(p => ({ id: p.id, name: p.name, kind: p.kind, count: p.items.length })));
app.get<{ Params: { id: string } }>('/api/playlists/:id', async req => { const p = db.playlists.find(x => x.id === req.params.id); if (!p) throw new Error('Playlist nicht gefunden.'); return p; });
app.post<{ Body: { name: string; kind?: Playlist['kind']; items?: PlaylistItem[] } }>('/api/playlists', async req => { const p: Playlist = { id: makeId(), name: req.body.name.trim() || 'Neue Playlist', kind: req.body.kind ?? 'mixed', items: req.body.items ?? [] }; db.playlists.push(p); saveJson(DB_FILE, db); return p; });
app.delete<{ Params: { id: string } }>('/api/playlists/:id', async req => { db.playlists = db.playlists.filter(x => x.id !== req.params.id); saveJson(DB_FILE, db); return { ok: true }; });
app.post<{ Params: { id: string }; Body: { item: PlaylistItem } }>('/api/playlists/:id/items', async req => { const p = db.playlists.find(x => x.id === req.params.id); if (!p) throw new Error('Playlist nicht gefunden.'); if (req.body.item.kind === 'spotify') throw new Error('Spotify-Titel sind nur als Import/Link gespeichert und nicht als Discord-Audioquelle abspielbar.'); p.items.push(req.body.item); saveJson(DB_FILE, db); return p; });
app.post<{ Params: { id: string; guildId: string }; Body: { append?: boolean } }>('/api/playlists/:id/play/:guildId', async req => { const p = db.playlists.find(x => x.id === req.params.id); if (!p) throw new Error('Playlist nicht gefunden.'); const items = p.items.filter(i => i.kind !== 'spotify').map(i => ({ kind: i.kind as SourceKind, value: i.value, label: i.label })); if (!req.body.append) guildState(req.params.guildId).queue = items; else guildState(req.params.guildId).queue.push(...items); saveJson(DB_FILE, db); if (!guildState(req.params.guildId).playing) await playNext(req.params.guildId); return guildState(req.params.guildId); });
app.get<{ Querystring: { q?: string } }>('/api/search', async req => { const q = String(req.query.q ?? '').trim(); if (!q) return { local: [], radios: [], youtube: [], spotify: [] }; return unifiedSearch(q); });
app.get('/api/spotify/status', async () => ({ configured: Boolean(SPOTIFY_CLIENT_ID && SPOTIFY_CLIENT_SECRET && SPOTIFY_REDIRECT_URI), connected: Boolean(spotify.refreshToken), displayName: spotify.displayName ?? null }));
app.get('/api/spotify/login', async (_req, reply) => { if (!SPOTIFY_CLIENT_ID || !SPOTIFY_CLIENT_SECRET || !SPOTIFY_REDIRECT_URI) return reply.code(400).send('Spotify-Konfiguration fehlt'); spotifyOAuthState = crypto.randomBytes(18).toString('hex'); const q = new URLSearchParams({ response_type: 'code', client_id: SPOTIFY_CLIENT_ID, redirect_uri: SPOTIFY_REDIRECT_URI, scope: 'playlist-read-private playlist-read-collaborative user-read-private', state: spotifyOAuthState }); return reply.redirect(`https://accounts.spotify.com/authorize?${q}`); });
app.get<{ Querystring: { code?: string; state?: string } }>('/api/spotify/callback', async (req, reply) => { if (!req.query.code || !req.query.state || req.query.state !== spotifyOAuthState) return reply.code(400).send('Ungültiger Spotify-OAuth-State.'); spotifyOAuthState = ''; const basic = Buffer.from(`${SPOTIFY_CLIENT_ID}:${SPOTIFY_CLIENT_SECRET}`).toString('base64'); const response = await fetch('https://accounts.spotify.com/api/token', { method: 'POST', headers: { Authorization: `Basic ${basic}`, 'Content-Type': 'application/x-www-form-urlencoded' }, body: new URLSearchParams({ grant_type: 'authorization_code', code: req.query.code, redirect_uri: SPOTIFY_REDIRECT_URI }) }); if (!response.ok) return reply.code(400).send('Spotify-Token konnte nicht erstellt werden.'); const token = await response.json() as any; spotify.accessToken = token.access_token; spotify.refreshToken = token.refresh_token; spotify.expiresAt = Date.now() + Number(token.expires_in ?? 3600) * 1000; const me = await spotifyApi('/me'); spotify.displayName = me.display_name ?? me.id; saveJson(SPOTIFY_FILE, spotify); return reply.redirect('/?spotify=connected'); });
app.get<{ Querystring: { q?: string } }>('/api/spotify/search', async req => ({ tracks: await spotifySearch(String(req.query.q ?? '')) }));
app.post<{ Body: { url: string; name?: string } }>('/api/spotify/import-playlist', async req => { const imported = await importSpotifyPlaylist(req.body.url); const playlist: Playlist = { id: makeId(), name: req.body.name?.trim() || imported.name, kind: 'spotify', items: imported.items }; db.playlists.push(playlist); saveJson(DB_FILE, db); return playlist; });
app.get('/api/youtube/status', async () => ({ configured: fs.existsSync(YTDLP) }));
app.get<{ Querystring: { q?: string } }>('/api/youtube/search', async req => ({ items: await youtubeSearch(String(req.query.q ?? '')) }));
app.post<{ Body: { url: string; name?: string } }>('/api/youtube/import-playlist', async req => { const id = youtubePlaylistId(req.body.url); if (!id) throw new Error('Keine YouTube-Playlist erkannt.'); const { stdout } = await execFileAsync(YTDLP, ['--flat-playlist', '--no-warnings', '--dump-single-json', req.body.url], { timeout: 30000, maxBuffer: 4 * 1024 * 1024 }); const data = JSON.parse(stdout); const items = (data.entries ?? []).filter((x: any) => x?.id).map((x: any) => ({ kind: 'youtube' as const, value: `https://www.youtube.com/watch?v=${x.id}`, label: x.title ?? x.id })); const playlist: Playlist = { id: makeId(), name: req.body.name?.trim() || data.title || `YouTube ${id}`, kind: 'youtube', items }; db.playlists.push(playlist); saveJson(DB_FILE, db); return playlist; });
await app.listen({ port: PORT, host: '0.0.0.0' });
if (process.env.DISCORD_TOKEN) client.login(process.env.DISCORD_TOKEN).catch(console.error); else console.warn('DISCORD_TOKEN fehlt. Weboberfläche läuft, Discord ist offline.');
