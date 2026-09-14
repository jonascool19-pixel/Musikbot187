import test from 'node:test';
import assert from 'node:assert/strict';
import {parseResolvedYouTubeOutput,rankSpotifyPlaybackCandidates,spotifyPlaybackDurationCompatible,spotifyPlaybackDurationToleranceSeconds,youtubePlaybackPrintTemplate} from '../backend/src/media.js';

test('yt-dlp playback output keeps the selected URL and its exact source duration together',()=>{
  assert.match(youtubePlaybackPrintTemplate,/%\(url\)s/);
  assert.match(youtubePlaybackPrintTemplate,/%\(duration\)s/);
  const resolved=parseResolvedYouTubeOutput('https://example.com/audio\t213.42\thttps\tabcdefghijk\n');
  assert.deepEqual(resolved,{url:'https://example.com/audio',duration:213.42,protocol:'https',id:'abcdefghijk'});
  assert.equal(parseResolvedYouTubeOutput('https://example.com/audio\tNA\tm3u8_native\tabcdefghijk').duration,0);
  assert.throws(()=>parseResolvedYouTubeOutput('not-a-media-url\t200\thttps\tabcdefghijk'),/gültige Audioadresse/);
});

test('Spotify playback rejects source durations that are far away from the catalog track',()=>{
  assert.equal(spotifyPlaybackDurationToleranceSeconds(200),16);
  assert.equal(spotifyPlaybackDurationCompatible(200,215),true);
  assert.equal(spotifyPlaybackDurationCompatible(200,217),false);
  assert.equal(spotifyPlaybackDurationCompatible(300,320),true);
  assert.equal(spotifyPlaybackDurationCompatible(300,321),false);
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
