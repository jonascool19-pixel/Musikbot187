import crypto from 'node:crypto';
import dns from 'node:dns/promises';
import net from 'node:net';
import path from 'node:path';

export function timingEqual(a,b){const aa=Buffer.from(String(a));const bb=Buffer.from(String(b));return aa.length===bb.length&&crypto.timingSafeEqual(aa,bb)}
export function randomToken(bytes=32){return crypto.randomBytes(bytes).toString('base64url')}
export function hashPassword(password){const salt=crypto.randomBytes(16);const N=32768,r=8,p=1;return new Promise((resolve,reject)=>crypto.scrypt(String(password),salt,64,{N,r,p,maxmem:128*1024*1024},(e,d)=>e?reject(e):resolve(`scrypt$${N}$${r}$${p}$${salt.toString('base64')}$${Buffer.from(d).toString('base64')}`)))}
export function verifyPassword(password,encoded){const parts=String(encoded).split('$');if(parts.length!==6||parts[0]!=='scrypt')return Promise.resolve(false);const[,N,r,p,saltB64,hashB64]=parts,salt=Buffer.from(saltB64,'base64'),expected=Buffer.from(hashB64,'base64');return new Promise((resolve,reject)=>crypto.scrypt(String(password),salt,expected.length,{N:Number(N),r:Number(r),p:Number(p),maxmem:128*1024*1024},(e,d)=>{if(e)return reject(e);resolve(crypto.timingSafeEqual(expected,d))}))}
export const validateUsername=v=>/^[a-zA-Z0-9_.-]{3,40}$/.test(String(v||''));
export function safeResolve(root,candidate){const rr=path.resolve(root);const cc=path.resolve(root,String(candidate||''));if(cc!==rr&&!cc.startsWith(rr+path.sep))throw new Error('Pfad außerhalb des Musikverzeichnisses');return cc}
function privateIp(ip){if(net.isIPv4(ip)){const[a,b]=ip.split('.').map(Number);return a===10||a===127||a===0||(a===169&&b===254)||(a===172&&b>=16&&b<=31)||(a===192&&b===168)}const s=ip.toLowerCase();return s==='::1'||s.startsWith('fc')||s.startsWith('fd')||s.startsWith('fe80:')}
export async function assertSafeExternalUrl(raw){const u=new URL(raw);if(!['http:','https:'].includes(u.protocol))throw new Error('Nur HTTP(S)-URLs erlaubt');const host=u.hostname.toLowerCase();if(['localhost','localhost.localdomain'].includes(host))throw new Error('Lokales Ziel blockiert');if(net.isIP(host)){if(privateIp(host))throw new Error('Privates Ziel blockiert');return u}const answers=await dns.lookup(host,{all:true});if(!answers.length||answers.some(x=>privateIp(x.address)))throw new Error('Privates oder nicht auflösbares Ziel blockiert');return u}
export function sessionSign(payload,secret){const b=Buffer.from(JSON.stringify(payload)).toString('base64url');const mac=crypto.createHmac('sha256',secret).update(b).digest('base64url');return `${b}.${mac}`}
export function sessionRead(token,secret){const [b,mac]=String(token||'').split('.');if(!b||!mac)return null;const expected=crypto.createHmac('sha256',secret).update(b).digest('base64url');if(!timingEqual(mac,expected))return null;try{const payload=JSON.parse(Buffer.from(b,'base64url').toString('utf8'));if(payload.exp&&Date.now()>payload.exp)return null;return payload}catch{return null}}
