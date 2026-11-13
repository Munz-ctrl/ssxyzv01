import { createClient } from '@supabase/supabase-js';
import { SUPABASE_ANON_KEY, SUPABASE_URL } from '../config';

export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
  auth: { storageKey: 'ssx-v0-auth', persistSession: true, autoRefreshToken: true },
});

export const MIN_PASSWORD = 8;

export function authMessage(error: { message: string; status?: number; code?: string }): string {
  const code = error.code ?? '';
  if (error.status === 429 || code.includes('rate_limit') || /rate limit/i.test(error.message)) {
    return 'too many emails right now. try again in a bit.';
  }
  if (code === 'invalid_credentials' || /invalid login credentials/i.test(error.message)) return 'wrong email or password';
  if (code === 'otp_expired' || /token has expired|invalid/i.test(error.message)) {
    return 'that code did not work. check it or send a new one.';
  }
  if (code === 'weak_password') return `password needs at least ${MIN_PASSWORD} characters`;
  if (code === 'same_password') return 'that is your current password. pick a new one.';
  return error.message.toLowerCase();
}
