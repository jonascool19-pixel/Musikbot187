import test, { after } from "node:test";
import assert from "node:assert/strict";
import net from "node:net";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { spawn } from "node:child_process";

const dataDir = await mkdtemp(join(tmpdir(), "musikbot187-api-"));
const port = await new Promise((resolve, reject) => { const server = net.createServer(); server.listen(0, "127.0.0.1", () => { const p = server.address().port; server.close(() => resolve(p)); }); server.on("error", reject); });
const setupToken = "integration-test-setup-token-123";
const repoRoot = fileURLToPath(new URL("..", import.meta.url));
const child = spawn(process.execPath, ["backend/src/server.js"], { cwd: repoRoot, env: { ...process.env, MUSIKBOT187_DATA_DIR: dataDir, MUSIKBOT187_SETUP_TOKEN: setupToken, HOST: "127.0.0.1", PORT: String(port), MUSIKBOT187_CONTROL_SOCKET: join(dataDir, "control.sock") }, stdio: ["ignore", "pipe", "pipe"] });
let output = "";
child.stdout.on("data", d => { output += String(d); }); child.stderr.on("data", d => { output += String(d); });

async function waitReady() { for (let i = 0; i < 100; i++) { try { const r = await fetch(`http://127.0.0.1:${port}/api/setup`); if (r.ok) return; } catch {} await new Promise(r => setTimeout(r, 100)); } throw new Error(`Backend did not start: ${output}`); }
async function request(path, init = {}) { return fetch(`http://127.0.0.1:${port}${path}`, init); }
await waitReady();

let auth = "";
test("real backend enforces setup, upload authorization, relative file paths and logout", async () => {
  const setup = await request("/api/setup"); assert.equal((await setup.json()).initialized, false);
  const setupResponse = await request("/api/setup", { method: "POST", headers: { "content-type": "application/json", "x-musikbot-setup-token": setupToken }, body: JSON.stringify({ name: "admin", password: "correct-password" }) });
  assert.equal(setupResponse.status, 200); auth = (await setupResponse.json()).token; assert.ok(auth);
  const deniedUpload = await request("/api/music/upload", { method: "POST", headers: { authorization: `Bearer ${auth}` }, body: "not multipart" }); assert.equal(deniedUpload.status, 400);
  const form = new FormData(); form.append("file", new Blob([Buffer.from("ID3test-audio")], { type: "audio/mpeg" }), "test.mp3");
  const upload = await request("/api/music/upload", { method: "POST", headers: { authorization: `Bearer ${auth}` }, body: form }); assert.equal(upload.status, 200);
  const files = await request("/api/files", { headers: { authorization: `Bearer ${auth}` } }); const fileBody = await files.json(); assert.equal(fileBody[0].path, "test.mp3"); assert.equal(JSON.stringify(fileBody).includes(dataDir), false);
  const state = await request("/api/state", { headers: { authorization: `Bearer ${auth}` } }); const stateBody = await state.json(); assert.equal(stateBody.settings.filesDirectory, "music"); assert.equal(JSON.stringify(stateBody).includes(dataDir), false);
  const storage = await request("/api/storage", { headers: { authorization: `Bearer ${auth}` } }); const storageBody = await storage.json(); assert.equal(storageBody.path, "music");
  const link = await request("/api/setup-link"); const linkBody = await link.json(); assert.equal(linkBody.url, "/");
  const outside = await request("/api/settings", { method: "PUT", headers: { authorization: `Bearer ${auth}`, "content-type": "application/json" }, body: JSON.stringify({ filesDirectory: "/tmp" }) }); assert.equal(outside.status, 400);
  const logout = await request("/api/logout", { method: "POST", headers: { authorization: `Bearer ${auth}` } }); assert.equal(logout.status, 200);
  const afterLogout = await request("/api/state", { headers: { authorization: `Bearer ${auth}` } }); assert.equal(afterLogout.status, 401);
});

after(async () => {
  if (child.exitCode === null && !child.signalCode) {
    child.kill("SIGTERM");
    await new Promise(resolve => {
      const timer = setTimeout(() => {
        if (child.exitCode === null && !child.signalCode) child.kill("SIGKILL");
        resolve();
      }, 1500);
      child.once("exit", () => { clearTimeout(timer); resolve(); });
    });
  }
  await rm(dataDir, { recursive: true, force: true });
});
