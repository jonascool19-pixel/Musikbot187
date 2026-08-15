import { spawn } from 'node:child_process';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';

const data = await mkdtemp(path.join(tmpdir(), 'radiobot-'));
const child = spawn(process.execPath, ['backend/dist/index.js'], { cwd: process.cwd(), env: { ...process.env, DATA_DIR: data, FRONTEND_DIR: path.join(process.cwd(), 'frontend'), PORT: '3137', HOST: '127.0.0.1' }, stdio: ['ignore','pipe','pipe'] });
let stderr=''; child.stderr.on('data',d=>stderr+=d);
try {
  for(let i=0;i<40;i++){try{const r=await fetch('http://127.0.0.1:3137/api/setup/status'); if(r.ok) break;}catch{} await new Promise(r=>setTimeout(r,250));}
  const status=await (await fetch('http://127.0.0.1:3137/api/setup/status')).json();
  if(status.userCreated) throw new Error('fresh config unexpectedly contains a user');
  const user=await fetch('http://127.0.0.1:3137/api/setup/user',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({username:'admin',password:'123456789012'})});
  if(!user.ok) throw new Error(`first user failed: ${await user.text()}`);
  const login=await fetch('http://127.0.0.1:3137/api/auth/login',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({username:'admin',password:'123456789012'})});
  if(!login.ok) throw new Error(`login failed: ${await login.text()}`);
  const cookie=login.headers.get('set-cookie');
  if(!cookie) throw new Error('session cookie missing');
  const me=await fetch('http://127.0.0.1:3137/api/me',{headers:{cookie}}); if(!me.ok) throw new Error('authenticated /api/me failed');
  const layout=await fetch('http://127.0.0.1:3137/api/ui/layout',{method:'PUT',headers:{'content-type':'application/json',cookie},body:JSON.stringify({order:['hero','ts3','discord']})});
  if(!layout.ok) throw new Error(`layout save failed: ${await layout.text()}`);
  console.log('SMOKE OK');
} finally { child.kill('SIGTERM'); await rm(data,{recursive:true,force:true}); if(stderr) process.stderr.write(stderr); }
