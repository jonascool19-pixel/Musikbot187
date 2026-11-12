import test from 'node:test';
import assert from 'node:assert/strict';
import {appVersion,compareVersions,updateStatus} from '../backend/src/update.js';

test('release 2.1.6 is exposed to the dashboard updater',async()=>{
  assert.equal(appVersion,'2.1.6');
  assert.equal(compareVersions('2.1.6','2.1.5'),1);
  const status=await updateStatus(async()=>({ok:true,json:async()=>({version:'2.1.6'})}));
  assert.deepEqual(status,{current:'2.1.6',latest:'2.1.6',available:false,source:'GitHub main'});
});

test('an installed 2.1.5 build sees 2.1.6 as newer',()=>{
  assert.equal(compareVersions('2.1.6','2.1.5'),1);
  assert.equal(compareVersions('2.1.5','2.1.6'),-1);
});
