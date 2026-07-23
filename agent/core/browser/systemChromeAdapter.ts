import type { Browser,Page } from 'playwright';import type { BrowserAdapter } from './adapter.js';import { launchChrome } from './chrome-launcher.js';import { checkLogin,connectChrome } from './chrome-connector.js';
export class SystemChromeAdapter implements BrowserAdapter{
  readonly mode='system_chrome' as const;private browser:Browser|null=null;private endpoint:string;
  constructor(private profileDir:string,endpoint='http://127.0.0.1:9222',private chromePath?:string){this.endpoint=endpoint;}
  private async connect(){if(this.browser?.isConnected())return this.browser;try{this.browser=(await connectChrome(this.endpoint)).browser;return this.browser;}catch(error){throw new Error(`connectOverCDP失败：${error instanceof Error?error.message:String(error)}`);}}
  private async creatorPage():Promise<Page>{const browser=await this.connect();const context=browser.contexts()[0];if(!context)throw new Error('Chrome 没有可用浏览器上下文');const existing=context.pages().find(page=>page.url().includes('creator.douyin.com'));const page=existing||await context.newPage();if(!existing)await page.goto('https://creator.douyin.com/',{waitUntil:'domcontentloaded',timeout:45_000});return page;}
  async openLogin(){this.endpoint=await launchChrome(this.profileDir,9222,this.chromePath);this.browser=null;const page=await this.creatorPage();await page.bringToFront();}
  async completeLogin(){return checkLogin(await this.creatorPage());}
  async withPage<T>(run:(page:Page)=>Promise<T>){return run(await this.creatorPage());}
}
