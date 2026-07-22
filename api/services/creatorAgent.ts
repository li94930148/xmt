import crypto from 'node:crypto';
import bcrypt from 'bcrypt';
import { execute, executeInsert, queryOne } from '../database/utils.js';
type AgentRow = { id:number; user_id:number; platform:string; account_id:string; token_hash:string };
const key=(token:string)=>crypto.createHash('sha256').update(token).digest();
const canonical=(body:Record<string,unknown>)=>[body.agent_id,body.platform,body.account_id,body.collected_at,JSON.stringify(body.data)].join('\n');
export async function registerCreatorAgent(userId:number,platform:string,accountId:string,deviceId:string){
  if(platform!=='douyin'||!accountId||!deviceId)throw Object.assign(new Error('platform、account_id 和 device_id 必填'),{statusCode:400});
  const token=crypto.randomBytes(32).toString('base64url'); const hash=await bcrypt.hash(token,12); const keyHash=crypto.createHash('sha256').update(key(token)).digest('hex');
  const existing=await queryOne<{id:number}>('SELECT id FROM creator_agents WHERE user_id=? AND platform=? AND device_id=?',[userId,platform,deviceId]); let id:number;
  if(existing){id=existing.id;await execute(`UPDATE creator_agents SET account_id=?,token_hash=?,encryption_key_hash=?,last_active_at=CURRENT_TIMESTAMP WHERE id=?`,[accountId,hash,keyHash,id]);}
  else id=await executeInsert(`INSERT INTO creator_agents(user_id,platform,account_id,device_id,token_hash,encryption_key_hash,last_active_at)VALUES(?,?,?,?,?,?,CURRENT_TIMESTAMP)`,[userId,platform,accountId,deviceId,hash,keyHash]);
  return{agent_id:id,agent_token:token,platform,account_id:accountId,device_id:deviceId};
}
export async function acceptCreatorAgentReport(body:Record<string,unknown>,authorization?:string){
  const token=authorization?.match(/^Bearer\s+(.+)$/i)?.[1]; const agent=await queryOne<AgentRow>('SELECT id,user_id,platform,account_id,token_hash FROM creator_agents WHERE id=?',[Number(body.agent_id)]);
  if(!token||!agent||!(await bcrypt.compare(token,agent.token_hash)))throw Object.assign(new Error('Agent 身份认证失败'),{statusCode:401});
  if(body.platform!==agent.platform||String(body.account_id)!==agent.account_id)throw Object.assign(new Error('Agent 设备或平台账号绑定不匹配'),{statusCode:403});
  const expected=crypto.createHmac('sha256',token).update(canonical(body)).digest('hex'); const supplied=String(body.signature||'');
  if(supplied.length!==expected.length||!crypto.timingSafeEqual(Buffer.from(expected),Buffer.from(supplied)))throw Object.assign(new Error('上传签名验证失败'),{statusCode:401});
  const envelope=body.data as {iv?:string;tag?:string;ciphertext?:string}; if(!envelope?.iv||!envelope.tag||!envelope.ciphertext)throw Object.assign(new Error('data 必须是 AES-256-GCM 加密信封'),{statusCode:400});
  let plaintext:string;try{const decipher=crypto.createDecipheriv('aes-256-gcm',key(token),Buffer.from(envelope.iv,'base64'));decipher.setAuthTag(Buffer.from(envelope.tag,'base64'));plaintext=decipher.update(envelope.ciphertext,'base64','utf8')+decipher.final('utf8');JSON.parse(plaintext);}catch{throw Object.assign(new Error('上传数据解密失败'),{statusCode:400});}
  const snapshotId=await executeInsert(`INSERT INTO creator_data_snapshots(user_id,platform,account_id,snapshot_time,data_json,source,agent_id)VALUES(?,?,?,?,?,'local_agent',?)`,[agent.user_id,agent.platform,agent.account_id,String(body.collected_at),plaintext,agent.id]); await execute(`UPDATE creator_agents SET last_active_at=CURRENT_TIMESTAMP WHERE id=?`,[agent.id]); return{success:true,snapshot_id:snapshotId,source:'local_agent'};
}
