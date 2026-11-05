import type { ChangelogEntry } from './changelog';

export const latestChangelogEntry: ChangelogEntry = {
  version: '10.1.74',
  date: '2026-11-05',
  title: '首屏加载体积优化',
  impactScope: ['页面加载', 'Studio 外壳'],
  changes: [
    { type: 'improvement', description: '普通页面入口 JS 从 650.81 KB 降到 493.56 KB；Silk 与编辑器模块继续按需加载，登录首屏资源总量仍在继续收敛。' },
  ],
};
