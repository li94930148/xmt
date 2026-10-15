const visibilityLabels: Record<string, string> = {
  private: '私有',
  project: '项目关联',
  team: '团队',
  company: '企业',
};

const statusLabels: Record<string, string> = {
  active: '可用',
  published: '已发布',
  deleted: '已移入回收站',
};

export function resourceVisibilityLabel(value: unknown): string {
  const key = typeof value === 'string' ? value.trim().toLowerCase() : '';
  return Object.prototype.hasOwnProperty.call(visibilityLabels, key) ? visibilityLabels[key] : '范围待确认';
}

export function resourceStatusLabel(value: unknown): string {
  const key = typeof value === 'string' ? value.trim().toLowerCase() : '';
  return Object.prototype.hasOwnProperty.call(statusLabels, key) ? statusLabels[key] : '状态待确认';
}
