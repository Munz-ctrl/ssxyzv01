# Brief 01c: sign-in code, and rescoring old dumps

Two small fixes. Run after 01b.

## 1. Sign in with a 6-digit code

Magic links are fragile on phones (Gmail opens them in its own browser) and the built-in Supabase email sender hits its rate limit fast.

- Keep "send" on the email screen, but switch to Supabase email OTP: after sending, show a 6-digit code field on the same screen. Verify with `verifyOtp({ email, token, type: 'email' })`.
- Keep the magic link working too, if the email contains both.
- Sessions persist on the device: the player should stay signed in for weeks, not have to sign in again each visit.
- Friendly message when the rate limit hits: `too many emails right now. try again in a bit.`
- Note in your summary that Munzir must add `{{ .Token }}` to the Supabase "Magic Link" email template (Authentication > Emails), and that custom SMTP (for example Resend) is needed before inviting other players.

## 2. Rescore old dumps

Dumps saved while the sorter was failing have `agent_version = 'fallback'`.

- Add a server-only script `scripts/rescore.ts` (run locally with the service role key, never exposed as a public route) that, for one user, re-runs the sorter on every dump whose parts have `agent_version = 'fallback'`.
- Replace those dump parts, create any missions, vault items and wishlist rows, and add `ssx_ledger` rows with reason `rescore` for the difference between the new total and what was already awarded (never negative).
- Rescoring ignores today's daily cap but respects each original day's cap.
- Dry-run flag that prints what would change without writing.

## Acceptance checks

- [ ] Sign in on a phone with the 6-digit code, close the browser, reopen: still signed in.
- [ ] The rate-limit message reads cleanly.
- [ ] Dry-run of the rescore lists Munzir's fallback dumps and the cubes they would earn.
- [ ] A real rescore run fills missions and the vault and adds `rescore` ledger rows.
- [ ] Log results in `docs/LOG.md`.
