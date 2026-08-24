import test from 'node:test';
import assert from 'node:assert/strict';
import {appVersion,compareVersions,latestPackageUrl,updateStatus} from '../backend/src/update.js';

test('update version comparison is numeric and bounded to the official repository',async()=>{
  assert.equal(compareVersions('5.10.0','5.2.0'),1);
  assert.equal(compareVersions('5.2.0','5.2.0'),0);
  assert.equal(compareVersions('4.9.9','5.0.0'),-1);
  let requested='';const result=await updateStatus(async url=>{requested=url;return {ok:true,status:200,json:async()=>({version:'1.8.8'})}});
  assert.equal(requested,latestPackageUrl);
  assert.deepEqual(result,{current:appVersion,latest:'1.8.8',available:true,source:'GitHub main'});
  await assert.rejects(updateStatus(async()=>({ok:true,status:200,json:async()=>({version:'main; reboot'})})),/gültige Versionsnummer/);
});
