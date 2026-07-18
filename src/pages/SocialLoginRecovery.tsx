import { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useSocket } from '../hooks/useSocket';
import { cancelSocialLoginSession, getSocialLoginStatus } from '../api/socialReview';
import { useAuthStore } from '../store';

export default function SocialLoginRecovery() {
  const { sessionId = '' } = useParams(); const navigate = useNavigate(); const socket = useSocket(); const user = useAuthStore((state) => state.user);
  const [status, setStatus] = useState('checking'); const [frame, setFrame] = useState(''); const [message, setMessage] = useState('正在连接服务器浏览器');
  useEffect(() => { if (user?.role !== 'admin') { navigate('/social-review', { replace: true }); return; } const refresh=async()=>{ try { const result=await getSocialLoginStatus(sessionId); setStatus(result.status); setMessage(result.message || (result.status==='success'?'登录成功':'等待扫码')); } catch { setMessage('无法读取登录会话状态'); } }; void refresh(); const timer=window.setInterval(()=>void refresh(),5000); return()=>window.clearInterval(timer); },[navigate,sessionId,user?.role]);
  useEffect(() => { if (!socket || user?.role !== 'admin') return; const event=(data:{image?:string;mimeType?:string;error?:string})=>{ if(data.image)setFrame(`data:${data.mimeType || 'image/jpeg'};base64,${data.image}`); if(data.error)setMessage('浏览器画面暂不可用'); }; socket.emit('social-login:join',sessionId); socket.on('social-login:stream',event); return()=>{socket.off('social-login:stream',event);}; },[sessionId,socket,user?.role]);
  const cancel=async()=>{ await cancelSocialLoginSession(sessionId); navigate('/social-review'); };
  return <main className="mx-auto max-w-5xl space-y-5 p-6"><div><h1 className="text-2xl font-semibold">抖音账号登录恢复</h1><p className="mt-1 text-sm text-theme-muted">平台：抖音 · 当前状态：{status}</p></div><section className="overflow-hidden rounded-xl border border-theme-border bg-theme-card"><div className="border-b border-theme-border px-5 py-3 text-sm text-theme-muted">{message}</div><div className="flex min-h-[480px] items-center justify-center bg-black">{frame ? <img src={frame} alt="服务器浏览器实时画面" className="max-h-[680px] max-w-full object-contain" /> : <span className="text-sm text-white/70">正在等待浏览器画面</span>}</div><div className="flex justify-between px-5 py-4"><button onClick={() => window.location.reload()} className="rounded-lg border border-theme-border px-4 py-2 text-sm">重新检测</button><button onClick={() => void cancel()} className="rounded-lg bg-red-600 px-4 py-2 text-sm text-white">取消登录</button></div></section></main>;
}
