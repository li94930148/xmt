import fs from 'node:fs/promises';
import path from 'node:path';
import crypto from 'node:crypto';
import type { BrowserAdapter } from '../browser/adapter.js';
import type { CollectionMode, CreatorSnapshot } from '../types.js';
import { buildApiMap } from './douyin/network/api-map.js';
import { DouyinNetworkInterceptor } from './douyin/network/interceptor.js';
import { collectContent } from './douyin/pages/content.js';
import { collectWorkDetail } from './douyin/pages/work-detail.js';
import { collectOperation } from './douyin/pages/operation.js';
import { collectContentAnalysis } from './douyin/pages/content-analysis.js';
import { collectFollower } from './douyin/pages/follower.js';
import { writeDiscovery } from '../network/discovery-store.js';

export class DouyinCreatorCollector {
  constructor(private readonly browser: BrowserAdapter, private readonly networkLogPath?: string, private readonly discoveryDirectory?: string) {}
  async collect(options: { snapshotId?: string; collectionMode?: CollectionMode } = {}): Promise<CreatorSnapshot> {
    return this.browser.withPage(async (page) => {
      const network = new DouyinNetworkInterceptor(page); network.start();
      try {
        network.setPage('work-list');
        const content = await collectContent(page, network.captures);
        network.setPage('work-detail');
        const detailId = content.works.find((work) => work.item_id === '7663799549412758193')?.item_id ?? '7663799549412758193';
        const details = [await collectWorkDetail(page, detailId, network.captures)];
        network.setPage('account-dashboard');
        const dashboard = await collectOperation(page, network.captures);
        network.setPage('content-analysis');
        const contentAnalysis = await collectContentAnalysis(page, network.captures);
        network.setPage('fans-analysis');
        const fans = await collectFollower(page, network.captures);
        const account = await page.evaluate(() => { const avatar=(document.querySelector('img[class*=avatar]') as HTMLImageElement|null)?.src||''; const nickname=(document.querySelector('[class*=nickname],[class*=user-name]') as HTMLElement|null)?.innerText||''; return {nickname,avatar,uid:'',fans_count:0}; }).catch(()=>({nickname:'',avatar:'',uid:'',fans_count:0}));
        const snapshot:CreatorSnapshot={platform:'douyin',source:'local_creator_center',contract_version:'2.10.2',snapshot_id:options.snapshotId||crypto.randomUUID(),collection_mode:options.collectionMode||'full_snapshot',collection_stats:content.collectionStats,collected_at:new Date().toISOString(),account,works:content.works,work_details:details,dashboard,content_analysis:contentAnalysis,fans,raw:{api_map:buildApiMap(network.captures),captures:network.captures},videos:content.works,operations:{last7Days:dashboard,last30Days:dashboard,trafficSources:details.map(d=>d.traffic),contentPerformance:contentAnalysis}};
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
