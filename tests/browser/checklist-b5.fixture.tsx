import { useState } from 'react';
import { createRoot } from 'react-dom/client';
import '../../src/index.css';
import ResourceTable from '../../src/components/resource-center/ResourceTable';
import { BrandLogoPicker } from '../../src/pages/NotificationSettings';
import { getAuthRolloutModeLabel, getExistingLoginReadiness } from '../../src/pages/authRolloutPresentation';

const root = document.getElementById('root');
if (!root) throw new Error('checklist B5 fixture root is missing');

export function ChecklistB5Fixture() {
  const [cleared, setCleared] = useState(false);
  const readiness = getExistingLoginReadiness('percentage', 'percentage', 25);

  return (
    <main className="space-y-8 p-8">
      <section aria-labelledby="rollout-title">
        <h1 id="rollout-title">登录灰度状态验收</h1>
        <p>当前运行模式：{getAuthRolloutModeLabel('percentage', 25)}</p>
        <p>保留现有登录方式：{readiness.ready ? '准备完成' : '未准备完成'}</p>
        <p>{readiness.description}</p>
      </section>
      <section aria-labelledby="logo-title">
        <h2 id="logo-title">品牌图片选择验收</h2>
        <label className="mb-2 block text-sm font-medium">品牌 Logo</label>
        <BrandLogoPicker disabled={false} onChange={() => undefined} buttonClassName="xmt-btn xmt-btn-primary" />
      </section>
      <section aria-labelledby="resource-title">
        <h2 id="resource-title">资料筛选结果验收</h2>
        <p role="status">筛选状态：{cleared ? '已清除' : '关键词“验收” · 分类“未匹配分类”'}</p>
        <ResourceTable
          items={[]}
          canEdit={false}
          canDelete={false}
          emptyState={{
            title: '没有符合条件的资料',
            description: '调整搜索内容或分类，或者清除筛选条件后重试。',
            actionLabel: '清除筛选',
            onAction: () => setCleared(true),
          }}
        />
      </section>
    </main>
  );
}

createRoot(root).render(<ChecklistB5Fixture />);
