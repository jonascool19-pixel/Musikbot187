import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import {Player} from '../backend/src/player.js';
import {isYouTubePlayback403,youtube403FastAttemptLimit,youtube403FastRetryDelays} from '../backend/src/youtube-403-recovery.js';

test('YouTube media 403 errors use a dedicated fast bounded retry policy',()=>{
  assert.equal(isYouTubePlayback403('HTTP error 403 Forbidden'),true);
  assert.equal(isYouTubePlayback403('Server returned 403 Forbidden (access denied)'),true);
  assert.equal(isYouTubePlayback403('HTTP error 429 Too Many Requests'),false);
  assert.equal(youtube403FastAttemptLimit,8);
  assert.deepEqual(youtube403FastRetryDelays,[500,750,1000,1500,2500,3500,5000]);

  const diagnostics=[],player=new Player({musicDir:'.',diagnostic:(level,source,message)=>diagnostics.push({level,source,message})}),track={id:'abcdefghijk',title:'403 Test',source:'youtube'};
  player.current=track;
  player.generation=4;
  player.elapsedSeconds=23;
  player.next=()=>{};

  for(let failure=1;failure<=youtube403FastAttemptLimit;failure++){
    player.finish(4,1,'HTTP error 403 Forbidden',99,track,null);
    if(failure<youtube403FastAttemptLimit){
      assert.equal(player.current,track);
      assert.equal(player.reconnecting,true);
      const remaining=player.retryAt-Date.now();
      assert.ok(remaining>=0&&remaining<=youtube403FastRetryDelays[failure-1]+100);
      clearTimeout(player.retryTimer);player.retryTimer=null;player.reconnecting=false;player.retryAt=null;
    }
  }

  assert.equal(player.current,null);
  assert.equal(player.reconnecting,false);
  assert.match(diagnostics.at(-1).message,/8 schnellen Clientversuchen/);
  assert.match(diagnostics.at(-1).message,/übersprungen/);
});

test('successful PCM resets the fast 403 failure streak',()=>{
  const player=new Player({musicDir:'.',diagnostic(){}}),track={id:'reset403abc',title:'Recovery',source:'youtube'};
  player.current=track;player.generation=9;player.next=()=>{};
  player.finish(9,1,'HTTP error 403 Forbidden',4,track,null);
  const firstDelay=player.retryAt-Date.now();
  clearTimeout(player.retryTimer);player.retryTimer=null;player.reconnecting=false;player.retryAt=null;
  assert.ok(firstDelay<=600);

  const recovered={value:false};
  assert.equal(player.processFrame(Buffer.alloc(4),9,track,0,recovered),4);
  player.finish(9,1,'HTTP error 403 Forbidden',5,track,null);
  const resetDelay=player.retryAt-Date.now();
  clearTimeout(player.retryTimer);player.retryTimer=null;
  assert.ok(resetDelay<=600,'nach erfolgreichem PCM muss der nächste 403 wieder beim ersten schnellen Retry beginnen');
});

test('production service loads 403 recovery and installer uses checksum-verified yt-dlp nightly',async()=>{
  const service=await fs.readFile(new URL('../systemd/musikbot187.service',import.meta.url),'utf8');
  const installer=await fs.readFile(new URL('../install-latest.sh',import.meta.url),'utf8');
  const headersImport=service.indexOf('--import /opt/musikbot187/backend/src/ffmpeg-youtube-headers.js');
  const recoveryImport=service.indexOf('--import /opt/musikbot187/backend/src/youtube-403-recovery.js');
  assert.ok(headersImport>=0&&recoveryImport>headersImport);
  assert.match(installer,/yt-dlp\/yt-dlp-nightly-builds\/releases\/latest\/download/);
  assert.match(installer,/SHA2-256SUMS/);
  assert.match(installer,/sha256sum \/usr\/local\/bin\/yt-dlp\.new/);
});
