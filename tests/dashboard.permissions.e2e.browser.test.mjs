import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawn } from 'node:child_process';
import net from 'node:net';
import { setTimeout as sleep } from 'node:timers/promises';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const { chromium } = require('../backend/node_modules/playwright');
const backendDir = join(process.cwd(), 'backend');
const nodeBinary = process.env.npm_node_execpath || 'node';

async function freePort() {
  return new Promise((resolve, reject) => {
    const server = net.createServer();
    server.once('error', reject);
    server.listen(0, '127.0.0.1', () => {
      const address = server.address();
      server.close(error => error ? reject(error) : resolve(address.port));
    });
  });
}

function startServer(dataDir, port, setupToken) {
  return spawn(nodeBinary, ['src/server.js'], {
    cwd: backendDir,
    env: { ...process.env, HOST: '127.0.0.1', PORT: String(port), MUSIKBOT187_DATA_DIR: dataDir, MUSIKBOT187_SETUP_TOKEN: setupToken, MUSIKBOT187_CONTROL_SOCKET: join(dataDir, 'control.sock'), NODE_ENV: 'test' },
    stdio: ['ignore', 'pipe', 'pipe']
  });
}

async function waitForHealth(baseUrl, child) {
  const deadline = Date.now() + 15_000;
  while (Date.now() < deadline) {
    if (child.exitCode !== null) throw new Error(`backend exited with ${child.exitCode}`);
    try { if ((await fetch(`${baseUrl}/api/health`)).ok) return; } catch {}
    await sleep(100);
  }
  throw new Error('backend did not become ready');
}

async function stop(child) {
  if (!child || child.exitCode !== null) return;
  child.kill('SIGTERM');
  await new Promise(resolve => { const timer = setTimeout(resolve, 3000); child.once('exit', () => { clearTimeout(timer); resolve(); }); });
  if (child.exitCode === null) child.kill('SIGKILL');
}

const dataDir = await mkdtemp(join(tmpdir(), 'musikbot187-dashboard-permissions-e2e-'));
const port = await freePort();
const baseUrl = `http://127.0.0.1:${port}`;
const setupToken = 'dashboard-permissions-e2e-token';
let child;
let browser;

try {
  child = startServer(dataDir, port, setupToken);
  await waitForHealth(baseUrl, child);

  const setup = await fetch(`${baseUrl}/api/setup`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'x-musikbot-setup-token': setupToken },
    body: JSON.stringify({ name: 'admin', password: 'admin-password' })
  });
  assert.equal(setup.status, 200);
  const setupBody = await setup.json();

  const createUser = await fetch(`${baseUrl}/api/users`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', Authorization: `Bearer ${setupBody.token}` },
    body: JSON.stringify({ name: 'music-user', password: 'music-password', role: 'user' })
  });
  assert.equal(createUser.status, 200);
  const created = await createUser.json();
  const permissionUpdate = await fetch(`${baseUrl}/api/users/${created.user.id}/permissions`, {
    method: 'PUT',
    headers: { 'content-type': 'application/json', Authorization: `Bearer ${setupBody.token}` },
    body: JSON.stringify({ role: 'user', permissions: ['player.control', 'playlists.manage', 'music.manage'] })
  });
  assert.equal(permissionUpdate.status, 200);

  browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();
  await page.goto(`${baseUrl}/`, { waitUntil: 'networkidle' });
  await page.locator('#user').fill('music-user');
  await page.locator('#pass').fill('music-password');
  await page.getByRole('button', { name: 'Anmelden' }).click();
  await page.locator('[data-tab="player"]').waitFor();

  assert.ok(await page.locator('[data-tab="player"]').count());
  assert.ok(await page.locator('[data-tab="playlists"]').count());
  await page.waitForTimeout(500);
  assert.equal(await page.locator('[data-tab="connections"]:visible').count(), 0);
  assert.equal(await page.locator('[data-tab="system"]:visible').count(), 0);
  assert.equal(await page.locator('[data-tab="admin"]:visible').count(), 0);
  assert.equal(await page.locator('[data-extra-tab="design"]:visible').count(), 0);
  assert.equal(await page.locator('[data-extra-tab="music"]:visible').count(), 1);
  assert.equal(await page.locator('#enhancedOutput:visible').count(), 0);

  const directSettings = await page.evaluate(async () => {
    const session = JSON.parse(sessionStorage.getItem('musikbot187.auth') || 'null');
    const response = await fetch('/api/settings', { method: 'PUT', headers: { 'content-type': 'application/json', Authorization: `Bearer ${session?.token || ''}` }, body: JSON.stringify({ accentColor: '#ff00aa' }) });
    return response.status;
  });
  assert.equal(directSettings, 403);
} finally {
  await browser?.close();
  await stop(child);
  await rm(dataDir, { recursive: true, force: true });
}
