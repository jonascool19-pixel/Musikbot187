import {pcmBytesPerSecond,pcmChannels,pcmSampleRate} from './pcm-buffer.js';

export const defaultCrossfadeMs=3_000;
export const manualTransitionMs=800;
export const minimumCrossfadeMs=600;
export const crossfadePrepareLeadMs=9_000;
export const crossfadeReserveMs=6_000;
export const fallbackFadeInMs=250;

const clamp=value=>Math.max(0,Math.min(1,Number(value)||0));
export function equalPowerGains(progress){const phase=clamp(progress)*Math.PI/2;return {outgoing:Math.cos(phase),incoming:Math.sin(phase)};}
export function pcmBytesForMs(milliseconds){return Math.max(0,Math.ceil(pcmBytesPerSecond*Math.max(0,Number(milliseconds)||0)/1000));}
export function chooseCrossfadeMs(remainingMs,bufferedBytes,{targetMs=defaultCrossfadeMs,minimumMs=minimumCrossfadeMs,safetyMs=60}={}){
  const remaining=Math.max(0,Number(remainingMs)||0),availableMs=Math.max(0,Number(bufferedBytes)||0)/pcmBytesPerSecond*1000,duration=Math.min(Math.max(0,Number(targetMs)||0),Math.max(0,remaining-Math.max(0,Number(safetyMs)||0)),availableMs);
  return duration>=Math.max(0,Number(minimumMs)||0)?Math.floor(duration):0;
}

export class EqualPowerCrossfade{
  constructor(durationMs=defaultCrossfadeMs,{sampleRate=pcmSampleRate,channels=pcmChannels}={}){
    this.channels=Math.max(1,Math.floor(Number(channels)||1));
    this.frameBytes=this.channels*2;
    this.totalFrames=Math.max(1,Math.round(Math.max(1,Number(durationMs)||1)*sampleRate/1000));
    this.processedFrames=0;
  }
  get done(){return this.processedFrames>=this.totalFrames;}
  get progress(){return Math.min(1,this.processedFrames/this.totalFrames);}
  process(outgoing,incoming){
    if(!Buffer.isBuffer(outgoing)||!Buffer.isBuffer(incoming))return outgoing;
    const length=Math.min(outgoing.length,incoming.length),aligned=length-length%this.frameBytes;
    if(aligned<=0)return outgoing.subarray(0,0);
    for(let frameOffset=0;frameOffset<aligned;frameOffset+=this.frameBytes){
      const denominator=Math.max(1,this.totalFrames-1),progress=Math.min(1,this.processedFrames/denominator),gains=equalPowerGains(progress);
      for(let channel=0;channel<this.channels;channel++){
        const offset=frameOffset+channel*2,mixed=Math.round(outgoing.readInt16LE(offset)*gains.outgoing+incoming.readInt16LE(offset)*gains.incoming);
        outgoing.writeInt16LE(Math.max(-32768,Math.min(32767,mixed)),offset);
      }
      this.processedFrames++;
    }
    return outgoing.subarray(0,aligned);
  }
}
