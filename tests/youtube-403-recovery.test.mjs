import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import {nextYouTubePlaybackClient,Player,youtubeClientRetryDelayMs,youtubePlaybackClients} from '../backend/src/player.js';

const clearRetry=player=>{
  clearTimeout(player.retryTimer);
  player.retryTimer=null;
  player.reconnecting=false;
  player.retryAt=null;
};

test('403 client order is fixed and exhausts instead of wrapping around',()=>{
  assert.deepEqual(youtubePlaybackClients,['web_embedded','web_safari','mweb']);
  assert.equal(nextYouTubePlaybackClient('web_embedded'),'web_safari');
  assert.equal(nextYouTubePlaybackClient('web_safari'),'mweb');
  assert.equal(nextYouTubePlaybackClient('mweb'),'');
});

test('Spotify media 403 rotates clients once each and then rejects the unusable video',()=>{
  const diagnostics=[],player=new Player({musicDir:'.',diagnostic:(level,source,message)=>diagnostics.push({level,source,message})});
  const track={id:'spotify:403-test',title:'KC Rebell, Summer Cem – Benz AMG',source:'spotify',catalogDuration:190,duration:190,playbackVideoId:'abcdefghijk',playbackMatch:{id:'abcdefghijk',title:'KC Rebell - Benz AMG'}};
  Object.defineProperty(track,'_youtubePlaybackClient',{value:'web_embedded',writable:true,configurable:true});
  player.current=track;player.generation=4;player.next=()=>{};

  player.finish(4,1,'HTTP error 403 Forbidden',0,track,null);
  assert.equal(player.current,track);
  assert.equal(player.reconnecting,true);
  assert.equal(track._youtubePlaybackClient,'web_safari');
  assert.equal(track.playbackVideoId,'abcdefghijk');
  assert.ok(player.retryAt-Date.now()<=youtubeClientRetryDelayMs+100);
  clearRetry(player);

  player.finish(4,1,'Server returned 403 Forbidden (access denied)',1,track,null);
  assert.equal(track._youtubePlaybackClient,'mweb');
  assert.equal(track.playbackVideoId,'abcdefghijk');
  assert.equal(player.reconnecting,true);
  clearRetry(player);

  player.finish(4,1,'HTTP error 403 Forbidden',2,track,null);
  assert.equal(player.current,track);
  assert.equal(player.reconnecting,true);
  assert.equal(track.playbackVideoId,undefined);
  assert.equal(track._youtubePlaybackClient,undefined);
  assert.deepEqual(track._spotifyRejectedPlaybackIds,['abcdefghijk']);
  assert.match(diagnostics.at(-1).message,/andere passende Version/);
  clearRetry(player);
});

test('direct YouTube media 403 stops after the final client instead of looping',()=>{
  const diagnostics=[],player=new Player({musicDir:'.',diagnostic:(level,source,message)=>diagnostics.push({level,source,message})});
  const track={id:'abcdefghijk',title:'403 Test',source:'youtube',duration:180};
  Object.defineProperty(track,'_youtubePlaybackClient',{value:'mweb',writable:true,configurable:true});
  player.current=track;player.generation=9;player.next=()=>{};
  player.finish(9,1,'HTTP error 403 Forbidden',2,track,null);
  assert.equal(player.current,null);
  assert.equal(player.reconnecting,false);
  assert.equal(player.retryTimer,null);
  assert.match(diagnostics.at(-1).message,/403 Forbidden/);
});

test('production service has one playback owner and installer uses checksum-verified yt-dlp nightly',async()=>{
  const service=await fs.readFile(new URL('../systemd/musikbot187.service',import.meta.url),'utf8');
  const installer=await fs.readFile(new URL('../install-latest.sh',import.meta.url),'utf8');
  assert.match(service,/ExecStart=\/usr\/bin\/node \/opt\/musikbot187\/backend\/src\/server\.js/);
  assert.doesNotMatch(service,/--import .*youtube/);
  assert.match(installer,/yt-dlp\/yt-dlp-nightly-builds\/releases\/latest\/download/);
  assert.match(installer,/SHA2-256SUMS/);
  assert.match(installer,/sha256sum \/usr\/local\/bin\/yt-dlp\.new/);
});
