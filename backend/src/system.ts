import os from "node:os";
import {networkInterfaces} from "node:os";
export function system(){const mem=os.totalmem(),free=os.freemem();return {cpu:os.loadavg()[0],cores:os.cpus().length,ram:{total:mem,used:mem-free,free},uptime:os.uptime(),platform:process.platform,node:process.version}}
export function interfaces(){return Object.entries(networkInterfaces()).map(([name,a])=>({name,addresses:(a||[]).filter(x=>x.family==="IPv4").map(x=>x.address)}))}