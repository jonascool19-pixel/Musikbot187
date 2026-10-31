import test from 'node:test';
import assert from 'node:assert/strict';
import {appVersion,compareVersions,updateStatus} from '../backend/src/update.js';

test('release 1.9.1 is exposed to the dashboard updater',async()=>{
  assert.equal(appVersion,'1.9.1');
  assert.equal(compareVersions('1.9.1','1.9.0'),1);
  const status=await updateStatus(async()=>({ok:true,json:async()=>({version:'1.9.1'})}));
  assert.deepEqual(status,{current:'1.9.1',latest:'1.9.1',available:false,source:'GitHub main'});
});

test('an installed 1.9.0 build sees 1.9.1 as newer',()=>{
  assert.equal(compareVersions('1.9.1','1.9.0'),1);
  assert.equal(compareVersions('1.9.0','1.9.1'),-1);
});
