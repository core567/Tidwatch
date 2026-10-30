import './scene.css';
import { Component, type ReactNode } from 'react';
export default class WebGLErrorBoundary extends Component<{children: ReactNode}, {error: boolean}> {
  state = {error: false};
  static getDerivedStateFromError() { return {error: true}; }
  render() {
    return this.state.error ? <div className="scene-message" role="alert">
      <h2>暂时无法显示三维场景</h2>
      <p>请使用开启硬件加速的 Chrome 或 Edge。若仍无法加载，请重新打开页面。</p>
      <button onClick={() => window.location.reload()}>重新加载</button>
    </div> : this.props.children;
  }
}
