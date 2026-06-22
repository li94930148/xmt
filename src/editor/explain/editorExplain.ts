import type { ChangeOrigin } from '../state/editorStateManager';

export interface EditorChangeExplanation {
  type: string;
  origin: ChangeOrigin;
  message: string;
  affectedNodes?: string[];
}

export function explainChange(event: {
  type?: string;
  origin?: ChangeOrigin;
  userName?: string;
  affectedNodes?: string[];
}): EditorChangeExplanation {
  const type = event.type || 'edit';
  const origin = event.origin || 'user';
  const actor = event.userName || (origin === 'remote' ? '协作者' : '你');

  const messages: Record<ChangeOrigin, string> = {
    user: `${actor}正在编辑正文`,
    remote: `${actor}正在修改段落`,
    snapshot: '系统正在从快照恢复文档',
    system: '系统正在同步文档状态',
  };

  return {
    type,
    origin,
    message: messages[origin],
    affectedNodes: event.affectedNodes,
  };
}

export function explainAutoSave(reason: 'debounce' | 'collaboration' | 'snapshot restore' | 'manual') {
  const messages: Record<typeof reason, string> = {
    debounce: '检测到内容停顿，正在自动保存',
    collaboration: '协作内容已更新，正在同步保存',
    'snapshot restore': '快照恢复完成，等待同步到运行态',
    manual: '版本操作触发保存',
  };

  return messages[reason];
}
