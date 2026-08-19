import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm, readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';

async function text(file) {
  return readFile(new URL(`../${file}`, import.meta.url), 'utf8');
}

test('HTTP API contracts match the dashboard operations', async () => {
  const server = await text('backend/src/server.js');
  assert.match(server, /app\.delete\("\/api\/playlists\/:id"/);
  assert.match(server, /app\.delete\("\/api\/ts3\/:id"/);
  assert.match(server, /app\.put\("\/api\/discord\/:id"/);
  assert.match(server, /restart: "restart-bot"/);
  assert.match(server, /stop: "stop-bot"/);
  assert.match(server, /reboot: "restart-system"/);
  assert.match(server, /shutdown: "shutdown-system"/);
});

test('diagnostics carry stable level and source metadata', async () => {
  const server = await text('backend/src/server.js');
  assert.match(server, /level = "error", source = "backend"/);
  assert.match(server, /source, message:/);
});

test('Spotify credentials are decrypted only at use time', async () => {
  const media = await text('backend/src/media.js');
  assert.match(media, /import \{ decryptSecret \} from "\.\/secrets\.js"/);
  assert.match(media, /await decryptSecret\(settings\.spotifyClientSecret\)/);
  assert.doesNotMatch(media, /console\.(log|error).*spotify/i);
});

test('secret key permissions are enforced on existing and new keys', async () => {
  const secrets = await text('backend/src/secrets.js');
  assert.match(secrets, /chmod\(KEY_FILE, 0o600\)/);
  assert.match(secrets, /writeFile\(KEY_FILE, generated, \{ mode: 0o600 \}\)/);
});

test('Discord manual disconnect cannot schedule gateway reconnect', async () => {
  const discord = await text('backend/src/discord.js');
  assert.match(discord, /manualDisconnecting/);
  assert.match(discord, /if \(!runtime\.manualDisconnecting\) this\.scheduleGatewayReconnect/);
  assert.match(discord, /runtime\.manualDisconnecting = true/);
});

test('player cleans up yt-dlp when FFmpeg terminates', async () => {
  const player = await text('backend/src/player.js');
  assert.match(player, /if \(yt\.exitCode === null\) \{ try \{ yt\.kill\("SIGTERM"\)/);
});

test('installer uses locked dependencies and grants the control service socket access', async () => {
  const installer = await text('install-stable.sh');
  assert.match(installer, /npm ci --omit=dev/);
  assert.match(installer, /Group=\$SERVICE_USER/);
  assert.match(installer, /RuntimeDirectoryMode=0750/);
});

test('TeamSpeak legacy dashboard calls are normalized before reaching the canonical API', async () => {
  const compat = await text('frontend/api-compat.js');
  assert.match(compat, /\/api\/ts3/);
  assert.match(compat, /instances/);
  assert.match(compat, /username/);
  const index = await text('frontend/index.html');
  assert.match(index, /api-compat\.js/);
});

test('secret encryption round-trip remains functional', async () => {
  const dataDir = await mkdtemp(path.join(tmpdir(), 'musikbot187-secret-test-'));
  const previous = process.env.MUSIKBOT187_DATA_DIR;
  process.env.MUSIKBOT187_DATA_DIR = dataDir;
  try {
    const module = await import(`../backend/src/secrets.js?audit=${Date.now()}`);
    const encrypted = await module.encryptSecret('audit-secret-123');
    assert.match(encrypted, /^enc\$/);
    assert.equal(await module.decryptSecret(encrypted), 'audit-secret-123');
    assert.equal(await module.decryptSecret('legacy-plaintext'), 'legacy-plaintext');
  } finally {
    if (previous === undefined) delete process.env.MUSIKBOT187_DATA_DIR;
    else process.env.MUSIKBOT187_DATA_DIR = previous;
    await rm(dataDir, { recursive: true, force: true });
  }
});
