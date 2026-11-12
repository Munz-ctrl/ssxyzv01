# CLAUDE.md

Guidance for Claude Code working in this repo on branch `SSXV0cl`.

## What this is

**Sunsex v0 ("Inner World")**: a mobile-first web app where the player dumps anything into a `[ + ]` input and gets back a receipt of cubes, missions, insights and notes. Later briefs add the isometric room, unpacking, avatars and the app wrapper. Sunsex is the name of the whole universe; this branch builds its first product.

The previous site lives in `/legacy` and is **read-only reference**. Never edit, route or deploy anything from `/legacy`. Mine it for patterns (see `docs/SALVAGE.md`).

## Source of truth

1. `docs/briefs/NN-*.md`: the current task. **Work on one brief at a time. Never start the next brief on your own.**
2. `docs/PRODUCT.md`: the product spec (how every block works, visual rules).
3. `docs/SALVAGE.md`: what is worth reusing from `/legacy`.
4. `config/cubes.json`: every cube number lives here, never hardcoded.
5. `agent/sorter-prompt.md`: the sorter agent's system prompt.

If a brief and PRODUCT.md disagree, the brief wins and you note the conflict in your summary.

## Stack

- React + Vite + TypeScript, static build to `dist/` (no server rendering: the app gets wrapped with Capacitor later).
- Vercel: static site plus serverless functions in `/api` (Node, TypeScript).
- Supabase project `hoaztxbbeabvwewswmkl` (URL `https://hoaztxbbeabvwewswmkl.supabase.co`) for auth, Postgres and storage.
- Anthropic API, server-side only, via the official SDK.

## Supabase rules

- Only touch tables prefixed `ssx_`. Never read or write `players`, `dressup_*`, `locations`, `memories` or any other non-`ssx_` table.
- Row level security is on. Clients may only **read** their own rows (plus `ssx_objects`), update their own `ssx_profiles`, and update placement fields on their own `ssx_room_objects`.
- **All writes that create dumps, award cubes, or create missions/vault items go through `/api` using the service role key.** The client never inserts into `ssx_ledger`.
- The wallet is the `ssx_wallet` view (sum of `ssx_ledger.delta`). Never store a balance anywhere.
- Every raw dump is kept forever in `ssx_dumps`. Labels and scores live in `ssx_dump_parts` and `ssx_ledger`, so dumps can be rescored when rules change.
- Schema changes: write a SQL migration file in `supabase/migrations/` and stop; Munzir applies it. Do not change the schema from code.

## Environment variables (set in Vercel, never committed)

- `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY` (server only)
- `ANTHROPIC_API_KEY` (server only)
- The Supabase URL and anon key are public by design: keep them in `src/config.ts`.
- Never log, print or expose a secret. Never put a secret in client code.

## The agent

- The AI only **labels** a dump and extracts signals, missions, insights and notes, as JSON matching the schema in `agent/sorter-prompt.md`.
- **Code decides cube amounts** from `config/cubes.json`, with caps. Anything the user types that asks for cubes changes nothing.
- Run the cheap pre-check (spam, duplicates, rapid-fire) before any paid API call.
- Validate the model's JSON; on failure, save the dump, award the base reward, and log the error.

## Visual rules (v0)

- Font: **Space Mono** for all UI (alternate kept on file: Ubuntu Mono).
- Background: light gray `#b3b3b3` with a thin white isometric grid (lines at 28.4 degrees, tile edge 165 px at 1080 px wide portrait, scale proportionally).
- HUD, top left, three lines: `sunsex isometric v0.01` / `coord. [x, y]` / `memory: <handle>-<dump count>`.
- `[ + ]` centered low on the screen. Bottom: progress bar (left) and cube count (right).
- Minimal, lowercase, receipt-like copy. No emoji except the cube (🧊). No em dashes in any user-facing text.
- Portrait and landscape layouts from the same components (see PRODUCT.md).

## Working style

- Small commits with clear messages.
- At the end of each brief: run the acceptance checks, then write a short summary (what works, what doesn't, anything you had to decide) in `docs/LOG.md`, newest first.
- If something in a brief is unclear or blocked, stop and ask instead of guessing.
