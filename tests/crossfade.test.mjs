import test from 'node:test';
import assert from 'node:assert/strict';
import {chooseCrossfadeMs,defaultCrossfadeMs,EqualPowerCrossfade,equalPowerGains,manualTransitionMs,pcmBytesForMs} from '../backend/src/crossfade.js';
import {Player} from '../backend/src/player.js';

test('equal-power gains keep constant summed power across the transition',()=>{
  for(const progress of[0,0.1,0.25,0.5,0.75,0.9,1]){
    const gains=equalPowerGains(progress),power=gains.outgoing**2+gains.incoming**2;
    assert.ok(Math.abs(power-1)<1e-12);
  }
  assert.deepEqual(equalPowerGains(0),{outgoing:1,incoming:0});
  assert.ok(equalPowerGains(1).outgoing<1e-12);
  assert.equal(equalPowerGains(1).incoming,1);
});

test('equal-power PCM mixer starts with the old deck and ends with the new deck',()=>{
  const mixer=new EqualPowerCrossfade(1_000,{sampleRate:10,channels:1}),outgoing=Buffer.alloc(20),incoming=Buffer.alloc(20);
  for(let offset=0;offset<20;offset+=2){outgoing.writeInt16LE(10_000,offset);incoming.writeInt16LE(20_000,offset)}
  const mixed=mixer.process(outgoing,incoming);
  assert.equal(mixed.readInt16LE(0),10_000);
  assert.ok(Math.abs(mixed.readInt16LE(18)-20_000)<=1);
  assert.equal(mixer.done,true);
});

test('crossfade duration is only selected when enough next-track PCM is already buffered',()=>{
  assert.equal(defaultCrossfadeMs,3_000);
  assert.equal(chooseCrossfadeMs(3_060,pcmBytesForMs(3_000)),3_000);
  assert.equal(chooseCrossfadeMs(2_000,pcmBytesForMs(1_400)),1_400);
  assert.equal(chooseCrossfadeMs(3_000,pcmBytesForMs(500)),0);
  assert.equal(chooseCrossfadeMs(500,pcmBytesForMs(3_000)),0);
});

test('an unready next deck leaves the queue untouched instead of cutting the current song short',()=>{
  const player=new Player({musicDir:'.',diagnostic(){}}),current={id:'current',title:'Aktiv',source:'youtube',duration:100},next={id:'next',title:'Danach',source:'youtube',duration:100};
  player.current=current;player.queue=[next];player.generation=3;player.elapsedSeconds=97.5;
  player.crossfadeDeck={key:'next',item:next,store:{bufferedBytes:pcmBytesForMs(300)}};
  player.maybeCrossfade(3,current);
  assert.equal(player.crossfade,null);
  assert.deepEqual(player.queue.map(item=>item.id),['next']);
  player.crossfadeDeck=null;
});

test('starting and aborting a crossfade consumes then safely restores exactly one next title',()=>{
  const player=new Player({musicDir:'.',diagnostic(){}}),current={id:'current',title:'Aktiv',source:'youtube',duration:100},next={id:'next',title:'Danach',source:'youtube',duration:100},store={bufferedBytes:pcmBytesForMs(3_000),destroy(){this.destroyed=true}};
  player.current=current;player.queue=[next];player.generation=4;const deck={key:'next',item:next,store};player.crossfadeDeck=deck;
  assert.equal(player.beginCrossfade(deck,3_000),true);
  assert.deepEqual(player.queue,[]);
  assert.equal(player.state().crossfading,true);
  player.abortCrossfade(true);
  assert.deepEqual(player.queue.map(item=>item.id),['next']);
  assert.equal(player.crossfade,null);
});

test('manual skip requests a short fade before replacing an actively playing process',()=>{
  const player=new Player({musicDir:'.',diagnostic(){}}),events=[];player.current={id:'current',title:'Aktiv',source:'youtube',duration:180};player.queue=[{id:'next',title:'Danach',source:'youtube'}];player.process={kill(){}};player.on('track-end',event=>events.push(event));player.skip();
  assert.equal(manualTransitionMs,800);
  assert.equal(events[0].reason,'skipped');
  assert.equal(player.current.id,'current');
  assert.ok(player.skipTimer);
  assert.equal(player.transitionScaler.target,0);
  clearTimeout(player.skipTimer);player.skipTimer=null;player.pendingSkip=null;player.process=null;
});

test('technical reconnect cancels transition preparation but keeps the same title for resume',()=>{
  const player=new Player({musicDir:'.',diagnostic(){}}),current={id:'current',title:'Aktiv',source:'youtube',duration:180};player.current=current;player.generation=9;player.elapsedSeconds=42;player.crossfadeDeck={key:'next',item:{id:'next'},store:{destroy(){}}};player.finish(9,1,'HTTP error 403 Forbidden',0);
  assert.equal(player.current.id,'current');
  assert.equal(player.reconnecting,true);
  assert.equal(player.crossfade,null);
  assert.equal(player.crossfadeDeck,null);
  clearTimeout(player.retryTimer);player.retryTimer=null;
});
