import crypto from 'node:crypto';
const key=(token:string)=>crypto.createHash('sha256').update(token).digest();
export function encrypt(data:unknown,token:string){const iv=crypto.randomBytes(12);const cipher=crypto.createCipheriv('aes-256-gcm',key(token),iv);const ciphertext=Buffer.concat([cipher.update(JSON.stringify(data),'utf8'),cipher.final()]);return{iv:iv.toString('base64'),tag:cipher.getAuthTag().toString('base64'),ciphertext:ciphertext.toString('base64')};}
export function canonicalEnvelope(body:Record<string,unknown>){return [body.protocol_version,body.agent_id,body.platform,body.account_id,body.timestamp,body.nonce,body.collected_at,JSON.stringify(body.data)].join('\n');}
export function sign(body:Record<string,unknown>,token:string){return crypto.createHmac('sha256',token).update(canonicalEnvelope(body)).digest('hex');}
