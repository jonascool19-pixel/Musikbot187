import Fastify, { type FastifyReply, type FastifyRequest } from "fastify";
import cors from "@fastify/cors";
import fastifyStatic from "@fastify/static";
import { mkdir, readdir } from "node:fs/promises";
import path from "node:path";
import { randomUUID, scryptSync } from "node:crypto";
import { FRONTEND_DIR, HOST, PORT } from "./config.js";
import { db, loadState, saveState, createAdmin, login, currentUser, publicDiscord, publicTS3 } from "./store.js";
import { recordDiagnostic } from "./logger.js";
import { youtubeSearch, radioSearch, spotifySearch } from "./media.js";
import { Player } from "./player.js";
import { DiscordManager } from "./discord.js";
import { TS3Manager } from "./ts3.js";
import { networkInfo, systemInfo } from "./system.js";
import type { DashboardTile, DiscordInstance, MediaItem, PlaybackMode, Role, TS3Instance } from "./types.js";

const app = Fastify({ logger: true });
const discord = new DiscordManager();
const ts3 = new TS3Manager();
await loadState();
const player = new Player(db());
player.on("diagnostic", (message: string) => recordDiagnostic(db(), message));
player.on("audio", (data: Buffer) => {
  const settings = db().settings;
  if (settings.activeOutputType === "discord") discord.writeAudio(data, settings.activeInstanceId);
  if (settings.activeOutputType === "ts3") ts3.writeAudio(data, settings.activeInstanceId);
});
await app.register(cors, { origin: true });
await app.register(fastifyStatic, { root: FRONTEND_DIR, prefix: "/" });
function userOf(request: FastifyRequest) { return currentUser(request.headers.authorization); }
function requireUser(request: FastifyRequest, reply: FastifyReply) { const user = userOf(request); if (!user) { void reply.code(401).send({ error: "Nicht angemeldet" }); return null; } return user; }
function requireAdmin(request: FastifyRequest, reply: FastifyReply) { const user = requireUser(request, reply); if (!user) return null; if (user.role !== "admin") { void reply.code(403).send({ error: "Administratorrechte erforderlich" }); return null; } return user; }

app.get("/api/health", async () => ({ ok: true, name: "Musikbot 187", version: "1.0.0" }));
app.get("/api/setup", async () => ({ initialized: db().users.length > 0 }));
app.post("/api/setup", async (request: FastifyRequest, reply: FastifyReply) => { if (db().users.length) return reply.code(409).send({ error: "Bereits eingerichtet" }); const body=(request.body||{}) as {name?:string;password?:string}; if(!body.name||!body.password||body.password.length<10)return reply.code(400).send({error:"Benutzername und Passwort mit mindestens 10 Zeichen erforderlich"}); createAdmin(body.name,body.password); await saveState(); return login(body.name,body.password); });
app.post("/api/login", async (request: FastifyRequest, reply: FastifyReply) => { const body=(request.body||{}) as {name?:string;password?:string}; const session=login(body.name||"",body.password||""); return session||reply.code(401).send({error:"Ungültige Anmeldung"}); });
app.get("/api/me", async (request,reply)=>{const user=requireUser(request,reply);return user?{id:user.id,name:user.name,role:user.role}:undefined;});
app.get("/api/state", async (request,reply)=>{if(!requireUser(request,reply))return;return{...player.snapshot(),settings:db().settings,dashboard:db().dashboard,discord:publicDiscord(),ts3:publicTS3()};});

app.get("/api/search", async (request,reply)=>{if(!requireUser(request,reply))return;const query=String((request.query as {q?:string}).q||"").trim();const source=String((request.query as {source?:string}).source||"all");if(!query)return{youtube:[],radio:[],spotify:[]};const result:{youtube:MediaItem[];radio:MediaItem[];spotify:MediaItem[]}={youtube:[],radio:[],spotify:[]};await Promise.allSettled([(source==="all"||source==="youtube")?youtubeSearch(query).then(items=>{result.youtube=items;}):Promise.resolve(),(source==="all"||source==="radio")?radioSearch(query).then(items=>{result.radio=items;}):Promise.resolve(),(source==="all"||source==="spotify")?spotifySearch(query,db().integration).then(items=>{result.spotify=items;}):Promise.resolve()]);return result;});
app.post("/api/play",async(request,reply)=>{if(!requireUser(request,reply))return;const body=(request.body||{}) as {items?:MediaItem[]};await player.enqueue(body.items||[]);return player.snapshot();});
app.post("/api/play/:action",async(request,reply)=>{if(!requireUser(request,reply))return;const {action}=request.params as {action:string};const body=(request.body||{}) as {value?:number;mode?:PlaybackMode};if(action==="pause")player.pause();else if(action==="resume")player.resume();else if(action==="stop")player.stop();else if(action==="skip")player.skip();else if(action==="volume"){player.setVolume(Number(body.value));await saveState();}else if(action==="mode"&&body.mode&&["queue","repeat","shuffle"].includes(body.mode)){player.setMode(body.mode);await saveState();}else if(action==="clear")player.clearQueue();return player.snapshot();});
app.delete("/api/queue/:index",async(request,reply)=>{if(!requireUser(request,reply))return;await player.removeQueue(Number((request.params as {index:string}).index));return player.snapshot();});

app.get("/api/playlists",async(request,reply)=>{if(!requireUser(request,reply))return;return db().playlists;});
app.post("/api/playlists",async(request,reply)=>{if(!requireUser(request,reply))return;const body=(request.body||{}) as {name?:string};const playlist={id:randomUUID(),name:String(body.name||"Neue Playlist"),items:[] as MediaItem[]};db().playlists.push(playlist);await saveState();return playlist;});
app.get("/api/playlists/:id",async(request,reply)=>{if(!requireUser(request,reply))return;return db().playlists.find(p=>p.id===(request.params as {id:string}).id)||reply.code(404).send({error:"Playlist nicht gefunden"});});
app.post("/api/playlists/:id/items",async(request,reply)=>{if(!requireUser(request,reply))return;const playlist=db().playlists.find(p=>p.id===(request.params as {id:string}).id);if(!playlist)return reply.code(404).send({error:"Playlist nicht gefunden"});const body=(request.body||{}) as {items?:MediaItem[]};playlist.items.push(...(body.items||[]));await saveState();return playlist;});
app.post("/api/playlists/:id/play",async(request,reply)=>{if(!requireUser(request,reply))return;const playlist=db().playlists.find(p=>p.id===(request.params as {id:string}).id);if(!playlist)return reply.code(404).send({error:"Playlist nicht gefunden"});await player.enqueue(playlist.items);return player.snapshot();});
app.delete("/api/playlists/:id/items/:itemId",async(request,reply)=>{if(!requireUser(request,reply))return;const p=request.params as {id:string;itemId:string};const playlist=db().playlists.find(x=>x.id===p.id);if(!playlist)return reply.code(404).send({error:"Playlist nicht gefunden"});playlist.items=playlist.items.filter(item=>item.id!==p.itemId);await saveState();return playlist;});

app.get("/api/dashboard",async(request,reply)=>{if(!requireUser(request,reply))return;return{tiles:db().dashboard};});
app.put("/api/dashboard",async(request,reply)=>{if(!requireAdmin(request,reply))return;const body=(request.body||{}) as {tiles?:DashboardTile[]};if(!Array.isArray(body.tiles))return reply.code(400).send({error:"tiles erforderlich"});const byId=new Map(db().dashboard.map(tile=>[tile.id,tile]));const requested=body.tiles.map(tile=>byId.get(tile.id)).filter(Boolean) as DashboardTile[];const missing=db().dashboard.filter(tile=>!requested.some(item=>item.id===tile.id));db().dashboard=[...requested,...missing];await saveState();return{tiles:db().dashboard};});

app.get("/api/system",async(request,reply)=>{if(!requireUser(request,reply))return;return systemInfo();});
app.get("/api/network",async(request,reply)=>{if(!requireUser(request,reply))return;return networkInfo(db().settings.networkInterface);});
app.get("/api/files",async(request,reply)=>{if(!requireUser(request,reply))return;const dir=path.resolve(db().settings.filesDirectory);await mkdir(dir,{recursive:true});const entries=await readdir(dir,{withFileTypes:true}) as unknown as Array<{name:string;isDirectory():boolean}>;return entries.map(entry=>({name:entry.name,directory:entry.isDirectory(),path:path.join(dir,entry.name)}));});

app.put("/api/settings",async(request,reply)=>{if(!requireAdmin(request,reply))return;const input=(request.body||{}) as Record<string,unknown>;if(typeof input.volume==="number")player.setVolume(input.volume);if(input.mode==="queue"||input.mode==="repeat"||input.mode==="shuffle")player.setMode(input.mode);if(typeof input.activeOutputType==="string"&&["discord","ts3","none"].includes(input.activeOutputType))db().settings.activeOutputType=input.activeOutputType as "discord"|"ts3"|"none";if(typeof input.activeInstanceId==="string")db().settings.activeInstanceId=input.activeInstanceId;if(typeof input.networkInterface==="string")db().settings.networkInterface=input.networkInterface;if(typeof input.filesDirectory==="string")db().settings.filesDirectory=input.filesDirectory;await saveState();return{settings:db().settings};});
app.get("/api/integration",async(request,reply)=>{if(!requireAdmin(request,reply))return;return{spotifyConfigured:Boolean(db().integration.spotifyClientId&&db().integration.spotifyClientSecret)};});
app.put("/api/integration/spotify",async(request,reply)=>{if(!requireAdmin(request,reply))return;const body=(request.body||{}) as {clientId?:string;clientSecret?:string};db().integration.spotifyClientId=String(body.clientId||"");db().integration.spotifyClientSecret=String(body.clientSecret||"");await saveState();return{spotifyConfigured:Boolean(db().integration.spotifyClientId&&db().integration.spotifyClientSecret)};});

app.get("/api/users",async(request,reply)=>{if(!requireAdmin(request,reply))return;return db().users.map(({id,name,role})=>({id,name,role}));});
app.post("/api/users",async(request,reply)=>{if(!requireAdmin(request,reply))return;const body=(request.body||{}) as {name?:string;password?:string;role?:Role};if(!body.name||!body.password||body.password.length<10)return reply.code(400).send({error:"Benutzername und Passwort mit mindestens 10 Zeichen erforderlich"});if(db().users.some(x=>x.name===body.name))return reply.code(409).send({error:"Benutzer existiert bereits"});db().users.push({id:randomUUID(),name:body.name,passwordHash:scryptSync(body.password,"musikbot-187",32).toString("hex"),role:body.role==="user"?"user":"admin"});await saveState();return{ok:true};});
app.get("/api/diagnostics",async(request,reply)=>{if(!requireAdmin(request,reply))return;return db().diagnostics;});

app.get("/api/discord",async(request,reply)=>{if(!requireUser(request,reply))return;return publicDiscord();});
app.post("/api/discord",async(request,reply)=>{if(!requireAdmin(request,reply))return;const body=request.body as Partial<DiscordInstance>;const instance:DiscordInstance={id:body.id||randomUUID(),name:String(body.name||"Discord"),token:String(body.token||""),clientId:String(body.clientId||""),guildId:String(body.guildId||""),channelId:String(body.channelId||""),prefix:String(body.prefix||"!")};const existing=db().discord.findIndex(entry=>entry.id===instance.id);if(existing>=0)db().discord[existing]={...db().discord[existing],...instance};else db().discord.push(instance);await saveState();return publicDiscord();});
app.post("/api/discord/:id/connect",async(request,reply)=>{if(!requireAdmin(request,reply))return;const instance=db().discord.find(entry=>entry.id===(request.params as {id:string}).id);if(!instance)return reply.code(404).send({error:"Discord-Instanz nicht gefunden"});try{await discord.connect(instance);return discord.status();}catch(error){recordDiagnostic(db(),`Discord: ${error instanceof Error?error.message:String(error)}`);return reply.code(400).send({error:"Discord-Verbindung fehlgeschlagen"});}});
app.post("/api/discord/:id/disconnect",async(request,reply)=>{if(!requireAdmin(request,reply))return;await discord.disconnect((request.params as {id:string}).id);return discord.status();});
app.post("/api/discord/:id/join",async(request,reply)=>{if(!requireAdmin(request,reply))return;try{await discord.join((request.params as {id:string}).id);return discord.status();}catch(error){return reply.code(400).send({error:error instanceof Error?error.message:String(error)});}});
app.get("/api/discord/:id/guilds",async(request,reply)=>{if(!requireAdmin(request,reply))return;return discord.guilds((request.params as {id:string}).id);});
app.get("/api/discord/:id/guilds/:guildId/channels",async(request,reply)=>{if(!requireAdmin(request,reply))return;const p=request.params as {id:string;guildId:string};return discord.channels(p.id,p.guildId);});

app.get("/api/ts3",async(request,reply)=>{if(!requireUser(request,reply))return;return publicTS3();});
app.put("/api/ts3",async(request,reply)=>{if(!requireAdmin(request,reply))return;db().ts3=(request.body as {instances?:TS3Instance[]}).instances||[];await saveState();return publicTS3();});
app.post("/api/ts3/:id/connect",async(request,reply)=>{if(!requireAdmin(request,reply))return;const instance=db().ts3.find(entry=>entry.id===(request.params as {id:string}).id);if(!instance)return reply.code(404).send({error:"TS3-Instanz nicht gefunden"});try{await ts3.connect(instance);return publicTS3();}catch(error){recordDiagnostic(db(),`TS3: ${error instanceof Error?error.message:String(error)}`);return reply.code(400).send({error:"TS3-Verbindung fehlgeschlagen"});}});
app.post("/api/ts3/:id/disconnect",async(request,reply)=>{if(!requireAdmin(request,reply))return;await ts3.disconnect((request.params as {id:string}).id);return publicTS3();});
app.put("/api/active-instance",async(request,reply)=>{if(!requireUser(request,reply))return;const body=request.body as {type?:"discord"|"ts3"|"none";id?:string};if(!body.type||!["discord","ts3","none"].includes(body.type))return reply.code(400).send({error:"Ungültiger Ausgabetyp"});db().settings.activeOutputType=body.type;db().settings.activeInstanceId=String(body.id||"");await saveState();return db().settings;});
app.get("/",async(_request,reply)=>reply.sendFile("index.html"));
app.setErrorHandler((error,_request,reply)=>{recordDiagnostic(db(),error.message);void reply.code(500).send({error:"Interner Fehler",detail:error.message});});
await app.listen({host:HOST,port:PORT});
console.log(`Musikbot 187 läuft auf ${HOST}:${PORT}`);
