import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { calculateCpuPercent, networkInfo } from "../backend/src/system.js";

test("CPU calculation stays within a normalized 0-100 percent range", () => {
  assert.equal(calculateCpuPercent(1, 1, 1), 100);
  assert.equal(calculateCpuPercent(1, 1, 2), 50);
  assert.equal(calculateCpuPercent(0.5, 1, 4), 12.5);
  assert.equal(calculateCpuPercent(1, 0, 4), 0);
});

test("network monitoring exposes aggregate traffic, per-second counters and honest utilization", async () => {
  const info = await networkInfo();
  assert.equal(typeof info.totalRxBytes, "number");
  assert.equal(typeof info.totalTxBytes, "number");
  assert.equal(typeof info.rxBytesPerSecond, "number");
  assert.equal(typeof info.txBytesPerSecond, "number");
  assert.ok(info.rxUtilizationPercent === null || (typeof info.rxUtilizationPercent === "number" && info.rxUtilizationPercent >= 0 && info.rxUtilizationPercent <= 100));
  assert.ok(info.txUtilizationPercent === null || (typeof info.txUtilizationPercent === "number" && info.txUtilizationPercent >= 0 && info.txUtilizationPercent <= 100));
  assert.ok(info.totalUtilizationPercent === null || (typeof info.totalUtilizationPercent === "number" && info.totalUtilizationPercent >= 0 && info.totalUtilizationPercent <= 100));
  assert.ok(info.linkSpeedMbps === null || typeof info.linkSpeedMbps === "number");
  assert.ok(Array.isArray(info.interfaces));
  assert.ok(info.interfaces.every(x => typeof x.rxBytes === "number" && typeof x.txBytes === "number"));
});

test("dashboard contains one-second live monitoring, Discord controls, power controls and new UI modules", async () => {
  const app = await readFile(new URL("../frontend/app.js", import.meta.url), "utf8");
  const enhancement = await readFile(new URL("../frontend/enhancements.js", import.meta.url), "utf8");
  const music = await readFile(new URL("../frontend/music-ui.js", import.meta.url), "utf8");
  const themes = await readFile(new URL("../frontend/themes.js", import.meta.url), "utf8");
  const server = await readFile(new URL("../backend/src/server.js", import.meta.url), "utf8");
  assert.match(app, /setInterval\(pollMonitor,\s*1000\)/);
  for (const marker of ["id=\"topCpu\"", "id=\"topRam\"", "id=\"topNetRx\"", "id=\"topNetTx\"", "id=\"topNetTotal\""]) assert.ok(app.includes(marker), `Dashboard missing ${marker}`);
  for (const marker of ["id=\"dadd\"", "id=\"dlink\"", "id=\"ds\"", "id=\"dconnect\"", "id=\"dreconnect\"", "id=\"dg\"", "id=\"dgrefresh\"", "id=\"dv\"", "id=\"dvrefresh\""]) assert.ok(app.includes(marker), `Discord UI missing ${marker}`);
  assert.match(enhancement, /enhancedOutput/);
  assert.match(enhancement, /restart-system/);
  assert.match(enhancement, /shutdown-system/);
  assert.match(enhancement, /messageContentIntent/);
  assert.match(enhancement, /rxUtilizationPercent/);
  assert.match(music, /\/api\/music\/upload/);
  assert.match(music, /\+ Playlist|＋ Playlist/);
  assert.match(themes, /ocean/);
  assert.match(themes, /saveCustomAccent/);
  assert.match(server, /accentColor/);
  assert.match(server, /MUSIC_EXTENSIONS/);
});
