import path from 'node:path';

export const bugReportLimits=Object.freeze({descriptionMin:20,descriptionMax:2000,contextMax:80,diagnostics:20,files:3,fileBytes:8*1024*1024,totalBytes:16*1024*1024});
export const bugReportCategories=Object.freeze(['problem','playback','discord','spotify','autoplay','update','other']);
const attachmentTypes=new Map([
  ['image/png','.png'],['image/jpeg','.jpg'],['image/webp','.webp'],['image/gif','.gif'],
  ['video/mp4','.mp4'],['video/webm','.webm'],['video/quicktime','.mov']
]);

export function sanitizeReportText(value,max=bugReportLimits.descriptionMax){
  return String(value??'').normalize('NFKC').replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/g,' ').replace(/\s+/g,' ').trim().slice(0,max);
}

export function redactSupportText(value,max=1000){
  let text=sanitizeReportText(value,Math.max(max*2,2000));
  text=text
    .replace(/https?:\/\/(?:canary\.|ptb\.)?discord(?:app)?\.com\/api\/webhooks\/\d+\/[^\s]+/gi,'[Discord-WebHook entfernt]')
    .replace(/\bBearer\s+[A-Za-z0-9._~+\/-]+=*/gi,'Bearer [entfernt]')
    .replace(/\b(?:token|secret|password|passwort|authorization|client_secret|refresh_token|access_token)\s*[:=]\s*[^\s,;]+/gi,match=>`${match.split(/[:=]/,1)[0]}=[entfernt]`)
    .replace(/\beyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}(?:\.[A-Za-z0-9_-]{8,})?\b/g,'[Token entfernt]')
    .replace(/\b[A-Za-z0-9_-]{20,}\.[A-Za-z0-9_-]{5,}\.[A-Za-z0-9_-]{20,}\b/g,'[Token entfernt]')
    .replace(/\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/gi,'[E-Mail entfernt]')
    .replace(/\b(?:\d{1,3}\.){3}\d{1,3}\b/g,'[IP entfernt]')
    .replace(/\b(?:[A-F0-9]{1,4}:){2,7}[A-F0-9]{1,4}\b/gi,'[IP entfernt]')
    .replace(/(https?:\/\/[^\s?#]+)\?[^\s#]*/gi,'$1?[Parameter entfernt]');
  return text.slice(0,max);
}

export function supportDiagnostics(entries,limit=bugReportLimits.diagnostics){
  return (Array.isArray(entries)?entries:[]).slice(-Math.max(0,limit)).map(entry=>({
    time:String(entry?.time||'').slice(0,40),
    level:['info','warn','error'].includes(String(entry?.level))?String(entry.level):'error',
    source:redactSupportText(entry?.source||'System',120),
    message:redactSupportText(entry?.message||'Unbekannter Fehler',700)
  }));
}

export function validateBugReportDescription(value){
  const description=sanitizeReportText(value);
  if(description.length<bugReportLimits.descriptionMin)throw new Error(`Bitte beschreibe den Fehler mit mindestens ${bugReportLimits.descriptionMin} Zeichen.`);
  return description;
}

export function safeBugReportCategory(value){return bugReportCategories.includes(String(value))?String(value):'other';}

export function validBugReportRelayUrl(raw){
  try{const url=new URL(String(raw||''));return url.protocol==='https:'&&!url.username&&!url.password&&!url.search&&!url.hash&&url.pathname.length>1?url:null}catch{return null}
}

function attachmentSignatureType(data,filename='',mimetype=''){
  if(data.subarray(0,8).equals(Buffer.from([0x89,0x50,0x4e,0x47,0x0d,0x0a,0x1a,0x0a])))return'image/png';
  if(data[0]===0xff&&data[1]===0xd8&&data[2]===0xff)return'image/jpeg';
  if(data.subarray(0,4).toString('ascii')==='RIFF'&&data.subarray(8,12).toString('ascii')==='WEBP')return'image/webp';
  if(/^GIF8[79]a$/.test(data.subarray(0,6).toString('ascii')))return'image/gif';
  if(data.subarray(0,4).equals(Buffer.from([0x1a,0x45,0xdf,0xa3])))return'video/webm';
  if(data.subarray(4,8).toString('ascii')==='ftyp')return path.extname(filename).toLowerCase()==='.mov'||mimetype==='video/quicktime'?'video/quicktime':'video/mp4';
  return'';
}

export function validateBugReportAttachment({filename,mimetype,data}){
  const declared=String(mimetype||'').toLowerCase(),buffer=Buffer.isBuffer(data)?data:Buffer.from(data||[]),original=path.basename(String(filename||'anhang'));
  if(!buffer.length||buffer.length>bugReportLimits.fileBytes)throw new Error('Jeder Anhang darf höchstens 8 MiB groß sein.');
  const type=attachmentSignatureType(buffer,original,declared),extension=attachmentTypes.get(type);
  if(!extension)throw new Error(`„${original.slice(0,100)}“ ist kein unterstütztes Bild oder Video. Erlaubt sind PNG, JPG, WebP, GIF, MP4, WebM und MOV.`);
  const stem=path.basename(original,path.extname(original)).normalize('NFKC').replace(/[^\p{L}\p{N}_. -]+/gu,'_').replace(/\s+/g,' ').replace(/^[ ._-]+|[ ._-]+$/g,'').slice(0,80)||'anhang';
  return {filename:`${stem}${extension}`,mimetype:type,data:buffer,size:buffer.length};
}

export function buildBugReport({id,description,category,context,diagnostics,version,instanceId,role,createdAt=new Date().toISOString()}){
  return {
    schema:1,
    id:String(id||'').slice(0,80),
    description:validateBugReportDescription(description),
    category:safeBugReportCategory(category),
    context:sanitizeReportText(context||'Dashboard',bugReportLimits.contextMax),
    diagnostics:supportDiagnostics(diagnostics),
    version:String(version||'unbekannt').slice(0,30),
    instanceId:String(instanceId||'').replace(/[^a-z0-9-]/gi,'').slice(0,80),
    reporterRole:role==='admin'?'admin':'user',
    runtime:{node:process.version,platform:process.platform,arch:process.arch},
    createdAt:String(createdAt).slice(0,40)
  };
}

async function responseJson(response){try{return await response.json()}catch{return {}}}

export async function sendBugReport({relayUrl,report,files=[],fetcher=fetch}){
  const url=validBugReportRelayUrl(relayUrl);if(!url)throw new Error('Der zentrale Support-Empfänger ist noch nicht eingerichtet.');
  const form=new FormData();form.set('report',JSON.stringify(report));
  for(const file of files)form.append('files',new Blob([file.data],{type:file.mimetype}),file.filename);
  const response=await fetcher(url,{method:'POST',headers:{'user-agent':`MusikBot187/${report.version}`,'x-musikbot-report':'1','x-musikbot-instance':report.instanceId},body:form,signal:AbortSignal.timeout(30_000)}),body=await responseJson(response);
  if(!response.ok)throw new Error(sanitizeReportText(body.error||`Zentraler Support-Empfänger antwortet mit HTTP ${response.status}.`,300));
  return {ok:true,id:String(body.id||report.id),delivered:true};
}
