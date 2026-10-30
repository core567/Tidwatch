import { useEffect, useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import { LineBasicMaterial, MeshStandardMaterial } from 'three';
import type { NodeAnchor } from './riverGeometry';
import {photovoltaicTexture} from './solarTexture';
import { buildStationGeometry, type StationSurface } from './stationGeometry';

interface Props {
  anchor: NodeAnchor;
  selected: boolean;
  statusColor: string;
  abnormal: boolean;
  animate?: boolean;
}

/** Place inside MonitorNode's anchor-positioned group; the model owns no labels or hit targets. */
export default function StationModel({ anchor, selected, statusColor, abnormal, animate = true }: Props) {
  const solarTexture=useMemo(photovoltaicTexture,[]);
  const model = useMemo(() => buildStationGeometry(anchor), [anchor]);
  const materials = useMemo(() => ({
    concrete: new MeshStandardMaterial({ vertexColors: true, roughness: .93 }),
    metal: new MeshStandardMaterial({ vertexColors: true, roughness: .5, metalness: .6 }),
    enamel: new MeshStandardMaterial({ vertexColors: true, roughness: .65, metalness: .12 }),
    glass: new MeshStandardMaterial({ vertexColors: true, roughness: .3, metalness: .38 }),
  }), []);
  const selectionMaterial = useMemo(() => new LineBasicMaterial({ color: '#2684FF',
    transparent: true, opacity: .72, depthWrite: false }), []);
  const warning = useRef<MeshStandardMaterial>(null);
  useEffect(() => () => {
    Object.values(model.geometry).forEach(geometry => geometry.dispose());
    model.outline.dispose();model.solar.dispose();
  }, [model]);
  useEffect(() => () => {
    Object.values(materials).forEach(material => material.dispose());
    selectionMaterial.dispose();solarTexture.dispose();
  }, [materials, selectionMaterial]);
  useFrame(({ clock }) => {
    if (warning.current) warning.current.emissiveIntensity = animate && abnormal
      ? .18 + .08 * Math.sin(clock.elapsedTime * 1.8) : .18;
  });
  const lamp = model.layout.lamp;
  return <group name={'equipment-' + anchor.reachId}>
    {(Object.keys(materials) as StationSurface[]).map(surface =>
      <mesh key={surface} geometry={model.geometry[surface]} material={materials[surface]}
        receiveShadow castShadow dispose={null} />)}
    <mesh geometry={model.solar} receiveShadow dispose={null}><meshStandardMaterial map={solarTexture} roughness={.32} metalness={.18}/></mesh>
    <mesh position={lamp}>
      <sphereGeometry args={[.065, 12, 8]} />
      <meshStandardMaterial color={statusColor} emissive={statusColor} emissiveIntensity={.28} roughness={.4} />
    </mesh>
    <lineSegments geometry={model.outline} material={selectionMaterial} material-opacity={selected ? .72 : 0} dispose={null} />
    {abnormal && <mesh position={[lamp.x + .13, lamp.y - .2, lamp.z]}>
      <octahedronGeometry args={[.085, 0]} />
      <meshStandardMaterial ref={warning} color="#E65A60" emissive="#9e303b" emissiveIntensity={.18} roughness={.6} />
    </mesh>}
  </group>;
}
