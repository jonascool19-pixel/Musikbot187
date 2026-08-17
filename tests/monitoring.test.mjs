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

test("network monitoring exposes aggregate traffic and per-second counters", async () => {
  const info = await networkInfo();
  assert.equal(typeof info.totalRxBytes, "number");
  assert.equal(typeof info.totalTxBytes, "number");
  assert.equal(typeof info.rxBytesPerSecond, "number");
  assert.equal(typeof info.txBytesPerSecond, "number");
  assert.ok(info.rxBytesPerSecond >= 0);
  assert.ok(info.txBytesPerSecond >= 0);
  assert.ok(Array.isArray(info.interfaces));
  assert.ok(info.interfaces.every(x => typeof x.rxBytes === "number" && typeof x.txBytes === "number"));
});

test("dashboard contains one-second live monitoring and Discord controls", async () => {
  const app = await readFile(new URL("../frontend/app.js", import.meta.url), "utf8");
  assert.match(app, /setInterval\(pollMonitor,\s*1000\)/);
  for (const marker of ["id=\"topCpu\"", "id=\"topRam\"", "id=\"topNetRx\"", "id=\"topNetTx\"", "id=\"topNetTotal\""]) {
    assert.ok(app.includes(marker), `Dashboard missing ${marker}`);
  }
  for (const marker of ["id=\"dadd\"", "id=\"dlink\"", "id=\"ds\"", "id=\"dconnect\"", "id=\"dreconnect\"", "id=\"dg\"", "id=\"dgrefresh\"", "id=\"dv\"", "id=\"dvrefresh\""]) {
    assert.ok(app.includes(marker), `Discord UI missing ${marker}`);
  }
  assert.match(app, /function inviteUrl\(/);
  assert.match(app, /function loadGuilds\(/);
  assert.match(app, /function loadChannels\(/);
});
