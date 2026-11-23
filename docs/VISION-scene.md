# Scene goal (Chapter 2)

Goal image: `docs/vision/goal-scene.png`. Start state: `docs/vision/goal-placeholder-room.png`.

From a blank room with the placeholder avatar, **a player (not a developer), inside the app**, can get to the goal image:
1. **A custom, accurate avatar** of themselves, true to their real height and pose. (brief 02c)
2. **Custom walls and surfaces**: add, remove and resize walls on the grid; floor and wall textures from a photo or prompt. (brief 02d)
3. **Symbolic items** (the suitcase, the trophy, the parking stopper) placed on chosen tiles and moved freely. (brief 02e)
4. **The bake**: one tap turns the locked layout into a photoreal, harmonized final image. (brief 02f)

## Two layers
- **Layout (live, instant, cheap):** real 3D floor, walls and a bounding box per item under the locked camera. Edit mode shows this. Moving or rotating anything never regenerates anything.
- **Bake (on lock):** guide renders of the layout + reference images go to the image model, which paints the final frame with consistent light and shadows. Home shows the latest bake. Edit mode shows the layout.

If a player can do all three, the infrastructure can deliver detailed, controlled 3D scenes. The agent comes later and uses the **same tools** the player uses.

## Rules that hold for all three
- Every capability is a server tool in `api/_lib/tools/` with a plain function signature (`createAvatar`, `editWalls`, `makeSurface`, `makeItem`, `placeItem`, `bakeScene`). The UI calls them through `/api`. Later the agent calls the same functions. No logic in the UI that the agent could not reuse.
- The camera never changes: `config/camera.json`. Everything generated must match it.
- Generated files live in Supabase Storage bucket `ssx` under `{user_id}/...`. Rows in `ssx_` tables only.
- Long AI jobs are async: create a job, return its id, the client polls. Vercel functions stay under 60 s.
- Costs come from `config/cubes.json` (`costs`). Show the price before the player confirms.
- Edit mode: a small `edit` button on Home. Nothing is editable outside it. Leaving edit mode with changes asks `bake now?`.
- 3D models are optional. An item only needs a real-size box + one reference image; a GLB (Tripo, Hyper3D, or Munzir's own) is a nicer edit preview, never required. No provider is hardcoded.
