import test from 'node:test';
import assert from 'node:assert/strict';
import {recordResourceSample,resetResourceMeasurement,resourceAdvisor,resourceMinimumSamples} from '../backend/src/resource-advisor.js';

const sample=(cpu=30,memory=512*1024*1024,rx=100_000,tx=40_000)=>({cpu:{busyPercent:cpu,cores:2},memory:{used:memory,total:2*1024*1024*1024},network:{rxPerSecond:rx,txPerSecond:tx}});

test('resource advisor finishes a fixed 24-hour run and keeps its result afterwards',()=>{
  const data={resourceHistory:[]},start=new Date('2026-09-14T00:00:00.000Z');
  for(let index=0;index<=288;index++)recordResourceSample(data,sample(20+index%30,400*1024*1024+index*1024,80_000+index*100,30_000+index*50),new Date(start.getTime()+index*5*60_000));
  const completed=resourceAdvisor(data,new Date(start.getTime()+24*60*60_000));
  assert.equal(completed.completed,true);assert.equal(completed.ready,true);assert.equal(completed.progressPercent,100);assert.equal(completed.collectedHours,24);assert.equal(completed.completedAt,'2026-09-15T00:00:00.000Z');assert.ok(completed.recommendation);const frozen=structuredClone(data.resourceHistory);
  assert.equal(recordResourceSample(data,sample(99,1.5*1024*1024*1024,999_999,888_888),new Date(start.getTime()+48*60*60_000)),false);assert.deepEqual(data.resourceHistory,frozen);
  const later=resourceAdvisor(data,new Date(start.getTime()+10*24*60*60_000));assert.equal(later.completed,true);assert.equal(later.ready,true);assert.deepEqual(later.recommendation,completed.recommendation);
});

test('measurement completion survives restarts and sparse runs stop instead of extending forever',()=>{
  const start=new Date('2026-09-14T00:00:00.000Z'),data={resourceHistory:[]};
  for(let index=0;index<resourceMinimumSamples-20;index++)recordResourceSample(data,sample(),new Date(start.getTime()+index*5*60_000));
  recordResourceSample(data,sample(),new Date(start.getTime()+24*60*60_000));
  const persisted=JSON.parse(JSON.stringify(data)),result=resourceAdvisor(persisted,new Date(start.getTime()+7*24*60*60_000));
  assert.equal(result.completed,true);assert.equal(result.ready,false);assert.equal(result.status,'insufficient');assert.equal(result.progressPercent,100);assert.equal(result.collectedHours,24);const count=persisted.resourceHistory.length;
  assert.equal(recordResourceSample(persisted,sample(),new Date(start.getTime()+8*24*60*60_000)),false);assert.equal(persisted.resourceHistory.length,count);
});

test('reset clears only the resource measurement',()=>{
  const data={resourceHistory:[{time:'2026-09-14T00:00:00.000Z',cpuPercent:20,cores:2,memoryUsed:100,memoryTotal:1000}],resourceMeasurement:{version:1,startedAt:'2026-09-14T00:00:00.000Z',completedAt:'2026-09-15T00:00:00.000Z'},networkHistory:[{key:'2026-09-14',rx:123,tx:45}],networkTracker:{rx:10,tx:20,sampledAt:'x'},listeningProfile:{tracks:[{key:'song'}]},playbackResume:{version:2,players:[{id:'local'}]}};
  const protectedState={networkHistory:structuredClone(data.networkHistory),networkTracker:structuredClone(data.networkTracker),listeningProfile:structuredClone(data.listeningProfile),playbackResume:structuredClone(data.playbackResume)};
  assert.equal(resetResourceMeasurement(data),true);assert.deepEqual(data.resourceHistory,[]);assert.deepEqual(data.resourceMeasurement,{version:1,startedAt:null,completedAt:null});assert.deepEqual(data.networkHistory,protectedState.networkHistory);assert.deepEqual(data.networkTracker,protectedState.networkTracker);assert.deepEqual(data.listeningProfile,protectedState.listeningProfile);assert.deepEqual(data.playbackResume,protectedState.playbackResume);assert.equal(resourceAdvisor(data,new Date('2026-09-15T01:00:00.000Z')).progressPercent,0);
});

test('legacy rolling history is migrated into a retained 24-hour result',()=>{
  const data={resourceHistory:[]},start=new Date('2026-09-01T00:00:00.000Z');
  for(let index=0;index<=7*24*12;index++)data.resourceHistory.push({time:new Date(start.getTime()+index*5*60_000).toISOString(),cpuPercent:25,cores:2,memoryUsed:512*1024*1024,memoryTotal:2*1024*1024*1024,rxBytesPerSecond:100_000,txBytesPerSecond:40_000});
  const result=resourceAdvisor(data,new Date('2026-09-08T00:00:00.000Z'));assert.equal(result.completed,true);assert.equal(result.ready,true);assert.equal(result.collectedHours,24);assert.ok(data.resourceHistory.length<=289);assert.ok(data.resourceMeasurement.completedAt);
});
