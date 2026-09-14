import test from 'node:test';
import assert from 'node:assert/strict';
import {isYouTubeMediaUrl,withYouTubeFfmpegHeaders,withYouTubePlaybackClient,youtubeFfmpegHeaders,youtubeFfmpegUserAgent,youtubePlaybackClient,youtubePlaybackFormat} from '../backend/src/ffmpeg-youtube-headers.js';

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

test('first yt-dlp playback resolution prefers web_safari HLS instead of android_vr HTTPS',()=>{
  const input=['--ignore-config','--no-playlist','--get-url','-f','bestaudio','https://www.youtube.com/watch?v=abcdefghijk'];
  const args=withYouTubePlaybackClient(input);
  assert.deepEqual(args.slice(0,2),['--extractor-args',`youtube:player_client=${youtubePlaybackClient}`]);
  assert.equal(youtubePlaybackClient,'web_safari');
  assert.equal(args[args.indexOf('-f')+1],youtubePlaybackFormat);
  assert.match(youtubePlaybackFormat,/m3u8/);
  assert.doesNotMatch(args.join(' '),/android_vr/);
});

test('explicit yt-dlp fallback clients are preserved while playback still prefers HLS formats',()=>{
  const input=['--extractor-args','youtube:player_client=web_embedded','--get-url','-f','bestaudio','https://www.youtube.com/watch?v=abcdefghijk'];
  const args=withYouTubePlaybackClient(input);
  assert.equal(args[args.indexOf('--extractor-args')+1],'youtube:player_client=web_embedded');
  assert.equal(args[args.indexOf('-f')+1],youtubePlaybackFormat);
  const search=['--dump-single-json','--flat-playlist','https://www.youtube.com/results?search_query=test'];
  assert.deepEqual(withYouTubePlaybackClient(search),search);
});
