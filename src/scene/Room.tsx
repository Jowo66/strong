// Floor zones, walls, lockers, reception, mirror, speakers, Hall of Fame wall and other props.
import { useMemo } from 'react';
import { useEngine, usePoll } from '../engineContext';
import { labelTexture } from './labels';
import { useUi } from '../store/ui';

const WALL = '#F3EDE2';
const TRIM = '#D8CCB8';

export function Room({ highContrast }: { highContrast: boolean }) {
  const eng = useEngine();
  const L = eng.c.layout;
  const openPanel = useUi((s) => s.openPanel);
  const zones = useMemo(() => Object.entries(L.zones), [L]);
  const w = L.bounds.x1 - L.bounds.x0, d = L.bounds.z1 - L.bounds.z0;
  const cx = (L.bounds.x0 + L.bounds.x1) / 2, cz = (L.bounds.z0 + L.bounds.z1) / 2;

  return (
    <group>
      {/* base slab, like a diorama board */}
      <mesh position={[cx, -0.35, cz]} receiveShadow>
        <boxGeometry args={[w + 1.2, 0.6, d + 1.2]} />
        <meshStandardMaterial color="#6B5B4B" />
      </mesh>
      <mesh position={[cx, -0.02, cz]} rotation-x={-Math.PI / 2} receiveShadow>
        <planeGeometry args={[w, d]} />
        <meshStandardMaterial color={highContrast ? '#FFFFFF' : '#E9E3D7'} />
      </mesh>
      {zones.map(([id, z]) => (
        <group key={id}>
          <mesh position={[(z.x0 + z.x1) / 2, 0, (z.z0 + z.z1) / 2]} rotation-x={-Math.PI / 2} receiveShadow>
            <planeGeometry args={[z.x1 - z.x0 - 0.1, z.z1 - z.z0 - 0.1]} />
            <meshStandardMaterial color={z.colour} />
          </mesh>
          <mesh position={[(z.x0 + z.x1) / 2, 0.01, z.z1 - 0.45]} rotation-x={-Math.PI / 2}>
            <planeGeometry args={[3.2, 0.8]} />
            <meshBasicMaterial map={labelTexture(z.label, highContrast ? '#000' : 'rgba(40,30,20,0.55)')} transparent depthWrite={false} />
          </mesh>
        </group>
      ))}

      {/* back + left walls (front and right are open so the camera can see in) */}
      <mesh position={[cx, 1.6, L.bounds.z0 - 0.15]} castShadow receiveShadow>
        <boxGeometry args={[w + 0.3, 3.2, 0.3]} />
        <meshStandardMaterial color={WALL} />
      </mesh>
      <mesh position={[L.bounds.x0 - 0.15, 1.6, cz]} castShadow receiveShadow>
        <boxGeometry args={[0.3, 3.2, d]} />
        <meshStandardMaterial color={WALL} />
      </mesh>
      <mesh position={[cx, 0.12, L.bounds.z0 + 0.02]}><boxGeometry args={[w, 0.24, 0.06]} /><meshStandardMaterial color={TRIM} /></mesh>

      {/* locker room partitions (low, so you can see in) with a door gap */}
      <Partition x0={-9} x1={-9} z0={-10} z1={-5} />
      <Partition x0={-9} x1={-9} z0={-3} z1={-1.6} />
      <Partition x0={-15} x1={-9} z0={-1.6} z1={-1.6} />

      {/* lockers along the left wall */}
      {Array.from({ length: 9 }, (_, i) => (
        <mesh key={i} position={[-14.65, 0.9, -9.4 + i * 0.85]} castShadow>
          <boxGeometry args={[0.6, 1.8, 0.8]} />
          <meshStandardMaterial color={i % 2 ? '#7FA7C9' : '#6E97BA'} />
        </mesh>
      ))}
      <mesh position={[-11.5, 0.25, -8.2]} castShadow><boxGeometry args={[0.5, 0.45, 3.5]} /><meshStandardMaterial color="#A67C52" /></mesh>

      {/* reception desk */}
      <mesh position={[L.receptionDesk.x, 0.55, L.receptionDesk.z]} castShadow>
        <boxGeometry args={[2.6, 1.1, 0.8]} />
        <meshStandardMaterial color="#C0583C" />
      </mesh>
      <mesh position={[L.receptionDesk.x, 1.13, L.receptionDesk.z]}><boxGeometry args={[2.8, 0.06, 0.95]} /><meshStandardMaterial color="#F7F1E6" /></mesh>
      <mesh position={[-14.84, 2.6, 8]} rotation-y={Math.PI / 2}>
        <planeGeometry args={[3.2, 0.8]} />
        <meshBasicMaterial map={labelTexture('Mini Gym', '#C0583C')} transparent />
      </mesh>

      {/* Hall of Fame wall: click to open the panel */}
      <group position={[L.hallOfFame.x + 0.02, L.hallOfFame.y, L.hallOfFame.z]} rotation-y={Math.PI / 2}
        onClick={(e) => { e.stopPropagation(); openPanel('hall'); }}
        onPointerOver={() => (document.body.style.cursor = 'pointer')} onPointerOut={() => (document.body.style.cursor = '')}>
        <mesh><boxGeometry args={[2.6, 1.5, 0.06]} /><meshStandardMaterial color="#5A3E2B" /></mesh>
        <mesh position={[0, 0.55, 0.04]}><planeGeometry args={[2.4, 0.4]} /><meshBasicMaterial map={labelTexture('Hall of Fame', '#FFD166')} transparent /></mesh>
        <HallFrames />
      </group>

      {/* mirror wall */}
      <mesh position={[(L.mirror.x0 + L.mirror.x1) / 2, L.mirror.height / 2 + 0.2, L.mirror.z + 0.05]}>
        <planeGeometry args={[L.mirror.x1 - L.mirror.x0, L.mirror.height]} />
        <meshStandardMaterial color="#DDEFF7" metalness={0.25} roughness={0.05} emissive="#9CC9DE" emissiveIntensity={0.25} />
      </mesh>

      {/* wall speakers: click to open the music window */}
      {L.speakers.map((s) => (
        <group key={s.id} position={[s.x, s.y, s.z + 0.1]}
          onClick={(e) => { e.stopPropagation(); openPanel('music'); }}
          onPointerOver={() => (document.body.style.cursor = 'pointer')} onPointerOut={() => (document.body.style.cursor = '')}>
          <mesh castShadow><boxGeometry args={[0.6, 0.85, 0.35]} /><meshStandardMaterial color="#2B2D42" /></mesh>
          <mesh position={[0, 0.15, 0.18]}><circleGeometry args={[0.18, 24]} /><meshStandardMaterial color="#555" /></mesh>
          <mesh position={[0, -0.22, 0.18]}><circleGeometry args={[0.1, 24]} /><meshStandardMaterial color="#555" /></mesh>
        </group>
      ))}

      {/* social space: couches, water cooler */}
      <mesh position={[-14.3, 0.3, 1.5]} castShadow><boxGeometry args={[0.9, 0.6, 3]} /><meshStandardMaterial color="#E07A5F" /></mesh>
      <mesh position={[-12.2, 0.2, 1.5]} castShadow><cylinderGeometry args={[0.5, 0.5, 0.4, 20]} /><meshStandardMaterial color="#F2CC8F" /></mesh>
      <group position={[L.waterCooler.x, 0, L.waterCooler.z]}>
        <mesh position={[0, 0.5, 0]} castShadow><boxGeometry args={[0.4, 1, 0.4]} /><meshStandardMaterial color="#F7F7F7" /></mesh>
        <mesh position={[0, 1.2, 0]}><cylinderGeometry args={[0.17, 0.17, 0.45, 16]} /><meshStandardMaterial color="#8ECAE6" transparent opacity={0.8} /></mesh>
      </group>
      {/* plants */}
      {[[-14.4, 9.4], [14.4, 9.4], [14.4, -2.3]].map(([x, z], i) => (
        <group key={i} position={[x, 0, z]}>
          <mesh position={[0, 0.25, 0]}><cylinderGeometry args={[0.25, 0.2, 0.5, 12]} /><meshStandardMaterial color="#B5651D" /></mesh>
          <mesh position={[0, 0.8, 0]} castShadow><sphereGeometry args={[0.45, 12, 10]} /><meshStandardMaterial color="#52B788" /></mesh>
        </group>
      ))}
    </group>
  );
}

function Partition({ x0, x1, z0, z1 }: { x0: number; x1: number; z0: number; z1: number }) {
  const lenX = Math.max(0.15, Math.abs(x1 - x0)), lenZ = Math.max(0.15, Math.abs(z1 - z0));
  return (
    <mesh position={[(x0 + x1) / 2, 0.8, (z0 + z1) / 2]} castShadow receiveShadow>
      <boxGeometry args={[lenX, 1.6, lenZ]} />
      <meshStandardMaterial color={WALL} />
    </mesh>
  );
}

function HallFrames() {
  const eng = useEngine();
  usePoll(3000);
  const holders = eng.save.titles.filter((t) => t.current).slice(-8);
  const colours = ['#FFD166', '#EF476F', '#06D6A0', '#118AB2', '#F4A261', '#9B5DE5', '#E76F51', '#2A9D8F'];
  return (
    <group>
      {Array.from({ length: 8 }, (_, i) => {
        const filled = i < holders.length;
        const member = filled ? eng.save.members[holders[i].holderId] : undefined;
        return (
          <group key={i} position={[-0.95 + (i % 4) * 0.63, 0.05 - Math.floor(i / 4) * 0.55, 0.05]}>
            <mesh><planeGeometry args={[0.48, 0.44]} /><meshStandardMaterial color={filled ? '#D4A373' : '#3E2A1E'} /></mesh>
            {filled && (
              <mesh position={[0, 0, 0.01]}>
                <circleGeometry args={[0.13, 16]} />
                <meshStandardMaterial color={member?.appearance.skin ?? colours[i]} />
              </mesh>
            )}
          </group>
        );
      })}
    </group>
  );
}
