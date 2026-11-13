import { useState, type FormEvent } from 'react';
import { supabase } from '../lib/supabase';

const RATE_LIMIT = 'too many emails right now. try again in a bit.';

function friendly(error: { message: string; status?: number; code?: string }): string {
  if (error.status === 429 || error.code?.includes('rate_limit') || /rate limit/i.test(error.message)) return RATE_LIMIT;
  if (error.code === 'otp_expired' || /expired|invalid/i.test(error.message)) return 'that code did not work. check it or send a new one.';
  return error.message.toLowerCase();
}

export function Auth({ notice }: { notice?: string }) {
  const [email, setEmail] = useState('');
  const [code, setCode] = useState('');
  const [sent, setSent] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  async function send(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError('');
    const { error } = await supabase.auth.signInWithOtp({
      email: email.trim(),
      options: { emailRedirectTo: window.location.origin },
    });
    setBusy(false);
    if (error) return setError(friendly(error));
    setCode('');
    setSent(true);
  }

  // On success the auth listener in App swaps this screen out.
  async function verify(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError('');
    const { error } = await supabase.auth.verifyOtp({ email: email.trim(), token: code, type: 'email' });
    setBusy(false);
    if (error) setError(friendly(error));
  }

  return (
    <main className="auth">
      {notice && <p className="notice">{notice}</p>}
      {sent ? (
        <form onSubmit={verify}>
          <label htmlFor="code">code sent to {email.trim()}. type the 6 digits, or tap the link in the email.</label>
          <input
            id="code"
            className="code"
            inputMode="numeric"
            autoComplete="one-time-code"
            pattern="[0-9]{6}"
            maxLength={6}
            placeholder="000000"
            autoFocus
            value={code}
            onChange={(e) => setCode(e.target.value.replace(/\D/g, ''))}
          />
          <button className="btn" disabled={busy || code.length !== 6}>
            {busy ? '[ ... ]' : '[ sign in ]'}
          </button>
          <button type="button" className="link" disabled={busy} onClick={() => setSent(false)}>
            use a different email or send again
          </button>
          {error && <p className="error">{error}</p>}
        </form>
      ) : (
        <form onSubmit={send}>
          <label htmlFor="email">sign in with your email</label>
          <input
            id="email"
            type="email"
            required
            autoComplete="email"
            placeholder="you@example.com"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
          />
          <button className="btn" disabled={busy}>
            {busy ? '[ ... ]' : '[ send ]'}
          </button>
          {error && <p className="error">{error}</p>}
        </form>
      )}
    </main>
  );
}
