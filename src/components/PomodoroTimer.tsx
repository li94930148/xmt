import { useState, useEffect, useRef, useCallback } from 'react';
import { useThemeStyles } from '../hooks/useThemeStyles';
import { useAppStore } from '../store';
import { Play, Pause, RotateCcw, Timer, CheckCircle, Link } from 'lucide-react';

interface PomodoroTimerProps {
  topicId?: number;
  topicTitle?: string;
  compact?: boolean; // for dashboard card mode
}

const DURATION = 25 * 60; // 25 minutes in seconds

// Mock API — replace with real endpoints when backend is ready
async function startPomodoro(topicId?: number) {
  return { session_id: Date.now() };
}
async function completePomodoro(sessionId: number) {
  return { message: 'ok' };
}
async function getPomodoroStats(): Promise<{ today_count: number; total_count: number }> {
  return { today_count: 0, total_count: 0 };
}

export default function PomodoroTimer({ topicId, topicTitle, compact = false }: PomodoroTimerProps) {
  const styles = useThemeStyles();
  const appStore = useAppStore();
  const [timeLeft, setTimeLeft] = useState(DURATION);
  const [isRunning, setIsRunning] = useState(false);
  const [sessionId, setSessionId] = useState<number | null>(null);
  const [todayCount, setTodayCount] = useState(0);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // Fetch stats
  useEffect(() => {
    getPomodoroStats().then((s) => setTodayCount(s.today_count)).catch(() => {});
  }, []);

  // Timer logic
  useEffect(() => {
    if (isRunning && timeLeft > 0) {
      intervalRef.current = setInterval(() => {
        setTimeLeft((t) => t - 1);
      }, 1000);
    }
    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
  }, [isRunning, timeLeft]);

  // Completion
  useEffect(() => {
    if (timeLeft === 0 && isRunning) {
      setIsRunning(false);
      if (sessionId) {
        completePomodoro(sessionId).catch(() => {});
      }
      setTodayCount((c) => c + 1);
      appStore.addNotification({
        title: '🍅 番茄钟完成！',
        message: topicTitle ? `已完成「${topicTitle}」的一个番茄钟` : '25分钟专注时间已完成，休息一下吧！',
        type: 'success',
      });
      // Browser notification
      if (Notification.permission === 'granted') {
        new Notification('🍅 番茄钟完成！', {
          body: topicTitle ? `已完成「${topicTitle}」的一个番茄钟` : '25分钟专注时间已完成',
        });
      }
    }
  }, [timeLeft, isRunning]);

  const handleStart = useCallback(async () => {
    if (isRunning) {
      setIsRunning(false);
      return;
    }
    // Request notification permission
    if (Notification.permission === 'default') {
      Notification.requestPermission();
    }
    try {
      const res = await startPomodoro(topicId);
      setSessionId(res.session_id);
      setIsRunning(true);
    } catch {
      setIsRunning(true); // Start anyway
    }
  }, [isRunning, topicId]);

  const handleReset = useCallback(() => {
    setIsRunning(false);
    setTimeLeft(DURATION);
    setSessionId(null);
  }, []);

  const minutes = Math.floor(timeLeft / 60);
  const seconds = timeLeft % 60;
  const progress = ((DURATION - timeLeft) / DURATION) * 100;
  const circumference = 2 * Math.PI * 44;

  if (compact) {
    // Dashboard mini card
    return (
      <div className={`${styles.card} p-5`}>
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-2.5">
            <div className={`w-8 h-8 rounded-lg flex items-center justify-center ${
              styles.isDark ? 'bg-[#ff6b6b]/10' : 'bg-[#e03131]/10'
            }`}>
              <Timer className="w-4 h-4 text-[#ff6b6b]" />
            </div>
            <h3 className={`text-base font-semibold ${styles.textPrimary}`}>番茄钟</h3>
          </div>
          <div className="flex items-center gap-1.5">
            <CheckCircle className="w-3.5 h-3.5 text-[#51cf66]" />
            <span className={`text-xs ${styles.textSecondary}`}>今日 {todayCount} 个</span>
          </div>
        </div>

        <div className="flex items-center gap-4">
          {/* Mini progress ring */}
          <div className="relative w-16 h-16 flex-shrink-0">
            <svg className="w-16 h-16 -rotate-90" viewBox="0 0 100 100">
              <circle cx="50" cy="50" r="44" stroke={styles.isDark ? '#1e2030' : '#e9ecef'} strokeWidth="8" fill="none" />
              <circle
                cx="50" cy="50" r="44"
                stroke={timeLeft === 0 ? '#51cf66' : '#ff6b6b'}
                strokeWidth="8" fill="none"
                strokeLinecap="round"
                strokeDasharray={circumference}
                strokeDashoffset={circumference * (1 - progress / 100)}
                className="transition-all duration-1000"
              />
            </svg>
            <span className={`absolute inset-0 flex items-center justify-center text-sm font-bold ${styles.textPrimary}`}>
              {String(minutes).padStart(2, '0')}:{String(seconds).padStart(2, '0')}
            </span>
          </div>

          <div className="flex-1 space-y-2">
            {topicTitle && (
              <div className="flex items-center gap-1.5">
                <Link className="w-3 h-3 text-[#5c7cfa]" />
                <span className={`text-xs ${styles.textSecondary} truncate`}>{topicTitle}</span>
              </div>
            )}
            <div className="flex gap-2">
              <button
                onClick={handleStart}
                className={`flex-1 flex items-center justify-center gap-1.5 px-3 py-2 rounded-lg text-xs font-medium ${
                  isRunning ? styles.buttonSecondary : styles.buttonPrimary
                } transition-all`}
              >
                {isRunning ? <Pause className="w-3.5 h-3.5" /> : <Play className="w-3.5 h-3.5" />}
                {isRunning ? '暂停' : timeLeft < DURATION ? '继续' : '开始'}
              </button>
              <button
                onClick={handleReset}
                className={`p-2 rounded-lg ${styles.buttonSecondary} transition-colors`}
              >
                <RotateCcw className="w-3.5 h-3.5" />
              </button>
            </div>
          </div>
        </div>
      </div>
    );
  }

  // Full-size component
  return (
    <div className={`${styles.card} p-6`}>
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-2.5">
          <div className={`w-8 h-8 rounded-lg flex items-center justify-center ${
            styles.isDark ? 'bg-[#ff6b6b]/10' : 'bg-[#e03131]/10'
          }`}>
            <Timer className="w-4 h-4 text-[#ff6b6b]" />
          </div>
          <h3 className={`text-base font-semibold ${styles.textPrimary}`}>番茄钟</h3>
        </div>
        <div className="flex items-center gap-1.5">
          <CheckCircle className="w-4 h-4 text-[#51cf66]" />
          <span className={`text-sm ${styles.textSecondary}`}>今日已完成 <span className={`font-semibold ${styles.textPrimary}`}>{todayCount}</span> 个</span>
        </div>
      </div>

      {/* Progress Ring */}
      <div className="flex flex-col items-center mb-6">
        <div className="relative w-40 h-40">
          <svg className="w-40 h-40 -rotate-90" viewBox="0 0 100 100">
            <circle cx="50" cy="50" r="44" stroke={styles.isDark ? '#1e2030' : '#e9ecef'} strokeWidth="6" fill="none" />
            <circle
              cx="50" cy="50" r="44"
              stroke={timeLeft === 0 ? '#51cf66' : '#ff6b6b'}
              strokeWidth="6" fill="none"
              strokeLinecap="round"
              strokeDasharray={circumference}
              strokeDashoffset={circumference * (1 - progress / 100)}
              className="transition-all duration-1000"
            />
          </svg>
          <div className="absolute inset-0 flex flex-col items-center justify-center">
            <span className={`text-3xl font-bold tracking-tight ${styles.textPrimary}`}>
              {String(minutes).padStart(2, '0')}:{String(seconds).padStart(2, '0')}
            </span>
            <span className={`text-xs ${styles.textMuted} mt-1`}>
              {isRunning ? '专注中...' : timeLeft === 0 ? '完成！' : '准备开始'}
            </span>
          </div>
        </div>
      </div>

      {/* Topic Link */}
      {topicTitle && (
        <div className={`flex items-center justify-center gap-2 mb-4 px-3 py-2 rounded-lg ${
          styles.isDark ? 'bg-[#1e2030]' : 'bg-[#f8f9fa]'
        }`}>
          <Link className="w-3.5 h-3.5 text-[#5c7cfa]" />
          <span className={`text-sm ${styles.textSecondary}`}>{topicTitle}</span>
        </div>
      )}

      {/* Controls */}
      <div className="flex items-center justify-center gap-3">
        <button
          onClick={handleStart}
          className={`flex items-center gap-2 px-6 py-2.5 rounded-xl text-sm font-medium ${
            isRunning ? styles.buttonSecondary : styles.buttonPrimary
          } transition-all duration-200 hover:scale-[1.02] active:scale-[0.98]`}
        >
          {isRunning ? <Pause className="w-4 h-4" /> : <Play className="w-4 h-4" />}
          {isRunning ? '暂停' : timeLeft < DURATION ? '继续' : '开始专注'}
        </button>
        <button
          onClick={handleReset}
          className={`p-2.5 rounded-xl ${styles.buttonSecondary} transition-colors`}
          title="重置"
        >
          <RotateCcw className="w-4 h-4" />
        </button>
      </div>
    </div>
  );
}
