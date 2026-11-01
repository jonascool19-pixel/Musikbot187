import {youtubeSearch,youtubeMusicRadio} from './audio/youtube-client.js';

// Sources propose candidates. Only AutoplayController can admit them to the
// queue, using the learned profile, exclusions and discovery/familiar quota.
export function createRecommendationProvider({search=youtubeSearch,radio=youtubeMusicRadio,now=Date.now}={}){
  const radioCache=new Map();
  return async(seed,{query='',limit=24,signal}={})=>{
    signal?.throwIfAborted();
    const seedId=seed?.playbackVideoId||(seed?.source==='youtube'?seed.id:'');
    const jobs=[()=>search(query,{provider:'youtube-music',limit,timeout:12_000,signal}),()=>search(query,{provider:'youtube',limit,timeout:12_000,signal})];
    if(/^[A-Za-z0-9_-]{11}$/.test(String(seedId||''))){
      jobs.unshift(async()=>{
        let cached=radioCache.get(seedId);
        if(!cached||cached.expires<=now()){
          cached={expires:now()+5*60_000,promise:radio(seedId,{limit:40,timeout:12_000,signal})};
          radioCache.set(seedId,cached);
          while(radioCache.size>30)radioCache.delete(radioCache.keys().next().value);
        }
        try{return await cached.promise}catch(error){radioCache.delete(seedId);throw error}
      });
    }
    const outcomes=await Promise.allSettled(jobs.map(job=>job()));
    signal?.throwIfAborted();
    const successes=outcomes.filter(result=>result.status==='fulfilled');
    if(!successes.length)throw outcomes[0].reason;
    const buckets=successes.map(result=>Array.isArray(result.value)?result.value:[]),seen=new Set(),result=[];
    // Interleave so a full search page cannot hide every radio candidate.
    for(let index=0;result.length<limit&&buckets.some(bucket=>index<bucket.length);index++)for(const bucket of buckets){
      const track=bucket[index],key=track?.id;
      if(!key||key===seedId||seen.has(key)||result.length>=limit)continue;
      seen.add(key);result.push(track);
    }
    return result;
  };
}
