import test from 'node:test';
import assert from 'node:assert/strict';
import {EventEmitter} from 'node:events';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {AutoplayController,autoplayCandidateMatchesPreferences,autoplayDiscoveryQueries,autoplayMaxDurationSeconds,autoplayMusicCandidateAllowed,autoplayNonMusicSearchSuffix,autoplayTrackAllowed,inferTrackStyles,listeningProfileLimit,normalizeAutoplayConfiguration,normalizeAutoplayStyles,recommendationFamily,recommendationQuery,sameRecommendationFamily} from '../backend/src/autoplay.js';
import {buildServer} from '../backend/src/server.js';

class FakePlayer extends EventEmitter{
  constructor(){super();this.current=null;this.queue=[];this.volume=75;this.mode='queue';this.paused=false;this.playlistPlayback=null;}
  state(){return {current:this.current,queue:this.queue,volume:this.volume,mode:this.mode,paused:this.paused,playing:Boolean(this.current),resolving:false,reconnecting:false,positionSeconds:0,playbackId:this.current?1:null};}
  add(items,{now=false}={}){const list=(Array.isArray(items)?items:[items]).filter(Boolean);this.playlistPlayback=null;if(now){this.queue.unshift(...list);this.skip();return}this.queue.push(...list);if(!this.current)this.current=this.queue.shift()||null;this.emit('state',this.state());}
  clear(){this.queue=[];this.playlistPlayback=null;this.emit('state',this.state());}
  remove(index){this.queue.splice(index,1);this.emit('state',this.state());}
  skip(){this.current=this.queue.shift()||null;this.emit('state',this.state());}
  stop(){this.current=null;this.queue=[];this.emit('state',this.state());}
  pause(){this.paused=true;this.emit('state',this.state());}
  resume(){this.paused=false;this.emit('state',this.state());}
  setVolume(value){this.volume=Number(value);this.emit('state',this.state());}
  setMode(value){this.mode=value;this.emit('state',this.state());}
  snapshot(){return {version:1,current:this.current,queue:this.queue,volume:this.volume,mode:this.mode,positionSeconds:0};}
  restore(snapshot){this.current=snapshot?.current||null;this.queue=snapshot?.queue||[];this.emit('state',this.state());return Boolean(this.current);}
}

const tick=()=>new Promise(resolve=>setImmediate(resolve));

test('playlist autoplay preserves selected order, loops forever and clears only the waiting list when disabled',async()=>{
  const player=new FakePlayer(),settings={autoplayEnabled:false,autoplayMode:'playlists',autoplayPlaylistIds:['first','second'],autoplayQueueTarget:3},profile={version:1,tracks:[]},playlists=[{id:'first',name:'Erste',items:[{id:'a',title:'A',source:'youtube'},{id:'b',title:'B',source:'youtube'}]},{id:'second',name:'Zweite',items:[{id:'c',title:'C',source:'spotify'}]}],controller=new AutoplayController({player,settings,profile,getPlaylists:()=>playlists,recommend:async()=>[],save:async()=>{}});
  await controller.setEnabled(true);
  assert.equal(player.current.id,'a');
  assert.deepEqual(player.queue.map(track=>track.id),['b','c','a']);
  assert.ok(player.queue.every(track=>track.autoplay&&track.autoplayMode==='playlists'));
  assert.deepEqual(player.queue.map(track=>track.autoplayPlaylistName),['Erste','Zweite','Erste']);
  player.skip();await tick();await tick();
  assert.equal(player.current.id,'b');
  assert.deepEqual(player.queue.map(track=>track.id),['c','a','b']);
  await controller.setEnabled(false);
  assert.equal(player.current.id,'b');
  assert.deepEqual(player.queue,[]);
  controller.close();
});

test('similar autoplay filters duplicates, marks recommendations and learns a local listening profile',async()=>{
  const seed={id:'seed',title:'Uptempo Hardcore Anthem (Official Video)',source:'youtube'},player=new FakePlayer();player.current=seed;
  const settings={autoplayEnabled:false,autoplayMode:'similar',autoplayPlaylistIds:[],autoplayQueueTarget:3},profile={version:1,tracks:[]},queries=[],controller=new AutoplayController({player,settings,profile,getPlaylists:()=>[],recommend:async(track,{query})=>{queries.push({track,query});return [seed,{id:'variant',title:'Uptempo Hardcore Anthem (Hardstyle Remix)',source:'youtube'},{id:'one',title:'Other Artist – Hardcore Mix One',source:'youtube'},{id:'two',title:'Second Artist – Hardstyle Mix Two',source:'youtube'},{id:'three',title:'Third Artist – Techno Mix Three',source:'youtube'}]},save:async()=>{}});
  await controller.setEnabled(true);
  assert.deepEqual(player.queue.map(track=>track.id),['one','two','three']);
  assert.ok(player.queue.every(track=>track.autoplay&&track.autoplayMode==='similar'));
  assert.match(queries[0].query,/verschiedene Künstler/);
  assert.equal(player.queue.some(track=>track.id==='variant'),false);
  await controller.recordListened(seed,1234);
  const summary=controller.state().profile;
  assert.equal(summary.learnedTracks,1);
  assert.equal(summary.totalListens,1);
  assert.deepEqual(summary.styles.map(style=>style.name),['Uptempo','Hardcore']);
  await controller.recordListened(seed,2345);
  assert.equal(controller.state().profile.totalListens,2);
  await controller.resetProfile();
  assert.equal(controller.state().profile.learnedTracks,0);
  controller.close();
});

test('selected playlists seed the local profile once and later listening keeps refining it',async()=>{const player=new FakePlayer(),settings={autoplayEnabled:false,autoplayMode:'similar',autoplayPlaylistIds:[],autoplayQueueTarget:3},known={key:'known',id:'known',title:'Künstler – Pop Titel',source:'youtube',styles:['Pop'],listens:1,lastPlayed:1},profile={version:2,tracks:[known],preferredStyles:[],preferredArtists:[],blockedStyles:['Schlager']},hardstyle={id:'hardstyle',title:'DJ – Hardstyle Anthem',source:'spotify',duration:210},fresh={id:'fresh',title:'Band – Rock Song',source:'youtube',duration:190},playlists=[{id:'one',items:[{id:'known',title:'Künstler – Pop Titel',source:'youtube'},hardstyle,{id:'blocked',title:'Schlager Party',source:'youtube'}]},{id:'two',items:[hardstyle,fresh]}],controller=new AutoplayController({player,settings,profile,getPlaylists:()=>playlists,recommend:async()=>[],save:async()=>{}});let result=await controller.learnFromPlaylists(playlists,5_000);assert.equal(result.playlistCount,2);assert.equal(result.scanned,5);assert.equal(result.accepted,3);assert.equal(result.added,2);assert.equal(result.existing,1);assert.equal(result.ignored,2);assert.equal(result.profile.learnedTracks,3);assert.ok(result.profile.styles.some(style=>style.name==='Hardstyle'));result=await controller.learnFromPlaylists(playlists,6_000);assert.equal(result.added,0);assert.equal(result.existing,3);assert.equal(result.profile.totalListens,3);await controller.recordListened(hardstyle,7_000);assert.equal(controller.state().profile.totalListens,4);controller.close()});

test('personal mix replaces a full repeating playlist queue without replaying the same search set after reconfiguration',async()=>{
  const player=new FakePlayer(),current={id:'spotify-current',title:'Artist Eins – Playlist Titel Eins',source:'spotify'},learned={key:'spotify-learned',id:'spotify-learned',title:'Artist Zwei – Playlist Titel Zwei',source:'spotify',styles:[],listens:2,lastPlayed:2};
  player.current=current;player.queue=Array.from({length:10},(_,index)=>({id:`playlist-${index}`,title:`Playlist Titel ${index}`,source:'spotify',autoplayMode:'playlists'}));player.playlistPlayback={playlistId:'old-list',repeat:true,items:[current,...player.queue]};
  const fresh=[{id:'new-one',title:'Neuer Artist – Neuer Song Eins',source:'youtube'},{id:'new-two',title:'Anderer Artist – Neuer Song Zwei',source:'youtube'},{id:'new-three',title:'Dritter Artist – Neuer Song Drei',source:'youtube'}],settings={autoplayEnabled:false,autoplayMode:'similar',autoplayPlaylistIds:['old-list'],autoplayQueueTarget:3},queries=[],controller=new AutoplayController({player,settings,profile:{version:1,tracks:[learned]},getPlaylists:()=>[{id:'old-list',items:[current,learned]}],recommend:async(track,{query})=>{queries.push(query);return queries.length%2?[{id:'youtube-copy',title:learned.title,source:'youtube'}]:fresh},save:async()=>{}});
  await controller.setEnabled(true);
  assert.equal(player.current.id,'spotify-current');
  assert.equal(player.playlistPlayback,null);
  assert.deepEqual(player.queue.map(track=>track.id),['new-one','new-two','new-three']);
  assert.ok(player.queue.every(track=>track.autoplayMode==='similar'));
  assert.equal(player.queue.some(track=>track.id==='youtube-copy'),false);
  assert.equal(queries.length,2);
  player.queue=Array.from({length:10},(_,index)=>({id:`stale-${index}`,title:`Alte Warteschlange ${index}`,source:'spotify',autoplayMode:'playlists'}));
  player.playlistPlayback={playlistId:'old-list',repeat:true,items:[current,...player.queue]};
  await controller.configure({mode:'similar',playlistIds:['old-list'],queueTarget:3});
  assert.equal(player.playlistPlayback,null);
  assert.equal(player.queue.some(track=>fresh.some(item=>item.id===track.id)),false);
  assert.ok(queries.length>2);
  await controller.setEnabled(false);
  await controller.configure({mode:'similar',playlistIds:['old-list'],queueTarget:3});
  await controller.setEnabled(true);
  assert.equal(player.queue.some(track=>fresh.some(item=>item.id===track.id)),false);
  assert.equal(controller.state().mode,'similar');
  assert.equal(controller.state().enabled,true);
  controller.close();
});

test('autoplay configuration and recommendation text are bounded and normalized',()=>{
  const playlists=[{id:'known'}],config=normalizeAutoplayConfiguration({mode:'invalid',playlistIds:['missing','known','known'],queueTarget:999},playlists);
  assert.deepEqual(config,{mode:'playlists',playlistIds:['known'],queueTarget:20});
  assert.equal(recommendationQuery({title:'Artist – Track (Official Video).mp3'}),'Artist – Track ähnliche Songs verschiedene Künstler Mix -cover -lyrics');
  assert.deepEqual(inferTrackStyles({title:'Uptempo und Rawstyle Mix'}),['Uptempo','Hardstyle']);
  assert.equal(recommendationFamily({title:'Artist – Track (Official Video)'}),recommendationFamily({title:'Artist – Track (Sped Up Version)'}));
  assert.equal(sameRecommendationFamily({title:'Artist – Track (Official Video)'},{title:'Artist – Track (DJ Remix)'}),true);
  assert.equal(sameRecommendationFamily({title:'Artist – Track Eins'},{title:'Other Artist – Anderer Song'}),false);
  assert.deepEqual(normalizeAutoplayStyles([' Uptempo ','uptempo','Drum & Bass','x']),['Uptempo','Drum & Bass']);
  assert.equal(autoplayMaxDurationSeconds,6*60);
  assert.equal(autoplayTrackAllowed({title:'Normaler Titel',duration:autoplayMaxDurationSeconds},[]),true);
  assert.equal(autoplayTrackAllowed({title:'Drei Stunden Musikquiz',duration:autoplayMaxDurationSeconds+1},[]),false);
  assert.equal(autoplayTrackAllowed({title:'Full Album Continuous Mix'},[]),false);
  assert.equal(autoplayTrackAllowed({title:'Schlager Party',duration:180},['Schlager']),false);
});

test('preferred modern styles reject unrelated historical and conflicting music results',()=>{
  const preferences={preferredStyles:['Uptempo','Techno','Hardstyle'],queryStyle:'Uptempo'};
  assert.equal(autoplayCandidateMatchesPreferences({title:'Jemand, der über mich wacht (GERSHWIN, Oh Kay, 1926)',artist:'Historische Aufnahmen'},preferences),false);
  assert.equal(autoplayCandidateMatchesPreferences({title:'Künstler – Schlager Party',artist:'Künstler'},preferences),false);
  assert.equal(autoplayCandidateMatchesPreferences({title:'Künstler – Rawstyle Nacht',artist:'Künstler'},preferences),true);
  assert.equal(autoplayCandidateMatchesPreferences({title:'DJ Nova – Bass Attack',artist:'DJ Nova'},preferences),true);
  assert.equal(autoplayCandidateMatchesPreferences({title:'Scooter – Neues Lied',artist:'Scooter'},{preferredStyles:['Uptempo'],preferredArtists:['Scooter'],queryArtist:'Scooter'}),true);
});

test('a strict genre bucket cannot be filled by a different hard-dance style',()=>{
  const hardstyle={preferredStyles:['Hardstyle'],queryStyle:'Hardstyle',strictStyle:true};
  assert.equal(autoplayCandidateMatchesPreferences({title:'DJ – Uptempo Feuer',source:'youtube'},hardstyle),false);
  assert.equal(autoplayCandidateMatchesPreferences({title:'DJ – Hardstyle Feuer',source:'youtube'},hardstyle),true);
});

test('the listening profile learns artists and their listening weight',async()=>{
  const player=new FakePlayer(),settings={autoplayEnabled:false,autoplayMode:'similar',autoplayPlaylistIds:[],autoplayQueueTarget:3},profile={version:2,tracks:[],preferredStyles:[],preferredArtists:[],blockedStyles:[]},controller=new AutoplayController({player,settings,profile,getPlaylists:()=>[],recommend:async()=>[],save:async()=>{}});
  await controller.recordListened({id:'fire',title:'Scooter – Fire',channel:'Scooter - Topic',source:'youtube'},1);
  await controller.recordListened({id:'fire',title:'Scooter – Fire',channel:'Scooter - Topic',source:'youtube'},2);
  await controller.recordListened({id:'sun',title:'Rammstein – Sonne',artist:'Rammstein',source:'youtube'},3);
  const summary=controller.profileSummary();
  assert.deepEqual(summary.artists.slice(0,2),[{name:'Scooter',weight:2},{name:'Rammstein',weight:1}]);
  assert.equal(summary.tracks.find(track=>track.title.includes('Scooter')).artist,'Scooter');
  controller.close();
});

test('personal autoplay interleaves manual and learned genres with artists',async()=>{
  const player=new FakePlayer(),queries=[],settings={autoplayEnabled:false,autoplayMode:'similar',autoplayPlaylistIds:[],autoplayQueueTarget:7},profile={version:2,tracks:[
    {key:'learned-up',id:'learned-up',title:'Uptempo Profilwurzel',source:'youtube',styles:['Uptempo'],listens:4,lastPlayed:2},
    {key:'learned-techno',id:'learned-techno',title:'Techno Profilwurzel',source:'youtube',styles:['Techno'],listens:3,lastPlayed:1}
  ],preferredStyles:['Hardstyle'],preferredArtists:['Scooter'],blockedStyles:[]};
  const titles={
    Hardstyle:['Alpha Crew – Hardstyle Fire','Beta Unit – Hardstyle Storm','Gamma Duo – Hardstyle Night'],
    Uptempo:['Fast One – Uptempo Fire','Fast Two – Uptempo Storm','Fast Three – Uptempo Night'],
    Techno:['Club One – Techno Fire','Club Two – Techno Storm','Club Three – Techno Night'],
    Scooter:['Scooter – Fire','Scooter – Maria','Scooter – Hyper Hyper']
  };
  const controller=new AutoplayController({player,settings,profile,getPlaylists:()=>[],recommend:async(track,{query})=>{queries.push(query);const category=Object.keys(titles).find(name=>query.startsWith(name));return (titles[category]||[]).map((title,index)=>({id:`${category}-${index}`,title,artist:category==='Scooter'?'Scooter':'',source:'youtube',duration:200}))},save:async()=>{}});
  await controller.setEnabled(true);
  const firstFour=[player.current,...player.queue].slice(0,4);
  assert.deepEqual(firstFour.map(track=>track.autoplayCategory),['Hardstyle','Scooter','Uptempo','Techno']);
  assert.ok(queries.some(query=>query.startsWith('Hardstyle')));
  assert.ok(queries.some(query=>query.startsWith('Uptempo')));
  assert.ok(queries.some(query=>query.startsWith('Techno')));
  assert.ok(queries.some(query=>query.startsWith('Scooter')));
  assert.match(controller.state().detail,/Musikvorgaben und deinem gelernten Profil/);
  controller.close();
});

test('profile preference changes return immediately and refill after an older search finishes',async()=>{
  const player=new FakePlayer(),settings={autoplayEnabled:true,autoplayMode:'similar',autoplayPlaylistIds:[],autoplayQueueTarget:3},profile={version:2,tracks:[],preferredStyles:['Hardstyle'],preferredArtists:[],blockedStyles:[]};let releaseFirst,calls=0;
  const controller=new AutoplayController({player,settings,profile,getPlaylists:()=>[],recommend:async()=>{calls++;if(calls===1)return new Promise(resolve=>{releaseFirst=resolve});return []},save:async()=>{}});
  const oldFill=controller.fill();await tick();
  await controller.updateProfileStyles({preferredStyles:['Techno'],preferredArtists:[],blockedStyles:[]});
  assert.deepEqual(controller.profileSummary().preferredStyles,['Techno']);
  assert.equal(calls,1);
  releaseFirst([]);
  await oldFill;await tick();await tick();
  assert.ok(calls>=3);
  controller.close();
});

test('autoplay keeps music results and rejects tutorials and study videos',()=>{
  assert.equal(autoplayMusicCandidateAllowed({title:'So nutzen Sie den Apple Music Web Player',artist:'Apple Support',source:'youtube',duration:94}),false);
  assert.equal(autoplayMusicCandidateAllowed({title:'Music + Study = DISTRACTING?!',artist:'Study Channel',source:'youtube',duration:52}),false);
  assert.equal(autoplayMusicCandidateAllowed({title:'Top 100 Hardstyle Songs 2026 Playlist',artist:'Dance Channel',source:'youtube',duration:240}),false);
  assert.equal(autoplayMusicCandidateAllowed({title:'Die besten 10 Uptempo Lieder',artist:'Ranking Kanal',source:'youtube',duration:220}),false);
  assert.equal(autoplayMusicCandidateAllowed({title:'Hardtekk Songs Mix Sammlung',artist:'Mix Kanal',source:'youtube',duration:300}),false);
  assert.equal(autoplayMusicCandidateAllowed({title:'DJ – Uptempo Track (Official Audio)',source:'youtube',duration:361}),false);
  assert.equal(autoplayMusicCandidateAllowed({title:'MilleniumKid & JBS BEATS – Unendlichkeit (Official Visualizer)',source:'youtube',duration:181}),true);
  assert.equal(autoplayMusicCandidateAllowed({title:'Klatschkind - Seelenficker [Rework 2018] (Album: Seelenficker)',source:'youtube',duration:210}),true);
  assert.equal(autoplayMusicCandidateAllowed({title:'Turbo Saté Remix',artist:'New Kids, Paul Elstak, Satirized, Aalst',source:'youtube',duration:193}),true);
  assert.match(autoplayNonMusicSearchSuffix,/-tutorial/);
  assert.match(autoplayNonMusicSearchSuffix,/-podcast/);
  assert.match(autoplayNonMusicSearchSuffix,/-playlist/);
});

test('similar autoplay accepts flat music-search results without optional YouTube metadata',async()=>{
  const player=new FakePlayer();player.current={id:'turbo',title:'New Kids, Paul Elstak, Satirized, Aalst – Turbo (Satirized & Aalst Turbo Saté Remix)',artist:'Paul Elstak',source:'youtube',duration:193,autoplay:true,autoplayMode:'similar'};
  const settings={autoplayEnabled:true,autoplayMode:'similar',autoplayPlaylistIds:[],autoplayQueueTarget:3},profile={version:2,tracks:[],preferredStyles:['Uptempo','Techno','Hardstyle'],preferredArtists:[],blockedStyles:[]},recommendations=Array.from({length:5},(_,index)=>({id:`plain-song-${index}`,title:`Turbo Titel ${index}`,source:'youtube'})),controller=new AutoplayController({player,settings,profile,getPlaylists:()=>[],recommend:async()=>recommendations,save:async()=>{}});
  await controller.fill();
  assert.equal(player.current.id,'turbo');
  assert.deepEqual(player.queue.map(track=>track.id),['plain-song-0','plain-song-2','plain-song-4']);
  controller.close();
});

test('a learned style profile pulls an unrelated autoplay drift back to the learned music',async()=>{
  const player=new FakePlayer();player.current={id:'drift',title:'Pop Artist – Fremder Pop Song',source:'youtube',autoplay:true,autoplayMode:'similar'};
  const profile={version:2,tracks:[{key:'learned-root',id:'learned-root',title:'Profil DJ – Uptempo Wurzel',source:'youtube',styles:['Uptempo'],listens:5,lastPlayed:5}],preferredStyles:[],preferredArtists:[],blockedStyles:[]},settings={autoplayEnabled:true,autoplayMode:'similar',autoplayPlaylistIds:[],autoplayQueueTarget:3},queries=[],recommendations=Array.from({length:4},(_,index)=>({id:`profile-${index}`,title:`Profil DJ ${index} – Uptempo Track ${index}`,source:'youtube',duration:200})),controller=new AutoplayController({player,settings,profile,getPlaylists:()=>[],recommend:async(track,{query})=>{queries.push(query);return recommendations},save:async()=>{}});
  await controller.fill();
  assert.doesNotMatch(queries[0],/Fremder Pop Song/);
  assert.match(queries[0],/Uptempo/);
  assert.deepEqual([player.current,...player.queue].map(track=>track.id),recommendations.map(track=>track.id));
  assert.match(controller.state().detail,/gelernten Musikprofil/);
  controller.close();
});

test('autoplay consumes unused fresh search results before asking YouTube for the same list again',async()=>{
  const player=new FakePlayer();player.current={id:'manual-seed',title:'DJ Seed – Uptempo Start',source:'youtube'};
  const settings={autoplayEnabled:false,autoplayMode:'similar',autoplayPlaylistIds:[],autoplayQueueTarget:3},profile={version:2,tracks:[],preferredStyles:['Uptempo'],preferredArtists:[],blockedStyles:[]},recommendations=Array.from({length:8},(_,index)=>({id:`fresh-${index}`,title:`DJ ${index} – Uptempo Lied ${index}`,source:'youtube'}));let searches=0;
  const controller=new AutoplayController({player,settings,profile,getPlaylists:()=>[],recommend:async()=>{searches++;return recommendations},save:async()=>{}});
  await controller.setEnabled(true);
  assert.equal(searches,1);
  assert.deepEqual(player.queue.map(track=>track.id),['fresh-0','fresh-1','fresh-2']);
  player.skip();await tick();await tick();
  assert.equal(searches,1);
  assert.deepEqual(player.queue.map(track=>track.id),['fresh-1','fresh-2','fresh-3']);
  controller.close();
});

test('autoplay remembers its last titles across restarts and searches for a different set',async()=>{
  const firstSet=Array.from({length:4},(_,index)=>({id:`old-${index}`,title:`Alter DJ ${index} – Uptempo Alt ${index}`,source:'youtube'})),secondSet=Array.from({length:4},(_,index)=>({id:`new-${index}`,title:`Neuer DJ ${index} – Uptempo Neu ${index}`,source:'youtube'})),profile={version:2,tracks:[],preferredStyles:['Uptempo'],preferredArtists:[],blockedStyles:[]},firstPlayer=new FakePlayer(),firstSettings={autoplayEnabled:false,autoplayMode:'similar',autoplayPlaylistIds:[],autoplayQueueTarget:3},first=new AutoplayController({player:firstPlayer,settings:firstSettings,profile,getPlaylists:()=>[],recommend:async()=>firstSet,save:async()=>{}});
  await first.setEnabled(true);
  assert.deepEqual([firstPlayer.current,...firstPlayer.queue].map(track=>track.id),firstSet.map(track=>track.id));
  assert.equal(profile.recentAutoplay.length,4);
  first.close();
  const secondPlayer=new FakePlayer(),secondSettings={...firstSettings,autoplayEnabled:false};let searches=0;
  const second=new AutoplayController({player:secondPlayer,settings:secondSettings,profile,getPlaylists:()=>[],recommend:async()=>++searches===1?firstSet:secondSet,save:async()=>{}});
  await second.setEnabled(true);
  assert.equal(searches,2);
  assert.deepEqual([secondPlayer.current,...secondPlayer.queue].map(track=>track.id),secondSet.map(track=>track.id));
  assert.equal(profile.recentAutoplay.length,8);
  second.close();
});

test('learned profile songs are a last-resort music source instead of a permanent blacklist',async()=>{
  const learned=Array.from({length:5},(_,index)=>({key:`youtube:known-${index}`,id:`known-${index}`,title:`Bekannter Künstler ${index} – Uptempo Lied ${index}`,source:'youtube',styles:['Uptempo'],listens:index+1,lastPlayed:index+1})),player=new FakePlayer(),settings={autoplayEnabled:true,autoplayMode:'similar',autoplayPlaylistIds:[],autoplayQueueTarget:3},profile={version:2,tracks:learned,preferredStyles:['Uptempo'],preferredArtists:[],blockedStyles:[]},recommendations=learned.map(track=>({...track})),controller=new AutoplayController({player,settings,profile,getPlaylists:()=>[],recommend:async()=>recommendations,save:async()=>{}});
  await controller.fill();
  assert.equal(player.current.id,'known-0');
  assert.deepEqual(player.queue.map(track=>track.id),['known-1','known-2','known-3']);
  controller.close();
});

test('similar autoplay removes restored non-music from current playback and queue',async()=>{
  const player=new FakePlayer();
  player.current={id:'study',title:'Music + Study = DISTRACTING?!',artist:'Study Channel',source:'youtube',duration:52,autoplay:true,autoplayMode:'similar'};
  player.queue=[
    {id:'apple-help',title:'So nutzen Sie den Apple Music Web Player',artist:'Apple Support',source:'youtube',duration:94,autoplay:true,autoplayMode:'similar'},
    {id:'song-one',title:'DJ Eins – Uptempo Feuer',source:'youtube',duration:180,autoplay:true,autoplayMode:'similar'},
    {id:'song-two',title:'DJ Zwei – Rawstyle Nacht',source:'youtube',duration:190,autoplay:true,autoplayMode:'similar'},
    {id:'song-three',title:'DJ Drei – Techno Licht',source:'youtube',duration:200,autoplay:true,autoplayMode:'similar'},
    {id:'song-four',title:'DJ Vier – Hardstyle Bass',source:'youtube',duration:210,autoplay:true,autoplayMode:'similar'}
  ];
  const settings={autoplayEnabled:true,autoplayMode:'similar',autoplayPlaylistIds:[],autoplayQueueTarget:3},profile={version:2,tracks:[],preferredStyles:['Uptempo','Techno','Hardstyle'],preferredArtists:[],blockedStyles:[]},controller=new AutoplayController({player,settings,profile,getPlaylists:()=>[],recommend:async()=>[],save:async()=>{}});
  await controller.fill();
  assert.equal(player.current.id,'song-one');
  assert.deepEqual(player.queue.map(track=>track.id),['song-two','song-three','song-four']);
  assert.equal([player.current,...player.queue].some(track=>['study','apple-help'].includes(track.id)),false);
  controller.close();
});

test('configured styles never fall back to the broad discovery mix',async()=>{
  const player=new FakePlayer(),queries=[],settings={autoplayEnabled:false,autoplayMode:'similar',autoplayPlaylistIds:[],autoplayQueueTarget:3},profile={version:2,tracks:[],preferredStyles:['Uptempo','Techno','Hardstyle'],preferredArtists:[],blockedStyles:[]},recommendations=[
    {id:'wrong-old',title:'Jemand, der über mich wacht (GERSHWIN, Oh Kay, 1926)',source:'youtube'},
    {id:'wrong-style',title:'Sänger – Schlager Party',source:'youtube'},
    {id:'right-one',title:'DJ Eins – Uptempo Feuer',source:'youtube'},
    {id:'right-two',title:'DJ Zwei – Rawstyle Nacht',source:'youtube'},
    {id:'right-three',title:'DJ Drei – Techno Licht',source:'youtube'},
    {id:'right-four',title:'DJ Vier – Bass Attack',source:'youtube'}
  ],controller=new AutoplayController({player,settings,profile,getPlaylists:()=>[],recommend:async(track,{query})=>{queries.push(query);return recommendations},save:async()=>{}});
  await controller.setEnabled(true);
  assert.deepEqual([player.current,...player.queue].map(track=>track.id),['right-one','right-three','right-two','right-four']);
  assert.match(queries[0],/^Uptempo\b/);
  assert.equal(queries.some(query=>autoplayDiscoveryQueries.some(discovery=>query.includes(discovery))),false);
  controller.close();
});

test('personal mix keeps manual taste controls, rejects long-form results and never learns its own suggestions',async()=>{const seed={id:'seed-hardstyle',title:'Artist – Hardstyle Anthem',source:'youtube',duration:220},player=new FakePlayer();player.current=seed;const settings={autoplayEnabled:false,autoplayMode:'similar',autoplayPlaylistIds:[],autoplayQueueTarget:3},profile={version:2,tracks:[],preferredStyles:['Uptempo'],preferredArtists:['Scooter'],blockedStyles:['Schlager']},queries=[],recommendations=[{id:'quiz',title:'Das große Musikquiz',source:'youtube',duration:3900},{id:'unknown-mix',title:'Full Album Continuous Mix',source:'youtube'},{id:'schlager',title:'Schlager Party Hit',source:'youtube',duration:190},{id:'valid-one',title:'Künstler Eins – Uptempo Feuer',source:'youtube',duration:210},{id:'valid-two',title:'Künstler Zwei – Rawstyle Nacht',source:'youtube',duration:260},{id:'too-long',title:'Künstler Drei – Hardcore Licht',source:'youtube',duration:599},{id:'valid-three',title:'Künstler Vier – Hardcore Sturm',source:'youtube',duration:300}],controller=new AutoplayController({player,settings,profile,getPlaylists:()=>[],recommend:async(track,{query})=>{queries.push(query);return recommendations},save:async()=>{}});await controller.setEnabled(true);assert.deepEqual(player.queue.map(track=>track.id),['valid-one','valid-two','valid-three']);assert.match(queries[0],/Uptempo/);assert.ok(queries.some(query=>/Scooter/.test(query)));assert.match(queries[0],/-Schlager/);assert.doesNotMatch(queries[0],/Hardstyle Anthem/);assert.match(controller.state().detail,/Musikvorgaben/);await controller.recordListened(player.queue[0],1000);assert.equal(controller.state().profile.learnedTracks,0);await controller.recordListened({id:'manual-schlager',title:'Schlager Party',source:'youtube',duration:180},2000);assert.equal(controller.state().profile.learnedTracks,0);await controller.recordListened({id:'manual-pop',title:'Artist – Pop Song',source:'youtube',duration:200},3000);const learned=controller.state().profile.tracks[0];assert.equal(controller.state().profile.learnedTracks,1);const blocked=await controller.blockProfileTrack(learned.key);assert.deepEqual(blocked.added,['Pop']);assert.deepEqual(blocked.profile.blockedStyles,['Schlager','Pop']);assert.deepEqual(blocked.profile.preferredArtists,['Scooter']);assert.equal(blocked.profile.learnedTracks,0);assert.deepEqual(player.queue,[]);await controller.updateProfileStyles({preferredStyles:['Schlager','Uptempo'],preferredArtists:['Rammstein'],blockedStyles:[]});assert.deepEqual(controller.state().profile.preferredStyles,['Schlager','Uptempo']);assert.deepEqual(controller.state().profile.preferredArtists,['Rammstein']);assert.deepEqual(controller.state().profile.blockedStyles,[]);controller.close()});

test('similar autoplay starts from silence, prepares ten waiting tracks and keeps a balanced bounded profile',async()=>{const player=new FakePlayer(),settings={autoplayEnabled:false,autoplayMode:'similar',autoplayPlaylistIds:[],autoplayQueueTarget:10},profile={version:1,tracks:[]},queries=[],controller=new AutoplayController({player,settings,profile,getPlaylists:()=>[],recommend:async(track,{query})=>{queries.push(query);return Array.from({length:14},(_,index)=>({id:`discovery-${index}`,title:`Künstler ${index} – Uptempo Titel ${index}`,source:'youtube'}))},save:async()=>{}});await controller.setEnabled(true);assert.equal(player.current.id,'discovery-0');assert.equal(player.queue.length,10);assert.match(queries[0],/verschiedene Künstler/);for(let index=0;index<listeningProfileLimit+7;index++)await controller.recordListened({id:`learn-${index}`,title:`Titel ${index}`,source:'youtube'},index);assert.equal(controller.state().profile.learnedTracks,listeningProfileLimit);const removable=controller.state().profile.tracks[0];await controller.removeProfileTrack(removable.key);assert.equal(controller.state().profile.learnedTracks,listeningProfileLimit-1);controller.close();});

test('autoplay tries several discovery searches when the first search is empty',async()=>{const player=new FakePlayer(),settings={autoplayEnabled:false,autoplayMode:'similar',autoplayPlaylistIds:[],autoplayQueueTarget:3},queries=[],controller=new AutoplayController({player,settings,profile:{version:1,tracks:[]},getPlaylists:()=>[],recommend:async(track,{query})=>{queries.push(query);return queries.length<3?[]:Array.from({length:5},(_,index)=>({id:`fallback-${index}`,title:`Künstler ${index} – Titel ${index}`,source:'youtube'}))},save:async()=>{}});await controller.setEnabled(true);assert.equal(queries.length,3);assert.equal(player.current.id,'fallback-0');assert.equal(player.queue.length,3);assert.equal(controller.state().status,'active');controller.close()});

test('an empty discovery remains enabled and schedules an automatic retry',async()=>{const player=new FakePlayer(),settings={autoplayEnabled:false,autoplayMode:'similar',autoplayPlaylistIds:[],autoplayQueueTarget:3},controller=new AutoplayController({player,settings,profile:{version:1,tracks:[]},getPlaylists:()=>[],recommend:async()=>[],save:async()=>{}});await controller.setEnabled(true);assert.equal(controller.state().enabled,true);assert.equal(controller.state().status,'waiting');assert.match(controller.state().detail,/30 Sekunden/);assert.equal(controller.scheduled?.kind,'timeout');controller.close()});

test('autoplay API saves configuration, fills the queue and clears it from the dashboard switch',async t=>{
  const dir=await fs.mkdtemp(path.join(os.tmpdir(),'musikbot187-autoplay-')),player=new FakePlayer(),app=await buildServer({dataDir:dir,musicDir:path.join(dir,'music'),stateFile:path.join(dir,'state.json'),secretFile:path.join(dir,'secret.key'),frontendDir:path.resolve('frontend'),setupToken:'setup-test-token',logger:false,controlSocket:path.join(dir,'control.sock'),player,autoplayRecommendationProvider:async()=>[],autoplayStyleValidationProvider:async query=>/Rammstein/.test(query)?[{title:'Rammstein – Sonne'}]:[]});
  t.after(async()=>{await app.close();await fs.rm(dir,{recursive:true,force:true});});
  let response=await app.inject({method:'POST',url:'/api/setup',headers:{'x-musikbot-setup-token':'setup-test-token'},payload:{username:'admin',password:'correct-horse-battery'}}),headers={authorization:`Bearer ${response.json().token}`};
  response=await app.inject({url:'/api/autoplay',headers});assert.deepEqual(response.json().profile.blockedStyles,[]);response=await app.inject({method:'PUT',url:'/api/autoplay/profile/styles',headers,payload:{preferredStyles:['Uptempo'],preferredArtists:['Rammstein'],blockedStyles:['Schlager']}});assert.equal(response.statusCode,200,response.body);assert.deepEqual(response.json().profile.preferredStyles,['Uptempo']);assert.deepEqual(response.json().profile.preferredArtists,['Rammstein']);assert.deepEqual(response.json().profile.blockedStyles,['Schlager']);const persistedProfile=JSON.parse(await fs.readFile(path.join(dir,'state.json'),'utf8')).listeningProfile;assert.deepEqual(persistedProfile.preferredStyles,['Uptempo']);assert.deepEqual(persistedProfile.preferredArtists,['Rammstein']);assert.deepEqual(persistedProfile.blockedStyles,['Schlager']);response=await app.inject({method:'PUT',url:'/api/autoplay/profile/styles',headers,payload:{preferredStyles:[],blockedStyles:Array.from({length:21},(_,index)=>`Stil ${index}`)}});assert.equal(response.statusCode,400,response.body);
  response=await app.inject({method:'POST',url:'/api/playlists',headers,payload:{name:'Autoplay Liste',items:[{id:'one',title:'Titel Eins',source:'youtube'},{id:'two',title:'Titel Zwei',source:'spotify'}]}});const playlist=response.json();
  response=await app.inject({method:'POST',url:'/api/autoplay/profile/playlists',headers,payload:{playlistIds:[playlist.id]}});assert.equal(response.statusCode,200,response.body);assert.equal(response.json().playlistCount,1);assert.equal(response.json().scanned,2);assert.equal(response.json().added,2);assert.equal(response.json().profile.learnedTracks,2);response=await app.inject({method:'POST',url:'/api/autoplay/profile/playlists',headers,payload:{playlistIds:['missing']}});assert.equal(response.statusCode,400,response.body);
  response=await app.inject({method:'PUT',url:'/api/autoplay/config',headers,payload:{mode:'playlists',playlistIds:[playlist.id],queueTarget:4}});assert.equal(response.statusCode,200,response.body);assert.deepEqual(response.json().playlistIds,[playlist.id]);
  response=await app.inject({method:'PUT',url:'/api/autoplay/enabled',headers,payload:{enabled:true}});assert.equal(response.statusCode,200,response.body);assert.equal(response.json().autoplay.enabled,true);assert.equal(response.json().player.current.id,'one');assert.equal(response.json().player.queue.length,4);
  response=await app.inject({url:'/api/state',headers});assert.equal(response.json().autoplay.mode,'playlists');assert.equal(response.json().autoplay.status,'active');
  response=await app.inject({method:'POST',url:'/api/player/queue',headers,payload:{item:{id:'manual',title:'Manueller Titel',source:'youtube'},now:true}});assert.equal(response.statusCode,200,response.body);assert.equal(response.json().current.id,'manual');assert.ok(response.json().queue.length<=4);
  response=await app.inject({method:'PUT',url:'/api/autoplay/enabled',headers,payload:{enabled:false}});assert.equal(response.statusCode,200,response.body);assert.equal(response.json().player.current.id,'manual');assert.deepEqual(response.json().player.queue,[]);
  response=await app.inject({method:'PUT',url:'/api/autoplay/config',headers,payload:{mode:'unknown',playlistIds:[],queueTarget:5}});assert.equal(response.statusCode,400);
});

test('dashboard autoplay falls back to the personal mix and starts from silence without configured playlists',async t=>{const dir=await fs.mkdtemp(path.join(os.tmpdir(),'musikbot187-autoplay-fallback-')),player=new FakePlayer(),recommendations=Array.from({length:12},(_,index)=>({id:`mix-${index}`,title:`Künstler ${index} – Titel ${index}`,source:'youtube'})),app=await buildServer({dataDir:dir,musicDir:path.join(dir,'music'),stateFile:path.join(dir,'state.json'),secretFile:path.join(dir,'secret.key'),frontendDir:path.resolve('frontend'),setupToken:'setup-test-token',logger:false,controlSocket:path.join(dir,'control.sock'),player,autoplayRecommendationProvider:async()=>recommendations});t.after(async()=>{await app.close();await fs.rm(dir,{recursive:true,force:true})});let response=await app.inject({method:'POST',url:'/api/setup',headers:{'x-musikbot-setup-token':'setup-test-token'},payload:{username:'admin',password:'correct-horse-battery'}}),headers={authorization:`Bearer ${response.json().token}`};response=await app.inject({method:'PUT',url:'/api/autoplay/config',headers,payload:{mode:'playlists',playlistIds:[],queueTarget:10}});assert.equal(response.statusCode,200,response.body);response=await app.inject({method:'PUT',url:'/api/autoplay/enabled',headers,payload:{enabled:true}});assert.equal(response.statusCode,200,response.body);assert.equal(response.json().autoplay.mode,'similar');assert.equal(response.json().autoplay.enabled,true);assert.equal(response.json().player.current.id,'mix-0');assert.equal(response.json().player.queue.length,10)});
