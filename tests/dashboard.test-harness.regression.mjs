import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';

const root = join(process.cwd(), '..');
const read = path => readFile(join(root, path), 'utf8');

test('dashboard browser harness targets the current frontend and server contract', async () => {
  const index = await read('frontend/index.html');
  const browser = await read('tests/dashboard.browser.test.mjs');
  const e2e = await read('tests/dashboard.e2e.browser.test.mjs');
  const permissions = await read('tests/dashboard.permissions.e2e.browser.test.mjs');
  const smoke = await read('tests/smoke.test.mjs');

  assert.ok(index.includes('/music-ui-auth.js'), 'index.html must load the auth-aware music UI');
  assert.ok(!index.includes('/music-ui.js'), 'index.html must not load the retired legacy music UI');

  for (const [name, source] of [['dashboard.browser', browser], ['dashboard.e2e', e2e], ['dashboard.permissions.e2e', permissions]]) {
    assert.doesNotMatch(source, /process\.execPath|npm_node_execpath/, `${name} still depends on npm/process executable-path internals`);
    assert.doesNotMatch(source, /backend[\\/]backend/, `${name} still contains the old backend/backend working-directory bug`);
  }

  assert.ok(e2e.includes("existsSync('/usr/bin/node')"), 'dashboard E2E must use the runner-safe Node fallback');
  assert.ok(e2e.includes('backend spawn failed:'), 'dashboard E2E must surface child-process spawn failures');
  assert.ok(permissions.includes("existsSync('/usr/bin/node')"), 'permission E2E must use the runner-safe Node fallback');
  assert.ok(browser.includes('/music-ui-auth.js') || browser.includes('music-ui-auth'), 'browser test must target the current auth-aware music UI');

  assert.doesNotMatch(smoke, /removeMusicTab/, 'smoke test still expects the retired removeMusicTab contract');
  assert.ok(smoke.includes('__musikbotSyncMusicTab'), 'smoke test must verify the current music auth lifecycle');
});
