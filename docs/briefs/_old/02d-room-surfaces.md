# Brief 02d: floor and wall surfaces

Read `docs/VISION-scene.md` first.

## Player flow
Edit mode > tap the floor or a wall > a sheet:
- **Presets**: plain gray (default), asphalt, concrete, wood, white tile, siding, brick. Ship these as files in `public/surfaces/`.
- **From a photo**: take or pick a photo of a real surface ("my street", "my room floor").
- **Describe it**: a few words.
Photo or describe costs `costs.surface` cubes (add it to `cubes.json`, start at 5). Presets are free.

## Tool: `makeSurface({ userId, target: 'floor' | 'wall', photoUrl?, prompt? })`
- Nano Banana: "Seamless tileable texture of [the surface in the photo / description], seen straight on, flat even light, no perspective, no shadows, no objects. Exactly 1 meter by 1 meter." 1024 x 1024.
- Check it tiles (blend the edges if needed). Upload to Storage.
- Save on `ssx_profiles.room` (jsonb, add if missing): `{ floor: url, wall: url }`.

## Rendering
- Texture repeats once per meter on floor and walls (walls: 1 m wide by 1 m tall per repeat).
- The white 1 m grid stays on the floor above the texture (0.7 opacity) and can be turned off in edit mode (`grid on / off`).
- Lighting from 02b stays. Textures must not make the scene noisy: slightly lower saturation and contrast on generated surfaces.

## Done when
- Munzir turns the floor into asphalt and the walls into siding from inside the app and it looks like `docs/vision/goal-placeholder-room.png`.
