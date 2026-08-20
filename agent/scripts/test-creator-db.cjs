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
  const snapshot={schema_version:1,protocol_version:1,agent_version:'2.12.0-agent',contract_version:'2.10.2',snapshot_id:'snapshot-1',collection_mode:'metrics_refresh',collection_stats:{new_count:0},platform:'douyin',source:'local_creator_center',collected_at:new Date().toISOString(),account:{uid:'u1',nickname:'中文',avatar:'',fans_count:3},works:[{item_id:'w1',title:'中文作品',published_at:null,cover:null,status:{state:'published'},metrics:{likes:1,tags:['a']},raw:{nested:['x']}}],work_details:[],dashboard:{},content_analysis:{},fans:{count:3},raw:{api_map:[],captures:[]},videos:[],operations:{last7Days:{},last30Days:{},trafficSources:{},contentPerformance:{}}};
  const status=database.save(snapshot);snapshot.works[0].title='更新后标题';snapshot.snapshot_id='snapshot-2';const updated=database.save(snapshot);const columns=database.db.prepare('PRAGMA table_info(creator_fans_snapshots)').all().map(row=>row.name);const accounts=database.db.prepare('SELECT count(*) count FROM creator_accounts').get().count;const stored=database.db.prepare('SELECT title,status,raw_json FROM creator_works WHERE item_id=?').get('w1');const works=database.db.prepare('SELECT count(*) count FROM creator_works').get().count;database.close();
  const required=['id','account_id','snapshot_time','fans_count','raw_json','created_at'];
  if(!required.every(column=>columns.includes(column))||status.account!=='success'||status.works!=='success'||updated.works!=='success'||status.fans!=='failed'||accounts!==2||works!==1||stored.title!=='更新后标题'||stored.status!==JSON.stringify({state:'published'}))throw new Error(JSON.stringify({columns,status,updated,accounts,works,stored}));
  console.log(JSON.stringify({migration:'success',partial_failure:'success',columns,status,accounts,works},null,2));
}finally{fs.rmSync(file,{force:true});}
