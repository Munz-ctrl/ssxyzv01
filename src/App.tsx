import type { User } from '@supabase/supabase-js';
import { lazy, Suspense, useCallback, useEffect, useRef, useState } from 'react';
import cubeRules from '../config/cubes.json';
import { VERSION_LINE } from './config';
import { levelFor } from '../shared/level';
import { applyWallOps, setTexture, type Edge, type Room, type SurfaceTarget, type WallOp } from '../shared/room';
import { RoomEditor, type Selection, type SurfaceChoice } from './components/RoomEditor';
import {
  avatarStatus,
  coordsFor,
  describeSurface,
  discardAvatar,
  editWalls,
  keepAvatar,
  loadGame,
  photoSurface,
  SESSION_ENDED,
  setSurfacePreset,
  surfaceStatus,
  textureUrls,
  type Game,
} from './lib/data';
import { fill, installTapSound } from './lib/sfx';
import { supabase } from './lib/supabase';
import { Auth } from './screens/Auth';
import { History } from './screens/History';
import { Reset } from './screens/Reset';
import { Home } from './screens/Home';
import { Vault } from './screens/Vault';
import { ROOM_RULES, type ScenePick } from './scene/camera';

// three.js is a big chunk: load it after the first paint so sign in stays fast
const Scene = lazy(() => import('./scene/Scene'));

type Tab = 'home' | 'vault' | 'history';
const TABS: Tab[] = ['home', 'vault', 'history'];
const POLL_MS = 3000;
const NOTE_MS = 4000;
const GRID_KEY = 'ssx-v0-grid';

const sameEdge = (a: Edge, b: Edge) => a[0] === b[0] && a[1] === b[1] && a[2] === b[2];
const message = (err: unknown) => (err instanceof Error ? err.message : 'something broke. try again.');

function readGrid(): boolean {
  try {
    return localStorage.getItem(GRID_KEY) !== 'off';
  } catch {
    return true;
  }
}

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

  // room edit mode (brief 02d)
  const [editing, setEditing] = useState(false);
  const [room, setRoom] = useState<Room | null>(null);
  const [textures, setTextures] = useState<Record<string, string>>({});
  const [selection, setSelection] = useState<Selection>(null);
  const [grid, setGrid] = useState(readGrid);
  const [surfaceJob, setSurfaceJob] = useState<string | null>(null);
  const [roomNote, setRoomNote] = useState('');
  const pending = useRef(0);
  const queue = useRef<Promise<void>>(Promise.resolve());

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
    setEditing(false);
    setSelection(null);
    setRoom(null);
    setSurfaceJob(null);
    void refresh();
  }, [refresh]);

  // the room follows the server copy, except while an edit is still on its way
  const serverRoom = game?.room ?? null;
  useEffect(() => {
    if (serverRoom && pending.current === 0) setRoom(serverRoom);
  }, [serverRoom]);

  useEffect(() => {
    if (!room) return;
    let live = true;
    void textureUrls(room).then((urls) => live && setTextures((t) => ({ ...t, ...urls })));
    return () => {
      live = false;
    };
  }, [room]);

  useEffect(() => {
    if (!roomNote) return;
    const timer = setTimeout(() => setRoomNote(''), NOTE_MS);
    return () => clearTimeout(timer);
  }, [roomNote]);

  useEffect(() => {
    try {
      localStorage.setItem(GRID_KEY, grid ? 'on' : 'off');
    } catch {
      // private windows: the choice just will not persist
    }
  }, [grid]);

  const resumableSurface = game?.surfaceJob ?? null;
  useEffect(() => {
    if (resumableSurface) setSurfaceJob((j) => j ?? resumableSurface);
  }, [resumableSurface]);

  // a texture job: each poll moves it one step on the server
  useEffect(() => {
    if (!surfaceJob) return;
    let stopped = false;
    let timer: ReturnType<typeof setTimeout>;
    const tick = async () => {
      try {
        const job = await surfaceStatus(surfaceJob);
        if (stopped) return;
        if (job.status === 'working') {
          timer = setTimeout(tick, POLL_MS);
          return;
        }
        if (job.status === 'failed') setRoomNote(job.error ?? 'that did not work. try again.');
        if (job.room && pending.current === 0) setRoom(job.room);
        await refresh();
        setSurfaceJob(null);
      } catch {
        if (!stopped) timer = setTimeout(tick, POLL_MS * 2);
      }
    };
    timer = setTimeout(tick, POLL_MS);
    return () => {
      stopped = true;
      clearTimeout(timer);
    };
  }, [surfaceJob, refresh]);

  // Room edits show at once and go to the server one after another. A failed one reloads the room.
  const send = useCallback(
    (next: Room, call: () => Promise<{ room: Room }>) => {
      setRoom(next);
      pending.current += 1;
      queue.current = queue.current.then(async () => {
        let failed = false;
        try {
          const result = await call();
          if (pending.current === 1) setRoom(result.room);
        } catch (err) {
          setRoomNote(message(err));
          failed = true;
        }
        pending.current -= 1;
        // the server copy wins again once nothing else is on its way
        if (failed && pending.current === 0) await refresh();
      });
    },
    [refresh],
  );

  function changeWalls(ops: WallOp[]) {
    if (!room) return;
    try {
      send(applyWallOps(room, ops, ROOM_RULES), () => editWalls(ops));
    } catch (err) {
      setRoomNote(message(err));
    }
  }

  async function changeSurface(target: SurfaceTarget, choice: SurfaceChoice): Promise<boolean> {
    if (!room) return false;
    try {
      if ('preset' in choice) {
        send(setTexture(room, target, choice.preset === 'plain' ? null : `preset:${choice.preset}`), () => setSurfacePreset(target, choice.preset));
        return true;
      }
      const start = 'prompt' in choice ? await describeSurface(target, choice.prompt) : await photoSurface(target, choice.photo);
      setSurfaceJob(start.job_id);
      return true;
    } catch (err) {
      setRoomNote(message(err));
      return false;
    }
  }

  function pick(p: ScenePick) {
    if (!editing) return;
    if (p.kind === 'floor') setSelection((s) => (s === 'floor' ? null : 'floor'));
    else if (p.kind === 'edge') setSelection((s) => (s && s !== 'floor' && sameEdge(s, p.edge) ? null : p.edge));
    else setSelection(null);
  }

  function leaveEdit() {
    setEditing(false);
    setSelection(null);
  }

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
      scene={{
        avatarUrl: avatar?.url,
        avatarHeight: avatar?.heightM,
        working: !!avatarJob,
        layout: room ?? undefined,
        textures,
        editing,
        grid,
        selected: selection,
        onPick: pick,
      }}
      hud={[`coord. [${x}, ${y}]`, `memory: ${game ? `${game.handle}-${game.dumpCount}` : '...'}`]}
      hudAction={
        game && room && tab === 'home' && !editing ? (
          <button className="link hud-action" onClick={() => setEditing(true)}>
            [ edit ]
          </button>
        ) : null
      }
    >
      {!editing && (
        <nav className="tabs">
          {TABS.map((t) => (
            <button key={t} className={`link ${tab === t ? 'on' : ''}`} onClick={() => setTab(t)}>
              {t}
            </button>
          ))}
        </nav>
      )}

      <main className={`stage ${editing ? 'editing' : ''}`}>
        {error && <p className="error">{error}</p>}
        {game && tab === 'home' && !editing && <Home game={game} refresh={refresh} addCubes={addCubes} settle={settle} />}
        {editing && room && (
          <RoomEditor
            room={room}
            selection={selection}
            grid={grid}
            wallet={game?.wallet ?? 0}
            busy={!!surfaceJob}
            note={roomNote}
            onGrid={setGrid}
            onWalls={changeWalls}
            onSurface={changeSurface}
            onDone={leaveEdit}
          />
        )}
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
        {tab === 'home' && !editing && (unreviewed || avatarNote) && (
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
  hudAction?: React.ReactNode;
  room?: boolean;
  scene?: Omit<React.ComponentProps<typeof Scene>, 'room'>;
  children?: React.ReactNode;
}

function Shell({ hud = [], hudAction, room = false, scene, children }: ShellProps) {
  return (
    <div className="app">
      <Suspense fallback={null}>
        <Scene room={room} {...scene} />
      </Suspense>
      <header className="hud">
        <div>{VERSION_LINE}</div>
        {hud.map((line) => (
          <div key={line}>{line}</div>
        ))}
        {hudAction}
      </header>
      {children}
    </div>
  );
}
