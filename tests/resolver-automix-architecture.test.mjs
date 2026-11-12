import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {recordingIdentity} from '../backend/src/recording-identity.js';
import {spotifyMatchCandidateTimeMs,spotifyMatchQueryTimeMs,spotifyMatchSearchTimeMs,spotifyPlaybackMatchRejection,rankSpotifyPlaybackCandidates,resolveSpotifyPlayback} from '../backend/src/spotify-playback.js';
import {canonicalYouTubeVideoUrl,applyResolvedPlayback,YouTubeSearchTemporarilyUnavailableError,youtubeClientStrategies,youtubeResolutionStrategies,youtubeSearchInput,youtubeSearchUrl,normalizeYouTubeEntries} from '../backend/src/audio/youtube-client.js';
import {PlaybackMappingCache,initializePlaybackMappings} from '../backend/src/playback-mapping-cache.js';
import {createRecommendationProvider} from '../backend/src/recommendation-sources.js';
import {autoplayCandidateMatchesPreferences,sameRecommendationFamily} from '../backend/src/autoplay.js';

const video=(id,title,extra={})=>({id,title,duration:200,...extra});
const playback=(id,duration=200,extra={})=>({id,duration,url:'https://example.com/'+id,...extra});
const resolve=(item,search,resolve)=>resolveSpotifyPlayback(item,null,{search,resolve,canonicalUrl:canonicalYouTubeVideoUrl,applyResolved:applyResolvedPlayback});

test('known problem tracks retain exact recording identity across artist order and Topic uploads',()=>{
  const cases=[
    ['Shirukid, Cy_He, NoCheats – brief an die zukunft (Cy_He & NoCheats Remix)','Shirukid – brief an die zukunft (NoCheats, Cy_He Remix)'],
    ['Major Conspiracy, The Dark Horror – WAZAAAA','The Dark Horror & Major Conspiracy – WAZAAAA (OFFICIAL VIDEOCLIP)'],
    ['High Tekk, indica. – Unendlichkeit','Unendlichkeit'],
    ['FEDX, KICKARTZ – Mach die Beat an Jungö - Remix','KICKARTZ & FEDX – Mach die Beat an Jungö (Remix)'],
    ['GPF – ALORS ON FUCK','GPF – ALORS ON F*** (Official Audio)'],
    ['Alligatoah – Alli-Alligatoah','Alligatoah – Alli-Alligatoah (Official Audio)'],
    ['New Kids, Paul Elstak, Satirized, Aalst – Turbo (Satirized & Aalst Turbo Saté Remix)','New Kids – Turbo (Satirized & Aalst Turbo Saté Remix)']
  ];
  for(const [wanted,actual] of cases)assert.equal(spotifyPlaybackMatchRejection({title:wanted,duration:200},video('abcdefghijk',actual,{channel:'High Tekk - Topic'})),null,wanted);
});

test('all requested variants remain distinct, including in automix playback',()=>{
  const versions=['',' (DJ Remix)',' (Extended Mix)',' (Live)',' (Acoustic)',' (Instrumental)',' (Slowed)',' (Sped-Up)',' (Radio Edit)',' (Karaoke)',' (Nightcore)',' (Rework)',' (Bootleg)'];
  for(const wanted of versions)for(const actual of versions){
    const track={title:'Artist – Song'+wanted,duration:200,autoplayMode:'similar'},candidate=video('abcdefghijk','Artist – Song'+actual);
    assert.equal(spotifyPlaybackMatchRejection(track,candidate)===null,wanted===actual,`${wanted} versus ${actual}`);
  }
  assert.equal(spotifyPlaybackMatchRejection({title:'Artist – Song (DJ A & DJ B Remix)'},video('abcdefghijk','Artist – Song (DJ A Remix)')),'version');
  assert.equal(spotifyPlaybackMatchRejection({title:'Artist – Song (DJ A Remix)'},video('abcdefghijk','Artist – Song (DJ B Remix)')),'version');
  assert.equal(spotifyPlaybackMatchRejection({title:'Artist – Live Forever'},video('abcdefghijk','Artist – Live Forever (Official Audio)')),null);
});

test('structured catalog data and artist objects survive bare song titles with version suffixes',()=>{
  const track={title:'display only',trackTitle:'brief an die zukunft - Cy_He & NoCheats Remix',artists:[{name:'Shirukid'},{name:'Cy_He'},{name:'NoCheats'}],isrc:'DEABC2600123',duration:200};
  const candidate=video('abcdefghijk','brief an die zukunft - NoCheats & Cy_He Remix',{artists:['Shirukid','NoCheats','Cy_He'],channel:'Shirukid - Topic',isrc:'DEABC2600123'});
  assert.equal(spotifyPlaybackMatchRejection(track,candidate),null);
  assert.deepEqual(recordingIdentity(candidate).remixArtists,['cy he','nocheats']);
});

test('queries cannot prove artist identity and ISRC cannot override conflicting version or duration',()=>{
  const track={title:'Artist – Song',isrc:'DEABC2600123',duration:200};
  assert.equal(spotifyPlaybackMatchRejection(track,video('abcdefghijk','Song',{channel:'Release - Topic',searchQuery:'Artist Song'})),'artist');
  assert.equal(spotifyPlaybackMatchRejection(track,video('abcdefghijk','Artist – Song',{isrc:'DEABC2600124'})),'identity');
  assert.equal(spotifyPlaybackMatchRejection(track,video('abcdefghijk','Artist – Song (Live)',{isrc:track.isrc})),'version');
  assert.equal(spotifyPlaybackMatchRejection(track,video('abcdefghijk','Artist – Song',{duration:240,isrc:track.isrc})),'duration');
  assert.equal(spotifyPlaybackMatchRejection(track,video('abcdefghijk','Artist – Song Two')),'title');
});

test('resolver tries strict YTM matches immediately and falls back to YouTube after dead videos',async()=>{
  const calls=[],attempts=[],item={id:'pool-test',source:'spotify',title:'Artist – Song',isrc:'DEABC2600123',duration:200};
  await resolve(item,async(query,{provider})=>{
    calls.push(provider);
    if(provider==='youtube')return [video('12345678901','Artist – Song')];
    return calls.length===1?[video('abcdefghijk','Artist – Song')]:[video('lmnopqrstuv','Artist – Song',{isrc:item.isrc})];
  },async url=>{
    const id=new URL(url).searchParams.get('v');attempts.push(id);
    if(id!=='12345678901')throw Error('Video unavailable');
    return playback(id);
  });
  assert.deepEqual(attempts,['abcdefghijk','12345678901']);
  assert.equal(calls[0],'youtube-music');
  assert.deepEqual(calls,['youtube-music','youtube']);
});

test('resolver returns the first strict playable result with bounded query and candidate budgets',async()=>{
  const calls=[],deadlines=[],item={id:'fast-path',source:'spotify',title:'Artist – Song',duration:200};
  await resolve(item,async(query,options)=>{calls.push({query,...options});return [video('abcdefghijk','Artist – Song')]},async(url,signal,options)=>{deadlines.push(options.deadline-Date.now());return playback('abcdefghijk')});
  assert.equal(calls.length,1);
  assert.equal(calls[0].provider,'youtube-music');
  assert.ok(calls[0].timeout<=6_000);
  assert.ok(deadlines[0]>0&&deadlines[0]<=spotifyMatchCandidateTimeMs);
  assert.equal(spotifyMatchQueryTimeMs,12_000);
  assert.equal(spotifyMatchSearchTimeMs,30_000);
});

test('Spotify prefetch keeps candidate IDs and opens fresh media only at playback',async()=>{
  const item={id:'metadata-prefetch',source:'spotify',title:'Artist – Song',duration:200};
  const options={canonicalUrl:canonicalYouTubeVideoUrl,applyResolved:applyResolvedPlayback};
  const candidates=await resolveSpotifyPlayback(item,null,{
    ...options,prepareOnly:true,
    search:async()=>[video('abcdefghijk','Artist – Song'),video('lmnopqrstuv','Artist – Song')],
    resolve:async()=>assert.fail('prefetch must not open media')
  });
  assert.deepEqual(candidates.map(candidate=>candidate.id),['abcdefghijk','lmnopqrstuv']);
  assert.equal(item.playbackMatch,undefined);

  const attempts=[];
  const url=await resolveSpotifyPlayback(item,null,{
    ...options,preparedCandidates:candidates,
    search:async()=>assert.fail('a usable prepared candidate must avoid another search'),
    resolve:async url=>{
      const id=new URL(url).searchParams.get('v');
      attempts.push(id);
      if(id==='abcdefghijk')throw Error('Video unavailable');
      return playback(id);
    }
  });
  assert.deepEqual(attempts,['abcdefghijk','lmnopqrstuv']);
  assert.equal(url,'https://example.com/lmnopqrstuv');
  assert.equal(item.playbackVideoId,'lmnopqrstuv');
});

test('slow YTM search falls back once to ytsearch while a fully slow search stays retryable',async()=>{
  const item={id:'slow-search',source:'spotify',title:'Artist – Song',duration:200},calls=[];
  await resolve(item,async(query,{provider})=>{
    calls.push(provider);
    if(provider==='youtube-music')throw new YouTubeSearchTemporarilyUnavailableError('yt-dlp Zeitüberschreitung');
    return [video('abcdefghijk','Artist – Song')];
  },async()=>playback('abcdefghijk'));
  assert.deepEqual(calls,['youtube-music','youtube']);
  await assert.rejects(resolve({...item,id:'fully-slow',playbackMatch:null},async()=>{throw new YouTubeSearchTemporarilyUnavailableError('yt-dlp Zeitüberschreitung')},async()=>playback('abcdefghijk')),{code:'YOUTUBE_SEARCH_TEMPORARILY_UNAVAILABLE'});
  assert.equal(youtubeSearchInput('Artist Song','youtube',10),'ytsearch10:Artist Song');
  assert.equal(youtubeSearchInput('Artist Song','youtube-music',10),'https://music.youtube.com/search?q=Artist%20Song#songs');
});

test('each playback resolution tries exactly one client so player fallbacks cannot nest',()=>{
  assert.deepEqual(youtubeResolutionStrategies(''),[youtubeClientStrategies[0]]);
  assert.deepEqual(youtubeResolutionStrategies('web_safari'),[youtubeClientStrategies[1]]);
  assert.deepEqual(youtubeResolutionStrategies('web_embedded'),[youtubeClientStrategies[2]]);
});

test('cached mappings survive reload and dead IDs trigger fresh resolution; stale identity never bypasses matching',async t=>{
  const dir=await fs.mkdtemp(path.join(os.tmpdir(),'music-mapping-'));
  t.after(async()=>{await initializePlaybackMappings('');await fs.rm(dir,{recursive:true,force:true})});
  const file=path.join(dir,'mappings.json');await initializePlaybackMappings(file);
  const original={id:'persistent',source:'spotify',title:'Artist – Song',duration:200};
  await resolve({...original},async()=>[video('abcdefghijk','Artist – Song')],async()=>playback('abcdefghijk'));
  await initializePlaybackMappings(file);
  await resolve({...original},async()=>{throw Error('cache should avoid search')},async()=>playback('abcdefghijk'));
  const attempts=[],item={...original};
  await resolve(item,async()=>[video('abcdefghijk','Artist – Song'),video('lmnopqrstuv','Artist – Song')],async url=>{
    const id=new URL(url).searchParams.get('v');attempts.push(id);if(id==='abcdefghijk')throw Error('Video unavailable');return playback(id);
  });
  assert.deepEqual(attempts,['abcdefghijk','lmnopqrstuv']);
  assert.equal(item.playbackVideoId,'lmnopqrstuv');
  const changed={...original,title:'Artist – Song (Live)'};
  await resolve(changed,async()=>[video('12345678901',changed.title)],async url=>playback(new URL(url).searchParams.get('v')));
  assert.equal(changed.playbackVideoId,'12345678901');
  assert.equal((await new PlaybackMappingCache(file).load()).size,2);
  const contents=await fs.readFile(file,'utf8');assert.ok(!contents.includes('https://example.com'));
});

test('missing durations, changed source IDs and changed resolved metadata are not silently accepted',async()=>{
  for(const invalid of [playback('abcdefghijk',0),playback('lmnopqrstuv'),playback('abcdefghijk',200,{title:'Artist – Different Song'})]){
    const item={id:'unverified-'+JSON.stringify(invalid),source:'spotify',title:'Artist – Song',duration:200};
    await assert.rejects(resolve(item,async()=>[video('abcdefghijk','Artist – Song',{duration:0})],async()=>invalid),{code:'SPOTIFY_MATCH_UNAVAILABLE'});
  }
});

test('YTM adapter selects songs and preserves structured provider metadata',()=>{
  assert.equal(youtubeSearchUrl('Artist & Song','youtube-music'),'https://music.youtube.com/search?q=Artist%20%26%20Song#songs');
  const tracks=normalizeYouTubeEntries({entries:[{id:'abcdefghijk',title:'Song',artists:['Artist'],album:'Album',duration:200},{id:'not-video',title:'Channel'}]},30,'youtube-music');
  assert.equal(tracks.length,1);assert.deepEqual(tracks[0].artists,['Artist']);assert.equal(tracks[0].provider,'youtube-music');
});

test('recommendation providers run sequentially, deduplicate, cache radio and tolerate individual outages',async()=>{
  let radios=0,active=0,maxActive=0;
  const operation=async callback=>{active++;maxActive=Math.max(maxActive,active);await new Promise(resolve=>setImmediate(resolve));try{return callback()}finally{active--}};
  const recommend=createRecommendationProvider({radio:async()=>operation(()=>{radios++;return [video('abcdefghijk','Seed'),video('lmnopqrstuv','Artist – Radio Song')]}),search:async(query,{provider})=>operation(()=>{
    if(provider==='youtube-music')throw Error('temporary failure');
    return [video('12345678901','Artist – Search Song'),video('lmnopqrstuv','Duplicate')];
  })});
  for(let i=0;i<2;i++)assert.deepEqual((await recommend({source:'youtube',id:'abcdefghijk'},{query:'Artist',limit:10})).map(track=>track.id),['12345678901','lmnopqrstuv']);
  assert.equal(radios,1);
  assert.equal(maxActive,1);
  const aborted=new AbortController();aborted.abort();await assert.rejects(recommend({}, {signal:aborted.signal}),{name:'AbortError'});
});

test('automix distinguishes variant discoveries while guarding unlearned directions even for known artists',()=>{
  const original={title:'Artist – Song'},remix={title:'Artist – Song (DJ Remix)'};
  assert.equal(sameRecommendationFamily(original,remix),false);
  assert.equal(sameRecommendationFamily(remix,{title:'Artist – Song (DJ Remix) (Official Audio)'}),true);
  for(const genre of ['Metal','Schlager','Classical']){
    const candidate={title:`Artist – ${genre} Song`};
    assert.equal(autoplayCandidateMatchesPreferences(candidate,{preferredArtists:['Artist']}),false);
    assert.equal(autoplayCandidateMatchesPreferences(candidate,{preferredArtists:['Artist'],preferredStyles:[genre]}),true);
  }
  for(const title of ['Klassische Musik','Berliner Symphonie','Mozart Sonate'])assert.equal(autoplayCandidateMatchesPreferences({title:`Artist – ${title}`},{preferredArtists:['Artist']}),false);
  assert.equal(autoplayCandidateMatchesPreferences({title:'Artist – Song (Slowed)'},{preferredArtists:['Artist']}),true);
});
