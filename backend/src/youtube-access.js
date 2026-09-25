export function isYouTubeAgeRestricted(error){return error?.code==='YOUTUBE_AGE_RESTRICTED'||/(?:sign in to confirm your age|this video may be inappropriate|age[- ]restricted|age[_ ]verification[_ ]required|age[_ ]check[_ ]required)/i.test(String(error?.message||error||''));}

export function classifyYouTubeAudioFailure(stderr){
  const detail=String(stderr||'');
  // PO-token transport errors can be followed by "only images" errors.
  // A service outage does not prove that this video has no audio.
  if(/pot:bgutil|po[- ]?token.*(?:provider|service)/i.test(detail)&&
    /(?:error reaching|transporterror|connection (?:refused|failed)|unreachable|timed?\s*out|econnrefused)/i.test(detail)){
    return Object.assign(new Error('YouTube-PO-Token-Dienst bgutil ist nicht erreichbar; Audiostream konnte nicht geladen werden. Bitte Erreichbarkeit, Netzwerk und Dienstkonfiguration prüfen.'),{code:'YOUTUBE_TOKEN_PROVIDER_UNAVAILABLE'});
  }
  if(isYouTubeAgeRestricted(detail)){
    return Object.assign(new Error('Die YouTube-Quelle ist altersbeschränkt und benötigt eine authentifizierte YouTube-Sitzung.'),{code:'YOUTUBE_AGE_RESTRICTED'});
  }
  if(/(?:only images are available|requested format is not available|no video formats found|no audio formats found)/i.test(detail)){
    return Object.assign(new Error('Die ausgewählte YouTube-Quelle stellt kein nutzbares Audioformat bereit.'),{code:'YOUTUBE_AUDIO_FORMAT_UNAVAILABLE'});
  }
  return null;
}

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
  beginRequest({signal}={}){
    if(signal?.aborted){const error=new Error('Medienauflösung abgebrochen');error.name='AbortError';throw error;}
    if(this.until>this.now())throw this.error();
    return this.generation;
  }
  recoverRequest(generation){
    if(generation===this.generation){this.until=0;this.failures=0;return true}
    return false;
  }
  blockFromError(error){
    if(error?.name==='AbortError'||!isYouTubeAccessBlocked(error))return null;
    if(this.until<=this.now()){
      this.failures=Math.min(5,this.failures+1);this.generation++;
      this.until=this.now()+Math.min(youtubeAccessMaxPauseMs,youtubeAccessPauseMs*2**(this.failures-1));
    }
    return this.error();
  }
  async run(operation,{signal,recoverOnSuccess=true}={}){
    const generation=this.beginRequest({signal});
    try{
      const result=await operation();
      // A late successful request from before a block cannot cancel the pause.
      if(recoverOnSuccess)this.recoverRequest(generation);
      return result;
    }catch(error){
      const blocked=this.blockFromError(error);
      if(blocked)throw blocked;
      throw error;
    }
  }
}

export const sharedYouTubeAccess=new YouTubeAccessGuard();
