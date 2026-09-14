import {test,expect} from '@playwright/test';

test('24-hour system measurement can be deliberately restarted and clears stale results immediately',async({page})=>{
  await page.addInitScript(()=>sessionStorage.setItem('musikbot187.auth','browser-resource-token'));
  let resetStarted=false,releaseReset;
  const resetGate=new Promise(resolve=>{releaseReset=resolve});
  await page.route('**/api/**',async route=>{
    const request=route.request(),url=new URL(request.url()),pathname=url.pathname,method=request.method();
    const json=body=>route.fulfill({contentType:'application/json',body:JSON.stringify(body)});
    if(pathname==='/api/auth/me')return json({user:{id:'owner',username:'browseradmin',role:'admin',permissions:[],isOwner:true}});
    if(pathname==='/api/state')return json({player:{queue:[],volume:75,mode:'queue',paused:false,playing:false},autoplay:{enabled:false,mode:'similar',playlistIds:[],queueTarget:5,status:'off',profile:{learnedTracks:0,totalListens:0,preferredStyles:[],preferredArtists:[],blockedStyles:[],excludedTracks:[],excludedPlaylistIds:[],styles:[],artists:[],top:[],tracks:[]}},settings:{botName:'Browser Jukebox',theme:'dark',accent:'#7c3aed',output:'none',outputId:null},connections:[],runtimes:[]});
    if(pathname==='/api/playlists')return json([]);
    if(pathname==='/api/notifications')return json({items:[],unread:0});
    if(pathname==='/api/monitoring')return json({time:new Date().toISOString(),cpu:{busyPercent:25,cores:2},memory:{used:536870912,total:2147483648,free:1610612736},network:{rxPerSecond:20000,txPerSecond:8000,rxTotal:100000,txTotal:40000},load:[.1,.2,.3],uptime:3600,disk:{used:512,total:1024,free:512}});
    if(pathname==='/api/monitoring/advisor'&&method==='GET')return json({samples:289,collectedHours:24,learningHours:24,progressPercent:100,startedAt:'2026-09-13T12:00:00.000Z',completedAt:'2026-09-14T12:00:00.000Z',completed:true,status:'completed',ready:true,cpu:{allocatedCores:2,averagePercent:22.1,minimumPercent:9.2,maximumPercent:61.4,averageCores:.44,maximumCores:1.23},memory:{averageBytes:268435456,minimumBytes:201326592,maximumBytes:440401920,averagePercent:12.5,minimumPercent:9.4,maximumPercent:20.5},network:{samples:289,averageRxBytesPerSecond:20000,p95RxBytesPerSecond:48000,maximumRxBytesPerSecond:1000000,averageTxBytesPerSecond:8000,p95TxBytesPerSecond:18000,maximumTxBytesPerSecond:200000},recommendation:{minimum:{cores:1,memoryBytes:1073741824,downloadMbps:1,uploadMbps:.5},optimal:{cores:2,memoryBytes:2147483648,downloadMbps:5,uploadMbps:2},basis:'95-Prozent-Wert mit Reserve'}});
    if(pathname==='/api/monitoring/advisor/reset'&&method==='POST'){
      resetStarted=true;await resetGate;return json({samples:0,collectedHours:0,learningHours:24,progressPercent:0,startedAt:null,completedAt:null,completed:false,status:'learning',ready:false,cpu:null,memory:null,network:null,recommendation:null});
    }
    if(pathname==='/api/connections')return json({connections:[],runtimes:[]});
    if(pathname==='/api/autoplay')return json({enabled:false,mode:'similar',playlistIds:[],queueTarget:5,status:'off',profile:{learnedTracks:0,totalListens:0,preferredStyles:[],preferredArtists:[],blockedStyles:[],excludedTracks:[],excludedPlaylistIds:[],styles:[],artists:[],top:[],tracks:[]}});
    return json({});
  });
  await page.goto('/');
  await expect(page.locator('#shell')).toBeVisible();
  await page.locator('#nav').getByRole('button',{name:'Monitoring'}).click();
  await expect(page.locator('#advisorCpuAverage')).toHaveText('22,1 %');
  const card=page.locator('.resource-advisor-card'),reset=card.getByRole('button',{name:'24-Stunden-Messung neu starten'}),collapse=card.locator(':scope > .panel-collapse');
  await expect(reset).toBeVisible();
  const resetBox=await reset.boundingBox(),collapseBox=await collapse.boundingBox();expect(resetBox.x+resetBox.width).toBeLessThanOrEqual(collapseBox.x+2);
  await reset.click({noWaitAfter:true});
  await expect.poll(()=>resetStarted).toBe(true);
  await expect(page.locator('#advisorCpuAverage')).toHaveText('–');
  await expect(page.locator('#advisorRamAverage')).toHaveText('–');
  await expect(page.locator('#advisorNetworkRxAverage')).toHaveText('–');
  await expect(page.locator('#advisorDuration')).toHaveText('0,0 von 24 Std.');
  releaseReset();
  await expect(page.locator('#advisorProgressText')).toContainText('Neue 24-Stunden-Messung');
});
