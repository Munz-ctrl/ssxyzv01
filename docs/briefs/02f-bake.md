# Brief 02f: the bake

Read `docs/VISION-scene.md` first. The layout is the truth; the bake is the beauty.

## Player flow
- Leaving edit mode with changes: `bake now? (N cubes)`. Also a `bake` action in the vault.
- While baking, the layout stays on screen with a slow shimmer over it. Then the baked image fades in.
- Home shows the latest bake as a full-screen still under the HUD, at exactly the layout's camera and framing. Edit mode switches back to the live layout.
- Each bake is saved in history as a memory card (date, the dump or change that caused it), shareable.

## Tool: `bakeScene({ userId })`
1. **Render guide passes** of the current layout at a fixed output size (1080 x 1920 portrait; 1920 x 1080 landscape when baked on landscape):
   - `beauty`: the plain layout render (textures, cards, avatar, simple light).
   - `depth`: grayscale depth.
   - `outline`: edges of floor tiles, walls and item boxes.
   - `ids`: flat color per item / wall / avatar (for the check in step 4).
   Render these client-side from the same three.js scene and upload them, or render server-side; pick whichever stays reliable on iPhone.
2. **Gather references**: the avatar PNG, each item's reference PNG, the floor and wall textures.
3. **Generate** with Nano Banana (Replicate). Inputs: the guide passes first, then references. Prompt core:
   > Turn the first image into a photoreal photograph. Keep the camera, framing, every wall, the floor grid and every object exactly where they are (see the depth and outline guides). Use the reference images for how the person and each object look. Natural soft daylight, one consistent light direction, real contact shadows, materials as in the references. Do not add, remove or move anything.
4. **Drift check**: compare the result with `outline` / `ids` (edge overlap and the position of each object's bounding area). If anything moved too far, retry once with a stricter prompt; if it fails again, show the bake with a small `rough bake` tag and keep the previous good bake available.
5. Save to Storage and `ssx_bakes` (new table: `user_id`, `image_url`, `layout_snapshot` jsonb, `guide_urls`, `status`, `created_at`). Set it as the current home image.

## Costs
- `costs.bake` in `cubes.json` (start at 20). One bake per lock, never per edit. Free bake after the first avatar so the first experience is magic.

## Done when
- Munzir builds the goal room in edit mode, taps `bake`, and gets an image close to `docs/vision/goal-scene.png`: same layout, photoreal, consistent light and shadows, his face intact.
- Log 3 bakes with their guide passes in `docs/LOG.md`, including one that failed the drift check if it happens.
