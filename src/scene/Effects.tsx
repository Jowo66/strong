// Post-processing (ambient occlusion + tilt-shift). Loaded lazily so the first paint doesn't wait for it,
// and never loaded at all on Low detail with tilt-shift off.
import { EffectComposer, N8AO, TiltShift2 } from '@react-three/postprocessing';

export default function Effects({ high, tiltShift }: { high: boolean; tiltShift: boolean }) {
  return (
    <EffectComposer multisampling={high ? 4 : 0}>
      {high ? <N8AO halfRes aoRadius={0.8} intensity={2.2} distanceFalloff={0.6} color="#3B2A1A" /> : <></>}
      {tiltShift ? <TiltShift2 blur={0.1} taper={0.55} start={[0.5, 0.0]} end={[0.5, 1.0]} /> : <></>}
    </EffectComposer>
  );
}
