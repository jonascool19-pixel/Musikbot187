import {youtubeSearch,youtubeMusicRadio} from './audio/youtube-client.js';

// Sources propose candidates. Only AutoplayController can admit them to the
// queue, using the learned profile, exclusions and discovery/familiar quota.
export function createRecommendationProvider({search=youtubeSearch,radio=youtubeMusicRadio,now=Date.now}={}){
  const radioCache=new Map();
  return async(seed,{query='',limit=24,signal}={})=>{
    signal?.throwIfAborted();
    const seedId=seed?.playbackVideoId||(seed?.source==='youtube'?seed.id:'');
    const jobs=[];
    if(/^[A-Za-z0-9_-]{11}$/.test(String(seedId||''))){
      jobs.push(async()=>{
        let cached=radioCache.get(seedId);
        if(!cached||cached.expires<=now()){
          cached={expires:now()+5*60_000,promise:radio(seedId,{limit:40,timeout:12_000,signal})};
          radioCache.set(seedId,cached);
          while(radioCache.size>30)radioCache.delete(radioCache.keys().next().value);
        }
        try{return await cached.promise}catch(error){radioCache.delete(seedId);throw error}
      });
    }
    jobs.push(()=>search(query,{provider:'youtube-music',limit,timeout:12_000,signal}));
    jobs.push(()=>search(query,{provider:'youtube',limit,timeout:12_000,signal}));
    const buckets=[],failures=[],available=new Set();
    // yt-dlp processes are intentionally sequential. Parallel radio + YTM +
    // YouTube searches starved playback resolution on smaller installations.
    for(const job of jobs){
      signal?.throwIfAborted();
      if(available.size>=limit)break;
      try{
        const bucket=await job(),tracks=Array.isArray(bucket)?bucket:[];
        buckets.push(tracks);
        for(const track of tracks)if(track?.id&&track.id!==seedId)available.add(track.id);
      }catch(error){failures.push(error)}
    }
    signal?.throwIfAborted();
    if(!buckets.length)throw failures[0];
    const seen=new Set(),result=[];
    // Interleave so a full search page cannot hide every radio candidate.
    for(let index=0;result.length<limit&&buckets.some(bucket=>index<bucket.length);index++)for(const bucket of buckets){
      const track=bucket[index],key=track?.id;
      if(!key||key===seedId||seen.has(key)||result.length>=limit)continue;
      seen.add(key);result.push(track);
    }
    return result;
  };
}
