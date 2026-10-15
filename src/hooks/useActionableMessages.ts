import { useCallback, useEffect, useState } from 'react';
import { getMessages } from '../api/messages';
import { useAuthStore } from '../store';
import type { Message } from '../types';

export function useActionableMessages(enabled: boolean) {
  const userId = useAuthStore((state) => state.user?.id);
  const [messages, setMessages] = useState<Message[]>([]);
  const [count, setCount] = useState(0);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [reloadKey, setReloadKey] = useState(0);

  useEffect(() => {
    if (!enabled || !userId) {
      setMessages([]);
      setCount(0);
      setError('');
      setLoading(false);
      return;
    }

    let active = true;
    setLoading(true);
    setError('');
    void getMessages({ page: 1, limit: 3, read: 'unread', link: 'present' })
      .then((result) => {
        if (!active) return;
        setMessages(result.data);
        setCount(result.summary.actionable);
      })
      .catch(() => {
        if (!active) return;
        setMessages([]);
        setCount(0);
        setError('待处理消息暂时无法读取，请重试。');
      })
      .finally(() => {
        if (active) setLoading(false);
      });

    return () => { active = false; };
  }, [enabled, reloadKey, userId]);

  const reload = useCallback(() => setReloadKey((current) => current + 1), []);

  return { messages, count, error, loading, reload };
}
