// Fire-and-forget ledger writes for the generated_content table
// (migrations/add_generated_content.sql). Called from every generation
// site; never throws, never blocks the response path.
import { supabase } from './storage.js';

const PLATFORM_ALIASES = {
  linkedin_carousel: 'linkedin',
  instagram_story: 'instagram',
  landing_page: 'general',
  landing_page_sq: 'general',
  newsletter: 'general',
};

// One vocabulary for content_type everywhere (read-side normalizer lives
// in routes/dashboard.js for legacy rows; this keeps NEW rows clean).
export function normalizeContentType(t) {
  const v = String(t || '').toLowerCase();
  if (['text', 'text_post', 'post_text'].includes(v)) return 'text_post';
  if (['image', 'image_post', 'single_image', 'post', 'photo'].includes(v)) return 'image_post';
  if (v === 'carousel') return 'carousel';
  if (['story', 'stories', 'story_sequence'].includes(v)) return 'story';
  if (['reel', 'reel_script', 'video', 'short'].includes(v)) return 'reel';
  if (['script', 'youtube_script'].includes(v)) return 'script';
  if (['landing_page', 'squeeze_page'].includes(v)) return 'landing_page';
  if (v === 'newsletter') return 'newsletter';
  return v || 'other';
}

export function logGeneratedContent({ userId, platform, contentType, source = null, sessionId = null }) {
  if (!userId || userId === 'anonymous') return;
  const p = String(platform || 'general').toLowerCase();
  const row = {
    user_id: userId,
    platform: PLATFORM_ALIASES[p] || p,
    content_type: normalizeContentType(contentType),
    source,
    session_id: sessionId ? String(sessionId) : null,
  };
  supabase.from('generated_content').insert(row).then(({ error }) => {
    if (error) console.warn(`[generated-content] insert failed (${row.platform}/${row.content_type}): ${error.message}`);
  });
}
