import { useState } from 'react';
import cubeRules from '../../config/cubes.json';
import { edgeId, type Edge, type Room, type SurfaceTarget, type WallOp } from '../../shared/room';
import { PRESETS } from '../lib/data';
import { ROOM_RULES } from '../scene/camera';

const HEIGHTS = Object.entries(ROOM_RULES.heights) as [string, number][];
const SURFACE_COST = cubeRules.costs.surface;
const PROMPT_MAX = 160;

export type Selection = Edge | 'floor' | null;

export type SurfaceChoice = { preset: string } | { prompt: string } | { photo: File };

interface Props {
  room: Room;
  selection: Selection;
  grid: boolean;
  wallet: number;
  busy: boolean; // a texture is being made
  note: string;
  onGrid: (on: boolean) => void;
  onWalls: (ops: WallOp[]) => void;
  onSurface: (target: SurfaceTarget, choice: SurfaceChoice) => Promise<boolean>;
  onDone: () => void;
}

const sameEdge = (a: Edge, b: Edge) => a[0] === b[0] && a[1] === b[1] && a[2] === b[2];

function heightLabel(h: number | 'backdrop') {
  if (h === 'backdrop') return 'backdrop';
  const name = HEIGHTS.find(([, v]) => Math.abs(v - h) < 1e-6)?.[0];
  return name ? `${name}, ${h} m` : `${h} m`;
}

// The thin bar at the bottom in edit mode: what is selected and what you can do with it.
export function RoomEditor({ room, selection, grid, wallet, busy, note, onGrid, onWalls, onSurface, onDone }: Props) {
  const [sheet, setSheet] = useState(false);
  const [allWalls, setAllWalls] = useState(false);

  const edge = selection && selection !== 'floor' ? selection : null;
  const wall = edge ? room.walls.find((w) => sameEdge(w.edge, edge)) : undefined;

  let label = 'tap a line, a wall or the floor';
  if (selection === 'floor') label = 'floor';
  else if (wall) label = `wall, ${heightLabel(wall.height)}`;
  else if (edge) label = 'grid line';

  const target: SurfaceTarget | null = selection === 'floor' ? 'floor' : wall ? (allWalls ? 'all_walls' : edgeId(wall.edge)) : null;
  const canTexture = selection === 'floor' || !!wall;

  return (
    <div className="editdock">
      {sheet && canTexture && target && (
        <SurfaceSheet
          target={target}
          isWall={!!wall}
          allWalls={allWalls}
          setAllWalls={setAllWalls}
          wallet={wallet}
          busy={busy}
          onClose={() => setSheet(false)}
          onPick={async (choice) => {
            if (await onSurface(target, choice)) setSheet(false);
          }}
        />
      )}
      <div className="editbar">
        <div className="row">
          <span className="edit-label">{busy ? 'making a texture...' : note || label}</span>
          <span className="edit-tools">
            <button className="link" onClick={() => onGrid(!grid)}>
              [ grid {grid ? 'on' : 'off'} ]
            </button>
            <button className="link" onClick={onDone}>
              [ done ]
            </button>
          </span>
        </div>
        {(edge || selection === 'floor') && (
          <div className="edit-actions">
            {edge && !wall && (
              <button className="link" onClick={() => onWalls([{ op: 'add', edge }])}>
                [ add wall ]
              </button>
            )}
            {wall && (
              <>
                <button className="link" onClick={() => onWalls([{ op: 'remove', edge: wall.edge }])}>
                  [ remove ]
                </button>
                {HEIGHTS.map(([name, h]) => (
                  <button
                    key={name}
                    className={`link ${wall.height === h ? 'on' : ''}`}
                    onClick={() => wall.height !== h && onWalls([{ op: 'height', edge: wall.edge, height: h }])}
                  >
                    [ {name} ]
                  </button>
                ))}
              </>
            )}
            {canTexture && (
              <button className={`link ${sheet ? 'on' : ''}`} onClick={() => setSheet((s) => !s)}>
                [ texture ]
              </button>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

function SurfaceSheet({
  target,
  isWall,
  allWalls,
  setAllWalls,
  wallet,
  busy,
  onClose,
  onPick,
}: {
  target: SurfaceTarget;
  isWall: boolean;
  allWalls: boolean;
  setAllWalls: (v: boolean) => void;
  wallet: number;
  busy: boolean;
  onClose: () => void;
  onPick: (choice: SurfaceChoice) => Promise<void>;
}) {
  const [text, setText] = useState('');
  const [sending, setSending] = useState(false);
  const short = SURFACE_COST > wallet;
  const off = busy || sending;

  async function pick(choice: SurfaceChoice) {
    setSending(true);
    try {
      await onPick(choice);
    } finally {
      setSending(false);
    }
  }

  return (
    <section className="texsheet">
      <div className="panel-head">
        <span>
          texture for{' '}
          {isWall ? (
            <>
              <button className={`link ${!allWalls ? 'on' : ''}`} onClick={() => setAllWalls(false)}>
                this wall
              </button>{' '}
              <button className={`link ${allWalls ? 'on' : ''}`} onClick={() => setAllWalls(true)}>
                all walls
              </button>
            </>
          ) : (
            'the floor'
          )}
        </span>
        <button className="link" onClick={onClose}>
          [ x ]
        </button>
      </div>

      <div className="presets">
        {PRESETS.map((p) => (
          <button key={p.id} className="preset" disabled={off} onClick={() => void pick({ preset: p.id })} data-target={target}>
            <span className="swatch" style={p.id === 'plain' ? undefined : { backgroundImage: `url(/surfaces/thumbs/${p.id}.jpg)` }} />
            {p.label}
          </button>
        ))}
      </div>

      <div className="maker-step">or make one, {SURFACE_COST} 🧊</div>
      {short && <p className="error">not enough cubes. you have {wallet} 🧊</p>}
      <div className="row">
        <label className={`btn ${off || short ? 'off' : ''}`}>
          [ from a photo ]
          <input
            type="file"
            accept="image/*"
            hidden
            disabled={off || short}
            onChange={(e) => {
              const file = e.target.files?.[0];
              e.target.value = '';
              if (file) void pick({ photo: file });
            }}
          />
        </label>
      </div>
      <div className="row">
        <input
          placeholder="describe it: old red brick, beach sand..."
          value={text}
          maxLength={PROMPT_MAX}
          onChange={(e) => setText(e.target.value)}
          aria-label="describe the texture"
          disabled={off}
        />
        <button className="btn send" disabled={off || short || !text.trim()} onClick={() => void pick({ prompt: text.trim() })}>
          [ make it ]
        </button>
      </div>
    </section>
  );
}
