import crypto from 'node:crypto';
import dns from 'node:dns/promises';
import net from 'node:net';
import path from 'node:path';

export const permissions = Object.freeze(['player.control','playlists.manage','music.manage','connections.manage','settings.manage','design.manage','users.manage','diagnostics.view','system.manage']);
export const timingEqual = (a, b) => { const x=Buffer.from(String(a)); const y=Buffer.from(String(b)); return x.length===y.length && crypto.timingSafeEqual(x,y); };
export const randomToken = () => crypto.randomBytes(32).toString('base64url');
export const validUsername = value => /^[A-Za-z0-9_.-]{3,32}$/.test(String(value));
export const validPassword = value => typeof value === 'string' && value.length >= 10 && value.length <= 256;
export const validAccent = value => /^#[0-9a-fA-F]{6}$/.test(String(value));
export function hashPassword(password) {
  if (!validPassword(password)) throw new Error('Passwort muss 10–256 Zeichen lang sein.');
  const salt=crypto.randomBytes(16); const derived=crypto.scryptSync(password,salt,64,{N:16384,r:8,p:1});
  return `scrypt$16384$${salt.toString('hex')}$${derived.toString('hex')}`;
}
export function verifyPassword(password, encoded) {
  const [kind,n,salt,hash]=String(encoded).split('$'); if(kind!=='scrypt'||!salt||!hash) return false;
  const actual=crypto.scryptSync(password,Buffer.from(salt,'hex'),Buffer.from(hash,'hex').length,{N:Number(n),r:8,p:1});
  return crypto.timingSafeEqual(actual,Buffer.from(hash,'hex'));
}
export class SecretBox {
  constructor(key){ this.key=key; }
  static fromHex(value){ if(!/^[0-9a-f]{64}$/i.test(value)) throw new Error('Ungültiger Secret-Key'); return new SecretBox(Buffer.from(value,'hex')); }
  seal(value){ if(!value) return ''; const iv=crypto.randomBytes(12); const cipher=crypto.createCipheriv('aes-256-gcm',this.key,iv); const body=Buffer.concat([cipher.update(String(value),'utf8'),cipher.final()]); return ['v1',iv.toString('base64url'),cipher.getAuthTag().toString('base64url'),body.toString('base64url')].join('.'); }
  open(value){ if(!value) return ''; const [v,i,t,b]=String(value).split('.'); if(v!=='v1') throw new Error('Unbekanntes Secret-Format'); const decipher=crypto.createDecipheriv('aes-256-gcm',this.key,Buffer.from(i,'base64url')); decipher.setAuthTag(Buffer.from(t,'base64url')); return Buffer.concat([decipher.update(Buffer.from(b,'base64url')),decipher.final()]).toString(); }
}
const blockedV4 = ip => { const p=ip.split('.').map(Number); return p[0]===0||p[0]===10||p[0]===127||p[0]>=224||(p[0]===169&&p[1]===254)||(p[0]===172&&p[1]>=16&&p[1]<=31)||(p[0]===192&&p[1]===168)||(p[0]===100&&p[1]>=64&&p[1]<=127); };
export async function assertSafeExternalUrl(raw) {
  const url=new URL(raw); if(!['http:','https:'].includes(url.protocol)||url.username||url.password) throw new Error('Unzulässige Medien-URL');
  const addresses=net.isIP(url.hostname)?[{address:url.hostname}]:await dns.lookup(url.hostname,{all:true,verbatim:true});
  if(!addresses.length||addresses.some(({address})=>net.isIP(address)===4?blockedV4(address):address==='::1'||address.startsWith('fc')||address.startsWith('fd')||address.startsWith('fe80'))) throw new Error('Privates oder reserviertes Medienziel blockiert');
  return url;
}
export function safeMusicPath(root, name){ if(!/^[\p{L}\p{N} _().\-[\]]{1,180}$/u.test(name)||name.includes('..')) throw new Error('Ungültiger Dateiname'); const target=path.resolve(root,name); if(path.dirname(target)!==path.resolve(root)) throw new Error('Pfad außerhalb des Musikverzeichnisses'); return target; }
export class RateLimiter { constructor(limit,windowMs){this.limit=limit;this.windowMs=windowMs;this.map=new Map();} take(key){const now=Date.now();const live=(this.map.get(key)||[]).filter(x=>x>now-this.windowMs);if(live.length>=this.limit)return false;live.push(now);this.map.set(key,live);return true;} cleanup(){const cutoff=Date.now()-this.windowMs;for(const [k,v] of this.map)if(!v.some(x=>x>cutoff))this.map.delete(k);} }
