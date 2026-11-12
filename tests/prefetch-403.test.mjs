import test from 'node:test';
import assert from 'node:assert/strict';
import {Player} from '../backend/src/player.js';

test('crossfade prefetch is consumed once so a rejected source cannot be reused later',async()=>{
  const player=new Player({musicDir:'.',diagnostic(){}}),current={id:'current',title:'Aktuell',source:'youtube'},next={id:'next',title:'Danach',source:'youtube'};
  player.current=current;
  player.queue=[next];
  player.generation=7;
  let finishPrepared;
  const promise=new Promise(resolve=>{finishPrepared=resolve});
  player.prepared={key:'next',controller:{abort(){}},promise};

  const preparing=player.prepareCrossfadeDeck(7,current);
  await Promise.resolve();

  assert.equal(player.prepared,null,'die vorbereitete Quelle muss vor dem ersten FFmpeg-Versuch aus dem Cache entfernt werden');
  assert.ok(player.crossfadeDeck,'der Crossfade-Deck wurde angelegt');

  // Stop before FFmpeg is spawned. This models the important ownership hand-off:
  // after a 403 the later real track start must resolve a fresh URL + fresh headers.
  player.crossfadeDeck=null;
  finishPrepared({input:'https://rr1---sn-test.googlevideo.com/videoplayback?id=stale',error:null});
  await preparing;

  assert.equal(player.consumePrepared('next'),null,'dieselbe abgewiesene Prefetch-Quelle darf nicht ein zweites Mal konsumiert werden');
});

test('prepared playback sources are single-use by key',async()=>{
  const player=new Player({musicDir:'.',diagnostic(){}}),prepared={key:'song',controller:{abort(){}},promise:Promise.resolve({input:'fresh',error:null})};
  player.prepared=prepared;
  assert.equal(player.consumePrepared('other'),null);
  assert.equal(player.prepared,prepared);
  assert.equal(player.consumePrepared('song'),prepared);
  assert.equal(player.prepared,null);
  assert.equal(player.consumePrepared('song'),null);
});

test('a failed Spotify crossfade keeps prepared candidates and does not reopen on each frame',async()=>{
  const candidates=[{id:'abcdefghijk',title:'Next'}];
  const current={id:'current',source:'spotify',duration:100},next={id:'next',source:'spotify'};
  let opens=0;
  const player=new Player({musicDir:'.',diagnostic(){},resolve:async(_item,_dir,options)=>{
    opens++;
    assert.equal(options.preparedCandidates,candidates);
    throw Error('Source unavailable');
  }});
  player.current=current;
  player.queue=[next];
  player.generation=4;
  const prepared={key:'next',controller:new AbortController(),promise:Promise.resolve({input:candidates})};
  player.prepared=prepared;
  await player.prepareCrossfadeDeck(4,current);
  assert.equal(player.crossfadeDeck,null);
  assert.equal(player.prepared,prepared);
  await player.prepareCrossfadeDeck(4,current);
  assert.equal(opens,1);
  assert.equal(player.consumePrepared('next'),prepared);
});
