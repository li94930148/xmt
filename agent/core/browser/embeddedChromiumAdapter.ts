import path from 'node:path';import { chromium,type BrowserContext,type Page } from 'playwright';import type { BrowserAdapter } from './adapter.js';
export class EmbeddedChromiumAdapter implements BrowserAdapter{
  readonly mode='embedded_chromium' as const;private loginContext:BrowserContext|null=null;
  constructor(private profileDir:string){}
  async openLogin(){if(this.loginContext)throw new Error('内置浏览器登录窗口已经打开');this.loginContext=await chromium.launchPersistentContext(path.resolve(this.profileDir),{headless:false});const page=this.loginContext.pages()[0]||await this.loginContext.newPage();await page.goto('https://creator.douyin.com/',{waitUntil:'domcontentloaded'});}
  async completeLogin(){await this.loginContext?.close();this.loginContext=null;}
  async withPage<T>(run:(page:Page)=>Promise<T>){let context:BrowserContext|undefined;try{context=await chromium.launchPersistentContext(path.resolve(this.profileDir),{headless:true});const page=context.pages()[0]||await context.newPage();await page.goto('https://creator.douyin.com/',{waitUntil:'domcontentloaded',timeout:45_000});return await run(page);}finally{await context?.close();}}
}
