import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {autoplayTermSearchQuery,validateAutoplayTermEvidence} from '../backend/src/autoplay.js';
import {buildServer} from '../backend/src/server.js';

test('Autoplay recognizes built-in genres and requires exact evidence for free music terms',()=>{assert.equal(validateAutoplayTermEvidence('Gabber',[]).matched,'Hardcore');assert.equal(validateAutoplayTermEvidence('Hardtech',[{title:'Hardtech Festival Official Audio'}]).valid,true);assert.equal(validateAutoplayTermEvidence('Hardtech',[{title:'Hard Techno Festival'}]).valid,false);assert.match(autoplayTermSearchQuery('Rammstein'),/Rammstein.*Musik/)});

test('Autoplay API verifies new genres and artists before saving them',async t=>{
  const dir=await fs.mkdtemp(path.join(os.tmpdir(),'musikbot187-autoplay-validation-')),queries=[],provider=async query=>{queries.push(query);if(/Hardtech/i.test(query))return[{title:'Hardtech Music Festival 2026'}];if(/Rammstein/i.test(query))return[{title:'Rammstein – Sonne (Official Audio)'}];return[{title:'Völlig anderer Künstler – Pop Song'}]},app=await buildServer({dataDir:dir,musicDir:path.join(dir,'music'),stateFile:path.join(dir,'state.json'),secretFile:path.join(dir,'secret.key'),frontendDir:path.resolve('frontend'),setupToken:'setup-test-token',logger:false,controlSocket:path.join(dir,'control.sock'),autoplayStyleValidationProvider:provider});t.after(async()=>{await app.close();await fs.rm(dir,{recursive:true,force:true})});let response=await app.inject({method:'POST',url:'/api/setup',headers:{'x-musikbot-setup-token':'setup-test-token'},payload:{username:'admin',password:'correct-horse-battery'}}),headers={authorization:`Bearer ${response.json().token}`};
  response=await app.inject({method:'POST',url:'/api/autoplay/profile/term/validate',headers,payload:{term:'Hardstyle'}});assert.equal(response.statusCode,200,response.body);assert.equal(response.json().type,'genre');assert.equal(queries.length,0);
  response=await app.inject({method:'POST',url:'/api/autoplay/profile/term/validate',headers,payload:{term:'Hardtech'}});assert.equal(response.statusCode,200,response.body);assert.equal(response.json().valid,true);assert.match(response.json().evidence[0],/Hardtech/);
  response=await app.inject({method:'PUT',url:'/api/autoplay/profile/styles',headers,payload:{preferredStyles:['Hardtech'],blockedStyles:['Rammstein']}});assert.equal(response.statusCode,200,response.body);assert.deepEqual(response.json().profile.preferredStyles,['Hardtech']);assert.deepEqual(response.json().profile.blockedStyles,['Rammstein']);
  response=await app.inject({method:'PUT',url:'/api/autoplay/profile/styles',headers,payload:{preferredStyles:['Erfundener Stil'],blockedStyles:['Rammstein']}});assert.equal(response.statusCode,400,response.body);assert.match(response.json().error,/kein passender Musikstil oder Künstler/);
  const saved=JSON.parse(await fs.readFile(path.join(dir,'state.json'),'utf8')).listeningProfile;assert.deepEqual(saved.preferredStyles,['Hardtech']);assert.deepEqual(saved.blockedStyles,['Rammstein']);
});
