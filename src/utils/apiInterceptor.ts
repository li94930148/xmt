/**
 * 全局 API 拦截器
 * - 401 自动跳转登录
 * - 网络断开提示
 */

let isRedirecting = false;

// 包装 fetch，自动处理 401
const originalFetch = window.fetch;

window.fetch = async function (...args: Parameters<typeof fetch>): Promise<Response> {
  try {
    const response = await originalFetch.apply(this, args);

    // Token 过期或未授权，跳转登录
    if (response.status === 401 && !isRedirecting) {
      isRedirecting = true;
      localStorage.removeItem('xmt_token');
      localStorage.removeItem('xmt_user');
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
