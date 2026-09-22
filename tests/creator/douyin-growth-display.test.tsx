import assert from 'node:assert/strict';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { GrowthBlock } from '../../src/pages/creator-center/CreatorDashboard.js';

const partial = renderToStaticMarkup(<GrowthBlock title="近 7 天" official data={{ fans: null, plays: 3505, interactions: 60 }} />);
assert(partial.includes('缺少可比粉丝快照'));
assert(partial.includes('新增播放'));
assert(partial.includes('+3,505'));
assert(!partial.includes('暂不可用'));

const complete = renderToStaticMarkup(<GrowthBlock title="近 30 天" official data={{ fans: 0, plays: 0, interactions: -9 }} />);
assert(complete.includes('粉丝净变化'));
assert(complete.includes('+0'));
assert(complete.includes('-9'));
assert(!complete.includes('缺少可比粉丝快照'));

const missingExport = renderToStaticMarkup(<GrowthBlock title="近 30 天" official data={{ fans: null, plays: null, interactions: null }} />);
assert(missingExport.includes('缺少该周期官方导出'));

console.log('Douyin growth display tests passed: partial values, zero, negative correction and missing-period explanation.');
