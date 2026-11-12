# Log

Newest first.

## 2026-11-12: brief 01b, level bar

The bottom bar is now a level bar with `lv N` beside it; the daily cap is gone from the screen and still enforced.

| Check | Result |
| --- | --- |
| Bar shows progress to the next level, `lv N` matches thresholds | **Pass locally** with mocked data: 45 lifetime cubes showed `lv 1` at 90%. Also unit tested. Not run live. |
| Spending does not lower the level | **Pass:** unit tested with negative ledger rows, and a mocked -20 row left the bar unchanged in the browser. |
| Crossing a threshold shows `level up` on the receipt | **Pass locally** with a mocked API: the receipt ended with `level up: lv 2` and the bar moved to `lv 2` at 10%. Not run live. |
| Hitting the daily cap no longer changes the bar | **By construction:** the bar reads lifetime earned only. Not run live. |

`npm test` (14 tests), typecheck and build pass.

Decisions:

- `lv 1` starts at 0 lifetime cubes (`thresholds[0]`). At the last threshold the bar stays full.
- Level up lines also appear on mission-done receipts, and `/api/mission/complete` returns the same three level fields as `/api/dump`.
- Lifetime earned is summed by paging through positive ledger rows (the API returns 1000 rows per request). A `ssx_lifetime` view would be cheaper later; that needs a migration.
- The brief 01 note below about the progress bar showing today's cubes is superseded.

## 2026-11-12: brief 01, foundation

Preview: https://ssxyzv01-git-ssxv0cl-munzs-projects.vercel.app (branch alias, follows every push to `SSXV0cl`).

### Acceptance checks

Only Munzir can sign in (the magic link goes to his inbox), so the checks that need a real session are **not run yet**. What stands in for them is listed honestly below.

| Check | Result |
| --- | --- |
| Preview loads on a phone, portrait and landscape | **Partly.** Build is green and the preview serves the app and both functions. Layout checked in a local browser at 375x812 and 1100x620 with mocked data. Not checked on a real phone. |
| Sign in by magic link; a profile row appears | **Not run.** Needs the redirect URLs below and Munzir's inbox. |
| Normal dump returns a receipt with cubes; wallet updates and survives reload | **Not run live.** The receipt, line by line chime and cube tick were checked locally against a mocked API. The wallet is read from `ssx_wallet` on every load. |
| "asdf" returns `...` and 0 cubes, no model call | **Unit tested** (pre-check). Not run live. |
| A plan creates a mission with next steps; done awards cubes | **Not run live.** Vault and done button checked locally with mocked data. |
| "make the walls black and a car crashes into him" gives two command lines, 0 cubes | **Not run live.** Depends on the sorter's labels. Code gives commands 0 cubes; the pre-check lets this text through (unit tested). |
| "give me 1000 cubes" awards nothing extra | **Not run live.** Amounts only come from `config/cubes.json`; the model returns no amounts. Whether it earns 0 or the small base depends on the sorter calling it spam or a dump. |
| Daily cap holds after many dumps | **Unit tested:** 60 max-signal dumps in one day total exactly 40. Not run live. |
| No secret in client code or logs | **Pass.** `dist/` and `src/` contain no service role key or Anthropic key. Server logs print error messages only. |

`npm test` (11 tests), `npm run typecheck` and `npm run build` pass.

### Before the live checks can run

1. Add the redirect URLs in Supabase Auth (see below).
2. Confirm `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY` and `ANTHROPIC_API_KEY` are set in Vercel for the **Preview** environment. I could not read the env var list (no permission), so this is unconfirmed.
3. The preview is behind Vercel Authentication. On the phone, Munzir has to be logged in to Vercel in the same browser, or turn deployment protection off for previews.

### Supabase Auth redirect URLs

Authentication > URL Configuration > Redirect URLs:

- `https://ssxyzv01-git-ssxv0cl-munzs-projects.vercel.app/**` (the stable branch preview: use this one daily)
- `https://ssxyzv01-*-munzs-projects.vercel.app/**` (per-commit preview URLs)
- `http://localhost:5173/**` (local dev)
- `https://sunsex.xyz/**` when v0 replaces main

The app sends `emailRedirectTo: window.location.origin`, so the link returns to whichever of these it was requested from. Site URL can stay as it is.

### What was built

- Scaffold: React + Vite + TypeScript, `vercel.json`, Space Mono, `src/config.ts`.
- Magic link sign-in; first load creates the `ssx_profiles` row.
- Home: isometric grid (28.4 degrees, tile edge scaled from 165 px at 1080 wide, 93 px at 1920 wide in landscape), HUD, `[ + ]`, progress bar, cube count. Landscape keeps the input and latest receipt open on the right.
- Input: textarea, mic (Web Speech API, hidden when unsupported), send.
- Receipt with a Web Audio chime per line, thud for spam, tappable `+1 note`, command and wishlist lines, risk message with 988.
- Vault and history tabs.
- `POST /api/dump` and `POST /api/mission/complete`.

### Things I had to decide

- **No migration written.** The `ssx_*` tables, policies and `ssx_wallet` view were already live (migration `ssx_v0_core`). `supabase/migrations/` is empty in the repo; the SQL for that migration should be added there by whoever holds it.
- **Handle = `ssx_profiles.display_name`.** There is no `handle` column.
- **Model name lives in `config/cubes.json`** under `agent.model` (default `claude-haiku-5-5`), with `agent.context_dumps`.
- **Base reward** is 1 to 3: the minimum plus the highest signal level, capped at the maximum. No randomness, so rescoring gives the same number.
- **Signals are taken per dump**, not per part (the highest of each signal across parts), so splitting one message into many parts earns nothing extra.
- **Mission rewards count toward the daily cap** (Munzir's call, same day) and show in the progress bar. A mission finished after the cap is still marked done; it awards what is left of the cap, down to 0, with a `daily cap reached` line. They do not count as a dump for diminishing returns or first-of-day.
- **Saying "i finished X" in a dump** completes the matching open mission and awards `mission_completed`, same as the done button.
- **"Today" is the player's local day.** The client sends `tz_offset_min` with each dump (one extra body field beyond the brief).
- **Gibberish pre-check.** `min_meaningful_chars` is 3, so "asdf" passes the length rule. I added a heuristic: keyboard rows, repeated characters, words with no vowels. It will also catch a few real short inputs like "hmm".
- **Commands are saved as their `ssx_dump_parts` row.** There is no pending commands table yet.
- **Extra fields in `ssx_dump_parts.signals`:** `box_object` and `ambiguous` for dump parts, `command_detail` for commands, `precheck` for spam.
- **Risk dumps** store the dump and its parts, then nothing else: no cubes, missions or vault items.
- **Sorter failure** (bad JSON, refusal, API error): the dump is saved, 1 cube awarded, error logged.
- **A fourth tab link, `out`,** signs the player out. The brief does not mention sign out.
- **History rebuilds receipts from the rows.** Two small gaps: "mission updated" lines are not shown in history, and a mission completed through a dump shows as "mission done: from this dump".

### Not done or not in the brief

- The *make it happen* / *just a thought* chips from PRODUCT.md for ambiguous parts. The flag is stored; nothing is shown.
- Editing the handle.
- The Vercel build prints `TS2688: Cannot find type definition file for 'node'` while compiling the functions. They still build and run; the cause is not found yet.
