import test from 'node:test';
import assert from 'node:assert/strict';
import {spotifyPlaybackTitleCompatible} from '../backend/src/media.js';
import {autoplayCandidateMatchesPreferences,listeningSignalWeight,inferTrackStyles} from '../backend/src/autoplay.js';

const yt=(id,title,duration,channel='')=>({id,title,duration,url:`https://www.youtube.com/watch?v=${id}`,channel});

test('1.8.40: exact multi-artist Topic releases can be recovered with a collaborator-scoped search',()=>{
  const song={id:'spotify:specialsadism',source:'spotify',title:'977owo, nowayback – specialsadism (hardstyle)',duration:114};
  const good=yt('specialsadism1','specialsadism (hardstyle)',115,'Release - Topic');
  good.searchQuery='977owo nowayback "specialsadism (hardstyle)" audio';
  assert.equal(spotifyPlaybackTitleCompatible(song,good),true);
  assert.equal(spotifyPlaybackTitleCompatible(song,{...good,searchQuery:'977owo "specialsadism (hardstyle)" audio'}),false);
  assert.equal(spotifyPlaybackTitleCompatible(song,{...good,title:'specialsadism (hardstyle remix)',duration:34}),false);
});

test('1.8.40: credited collaborator Topic uploads are accepted without losing artist safety',()=>{
  const song={id:'spotify:retsen-detsen',source:'spotify',title:'Woebn, POMBAK – Retsen Detsen',duration:114};
  assert.equal(spotifyPlaybackTitleCompatible(song,yt('retsen1','Retsen Detsen',115,'Woebn - Topic')),true);
  assert.equal(spotifyPlaybackTitleCompatible(song,yt('retsen2','Retsen Detsen',115,'Unrelated Artist - Topic')),false);
});

test('1.8.40: exact primary-artist Topic title remains playable for a single-artist track',()=>{
  const song={id:'spotify:edvin-bass-down-low',source:'spotify',title:'Edvin Johansson – BASS DOWN LOW - DOWNTEMPO',duration:183};
  const good=yt('edvin1','BASS DOWN LOW (DOWNTEMPO)',183,'Release - Topic');
  good.searchQuery='Edvin Johansson "BASS DOWN LOW - DOWNTEMPO" topic audio';
  assert.equal(spotifyPlaybackTitleCompatible(song,good),true);
  assert.equal(spotifyPlaybackTitleCompatible(song,{...good,title:'BASS DOWN LOW (DOWNTEMPO) (SLOWED)',duration:213}),false);
});

test('1.8.40: original mix is neutral, but extended/remix/slowed variants stay separate',()=>{
  const song={id:'spotify:plain-song',source:'spotify',title:'DJ – Example Song',duration:180};
  assert.equal(spotifyPlaybackTitleCompatible(song,yt('origmix1','DJ - Example Song (Original Mix)',180,'DJ - Topic')),true);
  assert.equal(spotifyPlaybackTitleCompatible(song,yt('extended1','DJ - Example Song (Extended Mix)',180,'DJ - Topic')),false);
  assert.equal(spotifyPlaybackTitleCompatible(song,yt('remix1','DJ - Example Song (Remix)',180,'DJ - Topic')),false);
  assert.equal(spotifyPlaybackTitleCompatible(song,yt('slow1','DJ - Example Song (Slowed)',180,'DJ - Topic')),false);
});

test('1.8.40: classical candidates cannot pass a hardstyle personal mix',()=>{
  const profile={preferredStyles:['Hardstyle'],preferredArtists:[]};
  assert.equal(autoplayCandidateMatchesPreferences({title:'Classical Piano Concert',source:'youtube',duration:200},profile),false);
  assert.equal(autoplayCandidateMatchesPreferences({title:'Hardstyle Anthem',source:'youtube',duration:200},profile),true);
  assert.deepEqual(inferTrackStyles({title:'Klassische Orchester Suite'}),['Classical']);
});

test('1.8.40: playlist membership alone does not become a learned taste signal',()=>{
  assert.equal(listeningSignalWeight({title:'Unknown – Song',playlistIds:['spotify-playlist'],completed:50,listens:0,rating:0}),0);
  assert.equal(listeningSignalWeight({title:'Known – Song',playlistIds:['spotify-playlist'],tasteConfirmed:true}),0);
  assert.equal(listeningSignalWeight({title:'Known – Song',playlistIds:['spotify-playlist'],listens:1}),1);
});
