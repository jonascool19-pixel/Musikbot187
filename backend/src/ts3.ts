import {Client,generateIdentity} from "@honeybbq/teamspeak-client"; import OpusScript from "opusscript"; import type {TS3Instance} from "./types.js";
export class TS3Manager{private map=new Map<string,any>();private pcm=new Map<string,Buffer>();private enc=new OpusScript(48000,2,OpusScript.Application.AUDIO);
 async connect(c:TS3Instance){await this.disconnect(c.id);if(!c.enabled)throw new Error("Instanz ist ausgeschaltet");const cli=new Client(generateIdentity(8),c.host,c.nickname,{serverPassword:c.password,defaultChannel:c.channel});await cli.connect();await cli.waitConnected(AbortSignal.timeout(15000));this.map.set(c.id,cli);this.pcm.set(c.id,Buffer.alloc(0))}
 async disconnect(id:string){const c=this.map.get(id);if(c){await c.disconnect();this.map.delete(id);this.pcm.delete(id)}}
 writeAudio(data:Buffer,id:string){const c=this.map.get(id);if(!c)return;let b=Buffer.concat([this.pcm.get(id)||Buffer.alloc(0),data]);while(b.length>=3840){const frame=b.subarray(0,3840);b=b.subarray(3840);try{c.sendVoice(this.enc.encode(frame,960),4)}catch{}}this.pcm.set(id,b)}
 status(){return [...this.map.keys()]}}
