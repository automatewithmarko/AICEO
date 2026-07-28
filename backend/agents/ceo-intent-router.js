// Deterministic prompt-module router for the AI CEO chat — the CEO twin
// of backend/agents/content/intent-router.js (same philosophy, broader
// surface).
//
// WHY (founder, 2026-07-25): buildCeoSystemPrompt shipped EVERYTHING on
// EVERY message — 13.5K chars of video-script guides, a 12K landing-page
// interview flow, form-embedding rules, the full contact list, plus a
// ~20K LinkedIn addendum appended unconditionally. ~77K chars (~19K
// tokens) to answer "hello", measured live. The size is latency AND the
// reason behavior rules get ignored: they drown.
//
// Pure regex over the recent conversation window — no extra model call,
// zero added latency. Detection is deliberately generous: a module
// loading unnecessarily costs a little prompt size; a missing module
// costs output quality. A generation verb with NO recognizable subject
// loads everything (the old behavior) so vague asks can never regress.

const VIDEO_RE = /\breels?\b|\bvideos?\b|\bshorts?\b|\bscripts?\b|\btik\s?toks?\b|\bvlogs?\b|\byoutube\b|\btalking\s*head/i;
const SOCIAL_RE = /\bposts?\b|\bcarousels?\b|\bslides?\b|\bstor(?:y|ies)\b|\bcaptions?\b|\bcontent\b|\binstagram\b|\big\b|\blinked\s?in\b|\btweets?\b|\bx\s+post|\bfacebook\b|\bthumbnails?\b|\bimages?\b|\bphotos?\b|\bgraphics?\b|\bvisuals?\b/i;
const LINKEDIN_RE = /\blinked\s?in\b|\bli\s+(?:post|carousel|text)/i;
const MARKETING_RE = /\bnewsletters?\b|\blanding\s*pages?\b|\bsqueeze\s*pages?\b|\blead\s*magnets?\b|\bdm\s*automations?\b|\bfunnels?\b|\bopt[-\s]?in\b|\bsales\s*pages?\b|\bwebsite\b|\bweb\s*page\b|\bforms?\b/i;
const EMAIL_RE = /\bemails?\b|\binbox\b|\bnewsletters?\b|\bsend\b.{0,30}\bmail|\bmail\b|\bcontacts?\b|\bdrafts?\b/i;
const PLAN_RE = /\bplans?\b|\bcalendar\b|\bnext\s+(?:week|month|\d+\s+days?)\b|\b(?:week|month)\s+of\s+(?:posts|content)\b|\bschedule\s+out\b/i;
// No bare "do"/"help" — conversational questions must not trip the
// everything-on fallback.
const GEN_VERB_RE = /\b(?:make|create|generate|write|draft|design|produce|craft|build|give\s+me|need|want|whip|launch|set\s*up)\b/i;

function textOf(content) {
  if (typeof content === 'string') return content;
  if (Array.isArray(content)) {
    return content.map((c) => (typeof c === 'string' ? c : c?.text || '')).join(' ');
  }
  return String(content ?? '');
}

// Returns { video, social, linkedin, marketingAsset, email, plan, anyGen }.
export function detectCeoModules({ messages = [], context = {} } = {}) {
  // Last 6 messages; assistant turns count (accepting an offer like
  // "want me to draft the reel?" with "yes" must load the video module).
  // ask_user questions are delivered via tool calls on this surface, so
  // there's no JSON-question noise to filter here.
  const windowText = (messages || [])
    .slice(-6)
    .map((m) => textOf(m?.content))
    .join('\n');

  let video = VIDEO_RE.test(windowText);
  let social = SOCIAL_RE.test(windowText);
  let linkedin = LINKEDIN_RE.test(windowText);
  let marketingAsset = MARKETING_RE.test(windowText);
  let email = EMAIL_RE.test(windowText);
  let plan = PLAN_RE.test(windowText);

  // State signals:
  // - saved reference videos with transcripts → the user's asks tend to
  //   be "make content like this" → video + social;
  // - an active campaign brief means a marketing-asset flow is underway.
  const refs = context?.contentItems || [];
  if (refs.some((i) => i?.type === 'social' && i?.transcript)) { video = true; social = true; }
  if (context?.activeBrief) marketingAsset = true;

  const anySignal = video || social || linkedin || marketingAsset || email || plan;
  if (!anySignal && GEN_VERB_RE.test(windowText)) {
    // Vague generation ask — everything on (old behavior, safety net).
    video = social = linkedin = marketingAsset = email = plan = true;
  }
  if (linkedin) social = true;

  return {
    video,
    social,
    linkedin,
    marketingAsset,
    email,
    plan,
    anyGen: video || social || linkedin || marketingAsset || email || plan,
  };
}

export const ALL_CEO_MODULES = Object.freeze({
  video: true, social: true, linkedin: true, marketingAsset: true, email: true, plan: true, anyGen: true,
});
