// Single source of truth for the per-platform social-post discovery
// questions used by AICEO chat (backend/routes/orchestrate.js) before
// calling create_artifact for a social post.
//
// One string exported, injected into the CEO system prompt right inside
// the SOCIAL POST RULE section so the model reads discovery instructions
// in-place, not via "see later" indirection.
//
// Format is intentionally the same pattern as rules 3+4 for
// newsletter/landing pages ("MUST ask exactly N questions via ask_user
// before generating, here are the N questions"): that pattern is known
// to work for Sonnet 4.6 on this codebase.
//
// Content.jsx has its own copy of these questions today (client-side XAI
// JSON, different response mechanism). When /Content migrates to
// /api/orchestrate (Unification_test branch), it can drop that copy and
// consume this file too.

export const SOCIAL_POST_DISCOVERY_PROMPT = `
── DISCOVERY QUESTIONS (mandatory before you call create_artifact for a social post) ──
For every LinkedIn / Instagram / X / TikTok caption / Facebook post request, you MUST ask via ask_user first. One ask_user call per turn. Wait for the user's answer. Then ask the next question or generate.

Skip a question only when the user's original message already contains that specific answer. Never dump a post into the canvas without at least a confirmed FORMAT and a confirmed ANGLE. If the user answers "Surprise me" / "Match my brand voice" / "You decide" to any question, commit to a confident pick from their brand DNA and move on. Hard cap: 3 questions per platform.

LINKEDIN — ask exactly these, in this order (skip any already answered):
Q1  ask_user question="What type of LinkedIn post?" options=["Text post", "Carousel", "Surprise me"]
Q2  ask_user question="What's the goal of the post?" options=["Educate — frameworks, how-to", "Nurture — story, transformation", "Sell — offer, client win", "Engage — contrarian take"]
Q3  ask_user question="Which angle?" options=[<3 concrete angles you generate from the user's brand DNA / products / recent calls / past content>, "Let me write my own"]

INSTAGRAM — ask exactly these, in this order (skip any already answered):
Q1  ask_user question="What kind of Instagram post?" options=["Single post", "Carousel", "Story", "Surprise me"]
Q2  ask_user question="What's the intent?" options=["Educate — tips, how-to", "Inspire — story, transformation", "Sell — offer, client result", "Engage — hot take, question"]
Q3  ask_user question="Which angle?" options=[<3 concrete angles from brand DNA/products>, "Let me write my own"]

X / TWITTER — ask exactly these, in this order (skip any already answered):
Q1  ask_user question="What kind of X post?" options=["Single tweet", "Thread", "Reply/quote", "Surprise me"]
Q2  ask_user question="Which angle?" options=[<3 concrete angles from brand DNA/products>, "Let me write my own"]

FACEBOOK — ask exactly these, in this order (skip any already answered):
Q1  ask_user question="What kind of Facebook post?" options=["Story post", "Question/discussion", "Announcement", "Surprise me"]
Q2  ask_user question="Which angle?" options=[<3 concrete angles from brand DNA/products>, "Let me write my own"]

TIKTOK — this section is for CAPTIONS on an existing video only. TikTok videos / scripts / reels are handled by the reels rule (immediate create_artifact with the spoken script — do NOT enter this discovery flow for those). Enter this only when the user explicitly asks for a "TikTok caption":
Q1  ask_user question="Which angle for the caption?" options=[<3 concrete angles from brand DNA>, "Let me write my own"]

AFTER DISCOVERY IS COMPLETE — call create_artifact with type="content_post" and platform=<network>. The content field is plain post text with normal line breaks, no HTML, no markdown fences. LinkedIn text posts: pick framework-heavy structure (numbered points, tight lines) for Educate/Sell/Engage goals, or story-flow (personal narrative, single-line paragraphs, emotional pivot) for Nurture. Carousels (LinkedIn / Instagram): content field = caption + slide breakdown "Slide 1: ...\\nSlide 2: ..." — cover slide is the hook, middle slides build, last slide is CTA.

EDGE CASES — skip discovery entirely when:
- The user's original message already contains BOTH format AND a specific topic/angle ("Write me a LinkedIn text post about SaaS pricing, contrarian tone").
- The user pasted an outlier video link and said "make me a LinkedIn post like this" — they picked the template, generate matching its structure.
- The user says mid-flow "no questions, just make it" — stop asking, generate.
`;
