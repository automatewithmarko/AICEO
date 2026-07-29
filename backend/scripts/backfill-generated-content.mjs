// One-time backfill of the generated_content ledger from historical
// session JSONB + artifact versions (founder, 2026-07-28: a week of test
// generations predates the ledger — the dashboard showed 1-3 pieces).
// Run from backend/: node scripts/backfill-generated-content.mjs
// Idempotent: aborts if any backfill rows already exist.
import 'dotenv/config';
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY);

const rows = [];
const tsFromId = (id, fallback) => {
  const m = String(id || '').match(/(1[67]\d{11})/); // 13-digit epoch
  return m ? new Date(Number(m[1])).toISOString() : fallback;
};
const push = (userId, platform, type, source, sessionId, createdAt) => {
  if (!userId) return;
  rows.push({
    user_id: userId,
    platform: String(platform || 'general').toLowerCase(),
    content_type: type,
    source,
    session_id: sessionId ? String(sessionId) : null,
    created_at: createdAt || new Date().toISOString(),
  });
};


// Session messages are heavy JSONB — page reads to dodge statement timeouts.
async function pageAll(table, cols, pageSize = 15) {
  const out = [];
  for (let fromIdx = 0; ; fromIdx += pageSize) {
    const { data, error } = await supabase.from(table).select(cols)
      .order('created_at', { ascending: true })
      .range(fromIdx, fromIdx + pageSize - 1);
    if (error) throw new Error(`${table} page ${fromIdx}: ${error.message}`);
    out.push(...(data || []));
    if (!data || data.length < pageSize) break;
  }
  return out;
}

const { count: existing } = await supabase
  .from('generated_content').select('id', { count: 'exact', head: true })
  .like('source', 'backfill%');
if (existing > 0) {
  console.log(`Backfill rows already present (${existing}) — aborting to stay idempotent.`);
  process.exit(0);
}

// ── 1. /Content sessions ──
{
  const data = await pageAll('content_sessions', 'id, user_id, platform, messages, updated_at, created_at');
  for (const s of data) {
    const fallback = s.updated_at || s.created_at;
    for (const m of (Array.isArray(s.messages) ? s.messages : [])) {
      if (m?.role !== 'assistant') continue;
      const ts = tsFromId(m.id, fallback);
      const plat = m.platform || s.platform || 'instagram';
      if (m.carouselPlan?.approved) push(s.user_id, plat, 'carousel', 'backfill:content', s.id, ts);
      else if (m.scriptDoc?.content) push(s.user_id, plat, plat === 'youtube' ? 'script' : 'reel', 'backfill:content', s.id, ts);
      else if (Array.isArray(m.images) && m.images.length >= 3 && plat === 'instagram') push(s.user_id, plat, 'story', 'backfill:content', s.id, ts);
      else if (m.socialPost?.caption && Array.isArray(m.images) && m.images.length) push(s.user_id, plat, 'image_post', 'backfill:content', s.id, ts);
      else if (m.socialPost?.caption) push(s.user_id, plat, 'text_post', 'backfill:content', s.id, ts);
      else if (Array.isArray(m.images) && m.images.length) push(s.user_id, plat, 'image_post', 'backfill:content', s.id, ts);
    }
  }
}

// ── 2. AI CEO sessions ──
{
  const data = await pageAll('ceo_sessions', 'id, user_id, messages, updated_at, created_at');
  for (const s of data) {
    const fallback = s.updated_at || s.created_at;
    for (const m of (Array.isArray(s.messages) ? s.messages : [])) {
      if (m?.role !== 'assistant') continue;
      const ts = tsFromId(m.id, fallback);
      if (m.carouselPlan?.approved) {
        push(s.user_id, m.carouselPlatform || m.platform || 'linkedin', 'carousel', 'backfill:ceo', s.id, ts);
      } else if (m.hasArtifact && m.artifactType === 'content_post') {
        push(s.user_id, m.platform || 'linkedin', 'text_post', 'backfill:ceo', s.id, ts);
      } else if (m.hasArtifact && m.artifactType === 'story_sequence') {
        push(s.user_id, 'instagram', 'story', 'backfill:ceo', s.id, ts);
      } else if (m.hasArtifact && m.artifactType === 'image') {
        push(s.user_id, m.platform || 'general', 'image_post', 'backfill:ceo', s.id, ts);
      }
    }
  }
}

// Sections 3 (marketing stories) + 4 (artifact v1s) run as set-based
// SQL server-side — their tables are too heavy for client paging.

console.log(`Prepared ${rows.length} ledger rows. Inserting in batches of 500…`);
for (let i = 0; i < rows.length; i += 500) {
  const { error } = await supabase.from('generated_content').insert(rows.slice(i, i + 500));
  if (error) { console.error('Insert failed at batch', i, error.message); process.exit(1); }
}
const byType = {};
for (const r of rows) byType[r.content_type] = (byType[r.content_type] || 0) + 1;
console.log('Done. By type:', JSON.stringify(byType));
