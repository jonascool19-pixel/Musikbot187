import crypto from 'node:crypto';
import dns from 'node:dns/promises';
import net from 'node:net';
import path from 'node:path';
export const sha256=v=>crypto.createHash('sha256').update(v).digest('hex');
export const timingEqual=(a,b)=>{const aa=Buffer.from(String(a)),bb=Buffer.from(String(b));return aa.length===bb.length&&crypto.timingSafeEqual(aa,bb)};
export const randomToken=(bytes=32)=>crypto.randomBytes(bytes).toString('base64url');
export async function hashPassword(password){const salt=crypto.randomBytes(16),N=16384,r=8,p=1,hash=await new Promise((res,rej)=>crypto.scrypt(password,salt,64,{N,r,p,maxmem:128*1024*1024},(e,d)=>e?rej(e):res(d)));return `scrypt$${N}$${r}$${p}$${salt.toString('base64')}$${Buffer.from(hash).toString('base64')}`}
export async function verifyPassword(password,encoded){const parts=String(encoded).split('$');if(parts.length!==6||parts[0]!=='scrypt')return false;const [,N,r,p,saltB64,hashB64]=parts,salt=Buffer.from(saltB64,'base64'),expected=Buffer.from(hashB64,'base64');const actual=await new Promise((res,rej)=>crypto.scrypt(password,salt,expected.length,{N:Number(N),r:Number(r),p:Number(p),maxmem:128*1024*1024},(e,d)=>e?rej(e):res(d)));return crypto.timingSafeEqual(expected,actual)}
export const validateUsername=v=>/^[a-zA-Z0-9_.-]{3,40}$/.test(String(v||''));
export const validateHex=v=>/^#[0-9a-fA-F]{6}$/.test(String(v||''));
export const sanitizeFileName=name=>(String(name||'').replace(/[/\\]/g,'_').replace(/[^\p{L}\p{N}._ -]/gu,'_').replace(/^\.+/,'').trim()||'audio').slice(0,180);
export function safeResolve(root,candidate){const rr=path.resolve(root),cc=path.resolve(root,candidate);if(cc!==rr&&!cc.startsWith(rr+path.sep))throw new Error('Pfad außerhalb des Musikverzeichnisses');return cc}
export async function assertSafeExternalUrl(rawUrl){const u=new URL(rawUrl);if(!['http:','https:'].includes(u.protocol))throw new Error('Nur HTTP(S) erlaubt');const hostname=u.hostname.toLowerCase();if(['localhost','localhost.localdomain'].includes(hostname))throw new Error('Lokales Ziel blockiert');if(net.isIP(hostname)){if(isPrivateIp(hostname))throw new Error('Privates Ziel blockiert');return u}const records=await dns.lookup(hostname,{all:true});if(!records.length)throw new Error('Ziel kann nicht aufgelöst werden');if(records.some(r=>isPrivateIp(r.address)))throw new Error('Privates Ziel blockiert');return u}
function isPrivateIp(ip){if(net.isIPv4(ip)){const[a,b]=ip.split('.').map(Number);return a===10||a===127||(a===169&&b===254)||(a===172&&b>=16&&b<=31)||(a===192&&b===168)||a===0}const s=ip.toLowerCase();return s==='::1'||s.startsWith('fc')||s.startsWith('fd')||s.startsWith('fe80:')}
