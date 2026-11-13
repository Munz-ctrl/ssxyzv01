# Log

Newest first.

## 2026-11-12: brief 02a, sounds, vault cleanup, prompt box nudges

Read `docs/AGENT.md` first. It is a principles document with nothing to run; the vault and history changes follow its response table (insight under the dump in history, pattern hidden until it can be said with value).

All checks ran in a local browser against **mocked** Supabase and `/api` responses, with the audio context instrumented to count what played. I cannot hear the sounds, so how they feel is untested.

| Done when | Result |
| --- | --- |
| Every button ticks | **Pass locally:** one listener on `document` ticks any enabled button on click, including sign in and vault buttons. The context is created on the first click. |
| Receipts chime upward per cube | **Pass locally:** a receipt with two cube lines and a level up played two chimes (2 oscillators each) and the three note sting. Not listened to. |
| Bar fill and level up have sounds | **Pass locally:** the whoosh fired once when lifetime cubes went up after a dump; the sting fired on the `level up` line. |
| Mute works and persists | **Pass locally:** `sound: on` / `sound: off` at the bottom of the vault, stored under `ssx-v0-sound` in localStorage (try/catch). Turning it off made no tick, turning it on ticked. Not checked across a real reload. |
| Vault has no insights or patterns | **Pass locally:** sections are missions, notes, wishlist. |
| History shows insights under their dumps | **Pass locally:** gray 13 px line under the receipt, matched on `source_dump_ids`. |
| Prompt box cycles nudges, stops when typing | **Pass locally:** 4 s per nudge with a 400 ms fade, shuffled on load. Rotation freezes while the box is focused, hides once there is text, and resumes after blur. |
| `npm run build` passes | **Pass.** Typecheck and 20 tests also pass. |

### What was built

- `src/lib/sfx.ts` replaces `sound.ts`: `tap()`, `cube(i)`, `fill()`, `levelUp()`, plus `thud()` (kept for dumps that earn nothing), `soundOn` / `setSoundOn` and `installTapSound()`. All synthesized, no files.
- `config/nudges.json` holds the eight starting nudges.
- Patterns are still written to `ssx_vault_items`; they are just no longer shown or counted on the receipt.

### Things I had to decide

- **Receipt chimes now play on cube lines only**, as the brief says, so the pitch climbs once per cube line. Head, mission and note lines are silent. Before this every line chimed.
- **The receipt line `+1 insight added to vault` now reads `+1 insight added to history`**, because insights no longer live in the vault. The brief did not mention it.
- **The nudge is an overlay on the empty textarea**, not the native placeholder, because a placeholder cannot fade reliably across browsers. The textarea has an `aria-label` instead.
- **Rotation also pauses while the panel is closed.**
- **The whoosh plays whenever lifetime cubes go up**, not on every refresh, so it does not fire on sign in.
- **The `rescore` dry run no longer prints a pattern count.**

## 2026-11-12: brief 01e, email + password sign in

All checks below ran in a local browser against a **mocked** Supabase auth API. Nothing was run against the real project: that needs the dashboard steps at the end, and a real inbox.

| Done when | Result |
| --- | --- |
| New email signs up, gets one email, enters the code, lands home | **Pass locally (mocked):** sign up, code screen, wrong code message, right code lands home. One `signUp` call, no other email calls. Not run live. |
| Log out and back in with the password sends zero emails | **Pass locally (mocked):** sign in made only a password call. Not run live. |
| Closing and reopening keeps the player signed in | **Pass locally:** the session is stored on the device and survived a reload. Not checked as an iPhone home screen app. |
| `npm run build` passes | **Pass.** Typecheck and 20 tests also pass. |

Also checked locally: wrong password shows `wrong email or password`; an unconfirmed account goes to the code screen with `send again`; `send again` locks for 60 s; forgot password sends and shows a check-your-email note; `/reset` with a session sets a new password and goes home; `/reset` without one says the link expired.

### Sorter status (still failing, new reason)

The dump at 23:33 UTC failed with `401 authentication_error: Invalid bearer token` from Anthropic. So a credential now reaches the function, but Anthropic rejects it, and it was sent as a bearer token rather than as an API key. Most likely the value in Vercel is not a Console API key (those start with `sk-ant-api`), or a variable named `ANTHROPIC_AUTH_TOKEN` is set. 8 dumps are now marked `fallback`.

### What was built

- `Auth.tsx`: `sign in` / `sign up` tabs, the confirm-code step (`verifyOtp` type `signup`), `send again`, `forgot password`.
- `Reset.tsx` at `/reset`, shown on the `PASSWORD_RECOVERY` event or when the page is opened at that path.
- `signInWithOtp` is gone from the app.
- Session options are now explicit in `src/lib/supabase.ts`.

### Things I had to decide

- **Signing up with an email that already has an account** shows `that email already has an account. sign in, or use forgot password to set one.` Supabase sends no email in that case, so without this the player would wait for a code that never comes. This is how the old email-only accounts from 01c (Munzir's included) find their way to forgot password. It does reveal that the address is registered.
- **An unconfirmed sign in does not send a code by itself.** The player taps `send again`, so a mistyped attempt never costs an email.
- **Reset asks for the new password twice.**
- **Short messages for rate limit, weak password and reused password**; anything else shows Supabase's own message in lowercase.

### Munzir has to do (Supabase dashboard)

1. Authentication > Sign In / Providers > Email: provider ON, **Confirm email ON**, minimum password length 8.
2. Authentication > Emails > Templates > **Confirm signup**: add `{{ .Token }}` above the link.
3. Authentication > URL Configuration: the `/reset` page is covered by the existing `/**` redirect entries; nothing new to add if those are in.
4. Custom SMTP (Resend) before anyone else signs up.
5. Your own account has no password yet: use `forgot password` once to set one.

## 2026-11-12: brief 01d, stop surprise sign-outs

| Check | Result |
| --- | --- |
| Signing out on one device leaves the other signed in | **Pass locally (mocked):** the sign-out request goes out with `scope=local`. Not run on two real devices. |
| `out` needs a confirm and is not next to the tabs | **Pass locally:** it is at the bottom of the vault and asks `sign out on this device?` with `[ yes ]` / `[ no ]`. |
| Expired session is handled quietly | **Pass locally (mocked):** a 401 from `/api/dump` with a failed refresh showed the sign-in screen with `signed out. sign in again to keep going.`, and the typed dump was back in the input after signing in. |

Decisions:

- **The unsent dump is kept in the device's local storage** until it is sent, so it also survives a reload or closing the app.
- **A 401 from the API triggers one refresh and one retry** before the player is treated as signed out.
- **Choosing `[ yes ]` shows no "signed out" notice**; the notice is only for sign-outs the player did not ask for.

## 2026-11-12: brief 01c, sign-in code and rescore

### Why the sorter was failing

`ANTHROPIC_API_KEY` is not set for the Vercel **Preview** environment. Every `/api/dump` call logged `Could not resolve authentication method`, so all 7 dumps so far were saved as `fallback` with 1 cube each (no missions, no vault items). This is a settings fix, not a code fix: add the key for Preview and redeploy. Until then every new dump is another fallback.

Live state seen in the database: 1 profile, 7 dumps, 7 `base` ledger rows, 0 missions, 0 vault items. So magic link sign-in, the profile row and saving dumps all work on the preview.

### Acceptance checks

| Check | Result |
| --- | --- |
| Sign in with the 6-digit code, reopen, still signed in | **Pass locally** against a mocked auth API: send, type code, signed in, reload keeps the session. Not run on a phone: needs the email template change below. |
| Rate-limit message reads cleanly | **Pass locally:** a mocked 429 shows `too many emails right now. try again in a bit.` |
| Dry run lists fallback dumps and their cubes | **Tested against a fake database** (writes nothing, prints each dump and `rescore +N`). Not run on real data: I have no service role key or Anthropic key locally. |
| Real run fills missions and the vault, adds `rescore` rows | **Tested against a fake database.** Not run on real data, same reason. |

`npm test` (20 tests), typecheck and build pass.

### Munzir has to do

1. **Vercel:** set `ANTHROPIC_API_KEY` for Preview, then redeploy the branch.
2. **Supabase > Authentication > Emails > Magic Link template:** add `{{ .Token }}` so the email shows the 6-digit code. Keep `{{ .ConfirmationURL }}` so the link still works.
3. **Custom SMTP** (for example Resend) before inviting other players: the built-in sender allows only a few emails per hour.
4. **Rescore**, after step 1, from the repo with a `.env.local` (ignored by git) holding `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `ANTHROPIC_API_KEY`:
   - `npx tsx --env-file=.env.local scripts/rescore.ts --user <email> --dry-run`
   - then the same without `--dry-run`.

### What was built

- Sign-in: after send, the same screen shows a 6-digit code field (`verifyOtp`, type `email`). The magic link still works. Wrong or expired codes get a plain message.
- `scripts/rescore.ts`, with the mission, vault and wishlist writes moved out of `/api/dump` into `api/_lib/apply.ts` so both use the same code.

### Things I had to decide

- **Sessions:** the client already stores the session on the device and refreshes it. How long it lasts is a Supabase setting (Authentication > Sessions): leave time-box and inactivity timeout off for it to last weeks.
- **Code length is fixed at 6.** If the Supabase OTP length setting is changed, the field has to change too.
- **Rescore rows belong to the dump's day.** They count toward that day's cap and are ignored by today's cap, so a rescore never eats into today.
- **One `rescore` row per dump** holds the whole difference, including any mission reward the new sorting triggers.
- **Rare drop is deterministic in a rescore** (derived from the dump id), so the dry run and the real run agree.
- **Context for a rescored dump** is the 20 dumps before it, plus missions open at the time of the run (including ones created by earlier dumps in the same run).
- **A dump the sorter fails on again is left untouched** and can be retried; a second run only touches dumps still marked `fallback`.
- **Risk dumps** get their parts replaced and no rewards, same as live.

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
