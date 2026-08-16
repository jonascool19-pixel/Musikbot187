import {Client,generateIdentity} from "@honeybbq/teamspeak-client";
import OpusScript from "opusscript";
export type TSConfig={id:string,name:string,host:string,port:number,channel:string,nickname:string,password?:string};
export class TS3Manager{
 configs:TSConfig[]=[]; clients=new Map<string,any>(); encoder=new OpusScript(48000,2,OpusScript.Application.AUDIO); pcm=Buffer.alloc(0);
 set(configs:TSConfig[]){this.configs=configs}
 async connect(id:string){const c=this.configs.find(x=>x.id===id);if(!c)throw new Error("TS3-Instanz nicht gefunden");await this.disconnect(id);const client=new Client(generateIdentity(8),c.host,c.nickname,{serverPassword:c.password,defaultChannel:c.channel});await client.connect();await client.waitConnected(AbortSignal.timeout(15000));this.clients.set(id,client);return {connected:true,instance:{...c,password:undefined}}}
 async disconnect(id:string){const c=this.clients.get(id);if(c){await c.disconnect();this.clients.delete(id)}}
 status(){return this.configs.map(x=>({...x,password:undefined,connected:this.clients.has(x.id)}))}
 async sendVoice(data:Buffer){if(!this.clients.size)return;this.pcm=Buffer.concat([this.pcm,data]);const frame=3840;while(this.pcm.length>=frame){const pcm=this.pcm.subarray(0,frame);this.pcm=this.pcm.subarray(frame);const opus=this.encoder.encode(pcm,960);for(const c of this.clients.values())c.sendVoice(opus,4)}}}