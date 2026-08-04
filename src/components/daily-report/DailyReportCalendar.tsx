import { useEffect, useState } from 'react';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { getCalendarData, type CalendarDay } from '../../api/dailyReports';
import { ActionButton, GlassPanel } from '../studio';

export default function DailyReportCalendar({ onSelect }: { onSelect?: (date: string) => void }) {
  const now = new Date(); const [year, setYear] = useState(now.getFullYear()); const [month, setMonth] = useState(now.getMonth() + 1); const [days, setDays] = useState<CalendarDay[]>([]);
  useEffect(() => { void getCalendarData(year, month).then(setDays).catch(() => setDays([])); }, [year, month]);
  const first = new Date(year, month - 1, 1).getDay();
  const move = (delta: number) => { const next = new Date(year, month - 1 + delta, 1); setYear(next.getFullYear()); setMonth(next.getMonth() + 1); };
  return <GlassPanel className="p-5"><div className="mb-5 flex items-center justify-between"><div><p className="text-xs text-studio-text-muted">日报日历</p><h2 className="mt-1 text-xl font-semibold text-studio-text-primary">{year} 年 {month} 月</h2></div><div className="flex gap-2"><ActionButton onClick={() => move(-1)} aria-label="上个月"><ChevronLeft className="h-4 w-4" /></ActionButton><ActionButton onClick={() => move(1)} aria-label="下个月"><ChevronRight className="h-4 w-4" /></ActionButton></div></div><div className="grid grid-cols-7 gap-2 text-center text-xs text-studio-text-muted">{['日','一','二','三','四','五','六'].map((label) => <span key={label}>{label}</span>)}{Array.from({ length: first }).map((_, i) => <span key={`blank-${i}`} />)}{days.map((day) => <button key={day.date} type="button" onClick={() => onSelect?.(day.date)} className={`min-h-16 rounded-card border p-2 text-left transition hover:border-studio-border-active ${day.riskLevel && day.riskLevel !== 'normal' ? 'border-studio-coral/50 bg-studio-coral/10' : day.status === 'submitted' || day.status === 'approved' ? 'border-emerald-400/30 bg-emerald-400/10' : day.status ? 'border-amber-300/30 bg-amber-300/10' : 'border-studio-border-soft bg-white/[0.025]'}`}><span className="text-studio-text-primary">{Number(day.date.slice(-2))}</span><span className="mt-2 block text-[10px] text-studio-text-muted">{day.status === 'submitted' || day.status === 'approved' ? '已提交' : day.status ? '草稿' : '未填写'}</span></button>)}</div></GlassPanel>;
}
