// Code-built equipment (E1–E12). Each station type's static body is ONE merged, vertex-coloured geometry shared by
// every station of that type. Live parts read the Station every frame: the rack bar and its plates (loaded while the
// owner rests, gone while they lift it, left loaded by Rerack Avoiders), treadmill belts, bike flywheels, and the
// construction kit while the crew builds.
import { useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import { Html } from '@react-three/drei';
import * as THREE from 'three';
import { useEngine } from '../engineContext';
import type { Station, StationType } from '../sim/types';
import { Kit, equipmentMaterial, kitMaterial } from './kit';
import { platesFor, PLATE_COLOURS, PLATE_RADIUS } from './plates';
import { propFor } from './character/poses';

const FRAME = '#3D405B', FRAME_DARK = '#2B2D42', PAD = '#22223B', PAD_ACCENT = '#E63946', CHROME = '#C9CED6';
const RUBBER = '#2F2F33', WOOD = '#C69C6D', WOOD_DARK = '#A47148', STEEL = '#8D99AE';

// ---------- static bodies ----------

function benchBody(k: Kit): void {
  // flat bench: padded top, steel frame, feet
  k.rbox(0.38, 0.1, 1.2, 0.04, PAD, 0, 0.42, 0.1);
  k.rbox(0.39, 0.02, 1.21, 0.01, PAD_ACCENT, 0, 0.365, 0.1);
  k.box(0.08, 0.3, 0.08, FRAME, 0, 0.2, 0.55); k.box(0.08, 0.3, 0.08, FRAME, 0, 0.2, -0.3);
  k.box(0.5, 0.05, 0.1, FRAME, 0, 0.03, 0.58); k.box(0.5, 0.05, 0.1, FRAME, 0, 0.03, -0.32);
  k.box(0.08, 0.06, 0.9, FRAME, 0, 0.32, 0.12);
  // uprights with J-hooks and plate horns
  for (const x of [-0.56, 0.56]) {
    k.box(0.08, 1.12, 0.08, FRAME, x, 0.56, -0.5);
    k.box(0.12, 0.05, 0.6, FRAME, x, 0.025, -0.45);
    k.box(0.1, 0.06, 0.12, PAD_ACCENT, x, 0.95, -0.44); // J-hook
    k.cyl(0.025, 0.2, CHROME, x + Math.sign(x) * 0.1, 0.45, -0.62, 0, 0, Math.PI / 2, 8);
    k.cyl(PLATE_RADIUS[45], 0.06, PLATE_COLOURS[45], x + Math.sign(x) * 0.15, 0.45, -0.62, 0, 0, Math.PI / 2, 18);
    k.cyl(PLATE_RADIUS[25], 0.05, PLATE_COLOURS[25], x + Math.sign(x) * 0.21, 0.45, -0.62, 0, 0, Math.PI / 2, 16);
  }
  k.box(1.2, 0.05, 0.08, FRAME, 0, 0.025, -0.5);
}

function squatRackBody(k: Kit): void {
  k.rbox(1.6, 0.05, 1.35, 0.02, RUBBER, 0, 0.025, 0);
  for (const x of [-0.62, 0.62]) for (const z of [-0.42, 0.42]) k.box(0.09, 2.15, 0.09, FRAME, x, 1.1, z);
  for (const x of [-0.62, 0.62]) { k.box(0.09, 0.09, 0.93, FRAME, x, 2.13, 0); k.box(0.09, 0.07, 0.93, FRAME, x, 0.06, 0); }
  k.box(1.33, 0.09, 0.09, FRAME, 0, 2.13, -0.42);
  k.cyl(0.025, 1.3, CHROME, 0, 2.05, 0.42, 0, 0, Math.PI / 2, 8); // pull-up bar
  for (const x of [-0.62, 0.62]) {
    k.box(0.1, 0.06, 0.14, PAD_ACCENT, x, 1.33, -0.38);       // J-hooks
    k.box(0.08, 0.06, 0.6, '#ADB5BD', x, 0.72, 0.15);          // safety arms
    // plate storage on the back posts
    k.cyl(0.025, 0.22, CHROME, x + Math.sign(x) * 0.12, 0.5, -0.42, 0, 0, Math.PI / 2, 8);
    k.cyl(PLATE_RADIUS[45], 0.06, PLATE_COLOURS[45], x + Math.sign(x) * 0.15, 0.5, -0.42, 0, 0, Math.PI / 2, 18);
    k.cyl(PLATE_RADIUS[45], 0.06, PLATE_COLOURS[45], x + Math.sign(x) * 0.22, 0.5, -0.42, 0, 0, Math.PI / 2, 18);
    k.cyl(PLATE_RADIUS[10], 0.05, PLATE_COLOURS[10], x + Math.sign(x) * 0.12, 1.1, -0.42, 0, 0, Math.PI / 2, 14);
  }
  k.rbox(0.4, 0.03, 0.1, 0.01, '#FFD166', 0, 2.13, -0.48); // little brand plate
}

function platformBody(k: Kit): void {
  k.rbox(1.9, 0.07, 1.55, 0.02, RUBBER, 0, 0.035, 0);
  k.box(0.95, 0.075, 1.5, WOOD, 0, 0.04, 0);
  for (let i = -2; i <= 2; i++) k.box(0.005, 0.077, 1.5, WOOD_DARK, i * 0.19, 0.04, 0);
  // chalk bowl on a little stand
  k.cyl(0.05, 0.5, STEEL, 0.82, 0.25, 0.6, 0, 0, 0, 8);
  k.cyl(0.13, 0.08, '#F8F9FA', 0.82, 0.54, 0.6, 0, 0, 0, 14, 0.09);
  k.cyl(0.11, 0.02, '#FFFFFF', 0.82, 0.58, 0.6, 0, 0, 0, 14);
}

function dumbbellBody(k: Kit): void {
  // two-tier rack against the back, graded dumbbells
  k.rbox(1.3, 0.06, 0.32, 0.02, FRAME, 0, 0.42, -0.55);
  k.rbox(1.3, 0.06, 0.32, 0.02, FRAME, 0, 0.78, -0.62);
  for (const x of [-0.62, 0.62]) { k.box(0.06, 0.82, 0.06, FRAME, x, 0.41, -0.55); k.box(0.06, 0.82, 0.06, FRAME, x, 0.41, -0.68); k.box(0.08, 0.04, 0.4, FRAME, x, 0.02, -0.6); }
  for (let tier = 0; tier < 2; tier++) {
    for (let i = 0; i < 5; i++) {
      const r = 0.045 + (tier * 5 + i) * 0.006;
      const x = -0.5 + i * 0.25, y = (tier ? 0.81 : 0.45) + r, z = tier ? -0.62 : -0.55;
      k.cyl(0.018, 0.2, CHROME, x, y, z, 0, 0, Math.PI / 2, 6);
      k.cyl(r, 0.055, FRAME_DARK, x - 0.1, y, z, 0, 0, Math.PI / 2, 10);
      k.cyl(r, 0.055, FRAME_DARK, x + 0.1, y, z, 0, 0, Math.PI / 2, 10);
    }
  }
  // adjustable bench
  k.rbox(0.36, 0.09, 0.55, 0.04, PAD, 0, 0.4, 0.25);
  k.rbox(0.36, 0.09, 0.5, 0.04, PAD, 0, 0.55, -0.12, -0.6, 0, 0);
  k.box(0.08, 0.34, 0.08, FRAME, 0, 0.18, 0.3); k.box(0.42, 0.05, 0.1, FRAME, 0, 0.025, 0.45); k.box(0.42, 0.05, 0.1, FRAME, 0, 0.025, -0.05);
}

function cableBody(k: Kit): void {
  k.rbox(1.0, 0.05, 0.5, 0.02, FRAME_DARK, 0, 0.025, -0.45);
  for (const x of [-0.42, 0.42]) k.box(0.09, 2.25, 0.12, FRAME, x, 1.13, -0.45);
  k.box(0.93, 0.12, 0.14, FRAME, 0, 2.25, -0.45);
  // weight stack with guide rods and a selector pin
  for (let i = 0; i < 12; i++) k.box(0.34, 0.055, 0.18, i % 2 ? '#343A40' : '#495057', 0, 0.12 + i * 0.058, -0.52);
  k.cyl(0.012, 1.5, CHROME, -0.12, 0.85, -0.52, 0, 0, 0, 6); k.cyl(0.012, 1.5, CHROME, 0.12, 0.85, -0.52, 0, 0, 0, 6);
  k.box(0.06, 0.02, 0.06, PAD_ACCENT, 0.2, 0.5, -0.43);
  // pulleys, cable and a handle at the top
  k.cyl(0.07, 0.04, '#ADB5BD', 0, 2.15, -0.3, 0, 0, Math.PI / 2, 14);
  k.tube([0, 2.1, -0.28], [0, 1.65, -0.2], 0.008, '#1B1B1B', 5);
  k.cyl(0.015, 0.5, '#1B1B1B', 0, 1.63, -0.2, 0, 0, Math.PI / 2, 6);
  // seat with knee pad
  k.rbox(0.38, 0.08, 0.36, 0.03, PAD, 0, 0.42, 0.12);
  k.box(0.07, 0.38, 0.07, FRAME, 0, 0.2, 0.12);
  k.rbox(0.42, 0.08, 0.1, 0.03, PAD, 0, 0.62, 0.0);
  k.box(0.07, 0.25, 0.07, FRAME, 0, 0.5, 0.02);
  k.box(0.07, 0.07, 0.6, FRAME, 0, 0.04, -0.12);
}

function pullupBody(k: Kit): void {
  for (const x of [-0.58, 0.58]) { k.box(0.09, 2.35, 0.09, FRAME, x, 1.17, 0); k.box(0.12, 0.05, 0.9, FRAME, x, 0.025, 0); }
  k.cyl(0.03, 1.3, CHROME, 0, 2.27, 0, 0, 0, Math.PI / 2, 10);
  k.box(1.25, 0.08, 0.08, FRAME, 0, 2.38, 0);
  // dip handles and a back pad
  for (const x of [-0.58, 0.58]) k.cyl(0.025, 0.35, '#1B1B1B', x * 0.6, 1.2, 0.18, Math.PI / 2, 0, 0, 8);
  k.rbox(0.4, 0.5, 0.08, 0.03, PAD, 0, 1.25, -0.12);
}

function treadmillBody(k: Kit): void {
  k.rbox(0.68, 0.16, 1.6, 0.04, '#2B2D42', 0, 0.1, 0.1);
  k.rbox(0.12, 0.05, 1.45, 0.02, '#ADB5BD', -0.3, 0.2, 0.15); k.rbox(0.12, 0.05, 1.45, 0.02, '#ADB5BD', 0.3, 0.2, 0.15);
  k.rbox(0.68, 0.18, 0.2, 0.05, '#3D405B', 0, 0.12, -0.62); // motor hood
  for (const x of [-0.3, 0.3]) { k.tube([x, 0.2, -0.6], [x, 1.15, -0.65], 0.03, STEEL); k.tube([x, 1.0, -0.62], [x, 1.0, -0.15], 0.022, '#1B1B1B'); }
  k.rbox(0.7, 0.28, 0.12, 0.04, '#495057', 0, 1.22, -0.66, -0.35, 0, 0);
  k.rbox(0.5, 0.16, 0.02, 0.01, '#4CC9F0', 0, 1.24, -0.6, -0.35, 0, 0); // screen
  k.box(0.08, 0.04, 0.02, '#F72585', 0.18, 1.32, -0.6); // red stop key
}

function bikeBody(k: Kit): void {
  k.box(0.5, 0.05, 0.12, FRAME_DARK, 0, 0.03, 0.45); k.box(0.5, 0.05, 0.12, FRAME_DARK, 0, 0.03, -0.45);
  k.tube([0, 0.05, 0.4], [0, 0.85, 0.25], 0.04, FRAME);
  k.tube([0, 0.05, -0.4], [0, 1.0, -0.35], 0.045, FRAME);
  k.tube([0, 0.4, 0.3], [0, 0.4, -0.3], 0.035, FRAME);
  k.rbox(0.26, 0.07, 0.32, 0.03, PAD, 0, 0.92, 0.25);
  k.cyl(0.02, 0.5, '#1B1B1B', 0, 1.02, -0.4, 0, 0, Math.PI / 2, 8);
  k.rbox(0.14, 0.1, 0.06, 0.02, '#4CC9F0', 0, 1.1, -0.36);
  k.cyl(0.24, 0.05, '#ADB5BD', 0.06, 0.42, -0.3, 0, 0, Math.PI / 2, 18); // guard (flywheel spins on top)
}

function rowerBody(k: Kit): void {
  k.rbox(0.18, 0.06, 2.0, 0.02, '#ADB5BD', 0, 0.2, 0.05);
  k.box(0.5, 0.05, 0.1, FRAME_DARK, 0, 0.025, 0.95); k.box(0.12, 0.17, 0.1, FRAME_DARK, 0, 0.11, 0.95);
  k.cyl(0.28, 0.3, '#3D405B', 0, 0.36, -0.85, 0, 0, Math.PI / 2, 20); // fan housing
  k.cyl(0.29, 0.02, '#4361EE', -0.155, 0.36, -0.85, 0, 0, Math.PI / 2, 20);
  k.box(0.5, 0.05, 0.12, FRAME_DARK, 0, 0.025, -0.85);
  k.tube([0, 0.4, -0.65], [0, 0.85, -0.45], 0.025, FRAME);
  k.rbox(0.18, 0.12, 0.05, 0.02, '#4CC9F0', 0, 0.88, -0.44, -0.4, 0, 0);
  k.rbox(0.32, 0.04, 0.16, 0.02, '#1B1B1B', -0.0, 0.18, -0.45, -0.5, 0, 0); // footplates
  k.rbox(0.3, 0.06, 0.28, 0.03, PAD, 0, 0.27, 0.15); // seat
  k.cyl(0.015, 0.4, '#1B1B1B', 0, 0.36, -0.6, 0, 0, Math.PI / 2, 6); // handle
}

const MAT_COLOURS = ['#6D597A', '#2A9D8F', '#E76F51'];
function matBody(k: Kit, variant: number): void {
  k.rbox(0.78, 0.025, 1.7, 0.01, MAT_COLOURS[variant % 3], 0, 0.013, 0);
  k.cyl(0.07, 0.78, MAT_COLOURS[variant % 3], 0, 0.07, 0.86, 0, 0, Math.PI / 2, 12);
  if (variant === 1) k.cyl(0.07, 0.45, '#4361EE', 0.55, 0.07, 0.4, 0, 0, Math.PI / 2, 12); // foam roller
}

const bodyCache = new Map<string, THREE.BufferGeometry>();
function bodyGeometry(type: StationType, variant: number): THREE.BufferGeometry {
  const key = type === 'mat' ? `mat${variant % 3}` : type;
  let g = bodyCache.get(key);
  if (g) return g;
  const k = new Kit();
  switch (type) {
    case 'bench': benchBody(k); break;
    case 'squatRack': squatRackBody(k); break;
    case 'platform': platformBody(k); break;
    case 'dumbbells': dumbbellBody(k); break;
    case 'cable': cableBody(k); break;
    case 'pullupBar': pullupBody(k); break;
    case 'treadmill': treadmillBody(k); break;
    case 'bike': bikeBody(k); break;
    case 'rower': rowerBody(k); break;
    case 'mat': matBody(k, variant); break;
  }
  g = k.build();
  bodyCache.set(key, g);
  return g;
}

/** Where the bar rests when nobody is lifting it (station-local). */
const RACK: Partial<Record<StationType, { y: number; z: number }>> = {
  bench: { y: 0.99, z: -0.44 }, squatRack: { y: 1.38, z: -0.36 }, platform: { y: 0.24, z: 0 },
};

// ---------- construction kit ----------

let constructionGeo: THREE.BufferGeometry | null = null;
function constructionGeometry(): THREE.BufferGeometry {
  if (constructionGeo) return constructionGeo;
  const k = new Kit();
  const O = '#FB8500';
  for (const x of [-0.75, 0.75]) for (const z of [-0.95, 0.95]) k.cyl(0.035, 1.8, O, x, 0.9, z, 0, 0, 0, 8);
  for (const y of [0.9, 1.75]) { k.cyl(0.03, 1.5, O, 0, y, -0.95, 0, 0, Math.PI / 2, 8); k.cyl(0.03, 1.5, O, 0, y, 0.95, 0, 0, Math.PI / 2, 8); k.cyl(0.03, 1.9, O, -0.75, y, 0, Math.PI / 2, 0, 0, 8); k.cyl(0.03, 1.9, O, 0.75, y, 0, Math.PI / 2, 0, 0, 8); }
  k.tube([-0.75, 0.1, -0.95], [0.75, 1.7, -0.95], 0.025, O);
  // sawhorse and plank pile
  k.box(0.9, 0.06, 0.12, WOOD, 1.25, 0.55, 0.2); for (const x of [0.9, 1.6]) { k.tube([x, 0.55, 0.2], [x - 0.1, 0, 0.35], 0.025, WOOD_DARK); k.tube([x, 0.55, 0.2], [x - 0.1, 0, 0.05], 0.025, WOOD_DARK); }
  for (let i = 0; i < 4; i++) k.box(0.18, 0.04, 1.1, i % 2 ? WOOD : WOOD_DARK, -1.2 + (i % 2) * 0.05, 0.02 + i * 0.045, 0.1, i * 0.05);
  k.cyl(0.2, 0.32, '#FFD166', -1.15, 0.16, -0.75, 0, 0, 0, 10, 0.24); // bucket
  constructionGeo = k.build();
  return constructionGeo;
}

let hazardGeo: THREE.BufferGeometry | null = null;
/** Black-and-yellow hazard tape rectangle marking a temporary station (shape + pattern, not colour alone). */
function hazardGeometry(): THREE.BufferGeometry {
  if (hazardGeo) return hazardGeo;
  const k = new Kit();
  const W = 1.7, D = 2.1, T = 0.1;
  const edge = (len: number, horizontal: boolean, off: number) => {
    const n = Math.round(len / 0.14);
    for (let i = 0; i < n; i++) {
      const c = i % 2 ? '#1B1B1B' : '#FFC300';
      const p = -len / 2 + (i + 0.5) * (len / n);
      if (horizontal) k.box(len / n, 0.012, T, c, p, 0.008, off); else k.box(T, 0.012, len / n, c, off, 0.008, p);
    }
  };
  edge(W, true, -D / 2); edge(W, true, D / 2); edge(D, false, -W / 2); edge(D, false, W / 2);
  hazardGeo = k.build();
  return hazardGeo;
}

// ---------- live parts ----------

const barGeo = new THREE.CylinderGeometry(0.022, 0.022, 1.75, 8).rotateZ(Math.PI / 2);
const plateGeo = new THREE.CylinderGeometry(1, 1, 0.07, 18).rotateZ(Math.PI / 2);
const chromeMaterial = new THREE.MeshStandardMaterial({ color: CHROME, roughness: 0.3, metalness: 0.7 });
const plateMaterial = new THREE.MeshStandardMaterial({ roughness: 0.55 });
const flywheelGeo = (() => { const k = new Kit(); k.cyl(0.2, 0.04, '#E63946', 0, 0, 0, 0, 0, Math.PI / 2, 16); k.box(0.05, 0.36, 0.05, '#FFFFFF', 0.025, 0, 0); return k.build(); })();

function beltTexture(): THREE.CanvasTexture {
  const c = document.createElement('canvas');
  c.width = 16; c.height = 64;
  const ctx = c.getContext('2d')!;
  ctx.fillStyle = '#16161A'; ctx.fillRect(0, 0, 16, 64);
  ctx.fillStyle = '#2E2E36';
  for (let y = 0; y < 64; y += 8) ctx.fillRect(0, y, 16, 3);
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.repeat.set(1, 3);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

const MAX_PLATES = 12;
const tmpObj = new THREE.Object3D();
const tmpCol = new THREE.Color();

function layoutPlates(im: THREE.InstancedMesh, weight: number): void {
  const list = weight > 45 ? platesFor(weight) : [];
  let n = 0;
  for (const side of [-1, 1]) {
    let x = 0.68;
    for (const pl of list) {
      if (n >= MAX_PLATES) break;
      tmpObj.position.set(side * x, 0, 0);
      tmpObj.scale.set(1, PLATE_RADIUS[pl], PLATE_RADIUS[pl]);
      tmpObj.updateMatrix();
      im.setMatrixAt(n, tmpObj.matrix);
      im.setColorAt(n, tmpCol.set(PLATE_COLOURS[pl]));
      x += 0.075; n++;
    }
  }
  im.count = n;
  im.instanceMatrix.needsUpdate = true;
  if (im.instanceColor) im.instanceColor.needsUpdate = true;
}

export function StationMesh({ id, type, temporary, variant = 0 }: { id: string; type: StationType; temporary: boolean; variant?: number }) {
  const eng = useEngine();
  const root = useRef<THREE.Group>(null!);
  const model = useRef<THREE.Group>(null!);
  const kitRef = useRef<THREE.Mesh>(null!);
  const rackBar = useRef<THREE.Group>(null!);
  const plates = useRef<THREE.InstancedMesh>(null!);
  const belt = useRef<THREE.Mesh>(null!);
  const flywheel = useRef<THREE.Mesh>(null!);
  const lastLoad = useRef(-1);
  const grow = useRef(temporary ? 0 : 1);

  const body = useMemo(() => bodyGeometry(type, variant), [type, variant]);
  const beltMat = useMemo(() => (type === 'treadmill' ? new THREE.MeshStandardMaterial({ map: beltTexture(), roughness: 0.9 }) : null), [type]);
  const rack = RACK[type];

  useFrame((_, dt) => {
    const s: Station | undefined = eng.stations.find((x) => x.id === id);
    if (!s || !root.current) return;
    root.current.position.set(s.pos.x, 0, s.pos.z);
    root.current.rotation.y += (s.rot - root.current.rotation.y) * Math.min(1, dt * 6);

    // temporary stations "grow" out of the floor while the crew works, and shrink away when removed
    const target = s.building ? 0.55 + 0.1 * Math.sin(performance.now() / 160) : 1;
    grow.current += (target - grow.current) * Math.min(1, dt * 3);
    model.current.scale.set(1, grow.current, 1);
    if (kitRef.current) kitRef.current.visible = s.building;

    const occ = s.occupant ? eng.agents.get(s.occupant) : undefined;
    const ex = occ ? (occ.rackCurl ? 'rack_curl' : occ.routine[occ.index]?.exerciseId) : undefined;
    const inUse = !!occ && (occ.state === 'lifting' || (occ.state === 'interacting' && occ.paused?.state === 'lifting'));

    if (rack && rackBar.current) {
      const holding = inUse && (propFor(ex) === 'barbell' || propFor(ex) === 'ezbar');
      rackBar.current.visible = !holding && !s.building;
      // resting owners leave their working weight on the bar; Rerack Avoiders leave it there after they go
      let load = 45;
      if (occ && ex && propFor(ex) === 'barbell') load = Math.round((eng.save.members[occ.npcId]?.weights[ex] ?? 45) / 5) * 5;
      else if (s.unracked > 0) load = 225;
      if (load !== lastLoad.current) { lastLoad.current = load; layoutPlates(plates.current, load); }
    }
    if (belt.current && beltMat?.map) {
      if (inUse) beltMat.map.offset.y -= dt * (ex === 'treadmill_run' ? 2.4 : 1.1);
    }
    if (flywheel.current && inUse) flywheel.current.rotation.x -= dt * 9;
  });

  return (
    <group ref={root}>
      <group ref={model}>
        <mesh geometry={body} material={equipmentMaterial} castShadow receiveShadow />
        {rack && (
          <group ref={rackBar} position={[0, rack.y, rack.z]}>
            <mesh geometry={barGeo} material={chromeMaterial} castShadow />
            <instancedMesh ref={plates} args={[plateGeo, plateMaterial, MAX_PLATES]} castShadow />
          </group>
        )}
        {type === 'treadmill' && beltMat && (
          <mesh ref={belt} position={[0, 0.185, 0.15]} rotation-x={-Math.PI / 2} material={beltMat}><planeGeometry args={[0.46, 1.4]} /></mesh>
        )}
        {type === 'bike' && <mesh ref={flywheel} geometry={flywheelGeo} material={kitMaterial} position={[0.1, 0.42, -0.3]} />}
      </group>
      {temporary && (
        <>
          <mesh geometry={hazardGeometry()} material={kitMaterial} receiveShadow />
          <mesh ref={kitRef} geometry={constructionGeometry()} material={kitMaterial} castShadow visible={false} />
          <Html position={[0, 2.1, 0]} center zIndexRange={[10, 0]} style={{ pointerEvents: 'none' }}>
            <div className="station-tag">{eng.stations.find((s) => s.id === id)?.label ?? ''}</div>
          </Html>
        </>
      )}
    </group>
  );
}
