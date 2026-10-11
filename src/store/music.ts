// What's playing through the wall speakers (Spotify or Gym Radio). The scene pulses the speakers and members
// nod along while something plays.
import { create } from 'zustand';

interface MusicState {
  spotifyPlaying: boolean;
  radio: string | null;
  set: (patch: Partial<Pick<MusicState, 'spotifyPlaying' | 'radio'>>) => void;
}

export const useMusic = create<MusicState>()((set) => ({
  spotifyPlaying: false,
  radio: null,
  set: (patch) => set(patch),
}));

export const musicPlaying = () => { const s = useMusic.getState(); return s.spotifyPlaying || !!s.radio; };
