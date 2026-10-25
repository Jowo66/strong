// Furniture and props from Quaternius packs (CC0), converted by scripts/build-props.py: plants, the couch, the coffee
// table, bar stools and the reception trophy. Each prop arrives with flat material colours baked per vertex, so the
// room merges it into its static vertex-coloured geometry (kit.ts). If the file is missing the room keeps its
// primitive stand-ins.
import * as THREE from 'three';

interface Manifest {
  props: Record<string, { vertices: number; indices: number; position: number; colour: number; index: number; size: [number, number, number] }>;
}

export interface PropModel {
  geo: THREE.BufferGeometry;    // non-indexed, footprint centred on the origin, base at y = 0, facing +Z
  size: [number, number, number];
}

let props: Record<string, PropModel> | null = null;
let loading: Promise<Record<string, PropModel> | null> | null = null;

/** The props, once loaded (null until then, or if they failed to load). */
export const propsData = (): Record<string, PropModel> | null => props;

export function loadProps(): Promise<Record<string, PropModel> | null> {
  if (props) return Promise.resolve(props);
  if (!loading) {
    const base = import.meta.env.BASE_URL;
    loading = Promise.all([
      fetch(`${base}props/props.json`).then((r) => { if (!r.ok) throw new Error(`props.json ${r.status}`); return r.json() as Promise<Manifest>; }),
      fetch(`${base}props/props.bin`).then((r) => { if (!r.ok) throw new Error(`props.bin ${r.status}`); return r.arrayBuffer(); }),
    ]).then(([m, bin]) => (props = decode(m, bin)))
      .catch((e) => { console.warn('Mini Gym: props unavailable, using built-in shapes.', e); return null; });
  }
  return loading;
}

function decode(m: Manifest, bin: ArrayBuffer): Record<string, PropModel> {
  const out: Record<string, PropModel> = {};
  for (const [id, p] of Object.entries(m.props)) {
    const q = new Int16Array(bin, p.position, p.vertices * 3);
    const c = new Uint8Array(bin, p.colour, p.vertices * 3);
    const idx = new Uint16Array(bin, p.index, p.indices);
    const [w, h, d] = p.size;
    const pos = new Float32Array(p.indices * 3), col = new Float32Array(p.indices * 3);
    for (let k = 0; k < p.indices; k++) {
      const v = idx[k];
      pos[k * 3] = (q[v * 3] / 32767) * (w / 2);
      pos[k * 3 + 1] = ((q[v * 3 + 1] + 32768) / 65535) * h;
      pos[k * 3 + 2] = (q[v * 3 + 2] / 32767) * (d / 2);
      for (let j = 0; j < 3; j++) col[k * 3 + j] = c[v * 3 + j] / 255;
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    geo.setAttribute('color', new THREE.BufferAttribute(col, 3));
    geo.setAttribute('uv', new THREE.BufferAttribute(new Float32Array(p.indices * 2), 2));
    geo.computeVertexNormals(); // non-indexed, so these are flat face normals: the low-poly look of the pack
    // the kit's material works in linear colour; the file stores sRGB
    const tmp = new THREE.Color();
    for (let k = 0; k < p.indices; k++) {
      tmp.setRGB(col[k * 3], col[k * 3 + 1], col[k * 3 + 2], THREE.SRGBColorSpace);
      col[k * 3] = tmp.r; col[k * 3 + 1] = tmp.g; col[k * 3 + 2] = tmp.b;
    }
    out[id] = { geo, size: p.size };
  }
  return out;
}
