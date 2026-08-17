import test from "node:test";
import assert from "node:assert/strict";
import path from "node:path";
import { mkdtemp, readFile, writeFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { encryptSecret, decryptSecret } from "../backend/src/secrets.js";
import { validateResolvedMediaUrl } from "../backend/src/source-policy.js";

const root = path.resolve(path.dirname(new URL(import.meta.url).pathname), "..");

test("secrets are encrypted at rest and decrypt losslessly", async () => {
  const plain = "ts3-super-secret-123";
  const encrypted = await encryptSecret(plain);
  assert.notEqual(encrypted, plain);
  assert.match(encrypted, /^enc\$/);
  assert.equal(await decryptSecret(encrypted), plain);
});

test("source policy exposes a dedicated final media URL validation path", async () => {
  await assert.rejects(() => validateResolvedMediaUrl("http://127.0.0.1:3000/audio"), /nicht erlaubtes Netzwerkziel/);
});

test("server no longer exposes absolute file paths and contains session revoke endpoint", async () => {
  const server = await readFile(path.join(root, "backend/src/server.js"), "utf8");
  assert.match(server, /app\.post\("\/api\/logout"/);
  assert.match(server, /\.map\(x => \(\{ name: x\.name, directory: false, path: x\.name \}\)\)/);
  assert.match(server, /bodyLimit: MAX_JSON_BODY/);
  assert.match(server, /origin: CORS_ORIGINS\.length \? CORS_ORIGINS : false/);
  assert.match(server, /consumeLimit\(`search:/);
  assert.match(server, /await encryptSecret\(String\(x\.password\)/);
});

test("installer is sandboxed and no longer grants bot-side sudo", async () => {
  const installer = await readFile(path.join(root, "install-stable.sh"), "utf8");
  assert.match(installer, /NoNewPrivileges=true/);
  assert.match(installer, /CapabilityBoundingSet=/);
  assert.doesNotMatch(installer, /NOPASSWD/);
  assert.doesNotMatch(installer, /sudoers\.d\/musikbot187/);
  assert.match(installer, /yt-dlp\/releases\/download\//);
  assert.match(installer, /sha256sum -c/);
});

test("frontend has exactly one central fetch wrapper", async () => {
  const files = ["frontend/fetch-layer.js", "frontend/app.js", "frontend/enhancements.js", "frontend/errorlog.js", "frontend/music-ui.js"];
  let wrappers = 0;
  for (const file of files) { const text = await readFile(path.join(root, file), "utf8"); wrappers += (text.match(/window\.fetch\s*=\s*async/g) || []).length; }
  assert.equal(wrappers, 1);
  const html = await readFile(path.join(root, "frontend/index.html"), "utf8"); assert.match(html, /fetch-layer\.js/);
});

test("Discord reconnect implementation does not contain the disabled guard regression", async () => {
  const text = await readFile(path.join(root, "backend/src/discord.js"), "utf8");
  assert.match(text, /if \(!runtime \|\| runtime\.reconnectTimer/);
  assert.doesNotMatch(text, /runtime\.map/);
  assert.match(text, /scheduleGatewayReconnect\(runtime\)/);
});

test("cleanup hooks are used by long-lived frontend modules", async () => {
  const [enhancements, errorlog, music] = await Promise.all(["frontend/enhancements.js", "frontend/errorlog.js", "frontend/music-ui.js"].map(file => readFile(path.join(root, file), "utf8")));
  assert.match(enhancements, /__musikbotRegisterCleanup/);
  assert.match(errorlog, /__musikbotRegisterCleanup/);
  assert.match(music, /__musikbotRegisterCleanup/);
});

test("installer and service configuration keep data writes inside DATA", async () => {
  const installer = await readFile(path.join(root, "install-stable.sh"), "utf8");
  assert.match(installer, /ReadWritePaths=\$DATA/);
  assert.match(installer, /MUSIKBOT187_CONTROL_SOCKET/);
  assert.match(installer, /Requires=musikbot187-control\.service/);
});

await rm(await mkdtemp(path.join(tmpdir(), "musikbot187-audit-")), { recursive: true, force: true });
