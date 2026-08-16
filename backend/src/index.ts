import Fastify from 'fastify';
import cors from '@fastify/cors';
import fastifyStatic from '@fastify/static';
import { randomBytes, scryptSync } from 'node:crypto';
import path from 'node:path';
import os from 'node:os';
import { execFile as execFileCb } from 'node:child_process';
import { promisify } from 'node:util';
import { DATA_DIR, readConfig, writeConfig, passwordHash } from './config.js';
import { searchYouTube, searchRadio, searchSpotify } from './media.js';
import { DiscordInstance } from './discord.js';
import { Ts3Instance } from './ts3.js';
import { networkInterfaces, networkStats } from './network.js';
import { applyDiscordStability, preferredInstance } from './stability.js';

const execFile = promisify(execFileCb);
const PORT = Number(process.env.PORT ?? 3000);
const HOST = process.env.HOST ?? '0.0.0.0';
const FRONTEND_DIR = process.env.FRONTEND_DIR ?? path.resolve(process.cwd(), '../frontend');
type Session = { userId: string; expires: number };
const sessions = new Map<string, Session>();
let config = readConfig();
const discord = new Map<string, DiscordInstance>();
const ts3 = new Map<string, Ts3Instance>();

function verifyPassword(password: string, salt: string, hash: string) {
  if (!salt || !hash) return false;
  return scryptSync(password, Buffer.from(salt, 'hex'), 64).toString('hex') === hash;
}
function cookieToken(request: any) {
  const value = String(request.headers.cookie ?? '').split(';').map((x: string) => x.trim()).find((x: string) => x.startsWith('rb_session='));
  return value?.slice('rb_session='.length) || '';
}
function currentUser(request: any) {
  const token = cookieToken(request);
  const session = token ? sessions.get(token) : undefined;
  if (!session || session.expires < Date.now()) { if (token) sessions.delete(token); return null; }
  return config.users.find((u: any) => u.id === session.userId) ?? null;
}
function auth(request: any, reply: any) { const user = currentUser(request); if (user) return user; reply.code(401).send({ error: 'Nicht angemeldet.' }); return null; }
function requireAdmin(request: any, reply: any) { const user = auth(request, reply); if (!user) return null; if (user.role !== 'admin') { reply.code(403).send({ error: 'Administratorrechte erforderlich.' }); return null; } return user; }
function save() { writeConfig(config); }
function bot(): any { return preferredInstance(discord, ts3, config.activeInstance); }
function publicInstance(x: any, live: any) { const safe = { ...x }; delete safe.token; delete safe.clientSecret; delete safe.serverPassword; delete safe.channelPassword; return { ...safe, ...(live?.state?.() ?? {}) }; }
function systemStatus() {
  const totalMem = os.totalmem(); const freeMem = os.freemem(); const load = os.loadavg()[0];
  const selected = config.settings?.networkInterface || 'auto';
  const net = networkStats(selected);
  return { hostname: os.hostname(), uptime: os.uptime(), processUptime: process.uptime(), memoryTotal: totalMem, memoryUsed: totalMem-freeMem, memoryPercent: Math.round(((totalMem-freeMem)/totalMem)*100), cpuPercent: Math.max(0, Math.min(100, Math.round((load/Math.max(os.cpus().length,1))*100))), cpuCores: os.cpus().length, time: new Date().toISOString(), node: process.version, networkInterface: net.interface, networkRx: net.rxRate, networkTx: net.txRate, networkRxTotal: net.rxTotal, networkTxTotal: net.txTotal, networkTotal: net.total };
}
async function startInstances() {
  for (const cfg of config.instances.discord ?? []) { if (discord.has(cfg.id)) continue; const instance = applyDiscordStability(new DiscordInstance(cfg)); discord.set(cfg.id, instance); instance.start().catch((e: unknown) => console.error(`Discord ${cfg.name}:`, e)); }
  for (const cfg of config.instances.ts3 ?? []) { if (ts3.has(cfg.id)) continue; const instance = new Ts3Instance(cfg); ts3.set(cfg.id, instance); instance.start().catch((e: unknown) => console.error(`TS3 ${cfg.name}:`, e)); }
}
async function rebuildInstances() { for (const instance of discord.values()) await instance.stop().catch(() => undefined); for (const instance of ts3.values()) await instance.stop().catch(() => undefined); discord.clear(); ts3.clear(); await startInstances(); }
function rebuildInstancesInBackground() { void rebuildInstances().catch(error => console.error('Instanzen konnten nicht neu aufgebaut werden:', error)); }
async function systemCommand(command: 'reboot' | 'poweroff' | 'restart') { const args = command === 'restart' ? ['/usr/bin/systemctl', 'restart', 'radiobot'] : ['/usr/bin/systemctl', command]; await execFile('/usr/bin/sudo', args, { timeout: 10000 }); }

const app = Fastify({ logger: true });
await app.register(cors, { origin: true, credentials: true });
await app.register(fastifyStatic, { root: FRONTEND_DIR, prefix: '/', index: 'index.html' });

app.get('/api/setup/status', async () => ({ userCreated: Array.isArray(config.users) && config.users.length > 0, setupComplete: Boolean(config.setupComplete) }));
app.post('/api/setup/user', async (request:any, reply:any) => { if (config.users.length) return reply.code(409).send({error:'Benutzer existiert bereits.'}); const body=request.body??{}; const username=String(body.username??'').trim(); const password=String(body.password??''); if(!username||password.length<5||password.length>30) return reply.code(400).send({error:'Benutzername erforderlich, Passwort muss zwischen 5 und 30 Zeichen lang sein.'}); const pass=passwordHash(password); const user={id:randomBytes(8).toString('hex'),username,role:'admin',salt:pass.salt,hash:pass.hash}; config.users=[user]; config.auth={user:username,salt:pass.salt,hash:pass.hash}; save(); return {ok:true}; });
app.post('/api/auth/login', async (request:any, reply:any) => { if(!config.users.length) return reply.code(403).send({error:'Zuerst den ersten Benutzer anlegen.'}); const body=request.body??{}; const username=String(body.username??''); const password=String(body.password??''); const user=config.users.find((u:any)=>u.username===username); if(!user||!verifyPassword(password,user.salt,user.hash)) return reply.code(401).send({error:'Anmeldung fehlgeschlagen.'}); const token=randomBytes(32).toString('hex'); sessions.set(token,{userId:user.id,expires:Date.now()+86400000}); reply.header('Set-Cookie',`rb_session=${token}; Path=/; HttpOnly; SameSite=Lax; Max-Age=86400`); return {ok:true,user:{username:user.username,role:user.role}}; });
app.post('/api/auth/logout', async (request:any, reply:any) => { const token=cookieToken(request); if(token)sessions.delete(token); reply.header('Set-Cookie','rb_session=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0'); return {ok:true}; });
app.get('/api/me', async (request:any, reply:any)=>{const user=auth(request,reply); if(!user)return; return {user:{id:user.id,username:user.username,role:user.role},setupComplete:config.setupComplete,activeInstance:config.activeInstance};});
app.get('/api/state', async (request:any, reply:any)=>{const user=auth(request,reply);if(!user)return;if(!config.setupComplete)return reply.code(409).send({error:'SETUP_REQUIRED'}); const active=bot(); if(active?.cfg?.id && active.cfg.id!==config.activeInstance) { config.activeInstance=active.cfg.id; save(); } return {activeInstance:config.activeInstance,currentUser:{id:user.id,username:user.username,role:user.role},instances:[...(config.instances.discord??[]).map((x:any)=>publicInstance(x,discord.get(x.id))),...(config.instances.ts3??[]).map((x:any)=>publicInstance(x,ts3.get(x.id)))],playlists:config.playlists,uiOrder:config.uiOrder,system:systemStatus()};});
app.get('/api/settings', async (request:any, reply:any)=>{const user=auth(request,reply);if(!user)return; return {setupComplete:config.setupComplete,activeInstance:config.activeInstance,settings:config.settings,networkInterfaces:networkInterfaces(),canManageUsers:user.role==='admin',instances:{discord:(config.instances.discord??[]).map((x:any)=>{const v={...x};delete v.token;return v;}),ts3:config.instances.ts3??[],spotify:(config.instances.spotify??[]).map((x:any)=>{const v={...x};delete v.clientSecret;return v;})}};});
app.get('/api/network/stats', async (request:any, reply:any)=>{const user=auth(request,reply);if(!user)return;return networkStats(config.settings?.networkInterface||'auto');});
app.get('/api/network/interfaces', async (request:any, reply:any)=>{const user=auth(request,reply);if(!user)return;return {interfaces:networkInterfaces(),selected:config.settings?.networkInterface||'auto'};});
app.put('/api/settings', async (request:any, reply:any)=>{ const user=auth(request,reply);if(!user)return;const body=request.body??{}; if(typeof body.activeInstance==='string') config.activeInstance=body.activeInstance; if(body.settings&&(user.role==='admin'||user.role==='operator')) config.settings={...config.settings,...body.settings}; if(Array.isArray(body.discord)&&user.role!=='viewer'){const existing=new Map((config.instances.discord??[]).map((x:any)=>[x.id,x]));config.instances.discord=body.discord.map((x:any,i:number)=>{const prev:any=existing.get(x.id);return{id:x.id||`discord-${i+1}`,name:x.name||`Discord ${i+1}`,token:x.token||prev?.token||'',guildId:x.guildId||prev?.guildId||'',voiceChannelId:x.voiceChannelId||prev?.voiceChannelId||'',prefix:x.prefix||'!'};});} if(Array.isArray(body.ts3)&&user.role!=='viewer'){const existing=new Map((config.instances.ts3??[]).map((x:any)=>[x.id,x]));config.instances.ts3=body.ts3.map((x:any,i:number)=>{const prev:any=existing.get(x.id);return{id:x.id||`ts3-${i+1}`,name:x.name||`TS3 ${i+1}`,host:x.host||'',nickname:x.nickname||'RadioBot TS3',channel:x.channel||'',channelPassword:x.channelPassword||'',serverPassword:x.serverPassword||'',identity:x.identity||prev?.identity||''};});} if(Array.isArray(body.spotify)&&user.role!=='viewer') config.instances.spotify=body.spotify; config.setupComplete=true;save();rebuildInstancesInBackground();return {ok:true}; });
app.put('/api/ui/layout',async(request:any,reply:any)=>{const user=auth(request,reply);if(!user)return;if(user.role==='viewer')return reply.code(403).send({error:'Keine Schreibrechte.'});const order=(request.body??{}).order;if(!Array.isArray(order)||!order.every((x:any)=>typeof x==='string'))return reply.code(400).send({error:'Ungültige Reihenfolge.'});config.uiOrder=order.slice(0,30);save();return{ok:true,order:config.uiOrder};});
app.get('/api/users',async(request:any,reply:any)=>{if(!requireAdmin(request,reply))return;return config.users.map((u:any)=>({id:u.id,username:u.username,role:u.role}));});
app.post('/api/users',async(request:any,reply:any)=>{if(!requireAdmin(request,reply))return;const body=request.body??{};const username=String(body.username??'').trim();const password=String(body.password??'');const role=['admin','operator','viewer'].includes(body.role)?body.role:'viewer';if(!username||password.length<5||password.length>30)return reply.code(400).send({error:'Benutzername und Passwort (5 bis 30 Zeichen) erforderlich.'});if(config.users.some((u:any)=>u.username.toLowerCase()===username.toLowerCase()))return reply.code(409).send({error:'Benutzername bereits vorhanden.'});const pass=passwordHash(password);config.users.push({id:randomBytes(8).toString('hex'),username,role,salt:pass.salt,hash:pass.hash});save();return{ok:true};});
app.put('/api/users/:id',async(request:any,reply:any)=>{if(!requireAdmin(request,reply))return;const target=config.users.find((u:any)=>u.id===request.params.id);if(!target)return reply.code(404).send({error:'Benutzer nicht gefunden.'});const body=request.body??{};if(body.username)target.username=String(body.username).trim();if(['admin','operator','viewer'].includes(body.role))target.role=body.role;if(body.password){const pwd=String(body.password);if(pwd.length<5||pwd.length>30)return reply.code(400).send({error:'Passwort muss zwischen 5 und 30 Zeichen lang sein.'});const pass=passwordHash(pwd);target.salt=pass.salt;target.hash=pass.hash;}save();return{ok:true};});
app.delete('/api/users/:id',async(request:any,reply:any)=>{const admin=requireAdmin(request,reply);if(!admin)return;if(request.params.id===admin.id)return reply.code(400).send({error:'Der aktuell angemeldete Administrator kann nicht gelöscht werden.'});const target=config.users.find((u:any)=>u.id===request.params.id);if(!target)return reply.code(404).send({error:'Benutzer nicht gefunden.'});if(target.role==='admin'&&config.users.filter((u:any)=>u.role==='admin').length<=1)return reply.code(400).send({error:'Mindestens ein Administrator muss erhalten bleiben.'});config.users=config.users.filter((u:any)=>u.id!==target.id);save();return{ok:true};});
app.get('/api/search',async(request:any,reply:any)=>{const user=auth(request,reply);if(!user)return;const q=String(request.query?.q??'').trim();if(!q)return[];try{return await searchYouTube(q);}catch(e){return reply.code(502).send({error:e instanceof Error?e.message:String(e)});}});
app.get('/api/radio/search',async(request:any,reply:any)=>{const user=auth(request,reply);if(!user)return;const q=String(request.query?.q??'').trim();if(!q)return[];try{return await searchRadio(q);}catch(e){return reply.code(502).send({error:e instanceof Error?e.message:String(e)});}});
app.get('/api/spotify/search',async(request:any,reply:any)=>{const user=auth(request,reply);if(!user)return;const q=String(request.query?.q??'').trim();if(!q)return[];try{return await searchSpotify(config.instances.spotify?.[0],q);}catch(e){return reply.code(502).send({error:e instanceof Error?e.message:String(e)});}});
app.post('/api/play',async(request:any,reply:any)=>{const user=auth(request,reply);if(!user)return;const active=bot();if(!active)return reply.code(400).send({error:'Keine aktive Instanz.'});const b=request.body??{};try{const item=await active.add(String(b.input??b.url??b.search??''),Boolean(b.playNow));if(active.cfg?.id!==config.activeInstance){config.activeInstance=active.cfg.id;save();}return{ok:true,item};}catch(e){return reply.code(400).send({error:e instanceof Error?e.message:String(e)});}});
app.post('/api/control',async(request:any,reply:any)=>{const user=auth(request,reply);if(!user)return;if(user.role==='viewer')return reply.code(403).send({error:'Keine Steuerrechte.'});const active:any=bot();if(!active)return reply.code(400).send({error:'Keine aktive Instanz.'});const action=String((request.body??{}).action??'');if(action==='skip'){active.ffmpeg?.kill('SIGTERM');active.player?.stop?.();}else if(action==='pause')active.player?.pause?.();else if(action==='resume')active.player?.unpause?.();else if(action==='stop'){active.queue=[];active.ffmpeg?.kill('SIGTERM');active.player?.stop?.();active.current=undefined;}else if(action==='volume'){const value=Math.max(0,Math.min(100,Number((request.body??{}).value??80)));if(typeof active.setVolume==='function')active.setVolume(value);else active.volume=value;}return{ok:true};});
app.get('/api/queue',async(request:any,reply:any)=>{const user=auth(request,reply);if(!user)return;const active:any=bot();return{current:active?.current?.title??null,queue:active?.queue?.map((x:any)=>x.title)??[]};
app.post('/api/playlist',async(request:any,reply:any)=>{const user=auth(request,reply);if(!user)return;if(user.role==='viewer')return reply.code(403).send({error:'Keine Schreibrechte.'});const name=String((request.body??{}).name??'Neue Playlist').trim();const playlist={id:randomBytes(8).toString('hex'),name:name||'Neue Playlist',items:[] as any[]};config.playlists.push(playlist);save();return playlist;});
app.post('/api/playlist/:id/item',async(request:any,reply:any)=>{const user=auth(request,reply);if(!user)return;if(user.role==='viewer')return reply.code(403).send({error:'Keine Schreibrechte.'});const p=config.playlists.find((x:any)=>x.id===request.params.id);if(!p)return reply.code(404).send({error:'Playlist nicht gefunden.'});const item=request.body??{};p.items.push({input:String(item.input??''),title:String(item.title??item.input??'')});save();return{ok:true,playlist:p};});
app.delete('/api/playlist/:id',async(request:any,reply:any)=>{const user=auth(request,reply);if(!user)return;if(user.role==='viewer')return reply.code(403).send({error:'Keine Schreibrechte.'});config.playlists=config.playlists.filter((x:any)=>x.id!==request.params.id);save();return{ok:true};});
app.post('/api/playlist/:id/play',async(request:any,reply:any)=>{const user=auth(request,reply);if(!user)return;if(user.role==='viewer')return reply.code(403).send({error:'Keine Steuerrechte.'});const p=config.playlists.find((x:any)=>x.id===request.params.id);if(!p)return reply.code(404).send({error:'Playlist nicht gefunden.'});const active:any=bot();if(!active)return reply.code(400).send({error:'Keine aktive Instanz.'});for(const item of p.items??[])await active.add(item.input);return{ok:true,count:p.items?.length??0};});
app.get('/api/system/status',async(request:any,reply:any)=>{const user=auth(request,reply);if(!user)return;return systemStatus();});
app.post('/api/system/restart-bot',async(request:any,reply:any)=>{if(!requireAdmin(request,reply))return;void systemCommand('restart').catch(e=>console.error('bot restart',e));return{ok:true};});
app.post('/api/system/reboot',async(request:any,reply:any)=>{if(!requireAdmin(request,reply))return;setTimeout(()=>void systemCommand('reboot').catch(e=>console.error('reboot',e)),250);return{ok:true};});
app.post('/api/system/shutdown',async(request:any,reply:any)=>{if(!requireAdmin(request,reply))return;setTimeout(()=>void systemCommand('poweroff').catch(e=>console.error('poweroff',e)),250);return{ok:true};});
app.get('/api/system/health',async()=>({ok:true,uptime:process.uptime(),memory:process.memoryUsage(),node:process.version,dataDir:DATA_DIR}));
await startInstances();
await app.listen({port:PORT,host:HOST});
console.log(`RadioBot Web läuft auf Port ${PORT}`);
