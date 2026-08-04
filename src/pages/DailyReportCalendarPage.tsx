import { useNavigate } from 'react-router-dom';
import { PageHeader, PageShell } from '../components/studio';
import DailyReportCalendar from '../components/daily-report/DailyReportCalendar';
export default function DailyReportCalendarPage() { const navigate = useNavigate(); return <PageShell><PageHeader title="日报日历" description="按月查看提交状态和风险日期。" /><DailyReportCalendar onSelect={(date) => navigate(`/daily-report?date=${date}`)} /></PageShell>; }
