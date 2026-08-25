export const pcmSampleRate=48_000;
export const pcmChannels=2;
export const pcmBytesPerSample=2;
export const pcmFrameMs=20;
export const pcmFrameBytes=pcmSampleRate*pcmChannels*pcmBytesPerSample*pcmFrameMs/1000;
export const pcmBytesPerSecond=pcmSampleRate*pcmChannels*pcmBytesPerSample;

export class PcmJitterBuffer{
  constructor({initialBytes=pcmBytesPerSecond*2,rebufferBytes=pcmBytesPerSecond,maxBytes=pcmBytesPerSecond*8,resumeBytes=pcmBytesPerSecond*4,onFrame=()=>{},onBuffering=()=>{},onDrain=()=>{}}={}){
    this.initialBytes=Math.max(pcmFrameBytes,Number(initialBytes)||pcmFrameBytes);this.rebufferBytes=Math.max(pcmFrameBytes,Number(rebufferBytes)||pcmFrameBytes);this.maxBytes=Math.max(this.initialBytes,Number(maxBytes)||this.initialBytes);this.resumeBytes=Math.min(this.maxBytes,Math.max(pcmFrameBytes,Number(resumeBytes)||pcmFrameBytes));this.onFrame=onFrame;this.onBuffering=onBuffering;this.onDrain=onDrain;this.chunks=[];this.offset=0;this.bufferedBytes=0;this.startedOnce=false;this.buffering=true;this.paused=false;this.ended=false;this.destroyed=false;this.timer=null;this.nextFrameAt=0;this.source=null;this.sourcePaused=false;
  }
  attach(source){this.source=source;return this;}
  write(value){if(this.destroyed||this.ended)return false;const buffer=Buffer.isBuffer(value)?value:Buffer.from(value||[]);if(!buffer.length)return true;this.chunks.push(buffer);this.bufferedBytes+=buffer.length;if(!this.sourcePaused&&this.bufferedBytes>=this.maxBytes&&this.source?.pause){this.source.pause();this.sourcePaused=true}this.maybeStart();return !this.sourcePaused;}
  end(){if(this.destroyed)return;this.ended=true;this.maybeStart();if(!this.bufferedBytes&&!this.timer)this.finish();}
  pause(){if(this.destroyed||this.paused)return;this.paused=true;clearTimeout(this.timer);this.timer=null;}
  resume(){if(this.destroyed||!this.paused)return;this.paused=false;this.maybeStart();}
  setBuffering(value){const next=Boolean(value);if(this.buffering===next)return;this.buffering=next;this.onBuffering(next);}
  maybeStart(){if(this.destroyed||this.paused||this.timer)return;const target=this.startedOnce?this.rebufferBytes:this.initialBytes;if(this.bufferedBytes>=target||this.ended&&this.bufferedBytes){this.startedOnce=true;this.setBuffering(false);this.nextFrameAt=Date.now();this.schedule(0)}else if(this.ended&&!this.bufferedBytes)this.finish();}
  schedule(delay){if(this.destroyed||this.paused||this.timer)return;this.timer=setTimeout(()=>{this.timer=null;this.tick()},Math.max(0,delay));this.timer.unref?.();}
  read(size){if(size<=0||this.bufferedBytes<size)return null;const first=this.chunks[0],available=first.length-this.offset;if(available>=size){const output=first.subarray(this.offset,this.offset+size);this.offset+=size;this.bufferedBytes-=size;if(this.offset===first.length){this.chunks.shift();this.offset=0}return output}const output=Buffer.allocUnsafe(size);let written=0;while(written<size){const chunk=this.chunks[0],count=Math.min(size-written,chunk.length-this.offset);chunk.copy(output,written,this.offset,this.offset+count);written+=count;this.offset+=count;this.bufferedBytes-=count;if(this.offset===chunk.length){this.chunks.shift();this.offset=0}}return output;}
  resumeSourceIfNeeded(){if(this.sourcePaused&&this.bufferedBytes<=this.resumeBytes&&this.source?.resume){this.sourcePaused=false;this.source.resume()}}
  tick(){if(this.destroyed||this.paused)return;if(this.bufferedBytes>=pcmFrameBytes){const frame=this.read(pcmFrameBytes);this.resumeSourceIfNeeded();this.onFrame(frame);this.nextFrameAt+=pcmFrameMs;const now=Date.now();if(this.nextFrameAt<now-pcmFrameMs*5)this.nextFrameAt=now;this.schedule(Math.max(0,this.nextFrameAt-now));return}if(this.ended){if(this.bufferedBytes){const tail=this.read(this.bufferedBytes);this.resumeSourceIfNeeded();this.onFrame(tail);this.schedule(pcmFrameMs);return}this.finish();return}this.setBuffering(true);this.resumeSourceIfNeeded();}
  finish(){if(this.destroyed)return;this.destroyed=true;clearTimeout(this.timer);this.timer=null;this.chunks=[];this.offset=0;this.bufferedBytes=0;this.onDrain();}
  destroy(){if(this.destroyed)return;this.destroyed=true;clearTimeout(this.timer);this.timer=null;this.chunks=[];this.offset=0;this.bufferedBytes=0;}
}
