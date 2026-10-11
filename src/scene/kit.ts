// Geometry kit for the code-built diorama: primitives with baked vertex colours, merged into one geometry
// per object so each piece of equipment (and each chunk of the room) is a single draw call.
import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js';

const tmp = new THREE.Color();
const up = new THREE.Vector3(0, 1, 0);

export class Kit {
  private parts: THREE.BufferGeometry[] = [];

  add(geo: THREE.BufferGeometry, colour: string, m?: THREE.Matrix4): this {
    const g = geo.index ? geo.toNonIndexed() : geo.clone();
    geo.dispose();
    if (m) g.applyMatrix4(m);
    if (!g.attributes.uv) g.setAttribute('uv', new THREE.BufferAttribute(new Float32Array(g.attributes.position.count * 2), 2));
    tmp.set(colour);
    const n = g.attributes.position.count;
    const col = new Float32Array(n * 3);
    for (let i = 0; i < n; i++) { col[i * 3] = tmp.r; col[i * 3 + 1] = tmp.g; col[i * 3 + 2] = tmp.b; }
    g.setAttribute('color', new THREE.BufferAttribute(col, 3));
    this.parts.push(g);
    return this;
  }

  box(w: number, h: number, d: number, colour: string, x: number, y: number, z: number, ry = 0): this {
    return this.add(new THREE.BoxGeometry(w, h, d), colour, at(x, y, z, 0, ry, 0));
  }

  /** Rounded box; y is the CENTRE. */
  rbox(w: number, h: number, d: number, r: number, colour: string, x: number, y: number, z: number, rx = 0, ry = 0, rz = 0): this {
    const rr = Math.min(r, w / 2 - 0.001, h / 2 - 0.001, d / 2 - 0.001);
    return this.add(new RoundedBoxGeometry(w, h, d, 1, Math.max(0.001, rr)), colour, at(x, y, z, rx, ry, rz));
  }

  cyl(r: number, h: number, colour: string, x: number, y: number, z: number, rx = 0, ry = 0, rz = 0, seg = 10, rb?: number): this {
    return this.add(new THREE.CylinderGeometry(r, rb ?? r, h, seg), colour, at(x, y, z, rx, ry, rz));
  }

  sphere(r: number, colour: string, x: number, y: number, z: number, sx = 1, sy = 1, sz = 1, seg = 10): this {
    return this.add(new THREE.SphereGeometry(r, seg, Math.max(5, seg - 5)), colour, at(x, y, z, 0, 0, 0, sx, sy, sz));
  }

  /** A round tube between two points. */
  tube(a: [number, number, number], b: [number, number, number], r: number, colour: string, seg = 8): this {
    const va = new THREE.Vector3(...a), vb = new THREE.Vector3(...b);
    const len = va.distanceTo(vb);
    const q = new THREE.Quaternion().setFromUnitVectors(up, vb.clone().sub(va).normalize());
    const m = new THREE.Matrix4().compose(va.clone().add(vb).multiplyScalar(0.5), q, new THREE.Vector3(1, 1, 1));
    return this.add(new THREE.CylinderGeometry(r, r, len, seg), colour, m);
  }

  /** Flat plane on the floor (or any height), facing up. */
  floor(w: number, d: number, colour: string, x: number, y: number, z: number): this {
    return this.add(new THREE.PlaneGeometry(w, d), colour, at(x, y, z, -Math.PI / 2, 0, 0));
  }

  build(): THREE.BufferGeometry {
    const g = mergeGeometries(this.parts, false)!;
    for (const p of this.parts) p.dispose();
    this.parts = [];
    g.computeBoundingSphere();
    return g;
  }
}

export function at(x = 0, y = 0, z = 0, rx = 0, ry = 0, rz = 0, sx = 1, sy = 1, sz = 1): THREE.Matrix4 {
  return new THREE.Matrix4().compose(new THREE.Vector3(x, y, z), new THREE.Quaternion().setFromEuler(new THREE.Euler(rx, ry, rz)), new THREE.Vector3(sx, sy, sz));
}

/** Shared matte material for all vertex-coloured static geometry. */
export const kitMaterial = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.72, metalness: 0.05 });
/** Same, slightly shinier, for equipment. */
export const equipmentMaterial = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.5, metalness: 0.15 });
