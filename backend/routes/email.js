import { Router } from 'express';
import crypto from 'crypto';
import { supabase } from '../services/storage.js';
import { fetchEmails, validateImapConnection } from '../services/imap.js';
import { sendEmail, validateSmtpConnection } from '../services/smtp.js';
import { connectNewAccount, disconnectAccount } from '../services/email-sync.js';
import { buildAuthUrl, exchangeCode, decodeIdToken, refreshAccessToken } from '../services/outlook-oauth.js';

const router = Router();

// ─── List email accounts ───
router.get('/api/email-accounts', async (req, res) => {
  const userId = req.user.id;
  if (userId === 'anonymous') return res.json({ accounts: [] });

  const { data, error } = await supabase
    .from('email_accounts')
    .select('id, provider, auth_type, email, display_name, is_active, last_synced_at, created_at')
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

// ─── Outlook OAuth: initiate ───
router.get('/api/email-accounts/outlook/auth', async (req, res) => {
  const userId = req.user.id;
  if (userId === 'anonymous') return res.status(401).json({ error: 'Auth required' });

  if (!process.env.MICROSOFT_CLIENT_ID || !process.env.MICROSOFT_CLIENT_SECRET) {
    return res.status(500).json({ error: 'Microsoft OAuth is not configured on the server' });
  }

  // State = userId:random (we verify userId on callback)
  const state = `${userId}:${crypto.randomBytes(16).toString('hex')}`;
  const url = buildAuthUrl(state);
  res.json({ url, state });
});

// ─── Outlook OAuth: exchange code for tokens ───
router.post('/api/email-accounts/outlook/callback', async (req, res) => {
  const userId = req.user.id;
  if (userId === 'anonymous') return res.status(401).json({ error: 'Auth required' });

  const { code, state } = req.body;
  if (!code) return res.status(400).json({ error: 'Missing authorization code' });

  // Verify state belongs to this user
  if (state && !state.startsWith(userId)) {
    return res.status(403).json({ error: 'State mismatch' });
  }

  try {
    const tokens = await exchangeCode(code);
    const { email, name } = decodeIdToken(tokens.id_token || '');

    if (!email) {
      return res.status(400).json({ error: 'Could not determine email from Microsoft. Please try again.' });
    }

    // Check if this Outlook account is already connected
    const { data: existing } = await supabase
      .from('email_accounts')
      .select('id')
      .eq('user_id', userId)
      .eq('email', email)
      .limit(1);

    if (existing && existing.length > 0) {
      // Update tokens on existing account
      await supabase.from('email_accounts').update({
        oauth_access_token: tokens.access_token,
        oauth_refresh_token: tokens.refresh_token,
        oauth_expires_at: tokens.expires_at,
        is_active: true,
      }).eq('id', existing[0].id);

      // Reconnect IDLE
      const { data: account } = await supabase
        .from('email_accounts').select('*').eq('id', existing[0].id).single();
      if (account) {
        disconnectAccount(account.id);
        connectNewAccount(account);
      }

      return res.json({ account: { id: existing[0].id, email, display_name: name, provider: 'outlook' }, reconnected: true });
    }

    // Create new account
    const { data: account, error } = await supabase.from('email_accounts').insert({
      user_id: userId,
      provider: 'outlook',
      auth_type: 'oauth',
      email,
      display_name: name || '',
      imap_host: 'outlook.office365.com',
      imap_port: 993,
      smtp_host: 'smtp-mail.outlook.com',
      smtp_port: 587,
      username: email,
      password: null,
      oauth_access_token: tokens.access_token,
      oauth_refresh_token: tokens.refresh_token,
      oauth_expires_at: tokens.expires_at,
      is_active: true,
    }).select('id, provider, email, display_name, is_active, created_at').single();

    if (error) return res.status(500).json({ error: error.message });

    // Start IDLE connection
    const fullAccount = await supabase.from('email_accounts').select('*').eq('id', account.id).single();
    if (fullAccount.data) connectNewAccount(fullAccount.data);

    console.log(`[email] Outlook OAuth account connected: ${email}`);
    res.json({ account });
  } catch (err) {
    console.error('[email] Outlook OAuth callback error:', err.message);
    res.status(500).json({ error: `OAuth failed: ${err.message}` });
  }
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

  const apiKey = process.env.MENTOR_API_KEY;
  if (!apiKey) return res.status(500).json({ error: 'MENTOR_API_KEY not configured' });

  const { prompt, mode = 'reply', original = null, context_emails = [], context_calls = [], useBrandTemplate = false } = req.body || {};
  if (!prompt || !String(prompt).trim()) {
    return res.status(400).json({ error: 'prompt is required' });
  }

  // Detect an explicit HTML/template request in the prompt itself (path #3).
  // Plain text is the default; brand template is opt-in via toggle OR
  // auto-applied when the user's instruction clearly asks for styled output.
  const promptLower = String(prompt).toLowerCase();
  const explicitHtmlRequest = /\b(html|styled|branded|template|newsletter-style|with (?:my )?(?:brand|logo|colors))\b/.test(promptLower);
  const wantsHtml = Boolean(useBrandTemplate) || explicitHtmlRequest;

  // Load full brand DNA so the HTML version can match the user's visual identity.
  let brandDescription = '';
  let brandLogoUrl = null;
  let brandPrimaryColor = '';
  let brandTextColor = '';
  let brandSecondaryColor = '';
  let brandMainFont = '';
  let userName = '';
  try {
    const [brandRes, userRes] = await Promise.all([
      supabase.from('brand_dna').select('description, colors, main_font, secondary_font, logo_url, logos').eq('user_id', userId).order('updated_at', { ascending: false }).limit(1),
      supabase.from('users').select('full_name').eq('id', userId).limit(1),
    ]);
    const brand = brandRes.data?.[0] || {};
    brandDescription = brand.description || '';
    brandLogoUrl = brand.logos?.find((l) => l.isDefault)?.url
      || brand.logos?.[0]?.url
      || brand.logo_url
      || null;
    brandPrimaryColor = brand.colors?.primary || '';
    brandTextColor = brand.colors?.text || '';
    brandSecondaryColor = brand.colors?.secondary || '';
    brandMainFont = brand.main_font || '';
    userName = userRes.data?.[0]?.full_name || '';
  } catch {
    // non-fatal — fall back to plain output without branding
  }

  const trim = (t, n = 4000) => String(t || '').replace(/\s+/g, ' ').trim().slice(0, n);

  // ── Email body cleaner ──
  // Turns a raw email body (either HTML or plain-text from mailparser's
  // alternative part) into clean prose the model can actually reason over.
  // Strips: HTML tags/styles/tracking-pixel placeholders, quote-chains
  // ("> prev reply"), signatures, "On <date> wrote:" / "From: ... Sent: ..."
  // attribution blocks, "Sent from my iPhone" footers, ASCII dividers.
  function stripHtml(html) {
    if (!html) return '';
    return String(html)
      .replace(/<style[\s\S]*?<\/style>/gi, '')
      .replace(/<script[\s\S]*?<\/script>/gi, '')
      .replace(/<head[\s\S]*?<\/head>/gi, '')
      .replace(/<!--[\s\S]*?-->/g, '')
      .replace(/<br\s*\/?>/gi, '\n')
      .replace(/<\/(p|div|tr|li|h[1-6]|blockquote|table|section|article)>/gi, '\n')
      .replace(/<img[^>]*>/gi, '')
      .replace(/<[^>]+>/g, '')
      .replace(/&nbsp;/g, ' ')
      .replace(/&amp;/g, '&')
      .replace(/&lt;/g, '<')
      .replace(/&gt;/g, '>')
      .replace(/&quot;/g, '"')
      .replace(/&#39;/g, "'")
      .replace(/&(?:rsquo|lsquo|apos);/g, "'")
      .replace(/&(?:rdquo|ldquo);/g, '"')
      .replace(/&(?:ndash|mdash);/g, '-')
      .replace(/&hellip;/g, '...')
      .replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(Number(n)))
      .replace(/&[a-z]+;/gi, ' ');
  }

  function cleanEmailBody({ body_html, body_text }) {
    let text = body_html ? stripHtml(body_html) : String(body_text || '');
    if (!text) return '';
    text = text.replace(/\r\n/g, '\n').replace(/\r/g, '\n');
    // Zero-width + soft-hyphen artifacts
    text = text.replace(/[\u200B-\u200D\uFEFF\u00AD]/g, '');
    // Tracking-pixel / image placeholders like [image: logo.png]
    text = text.replace(/\[image:\s*[^\]]*\]/gi, '');
    // Cut the RFC signature ("-- \n" on its own line) + everything after
    const sigMatch = text.match(/\n--\s*\n/);
    if (sigMatch) text = text.slice(0, sigMatch.index);
    // Cut "On <date>, X wrote:" + everything after (Gmail/Apple quote header)
    text = text.replace(/^On\s+.{0,120}\s+wrote:[\s\S]*$/m, '');
    // Cut Outlook-style "From: ... Sent/Date/To/Cc/Subject: ..." block + after
    text = text.replace(/^From:\s+.{0,200}\n(?:Sent|Date|To|Cc|Subject):[\s\S]*$/m, '');
    // Drop quoted-reply lines starting with > (handles ">> nested" too)
    text = text.split('\n').filter((line) => !/^\s*>/.test(line)).join('\n');
    // Mobile footers
    text = text.replace(/^\s*Sent from my\s+[^\n]+$/gmi, '');
    text = text.replace(/^\s*Get\s+Outlook\s+for[^\n]+$/gmi, '');
    // ASCII/divider lines (--- === *** ___ ~~~)
    text = text.replace(/^\s*[-=_*~]{3,}\s*$/gm, '');
    // Per-line whitespace + blank-line collapse
    text = text.split('\n').map((l) => l.replace(/[ \t]+/g, ' ').trimEnd()).join('\n');
    text = text.replace(/\n{3,}/g, '\n\n').trim();
    return text;
  }

  // Brand theme values (only used when wantsHtml is true).
  // Body text ALWAYS uses safe dark colors — brand text color from brand DNA
  // is often set for dark-themed landing pages, and using it for email body
  // text on the white default email-client background produces invisible
  // white-on-white text. Brand primary color is used only for accents.
  const primary = brandPrimaryColor || '#1a1a1a';
  // Luminance-safe primary: if the brand's primary is too light to read on
  // white (e.g. pale yellow, lime), use a fallback dark tone for accents too.
  const isTooLight = (() => {
    const hex = String(primary).replace('#', '');
    if (hex.length !== 6) return false;
    const r = parseInt(hex.slice(0, 2), 16);
    const g = parseInt(hex.slice(2, 4), 16);
    const b = parseInt(hex.slice(4, 6), 16);
    // perceived luminance
    const lum = (0.299 * r + 0.587 * g + 0.114 * b) / 255;
    return lum > 0.75;
  })();
  const accent = isTooLight ? '#1a1a1a' : primary;
  const bodyText = '#1a1a1a';   // hardcoded — safe on white
  const mutedText = '#6b7280';  // hardcoded — safe on white
  const font = brandMainFont
    ? `${brandMainFont}, -apple-system, BlinkMacSystemFont, 'Segoe UI', Arial, sans-serif`
    : "-apple-system, BlinkMacSystemFont, 'Segoe UI', Arial, sans-serif";

  // Core copy rules shared by both modes.
  const copyRules = `COPY RULES:
- Write the email body only. No subject line, no preamble, no "Here's a draft:".
- Address the original sender by name when known. Reference specific points from their email so the reply feels read, not templated.
- Match the tone and register of the original email (formal / casual / friendly).
- Be concise and direct. No filler phrases like "I hope this finds you well", "Thank you for reaching out", or "Looking forward to hearing from you" unless they genuinely fit.
- Never use em dashes. Never use hashtags.
- Do NOT invent facts, commitments, dates, prices, or details that aren't in the user's instruction or the provided context.
- End with a plain sign-off (e.g. "${userName || 'Best'}") — no "Best regards," templates unless the original used that register.${brandDescription ? `\n- Voice/brand context: ${trim(brandDescription, 600)}` : ''}`;

  // Two prompt paths — plain text (default) vs brand-themed HTML (opt-in or explicit).
  const systemPrompt = wantsHtml
    ? `You are an email assistant drafting a response on behalf of the user${userName ? ` (${userName})` : ''}. The user has asked for a BRAND-THEMED HTML email.

OUTPUT FORMAT — respond with ONLY a JSON object, no preamble, no markdown fences:
{
  "text": "plain text version of the email body",
  "html": "HTML version with inline styles applying the user's brand theme"
}

${copyRules}

HTML RULES (for the "html" field):
BRAND THEME — apply these EXACTLY:
- Body text color: ${bodyText} (DO NOT use any other color for paragraph text — emails render on white backgrounds by default and lighter text becomes invisible)
- Accent color (for links, emphasis, heading touches): ${accent}
- Muted text (signature, meta): ${mutedText}
- Font family: ${font}${brandLogoUrl ? `\n- Logo URL: ${brandLogoUrl}` : '\n- No logo available — skip the logo row entirely'}

- Produce an email-safe HTML fragment. Email clients strip <style> blocks and <link> tags — use ONLY inline styles.
- The outermost wrapper MUST set an explicit white background so the email is readable in any client:
  <div style="background: #ffffff; font-family: ${font}; color: ${bodyText}; font-size: 15px; line-height: 1.6; max-width: 600px; margin: 0 auto; padding: 24px;">...</div>
- If a logo URL is provided above, include ONE row at the top: <div style="margin-bottom: 24px;"><img src="${brandLogoUrl || ''}" alt="" style="max-height: 40px; width: auto; display: block;" /></div>. If no logo, skip this row.
- Paragraphs: <p style="margin: 0 0 16px; color: ${bodyText};">...</p>. Keep them short (1-3 sentences each). NEVER use white, pale yellow, or any light color for paragraph text.
- Links: <a href="..." style="color: ${accent}; text-decoration: underline;">...</a>.
- Subtle emphasis: <strong style="color: ${accent};">...</strong> sparingly — never on whole sentences. If ${accent} is very light, use ${bodyText} instead.
- Signature: separate with <div style="margin-top: 32px; padding-top: 16px; border-top: 1px solid #e5e7eb; color: ${mutedText}; font-size: 14px;">...</div>. Include the user's name${userName ? ` (${userName})` : ''} on the first line in ${bodyText} (use <strong style="color: ${bodyText};">${userName || 'Name'}</strong>). Role/company line in ${mutedText}.
- Do NOT include <html>, <head>, or <body> tags — just the wrapping <div>.
- Do NOT use background images, gradients, dark backgrounds, or CSS variables.
- Match the plain "text" version exactly in words — the HTML is the same content with brand styling added, not a rewrite.`
    : `You are an email assistant drafting a response on behalf of the user${userName ? ` (${userName})` : ''}.

OUTPUT: plain text only. No HTML, no markdown fences, no JSON wrapper, no preamble, no "Here's a draft:". Just the email body.

${copyRules}`;

  // Build the user-facing payload the model sees.
  const lines = [`MODE: ${mode}`, '', `USER INSTRUCTION:\n${String(prompt).trim()}`];

  if (original && (original.body_text || original.body_html || original.subject)) {
    lines.push('', '--- ORIGINAL EMAIL (reply to this) ---');
    if (original.from_name || original.from_email) lines.push(`From: ${original.from_name || ''} <${original.from_email || ''}>`);
    if (original.date) lines.push(`Date: ${new Date(original.date).toString()}`);
    if (original.subject) lines.push(`Subject: ${original.subject}`);
    const cleaned = cleanEmailBody({ body_html: original.body_html, body_text: original.body_text });
    lines.push('', trim(cleaned, 6000));
  }

  if (Array.isArray(context_emails) && context_emails.length > 0) {
    lines.push('', '--- ADDITIONAL EMAIL CONTEXT ---');
    for (const e of context_emails.slice(0, 5)) {
      lines.push(`From: ${e.from || ''} | Subject: ${e.subject || ''}`);
      const cleaned = cleanEmailBody({ body_html: e.body_html, body_text: e.body_text });
      lines.push(trim(cleaned, 1500));
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
    const mentorBase = process.env.MENTOR_BASE_URL || 'https://platform.thementorprogram.xyz';
    const r = await fetch(`${mentorBase}/api/v1/messages`, {
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
    const raw = (data.content || []).filter((b) => b.type === 'text').map((b) => b.text).join('').trim();
    if (!raw) return res.status(500).json({ error: 'Empty draft from model' });

    if (!wantsHtml) {
      // Plain-text path (default). Return the response as-is — no HTML.
      return res.json({ draft: raw, draft_html: null });
    }

    // Brand-template path. The model returned JSON { text, html }. Parse
    // defensively — strip code fences and extract the first JSON object.
    let parsed = null;
    const cleaned = raw.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/i, '').trim();
    try { parsed = JSON.parse(cleaned); }
    catch {
      const m = cleaned.match(/\{[\s\S]*\}/);
      if (m) { try { parsed = JSON.parse(m[0]); } catch { /* fall through */ } }
    }

    const draft = (parsed && typeof parsed.text === 'string' && parsed.text.trim())
      ? parsed.text.trim()
      : raw;
    const draftHtml = (parsed && typeof parsed.html === 'string' && parsed.html.trim())
      ? parsed.html.trim()
      : null;

    res.json({ draft, draft_html: draftHtml });
  } catch (err) {
    console.error('[ai-draft] failed:', err.message);
    res.status(500).json({ error: err.message });
  }
});

export default router;
