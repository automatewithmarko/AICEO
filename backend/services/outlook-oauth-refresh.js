// Shared helper: ensures an OAuth account has a valid (non-expired) access token.
// Used by imap.js, smtp.js, and email-sync.js before connecting.

import { refreshAccessToken } from './outlook-oauth.js';
import { supabase } from './storage.js';

const TOKEN_EXPIRY_BUFFER = 5 * 60 * 1000; // refresh 5 min before actual expiry

/**
 * Given an account object, returns it with a fresh access token if the current
 * one is expired (or about to expire). Updates the DB as a side-effect.
 * For non-OAuth accounts, returns the account unchanged.
 */
export async function getValidAccessToken(account) {
  if (account.auth_type !== 'oauth') return account;
  if (!account.oauth_refresh_token) return account;

  const expiresAt = account.oauth_expires_at ? new Date(account.oauth_expires_at).getTime() : 0;
  const needsRefresh = !account.oauth_access_token || Date.now() > expiresAt - TOKEN_EXPIRY_BUFFER;

  if (!needsRefresh) return account;

  console.log(`[oauth] Refreshing access token for ${account.email}...`);

  const tokens = await refreshAccessToken(account.oauth_refresh_token);

  // Persist new tokens to DB
  await supabase.from('email_accounts').update({
    oauth_access_token: tokens.access_token,
    oauth_refresh_token: tokens.refresh_token,
    oauth_expires_at: tokens.expires_at,
  }).eq('id', account.id);

  return {
    ...account,
    oauth_access_token: tokens.access_token,
    oauth_refresh_token: tokens.refresh_token,
    oauth_expires_at: tokens.expires_at,
  };
}
