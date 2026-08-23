import {EventEmitter} from 'node:events';
import {spawn} from 'node:child_process';
import {resolveInput} from './media.js';
export class Player extends EventEmitter{
  constructor({musicDir,diagnostic}){super();this.musicDir=musicDir;this.diagnostic=diagnostic;this.queue=[];this.current=null;this.volume=75;this.mode='queue';this.paused=false;this.generation=0;this.process=null;this.retries=[2000,5000,10000,20000];}
  state(){return {current:this.current,queue:this.queue,volume:this.volume,mode:this.mode,paused:this.paused,playing:Boolean(this.process)};}
  add(items,{now=false}={}){const list=(Array.isArray(items)?items:[items]).filter(Boolean);if(this.queue.length+list.length>100)throw new Error('Queue-Limit von 100 überschritten');if(now){this.queue.unshift(...list);this.skip();}else{this.queue.push(...list);if(!this.current)this.next();}this.emit('state',this.state());}
  remove(index){if(!Number.isInteger(index)||index<0||index>=this.queue.length)throw new Error('Ungültiger Queue-Index');this.queue.splice(index,1);this.emit('state',this.state());}
  clear(){this.queue=[];this.emit('state',this.state());}
  setVolume(v){v=Number(v);if(v<0||v>100)throw new Error('Lautstärke 0–100');this.volume=v;this.emit('state',this.state());}
  setMode(v){if(!['queue','repeat','shuffle'].includes(v))throw new Error('Ungültiger Modus');this.mode=v;this.emit('state',this.state());}
  pause(){if(this.process&&!this.paused){this.process.kill('SIGSTOP');this.paused=true;this.emit('state',this.state());}}
  resume(){if(this.process&&this.paused){this.process.kill('SIGCONT');this.paused=false;this.emit('state',this.state());}}
  stop({clear=true}={}){this.generation++;if(this.process)this.process.kill('SIGKILL');this.process=null;this.current=null;this.paused=false;if(clear)this.queue=[];this.emit('state',this.state());}
  skip(){this.stop({clear:false});this.next();}
  async next(attempt=0){if(this.current||!this.queue.length)return;const item=this.mode==='shuffle'?this.queue.splice(Math.floor(Math.random()*this.queue.length),1)[0]:this.queue.shift();this.current=item;const generation=++this.generation;try{const input=await resolveInput(item,this.musicDir);if(generation!==this.generation)return;const args=['-nostdin','-hide_banner','-loglevel','warning'];if(/^https?:/.test(input))args.push('-reconnect','1','-reconnect_streamed','1','-reconnect_delay_max','10');args.push('-i',input,'-vn','-af',`volume=${this.volume/100}`,'-ar','48000','-ac','2','-f','s16le','pipe:1');const child=this.process=spawn('ffmpeg',args,{stdio:['ignore','pipe','pipe']});child.stdout.on('data',b=>this.emit('pcm',b));let errors='';child.stderr.on('data',b=>errors=(errors+b).slice(-4000));child.on('error',e=>this.finish(generation,1,e.message,attempt));child.on('close',code=>this.finish(generation,code,errors,attempt));this.emit('state',this.state());}catch(e){this.finish(generation,1,e.message,attempt);}}
  finish(generation,code,error,attempt){if(generation!==this.generation)return;this.process=null;const prior=this.current;this.current=null;if(code&&attempt<this.retries.length){setTimeout(()=>{if(generation!==this.generation)return;this.queue.unshift(prior);this.next(attempt+1);},this.retries[attempt]);}else{if(code)this.diagnostic('error','player',error||`FFmpeg exit ${code}`);if(this.mode==='repeat'&&prior)this.queue.unshift(prior);this.next();}this.emit('state',this.state());}
}
