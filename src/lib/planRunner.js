// Shared content-plan batch runner (docs/unification-robustness-audit.md
// §2 port plan — one implementation for every tab).
//
// The plan feature has exactly ONE generation pipeline: the backend
// POST /api/orchestrate/plan-item writes each piece (LinkedIn text posts
// via the shared two-phase writer), and images/slides run through the
// same unified endpoints as the interactive flows (/api/generate/image,
// /api/generate/carousel). This module owns the sequential run loop and
// its state machine; each tab injects only how a finished piece becomes
// one of ITS chat messages (materializePiece) — AI CEO makes an artifact
// chip, /Content makes an inline preview message. Fix the loop here and
// every tab gets the fix.
//
// itemStates entries: { status: 'pending'|'running'|'done'|'failed',
//                       msgId?, imageFailed?, error?, progress? }
// token: { cancelled: bool, creditsDepleted?: bool } — cooperative;
//        checked between items (and by materializePiece between slides).

export function serializeContentPlan(plan) {
  if (!plan?.items?.length) return '';
  const head = `[CONTENT PLAN — ${plan.title || 'Content plan'} | ${(plan.platforms || []).join(', ') || 'multi-platform'} | ${plan.items.length} pieces]`;
  const rows = plan.items.map((it, i) => {
    const status = plan.itemStates?.[i]?.status || 'pending';
    const bits = [`Day ${it.day} — ${it.platform} ${it.format}: ${it.topic}`];
    if (it.hook) bits.push(`hook: "${it.hook}"`);
    if (it.cta) bits.push(`cta: ${it.cta}`);
    bits.push(`status: ${status}`);
    return bits.join(' | ');
  });
  return [head, ...rows].join('\n');
}

export const PLAN_FORMAT_LABELS = {
  text_post: 'text post',
  single_image: 'image post',
  carousel: 'carousel',
  reel_script: 'reel script',
  youtube_script: 'YouTube script',
};
export const PLAN_PLATFORM_LABELS = { linkedin: 'LinkedIn', instagram: 'Instagram', x: 'X', youtube: 'YouTube' };

// Chat-bubble label for one generated plan piece.
export function planPieceLabel(item, imageFailed) {
  const plat = PLAN_PLATFORM_LABELS[item.platform] || item.platform;
  const fmt = PLAN_FORMAT_LABELS[item.format] || item.format;
  const what = item.format === 'youtube_script' ? 'YouTube script' : `${plat} ${fmt}`;
  const base = `Day ${item.day} — ${what}: ${item.topic}`;
  return imageFailed
    ? `${base}\n\n(One or more images failed to generate — open the piece to regenerate them.)`
    : base;
}

// The core sequential loop. Never parallel: one piece at a time, state
// written back through updatePlan after every transition. HTTP 402 from
// the plan-item route pauses the run resumably (item back to pending,
// token.creditsDepleted for the caller's paywall); other errors mark the
// item failed and the run continues.
export async function runPlanItems({
  items,
  itemStates,
  token,
  updatePlan,       // (patch) => void — persists runState/itemStates into the plan message
  isRunValid,       // () => bool — false when the session switched mid-run
  generateItem,     // async (item, itemStates) => plan-item response
  materializePiece, // async ({ item, index, resp }) => { pieceMsgId, imageFailed }
}) {
  for (let i = 0; i < items.length; i++) {
    if (token.cancelled || !isRunValid()) break;
    if (itemStates[i].status !== 'pending') continue;
    const item = items[i];

    itemStates[i] = { status: 'running' };
    updatePlan({});

    try {
      const resp = await generateItem(item, itemStates);
      const { pieceMsgId, imageFailed } = await materializePiece({ item, index: i, resp });
      itemStates[i] = { status: 'done', msgId: pieceMsgId, ...(imageFailed ? { imageFailed: true } : {}) };
      updatePlan({});
    } catch (err) {
      const msg = String(err?.message || err);
      if (msg.startsWith('HTTP 402')) {
        // Credits ran out — pause resumably instead of failing items.
        console.warn('[planRunner] run paused — credits depleted');
        itemStates[i] = { status: 'pending' };
        token.cancelled = true;
        token.creditsDepleted = true;
      } else {
        console.error(`[planRunner] item ${i + 1} failed:`, msg);
        itemStates[i] = { status: 'failed', error: msg.slice(0, 200) };
      }
      updatePlan({});
    }
  }
}
