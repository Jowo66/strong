// Debug view (?lineup): a close-up line-up of generated members in every pose. Used to check character art.
import { useMemo } from 'react';
import { Canvas } from '@react-three/fiber';
import { OrbitControls } from '@react-three/drei';
import { EngineContext } from '../engineContext';
import type { SimEngine } from '../sim/engine';
import { createNpc } from '../sim/npc';
import { Rng } from '../sim/rng';
import type { Anim } from '../sim/types';
import { Avatar, type AvatarSource } from './Avatar';
import { lookForCrew, lookForNpc } from './character/look';
import { DebugHook } from './GymScene';

const POSES: { anim: Anim; exercise?: string; resting?: boolean; stationType?: string; weight?: number; outfit?: 'street' }[] = [
  { anim: 'idle' }, { anim: 'walk' }, { anim: 'idle', outfit: 'street' }, { anim: 'talk' }, { anim: 'flex' }, { anim: 'celebrate' },
  { anim: 'clap' }, { anim: 'search' }, { anim: 'lift', exercise: 'bench_press', weight: 225 }, { anim: 'lift', exercise: 'back_squat', weight: 275 },
  { anim: 'lift', exercise: 'deadlift', weight: 315 }, { anim: 'lift', exercise: 'db_curl', weight: 30 }, { anim: 'lift', exercise: 'overhead_press', weight: 115 },
  { anim: 'lift', exercise: 'lateral_raise', weight: 15 }, { anim: 'lift', exercise: 'pull_up' }, { anim: 'lift', exercise: 'lat_pulldown' },
  { anim: 'cardio', exercise: 'treadmill_run' }, { anim: 'cardio', exercise: 'bike_intervals' }, { anim: 'cardio', exercise: 'rowing' },
  { anim: 'stretch', exercise: 'plank' }, { anim: 'stretch', exercise: 'push_up' }, { anim: 'stretch', exercise: 'stretch' },
  { anim: 'spot' }, { anim: 'powerUp' },
];

export function Lineup({ engine }: { engine: SimEngine }) {
  const members = useMemo(() => {
    const rng = new Rng(7);
    const taken = new Set<string>();
    return POSES.map((p, i) => ({ npc: createNpc(engine.c, rng, { id: `lineup${i}`, day: 0, taken }), p }));
  }, [engine]);
  const cols = 8;
  return (
    <Canvas shadows camera={{ position: [0, 9, 16], fov: 35 }} style={{ position: 'fixed', inset: 0 }}>
      <EngineContext.Provider value={engine}>
        <color attach="background" args={['#F6EFE4']} />
        <hemisphereLight args={['#FFF7E8', '#B9A58C', 1.0]} />
        <directionalLight position={[6, 12, 8]} intensity={1.8} castShadow shadow-mapSize={[2048, 2048]}
          shadow-camera-left={-14} shadow-camera-right={14} shadow-camera-top={10} shadow-camera-bottom={-10} />
        <mesh rotation-x={-Math.PI / 2} receiveShadow><planeGeometry args={[40, 30]} /><meshStandardMaterial color="#E9E3D7" /></mesh>
        {members.map(({ npc, p }, i) => {
          const x = ((i % cols) - (cols - 1) / 2) * 2.2, z = (Math.floor(i / cols) - 1) * 2.6;
          const src: AvatarSource = { pos: { x, z }, facing: 0.35, anim: p.anim, bubble: null, outfit: p.outfit ?? 'gym', exercise: p.exercise, resting: p.resting, stationType: p.stationType, weight: p.weight, aura: p.anim === 'powerUp' ? 99 : 0 };
          return <Avatar key={npc.id} id={npc.id} look={lookForNpc(npc)} source={() => src} hoverable={false} />;
        })}
        {[0, 1, 2].map((slot) => {
          const src: AvatarSource = { pos: { x: 10 + slot * 1.6, z: -3 }, facing: 0.3, anim: slot === 1 ? 'build' : 'idle', bubble: null, outfit: 'gym' };
          return <Avatar key={`crew${slot}`} id={`crew${slot}`} look={lookForCrew(slot)} source={() => src} hoverable={false} />;
        })}
        <OrbitControls makeDefault target={[0, 0.8, 0]} />
        <DebugHook />
      </EngineContext.Provider>
    </Canvas>
  );
}
