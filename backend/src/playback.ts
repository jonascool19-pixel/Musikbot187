import {spawn,ChildProcessWithoutNullStreams} from "node:child_process";
import {EventEmitter} from "node:events";
import {FFMPEG} from "./config.js";
import {resolveStream} from "./media.js";
import type {MediaItem} from "./store.js";
export class Player extends EventEmitter{
 queue:MediaItem[]=[]; current:MediaItem|null=null; paused=false; volume=80; mode:"queue"|"repeat"|"shuffle"="queue"; proc?:ChildProcessWithoutNullStreams;
 async enqueue(items:MediaItem[]){this.queue.push(...items);if(!this.current)await this.next()}
 async next(){this.stopProcess();this.current=this.queue.shift()||null;this.paused=false;if(this.current){const url=await resolveStream(this.current);this.proc=spawn(FFMPEG,["-hide_banner","-loglevel","error","-re","-i",url,"-vn","-f","s16le","-ar","48000","-ac","2","pipe:1"]);this.proc.stdout.on("data",d=>this.emit("audio",Buffer.from(d)));this.proc.on("close",()=>{if(this.current&&!this.paused)void this.next()});this.emit("track",this.current)}this.emit("state",this.snapshot())}
 pause(){if(this.proc){this.proc.kill("SIGSTOP");this.paused=true;this.emit("state",this.snapshot())}}
 resume(){if(this.proc){this.proc.kill("SIGCONT");this.paused=false;this.emit("state",this.snapshot())}}
 stop(){this.stopProcess();this.current=null;this.paused=false;this.emit("state",this.snapshot())}
 skip(){this.stopProcess();void this.next()}
 setVolume(v:number){this.volume=Math.max(0,Math.min(100,v));this.emit("state",this.snapshot())}
 snapshot(){return {current:this.current,queue:this.queue,paused:this.paused,volume:this.volume,mode:this.mode}}
 private stopProcess(){if(this.proc){this.proc.kill("SIGTERM");this.proc=undefined}}
}