// Placeholder equipment models. Each reads its live Station every frame (rotation, build state, plates left on).
import { useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import { Html } from '@react-three/drei';
import * as THREE from 'three';
import { useEngine } from '../engineContext';
import type { Station, StationType } from '../sim/types';

const METAL = '#3D405B', PAD = '#22223B', PLATE = '#1B1B1B', WOOD = '#B08968';

export function StationMesh({ id, type, temporary }: { id: string; type: StationType; temporary: boolean }) {
  const eng = useEngine();
  const root = useRef<THREE.Group>(null!);
  const model = useRef<THREE.Group>(null!);
  const scaffold = useRef<THREE.Mesh>(null!);
  const plates = useRef<THREE.Group>(null!);
  const st = useRef<Station | undefined>(undefined);

  useFrame((_, dt) => {
    st.current = eng.stations.find((s) => s.id === id);
    const s = st.current;
    if (!s || !root.current) return;
    root.current.position.set(s.pos.x, 0, s.pos.z);
    root.current.rotation.y += (s.rot - root.current.rotation.y) * Math.min(1, dt * 6);
    model.current.visible = !s.building || Math.sin(performance.now() / 120) > -0.2;
    model.current.scale.setScalar(s.building ? 0.85 : 1);
    if (scaffold.current) scaffold.current.visible = s.building;
    if (plates.current) plates.current.visible = s.unracked > 0;
  });

  return (
    <group ref={root}>
      <group ref={model}>{shape(type)}</group>
      <group ref={plates} visible={false} position={[0, barHeight(type), 0]}>
        {[-0.62, 0.62].map((x) => (
          <mesh key={x} position={[x, 0, 0]} rotation-z={Math.PI / 2}><cylinderGeometry args={[0.24, 0.24, 0.08, 16]} /><meshStandardMaterial color="#D62828" /></mesh>
        ))}
      </group>
      {temporary && (
        <>
          <mesh ref={scaffold} position={[0, 0.7, 0]}>
            <boxGeometry args={[1.4, 1.4, 1.8]} />
            <meshBasicMaterial color="#FFB703" wireframe />
          </mesh>
          {/* hazard stripe base: marks temporary stations without relying on colour alone */}
          <mesh rotation-x={-Math.PI / 2} position-y={0.012}><ringGeometry args={[0.8, 0.95, 4, 1, Math.PI / 4]} /><meshBasicMaterial color="#FFB703" /></mesh>
          <Html position={[0, 1.6, 0]} center zIndexRange={[10, 0]} style={{ pointerEvents: 'none' }}>
            <div className="station-tag">{eng.stations.find((s) => s.id === id)?.label ?? ''}</div>
          </Html>
        </>
      )}
    </group>
  );
}

function barHeight(t: StationType): number {
  return t === 'squatRack' ? 1.35 : t === 'platform' ? 0.25 : t === 'bench' ? 0.85 : 0.6;
}

function Bar({ y, plates = true }: { y: number; plates?: boolean }) {
  return (
    <group position={[0, y, 0]}>
      <mesh rotation-z={Math.PI / 2}><cylinderGeometry args={[0.025, 0.025, 1.6, 8]} /><meshStandardMaterial color="#C0C0C0" metalness={0.8} roughness={0.3} /></mesh>
      {plates && [-0.55, 0.55].map((x) => (
        <mesh key={x} position={[x, 0, 0]} rotation-z={Math.PI / 2}><cylinderGeometry args={[0.2, 0.2, 0.06, 16]} /><meshStandardMaterial color={PLATE} /></mesh>
      ))}
    </group>
  );
}

function Post({ x, z, h }: { x: number; z: number; h: number }) {
  return <mesh position={[x, h / 2, z]} castShadow><boxGeometry args={[0.08, h, 0.08]} /><meshStandardMaterial color={METAL} /></mesh>;
}

function shape(type: StationType) {
  switch (type) {
    case 'bench':
      return (<>
        <mesh position={[0, 0.38, 0.1]} castShadow><boxGeometry args={[0.36, 0.12, 1.2]} /><meshStandardMaterial color={PAD} /></mesh>
        <mesh position={[0, 0.17, 0.1]}><boxGeometry args={[0.1, 0.32, 1.0]} /><meshStandardMaterial color={METAL} /></mesh>
        <Post x={-0.5} z={-0.45} h={1} /><Post x={0.5} z={-0.45} h={1} />
        <group position={[0, 0, -0.45]}><Bar y={0.85} /></group>
      </>);
    case 'squatRack':
      return (<>
        <Post x={-0.6} z={-0.4} h={2.1} /><Post x={0.6} z={-0.4} h={2.1} /><Post x={-0.6} z={0.4} h={2.1} /><Post x={0.6} z={0.4} h={2.1} />
        <mesh position={[0, 2.08, 0]}><boxGeometry args={[1.28, 0.08, 0.88]} /><meshStandardMaterial color={METAL} /></mesh>
        <mesh position={[0, 0.02, 0]} receiveShadow><boxGeometry args={[1.5, 0.04, 1.2]} /><meshStandardMaterial color="#2F2F2F" /></mesh>
        <Bar y={1.35} />
      </>);
    case 'platform':
      return (<>
        <mesh position={[0, 0.03, 0]} receiveShadow><boxGeometry args={[1.8, 0.06, 1.5]} /><meshStandardMaterial color={WOOD} /></mesh>
        <Bar y={0.25} />
      </>);
    case 'dumbbells':
      return (<>
        <mesh position={[0, 0.3, -0.55]} castShadow><boxGeometry args={[1.2, 0.6, 0.35]} /><meshStandardMaterial color={METAL} /></mesh>
        {[-0.4, -0.13, 0.13, 0.4].map((x) => (
          <mesh key={x} position={[x, 0.66, -0.55]} rotation-z={Math.PI / 2}><cylinderGeometry args={[0.07, 0.07, 0.24, 10]} /><meshStandardMaterial color={PLATE} /></mesh>
        ))}
        <mesh position={[0, 0.2, 0.2]} castShadow><boxGeometry args={[0.36, 0.1, 0.5]} /><meshStandardMaterial color={PAD} /></mesh>
      </>);
    case 'cable':
      return (<>
        <mesh position={[0, 1.1, -0.45]} castShadow><boxGeometry args={[0.9, 2.2, 0.25]} /><meshStandardMaterial color={METAL} /></mesh>
        <mesh position={[0, 0.6, -0.3]}><boxGeometry args={[0.4, 0.8, 0.08]} /><meshStandardMaterial color={PLATE} /></mesh>
        <mesh position={[0, 0.25, 0.15]} castShadow><boxGeometry args={[0.4, 0.1, 0.5]} /><meshStandardMaterial color={PAD} /></mesh>
      </>);
    case 'pullupBar':
      return (<>
        <Post x={-0.55} z={0} h={2.3} /><Post x={0.55} z={0} h={2.3} />
        <mesh position={[0, 2.25, 0]} rotation-z={Math.PI / 2}><cylinderGeometry args={[0.03, 0.03, 1.2, 8]} /><meshStandardMaterial color="#C0C0C0" /></mesh>
      </>);
    case 'treadmill':
      return (<>
        <mesh position={[0, 0.1, 0.1]} castShadow><boxGeometry args={[0.6, 0.18, 1.5]} /><meshStandardMaterial color="#2B2D42" /></mesh>
        <mesh position={[0, 0.2, 0.1]}><boxGeometry args={[0.46, 0.02, 1.3]} /><meshStandardMaterial color="#111" /></mesh>
        <mesh position={[0, 1.1, -0.6]}><boxGeometry args={[0.6, 0.3, 0.12]} /><meshStandardMaterial color="#8D99AE" /></mesh>
        <Post x={-0.27} z={-0.6} h={1.1} /><Post x={0.27} z={-0.6} h={1.1} />
      </>);
    case 'bike':
      return (<>
        <mesh position={[0, 0.06, 0]}><boxGeometry args={[0.35, 0.1, 1.0]} /><meshStandardMaterial color={METAL} /></mesh>
        <mesh position={[0, 0.5, 0.2]}><boxGeometry args={[0.08, 0.8, 0.08]} /><meshStandardMaterial color={METAL} /></mesh>
        <mesh position={[0, 0.92, 0.25]} castShadow><boxGeometry args={[0.24, 0.07, 0.3]} /><meshStandardMaterial color={PAD} /></mesh>
        <mesh position={[0, 0.9, -0.35]}><boxGeometry args={[0.45, 0.06, 0.1]} /><meshStandardMaterial color={METAL} /></mesh>
        <mesh position={[0, 0.4, -0.35]} rotation-z={Math.PI / 2}><cylinderGeometry args={[0.22, 0.22, 0.06, 16]} /><meshStandardMaterial color="#E63946" /></mesh>
      </>);
    case 'rower':
      return (<>
        <mesh position={[0, 0.15, 0]} castShadow><boxGeometry args={[0.25, 0.08, 1.9]} /><meshStandardMaterial color={METAL} /></mesh>
        <mesh position={[0, 0.3, -0.85]} rotation-z={Math.PI / 2}><cylinderGeometry args={[0.24, 0.24, 0.2, 16]} /><meshStandardMaterial color="#457B9D" /></mesh>
        <mesh position={[0, 0.24, 0.2]}><boxGeometry args={[0.3, 0.06, 0.3]} /><meshStandardMaterial color={PAD} /></mesh>
      </>);
    case 'mat':
      return <mesh position={[0, 0.02, 0]} receiveShadow><boxGeometry args={[0.75, 0.03, 1.7]} /><meshStandardMaterial color="#6D597A" /></mesh>;
  }
}
