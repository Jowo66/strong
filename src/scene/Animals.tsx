// The gym's animals, Quaternius models (CC0) converted by scripts/build-animals.py:
//  - two dogs (a Shiba Inu by reception, a Husky in the stretching corner) that nap in their beds, have the odd snack,
//    and while the gym is open trot over to say hello to members, each other, or sniff around;
//  - a pug that lives on the couch and now and then jumps up and down;
//  - an aquarium of four fish on the reception sideboard.
// Purely decoration: the dogs walk the sim's nav grid, but the sim doesn't know they're there. They load after the gym
// has opened, so they never hold up startup; any that fail to load are simply missing.
import { useEffect, useMemo, useRef, useState } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import { GLTFLoader, type GLTF } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { useEngine } from '../engineContext';
import { useSettings } from '../store/settings';
import type { Vec2 } from '../sim/types';
import { Kit, kitMaterial } from './kit';
import { propsData } from './props';
import { SIDEBOARD } from './Room';

const DOG_HEIGHT = 0.72;    // metres, ears included
const PUG_HEIGHT = 0.36;
const FISH_LENGTH = 0.09;
const SPEED = 1.8;          // trot; members walk at 2.4
const WALK_RATE = 1.6;      // Walk clip playback to match SPEED without sliding
const BED_TOP = 0.22;       // the cushion in Room.tsx
const FISH = ['goldfish', 'clownfish', 'bluetang', 'betta'];

const loading = new Map<string, Promise<GLTF | null>>();
function loadAnimal(name: string): Promise<GLTF | null> {
  let p = loading.get(name);
  if (!p) {
    p = new GLTFLoader().loadAsync(`${import.meta.env.BASE_URL}animals/${name}.glb`)
      .catch((e) => { console.warn(`Mini Gym: ${name} unavailable.`, e); return null; });
    loading.set(name, p);
  }
  return p;
}

function useAnimal(name: string): GLTF | null {
  const [gltf, setGltf] = useState<GLTF | null>(null);
  useEffect(() => { let live = true; void loadAnimal(name).then((g) => { if (live) setGltf(g); }); return () => { live = false; }; }, [name]);
  return gltf;
}

/** Scale to a height, cast shadows, and an animation mixer with an action per clip. */
function useRig(gltf: GLTF, height: number, axis: 'y' | 'z' = 'y') {
  return useMemo(() => {
    gltf.scene.traverse((o) => { if ((o as THREE.Mesh).isMesh) { o.castShadow = true; o.frustumCulled = false; } });
    // measure the posed (skinned) mesh: the FBX-sourced rigs carry their scale on the armature, not the mesh
    gltf.scene.updateMatrixWorld(true);
    gltf.scene.traverse((o) => { if ((o as THREE.SkinnedMesh).isSkinnedMesh) (o as THREE.SkinnedMesh).skeleton.update(); });
    const box = new THREE.Box3().setFromObject(gltf.scene, true);
    const mixer = new THREE.AnimationMixer(gltf.scene);
    const actions: Record<string, THREE.AnimationAction> = Object.fromEntries(gltf.animations.map((c) => [c.name, mixer.clipAction(c)]));
    const extent = axis === 'y' ? box.max.y - box.min.y : box.max.z - box.min.z;
    return { scale: height / Math.max(0.01, extent), mixer, actions };
  }, [gltf, height, axis]);
}

/** Game seconds this frame: 0 while paused, faster at 2x / 4x. */
const gameDt = (frameDt: number) => Math.min(frameDt, 0.25) * useSettings.getState().speed;

export function Animals() {
  const L = useEngine().c.layout;
  return (
    <>
      {L.pets.dogs.map((d) => <Dog key={d.name} home={d} />)}
      <Pug />
      <Aquarium />
    </>
  );
}

// ---------------------------------------------------------------------------------------------------------- dogs

type DogClip = 'Idle' | 'Idle_2_HeadLow' | 'Walk' | 'Eating' | 'Death'; // Death, slowed and held on its last frame, is lying down
type Mode = 'sleep' | 'eat' | 'walk' | 'linger';
interface DogHome { name: string; bed: Vec2; bowl: Vec2; sleepFacing: number }

interface DogState {
  pos: Vec2; facing: number; mode: Mode; timer: number;
  path: Vec2[]; then: Mode; lookAt: Vec2 | null; clip: DogClip;
}

/** Where each dog is, so they can go and say hello to each other. */
const dogSpots = new Map<string, Vec2>();

function Dog({ home }: { home: DogHome }) {
  const gltf = useAnimal(home.name);
  return gltf ? <DogModel gltf={gltf} home={home} /> : null;
}

function DogModel({ gltf, home }: { gltf: GLTF; home: DogHome }) {
  const eng = useEngine();
  const L = eng.c.layout;
  const root = useRef<THREE.Group>(null!);
  const { scale, mixer, actions } = useRig(gltf, DOG_HEIGHT);
  const s = useRef<DogState>({ pos: { ...home.bed }, facing: home.sleepFacing, mode: 'sleep', timer: 8, path: [], then: 'linger', lookAt: null, clip: 'Idle' });

  const play = (clip: DogClip) => {
    const st = s.current;
    const next = actions[clip];
    if (!next) return;
    next.timeScale = clip === 'Walk' ? WALK_RATE : clip === 'Death' ? 0.45 : 1;
    if (st.clip === clip && (next.isRunning() || clip === 'Death')) return;
    next.reset().play();
    if (actions[st.clip] && st.clip !== clip) actions[st.clip].crossFadeTo(next, 0.3, false);
    st.clip = clip;
  };

  /** Walk to `to` (or as near as the nav grid allows), then switch to `then`. */
  const walkTo = (to: Vec2, then: Mode, lookAt: Vec2 | null = null, exact = false) => {
    const st = s.current, nav = eng.nav;
    const from = nav.isFree(st.pos) ? st.pos : nav.nearestFree(st.pos);
    const goal = nav.nearestFree(to);
    const path = nav.findPath(from, goal) ?? [goal];
    if (exact) path.push({ ...to }); // the last step onto the bed, which members treat as an obstacle
    st.path = path; st.mode = 'walk'; st.then = then; st.lookAt = lookAt;
  };

  /** Walk up to `who`, stopping a little short and facing them. */
  const visit = (who: Vec2) => {
    const st = s.current;
    const dx = st.pos.x - who.x, dz = st.pos.z - who.z, d = Math.hypot(dx, dz) || 1;
    walkTo({ x: who.x + (dx / d) * 0.7, z: who.z + (dz / d) * 0.7 }, 'linger', { ...who });
  };

  /** Pick what to do next once the current thing is finished. */
  const decide = () => {
    const members = [...eng.agents.values()].filter((a) => a.pos.z < L.bounds.z1);
    const r = Math.random();
    if (!members.length || r < 0.2) { walkTo(home.bed, 'sleep', null, true); return; }
    if (r < 0.32) { walkTo({ x: home.bowl.x + 0.13, z: home.bowl.z + 0.42 }, 'eat', { x: home.bowl.x + 0.13, z: home.bowl.z }); return; }
    const other = [...dogSpots].find(([n]) => n !== home.name)?.[1];
    if (other && r < 0.4) { visit(other); return; }
    if (r < 0.78) { visit(members[Math.floor(Math.random() * members.length)].pos); return; }
    const w = L.wanderPoints[Math.floor(Math.random() * L.wanderPoints.length)];
    walkTo({ x: w.x + Math.random() - 0.5, z: w.z + Math.random() - 0.5 }, 'linger');
  };

  const start = (mode: Mode) => {
    const st = s.current;
    st.mode = mode;
    st.timer = mode === 'sleep' ? 25 + Math.random() * 35 : mode === 'eat' ? 5 + Math.random() * 4 : 3 + Math.random() * 5;
    if (mode === 'sleep') st.lookAt = { x: st.pos.x + Math.sin(home.sleepFacing), z: st.pos.z + Math.cos(home.sleepFacing) }; // lie facing into the room
    play(mode === 'eat' ? 'Eating' : mode === 'sleep' ? (actions.Death ? 'Death' : 'Idle_2_HeadLow') : Math.random() < 0.4 ? 'Idle_2_HeadLow' : 'Idle');
  };

  useEffect(() => {
    start('sleep');
    dogSpots.set(home.name, s.current.pos);
    return () => { mixer.stopAllAction(); dogSpots.delete(home.name); };
  }, [actions, mixer]); // eslint-disable-line react-hooks/exhaustive-deps

  useFrame((_, frameDt) => {
    const dt = gameDt(frameDt);
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
    const inBed = Math.hypot(st.pos.x - home.bed.x, st.pos.z - home.bed.z);
    g.position.set(st.pos.x, inBed < 0.5 ? BED_TOP * Math.min(1, (0.5 - inBed) / 0.2) : 0, st.pos.z);
    g.rotation.y = st.facing;
  });

  return (
    <group ref={root} name={`pet-${home.name}`}>
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

// ----------------------------------------------------------------------------------------------------------- pug

function Pug() {
  const gltf = useAnimal('pug');
  return gltf ? <PugModel gltf={gltf} /> : null;
}

/** The couch pug: idles on the cushions and every so often bounces up and down (the pack has no walk for it). */
function PugModel({ gltf }: { gltf: GLTF }) {
  const P = useEngine().c.layout.pets.pug;
  const { scale, mixer, actions } = useRig(gltf, PUG_HEIGHT);
  const next = useRef(8);
  useEffect(() => {
    actions.Idle?.play();
    const jump = actions.Jump;
    if (jump) { jump.setLoop(THREE.LoopOnce, 1); jump.clampWhenFinished = false; }
    const back = () => { actions.Idle?.reset().play(); jump && actions.Idle?.crossFadeFrom(jump, 0.2, false); };
    mixer.addEventListener('finished', back);
    return () => { mixer.removeEventListener('finished', back); mixer.stopAllAction(); };
  }, [actions, mixer]);
  useFrame((_, frameDt) => {
    const dt = gameDt(frameDt);
    if (dt <= 0) return;
    next.current -= dt;
    if (next.current <= 0 && actions.Jump) {
      next.current = 12 + Math.random() * 25;
      actions.Jump.reset().play();
      actions.Idle && actions.Jump.crossFadeFrom(actions.Idle, 0.15, false);
    }
    mixer.update(dt);
  });
  return (
    <group position={[P.x, P.y, P.z]} rotation-y={P.facing} name="pet-pug">
      <primitive object={gltf.scene} scale={scale} />
    </group>
  );
}

// ------------------------------------------------------------------------------------------------------ aquarium

/** Glass tank on the reception sideboard: frame, gravel, weed and a rock, with four fish swimming figure-eights. */
function Aquarium() {
  const A = useEngine().c.layout.pets.aquarium;
  const side = propsData()?.sideboard;
  if (!side) return null; // nothing to stand it on
  const y = side.size[1] * (SIDEBOARD.width / side.size[0]);
  return (
    <group position={[A.x, y, A.z]}>
      <Tank w={A.w} h={A.h} d={A.d} />
      {FISH.map((f, i) => <Fish key={f} name={f} index={i} w={A.w} h={A.h} d={A.d} />)}
    </group>
  );
}

function Tank({ w, h, d }: { w: number; h: number; d: number }) {
  const frame = useMemo(() => {
    const k = new Kit();
    k.box(w + 0.04, 0.04, d + 0.04, '#2B2D42', 0, 0.02, 0);                       // base
    k.box(w + 0.04, 0.025, d + 0.04, '#2B2D42', 0, h + 0.0125, 0);                // rim
    for (const [x, z] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) k.box(0.02, h, 0.02, '#2B2D42', (x * w) / 2, h / 2, (z * d) / 2);
    k.box(w, 0.035, d, '#D9C3A0', 0, 0.057, 0);                                    // gravel
    k.box(w - 0.01, h - 0.05, 0.005, '#5FA8D3', 0, h / 2 + 0.02, -d / 2 + 0.005);   // painted back
    for (let i = 0; i < 6; i++) k.cyl(0.004, 0.12 + (i % 3) * 0.06, ['#2D6A4F', '#40916C', '#52B788'][i % 3], -w / 2 + 0.06 + i * 0.025, 0.12 + (i % 3) * 0.03, -d / 2 + 0.06 + (i % 2) * 0.03, 0, 0, (i % 2 ? 0.15 : -0.15), 5, 0.012);
    k.sphere(0.05, '#8D99AE', w / 2 - 0.1, 0.08, -0.03, 1.3, 0.7, 1, 8);
    return k.build();
  }, [w, h, d]);
  return (
    <>
      <mesh geometry={frame} material={kitMaterial} castShadow />
      <mesh position={[0, h / 2 + 0.04, 0]} renderOrder={1}>
        <boxGeometry args={[w - 0.005, h - 0.04, d - 0.005]} />
        <meshStandardMaterial color="#9ED8EC" transparent opacity={0.28} roughness={0.05} metalness={0.1} depthWrite={false} />
      </mesh>
    </>
  );
}

function Fish({ name, index, w, h, d }: { name: string; index: number; w: number; h: number; d: number }) {
  const gltf = useAnimal(name);
  return gltf ? <FishModel gltf={gltf} index={index} w={w} h={h} d={d} /> : null;
}

/** One fish swimming a figure-eight of its own size and pace, turned to face the way it's going. */
function FishModel({ gltf, index, w, h, d }: { gltf: GLTF; index: number; w: number; h: number; d: number }) {
  const root = useRef<THREE.Group>(null!);
  const { scale, mixer, actions } = useRig(gltf, FISH_LENGTH, 'z');
  const t = useRef(index * 2.3);
  const rate = 0.25 + index * 0.06, ax = w / 2 - 0.07 - index * 0.02, az = d / 2 - 0.06, base = 0.13 + index * 0.06;
  useEffect(() => { const a = Object.values(actions)[0]; if (a) { a.timeScale = 0.8 + index * 0.15; a.play(); } return () => { mixer.stopAllAction(); }; }, [actions, mixer, index]);
  useFrame((_, frameDt) => {
    const dt = gameDt(frameDt);
    if (dt <= 0) return;
    t.current += dt * rate;
    const p = t.current;
    const x = ax * Math.sin(p), z = az * Math.sin(2 * p), y = Math.min(h - 0.05, base + 0.02 * Math.sin(p * 3.1));
    const vx = ax * Math.cos(p), vz = 2 * az * Math.cos(2 * p);
    const g = root.current;
    g.position.set(x, y, z);
    g.rotation.y = Math.atan2(vx, vz);
    mixer.update(dt);
  });
  return (
    <group ref={root}>
      <primitive object={gltf.scene} scale={scale} />
    </group>
  );
}
