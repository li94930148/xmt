import express from 'express';
import { authenticate } from '../middleware/auth.js';
import { bindCreatorAgent, createCreatorAgentBindingCode, getCreatorCenterData, heartbeatCreatorAgent, registerCreatorAgent } from '../services/creatorAgent.js';
import { getUnifiedCreatorCenterData } from '../services/creatorDataCenter.js';
import { acceptCreatorDataSync, CreatorSyncAlreadyRunningError } from '../services/creatorSyncV291.js';
import { creatorInsightService, getCreatorInsights } from '../services/creatorInsights.js';
import { canManageCreatorAccount, grantCreatorAccountAccess } from '../services/creatorAccess.js';
import { canManageCreatorData, resolveManageScope, resolveViewScope } from '../services/creatorDataVisibility.js';
import { requirePermission, userHasPermission } from '../middleware/permissions.js';
import { creatorAnalyticsService, type ReportType } from '../services/creatorAnalytics.js';
import { getDouyinDashboard, getDouyinManagedCover, getDouyinSyncLogs, getDouyinTrends, getDouyinWorkDetail, getDouyinWorkReview, getDouyinWorks } from '../services/douyinDataCenter.js';
import { attachCreatorTopicSuggestionFeedback, saveCreatorTopicSuggestionFeedback } from '../services/creatorTopicSuggestionFeedback.js';
import { queryAll } from '../database/utils.js';
const router=express.Router();
const creatorError = (res: express.Response, error: unknown, fallback: string, defaultStatus = 500) => {
  if (error instanceof CreatorSyncAlreadyRunningError) {
    return res.set('Retry-After', '5').status(503).json({ success: false, code: 'CREATOR_SYNC_BUSY', message: error.message });
  }
  const candidate = Number((error as { statusCode?: unknown })?.statusCode ?? defaultStatus);
  const status = Number.isInteger(candidate) && candidate >= 400 && candidate < 500 ? candidate : 500;
  return res.status(status).json({ success: false, message: status < 500 && error instanceof Error ? error.message : fallback });
};
const requestedPlatformUid = (value: unknown) => typeof value === 'string' && value.trim() ? value.trim() : undefined;
const resolveCreatorViewScope = (role: string, platformUid?: string) => resolveViewScope(role,'douyin',platformUid);
const resolveCreatorManageScope = (role: string, platformUid?: string) => resolveManageScope(role,'douyin',platformUid);
router.get('/status',authenticate,requirePermission('creator:data:view'),async(_req,res)=>{try{const agents=await queryAll<Record<string,unknown>>(`SELECT id,device_id,device_name,os,agent_version,protocol_version,browser_login_status,browser_type,browser_version,browser_engine,browser_runtime,browser_session_mode,browser_compatibility,status,last_heartbeat_at,last_success_sync_at,last_attempt_sync_at,account_id,CASE WHEN last_heartbeat_at IS NOT NULL AND datetime(last_heartbeat_at) >= datetime('now','+8 hours','-2 minutes') THEN 1 ELSE 0 END AS online FROM creator_agents WHERE platform='douyin' ORDER BY COALESCE(last_heartbeat_at,last_active_at) DESC`);res.json({agents:agents.map(agent=>({...agent,device_id:String(agent.device_id||'').slice(0,8)})),protocol_version:1});}catch(error){creatorError(res,error,'Agent 状态加载失败');}});
router.get('/douyin/dashboard',authenticate,requirePermission('creator:data:view'),async(req,res)=>{try{const scope=await resolveCreatorViewScope(req.user!.role,requestedPlatformUid(req.query.account_id));if(!scope)return res.status(404).json({message:'未找到已同步抖音账号'});const data=await getDouyinDashboard(scope.id);if(!data)return res.status(404).json({message:'该账号尚未完成标准化同步'});const suggestions=data.topic_suggestions?{...data.topic_suggestions,items:await attachCreatorTopicSuggestionFeedback(scope.id,req.user!.id,data.topic_suggestions.items)}:undefined;res.json({...data,topic_suggestions:suggestions,access_level:scope.access_level});}catch(error){creatorError(res,error,'抖音驾驶舱加载失败');}});
router.post('/douyin/suggestions/:suggestionId/feedback',authenticate,requirePermission('creator:data:view'),async(req,res)=>{
  try{
    const suggestionId=String(req.params.suggestionId||'');
    const evidenceId=String(req.body?.evidence_id||'');
    const outcome=req.body?.outcome;
    const accountUid=requestedPlatformUid(req.body?.account_id);
    if(!/^[a-f0-9]{20}$/.test(suggestionId)||!/^[a-f0-9]{32}$/.test(evidenceId))return res.status(400).json({message:'创作建议标识无效'});
    if(outcome!=='adopted'&&outcome!=='not_adopted')return res.status(400).json({message:'反馈选项无效'});
    if(outcome==='adopted'&&!await userHasPermission(req.user!.id,'topic:create'))return res.status(403).json({message:'需有提报选题权限才能记录已采纳'});
    if(!accountUid)return res.status(400).json({message:'缺少创作者账号范围'});
    const scope=await resolveCreatorViewScope(req.user!.role,accountUid);
    if(!scope)return res.status(404).json({message:'未找到可查看的抖音账号'});
    const dashboard=await getDouyinDashboard(scope.id);
    const item=dashboard?.topic_suggestions?.items.find(candidate=>candidate.id===suggestionId&&candidate.evidence_id===evidenceId);
    if(!item)return res.status(409).json({message:'该建议的样本已更新，请刷新后重新反馈'});
    const feedback=await saveCreatorTopicSuggestionFeedback({creatorAccountId:scope.id,userId:req.user!.id,item,outcome});
    return res.json({feedback});
  }catch(error){return creatorError(res,error,'创作建议反馈保存失败');}
});
router.get('/douyin/works',authenticate,requirePermission('creator:data:view'),async(req,res)=>{try{const scope=await resolveCreatorViewScope(req.user!.role,requestedPlatformUid(req.query.account_id));if(!scope)return res.status(404).json({message:'未找到已同步抖音账号'});res.json(await getDouyinWorks(scope.id,String(req.query.sort||'latest'),Number(req.query.limit)||20,requestedPlatformUid(req.query.cursor)));}catch(error){creatorError(res,error,'抖音作品库加载失败');}});
router.get('/douyin/works/:id/review',authenticate,requirePermission('creator:data:view'),async(req,res)=>{try{const scope=await resolveCreatorViewScope(req.user!.role,requestedPlatformUid(req.query.account_id));if(!scope)return res.status(404).json({message:'未找到已同步抖音账号'});const data=await getDouyinWorkReview(scope.id,Number(req.params.id));if(!data)return res.status(404).json({message:'作品不存在或不在查看范围内'});res.json(data);}catch(error){creatorError(res,error,'作品复盘加载失败');}});
router.get('/douyin/works/:id',authenticate,requirePermission('creator:data:view'),async(req,res)=>{try{const scope=await resolveCreatorViewScope(req.user!.role,requestedPlatformUid(req.query.account_id));if(!scope)return res.status(404).json({message:'未找到已同步抖音账号'});const data=await getDouyinWorkDetail(scope.id,Number(req.params.id));if(!data)return res.status(404).json({message:'作品不存在或不在查看范围内'});res.json(data);}catch(error){creatorError(res,error,'作品复盘加载失败');}});
router.get('/douyin/works/:id/cover',authenticate,requirePermission('creator:data:view'),async(req,res)=>{try{const scope=await resolveCreatorViewScope(req.user!.role,requestedPlatformUid(req.query.account_id));if(!scope)return res.sendStatus(404);const cover=await getDouyinManagedCover(scope.id,Number(req.params.id));if(!cover)return res.sendStatus(404);const etag=`"${cover.sha256}"`;if(req.header('if-none-match')===etag)return res.sendStatus(304);res.set({'Content-Type':cover.mime_type,'Content-Length':String(cover.bytes.byteLength),'Cache-Control':'private, max-age=86400','ETag':etag});res.send(Buffer.from(cover.bytes));}catch{res.sendStatus(500);}});
router.get('/douyin/trends',authenticate,requirePermission('creator:data:view'),async(req,res)=>{try{const scope=await resolveCreatorViewScope(req.user!.role,requestedPlatformUid(req.query.account_id));if(!scope)return res.status(404).json({message:'未找到已同步抖音账号'});const period=req.query.period==='7d'||req.query.period==='90d'?req.query.period:'30d';res.json(await getDouyinTrends(scope.id,period));}catch(error){creatorError(res,error,'抖音趋势加载失败');}});
router.get('/douyin/sync-logs',authenticate,requirePermission('creator:data:view'),async(req,res)=>{try{const scope=await resolveCreatorViewScope(req.user!.role,requestedPlatformUid(req.query.account_id));if(!scope)return res.status(404).json({message:'未找到已同步抖音账号'});res.json(await getDouyinSyncLogs(scope.id));}catch(error){creatorError(res,error,'同步日志加载失败');}});
router.post('/register',authenticate,requirePermission('creator:data:manage'),async(req,res)=>{
  try{if(!canManageCreatorData(req.user!.role))return res.status(403).json({success:false,message:'仅管理员或负责人可绑定 Creator Agent'});res.status(201).json(await registerCreatorAgent(req.user!.id,String(req.body?.platform||''),String(req.body?.account_id||''),String(req.body?.device_id||'')));}
  catch(error){creatorError(res,error,'注册失败');}
});
router.post('/binding-codes',authenticate,requirePermission('creator:data:manage'),async(req,res)=>{try{if(!canManageCreatorData(req.user!.role))return res.status(403).json({message:'仅管理员或负责人可创建设备绑定码'});res.status(201).json(await createCreatorAgentBindingCode(req.user!.id,String(req.body?.account_id||''),Number(req.body?.ttl_minutes)||10));}catch(error){creatorError(res,error,'绑定码创建失败');}});
router.post('/bind',async(req,res)=>{try{res.status(201).json(await bindCreatorAgent(String(req.body?.binding_code||''),req.body?.device||{}));}catch(error){creatorError(res,error,'设备绑定失败');}});
router.post('/report',(_req,res)=>res.status(410).json({success:false,message:'Creator Agent /report 已停止使用，请升级客户端并使用 /data-sync'}));
router.post('/heartbeat',async(req,res)=>{try{res.json(await heartbeatCreatorAgent(req.body||{},req.header('authorization')));}catch(error){creatorError(res,error,'心跳失败');}});
router.post('/data-sync',async(req,res)=>{
  try{
    if(process.env.NODE_ENV==='production'&&!req.secure)return res.status(426).json({success:false,message:'Creator Agent 仅允许通过 HTTPS 上传'});
    res.status(201).json(await acceptCreatorDataSync(req.body||{},req.header('authorization')));
  }catch(error){creatorError(res,error,'统一数据同步失败');}
});
router.get('/data',authenticate,requirePermission('creator:data:view'),async(req,res)=>{try{const scope=await resolveCreatorViewScope(req.user!.role,requestedPlatformUid(req.query.account_id));if(!scope)return res.json({account:null,works:[],dashboard:null,fans:null,history:[],trends:[],insights:{},analytics:{},data_sources:['local_creator_center']});const [data,insights,analytics]=await Promise.all([(async()=>(await getUnifiedCreatorCenterData(scope.user_id,scope.platform_uid))??(await getCreatorCenterData(scope.user_id,scope.platform_uid)))(),getCreatorInsights(scope.id),creatorAnalyticsService.overview(scope.id)]);res.json({...data,access_level:scope.access_level,insights,analytics});}catch(error){creatorError(res,error,'查询失败');}});
router.post('/insights/refresh',authenticate,requirePermission('creator:data:manage'),async(req,res)=>{try{const scope=await resolveCreatorManageScope(req.user!.role,requestedPlatformUid(req.body?.account_id));if(!scope)return res.status(403).json({message:'仅管理员或负责人可管理账号'});res.json(await creatorInsightService.generate(scope.id));}catch(error){creatorError(res,error,'分析失败');}});
router.post('/accounts/:id/access',authenticate,requirePermission('creator:data:manage'),async(req,res)=>{try{const accountId=Number(req.params.id),userId=Number(req.body?.user_id),accessLevel=req.body?.access_level==='manage'?'manage':'view';if(!await canManageCreatorAccount(req.user!.id,req.user!.role,accountId))return res.status(403).json({message:'不在账号管理范围内'});res.json(await grantCreatorAccountAccess(accountId,userId,accessLevel));}catch(error){creatorError(res,error,'授权失败',400);}});

router.get('/works/:id/analysis',authenticate,requirePermission('creator:data:view'),async(req,res)=>{try{const scope=await resolveCreatorViewScope(req.user!.role,requestedPlatformUid(req.query.account_id));if(!scope)return res.status(404).json({message:'未找到已同步账号'});const period=req.query.period==='24h'||req.query.period==='30d'?req.query.period:'7d';const analysis=await creatorAnalyticsService.work(scope.id,Number(req.params.id),period);if(!analysis)return res.status(404).json({message:'作品不存在或不在查看范围内'});res.json(analysis);}catch(error){creatorError(res,error,'作品分析失败');}});
router.get('/trends',authenticate,requirePermission('creator:data:view'),async(req,res)=>{try{const scope=await resolveCreatorViewScope(req.user!.role,requestedPlatformUid(req.query.account_id));if(!scope)return res.status(404).json({message:'未找到已同步账号'});const period=req.query.period==='7d'||req.query.period==='90d'?req.query.period:'30d';res.json(await creatorAnalyticsService.trends(scope.id,period));}catch(error){creatorError(res,error,'趋势计算失败');}});
router.get('/reports',authenticate,requirePermission('creator:report:view'),async(req,res)=>{try{const scope=await resolveCreatorViewScope(req.user!.role,requestedPlatformUid(req.query.account_id));if(!scope)return res.status(404).json({message:'未找到已同步账号'});res.json(await creatorAnalyticsService.reports(scope.id));}catch(error){creatorError(res,error,'报告查询失败');}});
router.post('/reports/generate',authenticate,requirePermission('creator:report:manage'),async(req,res)=>{try{const scope=await resolveCreatorManageScope(req.user!.role,requestedPlatformUid(req.body?.account_id));if(!scope)return res.status(403).json({message:'仅管理员或负责人可管理账号'});const type:ReportType=req.body?.type==='daily'||req.body?.type==='monthly'?req.body.type:'weekly';res.status(201).json(await creatorAnalyticsService.generateReport(scope.id,type));}catch(error){creatorError(res,error,'报告生成失败');}});
router.delete('/reports/:id',authenticate,requirePermission('creator:report:manage'),async(req,res)=>{try{const scope=await resolveCreatorManageScope(req.user!.role,requestedPlatformUid(req.query.account_id));if(!scope)return res.status(403).json({message:'仅管理员或负责人可管理账号'});await creatorAnalyticsService.deleteReport(scope.id,Number(req.params.id));res.status(204).end();}catch(error){creatorError(res,error,'报告删除失败');}});
export default router;
