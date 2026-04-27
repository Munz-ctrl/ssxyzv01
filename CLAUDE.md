# CLAUDE.md

This file provides guidance to Claude Code when working with this repository.

## Project Overview

**sunsex.xyz** (`ssxyzv01`) — a real-life mirror / social RPG platform. Players have profiles, coordinates on a world map, avatars, and style. The site is a collection of mini-apps sharing a common Supabase backend.

The **SSX player/map system** is the core: a Leaflet world map where authenticated players have persistent profiles stored in Supabase. **DressUp** (`/dressup`) is a revenue/credit experiment layered on top — not the main point.

**MUNZ** is the default public demo player shown to all guests.

## Deployment

- **Platform:** Vercel (static + serverless functions)
- **Config:** `vercel.json` — URL rewrites/redirects; `/` serves `index.html`
- **No build command** — all files served as-is
- **Environment variables (Vercel dashboard):**
  - `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `SUPABASE_ANON_KEY`
  - `REPLICATE_API_TOKEN`
  - `PUBLIC_SITE_ORIGIN` (defaults to `https://sunsex.xyz`)
- Serverless functions in `api/dressup/` — 300s max duration (AI is slow)

## URL Routing

| Route | File | Notes |
|---|---|---|
| `/` | `index.html` | Public homepage |
| `/dashboard` | `apps/dashboard/dashboard.html` | Player hub (guest + auth) |
| `/map` | `apps/map/map.html` | Global Leaflet map |
| `/dressup` | `apps/tools/dressup/dressup.html` | Avatar studio |
| `/ssx-stylist`, `/stylist`, `/mannequin` | same as `/dressup` | Aliases |
| `/nomadsuitcase` | `apps/nomadsuitcase/nomadsuitcase.html` | MUNZ showcase |
| `/edit-profile` | `apps/edit/edit-profile.html` | Profile editor (auth required) |
| `/portfolio` | `apps/portfolio/index.html` | MUNZIR portfolio |
| `/puffcounter` | `apps/puffcounter/index.html` | Standalone tool |

## Architecture

### Supabase

- Project: `https://hoaztxbbeabvwewswmkl.supabase.co`
- Anon key is hardcoded in client files (public key — intentional)
- **There is NO `app_users` table.** Do not reference it.

**Two separate clients — do not merge them:**

| Client | File | Variable | Storage key | Used by |
|---|---|---|---|---|
| Shared | `shared/js/supabase.js` | `window.supabase` | default | map, dashboard, edit-profile |
| DressUp | `apps/tools/dressup/js/sbClient.js` | `window.sb` | `sb-dressup-auth-token` | DressUp only |

`shared/js/supabase.js` skips init on DressUp routes to prevent session key collisions. It exports `{ supabase }` as an ES module named export.

### Key Tables

| Table | Purpose | Key columns |
|---|---|---|
| `players` | Public player profiles on the map | `pid`, `name`, `coords`, `owner_id`, `auth_type`, `avatar`, `spritesheet`, `main`, `mission`, `popupBg`, `is_public`, `xp`, `level`, `demo_player` |
| `dressup_skins` | DressUp saved skins | `id`, `name`, `hero_url`, `owner_id`, `visibility`, `skin_key`, `is_default` |
| `dressup_personal_credits` | Per-user DressUp credits | `user_id`, `credits` |
| `dressup_chest` | Community credit pool (capped at 250) | `id`, `credits` |
| `dressup_credit_ledger` | Credit transaction log | `user_id`, `delta`, `kind` |
| `locations` | Map location data | `id`, `name`, `lat`, `lng` |
| `memories` | Player memories at locations | `player_pid`, `location_id` |

**Player visibility:** `players.is_public = true` means the player appears on the map and in panels. New players default to `false`. All existing curated players are `true`. MUNZ has `demo_player = true`.

**Do not show all players** — always filter map/panel queries with `.eq('is_public', true)`.

### Shared JS

| File | Purpose |
|---|---|
| `shared/js/supabase.js` | Creates and exports the shared Supabase client |
| `shared/js/authContext.js` | `getAuthContext()` — returns `{ supabase, authUser, player }` |
| `shared/js/ssxyz.js` | Core player/map logic: login panel, fly-to, auto-login, popups |
| `shared/js/playerUtils.js` | Marker/popup/button rendering helpers for the map |
| `shared/js/main.js` | Map boot: loads public players + locations, renders markers |

### DressUp (`apps/tools/dressup/`)

Uses Replicate AI (`google/nano-banana-pro`) for image generation.

- `dressup.html` — main UI
- `js/dressup.js` — all client logic (upload, generate, auth, skins)
- `js/dressup-state.js` — localStorage state manager (hero, garment, undo stack)
- `js/sbClient.js` — isolated Supabase client (IIFE, not ES module, uses `window.sb`)
- `css/dressup.css` — styles

**Two generation modes** (POST `/api/dressup/generate`):
- `style` — virtual try-on: person image + garment → AI output
- `avatar` — avatar swap: avatar template + person photos → AI output

**Credit system:** Community credits (shared pool) + personal credits. Each generation costs 50 credits. Spent server-side via Supabase RPC before calling Replicate.

**DressUp is isolated and working. Do not break:**
- credit flow
- generation flow
- saved skins
- auth flow (uses `window.sb`, not `window.supabase`)

### Dashboard (`apps/dashboard/`)

- `dashboard.html` + `dashboard.js` + `dashboard.css`
- Three states:
  - **Guest** — shows MUNZ as demo player, links to map/dressup/nomadsuitcase
  - **Logged in, no player** — shows MUNZ avatar, prompts to explore
  - **Logged in, has player** — shows user's own player card + actions incl. edit-profile

### Edit Profile (`apps/edit/edit-profile.html`)

- Fully standalone — imports only `shared/js/supabase.js`
- Auth-gated: redirects to `/dashboard` if not logged in
- Owner-checked: save is blocked if `player.owner_id !== auth.user.id`
- Navigation goes to `/map` (back) and `/dashboard` (logout)

### API Routes (`api/dressup/`)

All Vercel serverless functions (Node.js ES modules):
- `generate.js` — AI generation (validates, spends credits, calls Replicate, uploads to storage)
- `create-checkout-session.js` — Stripe checkout for buying credits
- `stripe-webhook.js` — Stripe payment events
- `event.js` — event tracking
- `ping.js` — health check

### Other Apps

- `apps/nomadsuitcase/` — MUNZ Nomad Suitcase showcase (MUNZ-only for now)
- `apps/portfolio/` — MUNZIR portfolio, served at `/portfolio`
- `apps/puffcounter/` — standalone counter, not part of SSX ecosystem
- `apps/idrs/` — standalone page, not routed

## Key Patterns

- **No bundler/transpiler** — `type="module"` or plain scripts; CDN for Supabase + Leaflet
- **DressUp uses CDN Supabase namespace** (`window.supabase` from CDN) to create `window.sb` — load order in HTML matters
- **`shared/js/supabase.js` skips init on DressUp routes** — checked by pathname
- **Map globals** — `map` (Leaflet instance), `ssxyz`, `closeAllPopups` are global on the map page; `playerUtils.js` and `main.js` depend on them being present
- **Player visibility** — always query with `.eq('is_public', true)` in map and panel contexts
- **URL params on DressUp:** `?hero=`, `?pname=`, `?pid=`, `?skin=`, `?mode=private`

## What's Next (Phase 1 remaining)

- **Stage 5:** "Set as My Avatar" in DressUp → writes skin URL to `players.avatar` for linked player → dashboard shows it
- **RLS:** Add policy so users cannot self-set `is_public = true` (requires admin approval)
- **Map fix:** Verify login flow end-to-end after supabase.js export fix
