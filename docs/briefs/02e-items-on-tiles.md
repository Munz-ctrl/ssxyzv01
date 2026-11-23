# Brief 02e: symbolic items on tiles

Read `docs/VISION-scene.md` first. Needs a new env var: `TRIPO_API_KEY` (Munzir adds it in Vercel).

## Player flow
Edit mode > tap a tile (it highlights) > `add item`:
- **Photo** of a real object, or **describe it** ("blue suitcase with a white house drawn on it", "my Clio trophy").
- Confirm the price (`costs.item`, add to `cubes.json`, start at 15).
- A cardboard box drops onto the tile right away (reuse the 02b box). **The box is the loading state.** When the item is ready, the box opens and the item appears.
- Selected item: `rotate` (90 degree steps), `move` (tap another tile), `remove` (goes to the vault, not deleted).

## Tool: `makeItem({ userId, photoUrl?, prompt })` then `placeItem({ userId, objectId, tile: [i, j], rotation })`
1. **Name and size**: Claude (the agent model) turns the prompt or photo into `{ name, real_size_m: [w, d, h] }` (a suitcase is about 0.45 x 0.28 x 0.7).
2. **Reference image**: Nano Banana makes one clean, isolated, evenly lit image of the object on white, three-quarter view. Skip this step if the player's photo is already clean.
3. **3D**: Tripo image-to-3D (GLB, textured, low to mid poly). Async: create the task, poll.
4. **Scale**: scale the GLB so its bounding box matches `real_size_m` (Tripo's own real-world size option can be used if available). Sit it on the floor, centered on the tile.
5. Save to `ssx_objects` (library: name, glb_url, size, source) and `ssx_room_objects` (tile, rotation). Reuse an existing library object when the name matches closely, so the same suitcase is never generated twice.

## Rendering
- GLBs get the same lighting and soft contact shadow as the avatar and boxes. Objects sort correctly in front of and behind the avatar.
- An item can span tiles (the parking stopper): use its footprint, anchored on the tapped tile.

## Done when
- From inside the app, Munzir adds the suitcase, the trophy and the parking stopper and the room matches `docs/vision/goal-scene.png` closely.
- No code was touched to get there.
