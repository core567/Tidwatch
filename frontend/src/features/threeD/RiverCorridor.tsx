import { useEffect, useMemo } from 'react';
import { useFrame } from '@react-three/fiber';
import WaterOverlays from './WaterOverlays';
import type { InfluenceRange } from './sceneOverlays';
import TerrainMaterial from './TerrainMaterial';
import WaterMaterial from './WaterMaterial';
import { useSceneSettings } from './sceneSettings';
import { useWaterLevelDemo } from './waterLevelDemo';
import { buildWaterSurface } from './waterSurface';
import { buildValleyGeometry } from './riverGeometry';

/** Terrain and wettable triangles are built once; level changes update a shared uniform only. */
export default function RiverCorridor({ influenceRanges }: { influenceRanges?: readonly InfluenceRange[] }) {
  const inspect = useMemo(() => new URLSearchParams(window.location.search).has('inspect'), []);
  const directions = useSceneSettings(s => s.directions);
  const quality = useSceneSettings(s => s.quality);
  const motion = useSceneSettings(s => s.motion);
  const terrain = useMemo(() => buildValleyGeometry(), []);
  const water = useMemo(() => buildWaterSurface(terrain), [terrain]);
  const waterLevel = useMemo(() => ({ value: 0 }), []);
  useFrame(({gl},delta) => {
    const target=useWaterLevelDemo.getState().level;
    const difference=target-waterLevel.value;
    waterLevel.value=!motion || Math.abs(difference)<.0001 ? target
      : waterLevel.value+difference*(1-Math.exp(-Math.min(delta,.05)*4));
    if(inspect) gl.domElement.dataset.waterLevel=String(waterLevel.value);
  });
  useEffect(() => () => { terrain.dispose(); water.dispose(); }, [terrain, water]);
  return <group name="river-corridor">
    <mesh name="terrain" geometry={terrain} receiveShadow><TerrainMaterial riverTerrain waterLevelUniform={waterLevel}/></mesh>
    <mesh name="river-water" geometry={water} receiveShadow><WaterMaterial quality={quality} animate={motion} waterLevelUniform={waterLevel}/></mesh>
    <WaterOverlays level={waterLevel} directions={directions} ranges={influenceRanges}/>
  </group>;
}
