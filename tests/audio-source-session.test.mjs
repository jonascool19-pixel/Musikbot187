import test from 'node:test';
import assert from 'node:assert/strict';
import {forgetPlaybackSource,rememberPlaybackSource,reusablePlaybackSource,reusableSourceMaxAgeMs} from '../backend/src/audio/source-session.js';

test('resolved media addresses are reused only for the same active item and a short seek window',()=>{
  const item={id:'active'},other={id:'active'},input='https://media.example/audio';
  rememberPlaybackSource(item,input,{now:1_000});
  assert.equal(reusablePlaybackSource(item,{now:1_000+reusableSourceMaxAgeMs}),input);
  assert.equal(reusablePlaybackSource(item,{now:1_001+reusableSourceMaxAgeMs}),'');
  assert.equal(reusablePlaybackSource(other,{now:1_001}),'');
  rememberPlaybackSource(item,input,{now:2_000});forgetPlaybackSource(item);
  assert.equal(reusablePlaybackSource(item,{now:2_001}),'');
});
