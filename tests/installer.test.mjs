import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {spawnSync} from 'node:child_process';
const p=spawnSync('bash',['-n','install-latest.sh'],{encoding:'utf8'});assert.equal(p.status,0,p.stderr);const s=fs.readFileSync('install-latest.sh','utf8');test('installer avoids old failure patterns',()=>{assert.equal(s.includes('node -e'),false);assert.equal(s.includes('git clone'),false);assert.match(s,/openssl rand -hex 32/)});
