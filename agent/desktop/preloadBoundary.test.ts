import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import test from 'node:test';

const root=process.cwd();
const forbidden=/node:crypto|require\(\s*['\"](?:node:)?crypto['\"]\s*\)|createHmac|safeStorage|AgentConfig|mainOnlyAccountIdentity/i;
const runtimeImports=(file:string)=>[...readFileSync(file,'utf8').matchAll(/require\(['\"](\.\/?[^'\"]+)['\"]\)|from\s+['\"](\.\/?[^'\"]+)['\"]/g)].map((match)=>match[1]||match[2]);
const visit=(file:string, seen=new Set<string>()):string[]=>{if(seen.has(file))return [];seen.add(file);const source=readFileSync(file,'utf8');const children=runtimeImports(file).flatMap((item)=>{const target=path.resolve(path.dirname(file),item);const resolved=[target,`${target}.js`,`${target}.ts`].find(existsSync);return resolved?visit(resolved,seen):[];});return [file,source,...children];};

test('preload dependency closure is browser-safe in source and final compiled output',()=>{
  const sourceFiles=visit(path.join(root,'desktop','preload.ts'));
  assert.equal(sourceFiles.some((entry)=>forbidden.test(entry)),false,'preload source closure contains a Main-only or Node runtime dependency');
  const compiled=visit(path.join(root,'dist-desktop','desktop','preload.js'));
  assert.equal(compiled.some((entry)=>forbidden.test(entry)),false,'compiled preload closure contains a Main-only or Node runtime dependency');
  const main=readFileSync(path.join(root,'dist-desktop','desktop','mainOnlyAccountIdentity.js'),'utf8');
  assert.match(main,/node:crypto|createHmac/,'Main-only HMAC must remain in Electron Main');
});

test('source boundary names make an accidental Main-only preload import detectable',()=>{
  const preload=readFileSync(path.join(root,'desktop','preload.ts'),'utf8');
  const contract=readFileSync(path.join(root,'desktop','browserSafeRendererContract.ts'),'utf8');
  assert.doesNotMatch(preload,/mainOnlyAccountIdentity|rendererContract/);
  assert.doesNotMatch(contract,/node:|AgentConfig|mainOnlyAccountIdentity/);
});
