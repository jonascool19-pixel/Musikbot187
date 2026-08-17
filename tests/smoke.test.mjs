import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { Player } from "../backend/src/player.js";
import { systemInfo, storageInfo } from "../backend/src/system.js";

function settings(overrides = {}) { return { volume: 80, mode: "queue", ...overrides }; }

test("Player clamps volume and accepts supported modes", () => {
  const p = new Player(settings());
  p.setVolume(140); assert.equal(p.volume, 100);
  p.setVolume(-5); assert.equal(p.volume, 0);
  p.setMode("shuffle"); assert.equal(p.mode, "shuffle");
  p.setMode("invalid"); assert.equal(p.mode, "shuffle");
});

test("Player removes queue entries safely", async () => {
  const p = new Player(settings());
  p.queue.push({ id: "1", title: "A", url: "http://example/a", source: "radio" }, { id: "2", title: "B", url: "http://example/b", source: "radio" });
  await p.remove(0);
  assert.equal(p.queue.length, 1);
  assert.equal(p.queue[0].id, "2");
  await p.remove(99);
  assert.equal(p.queue.length, 1);
});

test("Player filters malformed queue items", async () => {
  const p = new Player(settings());
  await p.enqueue([{ title: "missing url" }, null, { id: "r", title: "Radio", url: "http://example/r", source: "radio" }]);
  assert.ok(p.current || p.queue.length === 0);
});

test("Player skip cancels an in-flight resolver without leaving a phantom current item", async () => {
  const p = new Player(settings());
  p.resolve = async function () { await new Promise((resolve) => setTimeout(resolve, 100)); return "unused"; };
  const run = p.enqueue([{ id: "1", title: "A", url: "ytsearch1:A", source: "youtube" }, { id: "2", title: "B", url: "http://example/b", source: "radio" }]);
  p.skip();
  await run;
  assert.equal(p.generation > 1, true);
});

test("System metrics expose CPU, memory and uptime values", () => {
  const a = systemInfo();
  assert.equal(typeof a.cpuPercent, "number");
  assert.ok(a.cpuPercent >= 0 && a.cpuPercent <= 100);
  assert.equal(typeof a.memory.percent, "number");
  assert.ok(a.memory.percent >= 0 && a.memory.percent <= 100);
  assert.ok(a.memory.total > 0);
  assert.ok(a.uptime >= 0);
  const b = systemInfo();
  assert.equal(typeof b.cpuPercent, "number");
});

test("Storage metrics expose disk information for an existing directory", async () => {
  const s = await storageInfo(process.cwd());
  assert.equal(s.exists, true);
  assert.equal(s.directory, true);
  assert.ok(s.disk && s.disk.total > 0);
  assert.ok(s.disk.used >= 0 && s.disk.free >= 0);
});

test("Dashboard contains the primary navigation, monitoring UI and backend action endpoints", async () => {
  const ui = await readFile(new URL("../frontend/app.js", import.meta.url), "utf8");
  for (const text of ["/api/search", "/api/play/volume", "/api/play/mode", "/api/queue/", "/api/playlists", "/api/discord", "/api/ts3", "/api/system", "/api/network", "/api/storage", "/api/files", "/api/settings", "/api/users", "/api/diagnostics", "/api/control"]) assert.ok(ui.includes(text), `Dashboard missing ${text}`);
  for (const text of ["id=\"clock\"", "cpuPercent", "memory.percent", "c.disk", "setInterval(tick,1000)", "setTimeout(refresh,5000)"]) assert.ok(ui.includes(text), `Dashboard missing ${text}`);
  for (const tab of ["player", "playlists", "connections", "system", "admin"]) assert.ok(ui.includes(`['${tab}'`), `Dashboard missing ${tab} tab`);
});
