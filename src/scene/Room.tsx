// The diorama room (P1–P12): board, zone floors, walls, lockers (doors open while members change), reception,
// social space, mirror, speakers, Hall of Fame wall, posters, whiteboard, windows, a clock that shows gym time.
// Static props are merged into a few vertex-coloured meshes; only things that move or are clicked are separate.
// Plants, the couch, coffee table, bar stools and the reception trophy are Quaternius models (props.ts) when they've
// loaded, with primitive stand-ins otherwise.
import { useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import { useEngine, usePoll } from '../engineContext';
import type { Vec2, ZoneId } from '../sim/types';
import { floorTexture, labelTexture, plaqueTexture, posterTexture, whiteboardTexture, windowTexture, type FloorKind } from './labels';
import { useUi } from '../store/ui';
import { Kit, kitMaterial } from './kit';
import { propsData, type PropModel } from './props';
import { portraitFor } from './portraits';
import { lookForNpc } from './character/look';
import { useSettings } from '../store/settings';
import { useMusic } from '../store/music';
import { radioBeat } from '../audio/sound';

const WALL = '#F3EDE2', WALL_HC = '#FFFFFF', TRIM = '#D8CCB8', SKIRT = '#A68A64';
const FLOOR_KIND: Record<ZoneId, FloorKind> = {
  reception: 'terrazzo', social: 'carpet', lockers: 'tile', freeWeights: 'rubber', squat: 'rubber',
  cardio: 'rubber', bench: 'rubber', cable: 'rubber', stretching: 'wood',
};
const LOCKER_COLOURS = ['#7FA7C9', '#6E97BA', '#8DB4D4'];

interface LockerDef { spot: Vec2; pos: [number, number, number]; wall: 'left' | 'back' }

function lockerDefs(spots: Vec2[]): LockerDef[] {
  return spots.map((s) => (s.x < -13.5
    ? { spot: s, pos: [-14.67, 0, s.z], wall: 'left' }
    : { spot: s, pos: [s.x, 0, -9.67], wall: 'back' }));
}

function buildStatic(L: ReturnType<typeof useEngine>['c']['layout'], lockers: LockerDef[], hc: boolean): THREE.BufferGeometry {
  const k = new Kit();
  const P = propsData();
  /** Place a model scaled so its height (or, with byWidth, its width) matches `size`; false if it isn't loaded. */
  const model = (id: string, x: number, y: number, z: number, ry: number, size: number, byWidth = false, squashY = 1): PropModel | null => {
    const m = P?.[id];
    if (!m) return null;
    const s = size / (byWidth ? m.size[0] : m.size[1]);
    k.model(m.geo, x, y, z, ry, s, s * squashY, s);
    return m;
  };
  const { x0, x1, z0, z1 } = L.bounds;
  const w = x1 - x0, d = z1 - z0, cx = (x0 + x1) / 2, cz = (z0 + z1) / 2;
  const wall = hc ? WALL_HC : WALL;
  // board the diorama sits on, with a darker lip
  k.rbox(w + 1.4, 0.55, d + 1.4, 0.08, '#6B4F3A', cx, -0.3, cz);
  k.rbox(w + 1.5, 0.08, d + 1.5, 0.03, '#4A3627', cx, -0.56, cz);
  // walls: back + left, with skirting and a top cap
  k.box(w + 0.3, 3.2, 0.3, wall, cx, 1.6, z0 - 0.15);
  k.box(0.3, 3.2, d, wall, x0 - 0.15, 1.6, cz);
  k.box(w + 0.32, 0.08, 0.34, TRIM, cx, 3.22, z0 - 0.15);
  k.box(0.34, 0.08, d, TRIM, x0 - 0.15, 3.22, cz);
  k.box(w, 0.14, 0.04, SKIRT, cx, 0.07, z0 + 0.02);
  k.box(0.04, 0.14, d, SKIRT, x0 + 0.02, 0.07, cz);
  // locker-room partitions (low, so you can see in) with a door gap
  const part = (ax: number, az: number, bx: number, bz: number) => {
    const lx = Math.max(0.15, Math.abs(bx - ax)), lz = Math.max(0.15, Math.abs(bz - az));
    k.box(lx, 1.6, lz, wall, (ax + bx) / 2, 0.8, (az + bz) / 2);
    k.box(lx + 0.02, 0.05, lz + 0.02, TRIM, (ax + bx) / 2, 1.62, (az + bz) / 2);
  };
  part(-9, -10, -9, -5); part(-9, -3, -9, -1.6); part(-15, -1.6, -9, -1.6);
  // door frame posts at the locker-room door
  k.box(0.2, 2.0, 0.2, TRIM, -9, 1.0, -5); k.box(0.2, 2.0, 0.2, TRIM, -9, 1.0, -3); k.box(0.2, 0.15, 2.2, TRIM, -9, 2.0, -4);

  // locker bodies (doors are separate so they can open)
  lockers.forEach((l, i) => {
    const col = LOCKER_COLOURS[i % 3];
    if (l.wall === 'left') {
      k.box(0.56, 1.85, 0.78, col, l.pos[0], 0.925, l.pos[2]);
      k.box(0.6, 0.08, 0.8, '#5B7FA3', l.pos[0], 1.89, l.pos[2]);
    } else {
      k.box(0.78, 1.85, 0.56, col, l.pos[0], 0.925, l.pos[2]);
      k.box(0.8, 0.08, 0.6, '#5B7FA3', l.pos[0], 1.89, l.pos[2]);
    }
  });
  // locker-room benches
  k.rbox(0.45, 0.08, 3.2, 0.03, '#C69C6D', -11.6, 0.42, -5.6);
  for (const z of [-6.9, -4.3]) k.box(0.08, 0.38, 0.35, '#5B5B5B', -11.6, 0.19, z);
  k.rbox(2.6, 0.08, 0.45, 0.03, '#C69C6D', -11.6, 0.42, -7.6);
  for (const x of [-12.6, -10.6]) k.box(0.35, 0.38, 0.08, '#5B5B5B', x, 0.19, -7.6);
  // towel bin and a laundry cart by the locker door
  k.cyl(0.28, 0.6, '#ADB5BD', -9.6, 0.3, -2.4, 0, 0, 0, 14);
  for (let i = 0; i < 4; i++) k.rbox(0.22, 0.08, 0.15, 0.03, ['#FFFFFF', '#CDE7F0', '#FFFFFF', '#FFE5EC'][i], -9.6 + (i % 2 - 0.5) * 0.18, 0.64 + Math.floor(i / 2) * 0.07, -2.4 + (i % 2 ? 0.05 : -0.05));

  // reception desk (L-shaped counter), monitor, card reader, bell, a plant
  const R = L.receptionDesk;
  k.rbox(2.8, 1.1, 0.8, 0.06, '#C0583C', R.x, 0.55, R.z);
  k.rbox(0.8, 1.1, 1.6, 0.06, '#C0583C', R.x + 1.8, 0.55, R.z - 0.4);
  k.rbox(3.0, 0.07, 0.98, 0.03, '#F7F1E6', R.x, 1.13, R.z);
  k.rbox(0.95, 0.07, 1.75, 0.03, '#F7F1E6', R.x + 1.8, 1.13, R.z - 0.4);
  k.box(2.4, 0.06, 0.02, '#FFD166', R.x, 0.75, R.z + 0.41);
  k.rbox(0.55, 0.36, 0.05, 0.02, '#2B2D42', R.x - 0.6, 1.42, R.z - 0.15);
  k.rbox(0.48, 0.28, 0.02, 0.01, '#4CC9F0', R.x - 0.6, 1.43, R.z - 0.12);
  k.box(0.06, 0.18, 0.06, '#2B2D42', R.x - 0.6, 1.24, R.z - 0.17);
  k.rbox(0.14, 0.05, 0.2, 0.02, '#1B1B1B', R.x + 0.5, 1.19, R.z + 0.3);
  k.box(0.08, 0.01, 0.08, '#06D6A0', R.x + 0.5, 1.22, R.z + 0.32);
  k.sphere(0.06, '#E9C46A', R.x + 0.2, 1.2, R.z + 0.25, 1, 0.6, 1);
  if (!model('plantLeafy', R.x + 1.0, 1.165, R.z - 0.1, 0.4, 0.5)) {
    k.cyl(0.11, 0.18, '#E76F51', R.x + 1.0, 1.25, R.z - 0.1, 0, 0, 0, 12, 0.08);
    k.sphere(0.16, '#52B788', R.x + 1.0, 1.45, R.z - 0.1);
  }
  model('trophy', R.x - 1.15, 1.165, R.z - 0.2, 0, 0.36); // the gym's own cup
  // welcome mat at the entrance
  k.rbox(1.8, 0.03, 1.0, 0.01, '#3D405B', L.checkInSpot.x, 0.015, 9.4);
  k.rbox(1.6, 0.032, 0.8, 0.01, '#E9C46A', L.checkInSpot.x, 0.016, 9.4);

  // social space: couch, coffee table, shake bar, rug
  if (!model('couch', -14.41, 0, 2.2, Math.PI / 2, 3.1, true, 0.85)) { // faces into the room
    k.rbox(0.9, 0.45, 3.0, 0.1, '#E07A5F', -14.35, 0.23, 2.2);
    k.rbox(0.3, 0.6, 3.0, 0.1, '#D06A4F', -14.7, 0.6, 2.2);
    for (const z of [0.7, 3.7]) k.rbox(0.9, 0.55, 0.25, 0.08, '#D06A4F', -14.35, 0.38, z);
    k.rbox(0.5, 0.15, 0.6, 0.06, '#F2CC8F', -14.3, 0.52, 1.5); k.rbox(0.5, 0.15, 0.6, 0.06, '#81B29A', -14.3, 0.52, 2.9);
  }
  const table = model('coffeeTable', -13.2, 0, 3.4, 0, 0.9, true);
  const tableTop = table ? table.size[1] * (0.9 / table.size[0]) : 0.45;
  if (!table) { k.cyl(0.45, 0.06, '#F2CC8F', -13.2, 0.42, 3.4, 0, 0, 0, 20); k.cyl(0.06, 0.4, '#8B5E34', -13.2, 0.2, 3.4, 0, 0, 0, 8); }
  k.rbox(0.18, 0.12, 0.13, 0.02, '#FFFFFF', -13.1, tableTop + 0.06, 3.3); // a magazine pile
  k.rbox(2.6, 1.0, 0.6, 0.05, '#264653', -12.6, 0.5, -1.0);
  k.rbox(2.7, 0.06, 0.7, 0.02, '#F7F1E6', -12.6, 1.03, -1.0);
  for (let i = 0; i < 4; i++) k.cyl(0.07, 0.24, ['#F4A261', '#E76F51', '#2A9D8F', '#8338EC'][i], -13.5 + i * 0.4, 1.18, -1.05, 0, 0, 0, 10, 0.06);
  k.cyl(0.12, 0.35, '#ADB5BD', -11.6, 1.24, -1.1, 0, 0, 0, 12); // blender
  for (const x of [-13.3, -12.6, -11.9]) {
    if (!model('stool', x, 0, -0.45, 0, 0.8)) { k.cyl(0.18, 0.06, '#E76F51', x, 0.75, -0.45, 0, 0, 0, 14); k.cyl(0.04, 0.72, '#ADB5BD', x, 0.36, -0.45, 0, 0, 0, 6); }
  }
  model('plantTiny', -13.78, 1.06, -1.0, 0, 0.3);
  // water cooler
  const W = L.waterCooler;
  k.rbox(0.42, 1.0, 0.42, 0.05, '#F7F7F7', W.x, 0.5, W.z);
  k.box(0.1, 0.05, 0.05, '#4361EE', W.x - 0.08, 0.8, W.z + 0.22); k.box(0.1, 0.05, 0.05, '#E63946', W.x + 0.08, 0.8, W.z + 0.22);
  // plants: a mix of pack plants, sized to each one's footprint
  const PLANTS: [string, number, boolean][] = [['plantPalm', 2.8, true], ['plantMonstera', 2.8, true], ['plantSnake', 3.6, false], ['plantCactus', 3.6, false], ['plantSnake', 3.6, false]];
  L.obstacles.circles.filter((o) => o.name === 'plant').forEach((pl, i) => {
    const x = pl.x, z = pl.z, s = pl.r / 0.38;
    const [id, size, byWidth] = PLANTS[i % PLANTS.length];
    if (model(id, x, 0, z, i * 1.3, pl.r * size, byWidth)) return;
    k.cyl(0.24 * s, 0.5 * s, '#B5651D', x, 0.25 * s, z, 0, 0, 0, 12, 0.19 * s);
    k.sphere(0.36 * s, '#52B788', x, 0.75 * s, z, 1, 1.1, 1);
    k.sphere(0.24 * s, '#40916C', x + 0.18 * s, 1.0 * s, z - 0.1 * s);
    k.sphere(0.22 * s, '#74C69D', x - 0.15 * s, 1.05 * s, z + 0.12 * s);
  });
  // mirror frame
  const Mi = L.mirror;
  k.box(Mi.x1 - Mi.x0 + 0.16, 0.08, 0.08, '#8D99AE', (Mi.x0 + Mi.x1) / 2, Mi.height + 0.24, Mi.z + 0.05);
  k.box(Mi.x1 - Mi.x0 + 0.16, 0.08, 0.08, '#8D99AE', (Mi.x0 + Mi.x1) / 2, 0.16, Mi.z + 0.05);
  // poster / whiteboard / window frames
  const frame = (x: number, y: number, z: number, fw: number, fh: number, axis: 'z' | 'x', col = '#5A3E2B') => {
    if (axis === 'z') k.box(fw + 0.1, fh + 0.1, 0.04, col, x, y, z); else k.box(0.04, fh + 0.1, fw + 0.1, col, x, y, z);
  };
  frame(-0.55, 1.5, -9.98, 0.6, 0.82, 'z');
  frame(6.45, 2.4, -9.98, 0.6, 0.82, 'z');
  frame(3.5, 2.55, -9.98, 1.4, 0.82, 'z', '#ADB5BD');
  frame(11.5, 1.7, -9.98, 0.6, 0.82, 'z');
  frame(-14.98, 1.9, 0.0, 0.6, 0.82, 'x');
  for (const x of [9.6, 13.4]) { frame(x, 2.0, -9.98, 1.9, 1.15, 'z', '#FFFFFF'); k.box(0.05, 1.15, 0.05, '#FFFFFF', x, 2.0, -9.93); k.box(1.9, 0.05, 0.05, '#FFFFFF', x, 2.0, -9.93); k.box(2.1, 0.07, 0.18, '#FFFFFF', x, 1.39, -9.9); }
  // wall clock body
  k.cyl(0.32, 0.06, '#2B2D42', -0.55, 2.6, -9.97, Math.PI / 2, 0, 0, 24);
  k.cyl(0.28, 0.065, '#FFFDF7', -0.55, 2.6, -9.96, Math.PI / 2, 0, 0, 24);
  for (let i = 0; i < 12; i++) { const a = (i / 12) * Math.PI * 2; k.box(0.02, 0.05, 0.01, '#2B2D42', -0.55 + Math.sin(a) * 0.23, 2.6 + Math.cos(a) * 0.23, -9.925); }
  return k.build();
}

export function Room({ highContrast }: { highContrast: boolean }) {
  const eng = useEngine();
  const L = eng.c.layout;
  const openPanel = useUi((s) => s.openPanel);
  const lockers = useMemo(() => lockerDefs(L.lockerSpots), [L]);
  const staticGeo = useMemo(() => buildStatic(L, lockers, highContrast), [L, lockers, highContrast]);
  const zones = useMemo(() => Object.entries(L.zones) as [ZoneId, (typeof L.zones)[ZoneId]][], [L]);
  const w = L.bounds.x1 - L.bounds.x0, d = L.bounds.z1 - L.bounds.z0;
  const cx = (L.bounds.x0 + L.bounds.x1) / 2, cz = (L.bounds.z0 + L.bounds.z1) / 2;
  const year = new Date(eng.save.createdAt).getUTCFullYear();
  const pointer = { onPointerOver: () => (document.body.style.cursor = 'pointer'), onPointerOut: () => (document.body.style.cursor = '') };

  return (
    <group>
      <mesh geometry={staticGeo} material={kitMaterial} castShadow receiveShadow />
      {/* walkway floor. Zone panels draw first (renderOrder -2) so the depth test skips the floor beneath them:
          less shading on fill-rate-bound GPUs, measured ~10% on an Intel UHD 630. */}
      <mesh position={[cx, -0.02, cz]} rotation-x={-Math.PI / 2} receiveShadow renderOrder={-1}>
        <planeGeometry args={[w, d]} />
        <meshStandardMaterial color={highContrast ? '#FFFFFF' : '#E4DCCD'} roughness={0.9} />
      </mesh>
      {zones.map(([id, z]) => (
        <mesh key={id} position={[(z.x0 + z.x1) / 2, 0.002, (z.z0 + z.z1) / 2]} rotation-x={-Math.PI / 2} receiveShadow renderOrder={-2}>
          <planeGeometry args={[z.x1 - z.x0 - 0.1, z.z1 - z.z0 - 0.1]} />
          <meshStandardMaterial map={floorTexture(FLOOR_KIND[id], z.colour, z.label, z.x1 - z.x0, z.z1 - z.z0, highContrast)} roughness={0.85} />
        </mesh>
      ))}

      {/* textured decor */}
      <mesh position={[-14.84, 2.75, 7.0]} rotation-y={Math.PI / 2}>
        <planeGeometry args={[3.2, 0.8]} /><meshBasicMaterial map={labelTexture('Mini Gym', '#C0583C')} transparent />
      </mesh>
      <mesh position={[cx, -0.32, L.bounds.z1 + 0.71]}>
        <planeGeometry args={[1.6, 0.4]} /><meshStandardMaterial map={plaqueTexture('MINI GYM', `est. ${year}`)} roughness={0.35} metalness={0.4} />
      </mesh>
      <Picture tex={posterTexture('rerack')} pos={[-0.55, 1.5, -9.955]} size={[0.6, 0.82]} />
      <Picture tex={posterTexture('spot')} pos={[6.45, 2.4, -9.955]} size={[0.6, 0.82]} />
      <Picture tex={posterTexture('legday')} pos={[11.5, 1.7, -9.955]} size={[0.6, 0.82]} />
      <Picture tex={posterTexture('hydrate')} pos={[-14.955, 1.9, 0]} size={[0.6, 0.82]} rotY={Math.PI / 2} />
      <Picture tex={whiteboardTexture()} pos={[3.5, 2.55, -9.955]} size={[1.4, 0.82]} />
      {[9.6, 13.4].map((x) => <Picture key={x} tex={windowTexture()} pos={[x, 2.0, -9.955]} size={[1.9, 1.15]} basic />)}

      <Lockers lockers={lockers} />
      <Clock />

      {/* Hall of Fame wall: click to open the panel */}
      <group position={[L.hallOfFame.x + 0.02, L.hallOfFame.y, L.hallOfFame.z]} rotation-y={Math.PI / 2}
        onClick={(e) => { e.stopPropagation(); openPanel('hall'); }} {...pointer}>
        <mesh castShadow><boxGeometry args={[2.7, 1.6, 0.08]} /><meshStandardMaterial color="#5A3E2B" roughness={0.6} /></mesh>
        <mesh position={[0, 0.58, 0.05]}><planeGeometry args={[2.4, 0.38]} /><meshBasicMaterial map={labelTexture('Hall of Fame', '#FFD166')} transparent /></mesh>
        <HallFrames />
      </group>

      {/* mirror wall */}
      <mesh position={[(L.mirror.x0 + L.mirror.x1) / 2, L.mirror.height / 2 + 0.2, L.mirror.z + 0.05]}>
        <planeGeometry args={[L.mirror.x1 - L.mirror.x0, L.mirror.height]} />
        <meshStandardMaterial color="#DDEFF7" metalness={0.3} roughness={0.08} emissive="#9CC9DE" emissiveIntensity={0.3} />
      </mesh>

      {/* wall speakers: click to open the music window */}
      {L.speakers.map((s) => (
        <group key={s.id} position={[s.x, s.y, s.z + 0.1]} onClick={(e) => { e.stopPropagation(); openPanel('music'); }} {...pointer}>
          <Speaker />
        </group>
      ))}
    </group>
  );
}

function Picture({ tex, pos, size, rotY = 0, basic }: { tex: THREE.Texture; pos: [number, number, number]; size: [number, number]; rotY?: number; basic?: boolean }) {
  return (
    <mesh position={pos} rotation-y={rotY}>
      <planeGeometry args={size} />
      {basic ? <meshBasicMaterial map={tex} toneMapped={false} /> : <meshStandardMaterial map={tex} roughness={0.8} />}
    </mesh>
  );
}

const speakerGeo = (() => {
  const k = new Kit();
  k.rbox(0.62, 0.88, 0.36, 0.06, '#2B2D42', 0, 0, 0);
  k.cyl(0.2, 0.03, '#495057', 0, 0.15, 0.18, Math.PI / 2, 0, 0, 20);
  k.cyl(0.11, 0.04, '#6C757D', 0, 0.15, 0.19, Math.PI / 2, 0, 0, 16);
  k.cyl(0.11, 0.03, '#495057', 0, -0.24, 0.18, Math.PI / 2, 0, 0, 16);
  k.box(0.08, 0.03, 0.02, '#06D6A0', 0.2, -0.38, 0.18);
  return k.build();
})();

/** Wall speaker: the cone pulses on the beat while Gym Radio or Spotify is playing. */
function Speaker() {
  const cone = useRef<THREE.Mesh>(null!);
  const reduced = useSettings((s) => s.reducedMotion);
  useFrame((state) => {
    const m = useMusic.getState();
    const beat = radioBeat() ?? (m.spotifyPlaying ? (state.clock.elapsedTime * 2) % 1 : null); // ~120 bpm for Spotify
    const pulse = beat === null ? 0 : Math.pow(1 - beat, 3) * (reduced ? 0.04 : 0.16);
    cone.current.scale.set(1 + pulse, 1 + pulse, 1 + pulse * 3);
  });
  return (
    <group>
      <mesh geometry={speakerGeo} material={kitMaterial} castShadow />
      <mesh ref={cone} position={[0, 0.15, 0.2]} rotation-x={Math.PI / 2}><cylinderGeometry args={[0.15, 0.19, 0.04, 20]} /><meshStandardMaterial color="#343A40" roughness={0.5} /></mesh>
    </group>
  );
}

const doorGeo = new THREE.BoxGeometry(0.03, 1.7, 0.56);
const doorMats = LOCKER_COLOURS.map((c) => new THREE.MeshStandardMaterial({ color: new THREE.Color(c).multiplyScalar(1.08), roughness: 0.55, metalness: 0.15 }));
const ventGeo = new THREE.BoxGeometry(0.035, 0.2, 0.3);
const ventMat = new THREE.MeshStandardMaterial({ color: '#4A6F94' });

/** Locker doors swing open while a member is changing at that locker (and close afterwards). */
function Lockers({ lockers }: { lockers: LockerDef[] }) {
  const eng = useEngine();
  const hinges = useRef<(THREE.Group | null)[]>([]);
  const open = useRef<number[]>(lockers.map(() => 0));
  useFrame((_, dt) => {
    const busy = new Set<string>();
    for (const a of eng.agents.values()) if (a.state === 'changing' || a.state === 'changingOut') busy.add(`${a.lockerSpot.x},${a.lockerSpot.z}`);
    lockers.forEach((l, i) => {
      const target = busy.has(`${l.spot.x},${l.spot.z}`) ? 1.9 : 0;
      open.current[i] += (target - open.current[i]) * Math.min(1, dt * 5);
      const h = hinges.current[i];
      // doors swing out on the camera side, screening the member while they change
      if (h) h.rotation.y = l.wall === 'left' ? -open.current[i] : open.current[i];
    });
  });
  return (
    <>
      {lockers.map((l, i) => (
        <group key={i} ref={(g) => { hinges.current[i] = g; }}
          position={l.wall === 'left' ? [l.pos[0] + 0.295, 0.93, l.pos[2] + 0.28] : [l.pos[0] + 0.28, 0.93, l.pos[2] + 0.295]}>
          <group rotation-y={l.wall === 'left' ? 0 : Math.PI / 2}>
            <mesh geometry={doorGeo} material={doorMats[i % 3]} position={[0, 0, -0.28]} castShadow />
            <mesh geometry={ventGeo} material={ventMat} position={[0.01, 0.55, -0.28]} />
          </group>
        </group>
      ))}
    </>
  );
}

/** The wall clock shows the in-game time of day (opening hours 06:00–22:00). */
function Clock() {
  const eng = useEngine();
  const hour = useRef<THREE.Group>(null!);
  const minute = useRef<THREE.Group>(null!);
  useFrame(() => {
    const hours = 6 + 16 * (eng.save.dayTime / eng.settings.dayLength);
    minute.current.rotation.z = -(hours % 1) * Math.PI * 2;
    hour.current.rotation.z = -((hours % 12) / 12) * Math.PI * 2;
  });
  return (
    <group position={[-0.55, 2.6, -9.92]}>
      <group ref={hour}><mesh position={[0, 0.07, 0]}><boxGeometry args={[0.035, 0.15, 0.01]} /><meshBasicMaterial color="#2B2D42" /></mesh></group>
      <group ref={minute}><mesh position={[0, 0.1, 0.005]}><boxGeometry args={[0.022, 0.22, 0.01]} /><meshBasicMaterial color="#E63946" /></mesh></group>
    </group>
  );
}

function HallFrames() {
  const eng = useEngine();
  usePoll(3000);
  const holders = eng.save.titles.filter((t) => t.current && !t.holderLeft).slice(-8);
  return (
    <group>
      {Array.from({ length: 8 }, (_, i) => {
        const rec = holders[i];
        const member = rec ? eng.save.members[rec.holderId] : undefined;
        const tex = member ? portraitFor(lookForNpc(member)).rt.texture : null;
        return (
          <group key={i} position={[-0.95 + (i % 4) * 0.63, 0.08 - Math.floor(i / 4) * 0.58, 0.05]}>
            <mesh><planeGeometry args={[0.5, 0.46]} /><meshStandardMaterial color={rec ? '#D4A373' : '#3E2A1E'} /></mesh>
            {tex && <mesh position={[0, 0, 0.01]}><planeGeometry args={[0.4, 0.38]} /><meshBasicMaterial map={tex} toneMapped={false} /></mesh>}
          </group>
        );
      })}
    </group>
  );
}
