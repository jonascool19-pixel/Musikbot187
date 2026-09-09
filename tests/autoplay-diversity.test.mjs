import test from 'node:test';
import assert from 'node:assert/strict';
import {EventEmitter} from 'node:events';
import {AutoplayController,autoplayMusicCandidateAllowed,autoplaySlowedVersion} from '../backend/src/autoplay.js';
import {musicArtistKeys} from '../backend/src/music-identity.js';
import {rankSpotifyPlaybackCandidates} from '../backend/src/media.js';

class Player extends EventEmitter{
  constructor(){super();this.current=null;this.queue=[];}
  state(){return {current:this.current,queue:this.queue,playing:Boolean(this.current)};}
  add(items){this.queue.push(...items);if(!this.current)this.current=this.queue.shift()||null;}
  clear(){this.queue=[];}
  remove(index){this.queue.splice(index,1);}
  skip(){this.current=this.queue.shift()||null;}
}
const song=(id,artist,title=id)=>({id,title:`${artist} – ${title}`,source:'youtube',duration:200});
const counts=tracks=>{const result=new Map();for(const track of tracks)for(const artist of musicArtistKeys(track))result.set(artist,(result.get(artist)||0)+1);return result;};
const fixture=(profile,recommend)=>{
  const player=new Player(),settings={autoplayEnabled:false,autoplayMode:'similar',autoplayQueueTarget:10};
  const controller=new AutoplayController({player,settings,profile,getPlaylists:()=>[],recommend,save:async()=>{}});
  return {player,controller};
};

test('explicit slowed variants are excluded across sources, not normal titles containing slow',()=>{
  for(const suffix of ['SLOW','SLOWED','SUPER SLOWED','Ultra-Slowed','superslowed','Slowed + Reverb','Slow + Reverb','Slow & Reverb','Slow Version','Slower Remix','Slow Edit','verlangsamt','verlangsamte Version']){
    for(const source of ['youtube','spotify','local']){
      const track={...song('slow','DJ',`Hardstyle Anthem (${suffix})`),source};
      assert.equal(autoplaySlowedVersion(track),true,suffix);
      assert.equal(autoplayMusicCandidateAllowed(track),false,source+' '+suffix);
    }
  }
  assert.equal(autoplaySlowedVersion(song('slow-tag','DJ','Hardtekk Anthem - Slow')),true);
  for(const title of ['Slowdive – Star Roving','Kylie Minogue – Slow (Official Audio)','DJ – Slow Down (Hardstyle Remix)','DJ – Uptempo Anthem (Original Mix)','DJ – Hardtekk Rework'])assert.equal(autoplayMusicCandidateAllowed({title,source:'youtube',duration:200}),true,title);
});

test('artist identities combine collaborations and normalize accents, case and Topic channels',()=>{
  assert.deepEqual(musicArtistKeys({title:'RóKun feat. Cy_He – Song'}),['rokun','cy he']);
  assert.deepEqual(musicArtistKeys({title:'CY_HE & ROKUN – Other'}),['cy he','rokun']);
  assert.deepEqual(musicArtistKeys({title:'Song',channel:'RoKun - Topic'}),['rokun']);
  assert.deepEqual(musicArtistKeys({title:'Song',channel:'Generic Upload Channel'}),[]);
  assert.deepEqual(musicArtistKeys({title:'Song',artists:['Main Artist','Guest Artist']}),['main artist','guest artist']);
  assert.deepEqual(musicArtistKeys({title:'Main x Guest vs. Third – Track'}),['main','guest','third']);
  assert.deepEqual(musicArtistKeys({title:'Feature Band – Track'}),['feature band']);
});

test('Spotify autoplay cannot resolve an ordinary remix to a slowed YouTube substitute',()=>{
  const track={title:'RoKun – Hardtekk Remix',source:'spotify',duration:200,autoplayMode:'similar'};
  const slow={id:'abcdefghijk',title:'RoKun – Hardtekk Remix (Super Slowed)',duration:200};
  const normal={id:'12345678901',title:'RoKun – Hardtekk Remix (Official Audio)',duration:190};
  assert.deepEqual(rankSpotifyPlaybackCandidates(track,[slow,normal]),[normal]);
  assert.deepEqual(rankSpotifyPlaybackCandidates(track,[slow]),[]);
  assert.deepEqual(rankSpotifyPlaybackCandidates({...track,autoplayMode:undefined},[slow]),[slow],'manual playback is unchanged');
});

test('learned, restored and buffered slowed tracks cannot bypass the filter; manual selections remain intact',async t=>{
  const slow={...song('learned-slow','RoKun','Uptempo Song - Slowed'),source:'spotify',key:'learned-slow',listens:100,playlistIds:['taste']};
  const {controller,player}=fixture({tracks:[slow],preferredStyles:['Uptempo']},async()=>[slow,...Array.from({length:12},(_,i)=>song('new-'+i,'Fresh '+i,'Uptempo Track '+i))]);
  t.after(()=>controller.close());
  player.current={...slow,id:'manual-current'};
  const manual={...slow,id:'manual-queue'};
  player.queue=[manual,{...slow,autoplay:true,autoplayMode:'similar',autoplayKnownFavorite:true}];
  controller.recommendationBuffer=[{...slow,id:'buffered-slow'}];
  controller.settings.autoplayEnabled=true;
  await controller.fill();
  assert.equal(player.current.id,'manual-current');
  assert.ok(player.queue.includes(manual));
  assert.ok(player.queue.filter(track=>track.autoplayMode==='similar').every(track=>!autoplaySlowedVersion(track)));
  assert.ok(controller.profile.tracks.some(track=>track.id===slow.id),'saved library is not deleted');
  assert.equal(player.queue.length,10);
});

test('artist-heavy search pages and learned favorites share one artist budget across refills and restart',async t=>{
  const learned=Array.from({length:45},(_,index)=>({
    ...song('known-'+index,index<24?'MainAct':`Taste ${index%7}`,`Uptempo Favorite ${index}`),
    key:'known-'+index,listens:index<24?100:1,playlistIds:['taste'],styles:['Uptempo'],lastPlayed:index
  }));
  const profile={tracks:learned,preferredStyles:['Uptempo']};
  let serial=0;
  const recommend=async(seed,{limit})=>{
    const batch=serial++;
    return [
      ...Array.from({length:10},(_,i)=>song(`fresh-${batch}-${i}`,i%2?'MainAct & Collaborator':'MainAct',`Uptempo Signal${batch}n${i}`)),
      ...Array.from({length:14},(_,i)=>song(`guest-${batch}-${i}`,`Guest ${i}`,`Uptempo Anthem${batch}n${i}`))
    ].slice(0,limit);
  };
  let {controller,player}=fixture(profile,recommend);
  t.after(()=>controller.close());
  await controller.setEnabled(true);
  for(let step=0;step<35;step++){
    assert.equal(player.queue.length,10,'queue at '+step);
    assert.equal(player.queue.filter(track=>track.autoplayKnownFavorite).length,5,'5+5 at '+step);
    const all=[player.current,...player.queue],byArtist=counts(all);
    assert.ok(Math.max(...byArtist.values())<=2,'artist counts at '+step+': '+JSON.stringify([...byArtist]));
    assert.ok(new Set(player.queue.flatMap(musicArtistKeys)).size>=5);
    for(let i=1;i<all.length;i++)assert.ok(!musicArtistKeys(all[i]).some(key=>musicArtistKeys(all[i-1]).includes(key)),'adjacent artist at '+step);
    player.skip();await controller.fill();
  }
  controller.close();
  ({controller,player}=fixture(JSON.parse(JSON.stringify(profile)),recommend));
  await controller.setEnabled(true);
  assert.equal(player.queue.filter(track=>track.autoplayKnownFavorite).length,5);
  assert.ok(Math.max(...counts([player.current,...player.queue]).values())<=2);
});

test('a crowded artist buffer does not block discovery searches for other artists',async t=>{
  let calls=0;
  const {controller,player}=fixture({tracks:[],preferredStyles:['Uptempo']},async()=>{
    calls++;return Array.from({length:12},(_,i)=>song('alternative-'+i,'Other '+i,'Uptempo Alternative '+i));
  });
  t.after(()=>controller.close());
  player.current={...song('current','Crowded','Uptempo Current'),autoplay:true,autoplayMode:'similar'};
  player.queue=Array.from({length:9},(_,i)=>({...song('queued-'+i,i<2?'Crowded':'Existing '+i,'Uptempo Old '+i),autoplay:true,autoplayMode:'similar'}));
  controller.recommendationBuffer=Array.from({length:20},(_,i)=>song('buffer-'+i,'Crowded','Uptempo Reserve '+i));
  controller.lastSeedKey='current';controller.settings.autoplayEnabled=true;
  await controller.fill();
  assert.ok(calls>0,'unusable reserves must trigger another search');
  assert.equal(player.queue.length,10);
  assert.ok(player.queue.at(-1).id.startsWith('alternative-'));
});

test('a genuinely small artist pool continues playing without weakening music or slowed filters',async t=>{
  const tracks=Array.from({length:15},(_,i)=>({...song('small-'+i,'Only Artist','Uptempo Favorite '+i),key:'small-'+i,listens:1,playlistIds:['taste']}));
  const {controller,player}=fixture({tracks,preferredStyles:['Uptempo']},async()=>[song('wrong','Other','Schlager Song'),song('slow','Other','Uptempo Song - Slowed')]);
  t.after(()=>controller.close());
  await controller.setEnabled(true);
  assert.equal(player.queue.length,10);
  assert.ok(player.queue.every(track=>track.autoplayKnownFavorite&&track.title.startsWith('Only Artist')));
});
