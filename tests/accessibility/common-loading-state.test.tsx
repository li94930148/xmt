import assert from 'node:assert/strict';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, it } from 'vitest';
import LoadingState from '../../src/components/common/LoadingState';
import RetroList from '../../src/components/retrospectives/RetroList';
import MyRetroActionsPanel from '../../src/components/retrospectives/MyRetroActionsPanel';
import RetroDailyRiskPanel from '../../src/components/retrospectives/RetroDailyRiskPanel';
import RetroMetricSnapshotPanel from '../../src/components/retrospectives/RetroMetricSnapshotPanel';
import DailyReportArchiveList from '../../src/components/daily-report/DailyReportArchiveList';
import { StudioSkeletonCard, StudioSkeletonList, StudioSkeletonTable } from '../../src/components/studio/Skeleton';

const variants = ['table', 'inline', 'page', 'section'] as const;

describe('loading-state accessibility', () => {
  for (const variant of variants) {
    it(`announces ${variant} loading politely and hides decoration`, () => {
      const text = `正在读取${variant}状态…`;
      const markup = renderToStaticMarkup(React.createElement(LoadingState, { type: variant, text }));

      assert.match(markup, /role="status"/, `${variant} loading state exposes status semantics`);
      assert.match(markup, /aria-live="polite"/, `${variant} loading state announces without interrupting`);
      assert.match(markup, /aria-atomic="true"/, `${variant} loading message is announced as one update`);
      assert.match(markup, new RegExp(text), `${variant} loading state includes its status message`);
      assert.match(markup, /aria-hidden="true"/, `${variant} loading decoration or skeleton is hidden from assistive technology`);
    });
  }

  it('announces retrospective list loading and marks the refresh area busy', () => {
    const markup = renderToStaticMarkup(React.createElement(RetroList, {
      retrospectives: [],
      loading: true,
      error: null,
      canCreate: false,
      onCreate: () => undefined,
      onRefresh: () => undefined,
      onOpen: () => undefined,
    }));

    assert.match(markup, /role="status" aria-live="polite" aria-atomic="true">正在加载复盘列表…/, 'retrospective table loading is politely announced as one update');
    assert.match(markup, /aria-busy="true"/, 'retrospective refresh exposes its busy state while loading');
    assert.match(markup, /<svg[^>]*aria-hidden="true"/, 'retrospective refresh spinner is decorative');
    assert.match(markup, /<svg[^>]*class="[^"]*motion-reduce:animate-none/, 'retrospective refresh spinner respects reduced motion');
  });

  it('announces personal retrospective action loading and marks it busy', () => {
    const markup = renderToStaticMarkup(React.createElement(MyRetroActionsPanel, {
      actions: [],
      loading: true,
      error: null,
      onRefresh: () => undefined,
      onOpen: () => undefined,
    }));

    assert.match(markup, /role="status" aria-live="polite" aria-atomic="true"[^>]*>正在加载行动项/, 'personal retrospective actions announce loading politely');
    assert.match(markup, /aria-busy="true"/, 'personal retrospective actions refresh exposes its busy state');
    assert.match(markup, /<svg[^>]*aria-hidden="true"/, 'personal retrospective actions spinner is decorative');
    assert.match(markup, /<svg[^>]*class="[^"]*motion-reduce:animate-none/, 'personal retrospective actions spinner respects reduced motion');
  });

  it('announces daily risk loading and marks the panel busy', () => {
    const markup = renderToStaticMarkup(React.createElement(RetroDailyRiskPanel, {
      risks: [],
      users: [],
      status: 'draft',
      canManageActions: false,
      loading: true,
      error: null,
      onRefresh: () => undefined,
      onCreateAction: () => false,
    }));

    assert.match(markup, /role="status" aria-live="polite" aria-atomic="true"[^>]*>正在加载日报风险/, 'daily risk reads announce loading politely');
    assert.match(markup, /aria-busy="true"/, 'daily risk refresh exposes its busy state');
    assert.match(markup, /<svg[^>]*aria-hidden="true"/, 'daily risk spinner is decorative');
    assert.match(markup, /<svg[^>]*class="[^"]*motion-reduce:animate-none/, 'daily risk spinner respects reduced motion');
  });

  it('announces metric snapshot generation and marks its action busy', () => {
    const markup = renderToStaticMarkup(React.createElement(RetroMetricSnapshotPanel, {
      snapshots: [],
      status: 'draft',
      canGenerate: true,
      loading: true,
      onGenerate: () => undefined,
    }));

    assert.match(markup, /role="status" aria-live="polite" aria-atomic="true"[^>]*>正在生成指标快照/, 'snapshot generation announces its pending state politely');
    assert.match(markup, /aria-busy="true"/, 'snapshot generation button exposes its busy state');
    assert.match(markup, /<svg[^>]*aria-hidden="true"/, 'snapshot spinner is decorative');
    assert.match(markup, /<svg[^>]*class="[^"]*motion-reduce:animate-none/, 'snapshot spinner respects reduced motion');
  });

  for (const Skeleton of [StudioSkeletonCard, StudioSkeletonList, StudioSkeletonTable]) {
    it(`hides ${Skeleton.name} from assistive technology`, () => {
      const markup = renderToStaticMarkup(React.createElement(Skeleton));
      assert.match(markup, /aria-hidden="true"/, `${Skeleton.name} is hidden from assistive technology`);
    });
  }

  it('labels daily report archive member and date filters', () => {
    const markup = renderToStaticMarkup(React.createElement(DailyReportArchiveList, {
      start: '2026-10-01',
      end: '2026-10-29',
      reports: [],
      loading: false,
      canFilterUser: true,
      users: [],
      selectedUserId: '',
      onStartChange: () => undefined,
      onEndChange: () => undefined,
      onUserChange: () => undefined,
      onSearch: () => undefined,
      onView: () => undefined,
    }));

    assert.match(markup, /<label[^>]*for="daily-report-archive-user-filter"[^>]*>成员<\/label>/, 'member filter has a programmatic accessible label');
    assert.match(markup, /<select[^>]*id="daily-report-archive-user-filter"[^>]*name="user_id"/, 'member filter has stable field identifiers');
    assert.match(markup, /<label[^>]*for="daily-report-archive-start-date"[^>]*>开始日期<\/label>/, 'archive start date has a programmatic accessible label');
    assert.match(markup, /<input[^>]*id="daily-report-archive-start-date"[^>]*name="start_date"[^>]*type="date"/, 'archive start date has a stable field identifier');
    assert.match(markup, /<label[^>]*for="daily-report-archive-end-date"[^>]*>结束日期<\/label>/, 'archive end date has a programmatic accessible label');
    assert.match(markup, /<input[^>]*id="daily-report-archive-end-date"[^>]*name="end_date"[^>]*type="date"/, 'archive end date has a stable field identifier');
  });
});
