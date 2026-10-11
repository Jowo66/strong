// The player's lifts over time: one line per lift (working weight at the end of each day).
// Validated palette (categorical slots 1–3); identity also carried by marker shape, a legend and end labels.
// Crosshair + tooltip on hover/focus, and a table view.
import { useState } from 'react';
import type { PlayerDay } from '../sim/types';

const SERIES = [
  { key: 'bench', label: 'Bench', colour: '#2a78d6', shape: 'circle' },
  { key: 'squat', label: 'Squat', colour: '#eb6834', shape: 'square' },
  { key: 'deadlift', label: 'Deadlift', colour: '#1baf7a', shape: 'diamond' },
] as const;

const W = 330, H = 170, PAD = { l: 34, r: 74, t: 10, b: 22 };

function Marker({ shape, x, y, colour }: { shape: string; x: number; y: number; colour: string }) {
  const s = 4.5;
  if (shape === 'square') return <rect x={x - s} y={y - s} width={s * 2} height={s * 2} rx={1.5} fill={colour} stroke="#fcfcfb" strokeWidth={2} />;
  if (shape === 'diamond') return <path d={`M${x} ${y - s - 1}L${x + s + 1} ${y}L${x} ${y + s + 1}L${x - s - 1} ${y}Z`} fill={colour} stroke="#fcfcfb" strokeWidth={2} />;
  return <circle cx={x} cy={y} r={s} fill={colour} stroke="#fcfcfb" strokeWidth={2} />;
}

export function ProgressChart({ history }: { history: PlayerDay[] }) {
  const [hover, setHover] = useState<number | null>(null);
  const [table, setTable] = useState(false);
  const data = history.slice(-60);
  if (data.length < 2) return <p className="muted">Your chart appears after a couple of days of training.</p>;

  const vals = data.flatMap((d) => SERIES.map((s) => d[s.key]));
  const lo = Math.floor(Math.min(...vals) / 25) * 25, hi = Math.ceil(Math.max(...vals) / 25) * 25 || lo + 25;
  const x = (i: number) => PAD.l + (i / (data.length - 1)) * (W - PAD.l - PAD.r);
  const y = (v: number) => PAD.t + (1 - (v - lo) / Math.max(1, hi - lo)) * (H - PAD.t - PAD.b);
  const ticks = [lo, (lo + hi) / 2, hi];
  const last = data[data.length - 1];
  // end labels, nudged apart so they never collide
  const ends = SERIES.map((s) => ({ s, y: y(last[s.key]) })).sort((a, b) => a.y - b.y);
  for (let i = 1; i < ends.length; i++) if (ends[i].y - ends[i - 1].y < 13) ends[i].y = ends[i - 1].y + 13;

  const onMove = (e: React.PointerEvent<SVGRectElement>) => {
    const r = e.currentTarget.getBoundingClientRect();
    const px = ((e.clientX - r.left) / r.width) * W;
    const i = Math.round(((px - PAD.l) / (W - PAD.l - PAD.r)) * (data.length - 1));
    setHover(Math.max(0, Math.min(data.length - 1, i)));
  };
  const h = hover !== null ? data[hover] : null;

  return (
    <div className="chart">
      <div className="chart-head">
        <ul className="legend" aria-label="Legend">
          {SERIES.map((s) => (
            <li key={s.key}><svg width={12} height={12} aria-hidden><Marker shape={s.shape} x={6} y={6} colour={s.colour} /></svg>{s.label}</li>
          ))}
        </ul>
        <button className="link" onClick={() => setTable((t) => !t)}>{table ? 'Chart' : 'Table'}</button>
      </div>
      {table ? (
        <table className="lifts">
          <thead><tr><th>Date</th>{SERIES.map((s) => <th key={s.key}>{s.label}</th>)}</tr></thead>
          <tbody>{data.slice().reverse().map((d) => <tr key={d.day}><td>{d.date}</td>{SERIES.map((s) => <td key={s.key}>{d[s.key]} lb</td>)}</tr>)}</tbody>
        </table>
      ) : (
        <div className="chart-wrap">
          <svg viewBox={`0 0 ${W} ${H}`} width="100%" role="img" aria-label={`Working weights over ${data.length} days. Now: bench ${last.bench}, squat ${last.squat}, deadlift ${last.deadlift} lb.`}>
            {ticks.map((t) => (
              <g key={t}>
                <line x1={PAD.l} x2={W - PAD.r} y1={y(t)} y2={y(t)} stroke="rgba(42,36,32,0.10)" />
                <text x={PAD.l - 6} y={y(t) + 3.5} textAnchor="end" className="axis">{Math.round(t)}</text>
              </g>
            ))}
            <text x={PAD.l} y={H - 6} className="axis">{data[0].date.slice(5)}</text>
            <text x={W - PAD.r} y={H - 6} textAnchor="end" className="axis">{last.date.slice(5)}</text>
            {SERIES.map((s) => (
              <polyline key={s.key} fill="none" stroke={s.colour} strokeWidth={2} strokeLinejoin="round" strokeLinecap="round"
                points={data.map((d, i) => `${x(i)},${y(d[s.key])}`).join(' ')} />
            ))}
            {SERIES.map((s) => <Marker key={s.key} shape={s.shape} x={x(data.length - 1)} y={y(last[s.key])} colour={s.colour} />)}
            {ends.map(({ s, y: ly }) => <text key={s.key} x={W - PAD.r + 8} y={ly + 3.5} className="end-label">{s.label} {last[s.key]}</text>)}
            {h && hover !== null && (
              <g>
                <line x1={x(hover)} x2={x(hover)} y1={PAD.t} y2={H - PAD.b} stroke="rgba(42,36,32,0.35)" strokeDasharray="3 3" />
                {SERIES.map((s) => <Marker key={s.key} shape={s.shape} x={x(hover)} y={y(h[s.key])} colour={s.colour} />)}
              </g>
            )}
            <rect x={PAD.l} y={PAD.t} width={W - PAD.l - PAD.r} height={H - PAD.t - PAD.b} fill="transparent"
              onPointerMove={onMove} onPointerLeave={() => setHover(null)} />
          </svg>
          {h && hover !== null && (
            <div className="chart-tip" style={{ left: `${(x(hover) / W) * 100}%` }} role="status">
              <strong>{h.date}</strong>
              {SERIES.map((s) => <span key={s.key}><svg width={10} height={10} aria-hidden><Marker shape={s.shape} x={5} y={5} colour={s.colour} /></svg>{s.label} {h[s.key]} lb</span>)}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
