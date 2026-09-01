const categories={problem:'Allgemeiner Fehler',playback:'Wiedergabe',discord:'Discord',spotify:'Spotify',autoplay:'Autoplay',update:'Update / System',other:'Sonstiges'};
const allowedTypes=new Set(['image/png','image/jpeg','image/webp','image/gif','video/mp4','video/webm','video/quicktime']);
const maxFileBytes=8*1024*1024,maxTotalBytes=16*1024*1024;

const clean=(value,max=2000)=>String(value??'').normalize('NFKC').replace(/[\u0000-\u001f\u007f]/g,' ').replace(/\s+/g,' ').trim().slice(0,max);
const redact=(value,max=1000)=>clean(value,Math.max(max*2,2000))
  .replace(/https?:\/\/(?:canary\.|ptb\.)?discord(?:app)?\.com\/api\/webhooks\/\d+\/[^\s]+/gi,'[Discord-WebHook entfernt]')
  .replace(/\bBearer\s+[^\s]+/gi,'Bearer [entfernt]')
  .replace(/\b(?:token|secret|password|passwort|authorization|client_secret|refresh_token|access_token)\s*[:=]\s*[^\s,;]+/gi,match=>`${match.split(/[:=]/,1)[0]}=[entfernt]`)
  .replace(/\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/gi,'[E-Mail entfernt]')
  .replace(/\b(?:\d{1,3}\.){3}\d{1,3}\b/g,'[IP entfernt]')
  .replace(/(https?:\/\/[^\s?#]+)\?[^\s#]*/gi,'$1?[Parameter entfernt]').slice(0,max);

function json(body,status=200){return new Response(JSON.stringify(body),{status,headers:{'content-type':'application/json; charset=utf-8','cache-control':'no-store','x-content-type-options':'nosniff'}})}
function webhookUrl(raw){try{const url=new URL(String(raw||''));return url.protocol==='https:'&&['discord.com','canary.discord.com','ptb.discord.com'].includes(url.hostname)&&/^\/api\/webhooks\/\d+\/[^/]+\/?$/.test(url.pathname)?url:null}catch{return null}}
function safeFileName(value,fallback='anhang'){const name=clean(value,100).replace(/[^\p{L}\p{N}_. -]+/gu,'_').replace(/^[ ._-]+|[ ._-]+$/g,'');return name||fallback}

export function normalizeIncomingReport(input){
  const report=input&&typeof input==='object'?input:{},id=clean(report.id,80),description=redact(report.description,2000),category=categories[report.category]?report.category:'other',diagnostics=(Array.isArray(report.diagnostics)?report.diagnostics:[]).slice(-20).map(entry=>({time:clean(entry?.time,40),level:['info','warn','error'].includes(entry?.level)?entry.level:'error',source:redact(entry?.source,120),message:redact(entry?.message,700)}));
  if(!/^MB187-\d{8}-[A-F0-9]{8}$/.test(id)||description.length<20)throw new Error('Ungültiger Fehlerbericht.');
  return {id,description,category,context:redact(report.context||'Dashboard',80),diagnostics,version:clean(report.version||'unbekannt',30),instanceId:clean(report.instanceId,80).replace(/[^a-z0-9-]/gi,''),reporterRole:report.reporterRole==='admin'?'Admin':'Benutzer',runtime:{node:clean(report.runtime?.node,30),platform:clean(report.runtime?.platform,30),arch:clean(report.runtime?.arch,30)},createdAt:clean(report.createdAt,40)};
}

export function discordPayload(report,attachments=[]){return {username:'MusikBot187 Support',allowed_mentions:{parse:[]},embeds:[{title:`🐞 ${categories[report.category]} · ${report.id}`,description:report.description,color:0xef4444,fields:[{name:'Bereich',value:report.context||'Dashboard',inline:true},{name:'Version',value:report.version||'unbekannt',inline:true},{name:'Rolle',value:report.reporterRole,inline:true},{name:'Installation',value:`${report.instanceId||'unbekannt'}\n${report.runtime.platform||'?'} · ${report.runtime.arch||'?'} · ${report.runtime.node||'?'}`}],footer:{text:'Privater MusikBot187-Fehlerbericht'},timestamp:report.createdAt||new Date().toISOString()}],attachments};}

async function handleReport(request,env){
  if(request.headers.get('x-musikbot-report')!=='1')return json({error:'Ungültiger Absender.'},403);
  const declared=Number(request.headers.get('content-length'));if(Number.isFinite(declared)&&declared>maxTotalBytes+256*1024)return json({error:'Bericht ist zu groß.'},413);
  let form;try{form=await request.formData()}catch{return json({error:'Ungültige Formulardaten.'},400)}
  let report;try{report=normalizeIncomingReport(JSON.parse(String(form.get('report')||'')))}catch(error){return json({error:error.message},400)}
  const rateKey=report.instanceId||request.headers.get('cf-connecting-ip')||'unknown';if(env.REPORT_RATE_LIMITER){const {success}=await env.REPORT_RATE_LIMITER.limit({key:rateKey});if(!success)return json({error:'Zu viele Berichte. Bitte später erneut versuchen.'},429)}
  const media=form.getAll('files').filter(value=>typeof value!=='string');if(media.length>3)return json({error:'Zu viele Anhänge.'},400);let total=0;for(const file of media){total+=file.size;if(!allowedTypes.has(file.type)||file.size<=0||file.size>maxFileBytes||total>maxTotalBytes)return json({error:'Ungültiger oder zu großer Anhang.'},400)}
  const target=webhookUrl(env.DISCORD_WEBHOOK_URL);if(!target)return json({error:'Support-Ziel ist nicht eingerichtet.'},503);target.searchParams.set('wait','true');
  const outbound=new FormData(),attachments=[];let index=0;for(const file of media){const filename=safeFileName(file.name,`anhang-${index+1}`);attachments.push({id:index,filename,description:'Vom meldenden MusikBot-Benutzer angehängt'});outbound.append(`files[${index}]`,file,filename);index++}
  if(report.diagnostics.length){const lines=report.diagnostics.map(entry=>`[${entry.level.toUpperCase()}] ${entry.time} · ${entry.source}\n${entry.message}`).join('\n\n'),filename=`diagnose-${report.id}.txt`;attachments.push({id:index,filename,description:'Automatisch bereinigte MusikBot187-Diagnose'});outbound.append(`files[${index}]`,new Blob([lines],{type:'text/plain;charset=utf-8'}),filename)}
  outbound.set('payload_json',JSON.stringify(discordPayload(report,attachments)));
  let response;try{response=await fetch(target,{method:'POST',body:outbound})}catch{return json({error:'Discord ist nicht erreichbar.'},502)}
  if(!response.ok)return json({error:'Discord hat den Bericht nicht angenommen.'},502);
  return json({ok:true,id:report.id},200);
}

export default {async fetch(request,env){const url=new URL(request.url);if(request.method==='GET'&&url.pathname==='/health')return json({ok:true,service:'MusikBot187 Support Relay'});if(request.method!=='POST'||url.pathname!=='/reports')return json({error:'Nicht gefunden.'},404);return handleReport(request,env)}};
