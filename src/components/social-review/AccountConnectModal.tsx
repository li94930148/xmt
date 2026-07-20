import { useEffect, useState } from 'react';
import { CheckCircle2, LoaderCircle, QrCode, XCircle } from 'lucide-react';
import BaseModal from '../common/BaseModal';
import { getLoginSessionStatus, startAccountConnect } from '../../api/socialReview';
import { useSocket } from '../../hooks/useSocket';
import { useThemeStyles } from '../../hooks/useThemeStyles';

type LoginStatus = 'waiting_scan' | 'scanned' | 'success' | 'failed' | 'expired' | 'checking';

type Props = {
  open: boolean;
  onClose: () => void;
  onSuccess: (accountId: number) => void;
};

const statusCopy: Record<LoginStatus, string> = {
  checking: '正在准备服务器浏览器',
  waiting_scan: '等待扫码',
  scanned: '扫码成功，正在确认登录',
  success: '登录成功',
  failed: '登录失败，请重新发起登录',
  expired: '登录已超时，请重新发起登录',
};

export default function AccountConnectModal({ open, onClose, onSuccess }: Props) {
  const styles = useThemeStyles();
  const socket = useSocket();
  const [nickname, setNickname] = useState('');
  const [remark, setRemark] = useState('');
  const [step, setStep] = useState<1 | 2>(1);
  const [accountId, setAccountId] = useState<number | null>(null);
  const [sessionId, setSessionId] = useState('');
  const [status, setStatus] = useState<LoginStatus>('checking');
  const [frame, setFrame] = useState('');
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (open) return;
    setNickname(''); setRemark(''); setStep(1); setAccountId(null); setSessionId(''); setStatus('checking'); setFrame(''); setError(''); setSubmitting(false);
  }, [open]);

  useEffect(() => {
    if (step !== 2 || !sessionId) return;
    const refresh = async () => {
      try {
        const result = await getLoginSessionStatus(sessionId);
        setStatus(result.status);
        if (result.status === 'failed' || result.status === 'expired') setError(result.message || statusCopy[result.status]);
      } catch (requestError) {
        setError(requestError instanceof Error ? requestError.message : '无法读取登录状态');
      }
    };
    void refresh();
    const timer = window.setInterval(() => void refresh(), 5000);
    return () => window.clearInterval(timer);
  }, [sessionId, step]);

  useEffect(() => {
    if (step !== 2 || !sessionId || !socket) return;
    const onFrame = (payload: { sessionId?: string; image?: string; mimeType?: string; error?: string }) => {
      if (payload.sessionId && payload.sessionId !== sessionId) return;
      if (payload.image) setFrame(`data:${payload.mimeType || 'image/jpeg'};base64,${payload.image}`);
      if (payload.error) setError('服务器浏览器画面暂时不可用');
    };
    socket.emit('social-login:join', sessionId);
    socket.on('social-login:stream', onFrame);
    return () => { socket.off('social-login:stream', onFrame); };
  }, [sessionId, socket, step]);

  const start = async () => {
    if (!nickname.trim()) { setError('请填写账号名称'); return; }
    setSubmitting(true); setError('');
    try {
      const result = await startAccountConnect(nickname.trim(), remark.trim() || undefined);
      setAccountId(result.accountId); setSessionId(result.loginSessionId); setStatus(result.status); setStep(2);
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : '无法创建账号接入任务');
    } finally {
      setSubmitting(false);
    }
  };

  const loginComplete = status === 'success' && accountId !== null;
  const terminal = status === 'failed' || status === 'expired';
  const StatusIcon = loginComplete ? CheckCircle2 : terminal ? XCircle : status === 'waiting_scan' ? QrCode : LoaderCircle;

  return (
    <BaseModal
      open={open}
      onClose={onClose}
      size="xl"
      closeOnOverlayClick={step === 1 || terminal || loginComplete}
      title={step === 1 ? '接入新的短视频账号' : '正在登录抖音创作者中心'}
      description={step === 1 ? '账号登录状态仅由服务器 Chromium Profile 维护，应用不会读取或保存 Cookie、Token 或 storageState。' : '请使用抖音客户端扫描服务器浏览器画面中的二维码。'}
      footer={step === 1 ? (
        <div className="flex justify-end gap-3"><button type="button" onClick={onClose} className={`rounded-xl px-4 py-2 text-sm ${styles.buttonSecondary}`}>取消</button><button type="button" onClick={() => void start()} disabled={submitting} className="rounded-xl bg-gradient-to-r from-blue-600 to-violet-600 px-4 py-2 text-sm font-medium text-white disabled:cursor-not-allowed disabled:opacity-60">{submitting ? '正在创建…' : '下一步 扫码登录'}</button></div>
      ) : (
        <div className="flex justify-end gap-3">{loginComplete ? <button type="button" onClick={() => onSuccess(accountId!)} className="rounded-xl bg-gradient-to-r from-blue-600 to-violet-600 px-4 py-2 text-sm font-medium text-white">进入账号复盘</button> : <button type="button" onClick={onClose} className={`rounded-xl px-4 py-2 text-sm ${styles.buttonSecondary}`}>{terminal ? '关闭' : '后台继续等待'}</button>}</div>
      )}
    >
      {step === 1 ? (
        <div className="space-y-5">
          <label className="block"><span className={`mb-2 block text-sm font-medium ${styles.textPrimary}`}>平台</span><div className={`rounded-xl border px-3 py-2.5 text-sm ${styles.border} ${styles.textSecondary}`}>抖音</div></label>
          <label className="block"><span className={`mb-2 block text-sm font-medium ${styles.textPrimary}`}>账号名称</span><input value={nickname} onChange={(event) => setNickname(event.target.value)} placeholder="例如：泰安万达官方账号" className={`w-full rounded-xl border bg-transparent px-3 py-2.5 text-sm outline-none ${styles.border} ${styles.textPrimary}`} /></label>
          <label className="block"><span className={`mb-2 block text-sm font-medium ${styles.textPrimary}`}>账号备注（可选）</span><input value={remark} onChange={(event) => setRemark(event.target.value)} className={`w-full rounded-xl border bg-transparent px-3 py-2.5 text-sm outline-none ${styles.border} ${styles.textPrimary}`} /></label>
          {error ? <p className="text-sm text-red-500">{error}</p> : null}
        </div>
      ) : (
        <div className="space-y-4">
          <div className={`flex items-center gap-3 rounded-xl border px-4 py-3 ${styles.border}`}><StatusIcon className={`h-5 w-5 ${loginComplete ? 'text-emerald-500' : terminal ? 'text-red-500' : 'animate-spin text-blue-500'}`} /><div><p className={`font-medium ${styles.textPrimary}`}>{statusCopy[status]}</p><p className={`mt-0.5 text-sm ${styles.textMuted}`}>{nickname}</p></div></div>
          <div className="flex min-h-[420px] items-center justify-center overflow-hidden rounded-xl bg-black">{frame ? <img src={frame} alt="服务器 Chromium 实时画面" className="max-h-[620px] max-w-full object-contain" /> : <span className="text-sm text-white/70">正在连接服务器浏览器画面…</span>}</div>
          {error ? <p className="text-sm text-red-500">{error}</p> : null}
          {loginComplete ? <p className="text-sm text-emerald-600">账号绑定成功。现在可以进入账号复盘页面。</p> : null}
        </div>
      )}
    </BaseModal>
  );
}
