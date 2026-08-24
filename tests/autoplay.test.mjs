import test from 'node:test';
import assert from 'node:assert/strict';
import {EventEmitter} from 'node:events';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {AutoplayController,inferTrackStyles,normalizeAutoplayConfiguration,recommendationQuery} from '../backend/src/autoplay.js';
import {buildServer} from '../backend/src/server.js';

class FakePlayer extends EventEmitter{
  constructor(){super();this.current=null;this.queue=[];this.volume=75;this.mode='queue';this.paused=false;}
  state(){return {current:this.current,queue:this.queue,volume:this.volume,mode:this.mode,paused:this.paused,playing:Boolean(this.current),resolving:false,reconnecting:false,positionSeconds:0,playbackId:this.current?1:null};}
  add(items,{now=false}={}){const list=(Array.isArray(items)?items:[items]).filter(Boolean);if(now){this.queue.unshift(...list);this.skip();return}this.queue.push(...list);if(!this.current)this.current=this.queue.shift()||null;this.emit('state',this.state());}
  clear(){this.queue=[];this.emit('state',this.state());}
  remove(index){this.queue.splice(index,1);this.emit('state',this.state());}
  skip(){this.current=this.queue.shift()||null;this.emit('state',this.state());}
  stop(){this.current=null;this.queue=[];this.emit('state',this.state());}
  pause(){this.paused=true;this.emit('state',this.state());}
  resume(){this.paused=false;this.emit('state',this.state());}
  setVolume(value){this.volume=Number(value);this.emit('state',this.state());}
  setMode(value){this.mode=value;this.emit('state',this.state());}
  snapshot(){return {version:1,current:this.current,queue:this.queue,volume:this.volume,mode:this.mode,positionSeconds:0};}
  restore(snapshot){this.current=snapshot?.current||null;this.queue=snapshot?.queue||[];this.emit('state',this.state());return Boolean(this.current);}
}

const tick=()=>new Promise(resolve=>setImmediate(resolve));

test('playlist autoplay preserves selected order, loops forever and clears only the waiting list when disabled',async()=>{
  const player=new FakePlayer(),settings={autoplayEnabled:false,autoplayMode:'playlists',autoplayPlaylistIds:['first','second'],autoplayQueueTarget:3},profile={version:1,tracks:[]},playlists=[{id:'first',name:'Erste',items:[{id:'a',title:'A',source:'youtube'},{id:'b',title:'B',source:'youtube'}]},{id:'second',name:'Zweite',items:[{id:'c',title:'C',source:'spotify'}]}],controller=new AutoplayController({player,settings,profile,getPlaylists:()=>playlists,recommend:async()=>[],save:async()=>{}});
  await controller.setEnabled(true);
  assert.equal(player.current.id,'a');
  assert.deepEqual(player.queue.map(track=>track.id),['b','c','a']);
  assert.ok(player.queue.every(track=>track.autoplay&&track.autoplayMode==='playlists'));
  player.skip();await tick();await tick();
  assert.equal(player.current.id,'b');
  assert.deepEqual(player.queue.map(track=>track.id),['c','a','b']);
  await controller.setEnabled(false);
  assert.equal(player.current.id,'b');
  assert.deepEqual(player.queue,[]);
  controller.close();
});

test('similar autoplay filters duplicates, marks recommendations and learns a local listening profile',async()=>{
  const seed={id:'seed',title:'Uptempo Hardcore Anthem (Official Video)',source:'youtube'},player=new FakePlayer();player.current=seed;
  const settings={autoplayEnabled:false,autoplayMode:'similar',autoplayPlaylistIds:[],autoplayQueueTarget:3},profile={version:1,tracks:[]},queries=[],controller=new AutoplayController({player,settings,profile,getPlaylists:()=>[],recommend:async(track,{query})=>{queries.push({track,query});return [seed,{id:'one',title:'Hardcore Mix One',source:'youtube'},{id:'two',title:'Hardstyle Mix Two',source:'youtube'},{id:'three',title:'Techno Mix Three',source:'youtube'}]},save:async()=>{}});
  await controller.setEnabled(true);
  assert.deepEqual(player.queue.map(track=>track.id),['one','two','three']);
  assert.ok(player.queue.every(track=>track.autoplay&&track.autoplayMode==='similar'));
  assert.match(queries[0].query,/ähnliche Songs Mix/);
  await controller.recordListened(seed,1234);
  const summary=controller.state().profile;
  assert.equal(summary.learnedTracks,1);
  assert.equal(summary.totalListens,1);
  assert.deepEqual(summary.styles.map(style=>style.name),['Uptempo','Hardcore']);
  await controller.recordListened(seed,2345);
  assert.equal(controller.state().profile.totalListens,2);
  await controller.resetProfile();
  assert.equal(controller.state().profile.learnedTracks,0);
  controller.close();
});

test('autoplay configuration and recommendation text are bounded and normalized',()=>{
  const playlists=[{id:'known'}],config=normalizeAutoplayConfiguration({mode:'invalid',playlistIds:['missing','known','known'],queueTarget:999},playlists);
  assert.deepEqual(config,{mode:'playlists',playlistIds:['known'],queueTarget:20});
  assert.equal(recommendationQuery({title:'Artist – Track (Official Video).mp3'}),'Artist – Track ähnliche Songs Mix');
  assert.deepEqual(inferTrackStyles({title:'Uptempo und Rawstyle Mix'}),['Uptempo','Hardstyle']);
});

test('autoplay API saves configuration, fills the queue and clears it from the dashboard switch',async t=>{
  const dir=await fs.mkdtemp(path.join(os.tmpdir(),'musikbot187-autoplay-')),player=new FakePlayer(),app=await buildServer({dataDir:dir,musicDir:path.join(dir,'music'),stateFile:path.join(dir,'state.json'),secretFile:path.join(dir,'secret.key'),frontendDir:path.resolve('frontend'),setupToken:'setup-test-token',logger:false,controlSocket:path.join(dir,'control.sock'),player,autoplayRecommendationProvider:async()=>[]});
  t.after(async()=>{await app.close();await fs.rm(dir,{recursive:true,force:true});});
  let response=await app.inject({method:'POST',url:'/api/setup',headers:{'x-musikbot-setup-token':'setup-test-token'},payload:{username:'admin',password:'correct-horse-battery'}}),headers={authorization:`Bearer ${response.json().token}`};
  response=await app.inject({method:'POST',url:'/api/playlists',headers,payload:{name:'Autoplay Liste',items:[{id:'one',title:'Titel Eins',source:'youtube'},{id:'two',title:'Titel Zwei',source:'spotify'}]}});const playlist=response.json();
  response=await app.inject({method:'PUT',url:'/api/autoplay/config',headers,payload:{mode:'playlists',playlistIds:[playlist.id],queueTarget:4}});assert.equal(response.statusCode,200,response.body);assert.deepEqual(response.json().playlistIds,[playlist.id]);
  response=await app.inject({method:'PUT',url:'/api/autoplay/enabled',headers,payload:{enabled:true}});assert.equal(response.statusCode,200,response.body);assert.equal(response.json().autoplay.enabled,true);assert.equal(response.json().player.current.id,'one');assert.equal(response.json().player.queue.length,4);
  response=await app.inject({url:'/api/state',headers});assert.equal(response.json().autoplay.mode,'playlists');assert.equal(response.json().autoplay.status,'active');
  response=await app.inject({method:'POST',url:'/api/player/queue',headers,payload:{item:{id:'manual',title:'Manueller Titel',source:'youtube'},now:true}});assert.equal(response.statusCode,200,response.body);assert.equal(response.json().current.id,'manual');assert.ok(response.json().queue.length<=4);
  response=await app.inject({method:'PUT',url:'/api/autoplay/enabled',headers,payload:{enabled:false}});assert.equal(response.statusCode,200,response.body);assert.equal(response.json().player.current.id,'manual');assert.deepEqual(response.json().player.queue,[]);
  response=await app.inject({method:'PUT',url:'/api/autoplay/config',headers,payload:{mode:'unknown',playlistIds:[],queueTarget:5}});assert.equal(response.statusCode,400);
});
