// Shared per-scene helpers that replace per-member objects (a big win with 20+ members on screen):
//  • BubbleLayer: ONE DOM overlay for every speech bubble and title banner. Only members that are actually saying
//    something get an element, positioned once per frame. (Previously every member had its own drei <Html>,
//    re-projected and restyled every frame even when empty.)
//  • AuraLight: ONE point light that follows whoever is powering up. (Previously every member carried a light;
//    each light adds per-pixel work to every lit material, and the count changed whenever someone came or went,
//    which recompiled every shader in the scene.)
import { useEffect, useMemo, useRef } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import * as THREE from 'three';
import type { Bubble } from '../sim/types';

// ------------------------------------------------------------------ bubbles

export interface BubbleSource { anchor: THREE.Object3D; bubble: Bubble | null; banner: Bubble | null }
const sources = new Map<string, BubbleSource>();
let serial = 0;

/** Register a member's speech anchor. Returns the record to update each frame and a cleanup function.
 *  Keys are unique per registration: the same member can appear in two scenes (the gym and the creator preview). */
export function registerBubble(id: string, anchor: THREE.Object3D): [BubbleSource, () => void] {
  const key = `${id}#${serial++}`;
  const src: BubbleSource = { anchor, bubble: null, banner: null };
  sources.set(key, src);
  return [src, () => { sources.delete(key); }];
}

interface Slot { root: HTMLDivElement; banner: HTMLDivElement; bubble: HTMLDivElement; bubbleText: string; bannerText: string }

export function BubbleLayer() {
  const { gl, camera, size, scene } = useThree();
  const layer = useMemo(() => {
    const d = document.createElement('div');
    d.className = 'bubble-layer';
    d.style.cssText = 'position:absolute;inset:0;pointer-events:none;overflow:hidden;z-index:5';
    return d;
  }, []);
  const slots = useRef(new Map<string, Slot>());
  useEffect(() => {
    const parent = gl.domElement.parentElement;
    parent?.appendChild(layer);
    return () => { layer.remove(); };
  }, [gl, layer]);
  const v = useMemo(() => new THREE.Vector3(), []);
  useFrame(() => {
    const live = slots.current;
    for (const [id, src] of sources) {
      if (!isIn(src.anchor, scene)) continue;  // another canvas's member (the creator preview)
      const bt = src.bubble?.text ?? '', nt = src.banner?.text ?? '';
      let slot = live.get(id);
      if (!bt && !nt) { if (slot) slot.root.style.display = 'none'; continue; }
      if (!slot) {
        const root = document.createElement('div'); root.className = 'above';
        root.style.cssText = 'position:absolute;left:0;top:0;will-change:transform';
        const banner = document.createElement('div'); banner.className = 'title-banner'; banner.style.display = 'none';
        const bubble = document.createElement('div'); bubble.className = 'bubble'; bubble.style.display = 'none';
        root.append(banner, bubble);
        layer.appendChild(root);
        slot = { root, banner, bubble, bubbleText: '', bannerText: '' };
        live.set(id, slot);
      }
      src.anchor.getWorldPosition(v).project(camera);
      if (v.z > 1 || v.z < -1) { slot.root.style.display = 'none'; continue; }
      const x = (v.x + 1) * 0.5 * size.width, y = (1 - v.y) * 0.5 * size.height;
      slot.root.style.display = 'flex';
      slot.root.style.transform = `translate(${x.toFixed(1)}px, ${y.toFixed(1)}px) translate(-50%, -50%)`;
      if (slot.bubbleText !== bt) { slot.bubbleText = bt; slot.bubble.textContent = bt; slot.bubble.style.display = bt ? 'block' : 'none'; }
      if (slot.bannerText !== nt) { slot.bannerText = nt; slot.banner.textContent = nt; slot.banner.style.display = nt ? 'block' : 'none'; }
    }
    // members who left the gym
    for (const [id, slot] of live) if (!sources.has(id)) { slot.root.remove(); live.delete(id); }
  });
  return null;
}

function isIn(o: THREE.Object3D, scene: THREE.Object3D): boolean {
  let p: THREE.Object3D | null = o;
  while (p) { if (p === scene) return true; p = p.parent; }
  return false;
}

// ------------------------------------------------------------------ aura light

/** Written by avatars with an active aura each frame; read by the one AuraLight. */
export const auraClaim = { frame: -1, x: 0, y: 0, z: 0, hex: '#FFC93C', intensity: 0 };
let frameNo = 0;

export function claimAuraLight(pos: THREE.Vector3, hex: string, intensity: number): void {
  if (auraClaim.frame === frameNo && auraClaim.intensity >= intensity) return;
  auraClaim.frame = frameNo; auraClaim.x = pos.x; auraClaim.y = pos.y; auraClaim.z = pos.z; auraClaim.hex = hex; auraClaim.intensity = intensity;
}

export function AuraLight() {
  const light = useRef<THREE.PointLight>(null!);
  useFrame(() => {
    const l = light.current;
    const fresh = auraClaim.frame >= frameNo - 1;
    l.intensity = fresh ? auraClaim.intensity : 0;
    if (fresh) { l.position.set(auraClaim.x, auraClaim.y, auraClaim.z); l.color.set(auraClaim.hex); }
    frameNo++;
  });
  // always in the scene (intensity 0 when nobody's glowing) so the light count never changes
  return <pointLight ref={light} intensity={0} distance={5} decay={2} />;
}
