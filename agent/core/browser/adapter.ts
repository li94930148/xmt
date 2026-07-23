import type { Page } from 'playwright';
export type BrowserMode='system_chrome'|'embedded_chromium';
export interface BrowserAdapter{
  readonly mode:BrowserMode;
  openLogin():Promise<void>;
  completeLogin():Promise<boolean>;
  withPage<T>(run:(page:Page)=>Promise<T>):Promise<T>;
}
