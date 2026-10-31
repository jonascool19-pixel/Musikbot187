import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import {parseResolvedYouTubeOutput,rankSpotifyPlaybackCandidates,sanitizeResolvedYouTubeHeaders,spotifyPlaybackDurationCompatible,spotifyPlaybackDurationToleranceSeconds,youtubePlaybackPrintTemplate} from '../backend/src/media.js';

test('yt-dlp playback output keeps the selected URL and its exact source duration together',()=>{
  assert.match(youtubePlaybackPrintTemplate,/%\(url\)s/);
  assert.match(youtubePlaybackPrintTemplate,/%\(duration\)s/);
  assert.match(youtubePlaybackPrintTemplate,/%\(http_headers\)j/);
  const resolved=parseResolvedYouTubeOutput(`https://example.com/audio\t213.42\thttps\tabcdefghijk\t${JSON.stringify({'User-Agent':'yt-dlp exact','X-Goog-Visitor-Id':'visitor'})}\n`);
  assert.deepEqual(resolved,{url:'https://example.com/audio',duration:213.42,protocol:'https',id:'abcdefghijk',headers:{'User-Agent':'yt-dlp exact','X-Goog-Visitor-Id':'visitor'}});
  assert.deepEqual(parseResolvedYouTubeOutput('https://example.com/audio\tNA\tm3u8_native\tabcdefghijk'),{url:'https://example.com/audio',duration:0,protocol:'m3u8_native',id:'abcdefghijk',headers:{}});
  assert.deepEqual(sanitizeResolvedYouTubeHeaders({Referer:'https://www.youtube.com/',Range:'bytes=0-1','X-Bad':'line1\r\nInjected: yes'}),{Referer:'https://www.youtube.com/'});
  assert.throws(()=>parseResolvedYouTubeOutput('not-a-media-url\t200\thttps\tabcdefghijk'),/gültige Audioadresse/);
});

test('Spotify playback rejects source durations that are far away from the catalog track',()=>{
  assert.equal(spotifyPlaybackDurationToleranceSeconds(200),30);
  assert.equal(spotifyPlaybackDurationCompatible(200,230),true);
  assert.equal(spotifyPlaybackDurationCompatible(200,231),false);
  assert.equal(spotifyPlaybackDurationCompatible(300,345),true);
  assert.equal(spotifyPlaybackDurationCompatible(300,346),false);
  assert.equal(spotifyPlaybackDurationCompatible(0,999),true);
});

test('Spotify candidate ranking keeps using the catalog duration after playback metadata has been refreshed',()=>{
  const track={title:'Artist – Song',source:'spotify',catalogDuration:200,duration:180};
  const candidates=[
    {id:'abcdefghijk',title:'Artist – Song',duration:180,url:'https://www.youtube.com/watch?v=abcdefghijk'},
    {id:'lmnopqrstuv',title:'Artist – Song',duration:200,url:'https://www.youtube.com/watch?v=lmnopqrstuv'}
  ];
  const ranked=rankSpotifyPlaybackCandidates(track,candidates);
  assert.equal(ranked[0].id,'lmnopqrstuv');
});

test('online playback writes the verified source duration back before the player can schedule a crossfade',async()=>{
  const source=await fs.readFile(new URL('../backend/src/audio/youtube-client.js',import.meta.url),'utf8'),spotifySource=await fs.readFile(new URL('../backend/src/spotify-playback.js',import.meta.url),'utf8');
  assert.match(source,/--print',youtubePlaybackPrintTemplate/);
  assert.match(source,/applyResolvedPlayback\(item,resolved\)/);
  assert.match(source,/item\.catalogDuration=original/);
  assert.match(source,/item\.duration=duration/);
  assert.match(spotifySource,/spotifyPlaybackDurationCompatible\(catalogDuration,actualDuration\)/);
});
