// The R3F scene: camera, lights, room, stations, members, construction crew and the sim driver.
import { useEffect, useState } from 'react';
import { Canvas, useFrame, useThree } from '@react-three/fiber';
import { OrbitControls } from '@react-three/drei';
import { EffectComposer, TiltShift2 } from '@react-three/postprocessing';
import { EngineContext, useEngine } from '../engineContext';
import type { SimEngine } from '../sim/engine';
import { Room } from './Room';
import { StationMesh } from './Stations';
import { Avatar } from './Avatar';
import { useSettings } from '../store/settings';

const CREW_LOOK = { skin: '#C68642', hair: '#3B2416', hairStyle: 'short', shirt: '#FB8500', shorts: '#3D405B', street: '#FB8500', height: 1, build: 1.15 };

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
        return <Avatar key={id} id={id} appearance={npc.appearance} isPlayer={npc.isPlayer} source={() => eng.agents.get(id)} />;
      })}
    </>
  );
}

function Equipment() {
  const eng = useEngine();
  useEngineVersion();
  return <>{eng.stations.map((s) => <StationMesh key={s.id} id={s.id} type={s.type} temporary={s.temporary} />)}</>;
}

function Crew() {
  const eng = useEngine();
  useEngineVersion();
  const find = (id: string) => {
    for (const j of eng.jobs) for (const m of j.crew) if (m.id === id) return { pos: m.pos, facing: 0, anim: m.anim, bubble: m.bubble };
    return undefined;
  };
  return (
    <>
      {eng.jobs.flatMap((j) => j.crew).map((m) => (
        <Avatar key={m.id} id={m.id} appearance={CREW_LOOK} hardHat hoverable={false} source={() => find(m.id)} />
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

function Podium() {
  const eng = useEngine();
  const [show, setShow] = useState(false);
  useFrame(() => { const s = !!eng.ceremony; if (s !== show) setShow(s); });
  if (!show) return null;
  const p = eng.c.layout.podium;
  return (
    <group position={[p.x, 0, p.z]}>
      <mesh position={[0, 0.3, 0]} castShadow><boxGeometry args={[0.9, 0.6, 0.9]} /><meshStandardMaterial color="#FFD166" /></mesh>
      <mesh position={[-0.9, 0.2, 0]} castShadow><boxGeometry args={[0.9, 0.4, 0.9]} /><meshStandardMaterial color="#CED4DA" /></mesh>
      <mesh position={[0.9, 0.12, 0]} castShadow><boxGeometry args={[0.9, 0.24, 0.9]} /><meshStandardMaterial color="#D4A373" /></mesh>
    </group>
  );
}

export function GymScene({ engine }: { engine: SimEngine }) {
  const tiltShift = useSettings((s) => s.tiltShift);
  const highContrast = useSettings((s) => s.highContrast);
  const [dpr, setDpr] = useState(1.5);
  useEffect(() => { setDpr(Math.min(2, window.devicePixelRatio || 1)); }, []);
  return (
    <Canvas shadows dpr={dpr} camera={{ position: [18, 26, 33], fov: 30, near: 1, far: 200 }} gl={{ antialias: true }}>
      <EngineContext.Provider value={engine}>
        <color attach="background" args={[highContrast ? '#FFFFFF' : '#F6EFE4']} />
        <hemisphereLight args={['#FFF7E8', '#B9A58C', 0.9]} />
        <directionalLight position={[12, 22, 14]} intensity={1.6} castShadow
          shadow-mapSize={[2048, 2048]} shadow-camera-left={-22} shadow-camera-right={22} shadow-camera-top={18} shadow-camera-bottom={-18} />
        <SimDriver />
        <ResponsiveCamera />
        <Room highContrast={highContrast} />
        <Equipment />
        <Members />
        <Crew />
        <Podium />
        <OrbitControls target={[0, 0, -0.5]} enablePan={false} minDistance={22} maxDistance={120}
          minPolarAngle={0.55} maxPolarAngle={1.05} minAzimuthAngle={-0.6} maxAzimuthAngle={0.9} enableDamping />
        {tiltShift && (
          <EffectComposer>
            <TiltShift2 blur={0.12} taper={0.6} />
          </EffectComposer>
        )}
      </EngineContext.Provider>
    </Canvas>
  );
}
