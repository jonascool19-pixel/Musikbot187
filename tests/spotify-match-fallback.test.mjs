import test from 'node:test';
import assert from 'node:assert/strict';
import {Player} from '../backend/src/player.js';
import {rejectSpotifyPlaybackMatch,rankSpotifyPlaybackCandidates,resolveSpotify,SpotifyMatchUnavailableError,spotifyMatchResolveLimit,spotifyPlaybackArtistCompatible,spotifyPlaybackMatchRejection,spotifyPlaybackSearchQueries,spotifyPlaybackTitleCompatible,spotifyOfficialMusicVideoFallbackCandidate,spotifyPlaybackWordEquivalent} from '../backend/src/media.js';

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
  const artistOnly={...yt('lmnopqrstuv','Kento Nakajima "THE CODE" Music Video',189),channel:'Kento Nakajima - Topic'};
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
  assert.equal(spotifyPlaybackMatchRejection(song,unrelated),'version');
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


test('artist bylines are credited but an unrequested official remix and slowed version are rejected',()=>{
  const song={title:'Crxptic, Halo King – MISERY HARDTEKK',duration:185,source:'spotify'};
  const original={title:'MISERY HARDTEKK by Crxptic & Halo King | Official Audio',duration:185};
  assert.equal(spotifyPlaybackTitleCompatible(song,original),true);
  assert.equal(spotifyPlaybackMatchRejection(song,{...original,title:'MISERY HARDTEKK by Crxptic & Halo King | Official Remix'}),'version');
  assert.equal(spotifyPlaybackMatchRejection(song,{...original,title:'MISERY HARDTEKK (Slowed) by Crxptic & Halo King | Official Remix'}),'version');
  assert.equal(spotifyPlaybackTitleCompatible(song,{...original,title:'MISERY HARDTEKK by Other Artist | Official Audio'}),false);
  assert.equal(spotifyPlaybackTitleCompatible(song,{...original,title:'MISERY HARDTEKK',channel:'Random upload channel'}),false);
});
test('featured artist in song metadata and official Topic channel satisfy multi-artist credits',()=>{
  const kc={title:'KC Rebell, 18 Karat – Das bist alles nicht Du (feat. 18Karat)',source:'spotify'};
  const topic={title:'Das bist alles nicht Du (feat. 18Karat)',channel:'KC Rebell - Topic'};
  assert.equal(spotifyPlaybackTitleCompatible(kc,topic),true);
  assert.equal(spotifyPlaybackTitleCompatible(kc,{...topic,channel:'Other Singer - Topic'}),false);
  assert.equal(spotifyPlaybackTitleCompatible(kc,{...topic,title:'Das bist alles nicht Du (feat. 18Karat) [Instrumental]'}),false);
  const phone={title:'KC Rebell, Moe Phoenix – iPhone 17 (feat. Moé)',source:'spotify'};
  assert.equal(spotifyPlaybackTitleCompatible(phone,{title:'KC Rebell feat. Moé [Moe Phoenix] ✖️ iPHONE 17 ✖️ [ official Video ] prod. by Joshimixu'}),true);
  assert.equal(spotifyPlaybackTitleCompatible(phone,{title:'KC Rebell feat. Different Singer ✖️ iPHONE 17 ✖️ [ official Video ]'}),false);
  assert.equal(spotifyPlaybackTitleCompatible(phone,{title:'KC Rebell feat. Moé [Moe Phoenix] ✖️ iPHONE 18 ✖️ [ official Video ]'}),false);
});
test('x collaborations and masked profanity recognize the intended title, not another remix',()=>{
  const schillah={title:'Schillah, ArniTheSavage – Fick dein Berghain',source:'spotify'};
  const original={title:'Schillah x ArniTheSavage - F*** dein Berghain [prod. by StuBeatZ]'};
  assert.equal(spotifyPlaybackTitleCompatible(schillah,original),true);
  assert.equal(spotifyPlaybackTitleCompatible(schillah,{...original,title:'Schillah x ArniTheSavage - F*** die Welt [prod. by StuBeatZ]'}),false);
  assert.equal(spotifyPlaybackTitleCompatible(schillah,{...original,title:'Schillah x ArniTheSavage - Fick dein Berghain [CZNZ REMIX]'}),false);
  const magnetic={title:"MagneticMark – I Don't Give a Fuck",source:'spotify'};
  assert.equal(spotifyPlaybackTitleCompatible(magnetic,{title:"MagneticMark - I Don't Give a F*ck (Official Audio)"}),true);
  assert.equal(spotifyPlaybackTitleCompatible(magnetic,{title:"Another Artist - I Don't Give a F*ck (Official Audio)"}),false);
  const party={title:"Sh1nigami, KIOR – Let's F#cking Party",source:'spotify'};
  assert.equal(spotifyPlaybackTitleCompatible(party,{title:"Sh1nigami x KIOR – Let's F#cking Party"}),true);
  assert.equal(spotifyPlaybackTitleCompatible(party,{title:"Sh1nigami x KIOR – Let's F#cking Hard"}),false);
});
test('Unicode alias and exact artists reject wrong rawstyle remix despite matching song name',()=>{
  const song={title:'Flymeon, VICØ – Dance with the Devil',source:'spotify'};
  assert.equal(spotifyPlaybackTitleCompatible(song,{title:'Flymeon, VICO - Dance With The Devil'}),true);
  assert.equal(spotifyPlaybackMatchRejection(song,{title:'Flymeon, VICO - Dance With The Devil (RAWPVCK Remix)'}),'version');
  assert.equal(spotifyPlaybackTitleCompatible(song,{title:'D-Devils - Dance With The Devil'}),false);
});
test('named edit must retain its exact editor; song title Live does not imply a live recording',()=>{
  const song={title:'Ferran Canales – Live The Night - Canales Edit',source:'spotify'};
  assert.equal(spotifyPlaybackTitleCompatible(song,{title:'Ferran Canales – Live The Night (Canales Edit)'}),true);
  assert.equal(spotifyPlaybackTitleCompatible(song,{title:'Ferran Canales – Live The Night'}),false);
  assert.equal(spotifyPlaybackTitleCompatible(song,{title:'Ferran Canales – Live The Night (Other DJ Edit)'}),false);
  assert.equal(spotifyPlaybackTitleCompatible(song,{title:'Ferran Canales – Live The Night (Canales Edit) (Live)'}),false);
  assert.equal(spotifyPlaybackTitleCompatible(song,{title:'Ferran – Live The Night (Canales Edit)'}),false);
});
test('Topic metadata can establish primary artist of title-only releases; foreign upload channels cannot',()=>{
  const cases=[
    {track:'ZEVXR, GARIX, TISHKIN – MORTALTEKK',title:'MORTALTEKK | Official Visualizer',topic:'ZEVXR - Topic'},
    {track:'POSEIDON, ZYZZMODE – NEW RELIGION - HARDSTYLE',title:'NEW RELIGION (HARDSTYLE)',topic:'POSEIDON - Topic'},
    {track:'ReCombined – Hammer Down',title:'Hammer Down',topic:'ReCombined - Topic'},
    {track:'The Boy The G, MilleniumKid, JBS – Adrenalin - Remix',title:'Adrenalin (Remix)',topic:'The Boy The G - Topic'},
    {track:'FEDX, KICKARTZ – Mach die Beat an Jungö - Remix',title:'Mach die Beat an Jungö (Remix)',topic:'FEDX - Topic'}
  ];
  for(const item of cases){
    const track={title:item.track,source:'spotify'};
    assert.equal(spotifyPlaybackTitleCompatible(track,{title:item.title,channel:item.topic}),true,item.track);
    assert.equal(spotifyPlaybackTitleCompatible(track,{title:item.title,channel:'Someone Else - Topic'}),false,item.track);
    assert.equal(spotifyPlaybackTitleCompatible(track,{title:item.title,channel:'Random uploader'}),false,item.track);
  }
  const original={title:'The Boy The G, MilleniumKid, JBS – Adrenalin - Remix',source:'spotify'};
  assert.equal(spotifyPlaybackTitleCompatible(original,{title:'Adrenalin',channel:'The Boy The G - Topic'}),false);
  assert.equal(spotifyPlaybackTitleCompatible(original,{title:'Adrenalin (Another DJ Remix)',channel:'The Boy The G - Topic'}),false);
});
test('strict duration verification still skips plausible Topic song when stream duration differs',async()=>{
  const song={id:'spotify:duration-topic-adrenalin',source:'spotify',title:'The Boy The G, MilleniumKid, JBS – Adrenalin - Remix',duration:155};
  const candidate=yt('abcdefghijk','Adrenalin (Remix)',155);candidate.channel='The Boy The G - Topic';
  const attempts=[];
  await assert.rejects(resolveSpotify(song,null,{search:async()=>[candidate],resolve:async url=>{attempts.push(url);return resolved(candidate.id,240)}}),SpotifyMatchUnavailableError);
  assert.equal(attempts.length,1);
  assert.equal(song.playbackVideoId,undefined);
  assert.equal(song.duration,155);
});
test('an actually reachable matching censored song is retried after a permanent source error',async()=>{
  const song={id:'spotify:masked-fallback',source:'spotify',title:"MagneticMark – I Don't Give a Fuck",duration:192};
  const a=yt('abcdefghijk',"MagneticMark - I Don't Give a F*ck (Official Audio)",192);
  const b=yt('lmnopqrstuv',"MagneticMark - I Don't Give a Fuck (Official Audio)",192);
  const called=[];let searches=0;
  await resolveSpotify(song,null,{search:async()=>++searches===1?[a]:[b],resolve:async url=>{
    const id=new URL(url).searchParams.get('v');called.push(id);
    if(id===a.id)throw new Error('Video unavailable');
    return resolved(id,193);
  }});
  assert.deepEqual(called,[a.id,b.id]);
  assert.equal(song.playbackVideoId,b.id);
  assert.equal(song.playbackDuration,193);
});

test('Spotify diagnostics prioritize relevant rejected results and disclose artist channel and reported duration',async()=>{
  const song={id:'spotify:diagnostic-relevance',source:'spotify',title:"MagneticMark – I Don't Give a Fuck",duration:180};
  const noise=Array.from({length:6},(_,index)=>yt('abcdefghij'+index,'Unrelated channel – Random music '+index,180));
  const near={...yt('lmnopqrstuv',"MagneticMark – I Don't Give a F*ck (Official Audio)",310),channel:'MagneticMark - Topic'};
  const error=await resolveSpotify(song,null,{search:async()=>[...noise,near],resolve:async()=>{assert.fail('Wrong search duration must never resolve')}}).catch(value=>value);
  assert.ok(error instanceof SpotifyMatchUnavailableError);
  assert.ok(error.diagnostics.duration>=1);
  assert.ok(error.diagnostics.examples.some(example=>example.includes('MagneticMark')&&example.includes('Kanal/Künstler: MagneticMark - Topic')&&example.includes('310 s')));
  assert.equal(song.playbackVideoId,undefined);
});

test('a genre-tagged song on its primary artist channel can establish a multi-artist catalog match',async()=>{
  const song={id:'spotify:nidzo-eichbaumkartell-naar-de-klote',source:'spotify',title:'nidžo, Eichbaumkartell – NAAR DE KLOTE (Uptempo)',duration:200};
  const matching={...yt('abcdefghijk','NAAR DE KLOTE (Uptempo)',200),channel:'nidžo',artist:''};
  assert.equal(spotifyPlaybackArtistCompatible(song,matching),true);
  assert.equal(spotifyPlaybackTitleCompatible(song,matching),true);
  assert.equal(spotifyPlaybackTitleCompatible(song,{...matching,channel:'Unknown uploader'}),false);
  assert.equal(spotifyPlaybackTitleCompatible(song,{...matching,title:'ALLES NAAR DE KLOTE (Uptempo)'}),false);
  assert.equal(spotifyPlaybackTitleCompatible(song,{...matching,title:'NAAR DE KLOTE (Slowed) (Uptempo)'}),false);
  assert.equal(spotifyPlaybackTitleCompatible(song,{...matching,title:'NAAR DE KLOTE (Other DJ Remix) (Uptempo)'}),false);
  assert.equal(spotifyPlaybackTitleCompatible(song,{...matching,duration:0}),false);
  assert.equal(spotifyPlaybackTitleCompatible({...song,title:'nidžo, Eichbaumkartell – NAAR DE KLOTE'},{
    ...matching,title:'NAAR DE KLOTE'}),false,'a genre-free uncredited song on the primary channel is not enough to establish all Spotify collaborators');
  let resolutions=0;
  await resolveSpotify(song,null,{search:async()=>[matching],resolve:async()=>{resolutions++;return resolved(matching.id,201)}});
  assert.equal(resolutions,1);
  assert.equal(song.playbackVideoId,matching.id);
  assert.equal(song.catalogDuration,200);
  assert.equal(song.playbackDuration,201);
});

test('official-video production credits after a visual separator are not a second song',async()=>{
  const song={id:'spotify:kc-rebell-paper',source:'spotify',title:'KC Rebell – Paper',duration:222};
  const matching={...yt('abcdefghijk','KC Rebell ✖️ PAPER ✖️ [ official Video ] GEE Futuristic, Nikki 3k & Joshimixu',222),channel:'KC Rebell'};
  assert.equal(spotifyPlaybackArtistCompatible(song,matching),true);
  assert.equal(spotifyPlaybackTitleCompatible(song,matching),true);
  assert.equal(spotifyPlaybackTitleCompatible(song,{...matching,title:'KC Rebell ✖️ PAPER // ABSTAND ✖️ [ official Video ] GEE Futuristic',duration:102}),false);
  assert.equal(spotifyPlaybackTitleCompatible(song,{...matching,title:'KC Rebell ✖️ PAPER ✖️ [ official Video ] Other DJ Remix'}),false);
  assert.equal(spotifyPlaybackTitleCompatible(song,{...matching,title:'Another Artist ✖️ PAPER ✖️ [ official Video ] GEE Futuristic'}),false);
  await resolveSpotify(song,null,{search:async()=>[matching],resolve:async()=>resolved(matching.id,222)});
  assert.equal(song.playbackVideoId,matching.id);
});

test('Alli-Alligatoah is shown as a 306-second official-video fallback rather than a 240-second audio recording',async()=>{
  const originalTitle='Alligatoah – Alli-Alligatoah';
  const song={id:'spotify:alligatoah-alli-duration',source:'spotify',title:originalTitle,duration:240};
  const official={...yt('abcdefghijk','Alligatoah - Alli-Alligatoah (Official Video)',306),channel:'Alligatoah'};
  const extended={...yt('lmnopqrstuv','Alligatoah - Alli Alligatoah (Extended Version)',298),channel:'Alligatoah'};
  assert.equal(spotifyPlaybackTitleCompatible(song,official),true);
  assert.equal(spotifyPlaybackMatchRejection(song,extended),'version');
  assert.equal(spotifyOfficialMusicVideoFallbackCandidate(song,official),true);
  const queries=spotifyPlaybackSearchQueries(song);
  assert.ok(queries.some(value=>value.includes('"Alli Alligatoah"')&&value.includes('Alligatoah')));
  let attempts=0;
  await resolveSpotify(song,null,{search:async()=>[official,extended],resolve:async()=>{attempts++;return resolved(official.id,306)}});
  assert.equal(attempts,1,'only the marked original official music video may be streamed, not the extended recording');
  assert.equal(song.playbackMatch.version,'official-video-fallback');
  assert.equal(song.catalogDuration,240);
  assert.equal(song.duration,306);
  assert.equal(song.title,originalTitle);
  assert.equal(song.playbackVideoId,official.id);
});

test('search-duration hints cannot approve a mismatched resolved official video',async()=>{
  const song={id:'spotify:alligatoah-resolved-duration',source:'spotify',title:'Alligatoah – Alli-Alligatoah',duration:240};
  const candidate={...yt('abcdefghijk','Alligatoah - Alli-Alligatoah (Official Video)',239),channel:'Alligatoah'};
  const error=await resolveSpotify(song,null,{search:async()=>[candidate],resolve:async()=>resolved(candidate.id,306)}).catch(value=>value);
  assert.ok(error instanceof SpotifyMatchUnavailableError);
  assert.ok(error.diagnostics.duration>=1);
  assert.equal(song.duration,240);
  assert.equal(song.playbackVideoId,undefined);
});


test('I Need A Face first searches exact artist/Topic audio before considering a longer official music video',async()=>{
  const originalTitle='Alligatoah – I Need A Face',song={id:'spotify:alligatoah-audio-priority',title:originalTitle,source:'spotify',duration:241};
  const musicVideo={...yt('abcdefghijk','Alligatoah - I Need A Face (Official Video)',282),channel:'Alligatoah'};
  const audio={...yt('lmnopqrstuv','I Need A Face',241),channel:'Alligatoah - Topic'};
  const searches=[],resolutions=[];
  assert.equal(spotifyOfficialMusicVideoFallbackCandidate(song,musicVideo),true);
  const search=async query=>{searches.push(query);return searches.length===1?[musicVideo]:[audio]};
  const resolve=async url=>{
    const id=new URL(url).searchParams.get('v');resolutions.push(id);
    return resolved(id,id===audio.id?241:282);
  };
  await resolveSpotify(song,null,{search,resolve});
  assert.ok(searches[0].includes('Alligatoah')&&searches[0].includes('I Need A Face')&&/audio/i.test(searches[0]));
  assert.deepEqual(resolutions,[audio.id],'a viable album/Topic audio version must win even when the music video was discovered first');
  assert.equal(song.title,originalTitle);
  assert.equal(song.catalogDuration,241);
  assert.equal(song.duration,241);
  assert.equal(song.playbackMatch.title,audio.title);
  assert.equal(song.playbackMatch.version,'audio');
  assert.equal(song.playbackVideoId,audio.id);
});

test('I Need A Face may use only its own original artist-channel music video as a visible final fallback',async()=>{
  const originalTitle='Alligatoah – I Need A Face',song={id:'spotify:alligatoah-official-music-video',title:originalTitle,source:'spotify',duration:241};
  const video={...yt('abcdefghijk','Alligatoah - I Need A Face (Official Video)',282),channel:'Alligatoah'};
  let searches=0,resolutions=0;
  const first=await resolveSpotify(song,null,{search:async()=>{searches++;return [video]},resolve:async()=>{resolutions++;return resolved(video.id,282)}});
  assert.equal(first,'https://example.test/audio/abcdefghijk');
  assert.ok(searches>=2,'several audio searches should be attempted before choosing an official music video');
  assert.equal(resolutions,1,'duplicate video IDs must be resolved only once');
  assert.equal(song.title,originalTitle,'the Spotify title must never be replaced by the YouTube video title');
  assert.equal(song.catalogDuration,241);
  assert.equal(song.playbackDuration,282);
  assert.equal(song.duration,282,'the player must display and seek using the actual music-video length');
  assert.equal(song.playbackVideoId,video.id);
  assert.equal(song.playbackMatch.title,video.title);
  assert.equal(song.playbackMatch.version,'official-video-fallback');
  const replay={id:song.id,title:originalTitle,source:'spotify',duration:241};
  await resolveSpotify(replay,null,{search:async()=>{assert.fail('a valid cached video should be re-resolved rather than re-searched')},resolve:async()=>resolved(video.id,282)});
  assert.equal(replay.playbackMatch.version,'official-video-fallback');
  assert.equal(replay.title,originalTitle);
  assert.equal(replay.catalogDuration,241);
});

test('a longer unrelated, impersonated, non-original or wrongly timed video cannot pass the fallback',async()=>{
  const song={id:'spotify:alligatoah-negative-video',title:'Alligatoah – I Need A Face',source:'spotify',duration:241};
  const candidate={...yt('abcdefghijk','Alligatoah - I Need A Face (Official Video)',282),channel:'Alligatoah'};
  for(const alternative of [
    {...candidate,channel:'Alligatoah Fan'},
    {...candidate,channel:'Unknown uploader'},
    {...candidate,title:'Alligatoah - I Need A Face (Official Audio)'},
    {...candidate,title:'Alligatoah - I Need A Face (Instrumental) (Official Video)'},
    {...candidate,title:'Alligatoah - I Need A Face (Other DJ Remix) (Official Video)'},
    {...candidate,title:'Alligatoah - I Need A Face (Live Performance) (Official Video)'},
    {...candidate,title:'Other Artist - I Need A Face (Official Video)'},
    {...candidate,title:'Alligatoah - I Need A Face And More (Official Video)'},
    {...candidate,title:'Alligatoah - I Need Another Face (Official Video)'},
    {...candidate,duration:350},
    {...candidate,duration:0}
  ])assert.equal(spotifyOfficialMusicVideoFallbackCandidate(song,alternative),false,alternative.title+'; '+alternative.channel+'; '+alternative.duration);
  const collaboration={title:'Alligatoah, Other Artist – I Need A Face',source:'spotify',duration:241};
  assert.equal(spotifyOfficialMusicVideoFallbackCandidate(collaboration,candidate),false,'a solo music-video title cannot establish an omitted Spotify collaborator');
  const far={...yt('lmnopqrstuv','Alligatoah - Alli-Alligatoah (Official Video)',306),channel:'Alligatoah'};
  assert.equal(spotifyOfficialMusicVideoFallbackCandidate({title:'Alligatoah – Alli-Alligatoah',duration:240,source:'spotify'},far),true,'a longer exact original artist-channel video is allowed only as a clearly labeled separate version');
  assert.equal(spotifyOfficialMusicVideoFallbackCandidate({title:'Alligatoah – Alli-Alligatoah',duration:240,source:'spotify'},{...far,channel:'Unknown uploader'}),false);
});

test('actual stream length must match the verified official video and cannot silently use a different recording',async()=>{
  const song={id:'spotify:alligatoah-video-duration-mismatch',title:'Alligatoah – I Need A Face',source:'spotify',duration:241};
  const candidate={...yt('abcdefghijk','Alligatoah - I Need A Face (Official Video)',282),channel:'Alligatoah'};
  let calls=0;
  const error=await resolveSpotify(song,null,{search:async()=>[candidate],resolve:async()=>{calls++;return resolved(candidate.id,230)}}).catch(value=>value);
  assert.ok(error instanceof SpotifyMatchUnavailableError);
  assert.ok(error.diagnostics.duration>=1);
  assert.equal(calls,1);
  assert.equal(song.title,'Alligatoah – I Need A Face');
  assert.equal(song.duration,241);
  assert.equal(song.playbackVideoId,undefined);
});

test('an ordinary 231-second candidate cannot replace the original 126-second audio as a video fallback',async()=>{
  const song={...track(),id:'spotify:no-generic-video-bypass',duration:126};
  const candidate={...yt('abcdefghijk','Cy_He, EW – Breaking My Heart (Official Video)',231),channel:'Cy_He'};
  assert.equal(spotifyOfficialMusicVideoFallbackCandidate(song,candidate),false);
  let resolutions=0;
  await assert.rejects(resolveSpotify(song,null,{search:async()=>[candidate],resolve:async()=>{resolutions++;return resolved(candidate.id,231)}}),SpotifyMatchUnavailableError);
  assert.equal(resolutions,0);
  assert.equal(song.duration,126);
});


test('XTC subtitle-noted music video on exact Official YouTube Channel is matched as a labeled video fallback',async()=>{
  const song={id:'spotify:kento-xtc-official-2026',title:'Kento Nakajima – XTC',source:'spotify',duration:174};
  const candidate={...yt('abcdefghijk','Kento Nakajima (w/English Subtitles!) XTC [Music Video]',191),channel:'Kento Nakajima Official YouTube Channel'};
  assert.equal(spotifyPlaybackArtistCompatible(song,candidate),true);
  assert.equal(spotifyPlaybackTitleCompatible(song,candidate),true);
  assert.equal(spotifyOfficialMusicVideoFallbackCandidate(song,candidate),true);
  let resolvedCount=0;
  await resolveSpotify(song,null,{search:async()=>[candidate],resolve:async()=>{resolvedCount++;return resolved(candidate.id,191)}});
  assert.equal(resolvedCount,1);
  assert.equal(song.title,'Kento Nakajima – XTC');
  assert.equal(song.catalogDuration,174);
  assert.equal(song.duration,191);
  assert.equal(song.playbackMatch.version,'official-video-fallback');
  for(const wrong of [
    {...candidate,channel:'Kento Nakajima Fan'},
    {...candidate,channel:'Another Artist Official YouTube Channel'},
    {...candidate,title:'Kento Nakajima (w/English Subtitles!) IDOLIC [Music Video]'},
    {...candidate,title:'Kento Nakajima (w/English Subtitles!) XTC (Slowed) [Music Video]'},
    {...candidate,title:'Kento Nakajima (w/English Subtitles!) XTC (Other DJ Remix) [Music Video]'},
    {...candidate,duration:270}
  ])assert.equal(spotifyOfficialMusicVideoFallbackCandidate({title:'Kento Nakajima – XTC',duration:174,source:'spotify'},wrong),false,wrong.title+' / '+wrong.channel);
});

test('verified credited-artist channel can match exact Adrenalin Remix without guessing other artists',async()=>{
  const song={id:'spotify:adrenalin-credited-channel-2026',source:'spotify',title:'The Boy The G, MilleniumKid, JBS – Adrenalin - Remix',duration:157};
  const good={...yt('abcdefghijk','Adrenalin (Remix)',157),channel:'The Boy The G',artist:''};
  assert.equal(spotifyPlaybackArtistCompatible(song,good),true);
  assert.equal(spotifyPlaybackTitleCompatible(song,good),true);
  for(const bad of [
    {...good,channel:'Unknown channel'},
    {...good,channel:'Release - Topic'},
    {...good,title:'Adrenalin'},
    {...good,title:'Adrenalin (Different Producer Remix)'},
    {...good,title:'Adrenalin (Slowed Remix)'},
    {...good,title:'Adrenalin (Remix)',duration:161},
    {...good,title:'Adrenalin (Remix)',artist:'Unknown artist'}
  ])assert.equal(spotifyPlaybackTitleCompatible(song,bad),false,bad.title+' / '+bad.channel+' / '+bad.duration);
  await resolveSpotify(song,null,{search:async()=>[good],resolve:async()=>resolved(good.id,158)});
  assert.equal(song.playbackMatch.version,'audio');
  assert.equal(song.playbackVideoId,good.id);
  assert.equal(song.title,'The Boy The G, MilleniumKid, JBS – Adrenalin - Remix');
});

test('Zensery Rap channel alias requires the entire same title and near-identical catalog duration',async()=>{
  const song={id:'spotify:zensery-rap-channel',source:'spotify',title:'Zensery – TAG EIN TAG AUS',duration:170};
  const good={...yt('abcdefghijk','TAG EIN TAG AUS',170),channel:'Zensery Rap',artist:''};
  assert.equal(spotifyPlaybackTitleCompatible(song,good),true);
  for(const bad of [
    {...good,channel:'Zensery Fan'},
    {...good,channel:'Zensery Rap Fans'},
    {...good,title:'TAG EIN TAG AUS (Slowed)'},
    {...good,title:'TAG EIN TAG AUS - Cover'},
    {...good,title:'TAG EIN TAG AUS AND MORE'},
    {...good,duration:176}
  ])assert.equal(spotifyPlaybackTitleCompatible(song,bad),false,bad.title+' / '+bad.channel);
  await resolveSpotify(song,null,{search:async()=>[good],resolve:async()=>resolved(good.id,170)});
  assert.equal(song.title,'Zensery – TAG EIN TAG AUS');
  assert.equal(song.playbackVideoId,good.id);
});

test('MORTALTEKK official visualizer on the credited GARIX channel keeps exact version and duration guards',async()=>{
  const song={id:'spotify:mortaltekk-garix-credit',source:'spotify',title:'ZEVXR, GARIX, TISHKIN – MORTALTEKK',duration:102};
  const matching={...yt('abcdefghijk','MORTALTEKK | 𝓞𝓯𝓯𝓲𝓬𝓲𝓪𝓵 𝓥𝓲𝓼𝓾𝓪𝓵𝓲𝔃𝓮𝓻',108),channel:'GARIX',artist:''};
  assert.equal(spotifyPlaybackTitleCompatible(song,matching),true);
  assert.equal(spotifyPlaybackTitleCompatible(song,{...matching,channel:'Release - Topic'}),false);
  assert.equal(spotifyPlaybackTitleCompatible(song,{...matching,channel:'GARIX fan'}),false);
  assert.equal(spotifyPlaybackTitleCompatible(song,{...matching,title:'MORTALTEKK (SLOWED) | Official Visualizer'}),false);
  assert.equal(spotifyPlaybackTitleCompatible(song,{...matching,title:'MORTALTEKK (Other DJ Remix) | Official Visualizer'}),false);
  assert.equal(spotifyPlaybackTitleCompatible(song,{...matching,duration:120}),false);
  await resolveSpotify(song,null,{search:async()=>[matching],resolve:async()=>resolved(matching.id,108)});
  assert.equal(song.playbackVideoId,matching.id);
  assert.equal(song.catalogDuration,102);
  assert.equal(song.playbackDuration,108);
});

test('Release - Topic and absent YouTube results do not fabricate ReCombined or GPF playback',async()=>{
  const combined={title:'ReCombined – Hammer Down',source:'spotify',duration:147};
  const ambiguous={...yt('abcdefghijk','Hammer Down',140),channel:'Release - Topic',artist:''};
  assert.equal(spotifyPlaybackTitleCompatible(combined,ambiguous),false);
  const gpf={id:'spotify:gpf-still-no-search-result',title:'GPF – ALORS ON FUCK',source:'spotify',duration:110};
  let resolves=0;
  const error=await resolveSpotify(gpf,null,{search:async()=>[],resolve:async()=>{resolves++;return resolved('abcdefghijk',110)}}).catch(value=>value);
  assert.ok(error instanceof SpotifyMatchUnavailableError);
  assert.equal(resolves,0);
  assert.equal(gpf.playbackVideoId,undefined);
});

test('Spotify re-search skips the unavailable audio video ID and only selects another fully verified version of the same title',async()=>{
  const song={id:'spotify:recombined-audio-recovery',source:'spotify',title:'ReCombined – Hammer Down',duration:147};
  const first={...yt('abcdefghijk','ReCombined - Hammer Down (Official Audio)',147),channel:'ReCombined'};
  const second={...yt('lmnopqrstuv','Hammer Down',147),channel:'ReCombined - Topic'};
  const resolvedIds=[],search=async()=>[first,second],resolve=async url=>{
    const id=new URL(url).searchParams.get('v');resolvedIds.push(id);return resolved(id,147);
  };
  await resolveSpotify(song,null,{search,resolve});
  assert.equal(song.playbackVideoId,first.id);
  assert.equal(rejectSpotifyPlaybackMatch(song),true);
  assert.equal(song.playbackVideoId,undefined);
  assert.equal(song.title,'ReCombined – Hammer Down');
  await resolveSpotify(song,null,{search,resolve});
  assert.deepEqual(resolvedIds,[first.id,second.id]);
  assert.equal(song.playbackVideoId,second.id);
  assert.equal(song.playbackMatch.title,second.title);
  assert.equal(song.catalogDuration,147);
});

test('GPF search includes artist-bound censored profanity without accepting a random video',async()=>{
  const song={id:'spotify:gpf-censored-query',source:'spotify',title:'GPF – ALORS ON FUCK',duration:110};
  const queries=spotifyPlaybackSearchQueries(song);
  assert.ok(queries.some(query=>query.includes('GPF')&&query.includes('ALORS ON FUCK')));
  assert.ok(queries.some(query=>query.includes('GPF')&&query.includes('ALORS ON F*CK')));
  assert.ok(queries.every(query=>query.includes('GPF')),'all attempted queries stay tied to the Spotify artist');
  const unrelated=yt('abcdefghijk','ALORS ON F*CK (Other DJ Remix)',110);
  unrelated.channel='Unrelated uploader';
  assert.equal(spotifyPlaybackTitleCompatible(song,unrelated),false);
  const error=await resolveSpotify(song,null,{search:async()=>[],resolve:async()=>{assert.fail('No relevant source may be resolved')}}).catch(value=>value);
  assert.ok(error instanceof SpotifyMatchUnavailableError,'no actual YouTube results must remain a bounded skip');
  assert.equal(song.playbackVideoId,undefined);
});

test('Spotify matching records an age-restricted YouTube source and continues to other verified candidates',async()=>{
  const song={id:'spotify:age-gate-recovery',source:'spotify',title:'Alligatoah – Stay In Touch',duration:220};
  const candidate=yt('abcdefghijk','Alligatoah - Stay In Touch (Official Audio)',220);
  const error=Object.assign(new Error('Die YouTube-Quelle ist altersbeschränkt und benötigt eine authentifizierte YouTube-Sitzung.'),{code:'YOUTUBE_AGE_RESTRICTED'});
  let calls=0;
  await assert.rejects(
    resolveSpotify(song,null,{search:async()=>[candidate],resolve:async()=>{calls++;throw error}}),
    value=>{
      assert.equal(value.code,'SPOTIFY_MATCH_UNAVAILABLE');
      assert.equal(value.diagnostics.age,1);
      assert.equal(value.diagnostics.source||0,0);
      assert.match(value.message,/altersbeschränkte Quelle/);
      return true;
    }
  );
  assert.equal(calls,1);
  assert.equal(song.playbackVideoId,undefined);
});
