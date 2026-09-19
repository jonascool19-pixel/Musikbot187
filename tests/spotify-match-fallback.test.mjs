import test from 'node:test';
import assert from 'node:assert/strict';
import {Player} from '../backend/src/player.js';
import {resolveSpotify,SpotifyMatchUnavailableError,spotifyMatchResolveLimit,spotifyPlaybackSearchQueries,spotifyPlaybackTitleCompatible} from '../backend/src/media.js';

const yt=(id,title,duration)=>({id,title,duration,url:`https://www.youtube.com/watch?v=${id}`});
const resolved=(id,duration)=>({id,duration,protocol:'https',url:`https://example.test/audio/${id}`});
const track=()=>({id:'spotify:breaking-my-heart-regression',source:'spotify',title:'Cy_He, EW – Breaking My Heart',duration:126});

test('Spotify retries a different query when the first results are 231 seconds instead of the catalogued 126',async()=>{
  const song=track(),queries=[],attempts=[];
  const search=async(query)=>{
    queries.push(query);
    return queries.length===1?[yt('abcdefghijk','Cy_He, EW – Breaking My Heart',231)]:
      [yt('lmnopqrstuv','Cy_He, EW – Breaking My Heart (Official Audio)',126)];
  };
  const resolve=async url=>{attempts.push(url);return resolved('lmnopqrstuv',126)};
  const url=await resolveSpotify(song,null,{search,resolve});
  assert.equal(url,'https://example.test/audio/lmnopqrstuv');
  assert.equal(queries.length,2);
  assert.equal(attempts.length,1,'A clearly wrong reported duration must not consume a playback-resolution attempt');
  assert.equal(song.catalogDuration,126);
  assert.equal(song.playbackDuration,126);
  assert.equal(song.playbackVideoId,'lmnopqrstuv');
});

test('A plausible search duration is checked against the actual resolved media duration',async()=>{
  const song={...track(),id:'spotify:verify-source-duration'},attempts=[];
  const search=async()=>[
    yt('abcdefghijk','Cy_He, EW – Breaking My Heart',126),
    yt('lmnopqrstuv','Cy_He, EW – Breaking My Heart',127)
  ];
  const resolve=async url=>{const id=new URL(url).searchParams.get('v');attempts.push(id);return resolved(id,id==='abcdefghijk'?231:127)};
  await resolveSpotify(song,null,{search,resolve});
  assert.deepEqual(attempts,['abcdefghijk','lmnopqrstuv']);
  assert.equal(song.catalogDuration,126);
  assert.equal(song.duration,127);
  assert.equal(song.playbackVideoId,'lmnopqrstuv');
});

test('Known artist and song terms survive alternative search queries while unrelated variants are refused',()=>{
  const song=track(),queries=spotifyPlaybackSearchQueries(song);
  assert.ok(queries.length>=3);
  assert.ok(queries.some(value=>value.includes('Breaking My Heart')&&value.includes('Cy_He')));
  assert.equal(spotifyPlaybackTitleCompatible(song,{title:'Cy He EW - Breaking My Heart (Official Audio)'}),true);
  assert.equal(spotifyPlaybackTitleCompatible(song,{title:'Other Artist – Completely Different Song'}),false);
  assert.equal(spotifyPlaybackTitleCompatible(song,{title:'Cy He EW - Breaking My Heart (Extended Remix)'}),false);
});

test('Unavailable Spotify version is a bounded, nonfatal skip, not a 231-second substitution or player ERROR',async()=>{
  const song={...track(),id:'spotify:unavailable-regression'},queries=[];
  const search=async query=>{queries.push(query);return [yt('abcdefghijk','Cy_He, EW – Breaking My Heart',231)]};
  let resolverCalls=0;
  const resolve=async()=>{resolverCalls++;return resolved('abcdefghijk',231)};
  let failure;
  try{await resolveSpotify(song,null,{search,resolve})}catch(error){failure=error}
  assert.ok(failure instanceof SpotifyMatchUnavailableError);
  assert.equal(failure.code,'SPOTIFY_MATCH_UNAVAILABLE');
  assert.ok(queries.length>=2);
  assert.equal(resolverCalls,0);
  assert.equal(song.playbackVideoId,undefined);
  assert.equal(song.duration,126);
  assert.ok(spotifyMatchResolveLimit<=12);

  const diagnostics=[],player=new Player({musicDir:'.',diagnostic:(level,source,message)=>diagnostics.push({level,source,message})});
  player.current=song;player.generation=4;player.queue=[{id:'next',title:'Next track',source:'youtube'}];
  let advanced=0;player.next=()=>{advanced++};
  player.finish(4,1,failure,0,song,null);
  assert.equal(advanced,1);
  assert.equal(player.current,null);
  assert.equal(diagnostics.length,1);
  assert.equal(diagnostics[0].level,'warn');
  assert.match(diagnostics[0].message,/übersprungen/);
  assert.doesNotMatch(diagnostics[0].message,/231 statt 126|Kein erreichbarer YouTube-Treffer mit passender Titellänge/);
});

test('A Spotify catalog duration must not be overwritten by a YouTube source with unknown duration',async()=>{
  const song={...track(),id:'spotify:unknown-duration'},search=async()=>[yt('abcdefghijk','Cy_He, EW – Breaking My Heart',0)],resolve=async()=>resolved('abcdefghijk',0);
  await assert.rejects(resolveSpotify(song,null,{search,resolve}),SpotifyMatchUnavailableError);
  assert.equal(song.duration,126);
  assert.equal(song.catalogDuration,undefined);
});
