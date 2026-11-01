import { AppShell } from './components/layout/AppShell';
import './styles/tokens.css';
import './styles/base.css';
import './styles/layout.css';
import './styles/ui.css';

/**
 * F1 隔离预览入口：新版视觉组件基础库（AppShell 内部渲染 <Outlet/>）。
 * 仅本路由懒加载本模块及其 CSS，不影响主项目任何页面样式。
 * 访问：/v2-preview
 */
export default function V2PreviewRoute() {
  return (
    <div className="v2-scope">
      <AppShell />
    </div>
  );
}
