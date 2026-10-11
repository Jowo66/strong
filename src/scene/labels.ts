import * as THREE from 'three';

const cache = new Map<string, THREE.CanvasTexture>();

/** A crisp text texture for floor and sign labels (no font download needed). */
export function labelTexture(text: string, colour = '#2b2b2b', bg = 'rgba(0,0,0,0)'): THREE.CanvasTexture {
  const key = `${text}|${colour}|${bg}`;
  const hit = cache.get(key);
  if (hit) return hit;
  const canvas = document.createElement('canvas');
  canvas.width = 512; canvas.height = 128;
  const ctx = canvas.getContext('2d')!;
  ctx.fillStyle = bg; ctx.fillRect(0, 0, 512, 128);
  ctx.font = '700 64px ui-rounded, "SF Pro Rounded", Nunito, system-ui, sans-serif';
  ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  ctx.fillStyle = colour;
  ctx.fillText(text.toUpperCase(), 256, 68, 490);
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 4;
  cache.set(key, tex);
  return tex;
}
