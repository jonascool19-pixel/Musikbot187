import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';

const root = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');

test('Discord instance card actions stay on the instance card and use canonical APIs', async () => {
  const helper = await readFile(path.join(root, 'frontend/discord-instance-actions.js'), 'utf8');
  const html = await readFile(path.join(root, 'frontend/index.html'), 'utf8');
  const server = await readFile(path.join(root, 'backend/src/server.js'), 'utf8');

  assert.match(html, /discord-instance-actions\.js/);
  assert.match(helper, /Bot hinzufügen/);
  assert.match(helper, /Voice-Chat betreten/);
  assert.match(helper, /Discord-Server auswählen/);
  assert.match(helper, /Voice-Kanal auswählen/);
  assert.match(helper, /window\.open\(url, '_blank'/);
  assert.match(helper, /\/api\/discord\/\$\{encodeURIComponent\((?:item\.id|id)\)\}\/connect/);
  assert.match(helper, /\/api\/discord\/\$\{encodeURIComponent\((?:item\.id|id)\)\}\/guilds/);
  assert.match(helper, /\/api\/discord\/\$\{encodeURIComponent\((?:item\.id|id)\)\}\/guilds\/\$\{encodeURIComponent\(guildId\)\}\/channels/);
  assert.match(helper, /\/api\/discord\/\$\{encodeURIComponent\((?:item\.id|id)\)\}\/join/);
  assert.match(helper, /request\('\/api\/discord'/);
  assert.match(helper, /ensureConnected\((?:item\.id|id)\)/);
  assert.match(helper, /data-discord-direct-actions/);
  assert.match(helper, /new MutationObserver\(scheduleDecorate\)/);
  assert.doesNotMatch(helper, /void loadGuilds\(row, item, guildSelect, status\)/);

  assert.match(server, /app\.post\("\/api\/discord"/);
  assert.match(server, /app\.post\("\/api\/discord\/\:id\/connect"/);
  assert.match(server, /app\.get\("\/api\/discord\/\:id\/guilds"/);
  assert.match(server, /app\.get\("\/api\/discord\/\:id\/guilds\/\:guildId\/channels"/);
  assert.match(server, /app\.post\("\/api\/discord\/\:id\/join"/);
});
