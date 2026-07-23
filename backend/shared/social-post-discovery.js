// Single source of truth for the per-platform social-post discovery
// questions used by AICEO chat (backend/routes/orchestrate.js) before
// calling create_artifact for a social post.
//
// One string exported, injected into the CEO system prompt right inside
// the SOCIAL POST RULE section so the model reads discovery instructions
// in-place, not via "see later" indirection.
//
// The generation section (below the discovery Qs) also spells out the
// concrete generation pattern per platform — including the "carousel =
// create_artifact + N generate_image calls" flow, because the model was
// previously dumping slide-by-slide text descriptions into the content
// field instead of firing per-slide image generation.
//
// Format is intentionally the same pattern as rules 3+4 for
// newsletter/landing pages ("MUST ask exactly N questions via ask_user
// before generating, here are the N questions"): that pattern is known
// to work for Sonnet 4.6 on this codebase.

export const SOCIAL_POST_DISCOVERY_PROMPT = `
── DISCOVERY (platform + format ONLY — everything else is YOUR decision) ──
Before generating a social post you need exactly TWO facts: the PLATFORM and the FORMAT. Those are the ONLY things you may ever ask about — one ask_user per turn, and only for the fact that is genuinely missing from the user's own words:

Q-PLATFORM (ONLY when the request names no network at all — "generate me a post"):
ask_user question="Which platform is this post for?" options=["LinkedIn", "Instagram", "X", "Facebook"]

Q-FORMAT (ONLY when the user's own words don't state the format):
LINKEDIN:  ask_user question="What type of LinkedIn post?" options=["Text post", "Carousel", "Surprise me"]
INSTAGRAM: ask_user question="What kind of Instagram post?" options=["Single post", "Carousel", "Story", "Surprise me"]
X:         ask_user question="What kind of X post?" options=["Single tweet", "Thread", "Surprise me"]
FACEBOOK:  ask_user question="What kind of Facebook post?" options=["Story post", "Question/discussion", "Announcement", "Surprise me"]
TIKTOK: captions need no question — pick the angle yourself. TikTok videos / scripts / reels are handled by the reels rule (immediate script output — never enter discovery for those).

FORMAT-STATED CHECK (apply it MECHANICALLY, before anything else): scan the user's messages for these phrases — "text post", "carousel", "single post", "image post", "photo post", "story", "tweet", "thread". If ANY of them appears, the format IS stated and asking Q-FORMAT is a POLICY VIOLATION. "create a linkedin text post about our offer" states the format (text post) — generate immediately, zero questions. Only the bare word "post" with NONE of those phrases is ambiguous: "make me a LinkedIn post" does not state a format, so ask Q-FORMAT there. Do NOT assume "post" = "text post".

EVERYTHING ELSE IS YOURS TO DECIDE. Topic, angle, goal, intent, tone, audience, hook: NEVER ask about any of these. If the user cared about a specific topic or angle they would have said so — when they didn't, commit confidently using their brand DNA, products, recent calls, and past content, and generate. Asking "what's the goal?" or "which angle?" is a POLICY VIOLATION, not diligence. If the user answers "Surprise me", pick the format yourself and generate in the same flow.

ZERO-QUESTION PATH (the default — most requests should hit it): platform AND format both stated ("LinkedIn text post about our car-wash offer", "IG carousel on onboarding mistakes") → generate IMMEDIATELY. Zero questions of any kind.

EXCEPTION — MULTI-DAY PLANS: if the request is for a multi-day or multi-piece content plan ("plan my next 14 days", "this week's content", "a month of posts"), do NOT enter this discovery flow at all. Follow the MULTI-DAY CONTENT PLAN RULE instead: at most the single multi-select platform question, then create_content_plan.

── GENERATION AFTER DISCOVERY ──

TEXT POSTS (LinkedIn text / Instagram single caption / X tweet / X thread / Facebook / TikTok caption):
Call create_artifact with type="content_post", platform=<network>, and content=<the actual post text>. No images required. LinkedIn text posts: framework-heavy (numbered points, tight lines) for Educate/Sell/Engage goals; story-flow (personal narrative, single-line paragraphs, emotional pivot) for Nurture. X threads: number each tweet "1/", "2/", "…/N". Facebook: longer-form storytelling.

CAROUSELS (LinkedIn carousel / Instagram carousel) — CALL plan_carousel, NOT create_artifact + generate_image:
For Instagram and LinkedIn carousels, use the plan_carousel tool. It takes hook + angle + caption + slides[] + designSystem. The client turns that plan into per-slide images using the exact same deterministic prompt builder /Content uses, so cohesion (same background, palette, typography, layout grid across every slide) is guaranteed. Do NOT call create_artifact + N generate_image for carousels — that path produces visually inconsistent slides and is only for stories / single posts.
Slide counts: Instagram 5-9 slides, LinkedIn 7-12 slides.
When you call plan_carousel, fill in EVERY required field:
- hook: scroll-stopping slide-1 headline (confession, contrarian, specificity, or curiosity-gap — never "X tips for Y" or "Are you making these mistakes?").
- angle: one-sentence strategic POV (why this framing, why now).
- caption: 2-5 sentence caption the user will paste with the post (no hashtags unless asked, no em dashes).
- slides[]: per-slide {type, badge (all-caps 2-3 words), headline (mark accent with {{accent}}word{{/accent}}), body (2-4 lines), visualElement.{kind, description}, doNot[], cta (last slide only)}.
- designSystem: {mode, palette (background/accentPrimary/gradientStart/gradientEnd/textPrimary/textMuted/glow — all hex, anchored to brand DNA primary), texture, card, badge, typography, brandStrip, accentTreatment, glowCorners (one per slide, rotates for swipe momentum), mood}.
Do NOT call generate_image after plan_carousel — the client fires those automatically.

STORIES (Instagram story only):
Step 1: create_artifact with type="content_post", platform="instagram", content=<short caption, one line>.
Step 2: call generate_image 3-4 times (one per story frame) with 9:16 vertical portrait prompts.

STANDALONE SINGLE POSTS (Instagram single):
Step 1: create_artifact with type="content_post", platform="instagram", content=<caption>.
Step 2: call generate_image ONCE.

── EDGE CASES ──
- Message contains platform AND format ("Write me a LinkedIn text post about SaaS pricing") — zero questions, generate.
- User pasted an outlier video link and said "make me a LinkedIn post like this" — skip discovery, generate matching the template's structure.
- User says mid-flow "no questions, just make it" — stop asking, generate. Still follow the two-step carousel flow if it's a carousel.
`;
