import assert from 'node:assert/strict';
import { describe, it } from 'vitest';

describe('current content document resolution', () => {
  it('resolves known recent titles and rejects arbitrary titles', async () => {
    const originalStorage = Object.getOwnPropertyDescriptor(globalThis, 'localStorage');
    const values = new Map<string, string>();
    Object.defineProperty(globalThis, 'localStorage', {
      configurable: true,
      value: {
        getItem: (key: string) => values.get(key) ?? null,
        setItem: (key: string, value: string) => values.set(key, value),
      },
    });

    try {
      const { resolveContentDocument } = await import('../../src/content/orchestrator/currentContentDocument.js');
      values.set('xmt_recent_content_docs', JSON.stringify([{ docId: 'production:12', title: '示例创作稿', label: '示例创作稿', kind: 'production', updatedAt: 1 }]));

      assert.equal(resolveContentDocument('示例创作稿')?.docId, 'production:12', 'recent title resolves to its real document id');
      assert.equal(resolveContentDocument('创作:9')?.docId, 'production:9');
      assert.equal(resolveContentDocument('shooting:8')?.docId, 'shooting:8');
      assert.equal(resolveContentDocument('随手输入的普通标题'), null, 'an arbitrary title must not become a fake document id');
    } finally {
      if (originalStorage) Object.defineProperty(globalThis, 'localStorage', originalStorage);
      else Reflect.deleteProperty(globalThis, 'localStorage');
    }
  });
});
