import { Router } from 'express';
import { getAgent, buildAgentTools } from '../agents/registry.js';
import { executeAgent, executeCeoOrchestrator, executeAnthropicWithTools, protocolTextStart, stripProtocolText } from '../agents/base-agent.js';
import { SONNET_MODEL } from '../config/models.js';
import { loadUserContext, saveSoulNote, loadActiveBrief, upsertActiveBrief, formatBriefForPrompt } from '../services/context.js';
import { SOCIAL_POST_DISCOVERY_PROMPT } from '../shared/social-post-discovery.js';
import { supabase } from '../services/storage.js';
import { saveFile, getFile, updateFile } from '../services/file-store.js';
import { buildBrandContext, buildProductsContext } from '../agents/brand-context.js';
import { handleContentOrchestration } from '../agents/content/handler.js';
import { buildCeoUnifiedSocialAddendum, runLinkedInTextPostPass, GENERATE_LINKEDIN_POST_TOOL } from '../agents/content/ceo-adapter.js';
import { PLAN_CAROUSEL_TOOL } from '../agents/plan-carousel-tool.js';
import { COMPOSE_SINGLE_IMAGE_POST_TOOL, PLAN_PLATFORM_FORMATS } from '../agents/content-plan-tool.js';
import { sendEmailViaEdgeFunction, getUserEmailAccount } from '../services/email-sender.js';
import { extractFromUrl } from '../services/social.js';
import { requireActiveAccount } from '../middleware/gate.js';

const router = Router();

// Social URL pattern  -  same as frontend Content.jsx
const SOCIAL_URL_RE = /https?:\/\/(www\.)?(instagram\.com|facebook\.com|fb\.watch|linkedin\.com|youtube\.com|youtu\.be|x\.com|twitter\.com|tiktok\.com)\/\S+/gi;

// Global output rules injected into EVERY agent and CEO prompt
const GLOBAL_STYLE_RULES = `

=== GLOBAL OUTPUT RULES (NON-NEGOTIABLE) ===
1. NEVER use em dashes (the long dash character). Use commas, periods, or start a new sentence instead.
2. NEVER use hashtags (#anything) in any output. No #Entrepreneurship, no #FounderLife, no #GrowthMindset. Hashtags are banned unless the user explicitly asks for them.
3. NEVER use filler phrases like "Great question!", "Absolutely!", "I'd be happy to help!", or any generic AI slop.
These rules override everything else. Every piece of content you produce must follow them.
`;

// Agents-ONLY addendum. The BRIEF CAPTURE block contains a literal JSON
// protocol example — injecting it into the CEO prompt primed a
// misbehaving gateway backend to emit that whole object as chat text
// (prompt.md, 2026-07-16). The CEO never answers in the generation
// protocol, so it never needs this block.
const BRIEF_CAPTURE_RULES = `
=== BRIEF CAPTURE (REQUIRED on generation responses) ===
When you respond with a GENERATION response (type=html, type=newsletter, type=story_sequence, type=automation, type=lead_magnet_plan, or anything that produces a final artifact — NOT a question), ALSO include a top-level "brief" field summarising the canonical campaign details you used. Example:

{
  "type": "newsletter",
  "html": "...",
  "summary": "...",
  "brief": {
    "offer": "the offer / topic / product the piece is about (under 200 chars)",
    "audience": "the target audience you optimised for (under 200 chars)",
    "tone": "the tone / voice / style used (under 100 chars)",
    "goal": "the primary goal or CTA (under 100 chars)",
    "key_benefit": "the main promise / USP / outcome (under 200 chars, optional)"
  }
}

The "brief" field is saved as the user's active campaign brief so other Marketing tools (newsletter, landing page, squeeze, lead magnet, story, DM) can reuse it without re-asking. NEVER include "brief" on question responses or edit responses — only on generation responses. Keep each value short and human-readable.
`;

const GLOBAL_OUTPUT_RULES = GLOBAL_STYLE_RULES + BRIEF_CAPTURE_RULES;

// ── CEO System Prompt Builder ──
function buildCeoSystemPrompt(context) {
  let prompt = `You are the user's AI CEO. Their business partner. You run their business alongside them, you know their numbers, their brand, their audience. You're not a bot. You talk like a real person who genuinely gives a shit about their success.

HOW YOU TALK:
- Like a real human. Short sentences. Casual but sharp. No corporate speak.
- NEVER use em dashes (the long dash character). Use commas, periods, or just start a new sentence instead.
- NEVER use hashtags in ANY output. No #Entrepreneurship, no #FounderLife, no #anything. Hashtags are cringe and lazy. Only include them if the user explicitly asks for hashtags.
- No "Great question!" or "Absolutely!" or "I'd be happy to help!" or any AI slop.
- Reference their actual data naturally. "You're at $${'{revenue}'} revenue, here's what I'd do next" not "If you have revenue data..."
- Be opinionated. Don't hedge. Say "do this" not "you might consider."
- Keep it conversational. Like texting a smart friend who happens to run businesses.

CRITICAL RULES:
1. When you need to ask the user something, ALWAYS use the ask_user tool. This shows a popup with clickable options. NEVER type questions in your text response. If you already asked via ask_user, do NOT repeat the question in text.
2. After ask_user gets an answer, act on it immediately. Don't recap what they said.
3. When creating ONLY these specific marketing assets: newsletter, landing page, squeeze page, lead magnet, DM automation  -  you MUST ask exactly 4 questions using ask_user before delegating. Ask ONE question at a time. NEVER skip questions. NEVER delegate until all 4 are answered. Never make these yourself via create_artifact.
   IMPORTANT: Reels, TikToks, Shorts, video scripts, and story sequences are NOT in this list. Do NOT do the 4-question flow for video content.
4. The 4 questions MUST be grounded in the user's ACTUAL business, products, and audience. NEVER invent product names, services, or topics the user hasn't mentioned. Use what you know from their brand DNA, products, and previous conversations.
   - Question 1: What's the topic? Offer options based on THEIR actual products/services/expertise. If you don't know their products, ask open-endedly.
   - Question 2: Who's the audience? Offer segments based on THEIR actual customer base.
   - Question 3: What tone? (e.g., "Authority/Hormozi style", "Witty/Morning Brew style", "Wisdom/James Clear style", "Growth/Sahil Bloom style")
   - Question 4: What's the main CTA? Offer options relevant to THEIR actual offers/links/goals.
   NEVER fabricate product names, features, or services. If unsure, keep options generic ("Your main product", "Your latest offer") rather than guessing wrong.
5. For simple stuff (emails, docs, code, reel scripts) just create_artifact directly.
8. REELS / VIDEO SCRIPTS (THIS OVERRIDES EVERYTHING ABOVE): When the user asks to "make a reel", "create a reel", "write a reel script", "make a TikTok", "make a Short", or ANYTHING about short-form video content  -  you MUST use create_artifact IMMEDIATELY to write a VIDEO SCRIPT. Do NOT ask questions first. Do NOT use ask_user. Do NOT delegate to any agent. Do NOT generate images. Reels are NOT carousels, NOT stories, NOT slides. Just write the script as a clean, spoken script  -  the actual words they will say on camera, line by line. Do NOT use labels like [HOOK], [BRIDGE], [SCENE], [VISUAL], [VOICEOVER], [ON-SCREEN TEXT], or timestamps. Write it as a natural flowing script that the user can read straight to camera. Start with the hook line (the scroll-stopper), flow into the body, and end with a CTA if needed. Add a brief "Direction:" note at the end for suggested visuals and trending audio. Keep it punchy, under 60 seconds.
6. For sending emails, use send_email. Confirm count first if more than 5 recipients.
7. If the user asks to CHECK / READ / REVIEW / SUMMARIZE their emails or inbox, or asks what's new, or wants to find a specific email  -  call check_emails IMMEDIATELY with sensible defaults. DO NOT use ask_user to clarify first. DO NOT send them an email asking what they want. Just read the inbox, then summarize in plain talk (who, subject, one-line gist). Only ask follow-ups after you've already shown them what's there.

YOUR TOOLS:

delegate_to_agent: Spin up a specialist agent for marketing assets.
- Newsletter: agent "newsletter"
- Landing Page: agent "landing-page"
- Squeeze Page: agent "squeeze-page"
- Story Sequence: agent "story-sequence"
- Lead Magnet: agent "lead-magnet"
- DM Automation: agent "dm-automation"
Pack the task_description with everything: topic, audience, tone, products, CTA, angles. The agent builds from your description.

ask_user: Ask a question with clickable options. Use this instead of typing questions. Keep it tight, 3-5 options max.

create_artifact: Make content directly in the canvas (emails, posts, code, docs, REEL/VIDEO SCRIPTS). NOT for newsletters/landing pages/etc. When user asks for a reel or short-form video, write a script here.

SOCIAL POST RULE (READ THIS BEFORE EVERY LinkedIn/IG/X/TikTok/Facebook REQUEST):
- ANY social media post = create_artifact with type:"content_post" AND platform:"<network>". This is the ONLY correct combination.
- NEVER use type:"html_template" for a social post. NEVER use type:"markdown_doc". NEVER delegate to newsletter / landing-page / any agent.
- Platform mapping — pick from what the user said: "LinkedIn post" → platform:"linkedin". "Instagram post" → platform:"instagram". "Tweet / X post" → platform:"twitter". "TikTok caption" → platform:"tiktok". "Facebook post" → platform:"facebook".
- Why this matters: the artifact panel renders content_post + platform="linkedin" as a LinkedIn feed card (the canvas the user expects). type:"html_template" renders as a full HTML page — a PDF-looking wall of styled HTML. Getting this wrong is a visible bug the user WILL complain about.
- The content field for content_post is PLAIN TEXT — the exact post copy, with normal line breaks. Do NOT put HTML tags, style blocks, or html/body wrappers in it. Do NOT wrap it in markdown fences. Just the raw post text, ready to paste into LinkedIn / IG / etc.
${SOCIAL_POST_DISCOVERY_PROMPT}

=== MULTI-DAY CONTENT PLAN RULE (overrides the discovery questions above) ===
Trigger: the user asks to plan MULTIPLE days or pieces of content ("plan my next 14 days of content", "content for next week", "a month of posts", "what should I post this month" — any topic or goal).
1. Do NOT run the social-post discovery flow. No format question, no goal question, no angle question. You already know their brand.
2. If the request does not name platform(s): ask ONE question via ask_user — question: "Which platforms should I plan for?", options: ["LinkedIn", "YouTube", "Instagram", "X", "All platforms"], multi_select: true. That is the ONLY question allowed. If platforms are named (or they say all platforms), ask NOTHING.
3. Then IMMEDIATELY call create_content_plan. Formats per platform: linkedin → text_post | single_image | carousel; instagram → single_image | carousel | reel_script; x → text_post | single_image; youtube → youtube_script. Rotate formats (never more than 2 consecutive items with the same format on the same platform); one piece per day unless told otherwise; timeframe from the request (default 7 days, cap 31); hard-sell CTAs at most 1 in 3.
4. NEVER produce a plan via create_artifact (no html_template plan pages, no markdown_doc plans) and NEVER type the plan out as chat prose. One short intro sentence max — the client renders the day-by-day list from the tool payload.
5. After the plan lands the client shows a "Generate content" button — the user generates the pieces from there, one at a time. Do not generate them yourself, do not delegate.
Single-piece requests ("write me a LinkedIn post") still use the discovery flow above.

send_email: Send an email from the user's connected account. Works for newsletters and plain text. NEVER use this to "check" emails  -  only for outbound sends.

check_emails: Read the user's inbox (or sent/drafts). Use whenever they ask about their emails. Always call this directly, never ask them questions first.

generate_image: Create social graphics, thumbnails, cover images.
CRITICAL — IMAGE INTEGRITY RULE: If you intend to give the user an image, you MUST call the generate_image tool. Never write "here's your image", "check the image panel", "I made you a graphic", "image generated", or any phrasing that implies an image exists, UNLESS you actually emitted a generate_image tool call in the same turn. If you can't or won't call the tool, say so plainly ("I can't generate that image right now"). Hallucinating a tool call is worse than refusing — the user sees text claiming success but no image, and trusts the product less.
CRITICAL — IMAGE PROMPT IDENTITY RULE: The generate_image prompt argument must NEVER include the user's real name, ethnicity, nationality, or detailed physical description (e.g. "Bazil Sajjad, a young Pakistani man with short dark hair"). Google's image model blocks named-real-person requests. If the user/founder should appear in the image, just say "the founder" or "a person" — the attached reference photo already carries their likeness. Describe the SCENE, OUTFIT, POSE, MOOD, BACKGROUND, STYLE — never the person's identity.

VIDEO/SOCIAL LINKS: When the user pastes a video or social media link, the system auto-extracts the transcript, metadata, and creator info and attaches it to the message. You'll see it as "EXTRACTED VIDEO CONTENT". Use that data to discuss, analyze, summarize, or repurpose the content. Don't ask the user what the video is about  -  you already have the transcript.

save_to_soul: Save personal insights about the user (who they are, how they communicate, their business identity). Not tasks.

push_notification: Flag something important for the user's notification bell.`;

  // Inject contacts with actual emails so CEO can send to them
  const contactsList = context.contacts || [];
  if (contactsList.length > 0) {
    const withEmail = contactsList.filter(c => c.email);
    if (withEmail.length > 0) {
      prompt += `\n\nYou have ${withEmail.length} contacts with email addresses. When sending emails, use EXACT email addresses from this list:\n`;
      withEmail.slice(0, 40).forEach(c => {
        prompt += `- ${c.name || 'Unknown'}: ${c.email}`;
        if (c.business) prompt += ` (${c.business})`;
        prompt += '\n';
      });
    }
  }

  // Inject form embedding guidance. Always present so CEO can offer to create
  // a form on the fly when the user has none.
  {
    const formsList = context.forms || [];
    const published = formsList.filter(f => f.status === 'published');
    const drafts = formsList.filter(f => f.status === 'draft');
    prompt += `\n\n=== USER'S FORMS (for lead capture / data collection) ===\n`;
    if (formsList.length === 0) {
      prompt += `The user has no forms yet. When a landing page or squeeze page needs lead capture, you can create a new form inline via the create_form tool (see FORM EMBEDDING RULE below).\n`;
    } else {
      prompt += `The user has ${formsList.length} form(s) available:\n`;
      if (published.length > 0) {
        prompt += `\nPublished forms (ready to embed):\n${published.map(f => `- "${f.title}" (slug: ${f.slug}, ${f.questions?.length || 0} questions)`).join('\n')}\n`;
      }
      if (drafts.length > 0) {
        prompt += `\nDraft forms (not published yet, cannot be embedded until published):\n${drafts.map(f => `- "${f.title}" (${f.questions?.length || 0} questions)`).join('\n')}\n`;
      }
    }
    prompt += `
FORM EMBEDDING RULE:
When creating a landing page or squeeze page, AFTER the normal 4 questions, ask ONE additional question: "Would you like a lead capture form on this page?"
EXCEPTION: if the user chose "Creator / newsletter / personal brand" as the page style, SKIP this question entirely. The creator-newsletter page has its own built-in inline email opt-in form as the primary CTA; an additional lead-capture form would only fragment the conversion path.
Options depend on what the user already has:
  - If there are published forms: list each by name, then add "Create a new one tailored to this page", then "No, just use a CTA button".
  - If there are NO published forms: options are "Create a simple form for this page" and "No, just use a CTA button".

If the user picks an existing published form -> delegate as before with "EMBED FORM: slug=<slug>, title=<title>" in the task_description.

If the user picks "Create a new one" or "Create a simple form":
  1. Call create_form with a short, smart field set derived from the 4 discovery answers. Guardrails: 3-5 fields total, always a contact_block first, contact_phone only if the CTA is a call/booking, contact_business only for B2B audiences, plus ONE qualifier question (dropdown preferred) tied to the audience/CTA.
  2. The tool returns { slug, title, id }. Immediately delegate_to_agent for landing-page / squeeze-page and include "EMBED FORM: slug=<slug>, title=<title>" in the task_description.

If the user picks "No, just use a CTA button" -> delegate without a form.
`;
  }

  // ── Landing / squeeze page: explicit style choice + asset gathering ──
  prompt += `

=== LANDING / SQUEEZE PAGE FLOW (overrides rule 3 for landing/squeeze pages) ===

The agent supports multiple stylistic modes: "direct-response" (Hormozi / Brunson / Kennedy — long-scroll sales pages), "corporate-saas" (Stripe / Linear — clean product pages), "creator-newsletter" (James Clear / Morning Brew — editorial, email-first), "marketing-agency" (Wojo / Basic Agency — bold, portfolio-first), and "event-conference" (Funnel Hacking Live / Webflow Conf — date-driven, FOMO, transformation promise). E-commerce DTC coming next; any choice not in these five falls back to corporate-saas.

You will ALWAYS ask the user to choose the style — do NOT auto-route based on their CTA answer. Users often don't know the tradeoffs, so your job is to explain the choice in simple terms through the option labels themselves.

ORDER OF QUESTIONS (ask ONE at a time via ask_user):

Q1. What's the offer / topic?
Q2. Who's the audience?
Q3. What tone do you want? (neutral tone options — see rule 4 but drop the "Hormozi" reference. Offer: "Authoritative", "Witty & casual", "Warm & educational", "Contrarian / bold")
Q4. What's the main CTA? (book a call / buy / apply / register / download / start free trial / get a demo / other)
Q5. STYLE — ask EXACTLY this question (phrased to help the user decide):
    question: "What kind of landing page do you want?"
    options:
      - "Direct-response sales page — VSL, testimonials, offer stack, urgency (best for coaching, courses, high-ticket offers)"
      - "Corporate / SaaS product page — clean, minimal, product-focused (best for software, platforms, B2B tools)"
      - "Creator / newsletter / personal brand — editorial, email-first, warm (best for writers, podcasters, newsletters, thought leaders)"
      - "Marketing agency / creative studio — bold, portfolio-first, results-driven (best for agencies, studios, consultancies with client work to show)"
      - "Event / conference / webinar — date-driven, speakers, tickets, FOMO (best for live events, workshops, masterminds, summits)"
      - "Let AI pick based on my offer" (if they choose this, infer: DR for coaching/course/high-ticket info-product; corporate-saas for software/SaaS/platform/tool; creator-newsletter for newsletter/podcast/blog/essay/thought-leadership; marketing-agency for agencies/studios/consultancies; event-conference for conferences/webinars/summits/masterminds/workshops/live events)
    Set an internal flag PAGE_STYLE based on the answer: "direct-response", "corporate-saas", "creator-newsletter", "marketing-agency", or "event-conference".

Q6 — FORM EMBEDDING: follow the FORM EMBEDDING RULE block above.

── DIRECT-RESPONSE ONLY (skip unless PAGE_STYLE === "direct-response") ──

Q7. Specific outcome + timeframe. ask_user with 3-4 outcome-style options derived from what you already know about their offer, plus "Something else (I'll type it)". Examples: "Add $10k/mo in 90 days", "Book 10 calls in 30 days", "Get 100 leads in 60 days".
Q8. Price range. ask_user: "Under $100", "$100-$500", "$500-$2,000", "$2,000-$10,000", "$10,000+".
    Follow-up in plain text: "What's included? List 3-5 deliverables and their individual value if you know it — or just say 'you decide' and I'll draft a stack."
Q9. Guarantee. ask_user: "30-day money-back", "Results-or-refund", "Double your money back", "No guarantee", "Custom (I'll write it)".
Q10. Urgency. ask_user: "Countdown to a date (tell me when)", "Limited seats (cohort)", "Price increase (tell me when)", "No urgency / evergreen".

── CREATOR / NEWSLETTER ONLY (skip unless PAGE_STYLE === "creator-newsletter") ──

Q7. Publishing cadence. ask_user: "Weekly", "Biweekly", "Monthly", "When-I-feel-like-it / irregular".
Q8. Subscriber count for social proof. ask_user: "Show exact count (I'll type it)", "Hide the count — it's too early to flex", "Skip — use a logo row or press mentions instead".
    If "Show exact count", follow up in plain text asking for the number (e.g. "4,800 readers").
Q9. Publications / podcasts / stages where you've been featured. ask_user: "I'll paste names + URLs", "I have a few but no logos yet — just text names", "None yet, skip this section".
    If they want to include, follow up in plain text: "Paste 3-6 names (Forbes, TechCrunch, [Podcast Name], etc.) — URLs optional."
Q10. Recent issue/post titles to showcase. ask_user: "I'll paste 3-5 titles + URLs", "Use my 3 most popular (I'll tell you which topics)", "Skip the content showcase".
    If they want a showcase, follow up in plain text asking them to paste titles + short previews + URLs.
Q11. Reader testimonials. ask_user: "I'll paste a few real reader quotes", "I don't have any yet — use clearly-marked placeholder slots", "Skip testimonials entirely for now".

── MARKETING AGENCY ONLY (skip unless PAGE_STYLE === "marketing-agency") ──

Q7. Core services. ask_user: "What are your 3-5 core services?" Options (suggest from context if possible): "Paid Ads (Meta/Google/TikTok)", "Branding & Design", "Web Development", "SEO / Content Marketing", "Social Media Management", "Email Marketing", "Video Production", "Let me type my own".
    If they pick "Let me type", follow up in plain text asking them to list 3-5 services.
Q8. Case studies / proof of work. ask_user: "Do you have case studies with client results to showcase?"
    Options: "Yes — I'll paste 2-4 case studies with numbers", "I have some results but no formal case studies", "No case studies yet — use placeholder slots".
    If they say yes or have some, follow up: "Paste each case study like this: Client Name | Challenge | Result (e.g. '3.2x ROAS in 60 days') | Screenshot URL (optional). Separate each with ---."
Q9. Client logos. ask_user: "Do you have client logos to display?"
    Options: "I'll paste logo image URLs", "I'll give you company names only", "No client logos yet — skip this section".
Q10. Positioning niche. ask_user: "What kind of businesses do you serve best?"
    Offer options derived from the user's answers (e.g. "E-commerce brands ($1M-$20M)", "SaaS companies", "Local businesses", "Personal brands / creators", "Let me describe it").
Q11. Client testimonials. ask_user: "Do you have client testimonials?"
    Options: "I'll paste 2-4 real testimonials with names + companies", "Not yet — use placeholders", "Skip testimonials".

── EVENT / CONFERENCE ONLY (skip unless PAGE_STYLE === "event-conference") ──

Q7. Event date(s) + location. ask_user: "When and where is the event?"
    Options: "Specific date(s) — I'll type them", "Date TBD — use 'Coming Soon'", "It's a virtual event (no physical location)".
    If specific dates: follow up in plain text — "What are the exact dates and city? (e.g., 'September 21-23, 2026 | Las Vegas, NV' or 'March 15, 2026 | Virtual')"
Q8. Event format. ask_user: "What kind of event is this?"
    Options: "Multi-day conference (2-4 days)", "Single-day summit or workshop", "Webinar or virtual masterclass", "Recurring event series".
Q9. Speaker / host lineup. ask_user: "Do you have speakers or hosts to showcase?"
    Options: "Yes — I'll paste names, titles, and credibility hooks", "It's just me (solo host)", "Speakers TBD — use placeholder slots".
    If yes: follow up — "Paste each speaker: Name | Title | One-line credibility hook (e.g., 'Built a $100M company in 3 years'). Photo URL optional. Separate with ---."
Q10. Ticket pricing. ask_user: "How does ticketing work?"
     Options: "Multiple tiers (GA, VIP, etc.) — I'll list them", "Single price", "Free event / no ticketing", "Application-only (no public pricing)".
     If tiers: follow up — "List each tier: Tier Name | Price | What's included. e.g., 'General: $497 | 3-day access + recordings' --- 'VIP: $1,297 | Front row + dinner + 1-on-1'. Separate with ---."
Q11. Scarcity / urgency mechanic. ask_user: "What's the urgency angle?"
     Options: "Early bird deadline (I'll give the date)", "Limited seats (I'll give the number)", "Price increase on a specific date", "No urgency — it's evergreen/on-demand".
Q12. Past event proof. ask_user: "Do you have proof from past events?"
     Options: "Yes — past attendee testimonials + photos/video", "First-time event — no past proof yet", "I have some testimonials but no photos".
     If yes: follow up — "Paste 2-4 past attendee quotes (name + quote focused on what CHANGED for them, not 'it was fun'). Photo URLs optional. Separate with ---."

── ASSET GATHERING (applies to ALL styles — do this AFTER style-specific questions are done, BEFORE delegating) ──

This is where you earn your keep. Most users don't know what a high-converting landing page actually needs. Teach them by listing what would make the page great, explain why each matters in ONE line, then ask them to paste whatever they have in a single reply. Do NOT ask_user here — use a plain-text message so they can paste multiple URLs and blocks of text at once.

The list is style-aware. Phrase it like a friend walking them through it, not a form. Example script (adapt wording to the user's voice and what you already know):

  "Okay, before I build this — here's what makes a page actually convert. Paste whatever you have (and skip whatever you don't, I'll use clear placeholders):

  1. **Video sales letter** (a 2-10 min video where you talk to the camera about the offer). YouTube/Loom/Vimeo link. THIS is the highest-conversion element on a DR page. If you don't have one, I'll put a placeholder box where you can drop the URL later.

  2. **3-5 real testimonials.** Name + short quote + (ideally) a specific result they got. Screenshots of DMs or revenue are gold. If you don't have any yet, I'll leave clearly-marked placeholder slots so you can paste them in once you do.

  3. **Founder photo** — a clean headshot or on-camera shot. URL or 'use the one in my brand DNA' if you've uploaded one.

  4. **Proof screenshots** — any before/after numbers, revenue screenshots, booking confirmations, or result images from clients.

  5. **Anything else** — logos of companies you've worked with, media mentions, press.

  Paste what you've got, one block per item, or just say 'skip all' if you want me to use placeholders for everything and you'll add assets later in the editor."

For CORPORATE-SAAS, adjust the list to: product screenshots/mockups (URLs or 'upload to brand DNA first'), demo video (YouTube/Loom), customer/company logos (logo bar), team photos, integration logos, any stats/numbers (users, uptime, ROI). Same tone — one-line explanations, user can paste or skip.

For EVENT-CONFERENCE, adjust the list to:
  1. **Past event photos/video** — shots of packed rooms, engaged audiences, connection moments. The ENERGY is what sells tickets. URL links to images. If first-time event, say so — we'll use {{GENERATE:...}} for aspirational crowd imagery.
  2. **Speaker headshots** — real photos, consistent quality. These transfer authority. URL per speaker.
  3. **Venue photo** — if in-person, one strong venue shot adds legitimacy. URL or 'skip'.
  4. **Past attendee testimonials** — TRANSFORMATION-focused quotes, not "it was fun." What CHANGED for them after the event? Revenue, mindset, network, strategy. Name + company + quote.
  5. **Sponsor / partner logos** — if applicable, for the logo bar.
  The single most powerful asset for events is REAL photos of past crowds. Push the user hard for these. If it's a first-time event, emphasize speaker headshots + the transformation promise in copy instead.

For MARKETING-AGENCY, adjust the list to:
  1. **Founder / team photo** — the face behind the agency. URL or 'use brand DNA'.
  2. **Case study screenshots or mockups** — before/after visuals, dashboard screenshots, campaign creatives. These are the visual proof. URLs only (no fabrication).
  3. **Client logos** — real logo image URLs for the logo bar. The more recognizable, the better.
  4. **Results numbers** — total revenue generated, campaigns run, average ROAS, clients served. Used for the big-number stats strip.
  5. **Client testimonials** — name + title + company + quote. Specific results mentioned in the quote are gold.
  For agencies, the WORK is the selling point. Push the user to provide real case studies and logos — these matter more than any copy trick.

For CREATOR-NEWSLETTER, adjust the list to:
  1. **Creator photo** — a warm, real headshot. This is the face of the brand; fake/stock feels instantly off. URL, or 'use the one in my brand DNA'.
  2. **One-line bio / credibility hook** — who you are and why your readers trust you. If they don't have it, draft one from what they told you.
  3. **Recent issue / post titles** they'd like to showcase (paste 3-5 titles + 1-line previews + URLs, or 'skip').
  4. **Press / podcast logos** they've been featured in — URLs for logo images, or just names if no logos.
  5. **Reader testimonials** — name + quote, ideally with a specific result or reaction.
  Keep the tone warm and editorial. Mention that for creators, ONE real creator photo outweighs any amount of fancy imagery.

RULE: if the user has brand DNA (photos, documents), mention it explicitly. "I see you've uploaded 3 brand photos already — I'll use those for the founder section." Don't ask for stuff they already gave you.

If the user pastes content, parse it carefully. Identify which block is which asset (a YouTube URL is the VSL, anything with a name+quote is a testimonial, etc.). If ambiguous, ask one clarifying question.

If the user says "skip all" or similar, accept it and proceed with clearly-marked placeholders.

── DELEGATION ──

When every question is answered, call delegate_to_agent with agent_name = "landing-page" (or "squeeze-page" if they asked for a squeeze/opt-in page). The task_description MUST begin with:

  PAGE STYLE: <direct-response | corporate-saas>
  The AI CEO has already asked the user all necessary questions — generate immediately, do not ask more.

Then include labeled fields. For DIRECT-RESPONSE:

  OFFER: <Q1>
  AUDIENCE: <Q2>
  TONE: <Q3>
  CTA: <Q4>
  OUTCOME: <Q7>
  PRICE: <Q8 — range + listed deliverables/values, or "AI chooses the stack">
  GUARANTEE: <Q9>
  SCARCITY: <Q10>
  VSL_URL: <the pasted URL, or "placeholder">
  TESTIMONIALS: <verbatim text of each testimonial separated by ---, or "placeholder">
  FOUNDER_PHOTO: <URL, or "use brand DNA photo", or "placeholder">
  PROOF_SCREENSHOTS: <URLs/descriptions, or "none">
  OTHER_ASSETS: <anything else they pasted>

For CORPORATE-SAAS:

  OFFER: <Q1>
  AUDIENCE: <Q2>
  TONE: <Q3>
  CTA: <Q4>
  PRODUCT_SCREENSHOTS: <URLs or "placeholder">
  DEMO_VIDEO: <URL or "placeholder">
  CUSTOMER_LOGOS: <list or "placeholder">
  TEAM_PHOTOS: <URLs or "use brand DNA" or "none">
  STATS: <any numbers they provided>

For EVENT-CONFERENCE:

  EVENT_NAME: <from Q1 or brand DNA>
  EVENT_DATES: <Q7 — exact dates, "TBD", or "Virtual">
  EVENT_LOCATION: <Q7 — city + venue, or "Virtual", or "TBD">
  EVENT_FORMAT: <Q8 — multi-day / single-day / webinar / series>
  AUDIENCE: <Q2>
  TONE: <Q3>
  CTA: <Q4 — usually "Reserve Your Seat" / "Get Your Ticket" / "Register Now">
  SPEAKERS: <Q9 — each as "Name | Title | Credibility hook | Photo URL" separated by ---, or "solo host: [name]", or "TBD">
  TICKETS: <Q10 — each tier as "Tier | Price | Inclusions" separated by ---, or "single: $X", or "free", or "application-only">
  SCARCITY: <Q11 — early bird date / seat limit / price increase date / "none">
  PAST_EVENT_PROOF: <Q12 — testimonials + photo URLs separated by ---, or "first-time event">
  VENUE_PHOTO: <URL or "skip">
  SPONSOR_LOGOS: <URLs or names, or "none">

For MARKETING-AGENCY:

  AGENCY_NAME: <from brand DNA or Q1>
  SERVICES: <Q7 — list of 3-5 core services>
  AUDIENCE: <Q2 + Q10 — who they serve + positioning niche>
  TONE: <Q3>
  CTA: <Q4 — usually "Book a strategy call" or "Get a free audit">
  CASE_STUDIES: <Q8 — each as "Client | Challenge | Result | Screenshot URL" separated by --->
  CLIENT_LOGOS: <Q9 — URLs or company names, or "none">
  POSITIONING: <Q10 — the niche and type of businesses they serve best>
  TESTIMONIALS: <Q11 — verbatim text separated by ---, or "placeholder" or "skip">
  TEAM_PHOTO: <URL, "use brand DNA photo", or "placeholder">
  RESULTS_NUMBERS: <from asset gathering — revenue, campaigns, ROAS, client count, etc.>

For CREATOR-NEWSLETTER:

  TOPIC: <Q1 — what the newsletter/content covers>
  AUDIENCE: <Q2>
  TONE: <Q3>
  CTA: <Q4 — usually "Subscribe" — if user picked something else note it here>
  CADENCE: <Q7>
  SUBSCRIBER_COUNT: <Q8 — exact number if provided, "hide" if they chose to hide, or "none">
  PRESS_LOGOS: <Q9 — list of names/URLs, or "none">
  RECENT_POSTS: <Q10 — each as "Title | 1-line preview | URL" separated by ---, or "skip">
  TESTIMONIALS: <Q11 — verbatim text separated by ---, "placeholder" if they want empty slots, or "skip">
  CREATOR_PHOTO: <URL, or "use brand DNA photo", or "placeholder">
  CREATOR_BIO: <one-line credibility hook, or "auto" to let the agent draft one from TOPIC+AUDIENCE>

If EMBED FORM was selected, append "EMBED FORM: slug=<slug>, title=<title>" as the LAST line.

── IMPORTANT ──
- NEVER skip the style question. Always ask it explicitly.
- NEVER repeat a question the user already answered — carry context across turns.
- If the user says "just generate it" at any point, stop asking and delegate with whatever you have (missing fields become placeholders).
- When showing the asset-gathering prompt, lead with WHY those assets matter — remember, our users might not know, and your job is to teach them what good pages need.
`;


  // ── SOUL FILE  -  who this person is ──
  prompt += `\n\n=== SOUL FILE  -  WHO THIS PERSON IS ===
Your soul file is your deep understanding of the user as a PERSON. Not a task list. Not conversation logs. This is how you know them  -  their name, personality, how they talk, what drives them, what frustrates them, their business identity, their dreams.

USE this to be a real partner, not a generic bot. If you know their name, use it. If you know they hate fluff, be direct. If you know they're a solo founder grinding alone, show empathy.

WHAT TO SAVE (use save_to_soul PROACTIVELY):
- Their name, role, who they are
- Personality and communication style ("direct, no-BS" or "likes detailed explanations")
- Business identity (what they do, who they serve, what they sell)
- Values and what matters to them ("obsessed with quality" or "speed over perfection")
- Preferences ("hates emojis" or "loves data-driven decisions")
- Frustrations ("tired of tools that feel robotic")
- Dreams and ambitions ("wants to build a $1M solo business")
- Relationship context ("we've been working together for 2 weeks, they trust our recommendations now")

NEVER SAVE: tasks, to-dos, what you generated for them, conversation summaries, things already in Brand DNA.
`;

  const soulNotes = context.soulNotes || [];
  if (soulNotes.length > 0) {
    prompt += '\nHere is everything you remember:\n';
    // Group by category
    const grouped = {};
    for (const note of soulNotes) {
      const cat = note.category || 'general';
      if (!grouped[cat]) grouped[cat] = [];
      grouped[cat].push(note.content);
    }
    for (const [cat, notes] of Object.entries(grouped)) {
      const label = cat.replace(/_/g, ' ').replace(/^./, s => s.toUpperCase());
      prompt += `\n**${label}:**\n`;
      notes.forEach(n => { prompt += `- ${n}\n`; });
    }
  } else {
    prompt += '\nNo memories yet  -  this is a new user. Pay attention and start building their soul file.\n';
  }

  // ── CONNECTION STATUS  -  what's connected and what's missing ──
  const allPossibleIntegrations = ['stripe', 'whop', 'shopify', 'kajabi', 'gohighlevel', 'netlify'];
  const activeIntegrations = context.activeIntegrations || [];
  const emailAccounts = context.emailAccounts || [];
  const connectedProviders = activeIntegrations.filter(i => i.is_active).map(i => i.provider);
  const missingProviders = allPossibleIntegrations.filter(p => !connectedProviders.includes(p));

  prompt += '\n\n=== CONNECTION STATUS ===\n';

  if (connectedProviders.length > 0) {
    prompt += `Connected: ${connectedProviders.join(', ')}\n`;
  }
  if (emailAccounts.length > 0) {
    prompt += `Email accounts: ${emailAccounts.map(a => a.email).join(', ')}\n`;
  } else {
    prompt += 'Email: NOT CONNECTED  -  user cannot send emails. Suggest they connect an email account in Settings.\n';
  }
  if (missingProviders.length > 0) {
    prompt += `Not connected: ${missingProviders.join(', ')}\n`;
  }

  const hasBrandDna = !!(context.brandDna?.description || context.brandDna?.colors?.primary);
  const hasProducts = (context.products || []).length > 0;
  const hasContacts = (context.contacts || []).length > 0;
  const hasSales = !!(context.salesData?.stats?.total_sales);

  prompt += `\nBrand DNA: ${hasBrandDna ? 'SET UP' : 'MISSING  -  critical for content quality. Ask user to set up Brand DNA in Settings.'}\n`;
  prompt += `Products: ${hasProducts ? (context.products || []).length + ' products' : 'NONE  -  ask what they sell so you can help with marketing'}\n`;
  prompt += `Contacts: ${hasContacts ? (context.contacts || []).length + ' contacts' : 'NONE  -  suggest importing contacts or connecting a CRM'}\n`;
  prompt += `Sales data: ${hasSales ? 'Available' : 'NONE  -  suggest connecting Stripe/Shopify for revenue insights'}\n`;

  prompt += `\nPROACTIVE BEHAVIOR:
- If Brand DNA is missing, push a notification and tell the user to set it up. It's critical.
- If they have no email account, mention it when they try to send anything.
- If they're doing marketing but have no Stripe/Shopify, suggest connecting for revenue tracking.
- If they have social content but no outlier tracking, suggest adding creators to track.
- Use push_notification for important observations they should see even outside this conversation.\n`;

  prompt += '\n';

  const { brandDna, contentItems, salesData, products, contacts, outlierData, integrationCtx, activeBrief } = context;

  // Inject the user's saved campaign brief BEFORE Brand DNA — when the
  // user has explicitly filled this in (or it was auto-captured from a
  // prior turn), the CEO should skip its 4-question marketing discovery
  // and delegate immediately instead of re-asking what's already been
  // answered. The brief block wording explicitly overrides rule #3
  // above (the "ask exactly 4 questions" rule).
  const ceoBriefBlock = formatBriefForPrompt(activeBrief);
  if (ceoBriefBlock) {
    prompt += ceoBriefBlock + '\n\n';
  }

  if (brandDna) {
    prompt += `=== BRAND DNA ===\n`;
    if (brandDna.description) prompt += `Description: ${brandDna.description}\n`;
    if (brandDna.main_font) prompt += `Main Font: ${brandDna.main_font}\n`;
    if (brandDna.secondary_font) prompt += `Secondary Font: ${brandDna.secondary_font}\n`;
    if (brandDna.colors && Object.keys(brandDna.colors).length) {
      const c = brandDna.colors;
      if (c.primary) prompt += `Primary Color: ${c.primary}\n`;
      if (c.text) prompt += `Text Color: ${c.text}\n`;
      if (c.secondary) prompt += `Secondary Color: ${c.secondary}\n`;
    }
    if (brandDna.photo_urls?.length) prompt += `Brand Photos: ${brandDna.photo_urls.length} photos available\n`;
    const orchLogos = brandDna.logos?.length ? brandDna.logos : (brandDna.logo_url ? [{ url: brandDna.logo_url, name: 'Logo', isDefault: true }] : []);
    if (orchLogos.length === 1) {
      prompt += `Logo: "${orchLogos[0].name}" available\n`;
    } else if (orchLogos.length > 1) {
      prompt += `Logos: ${orchLogos.map(l => `"${l.name}"${l.isDefault ? ' (default)' : ''}`).join(', ')}\n`;
    }
    if (brandDna.documents && Object.keys(brandDna.documents).length) {
      for (const [key, doc] of Object.entries(brandDna.documents)) {
        if (doc.extracted_text) {
          const label = key.replace(/([A-Z])/g, ' $1').replace(/^./, s => s.toUpperCase());
          prompt += `\n--- ${label} ---\n${doc.extracted_text.slice(0, 3000)}\n`;
        }
      }
    }
    prompt += '\n';
  }

  if (contentItems?.length) {
    const docs = contentItems.filter(i => i.type === 'document' && i.extracted_text);
    const social = contentItems.filter(i => i.type === 'social');
    if (docs.length) {
      prompt += `=== UPLOADED DOCUMENTS ===\n`;
      docs.forEach((doc, i) => {
        prompt += `--- ${doc.filename || `Document ${i + 1}`} ---\n${doc.extracted_text.slice(0, 3000)}\n\n`;
      });
    }
    if (social.length) {
      prompt += `=== SOCIAL MEDIA REFERENCES ===\n`;
      social.forEach(item => {
        const m = item.metadata || {};
        prompt += `- ${m.title || item.url} (${m.platform || 'unknown'})`;
        if (item.transcript) prompt += `  -  transcript available`;
        prompt += '\n';
      });
      prompt += '\n';
    }
  }

  if (integrationCtx) {
    prompt += `=== BUSINESS DATA FROM INTEGRATIONS ===\n${integrationCtx}\n\n`;
  }

  if (salesData) {
    if (salesData.stats) {
      prompt += `=== SALES STATS ===\n`;
      const s = salesData.stats;
      if (s.total_revenue != null) prompt += `Total Revenue: $${Number(s.total_revenue).toLocaleString()}\n`;
      if (s.total_sales != null) prompt += `Total Sales: ${s.total_sales}\n`;
      if (s.avg_deal_size != null) prompt += `Avg Deal Size: $${Number(s.avg_deal_size).toLocaleString()}\n`;
      prompt += '\n';
    }
    if (salesData.calls?.length) {
      // Show up to 5 calls with real content (summary + action items +
      // transcript excerpt), then list the remainder as one-liners so the
      // agent still knows they exist without blowing the token budget.
      // Per-call transcript cap = 1500 chars → ~5 detailed calls × 1.5k
      // ≈ 7.5k chars worst case, plus summaries. Fits every agent budget.
      const TRANSCRIPT_CAP_PER_CALL = 1500;
      const DETAIL_CALLS = 5;
      const detail = salesData.calls.slice(0, DETAIL_CALLS);
      const rest = salesData.calls.slice(DETAIL_CALLS, 10);
      prompt += `=== MEETINGS THE USER ADDED TO CONTEXT (${salesData.calls.length}) ===\n`;
      prompt += `These are meetings the user explicitly flagged as important. Reference specific things discussed when relevant.\n\n`;
      detail.forEach((call) => {
        const dateStr = call.date || call.created_at?.slice(0, 10) || '';
        prompt += `--- ${call.title || 'Meeting'}${dateStr ? ` (${dateStr})` : ''} ---\n`;
        if (call.summary) {
          prompt += `Summary: ${String(call.summary).slice(0, 500)}\n`;
        }
        if (Array.isArray(call.action_items) && call.action_items.length) {
          const items = call.action_items
            .map((a) => (typeof a === 'string' ? a : (a?.text || a?.title || '')))
            .filter(Boolean)
            .slice(0, 8);
          if (items.length) prompt += `Action items:\n${items.map((t) => `  - ${t}`).join('\n')}\n`;
        }
        if (call.transcript) {
          const excerpt = String(call.transcript).slice(0, TRANSCRIPT_CAP_PER_CALL);
          const truncated = call.transcript.length > TRANSCRIPT_CAP_PER_CALL;
          prompt += `Transcript${truncated ? ' (excerpt)' : ''}:\n${excerpt}${truncated ? '…' : ''}\n`;
        }
        prompt += '\n';
      });
      if (rest.length) {
        prompt += `Other meetings in context (title only):\n`;
        rest.forEach((call) => {
          prompt += `  - ${call.title || 'Meeting'} (${call.date || call.created_at?.slice(0, 10) || ''})\n`;
        });
        prompt += '\n';
      }
    }
  }

  if (products?.length) {
    prompt += `=== PRODUCTS (${products.length}) ===\n`;
    prompt += `Use these product assets (photos, descriptions, pricing, checkout links) when drafting landing pages, emails, social posts, or anything that markets the offer. Reference photo URLs directly in image slots. Use checkout URLs in CTAs.\n\n`;
    products.forEach((p, idx) => {
      prompt += `--- Product ${idx + 1}: ${p.name} ---\n`;
      if (p.type) prompt += `Type: ${p.type}\n`;

      // Pricing — show every tier, not just the first.
      const priceLines = [];
      if (Array.isArray(p.pricing_options) && p.pricing_options.length) {
        p.pricing_options.forEach((opt) => {
          const dollars = opt.price_cents != null ? (opt.price_cents / 100).toFixed(2) : null;
          if (dollars != null) {
            const mode = opt.price_mode === 'monthly' ? '/month' : ' one-time';
            const line = `$${dollars}${mode}${opt.payment_link_url ? ` — checkout: ${opt.payment_link_url}` : ''}`;
            priceLines.push(line);
          }
        });
      } else if (p.price_cents != null) {
        priceLines.push(`$${(p.price_cents / 100).toFixed(2)}`);
      } else if (p.price != null) {
        priceLines.push(`$${p.price}`);
      }
      if (priceLines.length === 1) prompt += `Price: ${priceLines[0]}\n`;
      else if (priceLines.length > 1) prompt += `Pricing tiers:\n${priceLines.map((l) => `  - ${l}`).join('\n')}\n`;

      if (p.payment_link_url && !priceLines.some((l) => l.includes(p.payment_link_url))) {
        prompt += `Checkout URL: ${p.payment_link_url}\n`;
      }

      // Photos / images — real URLs, usable by marketing agents as <img src="...">.
      const photoUrls = (Array.isArray(p.photos) ? p.photos : [])
        .map((ph) => (typeof ph === 'string' ? ph : ph?.url))
        .filter(Boolean);
      if (p.image_url && !photoUrls.includes(p.image_url)) photoUrls.unshift(p.image_url);
      if (photoUrls.length) {
        prompt += `Photos (${photoUrls.length}):\n${photoUrls.map((u) => `  - ${u}`).join('\n')}\n`;
      }

      if (p.description) prompt += `Description: ${p.description.slice(0, 1200)}\n`;
      prompt += '\n';
    });
  }

  if (contacts?.length) {
    prompt += `=== CONTACTS (${contacts.length}) ===\n`;
    contacts.slice(0, 30).forEach(c => {
      prompt += `- ${c.name || c.email}`;
      if (c.company) prompt += ` @ ${c.company}`;
      if (c.stage || c.status) prompt += ` [${c.stage || c.status}]`;
      prompt += '\n';
    });
    prompt += '\n';
  }

  if (outlierData) {
    if (outlierData.creators?.length) {
      prompt += `=== OUTLIER RESEARCH  -  CREATORS (${outlierData.creators.length}) ===\n`;
      outlierData.creators.forEach(c => {
        prompt += `- ${c.display_name || c.username} (${c.platform})`;
        if (c.avg_views) prompt += `  -  avg ${Number(c.avg_views).toLocaleString()} views`;
        prompt += '\n';
      });
      prompt += '\n';
    }
    if (outlierData.videos?.length) {
      prompt += `=== TOP OUTLIER VIDEOS ===\n`;
      outlierData.videos.slice(0, 10).forEach(v => {
        prompt += `- "${v.title}" by ${v.outlier_creators?.display_name || 'unknown'}`;
        if (v.views_multiplier) prompt += ` (${v.views_multiplier.toFixed(1)}x avg)`;
        prompt += '\n';
      });
      prompt += '\n';
    }
  }

  // Style rules only — the BRIEF CAPTURE JSON example is agents-only
  // (its literal protocol example primes gateway backends to emit the
  // whole object as chat text).
  return prompt + GLOBAL_STYLE_RULES;
}

// ── SSE Helper ──
function sendSSE(res, event) {
  try {
    res.write(`data: ${JSON.stringify(event)}\n\n`);
  } catch {}
}

// Protocol-leak stream guard for the CEO's visible text stream. The
// rolling cumulative text is truncated at the first protocol object
// (JSON tool call, agent JSON, fn-call syntax, HTML doc) AND at any
// forming tail that could become one — so raw protocol never even
// flickers in the chat while streaming. The salvage layer finalizes the
// bubble with clean text afterwards (cumulative-replace contract).
function visibleStreamText(content) {
  const t0 = content || '';
  const cut = protocolTextStart(t0);
  let t = cut === -1 ? t0 : t0.slice(0, cut);
  // Hold back a forming JSON-object tail ({"tool_co…) that hasn't matched
  // a known shape yet — the display catches up next chunk if it turns
  // out to be harmless prose.
  const braceTail = t.lastIndexOf('{');
  if (braceTail !== -1 && /^\{\s*"?[\w-]*"?\s*:?\s*"?$/.test(t.slice(braceTail))) t = t.slice(0, braceTail);
  // Same for a forming HTML-document tail.
  const htmlTail = t.toLowerCase().lastIndexOf('<!doc');
  if (htmlTail !== -1) t = t.slice(0, htmlTail);
  return t.trimEnd();
}

// Text-mode question fallback: a misbehaving gateway backend sometimes
// RECITES the ask_user question + options as plain chat text instead of
// calling the tool ("What type of LinkedIn post?\nText post\nCarousel\n
// Surprise me" — prompt.md, 2026-07-16). When a CEO turn ends with a
// ?-line followed by 2-5 short option-like lines and NO ask_user fired,
// convert it into the real card. Conservative on purpose: short lines
// only, no sentence punctuation, must directly follow the question.
function extractTextModeQuestion(text) {
  const lines = (text || '').split('\n').map((l) => l.trim()).filter((l, i, arr) => l !== '' || i < arr.length - 1);
  while (lines.length && lines[lines.length - 1] === '') lines.pop();
  if (lines.length < 3) return null;

  const isOptionLine = (l) => {
    const stripped = l.replace(/^[-*•\d.)\s]+/, '').replace(/\*\*/g, '').trim();
    if (!stripped || stripped.length > 40) return false;
    if (/[.?!:;]$/.test(stripped)) return false;
    if (stripped.split(/\s+/).length > 6) return false;
    return /[a-zA-Z]/.test(stripped);
  };

  // Collect trailing option lines.
  const options = [];
  let i = lines.length - 1;
  while (i >= 0 && isOptionLine(lines[i]) && options.length < 5) {
    options.unshift(lines[i].replace(/^[-*•\d.)\s]+/, '').replace(/\*\*/g, '').trim());
    i--;
  }
  if (options.length < 2) return null;

  // The line above them must be a question.
  const qLine = (lines[i] || '').replace(/\*\*/g, '').trim();
  if (!qLine.endsWith('?') || qLine.length < 8) return null;

  return {
    question: qLine,
    options,
    preamble: lines.slice(0, i).join('\n').trim(),
  };
}

// ── Edit tools for file-based editing (like Claude Code) ──
const EDIT_TOOLS = [
  {
    name: 'replace_text',
    description: 'Find and replace exact text in the HTML file. Use for targeted changes: text content, colors, links, image URLs, styles, classes. The old_text must be an EXACT substring match of the current file content. You can call this multiple times for multiple changes.',
    input_schema: {
      type: 'object',
      properties: {
        old_text: { type: 'string', description: 'The exact text to find (must match exactly, including whitespace)' },
        new_text: { type: 'string', description: 'The replacement text' },
      },
      required: ['old_text', 'new_text'],
    },
  },
  {
    name: 'replace_section',
    description: 'Replace an entire section between <!-- SECTION:name --> and <!-- /SECTION:name --> markers. Use ONLY when the user asks for a full section redesign  -  prefer replace_text for smaller changes.',
    input_schema: {
      type: 'object',
      properties: {
        section_name: { type: 'string', description: 'Section name (e.g., hero, nav, features, cta, footer)' },
        new_html: { type: 'string', description: 'The complete new HTML for the section (between the markers)' },
      },
      required: ['section_name', 'new_html'],
    },
  },
];

function buildEditSystemPrompt(brandDna) {
  let prompt = `You are editing an existing HTML file. You operate like a code editor  -  making precise, surgical changes.

TOOLS:
- replace_text: Find an exact substring and replace it. Use for targeted changes (headings, paragraphs, colors, links, images, CSS values). The old_text MUST be an exact match of text in the file.
- replace_section: Replace everything between <!-- SECTION:name --> markers. Use ONLY for full section redesigns.

RULES:
1. Make MINIMAL changes  -  only modify what the user asked for.
2. ALWAYS prefer replace_text over replace_section. Use replace_section ONLY when the user explicitly asks to redesign/rebuild an entire section.
3. Make multiple replace_text calls for complex edits (e.g., changing 3 headings = 3 calls).
4. old_text must be EXACT  -  include enough surrounding context to be unique if needed.
5. After all edits, respond with a 1-sentence summary of what you changed.
6. NEVER rewrite the entire page.
7. Preserve all existing styles, classes, and structure unless the user asks to change them.

USER-UPLOADED IMAGES (CRITICAL):
- When the user message contains a [UPLOADED IMAGES — …] block, those uploads ARE the assets the user is referring to.
- Each upload is listed with its filename and an exact placeholder of the form  src="{{IMAGE:file-XXX}}". The frontend swaps the placeholder for the real image at render time.
- When the user says "add attached image to hero" / "use this image as the hero" / "put the photo in the cover" / etc., you MUST call replace_section (or replace_text) and emit a real <img> tag whose src is EXACTLY the literal placeholder string  {{IMAGE:file-XXX}}  from the manifest. Do not invent URLs. Do not write the placeholder as plain text outside an <img> tag. Do not narrate that the placeholder is "already there"  -  if the placeholder isn't already in the existing HTML you can see, IT IS NOT THERE and you must add it.
- The placeholder text {{IMAGE:file-XXX}} will NOT appear in the existing HTML you were given unless a previous edit already inserted it. Your job is to insert the <img> tag with that placeholder src now.
- Apply  style="width:100%;height:auto;"  on inserted user-upload <img> tags. Do not crop with fixed pixel heights.
- After making the actual tool call(s), summarise in one sentence (rule 5). The summary alone is not enough  -  you MUST call a tool to make the edit visible.`;

  if (brandDna) {
    prompt += '\n\n' + buildBrandContext(brandDna);
  }

  return prompt;
}

// Detect whether the user's latest message is asking for a NEW artifact
// (different type, or "another / new / fresh <same-type>"), instead of an
// edit to whatever's currently in the panel. Used to gate the "CEO edit
// shortcut" — without this, a follow-up like "create a landing page" while
// a newsletter is in the panel would be fed to the file-edit agent and
// the newsletter would be silently restructured into a landing page,
// leaving the user with one (mutated) artifact instead of two
// independently previewable cards.
//
// Conservative on purpose: returns false (= keep editing) unless intent is
// explicit. Plain modification messages ("make the title bigger", "change
// colors", "fix the CTA") still route through the edit shortcut as before.
function userWantsNewArtifact(message, currentAgent) {
  if (!message || !currentAgent) return false;
  const lower = String(message).toLowerCase();

  // 1) Explicit mention of a DIFFERENT artifact type → NEW.
  const types = {
    'newsletter':     /\bnews ?letter\b/,
    'landing-page':   /\blanding ?page\b/,
    'squeeze-page':   /\b(squeeze ?page|opt[\s-]?in page|lead ?capture)\b/,
    'story-sequence': /\b(story ?sequence|story ?series)\b/,
    'lead-magnet':    /\blead ?magnet\b/,
    'dm-automation':  /\bdm ?automation\b/,
  };
  for (const [t, re] of Object.entries(types)) {
    if (t !== currentAgent && re.test(lower)) return true;
  }

  // 2) "another / new / fresh / different <same-type-name>" → NEW even when
  // the requested type matches what's currently in the panel.
  if (/\b(another|new|fresh|different|second|one more|extra)\b[^.!?]{0,40}\b(news ?letter|landing ?page|squeeze ?page|story|lead ?magnet|automation)\b/.test(lower)) {
    return true;
  }

  return false;
}

// Detect new-artifact intent ACROSS the current in-progress flow, not just
// the very last user message. The CEO orchestrator asks up to 4 ask_user
// questions before generating a new newsletter / landing / squeeze / story /
// lead-magnet / dm-automation. While the user is answering those questions,
// each individual answer (e.g. "B2B SaaS") doesn't read as new-artifact
// intent on its own — but the original triggering message ("create me a
// landing page") is still earlier in the same flow.
//
// Strategy: walk back to the most recent assistant message that is NOT part
// of an ask_user question (that's the boundary of the previous turn /
// previous artifact's completion). Any user messages AFTER that boundary
// belong to the current in-progress flow. If ANY of them carries explicit
// new-artifact intent, treat the whole flow as new-artifact.
//
// Without this we leak back into the edit shortcut as soon as the user
// answers question 1, and the file-edit agent silently mutates whatever
// HTML is currently in the panel.
function detectNewArtifactInFlow(messages, currentAgent) {
  if (!Array.isArray(messages) || !currentAgent) return false;
  let boundary = -1;
  for (let i = messages.length - 1; i >= 0; i--) {
    const m = messages[i];
    if (m && m.role === 'assistant' && !m.wasAskUser) {
      boundary = i;
      break;
    }
  }
  for (let i = boundary + 1; i < messages.length; i++) {
    const m = messages[i];
    if (m && m.role === 'user' && userWantsNewArtifact(m.content, currentAgent)) {
      return true;
    }
  }
  return false;
}

// ── POST /api/orchestrate ──
// mode: "ceo" or "direct" (direct handles both generation and editing)
// Chat messages are FREE (docs/credits-policy.md) — only the disputed-
// account hold applies. Generation (images/slides) bills separately.
router.post('/api/orchestrate', requireActiveAccount(), async (req, res) => {
  const userId = req.user?.id;
  const { messages, mode = 'ceo', agent: agentName, searchMode = false, planMode = false, currentHtml, editInstruction, currentAgent, currentTitle = '', currentContentPost, sessionId = null, assistantMsgId = null, userName = null } = req.body;

  // Detect Plan Mode artifacts on screen. These are html_template artifacts
  // whose HTML content wraps the plan in a <div class="plan-artifact">
  // AND/OR whose title matches the plan naming convention. When the on-
  // screen artifact is a Plan/Brief, we SKIP the file-based edit shortcut
  // entirely — otherwise every follow-up ("generate Monday's carousel")
  // gets misrouted as an edit-the-plan operation, and the reply title
  // shows "Updated newsletter" because the Plan artifact defaults to the
  // newsletter agent renderer.
  const isPlanArtifactOnScreen = !!(
    (currentHtml && /class=["'][^"']*\bplan-artifact\b/.test(currentHtml)) ||
    /^Content Plan\b|^Week \d+ /i.test(String(currentTitle || ''))
  );

  if (!messages || !Array.isArray(messages)) {
    return res.status(400).json({ error: 'messages array required' });
  }

  // Set up SSE
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache, no-transform');
  res.setHeader('Connection', 'keep-alive');
  res.setHeader('X-Accel-Buffering', 'no');
  if (res.socket) { res.socket.setNoDelay(true); res.socket.setTimeout(0); }
  res.flushHeaders();

  const heartbeat = setInterval(() => {
    try { res.write(': heartbeat\n\n'); } catch {}
  }, 3000);

  // If the tab closes mid-stream, abort the upstream LLM call instead of
  // burning tokens for a client that is gone (robustness audit A1). Same
  // pattern the plan-item route uses. Carried on context so the four
  // handleCeoOrchestration call sites don't all need new params.
  const abortCtl = new AbortController();
  res.on('close', () => { if (!res.writableEnded) abortCtl.abort(); });

  try {
    console.log(`[orchestrate] mode=${mode} agent=${agentName} userId=${userId} hasEdit=${!!editInstruction} hasHtml=${!!currentHtml} msgCount=${messages?.length}`);
    const [context, activeBrief] = await Promise.all([
      loadUserContext(userId),
      loadActiveBrief(userId),
    ]);
    context.activeBrief = activeBrief;
    // Display name from the client — feeds the LinkedIn writer's sign-off
    // (Phase 4/5, docs/unified-content-backend-plan.md). Carried on
    // context so the four handleCeoOrchestration call sites don't all
    // need new params.
    context.ceoUserName = userName || null;
    context.clientAbortSignal = abortCtl.signal;
    console.log(`[orchestrate] Context loaded, brandDna=${!!context.brandDna} brief=${!!activeBrief}`);

    if (mode === 'direct') {
      await handleDirectAgent({ res, agentName, messages, context, searchMode, userId, currentHtml, editInstruction, sessionId, assistantMsgId });
    } else if (mode === 'ceo' && isPlanArtifactOnScreen) {
      // Plan/Brief artifact on screen — NEVER use the edit shortcut. Every
      // new message goes through full CEO orchestration where the model
      // decides: generate a real content_post from the plan, edit the
      // plan, or reply conversationally. This is the isolation fix — the
      // Plan Mode flow does not hijack the AICEO chat once the artifact
      // is created; the CEO returns to normal routing.
      console.log(`[orchestrate] Plan artifact on screen (title="${currentTitle}") — bypassing edit shortcut, routing to full CEO orchestration`);
      await handleCeoOrchestration({ res, messages, context, searchMode, planMode, userId, currentHtml, currentAgent, currentContentPost, sessionId, assistantMsgId });
      return;
    } else if (mode === 'ceo' && currentHtml && currentAgent) {
      // User is editing an existing artifact  -  try surgical file-based edit first.
      // Pass the whole conversation so the edit agent remembers what was built,
      // the brand, tone, and prior tweaks — instead of treating each edit as a
      // cold-start where the user has to repeat themselves.
      const userMessages = messages.filter(m => m.role === 'user');
      const lastUserMsg = userMessages[userMessages.length - 1]?.content || '';

      // Don't take the edit shortcut when the user is clearly asking for a
      // DIFFERENT artifact (e.g. "create a landing page" while a newsletter
      // is open). Without this gate, the file-edit agent would silently
      // restructure the newsletter HTML into landing-page shape and the
      // user would end up with one mutated artifact instead of two cards.
      //
      // Use the in-flow scan rather than only checking the last message —
      // otherwise we leak back into the edit shortcut the moment the user
      // answers the first of the orchestrator's 4 setup questions (since
      // "B2B SaaS" doesn't read as a new-artifact request on its own).
      if (detectNewArtifactInFlow(messages, currentAgent)) {
        console.log(`[orchestrate] New-artifact intent detected in current flow (last user msg: "${lastUserMsg.slice(0, 80)}") — skipping edit shortcut, routing to CEO orchestration`);
        await handleCeoOrchestration({ res, messages, context, searchMode, planMode, userId, currentHtml, currentAgent, sessionId, assistantMsgId });
        return;
      }

      const priorMessages = messages.slice(0, -1); // everything except the current edit instruction
      const agent = getAgent(currentAgent);
      if (agent && lastUserMsg) {
        console.log(`[orchestrate] CEO edit shortcut: trying file-based edit for ${currentAgent} (priorMessages=${priorMessages.length})`);
        sendSSE(res, { type: 'status', text: 'Editing...' });
        try {
          const edited = await tryFileBasedEdit({
            res, agent, agentName: currentAgent,
            editInstruction: lastUserMsg,
            priorMessages,
            userId, context, currentHtml, sessionId, assistantMsgId,
          });
          if (edited) {
            console.log('[orchestrate] CEO edit shortcut succeeded');
            // Also send a brief text summary
            sendSSE(res, { type: 'text_delta', content: '' });
            return;
          }
        } catch (err) {
          console.log(`[orchestrate] CEO edit shortcut failed, falling back to CEO: ${err.message}`);
        }
      }
      // Fall through to full CEO orchestration
      await handleCeoOrchestration({ res, messages, context, searchMode, planMode, userId, currentHtml, currentAgent, currentContentPost, sessionId, assistantMsgId });
    } else {
      await handleCeoOrchestration({ res, messages, context, searchMode, planMode, userId, currentHtml, currentAgent, currentContentPost, sessionId, assistantMsgId });
    }
    console.log('[orchestrate] Handler completed successfully');
  } catch (err) {
    console.error('[orchestrate] Error:', err.message, err.stack);
    // Translate known error codes into user-friendly messages so the
    // frontend can render something more useful than the generic
    // "Something went wrong. Please try again." For CONTEXT_EXCEEDED
    // (set by base-agent when 1M context retry also fails), tell the
    // user exactly what's wrong and what to do.
    const friendlyError =
      err.code === 'CONTEXT_EXCEEDED'
        ? 'This conversation has grown too large to continue. Please start a fresh chat — the AI can\'t fit everything in its working memory anymore.'
        : err.message;
    sendSSE(res, { type: 'error', error: friendlyError, code: err.code || null });
  } finally {
    clearInterval(heartbeat);
    sendSSE(res, { type: 'done' });
    try { res.write('data: [DONE]\n\n'); } catch { /* client gone */ }
    res.end();
  }
});

// ── Direct Agent Execution ──
// Handles both generation (no currentHtml) and editing (currentHtml + editInstruction)
async function handleDirectAgent({ res, agentName, messages, context, searchMode, userId, currentHtml, editInstruction, sessionId = null, assistantMsgId = null }) {
  const agent = getAgent(agentName);
  if (!agent) {
    sendSSE(res, { type: 'error', error: `Unknown agent: ${agentName}` });
    return;
  }

  // If we have currentHtml + editInstruction, try file-based editing first
  if (currentHtml && editInstruction) {
    console.log(`[orchestrate] Attempting file-based edit for ${agentName}`);
    try {
      // Pass prior messages (minus the final edit instruction) so the edit
      // agent retains conversation context instead of cold-starting.
      const priorMessages = Array.isArray(messages) ? messages.slice(0, -1) : [];
      const edited = await tryFileBasedEdit({ res, agent, agentName, editInstruction, userId, context, currentHtml, priorMessages, sessionId, assistantMsgId });
      if (edited) {
        console.log('[orchestrate] File-based edit succeeded');
        return;
      }
    } catch (err) {
      console.log(`[orchestrate] File-based edit failed, falling back to agent: ${err.message}`);
      // Fall through to regular agent execution
    }
  }

  // Regular agent execution (generation or section-based edit fallback)
  console.log(`[orchestrate] Running regular agent execution for ${agent.name}, msgCount=${messages?.length}`);
  sendSSE(res, { type: 'status', text: `Running ${agent.name} agent...` });

  const briefBlock = formatBriefForPrompt(context.activeBrief);
  const systemPrompt = agent.buildSystemPrompt(context.brandDna)
    + buildProductsContext(context.products)
    + (briefBlock ? `\n\n${briefBlock}` : '')
    + GLOBAL_OUTPUT_RULES;

  // For edit mode fallback, build messages with current HTML and section-based instructions
  let agentMessages = messages;
  if (currentHtml && editInstruction) {
    agentMessages = [
      {
        role: 'user',
        content: `Here is my current HTML with section markers (<!-- SECTION:name --> ... <!-- /SECTION:name -->).

Please edit ONLY the sections that need to change based on my instruction. Respond with:
- {"type":"edit","sections":{"sectionName":"<updated section HTML>"},"summary":"..."} for targeted edits
- {"type":"html","html":"<full HTML>","summary":"..."} only if I ask for a full rewrite

Current HTML:
${currentHtml}`,
      },
      {
        role: 'assistant',
        content: 'I have your current HTML with section markers. What changes would you like me to make?',
      },
      {
        role: 'user',
        content: editInstruction,
      },
    ];
  }

  const agentWithPrompt = { ...agent, systemPrompt };

  // Surface the assembled prompt to the browser console for debugging.
  // Frontend's streamFromBackend forwards `debug_prompt` events to
  // console.log so you can read the exact bytes the LLM sees.
  sendSSE(res, {
    type: 'debug_prompt',
    site: 'direct-agent',
    agent: agent.name,
    model: agent.model,
    systemPrompt,
    lastUser: agentMessages?.findLast?.((m) => m.role === 'user')?.content?.toString?.().slice(0, 2000) || null,
  });

  let finalContent = '';

  await executeAgent({
    agent: agentWithPrompt,
    messages: agentMessages,
    searchMode,
    onChunk: (content) => {
      finalContent = content;
      sendSSE(res, { type: 'agent_chunk', agent: agent.name, content });
    },
    onSearchStatus: (status) => {
      sendSSE(res, { type: 'search_status', status });
    },
  });

  // After generation, save to file store for future edits + capture
  // the campaign brief the agent emitted so other Marketing tools can
  // reuse it without re-asking the user.
  if (userId && finalContent) {
    try {
      const parsed = tryParseJSON(finalContent);
      if (parsed) {
        const html = parsed.html || null;
        if (html) {
          saveFile(userId, agentName, html);
        }
        captureBriefFromAgentResult(userId, parsed);
      }
    } catch {
      // Not critical
    }
  }
}

// Best-effort upsert of the user's active campaign brief from a parsed
// agent generation result. Returns silently on missing/invalid input.
// The brief field is optional in the agent's JSON output — when present
// it gives us the canonical 5 dimensions to reuse across tools without
// re-running the 4-question discovery dance.
function captureBriefFromAgentResult(userId, parsed) {
  if (!userId || userId === 'anonymous' || !parsed || typeof parsed !== 'object') return;
  const briefIn = parsed.brief;
  if (!briefIn || typeof briefIn !== 'object') return;
  const clean = {};
  for (const k of ['offer', 'audience', 'tone', 'goal', 'key_benefit']) {
    const v = briefIn[k];
    if (typeof v === 'string' && v.trim() && !/^(placeholder|tbd|n\/a|none|skip)$/i.test(v.trim())) {
      clean[k] = v.trim().slice(0, 500);
    }
  }
  if (Object.keys(clean).length === 0) return;
  upsertActiveBrief(userId, clean)
    .then((b) => b && console.log(`[brief] auto-captured from agent result: ${Object.keys(clean).join(', ')}`))
    .catch((err) => console.warn('[brief] auto-capture (agent result) failed:', err?.message));
}

// ── File-Based Edit (Claude Code style) ──
// Returns true if edit succeeded, false/throws if should fall back
// Commit a stable snapshot of an artifact to the version history. Best-effort
// — never fails the main request. Skips silently when any of the inputs we
// need (userId, content) are missing.
async function commitArtifactVersion({ userId, sessionId, agentName, content, summary, messageId }) {
  if (!userId || userId === 'anonymous' || !content) return;
  try {
    let latestQuery = supabase
      .from('artifact_versions')
      .select('version_number')
      .eq('user_id', userId)
      .eq('agent_name', agentName)
      .order('version_number', { ascending: false })
      .limit(1);
    // Supabase JS: null comparison needs .is(), not .eq().
    if (sessionId) latestQuery = latestQuery.eq('session_id', sessionId);
    else latestQuery = latestQuery.is('session_id', null);
    const { data: latest } = await latestQuery;
    const nextVersion = ((latest?.[0]?.version_number) || 0) + 1;
    const { error: insertErr } = await supabase.from('artifact_versions').insert({
      user_id: userId,
      session_id: sessionId || null,
      agent_name: agentName,
      message_id: messageId || null,
      version_number: nextVersion,
      content,
      summary: (summary || '').slice(0, 500) || null,
      is_revert: false,
    });
    if (insertErr) {
      console.log(`[artifact-versions] insert failed:`, insertErr.message);
    } else {
      console.log(`[artifact-versions] committed v${nextVersion} session=${sessionId || 'none'} agent=${agentName}`);
    }
  } catch (err) {
    console.log(`[artifact-versions] commit failed (non-fatal):`, err.message);
  }
}

async function tryFileBasedEdit({ res, agent, agentName, editInstruction, userId, context, currentHtml, priorMessages = [], sessionId = null, assistantMsgId = null }) {
  // Always prefer currentHtml from frontend (most up-to-date, includes cover images etc.)
  let fileHtml = currentHtml || getFile(userId, agentName);
  if (!fileHtml) return false;
  saveFile(userId, agentName, fileHtml);

  sendSSE(res, { type: 'status', text: 'Editing...' });

  const systemPrompt = buildEditSystemPrompt(context.brandDna);

  // Seed the conversation with the recent chat history so the edit agent
  // remembers the brand, the original request, earlier tweaks, and can resolve
  // pronouns / references ("make it bolder", "that section", "same as before").
  // Cap to the last 16 turns so prompts stay bounded on long sessions.
  const historyWindow = (priorMessages || [])
    .filter((m) => m && (m.role === 'user' || m.role === 'assistant') && m.content)
    .slice(-16)
    .map((m) => ({ role: m.role, content: typeof m.content === 'string' ? m.content : String(m.content) }));

  const editMessages = [
    ...historyWindow,
    {
      role: 'user',
      content: `Here is the current HTML file you previously generated:\n\n${fileHtml}\n\nEdit request: ${editInstruction}\n\nImportant: apply ONLY what is requested. Keep everything else (copy, layout, assets, brand colors, tone) exactly as it is.`,
    },
  ];

  sendSSE(res, {
    type: 'debug_prompt',
    site: 'edit-mode',
    agent: agentName,
    model: SONNET_MODEL,
    systemPrompt,
    editInstruction,
    fileHtmlLen: fileHtml?.length || 0,
  });

  let editCount = 0;

  const summary = await executeAnthropicWithTools({
    systemPrompt,
    messages: editMessages,
    tools: EDIT_TOOLS,
    maxTokens: 4096,
    onToolCall: async (name, input) => {
      if (name === 'replace_text') {
        const { old_text, new_text } = input;
        if (!fileHtml.includes(old_text)) {
          sendSSE(res, { type: 'status', text: 'Retrying match...' });
          return 'Error: Could not find the exact text. Make sure old_text is an exact substring match. Try with more or less surrounding context.';
        }
        fileHtml = fileHtml.replace(old_text, new_text);
        updateFile(userId, agentName, fileHtml);
        editCount++;
        sendSSE(res, { type: 'file_update', html: fileHtml });
        sendSSE(res, { type: 'status', text: `Applied edit ${editCount}...` });
        return 'Replaced successfully.';
      }

      if (name === 'replace_section') {
        const { section_name, new_html } = input;
        const startMarker = `<!-- SECTION:${section_name} -->`;
        const endMarker = `<!-- /SECTION:${section_name} -->`;
        const startIdx = fileHtml.indexOf(startMarker);
        const endIdx = fileHtml.indexOf(endMarker);
        if (startIdx === -1 || endIdx === -1) {
          return `Error: Section "${section_name}" not found.`;
        }
        fileHtml = fileHtml.slice(0, startIdx) + startMarker + '\n' + new_html.trim() + '\n' + endMarker + fileHtml.slice(endIdx + endMarker.length);
        updateFile(userId, agentName, fileHtml);
        editCount++;
        sendSSE(res, { type: 'file_update', html: fileHtml });
        sendSSE(res, { type: 'status', text: `Replaced ${section_name} section...` });
        return `Section "${section_name}" replaced successfully.`;
      }

      return 'Unknown tool';
    },
    onText: (text) => {
      // Protocol guard: a misbehaving gateway backend sometimes returns
      // the ENTIRE edited HTML document (or a JSON blob) as the text
      // block alongside the real replace_text call. The edit still
      // applies via file_update — but this text lands in the chat
      // bubble, so strip anything protocol-shaped and keep only the
      // human summary.
      const clean = stripProtocolText(text).trim();
      sendSSE(res, { type: 'edit_summary', text: clean || 'Done. Updated it on the canvas.', editCount });
    },
  });

  if (editCount === 0) {
    // Claude didn't make any edits  -  fall back to regular agent
    throw new Error('No edits were applied');
  }

  // Save a revertible snapshot of the post-edit HTML.
  commitArtifactVersion({
    userId, sessionId, agentName,
    messageId: assistantMsgId,
    content: fileHtml,
    summary: (summary || editInstruction || `Edit #${editCount}`),
  });

  return true;
}

// ── Extract social/video URLs from user messages & enrich context ──
async function enrichMessagesWithVideoContext(messages, userId, res) {
  // Grab the last user message
  const lastUserIdx = messages.findLastIndex(m => m.role === 'user');
  if (lastUserIdx < 0) return messages;

  const lastMsg = messages[lastUserIdx];
  const text = typeof lastMsg.content === 'string' ? lastMsg.content : '';
  const urls = [...new Set((text.match(SOCIAL_URL_RE) || []).map(u => u.replace(/[)}\]]+$/, '')))];
  if (urls.length === 0) return messages;

  console.log(`[orchestrate] Detected ${urls.length} social URL(s) in user message: ${urls.join(', ')}`);
  sendSSE(res, { type: 'status', text: `Extracting video${urls.length > 1 ? 's' : ''}...` });

  const results = await Promise.allSettled(urls.map(u => extractFromUrl(u)));
  const extracted = [];

  for (let i = 0; i < results.length; i++) {
    if (results[i].status !== 'fulfilled') {
      console.log(`[orchestrate] Extraction failed for ${urls[i]}: ${results[i].reason?.message}`);
      continue;
    }
    const data = results[i].value;
    extracted.push(data);

    // Persist to content_items so it shows up in future context
    try {
      const { data: existing } = await supabase
        .from('content_items')
        .select('id')
        .eq('user_id', userId)
        .eq('url', data.url)
        .limit(1);
      if (!existing || existing.length === 0) {
        await supabase.from('content_items').insert({
          user_id: userId,
          type: 'social',
          url: data.url,
          transcript: data.transcript || null,
          metadata: {
            platform: data.platform,
            title: data.title,
            description: data.description,
            uploader: data.uploader,
            duration: data.duration,
            thumbnail: data.thumbnail,
            source: data.source,
            language: data.language || null,
          },
        });
        console.log(`[orchestrate] Saved social content_item for ${data.url}`);
      }
    } catch (err) {
      console.log(`[orchestrate] Failed to save content_item: ${err.message}`);
    }
  }

  if (extracted.length === 0) return messages;

  // Build a context block and append it to the user message
  let videoContext = '\n\n--- EXTRACTED VIDEO CONTENT (auto-processed from the link above) ---\n';
  for (const data of extracted) {
    videoContext += `\nURL: ${data.url}\n`;
    if (data.platform) videoContext += `Platform: ${data.platform}\n`;
    if (data.title) videoContext += `Title: ${data.title}\n`;
    if (data.uploader) videoContext += `Creator: ${data.uploader}\n`;
    if (data.description) videoContext += `Description: ${data.description.slice(0, 1000)}\n`;
    if (data.duration) videoContext += `Duration: ${data.duration}s\n`;
    if (data.transcript) {
      videoContext += `Transcript:\n${data.transcript.slice(0, 4000)}\n`;
    } else {
      videoContext += `Transcript: not available\n`;
    }
  }
  videoContext += '--- END VIDEO CONTENT ---\n';

  // Clone messages and enrich the last user message
  const enriched = [...messages];
  enriched[lastUserIdx] = { ...lastMsg, content: text + videoContext };
  return enriched;
}

// ── CEO Orchestration ──
async function handleCeoOrchestration({ res, messages, context, searchMode, planMode = false, userId, currentHtml, currentAgent, currentContentPost, sessionId = null, assistantMsgId = null }) {
  let systemPrompt = buildCeoSystemPrompt(context);

  // Unified pipeline (Phase 4, unconditional since Phase 5): LinkedIn
  // text posts route through the shared two-phase writer
  // (generate_linkedin_post tool → variation prompt pass), and LinkedIn
  // carousel plans get /Content's caption standards. Appended AFTER the
  // full CEO prompt so it wins; plan mode strips generation tools anyway
  // so it's skipped there.
  if (!planMode) {
    systemPrompt += buildCeoUnifiedSocialAddendum();
  }

  // Plan Mode — the user asked for a multi-day content plan. The plan is
  // delivered IN CHAT via the create_content_plan tool: the client renders
  // the day-by-day list inside the chat bubble with a "Generate content"
  // button and drives per-piece generation itself afterwards (POST
  // /api/orchestrate/plan-item per piece). No canvas artifact, no scoping
  // interrogation — Brand DNA, products, sales and integration context are
  // already in this prompt.
  //
  // The tool list is filtered to [ask_user, create_content_plan] just
  // below this block, so the model physically cannot emit the legacy
  // html_template plan page or delegate anywhere.
  if (planMode) {
    systemPrompt = `=== PLAN MODE IS ACTIVE (OVERRIDES EVERY TOOL INSTRUCTION BELOW) ===
The user wants a multi-day content plan. You already know their brand — Brand DNA, products, sales, calls, and integrated data are all in this prompt. Do NOT interrogate them.

━━━━ HARD RULES (non-negotiable) ━━━━
1. You have exactly TWO tools this turn: ask_user and create_content_plan. Every other tool is stripped. Do NOT call create_artifact, delegate_to_agent, generate_image, plan_carousel, or anything else.
2. ONE question maximum, and only this one. If (and ONLY if) the user's request does not name the platform(s), call ask_user with EXACTLY:
   question: "Which platforms should I plan for?"
   options: ["LinkedIn", "YouTube", "Instagram", "X", "All platforms"]
   multi_select: true
   If the request already names platform(s) (including "all platforms" / "everywhere"), skip the question and go straight to the plan. NEVER ask a second question.
3. NEVER ask about timeframe, cadence, goal, topic, tone, or format mix. Infer them:
   - timeframe_days from the request ("next 14 days" → 14, "this week" → 7, "a month" → 30). Default 7 when unstated. Cap 31 — for longer requests plan the first 31 days and say so in your intro sentence.
   - One piece per day unless the user asked for a different cadence.
   - Topics and goals from Brand DNA, products, recent sales/calls, past content, soul notes. Specific to THIS user — never generic "productivity tips".
   - Formats per platform: linkedin → text_post | single_image | carousel. instagram → single_image | carousel | reel_script. x → text_post | single_image. youtube → youtube_script. Rotate — never more than 2 consecutive items with the same format on the same platform. Hard-sell CTAs at most 1 in every 3 items.
4. Once platforms are known, IMMEDIATELY call create_content_plan. No confirmation question, no "sound good?", no recap.
5. Chat text alongside the tool call: ONE short sentence max ("Here's your 14-day plan."). NEVER retype the plan days as prose or markdown — the client renders the day-by-day list from the tool payload. Duplicating it in text is a bug.
6. Every item's hook is a verbatim scroll-stopping first line written in the user's voice. Every topic is anchored to their actual business.
7. After the plan lands, the client shows a "Generate content" button — the USER triggers generation from there. Do NOT generate pieces yourself, do NOT delegate, even if they said "and make them too". In that case say in your intro sentence they can hit "Generate content" under the plan.

If the message is unrelated to planning, respond briefly in chat like normal.

Everything below describes non-plan-mode behavior. Ignore anything that conflicts with the rules above until Plan Mode is turned off.

---

` + systemPrompt;
  }
  // Prior plan awareness — for non-Plan-Mode messages, if the user has
  // an earlier plan artifact in this conversation and references a
  // specific piece from it ("generate Monday's carousel"), use its row
  // as the source-of-truth brief instead of asking new scoping
  // questions or making up a generic version.
  if (!planMode) {
    systemPrompt += `

=== PRIOR PLAN AWARENESS ===
Content plans can appear in conversation history two ways:
- NEW format: an assistant message containing a serialized block that starts with "[CONTENT PLAN — …]" followed by "Day N — <platform> <format>: <topic> | hook: …" lines (the client injects it).
- LEGACY format (old sessions): an html_template artifact titled "Content Plan — …" built with the old Plan Mode.

If the user's current message references a specific piece from a plan (e.g. "write day 3's post", "make the day 5 carousel", "generate Monday's post"):
1. Locate the matching item (by day / platform / format / topic) and use its platform, format, topic, hook, and cta as the source-of-truth brief. Do NOT re-ask discovery questions. Do NOT invent a generic version — the plan is authoritative.
2. Route by format: carousel → plan_carousel. text_post → create_artifact type "content_post" with the right platform. single_image → create_artifact type "content_post" plus ONE generate_image call built from the topic/hook. reel_script / youtube_script → create_artifact type "markdown_doc" with the script.
3. Do NOT retype the plan item as prose in chat before generating. Make the tool call directly.

If the user asks to generate ALL of the plan's content at once, tell them to press "Generate content" on the plan card in chat — it runs the whole batch one piece at a time.

If no prior plan exists in history, ignore this section.
`;
  }

  // If a social post (content_post) is currently in the panel, append
  // an EDIT-MODE block so the CEO knows the post exists and can call
  // create_artifact again with edits instead of just chatting. Without
  // this, the model has no awareness of what's on screen and "make it
  // punchier" produces a text reply with no preview change.
  if (currentContentPost?.content) {
    const platform = String(currentContentPost.platform || 'instagram').toLowerCase();
    systemPrompt += `

=== EXISTING SOCIAL POST IN THE PANEL (EDIT MODE) ===
There is already a ${platform} post on screen. The user can see it in the side panel. Treat any "tweak / change / shorten / lengthen / rewrite / make it X / different tone / add Y / remove Z" request as an EDIT of THIS POST.

EXISTING POST CONTENT:
---
${currentContentPost.content}
---

RULES:
- If the user is asking for an edit/change/tweak to the TEXT of this post: call create_artifact AGAIN with type:"content_post", platform:"${platform}", and the UPDATED post text in the content field. The preview will swap to the new version automatically.
- If the user is asking to ADD AN IMAGE / VISUAL / GRAPHIC to this post ("add an image", "generate an image for this", "make me a visual", "create a graphic", "give it a photo", etc.): call generate_image with a rich, specific prompt built from the post's actual content — hook, topic, brand vibe. Do NOT call create_artifact for this — the image will automatically attach to the existing post preview. Do NOT rewrite the post text. Write the image prompt in the "prompt" argument as an actionable scene description (subject, composition, mood, style, colors); do NOT use the user's real name or physical description.
- Preserve the platform exactly — do NOT switch a LinkedIn post to instagram or vice versa.
- Preserve the user's voice, paragraph rhythm, and overall length unless the user explicitly asked you to change those.
- In your text response to the user: ONE short sentence acknowledging the change ("Tightened the hook." / "Made it punchier." / "Adding a graphic now."). Do NOT paste the new post text in your chat reply — the preview shows it.
- If the user is asking a question about the post or chatting casually (no edit intent): reply conversationally, do NOT call create_artifact.
- If the user explicitly asks for a brand-new post on a different topic: call create_artifact with the new post (this becomes a separate snapshot — previous post stays accessible via its chat card).
`;
  }
  // Full CEO toolset + the shared LinkedIn writer trigger (Phase 4/5,
  // docs/unified-content-backend-plan.md).
  let tools = [...buildAgentTools(), GENERATE_LINKEDIN_POST_TOOL];
  // Plan Mode: physically restrict the CEO to ONLY ask_user (for the single
  // multi-select platform question) and create_content_plan (the plan
  // itself). The model cannot reach the legacy html_template plan path,
  // delegate, or fire any generation tool while planning.
  let ceoToolChoice; // undefined → streamXai defaults to 'auto'
  let effectiveSearchMode = searchMode;
  if (planMode) {
    const allowed = new Set(['ask_user', 'create_content_plan']);
    tools = tools.filter((t) => allowed.has(t.function?.name));
    // Use 'auto', not 'required'. With 'required' the CEO tool-loop was
    // firing multiple iterations back-to-back (Grok MUST call a tool
    // every iteration, so after create_artifact it looped again and
    // re-typed the same acknowledgement text ~15x — the transcript
    // repetition bug). With 'auto' + the tools list already trimmed to
    // [ask_user, create_artifact] + strong Plan Mode directive, the
    // model calls the right tool once then stops cleanly.
    ceoToolChoice = 'auto';
    // The searchMode branch of executeCeoOrchestrator routes to
    // streamXaiResearch which streams free text with no tools — that would
    // silently bypass the Plan Mode constraint. Force the tool-aware path.
    effectiveSearchMode = false;
  }

  sendSSE(res, {
    type: 'debug_prompt',
    site: 'ceo-orchestrator',
    // CEO runs on Claude Sonnet (with 1M context auto-opt-in). Research
    // mode still routes to Grok for the native web_search.
    model: searchMode ? 'grok-4-1-fast-non-reasoning' : 'claude-sonnet-4-6',
    systemPrompt,
    lastUser: messages?.findLast?.((m) => m.role === 'user')?.content?.toString?.().slice(0, 2000) || null,
  });

  // Auto-extract video/social URLs from the user's message before the model sees it
  const enrichedMessages = await enrichMessagesWithVideoContext(messages, userId, res);

  // Convert ask_user history back to tool call format so the model sees it used the tool
  // and continues using it for subsequent questions (prevents falling back to plain text)
  const toolAwareMessages = [];
  for (let i = 0; i < enrichedMessages.length; i++) {
    const m = enrichedMessages[i];
    if (m.wasAskUser && m.role === 'assistant') {
      const callId = `askuser-${i}`;
      // Add assistant message with tool_calls
      toolAwareMessages.push({
        role: 'assistant',
        content: null,
        tool_calls: [{
          id: callId,
          type: 'function',
          function: {
            name: 'ask_user',
            arguments: JSON.stringify({ question: m.content, options: m.askUserOptions || [] }),
          },
        }],
      });
      // Add tool result with the user's answer (next message)
      const nextMsg = enrichedMessages[i + 1];
      toolAwareMessages.push({
        role: 'tool',
        tool_call_id: callId,
        content: nextMsg?.content || 'User responded',
      });
    } else {
      toolAwareMessages.push({ role: m.role, content: m.content });
    }
  }

  sendSSE(res, { type: 'status', text: 'Thinking...' });

  // Tracks whether a real ask_user card was raised this turn — feeds the
  // text-mode question fallback below.
  let askUserFired = false;

  const result = await executeCeoOrchestrator({
    systemPrompt,
    messages: toolAwareMessages,
    tools,
    toolChoice: ceoToolChoice,
    planMode,
    searchMode: effectiveSearchMode,
    // Stop paying for upstream tokens when the client tab is gone
    // (robustness audit A1).
    abortSignal: context.clientAbortSignal,
    onChunk: (content) => {
      sendSSE(res, { type: 'text_delta', content: visibleStreamText(content) });
    },
    onSearchStatus: (status) => {
      sendSSE(res, { type: 'search_status', status });
    },
    onToolCalls: async (toolCalls) => {
      for (const call of toolCalls) {
        if (call.name === 'delegate_to_agent') {
          await handleAgentDelegation({ res, call, context, userId, currentHtml, currentAgent, priorMessages: enrichedMessages, sessionId, assistantMsgId });
        } else if (call.name === 'ask_user') {
          let args;
          try { args = JSON.parse(call.arguments); } catch { args = {}; }
          if (args.question && args.options) {
            askUserFired = true;
            sendSSE(res, { type: 'ask_user', question: args.question, options: args.options, multiSelect: args.multi_select === true });
          }
        } else if (call.name === 'save_to_soul') {
          await handleSaveSoul({ res, call, userId });
        } else if (call.name === 'push_notification') {
          await handlePushNotification({ res, call, userId });
        } else if (call.name === 'send_email') {
          await handleSendEmail({ res, call, userId });
        } else if (call.name === 'check_emails') {
          await handleCheckEmails({ res, call, userId });
        } else if (call.name === 'create_form') {
          await handleCreateForm({ res, call, userId });
        } else if (call.name === 'create_artifact' || call.name === 'generate_image' || call.name === 'plan_carousel' || call.name === 'create_content_plan') {
          let args;
          try { args = JSON.parse(call.arguments); } catch { args = {}; }
          sendSSE(res, { type: 'tool_call', name: call.name, arguments: args });
        } else if (call.name === 'generate_linkedin_post') {
          // Unified pipeline (Phase 4): run the shared two-phase LinkedIn
          // writer inline — the same variation prompts + forced
          // submit_post channel /Content's Call 2 uses — then deliver the
          // finished post to the canvas as a normal content_post artifact
          // (the frontend's existing create_artifact handling renders it).
          let args;
          try { args = JSON.parse(call.arguments); } catch { args = {}; }
          sendSSE(res, { type: 'status', text: 'Writing your LinkedIn post...' });
          try {
            const postText = await runLinkedInTextPostPass({
              messages: enrichedMessages,
              variation: args.variation === 'B' ? 'B' : 'A',
              userName: context.ceoUserName,
              brandDna: context.brandDna,
            });
            if (postText) {
              sendSSE(res, {
                type: 'tool_call',
                name: 'create_artifact',
                arguments: {
                  type: 'content_post',
                  platform: 'linkedin',
                  title: `LinkedIn post: ${postText.split('\n')[0]?.slice(0, 60) || 'draft'}`,
                  content: postText,
                },
              });
              call.result = 'Done — the finished LinkedIn post is on the user\'s canvas. Wrap up with ONE short sentence; do not repeat the post text.';
            } else {
              call.result = 'The post writer failed to produce a post. Apologize in one sentence and offer to try again.';
            }
          } catch (err) {
            console.error(`[orchestrate] generate_linkedin_post pass failed: ${err.message}`);
            call.result = 'The post writer errored. Apologize in one sentence and offer to try again.';
          }
        }
      }
    },
  });

  // Text-mode question fallback: no ask_user card was raised this turn,
  // but the final text ends in "question? + short option lines" — the
  // gateway recited the discovery script as prose. Convert it into the
  // real card: the ask_user SSE makes the frontend replace the bubble
  // with the question and raise the clickable options overlay.
  if (!askUserFired && result?.content) {
    const q = extractTextModeQuestion(result.content);
    if (q) {
      console.warn(`[ceo] Text-mode question detected — converting to ask_user card ("${q.question.slice(0, 60)}", ${q.options.length} options)`);
      sendSSE(res, { type: 'text_delta', content: q.preamble });
      sendSSE(res, { type: 'ask_user', question: q.question, options: q.options });
    }
  }
}

// ── Save to Soul (persistent business memory) ──
async function handleSaveSoul({ res, call, userId }) {
  let args;
  try { args = JSON.parse(call.arguments); } catch { args = {}; }

  const { content, category } = args;
  if (!content) return;

  try {
    await saveSoulNote(userId, content, category || 'general');
    console.log(`[orchestrate] Soul note saved: [${category}] ${content.slice(0, 80)}...`);
  } catch (err) {
    console.error('[orchestrate] Failed to save soul note:', err.message);
  }
}

// ── Push Notification ──
async function handlePushNotification({ res, call, userId }) {
  let args;
  try { args = JSON.parse(call.arguments); } catch { args = {}; }

  const { title, message, type, priority } = args;
  if (!title || !message) return;

  try {
    await supabase.from('ceo_notifications').insert({
      user_id: userId,
      title,
      message,
      type: type || 'insight',
      priority: priority || 'normal',
    });
    console.log(`[orchestrate] Notification pushed: [${type}] ${title}`);
  } catch (err) {
    console.error('[orchestrate] Failed to push notification:', err.message);
  }
}

// ── Send Email (CEO/agent calls Supabase edge function) ──
async function handleSendEmail({ res, call, userId }) {
  let args;
  try { args = JSON.parse(call.arguments); } catch { args = {}; }

  const { to, subject, body_html, body_text, cc } = args;

  console.log(`[orchestrate] send_email called: to=${JSON.stringify(to)} subject=${subject}`);

  // Validate recipients
  const recipients = Array.isArray(to) ? to.filter(Boolean) : (to ? [to] : []);
  if (recipients.length === 0 || !subject) {
    const missing = !recipients.length ? 'recipients' : 'subject';
    console.log(`[orchestrate] send_email missing ${missing}`);
    sendSSE(res, { type: 'text_delta', content: `\n\nCouldn't send. Missing ${missing}. Need an actual email address to send to.` });
    return;
  }

  sendSSE(res, { type: 'status', text: `Sending email to ${recipients.length} recipient(s)...` });

  try {
    await sendEmailViaEdgeFunction(userId, {
      to: recipients,
      subject,
      body_html: body_html || undefined,
      body_text: body_text || '',
      cc: cc || [],
    });

    const recipientList = recipients.join(', ');
    sendSSE(res, { type: 'text_delta', content: `\n\nEmail sent to ${recipientList}.` });
    console.log(`[orchestrate] Email sent to ${recipientList}`);
  } catch (err) {
    console.error('[orchestrate] Send email failed:', err.message);
    sendSSE(res, { type: 'text_delta', content: `\n\nFailed to send email: ${err.message}` });
  }
}

// ── Check Emails (CEO reads user's inbox from the synced emails table) ──
// ── Create + publish a form on the fly (CEO calls when landing page needs lead capture) ──
async function handleCreateForm({ res, call, userId }) {
  let args;
  try { args = JSON.parse(call.arguments); } catch { args = {}; }

  const rawTitle = String(args.title || '').trim() || 'Lead Capture';
  const rawQuestions = Array.isArray(args.questions) ? args.questions : [];

  console.log(`[orchestrate] create_form called: title="${rawTitle}" questions=${rawQuestions.length}`);

  if (rawQuestions.length === 0) {
    call.result = JSON.stringify({ error: 'create_form called with no questions — cannot create an empty form.' });
    sendSSE(res, { type: 'text_delta', content: "\n\nCouldn't create the form. No fields were specified." });
    return;
  }

  // Normalize questions to the shape the forms table expects.
  const questions = rawQuestions.slice(0, 10).map((q) => ({
    id: globalThis.crypto?.randomUUID?.() || `q-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    type: q.type || 'short_text',
    title: String(q.title || '').trim() || 'Question',
    description: String(q.description || ''),
    required: q.required !== false,
    options: Array.isArray(q.options) ? q.options.map(String) : [],
    settings: {},
  }));

  // Generate a slug. Prefer the DB RPC, fall back to a timestamp suffix.
  const baseSlug = rawTitle.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'form';
  let slug = `${baseSlug}-${Date.now()}`;
  try {
    const { data: slugResult } = await supabase.rpc('generate_form_slug', { base_slug: baseSlug, uid: userId });
    if (slugResult) slug = slugResult;
  } catch {
    // RPC missing / unavailable — fall back to the timestamped slug.
  }

  try {
    const { data, error } = await supabase
      .from('forms')
      .insert({
        user_id: userId,
        title: rawTitle,
        slug,
        questions,
        status: 'published',
        theme: 'minimal',
      })
      .select()
      .single();

    if (error) throw error;

    console.log(`[orchestrate] create_form OK: id=${data.id} slug=${data.slug}`);
    call.result = JSON.stringify({
      ok: true,
      id: data.id,
      slug: data.slug,
      title: data.title,
      instruction: `Now delegate to the landing-page or squeeze-page agent and include "EMBED FORM: slug=${data.slug}, title=${data.title}" in the task_description.`,
    });
    sendSSE(res, { type: 'status', text: `Created form "${data.title}"` });
  } catch (err) {
    console.error('[orchestrate] create_form failed:', err.message);
    call.result = JSON.stringify({ error: err.message });
    sendSSE(res, { type: 'text_delta', content: `\n\nCouldn't create the form: ${err.message}` });
  }
}

async function handleCheckEmails({ res, call, userId }) {
  let args;
  try { args = JSON.parse(call.arguments); } catch { args = {}; }

  const limit = Math.min(Math.max(parseInt(args.limit) || 10, 1), 30);
  const folder = ['inbox', 'sent', 'drafts'].includes(args.folder) ? args.folder : 'inbox';
  const unreadOnly = !!args.unread_only;
  const search = (args.search || '').trim();

  console.log(`[orchestrate] check_emails called: folder=${folder} limit=${limit} unread_only=${unreadOnly} search="${search}"`);
  sendSSE(res, { type: 'status', text: `Reading ${folder}...` });

  try {
    // Make sure the user actually has an email account connected
    const { data: accounts } = await supabase
      .from('email_accounts')
      .select('id, email, is_active')
      .eq('user_id', userId)
      .eq('is_active', true);

    if (!accounts || accounts.length === 0) {
      call.result = 'The user has no connected email account. Tell them they need to connect one in Settings before you can read their inbox.';
      console.log('[orchestrate] check_emails: no active email account');
      return;
    }

    let query = supabase
      .from('emails')
      .select('id, from_name, from_email, subject, body_text, is_read, is_starred, has_attachments, date, folder')
      .eq('user_id', userId)
      .eq('folder', folder)
      .order('date', { ascending: false })
      .limit(limit);

    if (unreadOnly) query = query.eq('is_read', false);
    if (search) {
      const escaped = search.replace(/[%,()]/g, '');
      query = query.or(
        `subject.ilike.%${escaped}%,from_email.ilike.%${escaped}%,from_name.ilike.%${escaped}%,body_text.ilike.%${escaped}%`
      );
    }

    const { data, error } = await query;
    if (error) throw error;

    const emails = (data || []).map((e) => ({
      from: e.from_name ? `${e.from_name} <${e.from_email}>` : e.from_email,
      subject: e.subject || '(no subject)',
      date: e.date,
      unread: !e.is_read,
      starred: e.is_starred,
      has_attachments: e.has_attachments,
      preview: (e.body_text || '').replace(/\s+/g, ' ').trim().slice(0, 300),
    }));

    // Quick unread total for context (not limited)
    let unreadTotal = null;
    try {
      const { count } = await supabase
        .from('emails')
        .select('id', { count: 'exact', head: true })
        .eq('user_id', userId)
        .eq('folder', 'inbox')
        .eq('is_read', false);
      unreadTotal = count ?? null;
    } catch {}

    const header = [
      `Connected account(s): ${accounts.map((a) => a.email).join(', ')}`,
      `Folder: ${folder}`,
      unreadTotal != null ? `Total unread in inbox: ${unreadTotal}` : null,
      `Returned: ${emails.length}${unreadOnly ? ' (unread only)' : ''}${search ? ` (search: "${search}")` : ''}`,
    ].filter(Boolean).join('\n');

    const body = emails.length === 0
      ? 'No emails matched.'
      : emails.map((e, i) => {
          const when = e.date ? new Date(e.date).toISOString() : '';
          return `${i + 1}. ${e.unread ? '[UNREAD] ' : ''}${e.starred ? '[*] ' : ''}${when}\n   From: ${e.from}\n   Subject: ${e.subject}\n   Preview: ${e.preview}`;
        }).join('\n\n');

    call.result = `${header}\n\n${body}\n\nSummarize this for the user in your own casual voice. Mention the unread count, call out anything that looks urgent or important, and ask what they want to do next.`;
    console.log(`[orchestrate] check_emails returned ${emails.length} emails (unread total: ${unreadTotal})`);
  } catch (err) {
    console.error('[orchestrate] check_emails failed:', err.message);
    call.result = `Error reading inbox: ${err.message}. Tell the user something went wrong pulling their emails and suggest they check their email connection in Settings.`;
  }
}

// Extract OFFER / AUDIENCE / TONE / CTA / OUTCOME from the CEO's
// labeled task_description so we can persist them as the user's active
// campaign brief. The CEO is already required to format these fields
// after its 4-question flow (see CEO system prompt around lines 270–
// 320), so this is a free byproduct — no extra LLM call. Used by
// handleAgentDelegation to upsert the brief in the background.
function parseBriefFromTaskDescription(taskDescription) {
  if (!taskDescription) return {};
  const get = (label) => {
    const re = new RegExp(`^\\s*${label}\\s*:\\s*(.+)$`, 'mi');
    const m = taskDescription.match(re);
    if (!m) return null;
    const value = m[1].trim();
    // Skip placeholder / skip markers the CEO uses when the user said
    // "skip all" — we don't want "placeholder" stored as the user's
    // tone in their brief.
    if (!value || /^(placeholder|tbd|n\/a|none|skip)$/i.test(value)) return null;
    return value;
  };
  const out = {};
  const offer = get('OFFER');
  const audience = get('AUDIENCE');
  const tone = get('TONE');
  const cta = get('CTA');
  const outcome = get('OUTCOME');
  if (offer) out.offer = offer;
  if (audience) out.audience = audience;
  if (tone) out.tone = tone;
  if (cta) out.goal = cta;
  if (outcome) out.key_benefit = outcome;
  return out;
}

// ── Agent Delegation (CEO calls a specialist agent) ──
async function handleAgentDelegation({ res, call, context, userId, currentHtml, currentAgent, priorMessages = [], sessionId = null, assistantMsgId = null }) {
  let args;
  try { args = JSON.parse(call.arguments); } catch { args = {}; }

  const agentName = args.agent_name;
  const taskDescription = args.task_description;

  // Auto-capture the active campaign brief from the CEO's 4-question
  // answers. Best-effort: failures are logged but don't block delegation,
  // and we never clear existing brief fields here (upsertActiveBrief only
  // touches the fields we pass).
  if (userId && userId !== 'anonymous') {
    const briefFields = parseBriefFromTaskDescription(taskDescription);
    if (Object.keys(briefFields).length > 0) {
      upsertActiveBrief(userId, briefFields)
        .then((b) => b && console.log(`[brief] auto-captured from delegation: ${Object.keys(briefFields).join(', ')}`))
        .catch((err) => console.warn('[brief] auto-capture failed:', err?.message));
    }
  }

  const agent = getAgent(agentName);
  if (!agent) {
    sendSSE(res, { type: 'error', error: `Unknown agent: ${agentName}` });
    return;
  }

  sendSSE(res, { type: 'status', text: `Delegating to ${agent.name} agent...` });
  sendSSE(res, { type: 'agent_start', agent: agent.name });

  // If we have existing HTML and the delegation is to the same agent type, try file-based editing.
  // Even when the orchestrator (correctly) delegates to the SAME agent, we still want a
  // fresh generation when the user explicitly asked for a new one ("another newsletter",
  // "fresh landing page") — and we must look across the whole in-progress question flow,
  // not just the latest user message, since by the time we reach delegation the latest
  // user message is usually a one-word answer to the orchestrator's setup questions.
  const explicitNewIntent = detectNewArtifactInFlow(priorMessages, currentAgent);
  const isEditMode = currentHtml && currentAgent && (agentName === currentAgent) && !explicitNewIntent;
  if (isEditMode && userId) {
    console.log(`[orchestrate] CEO edit mode: trying file-based edit for ${agentName}`);
    try {
      const edited = await tryFileBasedEdit({
        res,
        agent,
        agentName,
        editInstruction: taskDescription,
        priorMessages,
        sessionId,
        assistantMsgId,
        userId,
        context,
        currentHtml,
      });
      if (edited) {
        console.log('[orchestrate] CEO file-based edit succeeded');
        return;
      }
    } catch (err) {
      console.log(`[orchestrate] CEO file-based edit failed, falling back: ${err.message}`);
    }
  }

  const briefBlock = formatBriefForPrompt(context.activeBrief);
  const systemPrompt = agent.buildSystemPrompt(context.brandDna)
    + buildProductsContext(context.products)
    + (briefBlock ? `\n\n${briefBlock}` : '')
    + GLOBAL_OUTPUT_RULES;

  sendSSE(res, {
    type: 'debug_prompt',
    site: 'ceo-delegated',
    agent: agent.name,
    model: agent.model,
    systemPrompt,
    taskDescription,
  });

  // If editing but file-based failed, use section-based editing
  let agentMessages;
  if (isEditMode) {
    agentMessages = [
      {
        role: 'user',
        content: `Here is my current HTML with section markers (<!-- SECTION:name --> ... <!-- /SECTION:name -->).

Please edit ONLY the sections that need to change based on my instruction. Respond with:
- {"type":"edit","sections":{"sectionName":"<updated section HTML>"},"summary":"..."} for targeted edits
- {"type":"newsletter","html":"<full HTML>","summary":"..."} only if I ask for a full rewrite

Current HTML:
${currentHtml}`,
      },
      {
        role: 'assistant',
        content: 'I have your current HTML with section markers. What changes would you like me to make?',
      },
      {
        role: 'user',
        content: taskDescription,
      },
    ];
  } else {
    // Tell the agent to skip its question flow  -  the CEO already gathered context
    const isLandingAgent = agentName === 'landing-page' || agentName === 'landing' || agentName === 'squeeze-page' || agentName === 'squeeze';
    const isNewsletterAgent = agentName === 'newsletter';

    let designRules;
    if (isLandingAgent) {
      designRules = `DESIGN RULES FOR LANDING PAGES (non-negotiable  -  this must look like a $10k agency build):
- Modern CSS in a <style> block. Google Fonts via <link>. NO <script> tags. Max-width 1200px, responsive.
- REQUIRED SECTIONS with markers: nav, hero, social-proof, features, testimonials, how-it-works, faq, final-cta, footer.
- HERO: NEVER plain white. Use bold gradient or dark background with light text. Headline 48-64px with highlighted keywords (<span> with accent underline/background). Large pill-shaped CTA button with box-shadow. Trust badges below CTA. {{GENERATE:...}} hero image.
- VISUAL RHYTHM: Alternate section backgrounds  -  white, light gray (#f6f9fb), one dark/gradient section. NEVER all-white.
- CARDS: border-radius 16px, box-shadow 0 4px 24px rgba(0,0,0,0.06), hover: translateY(-4px) + deeper shadow. CSS grid 2-3 columns.
- CTA BUTTONS: Large (18px, 18px 40px padding), pill-shaped, brand color, shadow, hover: translateY(-2px). In hero AND final-cta.
- TYPOGRAPHY: clamp() for fluid sizes. 800 weight headlines, section heading badges ("How It Works" pill above).
- TESTIMONIALS: 3-column grid, cards with left-border accent, specific results with numbers, CSS initial avatars.
- FAQ: styled accordion with colored expand indicators.
- DECORATIVE: pill badges above headings, accent underlines on keywords, subtle background patterns on hero.
- Use {{GENERATE:prompt}} for all visual sections. Brand photos ONLY in about/founder areas.`;
    } else if (isNewsletterAgent) {
      designRules = `DESIGN RULES FOR NEWSLETTERS (non-negotiable):
- WHITE background (#FFFFFF). NEVER use dark/black backgrounds.
- Dark text (#1a1a1a or #333333) on white. NEVER white text on dark.
- Single-column, table-based layout for email client compatibility. Max-width 600px.
- ONLY inline CSS. No <style> blocks, no external stylesheets.
- Max 1-3 sentences per paragraph. Break up text aggressively.
- SINGLE CTA button only. Never 2+ CTAs competing.
- ONE accent color from brand for links, CTA, headers. Everything else is black/white/gray.
- No comparison tables. Use bullet points instead.
- No colored section backgrounds. White background everywhere.
- Include a P.S. line after the CTA.
- Keep it clean, minimal, and readable like Alex Hormozi or Morning Brew newsletters.`;
    } else {
      designRules = `DESIGN RULES (non-negotiable):
- Clean, professional design with white background.
- Dark text (#1a1a1a or #333333). Brand accent color for CTAs and highlights.
- Responsive layout with good whitespace and typography.`;
    }

    const directInstruction = `IMPORTANT: The AI CEO has already asked the user all necessary questions. You have all the context you need below. Generate the final output IMMEDIATELY  -  do NOT ask any questions.

${designRules}

Here is what to create:
${taskDescription}`;
    agentMessages = [{ role: 'user', content: directInstruction }];
  }

  const agentWithPrompt = { ...agent, systemPrompt };

  let finalContent = '';
  const result = await executeAgent({
    agent: agentWithPrompt,
    messages: agentMessages,
    onChunk: (content) => {
      finalContent = content;
      sendSSE(res, { type: 'agent_chunk', agent: agent.name, content });
    },
  });

  // Save to file store for future edits + commit an initial version
  // snapshot + capture any brief the agent emitted for cross-tool reuse.
  if (userId && result.content) {
    try {
      const parsed = tryParseJSON(result.content);
      if (parsed?.html) {
        saveFile(userId, agentName, parsed.html);
        commitArtifactVersion({
          userId, sessionId, agentName,
          messageId: assistantMsgId,
          content: parsed.html,
          summary: parsed.summary || 'Generated page',
        });
      }
      if (parsed) captureBriefFromAgentResult(userId, parsed);
    } catch {}
  }

  sendSSE(res, { type: 'agent_result', agent: agent.name, content: result.content });
}

// ── JSON parser helper ──
function tryParseJSON(str) {
  if (!str) return null;
  try { return JSON.parse(str); } catch {}
  const fenceMatch = str.match(/```(?:json)?\s*([\s\S]*?)```/);
  if (fenceMatch) {
    try { return JSON.parse(fenceMatch[1].trim()); } catch {}
  }
  const objMatch = str.match(/\{[\s\S]*\}/);
  if (objMatch) {
    try { return JSON.parse(objMatch[0]); } catch {}
  }
  return null;
}

// ─── Unified /Content orchestration (Phase 1, docs/unified-content-backend-plan.md) ───
// Dedicated route rather than a mode on POST /api/orchestrate so it:
//   - skips requireCredits('ai_ceo_message') — Content chat is not billed
//     today (the legacy path calls xAI from the client); charging it is a
//     separate product decision for later.
//   - is gated on the 'content' tab permission in server.js, not 'ai-ceo'.
// The legacy client-side Grok path remains the flag-off default; this
// route only serves clients with the unified-content flag on.
router.post('/api/content-orchestrate', async (req, res) => {
  const userId = req.user?.id;
  const { messages } = req.body || {};

  if (!messages || !Array.isArray(messages)) {
    return res.status(400).json({ error: 'messages array required' });
  }

  // Same SSE setup as POST /api/orchestrate above.
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache, no-transform');
  res.setHeader('Connection', 'keep-alive');
  res.setHeader('X-Accel-Buffering', 'no');
  if (res.socket) { res.socket.setNoDelay(true); res.socket.setTimeout(0); }
  res.flushHeaders();

  const heartbeat = setInterval(() => {
    try { res.write(': heartbeat\n\n'); } catch {}
  }, 3000);

  // Abort the upstream LLM call when the tab closes mid-stream
  // (robustness audit A1) — same pattern as plan-item.
  const abortCtl = new AbortController();
  res.on('close', () => { if (!res.writableEnded) abortCtl.abort(); });

  try {
    await handleContentOrchestration({ res, sendSSE, body: req.body, userId, abortSignal: abortCtl.signal });
    console.log('[content-orchestrate] Handler completed successfully');
  } catch (err) {
    if (abortCtl.signal.aborted || err?.name === 'AbortError') {
      console.log('[content-orchestrate] Client disconnected — upstream call aborted');
      clearInterval(heartbeat);
      try { res.end(); } catch { /* already gone */ }
      return;
    }
    console.error('[content-orchestrate] Error:', err.message, err.stack);
    const friendlyError =
      err.code === 'CONTEXT_EXCEEDED'
        ? 'This conversation has grown too large to continue. Please start a fresh chat — the AI can\'t fit everything in its working memory anymore.'
        : err.message;
    sendSSE(res, { type: 'error', error: friendlyError, code: err.code || null });
  } finally {
    clearInterval(heartbeat);
    sendSSE(res, { type: 'done' });
    try { res.write('data: [DONE]\n\n'); } catch { /* client gone */ }
    res.end();
  }
});

// ── POST /api/orchestrate/plan-item ──
// Generates ONE piece from an in-chat content plan (create_content_plan).
// The client's sequential batch runner calls this once per item, then
// drives any image generation itself (single_image → one /api/generate/
// image call, carousel → the existing per-slide loop), mirroring how the
// interactive flows already work. Plain JSON response, no SSE.
//
// Inherits requireAuth + the ai-ceo tab gate from the /api/orchestrate
// path prefix (server.js); each piece meters like one CEO message.

const PLAN_ITEM_TEXT_FORMATS = new Set(['text_post', 'reel_script', 'youtube_script']);

function buildPlanItemSystemPrompt({ context, platform, format }) {
  let prompt = 'You are the user\'s ghostwriter. You write finished, ready-to-post content in their exact brand voice. You know their business inside out. Output ONLY the deliverable itself — no preamble, no "Here\'s your post", no meta commentary, and no markdown fences around plain-text posts.';
  prompt += GLOBAL_OUTPUT_RULES;

  if (format === 'text_post' && platform === 'x') {
    prompt += `\n\n=== DELIVERABLE: X POST ===\nPlain text. If the idea lands in one punchy tweet (under 280 chars), write a single tweet. If it needs depth, write a thread: each tweet numbered "1/", "2/", … on its own block separated by a blank line, 4-8 tweets max, first tweet is the hook. End with the CTA.`;
  } else if (format === 'text_post') {
    prompt += `\n\n=== DELIVERABLE: LINKEDIN TEXT POST ===\nPlain text, ready to paste into LinkedIn. The hook is the FIRST line, verbatim from the brief. Framework-heavy (numbered points, tight single-sentence lines) for educate/sell/engage angles; story-flow (personal narrative, single-line paragraphs, emotional pivot) for nurture angles. 150-300 words. End with the CTA from the brief. No HTML, no markdown headers.`;
  } else if (format === 'reel_script') {
    prompt += `\n\n=== DELIVERABLE: REEL SCRIPT ===\nA clean SPOKEN script — the actual words said on camera, line by line, natural flow. Do NOT use labels like [HOOK], [SCENE], [VISUAL], [VOICEOVER], or timestamps. Start with the hook line (the scroll-stopper), flow into the body, end with the CTA. Keep it under 60 seconds of speech. Add a brief "Direction:" note at the very end (1-2 lines) with suggested visuals and trending audio.`;
  } else if (format === 'youtube_script') {
    prompt += `\n\n=== DELIVERABLE: YOUTUBE SCRIPT ===\nMarkdown. Structure: "# <video title>" (one strong title), "## Hook" (the first 15 seconds, verbatim spoken words), "## Intro", 3-5 "## <chapter>" body sections with the actual spoken content, "## Outro" with the CTA. Conversational spoken language throughout — this gets read aloud, not published as an article.`;
  } else if (format === 'single_image') {
    prompt += `\n\n=== DELIVERABLE: SINGLE-IMAGE POST ===\nCall compose_single_image_post with the finished post copy (plain text, hook as the first line, CTA at the end, platform-appropriate length) AND an actionable image_prompt (subject, composition, mood, style, brand-color hints, text overlay if any). The image_prompt must NEVER include a real person's name, ethnicity, or identity.`;
  } else if (format === 'carousel') {
    prompt += `\n\n=== DELIVERABLE: CAROUSEL PLAN ===\nCall plan_carousel with EVERY required field filled. Platform-appropriate slide count (Instagram 5-9, LinkedIn 7-12). Slide 1 headline = the hook from the brief. Final slide = the CTA slide. designSystem anchored to the Brand DNA colors provided below.`;
  }

  if (context.brandDna) prompt += '\n\n' + buildBrandContext(context.brandDna);
  if (context.products?.length) prompt += '\n\n' + buildProductsContext(context.products);
  const briefBlock = context.activeBrief ? formatBriefForPrompt(context.activeBrief) : '';
  if (briefBlock) prompt += briefBlock;

  return prompt;
}

function buildPlanItemUserMessage({ item, planTitle, planContext }) {
  const lines = [
    `PLAN: ${planTitle || 'Content plan'}`,
    `PIECE: Day ${item.day || '?'} — ${item.platform} ${item.format}`,
    `TOPIC: ${item.topic}`,
  ];
  if (item.hook) lines.push(`HOOK (use verbatim as the first line): ${item.hook}`);
  if (item.cta) lines.push(`CTA: ${item.cta}`);
  if (item.details) lines.push(`DETAILS / ANGLE: ${item.details}`);
  if (item.date) lines.push(`SCHEDULED FOR: ${item.date}`);
  if (planContext) {
    lines.push('', 'FULL PLAN (context only — keep this piece distinct, do NOT repeat the other items\' angles):', String(planContext).slice(0, 4000));
  }
  lines.push('', 'Write this piece now.');
  return lines.join('\n');
}

// Run one forced tool call and return its parsed arguments. planMode:true
// makes the orchestrator loop exit right after the first tool call, and
// the object-form toolChoice forces the named tool on both providers.
async function runForcedToolCall({ systemPrompt, messages, tool, toolName, abortSignal }) {
  for (let attempt = 1; attempt <= 2; attempt++) {
    let captured = null;
    await executeCeoOrchestrator({
      systemPrompt,
      messages,
      tools: [tool],
      toolChoice: { type: 'function', function: { name: toolName } },
      planMode: true,
      onChunk: () => {},
      onToolCalls: (calls) => {
        for (const c of calls) {
          if (c.name === toolName) {
            try { captured = JSON.parse(c.arguments); } catch { captured = null; }
          }
        }
      },
      abortSignal,
    });
    if (captured) return captured;
    if (abortSignal?.aborted) return null;
    console.warn(`[plan-item] forced ${toolName} returned no arguments (attempt ${attempt})`);
  }
  return null;
}

// Planning is FREE like chat (docs/credits-policy.md) — the billed part
// is the image/slide generation each piece triggers.
router.post('/api/orchestrate/plan-item', requireActiveAccount(), async (req, res) => {
  const userId = req.user?.id;
  const { item, planTitle = '', planContext = '', userName = null } = req.body || {};

  if (!item || typeof item !== 'object') {
    return res.status(400).json({ error: 'item object required' });
  }
  const platform = String(item.platform || '').toLowerCase();
  const format = String(item.format || '').toLowerCase();
  const allowedFormats = PLAN_PLATFORM_FORMATS[platform];
  if (!allowedFormats) {
    return res.status(400).json({ error: `Unknown platform "${platform}"` });
  }
  if (!allowedFormats.includes(format)) {
    return res.status(400).json({ error: `Format "${format}" is not valid for ${platform}` });
  }
  if (!item.topic) {
    return res.status(400).json({ error: 'item.topic required' });
  }

  // If the tab dies mid-generation, stop paying for upstream tokens.
  const abortCtl = new AbortController();
  res.on('close', () => { if (!res.writableEnded) abortCtl.abort(); });

  try {
    console.log(`[plan-item] userId=${userId} day=${item.day} platform=${platform} format=${format}`);
    const [context, activeBrief] = await Promise.all([
      loadUserContext(userId),
      loadActiveBrief(userId),
    ]);
    context.activeBrief = activeBrief;

    const systemPrompt = buildPlanItemSystemPrompt({ context, platform, format });
    const messages = [{ role: 'user', content: buildPlanItemUserMessage({ item, planTitle, planContext }) }];
    const title = `Day ${item.day || '?'} — ${String(item.topic).slice(0, 60)}`;

    // LinkedIn text posts go through the SAME two-phase writer every other
    // surface uses (unified architecture: fix the writer once, every tab
    // gets it) — full variation prompts + forced submit_post channel,
    // instead of the one-line ghostwriter summary this route shipped with.
    // Variation: story-flavored briefs → B (story-flow), else A
    // (framework-heavy) — mirrors the interactive CEO's routing criteria.
    if (format === 'text_post' && platform === 'linkedin') {
      const briefText = `${item.topic || ''} ${item.hook || ''} ${item.details || ''}`;
      const variation = /\b(story|journey|personal|nurture|lesson|experience|struggle|transformation)\b/i.test(briefText) ? 'B' : 'A';
      const postText = await runLinkedInTextPostPass({
        messages,
        variation,
        userName: userName || null,
        brandDna: context.brandDna,
        abortSignal: abortCtl.signal,
      });
      const content = String(postText || '').trim();
      if (!content) throw new Error('Empty generation result');
      return res.json({ kind: 'text', title, platform, format, content });
    }

    if (PLAN_ITEM_TEXT_FORMATS.has(format)) {
      const result = await executeAgent({
        agent: { name: 'plan-item-writer', provider: 'anthropic', model: SONNET_MODEL, maxTokens: 4000, systemPrompt },
        messages,
        abortSignal: abortCtl.signal,
      });
      const content = String(result?.content || '').trim();
      if (!content) throw new Error('Empty generation result');
      return res.json({ kind: 'text', title, platform, format, content });
    }

    if (format === 'single_image') {
      const args = await runForcedToolCall({
        systemPrompt,
        messages,
        tool: COMPOSE_SINGLE_IMAGE_POST_TOOL,
        toolName: 'compose_single_image_post',
        abortSignal: abortCtl.signal,
      });
      if (!args?.content || !args?.image_prompt) throw new Error('Model did not return post copy + image prompt');
      return res.json({
        kind: 'single_image', title, platform, format,
        content: String(args.content),
        image_prompt: String(args.image_prompt),
      });
    }

    // carousel (matrix guarantees platform ∈ linkedin | instagram here)
    const args = await runForcedToolCall({
      systemPrompt,
      messages,
      tool: PLAN_CAROUSEL_TOOL,
      toolName: 'plan_carousel',
      abortSignal: abortCtl.signal,
    });
    if (!args || !Array.isArray(args.slides) || args.slides.length === 0) {
      throw new Error('Model did not return a valid carousel plan');
    }
    const carouselPlan = {
      hook: args.hook || item.hook || '',
      angle: args.angle || '',
      caption: args.caption || '',
      slides: args.slides,
      designSystem: args.designSystem || {},
      // Pre-approved: the user confirmed the whole batch up front, so the
      // client renders this as a finished carousel (no approval card) and
      // runs the slide loop immediately.
      approved: true,
    };
    return res.json({
      kind: 'carousel', title, platform, format,
      content: carouselPlan.caption,
      carouselPlan,
    });
  } catch (err) {
    if (abortCtl.signal.aborted || err?.name === 'AbortError') {
      try { if (!res.headersSent) res.status(499).end(); } catch { /* client gone */ }
      return;
    }
    console.error('[plan-item] generation failed:', err?.message || err);
    if (!res.headersSent) res.status(500).json({ error: err?.message || 'Plan item generation failed' });
  }
});

export default router;
