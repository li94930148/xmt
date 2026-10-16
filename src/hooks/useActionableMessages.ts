import { useCallback, useEffect, useState } from 'react';
import { getMessages } from '../api/messages';
import { useAuthStore } from '../store';
import type { Message } from '../types';

export function useActionableMessages(enabled: boolean) {
  const userId = useAuthStore((state) => state.user?.id);
  const [snapshot, setSnapshot] = useState<{ userId: number; messages: Message[]; count: number } | null>(null);
  const [hasError, setHasError] = useState(false);
  const [loading, setLoading] = useState(false);
  const [reloadKey, setReloadKey] = useState(0);

  useEffect(() => {
    if (!enabled || !userId) {
      setSnapshot(null);
      setHasError(false);
      setLoading(false);
      return;
    }

    let active = true;
    setLoading(true);
    void getMessages({ page: 1, limit: 3, read: 'unread', link: 'present' })
      .then((result) => {
        if (!active) return;
        setSnapshot({ userId, messages: result.data, count: result.summary.actionable });
        setHasError(false);
      })
      .catch(() => {
        if (!active) return;
        setHasError(true);
      })
      .finally(() => {
        if (active) setLoading(false);
      });

    return () => { active = false; };
  }, [enabled, reloadKey, userId]);

  const reload = useCallback(() => setReloadKey((current) => current + 1), []);
  const currentSnapshot = snapshot?.userId === userId ? snapshot : null;
  const error = hasError
    ? currentSnapshot
      ? '待处理消息读取失败，仍显示最近成功读取的结果；请重试确认。'
      : '待处理消息暂时无法读取，请重试。'
    : '';

  return { messages: currentSnapshot?.messages ?? [], count: currentSnapshot?.count ?? 0, error, loading, reload };
}
