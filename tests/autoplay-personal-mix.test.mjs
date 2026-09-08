import test from 'node:test';
import assert from 'node:assert/strict';
import {EventEmitter} from 'node:events';
import {AutoplayController,autoplayCandidateMatchesPreferences,inferTrackStyles,listeningSignalWeight} from '../backend/src/autoplay.js';
import {musicArtist} from '../backend/src/music-identity.js';

class Player extends EventEmitter{
  constructor(){super();this.current=null;this.queue=[];}
  state(){return {current:this.current,queue:this.queue,playing:Boolean(this.current)};}
  add(items){this.queue.push(...items);if(!this.current)this.current=this.queue.shift()||null;}
  clear(){this.queue=[];}
  remove(index){this.queue.splice(index,1);}
  skip(){this.current=this.queue.shift()||null;}
}
const styles=['Hardstyle','Uptempo','Techno','Hardtekk'];
const learned=()=>Array.from({length:24},(_,index)=>({id:'known-'+index,key:'known-'+index,title:'Artist '+index+' – '+styles[index%styles.length]+' Favorite '+index,source:'youtube',duration:200,listens:1,playlistIds:['taste'],styles:[styles[index%styles.length]],lastPlayed:index}));
function fixture(profile,recommend){
  const player=new Player(),settings={autoplayEnabled:false,autoplayMode:'similar',autoplayQueueTarget:10,autoplayPlaylistIds:[]};
  const controller=new AutoplayController({player,settings,profile,getPlaylists:()=>[],recommend,save:async()=>{}});
  return {player,controller};
}

test('search rank and a shared uploader cannot authorize unrelated songs',()=>{
  const profile={preferredStyles:['Uptempo'],preferredArtists:['Trusted DJ'],queryArtist:'Trusted DJ',strictStyle:true};
  for(const title of ['Other Artist – Schlager Party','Other Artist – Rap Hit','Gershwin – Oh Kay 1926','Other Artist – Mystery Track']){
    assert.equal(autoplayCandidateMatchesPreferences({title,channel:'Trusted DJ',artist:'Trusted DJ'},profile),false,title);
  }
  assert.equal(autoplayCandidateMatchesPreferences({title:'Trusted DJ – Schlager Party'},profile),false);
  assert.equal(autoplayCandidateMatchesPreferences({title:'Trusted DJ – Fresh Song'},profile),true);
  assert.equal(autoplayCandidateMatchesPreferences({title:'Unknown – Mystery Track'},{preferredStyles:['Uptempo'],queryStyle:'Uptempo',rank:0}),false);
  assert.equal(musicArtist({title:'Real Artist – Title',artist:'Compilation Channel',channel:'Compilation Channel'}),'Real Artist');
  assert.equal(musicArtist({title:'Title',channel:'Compilation Channel'}),'');
  assert.equal(musicArtist({title:'Title',channel:'Real Artist - Topic'}),'Real Artist');
  assert.deepEqual(inferTrackStyles({title:'Up-Tempo Hardtekk Remix'}),['Uptempo','Hardtekk']);
});

test('ten queued songs stay five learned favorites and five relevant discoveries through repeated refills and restart',async()=>{
  const profile={tracks:learned(),preferredStyles:[],preferredArtists:[],blockedStyles:[]};
  let searches=0;
  const recommend=async(seed,{query})=>{
    const genre=styles.find(style=>query.startsWith(style));
    const artist=query.match(/^Artist \d+/)?.[0];
    const serial=searches++;
    return [
      {id:'wrong-'+serial,title:'Other – Schlager Party',source:'youtube',duration:200},
      ...Array.from({length:16},(_,index)=>({id:'new-'+serial+'-'+index,title:(artist||'New DJ '+serial)+' – '+(genre||'Uptempo')+' Discovery '+serial+' '+index,source:'youtube',duration:200}))
    ];
  };
  let {player,controller}=fixture(profile,recommend);
  await controller.setEnabled(true);
  const played=[],fresh=new Set(),known=new Set();
  for(let step=0;step<70;step++){
    assert.equal(player.queue.length,10,'refill '+step);
    assert.equal(player.queue.filter(track=>track.autoplayKnownFavorite).length,5,'known share '+step);
    assert.equal(new Set([player.current,...player.queue].map(track=>track.id)).size,11);
    assert.ok(player.queue.every(track=>!track.title.includes('Schlager')));
    const track=player.current;
    if(track.autoplayKnownFavorite){assert.ok(track.id.startsWith('known-'));known.add(track.id)}
    else{assert.equal(fresh.has(track.id),false,'new tracks must not cycle');fresh.add(track.id)}
    played.push(track.id);
    player.skip();await controller.fill();
  }
  assert.ok(known.size>=20,'favorites rotate across the library');
  assert.ok(fresh.size>=30);
  controller.close();
  ({player,controller}=fixture(JSON.parse(JSON.stringify(profile)),recommend));
  await controller.setEnabled(true);
  assert.equal(player.queue.filter(track=>track.autoplayKnownFavorite).length,5);
  assert.ok(player.queue.filter(track=>!track.autoplayKnownFavorite).every(track=>!fresh.has(track.id)));
  controller.close();
});

test('exhausted external searches still use learned songs, including favorites in long recent history',async()=>{
  const tracks=learned(),profile={tracks,preferredStyles:['Uptempo'],preferredArtists:[],blockedStyles:[],recentAutoplay:tracks.map(track=>({key:track.id,title:track.title}))};
  const {player,controller}=fixture(profile,async()=>[{id:'bad',title:'Other – Rap Song',source:'youtube',duration:180}]);
  await controller.setEnabled(true);
  assert.equal(player.queue.length,10);
  assert.ok([player.current,...player.queue].every(track=>track.autoplayKnownFavorite));
  assert.equal(new Set([player.current,...player.queue].map(track=>track.id)).size,11);
  controller.close();
});

test('automatic completions do not poison taste, while explicit feedback and playlist import confirm it',async()=>{
  const legacy={id:'legacy',key:'legacy',title:'Other – Schlager Song',source:'youtube',completed:50,listens:0,styles:['Schlager']};
  const profile={tracks:[...learned(),legacy],preferredStyles:[],preferredArtists:[],blockedStyles:[]};
  const {controller}=fixture(profile,async()=>[]);
  assert.equal(listeningSignalWeight(legacy),0);
  assert.equal(controller.profileSummary().styles.some(style=>style.name==='Schlager'),false);
  const suggested={id:'suggested',title:'Other – Rap Song',source:'youtube',duration:200,autoplayMode:'similar'};
  await controller.recordPlaybackOutcome({track:suggested,reason:'completed',duration:200,positionSeconds:200});
  assert.equal(controller.profileSummary().styles.some(style=>style.name==='Rap & Hip-Hop'),false);
  await controller.feedbackCurrent('more',suggested);
  assert.ok(controller.profileSummary().styles.some(style=>style.name==='Rap & Hip-Hop'));
  await controller.learnFromPlaylists([{id:'selected',items:[legacy]}]);
  assert.ok(listeningSignalWeight(legacy)>0);
  controller.close();
});

test('a learned library without reliable genre or artist metadata does not fall back to random hits',async()=>{
  const tracks=Array.from({length:14},(_,index)=>({id:'local-'+index,key:'local-'+index,title:'Track '+index,source:'local',path:index+'.mp3',listens:1,duration:200}));
  let searches=0;
  const {player,controller}=fixture({tracks,preferredStyles:[],preferredArtists:[],blockedStyles:[]},async()=>{searches++;return [{id:'wrong',title:'Other – Schlager',source:'youtube'}]});
  await controller.setEnabled(true);
  assert.equal(searches,0);
  assert.equal(player.queue.length,10);
  assert.ok(player.queue.every(track=>track.autoplayKnownFavorite));
  controller.close();
});
