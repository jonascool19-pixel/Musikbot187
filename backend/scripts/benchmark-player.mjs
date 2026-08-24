import {performance} from 'node:perf_hooks';
import {PcmVolumeScaler} from '../src/player.js';

const option=(name,fallback)=>{const raw=process.argv.find(value=>value.startsWith(`--${name}=`));return raw?Number(raw.slice(name.length+3)):fallback};
const seconds=Math.max(10,Math.min(3600,option('seconds',300))),players=Math.max(1,Math.min(4,option('players',2))),frames=Math.floor(seconds*50),samplesPerFrame=960,frame=Buffer.alloc(samplesPerFrame*2*2);
for(let offset=0;offset<frame.length;offset+=2)frame.writeInt16LE(Math.round(Math.sin(offset/24)*24000),offset);

let OpusEncoder=null,opusError='';
try{const opusModule=await import('@discordjs/opus');OpusEncoder=opusModule.OpusEncoder||opusModule.default?.OpusEncoder||null;if(!OpusEncoder)opusError='Das Opus-Modul enthält keinen OpusEncoder-Export.'}catch(error){opusError=String(error.message||error).split('\n')[0]}

const scalers=Array.from({length:players},(_,index)=>new PcmVolumeScaler(72-index*7)),encoders=OpusEncoder?Array.from({length:players},()=>new OpusEncoder(48_000,2)):[],pcmFrames=Array.from({length:players},()=>Array.from({length:50},()=>Buffer.from(frame)));
for(const encoder of encoders)encoder.applyEncoderCTL?.(4002,128_000);
global.gc?.();
const memoryBefore=process.memoryUsage(),cpuBefore=process.cpuUsage(),started=performance.now();let checksum=0;
for(let index=0;index<frames;index++)for(let playerIndex=0;playerIndex<players;playerIndex++){const pcm=pcmFrames[playerIndex][index%pcmFrames[playerIndex].length];frame.copy(pcm);scalers[playerIndex].process(pcm);if(encoders[playerIndex])checksum^=encoders[playerIndex].encode(pcm,samplesPerFrame)[0]||0;else checksum^=pcm[index%pcm.length]}
const wallMs=performance.now()-started,cpu=process.cpuUsage(cpuBefore),cpuMs=(cpu.user+cpu.system)/1000,realtimeCorePercent=cpuMs/(seconds*1000)*100;global.gc?.();const memoryAfter=process.memoryUsage();
const result={simulatedSecondsPerPlayer:seconds,players,framesPerPlayer:frames,includesOpus:Boolean(OpusEncoder),opusUnavailableReason:OpusEncoder?'':opusError,wallMs:Number(wallMs.toFixed(1)),cpuMs:Number(cpuMs.toFixed(1)),projectedSingleCorePercentAtRealtime:Number(realtimeCorePercent.toFixed(2)),realtimeSpeedFactor:Number((seconds/wallMs*1000).toFixed(1)),heapBeforeMiB:Number((memoryBefore.heapUsed/1024/1024).toFixed(1)),heapAfterMiB:Number((memoryAfter.heapUsed/1024/1024).toFixed(1)),heapDeltaMiB:Number(((memoryAfter.heapUsed-memoryBefore.heapUsed)/1024/1024).toFixed(1)),rssBeforeMiB:Number((memoryBefore.rss/1024/1024).toFixed(1)),rssAfterMiB:Number((memoryAfter.rss/1024/1024).toFixed(1)),checksum};
console.log(JSON.stringify(result,null,2));
if(process.platform==='linux'&&!OpusEncoder){console.error('Der native Discord-Opus-Encoder konnte unter Linux nicht geladen werden.');process.exitCode=1}
