import { useState } from 'react';
import { Panel } from './components/ui/Panel';
import { Badge } from './components/ui/Badge';
import { PanelState } from './components/ui/PanelState';
import { Segmented } from './components/ui/Segmented';
import { Sparkline } from './components/ui/Sparkline';
import { AnimatedNumber } from './components/ui/AnimatedNumber';
import { Icon } from './components/ui/Icon';
import { Drawer } from './components/ui/Drawer';
import { Modal } from './components/ui/Modal';

/**
 * F1 预览内容：验证基础组件在新版 token/作用域下可正常渲染。
 * 数据为组件演示用静态值，不经过任何业务链路。
 */
export default function V2PreviewPage() {
  const [seg, setSeg] = useState('24h');
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [modalOpen, setModalOpen] = useState(false);

  return (
    <div className="v2-page">
      <div className="v2-page-intro">
        <div className="v2-page-intro__main">
          <div className="v2-eyebrow v2-eyebrow--bare v2-intro-line">
            <span>F1 · VISUAL FOUNDATION PREVIEW</span>
          </div>
          <h1 className="v2-page-title">
            新版视觉组件预览
            <em>PREVIEW</em>
          </h1>
        </div>
        <Badge tone="demo">F1 隔离预览</Badge>
      </div>

      <div className="v2-grid v2-col-4 v2-col-6 v2-col-9">
        <Panel code="01" title="指标面板" en="METRIC PANEL">
          <div style={{ display: 'flex', gap: 16, alignItems: 'baseline' }}>
            <AnimatedNumber value={86.4} decimals={1} />
            <Badge tone="good">正常</Badge>
            <Badge tone="mid">关注</Badge>
          </div>
        </Panel>

        <Panel code="02" title="趋势 Sparkline" en="SPARKLINE">
          <Sparkline values={[12, 14, 13, 18, 17, 21, 19, 24, 22, 26]} tone="good" showEnd />
        </Panel>

        <Panel code="03" title="分段控件" en="SEGMENTED">
          <Segmented
            options={[
              { value: '24h', label: '24小时' },
              { value: '7d', label: '7天' },
            ]}
            value={seg}
            onChange={setSeg}
            ariaLabel="时间窗"
          />
        </Panel>

        <Panel code="04" title="状态与抽屉" en="STATE / DRAWER">
          <div style={{ display: 'flex', gap: 12 }}>
            <button type="button" className="v2-btn" onClick={() => setDrawerOpen(true)}>
              <Icon name="layers" size={13} />
              打开抽屉
            </button>
            <button type="button" className="v2-btn v2-btn--ghost" onClick={() => setModalOpen(true)}>
              打开弹窗
            </button>
          </div>
        </Panel>
      </div>

      <Panel code="05" title="面板状态" en="PANEL STATE">
        <PanelState
          variant="empty"
          title="隔离验证说明"
          desc="本页为 /v2-preview 懒加载路由，样式与 token 均作用域于 .v2-scope 与 v2- 前缀类，主项目页面不受影响。"
        />
      </Panel>

      <Drawer open={drawerOpen} onClose={() => setDrawerOpen(false)} title="预览抽屉">
        <div className="v2-muted">
          内容区使用 v2 前缀类渲染；关闭按钮已通过 onClose 受控。
        </div>
      </Drawer>

      <Modal open={modalOpen} onClose={() => setModalOpen(false)} title="预览弹窗">
        <div className="v2-muted">F1 预览弹窗。</div>
      </Modal>
    </div>
  );
}
