export type TopicHtmlMigrationScopeFixture = {
  readonly id: 'THTML-04' | 'THTML-05' | 'THTML-07';
  readonly label: string;
  readonly legacyHtml: string;
  readonly expectedReloadSignals: readonly string[];
  readonly expectedCanonicalization: string;
  readonly initialDecision: 'approve' | 'pilot_only' | 'blocked';
};

/**
 * Independent, non-production candidates for D10-H3 assessment. These values
 * are deliberately not connected to a Topic record or migration command.
 */
export const topicHtmlMigrationScopeFixtures: readonly TopicHtmlMigrationScopeFixture[] = [
  {
    id: 'THTML-04',
    label: 'nested ordered and unordered lists',
    legacyHtml: '<ul><li>第一项</li><li>第二项<ul><li>嵌套项</li></ul></li></ul><ol><li>有序项</li></ol>',
    expectedReloadSignals: ['<ul>', '<ol>', '第一项', '第二项', '嵌套项', '有序项'],
    expectedCanonicalization: 'Tiptap adds paragraph wrappers inside list items.',
    initialDecision: 'pilot_only',
  },
  {
    id: 'THTML-05',
    label: 'semantic table',
    legacyHtml: '<table><tbody><tr><th>标题</th><th>数值</th></tr><tr><td>内容</td><td>42</td></tr></tbody></table>',
    expectedReloadSignals: ['<table', '<th', '<td', '标题', '数值', '内容', '42'],
    expectedCanonicalization: 'Tiptap adds colgroup, minimum widths, paragraph wrappers, and cell spans.',
    initialDecision: 'pilot_only',
  },
  {
    id: 'THTML-07',
    label: 'empty HTML',
    legacyHtml: '',
    expectedReloadSignals: ['<p></p>'],
    expectedCanonicalization: 'Empty input becomes one editable empty paragraph.',
    initialDecision: 'approve',
  },
];
