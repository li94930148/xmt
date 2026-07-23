import express from 'express';
import { authenticate } from '../middleware/auth.js';
import { acceptCreatorAgentReport, getCreatorCenterData, registerCreatorAgent } from '../services/creatorAgent.js';
const router=express.Router();
router.post('/register',authenticate,async(req,res)=>{
  try{res.status(201).json(await registerCreatorAgent(req.user!.id,String(req.body?.platform||''),String(req.body?.account_id||''),String(req.body?.device_id||'')));}
  catch(error){res.status(Number((error as {statusCode?:number}).statusCode||500)).json({success:false,message:error instanceof Error?error.message:'注册失败'});}
});
router.post('/report',async(req,res)=>{
  try{
    if(process.env.NODE_ENV==='production'&&!req.secure)return res.status(426).json({success:false,message:'Creator Agent 仅允许通过 HTTPS 上传'});
    res.status(201).json(await acceptCreatorAgentReport(req.body||{},req.header('authorization')));
  }catch(error){res.status(Number((error as {statusCode?:number}).statusCode||500)).json({success:false,message:error instanceof Error?error.message:'上传失败'});}
});
router.get('/data',authenticate,async(req,res)=>{try{res.json(await getCreatorCenterData(req.user!.id,typeof req.query.account_id==='string'?req.query.account_id:undefined));}catch(error){res.status(500).json({success:false,message:error instanceof Error?error.message:'查询失败'});}});
export default router;
