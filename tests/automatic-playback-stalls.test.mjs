import test from 'node:test';
import assert from 'node:assert/strict';
import {Player} from '../backend/src/player.js';
import {normalizeYouTubeEntries} from '../backend/src/audio/youtube-client.js';
import {spotifyPlaybackMatchRejection,spotifyPlaybackSearchQueries} from '../backend/src/spotify-playback.js';
import {playbackRecoveryPlan} from '../backend/src/audio/recovery-policy.js';

test('flat Topic search results retain bare song titles with slowed and named remix suffixes',()=>{
  for(const [artist,title] of [['conqr','POKER FACE HARDTEKK - SLOWED'],['Hysta','Gabber Madness - N-XD Remix'],['Noiseflow','All the Things She Said - Noiseflow & Triple X Remix']]){
    const [candidate]=normalizeYouTubeEntries({entries:[{id:'abcdefghijk',title,channel:artist+' - Topic',duration:200}]});
    assert.equal(candidate.artist,artist);
    assert.equal(spotifyPlaybackMatchRejection({title:artist+' – '+title,duration:200},candidate),null,title);
  }
  const [full]=normalizeYouTubeEntries({entries:[{id:'abcdefghijk',title:'Artist – Song (Remix)',channel:'Label',duration:200}]});
  assert.equal(full.artist,'Artist');
});

test('artist and song search is attempted before a quoted combined display credit',()=>{
  const queries=spotifyPlaybackSearchQueries({title:'Major Conspiracy, The Dark Horror – WAZAAAA',isrc:'DEABC2600123'});
  assert.equal(queries[0],'"DEABC2600123"');
  assert.equal(queries[1],'Major Conspiracy WAZAAAA');
});

test('an unstarted automatic search timeout advances to another queued track without a 30 second pause',()=>{
  const player=new Player({musicDir:'.'}),track={id:'auto',source:'spotify',autoplay:true,title:'Auto'},next={id:'next'};
  player.current=track;player.queue=[next];player.generation=1;
  let started=0;player.next=()=>{started++};
  player.finish(1,1,Object.assign(new Error('slow'),{code:'YOUTUBE_SEARCH_TEMPORARILY_UNAVAILABLE'}),0,track,null);
  assert.equal(player.retryTimer,null);assert.equal(player.current,null);
  assert.deepEqual(player.queue,[next]);assert.equal(started,1);
});

test('manual requests, active audio and access restrictions retain their queue protection',()=>{
  assert.equal(playbackRecoveryPlan({serviceUnavailable:true}).retry,true);
  assert.equal(playbackRecoveryPlan({serviceUnavailable:true,automaticAlternative:true,accessBlocked:true}).reason,'access-pause');
  for(const [autoplay,position,queue] of [[false,0,[{}]],[true,60,[{}]],[true,0,[]]]){
    const player=new Player({musicDir:'.'}),track={id:'keep',source:'spotify',autoplay};
    player.current=track;player.queue=queue;player.elapsedSeconds=position;player.generation=1;
    try{
      player.finish(1,1,Object.assign(new Error('slow'),{code:'YOUTUBE_SEARCH_TEMPORARILY_UNAVAILABLE'}),0,track,null);
      assert.equal(player.current,track);assert.ok(player.retryTimer);
    }finally{player.stop()}
  }
});

test('definitively unavailable automatic prefetch is removed while outgoing audio continues',async()=>{
  const calls=[],active={id:'playing',source:'local'},bad={id:'bad',source:'spotify',autoplay:true},good={id:'good',source:'youtube',autoplay:true};
  const player=new Player({musicDir:'.',resolve:async item=>{calls.push(item.id);if(item===bad)throw Object.assign(new Error('no exact match'),{code:'SPOTIFY_MATCH_UNAVAILABLE'});return 'ready'}});
  player.current=active;player.queue=[bad,good];
  try{
    player.prepareUpcoming();await player.prepared.promise;
    assert.equal(player.current,active);assert.deepEqual(player.queue,[good]);
    player.prepareUpcoming();assert.equal((await player.prepared.promise).input,'ready');
    assert.deepEqual(calls,['bad','good']);
  }finally{player.stop()}
});

test('cancelled or consumed prefetch and temporary outages never remove queued songs',async()=>{
  for(const code of ['YOUTUBE_SEARCH_TEMPORARILY_UNAVAILABLE','YOUTUBE_ACCESS_BLOCKED','SPOTIFY_MATCH_UNAVAILABLE']){
    let reject;const player=new Player({musicDir:'.',resolve:()=>new Promise((_,fail)=>{reject=fail})}),item={id:'pending',autoplay:true};
    player.current={id:'playing'};player.queue=[item];
    try{
      player.prepareUpcoming();const prepared=player.prepared;await Promise.resolve();
      if(code==='SPOTIFY_MATCH_UNAVAILABLE')player.consumePrepared(item.id);
      reject(Object.assign(new Error('failed'),{code}));await prepared.promise;
      assert.deepEqual(player.queue,[item]);
    }finally{player.stop()}
  }
});
