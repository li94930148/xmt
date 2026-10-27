import { useState, useEffect, useRef, useCallback } from 'react';
import { useThemeStyles } from '../hooks/useThemeStyles';
import { useAppStore } from '../store';
import { Play, Pause, RotateCcw, Timer, CheckCircle, Link } from 'lucide-react';
import { cancelPomodoro, completePomodoro, getActivePomodoro, getPomodoroStats, startPomodoro } from '../api/pomodoro';
import { isDesktopNotifyEnabled, isNotificationSupported, notifyDesktop } from '../utils/notification';

interface PomodoroTimerProps {
  topicId?: number;
  topicTitle?: string;
  compact?: boolean; // for dashboard card mode
}

const DURATION = 25 * 60; // 25 minutes in seconds
type PomodoroMutation = 'starting' | 'resetting' | 'completing' | null;

export default function PomodoroTimer({ topicId, topicTitle, compact = false }: PomodoroTimerProps) {
  const styles = useThemeStyles();
  const appStore = useAppStore();
  const [timeLeft, setTimeLeft] = useState(DURATION);
  const [timerDuration, setTimerDuration] = useState(DURATION);
  const [isRunning, setIsRunning] = useState(false);
  const [sessionId, setSessionId] = useState<number | null>(null);
  const [activeSessionReadState, setActiveSessionReadState] = useState<'loading' | 'ready' | 'error'>('loading');
  const [activeSessionReadError, setActiveSessionReadError] = useState('');
  const [activeSessionAnnouncement, setActiveSessionAnnouncement] = useState('');
  const [todayCount, setTodayCount] = useState(0);
  const [statsError, setStatsError] = useState('');
  const [mutation, setMutation] = useState<PomodoroMutation>(null);
  const [mutationError, setMutationError] = useState('');
  const [completionUnconfirmed, setCompletionUnconfirmed] = useState(false);
  const mutationLockRef = useRef(false);
  const activeSessionReadLockRef = useRef(false);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const completionAtBoundary = isRunning && timeLeft === 0;
  const controlsLocked = activeSessionReadState !== 'ready' || mutation !== null || completionUnconfirmed || completionAtBoundary;
  const mutationMessage = mutation === 'starting'
    ? '正在开始番茄钟…'
    : mutation === 'resetting'
      ? '正在重置番茄钟…'
      : mutation === 'completing'
        ? '正在保存完成记录…'
        : '';

  // Fetch stats
  const refreshStats = useCallback(async () => {
    try { const stats = await getPomodoroStats(); setTodayCount(stats.today); setStatsError(''); }
    catch (error) { setStatsError(error instanceof Error ? error.message : '获取番茄钟统计失败'); }
  }, []);
  useEffect(() => { void refreshStats(); }, [refreshStats]);

  const restoreActiveSession = useCallback(async () => {
    if (activeSessionReadLockRef.current) return;
    activeSessionReadLockRef.current = true;
    setActiveSessionReadState('loading');
    setActiveSessionReadError('');
    setActiveSessionAnnouncement('正在读取当前番茄钟状态。');
    try {
      const session = await getActivePomodoro();
      if (!session) {
        setSessionId(null);
        setTimerDuration(DURATION);
        setTimeLeft(DURATION);
        setIsRunning(false);
        setActiveSessionAnnouncement('当前没有正在进行的番茄钟。');
      } else {
        const nextDuration = Number.isSafeInteger(session.duration) && session.duration > 0
          ? session.duration * 60
          : DURATION;
        const remainingSeconds = Number.isSafeInteger(session.remainingSeconds)
          ? Math.max(0, Math.min(nextDuration, session.remainingSeconds))
          : nextDuration;
        setSessionId(session.sessionId);
        setTimerDuration(nextDuration);
        setTimeLeft(remainingSeconds);
        setIsRunning(true);
        setActiveSessionAnnouncement('已恢复正在进行的番茄钟。');
      }
      setActiveSessionReadState('ready');
    } catch {
      setActiveSessionReadState('error');
      setActiveSessionReadError('当前番茄钟状态暂时无法读取。请重新读取后再开始或重置。');
      setActiveSessionAnnouncement('');
    } finally {
      activeSessionReadLockRef.current = false;
    }
  }, []);
  useEffect(() => { void restoreActiveSession(); }, [restoreActiveSession]);

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

  const persistCompletion = useCallback(async (id: number) => {
    if (mutationLockRef.current) return;
    mutationLockRef.current = true;
    setMutation('completing');
    setMutationError('');
    try {
      await completePomodoro(id);
      setSessionId(null);
      setCompletionUnconfirmed(false);
      void refreshStats();
      const title = '🍅 番茄钟完成！';
      const message = topicTitle ? `已完成「${topicTitle}」的一个番茄钟` : '25分钟专注时间已完成，休息一下吧！';
      const useDesktopNotification = document.visibilityState !== 'visible'
        && isNotificationSupported()
        && isDesktopNotifyEnabled()
        && Notification.permission === 'granted';

      if (useDesktopNotification) {
        notifyDesktop({ title, body: message });
      } else {
        appStore.addNotification({ title, message, type: 'success' });
      }
    } catch {
      setCompletionUnconfirmed(true);
      setMutationError('完成结果尚未确认；请重试保存完成记录，在确认前无法重置此番茄钟。');
    } finally {
      mutationLockRef.current = false;
      setMutation(null);
    }
  }, [appStore, refreshStats, topicTitle]);

  // Completion writes use the same synchronous lock as start/reset so a reset
  // cannot delete a session while its completion request is in flight.
  useEffect(() => {
    if (timeLeft === 0 && isRunning) {
      setIsRunning(false);
      if (sessionId) void persistCompletion(sessionId);
    }
  }, [isRunning, persistCompletion, sessionId, timeLeft]);

  const handleRetryCompletion = useCallback(() => {
    if (completionUnconfirmed && sessionId !== null) void persistCompletion(sessionId);
  }, [completionUnconfirmed, persistCompletion, sessionId]);

  const handleStart = useCallback(async () => {
    if (activeSessionReadState !== 'ready' || mutationLockRef.current || completionUnconfirmed || completionAtBoundary) return;
    if (isRunning) {
      setIsRunning(false);
      return;
    }
    // Request notification permission
    if (typeof Notification !== 'undefined' && Notification.permission === 'default') {
      void Notification.requestPermission();
    }
    if (sessionId) {
      setIsRunning(true);
      return;
    }

    mutationLockRef.current = true;
    setMutation('starting');
    setMutationError('');
    try {
      const res = await startPomodoro({ duration: 25, topic_id: topicId });
      setSessionId(res.sessionId);
      const nextDuration = Number.isSafeInteger(res.duration) && Number(res.duration) > 0
        ? Number(res.duration) * 60
        : DURATION;
      setTimerDuration(nextDuration);
      const remainingSeconds = Number.isSafeInteger(res.remainingSeconds)
        ? Math.max(0, Math.min(nextDuration, Number(res.remainingSeconds)))
        : nextDuration;
      setTimeLeft(remainingSeconds);
      setIsRunning(true);
    } catch {
      setMutationError('启动结果尚未确认；再次点击“开始”会恢复服务端当前会话。');
    } finally {
      mutationLockRef.current = false;
      setMutation(null);
    }
  }, [activeSessionReadState, completionAtBoundary, completionUnconfirmed, isRunning, sessionId, topicId]);

  const handleReset = useCallback(async () => {
    if (activeSessionReadState !== 'ready' || mutationLockRef.current || completionUnconfirmed || completionAtBoundary) return;
    if (!sessionId) {
      setMutationError('');
      setIsRunning(false);
      setTimerDuration(DURATION);
      setTimeLeft(DURATION);
      return;
    }

    mutationLockRef.current = true;
    setMutation('resetting');
    setMutationError('');
    const wasRunning = isRunning;
    const timeBeforeReset = timeLeft;
    if (intervalRef.current) {
      clearInterval(intervalRef.current);
      intervalRef.current = null;
    }
    setIsRunning(false);
    try {
      await cancelPomodoro(sessionId);
      setTimeLeft(DURATION);
      setTimerDuration(DURATION);
      setSessionId(null);
      setCompletionUnconfirmed(false);
    } catch {
      setTimeLeft(timeBeforeReset);
      setIsRunning(wasRunning);
      setMutationError('重置结果尚未确认；点击“重置”可安全重试。');
    } finally {
      mutationLockRef.current = false;
      setMutation(null);
    }
  }, [activeSessionReadState, completionAtBoundary, completionUnconfirmed, isRunning, sessionId, timeLeft]);

  const activeSessionFeedback = <>
    <p role="status" aria-live="polite" aria-atomic="true" className={`text-xs ${styles.textSecondary}`}>{activeSessionAnnouncement}</p>
    {activeSessionReadState === 'error' ? <div role="alert" className="space-y-2 text-xs text-studio-coral">
      <p>{activeSessionReadError}</p>
      <button type="button" data-testid="pomodoro-active-retry" onClick={() => void restoreActiveSession()} className="xmt-btn xmt-btn-secondary min-h-10 w-full rounded-lg px-3 py-2 font-medium">重新读取番茄钟状态</button>
    </div> : null}
  </>;

  const minutes = Math.floor(timeLeft / 60);
  const seconds = timeLeft % 60;
  const progress = ((timerDuration - timeLeft) / timerDuration) * 100;
  const circumference = 2 * Math.PI * 44;

  if (compact) {
    // Dashboard mini card
    return (
      <div className={`${styles.card} p-5`}>
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-2.5">
            <div className={`w-8 h-8 rounded-lg flex items-center justify-center ${
              styles.isDark ? 'bg-studio-coral/10' : 'bg-studio-coral/10'
            }`}>
              <Timer className="w-4 h-4 text-studio-coral" />
            </div>
            <h3 className={`text-base font-semibold ${styles.textPrimary}`}>番茄钟</h3>
          </div>
          <div className="flex items-center gap-1.5">
            <CheckCircle className="w-3.5 h-3.5 text-studio-success" />
            {statsError ? <button type="button" onClick={() => void refreshStats()} className={`xmt-btn xmt-btn-ghost min-h-10 shrink-0 px-2 text-xs underline ${styles.textSecondary}`}>统计加载失败，重试</button> : <span className={`text-xs ${styles.textSecondary}`}>今日 {todayCount} 个</span>}
          </div>
        </div>

        <div className="flex items-center gap-4">
          {/* Mini progress ring */}
          <div className="relative w-16 h-16 flex-shrink-0">
            <svg className="w-16 h-16 -rotate-90" viewBox="0 0 100 100">
              <circle cx="50" cy="50" r="44" stroke={styles.isDark ? 'var(--xmt-surface-elevated)' : 'var(--xmt-surface-soft)'} strokeWidth="8" fill="none" />
              <circle
                cx="50" cy="50" r="44"
                stroke={timeLeft === 0 ? 'var(--xmt-success)' : 'var(--xmt-coral)'}
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
                <Link className="w-3 h-3 text-studio-primary" />
                <span className={`text-xs ${styles.textSecondary} truncate`}>{topicTitle}</span>
              </div>
            )}
            <div className="flex gap-2">
              <button
                type="button"
                data-testid="pomodoro-start-button"
                onClick={handleStart}
                disabled={controlsLocked}
                aria-busy={mutation !== null}
                aria-label={isRunning ? '暂停番茄钟' : sessionId ? '继续番茄钟' : '开始番茄钟'}
                className={`flex-1 flex items-center justify-center gap-1.5 px-3 py-2 rounded-lg text-xs font-medium ${
                  isRunning ? styles.buttonSecondary : styles.buttonPrimary
                } transition-all disabled:cursor-not-allowed disabled:opacity-60`}
              >
                {isRunning ? <Pause className="w-3.5 h-3.5" /> : <Play className="w-3.5 h-3.5" />}
                {mutation === 'starting' ? '正在开始…' : isRunning ? '暂停' : sessionId && timeLeft < DURATION ? '继续' : '开始'}
              </button>
              <button
                type="button"
                data-testid="pomodoro-reset-button"
                onClick={handleReset}
                disabled={controlsLocked}
                aria-label="重置番茄钟"
                aria-busy={mutation === 'resetting'}
                title={completionUnconfirmed ? '完成结果待确认，不能重置' : mutation === 'starting' ? '开始完成后才能重置' : mutation === 'completing' ? '正在保存完成记录' : mutation === 'resetting' ? '正在重置番茄钟' : '重置番茄钟'}
                className="xmt-btn xmt-btn-secondary h-10 w-10 shrink-0 !p-0 transition-colors disabled:cursor-not-allowed disabled:opacity-60"
              >
                <RotateCcw className="w-3.5 h-3.5" />
              </button>
            </div>
            {activeSessionFeedback}
            {mutationMessage && <p role="status" aria-live="polite" className={`text-xs ${styles.textSecondary}`}>{mutationMessage}</p>}
            {completionUnconfirmed ? (
              <div role="alert" className="space-y-2 text-xs text-studio-coral">
                <p>{mutationError}</p>
                <button type="button" data-testid="pomodoro-completion-retry" onClick={handleRetryCompletion} disabled={mutation !== null} className="xmt-btn xmt-btn-primary min-h-10 w-full rounded-lg px-3 py-2 font-medium disabled:cursor-not-allowed disabled:opacity-60">
                  重试保存完成记录
                </button>
              </div>
            ) : mutationError && <p role="alert" className="text-xs text-studio-coral">{mutationError}</p>}
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
            styles.isDark ? 'bg-studio-coral/10' : 'bg-studio-coral/10'
          }`}>
            <Timer className="w-4 h-4 text-studio-coral" />
          </div>
          <h3 className={`text-base font-semibold ${styles.textPrimary}`}>番茄钟</h3>
        </div>
        <div className="flex items-center gap-1.5">
          <CheckCircle className="w-4 h-4 text-studio-success" />
          {statsError ? <button type="button" onClick={() => void refreshStats()} className={`xmt-btn xmt-btn-ghost min-h-10 px-2 text-sm underline ${styles.textSecondary}`}>统计加载失败，点击重试</button> : <span className={`text-sm ${styles.textSecondary}`}>今日已完成 <span className={`font-semibold ${styles.textPrimary}`}>{todayCount}</span> 个</span>}
        </div>
      </div>

      {/* Progress Ring */}
      <div className="flex flex-col items-center mb-6">
        <div className="relative w-40 h-40">
          <svg className="w-40 h-40 -rotate-90" viewBox="0 0 100 100">
            <circle cx="50" cy="50" r="44" stroke={styles.isDark ? 'var(--xmt-surface-elevated)' : 'var(--xmt-surface-soft)'} strokeWidth="6" fill="none" />
            <circle
              cx="50" cy="50" r="44"
              stroke={timeLeft === 0 ? 'var(--xmt-success)' : 'var(--xmt-coral)'}
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
          styles.isDark ? 'bg-studio-surface-soft' : 'bg-studio-surface-soft'
        }`}>
          <Link className="w-3.5 h-3.5 text-studio-primary" />
          <span className={`text-sm ${styles.textSecondary}`}>{topicTitle}</span>
        </div>
      )}

      {/* Controls */}
      <div className="flex items-center justify-center gap-3">
        <button
          type="button"
          data-testid="pomodoro-start-button"
          onClick={handleStart}
          disabled={controlsLocked}
          aria-busy={mutation !== null}
          aria-label={isRunning ? '暂停番茄钟' : sessionId ? '继续番茄钟' : '开始番茄钟'}
          className={`flex items-center gap-2 px-6 py-2.5 rounded-xl text-sm font-medium ${
            isRunning ? styles.buttonSecondary : styles.buttonPrimary
          } transition-all duration-200 hover:scale-[1.02] active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-60`}
        >
          {isRunning ? <Pause className="w-4 h-4" /> : <Play className="w-4 h-4" />}
          {mutation === 'starting' ? '正在开始…' : isRunning ? '暂停' : sessionId && timeLeft < DURATION ? '继续' : '开始专注'}
        </button>
        <button
          type="button"
          data-testid="pomodoro-reset-button"
          onClick={handleReset}
          disabled={controlsLocked}
          aria-label="重置番茄钟"
          aria-busy={mutation === 'resetting'}
          title={completionUnconfirmed ? '完成结果待确认，不能重置' : mutation === 'starting' ? '开始完成后才能重置' : mutation === 'completing' ? '正在保存完成记录' : mutation === 'resetting' ? '正在重置番茄钟' : '重置番茄钟'}
          className="xmt-btn xmt-btn-secondary h-10 w-10 shrink-0 !p-0 transition-colors disabled:cursor-not-allowed disabled:opacity-60"
        >
          <RotateCcw className="w-4 h-4" />
        </button>
      </div>
      {activeSessionFeedback}
      {mutationMessage && <p role="status" aria-live="polite" className={`mt-3 text-center text-sm ${styles.textSecondary}`}>{mutationMessage}</p>}
      {completionUnconfirmed ? (
        <div role="alert" className="mt-3 space-y-3 text-center text-sm text-studio-coral">
          <p>{mutationError}</p>
          <button type="button" data-testid="pomodoro-completion-retry" onClick={handleRetryCompletion} disabled={mutation !== null} className="xmt-btn xmt-btn-primary min-h-10 rounded-xl px-4 py-2 font-medium disabled:cursor-not-allowed disabled:opacity-60">
            重试保存完成记录
          </button>
        </div>
      ) : mutationError && <p role="alert" className="mt-3 text-center text-sm text-studio-coral">{mutationError}</p>}
    </div>
  );
}
