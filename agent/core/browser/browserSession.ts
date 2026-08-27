import path from 'node:path';
import type { Browser, BrowserContext, Page } from 'playwright';
import { chromium, firefox, webkit } from 'playwright';
import { getDouyinCreatorLoginState } from './session.js';
import { assertManagedProfile } from './profile.js';
import type { BrowserInfo, BrowserSelection, BrowserSession } from './types.js';

const CREATOR = 'https://creator.douyin.com/creator-micro/home';

export class ManagedBrowserSession implements BrowserSession {
  private context: BrowserContext | null = null;
  constructor(private info: BrowserInfo, private selection: BrowserSelection, private profile: string, private dataRoot: string) {}
  private api() { return this.info.engine === 'firefox' ? firefox : this.info.engine === 'webkit' ? webkit : chromium; }
  async start() { if (this.context) return; const userDataDir = assertManagedProfile(this.profile, this.dataRoot); this.context = await this.api().launchPersistentContext(path.resolve(userDataDir), { headless: this.selection.headless, executablePath: this.info.runtime === 'system' ? this.info.executablePath : undefined, args: this.selection.launchArgs || [], acceptDownloads: true }); await this.ensurePage(CREATOR); }
  async stop() { await this.context?.close(); this.context = null; }
  async restart() { await this.stop(); await this.start(); }
  isConnected() { return Boolean(this.context?.browser()?.isConnected()); }
  getContext() { if (!this.context) throw new Error('浏览器会话尚未启动'); return this.context; }
  listPages() { return this.getContext().pages(); }
  async getActivePage() { return this.listPages().find(page => page.url().includes('creator.douyin.com')) || this.listPages()[0] || this.getContext().newPage(); }
  async openPage(url: string) { const page = await this.getContext().newPage(); await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 45_000 }); return page; }
  async ensurePage(url: string) { const page = await this.getActivePage(); if (!page.url().includes('creator.douyin.com')) await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 45_000 }); return page; }
  getCapabilities() { return this.info.capabilities; }
  getBrowserInfo() { return this.info; }
  async checkLoginState() { return getDouyinCreatorLoginState(await this.ensurePage(CREATOR)); }
  async withPage<T>(run: (page: Page) => Promise<T>) { if (!this.context) await this.start(); return run(await this.ensurePage(CREATOR)); }
}

export class ExternalCdpSession implements BrowserSession {
  private browser: Browser | null = null;
  constructor(private info: BrowserInfo, private endpoint: string) {}
  async start() { if (!this.info.capabilities.supportsCdp) throw new Error('所选浏览器不支持外部 CDP 会话'); this.browser = await chromium.connectOverCDP(this.endpoint); }
  async stop() { await this.browser?.close(); this.browser = null; }
  async restart() { await this.stop(); await this.start(); }
  isConnected() { return Boolean(this.browser?.isConnected()); }
  getContext() { const context = this.browser?.contexts()[0]; if (!context) throw new Error('外部浏览器没有可用上下文'); return context; }
  listPages() { return this.getContext().pages(); }
  async getActivePage() { return this.listPages().find(page => page.url().includes('creator.douyin.com')) || this.listPages()[0] || this.getContext().newPage(); }
  async openPage(url: string) { const page = await this.getContext().newPage(); await page.goto(url, { waitUntil: 'domcontentloaded' }); return page; }
  async ensurePage(url: string) { const page = await this.getActivePage(); if (!page.url().includes('creator.douyin.com')) await page.goto(url, { waitUntil: 'domcontentloaded' }); return page; }
  getCapabilities() { return this.info.capabilities; }
  getBrowserInfo() { return this.info; }
  async checkLoginState() { return getDouyinCreatorLoginState(await this.ensurePage(CREATOR)); }
  async withPage<T>(run: (page: Page) => Promise<T>) { if (!this.browser) await this.start(); return run(await this.ensurePage(CREATOR)); }
}
