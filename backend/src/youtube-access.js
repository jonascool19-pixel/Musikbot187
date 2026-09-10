export const youtubeAccessPauseMs=60_000;
export const youtubeAccessMaxPauseMs=10*60_000;
export function isYouTubeAccessBlocked(error){
  return error?.code==='YOUTUBE_ACCESS_BLOCKED'||/sign in to confirm (?:you(?:'|’)re|you are) not a bot|too many requests|http(?: error)?\s*429|this content (?:isn't|isn’t) available, try again later|YouTube.*(?:Bot-Bestätigung|Schutzpause)/i.test(String(error?.message||error||''));
}

// Shared by searches, prefetch, playback and downloads in this bot process.
// An access restriction is not an unavailable song: stop issuing requests and
// let players keep their current title and queue until the next bounded probe.
export class YouTubeAccessGuard{
  constructor({now=Date.now}={}){this.now=now;this.until=0;this.failures=0;this.generation=0;}
  error(){
    const retryAfterMs=Math.max(1000,this.until-this.now());
    const error=new Error(`YouTube verlangt eine Bot-Bestätigung oder begrenzt die Zugriffe. Schutzpause: neuer Versuch in ${Math.ceil(retryAfterMs/1000)} Sekunden.`);
    error.code='YOUTUBE_ACCESS_BLOCKED';error.retryAfterMs=retryAfterMs;return error;
  }
  async run(operation,{signal,recoverOnSuccess=true}={}){
    if(signal?.aborted){const error=new Error('Medienauflösung abgebrochen');error.name='AbortError';throw error;}
    if(this.until>this.now())throw this.error();
    const generation=this.generation;
    try{
      const result=await operation();
      // A late successful request from before a block cannot cancel the pause.
      if(recoverOnSuccess&&generation===this.generation){this.until=0;this.failures=0;}
      return result;
    }catch(error){
      if(error.name==='AbortError'||!isYouTubeAccessBlocked(error))throw error;
      if(this.until<=this.now()){
        this.failures=Math.min(5,this.failures+1);this.generation++;
        this.until=this.now()+Math.min(youtubeAccessMaxPauseMs,youtubeAccessPauseMs*2**(this.failures-1));
      }
      throw this.error();
    }
  }
}
