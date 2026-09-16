import test from 'node:test';
import assert from 'node:assert/strict';
import {isYouTubeMediaUrl,isYouTubePlaybackResolutionArgs,withYouTubeFfmpegHeaders,withYouTubePlaybackClient,youtubeFfmpegHeaders,youtubeFfmpegUserAgent,youtubePlaybackClient,youtubePlaybackFormat,youtubePotProviderArgs,youtubePotProviderHome} from '../backend/src/ffmpeg-youtube-headers.js';

test('YouTube/googlevideo FFmpeg inputs receive browser-compatible headers',()=>{
  const input='https://rr1---sn-test.googlevideo.com/videoplayback?id=test';
  assert.equal(isYouTubeMediaUrl(input),true);
  const args=withYouTubeFfmpegHeaders(['-nostdin','-i',input,'-vn','pipe:1']);
  const inputIndex=args.indexOf('-i');
  assert.equal(args[inputIndex+1],input);
  assert.deepEqual(args.slice(inputIndex-4,inputIndex),['-user_agent',youtubeFfmpegUserAgent,'-headers',youtubeFfmpegHeaders]);
});

test('non-YouTube FFmpeg inputs are left unchanged',()=>{
  const args=['-nostdin','-i','https://stream.example.invalid/radio','-vn','pipe:1'];
  assert.deepEqual(withYouTubeFfmpegHeaders(args),args);
});

test('existing FFmpeg HTTP header options are not duplicated',()=>{
  const input='https://r1---sn-test.googlevideo.com/videoplayback?id=test';
  const args=withYouTubeFfmpegHeaders(['-user_agent','custom-agent','-headers','X-Test: 1\r\n','-i',input]);
  assert.equal(args.filter(value=>value==='-user_agent').length,1);
  assert.equal(args.filter(value=>value==='-headers').length,1);
  assert.equal(args[args.indexOf('-user_agent')+1],'custom-agent');
});

test('current yt-dlp --print playback resolution gets mweb plus the local PO-token provider',()=>{
  const template='%(url)s\t%(duration)s\t%(protocol)s\t%(id)s';
  const input=['--ignore-config','--no-playlist','--print',template,'-f','bestaudio','https://www.youtube.com/watch?v=abcdefghijk'];
  assert.equal(isYouTubePlaybackResolutionArgs(input),true);
  const args=withYouTubePlaybackClient(input),joined=args.join(' ');
  assert.equal(youtubePlaybackClient,'mweb');
  assert.equal(youtubePotProviderHome,'/opt/musikbot187-bgutil/server');
  assert.match(joined,/youtube:player_client=mweb/);
  assert.ok(args.includes(youtubePotProviderArgs));
  assert.equal(args[args.indexOf('-f')+1],youtubePlaybackFormat);
  assert.match(youtubePlaybackFormat,/^bestaudio\[protocol=https\]/);
  assert.match(youtubePlaybackFormat,/m3u8/);
  assert.doesNotMatch(joined,/android_vr/);
});

test('legacy --get-url playback resolution remains protected',()=>{
  const input=['--ignore-config','--no-playlist','--get-url','-f','bestaudio','https://www.youtube.com/watch?v=abcdefghijk'];
  assert.equal(isYouTubePlaybackResolutionArgs(input),true);
  const args=withYouTubePlaybackClient(input);
  assert.match(args.join(' '),/youtube:player_client=mweb/);
  assert.ok(args.includes(youtubePotProviderArgs));
  assert.equal(args[args.indexOf('-f')+1],youtubePlaybackFormat);
});

test('explicit yt-dlp fallback clients are preserved without adding an irrelevant PO provider',()=>{
  const input=['--extractor-args','youtube:player_client=web_embedded','--print','%(url)s\t%(duration)s','-f','bestaudio','https://www.youtube.com/watch?v=abcdefghijk'];
  const args=withYouTubePlaybackClient(input);
  assert.equal(args[args.indexOf('--extractor-args')+1],'youtube:player_client=web_embedded');
  assert.equal(args.includes(youtubePotProviderArgs),false);
  assert.equal(args[args.indexOf('-f')+1],youtubePlaybackFormat);
});

test('an explicit mweb client also receives the PO-token provider exactly once',()=>{
  const input=['--extractor-args','youtube:player_client=mweb','--print','%(url)s','-f','bestaudio','https://www.youtube.com/watch?v=abcdefghijk'];
  const args=withYouTubePlaybackClient(input);
  assert.equal(args.filter(value=>value===youtubePotProviderArgs).length,1);
  assert.equal(args.filter((value,index)=>value==='--extractor-args'&&args[index+1]==='youtube:player_client=mweb').length,1);
});

test('searches and unrelated yt-dlp --print calls are left untouched',()=>{
  const search=['--dump-single-json','--flat-playlist','https://www.youtube.com/results?search_query=test'];
  assert.equal(isYouTubePlaybackResolutionArgs(search),false);
  assert.deepEqual(withYouTubePlaybackClient(search),search);
  const metadata=['--print','%(title)s','https://www.youtube.com/watch?v=abcdefghijk'];
  assert.equal(isYouTubePlaybackResolutionArgs(metadata),false);
  assert.deepEqual(withYouTubePlaybackClient(metadata),metadata);
});
