import { EventEmitter } from 'node:events';
import { transcode, resolveTrack } from './media.js';

function scalePcm(buf,volume){const gain=Math.max(0,Math.min(1,Number(volume)/100));if(gain===1)return buf;const out=Buffer.from(buf);for(let i=0;i+1<out.length;i+=2){const v=Math.max(-32768,Math.min(32767,Math.round(out.readInt16LE(i)*gain)));out.writeInt16LE(v,i)}return out}
export class Player extends EventEmitter{
  constructor(){super();this.queue=[];this.current=null;this.proc=null;this.outputs=new Set();this.paused=false;this.volume=100;this.playing=false;}
  addOutput(output){this.outputs.add(output)}
  removeOutput(output){this.outputs.delete(output)}
  list(){return this.queue.slice()}
  now(){return this.current}
  async enqueue(track,playNow=false){if(playNow)this.queue.unshift(track);else this.queue.push(track);if(!this.playing)await this.next();return this.current}
  async next(){this.stopProcess();if(!this.queue.length){this.current=null;this.playing=false;this.emit('state');return null}this.current=this.queue.shift();try{this.current={...this.current,...await resolveTrack(this.current)}}catch(e){this.emit('error',e);this.current=null;return this.next()}this.proc=transcode(this.current);this.playing=true;this.paused=false;this.proc.stdout.on('data',buf=>{if(this.paused)return;const pcm=scalePcm(buf,this.volume);for(const o of this.outputs){try{o.write(pcm,this.volume)}catch{}}});this.proc.once('error',e=>this.finish(e));this.proc.once('exit',c=>{if(c!==0&&!this.paused)this.finish(new Error('FFmpeg beendet'))});this.emit('state');return this.current}
  finish(error){if(error)this.emit('error',error);this.proc=null;if(this.playing){this.playing=false;void this.next()}}
  pause(){if(this.proc&&!this.paused){this.paused=true;this.proc.stdout.pause();this.emit('state')}}
  resume(){if(this.proc&&this.paused){this.paused=false;this.proc.stdout.resume();this.emit('state')}}
  async skip(){await this.next()}
  stop(){this.queue=[];this.stopProcess();this.current=null;this.playing=false;this.paused=false;this.emit('state')}
  clear(){this.queue=[];this.emit('state')}
  setVolume(v){const n=Math.max(0,Math.min(100,Number(v)||0));this.volume=n;this.emit('state')}
  stopProcess(){if(this.proc){try{this.proc.kill('SIGKILL')}catch{}this.proc=null}}
}
