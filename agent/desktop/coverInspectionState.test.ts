import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { coverInspectionActionError, coverInspectionFailureCode } from './coverInspectionState.js';

test('profile lock failures become a stable local-only diagnostic', () => {
  const raw = new Error('browserType.launchPersistentContext: Target page, context or browser has been closed; SingletonLock: File exists');
  assert.equal(coverInspectionFailureCode(raw), 'COVER_METADATA_BROWSER_SESSION_BUSY');
  assert.match(coverInspectionActionError(raw), /专用浏览器/);
  assert.equal(coverInspectionActionError(raw).includes('SingletonLock'), false);
});

test('known gates have actionable renderer messages without raw worker details', () => {
  assert.match(coverInspectionActionError(new Error('COVER_METADATA_SAFETY_GATE_BLOCKED')), /同步或上传队列/);
  assert.match(coverInspectionActionError(new Error('COVER_METADATA_BRIDGE_NOT_READY')), /重新安装 Agent/);
  assert.match(coverInspectionActionError(new Error('https://signed.invalid/?token=secret')), /本地诊断/);
});

test('cover inspection delegates authentication to its single worker browser launch', () => {
  const source = readFileSync(path.join(process.cwd(), 'desktop/main.ts'), 'utf8');
  const start = source.indexOf('async function performCoverMetadataInspection()');
  const end = source.indexOf('\nasync function schedule()', start);
  const implementation = source.slice(start, end);
  assert.equal(start >= 0 && end > start, true);
  assert.doesNotMatch(implementation, /refreshProfileAuthentication/);
  assert.match(implementation, /inspectCoverMetadata/);
});
