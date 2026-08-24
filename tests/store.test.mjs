import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {Store} from '../backend/src/store.js';

test('a failed state write does not poison all later saves',async t=>{const dir=await fs.mkdtemp(path.join(os.tmpdir(),'musikbot-store-'));t.after(()=>fs.rm(dir,{recursive:true,force:true}));const blocked=path.join(dir,'blocked');await fs.writeFile(blocked,'not a directory');const store=new Store(path.join(blocked,'state.json'));await assert.rejects(store.save());store.file=path.join(dir,'state.json');store.data.settings.botName='Nach Fehler wieder gespeichert';await store.save();const saved=JSON.parse(await fs.readFile(store.file,'utf8'));assert.equal(saved.settings.botName,'Nach Fehler wieder gespeichert');});
