import { getSocketIO } from '../../utils/socket.js';
import { captureServerBrowser } from './serverBrowserService.js';
const streams = new Map<string, NodeJS.Timeout>();
export function startBrowserStream(sessionId: string, accountId: number) { if (streams.has(sessionId)) return; const push=async()=>{ try { const frame=await captureServerBrowser(accountId); getSocketIO()?.to(`social-login-session-${sessionId}`).emit('social-login:stream',{sessionId,image:frame.toString('base64'),mimeType:'image/jpeg'}); } catch { getSocketIO()?.to(`social-login-session-${sessionId}`).emit('social-login:stream',{sessionId,error:'browser_frame_unavailable'}); } }; void push(); streams.set(sessionId,setInterval(()=>void push(),1200)); }
export function stopBrowserStream(sessionId: string) { const timer=streams.get(sessionId); if(timer)clearInterval(timer); streams.delete(sessionId); }
