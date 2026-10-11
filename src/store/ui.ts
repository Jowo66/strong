import { create } from 'zustand';

export type Panel = 'hall' | 'settings' | 'music' | 'profile' | 'review' | null;

interface UiState {
  hovered: string | null;
  panel: Panel;
  profileId: string | null;   // member shown in the profile card
  reviewYear: number | null;  // year shown in the year-in-review card
  banner: { text: string; id: number } | null;
  setHovered: (id: string | null) => void;
  openPanel: (p: Panel) => void;
  openProfile: (id: string) => void;
  openReview: (year: number) => void;
  showBanner: (text: string) => void;
}

export const useUi = create<UiState>()((set) => ({
  hovered: null,
  panel: null,
  profileId: null,
  reviewYear: null,
  banner: null,
  setHovered: (hovered) => set({ hovered }),
  openPanel: (panel) => set((s) => ({ panel: s.panel === panel ? null : panel })),
  openProfile: (profileId) => set({ panel: 'profile', profileId }),
  openReview: (reviewYear) => set({ panel: 'review', reviewYear }),
  showBanner: (text) => set({ banner: { text, id: Date.now() } }),
}));
