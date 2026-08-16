import {mkdir,readFile,writeFile} from "node:fs/promises";
import {randomUUID,scryptSync,timingSafeEqual} from "node:crypto";
import {dataFile,ROOT} from "./config.js";
export type User={id:string,name:string,passwordHash:string,role:"admin"|"user"};
export type Playlist={id:string,name:string,items:MediaItem[]};
export type MediaItem={id:string,title:string,url:string,duration?:number,source?:string,thumbnail?:string};
export type State={users:User[],playlists:Playlist[],settings:Record<string,any>,dashboard:string[],discord:any[],ts3:any[],sessions:Record<string,string>};
const initial:State={users:[],playlists:[],settings:{volume:80,mode:"queue",activeInstance:"default"},dashboard:["now-playing","queue","search","radio","playlists","system","network","instances"],discord:[],ts3:[],sessions:{}};
let state:State=structuredClone(initial);
export async function load(){await mkdir(ROOT,{recursive:true});try{state=JSON.parse(await readFile(dataFile("state.json"),"utf8"))}catch{await save()}return state}
let timer:any;export async function save(){clearTimeout(timer);timer=setTimeout(()=>writeFile(dataFile("state.json"),JSON.stringify(state,null,2)),20)}
export const db=()=>state;
export async function ensureAdmin(name:string,password:string){if(state.users.length)return;state.users.push({id:randomUUID(),name,passwordHash:hash(password),role:"admin"});await save()}
function hash(p:string){return scryptSync(p,"radiobot",32).toString("hex")}
export function checkPassword(u:User,p:string){const a=Buffer.from(u.passwordHash,"hex"),b=Buffer.from(hash(p),"hex");return a.length===b.length&&timingSafeEqual(a,b)}
export function login(name:string,password:string){const u=state.users.find(x=>x.name===name);if(!u||!checkPassword(u,password))return null;const token=randomUUID();state.sessions[token]=u.id;void save();return {token,user:{id:u.id,name:u.name,role:u.role}}}
export function auth(token:string|undefined){const id=token?state.sessions[token]:undefined;return state.users.find(u=>u.id===id)||null}