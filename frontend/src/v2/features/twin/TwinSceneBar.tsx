import type { TwinStation } from './twinTypes';
import { Segmented } from '../../components/ui/Segmented';
import type { TwinView } from './types';

interface TwinSceneBarProps {
  view: TwinView;
  stations: TwinStation[];
  location: string;
  updatedAt: string;
  onViewChange: (view: TwinView) => void;
  /** 3D 原生场景运行时显示 LIVE 3D；仅 WebGL 失败降级时显示 2D 示意 */
  mode3d?: boolean;
  /** 场景演示模式标识（承担演示状态区分职责）；非演示不渲染 */
  demoLabel?: string;
}

/**
 * 顶部场景控制（F3 精修版）：
 * - 左上角：LIVE 3D 小型状态标识（呼吸点 + 文案，不再占整行）
 * - 右上角：河段全景 / A / B / C 紧凑悬浮分段控制器（深色半透明 + blur + 细边框）
 * - 不再渲染横贯场景的整行背景条与重复的「上游 A → 中游 B → 下游 C」说明
 */
export function TwinSceneBar({
  view,
  stations,
  location,
  updatedAt,
  onViewChange,
  mode3d = false,
  demoLabel,
}: TwinSceneBarProps) {
  const attention = stations.filter((station) => station.tone !== 'good').length;
  void location;
  void updatedAt;

  return (
    <>
      <div className="v2-twin-livechip" aria-live="polite">
        <i />
        <span>{mode3d ? 'LIVE 3D' : '2D 示意模式'}</span>
      </div>

      <div className="v2-twin-focusfloat" role="toolbar" aria-label="断面切换">
        <div className="v2-twin-focusfloat__row">
          <Segmented
            ariaLabel="切换监测断面或返回河段全景"
            mini
            value={view}
            onChange={onViewChange}
            options={[
              { value: 'overview', label: '河段全景' },
              ...stations.map((station) => ({ value: station.id, label: station.id })),
            ]}
          />
        </div>
        {(attention > 0 || demoLabel) && (
          <div className="v2-twin-focusfloat__meta v2-mono">
            {attention > 0 && <span className="v2-twin-focusfloat__risk">{attention} 个断面需关注</span>}
            {demoLabel && <span className="v2-twin-focusfloat__demo">{demoLabel}</span>}
          </div>
        )}
      </div>
    </>
  );
}
