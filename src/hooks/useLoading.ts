import { useState, useCallback, useRef } from 'react';

/**
 * 防重复点击 hook
 * 用法：const { loading, run } = useLoading(async () => { ... });
 * 
 * 返回的 run 函数会在执行期间设置 loading=true，
 * 防止重复点击；如果已经在执行则直接跳过。
 */
export function useLoading<T extends (...args: any[]) => Promise<any>>(fn: T) {
  const [loading, setLoading] = useState(false);
  const runningRef = useRef(false);

  const run = useCallback(async (...args: Parameters<T>) => {
    if (runningRef.current) return;
    runningRef.current = true;
    setLoading(true);
    try {
      return await fn(...args);
    } finally {
      runningRef.current = false;
      setLoading(false);
    }
  }, [fn]) as T;

  return { loading, run };
}
