import assert from 'node:assert/strict';
import test from 'node:test';
import {buildBugReport,redactSupportText,sendBugReport,supportDiagnostics,validateBugReportAttachment,validBugReportRelayUrl} from '../backend/src/bug-report.js';
import supportRelay,{discordPayload,normalizeIncomingReport} from '../support-relay/src/index.js';

const png=Buffer.from([0x89,0x50,0x4e,0x47,0x0d,0x0a,0x1a,0x0a,0,0,0,0]);
const reportInput=()=>buildBugReport({id:'MB187-20260901-A1B2C3D4',description:'Beim Start der Wiedergabe bleibt der Player reproduzierbar stehen.',category:'playback',context:'Dashboard',diagnostics:[{time:'2026-09-01T05:00:00Z',level:'error',source:'discord',message:'token=very-secret 192.168.1.25 jonas@example.com https://discord.com/api/webhooks/123456/secret'}],version:'1.8.7',instanceId:'12345678-1234-1234-1234-123456789012',role:'user'});

test('support report text and diagnostics remove secrets and personal network data',()=>{
  const value=redactSupportText('Bearer abc.def token=topsecret mail@example.com 10.0.0.1 https://example.test/path?secret=yes');
  assert.doesNotMatch(value,/abc\.def|topsecret|mail@example|10\.0\.0\.1|secret=yes/);
  const diagnostics=supportDiagnostics(reportInput().diagnostics);assert.equal(diagnostics.length,1);assert.doesNotMatch(diagnostics[0].message,/very-secret|192\.168|jonas@example|api\/webhooks/);
  assert.equal(validBugReportRelayUrl('https://support.example/reports').hostname,'support.example');assert.equal(validBugReportRelayUrl('http://support.example/reports'),null);
});

test('bug report attachments use verified media signatures and bounded safe names',()=>{
  const file=validateBugReportAttachment({filename:'Fehler Foto!!.PNG',mimetype:'image/png',data:png});assert.equal(file.filename,'Fehler Foto.png');assert.equal(file.size,png.length);
  const inferred=validateBugReportAttachment({filename:'Screenshot.JPEG',mimetype:'application/octet-stream',data:Buffer.from([0xff,0xd8,0xff,0,0])});assert.equal(inferred.mimetype,'image/jpeg');assert.equal(inferred.filename,'Screenshot.jpg');
  assert.throws(()=>validateBugReportAttachment({filename:'fake.png',mimetype:'image/png',data:Buffer.from('not an image')}),/kein unterstütztes Bild oder Video/);
  assert.throws(()=>validateBugReportAttachment({filename:'script.html',mimetype:'text/html',data:Buffer.from('<html>')}),/kein unterstütztes Bild oder Video/);
});

test('installation sender delivers multipart data only to a valid HTTPS relay',async()=>{
  let received;const fetcher=async(url,options)=>{received={url:String(url),options,report:JSON.parse(options.body.get('report')),files:options.body.getAll('files')};return new Response(JSON.stringify({ok:true,id:'MB187-20260901-A1B2C3D4'}),{status:200,headers:{'content-type':'application/json'}})};
  const report=reportInput(),file=validateBugReportAttachment({filename:'bild.png',mimetype:'image/png',data:png}),result=await sendBugReport({relayUrl:'https://support.example/reports',report,files:[file],fetcher});
  assert.equal(result.delivered,true);assert.equal(received.url,'https://support.example/reports');assert.equal(received.options.headers['x-musikbot-report'],'1');assert.equal(received.report.id,report.id);assert.equal(received.files.length,1);
  await assert.rejects(()=>sendBugReport({relayUrl:'http://support.example/reports',report,fetcher}),/nicht eingerichtet/);
});

test('central relay validates reports again and creates a mention-safe Discord payload',()=>{
  const normalized=normalizeIncomingReport({...reportInput(),description:'Fehler mit token=still-secret und user@example.com seit dem letzten Start.'});assert.doesNotMatch(normalized.description,/still-secret|user@example/);
  const payload=discordPayload(normalized,[{id:0,filename:'bild.png'}]);assert.deepEqual(payload.allowed_mentions,{parse:[]});assert.match(payload.embeds[0].title,/Wiedergabe/);assert.equal(payload.attachments.length,1);
});

test('central relay forwards media and a sanitized diagnostic file to the private webhook',async t=>{
  const originalFetch=globalThis.fetch;let discordRequest;t.after(()=>{globalThis.fetch=originalFetch});globalThis.fetch=async(url,options)=>{discordRequest={url:String(url),form:options.body};return new Response(JSON.stringify({id:'discord-message'}),{status:200,headers:{'content-type':'application/json'}})};
  const form=new FormData();form.set('report',JSON.stringify(reportInput()));form.append('files',new Blob([png],{type:'image/png'}),'bild.png');const request=new Request('https://relay.example/reports',{method:'POST',headers:{'x-musikbot-report':'1'},body:form}),response=await supportRelay.fetch(request,{DISCORD_WEBHOOK_URL:'https://discord.com/api/webhooks/123456/private-token',REPORT_RATE_LIMITER:{limit:async()=>({success:true})}});
  assert.equal(response.status,200);assert.match(discordRequest.url,/wait=true/);const payload=JSON.parse(discordRequest.form.get('payload_json'));assert.deepEqual(payload.allowed_mentions,{parse:[]});assert.equal(discordRequest.form.getAll('files[0]').length,1);assert.equal(discordRequest.form.getAll('files[1]').length,1);
});
