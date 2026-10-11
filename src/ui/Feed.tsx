// "Gym News": the last few things that happened, bottom-left.
import { useEffect, useState } from 'react';
import { useEngine } from '../engineContext';
import type { FeedItem } from '../sim/types';
import { useUi } from '../store/ui';

export function Feed() {
  const eng = useEngine();
  const showBanner = useUi((s) => s.showBanner);
  const [items, setItems] = useState<FeedItem[]>(() => eng.feed.slice(-5));
  useEffect(() => eng.subscribeFeed((f) => {
    setItems((xs) => [...xs, f].slice(-5));
    if (f.kind === 'ceremony' || (f.kind === 'title' && f.npcId === eng.player?.id)) showBanner(f.text);
    // awards day: the year-in-review card opens itself (unless another panel is open)
    if (f.kind === 'ceremony' && eng.ceremony?.stage === 'waiting') {
      const ui = useUi.getState();
      if (!ui.panel && eng.save.yearReviews?.[String(eng.ceremony.year)]) ui.openReview(eng.ceremony.year);
    }
  }), [eng, showBanner]);
  if (!items.length) return null;
  return (
    <aside className="feed" aria-label="Gym news" aria-live="polite">
      {items.map((f) => <div key={f.id} className={`feed-item ${f.kind}`}>{f.text}</div>)}
    </aside>
  );
}

export function Banner() {
  const banner = useUi((s) => s.banner);
  const [visible, setVisible] = useState(false);
  useEffect(() => {
    if (!banner) return;
    setVisible(true);
    const t = setTimeout(() => setVisible(false), 3500);
    return () => clearTimeout(t);
  }, [banner]);
  if (!banner || !visible) return null;
  return <div className="banner" role="status">{banner.text}</div>;
}
