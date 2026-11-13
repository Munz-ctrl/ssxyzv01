import { useState, type FormEvent } from 'react';
import { authMessage, MIN_PASSWORD, supabase } from '../lib/supabase';

// Shown at /reset once the emailed link has signed the player in.
export function Reset({ signedIn, onDone }: { signedIn: boolean; onDone: () => void }) {
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  async function save(e: FormEvent) {
    e.preventDefault();
    if (password.length < MIN_PASSWORD) return setError(`password needs at least ${MIN_PASSWORD} characters`);
    if (password !== confirm) return setError('passwords do not match');
    setBusy(true);
    setError('');
    const { error } = await supabase.auth.updateUser({ password });
    setBusy(false);
    if (error) return setError(authMessage(error));
    onDone();
  }

  if (!signedIn) {
    return (
      <main className="auth">
        <div className="auth-note">
          <p>that link did not work or has expired. ask for a new one from forgot password.</p>
          <button className="link" onClick={onDone}>
            back to sign in
          </button>
        </div>
      </main>
    );
  }

  return (
    <main className="auth">
      <form onSubmit={save}>
        <label>set a new password</label>
        <input
          type="password"
          required
          minLength={MIN_PASSWORD}
          autoComplete="new-password"
          placeholder={`new password (${MIN_PASSWORD}+ characters)`}
          aria-label="new password"
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
        <button className="btn" disabled={busy}>
          {busy ? '[ ... ]' : '[ save ]'}
        </button>
        {error && <p className="error">{error}</p>}
      </form>
    </main>
  );
}
