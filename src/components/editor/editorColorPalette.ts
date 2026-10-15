/**
 * Stable content colors persisted in manuscript marks; these are content semantics,
 * not application chrome colors, so they stay consistent across light/dark themes.
 */
export const EDITOR_HIGHLIGHT_COLORS = [
  { name: '黄色', value: 'yellow', bg: '#fef08a' },
  { name: '绿色', value: 'green', bg: '#bbf7d0' },
  { name: '蓝色', value: 'blue', bg: '#bfdbfe' },
  { name: '红色', value: 'red', bg: '#fecaca' },
  { name: '紫色', value: 'purple', bg: '#ddd6fe' },
  { name: '橙色', value: 'orange', bg: '#fed7aa' },
  { name: '灰色', value: 'gray', bg: '#e5e7eb' },
  { name: '青色', value: 'cyan', bg: '#a5f3fc' },
] as const;

export const EDITOR_TEXT_COLORS = [
  { name: '默认', value: '', bg: '#374151' },
  { name: '红色', value: '#ef4444', bg: '#ef4444' },
  { name: '橙色', value: '#f97316', bg: '#f97316' },
  { name: '黄色', value: '#eab308', bg: '#eab308' },
  { name: '绿色', value: '#22c55e', bg: '#22c55e' },
  { name: '蓝色', value: '#3b82f6', bg: '#3b82f6' },
  { name: '紫色', value: '#a855f7', bg: '#a855f7' },
  { name: '粉色', value: '#ec4899', bg: '#ec4899' },
] as const;
