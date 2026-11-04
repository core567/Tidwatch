import { useEffect, useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import { Html } from '@react-three/drei';
import { BufferGeometry, Float32BufferAttribute, LineBasicMaterial } from 'three';
import StationModel from './StationModel';
import NodeAlertEffects from './NodeAlertEffects';
import { useSceneSettings } from './sceneSettings';
import { sampleTerrainHeight, type NodeAnchor } from './riverGeometry';
import { useCameraStore } from './cameraStore';
import { NODE_VISUAL_COLORS, NODE_VISUAL_LABELS, type NodeVisualStatus } from './nodeVisual';
import type { ReachOnlineStatus } from '@/types/contract';

interface Props {
  anchor: NodeAnchor;
  name?: string;
  onlineStatus: ReachOnlineStatus | 'UNKNOWN';
  abnormal: boolean;
  visualStatus?: NodeVisualStatus;
  /** 数字孪生页由屏幕空间 Overlay 渲染标签；旧 3D 页面保留原 Html 详情卡。 */
  compact?: boolean;
  onClick: (id: string) => void;
}

function GroundMarker({ anchor, color, selected, animate }: {anchor: NodeAnchor; color: string; selected: boolean; animate: boolean}) {
  const material = useRef<LineBasicMaterial>(null);
  const geometry = useMemo(() => {
    const points: number[] = [];
    for (let i=0;i<64;i++) {
      const angle=i/64*Math.PI*2, x=Math.cos(angle)*1.12, z=Math.sin(angle)*1.12;
      points.push(x, Math.max(.015,sampleTerrainHeight(anchor.position.x+x,anchor.position.z+z)-anchor.position.y+.025),z);
    }
    const g=new BufferGeometry();g.setAttribute('position',new Float32BufferAttribute(points,3));return g;
  },[anchor]);
  useEffect(()=>()=>geometry.dispose(),[geometry]);
  useFrame(({clock})=>{if(material.current)material.current.opacity=(selected?.28:.13)+(animate?.035*Math.sin(clock.elapsedTime*1.4):0)});
  return <lineLoop geometry={geometry}><lineBasicMaterial ref={material} color={color} transparent opacity={.2} depthWrite={false}/></lineLoop>;
}

export default function MonitorNode({ anchor, name, onlineStatus, abnormal, visualStatus, compact = false, onClick }: Props) {
  const view = useCameraStore(s => s.view);
  const selected = view === anchor.reachId;
  const animate = useSceneSettings(s => s.motion);
  const letter = anchor.reachId.slice(-1).toUpperCase();
  const tier: NodeVisualStatus = visualStatus ?? (abnormal
    ? 'abnormal'
    : onlineStatus === 'OFFLINE' || onlineStatus === 'UNKNOWN'
      ? 'offline'
      : onlineStatus === 'STALE'
        ? 'watch'
        : 'normal');
  const tierColor = NODE_VISUAL_COLORS[tier];
  const offlineSecondary = tier !== 'offline' && onlineStatus === 'OFFLINE';
  const tierLabel = (onlineStatus === 'UNKNOWN' ? '状态未知' : NODE_VISUAL_LABELS[tier])
    + (offlineSecondary ? ' · 离线' : '');
  const label = name || anchor.name;
  return <group name={'station-' + letter} position={anchor.position}
    onClick={event => { event.stopPropagation(); onClick(anchor.reachId); }}
    onPointerOver={event => { event.stopPropagation(); document.body.style.cursor = 'pointer'; }}
    onPointerOut={() => { document.body.style.cursor = 'auto'; }}>
    <GroundMarker anchor={anchor} color={tierColor} selected={selected} animate={animate}/>
    <StationModel anchor={anchor} selected={selected} statusColor={tierColor} abnormal={tier === 'abnormal'} animate={animate} />
    <NodeAlertEffects tier={tier} animate={animate} />
    <mesh name={'station-hit-' + letter} position={[0, 1.1, 0]}>
      <boxGeometry args={[2, 2.9, 2]} />
      <meshBasicMaterial transparent opacity={0} depthWrite={false} colorWrite={false} />
    </mesh>
    {!compact && (
      <Html position={[0, 3.1, 0]} center zIndexRange={[20, 0]}>
        <button
          className={`station-label is-${tier}${selected ? ' is-selected' : ''}${view !== 'overview' && !selected ? ' is-muted' : ''}`}
          data-reach={anchor.reachId}
          data-status={tier}
          aria-label={`聚焦${label}，${tierLabel}`}
          aria-pressed={selected}
          onClick={event => { event.stopPropagation(); onClick(anchor.reachId); }}>
          <span className="station-letter">{letter}</span>
          <span className="station-copy"><strong>{label}</strong><span>
            <i className="status-dot" style={{background: tierColor}} />
            {tierLabel}
          </span></span>
        </button>
      </Html>
    )}
  </group>;
}
