import fs from 'node:fs/promises';
import path from 'node:path';

export class PlaybackMappingCache extends Map{
  constructor(file=''){super();this.file=file;this.pending=Promise.resolve();this.lastError=null;}
  async load(){
    if(!this.file)return this;
    try{
      const stat=await fs.stat(this.file);
      if(stat.size>4*1024*1024)return this;
      const data=JSON.parse(await fs.readFile(this.file,'utf8'));
      if(data.version!==1||!Array.isArray(data.entries))return this;
      for(const [key,value] of data.entries.slice(-500))if(typeof key==='string'&&key.length<8000&&/^[A-Za-z0-9_-]{11}$/.test(String(value?.id||''))&&value.expires>Date.now())super.set(key,value);
    }catch(error){if(error.code!=='ENOENT')this.lastError=error;}
    return this;
  }
  set(key,value){super.set(key,value);while(this.size>500)super.delete(this.keys().next().value);this.persist();return this;}
  delete(key){const changed=super.delete(key);if(changed)this.persist();return changed;}
  persist(){
    if(!this.file)return;
    const content=JSON.stringify({version:1,entries:[...this].filter(([,value])=>value.expires>Date.now())});
    this.pending=this.pending.then(async()=>{
      await fs.mkdir(path.dirname(this.file),{recursive:true});
      const temporary=this.file+'.tmp';
      await fs.writeFile(temporary,content,{mode:0o600});
      await fs.rename(temporary,this.file);this.lastError=null;
    }).catch(error=>{this.lastError=error;});
  }
  async flush(){await this.pending;}
}
export let playbackMappings=new PlaybackMappingCache();
export async function initializePlaybackMappings(file){await playbackMappings.flush();playbackMappings=await new PlaybackMappingCache(file).load();return playbackMappings;}
