import fs from 'node:fs/promises';
import crypto from 'node:crypto';
import {permissions, randomToken} from './security.js';

const blank=()=>({version:1,users:[],sessions:[],playlists:[],connections:[],settings:{theme:'dark',accent:'#7c3aed',output:'none',outputId:null,spotifyClientId:'',spotifySecret:'',marqueeSpeed:45,marqueeTextColor:'#eef2ff',marqueeBackground:'#171e2d'},diagnostics:[]});
export class Store {
  constructor(file){this.file=file;this.data=blank();this.pending=Promise.resolve();}
  async load(){await fs.mkdir(new URL('.',`file:///${this.file.replaceAll('\\','/')}`),{recursive:true}).catch(()=>{});try{const defaults=blank(),saved=JSON.parse(await fs.readFile(this.file,'utf8'));this.data={...defaults,...saved,settings:{...defaults.settings,...(saved.settings||{})}};}catch(e){if(e.code!=='ENOENT')throw e;}this.cleanup();return this;}
  save(){this.pending=this.pending.then(async()=>{const tmp=`${this.file}.${process.pid}.tmp`;await fs.mkdir((await import('node:path')).dirname(this.file),{recursive:true});await fs.writeFile(tmp,JSON.stringify(this.data,null,2),{mode:0o600});await fs.rename(tmp,this.file);});return this.pending;}
  cleanup(){const now=Date.now();this.data.sessions=this.data.sessions.filter(s=>s.expires>now);this.data.diagnostics=this.data.diagnostics.slice(-100);}
  diagnostic(level,source,message){this.data.diagnostics.push({time:new Date().toISOString(),level,source,message:String(message).slice(0,1000)});this.data.diagnostics=this.data.diagnostics.slice(-100);return this.save();}
  publicUser(user){return {id:user.id,username:user.username,role:user.role,permissions:user.role==='admin'?permissions:[...(user.permissions||[])],isOwner:this.data.users[0]?.id===user.id};}
  createSession(user,ttl,max){this.cleanup();const sessions=this.data.sessions.filter(s=>s.userId===user.id).sort((a,b)=>b.created-a);for(const old of sessions.slice(max-1))this.data.sessions=this.data.sessions.filter(s=>s.tokenHash!==old.tokenHash);const token=randomToken();this.data.sessions.push({tokenHash:crypto.createHash('sha256').update(token).digest('hex'),userId:user.id,created:Date.now(),expires:Date.now()+ttl});return token;}
  auth(token){if(!token)return null;this.cleanup();const hash=crypto.createHash('sha256').update(token).digest('hex');const session=this.data.sessions.find(s=>s.tokenHash===hash);return session?this.data.users.find(u=>u.id===session.userId)||null:null;}
  revoke(token){const hash=crypto.createHash('sha256').update(token||'').digest('hex');this.data.sessions=this.data.sessions.filter(s=>s.tokenHash!==hash);}
  redact(){return {...this.data,users:this.data.users.map(u=>this.publicUser(u)),sessions:undefined,connections:this.data.connections.map(({secret,...c})=>({...c,hasSecret:Boolean(secret)})),settings:{...this.data.settings,spotifySecret:undefined,hasSpotifySecret:Boolean(this.data.settings.spotifySecret)}};}
}
