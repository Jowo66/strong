// The R3F scene: camera, lights, room, stations, members, construction crew and the sim driver.
import { useEffect, useState } from 'react';
import { Canvas, useFrame, useThree } from '@react-three/fiber';
import { OrbitControls } from '@react-three/drei';
import { EffectComposer, N8AO, TiltShift2 } from '@react-three/postprocessing';
import { EngineContext, useEngine } from '../engineContext';
import type { SimEngine } from '../sim/engine';
import { Room } from './Room';
import { StationMesh } from './Stations';
import { Avatar, type AvatarSource } from './Avatar';
import { lookForCrew, lookForNpc } from './character/look';
import { useSettings } from '../store/settings';
import { Kit, kitMaterial } from './kit';
import { labelTexture } from './labels';

const CREW_LOOKS = [0, 1, 2].map(lookForCrew);

/** Per-frame view of an agent for its Avatar. Reuses one object to avoid garbage every frame. */
function memberSource(eng: SimEngine, id: string): () => AvatarSource | undefined {
  const out: AvatarSource = { pos: { x: 0, z: 0 }, facing: 0, anim: 'idle', bubble: null };
  return () => {
    const a = eng.agents.get(id);
    if (!a) return undefined;
    out.pos = a.pos; out.facing = a.facing; out.anim = a.anim; out.bubble = a.bubble; out.outfit = a.outfit; out.aura = a.aura;
    const item = a.routine[a.index];
    const lifting = a.state === 'lifting' || (a.state === 'interacting' && a.paused?.state === 'lifting');
    out.exercise = item && (lifting || a.anim === 'lift' || a.anim === 'cardio' || a.anim === 'stretch') ? item.exerciseId : undefined;
    out.resting = a.state === 'resting';
    const st = a.stationId ? eng.stations.find((s) => s.id === a.stationId) : undefined;
    out.stationType = st?.type;
    out.weight = out.exercise ? Math.round((eng.save.members[id]?.weights[out.exercise] ?? 0) / 5) * 5 : undefined;
    return out;
  };
}

/** ?debug: expose the renderer for console poking and automated screenshots (draw calls, camera). */
export function DebugHook() {
  const three = useThree();
  useEffect(() => {
    if (import.meta.env.DEV || new URLSearchParams(location.search).has('debug')) (window as unknown as { __r3f: typeof three }).__r3f = three;
  }, [three]);
  return null;
}

function SimDriver() {
  const eng = useEngine();
  const speed = useSettings((s) => s.speed);
  useFrame((_, dt) => { if (speed > 0) eng.update(Math.min(dt, 0.25) * speed); });
  return null;
}

/** Re-render children whenever the engine's agent/station/crew set changes. */
function useEngineVersion(): number {
  const eng = useEngine();
  const [v, setV] = useState(eng.version);
  useFrame(() => { if (eng.version !== v) setV(eng.version); });
  return v;
}

function Members() {
  const eng = useEngine();
  useEngineVersion();
  return (
    <>
      {[...eng.agents.keys()].map((id) => {
        const npc = eng.save.members[id];
        if (!npc) return null;
        return <Avatar key={id} id={id} look={lookForNpc(npc)} isPlayer={npc.isPlayer} source={memberSource(eng, id)} />;
      })}
    </>
  );
}

function Equipment() {
  const eng = useEngine();
  useEngineVersion();
  return <>{eng.stations.map((s, i) => <StationMesh key={s.id} id={s.id} type={s.type} temporary={s.temporary} variant={i} />)}</>;
}

function Crew() {
  const eng = useEngine();
  useEngineVersion();
  const find = (id: string): AvatarSource | undefined => {
    for (const j of eng.jobs) for (const m of j.crew) if (m.id === id) return { pos: m.pos, facing: m.facing, anim: m.anim, bubble: m.bubble, outfit: 'gym' };
    return undefined;
  };
  return (
    <>
      {eng.jobs.flatMap((j) => j.crew).map((m) => (
        <Avatar key={m.id} id={m.id} look={CREW_LOOKS[m.slot % 3]} hoverable={false} source={() => find(m.id)} />
      ))}
    </>
  );
}

/** Pull the camera back on tall/narrow screens so the whole diorama fits. */
function ResponsiveCamera() {
  const { camera, size } = useThree();
  useEffect(() => {
    const aspect = size.width / size.height;
    const k = aspect >= 1.4 ? 1 : Math.min(2.4, 1.4 / aspect);
    camera.position.set(18 * k, 26 * k, 33 * k);
    camera.lookAt(0, 0, -0.5);
  }, [camera, size.width, size.height]);
  return null;
}

const podiumGeo = (() => {
  const k = new Kit();
  k.rbox(3.4, 0.04, 1.6, 0.02, '#C1121F', 0, 0.02, 0.1);                 // red carpet
  k.rbox(0.95, 0.7, 0.95, 0.05, '#FFD166', 0, 0.35, 0);                   // 1st
  k.rbox(0.95, 0.48, 0.95, 0.05, '#CED4DA', -1.0, 0.24, 0.05);            // 2nd
  k.rbox(0.95, 0.32, 0.95, 0.05, '#D4A373', 1.0, 0.16, 0.08);             // 3rd
  for (const x of [-1.75, 1.75]) { k.cyl(0.12, 0.4, '#3D405B', x, 0.2, -0.3, 0, 0, 0, 10); k.cyl(0.09, 0.35, '#E63946', x, 0.5, -0.2, -0.5, 0, 0, 10); } // confetti cannons
  return k.build();
})();

function Podium() {
  const eng = useEngine();
  const [show, setShow] = useState(false);
  useFrame(() => { const s = !!eng.ceremony; if (s !== show) setShow(s); });
  if (!show) return null;
  const p = eng.c.layout.podium;
  return (
    <group position={[p.x, 0, p.z]} rotation-y={Math.PI / 2}>
      <mesh geometry={podiumGeo} material={kitMaterial} castShadow receiveShadow />
      {([[0, 0.45, '1'], [-1.0, 0.3, '2'], [1.0, 0.2, '3']] as const).map(([x, y, n]) => (
        <mesh key={n} position={[x, y, 0.53 + (n === '1' ? 0 : n === '2' ? 0.05 : 0.08)]}><planeGeometry args={[0.8, 0.2]} /><meshBasicMaterial map={labelTexture(n, '#3B2A06')} transparent /></mesh>
      ))}
    </group>
  );
}

export function GymScene({ engine }: { engine: SimEngine }) {
  const tiltShift = useSettings((s) => s.tiltShift);
  const highContrast = useSettings((s) => s.highContrast);
  const detail = useSettings((s) => s.detail);
  const high = detail === 'high';
  const [dpr, setDpr] = useState(1.5);
  useEffect(() => { setDpr(high ? Math.min(2, window.devicePixelRatio || 1) : 1); }, [high]);
  const shadowSize = high ? 2048 : 1024;
  return (
    <Canvas shadows dpr={dpr} camera={{ position: [18, 26, 33], fov: 30, near: 1, far: 200 }} gl={{ antialias: true }}>
      <EngineContext.Provider value={engine}>
        <color attach="background" args={[highContrast ? '#FFFFFF' : '#F6EFE4']} />
        <fog attach="fog" args={[highContrast ? '#FFFFFF' : '#F6EFE4', 70, 160]} />
        {/* warm key light with soft shadows, cool fill from the left, warm bounce from the floor */}
        <hemisphereLight args={['#FFF4E0', '#C9B08F', 0.85]} />
        <directionalLight key={shadowSize} position={[14, 24, 16]} intensity={1.9} color="#FFF1DC" castShadow
          shadow-mapSize={[shadowSize, shadowSize]} shadow-bias={-0.0004} shadow-normalBias={0.025} shadow-radius={4}
          shadow-camera-left={-22} shadow-camera-right={22} shadow-camera-top={18} shadow-camera-bottom={-18} />
        <directionalLight position={[-20, 12, 6]} intensity={0.35} color="#CFE3FF" />
        <SimDriver />
        <DebugHook />
        <ResponsiveCamera />
        <Room highContrast={highContrast} />
        <Equipment />
        <Members />
        <Crew />
        <Podium />
        <OrbitControls makeDefault target={[0, 0, -0.5]} enablePan={false} minDistance={14} maxDistance={120}
          minPolarAngle={0.55} maxPolarAngle={1.1} minAzimuthAngle={-0.6} maxAzimuthAngle={0.9} enableDamping />
        {(tiltShift || high) && (
          <EffectComposer multisampling={high ? 4 : 0}>
            {high ? <N8AO halfRes aoRadius={0.8} intensity={2.2} distanceFalloff={0.6} color="#3B2A1A" /> : <></>}
            {tiltShift ? <TiltShift2 blur={0.1} taper={0.55} start={[0.5, 0.0]} end={[0.5, 1.0]} /> : <></>}
          </EffectComposer>
        )}
      </EngineContext.Provider>
    </Canvas>
  );
}
