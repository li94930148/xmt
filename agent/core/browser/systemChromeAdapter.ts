import { chromium,type Browser,type Page } from 'playwright';import type { BrowserAdapter } from './adapter.js';import { isDouyinCreatorLoggedIn,launchSystemChrome } from './session.js';
export class SystemChromeAdapter implements BrowserAdapter{
  readonly mode='system_chrome' as const;private browser:Browser|null=null;private endpoint:string;
  constructor(private profileDir:string,endpoint='http://127.0.0.1:9222',private chromePath?:string){this.endpoint=endpoint;}
  private async connect(){if(this.browser?.isConnected())return this.browser;try{this.browser=await chromium.connectOverCDP(this.endpoint,{timeout:5_000});return this.browser;}catch{throw new Error('Chrome启动失败，请检查Chrome安装。');}}
  private async creatorPage():Promise<Page>{const browser=await this.connect();const context=browser.contexts()[0];if(!context)throw new Error('Chrome 没有可用浏览器上下文');const existing=context.pages().find(page=>page.url().includes('creator.douyin.com'));const page=existing||await context.newPage();if(!existing)await page.goto('https://creator.douyin.com/',{waitUntil:'domcontentloaded',timeout:45_000});return page;}
  async openLogin(){this.endpoint=await launchSystemChrome(this.profileDir,9222,this.chromePath);this.browser=null;const page=await this.creatorPage();await page.bringToFront();}
  async completeLogin(){return isDouyinCreatorLoggedIn(await this.creatorPage());}
  async withPage<T>(run:(page:Page)=>Promise<T>){return run(await this.creatorPage());}
}
