import { useCountUp } from '../animations/useCountUp';

export default function AnimatedNumber({ value, suffix = '', decimals = 0 }: { value: number; suffix?: string; decimals?: number }) {
  const animated = useCountUp(value);
  return <span className="xmt-data-number">{animated.toLocaleString('zh-CN', { maximumFractionDigits: decimals })}{suffix}</span>;
}
