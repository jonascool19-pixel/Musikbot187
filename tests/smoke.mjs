import { spawn } from 'node:child_process';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';

const data = await mkdtemp(path.join(tmpdir(), 'radiobot-'));
const child = spawn(process.execPath, ['backend/dist/index.js'], { cwd: process.cwd(), env: { ...process.env, DATA_DIR: data, FRONTEND_DIR: path.join(process.cwd(), 'frontend'), PORT: '3137', HOST: '127.0.0.1' }, stdio: ['ignore', 'pipe', 'pipe'] });
let stderr = '';
child.stderr.on('data', d => stderr += d);
try {
  for (let i = 0; i < 40; i++) { try { const r = await fetch('http://127.0.0.1:3137/api/setup/status'); if (r.ok) break; } catch {} await new Promise(r => setTimeout(r, 250)); }
  const status = await (await fetch('http://127.0.0.1:3137/api/setup/status')).json();
  if (status.userCreated || status.setupComplete) throw new Error('fresh config is not empty');
  const root = await fetch('http://127.0.0.1:3137/');
  if (!root.ok || !(await root.text()).includes('RadioBot')) throw new Error('frontend root failed');
  const stateBeforeSetup = await fetch('http://127.0.0.1:3137/api/state');
  if (stateBeforeSetup.status !== 401) throw new Error(`unauthenticated state should be 401, got ${stateBeforeSetup.status}`);
  const user = await fetch('http://127.0.0.1:3137/api/setup/user', { method: 'POST', headers: {'content-type':'application/json'}, body: JSON.stringify({username:'admin', password:'123456789012'}) });
  if (!user.ok) throw new Error(`first user failed: ${await user.text()}`);
  const login = await fetch('http://127.0.0.1:3137/api/auth/login', { method:'POST', headers:{'content-type':'application/json'}, body:JSON.stringify({username:'admin',password:'123456789012'}) });
  if (!login.ok) throw new Error(`login failed: ${await login.text()}`);
  const cookie = login.headers.get('set-cookie');
  if (!cookie) throw new Error('session cookie missing');
  const setupRequired = await fetch('http://127.0.0.1:3137/api/state', {headers:{cookie}});
  if (setupRequired.status !== 409) throw new Error(`setup gate failed: ${setupRequired.status}`);
  const settings = await fetch('http://127.0.0.1:3137/api/settings', {headers:{cookie}});
  if (!settings.ok) throw new Error('settings read failed');
  const finish = await fetch('http://127.0.0.1:3137/api/settings', {method:'PUT',headers:{'content-type':'application/json',cookie},body:JSON.stringify({discord:[],ts3:[],spotify:[],settings:{networkInterface:'auto'}})});
  if (!finish.ok) throw new Error(`setup finish failed: ${await finish.text()}`);
  const networkInterfaces = await fetch('http://127.0.0.1:3137/api/network/interfaces', {headers:{cookie}});
  if (!networkInterfaces.ok) throw new Error(`network interfaces failed: ${await networkInterfaces.text()}`);
  const networkStats = await fetch('http://127.0.0.1:3137/api/network/stats', {headers:{cookie}});
  if (!networkStats.ok) throw new Error(`network stats failed: ${await networkStats.text()}`);
  const playlist = await fetch('http://127.0.0.1:3137/api/playlist', {method:'POST',headers:{'content-type':'application/json',cookie},body:JSON.stringify({name:'Smoke'})});
  if (!playlist.ok) throw new Error(`playlist create failed: ${await playlist.text()}`);
  const created = await playlist.json();
  const add = await fetch(`http://127.0.0.1:3137/api/playlist/${created.id}/item`, {method:'POST',headers:{'content-type':'application/json',cookie},body:JSON.stringify({input:'https://example.com/test',title:'Smoke Test'})});
  if (!add.ok) throw new Error(`playlist item failed: ${await add.text()}`);
  const state = await fetch('http://127.0.0.1:3137/api/state', {headers:{cookie}});
  if (!state.ok) throw new Error(`state after setup failed: ${await state.text()}`);
  const layout = await fetch('http://127.0.0.1:3137/api/ui/layout', {method:'PUT',headers:{'content-type':'application/json',cookie},body:JSON.stringify({order:['hero','ts3','discord']})});
  if (!layout.ok) throw new Error(`layout save failed: ${await layout.text()}`);
  console.log('SMOKE OK');
} finally {
  child.kill('SIGTERM');
  await rm(data, {recursive:true, force:true});
  if (stderr) process.stderr.write(stderr);
}
