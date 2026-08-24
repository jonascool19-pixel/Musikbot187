import test from 'node:test';
import assert from 'node:assert/strict';
import {networkHistoryView,recordNetworkSample} from '../backend/src/network-history.js';

test('network counters are persisted as daily deltas and grouped into month and year',()=>{
  const data={networkHistory:[],networkTracker:{rx:null,tx:null,sampledAt:null}};
  assert.equal(recordNetworkSample(data,{rxTotal:1000,txTotal:500},new Date('2026-08-23T10:00:00Z')),true);
  recordNetworkSample(data,{rxTotal:3500,txTotal:1250},new Date('2026-08-23T11:00:00Z'));
  recordNetworkSample(data,{rxTotal:6000,txTotal:2000},new Date('2026-08-24T11:00:00Z'));
  const view=networkHistoryView(data);
  assert.deepEqual(view.daily.map(entry=>[entry.key,entry.rx,entry.tx]),[['2026-08-23',2500,750],['2026-08-24',2500,750]]);
  assert.deepEqual(view.monthly.map(entry=>[entry.key,entry.rx,entry.tx]),[['2026-08',5000,1500]]);
  assert.deepEqual(view.yearly.map(entry=>[entry.key,entry.rx,entry.tx]),[['2026',5000,1500]]);
});

test('network history handles container counter resets without negative traffic',()=>{
  const data={networkHistory:[],networkTracker:{rx:9000,tx:4000,sampledAt:null}};
  recordNetworkSample(data,{rxTotal:300,txTotal:100},new Date('2026-08-24T12:00:00Z'));
  const entry=networkHistoryView(data).daily[0];
  assert.equal(entry.rx,300);
  assert.equal(entry.tx,100);
});
