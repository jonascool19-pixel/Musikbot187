const { chromium } = require('playwright');
const http = require('http');
const childProcess = require('child_process');

const root = process.env.UI_TEST_ROOT || '/opt/radiobot/frontend';
const port = Number(process.env.UI_TEST_PORT || 4173);
let savedLayout = { preset:'midnight', name:'Browser Test', density:'comfortable', accent:'#7dd3fc', bg:'#070b14', panel:'#111929', tiles:[], fields:[] };
const guilds = [{ id:'g1', name:'Test Guild' }];
const channels = { voice:[{id:'v1',name:'Voice'}], text:[{id:'t1',name:'general'}] };

function sendJson(res,status,body){const data=Buffer.from(JSON.stringify(body));res.writeHead(status,{'Content-Type':'application/json','Content-Length':data.length});res.end(data);}
function routeApi(req,res){
  if(req.method==='GET'&&req.url==='/api/ui/layout')return sendJson(res,200,savedLayout);
  if(req.method==='PUT'&&req.url==='/api/ui/layout'){let body='';req.on('data',c=>body+=c);req.on('end',()=>{savedLayout=JSON.parse(body);sendJson(res,200,savedLayout);});return;}
  if(req.url==='/api/health')return sendJson(res,200,{ok:true,discord:false,version:'test',youtube:true,spotify:false});
  if(req.url==='/api/guilds')return sendJson(res,200,guilds);
  if(req.url==='/api/guilds/g1/channels')return sendJson(res,200,channels);
  if(req.url==='/api/state/g1')return sendJson(res,200,{guildId:'g1',voiceChannelId:'v1',statusChannelId:'',volume:80,paused:false,queue:[]});
  if(req.url==='/api/state/g1/queue')return sendJson(res,200,[]);
  if(req.url==='/api/radios'||req.url==='/api/media'||req.url==='/api/playlists')return sendJson(res,200,[]);
  if(req.url==='/api/update/status')return sendJson(res,200,{status:'idle'});
  if(req.url==='/api/setup/status')return sendJson(res,200,{complete:true});
  if(req.url==='/api/settings')return sendJson(res,200,{});
  if(req.url==='/api/metrics')return sendJson(res,200,{});
  if(req.url.startsWith('/api/search')||req.url.startsWith('/api/radio/search'))return sendJson(res,200,{local:[],radios:[],youtube:[],spotify:[]});
  return sendJson(res,200,{});
}

const server=http.createServer((req,res)=>req.url.startsWith('/api/')?routeApi(req,res):null);
const staticServer=childProcess.spawn('python3',['-m','http.server',String(port),'--directory',root],{stdio:'ignore'});

async function syntheticPointerDrag(page,sourceSelector,targetSelector){
  return page.evaluate(({sourceSelector,targetSelector})=>{
    const source=document.querySelector(sourceSelector); const target=document.querySelector(targetSelector);
    if(!source||!target)throw new Error(`drag nodes missing: ${sourceSelector} -> ${targetSelector}`);
    const sr=source.getBoundingClientRect(); const tr=target.getBoundingClientRect();
    const pointerId=77; const sx=sr.left+sr.width/2; const sy=sr.top+sr.height/2; const tx=tr.left+8; const ty=tr.top+tr.height/3;
    const init={bubbles:true,cancelable:true,pointerId,pointerType:'mouse',isPrimary:true,button:0,buttons:1,clientX:sx,clientY:sy};
    source.dispatchEvent(new PointerEvent('pointerdown',init));
    document.dispatchEvent(new PointerEvent('pointermove',{...init,clientX:tx,clientY:ty}));
    document.dispatchEvent(new PointerEvent('pointerup',{...init,clientX:tx,clientY:ty,buttons:0}));
    return {sourceRect:{x:sx,y:sy},targetRect:{x:tx,y:ty}};
  },{sourceSelector,targetSelector});
}

(async()=>{
  const browser=await chromium.launch({headless:true});
  const apiServer=server.listen(4174,'127.0.0.1');
  try{
    await new Promise(r=>setTimeout(r,300));
    const page=await browser.newPage({viewport:{width:1440,height:1000}});
    page.on('pageerror',err=>console.error('PAGEERROR',err.stack||err.message));
    page.on('console',msg=>{if(msg.type()==='error')console.error('PAGECONSOLE',msg.text());});
    await page.route('**/api/**',async route=>{
      const req=route.request();const u=new URL(req.url());const target=`http://127.0.0.1:4174${u.pathname}${u.search}`;
      const response=await fetch(target,{method:req.method(),headers:{'Content-Type':req.headers()['content-type']||'application/json'},body:req.method()==='GET'||req.method()==='HEAD'?undefined:req.postData()||undefined});
      return route.fulfill({status:response.status,headers:{'Content-Type':'application/json'},body:await response.text()});
    });
    await page.goto(`http://127.0.0.1:${port}/index.html`,{waitUntil:'networkidle'});
    await page.locator('#layoutBuilderOpen').waitFor();
    await page.locator('#layoutBuilderOpen').click();
    const diagnostics=await page.evaluate(()=>({tiles:[...document.querySelectorAll('.grid > [data-tile-id]')].map(e=>e.dataset.tileId),fields:[...document.querySelectorAll('.builder-field')].map(e=>e.dataset.fieldId),handles:[...document.querySelectorAll('.builder-tile-handle')].length,fieldHandles:[...document.querySelectorAll('.builder-field-handle')].length,builder:!!document.querySelector('#builderPanel')}));
    console.log('UI diagnostics',JSON.stringify(diagnostics));
    const fieldCount=await page.locator('.builder-field').count();
    if(fieldCount<8)throw new Error(`expected movable fields, got ${fieldCount}`);
    if(await page.locator('.builder-tile-handle').count()<8)throw new Error('expected tile drag handles');
    if(await page.locator('.builder-field-handle').count()<fieldCount)throw new Error('expected one field drag handle per field');

    const beforeOrder=await page.locator('.grid > [data-tile-id]').evaluateAll(els=>els.map(e=>e.dataset.tileId));
    const beforeDiscord=beforeOrder.indexOf('discord');
    const beforeSearch=beforeOrder.indexOf('search');
    await syntheticPointerDrag(page,'[data-tile-id="discord"] .builder-tile-handle','[data-tile-id="search"]');
    const afterOrder=await page.locator('.grid > [data-tile-id]').evaluateAll(els=>els.map(e=>e.dataset.tileId));
    const afterDiscord=afterOrder.indexOf('discord');
    const afterSearch=afterOrder.indexOf('search');
    if(beforeDiscord<0||beforeSearch<0||afterDiscord<0||afterSearch<0)throw new Error('discord/search tiles missing from order');
    if(afterDiscord===beforeDiscord&&afterSearch===beforeSearch)throw new Error(`tile drag did not change order: discord ${beforeDiscord}->${afterDiscord}, search ${beforeSearch}->${afterSearch}`);
    if(afterDiscord>=afterSearch)throw new Error(`tile drag produced wrong order: discord index ${afterDiscord}, search index ${afterSearch}`);

    const guildHandle=page.locator('[data-tile-id="discord"] .builder-field').filter({hasText:'Server'}).first().locator(':scope > .builder-field-handle');
    if(await guildHandle.count()!==1)throw new Error('Server field handle not found');
    const movedFrom=await page.locator('[data-field-id*="discord:"]').filter({hasText:'Server'}).first().getAttribute('data-field-id');
    await syntheticPointerDrag(page,'[data-field-id="'+movedFrom+'"] > .builder-field-handle','[data-tile-id="radio"] > .builder-field-zone');
    if(await page.locator('[data-tile-id="radio"] #guild').count()!==1)throw new Error('field drag did not move #guild to radio');

    await page.locator('#builderSave').click();
    await page.waitForTimeout(180);
    if(!savedLayout.fields.some(f=>f.id===movedFrom&&f.tileId==='radio'))throw new Error('moved field was not persisted');
    const savedFirst=savedLayout.tiles[0]?.id;
    await page.reload({waitUntil:'networkidle'});
    await page.locator('#layoutBuilderOpen').click();
    if(await page.locator('[data-tile-id="radio"] #guild').count()!==1)throw new Error('moved field was not restored after reload');
    const reloadedFirst=await page.locator('.grid > [data-tile-id]').first().getAttribute('data-tile-id');
    if(reloadedFirst!==savedFirst)throw new Error(`tile order was not restored: saved ${savedFirst}, reloaded ${reloadedFirst}`);
    console.log(`UI builder browser test OK: ${fieldCount} fields, tile reorder, cross-tile field move and persistence verified.`);
  }finally{
    await browser.close();apiServer.close();staticServer.kill('SIGTERM');server.close();
  }
})().catch(err=>{console.error(err);staticServer.kill('SIGTERM');server.close();process.exit(1);});
