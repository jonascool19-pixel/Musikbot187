import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawn } from "node:child_process";
import { once } from "node:events";

async function findPort() {
  const net = await import("node:net");
  const server = net.createServer();
  await new Promise(resolve => server.listen(0, "127.0.0.1", resolve));
  const port = server.address().port;
  await new Promise(resolve => server.close(resolve));
  return port;
}
async function waitFor(url) {
  for (let i = 0; i < 40; i++) {
    try { const r = await fetch(url); if (r.ok) return; } catch {}
    await new Promise(resolve => setTimeout(resolve, 250));
  }
  throw new Error(`Server did not become ready: ${url}`);
}

test("first-run setup requires the installer token and preserves admin/user roles", async () => {
  const dataDir = await mkdtemp(join(tmpdir(), "musikbot187-security-"));
  const port = await findPort();
  const token = "test-setup-token-1234567890";
  const child = spawn(process.execPath, ["../backend/src/server.js"], {
    cwd: new URL("..", import.meta.url),
    env: { ...process.env, MUSIKBOT187_DATA_DIR: dataDir, MUSIKBOT187_SETUP_TOKEN: token, HOST: "127.0.0.1", PORT: String(port) },
    stdio: ["ignore", "pipe", "pipe"]
  });
  let stderr = "";
  child.stderr.on("data", d => { stderr += String(d); });
  try {
    await waitFor(`http://127.0.0.1:${port}/api/health`);
    const setup = await fetch(`http://127.0.0.1:${port}/api/setup`).then(r => r.json());
    assert.equal(setup.initialized, false);
    assert.equal(setup.requiresToken, true);

    const denied = await fetch(`http://127.0.0.1:${port}/api/setup`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ name: "admin", password: "password1" }) });
    assert.equal(denied.status, 403);
    const wrong = await fetch(`http://127.0.0.1:${port}/api/setup`, { method: "POST", headers: { "content-type": "application/json", "X-MusikBot-Setup-Token": "wrong" }, body: JSON.stringify({ name: "admin", password: "password1" }) });
    assert.equal(wrong.status, 403);

    const created = await fetch(`http://127.0.0.1:${port}/api/setup`, { method: "POST", headers: { "content-type": "application/json", "X-MusikBot-Setup-Token": token }, body: JSON.stringify({ name: "admin", password: "password1" }) });
    assert.equal(created.status, 200);
    const session = await created.json();
    assert.equal(session.user.role, "admin");

    const reused = await fetch(`http://127.0.0.1:${port}/api/setup`, { method: "POST", headers: { "content-type": "application/json", "X-MusikBot-Setup-Token": token }, body: JSON.stringify({ name: "second", password: "password2" }) });
    assert.equal(reused.status, 409);

    const createUser = await fetch(`http://127.0.0.1:${port}/api/users`, { method: "POST", headers: { "content-type": "application/json", Authorization: `Bearer ${session.token}` }, body: JSON.stringify({ name: "normal", password: "password2", role: "user" }) });
    assert.equal(createUser.status, 200);
    const createAdmin = await fetch(`http://127.0.0.1:${port}/api/users`, { method: "POST", headers: { "content-type": "application/json", Authorization: `Bearer ${session.token}` }, body: JSON.stringify({ name: "second-admin", password: "password3", role: "admin" }) });
    assert.equal(createAdmin.status, 200);
    const users = await fetch(`http://127.0.0.1:${port}/api/users`, { headers: { Authorization: `Bearer ${session.token}` } }).then(r => r.json());
    assert.equal(users.find(x => x.name === "normal").role, "user");
    assert.equal(users.find(x => x.name === "second-admin").role, "admin");
  } catch (error) {
    error.message += `\nServer stderr:\n${stderr}`;
    throw error;
  } finally {
    child.kill("SIGTERM");
    await Promise.race([once(child, "exit"), new Promise(resolve => setTimeout(resolve, 2000))]);
    await rm(dataDir, { recursive: true, force: true });
  }
});
