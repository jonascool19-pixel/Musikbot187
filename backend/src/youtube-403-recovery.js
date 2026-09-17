import {Player} from './player.js';

export const youtube403FastRetryDelays=Object.freeze([500,750,1000,1500,2500,3500,5000]);
export const youtube403FastAttemptLimit=youtube403FastRetryDelays.length+1;

export function isYouTubePlayback403(error){
  return /(?:http error 403|server returned 403|403 forbidden)/i.test(String(error?.message||error||''));
}

const recoveryKey=item=>String(item?.id||item?.url||item?.path||`${item?.source||''}:${item?.title||''}`);
const recoveryState=new WeakMap();
const installed=Symbol.for('musikbot187.youtube403RecoveryInstalled');

if(!Player.prototype[installed]){
  Object.defineProperty(Player.prototype,installed,{value:true,enumerable:false,configurable:false,writable:false});
  const originalFinish=Player.prototype.finish;
  const originalProcessFrame=Player.prototype.processFrame;

  Player.prototype.processFrame=function(...args){
    const written=originalProcessFrame.apply(this,args);
    if(written>0)recoveryState.delete(this);
    return written;
  };

  Player.prototype.finish=function(generation,code,error,attempt,prior=this.current,child=this.process){
    const track=prior||this.current,onDemand=['youtube','spotify'].includes(track?.source);
    if(Number(code)!==0&&onDemand&&isYouTubePlayback403(error)){
      const key=recoveryKey(track),previous=recoveryState.get(this),failures=previous?.key===key?previous.failures+1:1;
      recoveryState.set(this,{key,failures});
      if(failures>=youtube403FastAttemptLimit){
        const exhausted=new Error(`YouTube-Audiozugriff blieb nach ${youtube403FastAttemptLimit} schnellen Clientversuchen mit HTTP 403 gesperrt. Titel wird übersprungen, damit die Wiedergabe weiterläuft.`);
        return originalFinish.call(this,generation,code,exhausted,Math.max(Number(attempt)||0,this.retries.length),prior,child);
      }
      const normalRetries=this.retries;
      this.retries=[...youtube403FastRetryDelays];
      try{return originalFinish.call(this,generation,code,error,failures-1,prior,child)}
      finally{this.retries=normalRetries}
    }
    return originalFinish.call(this,generation,code,error,attempt,prior,child);
  };
}
