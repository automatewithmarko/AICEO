// Single source of truth for the per-platform social-post discovery flow.
//
// Currently consumed by backend/routes/orchestrate.js (AI CEO chat) so
// the CEO asks the same LinkedIn / Instagram / X / Facebook questions
// the /Content tab asks before generating.
//
// Future consumers (Content.jsx, the /Content backend agents in
// Unification_test, /Marketing) can import this same string so no
// question gets asked twice with different options across tabs.
//
// Format: a plain string appended to the calling agent's system prompt.
// Rules the string references (turn-taking, hard cap, "Surprise me"
// handling) are stated inline so this file drops in anywhere without
// depending on rules defined elsewhere.

export const SOCIAL_POST_DISCOVERY_PROMPT = `
=== SOCIAL POST DISCOVERY FLOW (mandatory before generating any social post) ===

When the user asks for a social post ("LinkedIn post", "Instagram post", "tweet", "Facebook post", "TikTok caption"), run this discovery via ask_user BEFORE producing the post. This is the same flow the /Content tab runs — do not skip it, do not shortcut it, and do not restate the questions in text.

TURN-TAKING (READ TWICE, FAILURE BREAKS THE UI):
- ONE ask_user call per turn. Then STOP and wait for the user's answer.
- Never chain two ask_user calls in one response. Never ask a question in plain text.
- Never call create_artifact in the same turn as ask_user.

CAPS AND SHORTCUTS:
- Hard cap: 3 questions max. If after 3 the ask still feels vague, commit to a confident pick and generate.
- Skip a question when the user's message already answers it (e.g. "Write me a LinkedIn text post about SaaS pricing, contrarian tone" — Q1 answered, Q2 answered, jump straight to angle or generate).
- If the user answers "Surprise me" / "Match my brand voice" / "You decide", commit to a default from their brand DNA and move on.
- Outlier-template requests ("make me a LinkedIn post like this outlier video I attached") skip discovery entirely — generate from the template.
- User says "no questions, just make it" mid-flow → stop asking, generate.

── LINKEDIN — ask in this order:
Q1  ask_user "What type of LinkedIn post?" options=["Text post", "Carousel", "Surprise me"]
Q2  ask_user "What's the goal?" options=["Educate — frameworks, how-to", "Nurture — story, transformation", "Sell — offer, client win", "Engage — contrarian take"]
Q3  ask_user "Which angle?" options=[<3 concrete angles you generate from the user's brand DNA / products / recent calls / past content>, "Let me write my own"]
Then generate: create_artifact type="content_post" platform="linkedin" content=<post text>. Educate/Sell/Engage → framework-heavy structure (numbered points, tight lines, one clear takeaway per beat). Nurture → story-flow (personal narrative, single-line paragraphs, emotional pivot). For carousels: content = caption + slide breakdown "Slide 1: ...\\nSlide 2: ..." — cover slide = hook, middle slides = the framework, last slide = CTA.

── INSTAGRAM — ask in this order:
Q1  ask_user "What kind of Instagram post?" options=["Single post", "Carousel", "Story", "Surprise me"]
Q2  ask_user "What's the intent?" options=["Educate — tips, how-to", "Inspire — story, transformation", "Sell — offer, client result", "Engage — hot take, question"]
Q3  ask_user "Which angle?" options=[<3 concrete angles from brand DNA/products>, "Let me write my own"]
Then generate: create_artifact type="content_post" platform="instagram" content=<caption or caption + slide breakdown>. Captions: strong first line (that's the hook before the "…more" cutoff), casual voice, short paragraphs, no hashtags unless asked. Carousels: cover slide = hook, following slides build the story, last slide = CTA — every slide reads as part of the same visual set.

── X / TWITTER — ask in this order:
Q1  ask_user "What kind of X post?" options=["Single tweet", "Thread", "Reply/quote", "Surprise me"]
Q2  ask_user "Which angle?" options=[<3 concrete angles from brand DNA/products>, "Let me write my own"]
Then generate: create_artifact type="content_post" platform="twitter" content=<tweet or thread>. Threads: number every tweet "1/", "2/", "…/N". Keep each under 280 chars.

── FACEBOOK — ask in this order:
Q1  ask_user "What kind of Facebook post?" options=["Story post", "Question/discussion", "Announcement", "Surprise me"]
Q2  ask_user "Which angle?" options=[<3 concrete angles from brand DNA/products>, "Let me write my own"]
Then generate: create_artifact type="content_post" platform="facebook" content=<post text>. Facebook rewards longer-form storytelling and genuine discussion prompts.

── TIKTOK — captions only. Video/reel scripts are handled by rule 71 (immediate create_artifact with the spoken script — no discovery). Only enter this flow when the user explicitly asks for a "TikTok caption" for an existing video:
Q1  ask_user "Which angle for the caption?" options=[<3 angles from brand DNA>, "Let me write my own"]
Then generate: create_artifact type="content_post" platform="tiktok" content=<caption>.
`;
