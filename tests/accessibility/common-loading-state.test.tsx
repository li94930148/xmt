import assert from 'node:assert/strict';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import LoadingState from '../../src/components/common/LoadingState';
import RetroList from '../../src/components/retrospectives/RetroList';
import MyRetroActionsPanel from '../../src/components/retrospectives/MyRetroActionsPanel';
import RetroDailyRiskPanel from '../../src/components/retrospectives/RetroDailyRiskPanel';
import RetroMetricSnapshotPanel from '../../src/components/retrospectives/RetroMetricSnapshotPanel';
import { StudioSkeletonCard, StudioSkeletonList, StudioSkeletonTable } from '../../src/components/studio/Skeleton';

const variants = ['table', 'inline', 'page', 'section'] as const;

for (const variant of variants) {
  const text = `正在读取${variant}状态…`;
  const markup = renderToStaticMarkup(React.createElement(LoadingState, { type: variant, text }));

  assert.match(markup, /role="status"/, `${variant} loading state exposes status semantics`);
  assert.match(markup, /aria-live="polite"/, `${variant} loading state announces without interrupting`);
  assert.match(markup, /aria-atomic="true"/, `${variant} loading message is announced as one update`);
  assert.match(markup, new RegExp(text), `${variant} loading state includes its status message`);
  assert.match(markup, /aria-hidden="true"/, `${variant} loading decoration or skeleton is hidden from assistive technology`);
}

console.log('Common loading-state accessibility tests passed for table, inline, page, and section variants');

const retrospectiveMarkup = renderToStaticMarkup(React.createElement(RetroList, {
  retrospectives: [],
  loading: true,
  error: null,
  canCreate: false,
  onCreate: () => undefined,
  onRefresh: () => undefined,
  onOpen: () => undefined,
}));
assert.match(retrospectiveMarkup, /role="status" aria-live="polite" aria-atomic="true">正在加载复盘列表…/, 'retrospective table loading is politely announced as one update');
assert.match(retrospectiveMarkup, /aria-busy="true"/, 'retrospective refresh exposes its busy state while loading');
assert.match(retrospectiveMarkup, /<svg[^>]*aria-hidden="true"/, 'retrospective refresh spinner is decorative');
assert.match(retrospectiveMarkup, /<svg[^>]*class="[^"]*motion-reduce:animate-none/, 'retrospective refresh spinner respects reduced motion');

console.log('Retrospective list loading accessibility contracts passed');

const actionsMarkup = renderToStaticMarkup(React.createElement(MyRetroActionsPanel, {
  actions: [],
  loading: true,
  error: null,
  onRefresh: () => undefined,
  onOpen: () => undefined,
}));
assert.match(actionsMarkup, /role="status" aria-live="polite" aria-atomic="true"[^>]*>正在加载行动项/, 'personal retrospective actions announce loading politely');
assert.match(actionsMarkup, /aria-busy="true"/, 'personal retrospective actions refresh exposes its busy state');
assert.match(actionsMarkup, /<svg[^>]*aria-hidden="true"/, 'personal retrospective actions spinner is decorative');
assert.match(actionsMarkup, /<svg[^>]*class="[^"]*motion-reduce:animate-none/, 'personal retrospective actions spinner respects reduced motion');

const dailyRiskMarkup = renderToStaticMarkup(React.createElement(RetroDailyRiskPanel, {
  risks: [],
  users: [],
  status: 'draft',
  canManageActions: false,
  loading: true,
  error: null,
  onRefresh: () => undefined,
  onCreateAction: () => false,
}));
assert.match(dailyRiskMarkup, /role="status" aria-live="polite" aria-atomic="true"[^>]*>正在加载日报风险/, 'daily risk reads announce loading politely');
assert.match(dailyRiskMarkup, /aria-busy="true"/, 'daily risk refresh exposes its busy state');
assert.match(dailyRiskMarkup, /<svg[^>]*aria-hidden="true"/, 'daily risk spinner is decorative');
assert.match(dailyRiskMarkup, /<svg[^>]*class="[^"]*motion-reduce:animate-none/, 'daily risk spinner respects reduced motion');

const metricSnapshotMarkup = renderToStaticMarkup(React.createElement(RetroMetricSnapshotPanel, {
  snapshots: [],
  status: 'draft',
  canGenerate: true,
  loading: true,
  onGenerate: () => undefined,
}));
assert.match(metricSnapshotMarkup, /role="status" aria-live="polite" aria-atomic="true"[^>]*>正在生成指标快照/, 'snapshot generation announces its pending state politely');
assert.match(metricSnapshotMarkup, /aria-busy="true"/, 'snapshot generation button exposes its busy state');
assert.match(metricSnapshotMarkup, /<svg[^>]*aria-hidden="true"/, 'snapshot spinner is decorative');
assert.match(metricSnapshotMarkup, /<svg[^>]*class="[^"]*motion-reduce:animate-none/, 'snapshot spinner respects reduced motion');

console.log('Retrospective detail loading and generation accessibility contracts passed');

for (const Skeleton of [StudioSkeletonCard, StudioSkeletonList, StudioSkeletonTable]) {
  const markup = renderToStaticMarkup(React.createElement(Skeleton));
  assert.match(markup, /aria-hidden="true"/, `${Skeleton.name} is hidden from assistive technology`);
}

console.log('Studio skeleton accessibility tests passed for card, list, and table variants');
