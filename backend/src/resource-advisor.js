export const resourceLearningMs=24*60*60_000;
export const resourceHistoryMs=resourceLearningMs;
export const resourceHistoryLimit=2016;
export const resourceMinimumSamples=144;
const resourceCoverageToleranceMs=30*60_000;
const mib=1024*1024;
const finite=value=>Number.isFinite(Number(value));
const average=values=>values.length?values.reduce((sum,value)=>sum+value,0)/values.length:0;
const percentile=(values,fraction)=>{const sorted=[...values].sort((a,b)=>a-b);return sorted[Math.max(0,Math.ceil(sorted.length*fraction)-1)]||0};
const rounded=(value,digits=1)=>Math.round(value*10**digits)/10**digits;
const roundMemory=value=>Math.ceil(value/(256*mib))*256*mib;
const roundBandwidth=value=>Math.ceil(Math.max(0,value)*10)/10;
const validSample=sample=>finite(sample?.cpuPercent)&&finite(sample?.cores)&&Number(sample.cores)>=1&&finite(sample?.memoryUsed)&&finite(sample?.memoryTotal)&&Number(sample.memoryTotal)>0&&Number.isFinite(Date.parse(sample?.time));
const sortedSamples=data=>(Array.isArray(data?.resourceHistory)?data.resourceHistory:[]).filter(validSample).sort((a,b)=>Date.parse(a.time)-Date.parse(b.time));
const iso=time=>new Date(time).toISOString();

function normalizeMeasurement(data){
  if(!data||typeof data!=='object')return {measurement:{version:1,startedAt:null,completedAt:null},changed:false};
  const current=data.resourceMeasurement&&typeof data.resourceMeasurement==='object'?data.resourceMeasurement:null;
  if(current&&current.version===1){
    const started=Number.isFinite(Date.parse(current.startedAt))?current.startedAt:null,completed=Number.isFinite(Date.parse(current.completedAt))?current.completedAt:null;
    if(started===current.startedAt&&completed===current.completedAt)return {measurement:current,changed:false};
    data.resourceMeasurement={version:1,startedAt:started,completedAt:completed};return {measurement:data.resourceMeasurement,changed:true};
  }
  const samples=sortedSamples(data);let startedAt=null,completedAt=null;
  if(samples.length){
    const first=Date.parse(samples[0].time),last=Date.parse(samples.at(-1).time);
    if(last-first>=resourceLearningMs){
      const start=last-resourceLearningMs;startedAt=iso(start);completedAt=iso(last);
      data.resourceHistory=samples.filter(sample=>Date.parse(sample.time)>=start&&Date.parse(sample.time)<=last).slice(-resourceHistoryLimit);
    }else{startedAt=iso(first);data.resourceHistory=samples.slice(-resourceHistoryLimit);}
  }else data.resourceHistory=[];
  data.resourceMeasurement={version:1,startedAt,completedAt};
  return {measurement:data.resourceMeasurement,changed:true};
}

function resourceSample(system,time){
  const cpuPercent=Number(system?.cpu?.busyPercent),cores=Number(system?.cpu?.cores),memoryUsed=Number(system?.memory?.used),memoryTotal=Number(system?.memory?.total),rxBytesPerSecond=Number(system?.network?.rxPerSecond),txBytesPerSecond=Number(system?.network?.txPerSecond);
  if(!finite(cpuPercent)||!finite(cores)||cores<1||!finite(memoryUsed)||!finite(memoryTotal)||memoryTotal<=0||!Number.isFinite(time))return null;
  return {time:iso(time),cpuPercent:Math.max(0,Math.min(100,cpuPercent)),cores:Math.max(1,Math.round(cores)),memoryUsed:Math.max(0,memoryUsed),memoryTotal:Math.max(1,memoryTotal),...(finite(rxBytesPerSecond)&&finite(txBytesPerSecond)?{rxBytesPerSecond:Math.max(0,rxBytesPerSecond),txBytesPerSecond:Math.max(0,txBytesPerSecond)}:{})};
}

export function recordResourceSample(data,system,now=new Date()){
  if(!data||typeof data!=='object')return false;
  const normalized=normalizeMeasurement(data),measurement=normalized.measurement;
  if(measurement.completedAt)return normalized.changed;
  const time=now.getTime(),sample=resourceSample(system,time);if(!sample)return normalized.changed;
  if(!Array.isArray(data.resourceHistory))data.resourceHistory=[];
  if(!measurement.startedAt){measurement.startedAt=sample.time;data.resourceHistory=[];data.resourceHistory.push(sample);return true;}
  const started=Date.parse(measurement.startedAt),ends=started+resourceLearningMs;
  if(!Number.isFinite(started)){measurement.startedAt=sample.time;measurement.completedAt=null;data.resourceHistory=[sample];return true;}
  if(time>=ends){
    const existing=sortedSamples(data),last=existing.length?Date.parse(existing.at(-1).time):started;
    if(last<ends&&time-ends<=resourceCoverageToleranceMs){data.resourceHistory.push({...sample,time:iso(ends)});data.resourceHistory=data.resourceHistory.filter(validSample).sort((a,b)=>Date.parse(a.time)-Date.parse(b.time)).slice(-resourceHistoryLimit);}
    measurement.completedAt=iso(ends);return true;
  }
  data.resourceHistory.push(sample);data.resourceHistory=data.resourceHistory.filter(validSample).sort((a,b)=>Date.parse(a.time)-Date.parse(b.time)).slice(-resourceHistoryLimit);return true;
}

export function resetResourceMeasurement(data){
  if(!data||typeof data!=='object')return false;
  data.resourceHistory=[];data.resourceMeasurement={version:1,startedAt:null,completedAt:null};return true;
}

export function resourceAdvisor(data,now=new Date()){
  const {measurement}=normalizeMeasurement(data),samples=sortedSamples(data),started=Number.isFinite(Date.parse(measurement.startedAt))?Date.parse(measurement.startedAt):null,plannedEnd=started===null?null:started+resourceLearningMs,storedCompleted=Number.isFinite(Date.parse(measurement.completedAt))?Date.parse(measurement.completedAt):null,completed=storedCompleted!==null||plannedEnd!==null&&now.getTime()>=plannedEnd,effectiveEnd=storedCompleted??plannedEnd,elapsed=started===null?0:completed?resourceLearningMs:Math.max(0,Math.min(resourceLearningMs,now.getTime()-started)),base={samples:samples.length,collectedHours:rounded(elapsed/3_600_000,1),learningHours:24,progressPercent:started===null?0:completed?100:Math.min(100,Math.round(elapsed/resourceLearningMs*100)),startedAt:started===null?null:iso(started),completedAt:completed&&effectiveEnd!==null?iso(effectiveEnd):null,completed,status:completed?'insufficient':'learning',ready:false,cpu:null,memory:null,network:null,recommendation:null};
  if(!samples.length)return base;
  const cpuPercent=samples.map(sample=>Math.max(0,Math.min(100,Number(sample.cpuPercent)))),coreUse=samples.map((sample,index)=>cpuPercent[index]/100*Math.max(1,Number(sample.cores))),memoryUsed=samples.map(sample=>Math.max(0,Number(sample.memoryUsed))),memoryPercent=samples.map(sample=>Math.max(0,Math.min(100,Number(sample.memoryUsed)/Number(sample.memoryTotal)*100))),networkSamples=samples.filter(sample=>finite(sample.rxBytesPerSecond)&&finite(sample.txBytesPerSecond)),rxRates=networkSamples.map(sample=>Math.max(0,Number(sample.rxBytesPerSecond))),txRates=networkSamples.map(sample=>Math.max(0,Number(sample.txBytesPerSecond))),first=Date.parse(samples[0].time),last=Date.parse(samples.at(-1).time),sampleSpan=Math.max(0,last-first),ready=completed&&sampleSpan>=resourceLearningMs-resourceCoverageToleranceMs&&samples.length>=resourceMinimumSamples,p95Cores=percentile(coreUse,.95),p95Memory=percentile(memoryUsed,.95),p95Rx=percentile(rxRates,.95),p95Tx=percentile(txRates,.95),minimumCores=Math.max(1,Math.ceil(p95Cores/.85)),optimalCores=Math.max(minimumCores,Math.ceil(p95Cores/.6)),minimumMemory=roundMemory(Math.max(1024*mib,p95Memory*1.2)),optimalMemory=roundMemory(Math.max(minimumMemory,p95Memory*1.5)),minimumDownload=roundBandwidth(Math.max(1,p95Rx*8/1_000_000*1.5)),minimumUpload=roundBandwidth(Math.max(.5,p95Tx*8/1_000_000*1.5)),optimalDownload=roundBandwidth(Math.max(5,p95Rx*8/1_000_000*2.5)),optimalUpload=roundBandwidth(Math.max(2,p95Tx*8/1_000_000*2.5)),network=networkSamples.length?{samples:networkSamples.length,averageRxBytesPerSecond:Math.round(average(rxRates)),minimumRxBytesPerSecond:Math.round(Math.min(...rxRates)),maximumRxBytesPerSecond:Math.round(Math.max(...rxRates)),p95RxBytesPerSecond:Math.round(p95Rx),averageTxBytesPerSecond:Math.round(average(txRates)),minimumTxBytesPerSecond:Math.round(Math.min(...txRates)),maximumTxBytesPerSecond:Math.round(Math.max(...txRates)),p95TxBytesPerSecond:Math.round(p95Tx)}:null;
  return {...base,status:ready?'completed':completed?'insufficient':'learning',ready,cpu:{allocatedCores:Number(samples.at(-1).cores),averagePercent:rounded(average(cpuPercent)),minimumPercent:rounded(Math.min(...cpuPercent)),maximumPercent:rounded(Math.max(...cpuPercent)),p95Percent:rounded(percentile(cpuPercent,.95)),averageCores:rounded(average(coreUse),2),maximumCores:rounded(Math.max(...coreUse),2),p95Cores:rounded(p95Cores,2)},memory:{totalBytes:Number(samples.at(-1).memoryTotal),averageBytes:Math.round(average(memoryUsed)),minimumBytes:Math.round(Math.min(...memoryUsed)),maximumBytes:Math.round(Math.max(...memoryUsed)),p95Bytes:Math.round(p95Memory),averagePercent:rounded(average(memoryPercent)),minimumPercent:rounded(Math.min(...memoryPercent)),maximumPercent:rounded(Math.max(...memoryPercent)),p95Percent:rounded(percentile(memoryPercent,.95))},network,recommendation:ready?{minimum:{cores:minimumCores,memoryBytes:minimumMemory,downloadMbps:minimumDownload,uploadMbps:minimumUpload},optimal:{cores:optimalCores,memoryBytes:optimalMemory,downloadMbps:optimalDownload,uploadMbps:optimalUpload},basis:'95-Prozent-Wert mit Reserve'}:null};
}
