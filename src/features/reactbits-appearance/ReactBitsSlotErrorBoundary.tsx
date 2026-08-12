import { Component, type ErrorInfo, type ReactNode } from 'react';

type Props = { componentName: string; fallback: ReactNode; children: ReactNode };
type State = { failed: boolean; error?: Error };

export class ReactBitsSlotErrorBoundary extends Component<Props, State> {
  state: State = { failed: false };
  static getDerivedStateFromError(error: Error): State { return { failed: true, error }; }
  componentDidCatch(_error: Error, _info: ErrorInfo) {}
  render() {
    if (!this.state.failed) return this.props.children;
    return <>{this.props.fallback}{import.meta.env.DEV && <span className="sr-only">React Bits {this.props.componentName} 已安全降级：{this.state.error?.message}</span>}</>;
  }
}
