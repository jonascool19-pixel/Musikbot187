import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {spotifyPlaylistSyncResult,spotifySyncCandidates} from '../backend/src/spotify-sync.js';
import {buildServer} from '../backend/src/server.js';

test('Spotify playlist sync mirrors additions and removals without changing the local playlist id',()=>{
  const playlist={id:'local-list',name:'Alt',source:'spotify',spotifyId:'spotify-list',items:[{id:'keep',title:'Bleibt'},{id:'removed',title:'Entfernt'}]},imported={name:'Neu',spotifyId:'spotify-list',sourceUrl:'https://open.spotify.com/playlist/spotify-list',items:[{id:'keep',title:'Bleibt'},{id:'added',title:'Neu'}]},synced=spotifyPlaylistSyncResult(playlist,imported,'2026-08-24T12:00:00.000Z');
  assert.equal(synced.id,'local-list');
  assert.deepEqual(synced.items.map(track=>track.id),['keep','added']);
  assert.deepEqual(synced.spotifySync,{added:1,removed:1,total:2});
  assert.equal(synced.spotifySyncedAt,'2026-08-24T12:00:00.000Z');
  assert.equal(synced.spotifySyncEnabled,true);
});

test('automatic Spotify sync selects only linked enabled Spotify playlists',()=>{
  const candidates=spotifySyncCandidates([{id:'one',source:'spotify',spotifyId:'abc'},{id:'two',source:'spotify',sourceUrl:'https://open.spotify.com/playlist/def',spotifySyncEnabled:false},{id:'three',source:'youtube'}]);
  assert.deepEqual(candidates.map(playlist=>playlist.id),['one']);
});

test('Spotify import keeps one linked playlist and manual sync mirrors the current remote tracks',async t=>{
  const dir=await fs.mkdtemp(path.join(os.tmpdir(),'musikbot187-spotify-sync-'));let version=1;const importer=async()=>({name:'Spotify Mix',spotifyId:'spotify-list-123',sourceUrl:'https://open.spotify.com/playlist/spotify-list-123',thumbnail:'',items:version===1?[{id:'one',title:'Titel Eins',source:'spotify'},{id:'two',title:'Titel Zwei',source:'spotify'}]:[{id:'two',title:'Titel Zwei',source:'spotify'},{id:'three',title:'Titel Drei',source:'spotify'}]}),app=await buildServer({dataDir:dir,musicDir:path.join(dir,'music'),stateFile:path.join(dir,'state.json'),secretFile:path.join(dir,'secret.key'),frontendDir:path.resolve('frontend'),setupToken:'setup-test-token',logger:false,controlSocket:path.join(dir,'control.sock'),spotifyAccessTokenProvider:async()=>'user-token',spotifyPlaylistImporter:importer});
  t.after(async()=>{await app.close();await fs.rm(dir,{recursive:true,force:true})});
  let response=await app.inject({method:'POST',url:'/api/setup',headers:{'x-musikbot-setup-token':'setup-test-token'},payload:{username:'admin',password:'correct-horse-battery'}}),headers={authorization:`Bearer ${response.json().token}`};
  response=await app.inject({method:'POST',url:'/api/playlists/import-spotify',headers,payload:{url:'https://open.spotify.com/playlist/spotify-list-123'}});assert.equal(response.statusCode,200,response.body);const playlist=response.json();assert.equal(playlist.items.length,2);assert.equal(playlist.spotifySyncEnabled,true);
  version=2;response=await app.inject({method:'POST',url:`/api/playlists/${playlist.id}/sync-spotify`,headers});assert.equal(response.statusCode,200,response.body);assert.deepEqual(response.json().items.map(track=>track.id),['two','three']);assert.deepEqual(response.json().spotifySync,{added:1,removed:1,total:2});
  response=await app.inject({method:'POST',url:'/api/playlists/import-spotify',headers,payload:{url:'https://open.spotify.com/playlist/spotify-list-123'}});assert.equal(response.statusCode,200,response.body);response=await app.inject({url:'/api/playlists',headers});assert.equal(response.json().length,1);
});

test('linked Spotify playlists are refreshed by the automatic interval',async t=>{
  const dir=await fs.mkdtemp(path.join(os.tmpdir(),'musikbot187-spotify-auto-sync-'));let version=1;const importer=async()=>({name:'Auto Mix',spotifyId:'auto-list-123',sourceUrl:'https://open.spotify.com/playlist/auto-list-123',items:[{id:version===1?'old':'new',title:version===1?'Alt':'Neu',source:'spotify'}]}),app=await buildServer({dataDir:dir,musicDir:path.join(dir,'music'),stateFile:path.join(dir,'state.json'),secretFile:path.join(dir,'secret.key'),frontendDir:path.resolve('frontend'),setupToken:'setup-test-token',logger:false,controlSocket:path.join(dir,'control.sock'),spotifyAccessTokenProvider:async()=>'user-token',spotifyPlaylistImporter:importer,spotifySyncIntervalMs:40});
  t.after(async()=>{await app.close();await fs.rm(dir,{recursive:true,force:true})});
  let response=await app.inject({method:'POST',url:'/api/setup',headers:{'x-musikbot-setup-token':'setup-test-token'},payload:{username:'admin',password:'correct-horse-battery'}}),headers={authorization:`Bearer ${response.json().token}`};response=await app.inject({method:'POST',url:'/api/playlists/import-spotify',headers,payload:{url:'https://open.spotify.com/playlist/auto-list-123'}});assert.equal(response.statusCode,200,response.body);version=2;
  await new Promise(resolve=>setTimeout(resolve,140));response=await app.inject({url:'/api/playlists',headers});assert.deepEqual(response.json()[0].items.map(track=>track.id),['new']);
});
