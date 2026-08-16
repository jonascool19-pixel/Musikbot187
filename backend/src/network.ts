import os from "node:os";
import {execFile} from "node:child_process";
import {promisify} from "node:util";
const exec=promisify(execFile);
export async function network(){const n=os.networkInterfaces();const cards=Object.entries(n).map(([name,addrs])=>({name,addresses:(addrs||[]).filter(x=>x.family==="IPv4"&&!x.internal).map(x=>x.address)}));let rows:any[]=[];try{const {stdout}=await exec("ip",["-s","link"]);let current="";for(const line of stdout.split("\n")){const m=line.match(/^\d+: ([^:]+):/);if(m)current=m[1];const nums=line.trim().split(/\s+/);if(current&&nums.length>=8&&/^\d+$/.test(nums[0]))rows.push({name:current,rx:Number(nums[0]),tx:Number(nums[8]||0)})}}catch{}return {cards,interfaces:rows,hostname:os.hostname()}}