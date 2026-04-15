import { Router } from 'express';
import { supabase } from '../services/storage.js';
import { fetchEmails, validateImapConnection } from '../services/imap.js';
import { sendEmail, validateSmtpConnection } from '../services/smtp.js';
import { connectNewAccount, disconnectAccount } from '../services/email-sync.js';

const router = Router();

// ─── List email accounts ───
router.get('/api/email-accounts', async (req, res) => {
  const userId = req.user.id;
  if (userId === 'anonymous') return res.json({ accounts: [] });

  const { data, error } = await supabase
    .from('email_accounts')
    .select('id, provider, email, display_name, is_active, last_synced_at, created_at')
    .eq('user_id', userId)
    .order('created_at', { ascending: true });

  if (error) return res.status(500).json({ error: error.message });
  res.json({ accounts: data });
});

// ─── Add email account ───
router.post('/api/email-accounts', async (req, res) => {
  const userId = req.user.id;
  if (userId === 'anonymous') return res.status(401).json({ error: 'Auth required' });

  const { email, display_name, username, password, imap_host, imap_port, smtp_host, smtp_port } = req.body;

  if (!email || !username || !password) {
    return res.status(400).json({ error: 'email, username, and password are required' });
  }

  if (!imap_host || !smtp_host) {
    return res.status(400).json({ error: 'IMAP host and SMTP host are required' });
  }

  const account = {
    imap_host,
    imap_port: imap_port || 993,
    smtp_host,
    smtp_port: smtp_port || 587,
    username,
    password,
    email,
    display_name: display_name || '',
  };

  // Validate IMAP (required — proves credentials work)
  try {
    console.log(`[email] Validating IMAP for ${email} (${account.imap_host}:${account.imap_port})...`);
    const imapResult = await validateImapConnection(account);
    console.log(`[email] IMAP result:`, imapResult);
    if (!imapResult.ok) {
      return res.status(400).json({ error: `IMAP connection failed: ${imapResult.error}` });
    }
  } catch (err) {
    console.error(`[email] IMAP validation threw:`, err.message);
    return res.status(400).json({ error: `IMAP connection failed: ${err.message}` });
  }

  // Validate SMTP (non-blocking — some cloud hosts block outbound SMTP)
  let smtpWarning = null;
  try {
    console.log(`[email] Validating SMTP for ${email} (${account.smtp_host}:${account.smtp_port})...`);
    const smtpResult = await validateSmtpConnection(account);
    console.log(`[email] SMTP result:`, smtpResult);
    if (!smtpResult.ok) {
      console.warn(`[email] SMTP validation failed (non-fatal): ${smtpResult.error}`);
      smtpWarning = `SMTP verification failed — sending may not work: ${smtpResult.error}`;
    }
  } catch (err) {
    console.warn(`[email] SMTP validation threw (non-fatal):`, err.message);
    smtpWarning = `SMTP verification failed — sending may not work: ${err.message}`;
  }

  // Derive provider from IMAP host
  const hostLower = (account.imap_host || '').toLowerCase();
  const provider = hostLower.includes('gmail') ? 'gmail' : hostLower.includes('outlook') || hostLower.includes('office365') ? 'outlook' : 'imap';

  // Save to DB
  const { data, error } = await supabase.from('email_accounts').insert({
    user_id: userId,
    provider,
    email,
    display_name: display_name || '',
    imap_host: account.imap_host,
    imap_port: account.imap_port,
    smtp_host: account.smtp_host,
    smtp_port: account.smtp_port,
    username,
    password,
    is_active: true,
  }).select('id, provider, email, display_name, is_active, created_at').single();

  if (error) return res.status(500).json({ error: error.message });

  console.log(`[email] Account connected: ${email}${smtpWarning ? ' (with SMTP warning)' : ''}`);

  // Start IDLE connection for real-time email updates
  const fullAccount = { ...data, user_id: userId, imap_host: account.imap_host, imap_port: account.imap_port, username, password };
  connectNewAccount(fullAccount);

  res.json({ account: data, warning: smtpWarning });
});

// ─── Delete email account ───
router.delete('/api/email-accounts/:id', async (req, res) => {
  const userId = req.user.id;
  if (userId === 'anonymous') return res.status(401).json({ error: 'Auth required' });

  // Disconnect IDLE connection before deleting
  disconnectAccount(req.params.id);

  const { error } = await supabase
    .from('email_accounts')
    .delete()
    .eq('id', req.params.id)
    .eq('user_id', userId);

  if (error) return res.status(500).json({ error: error.message });
  res.json({ ok: true });
});

// ─── Sync emails from IMAP ───
router.post('/api/email-accounts/:id/sync', async (req, res) => {
  const userId = req.user.id;
  if (userId === 'anonymous') return res.status(401).json({ error: 'Auth required' });

  // Get account with credentials
  const { data: account, error: accErr } = await supabase
    .from('email_accounts')
    .select('*')
    .eq('id', req.params.id)
    .eq('user_id', userId)
    .single();

  if (accErr || !account) return res.status(404).json({ error: 'Account not found' });

  try {
    const isInitialSync = !account.last_synced_at;
    console.log(`[email] ${isInitialSync ? 'Initial' : 'Incremental'} sync for ${account.email}...`);

    const fetchOpts = isInitialSync
      ? { folder: 'INBOX', limit: 100, latest: true }
      : { folder: 'INBOX', limit: 100, since: new Date(account.last_synced_at) };

    const fetched = await fetchEmails(account, fetchOpts);

    let newCount = 0;
    for (const email of fetched) {
      // Skip if we already have this message_id
      if (email.message_id) {
        const { data: existing } = await supabase
          .from('emails')
          .select('id')
          .eq('account_id', account.id)
          .eq('message_id', email.message_id)
          .limit(1);

        if (existing && existing.length > 0) continue;
      }

      // Derive thread_id from references
      const thread_id = email.references?.length > 0
        ? email.references[0]
        : email.message_id || null;

      const { data: saved, error: saveErr } = await supabase.from('emails').insert({
        user_id: userId,
        account_id: account.id,
        message_id: email.message_id,
        thread_id,
        folder: 'inbox',
        from_name: email.from_name,
        from_email: email.from_email,
        to_emails: email.to_emails,
        cc_emails: email.cc_emails,
        subject: email.subject,
        body_text: email.body_text,
        body_html: email.body_html,
        is_read: email.is_read,
        is_starred: email.is_starred,
        has_attachments: email.has_attachments,
        date: email.date,
      }).select('id').single();

      if (saveErr) {
        console.log(`[email] Failed to save email: ${saveErr.message}`);
        continue;
      }

      // Save attachments
      if (email.attachments?.length > 0 && saved) {
        for (const att of email.attachments) {
          await supabase.from('email_attachments').insert({
            email_id: saved.id,
            filename: att.filename,
            mime_type: att.mime_type,
            size: att.size,
          });
        }
      }

      newCount++;
    }

    // Update last_synced_at
    await supabase
      .from('email_accounts')
      .update({ last_synced_at: new Date().toISOString(), updated_at: new Date().toISOString() })
      .eq('id', account.id);

    console.log(`[email] Synced ${newCount} new emails for ${account.email}`);
    res.json({ synced: newCount, total: fetched.length });
  } catch (err) {
    console.error(`[email] Sync failed:`, err.message);
    res.status(500).json({ error: `Sync failed: ${err.message}` });
  }
});

// ─── Get folder counts (must be before /:id routes) ───
router.get('/api/emails/counts', async (req, res) => {
  const userId = req.user.id;
  if (userId === 'anonymous') return res.json({ counts: {} });

  const { account_id } = req.query;

  let inboxQuery = supabase
    .from('emails')
    .select('id', { count: 'exact', head: true })
    .eq('user_id', userId)
    .eq('folder', 'inbox')
    .eq('is_read', false);

  let draftsQuery = supabase
    .from('emails')
    .select('id', { count: 'exact', head: true })
    .eq('user_id', userId)
    .eq('folder', 'drafts');

  if (account_id) {
    inboxQuery = inboxQuery.eq('account_id', account_id);
    draftsQuery = draftsQuery.eq('account_id', account_id);
  }

  const [inboxRes, draftsRes] = await Promise.all([inboxQuery, draftsQuery]);

  res.json({
    counts: {
      inbox_unread: inboxRes.count || 0,
      drafts: draftsRes.count || 0,
    },
  });
});

// ─── List emails ───
router.get('/api/emails', async (req, res) => {
  const userId = req.user.id;
  if (userId === 'anonymous') return res.json({ emails: [] });

  const { folder, account_id, search, starred, limit = 50, offset = 0 } = req.query;

  let query = supabase
    .from('emails')
    .select('id, account_id, message_id, thread_id, folder, from_name, from_email, to_emails, subject, body_text, is_read, is_starred, has_attachments, labels, date')
    .eq('user_id', userId)
    .order('date', { ascending: false })
    .range(Number(offset), Number(offset) + Number(limit) - 1);

  if (starred === 'true') {
    query = query.eq('is_starred', true);
  } else if (folder) {
    query = query.eq('folder', folder);
  } else {
    query = query.eq('folder', 'inbox');
  }

  if (account_id) {
    query = query.eq('account_id', account_id);
  }

  if (search) {
    query = query.or(`subject.ilike.%${search}%,from_name.ilike.%${search}%,from_email.ilike.%${search}%,body_text.ilike.%${search}%`);
  }

  const { data, error } = await query;
  if (error) return res.status(500).json({ error: error.message });
  res.json({ emails: data || [] });
});

// ─── Get single email with full body ───
router.get('/api/emails/:id', async (req, res) => {
  const userId = req.user.id;
  if (userId === 'anonymous') return res.status(401).json({ error: 'Auth required' });

  const { data: email, error } = await supabase
    .from('emails')
    .select('*, email_attachments(*)')
    .eq('id', req.params.id)
    .eq('user_id', userId)
    .single();

  if (error || !email) return res.status(404).json({ error: 'Email not found' });
  res.json({ email });
});

// ─── Update email (read, star, folder) ───
router.patch('/api/emails/:id', async (req, res) => {
  const userId = req.user.id;
  if (userId === 'anonymous') return res.status(401).json({ error: 'Auth required' });

  const allowed = ['is_read', 'is_starred', 'folder', 'labels'];
  const updates = {};
  for (const key of allowed) {
    if (req.body[key] !== undefined) updates[key] = req.body[key];
  }

  if (Object.keys(updates).length === 0) {
    return res.status(400).json({ error: 'No valid fields to update' });
  }

  const { data, error } = await supabase
    .from('emails')
    .update(updates)
    .eq('id', req.params.id)
    .eq('user_id', userId)
    .select('id, is_read, is_starred, folder, labels')
    .single();

  if (error) return res.status(500).json({ error: error.message });
  res.json({ email: data });
});

// ─── Batch update emails ───
router.patch('/api/emails', async (req, res) => {
  const userId = req.user.id;
  if (userId === 'anonymous') return res.status(401).json({ error: 'Auth required' });

  const { ids, updates } = req.body;
  if (!Array.isArray(ids) || ids.length === 0) {
    return res.status(400).json({ error: 'ids array required' });
  }

  const allowed = ['is_read', 'is_starred', 'folder', 'labels'];
  const filtered = {};
  for (const key of allowed) {
    if (updates?.[key] !== undefined) filtered[key] = updates[key];
  }

  const { error } = await supabase
    .from('emails')
    .update(filtered)
    .in('id', ids)
    .eq('user_id', userId);

  if (error) return res.status(500).json({ error: error.message });
  res.json({ ok: true });
});

// ─── Send email ───
router.post('/api/emails/send', async (req, res) => {
  const userId = req.user.id;
  if (userId === 'anonymous') return res.status(401).json({ error: 'Auth required' });

  const { account_id, to, cc, subject, body_text, body_html, in_reply_to, references } = req.body;

  if (!account_id || !to || !subject) {
    return res.status(400).json({ error: 'account_id, to, and subject are required' });
  }

  // Get account
  const { data: account, error: accErr } = await supabase
    .from('email_accounts')
    .select('*')
    .eq('id', account_id)
    .eq('user_id', userId)
    .single();

  if (accErr || !account) return res.status(404).json({ error: 'Account not found' });

  try {
    const result = await sendEmail(account, {
      to: Array.isArray(to) ? to : [to],
      cc: cc || [],
      subject,
      text: body_text || '',
      html: body_html || undefined,
      inReplyTo: in_reply_to || undefined,
      references: references || undefined,
    });

    // Save to sent folder
    const toEmails = (Array.isArray(to) ? to : [to]).map((t) =>
      typeof t === 'string' ? { name: '', email: t } : t
    );

    await supabase.from('emails').insert({
      user_id: userId,
      account_id: account.id,
      message_id: result.messageId,
      thread_id: references?.[0] || in_reply_to || result.messageId,
      folder: 'sent',
      from_name: account.display_name || '',
      from_email: account.email,
      to_emails: toEmails,
      cc_emails: cc || [],
      subject,
      body_text: body_text || '',
      body_html: body_html || null,
      is_read: true,
      date: new Date().toISOString(),
    });

    res.json({ ok: true, messageId: result.messageId });
  } catch (err) {
    console.error(`[email] Send failed:`, err.message);
    res.status(500).json({ error: `Failed to send: ${err.message}` });
  }
});

// ─── Save draft ───
router.post('/api/emails/draft', async (req, res) => {
  const userId = req.user.id;
  if (userId === 'anonymous') return res.status(401).json({ error: 'Auth required' });

  const { account_id, to, cc, subject, body_text, body_html, draft_id } = req.body;

  if (!account_id) {
    return res.status(400).json({ error: 'account_id is required' });
  }

  // Get account for from info
  const { data: account } = await supabase
    .from('email_accounts')
    .select('email, display_name')
    .eq('id', account_id)
    .eq('user_id', userId)
    .single();

  if (!account) return res.status(404).json({ error: 'Account not found' });

  const toEmails = (Array.isArray(to) ? to : (to ? [to] : [])).map((t) =>
    typeof t === 'string' ? { name: '', email: t } : t
  );

  const draftData = {
    user_id: userId,
    account_id,
    folder: 'drafts',
    from_name: account.display_name || '',
    from_email: account.email,
    to_emails: toEmails,
    cc_emails: cc || [],
    subject: subject || '',
    body_text: body_text || '',
    body_html: body_html || null,
    is_read: true,
    date: new Date().toISOString(),
  };

  // Update existing draft or create new
  if (draft_id) {
    const { data, error } = await supabase
      .from('emails')
      .update(draftData)
      .eq('id', draft_id)
      .eq('user_id', userId)
      .eq('folder', 'drafts')
      .select('id')
      .single();

    if (error) return res.status(500).json({ error: error.message });
    res.json({ draft_id: data.id });
  } else {
    const { data, error } = await supabase
      .from('emails')
      .insert(draftData)
      .select('id')
      .single();

    if (error) return res.status(500).json({ error: error.message });
    res.json({ draft_id: data.id });
  }
});

// ─── Delete email permanently ───
router.delete('/api/emails/:id', async (req, res) => {
  const userId = req.user.id;
  if (userId === 'anonymous') return res.status(401).json({ error: 'Auth required' });

  const { error } = await supabase
    .from('emails')
    .delete()
    .eq('id', req.params.id)
    .eq('user_id', userId);

  if (error) return res.status(500).json({ error: error.message });
  res.json({ ok: true });
});

// ─── AI Draft (generate a reply body from original email + user prompt) ───
router.post('/api/emails/ai-draft', async (req, res) => {
  const userId = req.user.id;
  if (userId === 'anonymous') return res.status(401).json({ error: 'Auth required' });

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) return res.status(500).json({ error: 'ANTHROPIC_API_KEY not configured' });

  const { prompt, mode = 'reply', original = null, context_emails = [], context_calls = [] } = req.body || {};
  if (!prompt || !String(prompt).trim()) {
    return res.status(400).json({ error: 'prompt is required' });
  }

  // Load brand DNA for voice/signature hints (best-effort).
  let brandDescription = '';
  let userName = '';
  try {
    const [brandRes, userRes] = await Promise.all([
      supabase.from('brand_dna').select('description').eq('user_id', userId).order('updated_at', { ascending: false }).limit(1),
      supabase.from('users').select('full_name').eq('id', userId).limit(1),
    ]);
    brandDescription = brandRes.data?.[0]?.description || '';
    userName = userRes.data?.[0]?.full_name || '';
  } catch {
    // non-fatal
  }

  const trim = (t, n = 4000) => String(t || '').replace(/\s+/g, ' ').trim().slice(0, n);

  const systemPrompt = `You are an email assistant drafting a response on behalf of the user${userName ? ` (${userName})` : ''}.

Rules:
- Output ONLY the email body text. No subject line, no preamble, no "Here's a draft:", no markdown code fences.
- Address the original sender by name when known. Reference specific points from their email so the reply feels read, not templated.
- Match the tone and register of the original email (formal / casual / friendly).
- Be concise and direct. No filler phrases like "I hope this finds you well", "Thank you for reaching out", or "Looking forward to hearing from you" unless they genuinely fit.
- Never use em dashes. Never use hashtags.
- Do NOT invent facts, commitments, dates, prices, or details that aren't in the user's instruction or the provided context.
- If the user instruction is short, infer the intent from the original email and the instruction together.
- End with a plain sign-off (e.g. "${userName || 'Best'}") — no "Best regards," templates unless the original used that register.${brandDescription ? `\n- Voice/brand context: ${trim(brandDescription, 600)}` : ''}`;

  // Build the user-facing payload the model sees.
  const lines = [`MODE: ${mode}`, '', `USER INSTRUCTION:\n${String(prompt).trim()}`];

  if (original && (original.body_text || original.subject)) {
    lines.push('', '--- ORIGINAL EMAIL (reply to this) ---');
    if (original.from_name || original.from_email) lines.push(`From: ${original.from_name || ''} <${original.from_email || ''}>`);
    if (original.date) lines.push(`Date: ${new Date(original.date).toString()}`);
    if (original.subject) lines.push(`Subject: ${original.subject}`);
    lines.push('', trim(original.body_text, 6000));
  }

  if (Array.isArray(context_emails) && context_emails.length > 0) {
    lines.push('', '--- ADDITIONAL EMAIL CONTEXT ---');
    for (const e of context_emails.slice(0, 5)) {
      lines.push(`From: ${e.from || ''} | Subject: ${e.subject || ''}`);
      lines.push(trim(e.body_text, 1500));
      lines.push('');
    }
  }

  if (Array.isArray(context_calls) && context_calls.length > 0) {
    lines.push('', '--- CALL TRANSCRIPT CONTEXT ---');
    for (const c of context_calls.slice(0, 3)) {
      lines.push(`Call: ${c.title || 'Untitled'}`);
      lines.push(trim(c.transcript, 3000));
      lines.push('');
    }
  }

  const userMessage = lines.join('\n');

  try {
    const r = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: 'claude-sonnet-4-20250514',
        max_tokens: 1500,
        system: systemPrompt,
        messages: [{ role: 'user', content: userMessage }],
      }),
    });

    if (!r.ok) {
      const errText = await r.text().catch(() => '');
      console.log(`[ai-draft] Anthropic ${r.status}: ${errText.slice(0, 300)}`);
      return res.status(502).json({ error: `Anthropic API ${r.status}` });
    }

    const data = await r.json();
    const draft = (data.content || []).filter((b) => b.type === 'text').map((b) => b.text).join('').trim();
    if (!draft) return res.status(500).json({ error: 'Empty draft from model' });

    res.json({ draft });
  } catch (err) {
    console.error('[ai-draft] failed:', err.message);
    res.status(500).json({ error: err.message });
  }
});

export default router;
