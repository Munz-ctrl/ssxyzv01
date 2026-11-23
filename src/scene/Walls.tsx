import { useThree } from '@react-three/fiber';
import { useEffect, useMemo, useRef } from 'react';
import { BoxGeometry, EdgesGeometry, type Group, type ShaderMaterial, type Texture, TextureLoader } from 'three';
import { gridToWorld, wallRuns, type Edge, type Room, type Wall, type WallRun } from '../../shared/room';
import { backdropHeight, cameraDirection, pxPerMeter, ROOM, ROOM_RULES } from './camera';
import { setLook, surfaceMaterial } from './surfaceMaterial';

const T = ROOM.wallThickness;

// Textures load once per url and stay cached; the scene redraws when one arrives.
const loader = new TextureLoader();
const cache = new Map<string, Texture>();
export function useTexture(url: string | undefined): Texture | null {
  const invalidate = useThree((s) => s.invalidate);
  if (!url) return null;
  let tex = cache.get(url);
  if (!tex) {
    tex = loader.load(url, () => invalidate());
    cache.set(url, tex);
  }
  return tex;
}

// Which side of the player a point is on, along the camera direction (bigger = nearer the camera).
const [CDX, , CDZ] = cameraDirection();
export const depthOf = (x: number, z: number) => x * CDX + z * CDZ;

export function runBox(run: WallRun, height: number) {
  const [a] = gridToWorld(run.from, 0, ROOM_RULES);
  const [b] = gridToWorld(run.to, 0, ROOM_RULES);
  const len = b - a + T; // half a thickness past each end so corners close
  const mid = (a + b) / 2;
  if (run.axis === 'x') {
    const [, z] = gridToWorld(0, run.line, ROOM_RULES);
    return { size: [len, height, T] as [number, number, number], pos: [mid, height / 2, z] as [number, number, number] };
  }
  const [x] = gridToWorld(run.line, 0, ROOM_RULES);
  const [, za] = gridToWorld(0, run.from, ROOM_RULES);
  const [, zb] = gridToWorld(0, run.to, ROOM_RULES);
  return { size: [T, height, zb - za + T] as [number, number, number], pos: [x, height / 2, (za + zb) / 2] as [number, number, number] };
}

// The two floor points of a segment, world m.
export function edgeEnds([i, j, a]: Edge): [[number, number], [number, number]] {
  return [gridToWorld(i, j, ROOM_RULES), gridToWorld(a === 'x' ? i + 1 : i, a === 'z' ? j + 1 : j, ROOM_RULES)];
}

interface WallsProps {
  room: Room;
  textures: Record<string, string>; // texture ref -> url
  player: [number, number]; // world x, z
  grid: number;
  selected: Edge | null;
  groupRef: React.RefObject<Group | null>;
}

// Walls on grid lines. A segment on the camera side of the player is cut down to a low stub so it
// never hides the avatar (its real height stays in the data and goes to the bake).
export function Walls({ room, textures, player, grid, selected, groupRef }: WallsProps) {
  const size = useThree((s) => s.size);
  const dpr = useThree((s) => s.viewport.dpr);
  const topM = size.height / 2 / pxPerMeter(size.width, size.height);
  const playerDepth = depthOf(...player);

  const cut = (w: Wall) => {
    const [[x1, z1], [x2, z2]] = edgeEnds(w.edge);
    return depthOf((x1 + x2) / 2, (z1 + z2) / 2) > playerDepth + 1e-6;
  };
  const textureOf = (w: Wall) => w.texture ?? room.wall_texture;
  const runs = wallRuns(room.walls, (w) => ({ height: cut(w) ? ROOM.cutawayHeight : w.height, texture: textureOf(w) }));

  // one material per texture (or none), shared by every run that uses it
  const refs = [...new Set(runs.map((r) => r.texture ?? ''))];
  const materials = useRef(new Map<string, ShaderMaterial>());
  for (const ref of refs) {
    if (!materials.current.has(ref)) materials.current.set(ref, surfaceMaterial({ color: ROOM.wallColor, grid, lit: true }));
  }
  const maps = new Map(refs.map((ref) => [ref, ref ? (textures[ref] ?? '') : ''] as const));
  return (
    <group ref={groupRef}>
      {refs.map((ref) => (
        <MaterialLook key={ref} material={materials.current.get(ref)!} url={maps.get(ref) || undefined} grid={grid} dpr={dpr} />
      ))}
      {runs.map((run) => {
        const h = run.height === 'backdrop' ? backdropHeight(runEnds(run), topM) : run.height;
        const { size: s, pos } = runBox(run, h);
        return (
          <mesh key={`${run.axis}:${run.line}:${run.from}`} position={pos} material={materials.current.get(run.texture ?? '')} userData={{ run }}>
            <boxGeometry args={s} />
          </mesh>
        );
      })}
      {selected && <Selection edge={selected} room={room} topM={topM} cut={cut} />}
    </group>
  );
}

function runEnds(run: WallRun): [number, number][] {
  const first = run.edges[0];
  const last = run.edges.at(-1)!;
  return [edgeEnds(first)[0], edgeEnds(last)[1]];
}

// Keeps a shared material's texture, grid and line width current.
function MaterialLook({ material, url, grid, dpr }: { material: ShaderMaterial; url?: string; grid: number; dpr: number }) {
  const map = useTexture(url);
  const invalidate = useThree((s) => s.invalidate);
  useEffect(() => {
    setLook(material, { map });
    invalidate();
  }, [material, map, invalidate]);
  setLook(material, { grid, dpr });
  return null;
}

// The selected grid line: an outline around its wall, or a dark bar on the floor if it has none.
function Selection({ edge, room, topM, cut }: { edge: Edge; room: Room; topM: number; cut: (w: Wall) => boolean }) {
  const wall = room.walls.find((w) => w.edge[0] === edge[0] && w.edge[1] === edge[1] && w.edge[2] === edge[2]);
  const run: WallRun = { axis: edge[2], line: edge[2] === 'x' ? edge[1] : edge[0], from: edge[2] === 'x' ? edge[0] : edge[1], to: (edge[2] === 'x' ? edge[0] : edge[1]) + 1, height: 0, edges: [edge] };
  const height = !wall ? 0.012 : cut(wall) ? ROOM.cutawayHeight : wall.height === 'backdrop' ? backdropHeight(edgeEnds(edge), topM) : wall.height;
  const { size, pos } = runBox(run, height);
  const pad = 0.02;
  const outline = useMemo(() => new EdgesGeometry(new BoxGeometry(size[0] + pad, size[1] + pad, size[2] + pad)), [size[0], size[1], size[2]]);
  if (!wall) {
    return (
      <mesh position={[pos[0], 0.006, pos[2]]} renderOrder={4}>
        <boxGeometry args={[edge[2] === 'x' ? 1 : 0.07, 0.012, edge[2] === 'z' ? 1 : 0.07]} />
        <meshBasicMaterial color="#111" depthTest={false} transparent opacity={0.85} />
      </mesh>
    );
  }
  return (
    <lineSegments geometry={outline} position={pos} renderOrder={4}>
      <lineBasicMaterial color="#111" depthTest={false} />
    </lineSegments>
  );
}
