import { Component, ReactNode } from 'react';

interface Props {
  children: ReactNode;
}
interface State {
  hasError: boolean;
  message: string;
}

/**
 * WebGL 错误边界：GPU/驱动不支持或上下文丢失时，
 * 页面降级为说明态而非整页白屏（GRP 四态要求）。
 */
export default class WebGLErrorBoundary extends Component<Props, State> {
  state: State = { hasError: false, message: '' };

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, message: error.message };
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="state-box" style={{ height: '100%' }}>
          <div style={{ fontSize: 15, color: 'var(--tw-text)' }}>
            3D 场景初始化失败：当前浏览器或设备未提供可用的 WebGL 环境
          </div>
          <div className="muted" style={{ fontSize: 13, maxWidth: 480 }}>
            请使用开启硬件加速的现代浏览器（Chrome/Edge）。二维监测页面（P01/P02）不受影响。
          </div>
          <div className="muted" style={{ fontSize: 12, maxWidth: 480 }}>
            {this.state.message}
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}
