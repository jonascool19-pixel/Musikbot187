import test from 'node:test';
import assert from 'node:assert/strict';
import { safeResolve, validateUsername } from '../backend/src/security.js';

test('username validation',()=>{assert.equal(validateUsername('admin_1'),true);assert.equal(validateUsername('x'),false)});
test('path traversal blocked',()=>{assert.throws(()=>safeResolve('/var/lib/musikbot187/music','../../etc/passwd'))});
