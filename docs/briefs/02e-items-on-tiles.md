# Brief 02e: items on tiles (boxes + reference images)

Read `docs/VISION-scene.md` first.

## What an item is
An item = **a real-size bounding box + one reference image**. That is all the bake needs. A 3D model is an optional preview.
- `ssx_objects` (library): `name`, `real_size_m [w, d, h]`, `ref_image_url`, `preview_kind` (`card` | `glb`), `glb_url` (nullable), `source`.
- `ssx_room_objects`: `object_id`, `tile [i, j]`, `rotation` (0/90/180/270), `hidden`.

## Player flow (edit mode)
- Tap a tile, then `add item`: **photo** of a real object or **describe it**. Price `costs.item` (add to `cubes.json`, start at 10).
- A cardboard box drops on the tile at once (reuse the 02b box): **the box is the loading state**. When ready, the box opens into the item.
- Tap an item: `move` (tap a new tile, instant), `rotate` (90 degree steps, instant), `remove` (to the vault, not deleted). Moving or rotating never regenerates anything.

## Tools
`makeItem({ userId, photoUrl?, prompt })`:
1. **Name and size**: the agent model returns `{ name, real_size_m }` (a suitcase is about 0.45 x 0.28 x 0.7 m; a parking stopper about 1.8 x 0.15 x 0.1 m).
2. **Reference image**: Nano Banana makes one clean, isolated, evenly lit image of the object, drawn from our camera angle (-33 degrees, 45 degrees, long lens) on white; cut out to transparent PNG. Skip generation if the player's photo is already clean, but still cut it out.
3. Reuse a library object when the name matches closely, so the same suitcase is never made twice.

`placeItem({ userId, objectId, tile, rotation })`: footprint from `real_size_m` and rotation; may span tiles (the stopper). Block tiles already taken.

## Preview in the layout
- Default preview `card`: the reference PNG as a camera-facing card sized to the box height and anchored at the footprint center, with a faint wireframe of the bounding box in edit mode. Soft contact shadow.
- Optional `glb`: if `glb_url` is set (uploaded by hand or from any image-to-3D provider later), render the model scaled to the box instead. **Do not integrate Tripo or Hyper3D in this brief.** Just support loading a GLB URL so Munzir can test providers by hand.
- Correct sorting in front of and behind the avatar uses the bounding boxes.

## Done when
- From inside the app Munzir adds the suitcase, the trophy and the parking stopper, moves and rotates them freely without any regeneration, and the layout matches the arrangement in `docs/vision/goal-scene.png`.
