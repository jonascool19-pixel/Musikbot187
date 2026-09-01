import fs from 'node:fs/promises';
import path from 'node:path';

const file=path.resolve('.codex/work-status.md'),argumentsList=process.argv.slice(2),values={};
for(let index=0;index<argumentsList.length;index+=2){const key=argumentsList[index]?.replace(/^--/,'');if(!key||!argumentsList[index+1])throw new Error('Use pairs such as --current "Current task".');values[key]=argumentsList[index+1].trim();}
const required=['status','current','completed','next','checks','base'];
for(const key of required)if(!values[key])throw new Error(`Missing --${key}.`);
const safe=value=>String(value).replaceAll('\r','').trim();
const content=`# Codex work status

Last updated: ${new Date().toISOString()}
Status: ${safe(values.status)}
Base: ${safe(values.base)}

## Currently working on

${safe(values.current)}

## Last completed

${safe(values.completed)}

## Next

${safe(values.next)}

## Verification

${safe(values.checks)}

## Safety note

This file must never contain passwords, generated temporary passwords, tokens, private logs, or personal data.
`;
await fs.mkdir(path.dirname(file),{recursive:true});
await fs.writeFile(file,content,'utf8');
console.log(path.relative(process.cwd(),file));
