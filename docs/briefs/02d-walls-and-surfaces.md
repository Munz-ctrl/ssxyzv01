# Brief 02d: walls and surfaces (edit mode)

Read `docs/VISION-scene.md` first. Replaces the old `02d-room-surfaces.md`.

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
