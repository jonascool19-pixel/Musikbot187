import {playbackMappings} from './playback-mapping-cache.js';
import {recordingIdentity,recordingCacheKey,artistNames} from './recording-identity.js';

const videoIdPattern=/^[A-Za-z0-9_-]{11}$/;
const ignoredWords=new Set(['official','video','videoclip','audio','lyrics','lyric','topic','music','musik','visualizer','visualiser','provided','youtube']);
const nonMusicPattern=/\b(?:reaction|review|tutorial|interview|documentary|making\s+of|behind\s+the\s+scenes|podcast|gameplay|trailer)\b/iu;
const normalize=value=>String(value||'').normalize('NFKD').replace(/\p{M}/gu,'').replace(/ß/g,'ss').replace(/[øØ]/g,'o').replace(/[łŁ]/g,'l').toLocaleLowerCase('de-DE');
const words=value=>normalize(value).match(/[\p{L}\p{N}*#]+/gu)?.filter(word=>word.length>1&&!ignoredWords.has(word))||[];
const unique=value=>[...new Set(value)];
const canonicalArtist=value=>normalize(value).replace(/[^\p{L}\p{N}]+/gu,'');
const splitArtists=value=>String(value||'').replace(/\b(?:feat(?:uring)?|ft)\.?\b/giu,',').split(/\s*(?:,|;|&|\+|\s+[x×]\s+|\band\b|\bund\b)\s*/iu).map(value=>value.trim()).filter(Boolean);
const splitCatalogTitle=track=>{
  const full=String(track?.title||'').trim(),parts=full.split(/\s+[–—-]\s+/u);
  return parts.length>1?{artists:parts.shift(),song:parts.join(' – ')}:{artists:String(track?.artist||''),song:full};
};
const cleanDecoration=value=>String(value||'').replace(/\s*[\[(]\s*(?:official\s+)?(?:music\s+)?(?:audio|video(?:clip)?|lyrics?|visuali[sz]er)\s*[\])]\s*$/giu,'').replace(/\s*\|\s*(?:official\s+)?(?:audio|video(?:clip)?|lyrics?|visuali[sz]er)\s*$/giu,'').trim();
const candidateIdentity=candidate=>{
  const raw=cleanDecoration(candidate?.title),parts=raw.split(/\s+[–—✖×-]\s+/u),channel=String(candidate?.channel||candidate?.uploader||candidate?.artist||'').replace(/\s*-\s*Topic$/iu,'').replace(/\s+Official(?:\s+YouTube)?\s+Channel$/iu,'').trim();
  if(parts.length===2&&/^(?:(?:super|ultra)\s+)?(?:slowed|sped\s*up|nightcore)(?:\s*\+?\s*reverb)?$/iu.test(parts[1].trim()))return {artist:String(candidate?.artist||'').trim(),song:raw,channel};
  if(parts.length>1)return {artist:parts.shift().trim(),song:parts.join(' – ').trim(),channel};
  return {artist:String(candidate?.artist||'').trim(),song:raw,channel};
};
const tokenCoverage=(expected,actual)=>{
  const remaining=[...actual];let matches=0;
  for(const wanted of expected){const index=remaining.findIndex(seen=>spotifyPlaybackWordEquivalent(wanted,seen));if(index>=0){matches++;remaining.splice(index,1)}}
  return {matches,ratio:expected.length?matches/expected.length:0,extra:remaining};
};
const rejectedIds=item=>new Set((Array.isArray(item?._spotifyRejectedPlaybackIds)?item._spotifyRejectedPlaybackIds:[]).map(String).filter(id=>videoIdPattern.test(id)));
const cacheKey=recordingCacheKey;


export function spotifyPlaybackWordEquivalent(expected,actual){
  expected=normalize(expected);actual=normalize(actual);if(expected===actual)return true;
  if(/[\*#]/u.test(actual)){const pattern='^'+[...actual].map(character=>character==='*'||character==='#'?'[a-z]':character.replace(/[.*+?^${}()|[\]\\]/g,'\\$&')).join('')+'$';if(new RegExp(pattern,'u').test(expected))return true;if(/^f[\*#]{3}$/u.test(actual)&&['fuck','fick'].includes(expected))return true}
  if(expected.length<6||actual.length<6||Math.abs(expected.length-actual.length)>1||expected.slice(0,3)!==actual.slice(0,3))return false;
  let left=0,right=0,edits=0;while(left<expected.length&&right<actual.length){if(expected[left]===actual[right]){left++;right++;continue}if(++edits>1)return false;if(expected.length>actual.length)left++;else if(actual.length>expected.length)right++;else{left++;right++}}
  return edits+(expected.length-left)+(actual.length-right)<=1;
}

export function spotifyPlaybackDurationToleranceSeconds(duration){const seconds=Math.max(0,Number(duration)||0);return seconds?Math.max(5,Math.min(12,seconds*.05)):0}
export function spotifyPlaybackDurationCompatible(catalogDuration,playbackDuration){const target=Math.max(0,Number(catalogDuration)||0),actual=Math.max(0,Number(playbackDuration)||0);return !target||!actual||Math.abs(target-actual)<=spotifyPlaybackDurationToleranceSeconds(target)}

export function spotifyPlaybackArtistCompatible(track,candidate){
  const expected=recordingIdentity(track),actual=recordingIdentity(candidate);
  if(!expected.artists.length)return Boolean(expected.isrc&&expected.isrc===actual.isrc);
  const credits=[...actual.artists,actual.channel];
  return expected.artists.some(name=>credits.includes(name));
}
export function spotifyPlaybackMatchRejection(track,candidate){
  if(!candidate?.title||nonMusicPattern.test(String(candidate.title)))return 'source';
  const expected=recordingIdentity(track),actual=recordingIdentity(candidate);
  if(expected.isrc&&actual.isrc&&expected.isrc!==actual.isrc)return 'identity';
  if(JSON.stringify(expected.versions)!==JSON.stringify(actual.versions))return 'version';
  if(JSON.stringify(expected.remixArtists)!==JSON.stringify(actual.remixArtists))return 'version';
  const wanted=words(expected.base),seen=words(actual.base),coverage=tokenCoverage(wanted,seen);
  if(!wanted.length||coverage.matches!==wanted.length||coverage.extra.length)return 'title';
  if(!spotifyPlaybackArtistCompatible(track,candidate))return 'artist';
  if(!spotifyPlaybackDurationCompatible(expected.duration,actual.duration))return 'duration';
  return null;
}

export const spotifyPlaybackTitleCompatible=(track,candidate)=>spotifyPlaybackMatchRejection(track,candidate)===null;

export function spotifyPlaybackCandidateScore(track,candidate){
  const expected=recordingIdentity(track),actual=recordingIdentity(candidate),coverage=tokenCoverage(words(expected.base),words(actual.base));
  const durationScore=expected.duration&&actual.duration?Math.max(0,20-Math.abs(expected.duration-actual.duration)/Math.max(1,spotifyPlaybackDurationToleranceSeconds(expected.duration))*10):0;
  const artistScore=spotifyPlaybackArtistCompatible(track,candidate)?25:0;
  const topic=/ - Topic$/iu.test(String(candidate.channel||''))&&expected.artists.includes(actual.channel)?5:0;
  return coverage.ratio*55+artistScore+durationScore+topic+(expected.isrc&&expected.isrc===actual.isrc?50:0)+(expected.album&&expected.album===actual.album?5:0)+(candidate.provider==='youtube-music'?5:0);

}

export function rankSpotifyPlaybackCandidates(track,candidates,{canonicalUrl}={}){
  const rejected=rejectedIds(track),available=[];
  for(const candidate of Array.isArray(candidates)?candidates:[]){const url=canonicalUrl?canonicalUrl(candidate?.id,candidate?.url):String(candidate?.url||''),id=String(candidate?.id||'');if(!candidate?.title||rejected.has(id)||spotifyPlaybackMatchRejection(track,candidate))continue;if(canonicalUrl&&!url)continue;if(spotifyPlaybackCandidateScore(track,candidate)<80)continue;available.push(candidate)}
  return available.sort((left,right)=>spotifyPlaybackCandidateScore(track,right)-spotifyPlaybackCandidateScore(track,left));
}
export const selectSpotifyPlaybackCandidate=(track,candidates,options)=>rankSpotifyPlaybackCandidates(track,candidates,options)[0]||null;

export function spotifyPlaybackSearchQueries(item){
  const identity=recordingIdentity(item),song=identity.song,artists=artistNames(item.artists).join(', ')||splitCatalogTitle(item).artists,names=splitArtists(artists),primary=names[0]||artists,all=names.join(' '),exact=[artists,song].filter(Boolean).join(' – '),isrc=/^[A-Z]{2}[A-Z0-9]{3}\d{7}$/i.test(String(item?.isrc||''))?String(item.isrc).toUpperCase():'';
  return unique([
    isrc?`"${isrc}"`:'',
    exact?`"${exact}" audio`:'',
    primary&&song?`"${primary}" "${song}" official audio`:'',
    all&&song?`${all} "${song}" audio`:'',
    primary&&song?`${primary} "${song}" Topic`:'',
    primary&&song?`${primary} ${song}`:'',
    identity.remixArtists.length?`${primary} ${song} ${identity.remixArtists.join(" ")}`:'',
    identity.album?`${all} ${song} ${identity.album}`:'',
    song?`"${song}" audio`:''
  ].map(value=>value.trim()).filter(Boolean));
}

export const spotifyMatchSearchLimit=30;
export const spotifyMatchResolveLimit=15;
export const spotifyMatchSearchTimeMs=75_000;
const reasonLabels=Object.freeze({artist:'falscher Künstler',version:'falsche Version',title:'abweichender Titel',duration:'unpassende Länge',identity:'abweichende Aufnahme-ID',source:'nicht erreichbare Quelle',search:'fehlgeschlagene YouTube-Suche'});
export class SpotifyMatchUnavailableError extends Error{
  constructor(item,diagnostics={}){const counts=Object.entries(reasonLabels).filter(([key])=>diagnostics[key]>0).map(([key,label])=>`${label}: ${diagnostics[key]}`),duration=Math.max(0,Number(item?.catalogDuration??item?.duration)||0);super(`Spotify-Titel „${String(item?.title||'Unbekannt').slice(0,160)}“ konnte derzeit keiner abspielbaren YouTube-Quelle zugeordnet werden. ${counts.join(', ')||'Keine verwertbaren Suchtreffer'}.${duration?` Katalogdauer: ${Math.round(duration)} s (Toleranz ±${Math.round(spotifyPlaybackDurationToleranceSeconds(duration))} s).`:''}`);this.name='SpotifyMatchUnavailableError';this.code='SPOTIFY_MATCH_UNAVAILABLE';this.diagnostics=diagnostics}
}
export const isSpotifyMatchUnavailableError=error=>error?.code==='SPOTIFY_MATCH_UNAVAILABLE';
export class SpotifySourceTemporarilyUnavailableError extends Error{
  constructor(item){super(`Spotify-Titel „${String(item?.title||'Unbekannt').slice(0,160)}“ ist eindeutig zugeordnet, aber die passende YouTube-Quelle verweigert vorübergehend den Medienzugriff.`);this.name='SpotifySourceTemporarilyUnavailableError';this.code='SPOTIFY_SOURCE_TEMPORARILY_UNAVAILABLE';this.retryAfterMs=30_000}
}
export const isSpotifySourceTemporarilyUnavailableError=error=>error?.code==='SPOTIFY_SOURCE_TEMPORARILY_UNAVAILABLE';
export const spotifyOfficialMusicVideoFallbackCandidate=(track,candidate)=>spotifyPlaybackTitleCompatible(track,candidate)&&spotifyPlaybackDurationCompatible(track?.catalogDuration??track?.duration,candidate?.duration);

export function rejectSpotifyPlaybackMatch(item){
  if(item?.source!=='spotify')return false;const id=String(item.playbackVideoId||item.playbackMatch?.id||'');if(!videoIdPattern.test(id))return false;
  Object.defineProperty(item,'_spotifyRejectedPlaybackIds',{value:[id,...rejectedIds(item)].slice(0,12),writable:true,configurable:true,enumerable:false});playbackMappings.delete(cacheKey(item));
  for(const key of ['playbackMatch','playbackVideoId','playbackProtocol','playbackDuration','playbackVersion','playbackHeaders','_youtubePlaybackClient'])delete item[key];if(Number(item.catalogDuration)>0)item.duration=Number(item.catalogDuration);return true;
}

export async function resolveSpotifyPlayback(item,signal,{search,resolve,canonicalUrl,applyResolved,isAccessBlocked=()=>false,isProviderOutage=()=>false}={}){
  const key=cacheKey(item),catalogDuration=Math.max(0,Number(item.catalogDuration??item.duration)||0),deadline=Date.now()+spotifyMatchSearchTimeMs,diagnostics={artist:0,version:0,title:0,duration:0,source:0,search:0},checked=new Set(),seen=new Set(),queries=spotifyPlaybackSearchQueries(item),cached=playbackMappings.get(key)||(item.playbackMatch?.identityKey===key?item.playbackMatch:null);
  const accept=async(resolved,candidate)=>{if(resolved?.id&&resolved.id!==candidate.id)throw new Error('YouTube-Quelle hat eine abweichende Video-ID.');if(resolved?.title&&spotifyPlaybackMatchRejection(item,{...candidate,title:resolved.title,trackTitle:'',duration:resolved.duration||candidate.duration}))throw new Error('YouTube-Quelle hat abweichende Aufnahmemetadaten.');const actualDuration=Math.max(0,Number(resolved?.duration)||Number(candidate?.duration)||0),combined={...resolved,duration:actualDuration,id:resolved?.id||candidate.id};if(catalogDuration&&!actualDuration)throw new Error('YouTube-Quelle liefert keine prüfbare Dauer.');if(catalogDuration&&!spotifyPlaybackDurationCompatible(catalogDuration,actualDuration))throw new Error('YouTube-Quelle hat eine deutlich abweichende Laufzeit.');applyResolved(item,combined);delete item._spotifySourceAccessRetries;item.playbackVersion='scored-match';item.playbackMatch={id:combined.id,title:candidate.title,artist:candidate.artist||'',artists:candidate.artists||[],trackTitle:candidate.trackTitle||'',isrc:candidate.isrc||'',provider:candidate.provider||'youtube',channel:candidate.channel||'',duration:actualDuration,catalogDuration,protocol:combined.protocol||'',score:spotifyPlaybackCandidateScore(item,candidate),version:'scored-match',identityKey:key,expires:Date.now()+6*60*60_000};playbackMappings.set(key,{...item.playbackMatch,expires:Date.now()+6*60*60_000});while(playbackMappings.size>500)playbackMappings.delete(playbackMappings.keys().next().value);await playbackMappings.flush();return combined.url};
  const tryCandidate=async candidate=>{const url=canonicalUrl(candidate?.id,candidate?.url),id=url?new URL(url).searchParams.get('v'):'';if(!url||checked.has(id))return null;checked.add(id);try{return await resolve(url,signal,{deadline}).then(resolved=>accept(resolved,{...candidate,id}))}catch(error){if(error.name==='AbortError'||isAccessBlocked(error)||isProviderOutage(error))throw error;diagnostics[/Laufzeit|Dauer/i.test(String(error.message))?'duration':'source']++;return null}};
  if(cached?.expires>Date.now()&&!rejectedIds(item).has(String(cached.id))&&!spotifyPlaybackMatchRejection(item,cached)){const result=await tryCandidate(cached);if(result)return result;playbackMappings.delete(key);delete item.playbackMatch;delete item.playbackVideoId;}
  let successfulSearch=false,lastSearchError=null,resolvedCount=0;
  for(const provider of ['youtube-music','youtube']){
    const candidates=[];
    const stageDeadline=Math.min(deadline-20_000,Date.now()+25_000);
    for(const query of queries){
      signal?.throwIfAborted();
      if(Date.now()>=stageDeadline)break;
      let found;
      try{found=await search(query,{provider,limit:spotifyMatchSearchLimit,timeout:Math.min(8_000,Math.max(1,stageDeadline-Date.now())),signal});successfulSearch=true}
      catch(error){if(error.name==='AbortError'||isAccessBlocked(error)||isProviderOutage(error))throw error;diagnostics.search++;lastSearchError=error;continue}
      for(const raw of found||[]){
        const candidate={...raw,provider,searchQuery:query},url=canonicalUrl(candidate.id,candidate.url),id=url?new URL(url).searchParams.get('v'):'';
        if(!id||seen.has(provider+id)||checked.has(id)||rejectedIds(item).has(id))continue;
        const reason=spotifyPlaybackMatchRejection(item,candidate);
        if(reason){diagnostics[reason]=(diagnostics[reason]||0)+1;continue}
        seen.add(provider+id);candidates.push({...candidate,id});
      }
    }
    let providerAttempts=0;
    for(const candidate of rankSpotifyPlaybackCandidates(item,candidates,{canonicalUrl})){
      if(provider==='youtube-music'&&providerAttempts++>=7)break;
      if(Date.now()>=deadline||resolvedCount++>=spotifyMatchResolveLimit)break;
      const result=await tryCandidate(candidate);if(result)return result;
    }
    if(Date.now()>=deadline||resolvedCount>=spotifyMatchResolveLimit)break;
  }
  if(!successfulSearch&&lastSearchError)throw lastSearchError;
  if(rejectedIds(item).size){delete item._spotifyRejectedPlaybackIds;throw new SpotifySourceTemporarilyUnavailableError(item)}
  throw new SpotifyMatchUnavailableError(item,diagnostics);
}
