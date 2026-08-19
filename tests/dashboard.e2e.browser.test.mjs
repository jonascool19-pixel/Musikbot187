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
const backendDir = process.cwd();

async function freePort() {
  return new Promise((resolve, reject) => {
    const server = net.createServer();
    server.once('error', reject);
    server.listen(0, '127.0.0.1', () => {
      const address = server.address();
      const port = address && typeof address === 'object' ? address.port : null;
      server.close(error => error ? reject(error) : resolve(port));
    });
  });
}

function startServer(dataDir, port, setupToken) {
  return spawn(process.execPath, ['src/server.js'], {
    cwd: backendDir,
    env: {
      ...process.env,
      HOST: '127.0.0.1',
      PORT: String(port),
      MUSIKBOT187_DATA_DIR: dataDir,
      MUSIKBOT187_SETUP_TOKEN: setupToken,
      MUSIKBOT187_CONTROL_SOCKET: join(dataDir, 'control.sock'),
      NODE_ENV: 'test'
    },
    stdio: ['ignore', 'pipe', 'pipe']
  });
}

async function waitForHealth(baseUrl, child, getOutput) {
  const deadline = Date.now() + 15_000;
  let lastError;
  while (Date.now() < deadline) {
    if (child.exitCode !== null) throw new Error(`backend exited with ${child.exitCode}: ${getOutput()}`);
    try {
      const response = await fetch(`${baseUrl}/api/health`);
      if (response.ok) return;
    } catch (error) { lastError = error; }
    await sleep(100);
  }
  throw lastError || new Error(`backend did not become ready: ${getOutput()}`);
}

async function stop(child) {
  if (!child || child.exitCode !== null) return;
  child.kill('SIGTERM');
  await new Promise(resolve => {
    const timer = setTimeout(resolve, 3000);
    child.once('exit', () => { clearTimeout(timer); resolve(); });
  });
  if (child.exitCode === null) child.kill('SIGKILL');
}

const dataDir = await mkdtemp(join(tmpdir(), 'musikbot187-dashboard-e2e-'));
const port = await freePort();
const setupToken = 'dashboard-e2e-setup-token';
const baseUrl = `http://127.0.0.1:${port}`;
let child;
let browser;
let output = '';

try {
  child = startServer(dataDir, port, setupToken);
  child.stdout.on('data', chunk => { output += String(chunk); });
  child.stderr.on('data', chunk => { output += String(chunk); });
  await waitForHealth(baseUrl, child, () => output);

  const setup = await fetch(`${baseUrl}/api/setup`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'x-musikbot-setup-token': setupToken },
    body: JSON.stringify({ name: 'admin', password: 'dashboard-password' })
  });
  assert.equal(setup.status, 200);

  browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();
  const consoleErrors = [];
  const pageErrors = [];
  page.on('console', message => { if (message.type() === 'error') consoleErrors.push(message.text()); });
  page.on('pageerror', error => pageErrors.push(String(error)));

  await page.goto(`${baseUrl}/`, { waitUntil: 'networkidle' });
  await page.locator('input').nth(0).fill('admin');
  await page.locator('input').nth(1).fill('dashboard-password');
  await page.getByRole('button', { name: 'Anmelden' }).click();
  await page.locator('[data-tab="player"]').waitFor();

  await page.locator('[data-tab="system"]').click();
  await page.getByText('System', { exact: false }).first().waitFor();
  await page.getByText('Netzwerk RX', { exact: false }).first().waitFor();

  await page.locator('[data-tab="connections"]').click();
  await page.getByText('Discord', { exact: false }).first().waitFor();
  await page.getByText('TeamSpeak', { exact: false }).first().waitFor();

  await page.locator('[data-tab="admin"]').click();
  await page.getByText('Benutzer', { exact: false }).first().waitFor();
  await page.locator('#themeSelect').selectOption('purple');
  await page.locator('#accentColor').fill('#ff00aa');
  await page.locator('#themeSave').click();
  await page.locator('#adminVolume').fill('65');
  await page.locator('#adminMode').selectOption('shuffle');
  await page.locator('#adminOutputType').selectOption('none');
  await page.locator('#adminOutputId').fill('');
  await page.locator('#adminNetworkInterface').fill('');
  await page.locator('#filesDirectory').fill('music');
  await page.locator('#settingsSave').click();

  await page.locator('#adminNewUser').fill('e2e-user');
  await page.locator('#adminNewPassword').fill('e2e-password');
  await page.locator('#adminNewRole').selectOption('user');
  await page.locator('#adminAddUser').click();
  const userRow = page.locator('.admin-user-row').filter({ hasText: 'e2e-user' }).first();
  await userRow.waitFor();
  await userRow.getByRole('button', { name: 'Berechtigungen bearbeiten' }).click();
  await userRow.locator('.admin-permission-editor').waitFor();
  await userRow.locator('[data-role]').selectOption('user');
  const musicPermission = userRow.locator('.admin-permission-editor input[value="music.manage"]');
  await musicPermission.check();
  await userRow.locator('[data-save]').click();

  const state = await page.evaluate(async () => {
    const session = JSON.parse(sessionStorage.getItem('musikbot187.auth') || 'null');
    const response = await fetch('/api/state', { headers: { Authorization: `Bearer ${session?.token || ''}` } });
    return response.json();
  });
  assert.equal(state.settings.theme, 'purple');
  assert.equal(state.settings.accentColor, '#ff00aa');
  assert.equal(state.settings.volume, 65);
  assert.equal(state.settings.mode, 'shuffle');
  assert.equal(state.settings.outputType, 'none');
  assert.equal(state.settings.filesDirectory, 'music');

  const users = await page.evaluate(async () => {
    const session = JSON.parse(sessionStorage.getItem('musikbot187.auth') || 'null');
    const response = await fetch('/api/users', { headers: { Authorization: `Bearer ${session?.token || ''}` } });
    return response.json();
  });
  const createdUser = users.find(user => user.name === 'e2e-user');
  assert.ok(createdUser);
  assert.equal(createdUser.role, 'user');
  assert.ok(createdUser.permissions.includes('music.manage'));

  assert.equal(consoleErrors.length, 0, `Browser console errors: ${consoleErrors.join(' | ')}`);
  assert.equal(pageErrors.length, 0, `Browser page errors: ${pageErrors.join(' | ')}`);
} finally {
  await browser?.close();
  await stop(child);
  await rm(dataDir, { recursive: true, force: true });
}
