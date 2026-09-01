import crypto from 'node:crypto';
import fs from 'node:fs';
import fsp from 'node:fs/promises';
import path from 'node:path';
import {pipeline} from 'node:stream/promises';
import * as tar from 'tar';
import {SecretBox,permissions,validUsername} from './security.js';

const magic=Buffer.from('MB187BKP1','ascii'),saltBytes=16,ivBytes=12,tagBytes=16,headerBytes=magic.length+saltBytes+ivBytes;
const backupFormat='musikbot187-backup';

function validPassword(value){return typeof value==='string'&&value.length>=10&&value.length<=256;}
function derive(password,salt){return crypto.scryptSync(password,salt,32,{N:16384,r:8,p:1});}
function within(parent,child){const relative=path.relative(path.resolve(parent),path.resolve(child));return Boolean(relative)&&!relative.startsWith('..')&&!path.isAbsolute(relative);}
function jsonClone(value){return JSON.parse(JSON.stringify(value));}

function backupState(store,secretKey){
  const data=store.data;
  return {
    format:backupFormat,
    version:1,
    createdAt:new Date().toISOString(),
    secretKey,
    data:{
      version:data.version,
      users:jsonClone(data.users.slice(1)),
      playlists:jsonClone(data.playlists),
      connections:jsonClone(data.connections),
      settings:jsonClone(data.settings),
      listeningProfile:jsonClone(data.listeningProfile),
      networkHistory:jsonClone(data.networkHistory),
      networkTracker:jsonClone(data.networkTracker),
      resourceHistory:jsonClone(data.resourceHistory),
      diagnostics:jsonClone(data.diagnostics),
      notifications:jsonClone(data.notifications)
    }
  };
}

async function encryptFile(source,target,password){
  const salt=crypto.randomBytes(saltBytes),iv=crypto.randomBytes(ivBytes),header=Buffer.concat([magic,salt,iv]),cipher=crypto.createCipheriv('aes-256-gcm',derive(password,salt),iv);
  cipher.setAAD(header);
  await fsp.writeFile(target,header,{mode:0o600});
  await pipeline(fs.createReadStream(source),cipher,fs.createWriteStream(target,{flags:'a',mode:0o600}));
  await fsp.appendFile(target,cipher.getAuthTag());
}

async function decryptFile(source,target,password){
  const stat=await fsp.stat(source);if(stat.size<headerBytes+tagBytes+1)throw new Error('Die Backup-Datei ist unvollständig.');
  const handle=await fsp.open(source,'r');let header,tag;try{header=Buffer.alloc(headerBytes);tag=Buffer.alloc(tagBytes);await handle.read(header,0,header.length,0);await handle.read(tag,0,tag.length,stat.size-tagBytes);}finally{await handle.close();}
  if(!header.subarray(0,magic.length).equals(magic))throw new Error('Dies ist keine MusikBot187-Backup-Datei.');
  const salt=header.subarray(magic.length,magic.length+saltBytes),iv=header.subarray(magic.length+saltBytes),decipher=crypto.createDecipheriv('aes-256-gcm',derive(password,salt),iv);decipher.setAAD(header);decipher.setAuthTag(tag);
  try{await pipeline(fs.createReadStream(source,{start:headerBytes,end:stat.size-tagBytes-1}),decipher,fs.createWriteStream(target,{mode:0o600}));}catch{await fsp.rm(target,{force:true});throw new Error('Backup-Passwort falsch oder Backup-Datei beschädigt.');}
}

export async function createBackupFile({store,dataDir,musicDir,secretKey,password}){
  if(!validPassword(password))throw new Error('Das Backup-Passwort muss 10–256 Zeichen lang sein.');
  if(!within(dataDir,musicDir))throw new Error('Musikverzeichnis liegt außerhalb des Datenverzeichnisses.');
  const work=await fsp.mkdtemp(path.join(dataDir,'.backup-')),manifestName='manifest.json',manifestPath=path.join(work,manifestName),archivePath=path.join(work,'payload.tar.gz'),outputPath=path.join(work,'MusikBot187-Backup.mb187');
  try{
    await fsp.writeFile(manifestPath,JSON.stringify(backupState(store,secretKey)),{mode:0o600});
    const musicRelative=path.relative(dataDir,musicDir).replaceAll('\\','/'),manifestRelative=path.relative(dataDir,manifestPath).replaceAll('\\','/');
    await tar.c({gzip:true,file:archivePath,cwd:dataDir,portable:true,noMtime:true},[manifestRelative,musicRelative]);
    await encryptFile(archivePath,outputPath,password);
    await fsp.rm(archivePath,{force:true});
    await fsp.rm(manifestPath,{force:true});
    return {path:outputPath,work};
  }catch(error){await fsp.rm(work,{recursive:true,force:true});throw error;}
}

function reseal(value,sourceSecrets,targetSecrets){if(!value)return '';return targetSecrets.seal(sourceSecrets.open(value));}
function normalizeRestoredData(manifest,owner,currentSessions,currentSettings,currentProfile,targetSecrets){
  if(manifest?.format!==backupFormat||manifest?.version!==1||!manifest.data||!/^[0-9a-f]{64}$/i.test(String(manifest.secretKey||'')))throw new Error('Backup-Format wird nicht unterstützt.');
  const sourceSecrets=SecretBox.fromHex(manifest.secretKey),input=manifest.data,seenNames=new Set([String(owner.username).toLocaleLowerCase('de-DE')]),seenIds=new Set([owner.id]),users=[];
  for(const candidate of (Array.isArray(input.users)?input.users:[]).slice(0,200)){const user=jsonClone(candidate),id=String(user.id||''),username=String(user.username||''),name=username.toLocaleLowerCase('de-DE'),passwordHash=String(user.passwordHash||'');if(!/^[A-Za-z0-9-]{1,100}$/.test(id)||!validUsername(username)||!/^scrypt\$16384\$[0-9a-f]{32}\$[0-9a-f]{128}$/i.test(passwordHash)||seenNames.has(name)||seenIds.has(id))continue;seenNames.add(name);seenIds.add(id);users.push({id,username,passwordHash,role:user.role==='admin'?'admin':'user',permissions:(Array.isArray(user.permissions)?user.permissions:[]).filter(value=>permissions.includes(value)),mustChangePassword:Boolean(user.mustChangePassword)});}
  const settings={...jsonClone(currentSettings||{}),...jsonClone(input.settings||{})};for(const field of ['spotifySecret','spotifyAccessToken','spotifyRefreshToken'])settings[field]=reseal(settings[field],sourceSecrets,targetSecrets);settings.setupCompleted=false;
  const typeCounts={discord:0,ts3:0},connectionIds=new Set(),connections=[];for(const raw of Array.isArray(input.connections)?input.connections:[]){const connection=jsonClone(raw),type=String(connection.type||''),id=String(connection.id||'');if(!Object.hasOwn(typeCounts,type)||typeCounts[type]>=2||id==='local'||!/^[A-Za-z0-9-]{1,100}$/.test(id)||connectionIds.has(id))continue;typeCounts[type]++;connectionIds.add(id);connections.push({...connection,id,type,name:String(connection.name||type).slice(0,80),secret:reseal(connection.secret,sourceSecrets,targetSecrets)});}
  for(const connection of connections){const mirror=String(connection.mirrorPlayerId||''),source=connections.find(item=>item.id===mirror);connection.mirrorPlayerId=mirror&&(mirror==='local'||mirror!==connection.id&&source&&!source.mirrorPlayerId)?mirror:'';}if(!connections.some(connection=>connection.id===settings.outputId&&connection.type===settings.output)){settings.output='none';settings.outputId=null;}
  const playlists=(Array.isArray(input.playlists)?jsonClone(input.playlists):[]).slice(0,500).map(playlist=>({...playlist,items:(Array.isArray(playlist.items)?playlist.items:[]).slice(0,500)}));
  const profile={...jsonClone(currentProfile||{}),...jsonClone(input.listeningProfile||{}),version:2,tracks:(Array.isArray(input.listeningProfile?.tracks)?input.listeningProfile.tracks:[]).slice(-200),preferredStyles:(Array.isArray(input.listeningProfile?.preferredStyles)?input.listeningProfile.preferredStyles:[]).slice(0,20),blockedStyles:(Array.isArray(input.listeningProfile?.blockedStyles)?input.listeningProfile.blockedStyles:[]).slice(0,20)};
  return {
    version:Number(input.version)||2,
    users:[owner,...users],sessions:currentSessions.filter(session=>session.userId===owner.id),
    playlists,connections,settings,listeningProfile:profile,
    networkHistory:Array.isArray(input.networkHistory)?jsonClone(input.networkHistory).slice(-400):[],networkTracker:jsonClone(input.networkTracker||{rx:null,tx:null,sampledAt:null}),resourceHistory:Array.isArray(input.resourceHistory)?jsonClone(input.resourceHistory).slice(-2016):[],
    playbackResume:null,diagnostics:Array.isArray(input.diagnostics)?jsonClone(input.diagnostics).slice(-100):[],notifications:Array.isArray(input.notifications)?jsonClone(input.notifications).slice(-200):[]
  };
}

export async function restoreBackupFile({inputPath,password,store,dataDir,musicDir,targetSecrets,maxBytes=11*1024**3}){
  if(!validPassword(password))throw new Error('Das Backup-Passwort muss 10–256 Zeichen lang sein.');
  if(store.data.users.length!==1||store.data.settings.setupCompleted)throw new Error('Ein Backup kann nur während der neuen Ersteinrichtung eingespielt werden.');
  if(!within(dataDir,musicDir))throw new Error('Musikverzeichnis liegt außerhalb des Datenverzeichnisses.');
  const work=await fsp.mkdtemp(path.join(dataDir,'.restore-')),archivePath=path.join(work,'payload.tar.gz'),extractDir=path.join(work,'contents');
  try{
    await fsp.mkdir(extractDir,{recursive:true});await decryptFile(inputPath,archivePath,password);
    let total=0,count=0,manifestEntry='',musicRoot='';
    await tar.t({file:archivePath,onentry:entry=>{const name=String(entry.path||'').replaceAll('\\','/'),parts=name.split('/').filter(Boolean),size=Number(entry.size)||0;if(name.startsWith('/')||parts.includes('..')||entry.type==='SymbolicLink'||entry.type==='Link')throw new Error('Backup enthält einen unzulässigen Pfad.');total+=size;count++;if(parts.at(-1)==='manifest.json'){if(size>64*1024*1024)throw new Error('Backup-Inhaltsverzeichnis ist zu groß.');manifestEntry=name;}if(parts.includes('music')&&!musicRoot)musicRoot=parts.slice(0,parts.indexOf('music')+1).join('/');if(total>maxBytes||count>20000)throw new Error('Backup überschreitet die erlaubte Größe.');}});
    if(!manifestEntry)throw new Error('Backup-Inhaltsverzeichnis fehlt.');
    await tar.x({file:archivePath,cwd:extractDir,strict:true,preservePaths:false});
    const manifest=JSON.parse(await fsp.readFile(path.join(extractDir,...manifestEntry.split('/')),'utf8')),owner=store.data.users[0],sessions=store.data.sessions,newData=normalizeRestoredData(manifest,owner,sessions,store.data.settings,store.data.listeningProfile,targetSecrets);
    if(musicRoot){const restoredMusic=path.join(extractDir,...musicRoot.split('/'));await fsp.rm(musicDir,{recursive:true,force:true});await fsp.mkdir(path.dirname(musicDir),{recursive:true});await fsp.cp(restoredMusic,musicDir,{recursive:true,errorOnExist:false});}else await fsp.mkdir(musicDir,{recursive:true});
    const settingsReference=store.data.settings,profileReference=store.data.listeningProfile;for(const key of Object.keys(settingsReference))delete settingsReference[key];Object.assign(settingsReference,newData.settings);for(const key of Object.keys(profileReference))delete profileReference[key];Object.assign(profileReference,newData.listeningProfile);store.data={...newData,settings:settingsReference,listeningProfile:profileReference};store.cleanup();await store.save();
    return {users:newData.users.length-1,playlists:newData.playlists.length,connections:newData.connections.length,filesIncluded:Boolean(musicRoot)};
  }finally{await fsp.rm(work,{recursive:true,force:true});await fsp.rm(inputPath,{force:true});}
}

export async function removeBackupWork(result){if(result?.work)await fsp.rm(result.work,{recursive:true,force:true});}

export async function cleanupBackupWork(dataDir){
  const entries=await fsp.readdir(dataDir,{withFileTypes:true}).catch(()=>[]);
  for(const entry of entries)if(/^\.(?:backup-|restore-|backup-upload-)/.test(entry.name)){const target=path.resolve(dataDir,entry.name);if(path.dirname(target)===path.resolve(dataDir))await fsp.rm(target,{recursive:true,force:true});}
}
