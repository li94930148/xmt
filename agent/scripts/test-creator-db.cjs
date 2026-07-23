const fs=require('node:fs');
const os=require('node:os');
const path=require('node:path');
const {DatabaseSync}=require('node:sqlite');
const {CreatorDatabase}=require('../dist-desktop/core/database/creatorDatabase.js');
const file=path.join(os.tmpdir(),'xmt-creator-db-migration-test.sqlite');
try{
  fs.rmSync(file,{force:true});
  const legacy=new DatabaseSync(file);legacy.exec('CREATE TABLE creator_fans_snapshots(id INTEGER PRIMARY KEY, account_id TEXT)');legacy.close();
  const database=new CreatorDatabase(file);
  database.db.exec("CREATE TRIGGER fail_fans BEFORE INSERT ON creator_fans_snapshots BEGIN SELECT RAISE(ABORT, 'fans fixture failure'); END");
  const snapshot={platform:'douyin',source:'local_creator_center',collected_at:new Date().toISOString(),account:{uid:'u1',nickname:'n',avatar:'',fans_count:3},works:[{item_id:'w1',title:'t'}],work_details:[],dashboard:{},content_analysis:{},fans:{count:3},raw:{api_map:[],captures:[]},videos:[],operations:{last7Days:{},last30Days:{},trafficSources:{},contentPerformance:{}}};
  const status=database.save(snapshot);const columns=database.db.prepare('PRAGMA table_info(creator_fans_snapshots)').all().map(row=>row.name);const accounts=database.db.prepare('SELECT count(*) count FROM creator_accounts').get().count;const works=database.db.prepare('SELECT count(*) count FROM creator_works').get().count;database.close();
  const required=['id','account_id','snapshot_time','fans_count','raw_json','created_at'];
  if(!required.every(column=>columns.includes(column))||status.account!=='success'||status.works!=='success'||status.fans!=='failed'||accounts!==1||works!==1)throw new Error(JSON.stringify({columns,status,accounts,works}));
  console.log(JSON.stringify({migration:'success',partial_failure:'success',columns,status,accounts,works},null,2));
}finally{fs.rmSync(file,{force:true});}
