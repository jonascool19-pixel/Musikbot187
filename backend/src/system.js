import os from 'node:os';import {stat} from 'node:fs/promises';import path from 'node:path';
export function systemInfo(){return{hostname:os.hostname(),platform:process.platform,arch:process.arch,node:process.version,uptime:os.uptime(),cpus:os.cpus().length,memory:{total:os.totalmem(),free:os.freemem()},load:os.loadavg()};}
export function networkInfo(){return{hostname:os.hostname(),interfaces:Object.entries(os.networkInterfaces()).map(([name,values])=>({name,addresses:(values||[]).map(v=>({address:v.address,family:v.family,internal:v.internal}))}))};}
export async function storageInfo(dir){try{const s=await stat(dir);return{path:path.resolve(dir),exists:true,directory:s.isDirectory()};}catch{return{path:path.resolve(dir),exists:false,directory:false};}}
