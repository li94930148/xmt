/**
 * 生成自签名 HTTPS 证书（局域网用）
 * 运行：node scripts/generate-cert.mjs
 * 
 * 生成的文件：
 *   certs/server.key  - 私钥
 *   certs/server.cert - 证书
 */

import selfsigned from 'selfsigned';
import fs from 'fs';
import path from 'path';
import os from 'os';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const certsDir = path.join(__dirname, '..', 'certs');

// 获取本机局域网 IP
function getLanIPs() {
  const nets = os.networkInterfaces();
  const ips = [];
  for (const [name, addrs] of Object.entries(nets)) {
    for (const addr of addrs) {
      if (addr.family === 'IPv4' && !addr.internal) {
        ips.push(addr.address);
      }
    }
  }
  return ips;
}

const lanIPs = getLanIPs();
console.log('🌐 检测到局域网 IP:', lanIPs.join(', ') || '无');

const attrs = [
  { name: 'commonName', value: 'xmt-local' },
  { name: 'organizationName', value: 'XMT Local Dev' },
];

const extensions = [
  {
    name: 'subjectAltName',
    altNames: [
      { type: 2, value: 'localhost' },
      { type: 7, ip: '127.0.0.1' },
      ...lanIPs.map(ip => ({ type: 7, ip })),
    ],
  },
];

console.log('🔐 正在生成自签名证书...');
const pems = await selfsigned.generate(attrs, {
  days: 3650,         // 10年有效期
  keySize: 2048,
  extensions,
  algorithm: 'sha256',
});

// 确保目录存在
if (!fs.existsSync(certsDir)) {
  fs.mkdirSync(certsDir, { recursive: true });
}

// 写入文件
fs.writeFileSync(path.join(certsDir, 'server.key'), pems.private);
fs.writeFileSync(path.join(certsDir, 'server.cert'), pems.cert);
fs.writeFileSync(path.join(certsDir, 'server.pem'), pems.cert + pems.private);

console.log('');
console.log('✅ 证书已生成到 certs/ 目录：');
console.log('   certs/server.key  - 私钥');
console.log('   certs/server.cert - 证书');
console.log('   certs/server.pem  - 合并文件');
console.log('');
console.log('📋 证书包含以下地址：');
console.log('   - localhost');
console.log('   - 127.0.0.1');
lanIPs.forEach(ip => console.log(`   - ${ip}`));
console.log('');
console.log('⚠️  首次通过 HTTPS 访问时，浏览器会提示"不安全"，点击"高级"→"继续访问"即可。');
console.log('   之后不会再提示。');
