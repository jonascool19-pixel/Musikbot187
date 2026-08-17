import assert from "node:assert/strict";
import http from "node:http";
import { readFile } from "node:fs/promises";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright";

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const frontend = join(root, "frontend");
const state = {
  settings: { theme: "dark", outputType: "discord" },
  current: { title: "Browser Test Track" }, paused: false, volume: 80, mode: "queue",
  queue: [{ id: "q1", title: "Queued Track", url: "http://example.test/audio.mp3", source: "radio" }]
};
const playlists = [{ id: "p1", name: "Test Playlist", items: [{ id: "pitem1", title: "Playlist Track", url: "http://example.test/p.mp3", source: "radio" }] }];
const discord = [{ id: "d1", name: "Test Discord", enabled: true, guildId: "g1", channelId: "v1", clientId: "c1" }];
const ts3 = [{ id: "t1", name: "Test TS3", host: "127.0.0.1", port: 9987, channel: "Music", connected: false }];

function json(res, body, status = 200) {
  const data = JSON.stringify(body);
  res.writeHead(status, { "content-type": "application/json; charset=utf-8", "content-length": Buffer.byteLength(data) });
  res.end(data);
}

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, "http://127.0.0.1");
  if (url.pathname.startsWith("/api/")) {
    if (url.pathname === "/api/setup/status") return json(res, { setup: false });
    if (url.pathname === "/api/login") return json(res, { token: "browser-test-token", user: { name: "Browser Test", role: "admin" } });
    if (url.pathname === "/api/state") return json(res, state);
    if (url.pathname === "/api/search") return json(res, { youtube: [{ id: "y1", title: "YouTube Result", url: "https://youtube.com/watch?v=test", source: "youtube", duration: "3:00" }], radio: [{ id: "r1", title: "Radio Result", url: "http://example.test/radio", source: "radio" }], spotify: [{ id: "s1", title: "Spotify Result", url: "https://youtube.com/watch?v=spotify", source: "spotify", artist: "Artist" }] });
    if (url.pathname === "/api/playlists") return json(res, playlists);
    if (url.pathname === "/api/discord") return json(res, discord);
    if (url.pathname === "/api/ts3") return json(res, ts3);
    if (url.pathname === "/api/discord/d1/guilds") return json(res, [{ id: "g1", name: "Test Guild" }]);
    if (url.pathname === "/api/discord/d1/channels") return json(res, [{ id: "v1", name: "Music", type: 2 }]);
    if (url.pathname === "/api/system") return json(res, { hostname: "browser-test", platform: "linux", arch: "x64", node: "v22", uptime: 123, cpus: 4, cpuPercent: 25, loadavg: [1, 0.5, 0.2], memory: { total: 1000, free: 400, used: 600, percent: 60 } });
    if (url.pathname === "/api/storage") return json(res, { exists: true, directory: true, disk: { total: 10000, used: 3000, free: 7000, percent: 30 } });
    if (url.pathname === "/api/network") return json(res, { interfaces: {} });
    if (url.pathname === "/api/files") return json(res, [{ name: "test.mp3", path: "test.mp3", size: 1234 }]);
    if (url.pathname === "/api/settings") return json(res, { volume: 80, mode: "queue", outputType: "discord", outputId: "d1", theme: "dark", musicDir: "/music", networkInterface: "" });
    if (url.pathname === "/api/users") return json(res, [{ id: "u1", name: "admin", role: "admin" }]);
    if (url.pathname === "/api/diagnostics") return json(res, [{ time: new Date().toISOString(), level: "error", source: "browser-test", message: "Smoke test diagnostic" }]);
    if (url.pathname === "/api/control") return json(res, { ok: true });
    if (url.pathname === "/api/spotify") return json(res, { configured: false });
    return json(res, {});
  }
  const file = url.pathname === "/" ? "index.html" : url.pathname.slice(1);
  const safe = join(frontend, file);
  if (!safe.startsWith(frontend)) return json(res, { error: "forbidden" }, 403);
  try {
    const data = await readFile(safe);
    const type = file.endsWith(".html") ? "text/html" : file.endsWith(".js") ? "text/javascript" : "text/css";
    res.writeHead(200, { "content-type": `${type}; charset=utf-8` }); res.end(data);
  } catch { res.writeHead(404); res.end("not found"); }
});

const port = await new Promise(resolve => server.listen(0, "127.0.0.1", () => resolve(server.address().port)));
const browser = await chromium.launch({ headless: true });
const page = await browser.newPage();
const consoleErrors = [], pageErrors = [];
page.on("console", msg => { if (msg.type() === "error") consoleErrors.push(msg.text()); });
page.on("pageerror", err => pageErrors.push(String(err)));

try {
  await page.goto(`http://127.0.0.1:${port}/`, { waitUntil: "networkidle" });
  const inputs = page.locator("input");
  await inputs.nth(0).fill("admin");
  await inputs.nth(1).fill("password");
  await page.locator("button").filter({ hasText: /Anmelden|Login|Einloggen/ }).first().click();
  await page.getByRole("button", { name: /Playlists/ }).click();
  await assertText(page, "Test Playlist");
  await page.getByRole("button", { name: /System/ }).click();
  await assertText(page, "System");
  await assertText(page, "25%");
  await page.getByRole("button", { name: /Verbindungen/ }).click();
  await assertText(page, "Test Discord");
  await assertText(page, "Test TS3");
  await page.getByRole("button", { name: /Guilds laden/ }).click();
  await assertText(page, "Test Guild");
  await page.getByRole("button", { name: /Voice-Kanäle laden/ }).click();
  await assertText(page, "Music");
  await page.getByRole("button", { name: /Admin/ }).click();
  await assertText(page, "Admin");
  await page.getByRole("button", { name: /Fehlerlog/ }).click();
  await assertText(page, "Fehlerlog");
  await assertText(page, "Smoke test diagnostic");
  await page.getByRole("button", { name: /Alles kopieren/ }).click();
  await page.getByRole("button", { name: /Player/ }).click();
  await page.getByPlaceholder(/Titel, Interpret/).fill("test track");
  await page.getByRole("button", { name: /Suchen/ }).click();
  await assertText(page, "YouTube Result");
  await page.getByRole("button", { name: /Queue leeren/ }).click();
  await page.getByRole("button", { name: /Abmelden/ }).click();
  assert.equal(consoleErrors.length, 0, `Browser console errors: ${consoleErrors.join(" | ")}`);
  assert.equal(pageErrors.length, 0, `Browser page errors: ${pageErrors.join(" | ")}`);
} finally {
  await browser.close();
  await new Promise(resolve => server.close(resolve));
}

async function assertText(page, text) {
  await page.getByText(text, { exact: false }).first().waitFor({ state: "visible" });
}
