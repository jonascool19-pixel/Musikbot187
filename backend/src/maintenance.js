import fs from 'node:fs/promises';
import path from 'node:path';

export const maintenanceTimePattern=/^(?:[01]\d|2[0-3]):[0-5]\d$/;

export function maintenanceMoment(date=new Date(),timeZone='Europe/Berlin'){
  const parts=Object.fromEntries(new Intl.DateTimeFormat('en-CA',{timeZone,year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',hourCycle:'h23'}).formatToParts(date).filter(part=>part.type!=='literal').map(part=>[part.type,part.value]));
  return {date:`${parts.year}-${parts.month}-${parts.day}`,time:`${parts.hour}:${parts.minute}`};
}

export function maintenanceDue(settings,now=new Date()){
  const time=String(settings?.maintenanceTime||'');if(!settings?.maintenanceEnabled||time.length!==5||!maintenanceTimePattern.test(time))return null;
  const moment=maintenanceMoment(now,settings.maintenanceTimezone||'Europe/Berlin');
  return moment.time===time&&settings.maintenanceLastRun!==moment.date?moment:null;
}

export async function cleanupStaleUploads(root,{now=Date.now(),maxAgeMs=60*60*1000}={}){
  let removed=0;for(const entry of await fs.readdir(root,{withFileTypes:true}).catch(()=>[])){if(!entry.isFile()||!entry.name.endsWith('.upload'))continue;const file=path.join(root,entry.name),stat=await fs.stat(file).catch(()=>null);if(stat&&now-stat.mtimeMs>=maxAgeMs){await fs.rm(file,{force:true});removed++;}}
  return removed;
}
