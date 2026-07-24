import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import type { CreatorSnapshot, CreatorWork, NetworkCapture } from '../types.js';
import { safeJsonParse } from '../network/safe-json.js';
import { paginateWorkList } from '../network/work-list-pagination.js';
import { parseWorksDetailed } from '../collector/douyin/parser/common.js';
import { CreatorDatabase } from '../database/creatorDatabase.js';
import { toUnifiedCreatorPayload } from '../uploader/unifiedPayload.js';

const capture = (response: unknown): NetworkCapture => ({ page:'work-list',url:'https://creator.douyin.com/api/works?cursor=0',method:'GET',status:200,headers:{},response,response_size:0,captured_at:'2026-07-24T00:00:00.000Z' });
const work = (index: number): CreatorWork => {
  const id = `7663799549412758${String(index).padStart(3, '0')}`;
  const metrics = { play_count: index + 1, like_count: 1, comment_count: 1, share_count: 1 };
  return { aweme_id:id,item_id:id,title:`work-${index}`,cover_url:'',cover:'',publish_time:'',published_at:'',video_url:'',metrics,...metrics,raw:{aweme_id:id,desc:`work-${index}`,statistics:metrics} };
};
const page = (start: number, count: number, cursor: string, hasMore: boolean) => ({ data:{ aweme_list:Array.from({length:count},(_,offset)=>work(start+offset).raw), max_cursor:cursor, has_more:hasMore } });

function snapshot(snapshotId = 'snapshot-v2102'): CreatorSnapshot {
  const works=[work(0),work(1)];
  return {platform:'douyin',source:'local_creator_center',contract_version:'2.10.2',snapshot_id:snapshotId,collection_mode:'full_snapshot',collection_stats:{raw_response_count:1,aweme_candidate_count:2,normalized_success_count:2,rejected_count:0,rejected_reasons:{},page_count:1,new_count:2},collected_at:'2026-07-24T00:00:00.000Z',account:{uid:'100000000000000001',nickname:'creator',avatar:'',fans_count:3},works,work_details:[],dashboard:{},content_analysis:{},fans:{},raw:{api_map:[],captures:[capture({data:{aweme_list:works.map((item)=>item.raw)}})]},videos:works,operations:{last7Days:{},last30Days:{},trafficSources:{},contentPerformance:{}}};
}

test('safe JSON parsing preserves long aweme_id exactly as a string', () => {
  const parsed = safeJsonParse('{"aweme_id":7663799549412758193,"author":{"uid":100000000000000001}}') as {aweme_id:string;author:{uid:string}};
  assert.equal(parsed.aweme_id, '7663799549412758193');
  assert.equal(parsed.author.uid, '100000000000000001');
});

test('parseWorks accepts only strict named-list aweme objects', () => {
  const valid=Array.from({length:12},(_,index)=>work(index).raw);
  const music=Array.from({length:12},(_,index)=>({id:`music-${index}`,title:`music-${index}`,statistics:{play_count:1}}));
  const modules=Array.from({length:7},(_,index)=>({group_id:`module-${index}`,name:`module-${index}`,statistics:{play_count:1}}));
  const result=parseWorksDetailed([capture({data:{aweme_list:[...valid,...music,...modules]},manifest:{works:[work(99).raw]}})]);
  assert.equal(result.works.length,12);
  assert.equal(result.aweme_candidate_count,31);
  assert.equal(result.rejected_count,19);
  assert.equal(result.rejected_reasons.not_aweme_object,19);
  assert.equal(result.works[0].aweme_id,work(0).aweme_id);
});

test('cursor pagination collects 12 + 12 + 7 works', async () => {
  const fixtures:Record<string,unknown>={c1:page(12,12,'c2',true),c2:page(24,7,'c3',false)};
  const result=await paginateWorkList(page(0,12,'c1',true),async(cursor)=>fixtures[cursor]);
  const parsed=parseWorksDetailed(result.responses.map(capture));
  assert.equal(result.page_count,3);
  assert.equal(parsed.works.length,31);
});

test('knownContentIds is statistics-only and does not remove uploaded contents', () => {
  const source=snapshot();
  const payload=toUnifiedCreatorPayload(source,{knownContentIds:new Set(source.works.map((item)=>item.item_id))});
  assert.equal(payload.contents.length,source.works.length);
  assert.equal((payload.sync_task.collection_stats as {new_count:number}).new_count,0);
  assert.equal(payload.contents[0].aweme_id,source.works[0].aweme_id);
});

test('saving the same snapshot ten times is idempotent', () => {
  const directory=fs.mkdtempSync(path.join(os.tmpdir(),'xmt-v2102-'));
  const file=path.join(directory,'creator.sqlite');
  try {
    const database=new CreatorDatabase(file);
    const source=snapshot();
    for(let index=0;index<10;index+=1) assert.deepEqual(database.save(source).errors,{});
    assert.deepEqual(database.snapshotCounts(),{creator_accounts:1,creator_works:2,creator_work_statistics:2,creator_dashboard_statistics:1,creator_fans_statistics:1,creator_fans_snapshots:1,creator_raw_snapshots:1});
    database.close();
  } finally { fs.rmSync(directory,{recursive:true,force:true}); }
});
