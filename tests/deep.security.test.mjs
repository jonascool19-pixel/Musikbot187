import test from "node:test";
import assert from "node:assert/strict";
import path from "node:path";
import { Player } from "../backend/src/player.js";
import { validatePlaybackItem } from "../backend/src/source-policy.js";
import { discordCommandAllowed, discordIntents } from "../backend/src/discord.js";

const dataDirectory = path.resolve("/tmp/musikbot187-test-music");

test("playback policy rejects path traversal and private direct targets", async () => {
  await assert.rejects(() => validatePlaybackItem({ source: "file", url: "../../etc/passwd" }, dataDirectory), /außerhalb des Musikverzeichnisses/);
  await assert.rejects(() => validatePlaybackItem({ source: "direct", url: "http://127.0.0.1:3000/audio" }, dataDirectory), /nicht erlaubtes Netzwerkziel/);
  await assert.rejects(() => validatePlaybackItem({ source: "direct", url: "http://localhost/audio" }, dataDirectory), /nicht erlaubtes Netzwerkziel/);
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
  await assert.rejects(() => player.enqueue([{ source: "file", url: "../../etc/passwd" }]), /außerhalb des Musikverzeichnisses/);
  assert.equal(player.queue.length, 0);
});

test("Discord command scope is tied to configured guild and prefix intent is optional", () => {
  assert.equal(discordCommandAllowed({ guildId: "guild-1" }, "guild-1"), true);
  assert.equal(discordCommandAllowed({ guildId: "guild-2" }, "guild-1"), false);
  assert.equal(discordCommandAllowed({ guildId: null }, "guild-1"), false);
  assert.equal(discordIntents("").includes(32768), false);
  assert.equal(discordIntents("!").includes(32768), true);
});
