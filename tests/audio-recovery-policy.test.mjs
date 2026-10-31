import test from 'node:test';
import assert from 'node:assert/strict';
import {playbackRecoveryPlan} from '../backend/src/audio/recovery-policy.js';

const base={source:'spotify',attempt:3,retryDelays:[1000,2500,5000],prematureDelays:[1000,2000]};

test('recovery policy keeps exact Spotify sources for two delayed cycles and resets their client attempt',()=>{
  assert.deepEqual(playbackRecoveryPlan({...base,spotifySourceBlocked:true,spotifySourceRetryCount:0,retryAfterMs:30_000}),{retry:true,reason:'spotify-source',delay:30_000,nextAttempt:0});
  assert.equal(playbackRecoveryPlan({...base,spotifySourceBlocked:true,spotifySourceRetryCount:2}).retry,false);
});

test('recovery policy separates fast client changes, alternate sources and ordinary network retries',()=>{
  assert.equal(playbackRecoveryPlan({...base,clientFallback:true}).reason,'client-fallback');
  assert.equal(playbackRecoveryPlan({...base,alternateSource:true}).reason,'alternate-source');
  assert.equal(playbackRecoveryPlan({...base,attempt:1,transient:true}).reason,'transient');
  assert.equal(playbackRecoveryPlan({...base,attempt:8,transient:true}).retry,false);
});
