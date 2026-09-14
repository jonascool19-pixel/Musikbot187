import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';

test('dashboard 24-hour measurement restart clears old results immediately',async()=>{
  const script=await fs.readFile(new URL('../frontend/resource-advisor-run.js',import.meta.url),'utf8'),html=await fs.readFile(new URL('../frontend/index.html',import.meta.url),'utf8'),css=await fs.readFile(new URL('../frontend/resource-advisor-run.css',import.meta.url),'utf8');
  assert.match(html,/resource-advisor-run\.js/);assert.match(html,/resource-advisor-run\.css/);assert.match(script,/Messung neu starten/);assert.match(script,/clearAdvisor\(\);try\{const result=await request\('\/api\/monitoring\/advisor\/reset'/);assert.match(script,/Netzwerk-Verbrauchshistorie/i);assert.match(css,/right:59px/);
});
