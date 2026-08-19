import assert from "node:assert/strict";
import http from "node:http";
import { readFile } from "node:fs/promises";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";
const require = createRequire(import.meta.url); const { chromium } = require("../backend/node_modules/playwright");

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const frontend = join(root, "frontend");
const seen = [];
const requestBodies = [];
const state = { settings: { theme: "dark", accentColor: "#0b69b3", outputType: "discord", outputId: "d1", filesDirectory: "music" }, current: { title: "Browser Test Track" }, paused: false, volume: 80, mode: "queue", queue: [{ id: "q1", title: "Queued Track", url: "http://example.test/audio.mp3", source: "radio" }] };
const playlists = [{ id: "p1", name: "Test Playlist", items: [{ id: "pitem1", title: "Playlist Track", url: "http://example.test/p.mp3", source: "radio" }] }];
const discord = [{ id: "d1", name: "Test Discord", enabled: true, guildId: "g1", channelId: "v1", clientId: "123456789012345678", messageContentIntent: false, connected: true, voiceConnected: false }];
const ts3 = [{ id: "t1", name: "Test TS3", host: "127.0.0.1", port: 9987, channel: "Music", connected: false }];
const files = [{ name: "test.mp3", path: "test.mp3", size: 1234 }];
let users = [{ id: "u1", name: "admin", role: "admin", permissions: [] }];

function json(res, body, status = 200) { const data = JSON.stringify(body); res.writeHead(status, { "content-type": "application/json; charset=utf-8", "content-length": Buffer.byteLength(data) }); res.end(data); }

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, "http://127.0.0.1");
  if (url.pathname.startsWith("/api/")) {
    seen.push(`${req.method} ${url.pathname}`);
    let body = "";
    req.on("data", chunk => { body += String(chunk); });
    await new Promise(resolve => req.on("end", resolve));
    if (body) requestBodies.push({ method: req.method, path: url.pathname, body });
    if (url.pathname === "/api/setup" && req.method === "GET") return json(res, { initialized: true, requiresToken: false });
    if (url.pathname === "/api/login" && req.method === "POST") return json(res, { token: "browser-test-token", user: { name: "Browser Test", role: "admin" } });
    if (url.pathname === "/api/logout" && req.method === "POST") return json(res, { ok: true });
    if (url.pathname === "/api/state") return json(res, state);
    if (url.pathname === "/api/search") return json(res, { youtube: [{ id: "y1", title: "YouTube Result", url: "https://youtube.com/watch?v=test", source: "youtube", duration: "3:00" }], radio: [], spotify: [] });
    if (url.pathname === "/api/play" && req.method === "POST") return json(res, state);
    if (url.pathname === "/api/playlists") return json(res, playlists);
    if (url.pathname === "/api/discord") return json(res, discord);
    if (url.pathname === "/api/ts3") return json(res, ts3);
    if (url.pathname === "/api/system") return json(res, { hostname: "browser-test", platform: "linux", arch: "x64", node: "v22", uptime: 123, cpus: 4, cpuPercent: 25, load: [1, .5, .2], memory: { total: 1000, free: 400, used: 600, percent: 60 } });
    if (url.pathname === "/api/storage") return json(res, { exists: true, directory: true, path: "music", disk: { total: 10000, used: 3000, free: 7000, percent: 30 } });
    if (url.pathname === "/api/network") return json(res, { interfaces: [], totalRxBytes: 0, totalTxBytes: 0, rxBytesPerSecond: 0, txBytesPerSecond: 0, rxUtilizationPercent: 1.25, txUtilizationPercent: .75, totalUtilizationPercent: 2, measuredSeconds: 1 });
    if (url.pathname === "/api/files") return json(res, files);
    if (url.pathname === "/api/music/upload" && req.method === "POST") return json(res, { ok: true, file: files[0] });
    if (url.pathname === "/api/health") return json(res, { ok: true });
    if (url.pathname === "/api/settings" && req.method === "PUT") return json(res, { ...state.settings });
    if (url.pathname === "/api/users" && req.method === "GET") return json(res, users);
    if (url.pathname === "/api/users" && req.method === "POST") { const payload = JSON.parse(body || "{}"); const created = { id: `u${users.length + 1}`, name: payload.name, role: payload.role === "admin" ? "admin" : "user", permissions: payload.permissions || [] }; users.push(created); return json(res, { ok: true, user: created }); }
    if (url.pathname === "/api/diagnostics") return json(res, [{ time: new Date().toISOString(), level: "error", source: "browser-test", message: "Smoke test diagnostic" }]);
    if (url.pathname === "/api/control") return json(res, { ok: true });
    return json(res, {});
  }
  const file = url.pathname === "/" ? "index.html" : url.pathname.slice(1);
  const safe = join(frontend, file);
  if (!safe.startsWith(frontend)) return json(res, { error: "forbidden" }, 403);
  try { const data = await readFile(safe); const type = file.endsWith(".html") ? "text/html" : file.endsWith(".js") ? "text/javascript" : "text/css"; res.writeHead(200, { "content-type": `${type}; charset=utf-8` }); res.end(data); } catch { res.writeHead(404); res.end("not found"); }
});

const port = await new Promise(resolve => server.listen(0, "127.0.0.1", () => resolve(server.address().port)));
const browser = await chromium.launch({ headless: true });
const page = await browser.newPage();
const consoleErrors = [];
const pageErrors = [];
page.on("console", message => { if (message.type() === "error") consoleErrors.push(message.text()); });
page.on("pageerror", error => pageErrors.push(String(error)));

try {
  await page.goto(`http://127.0.0.1:${port}/`, { waitUntil: "networkidle" });
  const inputs = page.locator("input");
  assert.equal(await inputs.count(), 2);
  await inputs.nth(0).fill("admin");
  await inputs.nth(1).fill("password");
  await page.getByRole("button", { name: "Anmelden" }).click();

  await page.locator('[data-tab="playlists"]').click();
  await assertText(page, "Test Playlist");

  await page.locator('[data-tab="system"]').click();
  await assertText(page, "System");
  await assertText(page, "25.0 %");
  await assertText(page, "Netzwerk RX");
  await assertText(page, "Netzwerk TX");

  await page.locator('[data-tab="connections"]').click();
  await assertText(page, "Test Discord");
  await assertText(page, "Test TS3");

  await page.locator('[data-tab="admin"]').click();
  await assertText(page, "Benutzer");
  await assertText(page, "Allgemeine Einstellungen");
  await assertText(page, "Diagnose");
  await assertText(page, "Design");
  await page.locator("#diagnosticsToggle").click();
  await assertText(page, "Smoke test diagnostic");
  await page.locator("#adminNewUser").fill("testuser");
  await page.locator("#adminNewPassword").fill("password");
  await page.locator("#adminNewRole").selectOption("user");
  await page.locator("#adminAddUser").click();
  const userCreate = requestBodies.find(x => x.method === "POST" && x.path === "/api/users");
  assert.ok(userCreate);
  assert.equal(JSON.parse(userCreate.body).role, "user");
  await page.locator("#themeSelect").selectOption("ocean");
  await page.locator("#accentColor").fill("#ff00aa");
  await page.locator("#themeSave").click();

  await page.locator('[data-extra-tab="music"]').click();
  await assertText(page, "Musik");
  await assertText(page, "test.mp3");

  await page.locator('[data-tab="player"]').click();
  await page.getByPlaceholder(/Titel, Interpret/).fill("test track");
  await page.getByRole("button", { name: /Suchen/ }).click();
  await assertText(page, "YouTube Result");
  await page.getByRole("button", { name: /Abspielen/ }).last().click();
  await page.waitForTimeout(100);
  const playRequests = requestBodies.filter(x => x.method === "POST" && x.path === "/api/play");
  assert.ok(playRequests.length >= 1);
  assert.equal(JSON.parse(playRequests.at(-1).body).playNow, true);
  await assertText(page, "YouTube Result");

  await page.getByRole("button", { name: /Abmelden/ }).click();
  await page.waitForTimeout(100);
  assert.ok(seen.includes("POST /api/logout"));
  assert.equal(consoleErrors.length, 0, `Browser console errors: ${consoleErrors.join(" | ")}`);
  assert.equal(pageErrors.length, 0, `Browser page errors: ${pageErrors.join(" | ")}`);
} finally {
  await browser.close();
  await new Promise(resolve => server.close(resolve));
}

async function assertText(page, text) { await page.getByText(text, { exact: false }).first().waitFor({ state: "visible" }); }
