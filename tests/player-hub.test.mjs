import test from 'node:test';
import assert from 'node:assert/strict';
import {PlayerHub,localPlayerId} from '../backend/src/player-hub.js';
import {IntegrationManager} from '../backend/src/integrations.js';

test('each Discord or TS3 instance keeps an independent player, volume and queue',()=>{
  const hub=new PlayerHub({musicDir:'.',diagnostic(){}}),first=hub.for('discord-one'),second=hub.for('discord-two');
  first.current={id:'one',title:'Titel Eins',source:'youtube'};first.queue=[{id:'next-one',title:'Danach Eins'}];first.volume=31;
  second.current={id:'two',title:'Titel Zwei',source:'youtube'};second.queue=[{id:'next-two',title:'Danach Zwei'}];second.volume=82;
  hub.select('discord-one');assert.equal(hub.state().current.id,'one');assert.equal(hub.volume,31);
  hub.select('discord-two');assert.equal(hub.state().current.id,'two');assert.equal(hub.volume,82);assert.deepEqual(hub.queue.map(item=>item.id),['next-two']);
  hub.select(localPlayerId);assert.equal(hub.state().current,null);assert.equal(hub.state().contexts.filter(context=>context.playing).length,2);
  const snapshot=hub.snapshot();assert.equal(snapshot.version,2);assert.deepEqual(snapshot.players.map(entry=>entry.id).sort(),['discord-one','discord-two','local']);hub.close();
});

test('PCM from simultaneous players is routed only to its matching runtime',()=>{
  const hub=new PlayerHub({musicDir:'.',diagnostic(){}}),store={data:{settings:{output:'none',outputId:null}}},manager=new IntegrationManager({player:hub,store,secrets:{}}),writes=[];
  manager.runtimes.set('discord-one',{type:'discord',write:buffer=>writes.push(['one',buffer.toString()])});manager.runtimes.set('discord-two',{type:'discord',write:buffer=>writes.push(['two',buffer.toString()])});
  hub.for('discord-one').emit('pcm',Buffer.from('A'));hub.for('discord-two').emit('pcm',Buffer.from('B'));
  assert.deepEqual(writes,[['one','A'],['two','B']]);hub.close();
});

test('state changes prepare only the Discord transport belonging to that player',()=>{
  const hub=new PlayerHub({musicDir:'.',diagnostic(){}}),store={data:{settings:{output:'none',outputId:null}}},manager=new IntegrationManager({player:hub,store,secrets:{}}),prepared=[];
  const runtime=id=>({type:'discord',playbackId:null,lastPaused:null,prepare(playbackId){prepared.push([id,playbackId]);this.playbackId=playbackId},reset(){this.playbackId=null},audio:{pause(){},unpause(){}}});
  manager.runtimes.set('discord-one',runtime('one'));manager.runtimes.set('discord-two',runtime('two'));
  const first=hub.for('discord-one');first.current={id:'a',title:'A'};first.generation=11;first.emit('state',first.state());
  const second=hub.for('discord-two');second.current={id:'b',title:'B'};second.generation=22;second.emit('state',second.state());
  assert.deepEqual(prepared,[['one',11],['two',22]]);hub.close();
});
