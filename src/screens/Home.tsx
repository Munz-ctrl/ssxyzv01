import { useEffect, useRef, useState } from 'react';
import type { ReceiptLine } from '../../shared/receipt';
import { Receipt } from '../components/Receipt';
import { sendDump, type Game } from '../lib/data';
import { unlockSound } from '../lib/sound';

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
  const spoke = useRef(false);
  const recognition = useRef<Recognition | null>(null);
  const box = useRef<HTMLTextAreaElement>(null);

  useEffect(() => () => recognition.current?.stop(), []);

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
    unlockSound();
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
    unlockSound();
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
        <textarea
          ref={box}
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder="a thought, a plan, an update..."
          rows={5}
          maxLength={20000}
          disabled={sending}
        />
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
