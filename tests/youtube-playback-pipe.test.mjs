import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import {Player,ffmpegArgs,isYouTubeTokenProviderUnavailable,isYouTubeAudioFormatUnavailable} from '../backend/src/player.js';
import {youtubeAuthenticationArgs,youtubeClientStrategies,youtubeRuntimeArgs} from '../backend/src/media.js';
import {classifyYouTubeAudioFailure} from '../backend/src/youtube-access.js';

test('online playback resolves one signed media URL and lets one reconnecting FFmpeg process read it',async()=>{
  const mediaSource=await fs.readFile(new URL('../backend/src/media.js',import.meta.url),'utf8');
  const playerSource=await fs.readFile(new URL('../backend/src/player.js',import.meta.url),'utf8');
  assert.match(mediaSource,/const resolved=await resolveYoutube\(url,signal\);applyResolvedPlayback\(item,resolved\);return resolved\.url/);
  assert.doesNotMatch(mediaSource,/youtubePlaybackPipeArgs|--downloader','ffmpeg|'-o','-'/);
  assert.match(playerSource,/return spawn\('ffmpeg',ffmpegArgs\(input,resumeSeconds,live\)/);
  assert.doesNotMatch(playerSource,/createYouTubePlaybackPipeline|ffmpegPipeArgs|usesYtDlpPlaybackPipe/);
  await assert.rejects(fs.access(new URL('../backend/src/youtube-playback-pipe.js',import.meta.url)));
});

test('direct signed media playback keeps reconnects and precise input seeking without a second pipe',()=>{
  const input='https://rr1---sn-test.googlevideo.com/videoplayback?id=test',args=ffmpegArgs(input,83.625,false);
  assert.deepEqual(args.slice(args.indexOf('-i'),args.indexOf('-i')+2),['-i',input]);
  assert.deepEqual(args.slice(args.indexOf('-ss'),args.indexOf('-ss')+2),['-ss','83.625']);
  assert.ok(args.indexOf('-ss')<args.indexOf('-i'));
  for(const flag of ['-reconnect','-reconnect_streamed','-reconnect_on_network_error','-reconnect_on_http_error','-rw_timeout'])assert.ok(args.includes(flag));
  assert.equal(args.includes('pipe:0'),false);
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

test('provider failure retains Spotify identity and queue and never blacklists the matched video',()=>{
  const logs=[],p=new Player({musicDir:'.',diagnostic:(level,source,message)=>logs.push({level,source,message})});
  const item={id:'spotify:token-outage-test',source:'spotify',title:'GPF – ALORS ON FUCK',catalogDuration:110,duration:110,playbackVideoId:'abcdefghijk',playbackMatch:{id:'abcdefghijk',title:'GPF – ALORS ON FUCK'}};
  p.current=item;p.queue=[{id:'next-spotify-track',source:'spotify',title:'Nächster Song'}];p.generation=7;
  const fault=classifyYouTubeAudioFailure('WARNING: [youtube] [pot:bgutil:http] Error reaching GET (caused by TransportError)\nERROR: Requested format is not available');
  p.finish(7,1,fault,0,item,null);
  assert.equal(p.current,item);
  assert.equal(p.reconnecting,true);
  assert.equal(item.playbackVideoId,'abcdefghijk');
  assert.equal(item._spotifyRejectedPlaybackIds,undefined);
  assert.equal(p.queue.length,1);
  assert.ok(logs.some(entry=>/nächsten Variante/.test(entry.message)));
  clearTimeout(p.retryTimer);
});

test('a no-audio Spotify video is rejected only after bounded resolution retries',()=>{
  const p=new Player({musicDir:'.',diagnostic(){}}),item={id:'spotify:bad-video-test',source:'spotify',title:'ReCombined – Hammer Down',catalogDuration:147,duration:148,playbackVideoId:'abcdefghijk',playbackMatch:{id:'abcdefghijk',title:'ReCombined - Hammer Down'}};
  p.current=item;p.generation=5;p.queue=[{id:'next-song',source:'spotify',title:'Nächster Titel'}];
  const failure=classifyYouTubeAudioFailure('WARNING: Only images are available\nERROR: Requested format is not available');
  p.finish(5,1,failure,0,item,null);clearTimeout(p.retryTimer);
  p.finish(5,1,failure,1,item,null);clearTimeout(p.retryTimer);
  p.finish(5,1,failure,2,item,null);
  assert.equal(item.playbackVideoId,undefined);
  assert.deepEqual(item._spotifyRejectedPlaybackIds,['abcdefghijk']);
  assert.equal(item.duration,147);
  clearTimeout(p.retryTimer);
});

test('YouTube resolution uses fast client fallbacks, short request pacing and optional cookies',()=>{
  assert.deepEqual(youtubeRuntimeArgs.slice(-2),['--sleep-requests','0.25']);
  assert.ok(youtubeClientStrategies.some(strategy=>strategy.includes('youtube:player_client=mweb')));
  assert.ok(youtubeClientStrategies.some(strategy=>strategy.includes('youtube:player_client=web_embedded')));
  const previousCookies=process.env.YOUTUBE_COOKIES_FILE,previousAgent=process.env.YOUTUBE_USER_AGENT;
  try{
    process.env.YOUTUBE_COOKIES_FILE='/etc/yt-dlp/cookies.txt';
    process.env.YOUTUBE_USER_AGENT='Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 Chrome/153.0.0.0 Safari/537.36';
    assert.deepEqual(youtubeAuthenticationArgs(),['--cookies','/etc/yt-dlp/cookies.txt','--user-agent',process.env.YOUTUBE_USER_AGENT]);
  }finally{
    if(previousCookies===undefined)delete process.env.YOUTUBE_COOKIES_FILE;else process.env.YOUTUBE_COOKIES_FILE=previousCookies;
    if(previousAgent===undefined)delete process.env.YOUTUBE_USER_AGENT;else process.env.YOUTUBE_USER_AGENT=previousAgent;
  }
});
