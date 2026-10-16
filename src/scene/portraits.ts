// Portrait studio: renders a member's head and shoulders into a small render target (for the Hall of Fame wall)
// and a PNG data URL (for the Hall of Fame panel and profile cards). Baked lazily, a couple per frame.
import { useEffect, useState } from 'react';
import * as THREE from 'three';
import type { CharacterLook } from './character/look';
import { boneInverses, createBones, rigDims, BONES } from './character/rig';
import { bodyMaterial, geometriesFor } from './Avatar';
import { PackRig, packData } from './character/pack';
import { restPose } from './character/poses';

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
export function bakePending(gl: THREE.WebGLRenderer, max = 1): void {
  for (let n = 0; n < max && queue.length; n++) {
    const p = portraits.get(queue.shift()!);
    if (!p || p.baked) continue;
    bake(gl, p);
  }
}

function bakePack(look: CharacterLook): { group: THREE.Group; dispose: () => void } {
  const rig = new PackRig(look);
  const pose = restPose();
  pose.head = [0.05, 0.12, 0.04];
  pose.armL = [0, 0, -0.15]; pose.armR = [0, 0, 0.15];
  rig.apply(pose, { anim: 'idle', t: 0, variant: 0, reduced: true }, 1);
  const group = new THREE.Group();
  group.add(rig.object);
  // frame the pack's bigger head the way the studio frames the built-in figure's (head centre ~1.06)
  const head = PackRig.headCentre(new THREE.Vector3());
  group.position.y = 1.06 - head.y;
  group.scale.setScalar(1);
  return { group, dispose: () => rig.dispose() };
}

function bake(gl: THREE.WebGLRenderer, p: Portrait): void {
  const { scene, cam } = getStudio();
  if (packData()) {
    const { group, dispose } = bakePack(p.look);
    cam.position.set(0.32, 1.12, 1.95); cam.lookAt(0, 1.04, 0);
    scene.add(group);
    group.updateMatrixWorld(true);
    render(gl, p, scene, cam);
    scene.remove(group);
    dispose();
    return;
  }
  cam.position.set(0.28, 1.16, 1.5); cam.lookAt(0, 1.06, 0);
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
  render(gl, p, scene, cam);
  scene.remove(group);
  skeleton.dispose();
}

function render(gl: THREE.WebGLRenderer, p: Portrait, scene: THREE.Scene, cam: THREE.Camera): void {
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
