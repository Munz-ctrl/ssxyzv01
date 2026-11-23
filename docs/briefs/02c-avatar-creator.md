# Brief 02c: avatar creator

Read `docs/VISION-scene.md` first.

## 0. Avatar files (do first, small)
- `public/avatars/*.png` are now the source of truth: Munzir resized each one to its real height and placed the ankle center on the template cross himself (avatar_05 is 4'9", avatar_04 is mid-step). **Do not apply any per-avatar `scale`.** Every PNG uses the same canvas scale (anchor (400, 875), 620 px = 1.8 m above the anchor).
- Rewrite `public/avatars/avatars.json` to list every file, including `avatar_00_placeholdermaniquin.png` and `avatar_07_munz4rmDressup.png`, with no scale fields.
- New players start with **avatar_00 (placeholder)** until they make their own.
- Debug picker (`?debug=cam`): cycle through the preset avatars in the room.

## 1. Player flow
Vault > `avatar` > `make my avatar`:
1. Add 1 to 3 photos of yourself (full body if possible; camera or library).
2. Enter your height (ft/in or cm).
3. Confirm the price: first avatar free, then `costs.avatar` cubes.
4. While it works, the placeholder avatar stays in the room with a small `...` above its head.
5. Result appears in the room. `keep` or `try again`.

## 2. Tool: `createAvatar({ userId, photoUrls, heightM })`
1. **Generate** with Replicate `google/nano-banana-pro` (see `docs/SALVAGE.md`, `REPLICATE_API_TOKEN` already exists). Inputs, in this order: `agent/refs/grid-portrait.png`, `agent/refs/grid-player-placement.png`, then the player photos. Prompt (Munzir's proven wording, adapted):
   > The first two images are grid guides showing our camera: a true -33 degree downward angle, rotated 45 degrees, very long flat lens. Recreate the person from the remaining photos as a full-body figure standing on this floor, seen from exactly that camera. Keep their face, body, build, hair and outfit. Natural standing pose. Soft natural daylight, plain flat light gray background, no props, full body in frame with space around.
2. **Cut out** the background (a Replicate background-removal model; pick one with transparent PNG output).
3. **Normalize** to the avatar spec: find the person's alpha bounds. Ground point = horizontal center of the lowest 4% of the figure, raised by 3% of the figure height (ankle center, not toe tips). Scale so the distance from ground point to top of head = `heightM * 620 / 1.8` px. Place the ground point at (400, 875) on an 800 x 1000 transparent canvas. Add a soft contact shadow ellipse under it.
4. Upload to Storage, insert `ssx_avatars` row, set it active on `ssx_profiles`.
- Save the raw generation too, so we can re-normalize later without paying again.

## Done when
- Munzir uploads a selfie and his height and, without touching code, sees himself standing correctly sized and planted in the room.
- Overlaying `public/avatars/avatar_template.png` on the output shows ankles on the cross and the head at the right height line.
- Log 3 test runs (photos in, PNG out) in `docs/LOG.md`.
