import { useState, useEffect, useRef } from 'react';
import { useThemeStyles } from '../hooks/useThemeStyles';
import { useAppStore } from '../store';
import { getInspirations } from '../api/inspirations';
import { promoteInspiration } from '../api/inspirations';
import type { Inspiration } from '../api/inspirations';
import { Loader2, RotateCw, Sparkles, ArrowRight } from 'lucide-react';

export default function TopicSpinner() {
  const [inspirations, setInspirations] = useState<Inspiration[]>([]);
  const [loading, setLoading] = useState(false);
  const [spinning, setSpinning] = useState(false);
  const [selectedIndex, setSelectedIndex] = useState<number | null>(null);
  const [promoting, setPromoting] = useState(false);
  const wheelRef = useRef<HTMLDivElement>(null);
  const styles = useThemeStyles();
  const appStore = useAppStore();

  useEffect(() => {
    fetchInspirations();
  }, []);

  const fetchInspirations = async () => {
    setLoading(true);
    try {
      const result = await getInspirations({ limit: 50 });
      setInspirations(result.data || []);
    } catch (error) {
      appStore.addNotification({ title: '获取灵感失败', message: (error as Error).message, type: 'error' });
    } finally {
      setLoading(false);
    }
  };

  const handleSpin = () => {
    if (inspirations.length === 0 || spinning) return;
    setSpinning(true);
    setSelectedIndex(null);

    // 随机选择一个
    const randomIndex = Math.floor(Math.random() * inspirations.length);

    // 动画结束后显示结果
    setTimeout(() => {
      setSelectedIndex(randomIndex);
      setSpinning(false);
    }, 3000);
  };

  const handlePromote = async () => {
    if (selectedIndex === null) return;
    const inspiration = inspirations[selectedIndex];
    setPromoting(true);
    try {
      await promoteInspiration(inspiration.id);
      appStore.addNotification({ title: '转换成功', message: `「${inspiration.title}」已转为选题`, type: 'success' });
      // 刷新列表
      fetchInspirations();
      setSelectedIndex(null);
    } catch (error) {
      appStore.addNotification({ title: '转换失败', message: (error as Error).message, type: 'error' });
    } finally {
      setPromoting(false);
    }
  };

  const selectedInspiration = selectedIndex !== null ? inspirations[selectedIndex] : null;

  // 生成转盘扇区颜色
  const getSectorColor = (index: number) => {
    const colors = [
      '#5c7cfa', '#748ffc', '#51cf66', '#ff922b', '#cc5de8',
      '#ff6b6b', '#20c997', '#ffa94d', '#845ef7', '#339af0',
    ];
    return colors[index % colors.length];
  };

  return (
    <div className={`${styles.card} p-6`}>
      <div className="flex items-center gap-3 mb-6">
        <div className="w-10 h-10 rounded-xl flex items-center justify-center bg-[#ff922b]/10">
          <Sparkles className="w-5 h-5 text-[#ff922b]" />
        </div>
        <div>
          <h3 className={`text-lg font-semibold ${styles.textPrimary}`}>随机选题转盘</h3>
          <p className={`text-sm ${styles.textSecondary}`}>从灵感池随机选取一个灵感</p>
        </div>
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-12">
          <Loader2 className="w-6 h-6 animate-spin text-[#5c7cfa]" />
        </div>
      ) : inspirations.length === 0 ? (
        <div className="text-center py-12">
          <p className={styles.textSecondary}>灵感池为空，请先添加灵感</p>
        </div>
      ) : (
        <div className="flex flex-col items-center gap-6">
          {/* 转盘 */}
          <div className="relative w-64 h-64">
            {/* 指针 */}
            <div className="absolute top-0 left-1/2 -translate-x-1/2 -translate-y-2 z-10">
              <div className="w-0 h-0 border-l-[12px] border-l-transparent border-r-[12px] border-r-transparent border-t-[20px] border-t-[#ff6b6b] drop-shadow-md" />
            </div>

            {/* 转盘 */}
            <div
              ref={wheelRef}
              className={`w-full h-full rounded-full border-4 ${styles.border} overflow-hidden relative ${spinning ? 'spinner-wheel' : ''}`}
              style={{
                background: `conic-gradient(${
                  inspirations.slice(0, 12).map((_, i, arr) => {
                    const start = (i / arr.length) * 360;
                    const end = ((i + 1) / arr.length) * 360;
                    return `${getSectorColor(i)} ${start}deg ${end}deg`;
                  }).join(', ')
                })`,
              }}
            >
              {/* 扇区文字 */}
              {inspirations.slice(0, 12).map((insp, i) => {
                const angle = (i / Math.min(inspirations.length, 12)) * 360 + (360 / Math.min(inspirations.length, 12)) / 2;
                return (
                  <div
                    key={insp.id}
                    className="absolute left-1/2 top-1/2 origin-[0_0] text-white text-xs font-medium"
                    style={{
                      transform: `rotate(${angle}deg) translate(70px) rotate(-${angle}deg)`,
                      maxWidth: '60px',
                      textAlign: 'center',
                      textShadow: '0 1px 2px rgba(0,0,0,0.5)',
                      fontSize: '10px',
                      lineHeight: '1.2',
                    }}
                  >
                    {insp.title.length > 6 ? insp.title.slice(0, 6) + '…' : insp.title}
                  </div>
                );
              })}

              {/* 中心圆 */}
              <div className={`absolute inset-0 m-auto w-16 h-16 rounded-full ${styles.bgPrimary} flex items-center justify-center border-2 ${styles.border}`}>
                <span className={`text-xs font-bold ${styles.textPrimary}`}>GO</span>
              </div>
            </div>
          </div>

          {/* 转按钮 */}
          <button
            onClick={handleSpin}
            disabled={spinning}
            className={`flex items-center gap-2 px-8 py-3 ${styles.buttonPrimary} rounded-xl transition-all duration-200 hover:scale-[1.05] active:scale-[0.95] disabled:opacity-50 disabled:cursor-not-allowed`}
          >
            <RotateCw className={`w-5 h-5 ${spinning ? 'animate-spin' : ''}`} />
            <span className="text-sm font-bold">{spinning ? '旋转中...' : '转！'}</span>
          </button>

          {/* 结果 */}
          {selectedInspiration && !spinning && (
            <div className={`w-full ${styles.bgTertiary} rounded-xl p-5 animate-scale-in`}>
              <div className="text-center mb-4">
                <p className={`text-xs ${styles.textMuted} mb-1`}>🎯 选中的灵感</p>
                <p className={`text-xl font-bold ${styles.textPrimary}`}>{selectedInspiration.title}</p>
                {selectedInspiration.description && (
                  <p className={`text-sm ${styles.textSecondary} mt-2`}>{selectedInspiration.description}</p>
                )}
                {selectedInspiration.category && (
                  <span className={`inline-block mt-2 text-xs px-2.5 py-0.5 rounded-full ${styles.bgInput} ${styles.textMuted}`}>
                    {selectedInspiration.category}
                  </span>
                )}
              </div>
              <button
                onClick={handlePromote}
                disabled={promoting}
                className={`w-full flex items-center justify-center gap-2 px-4 py-2.5 ${styles.buttonPrimary} rounded-xl transition-all duration-200 disabled:opacity-50`}
              >
                {promoting ? <Loader2 className="w-4 h-4 animate-spin" /> : <ArrowRight className="w-4 h-4" />}
                <span className="text-sm font-medium">转为选题</span>
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
