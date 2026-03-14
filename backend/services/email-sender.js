// Email sending service — calls Supabase edge function
// Used by AI agents to autonomously send emails

import { supabase } from './storage.js';

const SUPABASE_URL = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

/**
 * Get the user's default (first active) email account
 */
export async function getUserEmailAccount(userId) {
  const { data, error } = await supabase
    .from('email_accounts')
    .select('*')
    .eq('user_id', userId)
    .eq('is_active', true)
    .limit(1)
    .single();

  if (error || !data) return null;
  return data;
}

/**
 * Get all email accounts for a user
 */
export async function getUserEmailAccounts(userId) {
  const { data } = await supabase
    .from('email_accounts')
    .select('*')
    .eq('user_id', userId)
    .eq('is_active', true);
  return data || [];
}

/**
 * Send an email via the Supabase edge function
 * This bypasses Railway's SMTP port blocking by running in Supabase's Deno runtime
 *
 * @param {string} userId - The authenticated user's ID
 * @param {object} params - Email parameters
 * @param {string} params.account_id - Email account ID (optional — uses default if omitted)
 * @param {string|string[]} params.to - Recipient(s)
 * @param {string} params.subject - Subject line
 * @param {string} [params.body_html] - HTML body
 * @param {string} [params.body_text] - Plain text body
 * @param {string[]} [params.cc] - CC recipients
 * @param {string} [params.in_reply_to] - Message ID for threading
 * @param {string[]} [params.references] - Reference message IDs
 */
export async function sendEmailViaEdgeFunction(userId, params) {
  if (!SUPABASE_URL) throw new Error('SUPABASE_URL not configured');

  // If no account_id provided, use the user's default account
  let accountId = params.account_id;
  if (!accountId) {
    const account = await getUserEmailAccount(userId);
    if (!account) throw new Error('No email account connected. User needs to add an email account in Inbox settings.');
    accountId = account.id;
  }

  // Call the edge function using the service role key (server-to-server)
  // We need to get a user token to pass to the edge function
  // Since we're server-side, we use the service role to look up the account directly
  const res = await fetch(`${SUPABASE_URL}/functions/v1/send-email`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${SUPABASE_SERVICE_KEY}`,
      'apikey': SUPABASE_SERVICE_KEY,
    },
    body: JSON.stringify({
      account_id: accountId,
      to: Array.isArray(params.to) ? params.to : [params.to],
      cc: params.cc || [],
      subject: params.subject || '',
      body_text: params.body_text || '',
      body_html: params.body_html || undefined,
      in_reply_to: params.in_reply_to || undefined,
      references: params.references || undefined,
      // Pass userId for the edge function to use when verify_jwt is false
      _user_id: userId,
    }),
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: 'Send failed' }));
    throw new Error(err.error || 'Failed to send email');
  }

  return res.json();
}
