import crypto from "node:crypto";
import bcrypt from "bcrypt";
import {
  execute,
  executeInsert,
  queryAll,
  queryOne,
} from "../database/utils.js";
type AgentRow = {
  id: number;
  user_id: number;
  platform: string;
  account_id: string;
  token_hash: string;
};
type Payload = {
  platform?: string;
  source?: string;
  collected_at?: string;
  account?: unknown;
  works?: Array<Record<string, unknown>>;
  work_details?: Array<Record<string, unknown>>;
  dashboard?: unknown;
  content_analysis?: unknown;
  fans?: unknown;
};
const bindingHash=(code:string)=>crypto.createHash('sha256').update(code).digest('hex');
export async function createCreatorAgentBindingCode(userId:number,accountId:string,ttlMinutes=10){if(!accountId)throw Object.assign(new Error('account_id 必填'),{statusCode:400});const code=crypto.randomBytes(18).toString('base64url');const expiresAt=new Date(Date.now()+Math.max(1,Math.min(30,ttlMinutes))*60_000).toISOString();await executeInsert('INSERT INTO creator_agent_binding_codes(user_id,platform,account_id,code_hash,expires_at)VALUES(?,?,?,?,?)',[userId,'douyin',accountId,bindingHash(code),expiresAt]);return{binding_code:code,expires_at:expiresAt,one_time:true};}
export async function bindCreatorAgent(code:string,device:Record<string,unknown>){if(!code)throw Object.assign(new Error('绑定码必填'),{statusCode:400});const row=await queryOne<{id:number;user_id:number;platform:string;account_id:string;expires_at:string;used_at:string|null}>('SELECT id,user_id,platform,account_id,expires_at,used_at FROM creator_agent_binding_codes WHERE code_hash=?',[bindingHash(code)]);if(!row||row.used_at||Date.parse(row.expires_at)<=Date.now())throw Object.assign(new Error('绑定码无效、已使用或已过期'),{statusCode:410});const deviceId=String(device.device_id||'');if(!deviceId)throw Object.assign(new Error('设备标识必填'),{statusCode:400});const claimed=await execute('UPDATE creator_agent_binding_codes SET used_at=CURRENT_TIMESTAMP WHERE id=? AND used_at IS NULL',[row.id]);if(claimed!==1)throw Object.assign(new Error('绑定码已被使用'),{statusCode:410});const bound=await registerCreatorAgent(row.user_id,row.platform,row.account_id,deviceId);await execute(`UPDATE creator_agents SET device_name=?,os=?,agent_version=?,protocol_version=?,browser_type=?,browser_version=?,browser_engine=?,browser_runtime=?,browser_session_mode=?,browser_compatibility=? WHERE id=?`,[String(device.device_name||''),String(device.os||''),String(device.agent_version||''),Number(device.protocol_version)||1,String(device.browser_type||''),String(device.browser_version||''),String(device.browser_engine||''),String(device.browser_runtime||''),String(device.session_mode||''),String(device.compatibility_status||'not_tested'),bound.agent_id]);return bound;}
const key = (token: string) =>
  crypto.createHash("sha256").update(token).digest();
const canonical = (body: Record<string, unknown>) =>
  [
    body.agent_id,
    body.platform,
    body.account_id,
    body.collected_at,
    JSON.stringify(body.data),
  ].join("\n");
export async function registerCreatorAgent(
  userId: number,
  platform: string,
  accountId: string,
  deviceId: string,
) {
  if (platform !== "douyin" || !accountId || !deviceId)
    throw Object.assign(new Error("platform、account_id 和 device_id 必填"), {
      statusCode: 400,
    });
  const token = crypto.randomBytes(32).toString("base64url");
  const hash = await bcrypt.hash(token, 12);
  const keyHash = crypto.createHash("sha256").update(key(token)).digest("hex");
  const existing = await queryOne<{ id: number }>(
    "SELECT id FROM creator_agents WHERE user_id=? AND platform=? AND device_id=?",
    [userId, platform, deviceId],
  );
  let id: number;
  if (existing) {
    id = existing.id;
    await execute(
      "UPDATE creator_agents SET account_id=?,token_hash=?,encryption_key_hash=?,last_active_at=CURRENT_TIMESTAMP WHERE id=?",
      [accountId, hash, keyHash, id],
    );
  } else
    id = await executeInsert(
      "INSERT INTO creator_agents(user_id,platform,account_id,device_id,token_hash,encryption_key_hash,last_active_at)VALUES(?,?,?,?,?,?,CURRENT_TIMESTAMP)",
      [userId, platform, accountId, deviceId, hash, keyHash],
    );
  return {
    agent_id: id,
    agent_token: token,
    platform,
    account_id: accountId,
    device_id: deviceId,
  };
}
export async function heartbeatCreatorAgent(body:Record<string,unknown>,authorization?:string){
  const token=authorization?.match(/^Bearer\s+(.+)$/i)?.[1];
  const agent=await queryOne<AgentRow>("SELECT id,user_id,platform,account_id,token_hash FROM creator_agents WHERE id=?",[Number(body.agent_id)]);
  if(!token||!agent||!(await bcrypt.compare(token,agent.token_hash)))throw Object.assign(new Error('Agent 身份认证失败'),{statusCode:401});
  if(String(body.account_id||'')!==agent.account_id)throw Object.assign(new Error('Agent 账号绑定不匹配'),{statusCode:403});
  await execute(`UPDATE creator_agents SET device_name=?,os=?,agent_version=?,protocol_version=?,browser_login_status=?,browser_type=?,browser_version=?,browser_engine=?,browser_runtime=?,browser_session_mode=?,browser_compatibility=?,last_heartbeat_at=CURRENT_TIMESTAMP,last_active_at=CURRENT_TIMESTAMP WHERE id=?`,[String(body.device_name||''),String(body.os||''),String(body.agent_version||''),Number(body.protocol_version)||1,String(body.browser_login_status||'unknown'),String(body.browser_type||''),String(body.browser_version||''),String(body.browser_engine||''),String(body.browser_runtime||''),String(body.session_mode||''),String(body.compatibility_status||'not_tested'),agent.id]);
  return{success:true,server_time:new Date().toISOString(),protocol_version:1};
}
export async function acceptCreatorAgentReport(
  body: Record<string, unknown>,
  authorization?: string,
) {
  const token = authorization?.match(/^Bearer\s+(.+)$/i)?.[1];
  const agent = await queryOne<AgentRow>(
    "SELECT id,user_id,platform,account_id,token_hash FROM creator_agents WHERE id=?",
    [Number(body.agent_id)],
  );
  if (!token || !agent || !(await bcrypt.compare(token, agent.token_hash)))
    throw Object.assign(new Error("Agent 身份认证失败"), { statusCode: 401 });
  if (
    body.platform !== agent.platform ||
    String(body.account_id) !== agent.account_id
  )
    throw Object.assign(new Error("Agent 设备或平台账号绑定不匹配"), {
      statusCode: 403,
    });
  const expected = crypto
    .createHmac("sha256", token)
    .update(canonical(body))
    .digest("hex");
  const supplied = String(body.signature || "");
  if (
    supplied.length !== expected.length ||
    !crypto.timingSafeEqual(Buffer.from(expected), Buffer.from(supplied))
  )
    throw Object.assign(new Error("上传签名验证失败"), { statusCode: 401 });
  const envelope = body.data as {
    iv?: string;
    tag?: string;
    ciphertext?: string;
  };
  let plaintext = "";
  try {
    if (!envelope?.iv || !envelope.tag || !envelope.ciphertext)
      throw new Error();
    const decipher = crypto.createDecipheriv(
      "aes-256-gcm",
      key(token),
      Buffer.from(envelope.iv, "base64"),
    );
    decipher.setAuthTag(Buffer.from(envelope.tag, "base64"));
    plaintext =
      decipher.update(envelope.ciphertext, "base64", "utf8") +
      decipher.final("utf8");
  } catch {
    throw Object.assign(new Error("上传数据解密失败"), { statusCode: 400 });
  }
  const payload = JSON.parse(plaintext) as Payload;
  const source =
    payload.source === "local_creator_center"
      ? "local_creator_center"
      : "local_agent";
  const time = String(payload.collected_at || body.collected_at);
  const modules: Record<string,"success"|"failed">={account:"failed",works:"failed",dashboard:"failed",fans:"failed",raw:"failed"};
  const errors:Record<string,string>={};
  const attempt=async<T>(name:string,run:()=>Promise<T>):Promise<T|undefined>=>{try{const value=await run();modules[name]="success";return value;}catch(error){modules[name]="failed";errors[name]=error instanceof Error?error.message:String(error);return undefined;}};
  const snapshotId = await attempt("raw",()=>executeInsert(
    "INSERT INTO creator_data_snapshots(user_id,platform,account_id,snapshot_time,data_json,source,agent_id)VALUES(?,?,?,?,?,?,?)",
    [
      agent.user_id,
      agent.platform,
      agent.account_id,
      time,
      plaintext,
      source,
      agent.id,
    ],
  ));
  await attempt("account",()=>execute(
    "INSERT INTO creator_center_data(user_id,platform,account_id,snapshot_time,account_json,source,agent_id)VALUES(?,?,?,?,?,?,?)",
    [
      agent.user_id,
      agent.platform,
      agent.account_id,
      time,
      JSON.stringify(payload.account || {}),
      source,
      agent.id,
    ],
  ));
  await attempt("works",async()=>{for (const work of payload.works || []) {const itemId=String(work.item_id||"");if(!itemId)continue;const detail=(payload.work_details||[]).find(item=>String(item.item_id)===itemId);await execute("INSERT INTO creator_work_data(user_id,platform,account_id,item_id,snapshot_time,work_json,detail_json,source)VALUES(?,?,?,?,?,?,?,?)",[agent.user_id,agent.platform,agent.account_id,itemId,time,JSON.stringify(work),JSON.stringify(detail||null),source]);}});
  await attempt("dashboard",()=>execute(
    "INSERT INTO creator_dashboard_snapshots(user_id,platform,account_id,snapshot_time,dashboard_json,content_analysis_json,source)VALUES(?,?,?,?,?,?,?)",
    [
      agent.user_id,
      agent.platform,
      agent.account_id,
      time,
      JSON.stringify(payload.dashboard || {}),
      JSON.stringify(payload.content_analysis || {}),
      source,
    ],
  ));
  await attempt("fans",()=>execute(
    "INSERT INTO creator_fans_snapshots(user_id,platform,account_id,snapshot_time,fans_json,source)VALUES(?,?,?,?,?,?)",
    [
      agent.user_id,
      agent.platform,
      agent.account_id,
      time,
      JSON.stringify(payload.fans || {}),
      source,
    ],
  ));
  await execute(
    "UPDATE creator_agents SET last_active_at=CURRENT_TIMESTAMP WHERE id=?",
    [agent.id],
  );
  return { success:Object.values(modules).some(value=>value==="success"), snapshot_id: snapshotId, source, modules, errors };
}
const parse = <T>(value: string | null | undefined, fallback: T): T => {
  try {
    return value ? (JSON.parse(value) as T) : fallback;
  } catch {
    return fallback;
  }
};
export async function getCreatorCenterData(userId: number, accountId?: string) {
  const filter = accountId ? " AND account_id=?" : "";
  const params: unknown[] = accountId ? [userId, accountId] : [userId];
  const account = await queryOne<{
    account_id: string;
    snapshot_time: string;
    account_json: string;
    source: string;
  }>(
    `SELECT account_id,snapshot_time,account_json,source FROM creator_center_data WHERE user_id=?${filter} ORDER BY snapshot_time DESC LIMIT 1`,
    params,
  );
  if (!account)
    return {
      account: null,
      works: [],
      dashboard: null,
      fans: null,
      history: [],
      data_sources: ["local_creator_center"],
    };
  const base = [userId, account.account_id];
  const [works, dashboard, fans, history] = await Promise.all([
    queryAll<{ work_json: string; detail_json: string; snapshot_time: string }>(
      "SELECT work_json,detail_json,snapshot_time FROM creator_work_data WHERE user_id=? AND account_id=? AND snapshot_time=(SELECT MAX(snapshot_time) FROM creator_work_data WHERE user_id=? AND account_id=?)",
      [...base, ...base],
    ),
    queryOne<{
      dashboard_json: string;
      content_analysis_json: string;
      snapshot_time: string;
    }>(
      "SELECT dashboard_json,content_analysis_json,snapshot_time FROM creator_dashboard_snapshots WHERE user_id=? AND account_id=? ORDER BY snapshot_time DESC LIMIT 1",
      base,
    ),
    queryOne<{ fans_json: string; snapshot_time: string }>(
      "SELECT fans_json,snapshot_time FROM creator_fans_snapshots WHERE user_id=? AND account_id=? ORDER BY snapshot_time DESC LIMIT 1",
      base,
    ),
    queryAll<{ snapshot_time: string; source: string }>(
      "SELECT snapshot_time,source FROM creator_data_snapshots WHERE user_id=? AND account_id=? ORDER BY snapshot_time DESC LIMIT 90",
      base,
    ),
  ]);
  return {
    account: {
      ...parse(account.account_json, {}),
      account_id: account.account_id,
      snapshot_time: account.snapshot_time,
      source: account.source,
    },
    works: works.map((row) => ({
      ...parse(row.work_json, {}),
      detail: parse(row.detail_json, null),
      snapshot_time: row.snapshot_time,
    })),
    dashboard: dashboard
      ? {
          ...parse(dashboard.dashboard_json, {}),
          content_analysis: parse(dashboard.content_analysis_json, {}),
          snapshot_time: dashboard.snapshot_time,
        }
      : null,
    fans: fans
      ? { ...parse(fans.fans_json, {}), snapshot_time: fans.snapshot_time }
      : null,
    history,
    data_sources: ["local_creator_center"],
  };
}
