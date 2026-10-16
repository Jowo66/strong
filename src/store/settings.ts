// Small per-device settings, kept in localStorage.
import { create } from 'zustand';
import { persist } from 'zustand/middleware';

export type GymSize = 'small' | 'medium' | 'rush';

export interface Settings {
  gymSize: GymSize;
  dayLengthMinutes: number;
  speed: number;            // 0 = paused
  reducedMotion: boolean;
  highContrast: boolean;
  uiScale: number;
  nativeNameOrder: boolean;
  mixNationalities: boolean;
  tiltShift: boolean;
  detail: 'auto' | 'high' | 'low';   // auto: High on discrete GPUs, Low on integrated / mobile ones (see gpuTier.ts)
  masterVolume: number;
  muted: boolean;
  sfxOn: boolean;
  sfxVolume: number;
  ambienceOn: boolean;
  ambienceVolume: number;
  radioVolume: number;
  auraColour: string;
  set: (patch: Partial<Omit<Settings, 'set'>>) => void;
}

const prefersReducedMotion = typeof window !== 'undefined' && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;

export const useSettings = create<Settings>()(
  persist(
    (set) => ({
      gymSize: 'medium',
      dayLengthMinutes: 10,
      speed: 1,
      reducedMotion: !!prefersReducedMotion,
      highContrast: false,
      uiScale: 1,
      nativeNameOrder: false,
      mixNationalities: false,
      tiltShift: true,
      detail: 'auto',
      masterVolume: 0.8,
      muted: false,
      sfxOn: true,
      sfxVolume: 0.7,
      ambienceOn: false,
      ambienceVolume: 0.5,
      radioVolume: 0.6,
      auraColour: 'gold',
      set: (patch) => set(patch),
    }),
    {
      name: 'mini-gym-settings', partialize: ({ set: _set, ...rest }) => rest,
      // v1: "High" was the old default even on laptops with integrated graphics; move it to the new Auto
      version: 1,
      migrate: (old, from) => {
        const o = (old ?? {}) as Partial<Settings>;
        if (from < 1 && o.detail === 'high') o.detail = 'auto';
        return o as Settings;
      },
    },
  ),
);
