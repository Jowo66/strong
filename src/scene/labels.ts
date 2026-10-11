// Canvas-drawn textures: zone floors with their labels baked in, signs, posters, the whiteboard.
// No image downloads. Text uses the self-hosted Nunito font (loaded before the scene mounts).
import * as THREE from 'three';

export const FONT = '"Nunito Variable", Nunito, ui-rounded, system-ui, sans-serif';
const cache = new Map<string, THREE.CanvasTexture>();

function make(key: string, w: number, h: number, draw: (ctx: CanvasRenderingContext2D, w: number, h: number) => void): THREE.CanvasTexture {
  const hit = cache.get(key);
  if (hit) return hit;
  const canvas = document.createElement('canvas');
  canvas.width = w; canvas.height = h;
  const ctx = canvas.getContext('2d')!;
  draw(ctx, w, h);
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 8;
  cache.set(key, tex);
  return tex;
}

/** A crisp text texture for signs (transparent background). */
export function labelTexture(text: string, colour = '#2b2b2b', bg = 'rgba(0,0,0,0)'): THREE.CanvasTexture {
  return make(`label|${text}|${colour}|${bg}`, 512, 128, (ctx) => {
    ctx.fillStyle = bg; ctx.fillRect(0, 0, 512, 128);
    ctx.font = `900 64px ${FONT}`;
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillStyle = colour;
    ctx.fillText(text.toUpperCase(), 256, 68, 490);
  });
}

// deterministic noise so floors don't shimmer between reloads
function rand(seed: number) { let x = seed; return () => { x = (x * 1664525 + 1013904223) >>> 0; return x / 4294967296; }; }

export type FloorKind = 'rubber' | 'wood' | 'tile' | 'terrazzo' | 'carpet';
const PX = 48; // texture pixels per world unit

/** Zone floor: the material pattern in the zone colour, with the zone name painted near the front edge. */
export function floorTexture(kind: FloorKind, colour: string, label: string, wUnits: number, dUnits: number, hc: boolean): THREE.CanvasTexture {
  return make(`floor|${kind}|${colour}|${label}|${wUnits}|${dUnits}|${hc}`, Math.round(wUnits * PX), Math.round(dUnits * PX), (ctx, w, h) => {
    const r = rand(label.length * 97 + w);
    ctx.fillStyle = hc ? '#FFFFFF' : colour;
    ctx.fillRect(0, 0, w, h);
    if (!hc) {
      ctx.globalAlpha = 0.18;
      switch (kind) {
        case 'rubber': // speckled rubber tiles
          for (let i = 0; i < w * h * 0.02; i++) { ctx.fillStyle = r() < 0.5 ? '#FFFFFF' : '#000000'; ctx.fillRect(r() * w, r() * h, 1.6, 1.6); }
          ctx.globalAlpha = 0.14; ctx.strokeStyle = '#000';
          for (let x = 0; x < w; x += PX) { ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, h); ctx.stroke(); }
          for (let y = 0; y < h; y += PX) { ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(w, y); ctx.stroke(); }
          break;
        case 'wood': // planks with staggered joints
          ctx.strokeStyle = '#5E3A1E';
          for (let y = 0; y < h; y += PX * 0.33) {
            ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(w, y); ctx.stroke();
            const off = r() * PX * 2;
            for (let x = off; x < w; x += PX * 2.2) { ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x, y + PX * 0.33); ctx.stroke(); }
          }
          for (let i = 0; i < 400; i++) { ctx.fillStyle = '#7F5539'; ctx.fillRect(r() * w, r() * h, 6 + r() * 14, 1); }
          break;
        case 'tile':
          ctx.strokeStyle = '#FFFFFF'; ctx.lineWidth = 2; ctx.globalAlpha = 0.5;
          for (let x = 0; x < w; x += PX * 0.5) { ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, h); ctx.stroke(); }
          for (let y = 0; y < h; y += PX * 0.5) { ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(w, y); ctx.stroke(); }
          break;
        case 'terrazzo':
          for (let i = 0; i < w * h * 0.004; i++) {
            ctx.fillStyle = ['#C0583C', '#457B9D', '#FFFFFF', '#6B705C'][Math.floor(r() * 4)];
            ctx.beginPath(); ctx.arc(r() * w, r() * h, 1 + r() * 2.5, 0, Math.PI * 2); ctx.fill();
          }
          break;
        case 'carpet':
          ctx.globalAlpha = 0.12;
          for (let y = 0; y < h; y += 6) for (let x = (y / 6) % 2 ? 3 : 0; x < w; x += 6) { ctx.fillStyle = '#000'; ctx.fillRect(x, y, 3, 3); }
          break;
      }
      ctx.globalAlpha = 1;
    }
    // border line
    ctx.strokeStyle = hc ? '#000' : 'rgba(255,255,255,0.55)';
    ctx.lineWidth = hc ? 4 : 3;
    ctx.strokeRect(2, 2, w - 4, h - 4);
    // label, painted on the floor near the front (camera-facing) edge
    ctx.font = `900 ${Math.round(PX * 0.62)}px ${FONT}`;
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillStyle = hc ? '#000' : 'rgba(40,30,20,0.42)';
    ctx.fillText(label.toUpperCase(), w / 2, h - PX * 0.55, w - 16);
  });
}

/** Motivational posters (original artwork). */
export function posterTexture(kind: 'rerack' | 'hydrate' | 'legday' | 'spot'): THREE.CanvasTexture {
  return make(`poster|${kind}`, 256, 352, (ctx, w, h) => {
    const bg = { rerack: '#264653', hydrate: '#219EBC', legday: '#E76F51', spot: '#8338EC' }[kind];
    ctx.fillStyle = '#FFFDF7'; ctx.fillRect(0, 0, w, h);
    ctx.fillStyle = bg; ctx.fillRect(10, 10, w - 20, h - 20);
    ctx.fillStyle = '#FFFDF7'; ctx.textAlign = 'center';
    const title = { rerack: ['RERACK', 'YOUR', 'WEIGHTS'], hydrate: ['STAY', 'HYDRATED'], legday: ['NEVER', 'SKIP', 'LEG DAY'], spot: ['ASK FOR', 'A SPOT'] }[kind];
    ctx.font = `900 40px ${FONT}`;
    title.forEach((t, i) => ctx.fillText(t, w / 2, 62 + i * 42));
    // little illustrations
    ctx.strokeStyle = '#FFFDF7'; ctx.fillStyle = '#FFFDF7'; ctx.lineWidth = 6; ctx.lineCap = 'round';
    const cy = 250;
    if (kind === 'rerack' || kind === 'spot') {
      ctx.beginPath(); ctx.moveTo(50, cy); ctx.lineTo(206, cy); ctx.stroke();
      ctx.fillStyle = '#FFD166'; ctx.fillRect(58, cy - 34, 16, 68); ctx.fillRect(182, cy - 34, 16, 68);
      if (kind === 'rerack') { ctx.fillStyle = '#FFFDF7'; ctx.fillRect(40, cy + 10, 8, 60); ctx.fillRect(208, cy + 10, 8, 60); ctx.font = `800 20px ${FONT}`; ctx.fillText('(please)', w / 2, cy + 70); }
      else { ctx.font = `800 20px ${FONT}`; ctx.fillText('we got you!', w / 2, cy + 70); }
    } else if (kind === 'hydrate') {
      ctx.fillStyle = '#FFFDF7'; ctx.beginPath(); ctx.roundRect(100, cy - 50, 56, 100, 14); ctx.fill();
      ctx.fillStyle = '#8ECAE6'; ctx.beginPath(); ctx.roundRect(106, cy - 10, 44, 54, 10); ctx.fill();
      ctx.fillStyle = '#FFFDF7'; ctx.fillRect(112, cy - 66, 32, 18);
      ctx.font = `800 18px ${FONT}`; ctx.fillText('(it was where you left it)', w / 2, cy + 78);
    } else {
      ctx.beginPath(); ctx.arc(w / 2, cy - 30, 18, 0, Math.PI * 2); ctx.fill();
      ctx.beginPath(); ctx.moveTo(w / 2, cy - 10); ctx.lineTo(w / 2, cy + 20); ctx.moveTo(w / 2, cy + 20); ctx.lineTo(w / 2 - 30, cy + 30); ctx.lineTo(w / 2 - 30, cy + 60);
      ctx.moveTo(w / 2, cy + 20); ctx.lineTo(w / 2 + 30, cy + 30); ctx.lineTo(w / 2 + 30, cy + 60); ctx.moveTo(w / 2 - 50, cy); ctx.lineTo(w / 2 + 50, cy); ctx.stroke();
    }
  });
}

export function whiteboardTexture(): THREE.CanvasTexture {
  return make('whiteboard', 384, 224, (ctx, w, h) => {
    ctx.fillStyle = '#FBFBF8'; ctx.fillRect(0, 0, w, h);
    ctx.fillStyle = '#D62828'; ctx.font = `900 54px ${FONT}`; ctx.textAlign = 'center';
    ctx.fillText('LEG DAY', w / 2, 70);
    ctx.fillStyle = '#1D3557'; ctx.font = `700 24px ${FONT}`; ctx.textAlign = 'left';
    ['☐ squats 5×5', '☐ lunges (cry)', '☑ walk out somehow'].forEach((t, i) => ctx.fillText(t, 40, 118 + i * 34));
    ctx.strokeStyle = '#ADB5BD'; ctx.lineWidth = 6; ctx.strokeRect(3, 3, w - 6, h - 6);
  });
}

export function plaqueTexture(text: string, sub: string): THREE.CanvasTexture {
  return make(`plaque|${text}|${sub}`, 512, 128, (ctx, w, h) => {
    const g = ctx.createLinearGradient(0, 0, 0, h);
    g.addColorStop(0, '#E9C46A'); g.addColorStop(1, '#B8860B');
    ctx.fillStyle = g; ctx.fillRect(0, 0, w, h);
    ctx.strokeStyle = '#7A5A12'; ctx.lineWidth = 6; ctx.strokeRect(6, 6, w - 12, h - 12);
    ctx.fillStyle = '#3B2A06'; ctx.textAlign = 'center';
    ctx.font = `900 46px ${FONT}`; ctx.fillText(text, w / 2, 58);
    ctx.font = `700 26px ${FONT}`; ctx.fillText(sub, w / 2, 98);
  });
}

export function windowTexture(): THREE.CanvasTexture {
  return make('window', 256, 160, (ctx, w, h) => {
    const g = ctx.createLinearGradient(0, 0, 0, h);
    g.addColorStop(0, '#8ECAE6'); g.addColorStop(1, '#D8F3FF');
    ctx.fillStyle = g; ctx.fillRect(0, 0, w, h);
    // a tiny skyline and a tree outside
    ctx.fillStyle = '#A9C6D9';
    [[10, 90, 30, 70], [44, 70, 26, 90], [74, 100, 40, 60], [180, 80, 34, 80], [216, 105, 30, 55]].forEach(([x, y, ww, hh]) => ctx.fillRect(x, y, ww, hh));
    ctx.fillStyle = '#74C69D'; ctx.beginPath(); ctx.arc(140, 120, 34, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#8B5E34'; ctx.fillRect(136, 130, 8, 30);
    ctx.fillStyle = 'rgba(255,255,255,0.5)'; ctx.beginPath(); ctx.moveTo(20, 0); ctx.lineTo(60, 0); ctx.lineTo(0, 70); ctx.lineTo(0, 30); ctx.fill();
  });
}
