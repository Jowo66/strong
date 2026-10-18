// Post-processing (ambient occlusion + tilt-shift). Loaded lazily so the first paint doesn't wait for it,
// and never loaded at all on Low detail with tilt-shift off.
import { useMemo } from 'react';
import { Uniform } from 'three';
import { BlendFunction, Effect, EffectAttribute } from 'postprocessing';
import { EffectComposer, N8AO } from '@react-three/postprocessing';

// Tilt-shift based on Evan Wallace's shader (as in @react-three/postprocessing's TiltShift2), made cheaper:
// pixels in the sharp band skip the blur entirely (the stock effect still took every sample there), and the
// sample count is a parameter (6 on Low detail, 10 on High). Measured on an Intel UHD 630: ~6 ms → much less.
const fragment = /* glsl */ `
  uniform float blur;
  uniform float taper;
  uniform vec2 start;
  uniform vec2 end;
  uniform vec2 direction;
  uniform int samples;

  float random(vec3 scale, float seed) {
    return fract(sin(dot(gl_FragCoord.xyz + seed, scale)) * 43758.5453 + seed);
  }

  void mainImage(const in vec4 inputColor, const in vec2 uv, out vec4 outputColor) {
    vec2 startPixel = start * resolution;
    vec2 endPixel = end * resolution;
    float maxScreenDistance = length(resolution);
    float gradientRadius = taper * maxScreenDistance;
    float blurRadius = blur * (maxScreenDistance / 16.0);
    vec2 normal = normalize(vec2(startPixel.y - endPixel.y, endPixel.x - startPixel.x));
    float radius = smoothstep(0.0, 1.0, abs(dot(uv * resolution - startPixel, normal)) / gradientRadius) * blurRadius;
    if (radius < 0.75) { outputColor = inputColor; return; } // in focus: nothing to blur

    vec4 color = vec4(0.0);
    float total = 0.0;
    float f_samples = float(samples);
    float half_samples = f_samples / 2.0;
    float offset = random(vec3(12.9898, 78.233, 151.7182), 0.0);
    vec2 stepDir = normalize(direction) / resolution * radius;
    for (int i = 0; i < 16; i++) {
      if (i >= samples) break;
      float percent = (-half_samples + float(i) + offset - 0.5) / half_samples;
      float weight = 1.0 - abs(percent);
      vec4 s = texture2D(inputBuffer, uv + stepDir * percent);
      s.rgb *= s.a;
      color += s * weight;
      total += weight;
    }
    outputColor = color / total;
    outputColor.rgb /= outputColor.a + 0.00001;
  }
`;

class FastTiltShift extends Effect {
  constructor(samples: number) {
    super('FastTiltShift', fragment, {
      blendFunction: BlendFunction.NORMAL,
      attributes: EffectAttribute.CONVOLUTION,
      uniforms: new Map<string, Uniform>([
        ['blur', new Uniform(0.1)], ['taper', new Uniform(0.55)],
        ['start', new Uniform([0.5, 0.0])], ['end', new Uniform([0.5, 1.0])],
        ['samples', new Uniform(samples)], ['direction', new Uniform([1, 1])],
      ]),
    });
  }
}

function TiltShift({ samples }: { samples: number }) {
  const effect = useMemo(() => new FastTiltShift(samples), [samples]);
  return <primitive object={effect} dispose={null} />;
}

export default function Effects({ high, ao, tiltShift }: { high: boolean; ao: boolean; tiltShift: boolean }) {
  return (
    <EffectComposer multisampling={high ? (ao ? 4 : 2) : 0}>
      {ao ? <N8AO halfRes aoRadius={0.8} intensity={2.2} distanceFalloff={0.6} color="#3B2A1A" /> : <></>}
      {tiltShift ? <TiltShift samples={high ? 10 : 6} /> : <></>}
    </EffectComposer>
  );
}
