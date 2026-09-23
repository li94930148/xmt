import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

const root = path.resolve(import.meta.dirname, '../..');
const productionPage = fs.readFileSync(path.join(root, 'src/pages/Production.tsx'), 'utf8');

function extractFunction(name: string, nextName: string) {
  const start = productionPage.indexOf(`const ${name}`);
  const end = productionPage.indexOf(`const ${nextName}`, start + 1);
  assert.ok(start >= 0 && end > start, `无法定位 ${name}`);
  return productionPage.slice(start, end);
}

function testEditUsesUpdateEndpoint() {
  const updateBlock = extractFunction('handleUpdate', 'topicStatusColors');
  assert.match(updateBlock, /updateProduction\(editingProduction\.id/);
  assert.ok(!updateBlock.includes('createProduction('), '编辑保存禁止再次创建创作记录');
  assert.ok(updateBlock.includes("version_action: 'none'"), '普通编辑不得创建新版本');
  assert.ok(updateBlock.includes('expected_content: editingProduction.content'), '编辑保存必须携带旧内容以拦截陈旧覆盖');
}

async function testPaginatedProductionQueryContract() {
  const originalFetch = globalThis.fetch;
  let requestedUrl = '';
  globalThis.fetch = (async (input: RequestInfo | URL) => {
    requestedUrl = String(input);
    return { ok: true, json: async () => ({ data: [], total: 0, page: 2, limit: 12 }) } as Response;
  }) as typeof fetch;

  try {
    const { getProduction } = await import('../../src/api/workflow.js');
    const result = await getProduction({ page: 2, limit: 12 });
    assert.match(requestedUrl, /page=2/);
    assert.match(requestedUrl, /limit=12/);
    assert.deepEqual(result, { data: [], total: 0, page: 2, limit: 12 });
  } finally {
    globalThis.fetch = originalFetch;
  }
}

testEditUsesUpdateEndpoint();
await testPaginatedProductionQueryContract();

console.log('production-list-update-contract tests passed');
