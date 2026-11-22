import { Canvas, useFrame, useLoader, useThree } from '@react-three/fiber';
import { Suspense, useLayoutEffect, useMemo, useRef, useState } from 'react';
import {
  BoxGeometry,
  CanvasTexture,
  Color,
  EdgesGeometry,
  Mesh,
  MeshBasicMaterial,
  OrthographicCamera,
  ShaderMaterial,
  SRGBColorSpace,
  TextureLoader,
  Vector3,
} from 'three';
import { thud } from '../lib/sfx';
import { avatarPlane, cameraDirection, FLOOR, PROXY, pxPerMeter, ROOM, tileCenter, YAW } from './camera';

const AVATAR_FILE = '/avatars/avatar_01.png';
const PLAYER_TILE: [number, number] = [3, 3];
const CAMERA_DISTANCE = 50;
const FLOOR_SIZE = 200;

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

// The 3D backdrop. `room` adds the walls and the player; without it only the floor shows.
export default function Scene({ room }: { room: boolean }) {
  const [debug] = useState(debugCam);
  const [measure, setMeasure] = useState<Measure | null>(null);
  const [boxes, setBoxes] = useState<DroppedBox[]>([]);
  const nextId = useRef(1);

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

  return (
    <>
      <div className="scene" aria-hidden="true">
        <Canvas
          orthographic
          flat
          frameloop="demand"
          dpr={[1, 2]}
          camera={{ near: 0.1, far: 400 }}
          gl={{ antialias: true }}
        >
          <Rig onMeasure={debug ? setMeasure : undefined} />
          {/* physical light units: intensity pi lights a lambert surface at its own color */}
          <ambientLight intensity={0.8 * Math.PI} />
          <directionalLight position={[3, 6, 5]} intensity={0.45 * Math.PI} />
          <Floor />
          {room && (
            <>
              <Walls />
              <Suspense fallback={null}>
                <Avatar />
              </Suspense>
              {boxes.map((b) => (
                <DropBox key={b.id} tile={b.tile} />
              ))}
              {debug && <DebugShapes />}
            </>
          )}
        </Canvas>
      </div>
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
        </div>
      )}
    </>
  );
}

// The locked camera: orthographic, fixed yaw and tilt, 1 m = k css px. Never moves; recomputed on resize.
function Rig({ onMeasure }: { onMeasure?: (m: Measure) => void }) {
  const camera = useThree((s) => s.camera) as OrthographicCamera;
  const size = useThree((s) => s.size);
  const invalidate = useThree((s) => s.invalidate);

  useLayoutEffect(() => {
    const [dx, dy, dz] = cameraDirection();
    camera.position.set(dx * CAMERA_DISTANCE, dy * CAMERA_DISTANCE, dz * CAMERA_DISTANCE);
    camera.up.set(0, 1, 0);
    camera.lookAt(0, 0, 0);
    // r3f keeps the frustum at the canvas size in css px, so zoom = px per meter
    camera.zoom = pxPerMeter(size.width, size.height);
    camera.updateProjectionMatrix();
    camera.updateMatrixWorld();
    invalidate();

    if (onMeasure) {
      const px = (x: number, y: number, z: number) => {
        const p = new Vector3(x, y, z).project(camera);
        return [((p.x + 1) / 2) * size.width, ((1 - p.y) / 2) * size.height];
      };
      const [ax, ay] = px(0, 0, 0);
      const [bx, by] = px(1, 0, 0);
      const [fx, fy] = tileCenter(...PLAYER_TILE);
      const [, feet] = px(fx, 0, fy);
      const [, head] = px(fx, PROXY.height, fy);
      onMeasure({
        k: camera.zoom,
        angle: (Math.atan2(Math.abs(by - ay), Math.abs(bx - ax)) * 180) / Math.PI,
        personPx: feet - head,
      });
    }
  }, [camera, size.width, size.height, invalidate, onMeasure]);

  return null;
}

// Flat gray floor with a white 1 m grid, drawn 1 css px wide at any pixel ratio.
function Floor() {
  const dpr = useThree((s) => s.viewport.dpr);
  const material = useMemo(
    () =>
      new ShaderMaterial({
        depthWrite: false,
        uniforms: {
          uFloor: { value: new Color(FLOOR.color) },
          uLine: { value: new Color(FLOOR.grid_color) },
          uOpacity: { value: FLOOR.grid_opacity },
          uStep: { value: FLOOR.grid_step_m },
          uWidth: { value: 1 },
        },
        vertexShader: /* glsl */ `
          varying vec2 vXZ;
          void main() {
            vec4 world = modelMatrix * vec4(position, 1.0);
            vXZ = world.xz;
            gl_Position = projectionMatrix * viewMatrix * world;
          }
        `,
        fragmentShader: /* glsl */ `
          uniform vec3 uFloor;
          uniform vec3 uLine;
          uniform float uOpacity;
          uniform float uStep;
          uniform float uWidth;
          varying vec2 vXZ;
          float lineDistance(float v) {
            float g = v / uStep;
            float d = abs(fract(g + 0.5) - 0.5);
            float perPixel = length(vec2(dFdx(g), dFdy(g)));
            return d / perPixel;
          }
          void main() {
            float dist = min(lineDistance(vXZ.x), lineDistance(vXZ.y));
            float line = 1.0 - smoothstep(uWidth * 0.5 - 0.5, uWidth * 0.5 + 0.5, dist);
            gl_FragColor = vec4(mix(uFloor, uLine, line * uOpacity), 1.0);
            #include <colorspace_fragment>
          }
        `,
      }),
    [],
  );
  material.uniforms.uWidth.value = dpr;

  return (
    <mesh rotation-x={-Math.PI / 2} material={material} renderOrder={-2}>
      <planeGeometry args={[FLOOR_SIZE, FLOOR_SIZE]} />
    </mesh>
  );
}

// Walls on the two back edges only (x and z at the far side), outside the 6 x 6 floor.
function Walls() {
  const t = ROOM.wallThickness;
  const h = ROOM.wallHeight;
  const hx = ROOM.width / 2;
  const hz = ROOM.depth / 2;
  return (
    <group>
      <mesh position={[-hx - t / 2, h / 2, -t / 2]}>
        <boxGeometry args={[t, h, ROOM.depth + t]} />
        <meshLambertMaterial color="#dcdcdc" />
      </mesh>
      <mesh position={[0, h / 2, -hz - t / 2]}>
        <boxGeometry args={[ROOM.width, h, t]} />
        <meshLambertMaterial color="#dcdcdc" />
      </mesh>
    </group>
  );
}

// A camera-facing sprite that only turns around the vertical axis. Feet anchor on the floor point.
function Avatar() {
  const texture = useLoader(TextureLoader, AVATAR_FILE);
  texture.colorSpace = SRGBColorSpace;
  const plane = avatarPlane();
  const [x, z] = tileCenter(...PLAYER_TILE);
  return (
    <group position={[x, 0, z]} rotation-y={YAW}>
      <mesh position={[plane.offsetX, plane.offsetY, 0]} renderOrder={1}>
        <planeGeometry args={[plane.width, plane.height]} />
        <meshBasicMaterial map={texture} transparent alphaTest={0.01} toneMapped={false} />
      </mesh>
    </group>
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
