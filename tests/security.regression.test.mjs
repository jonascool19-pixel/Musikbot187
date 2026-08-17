import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { mkdir, rm } from "node:fs/promises";
import { spawn } from "node:child_process";
import { once } from "node:events";
import http from "node:http";
import { join } from "node:path";
import { tmpdir } from "node:os";

async function findPort() {
  const net = await import("node:net"); const server = net.createServer();
  await new Promise(resolve => server.listen(0, "127.0.0.1", resolve)); const port = server.address().port; await new Promise(resolve => server.close(resolve)); return port;
}
function request(port, path, { method = "GET", headers = {}, body = undefined } = {}) {
  return new Promise((resolve, reject) => {
    const data = body === undefined ? null : JSON.stringify(body);
    const req = http.request({ hostname:"127.0.0.1", port, path, method, agent:false, headers:{ Connection:"close", ...(data ? { "content-type":"application/json", "content-length":Buffer.byteLength(data) } : {}), ...headers } }, res => {
      let text = ""; res.setEncoding("utf8"); res.on("data", c => { text += c; });
      res.on("end", () => { let parsed = {}; try { parsed = JSON.parse(text || "{}"); } catch {} resolve({ status:res.statusCode, body:parsed }); });
    });
    req.on("error", reject); req.setTimeout(5000, () => req.destroy(new Error("HTTP test timeout"))); if (data) req.write(data); req.end();
  });
}
async function waitFor(port) { for (let i=0;i<40;i++) { try { const r=await request(port,"/api/health"); if(r.status===200)return; } catch {} await new Promise(r=>setTimeout(r,250)); } throw new Error("Server did not become ready"); }

test("first-run setup requires the installer token and preserves admin/user roles", async () => {
  const dataDir = await import("node:fs/promises").then(({mkdtemp}) => mkdtemp(join(tmpdir(), "musikbot187-security-")));
  const port = await findPort(); const token = "test-setup-token-1234567890";
  const child = spawn(process.execPath, ["backend/src/server.js"], { cwd:new URL("..", import.meta.url), env:{...process.env, MUSIKBOT187_DATA_DIR:dataDir, MUSIKBOT187_SETUP_TOKEN:token, HOST:"127.0.0.1", PORT:String(port)}, stdio:["ignore","pipe","pipe"] });
  let stderr=""; child.stderr.on("data", d => { stderr += String(d); });
  try {
    await waitFor(port); const setup = await request(port,"/api/setup"); assert.equal(setup.status,200); assert.equal(setup.body.initialized,false); assert.equal(setup.body.requiresToken,true);
    assert.equal((await request(port,"/api/setup",{method:"POST",body:{name:"admin",password:"password1"}})).status,403);
    assert.equal((await request(port,"/api/setup",{method:"POST",headers:{"X-MusikBot-Setup-Token":"wrong"},body:{name:"admin",password:"password1"}})).status,403);
    const created=await request(port,"/api/setup",{method:"POST",headers:{"X-MusikBot-Setup-Token":token},body:{name:"admin",password:"password1"}}); assert.equal(created.status,200); assert.equal(created.body.user.role,"admin");
    assert.equal((await request(port,"/api/setup",{method:"POST",headers:{"X-MusikBot-Setup-Token":token},body:{name:"second",password:"password2"}})).status,409);
    const auth={Authorization:`Bearer ${created.body.token}`};
    assert.equal((await request(port,"/api/users",{method:"POST",headers:auth,body:{name:"normal",password:"password2",role:"user"}})).status,200);
    const normalLogin = await request(port,"/api/login",{method:"POST",body:{name:"normal",password:"password2"}}); assert.equal(normalLogin.status,200); const normalAuth={Authorization:`Bearer ${normalLogin.body.token}`};
    assert.equal((await request(port,"/api/settings",{method:"PUT",headers:normalAuth,body:{theme:"light"}})).status,403);
    assert.equal((await request(port,"/api/control",{method:"POST",headers:normalAuth,body:{action:"restart-bot"}})).status,403);
    assert.equal((await request(port,"/api/diagnostics",{headers:normalAuth})).status,403);
    const logout=await request(port,"/api/logout",{method:"POST",headers:auth}); assert.equal(logout.status,200);
    assert.equal((await request(port,"/api/state",{headers:auth})).status,401);
    const stored=JSON.parse(await readFile(join(dataDir,"data.json"),"utf8")); const hashes=stored.users.map(x=>x.hash); assert.ok(hashes.every(x=>/^scrypt\$[0-9a-f]{32}\$[0-9a-f]{64}$/.test(x))); assert.notEqual(hashes[0],hashes[1]);
  } catch(error) { error.message += `\nServer stderr:\n${stderr}`; throw error; }
  finally { child.kill("SIGTERM"); await Promise.race([once(child,"exit"),new Promise(r=>setTimeout(r,2000))]); await rm(dataDir,{recursive:true,force:true}); }
});
