import test from 'node:test';
import assert from 'node:assert/strict';
import {EventEmitter} from 'node:events';
import {PassThrough} from 'node:stream';
import {Player,ffmpegPipeArgs,isYouTubeTokenProviderUnavailable,isYouTubeAudioFormatUnavailable} from '../backend/src/player.js';
import {playbackYouTubePageUrl,youtubeAuthenticationArgs,youtubeClientStrategies,youtubePlaybackPipeArgs} from '../backend/src/media.js';
import {createYouTubePlaybackPipeline} from '../backend/src/youtube-playback-pipe.js';
import {classifyYouTubeAudioFailure} from '../backend/src/youtube-access.js';

const fakeAccessGuard=()=>({generation:0,blocked:0,recovered:0,beginRequest(){return this.generation},recoverRequest(){this.recovered++;return true},blockFromError(error){if(/429|not a bot/i.test(String(error?.message||error||''))){this.blocked++;const blocked=new Error('YouTube-Schutzpause');blocked.code='YOUTUBE_ACCESS_BLOCKED';blocked.retryAfterMs=60000;return blocked}return null}});

class FakeChild extends EventEmitter{
  constructor(name){super();this.name=name;this.stdin=new PassThrough();this.stdout=new PassThrough();this.stderr=new PassThrough();this.signals=[];this.pid=name==='ffmpeg'?222:111;}
  kill(signal='SIGTERM'){this.signals.push(signal);return true}
}

test('YouTube/Spotify playback page URLs are canonical and stdout args keep yt-dlp in charge of HTTP',()=>{
  assert.equal(playbackYouTubePageUrl({source:'youtube',id:'abcdefghijk'}),'https://www.youtube.com/watch?v=abcdefghijk');
  assert.equal(playbackYouTubePageUrl({source:'spotify',playbackVideoId:'lmnopqrstuv'}),'https://www.youtube.com/watch?v=lmnopqrstuv');
  assert.equal(playbackYouTubePageUrl({source:'radio',url:'https://example.invalid'}),'');
  const args=youtubePlaybackPipeArgs('https://youtu.be/abcdefghijk');
  assert.equal(args[args.indexOf('-o')+1],'-');
  assert.equal(args[args.indexOf('-f')+1].startsWith('bestaudio'),true);
  assert.equal(args.includes('--abort-on-unavailable-fragments'),true);
  assert.equal(args.at(-1),'https://www.youtube.com/watch?v=abcdefghijk');
});

test('FFmpeg pipe decoder never opens a GoogleVideo URL and keeps precise output seek',()=>{
  const args=ffmpegPipeArgs(83.625);
  assert.deepEqual(args.slice(args.indexOf('-i'),args.indexOf('-i')+2),['-i','pipe:0']);
  assert.deepEqual(args.slice(args.indexOf('-ss'),args.indexOf('-ss')+2),['-ss','83.625']);
  assert.ok(args.indexOf('-ss')>args.indexOf('-i'),'pipe resume seek must happen after the non-seekable stdin input');
  assert.equal(args.some(value=>/googlevideo|youtube\.com/i.test(String(value))),false);
  assert.equal(args.includes('-reconnect'),false);
});

test('yt-dlp stdout is physically piped into FFmpeg stdin and downloader failures fail the combined child',async()=>{
  const calls=[],children=[];
  const spawnImpl=(command,args,options)=>{const child=new FakeChild(command);calls.push({command,args,options,child});children.push(child);return child};
  const pipeline=createYouTubePlaybackPipeline({source:'youtube',id:'abcdefghijk'},12.5,{spawnImpl,decoderArgs:ffmpegPipeArgs,accessGuard:fakeAccessGuard()});
  assert.deepEqual(calls.map(call=>call.command),['yt-dlp','ffmpeg']);
  assert.equal(calls[0].args[calls[0].args.indexOf('-o')+1],'-');
  assert.deepEqual(calls[1].args.slice(calls[1].args.indexOf('-i'),calls[1].args.indexOf('-i')+2),['-i','pipe:0']);

  let received=Buffer.alloc(0);
  children[1].stdin.on('data',chunk=>received=Buffer.concat([received,chunk]));
  children[0].stdout.write(Buffer.from('compressed-audio'));
  await new Promise(resolve=>setImmediate(resolve));
  assert.equal(received.toString(),'compressed-audio');

  let errors='';
  pipeline.stderr.on('data',chunk=>errors+=chunk.toString());
  children[0].stderr.write('ERROR: HTTP Error 403: Forbidden\n');
  const closed=new Promise(resolve=>pipeline.once('close',resolve));
  children[0].stdout.end();
  children[0].emit('close',1);
  children[1].emit('close',0);
  const closeCode=await closed;
  assert.equal(closeCode,1);
  assert.match(errors,/403/);
});

test('pipeline pause/resume/kill controls downloader and decoder together',()=>{
  const children=[],spawnImpl=command=>{const child=new FakeChild(command);children.push(child);return child};
  const pipeline=createYouTubePlaybackPipeline({source:'spotify',playbackVideoId:'abcdefghijk'},0,{spawnImpl,decoderArgs:ffmpegPipeArgs,accessGuard:fakeAccessGuard()});
  pipeline.kill('SIGSTOP');pipeline.kill('SIGCONT');pipeline.kill('SIGKILL');
  for(const child of children)assert.deepEqual(child.signals,['SIGSTOP','SIGCONT','SIGKILL']);
  assert.equal(pipeline.killed,true);
});


test('streamed yt-dlp 429 establishes the shared-style access pause for later requests',async()=>{
  const children=[],guard=fakeAccessGuard(),spawnImpl=command=>{const child=new FakeChild(command);children.push(child);return child};
  const pipeline=createYouTubePlaybackPipeline({source:'youtube',id:'abcdefghijk'},0,{spawnImpl,decoderArgs:ffmpegPipeArgs,accessGuard:guard});
  const closed=new Promise(resolve=>pipeline.once('close',resolve));
  children[0].stderr.write('ERROR: HTTP Error 429: Too Many Requests\n');
  children[0].stdout.end();children[0].emit('close',1);children[1].emit('close',0);
  assert.equal(await closed,1);
  assert.equal(guard.blocked,1);
  assert.equal(pipeline.playbackError?.code,'YOUTUBE_ACCESS_BLOCKED');
  assert.equal(pipeline.playbackError?.retryAfterMs,60000);
});


test('yt-dlp bgutil transport outage wins over the misleading only-images audio error',()=>{
  const logs='WARNING: [youtube] [pot:bgutil:http] Error reaching GET https://token.example.invalid/token (caused by TransportError)\nWARNING: Only images are available for download. use --list-formats to see them\nERROR: [youtube] t0l6DFWM1IA: Requested format is not available';
  const provider=classifyYouTubeAudioFailure(logs);
  assert.equal(provider?.code,'YOUTUBE_TOKEN_PROVIDER_UNAVAILABLE');
  assert.equal(isYouTubeTokenProviderUnavailable(provider),true);
  assert.equal(isYouTubeAudioFormatUnavailable(provider),false);
  assert.match(provider.message,/bgutil/);
  assert.doesNotMatch(provider.message,/https?:\/\//);
  const unavailable=classifyYouTubeAudioFailure('WARNING: Only images are available for download\nERROR: Requested format is not available');
  assert.equal(unavailable?.code,'YOUTUBE_AUDIO_FORMAT_UNAVAILABLE');
  assert.equal(isYouTubeAudioFormatUnavailable(unavailable),true);
  assert.equal(classifyYouTubeAudioFailure('ordinary normal stderr'),null);
});

test('downloader exposes a classified upstream outage instead of declaring the video itself broken',async()=>{
  const children=[],guard=fakeAccessGuard();
  const pipeline=createYouTubePlaybackPipeline({source:'spotify',playbackVideoId:'abcdefghijk'},0,{
    spawnImpl:command=>{const child=new FakeChild(command);children.push(child);return child},
    decoderArgs:ffmpegPipeArgs,accessGuard:guard
  });
  const closed=new Promise(resolve=>pipeline.once('close',resolve));
  children[0].stderr.write('WARNING: [youtube] [pot:bgutil:http] Error reaching GET https://token.example.invalid/ (caused by TransportError)\nWARNING: Only images are available for download\nERROR: Requested format is not available\n');
  children[0].stdout.end();children[0].emit('close',1);children[1].emit('close',1);
  assert.equal(await closed,1);
  assert.equal(pipeline.playbackError?.code,'YOUTUBE_TOKEN_PROVIDER_UNAVAILABLE');
  assert.equal(guard.blocked,0,'PO-token outage is not a YouTube HTTP 429 ban');
});

test('the playback pipe retries a different yt-dlp client only after a classified provider failure',()=>{
  const defaultArgs=youtubePlaybackPipeArgs('https://youtu.be/abcdefghijk');
  const fallbackArgs=youtubePlaybackPipeArgs('https://youtu.be/abcdefghijk','web_embedded');
  assert.equal(defaultArgs.includes('--extractor-args'),false);
  assert.deepEqual(fallbackArgs.slice(fallbackArgs.indexOf('--extractor-args'),fallbackArgs.indexOf('--extractor-args')+2),['--extractor-args','youtube:player_client=web_embedded']);
  assert.equal(youtubePlaybackPipeArgs('https://youtu.be/abcdefghijk','unknown').includes('--extractor-args'),false);
  const children=[];
  createYouTubePlaybackPipeline({source:'spotify',playbackVideoId:'abcdefghijk',_youtubePlaybackClient:'web_embedded'},0,{
    spawnImpl:(command,args)=>{const child=new FakeChild(command);children.push({command,args,child});return child},
    decoderArgs:ffmpegPipeArgs,accessGuard:fakeAccessGuard()
  });
  assert.deepEqual(children[0].args.slice(children[0].args.indexOf('--extractor-args'),children[0].args.indexOf('--extractor-args')+2),['--extractor-args','youtube:player_client=web_embedded']);
  for(const entry of children)entry.child.kill('SIGKILL');
});

test('provider failure retains Spotify identity and queue, retries boundedly, and never blacklists the video',()=>{
  const logs=[],p=new Player({musicDir:'.',diagnostic:(level,source,message)=>logs.push({level,source,message})});
  const item={id:'spotify:token-outage-test',source:'spotify',title:'GPF – ALORS ON FUCK',catalogDuration:110,duration:110,playbackVideoId:'abcdefghijk',playbackMatch:{id:'abcdefghijk',title:'GPF – ALORS ON FUCK'}};
  p.current=item;p.queue=[{id:'next-spotify-track',source:'spotify',title:'Nächster Song'}];p.generation=7;
  const fault=classifyYouTubeAudioFailure('WARNING: [youtube] [pot:bgutil:http] Error reaching GET (caused by TransportError)\nERROR: Requested format is not available');
  p.finish(7,1,fault,0,item,null);
  assert.equal(p.current,item);
  assert.equal(p.reconnecting,true);
  assert.equal(item.playbackVideoId,'abcdefghijk');
  assert.equal(item._spotifyRejectedPlaybackIds,undefined);
  assert.equal(item._youtubePlaybackClient,'web_embedded');
  assert.equal(p.queue.length,1);
  assert.ok(logs.some(entry=>/bgutil nicht erreichbar/.test(entry.message)));
  clearTimeout(p.retryTimer);
  p.finish(7,1,fault,1,item,null);
  assert.equal(item._youtubePlaybackClient,'web_safari');
  assert.equal(item.playbackVideoId,'abcdefghijk');
  clearTimeout(p.retryTimer);
  p.next=()=>{};
  p.finish(7,1,fault,2,item,null);
  assert.equal(p.reconnecting,false,'provider outage must not retry the same song indefinitely');
  assert.equal(item.playbackVideoId,'abcdefghijk','upstream outage must not poison Spotify matching cache');
});

test('only a genuinely no-audio Spotify video is rejected and re-searched, not arbitrary YouTube songs',()=>{
  const p=new Player({musicDir:'.',diagnostic(){}});
  const item={id:'spotify:bad-video-test',source:'spotify',title:'ReCombined – Hammer Down',catalogDuration:147,duration:148,playbackVideoId:'abcdefghijk',playbackMatch:{id:'abcdefghijk',title:'ReCombined - Hammer Down'}};
  p.current=item;p.generation=5;p.queue=[{id:'next-song',source:'spotify',title:'Nächster Titel'}];
  const failure=classifyYouTubeAudioFailure('WARNING: Only images are available\nERROR: Requested format is not available');
  p.finish(5,1,failure,0,item,null);
  assert.equal(p.current,item);
  assert.equal(p.reconnecting,true);
  assert.equal(item.playbackVideoId,undefined);
  assert.deepEqual(item._spotifyRejectedPlaybackIds,['abcdefghijk']);
  assert.equal(item.duration,147,'the catalog duration is restored before trying another verified source');
  assert.equal(p.queue.length,1);
  clearTimeout(p.retryTimer);
  p.next=()=>{};
  p.finish(5,1,failure,3,item,null);
  assert.equal(p.reconnecting,false,'an audio format failure cannot cause unbounded retries');
  const direct=new Player({musicDir:'.',diagnostic(){}});
  direct.current={id:'abcdefghijk',title:'YouTube Upload',source:'youtube'};
  direct.generation=3;direct.next=()=>{};
  direct.finish(3,1,failure,0,direct.current,null);
  assert.equal(direct.reconnecting,false,'a manually selected YouTube upload must not be replaced with another song');
});

test('YouTube playback uses current client fallbacks, request pacing and optional cookie authentication',()=>{
  assert.ok(youtubeClientStrategies.some(strategy=>strategy.includes('youtube:player_client=mweb,default')));
  assert.ok(youtubeClientStrategies.some(strategy=>strategy.includes('youtube:player_client=web_embedded')));
  const args=youtubePlaybackPipeArgs('https://youtu.be/abcdefghijk');
  assert.deepEqual(args.slice(args.indexOf('--sleep-requests'),args.indexOf('--sleep-requests')+2),['--sleep-requests','2']);
  const previousCookies=process.env.YOUTUBE_COOKIES_FILE,previousAgent=process.env.YOUTUBE_USER_AGENT;
  try{
    process.env.YOUTUBE_COOKIES_FILE='/etc/yt-dlp/cookies.txt';
    process.env.YOUTUBE_USER_AGENT='Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 Chrome/153.0.0.0 Safari/537.36';
    assert.deepEqual(youtubeAuthenticationArgs(),['--cookies','/etc/yt-dlp/cookies.txt','--user-agent',process.env.YOUTUBE_USER_AGENT]);
    const authenticated=youtubePlaybackPipeArgs('https://youtu.be/abcdefghijk');
    assert.ok(authenticated.includes('/etc/yt-dlp/cookies.txt'));
    assert.ok(authenticated.includes(process.env.YOUTUBE_USER_AGENT));
  }finally{
    if(previousCookies===undefined)delete process.env.YOUTUBE_COOKIES_FILE;else process.env.YOUTUBE_COOKIES_FILE=previousCookies;
    if(previousAgent===undefined)delete process.env.YOUTUBE_USER_AGENT;else process.env.YOUTUBE_USER_AGENT=previousAgent;
  }
});
