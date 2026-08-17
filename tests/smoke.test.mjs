import test from 'node:test';
import assert from 'node:assert/strict';
import {Player} from '../backend/src/player.js';

test('player defaults',()=>{const p=new Player({volume:55,mode:'queue'});assert.equal(p.volume,55);assert.equal(p.mode,'queue');assert.deepEqual(p.queue,[]);});
test('volume clamp',()=>{const p=new Player({volume:55,mode:'queue'});p.setVolume(130);assert.equal(p.volume,100);p.setVolume(-3);assert.equal(p.volume,0);});
test('queue clear/remove',()=>{const p=new Player({volume:55,mode:'queue'});p.queue=[{id:'1',title:'a',url:'a',source:'url'},{id:'2',title:'b',url:'b',source:'url'}];p.remove(0);assert.equal(p.queue[0].id,'2');p.clear();assert.equal(p.queue.length,0);});
