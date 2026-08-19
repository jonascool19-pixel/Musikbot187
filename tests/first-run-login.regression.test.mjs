import test from 'node:test';
import assert from 'node:assert/strict';
import net from 'node:net';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawn } from 'node:child_process';
import { setTimeout as sleep } from 'node:timers/promises';

const backendDir = join(process.cwd(), 'backend');

async function getFreePort() {
  return new Promise((resolve, reject) => {
    const server = net.createServer();
    server.once('error', reject);
    server.listen(0, '127.0.0.1', () => {
      const address = server.address();
      const port = typeof address === 'object' && address ? address.port : null;
      server.close(error => error ? reject(error) : resolve(port));
    });
  });
}

function startServer(dataDir, port, setupToken) {
  return spawn(process.env.NODE_BINARY || process.execPath, ['src/server.js'], {
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

function captureOutput(child) {
  let output = '';
  child.stdout.on('data', chunk => { output += String(chunk); });
  child.stderr.on('data', chunk => { output += String(chunk); });
  return () => output;
}

async function waitForHealth(baseUrl, child, getOutput) {
  const deadline = Date.now() + 10_000;
  let lastError;
  while (Date.now() < deadline) {
    if (child.exitCode !== null) {
      throw new Error(`server exited early with ${child.exitCode}: ${getOutput()}`);
    }
    try {
      const response = await fetch(`${baseUrl}/api/health`);
      if (response.ok) return;
    } catch (error) {
      lastError = error;
    }
    await sleep(100);
  }
  throw lastError || new Error(`server did not become ready: ${getOutput()}`);
}

async function stopServer(child) {
  if (!child || child.exitCode !== null) return;
  child.kill('SIGTERM');
  await new Promise(resolve => {
    const timer = setTimeout(resolve, 2_000);
    child.once('exit', () => { clearTimeout(timer); resolve(); });
  });
  if (child.exitCode === null) child.kill('SIGKILL');
}

async function postJson(url, body, headers = {}) {
  return fetch(url, {
    method: 'POST',
    headers: { 'content-type': 'application/json', ...headers },
    body: JSON.stringify(body)
  });
}

test('first-run setup credentials remain usable through a fresh login and restart', async () => {
  const dataDir = await mkdtemp(join(tmpdir(), 'musikbot187-first-login-'));
  const port = await getFreePort();
  const token = 'setup-token-first-login-regression';
  const baseUrl = `http://127.0.0.1:${port}`;
  let child;
  let child2;

  try {
    child = startServer(dataDir, port, token);
    const getOutput = captureOutput(child);
    await waitForHealth(baseUrl, child, getOutput);

    const setupState = await fetch(`${baseUrl}/api/setup`);
    assert.equal(setupState.status, 200);
    assert.deepEqual(await setupState.json(), { initialized: false, requiresToken: true });

    const setup = await postJson(`${baseUrl}/api/setup`, { name: 'admin', password: 'correct-password' }, {
      'x-musikbot-setup-token': token
    });
    assert.equal(setup.status, 200);
    const setupBody = await setup.json();
    assert.equal(setupBody.user.name, 'admin');
    assert.equal(setupBody.user.role, 'admin');
    assert.ok(setupBody.token);

    const login = await postJson(`${baseUrl}/api/login`, { name: 'admin', password: 'correct-password' });
    assert.equal(login.status, 200);
    const loginBody = await login.json();
    assert.equal(loginBody.user.name, 'admin');
    assert.equal(loginBody.user.role, 'admin');
    assert.ok(loginBody.token);

    await stopServer(child);
    child = null;

    child2 = startServer(dataDir, port, token);
    const getOutput2 = captureOutput(child2);
    await waitForHealth(baseUrl, child2, getOutput2);

    const restartSetupState = await fetch(`${baseUrl}/api/setup`);
    assert.equal(restartSetupState.status, 200);
    assert.deepEqual(await restartSetupState.json(), { initialized: true, requiresToken: false });

    const restartLogin = await postJson(`${baseUrl}/api/login`, { name: 'admin', password: 'correct-password' });
    assert.equal(restartLogin.status, 200);
    const restartBody = await restartLogin.json();
    assert.equal(restartBody.user.name, 'admin');
    assert.equal(restartBody.user.role, 'admin');
    assert.ok(restartBody.token);
  } finally {
    await stopServer(child);
    await stopServer(child2);
    await rm(dataDir, { recursive: true, force: true });
  }
});
