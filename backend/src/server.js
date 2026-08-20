import fs from 'node:fs/promises';
import path from 'node:path';
import Fastify from 'fastify';
import cors from '@fastify/cors';
import multipart from '@fastify/multipart';
import fastifyStatic from '@fastify/static';
import { config } from './config.js';
import { Store } from './store.js';
import { hashPassword, verifyPassword, validateUsername, randomToken, sessionSign, sessionRead, safeResolve } from './security.js';
import { searchYoutube, searchRadio, searchSpotify } from './media.js';
import { Player } from './player.js';
import { DiscordManager } from './discord.js';
import { TS3Manager } from './ts3.js';

const store=new Store(); await store.init();
const player=new Player(); const discord=new DiscordManager(store,player); const ts3=new TS3Manager();
const discordSaved=new Map(); const ts3Saved=new Map();
const app=Fastify({logger:false,bodyLimit:2*1024*1024});
await app.register(cors,{origin:true}); await app.register(multipart,{limits:{fileSize:config.maxUploadBytes,files:1}});
await app.register(fastifyStatic,{root:path.resolve(new URL('../..',import.meta.url).pathname,'frontend'),prefix:'/'});
function auth(req){const token=String(req.headers.authorization||'').replace(/^Bearer\s+/i,'');return sessionRead(token,config.sessionSecret)}
function requireRole(req,roles=['admin']){const s=auth(req);if(!s||!roles.includes(s.role))throw new Error('Nicht autorisiert');return s}
async function musicFiles(){const out=[];for(const n of await fs.readdir(config.musicDir)){const ext=path.extname(n).toLowerCase();if(config.allowedExtensions.has(ext)){const s=await fs.stat(path.join(config.musicDir,n));out.push({name:n,size:s.size,url:`/api/music/file/${encodeURIComponent(n)}`})}}return out.sort((a,b)=>a.name.localeCompare(b.name))}
app.get('/api/health',async()=>({ok:true,version:'4.0.0',playing:player.playing,queue:player.queue.length}));
app.get('/api/state',async(req)=>{requireRole(req,['admin','editor','viewer']);return{current:player.now(),queue:player.list(),volume:player.volume,playing:player.playing,paused:player.paused,playlists:store.state.playlists,discord:[...discord.instances.keys()],ts3:[...ts3.map.keys()]}});
app.post('/api/setup',async(req,res)=>{if(store.state.users.length)return res.code(409).send({error:'Setup bereits abgeschlossen'});const b=req.body||{};if(b.token!==config.setupToken)return res.code(403).send({error:'Ungültiger Setup-Token'});if(!validateUsername(b.username)||String(b.password||'').length<12)return res.code(400).send({error:'Benutzername oder Passwort ungültig'});store.state.users.push({id:randomToken(8),name:b.username,role:'admin',password:await hashPassword(b.password)});await store.save();return{ok:true}});
app.post('/api/auth/login',async(req,res)=>{const u=store.user(String(req.body?.username||''));if(!u||!(await verifyPassword(req.body?.password||'',u.password)))return res.code(401).send({error:'Login fehlgeschlagen'});return{token:sessionSign({uid:u.id,name:u.name,role:u.role,exp:Date.now()+604800000},config.sessionSecret),user:{name:u.name,role:u.role}}});
app.get('/api/music',async(req)=>{requireRole(req,['admin','editor','viewer']);return{files:await musicFiles()}});
app.get('/api/music/file/:name',async(req,res)=>{requireRole(req,['admin','editor','viewer']);const abs=safeResolve(config.musicDir,decodeURIComponent(req.params.name));return res.sendFile(path.basename(abs))});
app.post('/api/music/upload',async(req,res)=>{requireRole(req,['admin']);const part=await req.file();if(!part)return res.code(400).send({error:'Datei fehlt'});const name=path.basename(String(part.filename||'')).replace(/[^\p{L}\p{N}._ -]/gu,'_').replace(/^\.+/,'').slice(0,180)||'audio';if(!config.allowedExtensions.has(path.extname(name).toLowerCase()))return res.code(400).send({error:'Dateiformat nicht erlaubt'});const temp=path.join(config.musicDir,`.upload-${randomToken(8)}`);const data=await part.toBuffer();await fs.writeFile(temp,data,{mode:0o640});try{const st=await fs.stat(temp);if(st.size>config.maxUploadBytes)throw new Error('Datei zu groß');const final=safeResolve(config.musicDir,name);await fs.rename(temp,final);return{ok:true,file:{name,size:st.size}}}catch(e){await fs.rm(temp,{force:true});return res.code(400).send({error:e.message})}});
app.delete('/api/music/:name',async(req,res)=>{requireRole(req,['admin']);try{await fs.unlink(safeResolve(config.musicDir,decodeURIComponent(req.params.name)));return{ok:true}}catch{return res.code(404).send({error:'Datei nicht gefunden'})}});
app.get('/api/search/youtube',async(req)=>{requireRole(req,['admin','editor','viewer']);const q=String(req.query?.q||'').trim();if(q.length<2||q.length>120)throw new Error('Ungültige Suche');return{results:await searchYoutube(q)}});
app.get('/api/search/radio',async(req)=>{requireRole(req,['admin','editor','viewer']);return{results:await searchRadio(String(req.query?.q||''))}});
app.get('/api/search/spotify',async(req)=>{requireRole(req,['admin','editor','viewer']);return{results:await searchSpotify(String(req.query?.q||''))}});
app.post('/api/player/play',async(req)=>{requireRole(req,['admin','editor']);const b=req.body||{};if(!b.url)throw new Error('URL oder Suchtext fehlt');return{current:await player.enqueue({source:b.source||'youtube',url:String(b.url),title:String(b.title||b.url)},Boolean(b.playNow))}});
app.post('/api/player/pause',async(req)=>{requireRole(req,['admin','editor']);player.pause();return{ok:true}});app.post('/api/player/resume',async(req)=>{requireRole(req,['admin','editor']);player.resume();return{ok:true}});app.post('/api/player/skip',async(req)=>{requireRole(req,['admin','editor']);await player.skip();return{ok:true}});app.post('/api/player/stop',async(req)=>{requireRole(req,['admin','editor']);player.stop();return{ok:true}});app.post('/api/player/clear',async(req)=>{requireRole(req,['admin','editor']);player.clear();return{ok:true}});app.post('/api/player/volume',async(req)=>{requireRole(req,['admin','editor']);player.setVolume(req.body?.percent);return{volume:player.volume}});
app.get('/api/playlists',async(req)=>{requireRole(req,['admin','editor','viewer']);return store.state.playlists});
app.post('/api/playlists',async(req)=>{requireRole(req,['admin','editor']);const name=String(req.body?.name||'').trim();if(!name||name.length>80)throw new Error('Ungültiger Name');const p={id:randomToken(8),name,tracks:[]};store.state.playlists.push(p);await store.save();return p});
app.post('/api/playlists/:id/tracks',async(req)=>{requireRole(req,['admin','editor']);const p=store.playlist(req.params.id);if(!p)return res404();if(p.tracks.length>=500)throw new Error('Playlist ist voll');p.tracks.push(req.body);await store.save();return p});
app.delete('/api/playlists/:id/tracks/:index',async(req)=>{requireRole(req,['admin','editor']);const p=store.playlist(req.params.id);const i=Number(req.params.index);if(!p||!Number.isInteger(i)||i<0||i>=p.tracks.length)throw new Error('Playlist oder Index ungültig');p.tracks.splice(i,1);await store.save();return p});
app.post('/api/playlists/:id/play',async(req)=>{requireRole(req,['admin','editor']);const p=store.playlist(req.params.id);if(!p)throw new Error('Playlist nicht gefunden');for(const t of p.tracks.slice(0,100))await player.enqueue(t);return{ok:true}});
app.delete('/api/playlists/:id',async(req)=>{requireRole(req,['admin','editor']);store.state.playlists=store.state.playlists.filter(x=>x.id!==req.params.id);await store.save();return{ok:true}});
app.post('/api/discord/connect',async(req)=>{requireRole(req,['admin']);const b=req.body||{};if(!b.id||!b.token||!b.guildId||!b.voiceChannelId)throw new Error('Discord-Konfiguration unvollständig');discordSaved.set(b.id,{...b});await discord.connect(b);store.state.discord=[...discordSaved.values()].map(x=>({...x,token:'stored'}));await store.save();return{ok:true,id:b.id}});app.post('/api/discord/disconnect',async(req)=>{requireRole(req,['admin']);await discord.disconnect(req.body?.id);return{ok:true}});
app.post('/api/ts3/connect',async(req)=>{requireRole(req,['admin']);const b=req.body||{};if(!b.id||!b.host)throw new Error('TS3-Konfiguration unvollständig');ts3Saved.set(b.id,{...b});await ts3.connect(b);const out={write(buf){ts3.write(b.id,buf)}};ts3.map.get(b.id)&&player.addOutput(out);store.state.ts3=[...ts3Saved.values()].map(x=>({...x,password:x.password?'stored':''}));await store.save();return{ok:true,id:b.id}});app.post('/api/ts3/disconnect',async(req)=>{requireRole(req,['admin']);await ts3.disconnect(req.body?.id);return{ok:true}});
function res404(){throw new Error('Nicht gefunden')}
app.setErrorHandler((e,req,res)=>res.code(e.statusCode||500).send({error:e.message||'Interner Fehler'}));
await app.listen({host:config.host,port:config.port});
console.log(`MusikBot187 4.0.0 listening on ${config.host}:${config.port}`);
