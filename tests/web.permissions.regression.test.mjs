import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { ALL_PERMISSIONS, DEFAULT_USER_PERMISSIONS, PERMISSIONS, hasPermission, normalizePermissions, requiredPermission } from "../backend/src/permissions.js";

const server = await readFile(new URL("../backend/src/server.js", import.meta.url), "utf8");
const req = (url, method = "GET", body) => ({ url, method, body, routeOptions: { url } });

test("web permission catalog is unique and least-privilege by default", () => {
  assert.equal(new Set(ALL_PERMISSIONS).size, ALL_PERMISSIONS.length);
  assert.deepEqual(DEFAULT_USER_PERMISSIONS, [PERMISSIONS.PLAYER_CONTROL, PERMISSIONS.PLAYLISTS_MANAGE]);
  assert.equal(normalizePermissions(["player.control", "nope", "player.control"]).length, 1);
  assert.equal(hasPermission({ role: "user", permissions: DEFAULT_USER_PERMISSIONS }, PERMISSIONS.PLAYER_CONTROL), true);
  assert.equal(hasPermission({ role: "user", permissions: DEFAULT_USER_PERMISSIONS }, PERMISSIONS.CONNECTIONS_MANAGE), false);
  assert.equal(hasPermission({ role: "admin", permissions: [] }, PERMISSIONS.CONNECTIONS_MANAGE), true);
});

test("protected API routes map to the intended web permissions", () => {
  assert.equal(requiredPermission(req("/api/play", "POST")), PERMISSIONS.PLAYER_CONTROL);
  assert.equal(requiredPermission(req("/api/playlists/abc/play", "POST")), PERMISSIONS.PLAYLISTS_MANAGE);
  assert.equal(requiredPermission(req("/api/music/upload", "POST")), PERMISSIONS.MUSIC_MANAGE);
  assert.equal(requiredPermission(req("/api/discord/abc/connect", "POST")), PERMISSIONS.CONNECTIONS_MANAGE);
  assert.equal(requiredPermission(req("/api/settings", "PUT", { volume: 40 })), PERMISSIONS.PLAYER_CONTROL);
  assert.equal(requiredPermission(req("/api/settings", "PUT", { mode: "shuffle" })), PERMISSIONS.PLAYER_CONTROL);
  assert.equal(requiredPermission(req("/api/settings", "PUT", { outputType: "discord" })), PERMISSIONS.SETTINGS_MANAGE);
  assert.equal(requiredPermission(req("/api/users/abc/permissions", "PUT")), PERMISSIONS.USERS_MANAGE);
  assert.equal(requiredPermission(req("/api/diagnostics")), PERMISSIONS.DIAGNOSTICS_VIEW);
  assert.equal(requiredPermission(req("/api/system")), PERMISSIONS.DIAGNOSTICS_VIEW);
  assert.equal(requiredPermission(req("/api/control", "POST")), PERMISSIONS.SYSTEM_MANAGE);
  assert.equal(requiredPermission(req("/api/state")), null);
});

test("authorization is enforced centrally before handlers", () => {
  assert.match(server, /app\.addHook\("preHandler", async \(request, reply\) => \{ const permission = requiredPermission\(request\);/);
  assert.match(server, /if \(u\.role === "admin" \|\| hasPermission\(u, permission\)\) return;/);
  assert.match(server, /app\.put\("\/api\/users\/:id\/permissions"/);
});

test("user management prevents privilege escalation by non-admin managers", () => {
  assert.match(server, /if \(actor\.role !== "admin" && actor\.id === target\.id\) return reply\.code\(403\)/);
  assert.match(server, /if \(actor\.role !== "admin" && target\.role === "admin"\) return reply\.code\(403\)/);
  assert.match(server, /const role = actor\.role === "admin" \? requestedRole : "user"/);
  assert.match(server, /requested\.filter\(permission => hasPermission\(actor, permission\)\)/);
});
