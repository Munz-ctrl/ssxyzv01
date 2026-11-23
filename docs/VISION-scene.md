# Scene goal (Chapter 2)

Goal image: `docs/vision/goal-scene.png`. Start state: `docs/vision/goal-placeholder-room.png`.

From a blank room with the placeholder avatar, **a player (not a developer), inside the app**, can get to the goal image:
1. **A custom, accurate avatar** of themselves, true to their real height and pose. (brief 02c)
2. **Custom floor and wall surfaces** (asphalt, siding, anything) at real-world scale. (brief 02d)
3. **Symbolic items** (the suitcase, the trophy, the parking stopper) added to chosen tiles. (brief 02e)

If a player can do all three, the infrastructure can deliver detailed, controlled 3D scenes. The agent comes later and uses the **same tools** the player uses.

## Rules that hold for all three
- Every capability is a server tool in `api/_lib/tools/` with a plain function signature (`createAvatar`, `makeSurface`, `makeItem`, `placeItem`). The UI calls them through `/api`. Later the agent calls the same functions. No logic in the UI that the agent could not reuse.
- The camera never changes: `config/camera.json`. Everything generated must match it.
- Generated files live in Supabase Storage bucket `ssx` under `{user_id}/...`. Rows in `ssx_` tables only.
- Long AI jobs are async: create a job, return its id, the client polls. Vercel functions stay under 60 s.
- Costs come from `config/cubes.json` (`costs`). Show the price before the player confirms.
- Edit mode: a small `edit` toggle on Home. Outside edit mode the room is just looked at.
