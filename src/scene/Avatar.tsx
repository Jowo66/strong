// A member (or crew worker): procedural rigged character, one skinned mesh per outfit, posed every frame from
// the agent's state. No React state changes per frame: everything is written straight into Three.js objects.
import { useEffect, useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import { Html } from '@react-three/drei';
import * as THREE from 'three';
import { useEngine } from '../engineContext';
import { useUi } from '../store/ui';
import { useSettings } from '../store/settings';
import type { Anim, Bubble, Vec2 } from '../sim/types';
import type { CharacterLook } from './character/look';
import { hashString } from './character/look';
import { BONES, boneInverses, buildCharacterGeometry, createBones, dumbbellGeometry, rigDims } from './character/rig';
import { blendPose, computePose, propForPose, restPose, type Pose, type PoseContext, type Prop } from './character/poses';
import { platesFor, PLATE_COLOURS, PLATE_RADIUS } from './plates';

export interface AvatarSource {
  pos: Vec2; facing: number; anim: Anim; bubble: Bubble | null;
  outfit?: 'street' | 'gym'; aura?: number;
  exercise?: string; resting?: boolean; stationType?: string; weight?: number;
}

interface Props {
  id: string;
  look: CharacterLook;
  source: () => AvatarSource | undefined;
  hoverable?: boolean;
  isPlayer?: boolean;
}

export const SCALE = 1.25;

const bodyMaterial = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.78, metalness: 0 });
const metalMaterial = new THREE.MeshStandardMaterial({ color: '#C9CED6', roughness: 0.3, metalness: 0.7 });
const propMaterial = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.6 });
const plateMaterial = new THREE.MeshStandardMaterial({ roughness: 0.55 });
const phoneMaterial = new THREE.MeshStandardMaterial({ color: '#1B1B22', roughness: 0.4, emissive: '#5BC0EB', emissiveIntensity: 0.05 });
const barGeo = new THREE.CylinderGeometry(0.022, 0.022, 1, 8).rotateZ(Math.PI / 2);
const plateGeo = new THREE.CylinderGeometry(1, 1, 0.07, 18).rotateZ(Math.PI / 2);
const dbGeo = dumbbellGeometry();
const phoneGeo = new THREE.BoxGeometry(0.05, 0.1, 0.012);
const auraGeo = new THREE.OctahedronGeometry(0.06, 0);
const hitGeo = new THREE.CapsuleGeometry(0.35, 1.0, 2, 8).translate(0, 0.9, 0);
const noRaycast = () => undefined;

const geoCache = new Map<string, { gym: THREE.BufferGeometry; street: THREE.BufferGeometry }>();
function geometriesFor(look: CharacterLook) {
  let g = geoCache.get(look.key);
  if (!g) {
    const dims = rigDims(look);
    g = { gym: buildCharacterGeometry(look, 'gym', dims), street: buildCharacterGeometry(look, 'street', dims) };
    geoCache.set(look.key, g);
  }
  return g;
}

const lerpAngle = (a: number, b: number, t: number) => {
  let d = b - a;
  while (d > Math.PI) d -= Math.PI * 2;
  while (d < -Math.PI) d += Math.PI * 2;
  return a + d * t;
};

const v1 = new THREE.Vector3(), v2 = new THREE.Vector3(), v3 = new THREE.Vector3();
const q1 = new THREE.Quaternion(), q2 = new THREE.Quaternion();
const X = new THREE.Vector3(1, 0, 0);
const HAND = new THREE.Vector3(0, -0.2, 0.005);
const m4 = new THREE.Matrix4();
const MAX_PLATES = 12;
const AURA_N = 24;

export function Avatar({ id, look, source, hoverable = true, isPlayer }: Props) {
  const eng = useEngine();
  const setHovered = useUi((s) => s.setHovered);
  const reducedMotion = useSettings((s) => s.reducedMotion);
  const auraHex = useSettings((s) => eng.c.aura.colours.find((c) => c.id === s.auraColour)?.hex ?? '#FFC93C');

  const root = useRef<THREE.Group>(null!);
  const body = useRef<THREE.Group>(null!);
  const props = useRef<THREE.Group>(null!);
  const barbell = useRef<THREE.Group>(null!);
  const bar = useRef<THREE.Mesh>(null!);
  const plates = useRef<THREE.InstancedMesh>(null!);
  const dbL = useRef<THREE.Mesh>(null!);
  const dbR = useRef<THREE.Mesh>(null!);
  const phone = useRef<THREE.Mesh>(null!);
  const aura = useRef<THREE.Group>(null!);
  const auraParticles = useRef<THREE.InstancedMesh>(null!);
  const auraLight = useRef<THREE.PointLight>(null!);
  const bubbleEl = useRef<HTMLDivElement>(null!);

  // Build the skeleton and the two outfit meshes once per look.
  const rig = useMemo(() => {
    const dims = rigDims(look);
    const geos = geometriesFor(look);
    const bones = createBones(dims);
    const skeleton = new THREE.Skeleton(bones, boneInverses(dims));
    const identity = new THREE.Matrix4();
    const mk = (geo: THREE.BufferGeometry) => {
      const m = new THREE.SkinnedMesh(geo, bodyMaterial);
      m.bind(skeleton, identity);
      m.castShadow = true;
      m.frustumCulled = false;
      m.raycast = noRaycast;
      return m;
    };
    const gym = mk(geos.gym), street = mk(geos.street);
    const byName = Object.fromEntries(BONES.map((b, i) => [b, bones[i]])) as Record<(typeof BONES)[number], THREE.Bone>;
    for (const b of ['hips']) byName[b as 'hips'].rotation.order = 'YXZ';
    return { dims, bones, byName, skeleton, gym, street };
  }, [look]);

  useEffect(() => () => { rig.skeleton.dispose(); }, [rig]);

  const variant = useMemo(() => (hashString(id) % 1000) / 1000, [id]);
  const phase = useMemo(() => variant * 17, [variant]);
  const pose = useRef<Pose>(restPose());
  const first = useRef(true);
  const ctx = useRef<PoseContext>({ anim: 'idle', t: 0, variant, reduced: false });
  const lastPlates = useRef('');

  useFrame((state, dt) => {
    const a = source();
    if (!a || !root.current) return;
    const g = root.current;
    const k = Math.min(1, dt * 12);
    if (first.current) { g.position.set(a.pos.x, 0, a.pos.z); g.rotation.y = a.facing; first.current = false; }
    g.position.x += (a.pos.x - g.position.x) * k;
    g.position.z += (a.pos.z - g.position.z) * k;
    g.rotation.y = lerpAngle(g.rotation.y, a.facing, Math.min(1, dt * 8));

    const street = a.outfit === 'street';
    rig.gym.visible = !street;
    rig.street.visible = street;

    // --- pose ---
    const c = ctx.current;
    c.anim = a.anim; c.exercise = a.exercise; c.resting = a.resting; c.stationType = a.stationType;
    c.t = state.clock.elapsedTime + phase; c.reduced = reducedMotion;
    const target = computePose(c);
    blendPose(pose.current, target, Math.min(1, dt * 14));
    const p = pose.current, B = rig.byName, R = rig.dims.rest;
    B.hips.position.set(p.hips[0], p.hips[1], p.hips[2]);
    B.hips.rotation.set(p.hipsRot[0], p.hipsRot[1], p.hipsRot[2]);
    B.spine.rotation.set(p.spine[0], p.spine[1], p.spine[2]);
    B.head.rotation.set(p.head[0], p.head[1], p.head[2]);
    B.armL.rotation.set(p.armL[0], p.armL[1], p.armL[2]);
    B.armR.rotation.set(p.armR[0], p.armR[1], p.armR[2]);
    B.foreL.rotation.set(p.foreL[0], p.foreL[1], p.foreL[2]);
    B.foreR.rotation.set(p.foreR[0], p.foreR[1], p.foreR[2]);
    B.thighL.rotation.set(p.thighL[0], p.thighL[1], p.thighL[2]);
    B.thighR.rotation.set(p.thighR[0], p.thighR[1], p.thighR[2]);
    B.shinL.rotation.set(p.shinL[0], p.shinL[1], p.shinL[2]);
    B.shinR.rotation.set(p.shinR[0], p.shinR[1], p.shinR[2]);
    B.mouth.scale.set(1 - p.mouth * 0.15, 1 + p.mouth * 2.6, 1);
    B.brows.position.y = R.brows.y - R.head.y + p.brows * 0.02;
    B.eyes.scale.y = p.blink;

    // --- props in the hands ---
    const prop: Prop = propForPose(c);
    const showBar = prop === 'barbell' || prop === 'ezbar';
    barbell.current.visible = showBar;
    dbL.current.visible = prop === 'dumbbells' || prop === 'dumbbell';
    dbR.current.visible = prop === 'dumbbells';
    phone.current.visible = prop === 'phone';
    if (prop !== 'none') {
      g.updateMatrixWorld(true);
      m4.copy(g.matrixWorld).invert();
      const hl = v1.copy(HAND).applyMatrix4(B.foreL.matrixWorld).applyMatrix4(m4);
      const hr = v2.copy(HAND).applyMatrix4(B.foreR.matrixWorld).applyMatrix4(m4);
      g.getWorldQuaternion(q2).invert();
      if (showBar) {
        const bb = barbell.current;
        bb.position.copy(hl).add(hr).multiplyScalar(0.5);
        const dir = v3.copy(hr).sub(hl);
        if (dir.lengthSq() < 0.04) dir.set(1, 0, 0); else dir.normalize();
        bb.quaternion.setFromUnitVectors(X, dir);
        bar.current.scale.x = prop === 'ezbar' ? 1.2 : 1.75;
        const key = `${prop}:${a.weight ?? 0}`;
        if (key !== lastPlates.current) { lastPlates.current = key; layoutPlates(plates.current, a.weight ?? 45, prop === 'ezbar' ? 0.45 : 0.68); }
      }
      if (dbL.current.visible) {
        if (prop === 'dumbbell') {
          dbL.current.position.copy(hl).add(hr).multiplyScalar(0.5);
          dbL.current.quaternion.setFromAxisAngle(v3.set(0, 0, 1), Math.PI / 2);
          dbL.current.scale.setScalar(1.3);
        } else {
          dbL.current.position.copy(hl);
          B.foreL.getWorldQuaternion(q1); dbL.current.quaternion.copy(q2).multiply(q1);
          dbR.current.position.copy(hr);
          B.foreR.getWorldQuaternion(q1); dbR.current.quaternion.copy(q2).multiply(q1);
          const s = 0.85 + Math.min(0.6, (a.weight ?? 20) / 120);
          dbL.current.scale.setScalar(s); dbR.current.scale.setScalar(s);
        }
      }
      if (phone.current.visible) {
        phone.current.position.copy(hr).add(v3.set(0, 0.06, 0.06));
        B.foreR.getWorldQuaternion(q1); phone.current.quaternion.copy(q2).multiply(q1);
      }
    }

    // --- aura ---
    const auraT = a.aura ?? 0;
    aura.current.visible = auraT > 0;
    auraLight.current.intensity = auraT > 0 ? 5 + Math.sin(c.t * 18) * 2.5 : 0;
    if (auraT > 0) {
      const im = auraParticles.current;
      for (let i = 0; i < AURA_N; i++) {
        const f = i / AURA_N;
        const rise = reducedMotion ? f : (f + c.t * 0.6) % 1;
        const ang = f * Math.PI * 2 * 3 + (reducedMotion ? 0 : c.t * 4);
        const r = 0.55 + Math.sin(rise * Math.PI) * 0.2;
        m4.compose(v3.set(Math.cos(ang) * r, 0.1 + rise * 2.3, Math.sin(ang) * r), q1.identity(), v1.setScalar(1 - rise * 0.7));
        im.setMatrixAt(i, m4);
      }
      im.instanceMatrix.needsUpdate = true;
      const s = 1 + (reducedMotion ? 0 : Math.sin(c.t * 10) * 0.1);
      aura.current.scale.set(s, 1, s);
    }

    // --- speech bubble ---
    const el = bubbleEl.current;
    if (el) {
      const text = a.bubble?.text ?? '';
      if (el.textContent !== text) el.textContent = text;
      el.style.display = text ? 'block' : 'none';
    }
  });

  const s = SCALE * look.height;
  return (
    <group ref={root}
      onPointerOver={hoverable ? (e) => { e.stopPropagation(); setHovered(id); } : undefined}
      onPointerOut={hoverable ? () => setHovered(null) : undefined}>
      {hoverable && <mesh geometry={hitGeo} visible={false} />}
      {isPlayer && (
        <mesh rotation-x={-Math.PI / 2} position-y={0.02}><ringGeometry args={[0.42, 0.52, 28]} /><meshBasicMaterial color={auraHex} transparent opacity={0.9} /></mesh>
      )}
      <group ref={body} scale={s}>
        <primitive object={rig.bones[0]} />
        <primitive object={rig.gym} />
        <primitive object={rig.street} />
      </group>
      <group ref={props}>
        <group ref={barbell} visible={false}>
          <mesh ref={bar} geometry={barGeo} material={metalMaterial} castShadow />
          <instancedMesh ref={plates} args={[plateGeo, plateMaterial, MAX_PLATES]} castShadow />
        </group>
        <mesh ref={dbL} geometry={dbGeo} material={propMaterial} visible={false} castShadow />
        <mesh ref={dbR} geometry={dbGeo} material={propMaterial} visible={false} castShadow />
        <mesh ref={phone} geometry={phoneGeo} material={phoneMaterial} visible={false} />
      </group>
      <group ref={aura} visible={false}>
        <instancedMesh ref={auraParticles} args={[auraGeo, undefined, AURA_N]}>
          <meshBasicMaterial color={auraHex} transparent opacity={0.9} />
        </instancedMesh>
        <mesh position-y={1}><cylinderGeometry args={[0.65, 0.5, 2.1, 24, 1, true]} /><meshBasicMaterial color={auraHex} transparent opacity={0.16} side={THREE.DoubleSide} depthWrite={false} /></mesh>
      </group>
      <pointLight ref={auraLight} position={[0, 1.1, 0]} color={auraHex} intensity={0} distance={5} />
      <Html position={[0, 2.2 * look.height, 0]} center zIndexRange={[20, 0]} style={{ pointerEvents: 'none' }}>
        <div ref={bubbleEl} className="bubble" style={{ display: 'none' }} />
      </Html>
    </group>
  );
}

const tmpObj = new THREE.Object3D();
const tmpCol = new THREE.Color();
/** Lay plates out on both sleeves of a held bar, heaviest inside. Bar-local X runs along the bar. */
function layoutPlates(im: THREE.InstancedMesh, weight: number, sleeve: number): void {
  const list = platesFor(weight);
  let n = 0;
  for (const side of [-1, 1]) {
    let x = sleeve;
    for (const pl of list) {
      if (n >= MAX_PLATES) break;
      tmpObj.position.set(side * x, 0, 0);
      const r = PLATE_RADIUS[pl];
      tmpObj.scale.set(1, r, r);
      tmpObj.updateMatrix();
      im.setMatrixAt(n, tmpObj.matrix);
      im.setColorAt(n, tmpCol.set(PLATE_COLOURS[pl]));
      x += 0.075;
      n++;
    }
  }
  im.count = n;
  im.instanceMatrix.needsUpdate = true;
  if (im.instanceColor) im.instanceColor.needsUpdate = true;
}
