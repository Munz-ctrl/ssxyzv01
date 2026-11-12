import { useState } from 'react';
import type { ReceiptLine } from '../../shared/receipt';
import { Receipt } from '../components/Receipt';
import { completeMission, type Game } from '../lib/data';
import { unlockSound } from '../lib/sound';

interface Props {
  game: Game;
  refresh: (keepShown?: boolean) => Promise<void>;
  addCubes: (n: number) => void;
  settle: () => void;
}

export function Vault({ game, refresh, addCubes, settle }: Props) {
  const [busy, setBusy] = useState('');
  const [receipt, setReceipt] = useState<ReceiptLine[] | null>(null);
  const [error, setError] = useState('');

  async function done(id: string) {
    if (busy) return;
    unlockSound();
    setBusy(id);
    setError('');
    try {
      const result = await completeMission(id);
      setReceipt(result.receipt);
      await refresh(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'something broke. try again.');
    } finally {
      setBusy('');
    }
  }

  const of = (kind: string) => game.vault.filter((v) => v.kind === kind);
  const groups: [string, string[]][] = [
    ['insights', of('insight').map((v) => v.body)],
    ['notes', of('note').map((v) => v.body)],
    ['patterns', of('pattern').map((v) => v.body)],
    ['wishlist', game.wishlist.map((w) => w.request)],
  ];

  return (
    <div className="sheet">
      {receipt && <Receipt key={receipt[1]?.text} lines={receipt} animate onCubes={addCubes} onDone={settle} />}
      {error && <p className="error">{error}</p>}

      <h2>missions</h2>
      {!game.missions.length && <p className="empty">none open. dump a plan to start one.</p>}
      {game.missions.map((m) => (
        <article key={m.id} className="card">
          <div className="card-head">
            <span>{m.title}</span>
            <button className="btn" onClick={() => void done(m.id)} disabled={!!busy}>
              {busy === m.id ? '[ ... ]' : '[ done ]'}
            </button>
          </div>
          {m.next_steps.map((step, i) => (
            <div key={i} className="step">
              {i + 1}. {step}
            </div>
          ))}
        </article>
      ))}

      {groups.map(([name, items]) => (
        <section key={name}>
          <h2>{name}</h2>
          {!items.length && <p className="empty">nothing yet.</p>}
          {items.map((body, i) => (
            <p key={i} className="item">
              {body}
            </p>
          ))}
        </section>
      ))}
    </div>
  );
}
