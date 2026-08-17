import {mkdir,readFile,writeFile} from 'node:fs/promises';
import path from 'node:path';
import {randomUUID,scryptSync,timingSafeEqual} from 'node:crypto';
const DATA_DIR=process.env.MUSIKBOT187_DATA_DIR||'/var/lib/musikbot187';
const DATA_FILE=path.join(DATA_DIR,'data.json');
let state=defaultState(); const sessions=new Map();
function defaultState(){return{settings:{volume:75,mode:'queue',outputType:'none',outputId:'',networkInterface:'',filesDirectory:'/var/lib/musikbot187/music',theme:'dark'},users:[],playlists:[],discord:[],ts3:[],diagnostics:[],dashboard:[{id:'player',title:'Player',enabled:true},{id:'queue',title:'Warteschlange',enabled:true},{id:'search',title:'Suche',enabled:true},{id:'connections',title:'Verbindungen',enabled:true}],integration:{spotifyClientId:'',spotifyClientSecret:''}};}
export async function load(){await mkdir(DATA_DIR,{recursive:true});try{state=JSON.parse(await readFile(DATA_FILE,'utf8'));}catch{state=defaultState();await save();}state.settings??=defaultState().settings;state.settings.filesDirectory||='/var/lib/musikbot187/music';await mkdir(state.settings.filesDirectory,{recursive:true});}
export async function save(){await mkdir(DATA_DIR,{recursive:true});await writeFile(DATA_FILE,JSON.stringify(state,null,2),'utf8');}
export const db=()=>state;
export function createAdmin(name,password){state.users.push({id:randomUUID(),name,role:'admin',hash:scryptSync(password,'musikbot187',32).toString('hex')});}
export function addUser(name,password,role='user'){state.users.push({id:randomUUID(),name,role,hash:scryptSync(password,'musikbot187',32).toString('hex')});}
export function login(name,password){const u=state.users.find(x=>x.name===name);if(!u)return null;const got=scryptSync(password,'musikbot187',32),expected=Buffer.from(u.hash,'hex');if(got.length!==expected.length||!timingSafeEqual(got,expected))return null;const token=Buffer.from(`${u.id}:${Date.now()}:${randomUUID()}`).toString('base64url');sessions.set(token,u.id);return{token,user:{id:u.id,name:u.name,role:u.role}};}
export function userFromToken(auth){if(!auth)return null;const token=auth.replace(/^Bearer\s+/i,'');const id=sessions.get(token);return id?state.users.find(x=>x.id===id)||null:null;}
export function setDiscord(x){const i=state.discord.findIndex(v=>v.id===x.id);if(i>=0)state.discord[i]=x;else state.discord.push(x);}
export function publicDiscord(){return state.discord.map(({token,...x})=>({...x,hasToken:Boolean(token)}));}
export function publicTS3(){return state.ts3.map(({password,...x})=>({...x,hasPassword:Boolean(password)}));}
export function publicState(){return{settings:state.settings,playlists:state.playlists,discord:publicDiscord(),ts3:publicTS3(),diagnostics:state.diagnostics,dashboard:state.dashboard,integration:{spotifyConfigured:Boolean(state.integration.spotifyClientId&&state.integration.spotifyClientSecret)}};}
