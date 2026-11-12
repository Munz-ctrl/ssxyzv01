import type { User } from '@supabase/supabase-js';
import { useCallback, useEffect, useRef, useState } from 'react';
import cubeRules from '../config/cubes.json';
import { Grid } from './components/Grid';
import { VERSION_LINE } from './config';
import { levelFor } from '../shared/level';
import { coordsFor, loadGame, type Game } from './lib/data';
import { supabase } from './lib/supabase';
import { Auth } from './screens/Auth';
import { History } from './screens/History';
import { Home } from './screens/Home';
import { Vault } from './screens/Vault';

type Tab = 'home' | 'vault' | 'history';
const TABS: Tab[] = ['home', 'vault', 'history'];

export function App() {
  const [user, setUser] = useState<User | null | undefined>(undefined);
  const [game, setGame] = useState<Game | null>(null);
  const [error, setError] = useState('');
  const [tab, setTab] = useState<Tab>('home');
  const [shownWallet, setShownWallet] = useState(0);
  const ticking = useRef(0);
  const truth = useRef(0);

  useEffect(() => {
    const { data } = supabase.auth.onAuthStateChange((_event, session) => {
      const next = session?.user ?? null;
      setUser((prev) => (prev && next && prev.id === next.id ? prev : next));
    });
    return () => data.subscription.unsubscribe();
  }, []);

  // keepShown: a receipt is about to tick the visible total up itself
  const refresh = useCallback(async (keepShown = false) => {
    if (!user) return;
    try {
      const next = await loadGame(user);
      setGame(next);
      setError('');
      truth.current = next.wallet;
      if (!keepShown) setShownWallet(next.wallet);
    } catch {
      setError('could not load. check your connection.');
    }
  }, [user]);

  useEffect(() => {
    setGame(null);
    void refresh();
  }, [refresh]);

  // Count the cube total up one by one while a receipt prints.
  const addCubes = useCallback((n: number) => {
    ticking.current += n;
    const timer = setInterval(() => {
      if (ticking.current <= 0) return clearInterval(timer);
      ticking.current -= 1;
      setShownWallet((w) => w + 1);
    }, 45);
  }, []);

  // After a receipt finishes, snap the visible total to the real one.
  const settle = useCallback(() => {
    const timer = setInterval(() => {
      if (ticking.current > 0) return;
      clearInterval(timer);
      setShownWallet(truth.current);
    }, 100);
  }, []);

  if (user === undefined) return <Shell />;
  if (!user) {
    return (
      <Shell>
        <Auth />
      </Shell>
    );
  }

  const [x, y] = coordsFor(user.id);
  const { level, progress } = levelFor(game?.lifetime ?? 0, cubeRules.levels.thresholds);

  return (
    <Shell hud={[`coord. [${x}, ${y}]`, `memory: ${game ? `${game.handle}-${game.dumpCount}` : '...'}`]}>
      <nav className="tabs">
        {TABS.map((t) => (
          <button key={t} className={`link ${tab === t ? 'on' : ''}`} onClick={() => setTab(t)}>
            {t}
          </button>
        ))}
        <button className="link" onClick={() => void supabase.auth.signOut()}>
          out
        </button>
      </nav>

      <main className="stage">
        {error && <p className="error">{error}</p>}
        {game && tab === 'home' && <Home game={game} refresh={refresh} addCubes={addCubes} settle={settle} />}
        {game && tab === 'vault' && <Vault game={game} refresh={refresh} addCubes={addCubes} settle={settle} />}
        {game && tab === 'history' && <History game={game} />}
      </main>

      <footer className="bar">
        <div className="progress" title="progress to the next level">
          <div className="fill" style={{ width: `${progress * 100}%` }} />
        </div>
        <span className="level">lv {level}</span>
        <span className="cubes">🧊 {shownWallet}</span>
      </footer>
    </Shell>
  );
}

function Shell({ hud = [], children }: { hud?: string[]; children?: React.ReactNode }) {
  return (
    <div className="app">
      <Grid />
      <header className="hud">
        <div>{VERSION_LINE}</div>
        {hud.map((line) => (
          <div key={line}>{line}</div>
        ))}
      </header>
      {children}
    </div>
  );
}
