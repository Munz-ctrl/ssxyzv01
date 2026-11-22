# Brief 02b: the 3D room (camera and scene foundation)

Goal: replace the flat SVG grid on Home with a **real 3D scene** that follows the locked Sunsex camera. No agent wiring yet. This is the foundation every later visual (boxes, objects, beauty pass) builds on, so precision matters more than features.

Read `config/camera.json` first. It is the single source of truth for the camera, scale and room. Do not hardcode those numbers anywhere else.

## Stack
- `three` + `@react-three/fiber` (+ `@react-three/drei` only if it saves real code). Lazy-load the 3D chunk so sign in stays fast.

## 1. Camera (the important part)
- Orthographic camera. Yaw 45 degrees, tilt -33 degrees (looking down 33 degrees). Target: center of the room floor.
- Scale from `px_per_meter`: portrait (width <= height) `k = width * 205 / 1080`; landscape `k = width * 116 / 1920`. Set the ortho frustum so 1 meter = k CSS pixels. This reproduces the old SVG grid sizes (tile edge 165 px at 1080 portrait, 93 px at 1920 landscape).
- No orbit, no zoom, no user camera control. The camera never moves in this brief. Recompute on resize.
- Add a dev check (`?debug=cam`): draw a 1 m test cube at the origin and print k and the screen angle of a floor line. Expect about 28.5 degrees.

## 2. Floor and room
- Infinite-looking floor: `#b3b3b3`, white 1 m grid lines at 0.7 opacity, extending past the screen edges (same look as today).
- Room: 6 x 6 m area. Walls on the **back two edges only** (the two edges farthest from camera), 2.7 m tall, 0.15 m thick, flat light gray, no ceiling. Front two edges open.
- Lighting: soft and flat, one ambient plus one gentle directional, soft contact shadow under objects. Natural, iPhone-like, no drama.

## 3. Avatar (2D sprite in the 3D room)
- Use `public/avatars/avatar_01.png` (800 x 1000, transparent, feet anchor at (400, 900), person 620 px tall = 1.8 m). See `public/avatars/avatars.json`.
- Render as a camera-facing plane (billboard, rotates only around the vertical axis). Size it so the person's feet sit exactly on the floor point and the person reads as 1.8 m tall on screen: plane height = (1000 / 620) * 1.8 * cos(33 deg) m, keep the 4:5 aspect, offset so pixel (400, 900) sits on the floor.
- Place the player at room tile (3, 3). Correct depth: objects in front of the player hide them, objects behind are hidden by them.
- `?debug=cam` also shows the red player proxy box (0.5 x 0.3 x 1.8 m) at the same spot, so we can check the sprite matches it.

## 4. A test box
- Dev-only button (only with `?debug=cam`): `drop box`. A 0.5 m cardboard-colored cube falls from about 3 m onto a random free tile inside the room, with a small bounce and a soft thud (reuse `sfx`). Boxes stay until reload.

## 5. Keep everything else
- HUD, `[ + ]`, receipt, vault, history and level bar sit on top of the canvas unchanged. Delete the old SVG `Grid.tsx` once the 3D floor matches it.
- Must run smoothly on an iPhone (cap pixel ratio at 2, render only on change).

## Done when
- Portrait and landscape screenshots line up with the old grid slates in `100 DAY RACE/SSX V0 CHAPTERS/1-1 grid slates` (same tile size and angle).
- Avatar stands on the tile with feet planted and the right size against the red proxy.
- Test boxes drop, land on the grid, and sort correctly in front of and behind the avatar.
- `npm run build` passes. Log it in `docs/LOG.md` with a portrait and landscape screenshot.
