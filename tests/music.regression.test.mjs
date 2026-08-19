import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';

const root = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');

async function read(file) { return readFile(path.join(root, file), 'utf8'); }

test('search playback is immediate and does not replace the search view', async () => {
  const app = await read('frontend/app.js');
  const fetchLayer = await read('frontend/fetch-layer.js');
  const fix = await read('frontend/search-play-fix.js');
  const index = await read('frontend/index.html');
  assert.match(app, /data-play=\"\$\{index\}\"/);
  assert.match(fetchLayer, /getLastSearch\(\)/);
  assert.match(fetchLayer, /\/api\/search/);
  assert.match(fix, /playNow: true/);
  assert.match(fix, /stopImmediatePropagation\(\)/);
  assert.doesNotMatch(fix, /player\(\)/);
  assert.match(index, /search-play-fix\.js/);
});

test('search queue action remains distinct from immediate playback', async () => {
  const app = await read('frontend/app.js');
  assert.match(app, /data-add=\"\$\{index\}\"/);
  assert.match(app, /function queueResult\(index\)/);
  assert.match(app, /post\('\/api\/play', \{ items:/);
});

test('music player exposes playlist actions for queue and search results', async () => {
  const app = await read('frontend/app.js');
  const musicUi = await read('frontend/music-ui.js');
  assert.match(app, /data-plq=/);
  assert.match(app, /data-pl=/);
  assert.match(musicUi, /data-mpl=/);
});

test('browser regression covers current stable dashboard flows without stale editor selectors', async () => {
  const browserTest = await read('tests/dashboard.browser.test.mjs');
  assert.match(browserTest, /data-tab=\\\"playlists\\\"/);
  assert.match(browserTest, /data-tab=\\\"system\\\"/);
  assert.match(browserTest, /data-tab=\\\"connections\\\"/);
  assert.match(browserTest, /data-tab=\\\"admin\\\"/);
  assert.match(browserTest, /api\/play/);
  assert.doesNotMatch(browserTest, /locator\(\"#ds\"\)/);
});

test('central fetch layer remains the only window.fetch wrapper', async () => {
  const files = ['frontend/fetch-layer.js', 'frontend/search-play-fix.js', 'frontend/play-now.js'];
  let wrappers = 0;
  for (const file of files) wrappers += (await read(file)).match(/window\.fetch\s*=\s*async/g)?.length || 0;
  assert.equal(wrappers, 1, 'search helpers must not add a second fetch wrapper');
  assert.match(await read('frontend/fetch-layer.js'), /window\.fetch\s*=\s*async/);
});
