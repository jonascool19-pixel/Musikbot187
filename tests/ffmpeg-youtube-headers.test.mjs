import test from 'node:test';
import assert from 'node:assert/strict';
import {isYouTubeMediaUrl,isYouTubePlaybackResolutionArgs,markYouTubePlayback403,parseYouTubeResolutionMetadata,resetYouTubePlaybackFailover,sanitizeYouTubeHttpHeaders,withYouTubeFfmpegHeaders,withYouTubePlaybackClient,youtubeFfmpegHeaders,youtubeFfmpegUserAgent,youtubePlaybackClient,youtubePlaybackFormat,youtubePlaybackHeaderTemplate,youtubePlaybackStrategies,youtubePotProviderArgs,youtubePotProviderHome} from '../backend/src/ffmpeg-youtube-headers.js';

test('YouTube/googlevideo FFmpeg inputs receive browser-compatible fallback headers',()=>{
  const input='https://rr1---sn-test.googlevideo.com/videoplayback?id=test';
  assert.equal(isYouTubeMediaUrl(input),true);
  const args=withYouTubeFfmpegHeaders(['-nostdin','-i',input,'-vn','pipe:1']);
  const inputIndex=args.indexOf('-i');
  assert.equal(args[inputIndex+1],input);
  assert.deepEqual(args.slice(inputIndex-4,inputIndex),['-user_agent',youtubeFfmpegUserAgent,'-headers',youtubeFfmpegHeaders]);
});

test('yt-dlp exact media headers are sanitized and forwarded to FFmpeg',()=>{
  const input='https://rr2---sn-test.googlevideo.com/videoplayback?id=exact',rawHeaders={'User-Agent':'yt-dlp-agent','Accept-Language':'de-DE,de;q=0.9','X-Goog-Visitor-Id':'visitor-123',Range:'bytes=0-1','X-Bad':'line1\r\nInjected: yes'};
  const safe=sanitizeYouTubeHttpHeaders(rawHeaders);
  assert.deepEqual(safe,{'User-Agent':'yt-dlp-agent','Accept-Language':'de-DE,de;q=0.9','X-Goog-Visitor-Id':'visitor-123'});
  const args=withYouTubeFfmpegHeaders(['-nostdin','-i',input,'-vn','pipe:1'],safe),inputIndex=args.indexOf('-i'),before=args.slice(0,inputIndex);
  assert.equal(before[before.indexOf('-user_agent')+1],'yt-dlp-agent');
  const headers=before[before.indexOf('-headers')+1];
  assert.match(headers,/Accept-Language: de-DE,de;q=0\.9\r\n/);
  assert.match(headers,/X-Goog-Visitor-Id: visitor-123\r\n/);
  assert.doesNotMatch(headers,/Range|Injected/);
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

test('current yt-dlp --print playback resolution gets mweb, PO-token provider and exact-header output',()=>{
  resetYouTubePlaybackFailover();
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
  assert.equal(args[args.indexOf('--print')+1],`${template}\t${youtubePlaybackHeaderTemplate}`);
  assert.doesNotMatch(joined,/android_vr/);
});

test('yt-dlp resolution records expose safe exact headers without changing the media parser fields',()=>{
  const url='https://manifest.googlevideo.com/api/manifest/hls_playlist/test',context={sourceKey:'https://www.youtube.com/watch?v=abcdefghijk',client:'mweb',strategyIndex:0},raw=`${url}\t213\tm3u8_native\tabcdefghijk\t${JSON.stringify({'User-Agent':'Exact UA',Referer:'https://www.youtube.com/'})}\n`;
  const metadata=parseYouTubeResolutionMetadata(raw,context);
  assert.equal(metadata.url,url);
  assert.equal(metadata.sourceKey,context.sourceKey);
  assert.equal(metadata.client,'mweb');
  assert.deepEqual(metadata.headers,{'User-Agent':'Exact UA',Referer:'https://www.youtube.com/'});
});

test('real 403 failover rotates only the default client and resets cleanly',()=>{
  resetYouTubePlaybackFailover();
  const source='https://www.youtube.com/watch?v=abcdefghijk',base=['--ignore-config','--print','%(url)s\t%(duration)s\t%(protocol)s\t%(id)s','-f','bestaudio',source];
  let args=withYouTubePlaybackClient(base,1_000);
  assert.match(args.join(' '),/youtube:player_client=mweb/);
  markYouTubePlayback403(source,0,1_001);
  args=withYouTubePlaybackClient(base,1_002);
  assert.match(args.join(' '),/youtube:player_client=web_safari/);
  assert.equal(args.includes(youtubePotProviderArgs),false);
  assert.match(args[args.indexOf('-f')+1],/^bestaudio\[protocol\^=m3u8\]/);
  markYouTubePlayback403(source,1,1_003);
  args=withYouTubePlaybackClient(base,1_004);
  assert.match(args.join(' '),/youtube:player_client=web_embedded/);
  markYouTubePlayback403(source,2,1_005);
  args=withYouTubePlaybackClient(base,1_006);
  assert.match(args.join(' '),/youtube:player_client=tv/);
  assert.deepEqual(youtubePlaybackStrategies.map(value=>value.client),['mweb','web_safari','web_embedded','tv']);
  resetYouTubePlaybackFailover(source);
  assert.match(withYouTubePlaybackClient(base,1_007).join(' '),/youtube:player_client=mweb/);
});

test('legacy --get-url playback resolution remains protected',()=>{
  resetYouTubePlaybackFailover();
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
  assert.equal(args[args.indexOf('-f')+1],youtubePlaybackStrategies[2].format);
  assert.match(args[args.indexOf('--print')+1],/%\(http_headers\)j/);
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
