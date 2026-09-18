import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import {bufferedRecoveryMinBytes,bufferedRecoveryResumeSeconds,canBufferRecoverStream,playbackPcmMaxBytes,playbackPcmResumeBytes} from '../backend/src/player.js';
import {rankSpotifyPlaybackCandidates,rejectSpotifyPlaybackMatch} from '../backend/src/media.js';
import {pcmBytesPerSecond} from '../backend/src/pcm-buffer.js';

test('YouTube 403 recovery keeps a large playable PCM cushion and resumes after it',()=>{
  assert.equal(playbackPcmMaxBytes,pcmBytesPerSecond*30);
  assert.equal(playbackPcmResumeBytes,pcmBytesPerSecond*25);
  assert.equal(bufferedRecoveryMinBytes,pcmBytesPerSecond*4);
  assert.equal(canBufferRecoverStream({source:'youtube'},'HTTP error 403 Forbidden',bufferedRecoveryMinBytes),true);
  assert.equal(canBufferRecoverStream({source:'spotify'},'Server returned 403 Forbidden',bufferedRecoveryMinBytes),true);
  assert.equal(canBufferRecoverStream({source:'youtube'},'HTTP error 500',bufferedRecoveryMinBytes),false);
  assert.equal(canBufferRecoverStream({source:'radio'},'HTTP error 403 Forbidden',bufferedRecoveryMinBytes),false);
  assert.equal(canBufferRecoverStream({source:'youtube'},'HTTP error 403 Forbidden',bufferedRecoveryMinBytes-1),false);
  assert.equal(bufferedRecoveryResumeSeconds(42,pcmBytesPerSecond*11.5),53.5);
});

test('Spotify rejects a playback video that exhausted buffered 403 recovery',()=>{
  const track={id:'spotify:test',title:'Artist – Song',source:'spotify',duration:200,playbackVideoId:'abcdefghijk',playbackMatch:{id:'abcdefghijk',title:'Artist – Song',duration:200}};
  const candidates=[
    {id:'abcdefghijk',title:'Artist – Song',duration:200,url:'https://www.youtube.com/watch?v=abcdefghijk'},
    {id:'lmnopqrstuv',title:'Artist – Song Audio',duration:201,url:'https://www.youtube.com/watch?v=lmnopqrstuv'}
  ];
  assert.equal(rankSpotifyPlaybackCandidates(track,candidates)[0].id,'abcdefghijk');
  assert.equal(rejectSpotifyPlaybackMatch(track),true);
  assert.equal(track.playbackMatch,undefined);
  assert.equal(rankSpotifyPlaybackCandidates(track,candidates)[0].id,'lmnopqrstuv');
  assert.equal(Object.keys(track).includes('_spotifyRejectedPlaybackIds'),false,'rejected IDs stay runtime-only and are not persisted to dashboard state');
});

test('player drains buffered PCM while preparing a replacement instead of destroying it on 403',async()=>{
  const source=await fs.readFile(new URL('../backend/src/player.js',import.meta.url),'utf8');
  assert.match(source,/canBufferRecoverStream\(item,errorText,jitter\.bufferedBytes\)/);
  assert.match(source,/prepareBufferedRecovery\(item,generation,resumeSeconds\)/);
  assert.match(source,/jitter\.end\(\);return}finishOnce\(code,errorText\)/);
  assert.match(source,/403 im Hintergrund abgefangen/);
  assert.match(source,/recoveryProcess.*SIGKILL/);
});
