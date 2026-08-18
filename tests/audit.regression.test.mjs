import test from "node:test";
import assert from "node:assert/strict";
import path from "node:path";
import { readFile } from "node:fs/promises";
import { encryptSecret, decryptSecret } from "../backend/src/secrets.js";
import { validateResolvedMediaUrl } from "../backend/src/source-policy.js";
import { EgressProxy } from "../backend/src/egress-proxy.js";

const root = path.resolve(path.dirname(new URL(import.meta.url).pathname), "..");

test("secrets are encrypted at rest and decrypt losslessly", async () => { const plain = "ts3-super-secret-123"; const encrypted = await encryptSecret(plain); assert.notEqual(encrypted, plain); assert.match(encrypted, /^enc\$/); assert.equal(await decryptSecret(encrypted), plain); });

test("egress proxy blocks loopback before a socket is opened", async () => { const proxy = await new EgressProxy().start(); try { const response = await fetch(`${proxy.url}/http://127.0.0.1:1/test`); assert.equal(response.status, 502); } finally { await proxy.stop(); } });

test("source policy rejects reserved final media targets", async () => { await assert.rejects(() => validateResolvedMediaUrl("http://127.0.0.1:3000/audio"), /nicht erlaubtes Netzwerkziel/); });

test("server and player route external playback through bounded policy paths", async () => { const server = await readFile(path.join(root, "backend/src/server.js"), "utf8"); const player = await readFile(path.join(root, "backend/src/player.js"), "utf8"); assert.match(server, /app\.post\("\/api\/logout"/); assert.match(server, /bodyLimit: MAX_JSON_BODY/); assert.match(server, /consumeLimit\(`search:/); assert.match(server, /await encryptSecret\(String\(x\.password\)/); assert.match(server, /path: x\.name/); assert.match(player, /validateResolvedMediaUrl\(url\)/); assert.match(player, /-http_proxy/); assert.match(player, /ensureEgressProxy\(\)/); });

test("installer has a pinned binary checksum and isolated service", async () => { const installer = await readFile(path.join(root, "install-stable.sh"), "utf8"); assert.match(installer, /releases\/download\//); assert.match(installer, /sha256sum -c/); assert.match(installer, /NoNewPrivileges=true/); assert.match(installer, /CapabilityBoundingSet=/); assert.doesNotMatch(installer, /NOPASSWD/); assert.doesNotMatch(installer, /sudoers\.d\/musikbot187/); });

test("frontend has one central fetch wrapper and lifecycle cleanup", async () => { const files = ["frontend/fetch-layer.js", "frontend/app.js", "frontend/enhancements.js", "frontend/errorlog.js", "frontend/music-ui.js"]; let wrappers = 0; for (const file of files) wrappers += (await readFile(path.join(root, file), "utf8")).match(/window\.fetch\s*=\s*async/g)?.length || 0; assert.equal(wrappers, 1); const html = await readFile(path.join(root, "frontend/index.html"), "utf8"); assert.match(html, /fetch-layer\.js/); const cleanup = await readFile(path.join(root, "frontend/system-cleanup.js"), "utf8"); assert.match(cleanup, /window\.setInterval/); });

test("Discord reconnect guard is live and TS3 reconnect keeps configuration", async () => { const discord = await readFile(path.join(root, "backend/src/discord.js"), "utf8"); const ts3 = await readFile(path.join(root, "backend/src/ts3.js"), "utf8"); assert.match(discord, /if \(!runtime \|\| runtime\.reconnectTimer/); assert.doesNotMatch(discord, /runtime\.map/); assert.match(discord, /scheduleGatewayReconnect\(runtime\)/); assert.match(ts3, /disconnect\(key, true\)/); assert.match(ts3, /scheduleReconnect\(key\)/); });
