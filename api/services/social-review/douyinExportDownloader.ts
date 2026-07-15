import { mkdir, rm } from 'node:fs/promises';
import path from 'node:path';
import type { Page } from 'playwright';

const DOWNLOAD_DIRECTORY = path.resolve(process.cwd(), 'data', 'social-review-downloads');

export type DouyinExportDownloadResult =
  | { ok: true; filePath: string; fileType: string }
  | { ok: false; reason: 'button_not_found' | 'download_failed' };
type SafeDownloaderDiagnostic = (type: 'export_downloader_entered' | 'export_page_opened' | 'export_page_state_checked' | 'export_button_search_started' | 'export_button_found' | 'export_button_not_found' | 'export_download_started' | 'export_download_timeout' | 'export_download_failed' | 'export_incomplete', count?: number, extra?: Record<string, unknown>) => void;

function safeFileType(filename: string) {
  const extension = path.extname(filename).toLowerCase().replace('.', '');
  return ['csv', 'xlsx', 'xls'].includes(extension) ? extension : 'unknown';
}

export async function removeDouyinExportFile(filePath: string | null) {
  if (filePath) await rm(filePath, { force: true }).catch(() => undefined);
}

export async function downloadDouyinOfficialExport(page: Page, onDiagnostic?: SafeDownloaderDiagnostic): Promise<DouyinExportDownloadResult> {
  await mkdir(DOWNLOAD_DIRECTORY, { recursive: true });
  onDiagnostic?.('export_page_opened', 1, { pathname: new URL(page.url()).pathname, pageTitleLength: (await page.title().catch(() => '')).length, loggedIn: !/login|passport|sso/i.test(page.url()) });
  const buttons = page.locator('button, a, [role="button"]');
  const count = await buttons.count();
  const pageState = await page.evaluate(() => ({
    visibleTextCount: Array.from(document.querySelectorAll('body *')).filter((node) => {
      const element = node as HTMLElement;
      const style = window.getComputedStyle(element);
      return style.display !== 'none' && style.visibility !== 'hidden' && Boolean((element.innerText || '').trim());
    }).length,
    buttonCount: document.querySelectorAll('button, input[type="button"], [role="button"]').length,
    linkCount: document.querySelectorAll('a').length,
  })).catch(() => ({ visibleTextCount: 0, buttonCount: count, linkCount: 0 }));
  onDiagnostic?.('export_page_state_checked', 1, { pathname: new URL(page.url()).pathname, pageTitleExists: Boolean(await page.title().catch(() => '')), pageTitleLength: (await page.title().catch(() => '')).length, ...pageState });
  onDiagnostic?.('export_button_search_started', Math.min(count, 80));
  let textCount = 0;
  let foundCount = 0;
  for (let index = 0; index < Math.min(count, 80); index += 1) {
    const button = buttons.nth(index);
    const text = (await button.innerText().catch(() => '')).replace(/\s+/g, ' ').trim();
    if (text) textCount += 1;
    if (!/导出|下载数据|导出作品|生成数据/.test(text) || !(await button.isVisible().catch(() => false))) continue;
    foundCount += 1;
    onDiagnostic?.('export_button_found', 1, { buttonTextLength: text.length, candidateTextCount: textCount });
    try {
      const downloadPromise = page.waitForEvent('download', { timeout: 20000 });
      onDiagnostic?.('export_download_started', 1);
      await button.click({ timeout: 8000 });
      const download = await downloadPromise;
      const filename = download.suggestedFilename();
      const fileType = safeFileType(filename);
      if (fileType === 'unknown') return { ok: false, reason: 'download_failed' };
      const filePath = path.join(DOWNLOAD_DIRECTORY, `douyin-export-${Date.now()}.${fileType}`);
      await download.saveAs(filePath);
      return { ok: true, filePath, fileType };
    } catch {
      onDiagnostic?.('export_download_timeout', 1);
      return { ok: false, reason: 'download_failed' };
    }
  }
  onDiagnostic?.('export_button_not_found', 1, { pathname: new URL(page.url()).pathname, buttonCount: count, linkCount: pageState.linkCount, textCandidateCount: textCount, pageTitleExists: Boolean(await page.title().catch(() => '')), foundCount });
  return { ok: false, reason: 'button_not_found' };
}
