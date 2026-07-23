import fs from 'node:fs/promises';
import path from 'node:path';
import type { BrowserAdapter } from '../browser/adapter.js';
import type { CreatorSnapshot } from '../types.js';
import { buildApiMap } from './douyin/network/api-map.js';
import { DouyinNetworkInterceptor } from './douyin/network/interceptor.js';
import { collectContent } from './douyin/pages/content.js';
import { collectWorkDetail } from './douyin/pages/work-detail.js';
import { collectOperation } from './douyin/pages/operation.js';
import { collectContentAnalysis } from './douyin/pages/content-analysis.js';
import { collectFollower } from './douyin/pages/follower.js';

export class DouyinCreatorCollector {
  constructor(private readonly browser: BrowserAdapter, private readonly networkLogPath?: string) {}
  async collect(): Promise<CreatorSnapshot> {
    return this.browser.withPage(async (page) => {
      const network = new DouyinNetworkInterceptor(page); network.start();
      try {
        const content = await collectContent(page, network.captures);
        const details = [];
        for (const work of content.works) details.push(await collectWorkDetail(page, work.item_id, network.captures));
        const dashboard = await collectOperation(page, network.captures);
        const contentAnalysis = await collectContentAnalysis(page, network.captures);
        const fans = await collectFollower(page, network.captures);
        const account = await page.evaluate(() => { const avatar=(document.querySelector('img[class*=avatar]') as HTMLImageElement|null)?.src||''; const nickname=(document.querySelector('[class*=nickname],[class*=user-name]') as HTMLElement|null)?.innerText||''; return {nickname,avatar,uid:'',fans_count:0}; }).catch(()=>({nickname:'',avatar:'',uid:'',fans_count:0}));
        const snapshot:CreatorSnapshot={platform:'douyin',source:'local_creator_center',collected_at:new Date().toISOString(),account,works:content.works,work_details:details,dashboard,content_analysis:contentAnalysis,fans,raw:{api_map:buildApiMap(network.captures),captures:network.captures},videos:content.works,operations:{last7Days:dashboard,last30Days:dashboard,trafficSources:details.map(d=>d.traffic),contentPerformance:contentAnalysis}};
        if(this.networkLogPath){await fs.mkdir(path.dirname(this.networkLogPath),{recursive:true});await fs.writeFile(this.networkLogPath,JSON.stringify({generated_at:snapshot.collected_at,api_map:snapshot.raw.api_map,captures:network.captures},null,2),'utf8');}
        return snapshot;
      } finally { network.stop(); }
    });
  }
}
