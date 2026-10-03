import test from 'node:test';
import assert from 'node:assert/strict';
import {spotifyPlaybackTitleCompatible,resolveSpotify,SpotifyMatchUnavailableError} from '../backend/src/media.js';

const yt=(id,title,duration,channel='')=>({id,title,duration,url:`https://www.youtube.com/watch?v=${id}`,channel});
const resolved=(id,duration)=>({id,duration,protocol:'https',url:`https://example.test/audio/${id}`});

test('1.8.39 regression: HUGEL/SOLTO exact collaboration release is accepted',()=>{
  const song={id:'spotify:hugel-jamaican',source:'spotify',title:'HUGEL, SOLTO (FR) – Jamaican (Bam Bam)',duration:156};
  const candidate=yt('aaaaabbbbb1','HUGEL, SOLTO (FR) - Jamaican (Bam Bam) (Official Visualizer)',157,'Digster Pop Music');
  assert.equal(spotifyPlaybackTitleCompatible(song,candidate),true);
  assert.equal(spotifyPlaybackTitleCompatible(song,yt('cccccdddd1','HUGEL, SOLTO (FR) - Jamaican (Bam Bam) (Extended Mix)',301,'MoBlack Records')),false);
  assert.equal(spotifyPlaybackTitleCompatible(song,yt('eeeeefffff1','HUGEL, SOLTO (FR) - Jamaican (Bam Bam) (Original Mix)',157,'MoBlack Records')),true);
});

test('1.8.39 regression: NGL SEXY KICKS never accepts unrelated same-title uploaders',async()=>{
  const song={id:'spotify:ngl-sexy-kicks',source:'spotify',title:'NGL – SEXY KICKS',duration:208};
  for(const candidate of [
    yt('ggggghhhhh1','SEXY KICKS',209,'Brandon'),
    yt('iiiiijjjjj1','Sexy Kicks',271,'JJBlackstar'),
    yt('kkkkklllll1','Assassins Creed Odyssey : Sexy Spartan Kicks',65,'Bassel Shmali'),
    yt('mmmmnnnnn1','Pumped Up Kicks',240,'FosterThePeople')
  ]) assert.equal(spotifyPlaybackTitleCompatible(song,candidate),false,candidate.title);
  const error=await resolveSpotify(song,null,{search:async()=>[
    yt('ggggghhhhh1','SEXY KICKS',209,'Brandon'),
    yt('iiiiijjjjj1','Sexy Kicks',271,'JJBlackstar')
  ],resolve:async()=>{throw new Error('must not resolve unrelated artist')} }).catch(value=>value);
  assert.ok(error instanceof SpotifyMatchUnavailableError);
  assert.equal(song.playbackVideoId,undefined);
});

test('1.8.39 regression: all explicit artists remain mandatory for collaboration prefixes',()=>{
  const song={id:'spotify:nvitral-game-of-hate',source:'spotify',title:'N-Vitral, BOMBSQUAD, Barber – Game Of Hate',duration:181};
  assert.equal(spotifyPlaybackTitleCompatible(song,yt('oooooppppp1','N-Vitral presents BOMBSQUAD x Barber - Game of Hate (Official Videoclip)',183,'N-Vitral')),true);
  assert.equal(spotifyPlaybackTitleCompatible(song,yt('qqqqqrrrrr1','N-Vitral presents BOMBSQUAD - Game of Hate',181,'N-Vitral')),false);
});

test('1.8.39 regression: Topic exact title requires artist-scoped search and rejects tempo variants',()=>{
  const song={id:'spotify:hxllgang-waiting',source:'spotify',title:'HXLLGANG, VLNCRSH – WAITING FOR TONIGHT (HARDTEKK)',duration:170};
  const good=yt('sssssuuuuu1','WAITING FOR TONIGHT (HARDTEKK)',171,'Release - Topic');
  good.searchQuery='HXLLGANG VLNCRSH "WAITING FOR TONIGHT (HARDTEKK)" audio';
  assert.equal(spotifyPlaybackTitleCompatible(song,good),true);
  assert.equal(spotifyPlaybackTitleCompatible(song,{...good,title:'WAITING FOR TONIGHT (HARDTEKK) (SLOWED)',duration:188}),false);
  assert.equal(spotifyPlaybackTitleCompatible(song,{...good,title:'WAITING FOR TONIGHT (HARDTEKK) (SPED UP)',duration:154}),false);
  assert.equal(spotifyPlaybackTitleCompatible(song,{...good,searchQuery:'OTHER ARTIST "WAITING FOR TONIGHT (HARDTEKK)" audio'}),false);
});
