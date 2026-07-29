import fs from 'node:fs';
const pkg=JSON.parse(fs.readFileSync(new URL('../package.json',import.meta.url),'utf8'));
const lock=JSON.parse(fs.readFileSync(new URL('../package-lock.json',import.meta.url),'utf8'));
if(pkg.version!==lock.version||pkg.version!==lock.packages?.['']?.version)throw new Error(`版本不一致：package=${pkg.version} lock=${lock.version} root=${lock.packages?.['']?.version}`);
if(!/^\d+\.\d+\.\d+$/.test(pkg.version))throw new Error(`系统版本不是标准语义版本：${pkg.version}`);
console.log(`版本一致：v${pkg.version}`);
