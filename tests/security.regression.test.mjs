import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawn } from "node:child_process";
import { once } from "node:events";
import http from "node:http";

async function findPort() {
  const net = await import("node:net");
  const server = net.createServer();
  await new Promise(resolve => server.listen(0, "127.0.0.1", resolve));
  const port = server.address().port;
  await new Promise(resolve => server.close(resolve));
  return port;
}
function request(port, path, { method = "GET", headers = {}, body = undefined } = {}) {
  return new Promise((resolve, reject) => {
    const data = body === undefined ? null : JSON.stringify(body);
    const req = http.request({ hostname: "127.0.0.1", port, path, method, agent: false, headers: { Connection: "close", ...(data ? { "content-type": "application/json", "content-length": Buffer.byteLength(data) } : {}), ...headers } }, res => {
      let text = "";
      res.setEncoding("utf8");
      res.on("data", chunk => { text += chunk; });
      res.on("end", () => { let parsed = {}; try { parsed = JSON.parse(text || "{}"); } catch {} resolve({ status: res.statusCode, body: parsed }); });
    });
    req.on("error", reject);
    req.setTimeout(5000, () => req.destroy(new Error("HTTP test timeout")));
    if (data) req.write(data);
    req.end();
  });
}
async function waitFor(port) {
  for (let i = 0; i < 40; i++) {
    try { const r = await request(port, "/api/health"); if (r.status === 200) return; } catch {}
    await new Promise(resolve => setTimeout(resolve, 250));
  }
  throw new Error(`Server did not become ready on ${port}`);
}

test("first-run setup requires the installer token and preserves admin/user roles", async () => {
  const dataDir = await mkdtemp(join(tmpdir(), "musikbot187-security-"));
  const port = await findPort();
  const token = "test-setup-token-1234567890";
  const child = spawn(process.execPath, ["backend/src/server.js"], {
    cwd: new URL("..", import.meta.url),
    env: { ...process.env, MUSIKBOT187_DATA_DIR: dataDir, MUSIKBOT187_SETUP_TOKEN: token, HOST: "127.0.0.1", PORT: String(port) },
    stdio: ["ignore", "pipe", "pipe"]
  });
  let stderr = "";
  child.stderr.on("data", d => { stderr += String(d); });
  try {
    await waitFor(port);
    const setup = await request(port, "/api/setup");
    assert.equal(setup.status, 200);
    assert.equal(setup.body.initialized, false);
    assert.equal(setup.body.requiresToken, true);

    const denied = await request(port, "/api/setup", { method: "POST", body: { name: "admin", password: "password1" } });
    assert.equal(denied.status, 403);
    const wrong = await request(port, "/api/setup", { method: "POST", headers: { "X-MusikBot-Setup-Token": "wrong" }, body: { name: "admin", password: "password1" } });
    assert.equal(wrong.status, 403);

    const created = await request(port, "/api/setup", { method: "POST", headers: { "X-MusikBot-Setup-Token": token }, body: { name: "admin", password: "password1" } });
    assert.equal(created.status, 200);
    assert.equal(created.body.user.role, "admin");

    const reused = await request(port, "/api/setup", { method: "POST", headers: { "X-MusikBot-Setup-Token": token }, body: { name: "second", password: "password2" } });
    assert.equal(reused.status, 409);

    const auth = { Authorization: `Bearer ${created.body.token}` };
    const createUser = await request(port, "/api/users", { method: "POST", headers: auth, body: { name: "normal", password: "password2", role: "user" } });
    assert.equal(createUser.status, 200);
    const createAdmin = await request(port, "/api/users", { method: "POST", headers: auth, body: { name: "second-admin", password: "password3", role: "admin" } });
    assert.equal(createAdmin.status, 200);
    const users = await request(port, "/api/users", { headers: auth });
    assert.equal(users.status, 200);
    assert.equal(users.body.find(x => x.name === "normal").role, "user");
    assert.equal(users.body.find(x => x.name === "second-admin").role, "admin");
  } catch (error) {
    error.message += `\nServer stderr:\n${stderr}`;
    throw error;
  } finally {
    child.kill("SIGTERM");
    await Promise.race([once(child, "exit"), new Promise(resolve => setTimeout(resolve, 2000))]);
    await rm(dataDir, { recursive: true, force: true });
  }
});
