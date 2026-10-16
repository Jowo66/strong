// Shown when the saved gym can't be loaded (corrupted, from a future version, or the app crashed while starting).
// Nothing is deleted until you choose: download the raw save first, try a repair, or start a new gym.
import { Component, type ReactNode } from 'react';
import { get } from 'idb-keyval';

export async function downloadRawSave(): Promise<void> {
  const fromIdb = await Promise.race([get<string>('mini-gym-save').catch(() => undefined), new Promise<undefined>((r) => setTimeout(() => r(undefined), 3000))]);
  let raw = fromIdb ?? '';
  if (!raw) { try { raw = localStorage.getItem('mini-gym-save') ?? ''; } catch { /* blocked */ } }
  const blob = new Blob([raw || '{}'], { type: 'application/json' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = `mini-gym-broken-save-${new Date().toISOString().slice(0, 10)}.json`;
  a.click();
  URL.revokeObjectURL(a.href);
}

export function RecoveryScreen({ problem, onRepair, onNewGym }: { problem: string; onRepair?: () => void; onNewGym: () => void }) {
  return (
    <main className="recovery" role="alertdialog" aria-labelledby="rec-title" aria-describedby="rec-body">
      <div className="recovery-card">
        <h1 id="rec-title">The gym is locked 🔒</h1>
        <p id="rec-body">We couldn't open your saved gym: <em>{problem}</em></p>
        <p>Your save hasn't been deleted. Download a copy first, then try a repair or start over.</p>
        <div className="btns">
          <button onClick={() => void downloadRawSave()}>Download my save</button>
          {onRepair && <button onClick={onRepair}>Try to repair it</button>}
          <button className="danger" onClick={onNewGym}>Start a new gym</button>
        </div>
      </div>
    </main>
  );
}

/** Catches a crash anywhere in the app and offers the recovery screen instead of a blank page. */
export class ErrorBoundary extends Component<{ children: ReactNode; onNewGym: () => void }, { error: Error | null }> {
  state = { error: null as Error | null };
  static getDerivedStateFromError(error: Error) { return { error }; }
  componentDidCatch(error: Error) { console.error('Mini Gym crashed:', error); }
  render() {
    if (this.state.error) return <RecoveryScreen problem={this.state.error.message} onRepair={() => location.reload()} onNewGym={this.props.onNewGym} />;
    return this.props.children;
  }
}
