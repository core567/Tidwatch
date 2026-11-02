import { Icon } from '../../components/ui/Icon';

interface TwinSceneToolbarProps {
  flowOn: boolean;
  labelsOn: boolean;
  terrainOn: boolean;
  onToggleFlow: () => void;
  onToggleLabels: () => void;
  onToggleTerrain: () => void;
  onReset: () => void;
  /** '3d'：仅流向与复位；'fallback'：完整图层控制 */
  mode?: '3d' | 'fallback';
}

export function TwinSceneToolbar({
  flowOn,
  labelsOn,
  terrainOn,
  onToggleFlow,
  onToggleLabels,
  onToggleTerrain,
  onReset,
  mode = 'fallback',
}: TwinSceneToolbarProps) {
  return (
    <div
      className="v2-twin-toolbar"
      role="toolbar"
      aria-label="示意图层操作，非 3D 相机操作"
      title="示意图层控制，不是 3D 相机操作"
    >
      <span className="v2-twin-toolbar__mode v2-mono">{mode === '3d' ? '3D SCENE' : '2D LAYERS'}</span>
      <button
        type="button"
        className={flowOn ? 'v2-is-active' : ''}
        onClick={onToggleFlow}
        aria-pressed={flowOn}
      >
        <Icon name="wave" size={14} />
        流向示意
      </button>
{mode === 'fallback' && (
      <button
        type="button"
        className={labelsOn ? 'v2-is-active' : ''}
        onClick={onToggleLabels}
        aria-pressed={labelsOn}
      >
        <Icon name="analysis" size={14} />
        节点标注
      </button>
)}
{mode === 'fallback' && (
      <button
        type="button"
        className={terrainOn ? 'v2-is-active' : ''}
        onClick={onToggleTerrain}
        aria-pressed={terrainOn}
      >
        <Icon name="layers" size={14} />
        地形图层
      </button>
)}
      <span className="v2-twin-toolbar__divider" />
      <button type="button" onClick={onReset}>
        <Icon name="refresh" size={14} />
        复位
      </button>
    </div>
  );
}
