import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { setTimeout as sleep } from 'node:timers/promises';

const backendDir = path.resolve(process.cwd(), 'backend');

async function waitForHealth(baseUrl, child) {
  const deadline = Date.now() + 10_000;
  let lastError;
  while (Date.now() < deadline) {
    if (child.exitCode !== null) throw new Error(`server exited early with ${child.exitCode}`);
    try {
      const response = await fetch(`${baseUrl}/api/health`);
      if (response.ok) return;
    } catch (error) {
      lastError = error;
    }
    await sleep(100);
  }
  throw lastError || new Error('server did not become ready');
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
      MUSIKBOT187_CONTROL_SOCKET: path.join(dataDir, 'control.sock'),
      NODE_ENV: 'test'
    },
    stdio: ['ignore', 'pipe', 'pipe']
  });
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
  const dataDir = await mkdtemp(path.join(tmpdir(), 'musikbot187-first-login-'));
  const port = 31_000 + Math.floor(Math.random() * 1_000);
  const token = 'setup-token-first-login-regression';
  const baseUrl = `http://127.0.0.1:${port}`;
  let child;
  let child2;
  try {
    child = startServer(dataDir, port, token);
    await waitForHealth(baseUrl, child);

    const setup = await postJson(`${baseUrl}/api/setup`, { name: 'admin', password: 'correct-password' }, {
      'x-musikbot-setup-token': token
    });
    assert.equal(setup.status, 200);
    const setupBody = await setup.json();
    assert.equal(setupBody.user.role, 'admin');
    assert.ok(setupBody.token);

    const login = await postJson(`${baseUrl}/api/login`, { name: 'admin', password: 'correct-password' });
    assert.equal(login.status, 200);
    const loginBody = await login.json();
    assert.equal(loginBody.user.role, 'admin');
    assert.ok(loginBody.token);

    const usernameAlias = await postJson(`${baseUrl}/api/login`, { username: 'admin', password: 'correct-password' });
    assert.equal(usernameAlias.status, 200);

    await stopServer(child);
    child = null;

    child2 = startServer(dataDir, port, token);
    await waitForHealth(baseUrl, child2);
    const restartLogin = await postJson(`${baseUrl}/api/login`, { name: 'admin', password: 'correct-password' });
    assert.equal(restartLogin.status, 200);
    const restartBody = await restartLogin.json();
    assert.equal(restartBody.user.role, 'admin');
    assert.ok(restartBody.token);
  } finally {
    await stopServer(child);
    await stopServer(child2);
    await rm(dataDir, { recursive: true, force: true });
  }
});
