import { useEffect, useLayoutEffect, useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import foliageUrl from './assets/foliage-atlas-v2.png';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { createEcologyLayout, type EcologyInstance, type EcologyQuality, type TreeSpecies } from './ecologyLayout';

export interface EcologyProps { quality?: EcologyQuality; animate?: boolean; }

type TreeGeometry = { crown: THREE.BufferGeometry; trunk: THREE.BufferGeometry };
const treeSpecies: TreeSpecies[] = ['deciduous', 'poplar', 'willow'];

function merge(parts: THREE.BufferGeometry[]) {
  const geometry = mergeGeometries(parts, false)!;
  for (const part of parts) part.dispose();
  geometry.computeBoundingSphere();
  return geometry;
}

function branch(from: THREE.Vector3, to: THREE.Vector3, radius: number, segments=6) {
  const delta = to.clone().sub(from);
  const geometry = new THREE.CylinderGeometry(radius * 0.25, radius * .55, delta.length(), segments, 1);
  geometry.applyQuaternion(new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), delta.normalize()));
  geometry.translate((from.x + to.x) / 2, (from.y + to.y) / 2, (from.z + to.z) / 2);
  return geometry;
}

/** Opaque cutout sprigs share one atlas and one instanced draw per crown. */
export function foliageLobe(center: number[], scale: number[], seed: number, cards = 14) {
  const positions: number[] = [], normals: number[] = [], uvs: number[] = [], colors: number[] = [];
  const normal = new THREE.Vector3(), right = new THREE.Vector3(), up = new THREE.Vector3();
  const point = new THREE.Vector3(), corner = new THREE.Vector3(), canopyNormal = new THREE.Vector3();
  for (let i = 0; i < cards; i++) {
    const y = 1 - (i + 0.5) / cards * 2, angle = i * 2.39996 + seed * 1.71;
    const radius = Math.sqrt(1 - y * y);
    normal.set(Math.cos(angle) * radius, y, Math.sin(angle) * radius);
    right.crossVectors(Math.abs(y) > 0.94 ? new THREE.Vector3(1, 0, 0) : new THREE.Vector3(0, 1, 0), normal).normalize();
    up.crossVectors(normal, right);
    const rotation = Math.sin(i * 8.17 + seed * 4.3) * 1.9;
    right.applyAxisAngle(normal, rotation); up.applyAxisAngle(normal, rotation);
    const shell = 0.78 + ((i * 7 + seed * 3) % 11) / 11 * 0.18;
    point.set(center[0] + normal.x * scale[0] * shell, center[1] + normal.y * scale[1] * shell,
      center[2] + normal.z * scale[2] * shell);
    const cardWidth = (scale[0] + scale[2]) * (0.56 + (i % 3) * 0.055);
    const cardHeight = Math.max(scale[1] * 1.1, cardWidth * 0.8);
    const tile = Math.abs(Math.floor(seed + i)) % 3, tu = tile % 2, tv = Math.floor(tile / 2);
    const brightness = 0.92 + (y + 1) * 0.035 + Math.sin(seed + i * 13) * 0.018;
    for (const [sx, sy] of [[-1, -1], [1, -1], [1, 1], [-1, -1], [1, 1], [-1, 1]]) {
      corner.copy(point).addScaledVector(right, sx * cardWidth * 0.5).addScaledVector(up, sy * cardHeight * 0.5);
      positions.push(corner.x, corner.y, corner.z);
      // Crown-space shading varies continuously across each card, avoiding bright flat cutout plates.
      canopyNormal.set((corner.x - center[0]) / (scale[0] * scale[0]),
        (corner.y - center[1]) / (scale[1] * scale[1]), (corner.z - center[2]) / (scale[2] * scale[2])).normalize();
      normals.push(canopyNormal.x, canopyNormal.y, canopyNormal.z);
      uvs.push((tu + (sx + 1) * 0.494 + 0.003) / 2, (tv + (sy + 1) * 0.494 + 0.003) / 2);
      colors.push(brightness, brightness, brightness * 0.97);
    }
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geometry.setAttribute('normal', new THREE.Float32BufferAttribute(normals, 3));
  geometry.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
  geometry.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
  return geometry;
}

export function foliageAtlas() {
 const texture=new THREE.TextureLoader().load(foliageUrl);
 texture.colorSpace=THREE.SRGBColorSpace;texture.anisotropy=8;return texture;
}

export function treeGeometry(species: TreeSpecies, variant: number, cards=14): TreeGeometry {
  const lobe=(center:number[],scale:number[],seed:number)=>foliageLobe(center,scale,seed,cards);
  const treeBranch=(a:THREE.Vector3,b:THREE.Vector3,r:number)=>branch(a,b,r,cards<=2?3:cards<=8?4:6);
  const crowns: THREE.BufferGeometry[] = [], branches: THREE.BufferGeometry[] = [];
  const lean = variant ? 0.055 : -0.035;
  const root = new THREE.Vector3(0, -0.018, 0);
  const fork = new THREE.Vector3(lean, species === 'willow' ? 0.43 : 0.5, 0.015);
  branches.push(treeBranch(root, fork, species === 'poplar' ? 0.04 : 0.045));
  if (species === 'poplar') {
    branches.push(treeBranch(fork, new THREE.Vector3(lean * 1.4, 0.92, 0), 0.023));
    for (let i = 0; i < 9; i++) {
      const angle = i * 2.4 + variant, y = 0.42 + i * 0.057;
      const radial = 0.11 * Math.sin((i + 1) / 11 * Math.PI);
      const x = lean + Math.cos(angle) * radial, z = Math.sin(angle) * radial;
      crowns.push(lobe([x, y, z], [0.16 + (i % 3) * 0.018, 0.15, 0.16], i + variant * 17));
      if (i < 6) branches.push(treeBranch(new THREE.Vector3(lean, y - 0.13, 0), new THREE.Vector3(x, y, z), 0.013));
    }
  } else if (species === 'willow') {
    crowns.push(lobe([lean, 0.8, 0], [0.29, 0.19, 0.28], variant + 20));
    for (let i = 0; i < 9; i++) {
      const angle = i * 2.4 + variant * 1.8, radial = 0.22 + (i % 3) * 0.03;
      const x = lean + Math.cos(angle) * radial, z = Math.sin(angle) * radial;
      const tip = new THREE.Vector3(x * 0.78, 0.72 + (i % 2) * 0.06, z * 0.78);
      branches.push(treeBranch(fork, tip, 0.022));
      crowns.push(lobe([x, 0.56 + (i % 3) * 0.055, z], [0.145, 0.27, 0.145], i * 3 + variant));
    }
  } else {
    crowns.push(lobe([lean - 0.035, 0.81, 0.02], [0.26, 0.2, 0.25], variant + 40));
    for (let i = 0; i < 8; i++) {
      const angle = i * 2.4 + variant * 1.7, radial = 0.21 + (i % 3) * 0.035;
      const x = lean + Math.cos(angle) * radial, z = Math.sin(angle) * radial;
      const y = 0.63 + Math.sin(i * 3 + variant) * 0.09;
      const tip = new THREE.Vector3(x * 0.85, y + 0.015, z * 0.85);
      branches.push(treeBranch(fork, tip, 0.02 + (i % 2) * 0.006));
      crowns.push(lobe([x, y + 0.09, z], [0.19 + (i % 2) * 0.025, 0.17 + (i % 3) * 0.02, 0.2], i + variant * 9));
    }
  }
  const crown = merge(crowns), trunk = merge(branches);
  crown.computeBoundingBox();
  const box = crown.boundingBox!;
  const width = 2 * Math.max(Math.abs(box.min.x), Math.abs(box.max.x), Math.abs(box.min.z), Math.abs(box.max.z));
  const height = box.max.y;
  // Both parts share one transform so branches reach the crown and roots stay at Y=0.
  for (const geometry of [crown, trunk]) {
    geometry.scale(1 / width, 1 / height, 1 / width);
    geometry.computeBoundingSphere();
  }
  return { crown, trunk };
}

function shrubGeometry(cards=6) {
  return merge(Array.from({ length: 5 }, (_, i) => {
    const angle = i * 2.4;
    return foliageLobe([Math.cos(angle) * 0.2, 0.36 + (i % 2) * 0.18, Math.sin(angle) * 0.18],
      [0.27, 0.35 + (i % 2) * 0.13, 0.25], i + 51, cards);
  }));
}

function grassGeometry() {
  const positions: number[] = [], colors: number[] = [];
  for (let i = 0; i < 13; i++) {
    const angle = i * 2.4, radius = 0.05 + (i % 4) * 0.09;
    const x = Math.cos(angle) * radius, z = Math.sin(angle) * radius;
    const dx = Math.cos(angle + 0.7) * 0.025, dz = Math.sin(angle + 0.7) * 0.025;
    const height = 0.46 + (i % 5) * 0.13;
    positions.push(x - dx, -0.04, z - dz, x + dx, -0.04, z + dz,
      x + Math.sin(angle) * 0.15, height, z + Math.cos(angle) * 0.15);
    colors.push(0.65, 0.69, 0.58, 0.65, 0.69, 0.58, 1, 1, 0.88);
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geometry.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
  geometry.computeVertexNormals(); geometry.computeBoundingSphere();
  return geometry;
}

/** One batch of thin culms, bent leaves and seed heads: no transparent reed planes. */
function reedGeometry() {
  const positions: number[] = [], colors: number[] = [];
  const triangle = (a: number[], b: number[], c: number[], shade: number[]) => {
    positions.push(...a, ...b, ...c); colors.push(...shade, ...shade, ...shade);
  };
  const ribbon = (a: number[], b: number[], width: number, angle: number, shade: number[]) => {
    const dx = Math.cos(angle) * width, dz = Math.sin(angle) * width;
    const p = [a[0] - dx, a[1], a[2] - dz], q = [a[0] + dx, a[1], a[2] + dz];
    const r = [b[0] + dx * .7, b[1], b[2] + dz * .7], s = [b[0] - dx * .7, b[1], b[2] - dz * .7];
    triangle(p, q, r, shade); triangle(p, r, s, shade);
  };
  for (let i = 0; i < 7; i++) {
    const angle = i * 2.39996, radial = .07 + i % 3 * .095;
    const x = Math.cos(angle) * radial, z = Math.sin(angle) * radial, height = .68 + i % 4 * .105;
    const top = [x + Math.sin(angle) * .055, height, z + Math.cos(angle) * .04];
    const stem = [x, -.018, z];
    ribbon(stem, top, .008, angle, [.77, .83, .58]);
    ribbon(stem, top, .008, angle + Math.PI / 2, [.77, .83, .58]);
    for (const side of [-1, 1]) {
      const base = [x, height * (side < 0 ? .35 : .56), z];
      const mid = [x + Math.cos(angle) * side * .15, base[1] + .16, z + Math.sin(angle) * side * .15];
      const tip = [x + Math.cos(angle) * side * .3, base[1] + .07, z + Math.sin(angle) * side * .3];
      ribbon(base, mid, .025, angle + Math.PI / 2, [.87, .95, .72]);
      triangle([mid[0] - Math.sin(angle) * .021, mid[1], mid[2] + Math.cos(angle) * .021],
        [mid[0] + Math.sin(angle) * .021, mid[1], mid[2] - Math.cos(angle) * .021], tip, [.92, .99, .77]);
    }
    if (i % 2 === 0) for (let plane = 0; plane < 3; plane++) {
      ribbon(top, [top[0] + .018, top[1] + .13, top[2]], .022, plane * Math.PI / 3, [.87, .7, .46]);
    }
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geometry.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
  geometry.computeVertexNormals(); geometry.computeBoundingSphere();
  return geometry;
}

function pebbleGeometry() {
  const geometry = new THREE.IcosahedronGeometry(0.5, 1), p = geometry.getAttribute('position');
  for (let i = 0; i < p.count; i++) {
    const x = p.getX(i), y = p.getY(i), z = p.getZ(i);
    const irregularity = 1 + 0.12 * Math.sin(x * 14 + z * 17 + y * 11);
    p.setXYZ(i, x * irregularity, (y + 0.36) * 1.08, z * irregularity);
  }
  geometry.computeVertexNormals(); geometry.computeBoundingSphere();
  return geometry;
}

function InstanceBatch({ name, geometry, material, items, colors, shadows = true }: {
  name: string; geometry: THREE.BufferGeometry; material: THREE.Material;
  items: EcologyInstance[]; colors: string[]; shadows?: boolean;
}) {
  const ref = useRef<THREE.InstancedMesh>(null!);
  useLayoutEffect(() => {
    const mesh = ref.current, matrix = new THREE.Object3D(), color = new THREE.Color();
    const palette = colors.map(value => new THREE.Color(value));
    for (let i = 0; i < items.length; i++) {
      const item = items[i];
      matrix.position.set(item.x, item.y, item.z);
      matrix.rotation.set(0, item.rotation, 0);
      matrix.scale.set(item.width, item.height, item.width);
      matrix.updateMatrix(); mesh.setMatrixAt(i, matrix.matrix);
      const shade = item.tint * (palette.length - 1), index = Math.floor(shade);
      color.copy(palette[index]).lerp(palette[Math.min(index + 1, palette.length - 1)], shade - index);
      mesh.setColorAt(i, color);
    }
    mesh.instanceMatrix.needsUpdate = true;
    if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
    mesh.computeBoundingSphere();
  }, [items, colors]);
  return <instancedMesh ref={ref} name={name} args={[geometry, material, items.length]}
    castShadow={shadows} receiveShadow />;
}

const leafColors = {
  deciduous: ['#d9e0c4', '#f0e9bc', '#dfe4ca', '#cbd8b7'],
  poplar: ['#e3e6c8', '#e4ddb1', '#d0ddb9'],
  willow: ['#d3e0cf', '#e2e7ca', '#d5dfbf'],
};
const barkColors = ['#796d57', '#93816a', '#6c6554'];
const shrubColors = ['#d8debd', '#d9d3ad', '#ccd7bb'];
const reedColors = ['#798756', '#939768', '#7c8d5e'];
const grassColors = ['#80905a', '#a0a16b', '#73834c'];
const pebbleColors = ['#a79f8c', '#b9b09c', '#9b998c'];

/** 16 instanced draws; foliage shadows use exactly the same static crown geometry. */
export default function Ecology({ quality = 'medium', animate = true }: EcologyProps) {
  const layout = useMemo(() => createEcologyLayout(quality), [quality]);
  const assets = useMemo(() => {
    const trees = treeSpecies.flatMap(species => [0, 1].map(variant => ({ species, variant, ...treeGeometry(species, variant, quality==='low'?2:quality==='medium'?8:14) })));
    const atlas = foliageAtlas();
    const time = { value: 0 }, sway = { value: 0 };
    const leaves = new THREE.MeshStandardMaterial({ map: atlas, alphaTest: 0.38, side: THREE.DoubleSide,
      alphaToCoverage: true, depthWrite: true, roughness: 0.96, vertexColors: true,
      emissive: '#2b3b22', emissiveIntensity: 0.07 });
    // Leaf cards use smooth canopy normals, including their back sides; avoid checkerboard face flips.
    leaves.onBeforeCompile = shader => {
      shader.uniforms.uLeafTime=time;shader.uniforms.uLeafSway=sway;
      shader.vertexShader='uniform float uLeafTime;uniform float uLeafSway;\n'+shader.vertexShader;
      shader.vertexShader=shader.vertexShader.replace('#include <begin_vertex>',`#include <begin_vertex>
        float leafPhase=instanceMatrix[3].x*.31+instanceMatrix[3].z*.61;
        transformed.x+=sin(uLeafTime*.9+leafPhase)*pow(max(position.y,0.),2.)*uLeafSway*.14;`);

      shader.fragmentShader = shader.fragmentShader.replace('#include <normal_fragment_begin>',
        '#include <normal_fragment_begin>\nnormal *= faceDirection;');
    };
    leaves.customProgramCacheKey = () => 'ecology-canopy-normals-v26';
    const bark = new THREE.MeshStandardMaterial({ roughness: 0.98 });
    const grass = new THREE.MeshStandardMaterial({ alphaToCoverage: true, roughness: 1, vertexColors: true, side: THREE.DoubleSide });
    const stones = new THREE.MeshStandardMaterial({ roughness: 0.94 });
    grass.onBeforeCompile = shader => {
      shader.uniforms.uGrassTime = time; shader.uniforms.uGrassSway = sway;
      shader.vertexShader = 'uniform float uGrassTime; uniform float uGrassSway;\n' + shader.vertexShader;
      shader.vertexShader = shader.vertexShader.replace('#include <begin_vertex>', `
        #include <begin_vertex>
        float phase = instanceMatrix[3].x * 0.37 + instanceMatrix[3].z * 0.21;
        transformed.x += sin(uGrassTime * 1.2 + phase) * pow(max(position.y, 0.0), 2.0) * uGrassSway;
      `);
    };
    grass.customProgramCacheKey = () => 'ecology-grass-v1';
    return { trees, leaves, bark, grass, stones, time, sway, atlas,
      shrubs: shrubGeometry(quality==='low'?3:6), blades: grassGeometry(), pebbles: pebbleGeometry(), reeds: reedGeometry() };
  }, [quality]);
  const groupedTrees = useMemo(() => assets.trees.map(group => ({ ...group,
    items: layout.trees.filter(tree => tree.species === group.species && tree.variant === group.variant) })), [assets, layout]);
  useFrame((_, delta) => {
    assets.sway.value = animate && quality !== 'low' ? 0.06 : 0;
    if (animate && quality !== 'low') assets.time.value += Math.min(delta, 0.05);
  });
  useEffect(() => () => {
    assets.atlas.dispose();
    for (const tree of assets.trees) { tree.crown.dispose(); tree.trunk.dispose(); }
    for (const geometry of [assets.shrubs, assets.blades, assets.pebbles, assets.reeds]) geometry.dispose();
    for (const material of [assets.leaves, assets.bark, assets.grass, assets.stones]) material.dispose();
  }, [assets]);
  return <group name="valley-ecology">
    {groupedTrees.map(group => <group key={`${group.species}-${group.variant}`}>
      <InstanceBatch name={`${group.species}-crown-${group.variant}`} geometry={group.crown} material={assets.leaves}
        items={group.items} colors={leafColors[group.species]} />
      <InstanceBatch name={`${group.species}-trunk-${group.variant}`} geometry={group.trunk} material={assets.bark}
        items={group.items} colors={barkColors} />
    </group>)}
    <InstanceBatch name="understory-shrubs" geometry={assets.shrubs} material={assets.leaves} items={layout.shrubs} colors={shrubColors} />
    <InstanceBatch name="meadow-grass" geometry={assets.blades} material={assets.grass} items={quality==='low'?[]:layout.grass} colors={grassColors} shadows={false} />
    <InstanceBatch name="bank-reeds" geometry={assets.reeds} material={assets.grass} items={layout.reeds} colors={reedColors} shadows={false} />
    <InstanceBatch name="bank-pebbles" geometry={assets.pebbles} material={assets.stones} items={layout.pebbles} colors={pebbleColors} shadows={false} />
  </group>;
}



