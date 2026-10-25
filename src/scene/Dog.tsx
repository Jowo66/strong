// The gym dog: a Quaternius Shiba Inu (Ultimate Animated Animals, CC0; scripts/build-dog.py). It naps in its bed by
// reception, has the odd snack, and while the gym is open trots over to say hello to members or sniffs around.
// Purely decoration: it walks the sim's nav grid, but the sim doesn't know it's there. It loads after the gym has
// opened, so it never holds up startup; if it fails to load there's simply no dog.
import { useEffect, useMemo, useRef, useState } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import { GLTFLoader, type GLTF } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { useEngine } from '../engineContext';
import { useSettings } from '../store/settings';
import type { Vec2 } from '../sim/types';

const HEIGHT = 0.72;        // metres, ears included
const SPEED = 1.8;          // trot; members walk at 2.4
const WALK_RATE = 1.6;      // Walk clip playback to match SPEED without sliding
const BED_TOP = 0.22;    // the cushion in Room.tsx

type Clip = 'Idle' | 'Idle_2_HeadLow' | 'Walk' | 'Eating' | 'Death'; // Death, slowed and held on its last frame, is lying down
type Mode = 'sleep' | 'eat' | 'walk' | 'linger';

interface DogState {
  pos: Vec2; facing: number; mode: Mode; timer: number;
  path: Vec2[]; then: Mode; lookAt: Vec2 | null; clip: Clip;
}

let loading: Promise<GLTF | null> | null = null;
function loadDog(): Promise<GLTF | null> {
  loading ??= new GLTFLoader().loadAsync(`${import.meta.env.BASE_URL}props/dog.glb`)
    .catch((e) => { console.warn('Mini Gym: gym dog unavailable.', e); return null; });
  return loading;
}

export function Dog() {
  const [gltf, setGltf] = useState<GLTF | null>(null);
  useEffect(() => { let live = true; void loadDog().then((g) => { if (live) setGltf(g); }); return () => { live = false; }; }, []);
  return gltf ? <DogModel gltf={gltf} /> : null;
}

function DogModel({ gltf }: { gltf: GLTF }) {
  const eng = useEngine();
  const L = eng.c.layout;
  const root = useRef<THREE.Group>(null!);
  const { scale, mixer, actions } = useMemo(() => {
    gltf.scene.traverse((o) => { if ((o as THREE.Mesh).isMesh) { o.castShadow = true; o.frustumCulled = false; } });
    const box = new THREE.Box3().setFromObject(gltf.scene);
    const mixer = new THREE.AnimationMixer(gltf.scene);
    const actions = Object.fromEntries(gltf.animations.map((c) => [c.name, mixer.clipAction(c)])) as Record<Clip, THREE.AnimationAction>;
    if (actions.Death) { actions.Death.setLoop(THREE.LoopOnce, 1); actions.Death.clampWhenFinished = true; }
    return { scale: HEIGHT / Math.max(0.01, box.max.y - box.min.y), mixer, actions };
  }, [gltf]);
  const s = useRef<DogState>({ pos: { ...L.dog.bed }, facing: 2.1, mode: 'sleep', timer: 8, path: [], then: 'linger', lookAt: null, clip: 'Idle' });

  const play = (clip: Clip) => {
    const st = s.current;
    const next = actions[clip];
    next.timeScale = clip === 'Walk' ? WALK_RATE : clip === 'Death' ? 0.45 : 1;
    if (st.clip === clip && (next.isRunning() || clip === 'Death')) return;
    next.reset().play();
    if (actions[st.clip] && st.clip !== clip) actions[st.clip].crossFadeTo(next, 0.3, false);
    st.clip = clip;
  };
  useEffect(() => { start('sleep'); return () => { mixer.stopAllAction(); }; }, [actions, mixer]); // eslint-disable-line react-hooks/exhaustive-deps

  /** Walk to `to` (or as near as the nav grid allows), then switch to `then`. */
  const walkTo = (to: Vec2, then: Mode, lookAt: Vec2 | null = null, exact = false) => {
    const st = s.current, nav = eng.nav;
    const start = nav.isFree(st.pos) ? st.pos : nav.nearestFree(st.pos);
    const goal = nav.nearestFree(to);
    const path = nav.findPath(start, goal) ?? [goal];
    if (exact) path.push({ ...to }); // the last step onto the bed, which members treat as an obstacle
    st.path = path; st.mode = 'walk'; st.then = then; st.lookAt = lookAt;
  };

  /** Pick what to do next once the current thing is finished. */
  const decide = () => {
    const st = s.current;
    const members = [...eng.agents.values()].filter((a) => a.pos.z < L.bounds.z1);
    const r = Math.random();
    if (!members.length || r < 0.2) { walkTo(L.dog.bed, 'sleep', null, true); return; }
    if (r < 0.32) { walkTo({ x: L.dog.bowl.x + 0.13, z: L.dog.bowl.z + 0.42 }, 'eat', { x: L.dog.bowl.x + 0.13, z: L.dog.bowl.z }); return; }
    if (r < 0.75) {
      // say hello: stop a little short of a member, facing them
      const m = members[Math.floor(Math.random() * members.length)].pos;
      const dx = st.pos.x - m.x, dz = st.pos.z - m.z, d = Math.hypot(dx, dz) || 1;
      walkTo({ x: m.x + (dx / d) * 0.7, z: m.z + (dz / d) * 0.7 }, 'linger', { ...m });
      return;
    }
    const w = L.wanderPoints[Math.floor(Math.random() * L.wanderPoints.length)];
    walkTo({ x: w.x + Math.random() - 0.5, z: w.z + Math.random() - 0.5 }, 'linger');
  };

  const start = (mode: Mode) => {
    const st = s.current;
    st.mode = mode;
    st.timer = mode === 'sleep' ? 25 + Math.random() * 35 : mode === 'eat' ? 5 + Math.random() * 4 : 3 + Math.random() * 5;
    if (mode === 'sleep') st.lookAt = { x: st.pos.x + Math.sin(2.1), z: st.pos.z + Math.cos(2.1) }; // lie facing into the room
    play(mode === 'eat' ? 'Eating' : mode === 'sleep' ? (actions.Death ? 'Death' : 'Idle_2_HeadLow') : Math.random() < 0.4 ? 'Idle_2_HeadLow' : 'Idle');
  };

  useFrame((_, frameDt) => {
    const speed = useSettings.getState().speed;
    const dt = Math.min(frameDt, 0.25) * speed;
    if (dt <= 0) return;
    const st = s.current;
    if (st.mode === 'walk') {
      play('Walk');
      let budget = SPEED * dt;
      while (budget > 0 && st.path.length) {
        const t = st.path[0];
        const dx = t.x - st.pos.x, dz = t.z - st.pos.z, d = Math.hypot(dx, dz);
        if (d > 1e-3) st.facing = turn(st.facing, Math.atan2(dx, dz), dt * 8);
        if (d <= budget) { st.pos.x = t.x; st.pos.z = t.z; st.path.shift(); budget -= d; }
        else { st.pos.x += (dx / d) * budget; st.pos.z += (dz / d) * budget; budget = 0; }
      }
      if (!st.path.length) start(st.then);
    } else {
      if (st.lookAt) st.facing = turn(st.facing, Math.atan2(st.lookAt.x - st.pos.x, st.lookAt.z - st.pos.z), dt * 5);
      st.timer -= dt;
      // the gym's closed: head home and stay there
      if (st.mode === 'sleep' && !eng.agents.size) st.timer = Math.max(st.timer, 1);
      if (st.timer <= 0) decide();
    }
    mixer.update(dt);
    const g = root.current;
    // up on the cushion when it's in its bed
    const inBed = Math.hypot(st.pos.x - L.dog.bed.x, st.pos.z - L.dog.bed.z);
    g.position.set(st.pos.x, inBed < 0.5 ? BED_TOP * Math.min(1, (0.5 - inBed) / 0.2) : 0, st.pos.z);
    g.rotation.y = st.facing;
  });

  return (
    <group ref={root} name="gymDog">
      <primitive object={gltf.scene} scale={scale} />
    </group>
  );
}

/** Turn `from` towards `to` (radians) by at most `step`, the short way round. */
function turn(from: number, to: number, step: number): number {
  let d = to - from;
  while (d > Math.PI) d -= Math.PI * 2;
  while (d < -Math.PI) d += Math.PI * 2;
  return from + Math.max(-step, Math.min(step, d));
}
