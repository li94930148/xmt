import { Calendar, Edit3, Lock, Mail, Shield, Trash2, Unlock, User as UserIcon } from 'lucide-react';
import type { useThemeStyles } from '../../hooks/useThemeStyles';
import { formatBeijingDate } from '../../lib/utils';
import type { User } from '../../types';
import Pagination from '../../components/Pagination';
import { ResponsiveTableShell } from '../../components/studio';
import { USER_PAGE_SIZE } from './userTypes';

type UsersPageStyles = ReturnType<typeof useThemeStyles>;

interface UsersListTableProps {
  users: User[];
  page: number;
  total: number;
  styles: UsersPageStyles;
  canUpdateUser: boolean;
  canDeleteUser: boolean;
  mutationPending: boolean;
  refreshing: boolean;
  resolutionPending: boolean;
  onPageChange: (page: number) => void;
  getRoleBadgeClass: (role: string) => string;
  getRoleLabel: (role: string) => string;
  onToggle: (user: User) => void;
  onEdit: (user: User) => void;
  onDelete: (user: User) => void;
}

export function UsersListTable({
  users,
  page,
  total,
  styles,
  canUpdateUser,
  canDeleteUser,
  mutationPending,
  refreshing,
  resolutionPending,
  onPageChange,
  getRoleBadgeClass,
  getRoleLabel,
  onToggle,
  onEdit,
  onDelete,
}: UsersListTableProps) {
  return (
    <ResponsiveTableShell footer={<Pagination page={page} total={total} limit={USER_PAGE_SIZE} onChange={onPageChange} />}>
      <table className="w-full min-w-[1240px] table-fixed">
        <thead>
          <tr className={styles.tableHeader}>
            <th className={`w-[200px] px-6 py-3 text-left text-sm font-medium ${styles.textSecondary}`}>用户名</th>
            <th className={`w-[140px] px-6 py-3 text-left text-sm font-medium ${styles.textSecondary}`}>姓名</th>
            <th className={`w-[220px] px-6 py-3 text-left text-sm font-medium ${styles.textSecondary}`}>邮箱</th>
            <th className={`w-[160px] px-6 py-3 text-left text-sm font-medium ${styles.textSecondary}`}>角色</th>
            <th className={`w-[120px] px-6 py-3 text-left text-sm font-medium ${styles.textSecondary}`}>状态</th>
            <th className={`w-[180px] px-6 py-3 text-left text-sm font-medium ${styles.textSecondary}`}>创建时间</th>
            <th className="sticky right-0 z-20 w-[168px] border-l border-studio-border-soft bg-studio-surface-soft px-1.5 py-3 text-right text-sm font-medium text-studio-text-secondary sm:w-[260px] sm:px-3">操作</th>
          </tr>
        </thead>
        <tbody>
          {users.map((user) => (
            <tr key={user.id} className={`border-t ${styles.tableRow} ${styles.tableHover}`}>
              <td className="px-6 py-4">
                <div className="flex items-center gap-3">
                  <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-studio-primary to-studio-cyan">
                    <UserIcon className="h-5 w-5 text-white" />
                  </div>
                  <span className={`truncate font-medium ${styles.textPrimary}`} title={user.username}>{user.username}</span>
                </div>
              </td>
              <td className={`truncate px-6 py-4 ${styles.textSecondary}`} title={user.name || undefined}>{user.name || '-'}</td>
              <td className={`px-6 py-4 ${styles.textSecondary}`}>
                <div className="flex min-w-0 items-center gap-2"><Mail className="h-4 w-4 shrink-0" /><span className="truncate" title={user.email || undefined}>{user.email || '-'}</span></div>
              </td>
              <td className="px-6 py-4">
                <span className={`inline-flex items-center gap-1 rounded-full border px-3 py-1 text-xs ${getRoleBadgeClass(user.role)}`}>
                  <Shield className="h-3 w-3" />
                  {getRoleLabel(user.role)}
                </span>
              </td>
              <td className="px-6 py-4">
                <span className={`inline-flex items-center gap-1 rounded-full border px-3 py-1 text-xs ${user.enabled ? 'border-studio-border-soft bg-studio-success-soft text-studio-success-contrast' : 'border-studio-border-soft bg-studio-coral-soft text-studio-coral-contrast'}`}>
                  {user.enabled ? <Unlock className="h-3 w-3" /> : <Lock className="h-3 w-3" />}
                  {user.enabled ? '已启用' : '已禁用'}
                </span>
              </td>
              <td className={`px-6 py-4 ${styles.textSecondary}`}>
                <div className="flex items-center gap-2 whitespace-nowrap"><Calendar className="h-4 w-4 shrink-0" />{formatBeijingDate(user.created_at)}</div>
              </td>
              <td data-testid={`user-row-actions-${user.id}`} className="sticky right-0 z-10 w-[168px] border-l border-studio-border-soft bg-studio-surface px-1.5 py-4 sm:w-[260px] sm:px-3">
                <div className="flex flex-wrap items-center justify-end gap-0.5 sm:flex-nowrap sm:gap-1">
                  {canUpdateUser && (
                    <button
                      type="button"
                      onClick={() => onToggle(user)}
                      aria-label={`${user.enabled ? '禁用' : '启用'}用户 ${user.username}`}
                      disabled={mutationPending || refreshing || resolutionPending}
                      className={`xmt-btn inline-flex min-h-10 items-center gap-1 rounded-lg border px-1.5 py-2 text-xs transition-opacity hover:opacity-85 sm:px-2.5 ${user.enabled ? 'border-studio-border-soft bg-studio-coral-soft text-studio-coral-contrast' : 'border-studio-border-soft bg-studio-success-soft text-studio-success-contrast'}`}
                    >
                      {user.enabled ? <Lock className="h-3.5 w-3.5" /> : <Unlock className="h-3.5 w-3.5" />}
                      {user.enabled ? '禁用' : '启用'}
                    </button>
                  )}
                  {canUpdateUser && (
                    <button type="button" disabled={mutationPending || refreshing || resolutionPending} onClick={() => onEdit(user)} className={`xmt-btn min-h-10 min-w-10 rounded-lg p-0 text-studio-primary ${styles.hoverBg} hover:text-studio-primary disabled:opacity-50`} title="编辑" aria-label={`编辑用户 ${user.username}`}>
                      <Edit3 className="h-4 w-4 sm:h-5 sm:w-5" />
                    </button>
                  )}
                  {canDeleteUser && (
                    <button type="button" disabled={mutationPending || refreshing || resolutionPending} onClick={() => onDelete(user)} className={`xmt-btn min-h-10 min-w-10 rounded-lg p-0 text-studio-coral ${styles.hoverBg} hover:text-studio-coral disabled:opacity-50`} title="删除" aria-label={`删除用户 ${user.username}`}>
                      <Trash2 className="h-4 w-4 sm:h-5 sm:w-5" />
                    </button>
                  )}
                </div>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </ResponsiveTableShell>
  );
}
