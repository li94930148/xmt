import fs from 'node:fs/promises';
import path from 'node:path';
import crypto from 'node:crypto';
import type { BrowserSession } from '../browser/types.js';
import type { CollectionMode, CreatorSnapshot } from '../types.js';
import { buildApiMap } from './douyin/network/api-map.js';
import { DouyinNetworkInterceptor } from './douyin/network/interceptor.js';
import { collectContent } from './douyin/pages/content.js';
import { collectWorkDetail } from './douyin/pages/work-detail.js';
import { collectOperation } from './douyin/pages/operation.js';
import { collectContentAnalysis } from './douyin/pages/content-analysis.js';
import { collectFollower } from './douyin/pages/follower.js';
import { writeDiscovery } from '../network/discovery-store.js';
import { mergeAccountDomFallback,parseAccount } from './douyin/parser/account.js';

export class DouyinCreatorCollector {
  constructor(private readonly browser: BrowserSession, private readonly networkLogPath?: string, private readonly discoveryDirectory?: string) {}
  async collect(options: { snapshotId?: string; collectionMode?: CollectionMode; maxPages?:number; maxDetails?:number } = {}): Promise<CreatorSnapshot> {
    return this.browser.withPage(async (page) => {
        const capabilities=this.browser.getCapabilities();if(!capabilities.supportsNetworkResponseInspection)throw new Error('当前浏览器无法可靠读取运营数据响应，已安全停止采集');
        const network = new DouyinNetworkInterceptor(page); network.start();
      try {
        network.setPage('work-list');
        const content = await collectContent(page, network.captures,{maxPages:options.maxPages});
        network.setPage('work-detail');
        const detailLimit=Math.max(0,options.maxDetails??content.works.length);const details=[];for(const work of content.works.slice(0,detailLimit)){try{details.push(await collectWorkDetail(page,work.item_id,network.captures));}catch{/* 单条详情失败不会终止任务。 */}}
        network.setPage('account-dashboard');
        const dashboard = await collectOperation(page, network.captures);
        network.setPage('content-analysis');
        const contentAnalysis = await collectContentAnalysis(page, network.captures);
        network.setPage('fans-analysis');
        const fans = await collectFollower(page, network.captures);
        network.setPage('account-home');await page.goto('https://creator.douyin.com/creator-micro/home',{waitUntil:'domcontentloaded',timeout:45_000});await page.waitForLoadState('networkidle',{timeout:8_000}).catch(()=>undefined);const homeBody=await page.locator('body').innerText({timeout:10_000}).catch(()=>'');const account = mergeAccountDomFallback(parseAccount(network.captures),homeBody);
        const snapshot:CreatorSnapshot={schema_version:1,protocol_version:1,agent_version:'2.11.0-agent',platform:'douyin',source:'local_creator_center',contract_version:'2.10.2',snapshot_id:options.snapshotId||crypto.randomUUID(),collection_mode:options.collectionMode||'full_snapshot',collection_stats:content.collectionStats,collected_at:new Date().toISOString(),account,works:content.works,work_details:details,dashboard,content_analysis:contentAnalysis,fans,raw:{api_map:buildApiMap(network.captures),captures:network.captures},videos:content.works,operations:{last7Days:dashboard,last30Days:dashboard,trafficSources:details.map(d=>d.traffic),contentPerformance:contentAnalysis}};
        if(this.networkLogPath){await fs.mkdir(path.dirname(this.networkLogPath),{recursive:true});await fs.writeFile(this.networkLogPath,JSON.stringify({generated_at:snapshot.collected_at,contract_version:snapshot.contract_version,snapshot_id:snapshot.snapshot_id,collection_mode:snapshot.collection_mode,collection_stats:snapshot.collection_stats,api_map:snapshot.raw.api_map,captures:network.captures},null,2),'utf8');}
        if(this.discoveryDirectory){
          await writeDiscovery(this.discoveryDirectory,'work-list.json','work-list',network.captures);
          await writeDiscovery(this.discoveryDirectory,'work-detail.json','work-detail',network.captures);
          await writeDiscovery(this.discoveryDirectory,'account-dashboard.json','account-dashboard',network.captures);
          await writeDiscovery(this.discoveryDirectory,'content-analysis.json','content-analysis',network.captures);
          await writeDiscovery(this.discoveryDirectory,'fans-analysis.json','fans-analysis',network.captures);
        }
        return snapshot;
      } finally { network.stop(); }
    });
  }
}
