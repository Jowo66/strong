// Characters from the Quaternius "Ultimate Animated Character Pack" (CC0), converted by scripts/build-characters.py.
//
// • Loading: one small JSON manifest + one binary (≈175 KB gzipped) with mesh parts and animation clips.
// • Assembly: a look (see look.ts) picks parts — the full BaseCharacter body, a face, hair, top, bottoms, extras —
//   which are recoloured and merged into ONE skinned geometry with vertex colours (one draw call per member).
//   Clothing cuts the pack doesn't have are made with the skeleton's weights: a sports top is a tank top without
//   the triangles that follow the belly; long sleeves paint the arm skin; shoes paint the feet.
// • Animation: the game's procedural pose library (poses.ts) is retargeted onto the pack skeleton every frame, so
//   every exercise keeps working. The pack's own clips take over where they look better (walking, running,
//   carrying, the victory jump), cross-faded per bone.
import * as THREE from 'three';
import type { CharacterLook } from './look';
import { hashString } from './look';
import { HIP_Y, type BoneName } from './rig';
import type { Pose, PoseContext } from './poses';

// ---------------------------------------------------------------- data

interface Manifest {
  fps: number;
  quantize: { min: number[]; scale: number[] };
  bones: { name: string; parent: number; t: number[]; r: number[]; s: number[] }[];
  inverseBind: number[];
  parts: Record<string, { vertices: number; indices: number; position: number; joints: number; weights: number; index: number; colour: number[]; covers?: number; coverCount?: number }>;
  clips: Record<string, { duration: number; frames: number; rotations: number; rotationBones: number[]; positions: number; positionBones: number[] }>;
}

interface Part {
  pos: Float32Array;       // xyz, pack units
  joints: Uint8Array;      // 4 per vertex
  weights: Float32Array;   // 4 per vertex
  dom: Uint8Array;         // dominant joint per vertex
  index: Uint16Array;
  covers: Uint16Array | null; // pairs (body vertex, this part's triangle) — body skin hidden under this garment
}

interface Clip { duration: number; frames: number; rot: Float32Array; rotBones: number[]; pos: Float32Array; posBones: number[] }

interface Pack {
  manifest: Manifest;
  parts: Record<string, Part>;
  clips: Record<string, Clip>;
  skel: SkeletonInfo;
  head: { centre: THREE.Vector3; radius: number; top: number; eyeY: number; eyeX: number; front: number; chinY: number };
}

let pack: Pack | null = null;
let loading: Promise<Pack | null> | null = null;

/** The pack, once loaded (null until then, or if it failed — callers then fall back to the code-built rig). */
export const packData = (): Pack | null => pack;

export function loadPack(): Promise<Pack | null> {
  if (pack) return Promise.resolve(pack);
  if (!loading) {
    const base = import.meta.env.BASE_URL;
    loading = Promise.all([
      fetch(`${base}characters/characters.json`).then((r) => { if (!r.ok) throw new Error(`characters.json ${r.status}`); return r.json() as Promise<Manifest>; }),
      fetch(`${base}characters/characters.bin`).then((r) => { if (!r.ok) throw new Error(`characters.bin ${r.status}`); return r.arrayBuffer(); }),
    ]).then(([m, bin]) => (pack = decode(m, bin)))
      .catch((e) => { console.warn('Mini Gym: character pack unavailable, using built-in figures.', e); return null; });
  }
  return loading;
}

function decode(m: Manifest, bin: ArrayBuffer): Pack {
  const parts: Record<string, Part> = {};
  const { min, scale } = m.quantize;
  for (const [id, p] of Object.entries(m.parts)) {
    const q = new Int16Array(bin, p.position, p.vertices * 3);
    const pos = new Float32Array(p.vertices * 3);
    for (let i = 0; i < pos.length; i++) pos[i] = (q[i] + 32768) * scale[i % 3] + min[i % 3];
    // The pack skins the feet to its IK foot targets; the game poses legs directly, so feet follow the shins.
    const joints = new Uint8Array(bin, p.joints, p.vertices * 4).slice();
    for (let k = 0; k < joints.length; k++) joints[k] = FOOT_TO_SHIN[joints[k]] ?? joints[k];
    const wq = new Uint8Array(bin, p.weights, p.vertices * 4);
    const weights = new Float32Array(p.vertices * 4);
    const dom = new Uint8Array(p.vertices);
    for (let v = 0; v < p.vertices; v++) {
      let best = 0;
      for (let k = 0; k < 4; k++) {
        weights[v * 4 + k] = wq[v * 4 + k] / 255;
        if (wq[v * 4 + k] > wq[v * 4 + best]) best = k;
      }
      dom[v] = joints[v * 4 + best];
    }
    const covers = p.coverCount ? new Uint16Array(bin, p.covers!, p.coverCount * 2) : null;
    parts[id] = { pos, joints, weights, dom, index: new Uint16Array(bin, p.index, p.indices), covers };
  }
  const clips: Record<string, Clip> = {};
  for (const [name, c] of Object.entries(m.clips)) {
    clips[name] = {
      duration: c.duration, frames: c.frames,
      rot: new Float32Array(bin, c.rotations, c.frames * c.rotationBones.length * 4), rotBones: c.rotationBones,
      pos: new Float32Array(bin, c.positions, c.frames * c.positionBones.length * 3), posBones: c.positionBones,
    };
  }
  const skel = skeletonInfo(m);
  return { manifest: m, parts, clips, skel, head: headMetrics(parts) };
}

// ---------------------------------------------------------------- skeleton & retarget data

const J = {
  Bone: 0, Body: 2, Hips: 3, Abdomen: 4, Torso: 5, Neck: 6, Head: 7,
  ShoulderL: 8, UpperArmL: 9, LowerArmL: 10, FistL: 11, ShoulderR: 12, UpperArmR: 13, LowerArmR: 14, FistR: 15,
  UpperLegL: 16, LowerLegL: 17, UpperLegR: 18, LowerLegR: 19,
} as const;

const FOOT_TO_SHIN: Record<number, number> = { 1: 17, 21: 19 }; // Foot.L → LowerLeg.L, Foot.R → LowerLeg.R

/** Procedural bone that drives each pack bone. The procedural rig's "L" side is at x < 0, which is the pack's ".R". */
type ProcBone = 'hips' | 'spine' | 'head' | 'armL' | 'foreL' | 'armR' | 'foreR' | 'thighL' | 'shinL' | 'thighR' | 'shinR';
const MAP: [number, ProcBone][] = [
  [J.Body, 'hips'], [J.Torso, 'spine'], [J.Head, 'head'],
  [J.UpperArmR, 'armL'], [J.LowerArmR, 'foreL'], [J.UpperArmL, 'armR'], [J.LowerArmL, 'foreR'],
  [J.UpperLegR, 'thighL'], [J.LowerLegR, 'shinL'], [J.UpperLegL, 'thighR'], [J.LowerLegL, 'shinR'],
];
/** Bones between two driven bones bend part of the way, so the spine curves instead of kinking. */
const BLEND: [number, ProcBone, ProcBone, number][] = [
  [J.Hips, 'hips', 'spine', 0.33], [J.Abdomen, 'hips', 'spine', 0.66], [J.Neck, 'spine', 'head', 0.5],
];
const LIMBS = new Set<number>([J.UpperArmL, J.LowerArmL, J.UpperArmR, J.LowerArmR, J.UpperLegL, J.LowerLegL, J.UpperLegR, J.LowerLegR]);

interface SkeletonInfo {
  n: number;
  parent: Int8Array;
  order: number[];
  bindPos: THREE.Vector3[];
  bindQuat: THREE.Quaternion[];
  bindScale: THREE.Vector3[];
  bindWorld: THREE.Quaternion[];
  ref: THREE.Quaternion[];        // reference world orientation that matches the procedural rest pose
  driver: (ProcBone | null)[];
  blend: ([ProcBone, ProcBone, number] | null)[];
  inverseBind: THREE.Matrix4[];
  hipY: number;                   // Body bone height in the bind pose (pack units)
}

function skeletonInfo(m: Manifest): SkeletonInfo {
  const n = m.bones.length;
  const parent = new Int8Array(n);
  const bindPos: THREE.Vector3[] = [], bindQuat: THREE.Quaternion[] = [], bindScale: THREE.Vector3[] = [];
  m.bones.forEach((b, i) => {
    parent[i] = b.parent;
    bindPos.push(new THREE.Vector3(...b.t));
    bindQuat.push(new THREE.Quaternion(...b.r));
    bindScale.push(new THREE.Vector3(...b.s));
  });
  const order: number[] = [];
  const seen = new Set<number>();
  const visit = (i: number) => { if (seen.has(i)) return; if (parent[i] >= 0) visit(parent[i]); seen.add(i); order.push(i); };
  for (let i = 0; i < n; i++) visit(i);
  const bindWorld: THREE.Quaternion[] = new Array(n);
  const worldPos: THREE.Vector3[] = new Array(n);
  for (const i of order) {
    const p = parent[i];
    bindWorld[i] = p < 0 ? bindQuat[i].clone() : bindWorld[p].clone().multiply(bindQuat[i]);
    worldPos[i] = p < 0 ? bindPos[i].clone() : bindPos[i].clone().applyQuaternion(bindWorld[p]).add(worldPos[p]);
  }
  // Reference pose: the bind pose with every limb turned to hang straight down (the procedural rig's rest).
  const down = new THREE.Vector3(0, -1, 0);
  const ref = bindWorld.map((q, i) => {
    if (!LIMBS.has(i)) return q.clone();
    const dir = new THREE.Vector3(0, 1, 0).applyQuaternion(q);   // bones point along their local +Y
    return new THREE.Quaternion().setFromUnitVectors(dir, down).multiply(q);
  });
  const driver: (ProcBone | null)[] = new Array(n).fill(null);
  for (const [j, b] of MAP) driver[j] = b;
  const blend: ([ProcBone, ProcBone, number] | null)[] = new Array(n).fill(null);
  for (const [j, a, b, t] of BLEND) blend[j] = [a, b, t];
  const inverseBind: THREE.Matrix4[] = [];
  for (let i = 0; i < n; i++) inverseBind.push(new THREE.Matrix4().fromArray(m.inverseBind, i * 16));
  return { n, parent, order, bindPos, bindQuat, bindScale, bindWorld, ref, driver, blend, inverseBind, hipY: worldPos[J.Body].y };
}

function headMetrics(parts: Record<string, Part>): Pack['head'] {
  const body = parts.body;
  const box = new THREE.Box3();
  const v = new THREE.Vector3();
  for (let i = 0; i < body.dom.length; i++) if (body.dom[i] === J.Head) box.expandByPoint(v.fromArray(body.pos, i * 3));
  const centre = box.getCenter(new THREE.Vector3());
  const size = box.getSize(new THREE.Vector3());
  const face = parts.face;
  let ey = 0, ex = 0, n = 0;
  for (let i = 0; i < face.dom.length; i++) { ey += face.pos[i * 3 + 1]; ex += Math.abs(face.pos[i * 3]); n++; }
  return { centre, radius: Math.max(size.x, size.z) / 2, top: box.max.y, eyeY: ey / n, eyeX: ex / n, front: box.max.z, chinY: box.min.y };
}

// ---------------------------------------------------------------- geometry assembly

export type Outfit = 'gym' | 'street';
const tmpC = new THREE.Color();

interface Piece {
  part: string;
  colour: string;
  keep?: (dom: number) => boolean;               // drop triangles whose three vertices all fail this
  paint?: (i: number, part: Part) => string | null; // per-vertex override
}

const isArm = (d: number) => d === J.UpperArmL || d === J.UpperArmR || d === J.LowerArmL || d === J.LowerArmR;
const isUpperArm = (d: number) => d === J.UpperArmL || d === J.UpperArmR || d === J.ShoulderL || d === J.ShoulderR;
const isBelly = (d: number) => d === J.Body || d === J.Hips || d === J.Abdomen;

function variant(look: CharacterLook, n: number, salt: string): number { return hashString(look.key + salt) % n; }

function hairPieces(look: CharacterLook, P: Pack): Piece[] {
  const c = look.hair;
  const by = (ids: string[]) => ids[variant(look, ids.length, 'hair')];
  switch (look.hairStyle) {
    case 'bald': case 'buzz': case 'afro': case 'bun': return look.hairStyle === 'bun' ? [{ part: 'hairCurly', colour: c }] : [];
    case 'spiky': return [{ part: 'hairSpiky', colour: c }];
    case 'curly': return [{ part: by(['hairCurly', 'hairOld']), colour: c }];
    case 'ponytail': return [{ part: by(['hairPony2', 'hairPony']), colour: c }];
    case 'long': return [{ part: by(['hairLong', 'hairLong2', 'hairBob']), colour: c }];
    case 'short': default: return [{ part: P.parts.hairShort ? 'hairShort' : 'hairSpiky', colour: c }];
  }
}

function piecesFor(look: CharacterLook, outfit: Outfit, P: Pack): Piece[] {
  const f = look.gender === 'female';
  const street = outfit === 'street' && !look.crew;
  const head = P.head;
  const pieces: Piece[] = [];
  const top = street ? 'hoodie' : look.top;
  const bottom = street ? 'jeans' : look.bottom;
  const topCol = street ? look.street : look.shirt;
  const legCol = street ? look.streetBottom : look.shorts;
  const sleeves = top === 'longsleeve' || top === 'hoodie';

  // body: skin, with shoes painted on the feet, sleeves on the arms, and a buzz cut / stubble on the head
  const footTop = 0.2;
  pieces.push({
    part: 'body', colour: look.skin,
    paint: (i, part) => {
      const y = part.pos[i * 3 + 1], z = part.pos[i * 3 + 2], d = part.dom[i];
      if (y < footTop) return y < 0.05 ? look.sole : look.shoes;
      if (sleeves && isArm(d)) return topCol;
      if (look.crew && isArm(d)) return '#3A86FF';
      if (d === J.Head) {
        const rel = (y - head.eyeY) / (head.top - head.eyeY);
        if (look.hairStyle === 'buzz' && (rel > 0.35 || (z < head.centre.z - head.radius * 0.25 && y > head.chinY + 0.25))) return look.hair;
        if (look.facialHair === 'stubble' && y < head.eyeY - 0.18 && z > head.centre.z + head.radius * 0.1) return mixHex(look.skin, look.hair, 0.4);
      }
      return null;
    },
  });
  pieces.push({ part: f ? 'faceF' : 'face', colour: '#FFFFF0' });
  if (!look.crew) pieces.push(...hairPieces(look, P));
  else if (look.hairStyle === 'ponytail') pieces.push({ part: 'hairPony2', colour: look.hair });
  if (look.facialHair === 'beard') pieces.push({ part: 'beard', colour: look.hair });
  if (look.facialHair === 'moustache') pieces.push({ part: variant(look, 2, 'm') ? 'moustache' : 'moustache2', colour: look.hair });

  // tops
  if (look.crew) {
    pieces.push({ part: f ? 'workShirtF' : 'workShirtM', colour: '#3A86FF' });
    pieces.push({ part: f ? 'workVestF' : 'workVestM', colour: '#FB8500' });
    pieces.push({ part: f ? 'hardHatF' : 'hardHatM', colour: '#FFC300' });
    pieces.push({ part: f ? 'workPantsF' : 'workPantsM', colour: look.shorts });
    return pieces;
  }
  switch (top) {
    case 'tank': pieces.push({ part: f ? 'tankF' : 'tankM', colour: topCol }); break;
    case 'sportsTop': pieces.push({ part: 'tankF', colour: topCol, keep: (d) => !isBelly(d) }); break;
    case 'hoodie': pieces.push({ part: f ? 'tee2F' : 'tee2M', colour: topCol }); break;
    default: pieces.push({ part: f ? 'teeF' : 'teeM', colour: topCol, keep: top === 'vest' ? (d) => !isUpperArm(d) : undefined });
  }
  // bottoms
  switch (bottom) {
    case 'shorts': pieces.push({ part: f ? 'shortsF' : 'shortsM', colour: legCol }); break;
    case 'leggings': pieces.push({ part: f ? 'slimF' : 'slimM', colour: legCol }); break;
    default: pieces.push({ part: f ? 'jeansF' : 'jeansM', colour: legCol });
  }
  if (look.belt && !street) pieces.push({ part: f ? 'beltF' : 'beltM', colour: '#5E3A1E' });
  return pieces;
}

function mixHex(a: string, b: string, t: number): string {
  return `#${tmpC.set(a).lerp(new THREE.Color(b), t).getHexString()}`;
}

/** Simple shapes fixed to the head bone: afro, bun, glasses, headphones. In pack units, bind pose. */
function extras(look: CharacterLook, outfit: Outfit, P: Pack): { geo: THREE.BufferGeometry; colour: string }[] {
  const h = P.head, out: { geo: THREE.BufferGeometry; colour: string }[] = [];
  const c = h.centre, r = h.radius;
  if (look.crew) return out;
  if (look.hairStyle === 'afro') out.push({ geo: new THREE.IcosahedronGeometry(r * 1.32, 1).scale(1.05, 0.92, 1).translate(c.x, c.y + r * 0.32, c.z - r * 0.12), colour: look.hair });
  if (look.hairStyle === 'bun') out.push({ geo: new THREE.IcosahedronGeometry(r * 0.42, 1).translate(c.x, h.top + r * 0.05, c.z - r * 0.45), colour: look.hair });
  if (look.glasses) {
    for (const s of [-1, 1]) out.push({ geo: new THREE.TorusGeometry(r * 0.2, r * 0.035, 4, 10).translate(c.x + s * h.eyeX, h.eyeY, h.front + 0.02), colour: '#1B1B1B' });
    out.push({ geo: new THREE.BoxGeometry(h.eyeX * 0.9, r * 0.05, r * 0.05).translate(c.x, h.eyeY + r * 0.04, h.front + 0.02), colour: '#1B1B1B' });
  }
  if (look.headphones && outfit === 'gym') {
    out.push({ geo: new THREE.TorusGeometry(r * 1.06, r * 0.07, 4, 16, Math.PI).translate(c.x, c.y + r * 0.1, c.z), colour: '#1B1B1B' });
    for (const s of [-1, 1]) out.push({ geo: new THREE.CylinderGeometry(r * 0.26, r * 0.26, r * 0.2, 10).rotateZ(Math.PI / 2).translate(c.x + s * r * 1.06, c.y, c.z), colour: look.trim === '#FFFFFF' ? '#EF476F' : look.trim });
  }
  return out;
}

const geoCache = new Map<string, THREE.BufferGeometry>();

export function packGeometry(look: CharacterLook, outfit: Outfit): THREE.BufferGeometry {
  const key = `${look.key}|${outfit}`;
  const hit = geoCache.get(key);
  if (hit) return hit;
  const P = pack!;
  const pieces = piecesFor(look, outfit, P).filter((p) => P.parts[p.part]);
  const extra = extras(look, outfit, P).map((e) => ({ geo: e.geo.index ? e.geo.toNonIndexed() : e.geo, colour: e.colour }));
  let nv = 0, ni = 0;
  for (const p of pieces) { nv += P.parts[p.part].dom.length; ni += P.parts[p.part].index.length; }
  for (const e of extra) { const c = e.geo.attributes.position.count; nv += c; ni += c; }
  const pos = new Float32Array(nv * 3), col = new Float32Array(nv * 3);
  const si = new Uint16Array(nv * 4), sw = new Float32Array(nv * 4);
  const idx = nv > 65535 ? new Uint32Array(ni) : new Uint16Array(ni);
  // body skin under the clothes would flicker through them: mark the vertices each worn garment covers
  const body = P.parts.body;
  const covered = new Uint8Array(body.dom.length);
  for (const piece of pieces) {
    const part = P.parts[piece.part];
    if (!part.covers) continue;
    for (let k = 0; k < part.covers.length; k += 2) {
      const t = part.covers[k + 1] * 3;
      if (piece.keep && !piece.keep(part.dom[part.index[t]]) && !piece.keep(part.dom[part.index[t + 1]]) && !piece.keep(part.dom[part.index[t + 2]])) continue;
      covered[part.covers[k]] = 1;
    }
  }
  let vo = 0, io = 0;
  for (const piece of pieces) {
    const part = P.parts[piece.part];
    const n = part.dom.length;
    pos.set(part.pos, vo * 3);
    sw.set(part.weights, vo * 4);
    for (let k = 0; k < n * 4; k++) si[vo * 4 + k] = part.joints[k];
    const base = new THREE.Color(piece.colour);
    for (let v = 0; v < n; v++) {
      const over = piece.paint?.(v, part);
      const c = over ? tmpC.set(over) : base;
      col[(vo + v) * 3] = c.r; col[(vo + v) * 3 + 1] = c.g; col[(vo + v) * 3 + 2] = c.b;
    }
    const ix = part.index;
    for (let t = 0; t < ix.length; t += 3) {
      const a = ix[t], b = ix[t + 1], c = ix[t + 2];
      if (piece.keep && !piece.keep(part.dom[a]) && !piece.keep(part.dom[b]) && !piece.keep(part.dom[c])) continue;
      if (part === body && covered[a] && covered[b] && covered[c]) continue;
      idx[io++] = a + vo; idx[io++] = b + vo; idx[io++] = c + vo;
    }
    vo += n;
  }
  for (const e of extra) {
    const p = e.geo.attributes.position;
    const c = new THREE.Color(e.colour);
    for (let v = 0; v < p.count; v++) {
      pos[(vo + v) * 3] = p.getX(v); pos[(vo + v) * 3 + 1] = p.getY(v); pos[(vo + v) * 3 + 2] = p.getZ(v);
      col[(vo + v) * 3] = c.r; col[(vo + v) * 3 + 1] = c.g; col[(vo + v) * 3 + 2] = c.b;
      si[(vo + v) * 4] = J.Head; sw[(vo + v) * 4] = 1;
      idx[io++] = vo + v;
    }
    vo += p.count;
    e.geo.dispose();
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  g.setAttribute('color', new THREE.BufferAttribute(col, 3));
  g.setAttribute('skinIndex', new THREE.BufferAttribute(si, 4));
  g.setAttribute('skinWeight', new THREE.BufferAttribute(sw, 4));
  g.setIndex(new THREE.BufferAttribute(idx.subarray(0, io), 1));
  g.computeBoundingSphere();
  geoCache.set(key, g);
  return g;
}

/** Flat-shaded like the pack's own renders; normals come from the screen-space derivatives, so none are stored. */
export const packMaterial = new THREE.MeshStandardMaterial({ vertexColors: true, flatShading: true, roughness: 0.82, metalness: 0 });

// ---------------------------------------------------------------- the rig

/** Pack units → procedural rig units. Sized so the hips sit a little below the procedural figure's hips. */
export const PACK_SCALE = 0.5;

const qa = new THREE.Quaternion(), qb = new THREE.Quaternion();
const eul = new THREE.Euler();
const hand = new THREE.Vector3(0, 0.13, 0);

export class PackRig {
  readonly object = new THREE.Group();
  readonly bones: THREE.Bone[];
  readonly skeleton: THREE.Skeleton;
  readonly gym: THREE.SkinnedMesh;
  readonly street: THREE.SkinnedMesh;
  private readonly S: SkeletonInfo;
  private readonly P: Pack;
  private readonly procQ: Record<ProcBone, THREE.Quaternion>;
  private readonly world: THREE.Quaternion[];
  private readonly local: THREE.Quaternion[];
  private readonly clipQ: THREE.Quaternion[];
  private readonly clipBody = new THREE.Vector3();
  private readonly ratio: number;
  private clipName: string | null = null;
  private clipT = 0;
  private clipW = 0;

  constructor(look: CharacterLook) {
    const P = (this.P = pack!);
    const S = (this.S = P.skel);
    this.bones = P.manifest.bones.map((b, i) => {
      const bone = new THREE.Bone();
      bone.name = b.name;
      bone.position.copy(S.bindPos[i]); bone.quaternion.copy(S.bindQuat[i]); bone.scale.copy(S.bindScale[i]);
      return bone;
    });
    for (let i = 0; i < S.n; i++) if (S.parent[i] >= 0) this.bones[S.parent[i]].add(this.bones[i]);
    this.skeleton = new THREE.Skeleton(this.bones, S.inverseBind);
    const mk = (geo: THREE.BufferGeometry) => {
      const m = new THREE.SkinnedMesh(geo, packMaterial);
      m.bind(this.skeleton, new THREE.Matrix4());
      m.castShadow = true;
      m.frustumCulled = false;
      m.raycast = () => undefined;
      return m;
    };
    this.gym = mk(packGeometry(look, 'gym'));
    this.street = mk(packGeometry(look, 'street'));
    const width = 0.92 + (look.build - 0.85) * 0.45 + look.muscle * 0.05;
    this.object.scale.set(PACK_SCALE * width, PACK_SCALE, PACK_SCALE * width);
    for (let i = 0; i < S.n; i++) if (S.parent[i] < 0) this.object.add(this.bones[i]);
    this.object.add(this.gym, this.street);
    this.procQ = Object.fromEntries((['hips', 'spine', 'head', 'armL', 'foreL', 'armR', 'foreR', 'thighL', 'shinL', 'thighR', 'shinR'] as ProcBone[])
      .map((b) => [b, new THREE.Quaternion()])) as Record<ProcBone, THREE.Quaternion>;
    this.world = S.bindWorld.map((q) => q.clone());
    this.local = S.bindQuat.map((q) => q.clone());
    this.clipQ = S.bindQuat.map((q) => q.clone());
    this.ratio = (S.hipY * PACK_SCALE) / HIP_Y;
  }

  /** Which pack clip (if any) plays for this moment, and how fast. */
  private clipFor(ctx: PoseContext): [string, number] | null {
    if (ctx.reduced) return null;
    if (ctx.anim === 'walk') return ctx.carry ? ['Walk_Carry', 1.2] : ['Walk', 1.25];
    if (ctx.anim === 'celebrate') return ['Victory', 1];
    if ((ctx.anim === 'cardio' || ctx.anim === 'lift') && ctx.exercise === 'treadmill_run') return ['Run', 1];
    if ((ctx.anim === 'cardio' || ctx.anim === 'lift') && ctx.exercise === 'incline_walk') return ['Walk', 1.1];
    return null;
  }

  /** Pose the skeleton: retarget the procedural pose, then cross-fade towards a pack clip where one fits. */
  apply(p: Pose, ctx: PoseContext, dt: number): void {
    const S = this.S, Q = this.procQ;
    // procedural world rotations (the procedural rig's bones are identity at rest, so world = product of locals)
    Q.hips.setFromEuler(eul.set(p.hipsRot[0], p.hipsRot[1], p.hipsRot[2], 'YXZ'));
    Q.spine.copy(Q.hips).multiply(qa.setFromEuler(eul.set(p.spine[0], p.spine[1], p.spine[2], 'XYZ')));
    Q.head.copy(Q.spine).multiply(qa.setFromEuler(eul.set(p.head[0], p.head[1], p.head[2], 'XYZ')));
    Q.armL.copy(Q.spine).multiply(qa.setFromEuler(eul.set(p.armL[0], p.armL[1], p.armL[2], 'XYZ')));
    Q.foreL.copy(Q.armL).multiply(qa.setFromEuler(eul.set(p.foreL[0], p.foreL[1], p.foreL[2], 'XYZ')));
    Q.armR.copy(Q.spine).multiply(qa.setFromEuler(eul.set(p.armR[0], p.armR[1], p.armR[2], 'XYZ')));
    Q.foreR.copy(Q.armR).multiply(qa.setFromEuler(eul.set(p.foreR[0], p.foreR[1], p.foreR[2], 'XYZ')));
    Q.thighL.copy(Q.hips).multiply(qa.setFromEuler(eul.set(p.thighL[0], p.thighL[1], p.thighL[2], 'XYZ')));
    Q.shinL.copy(Q.thighL).multiply(qa.setFromEuler(eul.set(p.shinL[0], p.shinL[1], p.shinL[2], 'XYZ')));
    Q.thighR.copy(Q.hips).multiply(qa.setFromEuler(eul.set(p.thighR[0], p.thighR[1], p.thighR[2], 'XYZ')));
    Q.shinR.copy(Q.thighR).multiply(qa.setFromEuler(eul.set(p.shinR[0], p.shinR[1], p.shinR[2], 'XYZ')));

    for (const i of S.order) {
      const par = S.parent[i];
      const w = this.world[i];
      const drv = S.driver[i], bl = S.blend[i];
      if (drv) w.copy(Q[drv]).multiply(S.ref[i]);
      else if (bl) w.copy(Q[bl[0]]).slerp(Q[bl[1]], bl[2]).multiply(S.ref[i]);
      else if (par >= 0) w.copy(this.world[par]).multiply(S.bindQuat[i]);
      else w.copy(S.bindQuat[i]);
      if (par >= 0) this.local[i].copy(this.world[par]).invert().multiply(w);
      else this.local[i].copy(w);
    }

    // hips: standing poses scale with the shorter legs; seated / lying poses keep the seat height
    const sup = p.support;
    const k = this.ratio + (1 - this.ratio) * sup;
    const bx = (p.hips[0] * k) / PACK_SCALE, bz = (p.hips[2] * k) / PACK_SCALE;
    const by = (p.hips[1] * k) / PACK_SCALE;
    const body = this.bones[J.Body], bp = S.bindPos[J.Body];
    let px = bp.x + bx, py = bp.y + (by - S.hipY), pz = bp.z + bz;

    // pack clip cross-fade
    const want = this.clipFor(ctx);
    const target = want ? 1 : 0;
    if (want && want[0] !== this.clipName) {
      if (this.clipW < 0.05 || !this.clipName) { this.clipName = want[0]; this.clipT = ctx.variant * 2; }
    }
    this.clipW += (target - this.clipW) * Math.min(1, dt * 7);
    if (this.clipName && this.clipW > 0.01) {
      const clip = this.P.clips[this.clipName];
      if (clip) {
        if (want && want[0] === this.clipName) this.clipT += dt * want[1];
        this.sampleClip(clip, this.clipT);
        const w = want && want[0] !== this.clipName ? this.clipW * 0.5 : this.clipW;
        for (let i = 0; i < S.n; i++) this.local[i].slerp(this.clipQ[i], w);
        px += (this.clipBody.x - px) * w; py += (this.clipBody.y - py) * w; pz += (this.clipBody.z - pz) * w;
      }
    } else if (this.clipW <= 0.01) this.clipName = null;

    for (let i = 0; i < S.n; i++) this.bones[i].quaternion.copy(this.local[i]);
    body.position.set(px, py, pz);
  }

  private sampleClip(c: Clip, t: number): void {
    const S = this.S;
    const f = ((t % c.duration) / c.duration) * (c.frames - 1);
    const i0 = Math.floor(f), i1 = Math.min(c.frames - 1, i0 + 1), fr = f - i0;
    for (let i = 0; i < S.n; i++) this.clipQ[i].copy(S.bindQuat[i]);
    const nb = c.rotBones.length;
    for (let b = 0; b < nb; b++) {
      const o0 = (i0 * nb + b) * 4, o1 = (i1 * nb + b) * 4;
      qa.set(c.rot[o0], c.rot[o0 + 1], c.rot[o0 + 2], c.rot[o0 + 3]);
      qb.set(c.rot[o1], c.rot[o1 + 1], c.rot[o1 + 2], c.rot[o1 + 3]);
      this.clipQ[c.rotBones[b]].copy(qa).slerp(qb, fr);
    }
    this.clipBody.copy(S.bindPos[J.Body]);
    const np = c.posBones.length;
    for (let b = 0; b < np; b++) {
      if (c.posBones[b] !== J.Body) continue;
      const o0 = (i0 * np + b) * 3, o1 = (i1 * np + b) * 3;
      this.clipBody.set(
        c.pos[o0] + (c.pos[o1] - c.pos[o0]) * fr,
        c.pos[o0 + 1] + (c.pos[o1 + 1] - c.pos[o0 + 1]) * fr,
        c.pos[o0 + 2] + (c.pos[o1 + 2] - c.pos[o0 + 2]) * fr,
      );
    }
  }

  /** World position of a hand (procedural naming: 'L' is the x < 0 side). Matrices must be up to date. */
  hand(side: 'L' | 'R', out: THREE.Vector3): THREE.Vector3 {
    return out.copy(hand).applyMatrix4(this.bones[side === 'L' ? J.FistR : J.FistL].matrixWorld);
  }

  /** World orientation of a forearm in the procedural convention (for props held in the hand). */
  foreQuat(side: 'L' | 'R', out: THREE.Quaternion): THREE.Quaternion {
    return this.object.getWorldQuaternion(out).multiply(this.procQ[side === 'L' ? 'foreL' : 'foreR']);
  }

  /** Head centre in the rig object's parent space (rig units), for portraits. */
  static headCentre(out: THREE.Vector3): THREE.Vector3 {
    return out.copy(pack!.head.centre).multiplyScalar(PACK_SCALE);
  }

  dispose(): void { this.skeleton.dispose(); }
}

export type { BoneName };
