import test from 'node:test';
import assert from 'node:assert/strict';
import {appVersion,compareVersions,updateStatus} from '../backend/src/update.js';

test('release 2.1.0 is exposed to the dashboard updater',async()=>{
  assert.equal(appVersion,'2.1.0');
  assert.equal(compareVersions('2.1.0','2.0.1'),1);
  const status=await updateStatus(async()=>({ok:true,json:async()=>({version:'2.1.0'})}));
  assert.deepEqual(status,{current:'2.1.0',latest:'2.1.0',available:false,source:'GitHub main'});
});

test('an installed 2.0.1 build sees 2.1.0 as newer',()=>{
  assert.equal(compareVersions('2.1.0','2.0.1'),1);
  assert.equal(compareVersions('2.0.1','2.1.0'),-1);
});
