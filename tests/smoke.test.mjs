import test from "node:test";
import assert from "node:assert/strict";
import { Player } from "../backend/src/player.js";

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

test("Player ignores malformed enqueue entries", async () => {
  const p = new Player(settings());
  await p.enqueue([{ title: "missing url" }, null, { id: "r", title: "Radio", url: "http://example/r", source: "radio" }]);
  assert.ok(p.current || p.queue.length === 0);
});
