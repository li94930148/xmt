import type { Page } from 'playwright';
import type { BrowserAdapter } from '../browser/adapter.js';
import type { CreatorSnapshot } from '../types.js';
import type { Collector } from './collector.js';
const parseNumber=(text:string)=>{const n=Number(text.replace(/,/g,'').match(/[\d.]+/)?.[0]||0);return Math.round(n*(text.includes('万')?10_000:1));};
async function extract(page:Page):Promise<CreatorSnapshot>{
  const body=await page.locator('body').innerText();
  if(/扫码登录|手机号登录|登录抖音/.test(body)&&!/数据中心|作品管理|创作中心/.test(body))throw new Error('抖音登录状态无效，请先点击“登录抖音”');
  return page.evaluate((numberSource)=>{
    const parse=eval(`(${numberSource})`) as (text:string)=>number;
    const text=(selectors:string[])=>selectors.map(s=>document.querySelector(s)?.textContent?.trim()).find(Boolean)||'';
    const rows=Array.from(document.querySelectorAll('[class*=work-item],[class*=video-item],tr')).slice(0,100);
    const videos=rows.map(row=>{const value=row.textContent||'';const nums=(value.match(/[\d,.]+万?/g)||[]).map(parse);return{title:(row.querySelector('[class*=title],a')?.textContent||'').trim(),published_at:(value.match(/20\d{2}[-/.]\d{1,2}[-/.]\d{1,2}/)?.[0]||''),play_count:nums[0]||0,like_count:nums[1]||0,comment_count:nums[2]||0,collect_count:nums[3]||0,share_count:nums[4]||0};}).filter(v=>v.title);
    return{account:{nickname:text(['[class*=nickname]','[class*=user-name]']),avatar:(document.querySelector('img[class*=avatar]') as HTMLImageElement)?.src||'',uid:text(['[class*=uid]','[class*=account-id]']),fans_count:parse(text(['[class*=fans]','[class*=follower]']))},videos,operations:{last7Days:null,last30Days:null,trafficSources:null,contentPerformance:null}};
  },parseNumber.toString());
}
export class DouyinCreatorCollector implements Collector{readonly platform='douyin';constructor(private browser:BrowserAdapter){}collect(){return this.browser.withPage(extract);}}
