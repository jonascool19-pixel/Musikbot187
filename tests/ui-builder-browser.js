const { chromium } = require('playwright');
const http = require('http');
const fs = require('fs');
const path = require('path');
const childProcess = require('child_process');

const root = process.env.UI_TEST_ROOT || '/opt/radiobot/frontend';
const port = Number(process.env.UI_TEST_PORT || 4173);
let savedLayout = { preset:'midnight', name:'Browser Test', density:'comfortable', accent:'#7dd3fc', bg:'#070b14', panel:'#111929', tiles:[], fields:[] };
const guilds = [{ id:'g1', name:'Test Guild' }];
const channels = { voice:[{id:'v1',name:'Voice'}], text:[{id:'t1',name:'general'}] };

function sendJson(res, status, body){ const data=Buffer.from(JSON.stringify(body)); res.writeHead(status, {'Content-Type':'application/json','Content-Length':data.length}); res.end(data); }
function routeApi(req,res){
  if(req.method==='GET' && req.url==='/api/ui/layout') return sendJson(res,200,savedLayout);
  if(req.method==='PUT' && req.url==='/api/ui/layout'){ let body=''; req.on('data',c=>body+=c); req.on('end',()=>{ savedLayout=JSON.parse(body); sendJson(res,200,savedLayout); }); return; }
  if(req.url==='/api/health') return sendJson(res,200,{ok:true,discord:false,version:'test',youtube:true,spotify:false});
  if(req.url==='/api/guilds') return sendJson(res,200,guilds);
  if(req.url==='/api/guilds/g1/channels') return sendJson(res,200,channels);
  if(req.url==='/api/state/g1') return sendJson(res,200,{guildId:'g1',voiceChannelId:'v1',statusChannelId:'',volume:80,paused:false,queue:[]});
  if(req.url==='/api/state/g1/queue') return sendJson(res,200,[]);
  if(req.url==='/api/radios' || req.url==='/api/media' || req.url==='/api/playlists') return sendJson(res,200,[]);
  if(req.url==='/api/update/status') return sendJson(res,200,{status:'idle'});
  if(req.url==='/api/setup/status') return sendJson(res,200,{complete:true});
  if(req.url==='/api/settings') return sendJson(res,200,{});
  if(req.url==='/api/metrics') return sendJson(res,200,{});
  if(req.url.startsWith('/api/search') || req.url.startsWith('/api/radio/search')) return sendJson(res,200,{local:[],radios:[],youtube:[],spotify:[]});
  return sendJson(res,200,{});
}

const server = http.createServer((req,res)=>req.url.startsWith('/api/') ? routeApi(req,res) : null);
const staticServer = childProcess.spawn('python3',['-m','http.server',String(port),'--directory',root],{stdio:'ignore'});

(async()=>{
  const browser = await chromium.launch({headless:true});
  try{
    await new Promise(r=>setTimeout(r,300));
    const apiServer = server.listen(4174,'127.0.0.1');
    const page = await browser.newPage();
    await page.route('**/api/**', async route=>{
      const req = route.request();
      const target = `http://127.0.0.1:4174${new URL(req.url()).pathname}${new URL(req.url()).search}`;
      if(req.method()==='PUT'){
        const response = await fetch(target,{method:'PUT',headers:{'Content-Type':'application/json'},body:req.postData()||'{}'});
        return route.fulfill({status:response.status,headers:{'Content-Type':'application/json'},body:await response.text()});
      }
      const response = await fetch(target);
      return route.fulfill({status:response.status,headers:{'Content-Type':'application/json'},body:await response.text()});
    });
    await page.goto(`http://127.0.0.1:${port}/index.html`,{waitUntil:'networkidle'});
    await page.locator('#layoutBuilderOpen').waitFor();
    await page.locator('#layoutBuilderOpen').click();
    const fields = page.locator('.builder-field');
    if(await fields.count() < 8) throw new Error(`expected movable fields, got ${await fields.count()}`);

    const discord = page.locator('[data-tile-id="discord"]');
    const search = page.locator('[data-tile-id="search"]');
    const firstBefore = await page.locator('.grid > [data-tile-id]').first().getAttribute('data-tile-id');
    await discord.dragTo(search);
    const firstAfter = await page.locator('.grid > [data-tile-id]').first().getAttribute('data-tile-id');
    if(firstBefore === firstAfter) throw new Error('tile drag did not change order');

    const guildField = page.locator('[data-tile-id="discord"] .builder-field').filter({hasText:'Server'}).first();
    const radioZone = page.locator('[data-tile-id="radio"] > .builder-field-zone');
    await guildField.dragTo(radioZone);
    if(await page.locator('[data-tile-id="radio"] #guild').count() !== 1) throw new Error('field drag did not move #guild to radio');

    await page.locator('#builderSave').click();
    await page.waitForTimeout(150);
    if(!savedLayout.fields.some(f=>f.id.includes('discord:label-') && f.tileId==='radio')) throw new Error('moved field was not persisted');

    await page.reload({waitUntil:'networkidle'});
    await page.locator('#layoutBuilderOpen').click();
    if(await page.locator('[data-tile-id="radio"] #guild').count() !== 1) throw new Error('moved field was not restored after reload');
    console.log(`UI builder browser test OK: ${await fields.count()} fields, tile reorder, cross-tile field move and persistence verified.`);
    apiServer.close();
  } finally {
    await browser.close();
    staticServer.kill('SIGTERM');
    server.close();
  }
})().catch(err=>{ console.error(err); staticServer.kill('SIGTERM'); server.close(); process.exit(1); });
