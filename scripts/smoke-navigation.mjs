import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import {
  canAccessNavigationSection,
  findNavigationSectionByPath,
  navigationSections,
} from '../src/config/navigation.ts';

const regularSections = navigationSections.filter((section) => !section.debugOnly);
const adminSections = regularSections.filter((section) => canAccessNavigationSection(section, 'admin'));
const memberSections = regularSections.filter((section) => canAccessNavigationSection(section, 'member'));

assert.equal(adminSections.length, 6, '管理员应看到 6 个一级模块');
assert.equal(memberSections.length, 5, '普通成员应看到 5 个一级模块');
assert.equal(findNavigationSectionByPath('/topics')?.id, 'content-production', '选题页应定位到内容生产');
assert.equal(findNavigationSectionByPath('/asset-center')?.id, 'asset-center', '资料中心路由应定位到资料中心');
assert.equal(findNavigationSectionByPath('/content-intelligence')?.debugOnly, true, '技术型入口应标记为调试入口');
assert.equal(navigationSections.some((section) => section.items.some((item) => item.id === 'operations')), false, '运维中心不能复用备份管理入口');

const sidebarSource = await readFile(new URL('../src/components/Sidebar.tsx', import.meta.url), 'utf8');
assert.match(sidebarSource, /xmt_sidebar_state/, '侧栏展开状态应持久化');
assert.match(sidebarSource, /pathname && state\.pathname !== pathname/, '不同路由进入时应优先定位当前模块');
assert.match(sidebarSource, /expanded \? null : section\.id/, '当前展开菜单应允许主动关闭');
assert.match(sidebarSource, /setExpandedGroup\(nextGroup\)/, '切换菜单应收起其他菜单');
assert.match(sidebarSource, /isMobile && <span className="font-medium">搜索命令 \/ 内容<\/span>/, '桌面侧栏搜索应收敛为图标，移动端保留文案');

console.log('Navigation smoke test passed: roles, route grouping, accordion persistence, and hidden debug entries verified.');
