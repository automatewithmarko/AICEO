// Scheduled-post dispatcher.
// Polls social_posts for rows with status='scheduled' and scheduled_at
// due, publishes them via the shared publishSocialPostRow helper, and
// marks the result. Runs alongside email-sync — same setInterval pattern.
//
// Idempotency: a row is claimed by transitioning status 'scheduled' →
// 'publishing' before doing any external I/O. A crash or duplicated
// worker cannot double-post because the second attempt reads the same
// row and the update-with-eq('status','scheduled') no-ops.
//
// On failure the row is marked 'failed' with the last_error text so the
// UI can surface it. Manual retry: switch status back to 'scheduled' and
// the next tick picks it up.

import { supabase } from './storage.js';
import { publishSocialPostRow } from '../routes/calendar.js';

const TICK_MS = 60 * 1000;
const BATCH_LIMIT = 25;

async function claimAndPublish(row) {
  // Optimistic lock: only proceed if we're the one that flips the row
  // out of 'scheduled'. Any second worker or duplicate tick loses.
  const { data: claimed, error: claimErr } = await supabase
    .from('social_posts')
    .update({ status: 'publishing' })
    .eq('id', row.id)
    .eq('status', 'scheduled')
    .select()
    .single();

  if (claimErr || !claimed) return; // lost the race, skip

  try {
    await publishSocialPostRow(claimed.user_id, claimed);
    console.log(`[sched-posts] published ${claimed.id} (${claimed.platform})`);
  } catch (err) {
    console.error(`[sched-posts] failed ${claimed.id}:`, err.message);
    await supabase
      .from('social_posts')
      .update({
        status: 'failed',
        last_error: (err.message || 'Unknown error').slice(0, 500),
      })
      .eq('id', claimed.id);
  }
}

async function recoverStuckPublishing() {
  // A row stuck in 'publishing' for > 5 minutes almost certainly means
  // the worker died mid-flight. We mark it 'failed' rather than
  // retrying automatically — the request may have succeeded on
  // LinkedIn/BooSend's side and a blind retry would double-post. The
  // user gets the row back with a red banner and can re-schedule.
  const staleAgo = new Date(Date.now() - 5 * 60 * 1000).toISOString();
  await supabase
    .from('social_posts')
    .update({ status: 'failed', last_error: 'Publish worker crashed mid-flight. Verify the post did not publish before retrying.' })
    .eq('status', 'publishing')
    .lt('updated_at', staleAgo);
}

async function tick() {
  try {
    await recoverStuckPublishing().catch(() => {});
    const nowIso = new Date().toISOString();
    const { data, error } = await supabase
      .from('social_posts')
      .select('id')
      .eq('status', 'scheduled')
      .lte('scheduled_at', nowIso)
      .order('scheduled_at', { ascending: true })
      .limit(BATCH_LIMIT);

    if (error) {
      console.error('[sched-posts] tick query failed:', error.message);
      return;
    }
    if (!data?.length) return;

    // Serial rather than Promise.all — most posts hit rate-limited APIs
    // (LinkedIn, BooSend) and the batch is small enough that latency
    // isn't a concern. Spikes surface in logs before they starve the
    // interval, since each tick has its own 60s budget.
    for (const row of data) {
      // Fetch the full row inside the loop so we always claim against
      // fresh state (a user might have canceled between the list query
      // and the claim).
      const { data: full } = await supabase
        .from('social_posts')
        .select('*')
        .eq('id', row.id)
        .single();
      if (full) await claimAndPublish(full);
    }
  } catch (err) {
    console.error('[sched-posts] tick error:', err.message);
  }
}

export function startScheduledPostsDispatcher() {
  // First run after a short delay so the box has time to warm up.
  setTimeout(tick, 15000);
  setInterval(tick, TICK_MS);
  console.log(`[sched-posts] dispatcher started (every ${TICK_MS / 1000}s)`);
}
