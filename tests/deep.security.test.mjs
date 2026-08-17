import test from "node:test";
import assert from "node:assert/strict";
import path from "node:path";
import { mkdir, symlink, writeFile } from "node:fs/promises";
import { Player } from "../backend/src/player.js";
import { validatePlaybackItem } from "../backend/src/source-policy.js";
import { discordCommandAllowed, discordIntents } from "../backend/src/discord.js";
import { login, logout, createAdmin, load } from "../backend/src/store.js";

const dataDirectory = path.resolve("/tmp/musikbot187-test-music");
await mkdir(dataDirectory, { recursive: true });
await writeFile(path.join(dataDirectory, "safe.mp3"), "test");

test("playback policy rejects path traversal and private/reserved direct targets", async () => {
  await assert.rejects(() => validatePlaybackItem({ source: "file", url: "../../etc/passwd" }, dataDirectory), /Datei liegt außerhalb|ENOENT/);
  for (const host of ["127.0.0.1", "localhost", "192.168.1.10", "10.0.0.2", "100.64.0.1", "169.254.10.10", "[::1]", "[::ffff:192.168.1.10]"]) {
    await assert.rejects(() => validatePlaybackItem({ source: "direct", url: `http://${host}:3000/audio` }, dataDirectory), /nicht erlaubtes Netzwerkziel/);
  }
});

test("playback policy rejects symlinks escaping the music directory", async () => {
  const link = path.join(dataDirectory, "outside-link.mp3");
  try { await symlink("/etc/passwd", link); } catch (error) { if (error?.code !== "EEXIST") throw error; }
  await assert.rejects(() => validatePlaybackItem({ source: "file", url: "outside-link.mp3" }, dataDirectory), /außerhalb des Musikverzeichnisses/);
});

test("playback policy only accepts supported youtube and spotify forms", async () => {
  const youtube = await validatePlaybackItem({ source: "youtube", url: "ytsearch1:test" }, dataDirectory);
  assert.equal(youtube.url, "ytsearch1:test");
  const spotify = await validatePlaybackItem({ source: "spotify", url: "ytsearch1:test artist" }, dataDirectory);
  assert.equal(spotify.source, "spotify");
  await assert.rejects(() => validatePlaybackItem({ source: "youtube", url: "https://example.com/audio" }, dataDirectory), /Nicht erlaubte YouTube-Quelle/);
  await assert.rejects(() => validatePlaybackItem({ source: "spotify", url: "https://example.com/audio" }, dataDirectory), /Nicht erlaubte Spotify-Quelle/);
});

test("Player rejects unsafe playback items before queueing", async () => {
  const player = new Player({ volume: 80, mode: "queue", filesDirectory: dataDirectory }, { spawnFn() { throw new Error("should not spawn"); } });
  await assert.rejects(() => player.enqueue([{ source: "file", url: "../../etc/passwd" }]), /Datei liegt außerhalb|ENOENT/);
  assert.equal(player.queue.length, 0);
});

test("Player follows the live settings directory", async () => {
  const settings = { volume: 80, mode: "queue", filesDirectory: dataDirectory };
  const player = new Player(settings, { spawnFn() { throw new Error("should not spawn"); } });
  const newDirectory = path.join(dataDirectory, "new-dir");
  settings.filesDirectory = newDirectory;
  await mkdir(newDirectory, { recursive: true });
  await writeFile(path.join(newDirectory, "new.mp3"), "test");
  assert.equal(player.dataDirectory, newDirectory);
  const validated = await validatePlaybackItem({ source: "file", url: "new.mp3" }, player.dataDirectory);
  assert.equal(validated.url, path.join(newDirectory, "new.mp3"));
  player.stop();
});

test("Discord command scope and Message Content Intent are explicit", () => {
  assert.equal(discordCommandAllowed({ guildId: "guild-1" }, "guild-1"), true);
  assert.equal(discordCommandAllowed({ guildId: "guild-2" }, "guild-1"), false);
  assert.equal(discordCommandAllowed({ guildId: null }, "guild-1"), false);
  assert.equal(discordIntents("").includes(32768), false);
  assert.equal(discordIntents("!", false).includes(32768), false);
  assert.equal(discordIntents("!", true).includes(32768), true);
});

test("sessions can be explicitly revoked and usernames are case-insensitive", async () => {
  process.env.MUSIKBOT187_DATA_DIR = path.resolve("/tmp/musikbot187-auth-test");
  await load();
  createAdmin("Audit-Admin", "correct-password");
  const session = login("audit-admin", "correct-password", "client-good");
  assert.equal(session.user.name, "Audit-Admin");
  assert.equal(logout(session.token), true);
  assert.equal(logout(session.token), false);
  assert.equal(login("AUDIT-ADMIN", "correct-password", "client-good").user.name, "Audit-Admin");
});

test("login rate state remains bounded and distinguishes client identities", async () => {
  for (let i = 0; i < 100; i++) login(`unknown-${i}`, "bad", `client-${i}`);
  assert.equal(login("audit-admin", "correct-password", "client-good").user.name, "Audit-Admin");
});
