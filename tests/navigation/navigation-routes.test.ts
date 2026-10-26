import assert from 'node:assert/strict';
import { buildBreadcrumbs, findNavigationItem, findNavigationSectionByPath, isNavigationItemActive } from '../../src/config/navigation';
import { getResourceDetailPath, getResourceLibraryPath } from '../../src/platform/resource-navigation';

const resourceLibraryPath = '/asset-center/resources';

for (const [search, expectedId, expectedLabel] of [
  ['', 'project-library', '项目资料库'],
  ['?library_type=project', 'project-library', '项目资料库'],
  ['?library_type=content_archive', 'content-archives', '内容档案库'],
  ['?library_type=media', 'media-archive', '素材归档'],
] as const) {
  const activeItem = findNavigationItem(resourceLibraryPath, search);
  assert.equal(activeItem?.id, expectedId, `${search || 'default project'} resolves to its matching sidebar item`);
  assert.equal(isNavigationItemActive(resourceLibraryPath, activeItem?.path || '', search), true);
  assert.equal(findNavigationSectionByPath(resourceLibraryPath, search)?.id, 'asset-center');
  assert.deepEqual(
    buildBreadcrumbs(resourceLibraryPath, search).map((crumb) => crumb.label),
    ['首页', '资料与资产', expectedLabel],
    `${search || 'default project'} shows its own breadcrumb without a false detail segment`,
  );
}

assert.notEqual(findNavigationItem(resourceLibraryPath, '?library_type=unknown')?.id, 'content-archives', 'unknown library types do not inherit the content archive highlight');
assert.equal(findNavigationItem('/asset-center/projects')?.id, 'project-library', 'the legacy project-library route remains active');
assert.equal(findNavigationItem('/asset-center/media')?.id, 'media-archive', 'the legacy media-library route remains active');
assert.deepEqual(buildBreadcrumbs('/asset-center/projects').map((crumb) => crumb.label), ['首页', '资料与资产', '项目资料库']);
assert.deepEqual(buildBreadcrumbs('/asset-center/media').map((crumb) => crumb.label), ['首页', '资料与资产', '素材归档']);
assert.equal(findNavigationItem('/asset-center/search')?.id, 'resource-search', 'the dedicated resource-search route has its own navigation identity');
assert.equal(findNavigationSectionByPath('/asset-center/search')?.id, 'asset-center');
assert.deepEqual(buildBreadcrumbs('/asset-center/search').map((crumb) => crumb.label), ['首页', '资料与资产', '资料搜索']);
assert.deepEqual(
  buildBreadcrumbs('/asset-center/resources/71').map((crumb) => crumb.label),
  ['首页', '资料与资产', '内容档案库', '详情'],
  'resource detail routes keep their existing detail breadcrumb',
);

for (const [libraryType, itemId, label] of [
  ['project', 'project-library', '项目资料库'],
  ['content_archive', 'content-archives', '内容档案库'],
  ['knowledge', 'knowledge-base', '知识库'],
  ['media', 'media-archive', '素材归档'],
] as const) {
  const detailPath = getResourceDetailPath(71, libraryType);
  const [detailPathname, detailSearch = ''] = detailPath.split('?');
  assert.equal(findNavigationItem(detailPathname, `?${detailSearch}`)?.id, itemId, `${libraryType} detail route keeps its library identity`);
  assert.deepEqual(
    buildBreadcrumbs(detailPathname, `?${detailSearch}`).map((crumb) => crumb.label),
    ['首页', '资料与资产', label, '详情'],
    `${libraryType} detail breadcrumb follows its source library`,
  );
}

assert.equal(getResourceDetailPath(71, 'project', true), '/asset-center/resources/71?library_type=project&edit=1');
assert.equal(getResourceLibraryPath('project'), '/asset-center/projects');
assert.equal(getResourceLibraryPath('content_archive'), '/asset-center/resources?library_type=content_archive');
assert.equal(getResourceLibraryPath('knowledge'), '/asset-center/knowledge');
assert.equal(getResourceLibraryPath('media'), '/asset-center/media');

console.log('Query-aware resource navigation tests passed');
