// Placeholder member avatar: chunky body, oversized head, procedural animation driven by the agent's state.
// Swap for a rigged glTF later (see docs/ART_AND_ASSETS.md); the props and per-frame contract stay the same.
import { useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import { Html } from '@react-three/drei';
import * as THREE from 'three';
import { useEngine } from '../engineContext';
import { useUi } from '../store/ui';
import { useSettings } from '../store/settings';
import type { Anim, Appearance, Bubble, Vec2 } from '../sim/types';

export interface AvatarSource {
  pos: Vec2; facing: number; anim: Anim; bubble: Bubble | null;
  outfit?: 'street' | 'gym'; aura?: number;
}

interface Props {
  id: string;
  appearance: Appearance;
  source: () => AvatarSource | undefined;
  hardHat?: boolean;
  hoverable?: boolean;
  isPlayer?: boolean;
}

const lerpAngle = (a: number, b: number, t: number) => {
  let d = b - a;
  while (d > Math.PI) d -= Math.PI * 2;
  while (d < -Math.PI) d += Math.PI * 2;
  return a + d * t;
};

export function Avatar({ id, appearance: ap, source, hardHat, hoverable = true, isPlayer }: Props) {
  const eng = useEngine();
  const setHovered = useUi((s) => s.setHovered);
  const reducedMotion = useSettings((s) => s.reducedMotion);
  const auraHex = useSettings((s) => eng.c.aura.colours.find((c) => c.id === s.auraColour)?.hex ?? '#FFC93C');
  const root = useRef<THREE.Group>(null!);
  const body = useRef<THREE.Group>(null!);
  const armL = useRef<THREE.Group>(null!);
  const armR = useRef<THREE.Group>(null!);
  const head = useRef<THREE.Group>(null!);
  const shirtMat = useRef<THREE.MeshStandardMaterial>(null!);
  const aura = useRef<THREE.Group>(null!);
  const auraLight = useRef<THREE.PointLight>(null!);
  const bubbleEl = useRef<HTMLDivElement>(null!);
  const shirt = useMemo(() => new THREE.Color(ap.shirt), [ap.shirt]);
  const street = useMemo(() => new THREE.Color(ap.street), [ap.street]);
  const phase = useMemo(() => Math.random() * 10, []);
  const first = useRef(true);

  useFrame((state, dt) => {
    const a = source();
    if (!a || !root.current) return;
    const g = root.current;
    const k = Math.min(1, dt * 12);
    if (first.current) { g.position.set(a.pos.x, 0, a.pos.z); first.current = false; }
    g.position.x += (a.pos.x - g.position.x) * k;
    g.position.z += (a.pos.z - g.position.z) * k;
    g.rotation.y = lerpAngle(g.rotation.y, a.facing, Math.min(1, dt * 8));
    shirtMat.current.color.copy(a.outfit === 'street' ? street : shirt);

    const t = state.clock.elapsedTime + phase;
    const m = reducedMotion ? 0.35 : 1;
    let bob = 0, armLx = 0, armRx = 0, armLz = 0.12, armRz = -0.12, headY = 0, spin = 0, lean = 0;
    switch (a.anim) {
      case 'walk': bob = Math.abs(Math.sin(t * 9)) * 0.06; armLx = Math.sin(t * 9) * 0.6; armRx = -armLx; break;
      case 'search': bob = Math.abs(Math.sin(t * 7)) * 0.04; headY = Math.sin(t * 3) * 0.7; armLx = Math.sin(t * 7) * 0.4; armRx = -armLx; break;
      case 'lift': { const s = (Math.sin(t * 2.6) + 1) / 2; armLx = -2.6 + s * 1.1; armRx = armLx; bob = -s * 0.05; break; }
      case 'cardio': bob = Math.abs(Math.sin(t * 14)) * 0.08; armLx = Math.sin(t * 14) * 0.8; armRx = -armLx; break;
      case 'stretch': lean = 0.35 + Math.sin(t * 1.2) * 0.15; armLx = -2.8; armRx = -2.8; break;
      case 'flex': armLz = 1.9 + Math.sin(t * 4) * 0.15; armRz = -armLz; armLx = -0.2; armRx = -0.2; bob = Math.sin(t * 4) * 0.03; break;
      case 'clap': armLx = -1.3; armRx = -1.3; armLz = 0.5 + Math.sin(t * 22) * 0.3; armRz = -armLz; break;
      case 'celebrate': bob = Math.abs(Math.sin(t * 8)) * 0.25; armLz = 2.6; armRz = -2.6; break;
      case 'talk': headY = Math.sin(t * 2) * 0.2; armRx = -0.5 + Math.sin(t * 5) * 0.3; break;
      case 'build': armLx = -1.4 + Math.sin(t * 12) * 0.6; armRx = -1.4 - Math.sin(t * 12) * 0.6; lean = 0.25; break;
      case 'powerUp': bob = 0.15 + Math.sin(t * 20) * 0.03; armLz = 0.9; armRz = -0.9; spin = reducedMotion ? 0 : t * 3; break;
      default: bob = Math.sin(t * 1.6) * 0.012;
    }
    body.current.position.y = bob * m;
    body.current.rotation.x = lean;
    body.current.rotation.y = spin;
    armL.current.rotation.set(armLx * m, 0, armLz);
    armR.current.rotation.set(armRx * m, 0, armRz);
    head.current.rotation.y = headY * m;

    const auraT = a.aura ?? 0;
    aura.current.visible = auraT > 0;
    auraLight.current.intensity = auraT > 0 ? 6 + Math.sin(t * 18) * 3 : 0;
    if (auraT > 0) {
      aura.current.rotation.y = reducedMotion ? 0 : t * 4;
      const s = 1 + (reducedMotion ? 0 : Math.sin(t * 10) * 0.12);
      aura.current.scale.set(s, 1, s);
    }

    const el = bubbleEl.current;
    if (el) {
      const text = a.bubble?.text ?? '';
      if (el.textContent !== text) el.textContent = text;
      el.style.display = text ? 'block' : 'none';
    }
  });

  const h = ap.height, wd = ap.build;
  const skin = ap.skin;
  return (
    <group ref={root} scale={1.25}
      onPointerOver={hoverable ? (e) => { e.stopPropagation(); setHovered(id); } : undefined}
      onPointerOut={hoverable ? () => setHovered(null) : undefined}>
      <mesh rotation-x={-Math.PI / 2} position-y={0.015}><circleGeometry args={[0.32, 16]} /><meshBasicMaterial color="#000" transparent opacity={0.18} /></mesh>
      {isPlayer && (
        <mesh rotation-x={-Math.PI / 2} position-y={0.02}><ringGeometry args={[0.38, 0.46, 24]} /><meshBasicMaterial color={auraHex} /></mesh>
      )}
      <group ref={body} scale={[1, h, 1]}>
        {/* legs */}
        <mesh position={[-0.1 * wd, 0.22, 0]} castShadow><boxGeometry args={[0.13 * wd, 0.44, 0.15]} /><meshStandardMaterial color={skin} /></mesh>
        <mesh position={[0.1 * wd, 0.22, 0]} castShadow><boxGeometry args={[0.13 * wd, 0.44, 0.15]} /><meshStandardMaterial color={skin} /></mesh>
        <mesh position={[0, 0.4, 0]} castShadow><boxGeometry args={[0.36 * wd, 0.2, 0.2]} /><meshStandardMaterial color={ap.shorts} /></mesh>
        {/* torso */}
        <mesh position={[0, 0.68, 0]} castShadow>
          <capsuleGeometry args={[0.16 * wd, 0.22, 4, 10]} />
          <meshStandardMaterial ref={shirtMat} color={ap.shirt} />
        </mesh>
        {/* arms pivot at the shoulders */}
        <group ref={armL} position={[-0.24 * wd, 0.84, 0]}>
          <mesh position={[0, -0.18, 0]} castShadow><capsuleGeometry args={[0.055 * wd, 0.26, 4, 8]} /><meshStandardMaterial color={skin} /></mesh>
        </group>
        <group ref={armR} position={[0.24 * wd, 0.84, 0]}>
          <mesh position={[0, -0.18, 0]} castShadow><capsuleGeometry args={[0.055 * wd, 0.26, 4, 8]} /><meshStandardMaterial color={skin} /></mesh>
        </group>
        {/* oversized head */}
        <group ref={head} position={[0, 1.13, 0]}>
          <mesh castShadow><sphereGeometry args={[0.24, 18, 14]} /><meshStandardMaterial color={skin} /></mesh>
          <mesh position={[-0.08, 0.02, 0.21]}><sphereGeometry args={[0.028, 8, 6]} /><meshBasicMaterial color="#111" /></mesh>
          <mesh position={[0.08, 0.02, 0.21]}><sphereGeometry args={[0.028, 8, 6]} /><meshBasicMaterial color="#111" /></mesh>
          <Hair style={ap.hairStyle} colour={ap.hair} />
          {hardHat && (
            <mesh position={[0, 0.16, 0]}><sphereGeometry args={[0.27, 16, 8, 0, Math.PI * 2, 0, Math.PI / 2]} /><meshStandardMaterial color="#FFC300" /></mesh>
          )}
        </group>
      </group>
      <group ref={aura} visible={false}>
        {Array.from({ length: 18 }, (_, i) => {
          const ang = (i / 18) * Math.PI * 2;
          return (
            <mesh key={i} position={[Math.cos(ang) * 0.55, 0.2 + (i % 6) * 0.25, Math.sin(ang) * 0.55]}>
              <sphereGeometry args={[0.05, 6, 6]} />
              <meshBasicMaterial color={auraHex} transparent opacity={0.85} />
            </mesh>
          );
        })}
        <mesh position-y={0.8}><cylinderGeometry args={[0.6, 0.45, 1.8, 20, 1, true]} /><meshBasicMaterial color={auraHex} transparent opacity={0.18} side={THREE.DoubleSide} depthWrite={false} /></mesh>
      </group>
      <pointLight ref={auraLight} position={[0, 1, 0]} color={auraHex} intensity={0} distance={5} />
      <Html position={[0, 1.95 * h, 0]} center zIndexRange={[20, 0]} style={{ pointerEvents: 'none' }}>
        <div ref={bubbleEl} className="bubble" style={{ display: 'none' }} />
      </Html>
    </group>
  );
}

function Hair({ style, colour }: { style: string; colour: string }) {
  switch (style) {
    case 'bald': return null;
    case 'buzz': return <mesh position={[0, 0.04, -0.01]}><sphereGeometry args={[0.245, 16, 8, 0, Math.PI * 2, 0, Math.PI / 2.6]} /><meshStandardMaterial color={colour} /></mesh>;
    case 'bun': return (<group>
      <mesh position={[0, 0.03, -0.02]}><sphereGeometry args={[0.255, 16, 8, 0, Math.PI * 2, 0, Math.PI / 2]} /><meshStandardMaterial color={colour} /></mesh>
      <mesh position={[0, 0.27, -0.06]}><sphereGeometry args={[0.1, 10, 8]} /><meshStandardMaterial color={colour} /></mesh></group>);
    case 'ponytail': return (<group>
      <mesh position={[0, 0.03, -0.02]}><sphereGeometry args={[0.255, 16, 8, 0, Math.PI * 2, 0, Math.PI / 2]} /><meshStandardMaterial color={colour} /></mesh>
      <mesh position={[0, -0.05, -0.27]} rotation-x={0.4}><capsuleGeometry args={[0.06, 0.2, 4, 8]} /><meshStandardMaterial color={colour} /></mesh></group>);
    case 'curly': return <mesh position={[0, 0.08, -0.02]}><sphereGeometry args={[0.28, 12, 10, 0, Math.PI * 2, 0, Math.PI / 1.8]} /><meshStandardMaterial color={colour} roughness={1} /></mesh>;
    default: return <mesh position={[0, 0.03, -0.02]}><sphereGeometry args={[0.255, 16, 8, 0, Math.PI * 2, 0, Math.PI / 2.2]} /><meshStandardMaterial color={colour} /></mesh>;
  }
}
