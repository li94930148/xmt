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
            <div className="mx-auto mb-6 flex h-16 w-16 items-center justify-center rounded-full border border-studio-border-soft bg-studio-coral-soft text-studio-coral-contrast">
              <span className="text-3xl" aria-hidden="true">💥</span>
            </div>
            <h2 className="mb-3 text-2xl font-bold text-studio-text-primary">页面出错了</h2>
            <p className="mb-6 text-studio-text-secondary">发生了意外错误，请重新加载或返回首页继续工作。</p>
            {import.meta.env.DEV ? (
              <p className="mb-6 max-h-32 overflow-auto rounded-lg border border-studio-border-soft bg-studio-surface-soft p-3 font-mono text-sm text-studio-text-secondary">
                {this.state.error?.message || '未知错误'}
              </p>
            ) : null}
            <div className="flex gap-3 justify-center">
              <button
                type="button"
                onClick={() => window.location.reload()}
                className="xmt-btn xmt-btn-primary min-h-11 px-6 py-2.5 font-medium"
              >
                重新加载
              </button>
              <button
                type="button"
                onClick={() => window.location.href = '/'}
                className="xmt-btn xmt-btn-secondary min-h-11 px-6 py-2.5 font-medium"
              >
                返回首页
              </button>
            </div>
            <button
              type="button"
              onClick={() => void this.copyDiagnostic()}
              className="mt-4 min-h-11 text-sm text-studio-text-secondary underline underline-offset-4 hover:text-studio-text-primary"
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
