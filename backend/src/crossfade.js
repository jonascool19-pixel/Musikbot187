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
    this.totalSamples=Math.max(1,Math.round(Math.max(1,Number(durationMs)||1)*sampleRate*channels/1000));
    this.processedSamples=0;
  }
  get done(){return this.processedSamples>=this.totalSamples;}
  get progress(){return Math.min(1,this.processedSamples/this.totalSamples);}
  process(outgoing,incoming){
    if(!Buffer.isBuffer(outgoing)||!Buffer.isBuffer(incoming))return outgoing;
    const length=Math.min(outgoing.length,incoming.length)&~1;
    if(length<=0)return outgoing.subarray(0,0);
    for(let offset=0;offset<length;offset+=2){
      const denominator=Math.max(1,this.totalSamples-1),progress=Math.min(1,this.processedSamples/denominator),gains=equalPowerGains(progress),mixed=Math.round(outgoing.readInt16LE(offset)*gains.outgoing+incoming.readInt16LE(offset)*gains.incoming);
      outgoing.writeInt16LE(Math.max(-32768,Math.min(32767,mixed)),offset);
      this.processedSamples++;
    }
    return outgoing.subarray(0,length);
  }
}
