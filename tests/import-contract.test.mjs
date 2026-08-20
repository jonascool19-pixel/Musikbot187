import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

const root=path.resolve('backend/src');
function exportsOf(file){const s=fs.readFileSync(file,'utf8');const names=new Set();for(const m of s.matchAll(/export\s+(?:async\s+function|function|const|let|var|class)\s+([A-Za-z_$][\w$]*)/g))names.add(m[1]);for(const m of s.matchAll(/export\s*\{([^}]+)\}/g)){for(const part of m[1].split(',')){const bits=part.trim().split(/\s+as\s+/);const n=bits[1]||bits[0];if(n)names.add(n)}}return names}
test('local module import/export contracts',()=>{for(const file of fs.readdirSync(root).filter(x=>x.endsWith('.js'))){const src=fs.readFileSync(path.join(root,file),'utf8');for(const m of src.matchAll(/import\s*\{([^}]+)\}\s*from\s*['"](\.\/[^'"]+\.js)['"]/g)){const target=path.resolve(root,m[2]);const ex=exportsOf(target);for(const n of m[1].split(',').map(x=>x.trim().split(/\s+as\s+/)[0]).filter(Boolean))assert.ok(ex.has(n),`${file} imports ${n} from ${path.basename(target)}, but it is not exported`)}}});
