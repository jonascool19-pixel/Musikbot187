import test from 'node:test';
import assert from 'node:assert/strict';
import {
  validateResolvedYouTubeAudio,
  youtubeAudioFormatForClient,
  youtubeClientStrategies,
  youtubePlaybackValidationArgs,
  youtubePotProviderArgs
} from '../backend/src/audio/youtube-client.js';
import {spotifyPlaybackSearchQueries} from '../backend/src/spotify-playback.js';

test('recommended token-backed mweb client is tried before constrained fallbacks',()=>{
  assert.deepEqual(youtubeClientStrategies,[
    ['--extractor-args','youtube:player_client=mweb','--extractor-args',youtubePotProviderArgs],
    ['--extractor-args','youtube:player_client=web_safari'],
    ['--extractor-args','youtube:player_client=web_embedded']
  ]);
  assert.match(youtubeAudioFormatForClient('web_safari'),/^bestaudio\[protocol=m3u8_native\]/);
  assert.equal(youtubeAudioFormatForClient('mweb'),'bestaudio[protocol=https]/bestaudio[protocol=http]/bestaudio/best');
});

test('background resolution verifies one real audio frame with the exact source headers',async()=>{
  const resolved={url:'https://rr1---sn-test.googlevideo.com/videoplayback?id=test',headers:{'User-Agent':'yt-dlp exact',Referer:'https://www.youtube.com/','X-Goog-Visitor-Id':'visitor'}};
  const args=youtubePlaybackValidationArgs(resolved);
  assert.equal(args[args.indexOf('-user_agent')+1],'yt-dlp exact');
  assert.match(args[args.indexOf('-headers')+1],/X-Goog-Visitor-Id: visitor\r\n/);
  assert.deepEqual(args.slice(args.indexOf('-map'),args.indexOf('-map')+4),['-map','0:a:0','-frames:a','1']);
  let call;
  assert.equal(await validateResolvedYouTubeAudio(resolved,null,{run:async(...values)=>{call=values;}}),resolved);
  assert.equal(call[0],'ffmpeg');
  await assert.rejects(validateResolvedYouTubeAudio(resolved,null,{run:async()=>{throw new Error(`HTTP error 403 ${resolved.url}`)}}),error=>{
    assert.match(error.message,/403/);
    assert.doesNotMatch(error.message,/googlevideo|videoplayback/);
    return true;
  });
});

test('Spotify ISRC is searched before tolerant artist and title matching',()=>{
  const queries=spotifyPlaybackSearchQueries({title:'FEDX, KICKARTZ – Mach die Beat an Jungö - Remix',isrc:'DEABC2600123'});
  assert.equal(queries[0],'"DEABC2600123"');
  assert.ok(queries.some(query=>/FEDX/.test(query)&&/Mach die Beat/.test(query)));
});
