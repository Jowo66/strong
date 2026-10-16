// A member (or crew worker): procedural rigged character, one skinned mesh per outfit, posed every frame from
// the agent's state. No React state changes per frame: everything is written straight into Three.js objects.
import { useEffect, useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
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
import { musicPlaying } from '../store/music';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { PackRig, packData } from './character/pack';
import { claimAuraLight, registerBubble, type BubbleSource } from './overlay';

export interface AvatarSource {
  pos: Vec2; facing: number; anim: Anim; bubble: Bubble | null;
  outfit?: 'street' | 'gym'; aura?: number;
  exercise?: string; resting?: boolean; stationType?: string; weight?: number;
  y?: number;                 // standing on something (the podium)
  carry?: 'plank' | null;     // crew carrying a plank
  carryRot?: number;          // 0 = sideways (stuck in doorways), π/2 = lengthwise
  auraGold?: boolean;         // golden PR: gold aura whatever colour was picked
  banner?: Bubble | null;     // title banner after winning
}

interface Props {
  id: string;
  look: CharacterLook;
  source: () => AvatarSource | undefined;
  hoverable?: boolean;
  isPlayer?: boolean;
}

export const SCALE = 1.25;

export const bodyMaterial = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.78, metalness: 0 });
const metalMaterial = new THREE.MeshStandardMaterial({ color: '#C9CED6', roughness: 0.3, metalness: 0.7 });
const propMaterial = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.6 });
const plateMaterial = new THREE.MeshStandardMaterial({ roughness: 0.55 });
const phoneMaterial = new THREE.MeshStandardMaterial({ color: '#1B1B22', roughness: 0.4, emissive: '#5BC0EB', emissiveIntensity: 0.05 });
const barGeo = new THREE.CylinderGeometry(0.022, 0.022, 1, 8).rotateZ(Math.PI / 2);
const plateGeo = new THREE.CylinderGeometry(1, 1, 0.07, 18).rotateZ(Math.PI / 2);
const dbGeo = dumbbellGeometry();
const phoneGeo = new THREE.BoxGeometry(0.05, 0.1, 0.012);
const bottleGeo = (() => {
  const body = new THREE.CylinderGeometry(0.035, 0.035, 0.16, 10).toNonIndexed();
  const cap = new THREE.CylinderGeometry(0.02, 0.025, 0.04, 8).translate(0, 0.1, 0).toNonIndexed();
  const paint = (g: THREE.BufferGeometry, hex: string) => { const c = new THREE.Color(hex); const a = new Float32Array(g.attributes.position.count * 3); for (let i = 0; i < a.length; i += 3) { a[i] = c.r; a[i + 1] = c.g; a[i + 2] = c.b; } g.setAttribute('color', new THREE.BufferAttribute(a, 3)); g.deleteAttribute('uv'); return g; };
  return mergeGeometries([paint(body, '#8ECAE6'), paint(cap, '#264653')])!;
})();
const puffGeo = new THREE.IcosahedronGeometry(0.05, 0);
const plankGeo = new THREE.BoxGeometry(2.2, 0.05, 0.22);
const plankMaterial = new THREE.MeshStandardMaterial({ color: '#C69C6D', roughness: 0.8 });
const puffMaterial = new THREE.MeshBasicMaterial({ color: '#FFFFFF', transparent: true, opacity: 0.8, depthWrite: false });
const auraGeo = new THREE.OctahedronGeometry(0.06, 0);
const hitGeo = new THREE.CapsuleGeometry(0.35, 1.0, 2, 8).translate(0, 0.9, 0);
const noRaycast = () => undefined;

const geoCache = new Map<string, { gym: THREE.BufferGeometry; street: THREE.BufferGeometry }>();
export function geometriesFor(look: CharacterLook) {
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
  const openProfile = useUi((s) => s.openProfile);
  const focused = useUi((s) => s.hovered === id && s.keyboardFocus === id);
  const reducedMotion = useSettings((s) => s.reducedMotion);
  const auraId = useSettings((s) => s.auraColour);
  const pickedHex = eng.c.aura.colours.find((c) => c.id === auraId)?.hex ?? '#FFC93C';
  const auraParticleMat = useRef<THREE.MeshBasicMaterial>(null!);
  const auraShellMat = useRef<THREE.MeshBasicMaterial>(null!);

  const root = useRef<THREE.Group>(null!);
  const body = useRef<THREE.Group>(null!);
  const props = useRef<THREE.Group>(null!);
  const barbell = useRef<THREE.Group>(null!);
  const bar = useRef<THREE.Mesh>(null!);
  const plates = useRef<THREE.InstancedMesh>(null!);
  const dbL = useRef<THREE.Mesh>(null!);
  const dbR = useRef<THREE.Mesh>(null!);
  const phone = useRef<THREE.Mesh>(null!);
  const bottle = useRef<THREE.Mesh>(null!);
  const puff = useRef<THREE.InstancedMesh>(null!);
  const plank = useRef<THREE.Mesh>(null!);
  const aura = useRef<THREE.Group>(null!);
  const auraParticles = useRef<THREE.InstancedMesh>(null!);
  const anchor = useRef<THREE.Group>(null!);
  const speech = useRef<BubbleSource | null>(null);
  useEffect(() => {
    const [src, done] = registerBubble(id, anchor.current);
    speech.current = src;
    return done;
  }, [id]);

  // The character pack when it's loaded (it is loaded before the gym opens), else the code-built figure.
  const pr = useMemo(() => (packData() ? new PackRig(look) : null), [look]);
  useEffect(() => () => { pr?.dispose(); }, [pr]);
  // Build the skeleton and the two outfit meshes once per look.
  const rig = useMemo(() => {
    if (pr) return { dims: rigDims(look), bones: [] as THREE.Bone[], byName: {} as Record<(typeof BONES)[number], THREE.Bone>, skeleton: pr.skeleton, gym: pr.gym, street: pr.street };
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

  useEffect(() => () => { if (!pr) rig.skeleton.dispose(); }, [rig, pr]);

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
    g.position.y += ((a.y ?? 0) - g.position.y) * Math.min(1, dt * 8);

    const street = a.outfit === 'street';
    rig.gym.visible = !street;
    rig.street.visible = street;

    // --- pose ---
    const c = ctx.current;
    c.anim = a.anim; c.exercise = a.exercise; c.resting = a.resting; c.stationType = a.stationType;
    c.t = state.clock.elapsedTime + phase; c.reduced = reducedMotion; c.carry = a.carry === 'plank'; c.music = musicPlaying();
    const target = computePose(c);
    blendPose(pose.current, target, Math.min(1, dt * 14));
    const p = pose.current, B = rig.byName, R = rig.dims.rest;
    if (pr) pr.apply(p, c, dt);
    else {
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
    }

    // --- props in the hands ---
    const prop: Prop = propForPose(c);
    const showBar = prop === 'barbell' || prop === 'ezbar';
    barbell.current.visible = showBar;
    dbL.current.visible = prop === 'dumbbells' || prop === 'dumbbell';
    dbR.current.visible = prop === 'dumbbells';
    phone.current.visible = prop === 'phone';
    bottle.current.visible = prop === 'bottle';
    puff.current.visible = prop === 'chalk';
    plank.current.visible = prop === 'plank';
    if (prop !== 'none') {
      g.updateMatrixWorld(true);
      m4.copy(g.matrixWorld).invert();
      const hl = (pr ? pr.hand('L', v1) : v1.copy(HAND).applyMatrix4(B.foreL.matrixWorld)).applyMatrix4(m4);
      const hr = (pr ? pr.hand('R', v2) : v2.copy(HAND).applyMatrix4(B.foreR.matrixWorld)).applyMatrix4(m4);
      const foreQ = (side: 'L' | 'R', out: THREE.Quaternion) => (pr ? pr.foreQuat(side, out) : (side === 'L' ? B.foreL : B.foreR).getWorldQuaternion(out));
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
          foreQ('L', q1); dbL.current.quaternion.copy(q2).multiply(q1);
          dbR.current.position.copy(hr);
          foreQ('R', q1); dbR.current.quaternion.copy(q2).multiply(q1);
          const s = 0.85 + Math.min(0.6, (a.weight ?? 20) / 120);
          dbL.current.scale.setScalar(s); dbR.current.scale.setScalar(s);
        }
      }
      if (plank.current.visible) {
        plank.current.position.copy(hl).add(hr).multiplyScalar(0.5);
        plank.current.rotation.set(0, a.carryRot ?? 0, 0);
      }
      if (bottle.current.visible) {
        bottle.current.position.copy(hr);
        foreQ('R', q1); bottle.current.quaternion.copy(q2).multiply(q1);
      }
      if (puff.current.visible) {
        // a little cloud of chalk dust between the hands (V5); a still haze in reduced motion
        const mid = v3.copy(hl).add(hr).multiplyScalar(0.5);
        const ph = reducedMotion ? 0.5 : (c.t * 0.8) % 1;
        for (let i = 0; i < 6; i++) {
          const ang = (i / 6) * Math.PI * 2;
          const r = 0.06 + ph * 0.22;
          m4.compose(v1.set(mid.x + Math.cos(ang) * r, mid.y + ph * 0.25 + (i % 2) * 0.05, mid.z + Math.sin(ang) * r), q1.identity(), v2.setScalar(0.6 + ph));
          puff.current.setMatrixAt(i, m4);
        }
        puff.current.instanceMatrix.needsUpdate = true;
        puffMaterial.opacity = 0.75 * (1 - ph);
      }
      if (phone.current.visible) {
        phone.current.position.copy(hr).add(v3.set(0, 0.06, 0.06));
        foreQ('R', q1); phone.current.quaternion.copy(q2).multiply(q1);
      }
    }

    // --- aura: each colour moves differently; a golden PR overrides the colour ---
    const auraT = a.aura ?? 0;
    aura.current.visible = auraT > 0;
    if (auraT > 0) claimAuraLight(v3.set(0, 1.1, 0).applyMatrix4(g.matrixWorld), a.auraGold ? '#FFD700' : pickedHex, 5 + Math.sin(c.t * 18) * 2.5);
    if (auraT > 0) {
      const kind = a.auraGold ? 'gold' : auraId;
      const hex = a.auraGold ? '#FFD700' : pickedHex;
      auraParticleMat.current.color.set(hex); auraShellMat.current.color.set(hex);
      const im = auraParticles.current;
      const tt = reducedMotion ? 0.5 : c.t;
      for (let i = 0; i < AURA_N; i++) {
        const f = i / AURA_N;
        let x = 0, y = 0, z = 0, sc = 1;
        switch (kind) {
          case 'red': { // flames: fast, flickering, shrinking as they rise
            const rise = (f * 3.7 + tt * 1.6) % 1, ang = f * 37;
            x = Math.cos(ang) * (0.45 - rise * 0.25) + Math.sin(tt * 9 + i) * 0.04; z = Math.sin(ang) * (0.45 - rise * 0.25); y = rise * 2.2; sc = 1.4 * (1 - rise);
            break;
          }
          case 'blue': { // tight, quick spiral
            const rise = (f + tt * 0.9) % 1, ang = f * Math.PI * 12 + tt * 8;
            x = Math.cos(ang) * 0.5; z = Math.sin(ang) * 0.5; y = rise * 2.4; sc = 0.8;
            break;
          }
          case 'purple': { // orbiting rings at three heights
            const ring = i % 3, ang = f * Math.PI * 2 * 3 + tt * (2 + ring);
            x = Math.cos(ang) * (0.55 + ring * 0.1); z = Math.sin(ang) * (0.55 + ring * 0.1); y = 0.5 + ring * 0.6; sc = 0.9;
            break;
          }
          case 'green': { // leaves drifting outwards and fluttering down
            const life = (f * 2.3 + tt * 0.5) % 1, ang = f * 41;
            x = Math.cos(ang) * (0.3 + life * 0.8); z = Math.sin(ang) * (0.3 + life * 0.8); y = 1.6 - life * 1.3 + Math.sin(tt * 6 + i) * 0.08; sc = 1 - life * 0.4;
            break;
          }
          case 'cyan': { // shockwave rings along the floor
            const life = (Math.floor(i / 8) / 3 + tt * 0.8) % 1, ang = ((i % 8) / 8) * Math.PI * 2;
            x = Math.cos(ang) * (0.3 + life * 1.2); z = Math.sin(ang) * (0.3 + life * 1.2); y = 0.1 + life * 0.2; sc = 1.2 * (1 - life);
            break;
          }
          case 'white': { // a soft, slow glow
            const rise = (f + tt * 0.25) % 1, ang = f * 23;
            x = Math.cos(ang) * 0.5; z = Math.sin(ang) * 0.5; y = 0.2 + rise * 2.0; sc = 0.7 + Math.sin(tt * 3 + i) * 0.2;
            break;
          }
          case 'pink': { // floaty bubbles swaying upwards
            const rise = (f * 1.7 + tt * 0.35) % 1, ang = f * 19;
            x = Math.cos(ang) * 0.6 + Math.sin(tt * 2 + i) * 0.12; z = Math.sin(ang) * 0.6; y = rise * 2.4; sc = 1.1;
            break;
          }
          default: { // gold: twinkling sparkles
            const rise = (f + tt * 0.6) % 1, ang = f * Math.PI * 2 * 3 + tt * 4;
            const r = 0.55 + Math.sin(rise * Math.PI) * 0.2;
            x = Math.cos(ang) * r; z = Math.sin(ang) * r; y = 0.1 + rise * 2.3; sc = (1 - rise * 0.7) * (0.6 + 0.6 * Math.abs(Math.sin(tt * 10 + i)));
          }
        }
        m4.compose(v3.set(x, y, z), q1.identity(), v1.setScalar(reducedMotion ? 0.8 : sc));
        im.setMatrixAt(i, m4);
      }
      im.instanceMatrix.needsUpdate = true;
      const s = 1 + (reducedMotion ? 0 : Math.sin(c.t * 10) * 0.1);
      aura.current.scale.set(s, 1, s);
    }

    // --- speech bubble and title banner (drawn by the shared BubbleLayer) ---
    if (speech.current) { speech.current.bubble = a.bubble; speech.current.banner = a.banner ?? null; }
  });

  const s = SCALE * look.height;
  return (
    <group ref={root}
      onPointerOver={hoverable ? (e) => { e.stopPropagation(); setHovered(id); } : undefined}
      onPointerOut={hoverable ? () => setHovered(null) : undefined}
      onClick={hoverable ? (e) => { e.stopPropagation(); openProfile(id); } : undefined}>
      {hoverable && <mesh geometry={hitGeo} visible={false} />}
      {focused && (
        <mesh rotation-x={-Math.PI / 2} position-y={0.025}><ringGeometry args={[0.55, 0.68, 32]} /><meshBasicMaterial color="#1B6EF3" /></mesh>
      )}
      {isPlayer && (
        <mesh rotation-x={-Math.PI / 2} position-y={0.02}><ringGeometry args={[0.42, 0.52, 28]} /><meshBasicMaterial color={pickedHex} transparent opacity={0.9} /></mesh>
      )}
      <group ref={body} scale={s}>
        {pr ? <primitive object={pr.object} /> : (
          <>
            <primitive object={rig.bones[0]} />
            <primitive object={rig.gym} />
            <primitive object={rig.street} />
          </>
        )}
      </group>
      <group ref={props}>
        <group ref={barbell} visible={false}>
          <mesh ref={bar} geometry={barGeo} material={metalMaterial} castShadow />
          <instancedMesh ref={plates} args={[plateGeo, plateMaterial, MAX_PLATES]} castShadow />
        </group>
        <mesh ref={dbL} geometry={dbGeo} material={propMaterial} visible={false} castShadow />
        <mesh ref={dbR} geometry={dbGeo} material={propMaterial} visible={false} castShadow />
        <mesh ref={phone} geometry={phoneGeo} material={phoneMaterial} visible={false} />
        <mesh ref={bottle} geometry={bottleGeo} material={propMaterial} visible={false} castShadow />
        <instancedMesh ref={puff} args={[puffGeo, puffMaterial, 6]} visible={false} />
        <mesh ref={plank} geometry={plankGeo} material={plankMaterial} visible={false} castShadow />
      </group>
      <group ref={aura} visible={false}>
        <instancedMesh ref={auraParticles} args={[auraGeo, undefined, AURA_N]}>
          <meshBasicMaterial ref={auraParticleMat} color={pickedHex} transparent opacity={0.9} />
        </instancedMesh>
        <mesh position-y={1}><cylinderGeometry args={[0.65, 0.5, 2.1, 24, 1, true]} /><meshBasicMaterial ref={auraShellMat} color={pickedHex} transparent opacity={0.16} side={THREE.DoubleSide} depthWrite={false} /></mesh>
      </group>
      <group ref={anchor} position={[0, (pr ? 2.45 : 2.2) * look.height, 0]} />
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
