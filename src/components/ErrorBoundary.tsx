import { Component, ErrorInfo, ReactNode } from 'react';

interface Props {
  children: ReactNode;
  fallback?: ReactNode;
}

interface State {
  hasError: boolean;
  error: Error | null;
}

export default class ErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error('[ErrorBoundary] 捕获到错误:', error, errorInfo);
  }

  handleReset = () => {
    this.setState({ hasError: false, error: null });
  };

  copyDiagnostic = async () => {
    const detail = import.meta.env.DEV
      ? this.state.error?.message || '未知错误'
      : '未提供错误详情（生产环境已脱敏）';
    const diagnostic = [
      'XMT 客户端诊断信息',
      `时间：${new Date().toISOString()}`,
      `平台：${navigator.userAgent}`,
      `错误：${detail}`,
    ].join('\n');

    try {
      await navigator.clipboard?.writeText(diagnostic);
    } catch {
      // Clipboard access is optional. The recovery actions remain available.
    }
  };

  render() {
    if (this.state.hasError) {
      if (this.props.fallback) {
        return this.props.fallback;
      }

      return (
        <div className="min-h-screen flex items-center justify-center bg-studio-surface">
          <div className="max-w-md mx-auto text-center p-8">
            <div className="w-16 h-16 mx-auto mb-6 bg-studio-coral/20 rounded-full flex items-center justify-center">
              <span className="text-3xl">💥</span>
            </div>
            <h2 className="text-2xl font-bold text-white mb-3">页面出错了</h2>
            <p className="text-studio-text-muted mb-6">发生了意外错误，请重新加载或返回首页继续工作。</p>
            {import.meta.env.DEV ? (
              <p className="text-studio-text-muted text-sm mb-6 font-mono bg-studio-surface-soft rounded-lg p-3 overflow-auto max-h-32">
                {this.state.error?.message || '未知错误'}
              </p>
            ) : null}
            <div className="flex gap-3 justify-center">
              <button
                onClick={() => window.location.reload()}
                className="min-h-11 px-6 py-2.5 bg-studio-primary hover:bg-studio-primary text-white rounded-lg transition-colors font-medium"
              >
                重新加载
              </button>
              <button
                onClick={() => window.location.href = '/'}
                className="min-h-11 px-6 py-2.5 bg-studio-surface-soft hover:bg-studio-surface-soft text-white rounded-lg transition-colors font-medium"
              >
                返回首页
              </button>
            </div>
            <button
              type="button"
              onClick={() => void this.copyDiagnostic()}
              className="mt-4 min-h-11 text-sm text-studio-text-muted underline underline-offset-4"
            >
              复制诊断信息
            </button>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}
