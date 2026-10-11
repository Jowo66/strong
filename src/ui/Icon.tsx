// Rounded 24 px line icons (U1). Original drawings; stroke uses currentColor so they follow the theme.
import type { ReactElement } from 'react';

export type IconName =
  | 'aura' | 'trophy' | 'speaker' | 'gear' | 'pause' | 'play' | 'members' | 'close' | 'star' | 'crown'
  | 'dumbbell' | 'medal' | 'ribbon' | 'next' | 'prev' | 'shuffle' | 'mute' | 'user' | 'chart';

const P: Record<IconName, ReactElement> = {
  aura: <><path d="M12 3l1.8 4.7L18.5 9.5l-4.7 1.8L12 16l-1.8-4.7L5.5 9.5l4.7-1.8z" /><path d="M18.5 15l.8 2 2 .8-2 .8-.8 2-.8-2-2-.8 2-.8z" /></>,
  trophy: <><path d="M8 4h8v5a4 4 0 0 1-8 0z" /><path d="M8 6H5a3 3 0 0 0 3 4M16 6h3a3 3 0 0 1-3 4" /><path d="M12 13v4M8.5 20h7M10 17h4" /></>,
  speaker: <><path d="M5 9.5h3l4-3.5v12l-4-3.5H5z" /><path d="M15.5 9a4 4 0 0 1 0 6M18 6.5a7.5 7.5 0 0 1 0 11" /></>,
  mute: <><path d="M5 9.5h3l4-3.5v12l-4-3.5H5z" /><path d="M16 9.5l5 5M21 9.5l-5 5" /></>,
  gear: <><circle cx="12" cy="12" r="3" /><path d="M12 2.8v2.4M12 18.8v2.4M2.8 12h2.4M18.8 12h2.4M5.5 5.5l1.7 1.7M16.8 16.8l1.7 1.7M5.5 18.5l1.7-1.7M16.8 7.2l1.7-1.7" /></>,
  pause: <><rect x="7" y="5.5" width="3.2" height="13" rx="1.2" /><rect x="13.8" y="5.5" width="3.2" height="13" rx="1.2" /></>,
  play: <path d="M8 5.5v13l10.5-6.5z" />,
  next: <><path d="M6 6v12l8.5-6z" /><path d="M17.5 6v12" /></>,
  prev: <><path d="M18 6v12L9.5 12z" /><path d="M6.5 6v12" /></>,
  shuffle: <><path d="M4 7h3.5l9 10H20M4 17h3.5l2.5-2.8M14 9.8L16.5 7H20" /><path d="M18 5l2 2-2 2M18 15l2 2-2 2" /></>,
  members: <><circle cx="9" cy="8" r="3" /><path d="M3.5 19a5.5 5.5 0 0 1 11 0" /><circle cx="17" cy="9" r="2.3" /><path d="M15.5 14.2A4.5 4.5 0 0 1 21 18.5" /></>,
  user: <><circle cx="12" cy="8" r="3.5" /><path d="M5 20a7 7 0 0 1 14 0" /></>,
  close: <path d="M6.5 6.5l11 11M17.5 6.5l-11 11" />,
  star: <path d="M12 3.8l2.5 5.2 5.6.7-4.1 3.9 1 5.6L12 16.5l-5 2.7 1-5.6-4.1-3.9 5.6-.7z" />,
  crown: <><path d="M4 8l4 4 4-6 4 6 4-4-1.5 10h-13z" /><path d="M5.5 20.5h13" /></>,
  medal: <><path d="M8 3l3 6M16 3l-3 6" /><circle cx="12" cy="14.5" r="5" /><path d="M12 12.3v4.4" /></>,
  ribbon: <><circle cx="12" cy="9" r="5" /><path d="M9 13.2L7.5 21l4.5-2.5 4.5 2.5-1.5-7.8" /></>,
  dumbbell: <><path d="M3 10v4M21 10v4M6 7.5v9M18 7.5v9M6 12h12" /></>,
  chart: <><path d="M4 19.5h16" /><path d="M6 16l4-5 3 3 5-7" /></>,
};

export function Icon({ name, size = 18, label }: { name: IconName; size?: number; label?: string }) {
  return (
    <svg className="icon" width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}
      strokeLinecap="round" strokeLinejoin="round" aria-hidden={label ? undefined : true} role={label ? 'img' : undefined} aria-label={label}>
      {P[name]}
    </svg>
  );
}
