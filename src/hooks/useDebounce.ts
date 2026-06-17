import { useState, useEffect } from 'react';

/**
 * 防抖 Hook - 延迟更新值，避免频繁触发请求
 * @param value 要防抖的值
 * @param delay 延迟毫秒数，默认 400ms
 */
export function useDebounce<T>(value: T, delay: number = 400): T {
  const [debouncedValue, setDebouncedValue] = useState<T>(value);

  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedValue(value);
    }, delay);

    return () => clearTimeout(timer);
  }, [value, delay]);

  return debouncedValue;
}
