// Picks a sensible detail level for "Auto". Measured on an Intel UHD 630 laptop with 25 members: ambient occlusion
// alone took ~45 → ~24 ms per frame, so integrated and mobile GPUs get Low (no AO, no MSAA, lighter shadows,
// matte materials) while discrete GPUs keep High.
let tier: 'high' | 'low' | null = null;
let name = '';

const WEAK = /intel|uhd|iris|hd graphics|mali|adreno|powervr|videocore|swiftshader|llvmpipe|software|radeon\(tm\) graphics|radeon graphics|vega \d+ graphics/i;

export function gpuName(): string { detect(); return name; }

function detect(): 'high' | 'low' {
  if (tier) return tier;
  const small = typeof window !== 'undefined' && (window.matchMedia?.('(pointer: coarse)').matches || window.innerWidth < 760);
  try {
    const canvas = document.createElement('canvas');
    const gl = (canvas.getContext('webgl2') || canvas.getContext('webgl')) as WebGLRenderingContext | null;
    const ext = gl?.getExtension('WEBGL_debug_renderer_info');
    name = gl ? String(gl.getParameter(ext ? ext.UNMASKED_RENDERER_WEBGL : gl.RENDERER)) : '';
    gl?.getExtension('WEBGL_lose_context')?.loseContext();
  } catch { name = ''; }
  tier = small || WEAK.test(name) ? 'low' : 'high';
  return tier;
}

export type Detail = 'auto' | 'high' | 'low';

/** The detail level actually used for a setting. */
export function resolveDetail(d: Detail): 'high' | 'low' {
  return d === 'auto' ? detect() : d;
}
