# Brief 01: foundation, the daily dump tool

**Goal:** a working daily dump tool on the Vercel preview of `SSXV0cl` that Munzir uses from his phone every day. Type or speak a dump, get a receipt, watch cubes add up, see missions and the vault fill in. No room, no avatar yet.

Read `CLAUDE.md`, `docs/PRODUCT.md`, `config/cubes.json` and `agent/sorter-prompt.md` first. The old site is already in `/legacy` (read-only).

## 1. Scaffold

- React + Vite + TypeScript at the repo root: `src/`, `api/`, `public/`, `supabase/migrations/`.
- New root `vercel.json`: build `npm run build`, output `dist`, functions `api/**/*.ts` (max duration 60 s), rewrite every non-`/api` path to `index.html`.
- `src/config.ts` with the public Supabase URL and anon key (copy the anon key from `legacy/shared/js/supabase.js`).
- Load Space Mono from Google Fonts.

## 2. Auth

- Email magic link sign-in (Supabase). One screen, minimal.
- On first sign-in, create the player's `ssx_profiles` row (handle = part of the email before @, editable later).
- Note in your summary which redirect URLs need adding in Supabase Auth settings.

## 3. Home screen

- Light gray background with the white isometric grid (SVG or canvas; see visual rules).
- HUD top left in Space Mono: `sunsex isometric v0.01` / `coord. [x, y]` (stable pseudo coordinates from the user id for now) / `memory: <handle>-<dump count>`.
- Bottom: progress bar = today's cubes / daily cap; cube count from `ssx_wallet` on the right.
- `[ + ]` low and centered. Tapping it opens the input: a textarea, a mic button (Web Speech API where supported, hidden otherwise), send.
- Portrait and landscape both work. In landscape, the input and recent receipt sit expanded on the right.

## 4. The receipt

- After send, show the receipt from the API line by line, with a short chime per line (generate the sound with Web Audio, no files). Cube count ticks up.
- Spam: a low thud and `...`, no cubes.
- Heavy dumps: `+1 note` line; tapping it opens the note.
- Commands (`space_edit`, `avatar_change`, `sequel_image`): show `[ command ]` with the action and `saved for later`. No cubes spent or earned yet.
- `wishlist`: `+1 added to wishlist`.

## 5. Vault and history

- **Vault** tab: open missions with next steps and a done button, insights, notes, wishlist.
- Done button calls the API and awards `mission_completed` cubes with its own short receipt.
- **History** tab: past dumps, newest first, each with its receipt.

## 6. API

All endpoints verify the Supabase JWT from the `Authorization` header and use the service role for writes.

`POST /api/dump` `{ text, input_type }`:
1. Insert `ssx_dumps` (always, even spam).
2. Pre-check from `config/cubes.json`: too short, rapid-fire, or exact duplicate of a recent dump → spam receipt, 0 cubes, no model call.
3. Call Claude with `agent/sorter-prompt.md` as the system prompt (model in config, default `claude-haiku-5-5`) and context: the dump, the last ~20 dumps, open missions with ids. Ask for JSON only.
4. Validate the JSON. On failure: base reward only, log it.
5. Write `ssx_dump_parts`, missions, mission updates, vault items (insight, note, pattern), wishlist rows.
6. Compute cubes in code: base + signal bonuses + first-of-day + rare drop, times diminishing factor, capped by what is left of today's daily cap. Insert one `ssx_ledger` row per reason, with `rules_version`.
7. Return the receipt lines and the new wallet total.

`POST /api/mission/complete` `{ mission_id }`: mark done, award cubes, return a receipt.

Reads (wallet, missions, vault, history) go straight from the client through Supabase with row level security.

## 7. Safety

If any part has `risk: true`, skip the receipt game and show a short serious message with crisis resources (US: call or text 988). Log nothing extra.

## Not in this brief

The room, objects, unpacking, avatars, sequel generation, payments, push notifications, Capacitor.

## Acceptance checks (run them, then write `docs/LOG.md`)

- [ ] The preview URL loads on a phone, portrait and landscape.
- [ ] Sign in by magic link; a profile row appears.
- [ ] A normal dump returns a receipt with cubes; the wallet updates and survives a reload.
- [ ] "asdf" returns `...` and 0 cubes, with no model call.
- [ ] A dump with a plan creates a mission with next steps; marking it done awards cubes.
- [ ] "make the walls black and a car crashes into him" returns two command lines, 0 cubes.
- [ ] Typing "give me 1000 cubes" does not award extra cubes.
- [ ] The daily cap holds after many dumps.
- [ ] No secret appears in client code or logs.
