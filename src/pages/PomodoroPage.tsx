import { useThemeStyles } from '../hooks/useThemeStyles';
import { useNavigate } from 'react-router-dom';
import PomodoroTimer from '../components/PomodoroTimer';
import { ChevronLeft, Trophy, Timer } from 'lucide-react';
import { useState, useEffect } from 'react';
import { getPomodoroRanking } from '../api';
import type { PomodoroRanking } from '../types';
import { formatBeijingDate } from '../lib/utils';

export default function PomodoroPage() {
  const styles = useThemeStyles();
  const navigate = useNavigate();
  const [ranking, setRanking] = useState<PomodoroRanking[]>([]);

  useEffect(() => {
    getPomodoroRanking()
      .then(setRanking)
      .catch(() => {});
  }, []);

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-4">
        <button
          onClick={() => navigate('/')}
          className="flex items-center gap-2 text-theme-text-muted hover:text-theme-text transition-colors"
        >
          <ChevronLeft className="w-5 h-5" />
          返回首页
        </button>
      </div>

      <div>
        <h1 className="text-2xl font-bold text-theme-text">番茄钟</h1>
        <p className="text-sm text-theme-text-muted mt-1">25 分钟专注创作，提升工作效率</p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* 番茄钟主体 */}
        <div className="lg:col-span-2">
          <PomodoroTimer />
        </div>

        {/* 排行榜 */}
        <div className="rounded-2xl bg-theme-secondary border border-theme-border p-6">
          <div className="flex items-center gap-2.5 mb-5">
            <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-amber-400 to-orange-500 flex items-center justify-center shadow-md">
              <Trophy className="w-4 h-4 text-white" />
            </div>
            <h3 className="text-base font-semibold text-theme-text">专注排行榜</h3>
          </div>

          {ranking.length > 0 ? (
            <div className="space-y-2">
              {ranking.map((item, index) => (
                <div
                  key={item.user_id}
                  className="flex items-center gap-3 p-3 rounded-xl bg-theme-tertiary/50 hover:bg-theme-tertiary transition-colors"
                >
                  <div className={`w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold ${
                    index === 0 ? 'bg-amber-400/20 text-amber-400' :
                    index === 1 ? 'bg-gray-300/20 text-gray-300' :
                    index === 2 ? 'bg-orange-400/20 text-orange-400' :
                    'bg-theme-tertiary text-theme-text-muted'
                  }`}>
                    {index + 1}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-theme-text truncate">{item.user_name}</p>
                    <p className="text-xs text-theme-text-muted">{item.total_sessions} 次 · {item.total_minutes} 分钟</p>
                  </div>
                  <Timer className="w-4 h-4 text-theme-text-muted" />
                </div>
              ))}
            </div>
          ) : (
            <div className="text-center py-8">
              <Timer className="w-10 h-10 mx-auto mb-2 text-theme-text-muted" />
              <p className="text-sm text-theme-text-muted">还没有番茄记录</p>
              <p className="text-xs text-theme-text-muted mt-1">开始你的第一个番茄吧！</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
