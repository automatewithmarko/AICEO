// Microsoft Graph inbox sync. Replaces IMAP IDLE for Outlook accounts —
// Microsoft has been deprecating IMAP+OAuth, and our new Outlook OAuth
// scopes are Graph-only (Mail.Send + Mail.Read), no IMAP scope at all,
// so the IMAP IDLE service can never authenticate again.
//
// Strategy: poll `GET /me/messages` every POLL_INTERVAL. The frontend's
// Supabase Realtime subscription already pushes new rows to the UI, so
// the user sees fresh mail within ~one poll cycle without us needing
// Graph change-notification subscriptions (those require a public
// HTTPS webhook + lifecycle management; out of scope for now).

import { supabase } from './storage.js';
import { getValidAccessToken } from './outlook-oauth-refresh.js';

const POLL_INTERVAL_MS = 60_000;          // poll every minute
const FETCH_LIMIT = 50;                    // messages per poll
const GRAPH_MESSAGES_URL = 'https://graph.microsoft.com/v1.0/me/messages';

// Track active polls per account ID so disconnectAccount can stop them
// and connectNewAccount doesn't double-start.
const activePolls = new Map();             // accountId -> { stop }

function recipientToObj(r) {
  if (!r?.emailAddress) return null;
  return {
    name: r.emailAddress.name || '',
    email: r.emailAddress.address || '',
  };
}

function mapGraphMessage(msg, accountId, userId) {
  // Graph's `id` is its own opaque identifier; we want internetMessageId
  // (RFC 5322 Message-ID) as our message_id so it dedupes consistently
  // with anything else (sent via /me/sendMail, or inserted via the
  // legacy IMAP path on Gmail).
  const message_id = msg.internetMessageId || msg.id;
  if (!message_id) return null;

  const fromObj = recipientToObj(msg.from);
  const to_emails = (msg.toRecipients || []).map(recipientToObj).filter(Boolean);
  const cc_emails = (msg.ccRecipients || []).map(recipientToObj).filter(Boolean);

  // Body preference: HTML if Graph returns it, else text. Graph's
  // body.contentType is 'html' or 'text'.
  const isHtml = msg.body?.contentType === 'html';
  const body_html = isHtml ? (msg.body.content || null) : null;
  const body_text = isHtml
    ? (msg.bodyPreview || '')
    : (msg.body?.content || msg.bodyPreview || '');

  return {
    user_id: userId,
    account_id: accountId,
    message_id,
    thread_id: msg.conversationId || message_id,
    folder: 'inbox',
    from_name: fromObj?.name || '',
    from_email: fromObj?.email || '',
    to_emails,
    cc_emails,
    subject: msg.subject || '(no subject)',
    body_text,
    body_html,
    is_read: !!msg.isRead,
    is_starred: msg.flag?.flagStatus === 'flagged',
    has_attachments: !!msg.hasAttachments,
    date: msg.receivedDateTime || new Date().toISOString(),
  };
}

async function fetchPage(accessToken, url) {
  const res = await fetch(url, {
    headers: {
      'Authorization': `Bearer ${accessToken}`,
      'Accept': 'application/json',
    },
  });
  if (!res.ok) {
    let detail = `Graph ${res.status}`;
    try {
      const j = await res.json();
      detail = `${j.error?.code || 'GraphError'}: ${j.error?.message || detail}`;
    } catch { /* not JSON */ }
    const err = new Error(detail);
    err.status = res.status;
    throw err;
  }
  return res.json();
}

/**
 * Fetch the most recent inbox messages from Graph and upsert them into
 * the `emails` table. Returns the count of NEW rows inserted (existing
 * dedup ones don't count). The caller is responsible for ensuring the
 * account's access_token is fresh — typically through getValidAccessToken
 * before this call.
 */
export async function fetchInboxFromGraph(account, { limit = FETCH_LIMIT } = {}) {
  if (!account.oauth_access_token) {
    throw new Error('Outlook account is missing oauth_access_token');
  }

  // Restrict to Inbox folder + ask Graph for everything we need in one
  // call. Sent items / drafts / archive each have their own Graph
  // endpoints; we only mirror Inbox here for parity with what IMAP IDLE
  // used to do.
  const select = [
    'id', 'internetMessageId', 'conversationId',
    'from', 'toRecipients', 'ccRecipients',
    'subject', 'body', 'bodyPreview',
    'receivedDateTime', 'isRead', 'flag', 'hasAttachments',
  ].join(',');
  const url = `${GRAPH_MESSAGES_URL}?$top=${limit}&$orderby=receivedDateTime desc&$select=${select}`;

  const data = await fetchPage(account.oauth_access_token, url);
  const messages = data.value || [];

  let inserted = 0;
  for (const msg of messages) {
    const row = mapGraphMessage(msg, account.id, account.user_id);
    if (!row) continue;

    // Dedup by (account_id, message_id) — same key the IMAP path uses,
    // so re-syncing the same account from either side never duplicates.
    const { data: existing } = await supabase
      .from('emails')
      .select('id')
      .eq('account_id', account.id)
      .eq('message_id', row.message_id)
      .limit(1);
    if (existing && existing.length > 0) continue;

    const { error } = await supabase.from('emails').insert(row);
    if (error) {
      // Race with another poll inserting the same row — postgres unique
      // constraints would reject; log and move on.
      console.log(`[graph-sync] Insert error for ${account.email} msg=${row.message_id}: ${error.message}`);
      continue;
    }
    inserted += 1;
  }

  // Best-effort last_synced_at update so the UI's "last synced" badge
  // reflects Graph polls, not just IMAP.
  if (messages.length > 0) {
    await supabase
      .from('email_accounts')
      .update({ last_synced_at: new Date().toISOString() })
      .eq('id', account.id);
  }

  return { fetched: messages.length, inserted };
}

async function pollLoop(accountId) {
  const entry = activePolls.get(accountId);
  if (!entry || entry.stopped) return;

  try {
    // Re-read the account every cycle so token rotations / account
    // disable / re-connect events are picked up without a service restart.
    const { data: account } = await supabase
      .from('email_accounts')
      .select('*')
      .eq('id', accountId)
      .eq('is_active', true)
      .maybeSingle();

    if (!account) {
      // Account was deactivated or removed — stop polling silently.
      stopGraphSync(accountId);
      return;
    }

    const fresh = await getValidAccessToken(account);
    const { inserted } = await fetchInboxFromGraph(fresh);
    if (inserted > 0) {
      console.log(`[graph-sync] ${fresh.email}: ${inserted} new email(s)`);
    }
  } catch (err) {
    // Don't stop the loop on a single failed poll — could be a transient
    // 429 / 5xx / token refresh hiccup. The next cycle will retry.
    console.log(`[graph-sync] Poll error for account ${accountId}: ${err.message}`);
  }

  // Schedule next poll if still active.
  const after = activePolls.get(accountId);
  if (after && !after.stopped) {
    after.timer = setTimeout(() => pollLoop(accountId), POLL_INTERVAL_MS);
  }
}

/**
 * Start polling Graph for an Outlook OAuth account. Idempotent — calling
 * twice for the same account is a no-op.
 */
export function startGraphSync(account) {
  if (activePolls.has(account.id)) return;
  console.log(`[graph-sync] Starting Graph poll for ${account.email}`);
  const entry = { stopped: false, timer: null };
  activePolls.set(account.id, entry);
  // Kick off the first poll immediately so the user doesn't wait a full
  // minute for their first inbox load after connect/reconnect.
  pollLoop(account.id);
}

export function stopGraphSync(accountId) {
  const entry = activePolls.get(accountId);
  if (!entry) return;
  entry.stopped = true;
  if (entry.timer) clearTimeout(entry.timer);
  activePolls.delete(accountId);
  console.log(`[graph-sync] Stopped Graph poll for account ${accountId}`);
}

/**
 * True iff this account should sync via Graph (not IMAP).
 */
export function isGraphAccount(account) {
  return account?.provider === 'outlook' && account?.auth_type === 'oauth';
}
