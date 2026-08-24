import fs from 'node:fs/promises';
import crypto from 'node:crypto';
import {permissions, randomToken} from './security.js';

const blank=()=>({version:2,users:[],sessions:[],playlists:[],connections:[],settings:{botName:'MusikBot187',theme:'dark',accent:'#7c3aed',output:'none',outputId:null,spotifyClientId:'',spotifySecret:'',spotifyRedirectUri:'',spotifyAccessToken:'',spotifyRefreshToken:'',spotifyAccessTokenExpiresAt:0,spotifyScopes:[],marqueeSpeed:45,marqueeTextColor:'#eef2ff',marqueeBackground:'#171e2d',autoplayEnabled:false,autoplayMode:'similar',autoplayPlaylistIds:[],autoplayQueueTarget:10,maintenanceEnabled:false,maintenanceTime:'04:30',maintenanceTimezone:'Europe/Berlin',maintenanceLastRun:''},listeningProfile:{version:1,tracks:[]},networkHistory:[],networkTracker:{rx:null,tx:null,sampledAt:null},playbackResume:null,diagnostics:[]});
export class Store {
  constructor(file){this.file=file;this.data=blank();this.pending=Promise.resolve();this.recovered=false;}
  async load(){
    await fs.mkdir(new URL('.',`file:///${this.file.replaceAll('\\','/')}`),{recursive:true}).catch(()=>{});
    let migrated=false,saved;
    try{saved=JSON.parse(await fs.readFile(this.file,'utf8'));}
    catch(primaryError){
      try{saved=JSON.parse(await fs.readFile(`${this.file}.bak`,'utf8'));this.recovered=true;migrated=true;}
      catch(backupError){if(primaryError.code==='ENOENT'&&backupError.code==='ENOENT'){this.cleanup();return this;}throw primaryError.code==='ENOENT'?backupError:primaryError;}
    }
    const defaults=blank(),savedProfile=saved.listeningProfile&&typeof saved.listeningProfile==='object'?saved.listeningProfile:{};
    this.data={...defaults,...saved,settings:{...defaults.settings,...(saved.settings||{})},listeningProfile:{version:1,...savedProfile,tracks:Array.isArray(savedProfile.tracks)?savedProfile.tracks.slice(-200):[]},networkHistory:Array.isArray(saved.networkHistory)?saved.networkHistory.slice(-400):[],networkTracker:{...defaults.networkTracker,...(saved.networkTracker||{})}};
    if(Number(saved.version||1)<2){this.data.version=2;if(Number(this.data.settings.autoplayQueueTarget)===5)this.data.settings.autoplayQueueTarget=10;migrated=true;}
    this.cleanup();if(migrated)await this.save();return this;
  }
  save(){const operation=this.pending.then(async()=>{const tmp=`${this.file}.${process.pid}.tmp`,backup=`${this.file}.bak`;await fs.mkdir((await import('node:path')).dirname(this.file),{recursive:true});await fs.writeFile(tmp,JSON.stringify(this.data,null,2),{mode:0o600});let rotated=false;if(this.recovered)await fs.rm(this.file,{force:true});else{await fs.rm(backup,{force:true});try{await fs.rename(this.file,backup);rotated=true;}catch(error){if(error.code!=='ENOENT')throw error;}}try{await fs.rename(tmp,this.file);}catch(error){if(rotated)await fs.rename(backup,this.file).catch(()=>{});throw error;}this.recovered=false;});this.pending=operation.catch(()=>{});return operation;}
  cleanup(){const now=Date.now();this.data.sessions=this.data.sessions.filter(s=>s.expires>now);this.data.diagnostics=this.data.diagnostics.slice(-100);}
  diagnostic(level,source,message){this.data.diagnostics.push({time:new Date().toISOString(),level,source,message:String(message).slice(0,1000)});this.data.diagnostics=this.data.diagnostics.slice(-100);return this.save();}
  publicUser(user){return {id:user.id,username:user.username,role:user.role,permissions:user.role==='admin'?permissions:[...(user.permissions||[])],isOwner:this.data.users[0]?.id===user.id};}
  createSession(user,ttl,max){this.cleanup();const sessions=this.data.sessions.filter(s=>s.userId===user.id).sort((a,b)=>b.created-a);for(const old of sessions.slice(max-1))this.data.sessions=this.data.sessions.filter(s=>s.tokenHash!==old.tokenHash);const token=randomToken();this.data.sessions.push({tokenHash:crypto.createHash('sha256').update(token).digest('hex'),userId:user.id,created:Date.now(),expires:Date.now()+ttl});return token;}
  auth(token){if(!token)return null;this.cleanup();const hash=crypto.createHash('sha256').update(token).digest('hex');const session=this.data.sessions.find(s=>s.tokenHash===hash);return session?this.data.users.find(u=>u.id===session.userId)||null:null;}
  revoke(token){const hash=crypto.createHash('sha256').update(token||'').digest('hex');this.data.sessions=this.data.sessions.filter(s=>s.tokenHash!==hash);}
  redact(){const settings={...this.data.settings,spotifySecret:undefined,spotifyAccessToken:undefined,spotifyRefreshToken:undefined,hasSpotifySecret:Boolean(this.data.settings.spotifySecret),spotifyUserConnected:Boolean(this.data.settings.spotifyRefreshToken)};return {...this.data,users:this.data.users.map(u=>this.publicUser(u)),sessions:undefined,connections:this.data.connections.map(({secret,...c})=>({...c,hasSecret:Boolean(secret)})),settings};}
}
