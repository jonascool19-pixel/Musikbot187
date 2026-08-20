import { Client, generateIdentity } from '@honeybbq/teamspeak-client';
import OpusScript from 'opusscript';

export class TS3Manager{
  constructor(){this.map=new Map();this.encoder=new OpusScript(48000,2,OpusScript.Application.AUDIO)}
  async connect(cfg){if(this.map.has(cfg.id))await this.disconnect(cfg.id);const c=new Client(generateIdentity(8),cfg.host,cfg.nickname||'MusikBot187',{serverPassword:cfg.password||undefined,defaultChannel:cfg.channel||undefined});await c.connect();this.map.set(cfg.id,c);return true}
  write(id,buf){const c=this.map.get(id);if(!c)return;for(let off=0;off+3840<=buf.length;off+=3840){const frame=buf.subarray(off,off+3840);try{c.sendVoice(this.encoder.encode(frame,960),4)}catch{}}}
  async disconnect(id){const c=this.map.get(id);if(c)await c.disconnect().catch(()=>{});this.map.delete(id)}
}
