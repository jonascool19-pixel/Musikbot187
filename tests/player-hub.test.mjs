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

test('a mirrored instance shares the source player, queue, controls and PCM stream',()=>{
  const hub=new PlayerHub({musicDir:'.',diagnostic(){}}),source=hub.for('discord-one');source.current={id:'shared',title:'Gemeinsamer Titel',source:'youtube'};source.queue=[{id:'next',title:'Danach'}];source.volume=44;
  hub.setAlias('discord-two','discord-one');hub.select('discord-two');
  assert.equal(hub.state().contextId,'discord-two');assert.equal(hub.state().sourceContextId,'discord-one');assert.equal(hub.state().mirrored,true);assert.equal(hub.current.id,'shared');assert.equal(hub.volume,44);
  hub.setVolume(61);assert.equal(source.volume,61);assert.equal(hub.state().contexts.find(value=>value.id==='discord-two').mirrored,true);
  const store={data:{settings:{output:'none',outputId:null}}},manager=new IntegrationManager({player:hub,store,secrets:{}}),writes=[];
  manager.runtimes.set('discord-one',{type:'discord',write:buffer=>writes.push(['one',buffer.toString()])});manager.runtimes.set('discord-two',{type:'discord',write:buffer=>writes.push(['two',buffer.toString()])});
  source.emit('pcm',Buffer.from('S'));assert.deepEqual(writes,[['one','S'],['two','S']]);assert.equal(manager.playerFor('discord-two'),source);hub.close();
});

test('switching a mirror back to its own player does not alter the former source',()=>{
  const hub=new PlayerHub({musicDir:'.',diagnostic(){}}),source=hub.for('source');source.current={id:'shared',title:'Quelle'};hub.setAlias('target','source');hub.select('target');hub.setAlias('target',null);
  assert.equal(hub.state().sourceContextId,'target');assert.equal(hub.state().mirrored,false);assert.equal(hub.current,null);assert.equal(source.current.id,'shared');hub.close();
});

test('source state changes prepare and pause every mirrored Discord transport together',()=>{const hub=new PlayerHub({musicDir:'.',diagnostic(){}}),store={data:{settings:{output:'none',outputId:null}}},manager=new IntegrationManager({player:hub,store,secrets:{}}),calls=[],runtime=id=>({type:'discord',playbackId:null,lastPaused:null,prepare(value){this.playbackId=value;calls.push([id,'prepare',value])},reset(){this.playbackId=null},audio:{pause(){calls.push([id,'pause'])},unpause(){calls.push([id,'resume'])}}});hub.setAlias('mirror','source');manager.runtimes.set('source',runtime('source'));manager.runtimes.set('mirror',runtime('mirror'));const source=hub.for('source');source.current={id:'song',title:'Titel'};source.generation=7;source.paused=false;source.emit('state',source.state());source.paused=true;source.emit('state',source.state());assert.deepEqual(calls,[['source','prepare',7],['source','resume'],['mirror','prepare',7],['mirror','resume'],['source','pause'],['mirror','pause']]);hub.close()});
