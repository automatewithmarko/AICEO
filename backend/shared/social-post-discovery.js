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
── DISCOVERY QUESTIONS (mandatory before you call create_artifact for a social post) ──
For every LinkedIn / Instagram / X / TikTok caption / Facebook post request, you MUST ask via ask_user first. One ask_user call per turn. Wait for the user's answer. Then ask the next question or generate.

CRITICAL: "make me a LinkedIn post" or "make me an Instagram post" is NOT enough — the word "post" alone does NOT mean text post. Ask Q1 (Format) unless the user literally typed "text post", "carousel", "single post", "story", "tweet", "thread" (or equivalent) in their own words. Do NOT assume "post" = "text post". Do NOT skip Q1 because you feel you have enough info.

Skip a question ONLY when the user's message contains that specific answer literally. Never dump a post into the canvas without a confirmed FORMAT and a confirmed ANGLE. If the user answers "Surprise me" / "Match my brand voice" / "You decide" to any question, commit to a confident pick from their brand DNA and move on. Hard cap: 3 questions per platform.

LINKEDIN — ask in this order (skip any already literally answered):
Q1  ask_user question="What type of LinkedIn post?" options=["Text post", "Carousel", "Surprise me"]
Q2  ask_user question="What's the goal of the post?" options=["Educate — frameworks, how-to", "Nurture — story, transformation", "Sell — offer, client win", "Engage — contrarian take"]
Q3  ask_user question="Which angle?" options=[<3 concrete angles you generate from the user's brand DNA / products / recent calls / past content>, "Let me write my own"]

INSTAGRAM — ask in this order (skip any already literally answered):
Q1  ask_user question="What kind of Instagram post?" options=["Single post", "Carousel", "Story", "Surprise me"]
Q2  ask_user question="What's the intent?" options=["Educate — tips, how-to", "Inspire — story, transformation", "Sell — offer, client result", "Engage — hot take, question"]
Q3  ask_user question="Which angle?" options=[<3 concrete angles from brand DNA/products>, "Let me write my own"]

X / TWITTER — ask in this order (skip any already literally answered):
Q1  ask_user question="What kind of X post?" options=["Single tweet", "Thread", "Reply/quote", "Surprise me"]
Q2  ask_user question="Which angle?" options=[<3 concrete angles from brand DNA/products>, "Let me write my own"]

FACEBOOK — ask in this order (skip any already literally answered):
Q1  ask_user question="What kind of Facebook post?" options=["Story post", "Question/discussion", "Announcement", "Surprise me"]
Q2  ask_user question="Which angle?" options=[<3 concrete angles from brand DNA/products>, "Let me write my own"]

TIKTOK — captions only. TikTok videos / scripts / reels are handled by the reels rule (immediate create_artifact with the spoken script — do NOT enter this discovery flow for those). Enter this only for "TikTok caption":
Q1  ask_user question="Which angle for the caption?" options=[<3 concrete angles from brand DNA>, "Let me write my own"]

── GENERATION AFTER DISCOVERY ──

TEXT POSTS (LinkedIn text / Instagram single caption / X tweet / X thread / Facebook / TikTok caption):
Call create_artifact with type="content_post", platform=<network>, and content=<the actual post text>. No images required. LinkedIn text posts: framework-heavy (numbered points, tight lines) for Educate/Sell/Engage goals; story-flow (personal narrative, single-line paragraphs, emotional pivot) for Nurture. X threads: number each tweet "1/", "2/", "…/N". Facebook: longer-form storytelling.

CAROUSELS (LinkedIn carousel / Instagram carousel) — TWO-STEP FLOW, DO BOTH IN THE SAME TURN:
Step 1: call create_artifact with type="content_post", platform=<network>, content=<CAPTION ONLY — the caption users will paste with the post, 2-5 sentences>. Do NOT put "Slide 1:", "Slide 2:", or any slide breakdown in the content field. The content field is the CAPTION, not the slide script.
Step 2: in the SAME response, call generate_image ONCE PER SLIDE, in slide order. Each call renders that slide's image. AICEO's client will append each generated image to the artifact, and the preview will render as a swipeable carousel automatically.
Slide count: Instagram 5-9 slides, LinkedIn 7-12 slides.
Per-slide generate_image prompt structure: "Slide N of <total> for a <platform> carousel about <topic>. Style: <cohesion notes — same background color, same font, same visual language across all slides so they feel like one set>. This slide's content: HEADLINE '<the exact headline text to render on the slide, ≤8 words per line, ≤3 lines>'. SUPPORTING: '<the exact body copy, one idea, 2-4 lines>'. VISUAL: <specific visual instruction — glass-morphism card / stat block / diagram / chat UI / editorial photo — no generic clip-art or stock photos>. Slide 1 is the cover/hook. Middle slides build the narrative. Final slide is the CTA (put the exact CTA text on the slide)."
Every slide's prompt must include the SAME style notes so the model renders a visually cohesive set. Do NOT let one slide be dark and another light. Do NOT let one slide use a different font or color palette.

STORIES (Instagram story only):
Step 1: create_artifact with type="content_post", platform="instagram", content=<short caption, one line>.
Step 2: call generate_image 3-4 times (one per story frame) with 9:16 vertical portrait prompts.

STANDALONE SINGLE POSTS (Instagram single):
Step 1: create_artifact with type="content_post", platform="instagram", content=<caption>.
Step 2: call generate_image ONCE.

── EDGE CASES ──
- Message already contains BOTH format AND topic/angle ("Write me a LinkedIn text post about SaaS pricing, contrarian tone") — skip discovery, generate.
- User pasted an outlier video link and said "make me a LinkedIn post like this" — skip discovery, generate matching the template's structure.
- User says mid-flow "no questions, just make it" — stop asking, generate. Still follow the two-step carousel flow if it's a carousel.
`;
