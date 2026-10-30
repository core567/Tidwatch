import { useEffect, useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import { Html } from '@react-three/drei';
import { BufferGeometry, Float32BufferAttribute, LineBasicMaterial } from 'three';
import StationModel from './StationModel';
import { useSceneSettings } from './sceneSettings';
import { sampleTerrainHeight, type NodeAnchor } from './riverGeometry';
import { useCameraStore } from './cameraStore';
import { SCENE_STATUS_COLORS as COLORS, SCENE_STATUS_LABELS as LABELS } from './scenePalette';
import type { ReachOnlineStatus } from '@/types/contract';

interface Props { anchor: NodeAnchor; name?: string; onlineStatus: ReachOnlineStatus | 'UNKNOWN'; abnormal: boolean; onClick: (id: string) => void; }
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

export default function MonitorNode({ anchor, name, onlineStatus, abnormal, onClick }: Props) {
  const view = useCameraStore(s => s.view);
  const selected = view === anchor.reachId;
  const animate = useSceneSettings(s => s.motion);
  const letter = anchor.reachId.slice(-1).toUpperCase();
  const status=Object.prototype.hasOwnProperty.call(LABELS,onlineStatus)?onlineStatus:'UNKNOWN';
  const label=name || anchor.name;
  return <group name={'station-' + letter} position={anchor.position}
    onClick={event => { event.stopPropagation(); onClick(anchor.reachId); }}
    onPointerOver={event => { event.stopPropagation(); document.body.style.cursor = 'pointer'; }}
    onPointerOut={() => { document.body.style.cursor = 'auto'; }}>
    <GroundMarker anchor={anchor} color={abnormal?COLORS.ABNORMAL:selected?COLORS.SELECTED:COLORS[status]} selected={selected} animate={animate}/>
    <StationModel anchor={anchor} selected={selected} statusColor={COLORS[status]} abnormal={abnormal} animate={animate} />
    <mesh name={'station-hit-' + letter} position={[0, 1.1, 0]}>
      <boxGeometry args={[2, 2.9, 2]} />
      <meshBasicMaterial transparent opacity={0} depthWrite={false} colorWrite={false} />
    </mesh>
    <Html position={[0, 3.1, 0]} center zIndexRange={[20, 0]}>
      <button className={'station-label' + (selected ? ' is-selected' : '') + (view !== 'overview' && !selected ? ' is-muted' : '')}
        data-reach={anchor.reachId} aria-label={'聚焦' + label + '，' + LABELS[status] + (abnormal?'，存在异常':'')} aria-pressed={selected}
        onClick={event => { event.stopPropagation(); onClick(anchor.reachId); }}>
        <span className="station-letter">{letter}</span>
        <span className="station-copy"><strong>{label}</strong><span>
          <i className="status-dot" style={{background: COLORS[status]}} />
          {LABELS[status]}{abnormal && <em> · 异常</em>}
        </span></span>
      </button>
    </Html>
  </group>;
}



