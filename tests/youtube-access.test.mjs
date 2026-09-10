import test from 'node:test';
import assert from 'node:assert/strict';
import {YouTubeAccessGuard,isYouTubeAccessBlocked} from '../backend/src/youtube-access.js';
import {Player,ffmpegArgs,safePlaybackMessage} from '../backend/src/player.js';

const denied=()=>{throw new Error("Sign in to confirm you're not a bot");};
test('94 blocked resolutions issue only one external request during the pause',async()=>{
  const guard=new YouTubeAccessGuard({now:()=>0});let calls=0;
  for(let i=0;i<94;i++)await assert.rejects(guard.run(()=>{calls++;return denied();}),error=>error.code==='YOUTUBE_ACCESS_BLOCKED'&&error.retryAfterMs===60_000);
  assert.equal(calls,1);
});
test('access probes back off to ten minutes and a successful audio resolution resets them',async()=>{
  let now=0;const guard=new YouTubeAccessGuard({now:()=>now});
  for(const expected of [60_000,120_000,240_000,480_000,600_000,600_000]){
    await assert.rejects(guard.run(denied),error=>error.retryAfterMs===expected);now+=expected;
  }
  assert.equal(await guard.run(()=>Promise.resolve('audio')),'audio');
  await assert.rejects(guard.run(denied),error=>error.retryAfterMs===60_000);
});
test('successful flat searches do not reset an audio access restriction',async()=>{
  let now=0;const guard=new YouTubeAccessGuard({now:()=>now});
  await assert.rejects(guard.run(denied));now=60_000;
  await guard.run(()=>Promise.resolve('search'),{recoverOnSuccess:false});
  await assert.rejects(guard.run(denied),error=>error.retryAfterMs===120_000);
});
test('late in-flight success cannot cancel a newly established pause',async()=>{
  const guard=new YouTubeAccessGuard({now:()=>0});let complete;
  const pending=guard.run(()=>new Promise(resolve=>{complete=resolve;}));
  await assert.rejects(guard.run(denied));complete('late');await pending;
  await assert.rejects(guard.run(()=>Promise.resolve('new')),error=>error.code==='YOUTUBE_ACCESS_BLOCKED');
});
test('unavailable videos and aborted requests do not trigger a shared block',async()=>{
  const guard=new YouTubeAccessGuard();const controller=new AbortController();controller.abort();let called=false;
  await assert.rejects(guard.run(()=>{called=true;},{signal:controller.signal}),{name:'AbortError'});
  assert.equal(called,false);
  await assert.rejects(guard.run(()=>{throw new Error('Private video');}),/Private video/);
  assert.equal(await guard.run(()=>Promise.resolve('ok')),'ok');
  assert.equal(isYouTubeAccessBlocked('HTTP Error 429: Too Many Requests'),true);
  assert.equal(isYouTubeAccessBlocked('HTTP Error 403: Forbidden'),false);
});
test('access pause preserves the current track, queue, position and exact shuffle retry',t=>{
  t.mock.timers.enable({apis:['setTimeout','Date'],now:1000});
  const player=new Player({musicDir:'.',diagnostic(){}}),ended=[];
  player.current={id:'current',source:'youtube'};player.queue=[{id:'later'}];player.mode='shuffle';
  player.generation=3;player.elapsedSeconds=42;player.on('track-end',e=>ended.push(e));
  let retried;
  player.next=(...args)=>{retried=args;};
  const error=Object.assign(new Error('blocked'),{code:'YOUTUBE_ACCESS_BLOCKED',retryAfterMs:60_000});
  player.finish(3,1,error,94);
  assert.equal(player.current.id,'current');assert.equal(player.reconnecting,true);
  assert.deepEqual(player.queue,[{id:'later'}]);assert.equal(ended.length,0);
  player.pause();t.mock.timers.tick(60_000);
  assert.deepEqual(retried,[94,42,true,true]);assert.deepEqual(player.queue.map(x=>x.id),['current','later']);
  player.stop();
});
test('stopping during an access pause cancels the retry without resurrecting the track',t=>{
  t.mock.timers.enable({apis:['setTimeout','Date'],now:1000});
  const player=new Player({musicDir:'.',diagnostic(){}});player.current={id:'current',source:'spotify'};
  player.generation=1;let retried=false;player.next=()=>{retried=true;};
  player.finish(1,1,Object.assign(new Error('blocked'),{code:'YOUTUBE_ACCESS_BLOCKED'}),0);
  player.stop();t.mock.timers.tick(600_000);
  assert.equal(retried,false);assert.equal(player.current,null);
});
test('403 reconnect discards prepared addresses and logs do not expose signed media URLs',t=>{
  t.mock.timers.enable({apis:['setTimeout','Date'],now:1000});
  const messages=[],player=new Player({musicDir:'.',diagnostic:(level,source,message)=>messages.push(message)});
  player.current={id:'current',source:'youtube'};player.generation=1;let aborted=false;
  player.prepared={controller:{abort(){aborted=true;}}};
  player.finish(1,1,'HTTP error 403 at https://example.com/audio?signature=private&ip=192.0.2.1',0);
  assert.equal(aborted,true);assert.equal(player.prepared,null);
  assert.ok(messages.every(message=>!message.includes('signature=')&&!message.includes('192.0.2.1')));
  assert.equal(safePlaybackMessage('https://example.com/private'),'[Medienadresse ausgeblendet]');
  const media=ffmpegArgs('https://example.com/audio'),radio=ffmpegArgs('https://example.com/live',0,true);
  assert.equal(media[media.indexOf('-reconnect_on_http_error')+1].includes('403'),false);
  assert.equal(radio[radio.indexOf('-reconnect_on_http_error')+1].includes('403'),true);
  player.stop();
});
test('seeking in shuffle mode explicitly resumes the same track',()=>{
  const player=new Player({musicDir:'.',diagnostic(){}});player.mode='shuffle';
  player.current={id:'active',source:'local',duration:200};player.elapsedSeconds=20;player.queue=[{id:'later'}];
  let args;player.next=(...values)=>{args=values;};player.seekBy(10);
  assert.deepEqual(args,[0,30,false,true]);assert.equal(player.queue[0].id,'active');player.stop();
});
