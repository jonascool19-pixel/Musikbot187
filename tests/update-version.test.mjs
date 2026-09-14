import test from 'node:test';
import assert from 'node:assert/strict';
import {appVersion,compareVersions,updateStatus} from '../backend/src/update.js';

test('release 1.8.15 is exposed to the dashboard updater',async()=>{
  assert.equal(appVersion,'1.8.15');
  assert.equal(compareVersions('1.8.15','1.8.14'),1);
  const status=await updateStatus(async()=>({ok:true,json:async()=>({version:'1.8.15'})}));
  assert.deepEqual(status,{current:'1.8.15',latest:'1.8.15',available:false,source:'GitHub main'});
});

test('an installed 1.8.14 build sees 1.8.15 as newer',()=>{
  assert.equal(compareVersions('1.8.15','1.8.14'),1);
  assert.equal(compareVersions('1.8.14','1.8.15'),-1);
});
