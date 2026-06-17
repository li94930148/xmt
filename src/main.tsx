import { createRoot } from 'react-dom/client'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import App from './App'
import './index.css'
import './styles/print.css'
import './utils/apiInterceptor'

// 创建 QueryClient 实例
const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 5 * 60 * 1000, // 数据 5 分钟内视为新鲜
      gcTime: 10 * 60 * 1000, // 缓存 10 分钟后回收
      retry: 1, // 失败重试 1 次
      refetchOnWindowFocus: false, // 窗口聚焦时不自动刷新
    },
  },
})

createRoot(document.getElementById('root')!).render(
  <QueryClientProvider client={queryClient}>
    <App />
  </QueryClientProvider>
)
