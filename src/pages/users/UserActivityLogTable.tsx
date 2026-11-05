import type { useThemeStyles } from '../../hooks/useThemeStyles';
import { formatBeijingTime } from '../../lib/utils';
import type { ActivityLog } from '../../types';

type UsersPageStyles = ReturnType<typeof useThemeStyles>;

interface UserActivityLogTableProps {
  logs: ActivityLog[];
  styles: UsersPageStyles;
}

export function UserActivityLogTable({ logs, styles }: UserActivityLogTableProps) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full">
        <thead>
          <tr className={styles.tableHeader}>
            <th className={`px-6 py-3 text-left text-sm font-medium ${styles.textSecondary}`}>操作人</th>
            <th className={`px-6 py-3 text-left text-sm font-medium ${styles.textSecondary}`}>操作</th>
            <th className={`px-6 py-3 text-left text-sm font-medium ${styles.textSecondary}`}>目标</th>
            <th className={`px-6 py-3 text-left text-sm font-medium ${styles.textSecondary}`}>详情</th>
            <th className={`px-6 py-3 text-left text-sm font-medium ${styles.textSecondary}`}>时间</th>
          </tr>
        </thead>
        <tbody>
          {logs.map((log) => (
            <tr key={log.id} className={`border-t ${styles.tableRow} ${styles.tableHover}`}>
              <td className={`px-6 py-4 font-medium ${styles.textPrimary}`}>{log.user_name || '-'}</td>
              <td className={`px-6 py-4 ${styles.textSecondary}`}>{log.action}</td>
              <td className={`px-6 py-4 ${styles.textSecondary}`}>{log.target}</td>
              <td className={`max-w-xs truncate px-6 py-4 ${styles.textSecondary}`} title={log.detail}>{log.detail}</td>
              <td className={`px-6 py-4 ${styles.textSecondary}`}>{formatBeijingTime(log.created_at)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
