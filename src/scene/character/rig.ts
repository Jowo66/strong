// Procedural character rig. Builds a chunky, big-headed toy figure out of primitives, rigidly skinned to a
// 15-bone skeleton, merged into ONE geometry per outfit (gym / street) with vertex colours.
// One avatar = one draw call (plus its shadow), which keeps 40 members well inside the draw-call budget.
//
// Coordinates are "rig units": the figure is ~1.4 tall before the scene scale (×1.25 × height).
// Rest pose: standing, arms hanging, facing +Z.
import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js';
import type { CharacterLook } from './look';

export const BONES = ['root', 'hips', 'spine', 'head', 'armL', 'foreL', 'armR', 'foreR', 'thighL', 'shinL', 'thighR', 'shinR', 'mouth', 'brows', 'eyes'] as const;
export type BoneName = (typeof BONES)[number];
const PARENT: Record<BoneName, BoneName | null> = {
  root: null, hips: 'root', spine: 'hips', head: 'spine', armL: 'spine', foreL: 'armL', armR: 'spine', foreR: 'armR',
  thighL: 'hips', shinL: 'thighL', thighR: 'hips', shinR: 'thighR', mouth: 'head', brows: 'head', eyes: 'head',
};
const BI = Object.fromEntries(BONES.map((b, i) => [b, i])) as Record<BoneName, number>;

export const HIP_Y = 0.46;
export const THIGH_LEN = 0.21;
export const SHIN_LEN = 0.25; // knee to sole
export const HEAD_Y = 1.1;

export interface RigDims {
  rest: Record<BoneName, THREE.Vector3>;
  shoulderX: number;
}

export function rigDims(look: CharacterLook): RigDims {
  const wd = look.build;
  const shoulderX = 0.19 * wd + 0.035 * look.muscle - (look.gender === 'female' ? 0.012 : 0);
  const legX = 0.085 * wd;
  const v = (x: number, y: number, z: number) => new THREE.Vector3(x, y, z);
  return {
    shoulderX,
    rest: {
      root: v(0, 0, 0), hips: v(0, HIP_Y, 0), spine: v(0, 0.52, 0), head: v(0, 0.88, 0),
      armL: v(-shoulderX, 0.83, 0), foreL: v(-shoulderX, 0.63, 0),
      armR: v(shoulderX, 0.83, 0), foreR: v(shoulderX, 0.63, 0),
      thighL: v(-legX, HIP_Y, 0), shinL: v(-legX, HIP_Y - THIGH_LEN, 0),
      thighR: v(legX, HIP_Y, 0), shinR: v(legX, HIP_Y - THIGH_LEN, 0),
      mouth: v(0, 1.0, 0.22), brows: v(0, 1.19, 0.215), eyes: v(0, 1.12, 0.215),
    },
  };
}

/** A fresh bone hierarchy in rest pose. Returns the bones in BONES order (index 0 = root). */
export function createBones(dims: RigDims): THREE.Bone[] {
  const bones = BONES.map((name) => { const b = new THREE.Bone(); b.name = name; return b; });
  BONES.forEach((name, i) => {
    const p = PARENT[name];
    const pos = dims.rest[name].clone();
    if (p) { pos.sub(dims.rest[p]); bones[BI[p]].add(bones[i]); }
    bones[i].position.copy(pos);
  });
  return bones;
}

/** Inverse bind matrices for the rest pose (bones carry no rotation at rest, so it's just a translation). */
export function boneInverses(dims: RigDims): THREE.Matrix4[] {
  return BONES.map((b) => new THREE.Matrix4().makeTranslation(-dims.rest[b].x, -dims.rest[b].y, -dims.rest[b].z));
}

// ---------- geometry assembly ----------

const tmpColor = new THREE.Color();

class Builder {
  parts: THREE.BufferGeometry[] = [];

  add(geo: THREE.BufferGeometry, colour: string, bone: BoneName, m?: THREE.Matrix4): void {
    let g = geo.index ? geo.toNonIndexed() : geo;
    if (g === geo) g = geo.clone();
    if (m) g.applyMatrix4(m);
    g.deleteAttribute('uv');
    const n = g.attributes.position.count;
    tmpColor.set(colour);
    const col = new Float32Array(n * 3);
    const si = new Uint16Array(n * 4);
    const sw = new Float32Array(n * 4);
    for (let i = 0; i < n; i++) {
      col[i * 3] = tmpColor.r; col[i * 3 + 1] = tmpColor.g; col[i * 3 + 2] = tmpColor.b;
      si[i * 4] = BI[bone];
      sw[i * 4] = 1;
    }
    g.setAttribute('color', new THREE.BufferAttribute(col, 3));
    g.setAttribute('skinIndex', new THREE.BufferAttribute(si, 4));
    g.setAttribute('skinWeight', new THREE.BufferAttribute(sw, 4));
    this.parts.push(g);
    geo.dispose();
  }

  merge(): THREE.BufferGeometry {
    const g = mergeGeometries(this.parts, false)!;
    for (const p of this.parts) p.dispose();
    g.computeBoundingSphere();
    return g;
  }
}

const M = (x = 0, y = 0, z = 0, rx = 0, ry = 0, rz = 0, sx = 1, sy = 1, sz = 1) =>
  new THREE.Matrix4().compose(new THREE.Vector3(x, y, z), new THREE.Quaternion().setFromEuler(new THREE.Euler(rx, ry, rz)), new THREE.Vector3(sx, sy, sz));

const sphere = (r: number, w = 10, h = 6) => new THREE.SphereGeometry(r, w, h);
const capsule = (r: number, len: number, seg = 7) => new THREE.CapsuleGeometry(r, len, 2, seg);
const rbox = (w: number, h: number, d: number, rad: number) =>
  Math.min(w, h, d) < 0.045 ? new THREE.BoxGeometry(w, h, d) : new RoundedBoxGeometry(w, h, d, 1, Math.min(rad, w / 2 - 0.001, h / 2 - 0.001, d / 2 - 0.001));
const cyl = (rt: number, rb: number, h: number, seg = 9, open = false) => new THREE.CylinderGeometry(rt, rb, h, seg, 1, open);

function shade(hex: string, k: number): string {
  const c = new THREE.Color(hex);
  c.multiplyScalar(k);
  return `#${c.getHexString()}`;
}
function mix(a: string, b: string, t: number): string {
  return `#${new THREE.Color(a).lerp(new THREE.Color(b), t).getHexString()}`;
}

export type Outfit = 'gym' | 'street';

export function buildCharacterGeometry(look: CharacterLook, outfit: Outfit, dims: RigDims): THREE.BufferGeometry {
  const b = new Builder();
  const R = dims.rest;
  const wd = look.build, mu = look.muscle;
  const female = look.gender === 'female';
  const skin = look.skin;
  const street = outfit === 'street' && !look.crew;

  // --- colours per region ---
  const torsoCol = street ? look.street : look.shirt;
  const sleeveCol = street ? look.street : look.top === 'tank' || look.top === 'sportsTop' ? skin : look.top === 'vest' ? '#3A86FF' : look.shirt;
  const fullSleeve = street || look.top === 'longsleeve';
  const bottom = street ? 'joggers' : look.bottom;
  const legCol = street ? look.streetBottom : look.shorts;

  // --- legs ---
  for (const side of ['L', 'R'] as const) {
    const thigh = `thigh${side}` as BoneName, shin = `shin${side}` as BoneName;
    const x = R[thigh].x;
    const tr = 0.07 * wd + 0.012 * mu;
    b.add(capsule(tr, 0.13), bottom === 'shorts' ? legCol : legCol, thigh, M(x, HIP_Y - 0.1, 0));
    const shinCol = bottom === 'shorts' ? skin : legCol;
    b.add(capsule(0.056 * wd + 0.006 * mu, 0.12), shinCol, shin, M(x, HIP_Y - THIGH_LEN - 0.09, 0));
    if (bottom === 'shorts') b.add(cyl(tr + 0.012, tr + 0.02, 0.06, 10), shade(legCol, 0.85), thigh, M(x, HIP_Y - 0.17, 0)); // hem
    if (bottom === 'leggings' || bottom === 'joggers') b.add(cyl(0.062 * wd, 0.064 * wd, 0.035, 10), bottom === 'joggers' ? shade(legCol, 0.8) : skin, shin, M(x, 0.105, 0));
    // sneaker
    b.add(rbox(0.12, 0.085, 0.21, 0.035), look.shoes, shin, M(x, 0.055, 0.035));
    b.add(rbox(0.125, 0.025, 0.215, 0.01), look.sole, shin, M(x, 0.012, 0.035));
  }

  // --- pelvis / waistband ---
  b.add(rbox(0.31 * wd, 0.15, 0.21, 0.06), legCol, 'hips', M(0, HIP_Y + 0.01, 0));
  if (bottom === 'shorts' && !street) b.add(rbox(0.315 * wd, 0.03, 0.215, 0.01), look.trim, 'hips', M(0, HIP_Y + 0.08, 0));

  // --- torso ---
  const tw = 0.34 * wd + 0.06 * mu - (female ? 0.03 : 0);
  const torsoH = 0.37;
  const torsoY = 0.7;
  if (look.top === 'sportsTop' && !street) {
    b.add(rbox(tw - 0.01, torsoH * 0.55, 0.22, 0.07), mix(skin, '#000', 0.04), 'spine', M(0, torsoY - torsoH * 0.22, 0));
    b.add(rbox(tw, torsoH * 0.55, 0.235, 0.08), torsoCol, 'spine', M(0, torsoY + torsoH * 0.2, 0));
    b.add(rbox(tw * 0.97, 0.022, 0.238, 0.01), shade(torsoCol, 0.75), 'spine', M(0, torsoY - 0.03, 0));
  } else {
    // tapered torso: a rounded box over a slightly narrower waist
    b.add(rbox(tw, torsoH * 0.62, 0.235 + 0.02 * mu, 0.08), torsoCol, 'spine', M(0, torsoY + 0.06, 0));
    b.add(rbox(tw * 0.88 + look.belly * 0.05, torsoH * 0.5, 0.22 + look.belly * 0.05, 0.08), torsoCol, 'spine', M(0, torsoY - 0.09, 0.0 + look.belly * 0.02));
    if (look.belly > 0) b.add(sphere(0.13 + 0.03 * look.belly, 12, 8), torsoCol, 'spine', M(0, torsoY - 0.1, 0.06 + 0.03 * look.belly, 0, 0, 0, 1.2, 1, 0.9));
    if (look.top === 'tank' && !street) {
      // skin at the shoulders, coloured straps
      b.add(rbox(tw * 0.55, 0.06, 0.2, 0.02), skin, 'spine', M(0, torsoY + 0.17, 0));
      b.add(rbox(0.05, 0.08, 0.24, 0.02), torsoCol, 'spine', M(-tw * 0.22, torsoY + 0.17, 0));
      b.add(rbox(0.05, 0.08, 0.24, 0.02), torsoCol, 'spine', M(tw * 0.22, torsoY + 0.17, 0));
    }
    if (!street && look.top === 'tee') b.add(rbox(0.12, 0.02, 0.02, 0.008), look.trim, 'spine', M(0, torsoY + 0.17, 0.125)); // collar
    if (female && !street && look.top !== 'vest') b.add(rbox(tw * 0.8, 0.09, 0.05, 0.03), torsoCol, 'spine', M(0, torsoY + 0.06, 0.125));
  }
  if (!street && (look.top === 'tee' || look.top === 'longsleeve')) {
    // chest logo stripe: a tiny brand-like mark that helps silhouettes read at distance
    b.add(rbox(0.08, 0.04, 0.01, 0.005), look.trim, 'spine', M(tw * 0.18, torsoY + 0.08, 0.13 + 0.01 * mu));
  }
  if (look.top === 'vest') {
    // hi-vis vest with reflective stripes over a blue work shirt
    b.add(rbox(tw + 0.025, torsoH * 0.95, 0.26, 0.07), '#FB8500', 'spine', M(0, torsoY, 0));
    b.add(rbox(tw + 0.03, 0.035, 0.265, 0.01), look.trim, 'spine', M(0, torsoY - 0.05, 0));
    b.add(rbox(tw + 0.03, 0.035, 0.265, 0.01), look.trim, 'spine', M(0, torsoY + 0.06, 0));
    // tool belt with pouches
    b.add(rbox(0.33 * wd, 0.05, 0.23, 0.02), '#6F4E37', 'hips', M(0, HIP_Y + 0.06, 0));
    b.add(rbox(0.07, 0.09, 0.06, 0.02), '#8B5E34', 'hips', M(-0.13 * wd, HIP_Y + 0.01, 0.1));
    b.add(rbox(0.06, 0.08, 0.06, 0.02), '#8B5E34', 'hips', M(0.13 * wd, HIP_Y + 0.01, 0.1));
    b.add(cyl(0.01, 0.01, 0.12, 6), '#ADB5BD', 'hips', M(0.13 * wd, HIP_Y + 0.08, 0.1));
  }
  if (street) {
    // hoodie: hood bunched behind the neck, kangaroo pocket, drawstrings
    b.add(sphere(0.12, 12, 8), shade(look.street, 0.9), 'spine', M(0, torsoY + 0.2, -0.1, 0, 0, 0, 1.5, 0.8, 0.9));
    b.add(rbox(tw * 0.6, 0.09, 0.02, 0.02), shade(look.street, 0.88), 'spine', M(0, torsoY - 0.1, 0.12));
    b.add(cyl(0.006, 0.006, 0.09, 4), '#F8F9FA', 'spine', M(-0.035, torsoY + 0.1, 0.125));
    b.add(cyl(0.006, 0.006, 0.09, 4), '#F8F9FA', 'spine', M(0.035, torsoY + 0.1, 0.125));
  }
  if (look.belt && !street) {
    b.add(rbox(0.33 * wd, 0.075, 0.24, 0.02), '#5E3A1E', 'spine', M(0, 0.555, 0));
    b.add(rbox(0.06, 0.05, 0.02, 0.01), '#D4AF37', 'spine', M(0, 0.555, 0.125));
  }
  // neck
  b.add(cyl(0.065, 0.07, 0.08, 10), skin, 'spine', M(0, 0.89, 0));

  // --- arms ---
  for (const side of ['L', 'R'] as const) {
    const arm = `arm${side}` as BoneName, fore = `fore${side}` as BoneName;
    const x = R[arm].x;
    const ar = 0.052 * wd + 0.022 * mu;
    b.add(sphere(ar + 0.02, 8, 5), sleeveCol, arm, M(x, 0.815, 0)); // shoulder
    b.add(capsule(ar, 0.12), skin, arm, M(x, 0.73, 0));
    if (sleeveCol !== skin) b.add(cyl(ar + 0.012, ar + 0.016, fullSleeve ? 0.18 : 0.1, 10), sleeveCol, arm, M(x, fullSleeve ? 0.72 : 0.77, 0));
    if (mu > 0.5) b.add(sphere(ar * 0.85, 6, 4), fullSleeve ? sleeveCol : skin, arm, M(x, 0.72, 0.03)); // bicep
    b.add(capsule(0.044 * wd + 0.012 * mu, 0.12), fullSleeve ? sleeveCol : skin, fore, M(x, 0.54, 0));
    if (fullSleeve) b.add(cyl(0.05 * wd, 0.05 * wd, 0.03, 8), shade(sleeveCol, 0.85), fore, M(x, 0.465, 0));
    if (look.wristbands && !street) b.add(cyl(0.052, 0.052, 0.04, 8), look.trim, fore, M(x, 0.47, 0));
    b.add(sphere(0.055, 8, 5), skin, fore, M(x, 0.43, 0.005, 0, 0, 0, 1, 1.1, 0.85)); // fist
  }

  // --- head ---
  const hy = HEAD_Y;
  b.add(sphere(0.25, 16, 11), skin, 'head', M(0, hy, 0, 0, 0, 0, 1, 0.96, 0.95));
  b.add(sphere(0.045, 6, 4), skin, 'head', M(-0.248, hy - 0.01, 0, 0, 0, 0, 0.6, 1, 1));
  b.add(sphere(0.045, 6, 4), skin, 'head', M(0.248, hy - 0.01, 0, 0, 0, 0, 0.6, 1, 1));
  b.add(sphere(0.032, 6, 4), shade(skin, 0.9), 'head', M(0, hy - 0.035, 0.235));
  // cheeks
  b.add(sphere(0.04, 6, 3), mix(skin, '#FF6B6B', 0.28), 'head', M(-0.135, hy - 0.06, 0.19, 0, 0, 0, 1, 0.7, 0.4));
  b.add(sphere(0.04, 6, 3), mix(skin, '#FF6B6B', 0.28), 'head', M(0.135, hy - 0.06, 0.19, 0, 0, 0, 1, 0.7, 0.4));
  // eyes (white glint) on the eyes bone so they can blink
  for (const x of [-0.085, 0.085]) {
    b.add(sphere(0.034, 8, 5), '#15151A', 'eyes', M(x, 1.12, 0.218, 0, 0, 0, 0.9, 1.1, 0.5));
    b.add(sphere(0.011, 4, 2), '#FFFFFF', 'eyes', M(x + 0.012, 1.135, 0.234));
  }
  // brows
  const browCol = look.hairStyle === 'bald' ? shade(skin, 0.6) : shade(look.hair, 0.9);
  b.add(rbox(0.075, 0.02, 0.02, 0.008), browCol, 'brows', M(-0.088, 1.19, 0.215, 0, 0, 0.12));
  b.add(rbox(0.075, 0.02, 0.02, 0.008), browCol, 'brows', M(0.088, 1.19, 0.215, 0, 0, -0.12));
  // mouth (scaled on Y by the mouth bone to talk, grin and shout)
  const mouthZ = look.facialHair === 'beard' ? 0.245 : 0.222;
  b.add(sphere(0.04, 8, 4), '#5A1F24', 'mouth', M(0, 1.0, mouthZ, 0, 0, 0, 1.25, 0.42, 0.45));
  if (look.glasses) {
    for (const x of [-0.085, 0.085]) b.add(new THREE.TorusGeometry(0.045, 0.009, 4, 10), '#1B1B1B', 'head', M(x, 1.12, 0.235));
    b.add(rbox(0.06, 0.012, 0.012, 0.004), '#1B1B1B', 'head', M(0, 1.125, 0.24));
  }
  addFacialHair(b, look, hy);
  addHair(b, look, hy);
  if (look.headphones && !street) {
    b.add(new THREE.TorusGeometry(0.265, 0.018, 6, 20, Math.PI), '#1B1B1B', 'head', M(0, hy + 0.02, 0));
    for (const x of [-0.26, 0.26]) b.add(cyl(0.07, 0.07, 0.05, 12), look.trim === '#FFFFFF' ? '#EF476F' : look.trim, 'head', M(x, hy - 0.01, 0, 0, 0, Math.PI / 2));
  }
  if (look.crew) {
    // hard hat with brim and a ridge
    b.add(new THREE.SphereGeometry(0.28, 14, 5, 0, Math.PI * 2, 0, Math.PI / 2), '#FFC300', 'head', M(0, hy + 0.05, 0));
    b.add(cyl(0.34, 0.34, 0.025, 20), '#FFB000', 'head', M(0, hy + 0.05, 0.03));
    b.add(rbox(0.06, 0.06, 0.5, 0.02), '#FFD43B', 'head', M(0, hy + 0.31, 0));
  }
  if (street && !look.crew) {
    // street shoes look heavier: nothing else to add; the hoodie and trousers carry the change
  }
  return b.merge();
}

function addFacialHair(b: Builder, look: CharacterLook, hy: number): void {
  const col = look.hair === '#8C8C8C' ? '#9A9A9A' : look.hair;
  switch (look.facialHair) {
    case 'beard':
      b.add(new THREE.SphereGeometry(0.258, 16, 8, -Math.PI * 0.05, Math.PI * 1.1, Math.PI * 0.5, Math.PI * 0.32), col, 'head', M(0, hy, 0, 0, -Math.PI / 2 + Math.PI * 0.5, 0, 1, 0.98, 0.98));
      b.add(rbox(0.12, 0.03, 0.03, 0.01), col, 'head', M(0, 1.035, 0.235));
      break;
    case 'stubble':
      b.add(new THREE.SphereGeometry(0.252, 16, 8, 0, Math.PI, Math.PI * 0.55, Math.PI * 0.25), mix(look.skin, col, 0.35), 'head', M(0, hy, 0, 0, 0, 0, 1, 0.97, 0.96));
      break;
    case 'moustache':
      b.add(rbox(0.11, 0.03, 0.03, 0.012), col, 'head', M(0, 1.035, 0.232));
      break;
  }
}

function addHair(b: Builder, look: CharacterLook, hy: number): void {
  const c = look.hair;
  const cap = (r: number, theta: number, tilt = -0.25) =>
    b.add(new THREE.SphereGeometry(r, 14, 6, 0, Math.PI * 2, 0, theta), c, 'head', M(0, hy + 0.01, -0.01, tilt, 0, 0));
  switch (look.hairStyle) {
    case 'bald':
      return;
    case 'buzz':
      cap(0.256, Math.PI * 0.42);
      return;
    case 'short':
      cap(0.268, Math.PI * 0.5);
      b.add(rbox(0.3, 0.07, 0.09, 0.03), c, 'head', M(0.02, hy + 0.17, 0.17, -0.5, 0, -0.15)); // fringe
      return;
    case 'spiky':
      cap(0.262, Math.PI * 0.47);
      for (let i = 0; i < 7; i++) {
        const a = (i / 7) * Math.PI * 2;
        b.add(new THREE.ConeGeometry(0.06, 0.15, 6), c, 'head', M(Math.cos(a) * 0.12, hy + 0.25, Math.sin(a) * 0.1 - 0.02, Math.sin(a) * 0.5, 0, -Math.cos(a) * 0.5));
      }
      b.add(new THREE.ConeGeometry(0.07, 0.18, 6), c, 'head', M(0, hy + 0.3, 0));
      return;
    case 'bun':
      cap(0.266, Math.PI * 0.52);
      b.add(sphere(0.105, 12, 8), c, 'head', M(0, hy + 0.27, -0.08));
      return;
    case 'ponytail':
      cap(0.266, Math.PI * 0.52);
      b.add(sphere(0.06, 8, 6), c, 'head', M(0, hy + 0.12, -0.25));
      b.add(capsule(0.065, 0.2, 8), c, 'head', M(0, hy - 0.04, -0.3, 0.35, 0, 0));
      return;
    case 'long':
      cap(0.27, Math.PI * 0.55);
      b.add(rbox(0.46, 0.38, 0.14, 0.06), c, 'head', M(0, hy - 0.14, -0.15, 0.08, 0, 0));
      return;
    case 'curly':
      for (let i = 0; i < 16; i++) {
        const a = (i / 16) * Math.PI * 2 * 2.618;
        const el = 0.15 + (i / 16) * 1.1;
        const x = Math.cos(a) * Math.sin(el) * 0.25, z = Math.sin(a) * Math.sin(el) * 0.25 - 0.03, y = Math.cos(el) * 0.25;
        b.add(sphere(0.09, 7, 5), c, 'head', M(x, hy + y + 0.03, z));
      }
      return;
    case 'afro':
      b.add(sphere(0.34, 14, 9), c, 'head', M(0, hy + 0.1, -0.05, 0, 0, 0, 1.05, 0.95, 1));
      return;
    default:
      cap(0.268, Math.PI * 0.5);
  }
}

/** A dumbbell, centred on its handle, handle along X (hand-held). */
export function dumbbellGeometry(): THREE.BufferGeometry {
  const parts = [
    new THREE.CylinderGeometry(0.018, 0.018, 0.2, 8).rotateZ(Math.PI / 2),
    new THREE.CylinderGeometry(0.06, 0.06, 0.06, 10).rotateZ(Math.PI / 2).translate(-0.11, 0, 0),
    new THREE.CylinderGeometry(0.06, 0.06, 0.06, 10).rotateZ(Math.PI / 2).translate(0.11, 0, 0),
  ];
  const cols = ['#ADB5BD', '#2B2D42', '#2B2D42'];
  const out = parts.map((p, i) => {
    const g = p.toNonIndexed(); p.dispose();
    g.deleteAttribute('uv');
    const c = new THREE.Color(cols[i]);
    const arr = new Float32Array(g.attributes.position.count * 3);
    for (let k = 0; k < arr.length; k += 3) { arr[k] = c.r; arr[k + 1] = c.g; arr[k + 2] = c.b; }
    g.setAttribute('color', new THREE.BufferAttribute(arr, 3));
    return g;
  });
  return mergeGeometries(out)!;
}
