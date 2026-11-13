# Brief 01d: stop surprise sign-outs

Found in the Supabase auth logs on Nov 12: a sign-out request fired from the phone 11 seconds after a dump, and the desktop session then failed with `refresh_token_not_found`.

## Changes

1. **Sign out only this device.** Call `supabase.auth.signOut({ scope: 'local' })`. The default (`global`) ends every session on every device, which is why signing out on the phone logged the desktop out too.
2. **Move `out` away from the tabs.** It sits next to `home / vault / history` and is easy to hit by accident. Put it at the bottom of the vault screen, and ask `sign out on this device?` with `[ yes ]` / `[ no ]` before doing it.
3. **Handle an expired session quietly.** If a refresh fails, show the sign-in screen with `signed out. sign in again to keep going.` instead of a blank or broken state. Any dump typed but not sent stays in the input.

## Acceptance checks

- [ ] Signing out on one device leaves the other device signed in.
- [ ] `out` needs a confirm and is not next to the tabs.
- [ ] Log results in `docs/LOG.md`.
