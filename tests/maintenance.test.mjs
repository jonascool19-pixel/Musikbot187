import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {cleanupStaleUploads,maintenanceDue,maintenanceMoment} from '../backend/src/maintenance.js';

test('daily maintenance follows Europe/Berlin local time and runs only once per date',()=>{const now=new Date('2026-08-23T02:30:15.000Z'),settings={maintenanceEnabled:true,maintenanceTime:'04:30',maintenanceTimezone:'Europe/Berlin',maintenanceLastRun:''};assert.deepEqual(maintenanceMoment(now,'Europe/Berlin'),{date:'2026-08-23',time:'04:30'});assert.deepEqual(maintenanceDue(settings,now),{date:'2026-08-23',time:'04:30'});settings.maintenanceLastRun='2026-08-23';assert.equal(maintenanceDue(settings,now),null);settings.maintenanceEnabled=false;settings.maintenanceLastRun='';assert.equal(maintenanceDue(settings,now),null);});

test('startup cleanup removes only stale interrupted uploads',async t=>{const dir=await fs.mkdtemp(path.join(os.tmpdir(),'musikbot187-maintenance-'));t.after(()=>fs.rm(dir,{recursive:true,force:true}));const stale=path.join(dir,'stale.mp3.upload'),fresh=path.join(dir,'fresh.mp3.upload'),music=path.join(dir,'keep.mp3');await Promise.all([fs.writeFile(stale,'x'),fs.writeFile(fresh,'x'),fs.writeFile(music,'x')]);const now=Date.now();await fs.utimes(stale,new Date(now-7200000),new Date(now-7200000));assert.equal(await cleanupStaleUploads(dir,{now,maxAgeMs:3600000}),1);await assert.rejects(fs.stat(stale),error=>error.code==='ENOENT');assert.ok((await fs.stat(fresh)).isFile());assert.ok((await fs.stat(music)).isFile());});
