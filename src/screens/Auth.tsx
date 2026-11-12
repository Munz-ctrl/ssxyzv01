import { useState, type FormEvent } from 'react';
import { supabase } from '../lib/supabase';

export function Auth() {
  const [email, setEmail] = useState('');
  const [state, setState] = useState<'idle' | 'sending' | 'sent'>('idle');
  const [error, setError] = useState('');

  async function submit(e: FormEvent) {
    e.preventDefault();
    setState('sending');
    setError('');
    const { error } = await supabase.auth.signInWithOtp({
      email: email.trim(),
      options: { emailRedirectTo: window.location.origin },
    });
    if (error) {
      setError(error.message.toLowerCase());
      setState('idle');
    } else {
      setState('sent');
    }
  }

  return (
    <main className="auth">
      {state === 'sent' ? (
        <p>link sent to {email.trim()}. open it on this device.</p>
      ) : (
        <form onSubmit={submit}>
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
          <button className="btn" disabled={state === 'sending'}>
            {state === 'sending' ? '[ ... ]' : '[ send link ]'}
          </button>
          {error && <p className="error">{error}</p>}
        </form>
      )}
    </main>
  );
}
