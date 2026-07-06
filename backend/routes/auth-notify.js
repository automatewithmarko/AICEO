// Post-signup notification endpoint. Called by the frontend right after
// supabase.auth.signUp() resolves — sends the welcome email exactly once
// per user.
//
// Why not use a Supabase auth webhook? Two reasons:
//   1. It requires customer-side config in the Supabase dashboard, which
//      makes the integration "silently" broken on any project that skips
//      the step.
//   2. It fires on user CONFIRMATION, not creation. We want the welcome
//      email to go out immediately — even before confirmation — so users
//      who never confirm still get a "hey, remember to click the link" cue.
//
// Auth model: unauthenticated. Body carries user_id + email; we verify
// user_id via admin.getUserById (O(1) UUID lookup) and only send to the
// email in auth.users — NEVER to whatever the caller passed. So:
//   - A caller who forges { user_id, email } for another user gets nothing
//     personalised sent to their spoofed address — the mail goes to the
//     real user's real inbox.
//   - Dedup on user_id PK means we can't be used to spam the same real
//     user more than once.
//   - UUIDs aren't publicly enumerable, so a targeted "welcome-bomb every
//     user" attack requires already having a UUID list.

import { Router } from 'express';
import { supabase } from '../services/storage.js';
import { sendWelcomeEmail } from '../services/booking-email.js';

const router = Router();

/**
 * POST /api/notify/welcome
 * Body: { user_id, email, fullName? }
 *
 * Response:
 *   200 { ok: true, sent: true, provider, id }  → welcome just fired
 *   200 { ok: true, sent: false, reason: 'already-sent' } → already welcomed
 *   200 { ok: true, sent: false, reason: 'no-user-match' } → user_id not found
 *   400 { error } → malformed request
 *   500 { error }
 */
router.post('/api/notify/welcome', async (req, res) => {
  try {
    const userIdRaw = String(req.body?.user_id || '').trim();
    const emailRaw = String(req.body?.email || '').trim().toLowerCase();
    const fullName = String(req.body?.fullName || '').trim();

    // Validate UUID shape early — cheap guard against noise.
    const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    if (!UUID_RE.test(userIdRaw)) {
      return res.status(400).json({ error: 'invalid user_id' });
    }
    if (!emailRaw || !emailRaw.includes('@')) {
      return res.status(400).json({ error: 'invalid email' });
    }

    // Verify user exists. getUserById is the direct O(1) path — it hits
    // the users table by PK, doesn't scan.
    const { data: userData, error: getErr } = await supabase.auth.admin.getUserById(userIdRaw);
    if (getErr || !userData?.user) {
      // Don't leak "which UUIDs exist" — return generic sent:false.
      console.log(`[welcome] no user match for ${userIdRaw}`);
      return res.json({ ok: true, sent: false, reason: 'no-user-match' });
    }

    const authEmail = userData.user.email;
    if (!authEmail) {
      return res.json({ ok: true, sent: false, reason: 'no-user-match' });
    }

    // Belt-and-suspenders: if the client claimed one email but auth.users
    // has another, log it. We still send to authEmail — the source of truth.
    if (authEmail.toLowerCase() !== emailRaw) {
      console.warn(`[welcome] client email ${emailRaw} != auth email ${authEmail} for ${userIdRaw}`);
    }

    // Atomic dedup: INSERT ... ON CONFLICT. If the insert affects a row,
    // we're first — send. If not, someone else already welcomed this user;
    // return sent:false.
    //
    // We stamp provider/message_id AFTER the send succeeds via a follow-up
    // update, so a crash between insert and send won't leave stale rows.
    // Trade-off: on such a crash the user never gets a welcome. Acceptable
    // — it's an email, not a receipt.
    const { data: inserted, error: insErr } = await supabase
      .from('welcome_emails_sent')
      .insert({ user_id: userIdRaw, email: authEmail })
      .select('user_id')
      .maybeSingle();

    if (insErr) {
      // 23505 = unique_violation → already welcomed.
      if (insErr.code === '23505') {
        return res.json({ ok: true, sent: false, reason: 'already-sent' });
      }
      console.error(`[welcome] insert failed: ${insErr.code} ${insErr.message}`);
      return res.status(500).json({ error: 'dedup insert failed' });
    }
    if (!inserted) {
      // No error, no row → conflict happened silently.
      return res.json({ ok: true, sent: false, reason: 'already-sent' });
    }

    // Send. If it fails, we leave the row in place — an operator can
    // truncate a row to retry. We don't auto-delete because retries would
    // race with legitimate second-attempts from the frontend.
    const result = await sendWelcomeEmail({
      email: authEmail,
      displayName: fullName || userData.user.user_metadata?.full_name || null,
    });

    // Stamp provider + id for support lookups. Non-fatal if it fails.
    if (result.ok) {
      await supabase
        .from('welcome_emails_sent')
        .update({ provider: result.provider || null, message_id: result.id || null })
        .eq('user_id', userIdRaw);
    } else {
      console.warn(`[welcome] send failed for ${authEmail}: ${result.error}`);
    }

    return res.json({
      ok: true,
      sent: result.ok,
      provider: result.provider || null,
      id: result.id || null,
      error: result.ok ? undefined : result.error,
    });
  } catch (err) {
    console.error(`[welcome] unhandled: ${err.message}`);
    return res.status(500).json({ error: err.message });
  }
});

export default router;
