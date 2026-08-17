import {EventEmitter} from 'node:events';
import {spawn} from 'node:child_process';
const YTDLP=process.env.YTDLP_PATH||'yt-dlp'; const FFMPEG=process.env.FFMPEG_PATH||'ffmpeg';
export class Player extends EventEmitter{
 constructor(settings){super();this.queue=[];this.current=null;this.paused=false;this.volume=settings.volume;this.mode=settings.mode;this.ff=null;this.stopping=false;this.generation=0;}
 snapshot(){return{queue:[...this.queue],current:this.current,paused:this.paused,volume:this.volume,mode:this.mode};}
 setVolume(v){this.volume=Math.max(0,Math.min(100,Number.isFinite(Number(v))?Number(v):0));if(this.ff){this.generation++;if(this.current)this.queue.unshift(this.current);this.ff.kill('SIGTERM');this.ff=null;this.current=null;}this.emit('state');if(!this.ff&&!this.current&&this.queue.length)this.next();}
 setMode(m){this.mode=m;this.emit('state');}
 pause(){if(this.ff&&!this.paused){this.paused=true;try{this.ff.kill('SIGSTOP');}catch{}this.emit('state');}}
 resume(){if(this.ff&&this.paused){this.paused=false;try{this.ff.kill('SIGCONT');}catch{}this.emit('state');}}
 stop(){this.stopping=true;this.generation++;if(this.ff)this.ff.kill('SIGTERM');this.ff=null;this.queue=[];this.current=null;this.paused=false;this.emit('state');}
 skip(){this.generation++;if(this.ff){this.ff.kill('SIGTERM');this.ff=null;}this.current=null;this.paused=false;this.emit('state');this.next();}
 clear(){this.queue=[];this.emit('state');}
 remove(i){if(Number.isInteger(i)&&i>=0&&i<this.queue.length)this.queue.splice(i,1);this.emit('state');}
 async enqueue(items){this.queue.push(...(Array.isArray(items)?items.filter(Boolean):[]));if(!this.current)await this.next();this.emit('state');}
 async resolve(item){if(['radio','file','url'].includes(item.source))return item.url;const input=item.url;const query=input.startsWith('ytsearch')?input:`ytsearch1:${input}`;return new Promise((resolve,reject)=>{const p=spawn(YTDLP,['-g','-f','bestaudio/best','--no-playlist',query],{stdio:['ignore','pipe','pipe']});let out='',err='';p.stdout.on('data',d=>out+=d);p.stderr.on('data',d=>err+=d);p.on('error',reject);p.on('close',code=>{if(code!==0)return reject(new Error(err||'Quelle konnte nicht aufgelöst werden'));const src=out.trim().split(/\r?\n/)[0];src?resolve(src):reject(new Error('Keine abspielbare Quelle gefunden'));});});}
 async next(){if(this.stopping){this.stopping=false;return;}if(!this.queue.length){this.current=null;this.emit('state');return;}let idx=this.mode==='shuffle'?Math.floor(Math.random()*this.queue.length):0;const item=this.queue.splice(idx,1)[0];this.current=item;this.paused=false;this.emit('state');const gen=++this.generation;try{const src=await this.resolve(item);if(gen!==this.generation)return;this.ff=spawn(FFMPEG,['-hide_banner','-loglevel','error','-reconnect','1','-reconnect_streamed','1','-reconnect_delay_max','5','-i',src,'-vn','-f','s16le','-ar','48000','-ac','2','-af',`volume=${this.volume/100}`,'pipe:1'],{stdio:['ignore','pipe','pipe']});this.ff.stdout.on('data',d=>this.emit('audio',Buffer.from(d)));this.ff.stderr.on('data',d=>{const m=String(d).trim();if(m)this.emit('diagnostic',m);});await new Promise(res=>this.ff?.once('close',res));this.ff=null;if(gen!==this.generation)return;if(this.mode==='repeat')this.queue.unshift(item);await this.next();}catch(e){if(gen!==this.generation)return;this.ff=null;this.emit('diagnostic',e instanceof Error?e.message:String(e));await this.next();}}
}
