import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { app, BrowserWindow, ipcMain } from 'electron';
import { CreatorDatabase } from '../core/database/creatorDatabase.js';
import { canonicalJson, canonicalJsonHash } from '../core/database/sqliteValues.js';

async function main() {
  const watchdog = setTimeout(() => { console.error('Electron IPC regression timed out'); app.exit(1); }, 10_000);
  const root = mkdtempSync(path.join(tmpdir(), 'xmt-agent-ipc-'));
  const database = new CreatorDatabase(path.join(root, 'creator.db'));
  ipcMain.handle('agent:sync', () => {
    const payloadJson = canonicalJson('canonical_payload_json', { datasets: { content_metrics: [] }, quality: { warnings: [] }, schema_version: 2 });
    const queued = database.enqueueUpload({ batch_id: '11111111-1111-4111-8111-111111111111', platform: 'douyin', platform_account_id: 'fixture-account', source_file_sha256: 'a'.repeat(64), parser_version: 'douyin-export-v1', payload_json: payloadJson, payload_sha256: canonicalJsonHash(payloadJson) });
    return { queued: queued.created, job_id: queued.job_id };
  });
  await app.whenReady();
  const window = new BrowserWindow({ show: false, webPreferences: { contextIsolation: false, nodeIntegration: true, sandbox: false } });
  await window.loadURL('data:text/html,<title>XMT IPC queue test</title>');
  const result = await window.webContents.executeJavaScript("require('electron').ipcRenderer.invoke('agent:sync')") as { queued: boolean; job_id: string };
  assert.equal(result.queued, true);
  assert.equal(database.parseUploadPayload(database.uploadJob(result.job_id)!).schema_version, 2);
  window.destroy(); database.close(); rmSync(root, { recursive: true, force: true });
  clearTimeout(watchdog);
  console.log('真实 Electron IPC 回归通过：ipcRenderer.invoke(agent:sync) → handler → canonical payload → upload_queue。');
  app.quit();
}

void main().catch((error) => { console.error(error instanceof Error ? error.message : String(error)); process.exitCode = 1; app.quit(); });
