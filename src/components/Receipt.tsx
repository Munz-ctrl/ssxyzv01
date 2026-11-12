import { useEffect, useRef, useState } from 'react';
import type { ReceiptLine } from '../../shared/receipt';
import { chime, thud } from '../lib/sound';

interface Props {
  lines: ReceiptLine[];
  animate?: boolean;
  onCubes?: (n: number) => void;
  onDone?: () => void;
}

const STEP_MS = 320;

export function Receipt({ lines, animate, onCubes, onDone }: Props) {
  const [shown, setShown] = useState(animate ? 0 : lines.length);
  const [openNote, setOpenNote] = useState<number | null>(null);
  const cubesRef = useRef(onCubes);
  cubesRef.current = onCubes;
  const doneRef = useRef(onDone);
  doneRef.current = onDone;

  useEffect(() => {
    if (!animate) {
      setShown(lines.length);
      return;
    }
    setShown(0);
    let i = 0;
    const reveal = () => {
      const line = lines[i];
      if (!line) return;
      if (line.kind === 'spam') thud();
      else if (line.kind !== 'risk') chime(i);
      if (line.cubes) cubesRef.current?.(line.cubes);
      i += 1;
      setShown(i);
    };
    reveal();
    const timer = setInterval(() => {
      if (i < lines.length) return reveal();
      clearInterval(timer);
      doneRef.current?.();
    }, STEP_MS);
    return () => clearInterval(timer);
  }, [lines, animate]);

  return (
    <div className="receipt">
      {lines.slice(0, shown).map((line, i) =>
        line.kind === 'note' ? (
          <div key={i}>
            <button className="link" onClick={() => setOpenNote(openNote === i ? null : i)}>
              {line.text} {openNote === i ? '[ close ]' : '[ open ]'}
            </button>
            {openNote === i && <p className="note">{line.note}</p>}
          </div>
        ) : (
          <div key={i} className={`line ${line.kind}`}>
            {line.text}
          </div>
        ),
      )}
    </div>
  );
}
