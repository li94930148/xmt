import assert from 'node:assert/strict';
import { getKanbanTopicDestination } from '../../src/platform/kanban-navigation';

async function run() {
  const shooting = await getKanbanTopicDestination(
    { id: 17, status: 'shooting' },
    {
      getShooting: async (topicId) => {
        assert.equal(topicId, 17);
        return { data: [{ id: 204 }] };
      },
      getPublishing: async () => ({ data: [] }),
    },
  );
  assert.equal(shooting, '/shooting/204', '拍摄详情必须使用拍摄记录 ID');

  const publishing = await getKanbanTopicDestination(
    { id: 19, status: 'publishing' },
    {
      getShooting: async () => ({ data: [] }),
      getPublishing: async (topicId) => {
        assert.equal(topicId, 19);
        return { data: [{ id: 308 }] };
      },
    },
  );
  assert.equal(publishing, '/publishing/308', '发布详情必须使用发布记录 ID');

  const missingStage = await getKanbanTopicDestination(
    { id: 21, status: 'shooting' },
    { getShooting: async () => ({ data: [] }), getPublishing: async () => ({ data: [] }) },
  );
  assert.equal(missingStage, null, '关联环节缺失时不可误用选题 ID 打开详情');

  const production = await getKanbanTopicDestination(
    { id: 23, status: 'production' },
    { getShooting: async () => ({ data: [] }), getPublishing: async () => ({ data: [] }) },
  );
  assert.equal(production, '/production/23');
}

void run().then(() => console.log('Kanban workflow detail navigation tests passed'));
