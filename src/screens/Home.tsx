import { useEffect, useRef, useState } from 'react';
import nudgeConfig from '../../config/nudges.json';
import type { ReceiptLine } from '../../shared/receipt';
import { Receipt } from '../components/Receipt';
import { sendDump, type Game } from '../lib/data';

const NUDGE_MS = 4000;
const FADE_MS = 400;

function shuffled(list: string[]): string[] {
  const out = [...list];
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

interface Props {
  game: Game;
  refresh: (keepShown?: boolean) => Promise<void>;
  addCubes: (n: number) => void;
  settle: () => void;
}

interface Recognition {
  continuous: boolean;
  interimResults: boolean;
  onresult: ((e: { resultIndex: number; results: ArrayLike<ArrayLike<{ transcript: string }> & { isFinal: boolean }> }) => void) | null;
  onend: (() => void) | null;
  onerror: (() => void) | null;
  start(): void;
  stop(): void;
}

const SpeechRecognitionCtor = (
  typeof window === 'undefined'
    ? undefined
    : ((window as never)['SpeechRecognition'] ?? (window as never)['webkitSpeechRecognition'])
) as (new () => Recognition) | undefined;

// An unsent dump survives a reload or an expired session.
const DRAFT_KEY = 'ssx-v0-draft';

function readDraft(): string {
  try {
    return localStorage.getItem(DRAFT_KEY) ?? '';
  } catch {
    return '';
  }
}

export function Home({ game, refresh, addCubes, settle }: Props) {
  const [text, setText] = useState(readDraft);
  const [open, setOpen] = useState(() => !!text);
  const [sending, setSending] = useState(false);
  const [listening, setListening] = useState(false);
  const [error, setError] = useState('');
  const [fresh, setFresh] = useState<ReceiptLine[] | null>(null);
  const [nudges] = useState(() => shuffled(nudgeConfig.nudges));
  const [nudge, setNudge] = useState(0);
  const [faded, setFaded] = useState(false);
  const [focused, setFocused] = useState(false);
  const spoke = useRef(false);
  const recognition = useRef<Recognition | null>(null);
  const box = useRef<HTMLTextAreaElement>(null);

  useEffect(() => () => recognition.current?.stop(), []);

  // Rotate the filler questions while the box is open, empty and not focused.
  const rotating = open && !focused && !text && nudges.length > 1;
  useEffect(() => {
    if (!rotating) return;
    let swap: ReturnType<typeof setTimeout>;
    const timer = setInterval(() => {
      setFaded(true);
      swap = setTimeout(() => {
        setNudge((n) => (n + 1) % nudges.length);
        setFaded(false);
      }, FADE_MS);
    }, NUDGE_MS);
    return () => {
      clearInterval(timer);
      clearTimeout(swap);
      setFaded(false);
    };
  }, [rotating, nudges.length]);

  useEffect(() => {
    try {
      if (text) localStorage.setItem(DRAFT_KEY, text);
      else localStorage.removeItem(DRAFT_KEY);
    } catch {
      // storage can be unavailable in private windows: the draft just will not persist
    }
  }, [text]);

  function toggleMic() {
    if (!SpeechRecognitionCtor) return;
    if (listening) return recognition.current?.stop();
    const rec = new SpeechRecognitionCtor();
    rec.continuous = true;
    rec.interimResults = false;
    rec.onresult = (e) => {
      let heard = '';
      for (let i = e.resultIndex; i < e.results.length; i++) {
        if (e.results[i].isFinal) heard += e.results[i][0].transcript;
      }
      if (heard.trim()) {
        spoke.current = true;
        setText((t) => (t ? `${t.trimEnd()} ${heard.trim()}` : heard.trim()));
      }
    };
    rec.onend = () => setListening(false);
    rec.onerror = () => setListening(false);
    recognition.current = rec;
    rec.start();
    setListening(true);
  }

  async function send() {
    const dump = text.trim();
    if (!dump || sending) return;
    recognition.current?.stop();
    setSending(true);
    setError('');
    try {
      const result = await sendDump(dump, spoke.current ? 'voice' : 'text');
      setFresh(result.receipt);
      setText('');
      spoke.current = false;
      await refresh(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'something broke. try again.');
    } finally {
      setSending(false);
    }
  }

  function plus() {
    setOpen(true);
    setTimeout(() => box.current?.focus(), 0);
  }

  const lines = fresh ?? game.history[0]?.receipt ?? null;

  return (
    <div className="home">
      <button className={`plus ${open ? 'hidden-portrait' : ''}`} onClick={plus} aria-label="new dump">
        [ + ]
      </button>

      <section className={`panel ${open ? 'open' : ''}`}>
        <div className="panel-head">
          <span>dump anything</span>
          <button className="link close" onClick={() => setOpen(false)}>
            [ x ]
          </button>
        </div>
        <div className="field">
          <textarea
            ref={box}
            value={text}
            onChange={(e) => setText(e.target.value)}
            onFocus={() => setFocused(true)}
            onBlur={() => setFocused(false)}
            aria-label="dump anything"
            rows={5}
            maxLength={20000}
            disabled={sending}
          />
          {!text && nudges.length > 0 && (
            <span className={`nudge ${faded ? 'faded' : ''}`} aria-hidden="true">
              {nudges[nudge]}
            </span>
          )}
        </div>
        <div className="row">
          {SpeechRecognitionCtor && (
            <button className="btn" onClick={toggleMic} disabled={sending}>
              {listening ? '[ stop ]' : '[ mic ]'}
            </button>
          )}
          <button className="btn send" onClick={() => void send()} disabled={sending || !text.trim()}>
            {sending ? '[ ... ]' : '[ send ]'}
          </button>
        </div>
        {error && <p className="error">{error}</p>}
        {lines && <Receipt key={fresh ? 'fresh' : 'last'} lines={lines} animate={!!fresh} onCubes={addCubes} onDone={settle} />}
      </section>
    </div>
  );
}
