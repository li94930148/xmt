/**
 * 全局 API 拦截器
 * - 401 自动跳转登录
 * - 网络断开提示
 */

import { getApiBaseUrl, isNative } from '@/platform/runtime';

let isRedirecting = false;

// 包装 fetch，自动处理 401
const originalFetch = window.fetch;

function resolveRequestUrl(input: Parameters<typeof fetch>[0]) {
  if (typeof input === 'string') {
    return input;
  }

  if (input instanceof URL) {
    return input.toString();
  }

  return input.url;
}

function resolveRuntimeRequest(input: Parameters<typeof fetch>[0]): Parameters<typeof fetch>[0] {
  if (!isNative() || typeof input !== 'string' || !input.startsWith('/api')) return input;
  return `${getApiBaseUrl()}${input.slice('/api'.length)}`;
}

function isAuthRedirectCandidate(url: string) {
  return !url.includes('/api/auth/login');
}

window.fetch = async function (...args: Parameters<typeof fetch>): Promise<Response> {
  try {
    const request = resolveRuntimeRequest(args[0]);
    const response = await originalFetch.call(this, request, args[1]);
    const requestUrl = resolveRequestUrl(request);

    // Token 过期或未授权，跳转登录
    if (response.status === 401 && !isRedirecting && isAuthRedirectCandidate(requestUrl)) {
      isRedirecting = true;
      localStorage.removeItem('xmt_token');
      localStorage.removeItem('xmt_user');
      sessionStorage.removeItem('xmt_token');
      sessionStorage.removeItem('xmt_user');
      // 通知用户
      const event = new CustomEvent('xmt-auth-expired', { detail: { message: '登录已过期，请重新登录' } });
      window.dispatchEvent(event);
      setTimeout(() => {
        window.location.href = '/login';
        isRedirecting = false;
      }, 1500);
    }

    return response;
  } catch (error) {
    // 网络错误
    if (error instanceof TypeError && error.message === 'Failed to fetch') {
      const event = new CustomEvent('xmt-network-error', { detail: { message: '网络连接失败，请检查网络' } });
      window.dispatchEvent(event);
    }
    throw error;
  }
};

// 监听自定义事件，显示通知
window.addEventListener('xmt-auth-expired', ((e: CustomEvent) => {
  console.warn('[API]', e.detail.message);
}) as EventListener);

window.addEventListener('xmt-network-error', ((e: CustomEvent) => {
  console.warn('[API]', e.detail.message);
}) as EventListener);

export {};
