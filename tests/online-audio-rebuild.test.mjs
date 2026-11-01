import test from 'node:test';
import assert from 'node:assert/strict';
import {rejectSpotifyPlaybackMatch,resolveSpotify,SpotifyMatchUnavailableError,SpotifySourceTemporarilyUnavailableError,spotifyPlaybackArtistCompatible,spotifyPlaybackCandidateScore,spotifyPlaybackDurationCompatible,spotifyPlaybackMatchRejection,spotifyPlaybackSearchQueries} from '../backend/src/media.js';
import {createTasteModel,scoreTasteCandidate} from '../backend/src/music-taste.js';
import {autoplayCandidateMatchesPreferences} from '../backend/src/autoplay.js';

const candidate=(id,title,channel,duration)=>({id,title,channel,source:'youtube',duration,url:`https://www.youtube.com/watch?v=${id}`});
const resolved=(id,duration)=>({id,duration,url:`https://rr1---sn-test.googlevideo.com/videoplayback?id=${id}`,protocol:'https',headers:{'User-Agent':'exact'}});

test('new Spotify matcher accepts exact originals without requiring every collaborator in the upload metadata',()=>{
  const track={title:'Major Conspiracy, The Dark Horror – WAZAAAA',source:'spotify',duration:168};
  const video=candidate('abcdefghijk','Major Conspiracy & The Dark Horror - WAZAAAA (OFFICIAL VIDEOCLIP)','Major Conspiracy',168);
  assert.equal(spotifyPlaybackMatchRejection(track,video),null);
  assert.equal(spotifyPlaybackArtistCompatible(track,video),true);
  assert.ok(spotifyPlaybackCandidateScore(track,video)>70);
});

test('primary artist channel can recover a title even when Spotify lists another collaborator',()=>{
  const track={title:'High Tekk, indica. – Unendlichkeit',source:'spotify',duration:139};
  const video=candidate('lmnopqrstuv','Unendlichkeit','High Tekk',139);
  assert.equal(spotifyPlaybackMatchRejection(track,video),null);
});

test('obviously different artists, titles and unrequested versions remain blocked',()=>{
  const track={title:'Artist – My Song',source:'spotify',duration:180};
  assert.equal(spotifyPlaybackMatchRejection(track,candidate('abcdefghijk','Other Artist – My Song','Other Artist',180)),'artist');
  assert.equal(spotifyPlaybackMatchRejection(track,candidate('lmnopqrstuv','Artist – Another Song','Artist',180)),'title');
  assert.equal(spotifyPlaybackMatchRejection(track,candidate('12345678901','Artist – My Song (Super Slowed)','Artist',180)),'version');
});

test('obvious reactions and tutorials are never accepted as a Spotify audio source',()=>{
  const track={title:'Major Conspiracy, The Dark Horror – WAZAAAA',source:'spotify',duration:168};
  assert.equal(spotifyPlaybackMatchRejection(track,candidate('abcdefghijk','Major Conspiracy & The Dark Horror - WAZAAAA Reaction','Major Conspiracy',168)),'source');
  assert.equal(spotifyPlaybackMatchRejection(track,candidate('lmnopqrstuv','How to make WAZAAAA - Tutorial','Major Conspiracy',168)),'source');
});

test('duration policy tolerates ordinary metadata drift but rejects a different recording',()=>{
  assert.equal(spotifyPlaybackDurationCompatible(200,210),true);
  assert.equal(spotifyPlaybackDurationCompatible(200,211),false);
  assert.equal(spotifyPlaybackDurationCompatible(120,139),false);
});

test('search plan is short, exact-first and still contains artist-scoped fallbacks',()=>{
  const queries=spotifyPlaybackSearchQueries({title:'GPF – ALORS ON FUCK'});
  assert.ok(queries.length<=6);
  assert.match(queries[0],/GPF.*ALORS ON FUCK/);
  assert.ok(queries.every(query=>/ALORS ON FUCK/.test(query)));
});

test('resolver tries the next scored source after an unreachable candidate',async()=>{
  const item={id:'spotify:test',title:'Artist – Song',source:'spotify',duration:180},attempts=[];
  const videos=[candidate('abcdefghijk','Artist – Song','Artist - Topic',180),candidate('lmnopqrstuv','Artist – Song (Official Audio)','Artist',181)];
  const url=await resolveSpotify(item,null,{search:async()=>videos,resolve:async source=>{const id=new URL(source).searchParams.get('v');attempts.push(id);if(id==='abcdefghijk')throw new Error('Video unavailable');return resolved(id,181)}});
  assert.match(url,/lmnopqrstuv/);
  assert.deepEqual(attempts,['abcdefghijk','lmnopqrstuv']);
  assert.equal(item.title,'Artist – Song');
  assert.equal(item.playbackMatch.id,'lmnopqrstuv');
});

test('missing yt-dlp duration falls back to verified search metadata instead of reporting no audio',async()=>{
  const item={id:'spotify:duration',title:'Artist – Song',source:'spotify',duration:180},video=candidate('12345678901','Artist – Song','Artist',182);
  await resolveSpotify(item,null,{search:async()=>[video],resolve:async()=>resolved(video.id,0)});
  assert.equal(item.catalogDuration,180);
  assert.equal(item.duration,182);
  assert.equal(item.playbackDuration,182);
});

test('unavailable titles fail once with compact diagnostics instead of fabricated playback',async()=>{
  const item={id:'spotify:none',title:'Artist – Rare Song',source:'spotify',duration:180};
  await assert.rejects(resolveSpotify(item,null,{search:async()=>[candidate('abcdefghijk','Another Artist – Other Song','Another Artist',180)],resolve:async()=>{throw new Error('must not resolve')}}),error=>{
    assert.ok(error instanceof SpotifyMatchUnavailableError);
    assert.ok(error.diagnostics.title+error.diagnostics.artist>0);
    return true;
  });
});

test('an exact Spotify match blocked by 403 is retained for a later retry instead of becoming a false matching failure',async()=>{
  const item={id:'spotify:alligatoah',title:'Alligatoah – Alli-Alligatoah',source:'spotify',duration:236,playbackVideoId:'abcdefghijk',playbackMatch:{id:'abcdefghijk',title:'Alligatoah – Alli-Alligatoah'}};
  assert.equal(rejectSpotifyPlaybackMatch(item),true);
  await assert.rejects(resolveSpotify(item,null,{search:async()=>[candidate('abcdefghijk','Alligatoah – Alli-Alligatoah (Official Audio)','Alligatoah',236)],resolve:async()=>{throw new Error('must wait')}}),error=>error instanceof SpotifySourceTemporarilyUnavailableError);
  assert.equal(item._spotifyRejectedPlaybackIds,undefined);
});

test('genre search context alone cannot admit an unrelated official-audio result',()=>{
  const model=createTasteModel({preferredStyles:['Uptempo']});
  const unrelated=scoreTasteCandidate({title:'Copper Alley – See You On The Outfield (Official Audio)',artist:'Copper Alley'},model,{queryStyle:'Uptempo'});
  assert.equal(unrelated.allowed,false);
  assert.equal(autoplayCandidateMatchesPreferences({title:'Copper Alley – See You On The Outfield (Official Audio)',artist:'Copper Alley'},{preferredStyles:['Uptempo'],queryStyle:'Uptempo'}),false);
  assert.equal(autoplayCandidateMatchesPreferences({title:'DJ Nova – Uptempo Bass Attack',artist:'DJ Nova'},{preferredStyles:['Uptempo'],queryStyle:'Uptempo'}),true);
});

test('taste engine still blocks explicit conflicting genres and wrong artist buckets',()=>{
  assert.equal(autoplayCandidateMatchesPreferences({title:'Band – Uptempo Metal Mix',artist:'Band'},{preferredStyles:['Uptempo'],queryStyle:'Uptempo'}),false);
  assert.equal(autoplayCandidateMatchesPreferences({title:'Other – Fresh Song',artist:'Other'},{preferredArtists:['Trusted DJ'],queryArtist:'Trusted DJ'}),false);
  assert.equal(autoplayCandidateMatchesPreferences({title:'Trusted DJ – Fresh Song',artist:'Trusted DJ'},{preferredArtists:['Trusted DJ'],queryArtist:'Trusted DJ'}),true);
});
