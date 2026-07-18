export type TopicHtmlCompatibilityFixture = {
  id: `THTML-${string}`;
  description: string;
  legacyHtml: string;
  expectedSignals: string[];
  notes: string;
};

/**
 * Fixed, non-production fixtures for Topic HTML admission. They document the
 * existing legacy input dialect; they are not a data migration mechanism.
 */
export const topicHtmlCompatibilityFixtures: TopicHtmlCompatibilityFixture[] = [
  {
    id: 'THTML-01',
    description: '普通文本',
    legacyHtml: '<p>普通文本 <strong>强调</strong></p>',
    expectedSignals: ['普通文本', '<strong>强调</strong>'],
    notes: '基线段落和 StarterKit mark。',
  },
  {
    id: 'THTML-02',
    description: 'font/span 历史格式',
    legacyHtml: '<p><font color="#e74c3c" face="Arial" size="5">旧字体</font><span style="font-size: 18px; font-family: serif;">样式文本</span></p>',
    expectedSignals: ['旧字体', '样式文本', 'color'],
    notes: 'Legacy RichTextEditor 会规范化 font；当前 Tiptap schema 未声明 font-family/font-size mark。',
  },
  {
    id: 'THTML-03',
    description: '颜色样式',
    legacyHtml: '<p><span style="color: #3498db; background-color: #fff3cd;">彩色文本</span></p>',
    expectedSignals: ['彩色文本', 'color', 'background-color'],
    notes: 'Color 与 Highlight 的保真边界。',
  },
  {
    id: 'THTML-04',
    description: '列表',
    legacyHtml: '<ul><li>第一项</li><li>第二项<ul><li>嵌套项</li></ul></li></ul><ol><li>有序项</li></ol>',
    expectedSignals: ['<ul>', '<ol>', '第一项', '嵌套项', '有序项'],
    notes: 'StarterKit 列表与嵌套列表。',
  },
  {
    id: 'THTML-05',
    description: '表格',
    legacyHtml: '<table><tbody><tr><th>标题</th><th>数值</th></tr><tr><td>内容</td><td>42</td></tr></tbody></table>',
    expectedSignals: ['<table', '<th', '<td', '标题', '42'],
    notes: '当前 Table / TableHeader / TableCell 扩展。',
  },
  {
    id: 'THTML-06',
    description: 'legacy 批注',
    legacyHtml: '<p><span class="annotation-text" data-annotation-id="legacy-comment-1" data-comment="历史批注">带批注文本</span></p>',
    expectedSignals: ['带批注文本', 'data-comment-id', 'data-comment-text', 'data-created-at'],
    notes: '刻意使用旧 annotation dialect，验证其不能静默映射为 Tiptap CommentExtension。',
  },
  {
    id: 'THTML-07',
    description: '空 HTML',
    legacyHtml: '',
    expectedSignals: [],
    notes: '空值必须安全归一为可编辑空段落。',
  },
  {
    id: 'THTML-08',
    description: '异常 HTML',
    legacyHtml: '<p>未闭合 <strong>标签</p><script>alert("fixture")</script><unknown-tag data-x="1">保留文本</unknown-tag>',
    expectedSignals: ['未闭合', '标签', '保留文本'],
    notes: '验证解析修复和未知/危险标签的丢弃策略；不执行任何脚本。',
  },
];
