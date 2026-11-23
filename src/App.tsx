import type { User } from '@supabase/supabase-js';
import { lazy, Suspense, useCallback, useEffect, useRef, useState } from 'react';
import cubeRules from '../config/cubes.json';
import { VERSION_LINE } from './config';
import { levelFor } from '../shared/level';
import { avatarStatus, coordsFor, discardAvatar, keepAvatar, loadGame, SESSION_ENDED, type Game } from './lib/data';
import { fill, installTapSound } from './lib/sfx';
import { supabase } from './lib/supabase';
import { Auth } from './screens/Auth';
import { History } from './screens/History';
import { Reset } from './screens/Reset';
import { Home } from './screens/Home';
import { Vault } from './screens/Vault';

// three.js is a big chunk: load it after the first paint so sign in stays fast
const Scene = lazy(() => import('./scene/Scene'));

type Tab = 'home' | 'vault' | 'history';
const TABS: Tab[] = ['home', 'vault', 'history'];
const POLL_MS = 3000;

export function App() {
  const [user, setUser] = useState<User | null | undefined>(undefined);
  const [game, setGame] = useState<Game | null>(null);
  const [error, setError] = useState('');
  const [tab, setTab] = useState<Tab>('home');
  const [shownWallet, setShownWallet] = useState(0);
  const [notice, setNotice] = useState('');
  const [resetting, setResetting] = useState(() => window.location.pathname === '/reset');
  const ticking = useRef(0);
  const truth = useRef(0);
  const signedIn = useRef(false);
  const leaving = useRef(false);
  const [avatarJob, setAvatarJob] = useState<string | null>(null);
  const [making, setMaking] = useState(false);
  const [avatarNote, setAvatarNote] = useState('');
  const [reviewing, setReviewing] = useState(false);

  useEffect(() => installTapSound(), []);

  // the level bar fills when lifetime cubes go up
  const lastLifetime = useRef<number | null>(null);
  useEffect(() => {
    if (!game) {
      lastLifetime.current = null;
      return;
    }
    if (lastLifetime.current !== null && game.lifetime > lastLifetime.current) fill();
    lastLifetime.current = game.lifetime;
  }, [game]);

  useEffect(() => {
    const { data } = supabase.auth.onAuthStateChange((event, session) => {
      const next = session?.user ?? null;
      // a sign out the player did not ask for means the session expired or was ended elsewhere
      if (!next && signedIn.current && !leaving.current) setNotice(SESSION_ENDED);
      if (next) setNotice('');
      signedIn.current = !!next;
      leaving.current = false;
      if (event === 'SIGNED_OUT') setTab('home');
      if (event === 'PASSWORD_RECOVERY') setResetting(true);
      setUser((prev) => (prev && next && prev.id === next.id ? prev : next));
    });
    return () => data.subscription.unsubscribe();
  }, []);

  // Ends the session on this device only; other devices stay signed in.
  const signOut = useCallback(() => {
    leaving.current = true;
    void supabase.auth.signOut({ scope: 'local' });
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
    setAvatarJob(null);
    setMaking(false);
    setAvatarNote('');
    void refresh();
  }, [refresh]);

  // pick up an avatar job that was still working when the app was closed
  const resumable = game?.avatarJob ?? null;
  useEffect(() => {
    if (resumable) setAvatarJob((j) => j ?? resumable);
  }, [resumable]);

  // Each poll moves the job one step on the server. Done or failed: reload so the room updates.
  useEffect(() => {
    if (!avatarJob) return;
    let stopped = false;
    let timer: ReturnType<typeof setTimeout>;
    const tick = async () => {
      try {
        const job = await avatarStatus(avatarJob);
        if (stopped) return;
        if (job.status === 'working') {
          timer = setTimeout(tick, POLL_MS);
          return;
        }
        if (job.status === 'failed') setAvatarNote(job.error ?? 'that did not work. try again.');
        await refresh();
        setAvatarJob(null);
      } catch {
        if (!stopped) timer = setTimeout(tick, POLL_MS * 2);
      }
    };
    timer = setTimeout(tick, POLL_MS);
    return () => {
      stopped = true;
      clearTimeout(timer);
    };
  }, [avatarJob, refresh]);

  const avatarStarted = useCallback((jobId: string) => {
    setAvatarNote('');
    setMaking(false);
    setAvatarJob(jobId);
    setTab('home');
  }, []);

  // keep, or put the old one back and open the maker again
  async function review(keep: boolean) {
    const avatar = game?.avatar;
    if (!avatar || reviewing) return;
    setReviewing(true);
    try {
      await (keep ? keepAvatar(avatar.id) : discardAvatar(avatar.id));
      await refresh();
      if (!keep) {
        setMaking(true);
        setTab('vault');
      }
    } catch (err) {
      setAvatarNote(err instanceof Error ? err.message : 'something broke. try again.');
    } finally {
      setReviewing(false);
    }
  }

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

  const leaveReset = useCallback(() => {
    window.history.replaceState(null, '', '/');
    setResetting(false);
  }, []);

  if (user === undefined) return <Shell />;
  if (resetting) {
    return (
      <Shell>
        <Reset signedIn={!!user} onDone={leaveReset} />
      </Shell>
    );
  }
  if (!user) {
    return (
      <Shell>
        <Auth notice={notice} />
      </Shell>
    );
  }

  const [x, y] = coordsFor(user.id);
  const { level, progress } = levelFor(game?.lifetime ?? 0, cubeRules.levels.thresholds);

  const avatar = game?.avatar ?? null;
  const unreviewed = !!avatar && !avatar.approved && !avatarJob;

  return (
    <Shell
      room
      avatar={{ url: avatar?.url, heightM: avatar?.heightM, working: !!avatarJob }}
      hud={[`coord. [${x}, ${y}]`, `memory: ${game ? `${game.handle}-${game.dumpCount}` : '...'}`]}
    >
      <nav className="tabs">
        {TABS.map((t) => (
          <button key={t} className={`link ${tab === t ? 'on' : ''}`} onClick={() => setTab(t)}>
            {t}
          </button>
        ))}
      </nav>

      <main className="stage">
        {error && <p className="error">{error}</p>}
        {game && tab === 'home' && <Home game={game} refresh={refresh} addCubes={addCubes} settle={settle} />}
        {game && tab === 'vault' && (
          <Vault
            game={game}
            refresh={refresh}
            addCubes={addCubes}
            settle={settle}
            signOut={signOut}
            making={making}
            setMaking={setMaking}
            onAvatarStarted={avatarStarted}
            avatarWorking={!!avatarJob}
          />
        )}
        {game && tab === 'history' && <History game={game} />}
        {tab === 'home' && (unreviewed || avatarNote) && (
          <div className="review">
            {avatarNote ? (
              <>
                <span>{avatarNote}</span>
                <button className="btn" onClick={() => setAvatarNote('')}>
                  [ ok ]
                </button>
              </>
            ) : (
              <>
                <span>your avatar</span>
                <button className="btn" onClick={() => void review(true)} disabled={reviewing}>
                  [ keep ]
                </button>
                <button className="btn" onClick={() => void review(false)} disabled={reviewing}>
                  [ try again ]
                </button>
              </>
            )}
          </div>
        )}
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

interface ShellProps {
  hud?: string[];
  room?: boolean;
  avatar?: { url?: string; heightM?: number; working: boolean };
  children?: React.ReactNode;
}

function Shell({ hud = [], room = false, avatar, children }: ShellProps) {
  return (
    <div className="app">
      <Suspense fallback={null}>
        <Scene room={room} avatarUrl={avatar?.url} avatarHeight={avatar?.heightM} working={avatar?.working} />
      </Suspense>
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
