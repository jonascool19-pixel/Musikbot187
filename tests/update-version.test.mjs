import test from 'node:test';
import assert from 'node:assert/strict';
import {appVersion,compareVersions,updateStatus} from '../backend/src/update.js';

test('release 2.1.4 is exposed to the dashboard updater',async()=>{
  assert.equal(appVersion,'2.1.4');
  assert.equal(compareVersions('2.1.4','2.1.3'),1);
  const status=await updateStatus(async()=>({ok:true,json:async()=>({version:'2.1.4'})}));
  assert.deepEqual(status,{current:'2.1.4',latest:'2.1.4',available:false,source:'GitHub main'});
});

test('an installed 2.1.3 build sees 2.1.4 as newer',()=>{
  assert.equal(compareVersions('2.1.4','2.1.3'),1);
  assert.equal(compareVersions('2.1.3','2.1.4'),-1);
});
