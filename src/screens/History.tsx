import { Receipt } from '../components/Receipt';
import type { Game } from '../lib/data';

const stamp = (iso: string) =>
  new Date(iso)
    .toLocaleString(undefined, { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })
    .toLowerCase();

export function History({ game }: { game: Game }) {
  return (
    <div className="sheet">
      <h2>history</h2>
      {!game.history.length && <p className="empty">no dumps yet.</p>}
      {game.history.map((d) => (
        <article key={d.id} className="card">
          <div className="when">{stamp(d.created_at)}</div>
          <p className="dump-text">{d.text}</p>
          <Receipt lines={d.receipt} />
        </article>
      ))}
    </div>
  );
}
