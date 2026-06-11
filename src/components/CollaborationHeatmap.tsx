import { useMemo } from 'react';
import { useThemeStyles } from '../hooks/useThemeStyles';
import type { Topic } from '../types';
import { Activity } from 'lucide-react';

interface CollaborationHeatmapProps {
  topics: Topic[];
}

const DAYS = ['周一', '周二', '周三', '周四', '周五', '周六', '周日'];
const HOURS = Array.from({ length: 24 }, (_, i) => i);

export default function CollaborationHeatmap({ topics }: CollaborationHeatmapProps) {
  const styles = useThemeStyles();

  // 统计每周每小时的活动数量
  const heatmapData = useMemo(() => {
    const grid: number[][] = Array.from({ length: 7 }, () => Array(24).fill(0));

    topics.forEach(topic => {
      const dates = [topic.created_at, topic.updated_at].filter(Boolean);
      dates.forEach(dateStr => {
        const date = new Date(dateStr);
        if (isNaN(date.getTime())) return;
        // getDay: 0=周日, 1=周一 ... 6=周六 → 转为 0=周一 ... 6=周日
        const day = date.getDay() === 0 ? 6 : date.getDay() - 1;
        const hour = date.getHours();
        grid[day][hour]++;
      });
    });

    return grid;
  }, [topics]);

  // 找最大值用于颜色映射
  const maxVal = useMemo(() => {
    let max = 0;
    heatmapData.forEach(row => row.forEach(v => { if (v > max) max = v; }));
    return max || 1;
  }, [heatmapData]);

  const getColor = (value: number) => {
    if (value === 0) return styles.isDark ? 'bg-[#1e2030]' : 'bg-[#f1f3f5]';
    const intensity = value / maxVal;
    if (intensity < 0.25) return styles.isDark ? 'bg-[#5c7cfa]/20' : 'bg-[#4263eb]/20';
    if (intensity < 0.5) return styles.isDark ? 'bg-[#5c7cfa]/40' : 'bg-[#4263eb]/40';
    if (intensity < 0.75) return styles.isDark ? 'bg-[#5c7cfa]/70' : 'bg-[#4263eb]/70';
    return styles.isDark ? 'bg-[#5c7cfa]' : 'bg-[#4263eb]';
  };

  // 只显示部分小时标签（每3小时）
  const hourLabels = HOURS.filter(h => h % 3 === 0);

  return (
    <div className={`${styles.bgSecondary} rounded-xl p-6 ${styles.border}`}>
      <div className="flex items-center gap-2 mb-5">
        <Activity className="w-5 h-5 text-[#5c7cfa]" />
        <h3 className={`text-lg font-semibold ${styles.textPrimary}`}>协作热力图</h3>
        <span className={`text-xs ${styles.textMuted} ml-2`}>一周 7 天 × 24 小时产出分布</span>
      </div>

      <div className="overflow-x-auto">
        <div className="min-w-[700px]">
          {/* 小时标签 */}
          <div className="flex ml-12 mb-1">
            {HOURS.map(h => (
              <div key={h} className="flex-1 text-center">
                {h % 3 === 0 && (
                  <span className={`text-[10px] ${styles.textMuted}`}>{h}时</span>
                )}
              </div>
            ))}
          </div>

          {/* 热力图主体 */}
          <div className="space-y-1">
            {DAYS.map((day, dayIdx) => (
              <div key={day} className="flex items-center gap-1">
                <span className={`w-10 text-xs ${styles.textSecondary} text-right flex-shrink-0`}>{day}</span>
                <div className="flex gap-0.5 flex-1">
                  {HOURS.map(hour => {
                    const value = heatmapData[dayIdx][hour];
                    return (
                      <div
                        key={hour}
                        className={`flex-1 aspect-square rounded-sm ${getColor(value)} transition-all duration-200 hover:scale-150 hover:z-10 relative group cursor-default`}
                        title={`${day} ${hour}:00 - ${value} 次活动`}
                      >
                        {/* Tooltip */}
                        <div className={`absolute bottom-full left-1/2 -translate-x-1/2 mb-2 px-2 py-1 rounded text-[10px] whitespace-nowrap opacity-0 group-hover:opacity-100 pointer-events-none transition-opacity z-20 ${
                          styles.isDark ? 'bg-[#252840] text-[#e8eaed]' : 'bg-[#1a1d2e] text-white'
                        }`}>
                          {day} {hour}:00 · {value}次
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            ))}
          </div>

          {/* 图例 */}
          <div className="flex items-center justify-end gap-2 mt-4">
            <span className={`text-[10px] ${styles.textMuted}`}>少</span>
            {[0, 0.25, 0.5, 0.75, 1].map((intensity, i) => (
              <div
                key={i}
                className={`w-3 h-3 rounded-sm ${
                  intensity === 0
                    ? styles.isDark ? 'bg-[#1e2030]' : 'bg-[#f1f3f5]'
                    : intensity < 0.25
                      ? styles.isDark ? 'bg-[#5c7cfa]/20' : 'bg-[#4263eb]/20'
                      : intensity < 0.5
                        ? styles.isDark ? 'bg-[#5c7cfa]/40' : 'bg-[#4263eb]/40'
                        : intensity < 0.75
                          ? styles.isDark ? 'bg-[#5c7cfa]/70' : 'bg-[#4263eb]/70'
                          : styles.isDark ? 'bg-[#5c7cfa]' : 'bg-[#4263eb]'
                }`}
              />
            ))}
            <span className={`text-[10px] ${styles.textMuted}`}>多</span>
          </div>
        </div>
      </div>
    </div>
  );
}
