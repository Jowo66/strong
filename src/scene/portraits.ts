// Portrait studio: renders a member's head and shoulders into a small render target (for the Hall of Fame wall)
// and a PNG data URL (for the Hall of Fame panel and profile cards). Baked lazily, a couple per frame.
import { useEffect, useState } from 'react';
import * as THREE from 'three';
import type { CharacterLook } from './character/look';
import { boneInverses, createBones, rigDims, BONES } from './character/rig';
import { bodyMaterial, geometriesFor } from './Avatar';

const SIZE = 160;

interface Portrait { rt: THREE.WebGLRenderTarget; look: CharacterLook; url: string | null; baked: boolean }
const portraits = new Map<string, Portrait>();
const queue: string[] = [];
const listeners = new Set<() => void>();

let studio: { scene: THREE.Scene; cam: THREE.PerspectiveCamera } | null = null;
function getStudio() {
  if (studio) return studio;
  const scene = new THREE.Scene();
  scene.background = new THREE.Color('#FFF1D0');
  scene.add(new THREE.HemisphereLight('#FFF8EE', '#B9A58C', 1.4));
  const key = new THREE.DirectionalLight('#FFF1DC', 2.2);
  key.position.set(1.5, 2.5, 2.5);
  scene.add(key);
  const cam = new THREE.PerspectiveCamera(30, 1, 0.1, 10);
  cam.position.set(0.28, 1.16, 1.5);
  cam.lookAt(0, 1.06, 0);
  studio = { scene, cam };
  return studio;
}

/** The portrait for a look. Its texture is valid immediately and fills in once baked. */
export function portraitFor(look: CharacterLook): Portrait {
  let p = portraits.get(look.key);
  if (!p) {
    const rt = new THREE.WebGLRenderTarget(SIZE, SIZE);
    rt.texture.colorSpace = THREE.SRGBColorSpace;
    p = { rt, look, url: null, baked: false };
    portraits.set(look.key, p);
    queue.push(look.key);
  }
  return p;
}

/** Call once per frame from inside the Canvas. */
export function bakePending(gl: THREE.WebGLRenderer, max = 2): void {
  for (let n = 0; n < max && queue.length; n++) {
    const p = portraits.get(queue.shift()!);
    if (!p || p.baked) continue;
    bake(gl, p);
  }
}

function bake(gl: THREE.WebGLRenderer, p: Portrait): void {
  const { scene, cam } = getStudio();
  const dims = rigDims(p.look);
  const bones = createBones(dims);
  const skeleton = new THREE.Skeleton(bones, boneInverses(dims));
  const mesh = new THREE.SkinnedMesh(geometriesFor(p.look).gym, bodyMaterial);
  mesh.bind(skeleton, new THREE.Matrix4());
  mesh.frustumCulled = false;
  const B = Object.fromEntries(BONES.map((b, i) => [b, bones[i]]));
  // a proud little smile and a slight head tilt for the photo
  B.mouth.scale.set(0.9, 2.2, 1);
  B.head.rotation.set(0.05, 0.12, 0.04);
  B.armL.rotation.z = -0.15; B.armR.rotation.z = 0.15;
  const group = new THREE.Group();
  group.add(bones[0], mesh);
  scene.add(group);
  group.updateMatrixWorld(true);

  const prev = gl.getRenderTarget();
  const prevTone = gl.toneMapping;
  gl.setRenderTarget(p.rt);
  gl.toneMapping = THREE.NoToneMapping;
  gl.clear();
  gl.render(scene, cam);
  // read back for the DOM (rows come bottom-up)
  const px = new Uint8Array(SIZE * SIZE * 4);
  gl.readRenderTargetPixels(p.rt, 0, 0, SIZE, SIZE, px);
  gl.setRenderTarget(prev);
  gl.toneMapping = prevTone;
  scene.remove(group);
  skeleton.dispose();

  const canvas = document.createElement('canvas');
  canvas.width = SIZE; canvas.height = SIZE;
  const ctx = canvas.getContext('2d')!;
  const img = ctx.createImageData(SIZE, SIZE);
  for (let y = 0; y < SIZE; y++) img.data.set(px.subarray((SIZE - 1 - y) * SIZE * 4, (SIZE - y) * SIZE * 4), y * SIZE * 4);
  ctx.putImageData(img, 0, 0);
  p.url = px.some((v, i) => i % 4 !== 3 && v !== 0) ? canvas.toDataURL('image/png') : null;
  p.baked = true;
  for (const fn of listeners) fn();
}

/** A data URL for the member's portrait (undefined until it has been baked inside the running scene). */
export function usePortraitUrl(look: CharacterLook | null): string | undefined {
  const [, force] = useState(0);
  useEffect(() => {
    const fn = () => force((x) => x + 1);
    listeners.add(fn);
    return () => { listeners.delete(fn); };
  }, []);
  if (!look) return undefined;
  return portraitFor(look).url ?? undefined;
}
