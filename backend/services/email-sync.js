// Background email sync service using IMAP IDLE for near real-time updates
// ImapFlow handles IDLE automatically — we listen for 'exists' events

import { ImapFlow } from 'imapflow';
import { simpleParser } from 'mailparser';
import { supabase } from './storage.js';

const RESYNC_INTERVAL = 5 * 60 * 1000; // 5 min safety net
const RECONNECT_DELAY = 15000; // 15s before reconnect

// Track active connections per account ID
const activeConnections = new Map(); // accountId -> { client, destroy }

function createClient(account) {
  return new ImapFlow({
    host: account.imap_host,
    port: account.imap_port,
    secure: account.imap_port === 993,
    auth: {
      user: account.username,
      pass: account.password,
    },
    logger: false,
    tls: { rejectUnauthorized: true },
    connectionTimeout: 15000,
    greetingTimeout: 15000,
    socketTimeout: 0, // No timeout — long-lived connection
    emitLogs: false,
  });
}

async function saveNewEmail(account, parsed, flags) {
  const message_id = parsed.messageId || null;
  if (!message_id) return false;

  // Dedup
  const { data: existing } = await supabase
    .from('emails')
    .select('id')
    .eq('account_id', account.id)
    .eq('message_id', message_id)
    .limit(1);

  if (existing && existing.length > 0) return false;

  const thread_id = parsed.references?.length > 0
    ? parsed.references[0]
    : message_id;

  const attachments = (parsed.attachments || []).map(att => ({
    filename: att.filename || 'attachment',
    mime_type: att.contentType,
    size: att.size,
  }));

  const { data: saved, error } = await supabase.from('emails').insert({
    user_id: account.user_id,
    account_id: account.id,
    message_id,
    thread_id,
    folder: 'inbox',
    from_name: parsed.from?.value?.[0]?.name || '',
    from_email: parsed.from?.value?.[0]?.address || '',
    to_emails: (parsed.to?.value || []).map(t => ({ name: t.name || '', email: t.address })),
    cc_emails: (parsed.cc?.value || []).map(c => ({ name: c.name || '', email: c.address })),
    subject: parsed.subject || '(no subject)',
    body_text: parsed.text || '',
    body_html: parsed.html || null,
    is_read: flags?.has('\\Seen') || false,
    is_starred: flags?.has('\\Flagged') || false,
    has_attachments: attachments.length > 0,
    date: parsed.date || new Date(),
  }).select('id').single();

  if (error) {
    console.log(`[email-idle] Save error for ${account.email}: ${error.message}`);
    return false;
  }

  if (attachments.length > 0 && saved) {
    for (const att of attachments) {
      await supabase.from('email_attachments').insert({
        email_id: saved.id,
        filename: att.filename,
        mime_type: att.mime_type,
        size: att.size,
      });
    }
  }

  return true;
}

async function fetchLatestMessages(client, account, count = 10) {
  let newCount = 0;
  try {
    const lock = await client.getMailboxLock('INBOX');
    try {
      const total = client.mailbox?.exists || 0;
      if (total === 0) return 0;
      const start = Math.max(1, total - count + 1);
      const messages = client.fetch(`${start}:*`, {
        envelope: true,
        source: true,
        uid: true,
        flags: true,
      });

      for await (const msg of messages) {
        const parsed = await simpleParser(msg.source);
        const saved = await saveNewEmail(account, parsed, msg.flags);
        if (saved) newCount++;
      }
    } finally {
      lock.release();
    }
  } catch (err) {
    console.log(`[email-idle] Fetch error for ${account.email}: ${err.message}`);
  }

  if (newCount > 0) {
    console.log(`[email-idle] ${account.email}: ${newCount} new email(s)`);
    await supabase
      .from('email_accounts')
      .update({ last_synced_at: new Date().toISOString() })
      .eq('id', account.id);
  }

  return newCount;
}

async function startIdleConnection(account) {
  if (activeConnections.has(account.id)) return;

  const client = createClient(account);
  let destroyed = false;

  const cleanup = () => {
    destroyed = true;
    activeConnections.delete(account.id);
    try { client.close(); } catch {}
  };

  activeConnections.set(account.id, { client, destroy: cleanup });

  try {
    await client.connect();
    console.log(`[email-idle] Connected: ${account.email}`);

    // Initial fetch
    await fetchLatestMessages(client, account, 20);

    // Open INBOX and keep it open — ImapFlow enters IDLE automatically
    await client.mailboxOpen('INBOX');
    console.log(`[email-idle] ${account.email}: INBOX open, listening for new mail...`);

    // Listen for new messages (EXISTS notification from server)
    client.on('exists', async (data) => {
      if (destroyed) return;
      console.log(`[email-idle] ${account.email}: new mail detected (${data.count} total)`);
      try {
        await fetchLatestMessages(client, account, 5);
      } catch (err) {
        console.log(`[email-idle] ${account.email}: fetch after EXISTS failed: ${err.message}`);
      }
    });

    // Handle connection close
    client.on('close', () => {
      if (destroyed) return;
      console.log(`[email-idle] ${account.email}: connection closed, reconnecting...`);
      cleanup();
      setTimeout(() => reconnectAccount(account), RECONNECT_DELAY);
    });

    // Handle errors
    client.on('error', (err) => {
      if (destroyed) return;
      console.log(`[email-idle] ${account.email} error: ${err.message}`);
      cleanup();
      setTimeout(() => reconnectAccount(account), RECONNECT_DELAY);
    });

  } catch (err) {
    console.log(`[email-idle] Failed to connect ${account.email}: ${err.message}`);
    cleanup();
    setTimeout(() => reconnectAccount(account), RECONNECT_DELAY * 2);
  }
}

async function reconnectAccount(account) {
  const { data: freshAccount } = await supabase
    .from('email_accounts')
    .select('*')
    .eq('id', account.id)
    .eq('is_active', true)
    .single();

  if (freshAccount) {
    startIdleConnection(freshAccount);
  }
}

// Safety net: ensure all accounts are connected
async function syncCheck() {
  try {
    const { data: accounts } = await supabase
      .from('email_accounts')
      .select('*')
      .eq('is_active', true);

    if (!accounts?.length) return;

    for (const account of accounts) {
      if (!activeConnections.has(account.id)) {
        console.log(`[email-idle] Safety net: reconnecting ${account.email}`);
        startIdleConnection(account);
      }
    }
  } catch (err) {
    console.log(`[email-idle] Safety net error: ${err.message}`);
  }
}

export function startEmailSync() {
  console.log('[email-idle] Starting IMAP IDLE email sync service');

  setTimeout(async () => {
    try {
      const { data: accounts } = await supabase
        .from('email_accounts')
        .select('*')
        .eq('is_active', true);

      if (accounts?.length) {
        console.log(`[email-idle] Connecting ${accounts.length} email account(s)...`);
        for (const account of accounts) {
          setTimeout(() => startIdleConnection(account), Math.random() * 5000);
        }
      } else {
        console.log('[email-idle] No active email accounts');
      }
    } catch (err) {
      console.log(`[email-idle] Startup error: ${err.message}`);
    }
  }, 10000);

  setInterval(syncCheck, RESYNC_INTERVAL);
}

export function connectNewAccount(account) {
  startIdleConnection(account);
}

export function disconnectAccount(accountId) {
  const conn = activeConnections.get(accountId);
  if (conn) {
    conn.destroy();
    console.log(`[email-idle] Disconnected account ${accountId}`);
  }
}
