// BooSend integration — stores API key for DM automation
// BooSend doesn't have a public validation endpoint, so we just store the key

import { syncInstagramContentProfile } from '../content-profile.js';

export async function validate(apiKey) {
  if (!apiKey || apiKey.trim().length < 10) {
    throw new Error('Invalid BooSend API key');
  }
  return { ok: true };
}

// On connect (and manual re-sync) pull the user's recent Instagram media
// through the BooSend API and cache the "how this user actually posts"
// profile — so the AI already knows their formats/cadence/topics without
// asking (founder ask 2026-07-25).
export async function sync(integration) {
  try {
    const result = await syncInstagramContentProfile(integration.user_id);
    return { synced: result?.synced || 0, total: result?.synced || 0 };
  } catch (err) {
    console.warn(`[boosend] content-profile sync failed: ${err.message}`);
    return { synced: 0, total: 0 };
  }
}
