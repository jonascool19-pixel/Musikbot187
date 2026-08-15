import Fastify from 'fastify';
import cors from '@fastify/cors';
import fastifyStatic from '@fastify/static';
import { Client, GatewayIntentBits } from 'discord.js';
import { joinVoiceChannel, createAudioPlayer, createAudioResource, AudioPlayerStatus, NoSubscriberBehavior, StreamType, VoiceConnection } from '@discordjs/voice';
import { spawn, type ChildProcessWithoutNullStreams } from 'node:child_process';
import { createHash, randomBytes, scryptSync } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';

const PORT = Number(process.env.PORT ?? 3000);
const HOST = process.env.HOST ?? '0.0.0.0';
const DATA_DIR = process.env.DATA_DIR ?? '/var/lib/radiobot';
const FRONTEND_DIR = process.env.FRONTEND_DIR ?? path.resolve(process.cwd(), '../frontend');
const CONFIG_FILE = path.join(DATA_DIR, 'config.json');
const YTDLP = process.env.YTDLP_PATH ?? '/usr/local/bin/yt-dlp';
const FFMPEG = process.env.FFMPEG_PATH ?? 'ffmpeg';
const sessions = new Map<string, number>();

fs.mkdirSync(DATA_DIR, { recursive: true, mode: 0o750 });

function hashPassword(password: string, salt: string) {
  return scryptSync(password, Buffer.from(salt, 'hex'), 64).toString('hex');
}
function cookieSession(reply: any, token: string) {
  reply.header('Set-Cookie', `rb_session=${token}; Path=/; HttpOnly; SameSite=Lax; Max-Age=86400`);
}
function getSession(request: any) {
  const cookie = String(request.headers.cookie ?? '').split(';').map((x: string) => x.trim()).find((x: string) => x.startsWith('rb_session='));
  const token = cookie?.slice('rb_session='.length);
  if (!token || !sessions.has(token)) return false;
  const expiry = sessions.get(token)!;
  if (expiry < Date.now()) { sessions.delete(token); return false; }
  return true;
}
function requireAuth(request: any, reply: any) { if (!getSession(request)) { reply.code(401).send({ error: 'Nicht angemeldet.' }); return false; } return true; }
function readConfig(): any {
  if (!fs.existsSync(CONFIG_FILE)) {
    const cfg = { version: 1, auth: { user: '', salt: '', hash: '' }, setupToken: randomBytes(24).toString('hex'), setupComplete: false, activeInstance: 'discord-main', instances: { discord: [], ts3: [] }, playlists: [], uiOrder: ['hero','discord','ts3','search','radio','media','playlists','spotify','youtube','system','queue'], settings: { prefix: '!', volume: 80 } };
    writeConfig(cfg); return cfg;
  }
  return JSON.parse(fs.readFileSync(CONFIG_FILE, 'utf8'));
}
function writeConfig(cfg: any) {
  const tmp = `${CONFIG_FILE}.tmp-${process.pid}`;
  fs.writeFileSync(tmp, JSON.stringify(cfg, null, 2), { mode: 0o600 });
  fs.renameSync(tmp, CONFIG_FILE);
}
let config = readConfig();

function command(args: string[], timeout = 30000): Promise<string> {
  return new Promise((resolve, reject) => {
    const child = spawn(args[0], args.slice(1), { stdio: ['ignore','pipe','pipe'] });
    let out=''; let err=''; const timer = setTimeout(() => { child.kill('SIGTERM'); reject(new Error('Befehl Timeout')); }, timeout);
    child.stdout.on('data', d => out += d); child.stderr.on('data', d => err += d);
    child.on('error', reject); child.on('close', code => { clearTimeout(timer); code === 0 ? resolve(out.trim()) : reject(new Error(err.trim() || `Exit ${code}`)); });
  });
}
async function resolveMedia(input: string): Promise<string> {
  if (/^https?:\/\//i.test(input)) return input;
  const out = await command([YTDLP, '--no-playlist','--no-warnings','--get-url','-f','bestaudio/best',`ytsearch1:${input}`]);
  return out.split(/\r?\n/)[0];
}
async function mediaTitle(input: string): Promise<string> {
  if (!/^https?:\/\//i.test(input)) return input;
  try { return await command([YTDLP,'--no-playlist','--no-warnings','--get-title',input], 15000); } catch { return input; }
}
async function searchYouTube(q: string) {
  const raw = await command([YTDLP,'--flat-playlist','--dump-single-json','--no-warnings',`ytsearch8:${q}`]);
  const data = JSON.parse(raw); return (data.entries ?? []).map((e: any) => ({ id: e.id, title: e.title, url: e.url || `https://www.youtube.com/watch?v=${e.id}`, duration: e.duration ?? null, channel: e.channel ?? e.uploader ?? '' }));
}
async function searchRadio(q: string) {
  const url = `https://de1.api.radio-browser.info/json/stations/search?name=${encodeURIComponent(q)}&limit=12&hidebroken=true&order=clickcount&reverse=true`;
  const r = await fetch(url); if (!r.ok) throw new Error(`Radio-Suche ${r.status}`); const rows: any[] = await r.json();
  return rows.map(x => ({ id: x.stationuuid, name: x.name, url: x.url_resolved || x.url, codec: x.codec, bitrate: x.bitrate, country: x.country }));
}
async function spotifyToken(instance: any) {
  const basic = Buffer.from(`${instance.clientId}:${instance.clientSecret}`).toString('base64');
  const r = await fetch('https://accounts.spotify.com/api/token',{method:'POST',headers:{Authorization:`Basic ${basic}`,'Content-Type':'application/x-www-form-urlencoded'},body:'grant_type=client_credentials'});
  if (!r.ok) throw new Error(`Spotify Token ${r.status}`); return (await r.json() as any).access_token;
}
async function searchSpotify(q: string) {
  const sp = config.instances.spotify?.[0]; if (!sp?.clientId || !sp?.clientSecret) throw new Error('Spotify-Zugangsdaten fehlen.');
  const token = await spotifyToken(sp); const r = await fetch(`https://api.spotify.com/v1/search?type=track&limit=10&q=${encodeURIComponent(q)}`,{headers:{Authorization:`Bearer ${token}`}});
  if (!r.ok) throw new Error(`Spotify Suche ${r.status}`); const data: any = await r.json();
  return (data.tracks.items ?? []).map((t: any) => ({ id:t.id,title:t.name,artist:t.artists?.map((a:any)=>a.name).join(', '),album:t.album?.name,url:t.external_urls?.spotify,search:`${t.name} ${t.artists?.[0]?.name ?? ''}` }));
}

class DiscordInstance {
  cfg: any; client = new Client({ intents:[GatewayIntentBits.Guilds,GatewayIntentBits.GuildVoiceStates,GatewayIntentBits.GuildMessages,GatewayIntentBits.MessageContent] });
  player = createAudioPlayer({ behaviors:{ noSubscriber: NoSubscriberBehavior.Pause } });
  connection?: VoiceConnection; queue: any[]=[]; current?: any; ffmpeg?: ChildProcessWithoutNullStreams; volume=80; connected=false;
  constructor(cfg:any){ this.cfg=cfg; this.client.on('ready',()=>{this.connected=true; console.log(`Discord ${cfg.name} online`);}); this.client.on('messageCreate',m=>this.onMessage(m).catch(e=>console.error('Discord command',e))); this.player.on(AudioPlayerStatus.Idle,()=>this.next()); }
  async start(){ if(!this.cfg.token) return; await this.client.login(this.cfg.token); }
  async stop(){ this.ffmpeg?.kill('SIGTERM'); this.connection?.destroy(); this.connected=false; await this.client.destroy(); }
  async ensureVoice(){ const guild=this.client.guilds.cache.get(this.cfg.guildId); if(!guild) throw new Error('Discord-Server nicht gefunden.'); const channel=guild.channels.cache.get(this.cfg.voiceChannelId) as any; if(!channel?.isVoiceBased?.()) throw new Error('Discord-Sprachkanal nicht gefunden.'); this.connection=joinVoiceChannel({channelId:channel.id,guildId:guild.id,adapterCreator:guild.voiceAdapterCreator}); this.connection.subscribe(this.player); }
  async add(input:string, playNow=false){ const title=await mediaTitle(input); const item={input,title}; if(playNow){ this.ffmpeg?.kill('SIGTERM'); this.queue.unshift(item); } else this.queue.push(item); if(!this.current) await this.next(); return item; }
  async next(){ if(this.current) return; const item=this.queue.shift(); if(!item) return; this.current=item; try { await this.ensureVoice(); const url=await resolveMedia(item.input); const ff=spawn(FFMPEG,['-hide_banner','-loglevel','error','-reconnect','1','-reconnect_streamed','1','-reconnect_delay_max','5','-i',url,'-vn','-af',`volume=${this.volume/100}`,'-ar','48000','-ac','2','-f','s16le','pipe:1']); this.ffmpeg=ff; const resource=createAudioResource(ff.stdout,{inputType:StreamType.Raw}); this.player.play(resource); await new Promise<void>(res=>ff.once('close',()=>res())); } catch(e){ console.error(`Discord playback ${this.cfg.name}`,e); } finally { this.ffmpeg=undefined; this.current=undefined; this.next(); } }
  state(){ return {id:this.cfg.id,name:this.cfg.name,type:'discord',connected:this.connected,playing:this.current?.title ?? null,queue:this.queue.map(x=>x.title),volume:this.volume}; }
  async onMessage(m:any){ if(m.author.bot || !m.content.startsWith(this.cfg.prefix ?? '!')) return; const [cmd,...rest]=m.content.slice((this.cfg.prefix??'!').length).trim().split(/\s+/); const arg=rest.join(' '); if(!['play','queue','skip','stop','pause','resume','volume','radio'].includes(cmd)) return; try { if(cmd==='play') { await this.add(arg); await m.reply('▶️ Zur Queue hinzugefügt.'); } else if(cmd==='radio'){ await this.add(arg); await m.reply('📻 Radio zur Queue hinzugefügt.'); } else if(cmd==='queue') m.reply(this.queue.length?this.queue.map((x,i)=>`${i+1}. ${x.title}`).join('\n'):'Queue ist leer.'); else if(cmd==='skip'){this.ffmpeg?.kill('SIGTERM');m.reply('⏭️ Übersprungen.');} else if(cmd==='stop'){this.queue=[];this.ffmpeg?.kill('SIGTERM');this.player.stop();m.reply('⏹️ Gestoppt.');} else if(cmd==='pause'){this.player.pause();m.reply('⏸️ Pausiert.');} else if(cmd==='resume'){this.player.unpause();m.reply('▶️ Fortgesetzt.');} else if(cmd==='volume'){this.volume=Math.max(0,Math.min(100,Number(rest[0]??80)));m.reply(`🔊 ${this.volume}%`);} } catch(e){ m.reply(`Fehler: ${e instanceof Error?e.message:String(e)}`).catch(()=>{}); } }
}

class Ts3Instance {
  cfg:any; client:any; queue:any[]=[]; connected=false; current?:any; proc?:ChildProcessWithoutNullStreams; volume=80;
  constructor(cfg:any){this.cfg=cfg;}
  async start(){ if(!this.cfg.host) return; try { const mod:any=await import('@honeybbq/teamspeak-client'); const identity=(this.cfg.identity && mod.identityFromString?.(this.cfg.identity)) || mod.generateIdentity?.(8); this.client=new mod.Client(identity,this.cfg.host,this.cfg.nickname||'RadioBot TS3',{serverPassword:this.cfg.serverPassword||undefined,defaultChannel:this.cfg.channel||undefined,defaultChannelPassword:this.cfg.channelPassword||undefined}); this.client.on('connected',()=>{this.connected=true;}); this.client.on('disconnected',()=>{this.connected=false;}); await this.client.connect(); await this.client.waitConnected(); if(identity?.exportString && !this.cfg.identity){this.cfg.identity=identity.exportString();persist();} } catch(e){ console.error(`TS3 ${this.cfg.name}`,e); this.connected=false; } }
  state(){return {id:this.cfg.id,name:this.cfg.name,type:'ts3',connected:this.connected,playing:this.current?.title??null,queue:this.queue.map(x=>x.title),volume:this.volume};}
}
const discord = new Map<string,DiscordInstance>(); const ts3 = new Map<string,Ts3Instance>();
function activeKey(){ return config.activeInstance; }
function activeBot(): any { return discord.get(activeKey()) ?? ts3.get(activeKey()); }
function persist(){ writeConfig(config); }
async function startInstances(){
  for(const x of config.instances.discord ?? []) if(!discord.has(x.id)){const b=new DiscordInstance(x);discord.set(x.id,b);b.start().catch(e=>console.error('Discord start',e));}
  for(const x of config.instances.ts3 ?? []) if(!ts3.has(x.id)){const b=new Ts3Instance(x);ts3.set(x.id,b);b.start().catch(e=>console.error('TS3 start',e));}
}

const app=Fastify({logger:true});
await app.register(cors,{origin:true,credentials:true});
await app.register(fastifyStatic,{root:FRONTEND_DIR,prefix:'/'});
app.get('/api/setup/status',async()=>({userCreated:Boolean(config.auth.user),setupComplete:Boolean(config.setupComplete),setupToken:config.setupComplete?undefined:config.setupToken}));
app.post('/api/setup/user',async(request:any,reply:any)=>{ if(config.auth.user) return reply.code(409).send({error:'Benutzer existiert bereits.'}); const body:any=request.body??{}; const user=String(body.username??'').trim(); const pass=String(body.password??''); if(!user||pass.length<12) return reply.code(400).send({error:'Benutzer erforderlich, Passwort mindestens 12 Zeichen.'}); const salt=randomBytes(16).toString('hex'); config.auth={user,salt,hash:hashPassword(pass,salt)}; persist(); return {ok:true}; });
app.post('/api/auth/login',async(request:any,reply:any)=>{ const body:any=request.body??{}; if(!config.auth.user) return reply.code(403).send({error:'Zuerst den ersten Benutzer anlegen.'}); const user=String(body.username??''); const pass=String(body.password??''); if(user!==config.auth.user||hashPassword(pass,config.auth.salt)!==config.auth.hash) return reply.code(401).send({error:'Anmeldung fehlgeschlagen.'}); const token=randomBytes(32).toString('hex'); sessions.set(token,Date.now()+86400000); cookieSession(reply,token); return {ok:true,user}; });
app.post('/api/auth/logout',async(request:any,reply:any)=>{ const cookie=String(request.headers.cookie??'').split(';').map((x:string)=>x.trim()).find((x:string)=>x.startsWith('rb_session=')); if(cookie) sessions.delete(cookie.slice(11)); reply.header('Set-Cookie','rb_session=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0'); return {ok:true}; });
app.get('/api/me',async(request:any,reply:any)=>{ if(!requireAuth(request,reply)) return; return {user:config.auth.user,setupComplete:config.setupComplete,activeInstance:config.activeInstance}; });
app.get('/api/state',async(request:any,reply:any)=>{ if(!requireAuth(request,reply)) return; return {activeInstance:config.activeInstance,instances:[...(config.instances.discord??[]).map((x:any)=>({...discord.get(x.id)?.state(),...x,token:undefined})),...(config.instances.ts3??[]).map((x:any)=>({...ts3.get(x.id)?.state(),...x}))],playlists:config.playlists,uiOrder:config.uiOrder}; });
app.get('/api/settings',async(request:any,reply:any)=>{if(!requireAuth(request,reply))return; return {setupComplete:config.setupComplete,activeInstance:config.activeInstance,settings:config.settings,instances:{discord:(config.instances.discord??[]).map((x:any)=>({...x,token:undefined})),ts3:config.instances.ts3??[],spotify:(config.instances.spotify??[]).map((x:any)=>({...x,clientSecret:undefined}))}}});
app.put('/api/settings',async(request:any,reply:any)=>{if(!requireAuth(request,reply))return; const b:any=request.body??{}; if(typeof b.activeInstance==='string') config.activeInstance=b.activeInstance; if(b.settings) config.settings={...config.settings,...b.settings}; if(Array.isArray(b.discord)) config.instances.discord=b.discord.map((x:any,i:number)=>({id:x.id||`discord-${i+1}`,name:x.name||`Discord ${i+1}`,token:x.token||'',guildId:x.guildId||'',voiceChannelId:x.voiceChannelId||'',prefix:x.prefix||'!'})); if(Array.isArray(b.ts3)) config.instances.ts3=b.ts3.map((x:any,i:number)=>({id:x.id||`ts3-${i+1}`,name:x.name||`TS3 ${i+1}`,host:x.host||'',nickname:x.nickname||'RadioBot TS3',channel:x.channel||'',channelPassword:x.channelPassword||'',serverPassword:x.serverPassword||'',identity:x.identity||''})); if(Array.isArray(b.spotify)) config.instances.spotify=b.spotify; config.setupComplete=true; persist(); await startInstances(); return {ok:true};});
app.put('/api/ui/layout',async(request:any,reply:any)=>{if(!requireAuth(request,reply))return; const order=(request.body as any)?.order; if(!Array.isArray(order)||!order.every((x:any)=>typeof x==='string')) return reply.code(400).send({error:'Ungültige Reihenfolge.'}); config.uiOrder=order.slice(0,30); persist(); return {ok:true,order:config.uiOrder};});
app.get('/api/search',async(request:any,reply:any)=>{if(!requireAuth(request,reply))return; const q=String((request.query as any)?.q??'').trim(); if(!q)return []; try{return await searchYouTube(q);}catch(e){reply.code(502).send({error:e instanceof Error?e.message:String(e)});}});
app.get('/api/radio/search',async(request:any,reply:any)=>{if(!requireAuth(request,reply))return; const q=String((request.query as any)?.q??'').trim(); if(!q)return []; try{return await searchRadio(q);}catch(e){reply.code(502).send({error:e instanceof Error?e.message:String(e)});}});
app.get('/api/spotify/search',async(request:any,reply:any)=>{if(!requireAuth(request,reply))return; const q=String((request.query as any)?.q??'').trim(); if(!q)return []; try{return await searchSpotify(q);}catch(e){reply.code(502).send({error:e instanceof Error?e.message:String(e)});}});
app.post('/api/play',async(request:any,reply:any)=>{if(!requireAuth(request,reply))return; const b:any=request.body??{}; const bot=activeBot(); if(!bot) return reply.code(400).send({error:'Keine aktive Instanz.'}); const item=await bot.add(String(b.input||b.url||b.search||''),Boolean(b.playNow)); return {ok:true,item};});
app.post('/api/control',async(request:any,reply:any)=>{if(!requireAuth(request,reply))return; const b:any=request.body??{}; const bot=activeBot(); if(!bot) return reply.code(400).send({error:'Keine aktive Instanz.'}); if(b.action==='skip'){bot.ffmpeg?.kill('SIGTERM');bot.player?.stop?.();} else if(b.action==='pause'){bot.player?.pause?.();} else if(b.action==='resume'){bot.player?.unpause?.();} else if(b.action==='stop'){bot.queue=[];bot.ffmpeg?.kill('SIGTERM');bot.player?.stop?.();bot.current=undefined;} else if(b.action==='volume'){bot.volume=Math.max(0,Math.min(100,Number(b.value??80)));} persist(); return {ok:true};});
app.get('/api/queue',async(request:any,reply:any)=>{if(!requireAuth(request,reply))return; const bot=activeBot(); return {current:bot?.current?.title??null,queue:bot?.queue?.map((x:any)=>x.title)??[]};});
app.post('/api/playlist',async(request:any,reply:any)=>{if(!requireAuth(request,reply))return; const b:any=request.body??{}; const item={id:randomBytes(8).toString('hex'),name:String(b.name||'Neue Playlist'),items:Array.isArray(b.items)?b.items:[]}; config.playlists.push(item); persist(); return item;});
app.delete('/api/playlist/:id',async(request:any,reply:any)=>{if(!requireAuth(request,reply))return; config.playlists=config.playlists.filter((x:any)=>x.id!==(request.params as any).id);persist();return {ok:true};});
app.post('/api/playlist/:id/play',async(request:any,reply:any)=>{if(!requireAuth(request,reply))return; const p=config.playlists.find((x:any)=>x.id===(request.params as any).id); if(!p)return reply.code(404).send({error:'Playlist nicht gefunden.'}); const bot=activeBot(); if(!bot)return reply.code(400).send({error:'Keine aktive Instanz.'}); for(const item of p.items??[]) await bot.add(item.input||item.url||item.title); return {ok:true,count:(p.items??[]).length};});
app.get('/api/system/health',async()=>({ok:true,uptime:process.uptime(),memory:process.memoryUsage(),node:process.version}));
app.get('/*',async(_,reply)=>reply.sendFile('index.html'));
await startInstances();
app.listen({port:PORT,host:HOST}).then(()=>console.log(`RadioBot Web: http://${HOST}:${PORT}`));
