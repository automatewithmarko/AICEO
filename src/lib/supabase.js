import { createClient } from '@supabase/supabase-js';

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

// Pinned to the supabase-js defaults but written out so the behaviour
// is obvious to anyone reading this file. Deliberately NOT setting
// flowType or storageKey — changing either of those mid-flight would
// log out every existing session (storageKey) or break currently-
// configured OAuth redirect URIs (flowType: 'pkce' vs 'implicit').
// - persistSession: store the session in localStorage so a reload
//   doesn't drop the user.
// - autoRefreshToken: Supabase issues 1h access tokens; supabase-js
//   refreshes them ~60s before expiry on a background timer. The
//   AuthContext listener now ignores TOKEN_REFRESHED events so a
//   silent rotation no longer triggers a full re-fetch.
// - detectSessionInUrl: needed for OAuth redirect flows (callback
//   page would otherwise lose the session fragment).
export const supabase = createClient(supabaseUrl, supabaseAnonKey, {
  auth: {
    persistSession: true,
    autoRefreshToken: true,
    detectSessionInUrl: true,
  },
});

// Classify a thrown auth error into a short, user-facing message.
// Supabase-js + the browser fetch layer surface several distinct
// failure modes that all look like "TypeError: Failed to fetch" to
// the user; this maps them to something actionable.
export function describeAuthError(err) {
  if (!err) return 'Something went wrong. Please try again.';
  const msg = (err.message || '').toLowerCase();
  // Network-level: Supabase project paused, Cloudflare 522, DNS,
  // offline, blocked by extension. None of these include the word
  // "Invalid" — Supabase always echoes that for credential errors.
  if (msg.includes('failed to fetch')
    || msg.includes('networkerror')
    || msg.includes('load failed')
    || msg.includes('err_network')) {
    return 'Authentication service is unreachable. Our database may be paused or recovering — please try again in a minute or two.';
  }
  if (err.status === 522 || msg.includes('522')) {
    return 'Authentication service timed out. Our database is recovering — please try again shortly.';
  }
  if (err.status === 429 || msg.includes('rate limit')) {
    return 'Too many attempts. Please wait a minute and try again.';
  }
  if (msg.includes('invalid login credentials') || msg.includes('invalid email')) {
    return 'Email or password is incorrect.';
  }
  if (msg.includes('email not confirmed')) {
    return 'Please confirm your email first — check your inbox for the link.';
  }
  if (msg.includes('user already registered')) {
    return 'An account with this email already exists. Try signing in instead.';
  }
  // Fall back to the raw message — better than nothing, and still
  // shorter than the original `TypeError: Failed to fetch` stack.
  return err.message || 'Sign-in failed. Please try again.';
}
