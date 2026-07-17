// Shared Plan Mode directive — ONE source for every tab
// (docs/unification-robustness-audit.md §2 port plan, M6).
//
// The in-chat content-plan system (create_content_plan tool →
// ContentPlanMessage card → per-piece generation via
// POST /api/orchestrate/plan-item) is the canonical planning flow. The
// AI CEO uses this directive without a locked platform (it may ask the
// one multi-select platform question); the /Content tab passes
// lockedPlatform because its platform pill already decides the answer.
// Edit the planning behavior HERE and both tabs pick it up.
import { PLAN_PLATFORM_FORMATS } from '../content-plan-tool.js';

const PLATFORM_LABELS = { linkedin: 'LinkedIn', instagram: 'Instagram', x: 'X', youtube: 'YouTube' };

export function isPlanSupportedPlatform(platformId) {
  return !!PLAN_PLATFORM_FORMATS[String(platformId || '').toLowerCase()];
}

export function buildPlanModeDirective({ lockedPlatform = null } = {}) {
  const lockedId = lockedPlatform ? String(lockedPlatform.id || lockedPlatform).toLowerCase() : null;
  const lockedLabel = lockedId ? (PLATFORM_LABELS[lockedId] || lockedId) : null;

  const platformRule = lockedId
    ? `2. The platform is ALREADY DECIDED: the user is in the ${lockedLabel} tab, so platforms = ["${lockedId}"] and EVERY item's platform is "${lockedId}". NEVER ask which platforms to plan for, and NEVER include items for any other platform. Ask NO questions at all unless the request is genuinely incomprehensible.`
    : `2. ONE question maximum, and only this one. If (and ONLY if) the user's request does not name the platform(s), call ask_user with EXACTLY:
   question: "Which platforms should I plan for?"
   options: ["LinkedIn", "YouTube", "Instagram", "X", "All platforms"]
   multi_select: true
   If the request already names platform(s) (including "all platforms" / "everywhere"), skip the question and go straight to the plan. NEVER ask a second question.`;

  const formatsLine = lockedId
    ? `Formats for ${lockedLabel}: ${PLAN_PLATFORM_FORMATS[lockedId].join(' | ')}. Rotate — never more than 2 consecutive items with the same format. Hard-sell CTAs at most 1 in every 3 items.`
    : `Formats per platform: linkedin → text_post | single_image | carousel. instagram → single_image | carousel | reel_script. x → text_post | single_image. youtube → youtube_script. Rotate — never more than 2 consecutive items with the same format on the same platform. Hard-sell CTAs at most 1 in every 3 items.`;

  return `=== PLAN MODE IS ACTIVE (OVERRIDES EVERY TOOL INSTRUCTION BELOW) ===
The user wants a multi-day content plan. You already know their brand — Brand DNA, products, sales, calls, and integrated data are all in this prompt. Do NOT interrogate them.

━━━━ HARD RULES (non-negotiable) ━━━━
1. You have exactly TWO tools this turn: ask_user and create_content_plan. Every other tool is stripped. Do NOT call create_artifact, delegate_to_agent, generate_image, plan_carousel, or anything else.
${platformRule}
3. NEVER ask about timeframe, cadence, goal, topic, tone, or format mix. Infer them:
   - timeframe_days from the request ("next 14 days" → 14, "this week" → 7, "a month" → 30). Default 7 when unstated. Cap 31 — for longer requests plan the first 31 days and say so in your intro sentence.
   - One piece per day unless the user asked for a different cadence.
   - Topics and goals from Brand DNA, products, recent sales/calls, past content, soul notes. Specific to THIS user — never generic "productivity tips".
   - ${formatsLine}
4. Once platforms are known, IMMEDIATELY call create_content_plan. No confirmation question, no "sound good?", no recap.
5. Chat text alongside the tool call: ONE short sentence max ("Here's your 14-day plan."). NEVER retype the plan days as prose or markdown — the client renders the day-by-day list from the tool payload. Duplicating it in text is a bug.
6. Every item's hook is a verbatim scroll-stopping first line written in the user's voice. Every topic is anchored to their actual business.
7. After the plan lands, the client shows a "Generate content" button — the USER triggers generation from there. Do NOT generate pieces yourself, do NOT delegate, even if they said "and make them too". In that case say in your intro sentence they can hit "Generate content" under the plan.

If the message is unrelated to planning, respond briefly in chat like normal.

Everything below describes non-plan-mode behavior. Ignore anything that conflicts with the rules above until Plan Mode is turned off.

---

`;
}
