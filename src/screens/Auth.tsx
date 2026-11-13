import { useEffect, useState, type FormEvent } from 'react';
import { authMessage, MIN_PASSWORD, supabase } from '../lib/supabase';

type Mode = 'in' | 'up' | 'code' | 'forgot' | 'forgot-sent';

const RESEND_WAIT = 60;

export function Auth({ notice }: { notice?: string }) {
  const [mode, setMode] = useState<Mode>('in');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [wait, setWait] = useState(0);

  useEffect(() => {
    if (wait <= 0) return;
    const timer = setTimeout(() => setWait(wait - 1), 1000);
    return () => clearTimeout(timer);
  }, [wait]);

  const address = email.trim();

  function go(next: Mode) {
    setMode(next);
    setError('');
    setCode('');
  }

  // Wraps a submit: on success the auth listener in App swaps this screen out, or `then` moves on.
  async function run(e: FormEvent, call: () => Promise<string | void>) {
    e.preventDefault();
    setBusy(true);
    setError('');
    const problem = await call();
    setBusy(false);
    if (problem) setError(problem);
  }

  const signIn = (e: FormEvent) =>
    run(e, async () => {
      const { error } = await supabase.auth.signInWithPassword({ email: address, password });
      if (!error) return;
      if (error.code === 'email_not_confirmed' || /email not confirmed/i.test(error.message)) return go('code');
      return authMessage(error);
    });

  const signUp = (e: FormEvent) =>
    run(e, async () => {
      if (password.length < MIN_PASSWORD) return `password needs at least ${MIN_PASSWORD} characters`;
      if (password !== confirm) return 'passwords do not match';
      const { data, error } = await supabase.auth.signUp({
        email: address,
        password,
        options: { emailRedirectTo: window.location.origin },
      });
      if (error) return authMessage(error);
      // supabase answers like this for an address that already has an account, and sends no email
      if (data.user && data.user.identities?.length === 0) {
        return 'that email already has an account. sign in, or use forgot password to set one.';
      }
      if (data.session) return;
      setWait(RESEND_WAIT);
      go('code');
    });

  const verify = (e: FormEvent) =>
    run(e, async () => {
      const { error } = await supabase.auth.verifyOtp({ email: address, token: code, type: 'signup' });
      if (error) return authMessage(error);
    });

  const forgot = (e: FormEvent) =>
    run(e, async () => {
      const { error } = await supabase.auth.resetPasswordForEmail(address, {
        redirectTo: `${window.location.origin}/reset`,
      });
      if (error) return authMessage(error);
      go('forgot-sent');
    });

  async function resend() {
    setBusy(true);
    setError('');
    const { error } = await supabase.auth.resend({
      type: 'signup',
      email: address,
      options: { emailRedirectTo: window.location.origin },
    });
    setBusy(false);
    if (error) return setError(authMessage(error));
    setWait(RESEND_WAIT);
  }

  const emailField = (
    <input
      type="email"
      required
      autoComplete="email"
      placeholder="email"
      aria-label="email"
      value={email}
      onChange={(e) => setEmail(e.target.value)}
    />
  );
  const submit = (label: string, off = false) => (
    <button className="btn" disabled={busy || off}>
      {busy ? '[ ... ]' : `[ ${label} ]`}
    </button>
  );

  return (
    <main className="auth">
      {notice && <p className="notice">{notice}</p>}

      {(mode === 'in' || mode === 'up') && (
        <div className="auth-tabs">
          <button className={`link ${mode === 'in' ? 'on' : ''}`} onClick={() => go('in')}>
            sign in
          </button>
          <button className={`link ${mode === 'up' ? 'on' : ''}`} onClick={() => go('up')}>
            sign up
          </button>
        </div>
      )}

      {mode === 'in' && (
        <form onSubmit={signIn}>
          {emailField}
          <input
            type="password"
            required
            autoComplete="current-password"
            placeholder="password"
            aria-label="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
          />
          {submit('sign in')}
          <button type="button" className="link" onClick={() => go('forgot')}>
            forgot password
          </button>
        </form>
      )}

      {mode === 'up' && (
        <form onSubmit={signUp}>
          {emailField}
          <input
            type="password"
            required
            minLength={MIN_PASSWORD}
            autoComplete="new-password"
            placeholder={`password (${MIN_PASSWORD}+ characters)`}
            aria-label="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
          />
          <input
            type="password"
            required
            autoComplete="new-password"
            placeholder="confirm password"
            aria-label="confirm password"
            value={confirm}
            onChange={(e) => setConfirm(e.target.value)}
          />
          {submit('sign up')}
        </form>
      )}

      {mode === 'code' && (
        <form onSubmit={verify}>
          <label htmlFor="code">check your email. enter the code or tap the link.</label>
          <input
            id="code"
            className="code"
            inputMode="numeric"
            autoComplete="one-time-code"
            pattern="[0-9]{6}"
            maxLength={6}
            placeholder="000000"
            value={code}
            onChange={(e) => setCode(e.target.value.replace(/\D/g, ''))}
          />
          {submit('confirm', code.length !== 6)}
          <button type="button" className="link" disabled={busy || wait > 0} onClick={() => void resend()}>
            {wait > 0 ? `send again in ${wait}s` : 'send again'}
          </button>
          <button type="button" className="link" onClick={() => go('in')}>
            back to sign in
          </button>
        </form>
      )}

      {mode === 'forgot' && (
        <form onSubmit={forgot}>
          <label>forgot password. we will email you a link to set a new one.</label>
          {emailField}
          {submit('send link')}
          <button type="button" className="link" onClick={() => go('in')}>
            back to sign in
          </button>
        </form>
      )}

      {mode === 'forgot-sent' && (
        <div className="auth-note">
          <p>check your email. tap the link to set a new password.</p>
          <button className="link" onClick={() => go('in')}>
            back to sign in
          </button>
        </div>
      )}

      {error && <p className="error">{error}</p>}
    </main>
  );
}
