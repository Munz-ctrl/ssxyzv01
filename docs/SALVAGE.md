# Salvage from /legacy

The old site (sunsex.xyz, "real-life mirror / social RPG") lives in `/legacy`, read-only. What to reuse:

| Piece | Where | Reuse |
| --- | --- | --- |
| Avatar template swap | `legacy/api/dressup/generate.js` (mode `avatar`), prompt in `legacy/apps/tools/dressup/js/dressup.js`, template `legacy/apps/tools/dressup/assets/` | The avatar generator, half built: replaces a red mannequin in a template with the person from uploaded photos on `google/nano-banana-pro` via Replicate, with a strict "keep camera, zoom, placement" prompt. Chapter 2 starts here with the new plates and the red player proxy |
| Generation route pattern | `legacy/api/dressup/generate.js` | Validate inputs, spend credits server-side first, call Replicate with retry and polling, store output. Reuse for avatars and sequel images |
| Credit system | Supabase functions `dressup_consume_credits`, `dressup_get_chest`, tables `dressup_*` | Model for the cube economy: the community pool becomes the daily free pool. New code uses `ssx_ledger`, not the old tables |
| Stripe | `legacy/api/dressup/create-checkout-session.js`, `stripe-webhook.js` | Reuse for the $1 founder pass and cube packs (Chapter 6) |
| Suitcase art | `legacy/shared/assets/suitcase/` (suitcase alone, person arrives, person opening, `nomad_seq.mp4`, clothing cutouts) | Chapter 5 unpacking tutorial |
| World map | `legacy/apps/map/`, `legacy/shared/js/main.js`, `ssxyz.js`, `playerUtils.js` (Leaflet + Supabase players and locations) | Not v0. Starting point for Outer World |
| Auth helper | `legacy/shared/js/authContext.js`, `supabase.js` | Same pattern, rewritten in TypeScript |
| Copy | `legacy/apps/map/map.html` | "the only player and mission that matters: you and your personal mission" |

**Do not reuse:** dashboard, profile editor, homepage islands grid, DressUp try-on mode and storefront UI, puffcounter, IDRS, pixel world, portfolio (moves to Virtuosus).

**Visual notes from legacy:** near-black radial gradient, thin white borders, pill buttons, small uppercase labels with wide letter spacing, Ubuntu on map and suitcase pages. v0 replaces this with the light gray grid look and Space Mono.

**At launch (when v0 replaces main):** move legacy tables and functions out of the public API schema, and archive the old storage bucket.
