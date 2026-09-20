import test from 'node:test';
import assert from 'node:assert/strict';
import {Player} from '../backend/src/player.js';
import {rankSpotifyPlaybackCandidates,resolveSpotify,SpotifyMatchUnavailableError,spotifyMatchResolveLimit,spotifyPlaybackArtistCompatible,spotifyPlaybackMatchRejection,spotifyPlaybackSearchQueries,spotifyPlaybackTitleCompatible,spotifyPlaybackWordEquivalent} from '../backend/src/media.js';

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


test('minor final-letter differences match only long title words',()=>{
  assert.equal(spotifyPlaybackWordEquivalent('collaps','collapse'),true);
  assert.equal(spotifyPlaybackWordEquivalent('till','till'),true);
  assert.equal(spotifyPlaybackWordEquivalent('till','tile'),false);
  assert.equal(spotifyPlaybackWordEquivalent('breaking','breathing'),false);
  assert.equal(spotifyPlaybackWordEquivalent('collaps','collaborate'),false);
});

test('Till I Collaps finds a credited Till I Collapse candidate via corrected query',async()=>{
  const song={id:'spotify:till-i-collaps-regression',source:'spotify',title:'Musikerziehung – Till I Collaps',duration:183},queries=[],calls=[];
  const search=async query=>{
    queries.push(query);
    return /\bcollapse\b/i.test(query)?[yt('abcdefghijk','Musikerziehung – Till I Collapse',183)]:[];
  };
  const resolve=async url=>{calls.push(url);return resolved('abcdefghijk',184)};
  assert.equal(spotifyPlaybackTitleCompatible(song,{title:'Musikerziehung – Till I Collapse'}),true);
  assert.equal(spotifyPlaybackTitleCompatible(song,{title:'Eminem – Till I Collapse'}),false);
  const url=await resolveSpotify(song,null,{search,resolve});
  assert.equal(url,'https://example.test/audio/abcdefghijk');
  assert.ok(queries.some(query=>/\bcollapse\b/i.test(query)),'at least one query must use the spelling alternative');
  assert.equal(calls.length,1);
  assert.equal(song.catalogDuration,183);
  assert.equal(song.playbackDuration,184);
  assert.equal(song.playbackVideoId,'abcdefghijk');
});

test('artist credit, cover/remix and source duration remain independent guards',async()=>{
  const song={id:'spotify:till-i-collaps-guards',source:'spotify',title:'Musikerziehung – Till I Collaps',duration:183};
  const wrongArtist=yt('abcdefghijk','Eminem – Till I Collapse',183);
  const wrongVersion=yt('lmnopqrstuv','Musikerziehung – Till I Collapse (Extended Remix)',183);
  const wrongDuration=yt('wxyz1234567','Musikerziehung – Till I Collapse',295);
  const matching=yt('vwxyz123456','Musikerziehung – Till I Collapse',183);
  assert.equal(spotifyPlaybackArtistCompatible(song,wrongArtist),false);
  assert.equal(spotifyPlaybackTitleCompatible(song,wrongArtist),false);
  assert.equal(spotifyPlaybackTitleCompatible(song,wrongVersion),false);
  assert.equal(spotifyPlaybackTitleCompatible(song,{title:'Till I Collapse'}),false,'an unknown uploader does not establish the requested performer');
  assert.equal(spotifyPlaybackTitleCompatible(song,{title:'Till I Collapse',channel:'Musikerziehung'}),true);
  assert.deepEqual(rankSpotifyPlaybackCandidates(song,[wrongArtist,wrongVersion,wrongDuration,matching].filter(candidate=>spotifyPlaybackTitleCompatible(song,candidate))).map(x=>x.id),[matching.id,wrongDuration.id]);
  const tried=[],search=async()=>[wrongArtist,wrongVersion,wrongDuration,matching],resolve=async url=>{tried.push(url);return resolved('vwxyz123456',183)};
  await resolveSpotify(song,null,{search,resolve});
  assert.equal(tried.length,1);
  assert.equal(song.playbackVideoId,'vwxyz123456');
});


test('A credited Topic-channel video keeps its artist evidence when cached for later playback',async()=>{
  const identity='spotify:till-i-collaps-topic-cache-regression',song={id:identity,source:'spotify',title:'Musikerziehung – Till I Collaps',duration:183};
  const candidate={id:'qwerty12345',title:'Till I Collapse – Official Audio',channel:'Musikerziehung - Topic',duration:183,url:'https://www.youtube.com/watch?v=qwerty12345'};
  assert.equal(spotifyPlaybackTitleCompatible(song,candidate),true);
  assert.equal(spotifyPlaybackTitleCompatible(song,{...candidate,channel:'Eminem - Topic'}),false);
  let searches=0,resolutions=0;
  const search=async()=>{searches++;return [candidate]};
  const resolve=async()=>{resolutions++;return resolved(candidate.id,183)};
  await resolveSpotify(song,null,{search,resolve});
  assert.equal(searches,1);
  const replay={id:identity,source:'spotify',title:'Musikerziehung – Till I Collaps',duration:183};
  await resolveSpotify(replay,null,{search,resolve});
  assert.equal(searches,1,'cached matching-channel evidence must avoid another full search');
  assert.equal(resolutions,2,'the cached video is freshly resolved before every playback');
  assert.equal(replay.playbackVideoId,candidate.id);
});

const namedRemixTrack=()=>({id:'spotify:brief-an-die-zukunft-named-remix',source:'spotify',title:'Shirukid, Cy_He, NoCheats – brief an die zukunft - Cy_He, NoCheats Remix',duration:202});

test('named Spotify remix accepts main artist in YouTube credit and both remixers in reordered suffix',async()=>{
  const song=namedRemixTrack(),queries=[],resolutions=[];
  const matching=yt('abcdefghijk','Shirukid – brief an die zukunft (NoCheats & Cy He Remix)',202);
  assert.equal(spotifyPlaybackArtistCompatible(song,matching),true);
  assert.equal(spotifyPlaybackTitleCompatible(song,matching),true);
  assert.equal(spotifyPlaybackTitleCompatible(song,yt('lmnopqrstuv','Shirukid, NoCheats & Cy_He – brief an die zukunft (Cy_He, NoCheats Remix)',202)),true);
  assert.equal(spotifyPlaybackTitleCompatible(song,{...yt('wxyz1234567','brief an die zukunft (Cy_He & NoCheats Remix)',202),channel:'Shirukid - Topic'}),true);
  const search=async query=>{
    queries.push(query);
    return query.includes('"brief an die zukunft"')&&query.includes('remix audio')?[matching]:[];
  };
  const resolve=async url=>{resolutions.push(url);return resolved(matching.id,203)};
  assert.equal(await resolveSpotify(song,null,{search,resolve}),'https://example.test/audio/abcdefghijk');
  assert.ok(queries.some(query=>query.includes('Shirukid')&&query.includes('Cy_He')&&query.includes('NoCheats')&&query.includes('"brief an die zukunft"')));
  assert.equal(resolutions.length,1);
  assert.equal(song.catalogDuration,202);
  assert.equal(song.playbackDuration,203);
});

test('named remixes still reject originals, wrong remixers, other performers and extra versions',()=>{
  const song=namedRemixTrack(),candidate=title=>({title,duration:202});
  for(const title of [
    'Shirukid – brief an die zukunft',
    'Shirukid – brief an die zukunft (Cy_He Remix)',
    'Shirukid – brief an die zukunft (Cy_He & Other DJ Remix)',
    'Shirukid – brief an die zukunft (Cy_He & NoCheats Extended Remix)',
    'Shirukid – brief an die zukunft (Other Remix) (Cy_He & NoCheats Remix)',
    'Shirukid – brief an die vergangenheit (Cy_He & NoCheats Remix)'
  ])assert.equal(spotifyPlaybackTitleCompatible(song,candidate(title)),false,title);
  assert.equal(spotifyPlaybackArtistCompatible(song,candidate('Other Artist – brief an die zukunft (Cy_He & NoCheats Remix)')),false);
  assert.equal(spotifyPlaybackTitleCompatible(song,candidate('Other Artist – brief an die zukunft (Cy_He & NoCheats Remix)')),false);
  assert.equal(spotifyPlaybackTitleCompatible(song,{title:'brief an die zukunft (Cy_He & NoCheats Remix)',channel:'Other Artist - Topic'}),false);
  assert.equal(spotifyPlaybackTitleCompatible(song,candidate('Other Artist, Shirukid – brief an die zukunft (Cy_He & NoCheats Remix)')),false);
});

test('named remix checks real duration and falls back only to the same named version',async()=>{
  const song={...namedRemixTrack(),id:'spotify:named-remix-real-duration'},tried=[];
  const first=yt('abcdefghijk','Shirukid – brief an die zukunft (Cy_He & NoCheats Remix)',202);
  const next=yt('lmnopqrstuv','Shirukid – brief an die zukunft (NoCheats, Cy_He Remix)',201);
  const wrong=yt('wxyz1234567','Shirukid – brief an die zukunft (Other DJ Remix)',202);
  const search=async()=>[first,wrong,next];
  const resolve=async url=>{
    const id=new URL(url).searchParams.get('v');tried.push(id);
    return resolved(id,id===first.id?305:203);
  };
  await resolveSpotify(song,null,{search,resolve});
  assert.deepEqual(tried,[first.id,next.id]);
  assert.equal(song.playbackVideoId,next.id);
  assert.equal(song.duration,203);
});

test('Spotify skip diagnostics distinguish artist, remix, duration and unreachable source',async()=>{
  const song={...namedRemixTrack(),id:'spotify:named-remix-rejection-diagnostics'};
  const candidates=[
    yt('abcdefghijk','Other Artist – brief an die zukunft (Cy_He & NoCheats Remix)',202),
    yt('lmnopqrstuv','Shirukid – brief an die zukunft (Cy_He & Another DJ Remix)',202),
    yt('wxyz1234567','Shirukid – brief an die zukunft (Cy_He & NoCheats Remix)',350),
    yt('vwxyz123456','Shirukid – brief an die zukunft (Cy_He & NoCheats Remix)',202)
  ];
  let resolutions=0,error;
  try{
    await resolveSpotify(song,null,{search:async()=>candidates,resolve:async()=>{resolutions++;throw new Error('Video unavailable')}});
  }catch(caught){error=caught}
  assert.ok(error instanceof SpotifyMatchUnavailableError);
  assert.equal(resolutions,1);
  assert.equal(song.playbackVideoId,undefined);
  for(const reason of ['artist','version','duration','source'])assert.ok(error.diagnostics[reason]>=1,reason);
  for(const label of ['falscher Künstler','falsche Version','unpassende Länge','nicht erreichbare Quelle'])assert.match(error.message,new RegExp(label));
  assert.ok(error.diagnostics.examples.some(example=>example.includes('Other Artist')));
});

test('Es eskaliert matches explicit post-title multi-artist credits but never a competing remix',async()=>{
  const song={id:'spotify:es-eskaliert-multiple-credits',source:'spotify',title:'ArniTheSavage, JSTN, Schillah – Es eskaliert',duration:191};
  const matching=yt('abcdefghijk','Es eskaliert... (Eastsideboyz, ArniTheSavage, JSTN, Schillah)',191);
  const wrongArtist=yt('lmnopqrstuv','Es eskaliert... (Eastsideboyz, ArniTheSavage, Schillah)',191);
  const wrongSong=yt('wxyz1234567','Es eskaliert nicht... (Eastsideboyz, ArniTheSavage, JSTN, Schillah)',191);
  const wrongVersion=yt('vwxyz123456','Justin Pollnik, ArniTheSavage, Schillah & JSTN - Es eskaliert (Justin Pollnik & KickArtz Remix)',191);
  assert.equal(spotifyPlaybackArtistCompatible(song,matching),true);
  assert.equal(spotifyPlaybackTitleCompatible(song,matching),true);
  assert.equal(spotifyPlaybackMatchRejection(song,wrongArtist),'artist');
  assert.equal(spotifyPlaybackMatchRejection(song,wrongSong),'title');
  assert.equal(spotifyPlaybackMatchRejection(song,wrongVersion),'version');
  assert.equal(spotifyPlaybackTitleCompatible(song,{...matching,title:'Other Artist – Es eskaliert... (Eastsideboyz, ArniTheSavage, JSTN, Schillah)'}),false,'an explicit wrong performer prefix may not be overridden by a matching suffix');
  const queries=[],attempts=[],search=async query=>{queries.push(query);return [wrongArtist,wrongVersion,matching]};
  const resolve=async url=>{attempts.push(url);return resolved(matching.id,192)};
  await resolveSpotify(song,null,{search,resolve});
  assert.equal(attempts.length,1);
  assert.equal(song.playbackVideoId,matching.id);
  assert.ok(queries.some(query=>query.includes('ArniTheSavage')&&query.includes('JSTN')&&query.includes('Schillah')&&query.includes('Es eskaliert')));
});

test('XTC requires Kento Nakajima artist evidence and exact short song title',async()=>{
  const song={id:'spotify:kento-xtc-regression',source:'spotify',title:'Kento Nakajima – XTC',duration:189};
  const unrelated=yt('abcdefghijk','Kento Nakajima – Strawberry',189);
  const artistOnly=yt('lmnopqrstuv','Kento Nakajima "THE CODE" Music Video',189);
  const wrongArtist=yt('wxyz1234567','Unknown Singer – XTC',189);
  const good=yt('vwxyz123456','Kento Nakajima – XTC (Official Audio)',189);
  assert.equal(spotifyPlaybackMatchRejection(song,unrelated),'title');
  assert.equal(spotifyPlaybackMatchRejection(song,artistOnly),'title');
  assert.equal(spotifyPlaybackMatchRejection(song,wrongArtist),'artist');
  assert.equal(spotifyPlaybackTitleCompatible(song,{title:'XTC',channel:'Kento Nakajima - Topic'}),true);
  assert.equal(spotifyPlaybackTitleCompatible(song,{title:'XTC',channel:'Unknown Singer - Topic'}),false);
  const searched=[],search=async query=>{searched.push(query);return searched.length===1?[unrelated,artistOnly,wrongArtist]:[good]};
  await resolveSpotify(song,null,{search,resolve:async()=>resolved(good.id,189)});
  assert.equal(song.playbackVideoId,good.id);
  assert.ok(searched.some(query=>query.includes('Kento Nakajima')&&query.includes('XTC')));
});

test('NEWKID3 generic Spotify remix recognizes separately credited collaborator but rejects original and foreign remix',async()=>{
  const song={id:'spotify:fedx-kickartz-newkid3',source:'spotify',title:'FEDX, KICKARTZ – NEWKID3 - REMIX',duration:158};
  const original=yt('abcdefghijk','FEDX - NEWKID3',158);
  const unrelated=yt('lmnopqrstuv','FEDX – NEWKID3 (Other DJ Remix)',158);
  const wrongArtist=yt('wxyz1234567','Another Singer – NEWKID3 (KICKARTZ Remix)',158);
  const correct=yt('vwxyz123456','FEDX – NEWKID3 (KICKARTZ Remix)',158);
  assert.equal(spotifyPlaybackMatchRejection(song,original),'version');
  assert.equal(spotifyPlaybackMatchRejection(song,unrelated),'artist');
  assert.equal(spotifyPlaybackTitleCompatible(song,wrongArtist),false);
  assert.equal(spotifyPlaybackTitleCompatible(song,correct),true);
  assert.equal(spotifyPlaybackTitleCompatible(song,{title:'NEWKID3 (REMIX)',channel:'FEDX, KICKARTZ - Topic'}),true);
  assert.equal(spotifyPlaybackTitleCompatible(song,{title:'NEWKID3 (REMIX)',channel:'Unrelated Topic - Topic'}),false);
  assert.equal(spotifyPlaybackTitleCompatible(song,yt('qwerty12345','FEDX – NEWKID3 (KICKARTZ Extended Remix)',158)),false);
  const tried=[];
  await resolveSpotify(song,null,{search:async()=>[original,unrelated,correct],resolve:async url=>{tried.push(url);return resolved(correct.id,159)}});
  assert.equal(song.playbackVideoId,correct.id);
  assert.equal(tried.length,1);
});

test('ALORS ON FUCK with no verified search results stays unavailable instead of playing an unrelated song',async()=>{
  const song={id:'spotify:gpf-no-search-hits',source:'spotify',title:'GPF – ALORS ON FUCK',duration:160},queries=[];
  const search=async query=>{queries.push(query);return []};
  await assert.rejects(resolveSpotify(song,null,{search,resolve:async()=>{assert.fail('No matching YouTube candidate must be resolved')}}),error=>{
    assert.ok(error instanceof SpotifyMatchUnavailableError);
    assert.match(error.message,/keine geeigneten Suchtreffer/);
    return true;
  });
  assert.ok(queries.some(query=>query.includes('GPF')&&query.includes('ALORS ON FUCK')));
  assert.equal(song.playbackVideoId,undefined);
});
