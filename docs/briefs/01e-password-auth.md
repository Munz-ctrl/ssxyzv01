# Brief 01e: email + password sign in

Run after 01d. If 01d has not been run yet, do 01d first, then this.

## Why

Sign in is always required in the app. The email code (01c) sends an email every time someone logs in, and that keeps hitting the email limit. New rule: **one email per account, to confirm sign up. After that, the player logs in with their password, with no emails.**

Google and Apple sign in come later (native app, Chapter 3). Do not add them now. No guest mode in the app.

## What to build

### 1. Auth screen (`src/screens/Auth.tsx`), two tabs: `sign in` / `sign up`

**Sign up**
- Fields: email, password, confirm password. Password minimum 8 characters.
- Call `supabase.auth.signUp({ email, password, options: { emailRedirectTo: window.location.origin } })`.
- Then show a "check your email" screen with:
  - a 6 digit code field. Confirm with `supabase.auth.verifyOtp({ email, token, type: 'signup' })`. On success the player is signed in right there, in the same app. This matters on iPhone: the home screen app does not share sessions with Safari.
  - a note that tapping the link in the email also works.
  - a `resend` button: `supabase.auth.resend({ type: 'signup', email })`, disabled for 60 s after each send.

**Sign in**
- Fields: email, password. Call `supabase.auth.signInWithPassword({ email, password })`.
- Error `Email not confirmed`: show the code field and `resend` from above, with no dead end.
- Error invalid credentials: "wrong email or password". Do not reveal which one.
- Link: `forgot password`.

### 2. Forgot password
- `supabase.auth.resetPasswordForEmail(email, { redirectTo: origin + '/reset' })`.
- `/reset` route: when the session arrives from the link (`PASSWORD_RECOVERY` event), show a new password field and call `supabase.auth.updateUser({ password })`, then go home.
- This is the only other email the app ever sends. It also lets the old email-only accounts (from 01c) set a password.

### 3. Remove the login code flow
- Remove `signInWithOtp` login from the UI. Keep `verifyOtp` only for the sign up confirmation above.

### 4. Sessions
- Keep `storageKey: 'ssx-v0-auth'`, `persistSession: true`, `autoRefreshToken: true` (the defaults, but set them explicitly).
- Once signed in, the player stays signed in until they tap `out` (01d moved it into the vault, with a confirm).

## Copy (Space Mono, lowercase, no em dashes)
- tabs: `sign in` / `sign up`
- after sign up: `check your email. enter the code or tap the link.`
- resend: `send again`
- forgot: `forgot password`

## Done when
- A new email signs up, gets ONE email, enters the code, and lands home.
- Logging out and back in with the password sends zero emails.
- Closing and reopening the home screen app keeps the player signed in.
- `npm run build` passes. Log what you did in `docs/LOG.md`.

## Munzir does in the Supabase dashboard (not code)
1. Authentication > Sign In / Providers > Email: Email provider ON, **Confirm email ON**, minimum password length 8.
2. Authentication > Emails > Templates > **Confirm signup**: add the code, `{{ .Token }}`, above the link.
3. Custom SMTP (Resend) is still needed: Supabase's built-in sender only delivers to team addresses, so real users would never get the confirmation email.
