# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

**sunsex.xyz** (`ssxyzv01`) — a digital hub for a videogame-atmosphere project called **Sunsex**. Think of it as a real-life mirror / social RPG: players have profiles, locations on a world map, avatars, and style. The site is built as a collection of independently developed mini-apps (the "messy pieces" are intentional MVP experimentation, not a finished product).

**DressUp** (`/dressup`) is currently the only public-facing tool, but it is not the main point — it's a revenue/credit experiment layered on top. The core of the site is the **SSX player/map system**: a Leaflet world map where authenticated players have persistent profiles, coordinates, and avatars stored in Supabase.

## Deployment

- **Platform:** Vercel (static + serverless functions)
- **Config:** `vercel.json` — defines URL rewrites and redirects; `/` redirects to `/dressup`
- **No build command** — all files served as-is
- **Environment variables required (Vercel dashboard):**
  - `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `SUPABASE_ANON_KEY`
  - `REPLICATE_API_TOKEN`
  - `PUBLIC_SITE_ORIGIN` (defaults to `https://sunsex.xyz`)
- Serverless functions live in `api/dressup/` with a 300-second max duration (AI generation can be slow)

## Architecture

### URL Routing (vercel.json)
| Route | File |
|---|---|
| `/dressup`, `/stylist`, `/mannequin`, `/ssx-stylist` | `apps/tools/dressup/dressup.html` |
| `/map` | `apps/map/map.html` |
| `/tana` | `apps/tanapixelgame/portfolio-game-v2.html` |
| `/nomadsuitcase` | `apps/nomadsuitcase/nomadsuitcase.html` |
| `/edit-profile` | `apps/edit/edit-profile.html` |
| `/puffcounter` | `apps/puffcounter/index.html` |

### Supabase (Backend)
- Project URL: `https://hoaztxbbeabvwewswmkl.supabase.co`
- The anon key is hardcoded in client files (it is a public key, this is intentional)
- **Two separate Supabase clients exist:**
  - `shared/js/supabase.js` — used by map/player apps, sets `window.supabase`
  - `apps/tools/dressup/js/sbClient.js` — isolated DressUp client, sets `window.sb` with a separate `storageKey` (`sb-dressup-auth-token`) to avoid session conflicts with other apps
- Key tables: `players`, `app_users`, `dressup_personal_credits`
- Key RPC functions: `dressup_consume_credits`, `dressup_get_chest`
- Storage buckets: `avatars`, `userassets`

### DressUp App (`/apps/tools/dressup/`)
The main product. Uses Replicate AI (`google/nano-banana-pro`) for image generation.
- `dressup.html` — main UI
- `js/dressup.js` — all client-side logic (upload, generate, auth UI)
- `js/dressup-state.js` — state management
- `js/sbClient.js` — isolated Supabase client (IIFE, not ES module)
- `css/dressup.css` — styles

**Two generation modes** (sent to `POST /api/dressup/generate`):
- `style` — virtual try-on: person image + garment image → AI output
- `avatar` — avatar swap: avatar template + person photos → AI output

**Credit system:** Community credits (shared pool, capped at 250) + personal credits (per user). Each generation costs 50 credits. Credits are spent server-side via Supabase RPC before calling Replicate.

### Map / Player App (`/apps/map/`, `/apps/ssx-demo/`)
Leaflet.js-based world map showing player locations. Players are stored in Supabase `players` table with `pid`, `name`, `coords`, `owner_id`, `auth_type`, `email` fields.
- `shared/js/ssxyz.js` — core player logic (create, login, fly-to, popups)
- `shared/js/playerUtils.js` — marker/popup/button helpers
- `shared/js/authContext.js` — auth context helper (session + app_users + player lookup)

### Shared Assets
- `shared/css/styles.css` — global base styles
- `shared/data/locations.json` — location data for map
- `shared/data/suitcaseItems.json` — items for nomadsuitcase app

### Other Apps
- `apps/portfolio/` — portfolio page with `projects.json` data
- `apps/tanapixelgame/portfolio-game-v2.html` — pixel art portfolio game (self-contained)
- `apps/puffcounter/` — standalone counter tool
- `apps/idrs/` — standalone page
- `apps/nomadsuitcase/` — nomad suitcase showcase

### API Routes (`/api/dressup/`)
All are Vercel serverless functions (Node.js ES modules):
- `generate.js` — main AI generation endpoint (validates images, spends credits, calls Replicate, uploads result to Supabase storage)
- `create-checkout-session.js` — Stripe checkout for buying credits
- `stripe-webhook.js` — handles Stripe payment events
- `event.js` — event tracking
- `ping.js` — health check

## Key Patterns

- **No bundler/transpiler** — JS files use `type="module"` or plain scripts; Supabase and Leaflet are loaded from CDN
- **DressUp uses the global `supabase` CDN namespace** (`window.supabase`) to create `window.sb`, not the npm package — load order in HTML matters
- **`shared/js/supabase.js` skips initialization on DressUp routes** to avoid session key conflicts
- URL params on DressUp: `?hero=`, `?pname=`, `?pid=`, `?skin=`, `?mode=private` for customization
