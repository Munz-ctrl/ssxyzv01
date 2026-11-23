# Brief 02d: walls and surfaces (edit mode)

Read `docs/VISION-scene.md` first. Replaces the old `02d-room-surfaces.md`.

## 0. First, a small fix from the 02c test: avatar shadow
- Today the normalizer bakes a contact shadow into generated avatar PNGs, centered on the toe line, so it sits in front of the feet.
- Move shadows into 3D: one soft floor shadow under the avatar's ground point (the ankle anchor), same look as the box shadows, scaled to the avatar's height. Set `normalize.shadow.opacity` to 0 in `config/avatar.json` so new avatars come out clean.
- Re-normalize Munzir's current avatar from its saved cutout (no new generation, no cubes) so it loses the baked shadow.
- Preset PNGs keep their hand-made shadows for now; don't double them (no 3D shadow when the active avatar is a preset with a baked shadow, or remove the baked ones, whichever is simpler, and say which in LOG.md).

## 0b. Default walls and camera moves (Munzir's notes)
**Tall backdrop walls**
- The two default back walls are tall enough to fill the whole screen above the floor in portrait and landscape (about 12 m; compute from the frustum so they always reach past the top edge).
- They carry the same white 1 m grid as the floor, drawn in the wall's own plane by the shader, so the lines follow each wall's direction automatically (no image slates needed). Same line width and opacity as the floor.
- Wall color: same light gray family as now; the grid makes the corner read clearly.
- In data the default walls are `height: "backdrop"`. Player-made walls use the real heights (low 1 m / normal 2.7 m / tall 4 m). A wall texture replaces the plain color but the grid stays on top, like the floor (`grid on / off` hides both).

**Camera moves**
- The camera angle never changes (yaw 45, tilt -33). Only **zoom and pan** can move, always eased, never snapping.
- Tap the avatar: ease over about 0.6 s to 2x zoom centered on the avatar. Tap empty floor (outside edit mode) or the avatar again: ease back to the default framing.
- Pinch to zoom between 1x and 3x, drag to pan when zoomed in; both ease back if pushed past the limits. Default framing (from `px_per_meter`) is 1x.
- Put the numbers in `config/camera.json` under `moves` (`focus_zoom`, `min_zoom`, `max_zoom`, `ease_seconds`).
- The bake (02f) always renders at the default 1x framing, whatever the current zoom.

## Edit mode
- A small `edit` button on Home (Space Mono, same HUD style). In edit mode: grid lines brighten, a thin bottom bar shows the selected thing and its actions. Tap `done` to leave.
- Outside edit mode nothing is selectable.

## Walls: tool `editWalls({ userId, ops })`
- Walls live on **grid lines in 1 m segments**. Data: list of `{ edge: [i, j, 'x' | 'z'], height }` saved on `ssx_profiles.room.walls` (jsonb). Default room: the two back edges, 2.7 m.
- Tap a grid line: highlight it. Actions: `add wall` or, if a wall is there, `remove`, `height` (low 1 m / normal 2.7 m / tall 4 m), `texture`.
- Extending = adding the next segment. Long-press and slide along a line to add several in a row (nice to have).
- Thickness 0.15 m. Corners join cleanly.
- **Cutaway rule:** a wall segment on the camera side of the player (it would hide the avatar) renders at 0.3 m tall with a clean top, Sims-style. Its real height is kept in data and used in the bake.
- Limits for v0: no doors, windows, ceilings, diagonal walls or multiple rooms. Room max 12 x 12 m.

## Surfaces: tool `makeSurface({ userId, target, photoUrl?, prompt? })`
- `target` is `floor` or a wall segment id (or `all_walls`).
- Sheet: **presets** (plain gray default, asphalt, concrete, wood, white tile, siding, brick, in `public/surfaces/`), **from a photo**, **describe it**. Photo/describe costs `costs.surface` (add to `cubes.json`, start at 5). Presets free.
- Nano Banana: "Seamless tileable texture of [the surface in the photo / description], seen straight on, flat even light, no perspective, no shadows, no objects. Exactly 1 meter by 1 meter." 1024 x 1024. Blend edges if needed. Upload to Storage.
- Repeats once per meter on floor and walls. White floor grid stays on top (0.7 opacity), `grid on / off` in edit mode. Slightly lower saturation/contrast on generated textures so the layout stays readable.

## Done when
- From inside the app, Munzir adds a wall, removes one, makes one tall, turns the floor into asphalt and the walls into siding, and it looks like `docs/vision/goal-placeholder-room.png`.
