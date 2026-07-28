import 'dotenv/config';
import fs from 'node:fs';
import path from 'node:path';
import { createClient } from '@libsql/client';

const databasePath=path.resolve(process.env.DATABASE_PATH||'data/xmt.db');
const executeDelete=process.argv.includes('--confirm-delete');
const backupArg=process.argv.find(arg=>arg.startsWith('--backup='))?.slice('--backup='.length);
const db=createClient({url:`file:${databasePath}`});
try{
  const table=await db.execute("SELECT name FROM sqlite_master WHERE type='table' AND name='douyin_tokens'");
  if(!table.rows.length){console.log(JSON.stringify({table:'absent',records:0,action:'none'}));process.exit(0);}
  const count=Number((await db.execute('SELECT COUNT(*) AS count FROM douyin_tokens')).rows[0]?.count||0);
  if(!executeDelete){console.log(JSON.stringify({table:'present',records:count,action:'report_only',contains_plaintext_columns:true}));process.exit(0);}
  if(!backupArg)throw new Error('删除前必须提供 --backup=/绝对路径/备份文件.db');
  const backupPath=path.resolve(backupArg);
  if(!fs.existsSync(backupPath))throw new Error('指定的备份文件不存在，已拒绝删除');
  await db.execute('DELETE FROM douyin_tokens');
  console.log(JSON.stringify({table:'present',deleted:count,action:'deleted_after_explicit_confirmation',backup:backupPath}));
}finally{db.close();}
