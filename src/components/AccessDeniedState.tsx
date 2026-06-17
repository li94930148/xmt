import { ArrowLeft, Home, LockKeyhole, Settings } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { useThemeStyles } from '../hooks/useThemeStyles';
import { usePermission } from '../hooks/usePermission';

interface AccessDeniedStateProps {
  title?: string;
  description?: string;
}

export default function AccessDeniedState({
  title = '当前页面暂未对你开放',
  description = '你已成功登录，但当前账号还没有访问这里所需的权限。请联系管理员开通权限，或先返回其他可用页面继续工作。',
}: AccessDeniedStateProps) {
  const navigate = useNavigate();
  const styles = useThemeStyles();
  const { hasPermission } = usePermission();

  return (
    <div className="flex min-h-[60vh] items-center justify-center px-4 py-10">
      <div className={`w-full max-w-2xl overflow-hidden rounded-[28px] ${styles.card}`}>
        <div className="bg-gradient-to-r from-amber-500/10 via-orange-500/10 to-red-500/10 px-8 py-6">
          <div className="flex items-center gap-3">
            <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-amber-500/15 text-amber-400">
              <LockKeyhole className="h-6 w-6" />
            </div>
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.28em] text-amber-400">403</p>
              <h1 className={`mt-1 text-2xl font-semibold ${styles.textPrimary}`}>{title}</h1>
            </div>
          </div>
        </div>

        <div className="space-y-6 px-8 py-8">
          <p className={`text-sm leading-7 ${styles.textSecondary}`}>{description}</p>

          <div className={`rounded-2xl p-5 ${styles.bgTertiary}`}>
            <p className={`text-sm font-medium ${styles.textPrimary}`}>你现在可以这样做：</p>
            <ul className={`mt-3 space-y-2 text-sm ${styles.textSecondary}`}>
              <li>1. 返回首页或其他已开放页面继续处理当前工作</li>
              <li>2. 如果你本应具备此权限，请联系管理员检查角色与权限点绑定</li>
              <li>3. 如果你只需要修改个人资料、密码或通知偏好，可以进入设置中心继续操作</li>
            </ul>
          </div>

          <div className="flex flex-col gap-3 sm:flex-row">
            <button
              onClick={() => navigate(-1)}
              className={`inline-flex items-center justify-center gap-2 rounded-2xl px-5 py-3 text-sm font-medium ${styles.buttonSecondary}`}
            >
              <ArrowLeft className="h-4 w-4" />
              返回上一页
            </button>

            <button
              onClick={() => navigate('/')}
              className="inline-flex items-center justify-center gap-2 rounded-2xl bg-[#5c7cfa] px-5 py-3 text-sm font-medium text-white transition hover:bg-[#4263eb]"
            >
              <Home className="h-4 w-4" />
              回到首页
            </button>

            <button
              onClick={() => navigate('/notification-settings')}
              className={`inline-flex items-center justify-center gap-2 rounded-2xl px-5 py-3 text-sm font-medium ${
                hasPermission('system:settings') ? styles.buttonInfo : styles.buttonSecondary
              }`}
            >
              <Settings className="h-4 w-4" />
              {hasPermission('system:settings') ? '进入设置中心' : '打开个人设置'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
