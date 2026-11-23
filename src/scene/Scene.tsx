import { Canvas, useFrame, useLoader, useThree } from '@react-three/fiber';
import { Suspense, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import {
  BoxGeometry,
  CanvasTexture,
  EdgesGeometry,
  type Group,
  Mesh,
  MeshBasicMaterial,
  OrthographicCamera,
  Plane,
  Raycaster,
  SRGBColorSpace,
  TextureLoader,
  Vector2,
  Vector3,
} from 'three';
import { defaultRoom, type Edge, type Room, type WallRun } from '../../shared/room';
import { thud } from '../lib/sfx';
import {
  AVATAR,
  avatarPlane,
  cameraDirection,
  clampView,
  FLOOR,
  MOVES,
  panLimit,
  pickOnFloor,
  project,
  PROXY,
  pxPerMeter,
  ROOM,
  ROOM_RULES,
  rubber,
  type ScenePick,
  tileCenter,
  YAW,
} from './camera';

export type { ScenePick };
import { setLook, surfaceMaterial } from './surfaceMaterial';
import { useTexture, Walls } from './Walls';

// New players stand in the room as the placeholder until they make their own avatar.
const PRESETS_DIR = '/avatars/';
const PLACEHOLDER = `${PRESETS_DIR}avatar_00_placeholdermaniquin.png`;
const PLACEHOLDER_HEIGHT_M = 1.8;
const PLAYER_TILE: [number, number] = [3, 3];
const BUBBLE_GAP_M = 0.15;
const CAMERA_DISTANCE = 50;
const FLOOR_SIZE = 200;
const EDIT_GRID = 1; // grid line opacity in edit mode
const TAP_PX = 8;
const TAP_MS = 450;
const LINE_PICK_PX = 14;
const AVATAR_HALF_WIDTH_M = 0.35;

const BOX_SIZE = 0.5;
const BOX_DROP = 3;
const GRAVITY = 9.8;

const debugCam = () => new URLSearchParams(window.location.search).get('debug') === 'cam';

interface Measure {
  k: number;
  angle: number;
  personPx: number;
}

interface DroppedBox {
  id: number;
  tile: [number, number];
}

interface SceneProps {
  room: boolean; // signed in: walls, player and camera moves; without it only the floor shows
  layout?: Room; // walls and surfaces; the default backdrops when missing
  textures?: Record<string, string>; // texture ref -> url
  editing?: boolean;
  grid?: boolean;
  selected?: Edge | 'floor' | null;
  onPick?: (pick: ScenePick) => void; // edit mode taps (floor, line, wall)
  avatarUrl?: string; // the player's own avatar; the placeholder when missing
  avatarHeight?: number; // meters
  working?: boolean; // an avatar is being made
}

// Zoom and pan shared by the camera rig and the gesture handler. Only these ever move.
class View {
  zoom = 1;
  pan: [number, number] = [0, 0];
  focused = false;
  tween: { from: [number, number, number]; to: [number, number, number]; t0: number; dur: number } | null = null;

  moveTo(zoom: number, pan: [number, number], halfW: number, halfH: number, dur = MOVES.ease_seconds) {
    const c = clampView(zoom, pan, halfW, halfH);
    this.tween = { from: [this.zoom, ...this.pan], to: [c.zoom, ...c.pan], t0: performance.now(), dur: dur * 1000 };
  }
}

export default function Scene({
  room,
  layout,
  textures = {},
  editing = false,
  grid = true,
  selected = null,
  onPick,
  avatarUrl,
  avatarHeight,
  working = false,
}: SceneProps) {
  const [debug] = useState(debugCam);
  const [measure, setMeasure] = useState<Measure | null>(null);
  const [boxes, setBoxes] = useState<DroppedBox[]>([]);
  const nextId = useRef(1);
  const view = useRef(new View());
  const bubble = useRef<HTMLDivElement>(null);
  const walls = useRef<Group>(null);
  const roomData = useMemo(() => layout ?? defaultRoom(ROOM_RULES), [layout]);

  // ?debug=cam: cycle through the preset avatars
  const [presets, setPresets] = useState<string[]>([]);
  const [preset, setPreset] = useState(-1);
  useEffect(() => {
    if (!debug) return;
    fetch(`${PRESETS_DIR}avatars.json`)
      .then((r) => r.json())
      .then((j: { avatars: { file: string }[] }) => setPresets(j.avatars.map((a) => a.file)))
      .catch(() => {});
  }, [debug]);

  const usingPreset = preset >= 0 && preset < presets.length;
  const url = usingPreset ? PRESETS_DIR + presets[preset] : (avatarUrl ?? PLACEHOLDER);
  const headM = usingPreset || !avatarUrl ? PLACEHOLDER_HEIGHT_M : (avatarHeight ?? PLACEHOLDER_HEIGHT_M);
  // preset PNGs carry a hand-made shadow; generated avatars get the 3D one
  const bakedShadow = url.startsWith(PRESETS_DIR);
  const player = tileCenter(...PLAYER_TILE);

  const taken = new Set([PLAYER_TILE, ...boxes.map((b) => b.tile)].map((t) => t.join(',')));
  const free: [number, number][] = [];
  for (let i = 0; i < ROOM.width; i++) {
    for (let j = 0; j < ROOM.depth; j++) if (!taken.has(`${i},${j}`)) free.push([i, j]);
  }

  function dropBox() {
    if (!free.length) return;
    const tile = free[Math.floor(Math.random() * free.length)];
    setBoxes((b) => [...b, { id: nextId.current++, tile }]);
  }

  const gridOpacity = !grid ? 0 : editing ? EDIT_GRID : FLOOR.grid_opacity;
  const selectedEdge = selected && selected !== 'floor' ? selected : null;

  return (
    <>
      <div className={`scene ${room ? 'live' : ''}`} aria-hidden="true">
        <Canvas orthographic flat frameloop="demand" dpr={[1, 2]} camera={{ near: 0.1, far: 400 }} gl={{ antialias: true }}>
          <Rig view={view.current} onMeasure={debug ? setMeasure : undefined} bubble={bubble} head={[player[0], headM + BUBBLE_GAP_M, player[1]]} />
          {room && (
            <Gestures
              view={view.current}
              walls={walls}
              player={player}
              headM={headM}
              editing={editing}
              onPick={(p) => onPick?.(p)}
            />
          )}
          {/* physical light units: intensity pi lights a lambert surface at its own color */}
          <ambientLight intensity={0.8 * Math.PI} />
          <directionalLight position={[3, 6, 5]} intensity={0.45 * Math.PI} />
          <Floor grid={gridOpacity} url={roomData.floor_texture ? textures[roomData.floor_texture] : undefined} />
          {room && (
            <>
              <Walls room={roomData} textures={textures} player={player} grid={gridOpacity} selected={selectedEdge} groupRef={walls} />
              {!bakedShadow && <AvatarShadow at={player} heightM={headM} />}
              <Suspense fallback={null}>
                <Avatar key={url} url={url} at={player} />
              </Suspense>
              {boxes.map((b) => (
                <DropBox key={b.id} tile={b.tile} />
              ))}
              {debug && <DebugShapes />}
            </>
          )}
        </Canvas>
      </div>
      {room && working && (
        <div ref={bubble} className="bubble" aria-label="making your avatar">
          <span>.</span>
          <span>.</span>
          <span>.</span>
        </div>
      )}
      {debug && (
        <div className="debug-cam">
          {measure && (
            <>
              <div>k {measure.k.toFixed(1)} px/m</div>
              <div>floor line {measure.angle.toFixed(2)} deg</div>
              {room && <div>person {measure.personPx.toFixed(0)} px</div>}
            </>
          )}
          {room && (
            <button className="btn" onClick={dropBox} disabled={!free.length}>
              {free.length ? '[ drop box ]' : '[ room full ]'}
            </button>
          )}
          {room && presets.length > 0 && (
            <div>
              <button className="btn" onClick={() => setPreset((p) => (p + 1 >= presets.length ? -1 : p + 1))}>
                [ avatar: {usingPreset ? presets[preset].replace(/\.png$/, '') : 'mine'} ]
              </button>
            </div>
          )}
        </div>
      )}
    </>
  );
}

const easeInOut = (t: number) => (t < 0.5 ? 4 * t * t * t : 1 - (-2 * t + 2) ** 3 / 2);

// The locked camera: orthographic, fixed yaw and tilt, 1 m = k css px at 1x. Only zoom and pan
// move (View), always eased by a tween or following a finger.
function Rig({
  view,
  onMeasure,
  bubble,
  head,
}: {
  view: View;
  onMeasure?: (m: Measure) => void;
  bubble: React.RefObject<HTMLDivElement | null>;
  head: [number, number, number];
}) {
  const camera = useThree((s) => s.camera) as OrthographicCamera;
  const size = useThree((s) => s.size);
  const invalidate = useThree((s) => s.invalidate);
  const axes = useRef({ right: new Vector3(), up: new Vector3(), base: new Vector3() });

  useLayoutEffect(() => {
    const [dx, dy, dz] = cameraDirection();
    const a = axes.current;
    a.base.set(dx * CAMERA_DISTANCE, dy * CAMERA_DISTANCE, dz * CAMERA_DISTANCE);
    camera.position.copy(a.base);
    camera.up.set(0, 1, 0);
    camera.lookAt(0, 0, 0);
    camera.updateMatrixWorld();
    a.right.setFromMatrixColumn(camera.matrixWorld, 0);
    a.up.setFromMatrixColumn(camera.matrixWorld, 1);
    // a resize keeps the zoom but pulls the pan back inside the new frame
    const k = pxPerMeter(size.width, size.height);
    const c = clampView(view.zoom, view.pan, size.width / 2 / k, size.height / 2 / k);
    view.zoom = c.zoom;
    view.pan = c.pan;
    invalidate();

    if (onMeasure) {
      camera.zoom = k;
      camera.updateProjectionMatrix();
      const px = (x: number, y: number, z: number) => {
        const p = new Vector3(x, y, z).project(camera);
        return [((p.x + 1) / 2) * size.width, ((1 - p.y) / 2) * size.height];
      };
      const [ax, ay] = px(0, 0, 0);
      const [bx, by] = px(1, 0, 0);
      const [fx, fy] = tileCenter(...PLAYER_TILE);
      const [, feet] = px(fx, 0, fy);
      const [, top] = px(fx, PROXY.height, fy);
      onMeasure({ k, angle: (Math.atan2(Math.abs(by - ay), Math.abs(bx - ax)) * 180) / Math.PI, personPx: feet - top });
    }
  }, [camera, size.width, size.height, invalidate, onMeasure, view]);

  const headPoint = useMemo(() => new Vector3(), []);
  useFrame(() => {
    const t = view.tween;
    if (t) {
      const p = Math.min(1, (performance.now() - t.t0) / t.dur);
      const e = easeInOut(p);
      view.zoom = t.from[0] + (t.to[0] - t.from[0]) * e;
      view.pan = [t.from[1] + (t.to[1] - t.from[1]) * e, t.from[2] + (t.to[2] - t.from[2]) * e];
      if (p >= 1) view.tween = null;
      invalidate();
    }
    const a = axes.current;
    camera.position.copy(a.base).addScaledVector(a.right, view.pan[0]).addScaledVector(a.up, view.pan[1]);
    camera.zoom = pxPerMeter(size.width, size.height) * view.zoom;
    camera.updateProjectionMatrix();
    camera.updateMatrixWorld();

    // the `...` follows the head through zoom and pan
    if (bubble.current) {
      headPoint.set(...head).project(camera);
      bubble.current.style.left = `${((headPoint.x + 1) / 2) * size.width}px`;
      bubble.current.style.top = `${((1 - headPoint.y) / 2) * size.height}px`;
    }
  });

  return null;
}

// Pinch to zoom, drag to pan, tap to pick. Taps on the avatar zoom to it and back; in edit mode
// taps on the floor, a grid line or a wall go to onPick.
function Gestures({
  view,
  walls,
  player,
  headM,
  editing,
  onPick,
}: {
  view: View;
  walls: React.RefObject<Group | null>;
  player: [number, number];
  headM: number;
  editing: boolean;
  onPick: (p: ScenePick) => void;
}) {
  const gl = useThree((s) => s.gl);
  const camera = useThree((s) => s.camera);
  const size = useThree((s) => s.size);
  const invalidate = useThree((s) => s.invalidate);
  const latest = useRef({ editing, onPick, headM, player, size });
  latest.current = { editing, onPick, headM, player, size };

  useEffect(() => {
    const el = gl.domElement;
    const pointers = new Map<number, { x: number; y: number }>();
    let tap: { x: number; y: number; t: number } | null = null;
    let start: { zoom: number; pan: [number, number]; mid: [number, number]; dist: number } | null = null;
    let wheelTimer: ReturnType<typeof setTimeout> | undefined;

    const frame = () => {
      const { width, height } = latest.current.size;
      const k = pxPerMeter(width, height);
      return { k, halfW: width / 2 / k, halfH: height / 2 / k, width, height };
    };
    const local = (e: PointerEvent | WheelEvent): [number, number] => {
      const r = el.getBoundingClientRect();
      return [e.clientX - r.left, e.clientY - r.top];
    };
    const baseline = () => {
      const pts = [...pointers.values()];
      const mid: [number, number] = [pts.reduce((s, p) => s + p.x, 0) / pts.length, pts.reduce((s, p) => s + p.y, 0) / pts.length];
      const dist = pts.length > 1 ? Math.hypot(pts[0].x - pts[1].x, pts[0].y - pts[1].y) : 0;
      start = { zoom: view.zoom, pan: [...view.pan], mid, dist };
    };
    const settle = () => {
      const f = frame();
      view.moveTo(view.zoom, view.pan, f.halfW, f.halfH, MOVES.ease_seconds * 0.6);
      invalidate();
    };

    const down = (e: PointerEvent) => {
      el.setPointerCapture(e.pointerId);
      const [x, y] = local(e);
      pointers.set(e.pointerId, { x, y });
      view.tween = null;
      tap = pointers.size === 1 ? { x, y, t: performance.now() } : null;
      baseline();
    };
    const move = (e: PointerEvent) => {
      if (!pointers.has(e.pointerId) || !start) return;
      const [x, y] = local(e);
      pointers.set(e.pointerId, { x, y });
      if (tap && Math.hypot(x - tap.x, y - tap.y) > TAP_PX) tap = null;
      if (tap) return;
      const f = frame();
      const pts = [...pointers.values()];
      const mid: [number, number] = [pts.reduce((s, p) => s + p.x, 0) / pts.length, pts.reduce((s, p) => s + p.y, 0) / pts.length];
      let zoom = start.zoom;
      if (pts.length > 1 && start.dist > 0) {
        const raw = (start.zoom * Math.hypot(pts[0].x - pts[1].x, pts[0].y - pts[1].y)) / start.dist;
        zoom = rubber(raw, MOVES.min_zoom, MOVES.max_zoom);
      }
      // keep the point under the fingers where it was
      const anchor: [number, number] = [
        start.pan[0] + (start.mid[0] - f.width / 2) / (f.k * start.zoom),
        start.pan[1] - (start.mid[1] - f.height / 2) / (f.k * start.zoom),
      ];
      const pan: [number, number] = [anchor[0] - (mid[0] - f.width / 2) / (f.k * zoom), anchor[1] + (mid[1] - f.height / 2) / (f.k * zoom)];
      const [lx, ly] = panLimit(zoom, f.halfW, f.halfH);
      view.zoom = zoom;
      view.focused = false;
      view.pan = [rubber(pan[0], -lx, lx), rubber(pan[1], -ly, ly)];
      invalidate();
    };
    const up = (e: PointerEvent) => {
      if (!pointers.has(e.pointerId)) return;
      pointers.delete(e.pointerId);
      const tapped = !!tap && performance.now() - tap.t < TAP_MS;
      tap = null;
      if (pointers.size) return baseline();
      start = null;
      // a tap may start a move of its own (focus on the avatar); a drag or pinch eases back inside the limits
      if (tapped) picked(e);
      else settle();
    };
    const wheel = (e: WheelEvent) => {
      e.preventDefault();
      const f = frame();
      const [x, y] = local(e);
      const zoom = Math.min(MOVES.max_zoom, Math.max(MOVES.min_zoom, view.zoom * Math.exp(-e.deltaY * 0.0015)));
      const anchor: [number, number] = [view.pan[0] + (x - f.width / 2) / (f.k * view.zoom), view.pan[1] - (y - f.height / 2) / (f.k * view.zoom)];
      const pan: [number, number] = [anchor[0] - (x - f.width / 2) / (f.k * zoom), anchor[1] + (y - f.height / 2) / (f.k * zoom)];
      const c = clampView(zoom, pan, f.halfW, f.halfH);
      view.zoom = c.zoom;
      view.pan = c.pan;
      view.focused = false;
      invalidate();
      clearTimeout(wheelTimer);
      wheelTimer = setTimeout(settle, 120);
    };

    const raycaster = new Raycaster();
    const ndc = new Vector2();
    const floor = new Plane(new Vector3(0, 1, 0), 0);
    const hitPoint = new Vector3();

    function picked(e: PointerEvent) {
      const { editing, onPick, headM, player, size } = latest.current;
      const [x, y] = local(e);
      ndc.set((x / size.width) * 2 - 1, -(y / size.height) * 2 + 1);
      raycaster.setFromCamera(ndc, camera);
      const ray = raycaster.ray;
      const f = frame();

      // the avatar: its vertical plane through the player tile, facing the camera
      const [dx, , dz] = cameraDirection();
      const normal = new Vector3(dx, 0, dz).normalize();
      const avatarPlaneHit = ray.intersectPlane(new Plane().setFromNormalAndCoplanarPoint(normal, new Vector3(player[0], 0, player[1])), new Vector3());
      let avatarT = Infinity;
      if (avatarPlaneHit) {
        const u = (avatarPlaneHit.x - player[0]) * Math.cos(YAW) - (avatarPlaneHit.z - player[1]) * Math.sin(YAW);
        if (Math.abs(u) < AVATAR_HALF_WIDTH_M && avatarPlaneHit.y > 0 && avatarPlaneHit.y < headM * 1.02) {
          avatarT = avatarPlaneHit.distanceTo(ray.origin);
        }
      }
      const wallHit = walls.current ? raycaster.intersectObjects(walls.current.children.filter((c) => c.userData.run), false)[0] : undefined;
      const wallT = wallHit?.distance ?? Infinity;
      const floorHit = ray.intersectPlane(floor, hitPoint);
      const floorT = floorHit ? floorHit.distanceTo(ray.origin) : Infinity;

      if (avatarT <= wallT && avatarT <= floorT) {
        // tap the avatar: zoom in on it, or back out
        if (view.focused) {
          view.focused = false;
          view.moveTo(1, [0, 0], f.halfW, f.halfH);
        } else {
          view.focused = true;
          view.moveTo(MOVES.focus_zoom, project([player[0], headM * 0.55, player[1]]), f.halfW, f.halfH);
        }
        invalidate();
        return;
      }

      if (!editing) {
        // outside edit mode nothing is selectable: a tap anywhere else goes back to the default framing
        if (view.focused || view.zoom > 1.001) {
          view.focused = false;
          view.moveTo(1, [0, 0], f.halfW, f.halfH);
          invalidate();
        }
        return;
      }

      if (wallHit && wallT <= floorT) {
        const run = wallHit.object.userData.run as WallRun;
        const along = run.axis === 'x' ? wallHit.point.x + ROOM_RULES.size[0] / 2 : wallHit.point.z + ROOM_RULES.size[1] / 2;
        const pos = Math.min(run.to - 1, Math.max(run.from, Math.floor(along)));
        onPick({ kind: 'edge', edge: run.axis === 'x' ? [pos, run.line, 'x'] : [run.line, pos, 'z'] });
        return;
      }
      if (floorHit) {
        onPick(pickOnFloor(floorHit.x, floorHit.z, LINE_PICK_PX / (f.k * view.zoom)));
        return;
      }
      onPick({ kind: 'none' });
    }

    el.addEventListener('pointerdown', down);
    el.addEventListener('pointermove', move);
    el.addEventListener('pointerup', up);
    el.addEventListener('pointercancel', up);
    el.addEventListener('wheel', wheel, { passive: false });
    return () => {
      clearTimeout(wheelTimer);
      el.removeEventListener('pointerdown', down);
      el.removeEventListener('pointermove', move);
      el.removeEventListener('pointerup', up);
      el.removeEventListener('pointercancel', up);
      el.removeEventListener('wheel', wheel);
    };
  }, [gl, camera, view, walls, invalidate]);

  return null;
}

// The floor plane with its grid; a texture replaces the gray when one is set.
function Floor({ grid, url }: { grid: number; url?: string }) {
  const dpr = useThree((s) => s.viewport.dpr);
  const invalidate = useThree((s) => s.invalidate);
  const material = useMemo(() => {
    const m = surfaceMaterial({ color: FLOOR.color, grid: FLOOR.grid_opacity, lit: false });
    m.depthWrite = false;
    return m;
  }, []);
  const map = useTexture(url);
  useEffect(() => {
    setLook(material, { map });
    invalidate();
  }, [material, map, invalidate]);
  setLook(material, { grid, dpr });

  return (
    <mesh rotation-x={-Math.PI / 2} material={material} renderOrder={-2}>
      <planeGeometry args={[FLOOR_SIZE, FLOOR_SIZE]} />
    </mesh>
  );
}

// A camera-facing sprite that only turns around the vertical axis. Feet anchor on the floor point.
// Every avatar PNG shares one canvas scale, already sized to the person's real height.
function Avatar({ url, at }: { url: string; at: [number, number] }) {
  const texture = useLoader(TextureLoader, url);
  texture.colorSpace = SRGBColorSpace;
  const plane = avatarPlane();
  return (
    <group position={[at[0], 0, at[1]]} rotation-y={YAW}>
      <mesh position={[plane.offsetX, plane.offsetY, 0]} renderOrder={1}>
        <planeGeometry args={[plane.width, plane.height]} />
        <meshBasicMaterial map={texture} transparent alphaTest={0.01} toneMapped={false} />
      </mesh>
    </group>
  );
}

// Soft floor shadow under a generated avatar's ground point, the same look as the box shadows.
function AvatarShadow({ at, heightM }: { at: [number, number]; heightM: number }) {
  const s = heightM * AVATAR.shadow.size_of_height;
  return (
    <mesh rotation-x={-Math.PI / 2} position={[at[0], 0.003, at[1]]} renderOrder={0}>
      <planeGeometry args={[s, s]} />
      <meshBasicMaterial map={softShadow()} transparent opacity={AVATAR.shadow.opacity} depthWrite={false} toneMapped={false} />
    </mesh>
  );
}

let shadowTexture: CanvasTexture | null = null;
function softShadow(): CanvasTexture {
  if (shadowTexture) return shadowTexture;
  const c = document.createElement('canvas');
  c.width = c.height = 64;
  const g = c.getContext('2d')!;
  const grad = g.createRadialGradient(32, 32, 0, 32, 32, 32);
  grad.addColorStop(0, 'rgba(0,0,0,0.55)');
  grad.addColorStop(0.5, 'rgba(0,0,0,0.25)');
  grad.addColorStop(1, 'rgba(0,0,0,0)');
  g.fillStyle = grad;
  g.fillRect(0, 0, 64, 64);
  shadowTexture = new CanvasTexture(c);
  return shadowTexture;
}

// A 0.5 m cardboard box that falls onto its tile, bounces a little, and thuds.
function DropBox({ tile }: { tile: [number, number] }) {
  const [x, z] = tileCenter(...tile);
  const mesh = useRef<Mesh>(null);
  const shadow = useRef<Mesh>(null);
  const state = useRef({ y: BOX_DROP + BOX_SIZE / 2, v: 0, bounces: 0, done: false });
  const invalidate = useThree((s) => s.invalidate);

  useFrame((_, delta) => {
    const b = state.current;
    if (b.done) return;
    const dt = Math.min(delta, 1 / 30);
    const rest = BOX_SIZE / 2;
    b.v -= GRAVITY * dt;
    b.y += b.v * dt;
    if (b.y <= rest) {
      b.y = rest;
      if (b.bounces === 0) thud();
      if (b.bounces < 2 && Math.abs(b.v) > 1) {
        b.v = -b.v * 0.3;
        b.bounces += 1;
      } else {
        b.v = 0;
        b.done = true;
      }
    }
    if (mesh.current) mesh.current.position.y = b.y;
    if (shadow.current) {
      const lift = (b.y - rest) / BOX_DROP;
      shadow.current.scale.setScalar(1 + lift * 0.6);
      (shadow.current.material as MeshBasicMaterial).opacity = 1 - lift * 0.7;
    }
    if (!b.done) invalidate();
  });

  return (
    <group position={[x, 0, z]}>
      <mesh ref={shadow} rotation-x={-Math.PI / 2} position-y={0.002} renderOrder={0}>
        <planeGeometry args={[BOX_SIZE * 1.7, BOX_SIZE * 1.7]} />
        <meshBasicMaterial map={softShadow()} transparent opacity={0.3} depthWrite={false} toneMapped={false} />
      </mesh>
      <mesh ref={mesh} position-y={state.current.y}>
        <boxGeometry args={[BOX_SIZE, BOX_SIZE, BOX_SIZE]} />
        <meshLambertMaterial color="#c49a6c" />
      </mesh>
    </group>
  );
}

// ?debug=cam: a 1 m cube with a corner on the origin, and the red player proxy on the player tile.
function DebugShapes() {
  const [px, pz] = tileCenter(...PLAYER_TILE);
  const cube = useMemo(() => new EdgesGeometry(new BoxGeometry(1, 1, 1)), []);
  const proxy = useMemo(() => new EdgesGeometry(new BoxGeometry(PROXY.width, PROXY.height, PROXY.depth)), []);
  return (
    <>
      <lineSegments geometry={cube} position={[-0.5, 0.5, -0.5]} renderOrder={3}>
        <lineBasicMaterial color="#1a4cff" depthTest={false} />
      </lineSegments>
      <group position={[px, PROXY.height / 2, pz]} rotation-y={YAW}>
        <mesh renderOrder={2}>
          <boxGeometry args={[PROXY.width, PROXY.height, PROXY.depth]} />
          <meshBasicMaterial color="#ff2020" transparent opacity={0.2} depthWrite={false} />
        </mesh>
        <lineSegments geometry={proxy} renderOrder={3}>
          <lineBasicMaterial color="#ff2020" depthTest={false} />
        </lineSegments>
      </group>
    </>
  );
}
