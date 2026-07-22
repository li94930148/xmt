export type SyncInterval='manual'|'12h'|'daily';
export type BrowserMode='system_chrome'|'embedded_chromium';
export type AgentConfig={serverUrl:string;agentId:number;deviceId:string;platform:'douyin';accountId:string;accountName:string;browserConfig:{mode:BrowserMode;cdpEndpoint:string};syncConfig:{enabled:boolean;interval:SyncInterval;dailyHour:number}};
export type CreatorSnapshot={account:{nickname:string;avatar:string;uid:string;fans_count:number};videos:Array<{title:string;published_at:string;play_count:number;like_count:number;comment_count:number;collect_count:number;share_count:number}>;operations:{last7Days:unknown;last30Days:unknown;trafficSources:unknown;contentPerformance:unknown}};
export type SyncResult={collectedAt:string;snapshot:CreatorSnapshot;upload:{success:boolean;snapshot_id?:number;source?:string}};
