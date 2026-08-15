import Fastify from 'fastify';
import cors from '@fastify/cors';
import fastifyStatic from '@fastify/static';
import { Client, GatewayIntentBits, REST, Routes, SlashCommandBuilder, ChannelType } from 'discord.js';
import { AudioPlayerStatus, NoSubscriberBehavior, VoiceConnection, VoiceConnectionStatus, createAudioPlayer, createAudioResource, joinVoiceChannel, StreamType } from '@discordjs/voice';
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';

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
const YOUTUBE_API_KEY = process.env.YOUTUBE_API_KEY ?? '';

fs.mkdirSync(MUSIC_DIR, { recursive: true });
fs.mkdirSync(DATA_DIR, { recursive: true });

type Radio = { id: string; name: string; url: string; enabled: boolean };
type QueueItem = { kind: 'file' | 'radio'; value: string; label: string };
type GuildState = { guildId: string; voiceChannelId: string; playing?: string; playingType?: 'radio' | 'file'; volume: number; paused: boolean; queue: QueueItem[] };
type PlaylistItem = { kind: 'file' | 'radio' | 'spotify' | 'youtube'; value: string; label: string };
type Playlist = { id: string; name: string; kind: 'mixed' | 'local' | 'spotify' | 'youtube'; items: PlaylistItem[] };
type Db = { radios: Radio[]; guilds: Record<string, GuildState>; playlists: Playlist[] };
type SpotifyState = { accessToken?: string; refreshToken?: string; expiresAt?: number; displayName?: string; product?: string };

function loadJson<T>(file: string, fallback: T): T { try { return JSON.parse(fs.readFileSync(file, 'utf8')) as T; } catch { return fallback; } }
function saveJson(file: string, value: unknown) { fs.writeFileSync(file, JSON.stringify(value, null, 2), { mode: 0o600 }); }
function makeId() { return crypto.randomBytes(5).toString('hex'); }
function guildState(guildId: string): GuildState { db.guilds[guildId] ??= { guildId, voiceChannelId: '', volume: 80, paused: false, queue: [] }; return db.guilds[guildId]; }
function auth(req: any, reply: any) {
  if (!WEB_PASSWORD) return true;
  const header = String(req.headers.authorization ?? '');
  if (!header.startsWith('Basic ')) { reply.header('WWW-Authenticate', 'Basic realm="RadioBot"').code(401).send('Authentication required'); return false; }
  const decoded = Buffer.from(header.slice(6), 'base64').toString('utf8');
  const split = decoded.indexOf(':');
  const user = split >= 0 ? decoded.slice(0, split) : '';
  const pass = split >= 0 ? decoded.slice(split + 1) : '';
  if (user !== WEB_USER || pass !== WEB_PASSWORD) { reply.header('WWW-Authenticate', 'Basic realm="RadioBot"').code(401).send('Invalid credentials'); return false; }
  return true;
}
function mediaPath(file: string) { const root = path.resolve(MUSIC_DIR); const target = path.resolve(root, file); if (!target.startsWith(root + path.sep)) throw new Error('Ungültige Mediendatei'); return target; }
function spotifyPlaylistId(input: string) { return input.match(/(?:open\.spotify\.com\/playlist\/|spotify:playlist:)([A-Za-z0-9]+)/)?.[1] ?? null; }
function youtubeVideoId(input: string) { return input.match(/(?:v=|youtu\.be\/|youtube\.com\/embed\/)([A-Za-z0-9_-]{6,})/)?.[1] ?? null; }
function youtubePlaylistId(input: string) { return input.match(/[?&]list=([A-Za-z0-9_-]+)/)?.[1] ?? null; }

const db = loadJson<Db>(DB_FILE, { radios: [], guilds: {}, playlists: [] });
db.playlists ??= [];
const spotify = loadJson<SpotifyState>(SPOTIFY_FILE, {});
let spotifyOAuthState = '';
const connections = new Map<string, VoiceConnection>();
const players = new Map<string, ReturnType<typeof createAudioPlayer>>();
const ffmpegs = new Map<string, ReturnType<typeof spawn>>();
const client = new Client({ intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildVoiceStates] });

function getPlayer(guildId: string) {
  let player = players.get(guildId);
  if (!player) {
    player = createAudioPlayer({ behaviors: { noSubscriber: NoSubscriberBehavior.Stop } });
    player.on(AudioPlayerStatus.Idle, () => { ffmpegs.get(guildId)?.kill('SIGTERM'); ffmpegs.delete(guildId); playNext(guildId).catch(console.error); });
    player.on('error', error => console.error('audio error', guildId, error));
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
  const existing = connections.get(guildId);
  if (existing && existing.state.status !== VoiceConnectionStatus.Destroyed) return existing;
  const connection = joinVoiceChannel({ channelId: channel.id, guildId: guild.id, adapterCreator: guild.voiceAdapterCreator });
  connection.on('error', error => console.error('voice error', guildId, error));
  connection.subscribe(getPlayer(guildId));
  connections.set(guildId, connection);
  return connection;
}
async function playNext(guildId: string) {
  const state = guildState(guildId);
  const item = state.queue.shift();
  if (!item) { state.playing = undefined; state.playingType = undefined; saveJson(DB_FILE, db); return; }
  const input = item.kind === 'file' ? mediaPath(item.value) : item.value;
  state.playing = item.label;
  state.playingType = item.kind;
  state.paused = false;
  saveJson(DB_FILE, db);
  const connection = await ensureVoice(guildId);
  const args = item.kind === 'file'
    ? ['-hide_banner', '-loglevel', 'error', '-i', input, '-vn', '-f', 's16le', '-ar', '48000', '-ac', '2', 'pipe:1']
    : ['-hide_banner', '-loglevel', 'error', '-reconnect', '1', '-reconnect_streamed', '1', '-reconnect_delay_max', '5', '-i', input, '-vn', '-f', 's16le', '-ar', '48000', '-ac', '2', 'pipe:1'];
  const ffmpeg = spawn('ffmpeg', args, { stdio: ['ignore', 'pipe', 'inherit'] });
  ffmpegs.set(guildId, ffmpeg);
  ffmpeg.on('exit', () => { if (ffmpegs.get(guildId) === ffmpeg) ffmpegs.delete(guildId); });
  const resource = createAudioResource(ffmpeg.stdout, { inputType: StreamType.Raw, inlineVolume: true });
  resource.volume?.setVolume(Math.max(0, Math.min(2, state.volume / 100)));
  connection.subscribe(getPlayer(guildId));
  getPlayer(guildId).play(resource);
}
async function stopGuild(guildId: string) {
  const state = guildState(guildId);
  state.queue = [];
  state.playing = undefined;
  state.playingType = undefined;
  getPlayer(guildId).stop(true);
  ffmpegs.get(guildId)?.kill('SIGTERM');
  ffmpegs.delete(guildId);
  connections.get(guildId)?.destroy();
  connections.delete(guildId);
  saveJson(DB_FILE, db);
}
async function spotifyToken(): Promise<string> {
  if (spotify.accessToken && spotify.expiresAt && spotify.expiresAt > Date.now() + 30000) return spotify.accessToken;
  if (!SPOTIFY_CLIENT_ID || !SPOTIFY_CLIENT_SECRET || !spotify.refreshToken) throw new Error('Spotify ist noch nicht verbunden.');
  const basic = Buffer.from(`${SPOTIFY_CLIENT_ID}:${SPOTIFY_CLIENT_SECRET}`).toString('base64');
  const response = await fetch('https://accounts.spotify.com/api/token', { method: 'POST', headers: { Authorization: `Basic ${basic}`, 'Content-Type': 'application/x-www-form-urlencoded' }, body: new URLSearchParams({ grant_type: 'refresh_token', refresh_token: spotify.refreshToken }) });
  if (!response.ok) throw new Error(`Spotify token refresh fehlgeschlagen (${response.status})`);
  const data = await response.json() as any;
  spotify.accessToken = data.access_token;
  spotify.expiresAt = Date.now() + Number(data.expires_in ?? 3600) * 1000;
  if (data.refresh_token) spotify.refreshToken = data.refresh_token;
  saveJson(SPOTIFY_FILE, spotify);
  return spotify.accessToken!;
}
async function spotifyApi(endpoint: string, init: RequestInit = {}, retry = true): Promise<any> {
  const token = await spotifyToken();
  const headers = new Headers(init.headers);
  headers.set('Authorization', `Bearer ${token}`);
  if (init.body && !headers.has('Content-Type')) headers.set('Content-Type', 'application/json');
  const response = await fetch(`https://api.spotify.com/v1${endpoint}`, { ...init, headers });
  if (response.status === 401 && retry && spotify.refreshToken) { spotify.expiresAt = 0; await spotifyToken(); return spotifyApi(endpoint, init, false); }
  if (!response.ok) throw new Error(`Spotify API ${response.status}: ${await response.text()}`);
  if (response.status === 204) return null;
  return response.json();
}
async function youtubeApi(endpoint: string) {
  if (!YOUTUBE_API_KEY) throw new Error('YouTube ist nicht konfiguriert. YOUTUBE_API_KEY fehlt.');
  const separator = endpoint.includes('?') ? '&' : '?';
  const response = await fetch(`https://www.googleapis.com/youtube/v3/${endpoint}${separator}key=${encodeURIComponent(YOUTUBE_API_KEY)}`);
  if (!response.ok) throw new Error(`YouTube API ${response.status}: ${await response.text()}`);
  return response.json();
}
async function spotifySearch(query: string) {
  if (!spotify.refreshToken) return [];
  try { const data = await spotifyApi(`/search?${new URLSearchParams({ q: query, type: 'track', limit: '10' })}`); return data.tracks.items.map((track: any) => ({ id: track.id, name: track.name, artist: track.artists.map((a: any) => a.name).join(', '), album: track.album.name, uri: track.uri, url: track.external_urls?.spotify })); } catch { return []; }
}
async function youtubeSearch(query: string) {
  if (!YOUTUBE_API_KEY) return [];
  try { const data = await youtubeApi(`search?${new URLSearchParams({ part: 'snippet', q: query, type: 'video', maxResults: '10' })}`); return (data.items ?? []).map((item: any) => ({ id: item.id.videoId, name: item.snippet.title, channel: item.snippet.channelTitle, url: `https://www.youtube.com/watch?v=${item.id.videoId}` })); } catch { return []; }
}
async function importSpotifyPlaylist(url: string) {
  const id = spotifyPlaylistId(url); if (!id) throw new Error('Ungültige Spotify-Playlist-URL.');
  const data = await spotifyApi(`/playlists/${id}?${new URLSearchParams({ fields: 'id,name,external_urls,tracks.items(track(id,name,uri,artists(name)))' })}`);
  const items = (data.tracks?.items ?? []).filter((x: any) => x.track?.uri).map((x: any) => ({ kind: 'spotify' as const, value: x.track.uri, label: `${x.track.artists?.map((a: any) => a.name).join(', ')} - ${x.track.name}` }));
  return { id: data.id, name: data.name, items };
}
async function importYoutubePlaylist(url: string) {
  const id = youtubePlaylistId(url); if (!id) throw new Error('Keine YouTube-Playlist erkannt.');
  const data = await youtubeApi(`playlistItems?${new URLSearchParams({ part: 'snippet,contentDetails', playlistId: id, maxResults: '50' })}`);
  const items = (data.items ?? []).filter((x: any) => x.contentDetails?.videoId).map((x: any) => ({ kind: 'youtube' as const, value: `https://www.youtube.com/watch?v=${x.contentDetails.videoId}`, label: x.snippet?.title ?? x.contentDetails.videoId }));
  return { id, name: data.items?.[0]?.snippet?.playlistTitle ?? `YouTube ${id}`, items };
}

const commands = [
  new SlashCommandBuilder().setName('join').setDescription('Bot in deinen Voice-Channel holen'),
  new SlashCommandBuilder().setName('radio').setDescription('Radio starten').addStringOption(o => o.setName('name').setDescription('Sendername').setRequired(true)),
  new SlashCommandBuilder().setName('stop').setDescription('Wiedergabe stoppen'),
  new SlashCommandBuilder().setName('skip').setDescription('Nächste Quelle abspielen'),
  new SlashCommandBuilder().setName('volume').setDescription('Lautstärke setzen').addIntegerOption(o => o.setName('percent').setDescription('0-100').setRequired(true).setMinValue(0).setMaxValue(100))
].map(command => command.toJSON());
client.once('ready', async () => { console.log(`Discord online als ${client.user?.tag}`); try { await new REST({ version: '10' }).setToken(process.env.DISCORD_TOKEN!).put(Routes.applicationCommands(client.user!.id), { body: commands }); } catch (error) { console.error(error); } });
client.on('interactionCreate', async interaction => {
  if (!interaction.isChatInputCommand() || !interaction.guildId) return;
  const state = guildState(interaction.guildId);
  try {
    if (interaction.commandName === 'join') { const member = await interaction.guild!.members.fetch(interaction.user.id); if (!member.voice.channel || member.voice.channel.type !== ChannelType.GuildVoice) return void interaction.reply('Du musst selbst in einem Voice-Channel sein.'); state.voiceChannelId = member.voice.channel.id; saveJson(DB_FILE, db); await ensureVoice(interaction.guildId); return void interaction.reply(`🔊 Verbunden mit **${member.voice.channel.name}**`); }
    if (interaction.commandName === 'stop') { await stopGuild(interaction.guildId); return void interaction.reply('⏹️ Gestoppt.'); }
    if (interaction.commandName === 'skip') { getPlayer(interaction.guildId).stop(true); return void interaction.reply('⏭️ Übersprungen.'); }
    if (interaction.commandName === 'volume') { state.volume = interaction.options.getInteger('percent', true); saveJson(DB_FILE, db); return void interaction.reply(`🔊 Lautstärke: ${state.volume}%`); }
    if (interaction.commandName === 'radio') { const name = interaction.options.getString('name', true); const radio = db.radios.find(item => item.name.toLowerCase() === name.toLowerCase()); if (!radio) return void interaction.reply('Sender nicht gefunden.'); await stopGuild(interaction.guildId); state.queue = [{ kind: 'radio', value: radio.url, label: radio.name }]; saveJson(DB_FILE, db); await playNext(interaction.guildId); return void interaction.reply(`📻 ${radio.name}`); }
  } catch (error) { console.error(error); if (!interaction.replied) await interaction.reply(`Fehler: ${error instanceof Error ? error.message : 'Unbekannt'}`); }
});

const app = Fastify({ logger: true });
await app.register(cors, { origin: true });
await app.register(fastifyStatic, { root: path.join(APP_ROOT, 'frontend'), prefix: '/', index: ['index.html'] });
app.addHook('preHandler', async (req, reply) => { if (req.url.startsWith('/api/') && !req.url.startsWith('/api/spotify/callback') && !auth(req, reply)) return reply; });
app.get('/api/health', async () => ({ ok: true, discord: client.isReady(), version: '1.1.0', youtube: Boolean(YOUTUBE_API_KEY), spotify: Boolean(spotify.refreshToken) }));
app.get('/api/guilds', async () => client.guilds.cache.map(guild => ({ id: guild.id, name: guild.name })));
app.get<{ Params: { id: string } }>('/api/guilds/:id/channels', async req => { const guild = await client.guilds.fetch(req.params.id); return guild.channels.cache.filter(channel => channel.type === ChannelType.GuildVoice).map(channel => ({ id: channel.id, name: channel.name })); });
app.get('/api/radios', async () => db.radios);
app.post<{ Body: { name: string; url: string } }>('/api/radios', async req => { const radio: Radio = { id: makeId(), name: req.body.name.trim(), url: req.body.url.trim(), enabled: true }; if (!radio.name || !/^https?:\/\//i.test(radio.url)) throw new Error('Name und HTTP(S)-Stream-URL erforderlich.'); db.radios.push(radio); saveJson(DB_FILE, db); return radio; });
app.delete<{ Params: { id: string } }>('/api/radios/:id', async req => { db.radios = db.radios.filter(radio => radio.id !== req.params.id); saveJson(DB_FILE, db); return { ok: true }; });
app.get('/api/media', async () => fs.readdirSync(MUSIC_DIR).filter(file => /\.(mp3|wav|ogg|flac|m4a)$/i.test(file)).sort());
app.get<{ Params: { id: string } }>('/api/state/:id', async req => guildState(req.params.id));
app.post<{ Params: { id: string }; Body: { voiceChannelId: string } }>('/api/state/:id/voice', async req => { const state = guildState(req.params.id); state.voiceChannelId = req.body.voiceChannelId; saveJson(DB_FILE, db); await ensureVoice(req.params.id); return state; });
app.post<{ Params: { id: string }; Body: { radioId: string; append?: boolean } }>('/api/state/:id/radio', async req => { const state = guildState(req.params.id); const radio = db.radios.find(item => item.id === req.body.radioId); if (!radio) throw new Error('Radio nicht gefunden.'); const item = { kind: 'radio' as const, value: radio.url, label: radio.name }; if (!req.body.append) { await stopGuild(req.params.id); state.queue = [item]; } else state.queue.push(item); saveJson(DB_FILE, db); if (!state.playing) await playNext(req.params.id); return state; });
app.post<{ Params: { id: string }; Body: { file: string; append?: boolean } }>('/api/state/:id/file', async req => { const state = guildState(req.params.id); const file = mediaPath(req.body.file); if (!fs.existsSync(file)) throw new Error('Datei nicht gefunden.'); const item = { kind: 'file' as const, value: req.body.file, label: req.body.file }; if (!req.body.append) { await stopGuild(req.params.id); state.queue = [item]; } else state.queue.push(item); saveJson(DB_FILE, db); if (!state.playing) await playNext(req.params.id); return state; });
app.post<{ Params: { id: string } }>('/api/state/:id/stop', async req => { await stopGuild(req.params.id); return guildState(req.params.id); });
app.post<{ Params: { id: string } }>('/api/state/:id/skip', async req => { getPlayer(req.params.id).stop(true); return guildState(req.params.id); });
app.post<{ Params: { id: string } }>('/api/state/:id/pause', async req => { const state = guildState(req.params.id); if (state.paused) { getPlayer(req.params.id).unpause(); state.paused = false; } else { getPlayer(req.params.id).pause(); state.paused = true; } saveJson(DB_FILE, db); return state; });
app.post<{ Params: { id: string }; Body: { volume: number } }>('/api/state/:id/volume', async req => { const state = guildState(req.params.id); state.volume = Math.max(0, Math.min(100, Number(req.body.volume))); saveJson(DB_FILE, db); return state; });
app.get<{ Params: { id: string } }>('/api/state/:id/queue', async req => guildState(req.params.id).queue);
app.delete<{ Params: { id: string } }>('/api/state/:id/queue', async req => { guildState(req.params.id).queue = []; saveJson(DB_FILE, db); return { ok: true }; });

app.get('/api/playlists', async () => db.playlists.map(playlist => ({ id: playlist.id, name: playlist.name, kind: playlist.kind, count: playlist.items.length })));
app.get<{ Params: { id: string } }>('/api/playlists/:id', async req => { const playlist = db.playlists.find(item => item.id === req.params.id); if (!playlist) throw new Error('Playlist nicht gefunden.'); return playlist; });
app.post<{ Body: { name: string; kind?: Playlist['kind']; items?: PlaylistItem[] } }>('/api/playlists', async req => { const playlist: Playlist = { id: makeId(), name: req.body.name.trim() || 'Neue Playlist', kind: req.body.kind ?? 'mixed', items: req.body.items ?? [] }; db.playlists.push(playlist); saveJson(DB_FILE, db); return playlist; });
app.delete<{ Params: { id: string } }>('/api/playlists/:id', async req => { db.playlists = db.playlists.filter(item => item.id !== req.params.id); saveJson(DB_FILE, db); return { ok: true }; });
app.post<{ Params: { id: string }; Body: { item: PlaylistItem } }>('/api/playlists/:id/items', async req => { const playlist = db.playlists.find(item => item.id === req.params.id); if (!playlist) throw new Error('Playlist nicht gefunden.'); playlist.items.push(req.body.item); saveJson(DB_FILE, db); return playlist; });
app.delete<{ Params: { id: string; index: string } }>('/api/playlists/:id/items/:index', async req => { const playlist = db.playlists.find(item => item.id === req.params.id); if (!playlist) throw new Error('Playlist nicht gefunden.'); playlist.items.splice(Number(req.params.index), 1); saveJson(DB_FILE, db); return playlist; });
app.post<{ Params: { id: string; guildId: string } }>('/api/playlists/:id/play/:guildId', async req => { const playlist = db.playlists.find(item => item.id === req.params.id); if (!playlist) throw new Error('Playlist nicht gefunden.'); if (playlist.items.some(item => item.kind === 'spotify')) throw new Error('Spotify-Playlisten werden über ein Spotify-Gerät abgespielt, nicht in Discord.'); if (playlist.items.some(item => item.kind === 'youtube')) throw new Error('YouTube-Playlisten werden im Web/YouTube abgespielt, nicht als Discord-Stream.'); const state = guildState(req.params.guildId); await stopGuild(req.params.guildId); state.queue = playlist.items.map(item => item.kind === 'file' ? { kind: 'file', value: item.value, label: item.label } : { kind: 'radio', value: item.value, label: item.label }); saveJson(DB_FILE, db); if (!state.playing) await playNext(req.params.guildId); return state; });
app.get<{ Querystring: { q?: string } }>('/api/search', async req => { const q = String(req.query.q ?? '').trim(); if (!q) return { local: [], radios: [], spotify: [], youtube: [] }; const needle = q.toLowerCase(); const local = fs.readdirSync(MUSIC_DIR).filter(file => /\.(mp3|wav|ogg|flac|m4a)$/i.test(file) && file.toLowerCase().includes(needle)).slice(0, 25).map(file => ({ file })); const radios = db.radios.filter(radio => `${radio.name} ${radio.url}`.toLowerCase().includes(needle)).slice(0, 25); const [spotifyResults, youtubeResults] = await Promise.all([spotifySearch(q), youtubeSearch(q)]); return { local, radios, spotify: spotifyResults, youtube: youtubeResults }; });

app.get('/api/spotify/status', async () => ({ configured: Boolean(SPOTIFY_CLIENT_ID && SPOTIFY_CLIENT_SECRET && SPOTIFY_REDIRECT_URI), connected: Boolean(spotify.refreshToken), displayName: spotify.displayName ?? null, product: spotify.product ?? null }));
app.get('/api/spotify/login', async (_req, reply) => { if (!SPOTIFY_CLIENT_ID || !SPOTIFY_CLIENT_SECRET || !SPOTIFY_REDIRECT_URI) return reply.code(400).send('Spotify-Konfiguration fehlt'); spotifyOAuthState = crypto.randomBytes(18).toString('hex'); const query = new URLSearchParams({ response_type: 'code', client_id: SPOTIFY_CLIENT_ID, redirect_uri: SPOTIFY_REDIRECT_URI, scope: 'user-read-playback-state user-modify-playback-state playlist-read-private playlist-read-collaborative', state: spotifyOAuthState }); return reply.redirect(`https://accounts.spotify.com/authorize?${query}`); });
app.get<{ Querystring: { code?: string; state?: string } }>('/api/spotify/callback', async (req, reply) => { if (!req.query.code || !req.query.state || req.query.state !== spotifyOAuthState) return reply.code(400).send('Ungültiger Spotify-OAuth-State.'); spotifyOAuthState = ''; const basic = Buffer.from(`${SPOTIFY_CLIENT_ID}:${SPOTIFY_CLIENT_SECRET}`).toString('base64'); const response = await fetch('https://accounts.spotify.com/api/token', { method: 'POST', headers: { Authorization: `Basic ${basic}`, 'Content-Type': 'application/x-www-form-urlencoded' }, body: new URLSearchParams({ grant_type: 'authorization_code', code: req.query.code, redirect_uri: SPOTIFY_REDIRECT_URI }) }); if (!response.ok) return reply.code(400).send('Spotify-Token konnte nicht erstellt werden.'); const token = await response.json() as any; spotify.accessToken = token.access_token; spotify.refreshToken = token.refresh_token; spotify.expiresAt = Date.now() + Number(token.expires_in ?? 3600) * 1000; const me = await spotifyApi('/me'); spotify.displayName = me.display_name ?? me.id; spotify.product = me.product; saveJson(SPOTIFY_FILE, spotify); return reply.redirect('/?spotify=connected'); });
app.get<{ Querystring: { q?: string } }>('/api/spotify/search', async req => ({ tracks: await spotifySearch(String(req.query.q ?? '')) }));
app.get('/api/spotify/devices', async () => { const data = await spotifyApi('/me/player/devices'); return data.devices.map((item: any) => ({ id: item.id, name: item.name, type: item.type, active: item.is_active, volume: item.volume_percent })); });
app.post<{ Body: { uri: string; deviceId?: string } }>('/api/spotify/play', async req => { await spotifyApi(`/me/player/play${req.body.deviceId ? `?device_id=${encodeURIComponent(req.body.deviceId)}` : ''}`, { method: 'PUT', body: JSON.stringify({ uris: [req.body.uri] }) }); return { ok: true }; });
app.post('/api/spotify/pause', async () => { await spotifyApi('/me/player/pause', { method: 'PUT' }); return { ok: true }; });
app.post('/api/spotify/next', async () => { await spotifyApi('/me/player/next', { method: 'POST' }); return { ok: true }; });
app.get('/api/spotify/current', async () => { try { const data = await spotifyApi('/me/player'); return data ? { playing: data.is_playing, track: data.item ? { name: data.item.name, artist: data.item.artists?.map((a: any) => a.name).join(', '), url: data.item.external_urls?.spotify } : null, device: data.device?.name ?? null } : { playing: false, track: null, device: null }; } catch { return { playing: false, track: null, device: null }; } });
app.post<{ Body: { url: string; name?: string } }>('/api/spotify/import-playlist', async req => { const imported = await importSpotifyPlaylist(req.body.url); const playlist: Playlist = { id: makeId(), name: req.body.name?.trim() || imported.name, kind: 'spotify', items: imported.items }; db.playlists.push(playlist); saveJson(DB_FILE, db); return playlist; });
app.post<{ Params: { id: string } }>('/api/spotify/play-playlist/:id', async req => { const playlist = db.playlists.find(item => item.id === req.params.id && item.kind === 'spotify'); if (!playlist) throw new Error('Spotify-Playlist nicht gefunden.'); const deviceData = await spotifyApi('/me/player/devices'); const device = deviceData.devices.find((item: any) => item.is_active) ?? deviceData.devices[0]; if (!device) throw new Error('Kein Spotify-Gerät aktiv.'); await spotifyApi(`/me/player/play?device_id=${encodeURIComponent(device.id)}`, { method: 'PUT', body: JSON.stringify({ uris: playlist.items.map(item => item.value) }) }); return { ok: true, device: device.name }; });
app.get('/api/youtube/status', async () => ({ configured: Boolean(YOUTUBE_API_KEY) }));
app.get<{ Querystring: { q?: string } }>('/api/youtube/search', async req => ({ items: await youtubeSearch(String(req.query.q ?? '')) }));
app.post<{ Body: { url: string; name?: string } }>('/api/youtube/import-playlist', async req => { const imported = await importYoutubePlaylist(req.body.url); const playlist: Playlist = { id: makeId(), name: req.body.name?.trim() || imported.name, kind: 'youtube', items: imported.items }; db.playlists.push(playlist); saveJson(DB_FILE, db); return playlist; });
app.get<{ Querystring: { url: string } }>('/api/youtube/embed', async req => { const videoId = youtubeVideoId(req.query.url); if (!videoId) throw new Error('Kein YouTube-Video erkannt.'); return { videoId, embedUrl: `https://www.youtube.com/embed/${videoId}` }; });

await app.listen({ port: PORT, host: '0.0.0.0' });
if (process.env.DISCORD_TOKEN) client.login(process.env.DISCORD_TOKEN).catch(console.error); else console.warn('DISCORD_TOKEN fehlt. Weboberfläche läuft, Discord ist offline.');
