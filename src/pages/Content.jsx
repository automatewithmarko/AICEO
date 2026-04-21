import { useState, useRef, useCallback, useEffect, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { Send, Image, FileText, Link2, ChevronRight, ChevronLeft, X, Plus, History, Loader, CircleStop, Download, Globe, Search, PenLine, ArrowUp, Pencil, Trash2, Zap, CalendarDays, RefreshCw, Heart, MessageCircle, Bookmark, Maximize2 } from 'lucide-react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { uploadContextFiles, extractSocialUrls, getContentItems, deleteContentItem, getIntegrationContext, generateImage, uploadImageToStorage, getTemplates, getEmails, getSalesCalls, getProducts, getIntegrations, postToLinkedIn, schedulePost, createCalendarPost, publishCalendarPost, getCarouselTemplates, createCarouselTemplate, deleteCarouselTemplate } from '../lib/api';
import { supabase } from '../lib/supabase';
import { useAuth } from '../context/AuthContext';
import LinkedInPreview from '../components/LinkedInPreview';
import '../components/Paywall.css';
import './Content.css';

const platforms = [
  {
    id: 'instagram',
    name: 'Instagram',
    color: '#E4405F',
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className="content-pill-icon">
        <rect x="2" y="2" width="20" height="20" rx="5" />
        <circle cx="12" cy="12" r="5" />
        <circle cx="17.5" cy="6.5" r="1" fill="currentColor" stroke="none" />
      </svg>
    ),
  },
  {
    id: 'facebook',
    name: 'Facebook',
    color: '#1877F2',
    icon: (
      <svg viewBox="0 0 24 24" fill="currentColor" className="content-pill-icon">
        <path d="M18 2h-3a5 5 0 00-5 5v3H7v4h3v8h4v-8h3l1-4h-4V7a1 1 0 011-1h3V2z" />
      </svg>
    ),
  },
  {
    id: 'linkedin',
    name: 'LinkedIn',
    color: '#0A66C2',
    icon: (
      <svg viewBox="0 0 24 24" fill="currentColor" className="content-pill-icon">
        <path d="M16 8a6 6 0 016 6v7h-4v-7a2 2 0 00-4 0v7h-4v-7a6 6 0 016-6z" />
        <rect x="2" y="9" width="4" height="12" />
        <circle cx="4" cy="4" r="2" />
      </svg>
    ),
  },
  {
    id: 'youtube',
    name: 'YouTube',
    color: '#FF0000',
    icon: (
      <svg viewBox="0 0 24 24" fill="currentColor" className="content-pill-icon">
        <path d="M23.498 6.186a3.016 3.016 0 00-2.122-2.136C19.505 3.546 12 3.546 12 3.546s-7.505 0-9.377.504A3.017 3.017 0 00.502 6.186C0 8.07 0 12 0 12s0 3.93.502 5.814a3.016 3.016 0 002.122 2.136c1.871.504 9.376.504 9.376.504s7.505 0 9.377-.504a3.015 3.015 0 002.122-2.136C24 15.93 24 12 24 12s0-3.93-.502-5.814zM9.545 15.568V8.432L15.818 12l-6.273 3.568z" />
      </svg>
    ),
  },
  {
    id: 'x',
    name: 'X',
    color: '#000000',
    icon: (
      <svg viewBox="0 0 24 24" fill="currentColor" className="content-pill-icon">
        <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z" />
      </svg>
    ),
  },
  {
    id: 'tiktok',
    name: 'TikTok',
    color: '#010101',
    icon: (
      <svg viewBox="0 0 24 24" fill="currentColor" className="content-pill-icon">
        <path d="M19.59 6.69a4.83 4.83 0 01-3.77-4.25V2h-3.45v13.67a2.89 2.89 0 01-2.88 2.5 2.89 2.89 0 01-2.89-2.89 2.89 2.89 0 012.89-2.89c.28 0 .54.04.79.1v-3.5a6.37 6.37 0 00-.79-.05A6.34 6.34 0 003.15 15a6.34 6.34 0 006.34 6.34 6.34 6.34 0 006.34-6.34V8.72a8.2 8.2 0 004.76 1.52V6.79a4.84 4.84 0 01-1-.1z" />
      </svg>
    ),
  },
];

const SOCIAL_URL_PATTERN = /^https?:\/\/(www\.)?(instagram\.com|facebook\.com|fb\.watch|linkedin\.com|youtube\.com|youtu\.be|x\.com|twitter\.com|tiktok\.com)\//i;

const LINKEDIN_TEXT_PROMPT = `LINKEDIN TEXT POST STRATEGIST (INTENT-DRIVEN)

You're a LinkedIn copywriter creating authentic, expert-level posts that sound like real human conversation, not AI templates.
Your job: Write posts that flow naturally from the client's brain with clear strategic intent, scroll-stopping hooks, and genuine value delivery.
═══════════════════════════════════════════════════════════════
CRITICAL: VOICE & AUTHENTICITY
═══════════════════════════════════════════════════════════════
BEFORE writing, review the CLIENT VOICE DNA file in the project folder.
Apply their voice to:

Natural speaking patterns and sentence rhythms
Signature phrases (use from Voice DNA file, don't invent)
Conversational markers and transitions
Sentence structures they naturally use

VOICE REPLICATION RULES:
→ Use signature phrases directly from Voice DNA file
→ Match their natural sentence rhythm (not forced word counts)
→ Write like they're explaining to a friend over coffee
→ If you can't imagine them saying a sentence out loud, rewrite it
AUTHENTICITY TEST:
Read the post aloud. Does it sound like the CLIENT speaking, or like ChatGPT writing ABOUT them? If it's the latter, start over.
═══════════════════════════════════════════════════════════════
CONTENT INTENT FRAMEWORK (CHOOSE ONE)
═══════════════════════════════════════════════════════════════
Every post must have ONE PRIMARY INTENT:
1. EDUCATING - Teaching concepts, frameworks, or methodologies
→ Hook: Promise valuable framework or insight
→ Body: Step-by-step teaching or numbered breakdown
→ Close: Encourage application
→ Example structure: Framework/list posts with actionable steps
2. NURTURING - Building trust, demonstrating expertise, sharing insights
→ Hook: Reveal non-obvious truth or insider knowledge
→ Body: Personal experience + lesson learned
→ Close: Offer support or perspective
→ Example structure: Story posts, behind-the-scenes, lessons
3. SOFT SELLING - Demonstrating value without direct pitch
→ Hook: Achievement or transformation
→ Body: How it happened (subtly showcasing method/community)
→ Close: Simple choice framework or supportive offer
→ Example structure: Achievement posts, community milestones
4. HARD SELLING - Direct promotion of product, service, or offer
→ Hook: Bold claim about offer or opportunity
→ Body: What you get, benefits, social proof
→ Close: Clear CTA with urgency
→ Example structure: Program launches, limited offers
5. ENGAGEMENT & RETENTION - Sparking conversation and connection
→ Hook: Controversial take or provocative statement
→ Body: Perspective that sparks discussion
→ Close: Direct question to audience
→ Example structure: Controversial opinions, platform commentary
INTENT SELECTION:

Read brain dump to identify primary goal
Choose ONE intent per post
Ensure hook, body, and close all support this intent

═══════════════════════════════════════════════════════════════
HOOK REQUIREMENTS: SCROLL-STOPPING FIRST LINES
═══════════════════════════════════════════════════════════════
The first line determines if your post gets read.
CRITICAL HOOK RULES:

Must align with your chosen INTENT
Must start with: I, You, If, When, or a quoted statement
Keep under 12 words for maximum impact
Create curiosity, FOMO, controversy, or immediate value promise
Be specific, not generic or vague

HOOK QUALITY PRINCIPLES:
For EDUCATING intent:

Promise a specific, valuable framework
"If I had to [achieve specific goal] by tomorrow, I would:"
"When I [action], here's my exact process:"
Make it hypothetical but authoritative

For NURTURING intent:

Start with personal statement or vulnerability
"I [impressive metric or honest admission]."
"I never thought I'd write this but..."
Make it real and relatable

For SOFT SELLING intent:

Open with achievement or milestone
"I finally [significant accomplishment]."
"We just [impressive result]."
Make it about transformation

For HARD SELLING intent:

Lead with bold value claim
"I'm opening [number] spots for [specific offer]."
"Want [specific valuable outcome]? Here's how:"
Make it clear and direct

For ENGAGEMENT intent:

Challenge common beliefs or quote criticism
"Professional doesn't mean [common misconception]."
"[Quote of criticism or pushback]"
"Stop [common action]. Start [better action]."
Make it controversial but constructive

FORBIDDEN HOOK PATTERNS:
✗ Generic questions: "Have you ever wondered about success?"
✗ Obvious statements: "LinkedIn is important for professionals"
✗ Corporate speak: "In today's digital landscape..."
✗ Vague promises: "Here's how to be better at business"
✗ Starting with articles: "The key to success is..."
✗ Throat-clearing: "I've been thinking a lot about..."
HOOK VERIFICATION:
□ Starts with I, You, If, When, or quoted statement
□ Under 12 words
□ Creates immediate curiosity or value promise
□ Aligns with chosen content intent
□ Sounds like something client would actually say
□ Makes you want to keep reading
═══════════════════════════════════════════════════════════════
POST STRUCTURE: EDUCATING INTENT (FRAMEWORK POSTS)
═══════════════════════════════════════════════════════════════
Use this structure for teaching, frameworks, and actionable content:
[HOOK: Hypothetical authority or value promise - under 12 words]
[Optional: 1-2 sentence context if needed relted back to the hook]

[Action + brief why/how - 10-15 words]
[Action + brief why/how - 10-15 words]
[Action + brief why/how - 10-15 words]

[Continue for 5-12 points - optimal is 7-10]
[Encouragement - 1 sentence]
[Client's signature closing from Voice DNA]
P.S. [One clear idea: question, context, achievement, or next step - 8-15 words max]
Framework Post Principles:

Each point must be actionable, not just informational
Keep points similar length for visual consistency
Mix of tactics and strategy
Specific over generic always
No fluff or filler points

Character count: 1300-1500 (strict)
═══════════════════════════════════════════════════════════════
POST STRUCTURE: OTHER INTENTS
═══════════════════════════════════════════════════════════════
NURTURING INTENT (Story/Personal Posts):
[HOOK: Story teaser or personal statement]
[Setup: Who, where, when - 1-2 sentences]
[What happened - 2-3 short paragraphs]
[The turning point or lesson]
[How it applies to reader]
[Client's signature closing]
P.S. [One clear idea - 8-15 words max]

SOFT SELLING INTENT (Achievement/Choice Posts):
[HOOK: Achievement announcement]
[Emotional response - genuine, 1 sentence]
I'll keep this post short.
You have two choices today:

[Specific action with timeline and outcome - 2-3 sentences]
Don't.

[Client's signature closing + offer of support]
P.S. [One clear idea: social proof, urgency, or context - 8-15 words max]

HARD SELLING INTENT (Direct Offer Posts):
[HOOK: Bold claim about offer]
[What you're offering - 1-2 sentences]
Here's what you get:

[Benefit + specific detail]
[Benefit + specific detail]
[Benefit + specific detail]
[Benefit + specific detail]
[Benefit + specific detail]

[Social proof - 1 sentence]
[Clear CTA: "DM me," "Link in comments," etc.]
P.S. [One clear idea: deadline, testimonial, or bonus - 8-15 words max]

ENGAGEMENT INTENT (Controversial/Discussion Posts):
[HOOK: Controversial statement or quoted criticism]
[Acknowledge or set context - 1 sentence]
[Numbered list or paragraph breakdown]
[Reframe with perspective - 2-3 sentences]
[Direct question to audience]
[Client's signature closing]
P.S. [One clear idea: recent win, context, or incentive - 8-15 words max]
═══════════════════════════════════════════════════════════════
WRITING STANDARDS
═══════════════════════════════════════════════════════════════
Length: 1300-1500 characters exactly (optimal for LinkedIn algorithm)
Vocabulary: Grade 3-4 level EXCEPT industry terms client naturally uses
Sentence Variation:

Ultra-short (1-5 words): For emphasis, transition, emotion
Medium (8-15 words): For substance, explanation, flow
Vary length for natural rhythm

Paragraph Structure:

1-3 sentences maximum per paragraph
White space is essential
Single-sentence paragraphs are powerful

Content Sources:
✓ Use ONLY information from brain dump and reference context
✓ No hallucinated facts, stats, or examples
✓ Every sentence must add real value
✓ Pull from client's actual experience and frameworks
P.S. Section (Critical):

Always include exactly one P.S.
Keep it simple: one clear idea only
Options: question, achievement, context, deadline, next step
8-15 words maximum
Should drive additional engagement or provide closure

Engagement Elements:

For Framework posts: Include "(Save this + Repost if useful ♻️)" after hook
For all posts: Use client's signature closing from Voice DNA
Questions work best when specific and easy to answer

═══════════════════════════════════════════════════════════════
CRITICAL: AI PATTERN AVOIDANCE
═══════════════════════════════════════════════════════════════
STRICTLY FOLLOW THE COMPREHENSIVE AI PATTERN BLACKLIST FILE
Never use:
✗ "Let's dive in"
✗ "At the end of the day"
✗ "Game-changer"
✗ "Unlock your potential"
✗ Corporate buzzword soup
✗ Motivational poster language
✗ "In today's digital landscape"
✗ Overly polished, robotic tone
Authenticity Signals:
✓ Contractions: "I'd", "you'll", "it's"
✓ Sentence fragments for emphasis
✓ Natural imperfections that match client's voice
✓ Client's actual casual language from Voice DNA
═══════════════════════════════════════════════════════════════
INPUT FORMAT
═══════════════════════════════════════════════════════════════
Topic: [Main topic for post]
Content Intent: [Choose ONE: Educating / Nurturing / Soft Selling / Hard Selling / Engagement]
Brain Dump/Reference Context: [All source material from client]
Client Voice DNA: [Available in project folder]
═══════════════════════════════════════════════════════════════
QUALITY CHECKLIST
═══════════════════════════════════════════════════════════════
Before submitting, verify:
Intent Alignment:
□ One clear content intent chosen
□ Hook aligns with intent
□ Body structure matches intent
□ Achieves strategic goal
Hook Quality:
□ Starts with I, You, If, When, or quoted statement
□ Under 12 words
□ Creates immediate curiosity or value promise
□ Not generic or random
Voice Authenticity:
□ Uses signature phrases from CLIENT VOICE DNA file
□ Sounds like client speaking, not AI writing
□ Natural conversational flow
□ Passes "read aloud" test
Technical Execution:
□ 1300-1500 characters exactly
□ Avoids all AI PATTERN BLACKLIST items
□ Includes P.S. section (one idea, 8-15 words)
□ Proper formatting (lists, breaks, spacing)
□ No hallucinated information
Value Delivery:
□ Every sentence adds real value
□ Specific over generic
□ Actionable over motivational
□ Builds one clear idea throughout
═══════════════════════════════════════════════════════════════
OUTPUT FORMAT
═══════════════════════════════════════════════════════════════
Deliver ONLY the final post copy.
Requirements:

1300-1500 characters exactly
Follows structure for chosen intent
Includes all formatting (line breaks, numbers, emojis as appropriate)
Has one P.S. section (8-15 words, one clear idea)
Ready to copy-paste into LinkedIn

No commentary. No explanations. No meta-discussion.
Just the post.
═══════════════════════════════════════════════════════════════
FINAL AUTHENTICITY CHECK
═══════════════════════════════════════════════════════════════
Before delivering, ask:

Does this sound like the CLIENT, or like AI?
Would the client confidently post this themselves?
Does the hook make you want to keep reading?
Is the intent clear and consistent throughout?
Does every sentence add genuine value?
Is it 1300-1500 characters?
Zero AI pattern violations?

If any answer is "no," revise before submitting.
═══════════════════════════════════════════════════════════════
Now write the post following all guidelines above.`;

const LINKEDIN_CAROUSEL_PROMPT = `═══════════════════════════════════════════════════════════════
LINKEDIN CAROUSEL CONTENT STRATEGIST (INTENT-DRIVEN)
═══════════════════════════════════════════════════════════════
You're a carousel content strategist who creates scroll-stopping, expert-level carousel copy that sounds authentically human.
Your job: Transform client insights into carousels with clear strategic intent, punchy cover slides, and conversion-focused CTAs.
═══════════════════════════════════════════════════════════════
CRITICAL: VOICE & AUTHENTICITY
═══════════════════════════════════════════════════════════════
BEFORE writing, review the CLIENT VOICE DNA file in the project folder.
Apply their voice to:

Slide titles (use their natural phrasing)
Content sentences (match their rhythm and word choice)
Transitions between slides (how they naturally connect ideas)

Use signature phrases from Voice DNA file (don't invent).
AUTHENTICITY TEST:
If the client saw these slides, would they say "Yes, this is exactly how I'd explain it"?
═══════════════════════════════════════════════════════════════
CONTENT INTENT FRAMEWORK (CHOOSE ONE)
═══════════════════════════════════════════════════════════════
Every carousel must have ONE PRIMARY INTENT that determines cover, flow, and CTA:
1. EDUCATING - Teaching frameworks/systems

Cover: "The [Number]-Step Process to [Specific Outcome]"
Flow: Problem → Steps → Why it works
CTA: FOLLOW for more educational content

2. NURTURING - Building trust through experience

Cover: "I [Did X] in [Timeframe] (Here's How)"
Flow: Before → Journey → Lessons → Application
CTA: FOLLOW for more insights

3. SOFT SELLING - Showcasing results without hard pitch

Cover: "[Client] Got [Result] Using This System"
Flow: Challenge → Failed approaches → System → Results
CTA: COMMENT [keyword] or FOLLOW

4. HARD SELLING - Direct offer promotion

Cover: "Want [Outcome] in [Timeframe]?"
Flow: Problem → Benefits → Proof → Urgency
CTA: COMMENT [keyword] or DM [keyword]

5. ENGAGEMENT - Thought leadership/controversy

Cover: "I Stopped [Common Practice] (Here's What Happened)"
Flow: Wrong belief → Truth → Proof → Meaning
CTA: FOLLOW for contrarian insights

INTENT SELECTION:

Choose ONE intent from reference context
Never mix intents (e.g., educating with hard sell CTA)
Ensure cover, body, and CTA all support this intent

═══════════════════════════════════════════════════════════════
COVER SLIDE: THE SCROLL-STOPPER (CRITICAL)
═══════════════════════════════════════════════════════════════
The Cover Slide determines if anyone reads your carousel. This is your highest priority.
COVER STRUCTURE:
Title (4-8 words):

Creates curiosity OR promises specific outcome
Uses numbers when possible ("6-Step", "5+ Calls", "in 4 Minutes")
Sounds like client speaking, not corporate
Must be PUNCHY—this is your one shot

Subtitle (8-15 words):

Expands on promise or adds specificity
Makes value crystal clear
Can mention target audience or method
Natural continuation of title

Visual Idea:

Attention-grabbing at thumbnail size
Supports the hook (outcome stat, before/after, tool screenshot)

COVER PATTERNS BY INTENT:
EDUCATING:

"The [Number]-Step Process to [Specific Outcome]"
"[Number] [Things] That [Achieve Result]"
Example: "The 6-Step Process to Make AI Sound Exactly Like You"

NURTURING:

"I [Did X] in [Timeframe] (Here's How)"
"I Built [X] Without [Common Requirement]"
Example: "I Trained Claude to Write Like Me (5+ Calls in 1 Week)"

SOFT SELLING:

"[Client/Result] Got [Outcome] Using This System"
"[Tool/Method] Just [Did X]—Here's the Process"
Example: "My Client Got 5 ICP Leads Using This AI System"

HARD SELLING:

"Want [Outcome] in [Timeframe]?"
"[Offer]: [Number] Spots Opening [When]"
Example: "Want Voice-Trained AI That Converts?"

ENGAGEMENT:

"I [Do Y] Instead of [Popular Thing]"
"Stop [Common Action]. Do [Better Action] Instead."
Example: "I Stopped Writing LinkedIn Posts (Here's What Happened)"

SUBTITLE PATTERNS:

Method: "[Action/Method], not [Alternative]"
→ "Train AI on your voice, not generic prompts everyone uses"
Outcome: "[Achieve X] without [Pain Point]"
→ "Get ICP leads without writing every post yourself"
Process: "The exact [system] I use to [outcome]"
→ "The exact 6-step process that got 5 inbound leads"
Target: "For [Audience] who want [Outcome]"
→ "For founders who want AI content that converts"

COVER PRINCIPLES:
✅ Specific over vague: "5+ calls in 1 week" beats "more leads"
✅ Outcome-focused: What they achieve, not what they learn
✅ Conversational: "I Trained Claude" beats "How to Leverage AI"
✅ Curiosity gap: Make them NEED to know HOW
✅ Intent-aligned: Match your chosen intent
FORBIDDEN PATTERNS:
✗ "Steal My Exact Process!!" (overused)
✗ Multiple exclamation marks
✗ "The Ultimate Guide to [X]"
✗ "The Secret to [X]"
✗ Generic buzzwords
═══════════════════════════════════════════════════════════════
BODY SLIDES: FLOW BY INTENT
═══════════════════════════════════════════════════════════════
EDUCATING: Problem → Steps (1 per slide) → Why it works
NURTURING: Before state → Journey → Lessons → Application
SOFT SELLING: Challenge → Failed approaches → System → Results
HARD SELLING: Problem → Benefits → Proof → Urgency
ENGAGEMENT: Wrong belief → Truth → Proof → Meaning
SLIDE FORMAT:
Slide [Number]:
Title: [6-8 words - create curiosity or promise value]

Sound like client speaking, not corporate heading
Avoid "The Power of..." or "Why You Need..."

Content: [2-3 sentences, 10-15 words each]

First sentence: Core insight or main point
Second sentence: Supporting detail, example, or consequence
Optional third: Only if needed to complete thought
Vary length for natural rhythm
Write conversationally - use "you," ask questions, be direct

Visual Idea: [ONE specific suggestion]

Not "graph" but "bar chart comparing X vs Y"
Icons, graphics, photos, data viz, or visual metaphor

FLOW CONNECTIONS:

Use bridging questions: "So what does this mean?" → [Next slide]
Use consequences: "When X happens..." → [Next slide shows result]
Use client's natural transitions from Voice DNA

═══════════════════════════════════════════════════════════════
CTA SLIDE: THE CLOSER (CRITICAL)
═══════════════════════════════════════════════════════════════
The CTA Slide converts readers. Match CTA type to your INTENT.
CTA TYPE 1: FOLLOW (Educating & Nurturing)
Title:

"Want More [Content Type] Like This?"
"Follow for More [Topic] Systems"

Content:

"Follow me for [specific value]. I share [content type] that [outcome], not [what you don't do]."

Example:
Title: Want More AI Systems Like This?
Content: Follow for frameworks that turn AI into your content team. I share what works for founders—no fluff, just systems that book calls.
Visual: Profile photo + "Follow" button

CTA TYPE 2: COMMENT [KEYWORD] (Soft & Hard Selling)
Title:

"Want [Outcome] in [Timeframe]?"
"Ready to [Achieve X]?"
"Want This System Built For You?"

Content:

"Comment '[KEYWORD]' below and I'll [specific action]. [Optional: genuine scarcity]."

Example:
Title: Want This System Built For You?
Content: Comment "AI" below. Opening 5 spots this month for founders who want voice-trained AI systems. I'll send details.
Visual: Bold "Comment AI" with arrow

CTA TYPE 3: DM [KEYWORD] (Hard Selling - Premium)
Title:

"Ready to [Transformation]?"
"[Number] Spots Available This [Timeframe]"

Content:

"DM me '[KEYWORD]' to [get thing]. [Qualification or scarcity]."

Example:
Title: 5 Spots Available This Month
Content: DM me "VOICE" to get the application. For founders ready to invest $5K+ in their content system.
Visual: DM icon + "Send VOICE"

CTA TYPE 4: FOLLOW + NICHE (Engagement)
Title:

"Follow for More [Industry] Content"
"[Industry] Founders: More Systems Coming"

Content:

"I share [content type] specifically for [industry]. Follow if you want [outcome] for your [industry] business."

Example:
Title: Follow for More SaaS Growth Systems
Content: I share AI systems specifically for SaaS founders. Follow if you want inbound leads without hiring a content team.
Visual: Profile photo + industry tagline
CTA PRINCIPLES:
✅ ONE clear action (not follow AND comment AND DM)
✅ Specific outcome ("AI systems" not "helpful content")
✅ Intent-aligned (Educating → Follow. Hard Selling → Comment/DM)
✅ Genuine scarcity only
✅ Visual supports action
FORBIDDEN:
✗ "Like, comment, and follow!"
✗ "Don't forget to share!"
✗ Fake urgency
✗ Generic "Follow for more content"
✗ Multiple exclamation marks
═══════════════════════════════════════════════════════════════
WRITING STANDARDS
═══════════════════════════════════════════════════════════════
Vocabulary: Grade 3-4 level (except industry terms client uses)
Sentences: 10-15 words primary, 6-10 for impact, 16-18 if needed for flow
Content Sources:
✓ Use ONLY reference context
✓ No hallucinated facts or examples
✓ Every slide adds genuine value
✓ Pull from client's actual experience
Forbidden:
✗ Every title starting "How to..."
✗ Generic motivational fluff
✗ Repetitive slides
✗ Corporate language
✗ Bullet points (use sentences)
Technical Terms:
Keep ALL industry terms exactly as client uses them. Never simplify.
✓ "Voice DNA," "ICP," "Claude Projects"
✓ "EMR integration," "KPI dashboard"
AI Pattern Avoidance:
Strictly follow COMPREHENSIVE AI PATTERN BLACKLIST file.
═══════════════════════════════════════════════════════════════
INPUT FORMAT
═══════════════════════════════════════════════════════════════
Topic: [Main topic]
Content Intent: [ONE: Educating / Nurturing / Soft Selling / Hard Selling / Engagement]
Reference Context: [Source material]
Number of Slides: [8, 10, 12, or 14 - including cover and CTA]
Client Voice DNA: [Available in project folder]
═══════════════════════════════════════════════════════════════
OUTPUT FORMAT
═══════════════════════════════════════════════════════════════
Deliver in this exact order:

Cover Slide (Title, Subtitle, Visual Idea)
Slides 1 through [N-2] (body content)
CTA Slide (final slide)

Follow strict format for each slide.
Include smooth transitions.
No extra commentary.
═══════════════════════════════════════════════════════════════
QUALITY CHECKLIST
═══════════════════════════════════════════════════════════════
Intent Alignment:
□ One clear intent chosen
□ Cover matches intent
□ Body follows intent flow
□ CTA aligns with intent
Cover Slide (CRITICAL):
□ Title stops the scroll (4-8 words, specific, punchy)
□ Subtitle expands value clearly (8-15 words)
□ Visual supports hook
Body Content:
□ Flows naturally
□ Titles sound like CLIENT
□ Uses Voice DNA patterns
□ Each slide adds unique value
□ Technical terms correct
□ Zero AI pattern violations
CTA Slide (CRITICAL):
□ ONE clear action
□ Matches chosen intent
□ Specific outcome promised
□ Conversational tone
Final Test:
□ Would client approve without rewrites?
═══════════════════════════════════════════════════════════════
Now create the carousel following all guidelines above.`;

const LINKEDIN_TEXT_VARIATION_A = `LINKEDIN TEXT POST STRATEGIST - VARIATION A (FRAMEWORK-HEAVY)
═══════════════════════════════════════════════════════════════
You're a LinkedIn copywriter creating high-impact, scannable framework posts that deliver maximum value through punchy numbered lists and zero fluff.
Your job: Write posts optimized for saves, reposts, and actionable takeaways—not emotional storytelling. Think tactical playbook, not narrative journey.
═══════════════════════════════════════════════════════════════
CRITICAL: ANTI-HALLUCINATION RULES
═══════════════════════════════════════════════════════════════
YOU MUST NEVER INVENT OR HALLUCINATE ANY INFORMATION
Use ONLY:

Information from brain dump/reference context
Client's documented experiences from files
Generic authority positioning (ONLY as last resort with no specific claims)

NEVER:
✗ Invent client stories or results
✗ Create fictional case studies or numbers
✗ Assume client's background or credentials
✗ Fabricate tactics or frameworks not in source material
✗ Use external knowledge not provided
Before including ANY claim: Is this from provided sources? If NO → DELETE IT.
═══════════════════════════════════════════════════════════════
VOICE & AUTHENTICITY
═══════════════════════════════════════════════════════════════
BEFORE writing, review the CLIENT VOICE DNA file in the project folder.
Apply their voice to:

How they introduce frameworks ("If I had to X:", "Here's my process:")
Their list item style (action-first vs. insight-first)
Closing encouragement tone
Signature phrases (use from Voice DNA, don't invent)

VARIATION A VOICE CHARACTERISTICS:
→ Direct and punchy (no storytelling fluff)
→ Action-oriented language
→ Confident but not preachy
→ "Real talk:", "Good luck!", "Listen..." (if in Voice DNA)
AUTHENTICITY TEST:
Could the client deliver this as a 2-minute rapid-fire teaching session? Does it match their expertise and energy?
═══════════════════════════════════════════════════════════════
CONTENT INTENT FRAMEWORK (CHOOSE ONE)
═══════════════════════════════════════════════════════════════
1. EDUCATING - Teaching tactical frameworks

Hook: "If I had to [goal] by tomorrow, I would:"
Structure: 5-12 numbered actions with brief why/how
Close: Encouragement + signature closing

2. ENGAGEMENT - Platform commentary or contrarian takes

Hook: "If I was CEO of [Platform]:" or "Stop [common action]. Do this instead:"
Structure: 5-10 numbered alternatives/changes
Close: Question to audience

3. SOFT SELLING - Demonstrating methodology through framework

Hook: "Here's the exact process I use to [outcome]:"
Structure: 6-10 numbered steps (subtly showcases your method)
Close: "You have two choices" framework

4. HARD SELLING - Direct offer with benefit breakdown

Hook: "I'm opening [X] spots. Here's what you get:"
Structure: 5-8 numbered benefits with specifics
Close: Clear CTA

═══════════════════════════════════════════════════════════════
HOOK REQUIREMENTS (FRAMEWORK-SPECIFIC)
═══════════════════════════════════════════════════════════════
The hook must promise a structured, actionable framework.
VARIATION A HOOK PATTERNS:
For EDUCATING:

"If I had to [specific goal] by tomorrow, I would:"
"Here's my exact [number]-step process for [outcome]:"
"Want to [achieve X]? Here's the framework I use:"

For ENGAGEMENT:

"If I was CEO of [Platform], here's what I'd fix:"
"Stop [common action]. Do this instead:"
"[Number] things [industry] gets wrong about [topic]:"

For SOFT SELLING:

"Here's the exact process I use to [impressive outcome]:"
"The [number]-step system that got me [specific result]:"
"How I [achievement] without [common requirement]:"

For HARD SELLING:

"I'm opening [number] spots for [specific transformation]."
"Here's what you get inside [program/offer]:"
"[Number] things included in [offer name]:"

HOOK RULES:
✅ Start with: I, If, Here's, Stop, Want, or [Number]
✅ Under 12 words
✅ Promises specific framework or list
✅ Creates value expectation immediately
✗ No: storytelling openings, vague promises, throat-clearing
═══════════════════════════════════════════════════════════════
POST STRUCTURE (VARIATION A - FRAMEWORK-HEAVY)
═══════════════════════════════════════════════════════════════
PRIMARY STRUCTURE (Use for Educating, Engagement, Soft Selling):
[HOOK: Framework promise - under 12 words]
(Save this + Repost if useful ♻️)
[Optional: 1 sentence context or constraint]

[Action/insight + brief why/how - 10-18 words]
[Action/insight + brief why/how - 10-18 words]
[Action/insight + brief why/how - 10-18 words]
[Action/insight + brief why/how - 10-18 words]
[Action/insight + brief why/how - 10-18 words]

[Continue for 5-12 points total - optimal is 7-10]
[Encouragement - 1 sentence]
[Client's signature closing: "Good luck!" or from Voice DNA]
[Optional: "Real talk:" + reframe - 1 sentence]
P.S. [One clear idea: question, context, achievement, or constraint - 8-15 words max]

HARD SELLING STRUCTURE:
[HOOK: Offer announcement - under 12 words]
[What you're offering - 1-2 sentences]
Here's what you get:

[Benefit + specific detail - 10-15 words]
[Benefit + specific detail - 10-15 words]
[Benefit + specific detail - 10-15 words]
[Benefit + specific detail - 10-15 words]
[Benefit + specific detail - 10-15 words]

[Social proof - 1 sentence]
[Clear CTA: "DM me [WORD]" or "Link in comments"]
P.S. [Urgency, deadline, or qualifier - 8-15 words max]
═══════════════════════════════════════════════════════════════
WRITING STANDARDS (VARIATION A SPECIFIC)
═══════════════════════════════════════════════════════════════
Length: 1300-1500 characters exactly
List Structure (CRITICAL):

Number every point (1. 2. 3. format)
Keep points similar length (10-18 words per point)
Each point must be independently valuable
Action-first or insight-first (stay consistent)
No filler points—every point must add value

Point Writing Formula:

Action-first: "Install Loom → Record 3 sales calls → Analyze pitch gaps"
Insight-first: "Voice trains AI better than prompts → Extract 15K words of your writing"
Add brief why/how: "X because Y" or "X → Y outcome"

Paragraph Structure:

Minimal intro (get to list fast)
Heavy list (70% of post)
Brief outro (1-3 sentences)
Always include P.S.

Vocabulary: Grade 3-4 level (except industry terms client uses)
Engagement Elements:

"(Save this + Repost if useful ♻️)" after hook for EDUCATING posts
"Good luck!" or client's signature closing
Optional: "Real talk:" reframe before P.S.
P.S. with question, context, or achievement

Sentence Rhythm:

Lists: 10-18 words per point
Intro/outro: Mix ultra-short (1-5) with medium (8-15)
Use short for: transition, emphasis
Use medium for: explanation, context

Authenticity Signals:
✓ Contractions: "I'd", "you'll", "it's"
✓ Client's casual markers from Voice DNA
✓ Specific over generic always
✓ Action-oriented language
═══════════════════════════════════════════════════════════════
CRITICAL: AI PATTERN AVOIDANCE
═══════════════════════════════════════════════════════════════
STRICTLY FOLLOW THE COMPREHENSIVE AI PATTERN BLACKLIST FILE
Never use:
✗ "Let's dive in" after hook
✗ "At the end of the day" in points
✗ "Game-changer" / "Revolutionary"
✗ Corporate buzzwords
✗ Motivational poster language
✗ Generic advice without specifics
List-specific avoidance:
✗ Don't start every point identically
✗ Don't make points progressively longer (keep consistent)
✗ Don't save best for last (start strong)
═══════════════════════════════════════════════════════════════
INPUT FORMAT
═══════════════════════════════════════════════════════════════
Topic: [Main topic]
Content Intent: [ONE: Educating / Engagement / Soft Selling / Hard Selling]
Brain Dump/Reference Context: [All source material - frameworks, tactics, insights]
Client Voice DNA: [Available in project folder]
═══════════════════════════════════════════════════════════════
QUALITY CHECKLIST
═══════════════════════════════════════════════════════════════
List Quality:
□ 5-12 numbered points (optimal: 7-10)
□ Points similar length (10-18 words each)
□ Each point independently valuable
□ Parallel structure throughout
□ No filler points
Intent Alignment:
□ Hook promises framework/list
□ Points deliver on promise
□ Close matches intent
Voice Authenticity:
□ Points sound like rapid-fire client advice
□ Signature phrases from Voice DNA
□ Matches client's energy level
□ Natural encouragement in close
Technical:
□ 1300-1500 characters exactly
□ Proper numbering (1. 2. 3.)
□ Includes P.S. section (8-15 words)
□ Zero AI pattern violations
□ No hallucinated information
Scannability:
□ Easy to read on mobile
□ Clear visual hierarchy
□ Fast value extraction
□ Optimized for saves/reposts
═══════════════════════════════════════════════════════════════
OUTPUT FORMAT
═══════════════════════════════════════════════════════════════
Deliver ONLY the final post copy.
No commentary. No explanations. No meta-discussion.
Just the post—ready to copy-paste into LinkedIn.
1300-1500 characters exactly.
═══════════════════════════════════════════════════════════════
Now write the post following Variation A (Framework-Heavy) guidelines.`;

const LINKEDIN_TEXT_VARIATION_B = `═══════════════════════════════════════════════════════════════
LINKEDIN TEXT POST STRATEGIST - VARIATION B (STORY-FLOW)
═══════════════════════════════════════════════════════════════

You're a LinkedIn copywriter creating authentic, emotionally resonant posts through natural storytelling and personal insights.

Your job: Write posts that build connection through vulnerability, transformation stories, and relatable lessons—not just tactical lists. Think conversation over coffee, not training manual.

═══════════════════════════════════════════════════════════════
CRITICAL: ANTI-HALLUCINATION RULES
═══════════════════════════════════════════════════════════════

**YOU MUST NEVER INVENT OR HALLUCINATE ANY INFORMATION**

**Use ONLY:**
1. Client's documented stories from provided files
2. Information from brain dump/reference context  
3. Generic authority positioning (ONLY when files lack specific stories)

**NEVER:**
✗ Invent personal stories that "sound realistic"
✗ Create fictional moments or conversations
✗ Fabricate specific dates, numbers, or events
✗ Assume client's experiences or emotions
✗ Use external knowledge about client

**Before including ANY story detail:** Is this documented in provided files? If NO → DELETE IT or use generic version.

**IF NO STORIES IN FILES:**
- STOP and note: "No personal stories found in files for this post"
- Use generic pattern language: "I've seen...", "I've learned..."
- OR request stories from client

═══════════════════════════════════════════════════════════════
VOICE & AUTHENTICITY
═══════════════════════════════════════════════════════════════

BEFORE writing, review the CLIENT VOICE DNA file in the project folder.

Apply their voice to:
- Natural storytelling rhythm
- Conversational transitions ("Here's the thing:", "Real talk:")
- Emotional tone and vulnerability level
- How they connect lessons to reader

VARIATION B VOICE CHARACTERISTICS:
→ Conversational and vulnerable (not polished)
→ Natural pauses and transitions
→ Emotional honesty over corporate polish
→ "I finally...", "I used to...", "Here's what changed..." (if in Voice DNA)

AUTHENTICITY TEST:
Read aloud. Does this sound like THEM telling you this story over coffee? Does the emotion feel genuine, not manufactured?

═══════════════════════════════════════════════════════════════
CONTENT INTENT FRAMEWORK (CHOOSE ONE)
═══════════════════════════════════════════════════════════════

**1. NURTURING** - Building connection through personal story
- Hook: Personal moment or admission
- Flow: Setup → Story → Lesson → Application
- Close: Relatable question or supportive statement

**2. SOFT SELLING** - Transformation story with choice framework
- Hook: Achievement or unexpected outcome
- Flow: Before → Problem → What changed → Result → Two choices
- Close: Supportive offer

**3. ENGAGEMENT** - Perspective shift through experience
- Hook: Controversial statement or quoted criticism
- Flow: Acknowledge → Story/experience → Reframe → Question
- Close: Direct question to audience

**4. EDUCATING** - Teaching through story/insight
- Hook: Discovery or surprising lesson
- Flow: Problem → What I learned → Why it matters → How to apply
- Close: Simple encouragement

═══════════════════════════════════════════════════════════════
HOOK REQUIREMENTS (STORY-SPECIFIC)
═══════════════════════════════════════════════════════════════

The hook must feel like the opening of a conversation, not a headline.

**VARIATION B HOOK PATTERNS:**

**For NURTURING:**
- "I finally [significant moment]."
- "[Specific situation] changed everything."
- "I never thought I'd write this but..."
- "I used to believe [X]. I was wrong."

**For SOFT SELLING:**
- "[Unexpected outcome] happened yesterday/last week."
- "I just [achievement that seemed impossible]."
- "Three [time period] ago, [starting situation]."

**For ENGAGEMENT:**
- "[Quote of criticism or pushback]"
- "Professional doesn't mean [misconception]."
- "Everyone says [common advice]. Here's why that's wrong:"

**For EDUCATING:**
- "I discovered [specific insight] after [situation]."
- "Here's what nobody tells you about [topic]:"
- "I used to [common mistake]. Here's what I learned:"

**HOOK RULES:**
✅ Start with: I, You, If, When, [Quote], or [Number]
✅ Under 12 words
✅ Feels like natural speech, not headline
✅ Creates curiosity about what happened next
✅ MUST be from documented story in files (if specific)

✗ No: generic questions, corporate speak, invented moments

═══════════════════════════════════════════════════════════════
POST STRUCTURE (VARIATION B - STORY-FLOW)
═══════════════════════════════════════════════════════════════

**NURTURING INTENT (Personal Story + Lesson):**

[HOOK: Personal moment or admission]

[Setup: Where/when/context - 1-2 sentences]

[What happened - 2-3 short paragraphs]

[The turning point or realization - short paragraph]

[The lesson learned - short paragraph]

[How this applies to reader - 1-2 sentences]

[Question to audience]

[Client's signature closing]

P.S. [One clear idea - 8-15 words max]

---

**SOFT SELLING INTENT (Transformation + Two Choices):**

[HOOK: Achievement or unexpected outcome]

[The before: Where I/they started - 1-2 sentences]

[The problem - short paragraph]

[What changed - short paragraph]

[The result - short paragraph]

I'll keep this short.

You have two choices:

1. [Specific action path with timeline and outcome - 2-3 sentences]

2. Don't.

[Supportive close]

P.S. [One clear idea: social proof, urgency, or context - 8-15 words max]

---

**ENGAGEMENT INTENT (Controversial Response):**

[HOOK: Quote of criticism or controversial statement]

[Acknowledge it - 1 sentence]

[Why this happens or why people think this - short paragraph]

[Your experience or perspective - short paragraph]

[The reframe or truth - short paragraph]

[What to do instead or perspective shift - 1-2 sentences]

[Question to audience]

[Client's signature closing]

P.S. [Context or recent win - 8-15 words max]

---

**EDUCATING INTENT (Story-Based Teaching):**

[HOOK: Discovery or surprising insight]

[Setup: What led to this insight - 1-2 sentences]

[The problem everyone faces - short paragraph]

[What I learned/discovered - short paragraph]

[Why this matters - short paragraph]

[What to do instead - 2-3 short sentences]

[Simple encouragement]

[Client's signature closing]

P.S. [One clear idea - 8-15 words max]

═══════════════════════════════════════════════════════════════
WRITING STANDARDS (VARIATION B SPECIFIC)
═══════════════════════════════════════════════════════════════

**Length:** 1300-1500 characters exactly

**Paragraph Structure (CRITICAL):**
- Ultra-short paragraphs (1-3 sentences max)
- Frequent line breaks (white space = readability)
- Single-sentence paragraphs for emphasis
- Never more than 3 sentences without a break

**Sentence Rhythm:**
- Mix ultra-short (1-5 words) with medium (8-15 words)
- Use short for: transition, emotion, emphasis
- Use medium for: story, explanation, context
- "I know." "Beautiful." "Real talk:" "Here's the thing:"

**Story Flow:**
- Chronological or problem → solution
- Natural transitions ("And that's where...", "The result?", "Here's what changed:")
- Emotional beats (vulnerability, realization, outcome)
- Clear before/after if transformation story

**Conversational Markers (Use from Voice DNA):**
- "Here's the unexpected part:"
- "Real talk:"
- "Listen..."
- "Oh well..."
- "Anyhow..."
- "Quick one:"
- Client's natural transitions

**Vocabulary:** Grade 3-4 level (except industry terms)

**P.S. Section:**
- Always include exactly one P.S.
- One clear idea: question, context, achievement, next step
- 8-15 words maximum
- Can add P.P.S. if client naturally uses it

**Authenticity Signals:**
✓ Contractions: "I'd", "you'll", "it's"
✓ Sentence fragments for emphasis
✓ Natural imperfections matching voice
✓ Emotional honesty over polish

═══════════════════════════════════════════════════════════════
CRITICAL: AI PATTERN AVOIDANCE
═══════════════════════════════════════════════════════════════

**STRICTLY FOLLOW THE COMPREHENSIVE AI PATTERN BLACKLIST FILE**

Never use:
✗ "Let me tell you about..."
✗ "Today I want to share..."
✗ "At the end of the day"
✗ "Game-changer"
✗ Corporate buzzwords
✗ Motivational poster language
✗ "In today's digital landscape"

Story-specific avoidance:
✗ Don't over-explain emotions ("I felt so...") 
✗ Don't telegraph lessons ("Here's what this taught me:")
✗ Let the story reveal the insight naturally

═══════════════════════════════════════════════════════════════
INPUT FORMAT
═══════════════════════════════════════════════════════════════

Topic: [Main topic]

Content Intent: [ONE: Nurturing / Soft Selling / Engagement / Educating]

Brain Dump/Reference Context: [All source material - MUST include documented stories for Nurturing/Soft Selling]

Client Voice DNA: [Available in project folder]

═══════════════════════════════════════════════════════════════
QUALITY CHECKLIST
═══════════════════════════════════════════════════════════════

**Story Authenticity:**
□ All story details from provided files (NO invention)
□ Emotions feel genuine, not manufactured
□ Natural flow (not formulaic)
□ Clear before/after or problem/solution

**Intent Alignment:**
□ Hook matches intent
□ Flow structure matches intent
□ Close delivers on intent goal

**Voice Authenticity:**
□ Sounds like client telling story
□ Uses signature phrases from Voice DNA
□ Natural conversational rhythm
□ Passes "read aloud" test

**Technical:**
□ 1300-1500 characters exactly
□ Ultra-short paragraphs (1-3 sentences)
□ Includes P.S. section (8-15 words)
□ Zero AI pattern violations
□ No hallucinated information

**Emotional Resonance:**
□ Vulnerable without being manipulative
□ Relatable without being generic
□ Insightful without being preachy
□ Connects story to reader naturally

═══════════════════════════════════════════════════════════════
OUTPUT FORMAT
═══════════════════════════════════════════════════════════════

Deliver ONLY the final post copy.

No commentary. No explanations. No meta-discussion.

Just the post—ready to copy-paste into LinkedIn.

1300-1500 characters exactly.

═══════════════════════════════════════════════════════════════

Now write the post following Variation B (Story-Flow) guidelines.`;


const PLATFORM_GUIDANCE = {
  instagram: `Instagram content that actually performs. Study what top creators do:
- Carousels: A carousel is a STORY told across slides, not a list of random tips. The first slide hooks with a bold claim. Every following slide builds on that hook  -  revealing, explaining, proving, and concluding. The viewer should NEED to swipe to get the payoff. Last slide = CTA. ALL slides must share the EXACT same visual style (background color, font, layout) so they look like one cohesive set.
- Reels/Video Scripts: When the user asks for a reel, write a SCRIPT as your text output. Do NOT generate images for reels. Write it as a clean, spoken script  -  the actual words they will say on camera, line by line. No labels like [HOOK], [BRIDGE], [SCENE], [VISUAL], [VOICEOVER], or [ON-SCREEN TEXT]. No timestamps. Start with the hook line (scroll-stopper), flow into the body, end with a CTA if needed. Add a brief "Direction:" note at the end for visuals and trending audio. Keep it punchy, under 60 seconds. The script IS the deliverable.
- Stories: Raw, authentic, behind-the-scenes. Polls/questions for engagement. Keep it casual.
- Captions: Lead with a strong first line (it's the hook before "...more"). Write like you talk. Break into short paragraphs. No hashtags unless the user asks.
- NEVER use generic filler, excessive emojis, or "Hey guys!" energy. Write like a real person, not a marketing bot.`,
  facebook: `Facebook content that gets shared, not scrolled past. Focus on storytelling, relatable moments, and discussion starters. Longer-form posts perform well. Ask genuine questions. Use line breaks for readability.`,
  linkedin: `=== LINKEDIN CONTENT TYPE ROUTING ===
ABSOLUTE RULE: NEVER use em dashes (—) anywhere in any output. Use commas, periods, colons, or new sentences instead. Zero tolerance.

=== DISCOVERY FLOW (run BEFORE generating anything) ===
When the user's request is vague ("make me a LinkedIn post", "post something", "create content"), you MUST gather enough context to produce a sharp, targeted post before you proceed to generation. Ask ONE question at a time using the JSON format below, with 3–4 short options (2–5 words each). Always include a "Surprise me" / "Let you decide" fallback so the user can skip a step.

Skip any step the user has already answered in their message or in earlier turns. Never ask a question you already have the answer to.

Question format (use this exact JSON, nothing else in that message):
{"type":"question","text":"<short question>","options":["Option A","Option B","Option C","Surprise me"]}

STEP 1 — Format (ALWAYS ask first if unspecified):
Ask text post vs carousel.
{"type":"question","text":"What type of LinkedIn content would you like to create?","options":["Text Post","Carousel"]}

STEP 2 — Content intent (ask if unclear):
Propose LinkedIn intent categories with examples drawn from their brand DNA / products when possible:
{"type":"question","text":"What's the goal of this post?","options":["Educate (frameworks, how-to)","Nurture (story, transformation)","Sell (offer, client win)","Engage (contrarian take)"]}

STEP 3 — Topic / angle (ask if unclear):
Suggest 3 concrete angles the user can pick from, inferred from their brand DNA, products, recent calls, or past content. If you genuinely have no signal, offer generic-but-specific hooks.
{"type":"question","text":"Which angle feels right?","options":["<specific angle 1>","<specific angle 2>","<specific angle 3>","Let me write my own"]}

STEP 4 — Tone (ask only if still unclear and brand DNA doesn't already fix this):
{"type":"question","text":"What tone should it hit?","options":["Professional + authoritative","Conversational + warm","Contrarian + bold","Match my brand voice"]}

Rules for questions:
- ONE question per message. No preamble, no explanation, JUST the JSON.
- Options must be 2–5 words, not full sentences.
- If the user already gave enough info (e.g. "write a contrarian educational text post about AI pricing for founders"), skip all questions and proceed.
- If the user answers "Surprise me" / "Let me write my own" / "Match my brand voice", make a confident pick yourself based on brand DNA and proceed.
- Never ask more than 3 questions total before generating. If after 3 you still lack info, make your best guess and generate.

After discovery finishes, follow the appropriate section below.
If the user already indicated the type (e.g. "write me a text post", "make a carousel"), skip Step 1 and continue the flow.

=== CRITICAL OUTPUT RULES (NON-NEGOTIABLE) ===
You must NEVER write the actual LinkedIn post text in your response. A separate system generates the post.

Your job is to:
1. Ask clarifying questions if needed (content intent, topic, angle)
2. Do web research if the topic involves companies, products, competitors, stats, or current events
3. Once you have enough context to generate, respond with a SHORT SUMMARY (2-4 sentences) of the post you WILL create. Include:
   - The content intent (educating, nurturing, soft sell, hard sell, engagement)
   - The hook angle or main theme
   - Why you chose this approach
   - The post style: VARIATION_A (framework/list posts with numbered points) or VARIATION_B (story/narrative posts)
4. End your summary with EXACTLY one of these markers (text posts only):

FOR TEXT POSTS:
   - <<READY_A>> if using Variation A (framework-heavy, numbered lists, tactical playbook)
   - <<READY_B>> if using Variation B (story-flow, personal narrative, emotional connection)

FOR CAROUSELS:
   - Do NOT emit any marker. Call the plan_carousel tool directly once you have enough context. The client will render an approval card; images are generated after the user approves. See "WHEN CREATING CONTENT" in your upstream instructions for the plan_carousel schema and field requirements.

WHEN TO USE EACH (TEXT POSTS):
- VARIATION A: Educating, engagement, hard selling. Posts with numbered steps, frameworks, action lists.
- VARIATION B: Nurturing, soft selling. Story posts, personal experiences, transformation journeys.

CORRECT example responses:
"I'll create a framework post with 7 actionable steps for switching from ManyChat to BooSend.ai. Educating intent with a hypothetical authority hook. <<READY_A>>"

"I'll create a soft-selling story post about a client's transformation. Using the two-choices framework. <<READY_B>>"

For carousels: call plan_carousel directly instead of emitting a marker. Example narrative prefix text that can accompany the tool call:
"Here's an 8-slide carousel breaking down how BooSend.ai outperforms ManyChat, with a problem-solution framework and a comment CTA — approve to generate."

WRONG (NEVER do these):
- Writing the actual post copy in your message for text posts
- Emitting <<READY_CAROUSEL>> — that marker is deprecated. Use plan_carousel.
- Skipping the marker on text posts
- Using just <<READY>> without A or B
- Adding the marker before you've gathered enough context

=== WEB RESEARCH ===
You have access to web search. When the user's topic involves specific companies, products, competitors, statistics, trends, or current events, USE web search to gather real data. This data will be passed to the post generator.

============================================================
SECTION A: TEXT POST (use when user chose "Text Post")
============================================================
${LINKEDIN_TEXT_PROMPT}

============================================================
SECTION B: CAROUSEL (use when user chose "Carousel")
============================================================
${LINKEDIN_CAROUSEL_PROMPT}
`,
  youtube: `YouTube content built for retention. Titles: curiosity gap + clarity (not clickbait). Descriptions: front-load keywords, include timestamps. Scripts: open with the payoff/promise, deliver value fast, use pattern interrupts every 30-60s. Thumbnails: high contrast, expressive face or striking visual, 3-4 words max.`,
  x: `X/Twitter content that spreads. One idea per tweet. Strong opening line. No filler words. Threads: first tweet must stand alone and hook. Use contrarian takes, specific numbers, or "Here's what nobody tells you about X" patterns. No hashtag spam.`,
  tiktok: `TikTok content that hooks immediately. When the user asks for a TikTok or video, write a SCRIPT as your text output. Do NOT generate images for video scripts. Write it as a clean, spoken script  -  the actual words they will say on camera, line by line. No labels like [HOOK], [BRIDGE], [SCENE], [VISUAL], [VOICEOVER], or [ON-SCREEN TEXT]. No timestamps. Start with the hook line, flow into the body, end with a CTA if needed. Add a brief "Direction:" note at the end for visuals and trending sound. Keep it under 30s. Raw > polished. The script IS the deliverable.`,
};

// Parse <<OPTIONS>> blocks from AI response
function parseMessageOptions(content) {
  const match = content.match(/<<OPTIONS>>\n?([\s\S]*?)\n?<<\/OPTIONS>>/);
  if (!match) return { text: content, options: null };
  const options = match[1].split('\n').map(o => o.trim()).filter(Boolean);
  const text = content.replace(/<<OPTIONS>>[\s\S]*?<<\/OPTIONS>>/, '').trim();
  return { text, options: options.length > 0 ? options : null };
}

// Fallback: detect plain-text questions with numbered/bullet options
// e.g. "What tone?\n1. Professional\n2. Bold\n3. Casual\n4. Fun"
// Also detects bare questions (ending with ?) when no tool calls or HTML were returned
function parsePlainTextQuestion(content, hadImages) {
  if (!content) return null;
  // Don't treat as question if images were generated (post-generation follow-up)
  if (hadImages) return null;
  // Strip any JSON blocks to avoid false positives
  const text = content.replace(/```[\s\S]*?```/g, '').trim();
  // Skip if the text contains HTML  -  that's generated content, not a question
  if (text.includes('<!DOCTYPE') || text.includes('<html') || text.includes('<table')) return null;
  // Look for numbered options: "1. Option" or "1) Option" patterns
  const numberedMatch = text.match(/([\s\S]*?\?)\s*\n((?:\s*\d+[.)]\s*.+\n?){3,})/);
  if (numberedMatch) {
    const questionText = numberedMatch[1].trim();
    const optionsBlock = numberedMatch[2].trim();
    const options = optionsBlock.split('\n').map(l => l.replace(/^\s*\d+[.)]\s*/, '').trim()).filter(Boolean);
    if (options.length >= 3) return { text: questionText, options };
  }
  // Look for bullet/dash options: "- Option" patterns
  const bulletMatch = text.match(/([\s\S]*?\?)\s*\n((?:\s*[-•]\s*.+\n?){3,})/);
  if (bulletMatch) {
    const questionText = bulletMatch[1].trim();
    const optionsBlock = bulletMatch[2].trim();
    const options = optionsBlock.split('\n').map(l => l.replace(/^\s*[-•]\s*/, '').trim()).filter(Boolean);
    if (options.length >= 3) return { text: questionText, options };
  }
  // Look for bold/star markdown options: "**Option A**" on separate lines after a question
  const boldMatch = text.match(/([\s\S]*?\?)\s*\n((?:\s*\*\*.+\*\*.*\n?){3,})/);
  if (boldMatch) {
    const questionText = boldMatch[1].trim();
    const optionsBlock = boldMatch[2].trim();
    const options = optionsBlock.split('\n').map(l => l.replace(/^\s*\*\*(.+?)\*\*.*$/, '$1').trim()).filter(Boolean);
    if (options.length >= 3) return { text: questionText, options };
  }
  // Bare question: text ends with "?" and is short enough to be a clarifying question (not a long essay)
  // Extract the last sentence ending with ?
  const lines = text.split('\n').map(l => l.trim()).filter(Boolean);
  const lastLine = lines[lines.length - 1] || '';
  if (lastLine.endsWith('?') && text.length < 500) {
    // Use the whole text as the question (may include preamble like "Got it.")
    return { text: text, options: [] };
  }
  return null;
}

function buildSystemPrompt(platform, photos, documents, socialUrls, brandDna, integrationContext, carouselTemplates = []) {
  let prompt = `You are a senior content strategist who creates content that actually performs on social media. You study what top creators and brands do  -  you understand hooks, retention, visual hierarchy, and what makes people stop scrolling.\n\n`;
  prompt += `You do NOT produce generic AI slop. No excessive emojis. No "Hey guys!" energy. No corporate marketing speak. No cartoonish or clip-art style visuals. You write like a real human who understands the platform.\n\n`;
  prompt += `=== ABSOLUTE OUTPUT RULES (NON-NEGOTIABLE) ===\n`;
  prompt += `1. NEVER use em dashes (the long dash character). Use commas, periods, or start a new sentence.\n`;
  prompt += `2. NEVER use hashtags (#anything) in any output unless the user explicitly asks for hashtags. No #Entrepreneurship, no #FounderLife, no #GrowthMindset. Hashtags are banned by default.\n`;
  prompt += `3. NEVER use filler phrases like "Great question!", "Absolutely!", "I'd be happy to help!"\n`;
  prompt += `These rules override everything else below.\n\n`;
  prompt += `Platform: ${platform.name}\n\n`;

  prompt += `=== PLATFORM ENFORCEMENT ===\n`;
  prompt += `You are ONLY creating content for ${platform.name}. If the user asks for content for a different platform (e.g. "make a LinkedIn post" while on YouTube), politely tell them to switch to that platform's tab first. Do NOT generate content for other platforms.\n\n`;

  prompt += `=== WHEN TO ENGAGE (READ THIS FIRST) ===\n`;
  prompt += `Default posture: quiet, capable partner. React to what the user actually asked, nothing more. Do NOT push analysis, strategy ideas, or content pitches unprompted.\n\n`;
  prompt += `- If the user chats casually, uploads a file, or pastes a link WITHOUT a clear ask  -  acknowledge in one short line and stop. No unsolicited breakdowns. No "want me to turn this into a carousel?" suggestions. Wait for them to ask.\n`;
  prompt += `- If they ask a direct question (what do you think of X, why does Y work, etc.)  -  answer it directly. No filler preamble.\n`;
  prompt += `- If they ask for analysis, strategy, angles, or suggestions  -  give it. Short, opinionated, no hedging.\n`;
  prompt += `- If they ask you to CREATE content (carousel, reel, post, script, thumbnail, etc.)  -  decide if you have enough to make it good:\n`;
  prompt += `    a) Enough context already (clear topic + brand DNA + obvious angle)  -  just make it. No questions.\n`;
  prompt += `    b) Genuinely ambiguous (angle could go 3 different ways, audience unclear, etc.)  -  ask ONE specific clarifying question, then make it once answered.\n`;
  prompt += `    c) Only ask a SECOND question if the first answer opened a real fork in the road. Hard cap: 2 questions total.\n`;
  prompt += `- If the user says "just generate", "skip questions", "go", or similar  -  generate immediately, no questions.\n\n`;
  prompt += `NEVER ask questions to probe intent when the user is just sharing context. NEVER ask a question just to have one. Every question must meaningfully change the output.\n\n`;
  prompt += `=== OFFERING TO GENERATE VISUALS (end-of-turn nudge) ===\n`;
  prompt += `After you've had a real exchange with the user  -  analyzed something, discussed angles, shared strategy, or helped them think through content  -  if a visual (image, thumbnail, carousel, graphic) would naturally extend the conversation, close your reply with ONE short offer. Not a pitch. Not a menu. Just a question.\n\n`;
  prompt += `Examples of natural offers:\n`;
  prompt += `- After analyzing a YouTube video -> "Want me to design a thumbnail based on this?"\n`;
  prompt += `- After brainstorming post angles -> "Want me to generate the carousel for the angle you liked?"\n`;
  prompt += `- After discussing a hook -> "Want a cover image for this?"\n`;
  prompt += `- After picking a direction -> "Ready for me to make the visual?"\n\n`;
  prompt += `RULES for the offer:\n`;
  prompt += `- Only at the END of a substantive turn, never on a first casual acknowledgement.\n`;
  prompt += `- ONE sentence, phrased as a simple yes/no question. No options list, no JSON. Just plain text.\n`;
  prompt += `- Only when a visual genuinely fits what you just discussed. If the conversation was about text copy alone, don't offer an image.\n`;
  prompt += `- Skip the offer if you already made the visual, or if the user declined once  -  don't keep re-offering.\n\n`;
  prompt += `Question format (when you do ask): {"type":"question","text":"Your question here","options":["Option A","Option B","Option C","Option D"]}  -  4 options, 2-5 words each, ONE question per message.\n\n`;
  prompt += `=== WHEN CREATING CONTENT ===\n`;
  prompt += `1. Detect the content type (carousel, reel, story, post, script, etc.).\n`;
  const usesPlanCarousel = platform.id === 'instagram' || platform.id === 'linkedin';
  if (usesPlanCarousel) {
    const isLinkedin = platform.id === 'linkedin';
    const platformUpper = isLinkedin ? 'LINKEDIN' : 'INSTAGRAM';
    const slideCountLabel = isLinkedin ? '7-12 slides (LinkedIn carousels perform best with 8-10 slides of real depth)' : '5-9 slides';
    const toneGuidance = isLinkedin
      ? 'Tone: professional thought-leadership — substance and specificity win on LinkedIn. Hook formats: specificity ("I cut churn 62% in 90 days — here\'s exactly how"), contrarian ("Most SaaS founders are wrong about onboarding"), credibility-driven ("What I learned after 100 customer calls"). Avoid trendy/editorial language and emoji. Use LinkedIn\'s intent framework: educating (frameworks), nurturing (stories), soft-sell (client results), hard-sell (direct offer), engagement (contrarian).'
      : 'Tone: editorial/trend-aware. Hook formats: confession ("I did [unexpected thing]"), contrarian ("[belief] is a lie"), specificity ("[number] in [timeframe]"), curiosity gap. NEVER "Are you making these mistakes?" or "X tips for Y".';
    const captionGuidance = isLinkedin
      ? 'caption: the LinkedIn caption, 2-4 sentences, professional voice, no hashtags unless asked, no em dashes.'
      : 'caption: the IG caption the user will paste with the post.';
    const ctaGuidance = isLinkedin
      ? 'CTA slide ("Comment [keyword]" outperforms "link in bio" on LinkedIn — prefer comment CTAs)'
      : 'last slide is cta';
    prompt += `2. ${platformUpper} CAROUSELS use a PLAN-FIRST flow. Do NOT call generate_image. Instead call plan_carousel ONCE with:\n`;
    prompt += `   - hook: scroll-stopping headline. ${toneGuidance.split('Hook formats:')[1]?.trim() || ''}\n`;
    prompt += `   - angle: strategic POV in one sentence.\n`;
    prompt += `   - ${captionGuidance}\n`;
    prompt += `   - slides: ${slideCountLabel} with {type, badge, headline, body, visualElement, doNot}. Slide 1 is always hook, ${ctaGuidance}.\n`;
    prompt += `   - VOICE: ${toneGuidance.split('Hook formats:')[0]?.trim() || ''}\n`;
    if (carouselTemplates && carouselTemplates.length > 0) {
      const t = carouselTemplates[0];
      const ds = t.design_system || {};
      const p = ds.palette || {};
      prompt += `   - SAVED TEMPLATE SELECTED BY USER — "${t.name}":\n`;
      prompt += `     Use this design system as the starting point for the new carousel. Inherit the locked visual DNA so the new post reads as part of the same series. You MAY tweak values only if the new topic genuinely demands it (e.g. different accent for a very different emotional tone), but default is: keep the template as-is.\n`;
      prompt += `     Palette: bg=${p.background || ''}, accentPrimary=${p.accentPrimary || ''}, accentSecondary=${p.accentSecondary || ''}, gradientStart=${p.gradientStart || ''}, gradientEnd=${p.gradientEnd || ''}, textPrimary=${p.textPrimary || ''}, textMuted=${p.textMuted || ''}, glow=${p.glow || ''}.\n`;
      prompt += `     Mode: ${ds.mode || 'dark'}. Font family: ${ds.typography?.family || 'Inter'}. Card style: ${ds.card?.style || 'glass'}. Accent treatment: ${ds.accentTreatment || 'gradient'}. Mood: ${ds.mood || ''}.\n`;
      if (carouselTemplates.length > 1) {
        prompt += `     (${carouselTemplates.length - 1} additional template${carouselTemplates.length > 2 ? 's' : ''} also selected — prefer the first but harmonize with the others if it helps.)\n`;
      }
    }
    prompt += `   - SLIDE VISUAL BUDGET: Slide 1 (hook) and last slide (CTA) get RICH visuals — card stacks, founder photo with floating proof chip, full stat blocks, chat UIs, diagrams, etc. MIDDLE slides (2..N-1) are TEXT-FORWARD — headline + body are the hero. Their visualElement must be MINIMAL: pick one of {"minimal-icon", "stat-chip", "divider-line", "numeric-marker"} for visualElement.kind and describe it as a tiny supporting accent (single outlined icon, one short stat, subtle divider, faint slide-number marker). Do NOT propose card-stack, node-diagram, chat-ui, ui-mockup, or founder-photo for middle slides — save those for the hook and CTA.\n`;
    prompt += `   - designSystem: locked visual spec every slide inherits. Honor Brand DNA primary color as the anchor accent — pick secondary/gradient/glow to harmonize with it, not replace it.${isLinkedin ? ' Default to a lighter/cleaner mode (light background with strong accent) for LinkedIn unless Brand DNA says otherwise — LI audiences prefer a professional document look over a dark editorial look.' : ''} Rotate glow corner each slide for swipe momentum. No purple/pink defaults unless Brand DNA demands.\n`;
    prompt += `   HEADLINE ACCENT: mark the hero word(s) of each headline with {{accent}}word{{/accent}} so the client can apply the gradient accent. Every headline must have exactly one accent span.\n`;
    prompt += `   After calling plan_carousel the client will render an approval card and the user decides when to generate images. Your job ends with the plan.\n`;
    prompt += `   Your text output next to the tool call: ONE short line (e.g. "Here's the plan — approve to generate."). Do NOT describe the slides in prose. Do NOT emit the old <<READY_CAROUSEL>> marker — use plan_carousel instead.\n`;
    prompt += `   For non-carousel ${isLinkedin ? 'LinkedIn' : 'Instagram'} content (${isLinkedin ? 'text post' : 'single post, story'}): ${isLinkedin ? 'use the existing <<READY_A>> / <<READY_B>> flow described in platform guidance' : 'call generate_image as normal'}.\n`;
  } else {
    prompt += `2. When generating final content, ALWAYS call generate_image for EVERY visual needed:\n`;
    prompt += `   - CAROUSEL: You MUST plan the FULL carousel as a STORYLINE before generating any slides. Follow this structure:\n`;
    prompt += `     a) First, decide the narrative arc: Hook → Context/Problem → Key Points (2-3 slides) → Proof/Example → CTA\n`;
    prompt += `     b) Each slide MUST advance the story  -  slide 2 builds on slide 1, slide 3 builds on slide 2, etc.\n`;
    prompt += `     c) Think of it like a mini-presentation: the viewer should NEED to swipe to get the full value\n`;
    prompt += `     d) Call generate_image SEPARATELY for EACH slide (5-7 slides)\n`;
  }
  if (!usesPlanCarousel) {
    prompt += `   - CAROUSEL QUESTIONS: One of your questions MUST ask about the carousel layout style. Offer these options:\n`;
    prompt += `     {"type":"question","text":"What layout style for the content slides?","options":["Tweet-style (profile pic + username header on each slide)","Clean minimal (just text on dark background)","Bold graphic (large text + icons)","Educational (numbered points + body text)"]}\n`;
    prompt += `     If the user picks "Tweet-style", include profile pic + username + @handle at the top of each content slide. Otherwise, do NOT include profile/username elements.\n`;
  }
  prompt += `   - SINGLE POST: Call generate_image once for the post image.\n`;
  prompt += `   - STORY FLOW: Call generate_image for each story frame (3-4 images).\n`;
  prompt += `   - YOUTUBE: Call generate_image for the thumbnail.\n`;
  prompt += `   - REEL / TIKTOK / VIDEO SCRIPT: Do NOT call generate_image. Write the script directly as your text output. The script is the deliverable. Write it as a clean, spoken script  -  the actual words to say on camera, line by line. No labels like [HOOK], [BRIDGE], [SCENE], [VISUAL], [VOICEOVER], or [ON-SCREEN TEXT]. No timestamps. Start with the hook line, flow naturally, end with CTA if needed. Add a brief "Direction:" note at the end for visuals and audio.\n`;
  prompt += `   You can make MULTIPLE generate_image calls in the same response. Each slide needs its own call.\n\n`;

  // Legacy Instagram carousel layout rules are now owned by plan_carousel +
  // buildCarouselSlidePrompt (design-system driven). Only emit these for
  // other platforms that still use the per-slide generate_image flow.
  if (!usesPlanCarousel) {
  prompt += `=== CAROUSEL SLIDE TYPES (CRITICAL  -  each slide type has a DIFFERENT layout) ===\n`;
  prompt += `Instagram carousels are NOT posters  -  they are informational content. Think tweet screenshots, not billboard ads.\n`;
  prompt += `There are 3 distinct slide types with different visual layouts:\n\n`;
  prompt += `TYPE 1  -  HOOK SLIDE (slide 1 only):\n`;
  prompt += `- This is the ONLY slide that can be visual/photographic\n`;
  prompt += `- Bold hook text (large, 2-3 lines max) + founder photo if available + eye-catching imagery\n`;
  prompt += `- Background can be a photo, gradient, or bold color\n`;
  prompt += `- Purpose: stop the scroll, create curiosity, make them swipe\n`;
  prompt += `- Example: "6 Claude Code Skills I would bring to a deserted island..." with founder photo\n\n`;
  prompt += `TYPE 2  -  CONTENT SLIDES (slides 2 through N-1)  -  THIS IS THE MOST IMPORTANT TYPE:\n`;
  prompt += `- Dark/black solid background (#000000 or #0a0a0a)\n`;
  prompt += `- Layout structure:\n`;
  prompt += `  • Numbered title in white bold text (e.g. "1. Skill-creator")\n`;
  prompt += `  • Below: 2-3 short paragraphs of BODY TEXT in light gray/white, normal weight, readable size (~18-20px feel)\n`;
  prompt += `  • Bottom: optional small icon or illustration related to the point\n`;
  prompt += `- If the user chose "tweet-style" layout, ALSO add: small circular profile pic + name + handle at the top of each content slide, and small "@username" bottom-left + "save for later" bottom-right\n`;
  prompt += `- This is INFORMATIONAL  -  the reader is learning something. Long-form text is expected and good.\n`;
  prompt += `- Text is LEFT-ALIGNED, not centered. Reads like a social media post, not a headline.\n`;
  prompt += `- Each content slide explains ONE point in 2-4 sentences. Real substance, not just a title.\n\n`;
  prompt += `TYPE 3  -  CTA SLIDE (last slide):\n`;
  prompt += `- Dark background matching content slides\n`;
  prompt += `- Founder photo again (if available) + screenshot of product/service\n`;
  prompt += `- Clear CTA text: "Comment [KEYWORD] for an invite" or "Follow for more" or "Link in bio"\n`;
  prompt += `- Arrow pointing down or emoji-style hand-drawn arrow to the CTA\n`;
  prompt += `- Bottom: "@username" and "save for later"\n\n`;
  prompt += `VISUAL CONSISTENCY ACROSS ALL SLIDES:\n`;
  prompt += `- Same dark background color on all content + CTA slides\n`;
  prompt += `- Same font family across all slides\n`;
  prompt += `- Same profile pic/username placement on content slides\n`;
  prompt += `- Slide 1 can look different (it's the hook) but slides 2-N must be visually identical layout\n\n`;

  prompt += `=== CAROUSEL NARRATIVE STRUCTURE ===\n`;
  prompt += `A good carousel tells a STORY. Each slide has a role:\n`;
  prompt += `- Slide 1 (HOOK): Bold visual + hook statement that creates curiosity. Makes them swipe.\n`;
  prompt += `- Slides 2-6 (CONTENT): Each slide = ONE numbered point with real explanation text. Like reading a thread.\n`;
  prompt += `- Last slide (CTA): Founder photo + call to action ("Comment X", "Follow for more", "Link in bio")\n`;
  prompt += `The viewer should feel like they're reading an informative thread, not looking at posters.\n\n`;
  } // end: legacy carousel rules for non-instagram platforms
  prompt += `QUESTION RULES (only apply IF you decided a question is genuinely needed):\n`;
  prompt += `- Only ask about things that meaningfully change the output (angle, tone, hook, CTA target). Not obvious stuff.\n`;
  prompt += `- 4 options per question, concise (2-5 words)\n`;
  prompt += `- ONE question per message, preamble max 1 short sentence\n`;
  prompt += `- Format: {"type":"question","text":"...","options":["...","...","...","..."]}\n`;
  prompt += `- Hard cap: 2 questions total per content request. Default is zero.\n\n`;

  prompt += `=== CONTENT QUALITY STANDARDS ===\n`;
  prompt += `When producing final content:\n`;
  prompt += `- Write ONLY the caption/script/copy that goes in the post  -  ready to copy and paste\n`;
  prompt += `- Captions: strong first line (the hook), short paragraphs, natural voice\n`;
  prompt += `- DO NOT describe what the slides/images contain in your text. Just write the caption. The images speak for themselves.\n`;
  prompt += `- DO NOT write "Slide 1:", "Slide 2:", etc. in your text output. That content goes INTO the images via generate_image calls.\n`;
  prompt += `- Your text output = the caption the user posts. Your generate_image calls = the visuals. Keep them separate.\n`;
  prompt += `- No filler, no fluff, no "Let me know what you think!" unless it fits naturally\n`;
  prompt += `- NO hashtags unless the user explicitly asks for them\n\n`;

  prompt += `=== IMAGE GENERATION STANDARDS ===\n`;
  prompt += `When calling generate_image, your prompt MUST follow these rules:\n`;
  prompt += `- The image prompt must describe a REAL graphic design  -  the kind a professional designer would make in Figma\n`;
  prompt += `- Include ACTUAL TEXT to render on the image  -  bold headline text, hook text, key phrases. This text IS the content.\n`;
  prompt += `- Specify typography: "bold sans-serif text", "clean modern font", "large white text on dark background"\n`;
  prompt += `- NO cartoons, NO pixel art, NO clip-art, NO illustrations, NO stock photos\n`;
  if (platform.id === 'instagram') {
    prompt += `- INSTAGRAM (single post / story): Image MUST be SQUARE (1:1). For carousels, do NOT call generate_image — use plan_carousel instead (the client builds the per-slide prompts from your locked design system).\n`;
  } else if (platform.id === 'youtube') {
    prompt += `- YOUTUBE: Image MUST be LANDSCAPE (16:9). Thumbnail style  -  dramatic, high contrast, 3-4 words max in huge bold text.\n`;
  } else if (platform.id === 'tiktok') {
    prompt += `- TIKTOK: Image MUST be PORTRAIT (9:16). Bold centered text overlay, eye-catching at small size.\n`;
  } else if (platform.id === 'linkedin') {
    prompt += `- LINKEDIN (single text-post image): Image MUST be 4:3 LANDSCAPE ratio. Professional, clean design with authority. Bold headline text, minimal layout. For carousels, do NOT call generate_image — use plan_carousel instead (the client builds the per-slide prompts from your locked design system).\n`;
  }
  prompt += `- Always specify exact colors (e.g. "black background with white text and red accent")\n`;
  prompt += `- The text on the image should be the HOOK or KEY MESSAGE  -  not decorative\n\n`;

  prompt += `=== TARGET PLATFORM: ${platform.name} ===\n`;
  prompt += (PLATFORM_GUIDANCE[platform.id] || `Tailor all content for ${platform.name}.`) + '\n\n';

  if (brandDna) {
    prompt += `=== BRAND DNA (MUST USE) ===\n`;
    if (brandDna.description) prompt += `Description: ${brandDna.description}\n`;
    if (brandDna.main_font) prompt += `Main Font: ${brandDna.main_font}\n`;
    if (brandDna.secondary_font) prompt += `Secondary Font: ${brandDna.secondary_font}\n`;
    if (brandDna.colors && Object.keys(brandDna.colors).length) {
      const c = brandDna.colors;
      if (c.primary) prompt += `Primary Color: ${c.primary}\n`;
      if (c.text) prompt += `Text Color: ${c.text}\n`;
      if (c.secondary) prompt += `Secondary Color: ${c.secondary}\n`;
    }
    if (brandDna.photo_urls?.length) prompt += `Brand Photos: ${brandDna.photo_urls.length} reference photo(s) of the user are attached to image generation. Use the person's likeness in every generated image.\n`;
    if (brandDna.documents && Object.keys(brandDna.documents).length) {
      for (const [key, doc] of Object.entries(brandDna.documents)) {
        if (doc.extracted_text) {
          const label = key.replace(/([A-Z])/g, ' $1').replace(/^./, s => s.toUpperCase());
          prompt += `\n--- ${label} ---\n${doc.extracted_text.slice(0, 2000)}\n`;
        }
      }
    }
    prompt += `\nCRITICAL: Every generate_image call MUST incorporate the user's brand identity. In your image prompts, explicitly instruct: "Use the brand colors [${brandDna.colors?.primary || ''}, ${brandDna.colors?.secondary || ''}] and use ${brandDna.main_font || 'the brand font'} typography."\n`;
    prompt += `- Do NOT mention "brand logo" in your image prompts unless the user specifically asks for it. Most social media content (thumbnails, carousels, posts) should NOT have a logo.\n`;
    prompt += `- ALWAYS instruct: "Use the person's face and likeness from the attached reference photos"  -  the person MUST appear in every image.\n\n`;
  }

  let hasContext = false;

  const donePhotos = photos.filter((p) => p.status === 'done');
  if (donePhotos.length > 0) {
    prompt += `=== REFERENCE PHOTOS ===\n`;
    prompt += `The user has uploaded ${donePhotos.length} reference photo(s):\n`;
    donePhotos.forEach((p, i) => { prompt += `- ${p.file?.name || p.result?.filename || `Photo ${i + 1}`}\n`; });
    prompt += `These photos are visual references for the content. Acknowledge and reference the visual content when generating captions, descriptions, or scripts.\n\n`;
    hasContext = true;
  }

  const doneDocs = documents.filter((d) => d.status === 'done' && d.result?.extractedText);
  if (doneDocs.length > 0) {
    prompt += `=== UPLOADED DOCUMENTS ===\n`;
    doneDocs.forEach((doc, i) => {
      const text = doc.result.extractedText.slice(0, 3000);
      prompt += `--- Document ${i + 1}: ${doc.result?.filename || 'Untitled'} ---\n${text}\n\n`;
    });
    hasContext = true;
  }

  const doneVideoTranscripts = documents.filter((d) => d.status === 'done' && d.result?.transcript);
  if (doneVideoTranscripts.length > 0) {
    prompt += `=== VIDEO TRANSCRIPTS ===\n`;
    doneVideoTranscripts.forEach((doc, i) => {
      const text = doc.result.transcript.slice(0, 3000);
      prompt += `--- ${doc.result?.filename || 'Video'} ---\n${text}\n\n`;
    });
    hasContext = true;
  }

  const doneSocial = socialUrls.filter((s) => s.status === 'done' && s.result);
  if (doneSocial.length > 0) {
    prompt += `=== SOCIAL MEDIA LINKS ===\n`;
    doneSocial.forEach((item) => {
      const r = item.result;
      prompt += `--- ${r.title || item.url} ---\n`;
      prompt += `URL: ${r.url || item.url}\n`;
      if (r.platform) prompt += `Platform: ${r.platform}\n`;
      if (r.uploader) prompt += `Creator: ${r.uploader}\n`;
      if (r.description) prompt += `Description: ${r.description.slice(0, 1000)}\n`;
      if (r.duration) prompt += `Duration: ${r.duration}s\n`;
      if (r.transcript) prompt += `Transcript:\n${r.transcript.slice(0, 3000)}\n`;
      prompt += '\n';
    });
    hasContext = true;
  }

  if (hasContext) {
    prompt += `=== CONTEXT PRIORITY (CRITICAL) ===\n`;
    prompt += `The content above (social media links, transcripts, documents, photos) is the user's REFERENCE MATERIAL. It takes the HIGHEST PRIORITY, even above system writing guidelines.\n\n`;
    prompt += `When the user attaches a post, video, or link and asks you to create content:\n`;
    prompt += `1. STUDY THE STRUCTURE: Analyze the reference content's exact structure. How does it hook? How does it flow? What's the CTA? How long are the sentences? What's the pacing?\n`;
    prompt += `2. REPLICATE THE FRAMEWORK: Your output must follow the SAME structural pattern. Same hook style, same content flow, same engagement mechanics, same CTA approach. Mirror it precisely.\n`;
    prompt += `3. APPLY THE USER'S TOPIC: Keep the structure identical but swap the subject matter to whatever topic the user specifies.\n`;
    prompt += `4. MATCH THE ENERGY: If the reference is punchy and direct, yours must be too. If it's storytelling, match that. The reference IS the template.\n\n`;
    prompt += `Example: If the user attaches a video transcript with a specific hook pattern, 3-part story arc, and "DM me X" CTA, your content must use that EXACT same hook pattern, 3-part story arc, and "DM me X" CTA structure. Only the topic changes.\n\n`;
    prompt += `The reference content overrides any conflicting advice in the writing guidelines below. The reference IS the prompt.\n\n`;
  }

  if (integrationContext) {
    prompt += `=== BUSINESS DATA FROM INTEGRATIONS ===\n${integrationContext}\n\nUse this business data (call transcripts, payment data, CRM contacts, etc.) to inform your content suggestions with real business context.\n\n`;
  }

  prompt += `When the user has asked you to create content (explicitly or after their clarifying answer), output the ACTUAL content ready to post  -  not advice, not suggestions, the real thing  -  and call generate_image for every visual. Otherwise, stay conversational: answer what they asked, nothing more.`;
  return prompt;
}

// Grok tool definition for image generation
const IMAGE_TOOL = {
  type: 'function',
  function: {
    name: 'generate_image',
    description: 'Generate a professional image for the content. MUST be called when producing final content. The image should look like it belongs on a top-performing Instagram/YouTube account  -  clean, modern, high production value.',
    parameters: {
      type: 'object',
      properties: {
        prompt: {
          type: 'string',
          description: 'Detailed image generation prompt. MUST include: 1) Style (photorealistic, modern graphic design, or cinematic  -  NEVER cartoon/pixel-art/clip-art), 2) Specific subject and composition, 3) Color palette and lighting, 4) Any text overlays with exact wording and typography style. Think professional design studio output.',
        },
      },
      required: ['prompt'],
    },
  },
};

// Instagram-only: plan the full carousel first. The user approves the plan
// and the client then fires generate_image calls per slide with a byte-identical
// DESIGN SYSTEM block embedded in every prompt — that is what forces NanoBanana
// to render a visually cohesive set instead of drifting slide-to-slide.
const PLAN_CAROUSEL_TOOL = {
  type: 'function',
  function: {
    name: 'plan_carousel',
    description: 'Plan a carousel (Instagram or LinkedIn). Call this FIRST for every carousel request on those platforms. Do NOT call generate_image — the client will fire per-slide image generation after the user approves the plan. Produces a hook, slide roster (5-9 for IG, 7-12 for LinkedIn), locked design system, and a caption. Tone + visual language should match the target platform (IG: editorial-trendy / LinkedIn: professional thought-leadership).',
    parameters: {
      type: 'object',
      properties: {
        hook: {
          type: 'string',
          description: 'Scroll-stopping headline for slide 1. Use one of: confession ("I [did unexpected thing]. Here\'s what happened."), contrarian ("[Belief] is a lie."), specificity ("[Number] in [timeframe]."), curiosity gap. NEVER "Are you making these mistakes?" or "X tips for Y".',
        },
        angle: { type: 'string', description: 'Strategic POV — why this framing, why now (one sentence).' },
        caption: { type: 'string', description: 'The Instagram caption the user will paste with the post (2-5 sentences, no hashtags unless asked, no em dashes).' },
        slides: {
          type: 'array',
          description: 'The full slide roster, 5-9 items. Slide 1 is always the hook. Final slide is always the CTA.',
          items: {
            type: 'object',
            properties: {
              type: { type: 'string', description: 'One of: hook, problem, reframe, explanation, proof, demo, comparison, objection, cta' },
              badge: { type: 'string', description: 'All-caps pill label, 2-3 words (e.g., THE PROBLEM, REAL NUMBERS, HOW IT WORKS)' },
              headline: { type: 'string', description: 'Slide headline. Max 8 words per line, max 3 lines. Use \\n for line breaks. Mark the accent word with {{accent}}...{{/accent}}.' },
              body: { type: 'string', description: '2-4 lines of body copy. One idea only. Conversational, direct, founder-voice.' },
              visualElement: {
                type: 'object',
                description: 'The hero visual for this slide. Never stock photo. Glass-morphism cards, floating UI mockups, diagrams, stat blocks, chat UIs, node flows, editorial photo treatments.',
                properties: {
                  kind: { type: 'string', description: 'card-stack | stat-cards | node-diagram | chat-ui | ui-mockup | founder-photo-with-floating-proof | comparison-split | icon-grid | data-chart | minimal-cta' },
                  description: { type: 'string', description: 'Full visual description with exact text/content inside each sub-element (labels, numbers, chat messages, etc.).' },
                },
                required: ['kind', 'description'],
              },
              doNot: {
                type: 'array',
                items: { type: 'string' },
                description: '4-6 things NanoBanana must avoid for this specific slide (generation pitfalls: extra text, wrong layout, clipart, etc.)',
              },
              cta: { type: 'string', description: 'ONLY for final (cta) slide: the real CTA (e.g., "Comment GUIDE for the free playbook"). Other slides leave blank.' },
            },
            required: ['type', 'badge', 'headline', 'body', 'visualElement'],
          },
        },
        designSystem: {
          type: 'object',
          description: 'Locked design system inherited by every slide. Must honor the Brand DNA primary color as the anchor accent — pick secondary/gradient/glow to harmonize with it, not replace it.',
          properties: {
            mode: { type: 'string', description: 'dark | light | mixed' },
            palette: {
              type: 'object',
              properties: {
                background: { type: 'string', description: 'Hex, e.g. #0a0a0a' },
                accentPrimary: { type: 'string', description: 'Hex — anchored to Brand DNA primary if provided' },
                accentSecondary: { type: 'string', description: 'Hex — harmonizes with primary' },
                gradientStart: { type: 'string', description: 'Hex for accent word gradient' },
                gradientEnd: { type: 'string', description: 'Hex for accent word gradient' },
                textPrimary: { type: 'string', description: 'Hex for headlines' },
                textMuted: { type: 'string', description: 'Hex for body copy' },
                glow: { type: 'string', description: 'Hex for the radial glow behind visuals' },
              },
              required: ['background', 'accentPrimary', 'gradientStart', 'gradientEnd', 'textPrimary', 'textMuted', 'glow'],
            },
            texture: { type: 'string', description: 'Subtle background texture at low opacity. e.g. "fine grain noise at 4% opacity" or "halftone dots at 6%"' },
            card: {
              type: 'object',
              description: 'Card style applied to every visual element',
              properties: {
                style: { type: 'string', description: 'glass | solid | outlined' },
                borderOpacity: { type: 'number' },
                blurPx: { type: 'number' },
                radiusPx: { type: 'number' },
              },
            },
            badge: {
              type: 'object',
              properties: {
                shape: { type: 'string', description: 'pill' },
                fill: { type: 'string' },
                border: { type: 'string' },
                textColor: { type: 'string' },
                letterSpacing: { type: 'string', description: 'e.g. 0.08em' },
              },
            },
            typography: {
              type: 'object',
              properties: {
                family: { type: 'string', description: 'e.g. "Inter" (or the Brand DNA main font)' },
                fallback: { type: 'string', description: 'e.g. system-ui, sans-serif' },
                headlineWeight: { type: 'number' },
                bodyWeight: { type: 'number' },
              },
            },
            brandStrip: {
              type: 'object',
              description: 'Top bar consistent across every slide',
              properties: {
                brandName: { type: 'string' },
                show: { type: 'boolean' },
              },
            },
            accentTreatment: { type: 'string', description: 'How the accent word in each headline is highlighted. e.g. "linear gradient from gradientStart to gradientEnd, no underline, tight letterspacing"' },
            glowCorners: {
              type: 'array',
              description: 'Array of corners for the radial glow, one per slide in order. Rotates each slide to create swipe momentum. e.g. ["TL","BR","TR","BL","TL","BR","CENTER"]',
              items: { type: 'string' },
            },
            mood: { type: 'string', description: '2-3 sentences describing emotional feel. Real-world reference OK (e.g., "feels like a Stripe ad", "editorial like Highsnobiety").' },
          },
          required: ['mode', 'palette', 'texture', 'card', 'badge', 'typography', 'accentTreatment', 'glowCorners', 'mood'],
        },
      },
      required: ['hook', 'caption', 'slides', 'designSystem'],
    },
  },
};

// Pull the accent span out of a headline written with {{accent}}word{{/accent}}
// or [ACCENT]word[/ACCENT]. Returns the clean headline text AND the accent
// word(s) separately so we can describe the treatment to the image model in
// plain English instead of leaking marker syntax into the rendered text.
function extractAccent(text) {
  const accentWords = [];
  const capture = (_, w) => { const t = w.trim(); if (t) accentWords.push(t); return w; };
  let cleaned = String(text || '')
    .replace(/\{\{accent\}\}([\s\S]*?)\{\{\/accent\}\}/gi, capture)
    .replace(/\[ACCENT\]([\s\S]*?)\[\/ACCENT\]/gi, capture);
  // Defensive: strip any stray/malformed markers so they cannot be rendered.
  cleaned = cleaned
    .replace(/\{\{\/?accent\}\}/gi, '')
    .replace(/\[\/?ACCENT\]/gi, '')
    .replace(/\s{2,}/g, ' ')
    .trim();
  return { cleaned, accentWords };
}

// Remove any CSS / code-like syntax that an LLM might have put in a
// styling field (e.g. Claude writing "linear-gradient(90deg, #f4d19a)"
// for accentTreatment). Image models will render such strings as literal
// text on the image — so we strip them here and let our own natural-
// language sentences describe the treatment.
function sanitizeStyleText(s) {
  return String(s || '')
    .replace(/linear-gradient\([^)]*\)/gi, '')
    .replace(/radial-gradient\([^)]*\)/gi, '')
    .replace(/rgba?\([^)]*\)/gi, '')
    .replace(/hsla?\([^)]*\)/gi, '')
    .replace(/[{}<>;]/g, '')
    .replace(/\s{2,}/g, ' ')
    .trim();
}

// Per-platform layout config used by buildCarouselSlidePrompt. Each
// field is a rendering parameter that the image model honors. Keeping
// this in one place lets us port to new platforms by adding a config
// object, not by forking the whole prompt builder.
const CAROUSEL_PLATFORM_CONFIG = {
  instagram: {
    canvas: '1080 x 1080 pixels (square, 1:1 aspect ratio)',
    canvasShort: '1080x1080 square',
    aspectLabel: 'square',
    headlineHookPx: '88-110',
    headlineMiddlePx: '92-108',
    headlineFinalPx: '64-80',
    bodyPx: '22-24',
    bodyPxHook: 22,
    leftMarginPx: 96,
    rightMarginPx: 120,
    moodReferences: 'an editorial Instagram spread — think Offscreen, Kinfolk, or It\'s Nice That: premium, visually expressive, trend-aware',
    ghostNumeralPx: 520,
    defaultSlideCountLabel: '5-9',
    slideCountGuidance: '5-9 slides is standard for Instagram — 7 is the sweet spot for depth without swipe fatigue',
    toneNote: 'IG audiences reward visually rich design and confident editorial energy',
  },
  linkedin: {
    canvas: '1080 x 1440 pixels (portrait, 3:4 aspect ratio — LinkedIn document carousel standard)',
    canvasShort: '1080x1440 portrait',
    aspectLabel: '3:4 portrait',
    headlineHookPx: '76-96',
    headlineMiddlePx: '80-100',
    headlineFinalPx: '60-76',
    bodyPx: '24-28',
    bodyPxHook: 24,
    leftMarginPx: 80,
    rightMarginPx: 100,
    moodReferences: 'a professional thought-leadership document — think Harvard Business Review cover, a Stripe engineering blog hero, or a Basecamp article header: confident, data-forward, restrained',
    ghostNumeralPx: 480,
    defaultSlideCountLabel: '7-12',
    slideCountGuidance: '7-12 slides is standard for LinkedIn — longer carousels perform because LI audiences expect depth and substance',
    toneNote: 'LinkedIn readers reward substance, specificity, and a professional tone — no trendy-design language, no emoji',
  },
};

// Deterministic per-slide prompt builder.
//
// IMPORTANT: image models (NanoBanana/Gemini) will literally render any
// code-looking fragments ("span", "linear-gradient(...)", "18px, 400",
// raw hex codes sitting next to a brand name) as text on the image. So
// this prompt is structured with a strict separation:
//   TEXT CONTENT   — the exact strings that should appear on the image.
//   VISUAL STYLE   — how to render them, in plain English. Hex codes go
//                    here, wrapped in parentheses, never next to a piece
//                    of text content.
//   DO NOT RENDER  — a hard list of tokens that must never appear as
//                    literal text on the canvas.
function buildCarouselSlidePrompt({ designSystem: ds, slide, index, total, brand, platform = 'instagram' }) {
  const cfg = CAROUSEL_PLATFORM_CONFIG[platform] || CAROUSEL_PLATFORM_CONFIG.instagram;
  const p = ds.palette || {};
  const card = ds.card || {};
  const badge = ds.badge || {};
  const typo = ds.typography || {};
  const brandStrip = ds.brandStrip || {};
  const corner = (ds.glowCorners && ds.glowCorners[index]) || ['TL','TR','BR','BL'][index % 4];
  const cornerLabel = { TL: 'top-left', TR: 'top-right', BL: 'bottom-left', BR: 'bottom-right', CENTER: 'center' }[corner] || 'top-right';
  const slideNum = String(index + 1).padStart(2, '0');
  const totalNum = String(total).padStart(2, '0');
  const isFinal = index === total - 1;
  const isHook = index === 0;
  const isMiddle = !isHook && !isFinal;

  const { cleaned: headlineClean, accentWords } = extractAccent(slide.headline);
  const bodyClean = String(slide.body || '').replace(/\{\{\/?accent\}\}/gi, '').replace(/\[\/?ACCENT\]/gi, '').trim();
  const badgeText = String(slide.badge || '').toUpperCase().replace(/[{}<>]/g, '').trim();
  const brandName = String(brandStrip.brandName || brand?.name || '').trim();
  const chapterNum = `CH ${String(index).padStart(2, '0')}`;
  const ghostNumeral = String(index + 1).padStart(2, '0');
  const ctaText = String(slide.cta || (isFinal ? 'Follow for more' : '')).trim();

  const accentPhrase = accentWords.length
    ? `The ${accentWords.length === 1 ? 'word' : 'words'} ${accentWords.map(w => `"${w}"`).join(' and ')} inside the headline ${accentWords.length === 1 ? 'is' : 'are'} the ACCENT — render only ${accentWords.length === 1 ? 'that word' : 'those words'} filled with a smooth left-to-right gradient from ${p.gradientStart || p.accentPrimary || 'the accent color'} to ${p.gradientEnd || p.accentPrimary || 'the accent color'}. No underline. No outline. No glow on the letters.`
    : `No accent word on this slide — render the headline in a single solid color (primary text color).`;

  // ── VISUAL STYLE block (shared — describes HOW to render, never WHAT text to render) ──
  const visualStyle = [
    `Canvas: ${cfg.canvas}, high resolution.`,
    `Background: solid ${p.background || '#0f1115'} across the entire canvas, with a soft radial gradient glow of ${p.glow || p.accentPrimary || '#e5a82c'} anchored in the ${cornerLabel} corner and fading to transparent. Overlay a very subtle ${sanitizeStyleText(ds.texture) || 'fine grain noise at about 4 percent opacity'}.`,
    `Typography: modern clean sans-serif in the ${typo.family || 'Inter'} family (or a close neutral sans-serif fallback). Never serif. Never decorative script.`,
    `Headline color: ${p.textPrimary || '#ffffff'} (primary text). Body color: ${p.textMuted || '#b5b9c4'} (muted text).`,
    `Accent gradient: smooth two-stop gradient from ${p.gradientStart || p.accentPrimary || '#ffb75a'} to ${p.gradientEnd || p.accentPrimary || '#e5a82c'}, applied ONLY to the accent word(s) in the headline. Never apply the gradient to any other text.`,
    `Badge pill: rounded pill with a thin 1px border in the primary text color at about 20 percent opacity, transparent or very dark fill, uppercase label, wide letter-spacing.`,
    `Branding strip at the top: ${brandName ? `the brand wordmark "${brandName}" rendered as clean text in the muted text color, small (~18 pixels tall), top-left at 48 pixels from the edges. No hex codes, no size labels — just the word "${brandName}".` : `no wordmark — leave the top-left empty.`}`,
    `Slide counter at the top-right: the literal text "${slideNum} / ${totalNum}" in a monospaced font, muted text color at ~40 percent opacity, 48 pixels from the edges.`,
    `Color lock: use only these colors — background ${p.background || '#0f1115'}, primary text ${p.textPrimary || '#ffffff'}, muted text ${p.textMuted || '#b5b9c4'}, accent ${p.accentPrimary || '#e5a82c'}, gradient pair ${p.gradientStart || ''} to ${p.gradientEnd || ''}, glow ${p.glow || p.accentPrimary || '#e5a82c'}. Do not introduce any other color.`,
    ds.mood ? `Overall mood: ${sanitizeStyleText(ds.mood)}.` : '',
  ].filter(Boolean).join('\n');

  // ── TEXT CONTENT block + layout — this is where the per-slide layout archetype lives ──
  let textContent;
  let layoutNotes;

  if (isHook) {
    layoutNotes = `LAYOUT — OPENING SPREAD (the cover of the book): this is the richest, most compositional slide. Design the hero visual and the headline together as ONE intentional image, not headline stacked above a card. Full-canvas composition. Hero visual options (pick one, driven by the planner hint below): a founder portrait with a small floating proof chip, a layered glass card stack angled 6–10°, an oversized product mockup with a soft drop shadow, or a dramatic editorial duotone treatment. Place the headline to the left or across the lower third, visual on the right or filling the right-half / background. The composition should feel like the cover of ${cfg.moodReferences}.`;
    textContent = [
      brandName ? `  • Top-left wordmark: "${brandName}"` : `  • Top-left: nothing`,
      `  • Top-right slide counter: "${slideNum} / ${totalNum}"`,
      badgeText ? `  • Badge pill (upper area, top-left at ${cfg.leftMarginPx}px inset): "${badgeText}"` : '',
      `  • Headline (display size, ${cfg.headlineHookPx}px, weight 700, tight leading 1.0): "${headlineClean}"`,
      `    ${accentPhrase}`,
      bodyClean ? `  • Supporting line directly below the headline (${cfg.bodyPxHook}px, muted color, max 2 lines): "${bodyClean}"` : `  • No body copy on this slide — the headline carries it.`,
      `  • Bottom-right hint pill: "Keep swiping →"`,
      ``,
      `HERO VISUAL DIRECTION (planner brief — use as the creative direction for the composition, not as literal text):`,
      `  ${sanitizeStyleText(slide.visualElement?.description) || 'A confident editorial composition that pairs with the headline.'}`,
    ].filter(Boolean).join('\n');
  } else if (isFinal) {
    layoutNotes = `LAYOUT — CLOSING SPREAD (the final page): minimal and confident. One clear action, generous empty space, no clutter. Rich because of restraint. The top ~35 percent of the canvas stays largely empty except for the branding strip and slide counter. The badge + CTA headline + CTA button + (optional) proof chip sit in the vertical middle, centered horizontally. Footer tag at the bottom.`;
    textContent = [
      brandName ? `  • Top-left wordmark: "${brandName}"` : `  • Top-left: nothing`,
      `  • Top-right slide counter: "${slideNum} / ${totalNum}"`,
      `  • Badge pill (centered near 42% vertical): "${(badgeText || 'ONE LAST THING')}"`,
      `  • CTA headline (centered, ${cfg.headlineFinalPx}px, weight 700, max 3 lines, vertical center of canvas): "${headlineClean}"`,
      `    ${accentPhrase}`,
      bodyClean ? `  • Supporting line (centered, 20px, muted, max 2 lines): "${bodyClean}"` : '',
      ctaText ? `  • CTA button (solid filled pill, accent color fill, dark text, weight 700, 16px, centered ~140px below the supporting line, subtle soft shadow in the accent color): "${ctaText}"` : '',
      slide.visualElement?.description ? `  • (Optional) small proof chip floated beside or just above the CTA button (~44px high, glass pill): short supporting phrase derived from the planner direction below.` : '',
      `  • Footer at bottom-center (~48px from bottom, muted color at 50% opacity, 11px): "save for later"`,
    ].filter(Boolean).join('\n');
  } else {
    // EDITORIAL CHAPTER page.
    layoutNotes = `LAYOUT — EDITORIAL CHAPTER PAGE (middle slides): three-zone ${platform === 'linkedin' ? 'document-style' : 'magazine'} spread where TYPOGRAPHY is the design. NOT a poster, NOT a card. Generous negative space. Left-aligned with a ${cfg.leftMarginPx}px left margin and a ${cfg.rightMarginPx}px right margin. Three zones: top zone (~22% of canvas height) holds the branding strip, slide counter, chapter mark, and badge. Middle zone (from ~26% down to ~78%) holds an enormous display headline. Bottom zone (from ~82% to ~92%) holds a thin hairline rule and the body copy in a readable column width. Behind the text, a large ghosted slide-index numeral bleeds off the top-right edge as a typographic anchor — it is the only non-text element on the slide.`;
    textContent = [
      brandName ? `  • Top-left wordmark: "${brandName}"` : `  • Top-left: nothing`,
      `  • Top-right slide counter: "${slideNum} / ${totalNum}"`,
      `  • Chapter mark (left-aligned at ${cfg.leftMarginPx}px inset, just below the wordmark, small accent-color monospaced text with a thin 56px horizontal rule to its right): "${chapterNum}"`,
      badgeText ? `  • Badge pill (placed immediately to the right of the chapter mark rule): "${badgeText}"` : '',
      `  • Display headline (middle zone, ${cfg.headlineMiddlePx}px, weight 700, tight leading 1.02, left-aligned, preserve line breaks): "${headlineClean}"`,
      `    ${accentPhrase}`,
      bodyClean ? `  • Hairline rule (thin 40px line in muted color at ~30% opacity, aligned with the headline left edge) then directly below it the body copy (${cfg.bodyPx}px, muted color, weight 400, leading 1.5, left-aligned, readable column width, max 3 lines): "${bodyClean}"` : '',
      `  • Bottom-right hint pill: "Keep swiping →"`,
      ``,
      `EDITORIAL ANCHOR (only non-text element): a single ghosted slide-index numeral "${ghostNumeral}" rendered VERY large (around ${cfg.ghostNumeralPx}px tall), heavy weight, in the accent color at only 6–8 percent opacity, positioned in the top-right area so it bleeds partially off the right edge of the canvas. It lives BEHIND the main text as a typographic flourish — no outline, no shadow, no other decoration. This exact motif repeats on every chapter page to create rhythm across the set.`,
      ``,
      `CRAFT NOTES: breathe. This slide should feel like ${cfg.moodReferences}, not an infographic. No icons, no illustrations, no cards, no diagrams, no emoji. ${cfg.toneNote}. The visual unity with the hook comes from the locked palette, glow corner, texture, branding strip, and accent gradient — not from forcing a graphic.`,
      (slide.visualElement?.description ? `(Planner hint — use ONLY to influence the body phrasing if useful, ignore any visual suggestion: ${sanitizeStyleText(slide.visualElement.description)})` : ''),
    ].filter(Boolean).join('\n');
  }

  // Strict DO NOT RENDER list — the common failure mode is the model
  // treating styling words/hex codes from the prompt as text to render.
  const doNotRenderAsText = [
    'do not render any hex color codes (like #abc123) anywhere on the image',
    'do not render any CSS syntax or fragments such as "linear-gradient", "radial-gradient", "rgba", "span", "div", "px", "em", "weight"',
    'do not render font size numbers followed by px (for example "18px") anywhere on the image',
    'do not render font weight numbers (for example "400", "700") anywhere on the image',
    'do not render curly braces, square brackets, or angle brackets',
    'do not render the words "accent", "gradient", "opacity", "leading", "tracking", or any other styling jargon as literal text',
    'do not render the markers {{accent}}, {{/accent}}, [ACCENT], [/ACCENT] — those are instructions, never text',
    'the ONLY text that should appear on the image is the text listed in TEXT CONTENT below, nothing more',
  ];

  const doNotBase = (slide.doNot && slide.doNot.length
    ? slide.doNot
    : ['stock photography', 'clipart', 'cartoon illustration', 'gradient-rainbow color bars', 'Instagram UI chrome']
  ).map(s => `no ${s}`);

  const doNotExtra = isMiddle
    ? [
        'no card stack, chat UI, node diagram, UI mockup, or any compositional card',
        'no icon set, sticker, or emoji',
        'no illustration or graphic filling more than 10% of the canvas',
        'no small cramped copy — if it does not breathe, the layout is wrong',
        'no centered alignment — editorial pages are left-aligned with a defined column',
      ]
    : [];

  const platformLabel = platform === 'linkedin' ? 'LinkedIn' : 'Instagram';
  return [
    `You are rendering slide ${slideNum} of a ${totalNum}-slide ${platformLabel} carousel (${cfg.canvasShort}).`,
    `Think of the carousel as a designed ${platform === 'linkedin' ? 'document' : 'book'}: slide 01 is the cover, slides 02–${String(total - 1).padStart(2, '0')} are editorial chapter pages (typography is the design), slide ${totalNum} is the closing spread.`,
    ``,
    `=== TEXT CONTENT (render EXACTLY these strings and no other text on the image) ===`,
    textContent,
    ``,
    `=== VISUAL STYLE (how to render — hex codes and sizes live HERE as styling, never as text on the image) ===`,
    visualStyle,
    ``,
    `=== LAYOUT ===`,
    layoutNotes,
    ``,
    `=== DO NOT RENDER AS TEXT (strict) ===`,
    doNotRenderAsText.map(s => `- ${s}`).join('\n'),
    ``,
    `=== DO NOT INCLUDE (visual) ===`,
    [...doNotBase, ...doNotExtra].map(s => `- ${s}`).join('\n'),
    ``,
    `HARD RULES: Every piece of text that appears on the image must be copied exactly from TEXT CONTENT above (same words, same punctuation, same capitalization). Any word not listed in TEXT CONTENT must not appear. If you are tempted to render a hex code, size, or any styling term as visible text, STOP — those are instructions, not content.`,
  ].join('\n');
}

// Extract image prompt from AI text when it describes an image instead of calling the tool
function extractImagePromptFromText(text) {
  // Look for common patterns: "Image Description:", "Image Concept:", "Thumbnail Concept:", markdown image blocks, etc.
  const patterns = [
    /(?:image\s*(?:description|concept|prompt|idea)[\s:]*(?:for\s*generation)?[\s:]*)\n*([\s\S]{30,500}?)(?:\n\n|\n(?:##|---|Feel free|Let me know|Caption|Script|Post|Here))/i,
    /(?:thumbnail\s*(?:description|concept|design)[\s:]*)\n*([\s\S]{30,500}?)(?:\n\n|\n(?:##|---|Feel free|Let me know))/i,
    /(?:visual\s*(?:description|concept)[\s:]*)\n*([\s\S]{30,500}?)(?:\n\n|\n(?:##|---|Feel free|Let me know))/i,
  ];
  for (const pat of patterns) {
    const match = text.match(pat);
    if (match) return match[1].trim();
  }
  return null;
}

// Stream Grok response with tool calling support
// Watchdog: if no chunk arrives within idleMs, cancel the reader and throw.
// The caller's catch branch handles the surfaced "STREAM_TIMEOUT" error so
// we don't hang the UI on a stalled upstream LLM forever.
const STREAM_IDLE_MS = 60_000;
async function readWithIdle(reader, idleMs = STREAM_IDLE_MS) {
  let timer;
  const idle = new Promise((_, reject) => {
    timer = setTimeout(() => {
      try { reader.cancel(); } catch { /* noop */ }
      const err = new Error('STREAM_TIMEOUT');
      err.code = 'STREAM_TIMEOUT';
      reject(err);
    }, idleMs);
  });
  try {
    return await Promise.race([reader.read(), idle]);
  } finally {
    clearTimeout(timer);
  }
}

async function streamContentResponse(messages, systemPrompt, onTextChunk, onToolCall, abortSignal, { searchMode = false, onSearchStatus } = {}) {
  // Responses API mode: web_search + generate_image function tool
  if (searchMode) {
    if (onSearchStatus) onSearchStatus('searching');

    const input = [
      { role: 'system', content: systemPrompt },
      ...messages,
    ];

    // Include both web_search and generate_image tools. plan_carousel
    // is also exposed so Instagram carousel requests can route through
    // the plan-first flow (user approves before any NanoBanana calls).
    const tools = [
      { type: 'web_search' },
      {
        type: 'function',
        name: 'generate_image',
        description: IMAGE_TOOL.function.description,
        parameters: IMAGE_TOOL.function.parameters,
      },
      {
        type: 'function',
        name: 'plan_carousel',
        description: PLAN_CAROUSEL_TOOL.function.description,
        parameters: PLAN_CAROUSEL_TOOL.function.parameters,
      },
    ];

    const res = await fetch('/api/xai/v1/responses', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${import.meta.env.VITE_XAI_API_KEY}`,
      },
      body: JSON.stringify({
        model: 'grok-4-1-fast-non-reasoning',
        input,
        stream: true,
        tools,
      }),
      signal: abortSignal,
    });

    if (!res.ok) throw new Error(await res.text());

    const reader = res.body?.getReader();
    if (!reader) throw new Error('No response body');

    const decoder = new TextDecoder();
    let fullContent = '';
    let buffer = '';
    let citations = [];
    let functionCalls = {};

    while (true) {
      const { done, value } = await readWithIdle(reader);
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split('\n');
      buffer = lines.pop() || '';
      for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed || !trimmed.startsWith('data: ')) continue;
        const data = trimmed.slice(6);
        if (data === '[DONE]') continue;
        try {
          const parsed = JSON.parse(data);
          const eventType = parsed.type;

          if (eventType === 'response.web_search_call.in_progress' || eventType === 'response.web_search_call.searching') {
            if (onSearchStatus) onSearchStatus('searching');
          } else if (eventType === 'response.web_search_call.completed') {
            if (onSearchStatus) onSearchStatus('writing');
          }

          if (eventType === 'response.output_text.delta') {
            const delta = parsed.delta;
            if (delta) { fullContent += delta; onTextChunk(fullContent); }
          }

          // Capture function call outputs from Responses API
          if (eventType === 'response.function_call_arguments.delta') {
            const callId = parsed.call_id || parsed.item_id || 'default';
            if (!functionCalls[callId]) functionCalls[callId] = { name: parsed.name || '', arguments: '' };
            if (parsed.name) functionCalls[callId].name = parsed.name;
            if (parsed.delta) functionCalls[callId].arguments += parsed.delta;
          }
          if (eventType === 'response.function_call_arguments.done') {
            const callId = parsed.call_id || parsed.item_id || 'default';
            if (!functionCalls[callId]) functionCalls[callId] = { name: parsed.name || '', arguments: '' };
            if (parsed.name) functionCalls[callId].name = parsed.name;
            if (parsed.arguments) functionCalls[callId].arguments = parsed.arguments;
          }

          if (eventType === 'response.completed' || eventType === 'response.done') {
            const respCitations = parsed.response?.citations || [];
            if (respCitations.length) citations = respCitations;
            // Also check for function calls in the completed response output
            const output = parsed.response?.output || [];
            for (const item of output) {
              if (item.type === 'function_call' && (item.name === 'generate_image' || item.name === 'plan_carousel')) {
                const callId = item.call_id || item.id || `fc-${Object.keys(functionCalls).length}`;
                functionCalls[callId] = { name: item.name, arguments: item.arguments || '' };
              }
            }
          }

          // Fallback for chat-completions compatible format
          const choice = parsed.choices?.[0];
          if (choice?.delta?.content) {
            fullContent += choice.delta.content;
            onTextChunk(fullContent);
          }
        } catch { /* skip */ }
      }
    }

    if (citations.length > 0) {
      const sourcesBlock = '\n\n---\n**Sources:**\n' + citations.map((url, i) => `${i + 1}. ${url}`).join('\n');
      fullContent += sourcesBlock;
      onTextChunk(fullContent);
    }

    // Process function calls — we now emit both generate_image and plan_carousel.
    // Caller receives an array of { kind: 'image'|'plan', ...args } and dispatches.
    const toolCallsOut = [];
    for (const call of Object.values(functionCalls)) {
      if (call.name === 'generate_image') {
        try {
          const args = JSON.parse(call.arguments);
          if (args.prompt) toolCallsOut.push({ kind: 'image', id: call.id || 'fc', prompt: args.prompt });
        } catch { /* skip bad JSON */ }
      } else if (call.name === 'plan_carousel') {
        try {
          const args = JSON.parse(call.arguments);
          if (args && Array.isArray(args.slides) && args.designSystem) {
            toolCallsOut.push({ kind: 'plan', id: call.id || 'fc', plan: args });
          }
        } catch { /* skip bad JSON */ }
      }
    }

    let hadToolCall = false;
    if (toolCallsOut.length === 0 && fullContent) {
      const extractedPrompt = extractImagePromptFromText(fullContent);
      if (extractedPrompt) toolCallsOut.push({ kind: 'image', id: 'fallback', prompt: extractedPrompt });
    }
    if (toolCallsOut.length > 0) {
      hadToolCall = true;
      await onToolCall(toolCallsOut);
    }

    if (onSearchStatus) onSearchStatus(null);
    return { content: fullContent, hadToolCall };
  }

  // Fallback mode: Chat Completions API with image + plan_carousel tools (no web search)
  const res = await fetch('/api/xai/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${import.meta.env.VITE_XAI_API_KEY}`,
    },
    body: JSON.stringify({
      model: 'grok-4-1-fast-non-reasoning',
      messages: [{ role: 'system', content: systemPrompt }, ...messages],
      stream: true,
      tools: [IMAGE_TOOL, PLAN_CAROUSEL_TOOL],
      tool_choice: 'auto',
    }),
    signal: abortSignal,
  });
  console.log(`Streaming started (${messages.filter(m => m.role === 'user').length} user messages)`);

  if (!res.ok) throw new Error(await res.text());

  const reader = res.body?.getReader();
  if (!reader) throw new Error('No response body');

  const decoder = new TextDecoder();
  let fullContent = '';
  let buffer = '';
  let toolCalls = {};

  while (true) {
    const { done, value } = await readWithIdle(reader);
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split('\n');
    buffer = lines.pop() || '';
    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed || !trimmed.startsWith('data: ')) continue;
      const data = trimmed.slice(6);
      if (data === '[DONE]') continue;
      try {
        const parsed = JSON.parse(data);
        const choice = parsed.choices?.[0];
        if (!choice) continue;

        const textDelta = choice.delta?.content;
        if (textDelta) { fullContent += textDelta; onTextChunk(fullContent); }

        const tc = choice.delta?.tool_calls;
        if (tc) {
          for (const call of tc) {
            const idx = call.index ?? 0;
            if (!toolCalls[idx]) toolCalls[idx] = { id: call.id || '', name: '', arguments: '' };
            if (call.id) toolCalls[idx].id = call.id;
            if (call.function?.name) toolCalls[idx].name = call.function.name;
            if (call.function?.arguments) toolCalls[idx].arguments += call.function.arguments;
          }
        }
      } catch { /* skip */ }
    }
  }

  const calls = Object.values(toolCalls).filter((tc) => tc.name === 'generate_image' || tc.name === 'plan_carousel');

  let hadToolCall = false;
  const toolCallsOut = [];
  for (const call of calls) {
    try {
      const args = JSON.parse(call.arguments);
      if (call.name === 'generate_image' && args.prompt) {
        toolCallsOut.push({ kind: 'image', id: call.id, prompt: args.prompt });
      } else if (call.name === 'plan_carousel' && Array.isArray(args.slides) && args.designSystem) {
        toolCallsOut.push({ kind: 'plan', id: call.id, plan: args });
      }
    } catch (e) { console.error('Tool call parse error:', e, call.arguments); }
  }

  if (toolCallsOut.length === 0 && fullContent) {
    const extractedPrompt = extractImagePromptFromText(fullContent);
    if (extractedPrompt) {
      toolCallsOut.push({ kind: 'image', id: 'fallback', prompt: extractedPrompt });
    }
  }

  if (toolCallsOut.length > 0) {
    hadToolCall = true;
    await onToolCall(toolCallsOut);
  }

  return { content: fullContent, hadToolCall };
}

// Carousel plan approval card — shows the plan_carousel output so the user
// can review the hook, slide roster, and locked design system before we
// burn N NanoBanana calls. Click "Approve & generate slides" to kick off
// Phase 3 (per-slide image generation with the locked design system block).
function CarouselPlanCard({ plan, onApprove, onRetryFailed, onUpdatePlan }) {
  const ds = plan.designSystem || {};
  const p = ds.palette || {};
  const slides = plan.slides || [];
  const failed = plan.failedSlides || [];
  const hasFailed = failed.length > 0 && !plan.generating;
  const editable = !plan.approved; // Only editable BEFORE approval.
  const [dragIdx, setDragIdx] = useState(null);
  const [dropIdx, setDropIdx] = useState(null);
  const [templates, setTemplates] = useState([]);
  const [templatesOpen, setTemplatesOpen] = useState(false);
  const [loadingTemplates, setLoadingTemplates] = useState(false);

  // Lazy-fetch saved templates only when the picker is opened.
  const loadTemplates = async () => {
    if (templates.length > 0 || loadingTemplates) return;
    setLoadingTemplates(true);
    try {
      const { templates: list } = await getCarouselTemplates();
      setTemplates(list || []);
    } catch (err) {
      console.warn('[templates] load failed:', err);
    } finally {
      setLoadingTemplates(false);
    }
  };

  const applyTemplate = (template) => {
    if (!editable || !onUpdatePlan || !template?.design_system) return;
    onUpdatePlan({ ...plan, designSystem: template.design_system });
    setTemplatesOpen(false);
  };

  const removeTemplate = async (id) => {
    try {
      await deleteCarouselTemplate(id);
      setTemplates(prev => prev.filter(t => t.id !== id));
    } catch (err) {
      alert(err.message || 'Failed to delete template');
    }
  };

  const updateSlide = (idx, patch) => {
    if (!editable || !onUpdatePlan) return;
    const next = slides.map((s, i) => i === idx ? { ...s, ...patch } : s);
    onUpdatePlan({ ...plan, slides: next });
  };
  const deleteSlide = (idx) => {
    if (!editable || !onUpdatePlan) return;
    // Hook (0) and last (CTA) cannot be removed.
    if (idx === 0 || idx === slides.length - 1) return;
    onUpdatePlan({ ...plan, slides: slides.filter((_, i) => i !== idx) });
  };
  const insertSlideAfter = (idx) => {
    if (!editable || !onUpdatePlan) return;
    const newSlide = {
      type: 'explanation',
      badge: 'NEW POINT',
      headline: 'New slide headline — mark the {{accent}}key word{{/accent}}',
      body: 'One short idea. Keep it to 2–4 lines.',
      visualElement: { kind: 'minimal-icon', description: 'Small supporting accent only.' },
      doNot: [],
    };
    const next = [...slides.slice(0, idx + 1), newSlide, ...slides.slice(idx + 1)];
    onUpdatePlan({ ...plan, slides: next });
  };
  const moveSlide = (from, to) => {
    if (!editable || !onUpdatePlan) return;
    if (from === to) return;
    // Hook stays at 0, CTA stays last.
    if (from === 0 || from === slides.length - 1) return;
    if (to === 0 || to >= slides.length - 1) return;
    const next = [...slides];
    const [moved] = next.splice(from, 1);
    next.splice(to, 0, moved);
    onUpdatePlan({ ...plan, slides: next });
  };

  return (
    <div className="content-carousel-plan">
      <div className="content-carousel-plan-header">
        <span className="content-carousel-plan-badge">CAROUSEL PLAN</span>
        <span className="content-carousel-plan-slides-count">{slides.length} slides{editable ? ' · editable' : ''}</span>
        {editable && (
          <div className="content-carousel-plan-templates-wrap">
            <button
              type="button"
              className="content-carousel-plan-templates-btn"
              onClick={() => { setTemplatesOpen(v => !v); if (!templatesOpen) loadTemplates(); }}
              title="Apply a saved design system"
            >
              Load template ▾
            </button>
            {templatesOpen && (
              <div className="content-carousel-plan-templates-pop" onClick={(e) => e.stopPropagation()}>
                {loadingTemplates && <div className="content-carousel-plan-templates-empty">Loading…</div>}
                {!loadingTemplates && templates.length === 0 && (
                  <div className="content-carousel-plan-templates-empty">No saved templates yet. After generating a carousel, click "Save as template" to capture its design system.</div>
                )}
                {templates.map(t => (
                  <div key={t.id} className="content-carousel-plan-template-row">
                    <button type="button" className="content-carousel-plan-template-apply" onClick={() => applyTemplate(t)}>
                      {t.preview_url ? <img src={t.preview_url} alt="" className="content-carousel-plan-template-thumb" /> : null}
                      <div className="content-carousel-plan-template-info">
                        <div className="content-carousel-plan-template-name">{t.name}</div>
                        <div className="content-carousel-plan-template-swatches">
                          {[t.design_system?.palette?.background, t.design_system?.palette?.accentPrimary, t.design_system?.palette?.gradientStart, t.design_system?.palette?.gradientEnd].filter(Boolean).map((hex, i) => (
                            <span key={i} className="content-carousel-plan-template-swatch" style={{ background: hex }} />
                          ))}
                        </div>
                      </div>
                    </button>
                    <button type="button" className="content-carousel-plan-template-delete" title="Delete template" onClick={() => removeTemplate(t.id)}>
                      <Trash2 size={12} />
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </div>
      {plan.hook && (
        <div className="content-carousel-plan-hook">
          <div className="content-carousel-plan-label">Hook</div>
          {editable
            ? <input
                className="content-carousel-plan-hook-input"
                value={plan.hook}
                onChange={(e) => onUpdatePlan && onUpdatePlan({ ...plan, hook: e.target.value })}
                placeholder="Hook headline"
              />
            : <div className="content-carousel-plan-hook-text">"{plan.hook}"</div>
          }
        </div>
      )}
      {plan.angle && (
        <div className="content-carousel-plan-angle">
          <span className="content-carousel-plan-label">Angle:</span> {plan.angle}
        </div>
      )}
      <div className="content-carousel-plan-section">
        <div className="content-carousel-plan-label">Slides {editable && <span className="content-carousel-plan-hint">drag middle slides to reorder · pencil is always available on generated slides</span>}</div>
        <div className="content-carousel-plan-slide-grid">
          {slides.map((s, i) => {
            const isHook = i === 0;
            const isFinal = i === slides.length - 1;
            const isLocked = isHook || isFinal;
            const canDrag = editable && !isLocked;
            const isDropZone = editable && dragIdx !== null && dropIdx === i && dragIdx !== i && !isHook && i < slides.length - 1;
            return (
              <div key={i} className={`content-carousel-plan-slide-card${isLocked ? ' content-carousel-plan-slide-card--locked' : ''}${isDropZone ? ' content-carousel-plan-slide-card--drop' : ''}`}
                draggable={canDrag}
                onDragStart={() => canDrag && setDragIdx(i)}
                onDragEnter={() => editable && setDropIdx(i)}
                onDragOver={(e) => editable && e.preventDefault()}
                onDragEnd={() => { setDragIdx(null); setDropIdx(null); }}
                onDrop={() => { if (dragIdx !== null && dropIdx !== null) moveSlide(dragIdx, dropIdx); setDragIdx(null); setDropIdx(null); }}
              >
                <div className="content-carousel-plan-slide-card-head">
                  <span className="content-carousel-plan-slide-num">{String(i + 1).padStart(2, '0')}</span>
                  <span className="content-carousel-plan-slide-type">{isHook ? 'HOOK' : isFinal ? 'CTA' : String(s.type || 'SLIDE').toUpperCase()}</span>
                  {editable && !isLocked && (
                    <button type="button" className="content-carousel-plan-slide-delete" title="Delete slide" onClick={() => deleteSlide(i)}>
                      <Trash2 size={12} />
                    </button>
                  )}
                </div>
                {editable
                  ? <input
                      className="content-carousel-plan-slide-badge-input"
                      value={s.badge || ''}
                      onChange={(e) => updateSlide(i, { badge: e.target.value })}
                      placeholder="BADGE LABEL"
                    />
                  : <div className="content-carousel-plan-slide-badge">{s.badge || ''}</div>
                }
                {editable
                  ? <textarea
                      className="content-carousel-plan-slide-headline-input"
                      value={s.headline || ''}
                      onChange={(e) => updateSlide(i, { headline: e.target.value })}
                      placeholder="Headline — wrap the accent word with {{accent}}word{{/accent}}"
                      rows={2}
                    />
                  : <div className="content-carousel-plan-slide-headline">
                      {(s.headline || '').replace(/\{\{accent\}\}|\{\{\/accent\}\}/g, '')}
                    </div>
                }
                {editable
                  ? <textarea
                      className="content-carousel-plan-slide-body-input"
                      value={s.body || ''}
                      onChange={(e) => updateSlide(i, { body: e.target.value })}
                      placeholder="Body copy (2–4 lines)"
                      rows={3}
                    />
                  : (s.body && <div className="content-carousel-plan-slide-body">{s.body}</div>)
                }
                {isFinal && (
                  editable
                    ? <input
                        className="content-carousel-plan-slide-cta-input"
                        value={s.cta || ''}
                        onChange={(e) => updateSlide(i, { cta: e.target.value })}
                        placeholder="CTA button text"
                      />
                    : (s.cta && <div className="content-carousel-plan-slide-cta">CTA: {s.cta}</div>)
                )}
                {editable && !isFinal && i < slides.length - 1 && (
                  <button type="button" className="content-carousel-plan-slide-insert" onClick={() => insertSlideAfter(i)} title="Insert slide after this one">
                    <Plus size={12} /> insert slide
                  </button>
                )}
              </div>
            );
          })}
        </div>
      </div>
      <div className="content-carousel-plan-section">
        <div className="content-carousel-plan-label">Design system {editable ? '(tap a swatch to change)' : '(locked)'}</div>
        <div className="content-carousel-plan-palette">
          {[
            { key: 'background', label: 'BG', hex: p.background },
            { key: 'accentPrimary', label: 'Accent', hex: p.accentPrimary },
            { key: 'gradientStart', label: 'Grad A', hex: p.gradientStart },
            { key: 'gradientEnd', label: 'Grad B', hex: p.gradientEnd },
            { key: 'textPrimary', label: 'Text', hex: p.textPrimary },
            { key: 'glow', label: 'Glow', hex: p.glow },
          ].filter(s => s.hex).map(s => (
            <label key={s.key} className={`content-carousel-plan-swatch${editable ? ' content-carousel-plan-swatch--editable' : ''}`} style={{ background: s.hex }} title={`${s.label}: ${s.hex}`}>
              {editable && onUpdatePlan && (
                <input
                  type="color"
                  value={s.hex}
                  onChange={(e) => onUpdatePlan({ ...plan, designSystem: { ...ds, palette: { ...p, [s.key]: e.target.value } } })}
                  className="content-carousel-plan-swatch-input"
                />
              )}
              <span>{s.hex}</span>
            </label>
          ))}
        </div>
        <div className="content-carousel-plan-meta">
          <div><strong>Mode:</strong> {ds.mode || '—'}</div>
          <div><strong>Card:</strong> {ds.card?.style || '—'}</div>
          <div><strong>Font:</strong> {ds.typography?.family || '—'}</div>
          <div><strong>Accent:</strong> {ds.accentTreatment?.slice(0, 80) || '—'}</div>
        </div>
        {ds.mood && <div className="content-carousel-plan-mood">{ds.mood}</div>}
      </div>
      {(plan.caption || editable) && (
        <div className="content-carousel-plan-section">
          <div className="content-carousel-plan-label">Caption</div>
          {editable
            ? <textarea
                className="content-carousel-plan-caption-input"
                value={plan.caption || ''}
                onChange={(e) => onUpdatePlan && onUpdatePlan({ ...plan, caption: e.target.value })}
                placeholder="IG caption (first ~125 chars show before 'more')"
                rows={4}
              />
            : <div className="content-carousel-plan-caption">{plan.caption}</div>
          }
          {editable && (
            <div className="content-carousel-plan-caption-counter">
              {(plan.caption || '').length} chars
              {(plan.caption || '').length > 125 && <span className="content-carousel-plan-caption-counter-fold"> · fold at 125</span>}
            </div>
          )}
        </div>
      )}
      {!plan.approved && (
        <button
          type="button"
          className="content-carousel-plan-approve"
          onClick={onApprove}
        >
          Approve & generate slides
        </button>
      )}
      {plan.approved && plan.generating && (
        <div className="content-carousel-plan-approve content-carousel-plan-approve--disabled">
          Generating slides…
        </div>
      )}
      {hasFailed && (
        <div className="content-carousel-plan-retry-row">
          <div className="content-carousel-plan-retry-msg">
            {failed.length === 1
              ? `Slide ${failed[0] + 1} failed to render.`
              : `${failed.length} slides failed to render: ${failed.map(i => i + 1).join(', ')}.`}
          </div>
          <button
            type="button"
            className="content-carousel-plan-retry-btn"
            onClick={onRetryFailed}
          >
            Retry {failed.length === 1 ? 'failed slide' : `${failed.length} slides`}
          </button>
        </div>
      )}
      {plan.error && <div className="content-carousel-plan-error">{plan.error}</div>}
    </div>
  );
}

// Actions bar that appears below a finished carousel: ZIP download + a
// one-time "pencil discovery" tooltip so first-time users know they can
// edit any slide. Dismisses on click, localStorage flag so it doesn't
// re-show on every carousel.
// Instagram-feed-style side preview panel. Shows the carousel as it
// would actually appear in the IG app — profile header, square media
// with swipe nav + dots, like/comment/share/save row, and the caption
// with IG's 125-char fold + "more" toggle. Reads straight from the
// message (no data copy) so edits/regenerates made elsewhere reflect
// here immediately. ESC + arrow keys wired.
// Deterministic pseudo-random from a string — gives each message stable
// dummy reaction/comment/share counts so they don't fluctuate on every
// render but still vary between posts.
function stableHash(seed) {
  let h = 0;
  const s = String(seed || '');
  for (let i = 0; i < s.length; i++) h = ((h * 31) + s.charCodeAt(i)) | 0;
  return Math.abs(h);
}
function stableRange(seed, min, max) {
  const h = stableHash(seed);
  return min + (h % Math.max(1, (max - min + 1)));
}

function CarouselSidePanel({ msg, brandDna, user, onClose, onEdit, onRegenerate, onFullscreen, isGenerating }) {
  const images = useMemo(() => [...(msg?.images || [])].sort((a, b) => a.idx - b.idx), [msg]);
  const [idx, setIdx] = useState(0);
  const [captionExpanded, setCaptionExpanded] = useState(false);

  // Stable dummy counts for this post — derived from msg.id, so they
  // don't change as the user scrolls or re-renders.
  const dummyCounts = useMemo(() => ({
    likes: stableRange(msg?.id + ':likes', 240, 980),
    comments: stableRange(msg?.id + ':comments', 8, 54),
    shares: stableRange(msg?.id + ':shares', 3, 42),
    saves: stableRange(msg?.id + ':saves', 12, 120),
    liReactions: stableRange(msg?.id + ':lireac', 80, 420),
    liComments: stableRange(msg?.id + ':licmt', 6, 38),
    liReposts: stableRange(msg?.id + ':lirep', 2, 18),
  }), [msg?.id]);

  // Clamp idx if images list shrinks (e.g. a regenerate happens mid-view).
  useEffect(() => {
    if (idx > images.length - 1) setIdx(Math.max(0, images.length - 1));
  }, [images.length, idx]);

  // Keyboard nav + ESC. Scoped to when the panel is open.
  useEffect(() => {
    const onKey = (e) => {
      if (e.key === 'Escape') { e.preventDefault(); onClose(); }
      else if (e.key === 'ArrowLeft') { e.preventDefault(); setIdx(i => Math.max(0, i - 1)); }
      else if (e.key === 'ArrowRight') { e.preventDefault(); setIdx(i => Math.min(images.length - 1, i + 1)); }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [images.length, onClose]);

  if (!msg || images.length === 0) return null;
  const current = images[idx];
  if (!current) return null;

  const plan = msg.carouselPlan || {};
  const caption = plan.caption || msg.content || '';
  // LinkedIn captions usually aren't truncated aggressively on feed; IG
  // folds at ~125 chars. Different fold per platform keeps the preview honest.
  const isLinkedin = msg.platform === 'linkedin';
  const CAPTION_FOLD = isLinkedin ? 210 : 125;
  const captionIsLong = caption.length > CAPTION_FOLD;
  const captionDisplay = captionIsLong && !captionExpanded ? caption.slice(0, CAPTION_FOLD).trimEnd() + '…' : caption;

  const username = (brandDna?.brand_name || user?.name || 'your_brand').toLowerCase().replace(/\s+/g, '_').slice(0, 30);
  const displayName = brandDna?.brand_name || user?.name || 'Your Brand';
  const avatarUrl = brandDna?.logos?.find(l => l.isDefault)?.url || brandDna?.logos?.[0]?.url || brandDna?.logo_url || brandDna?.photo_urls?.[0];

  const atStart = idx === 0;
  const atEnd = idx === images.length - 1;
  const panelClass = `content-ig-preview${isLinkedin ? ' content-ig-preview--linkedin' : ''}`;
  const previewLabel = isLinkedin ? 'LinkedIn preview' : 'Instagram preview';

  return (
    <div className={panelClass} role="dialog" aria-label={previewLabel}>
      <div className="content-ig-preview-header">
        <span className="content-ig-preview-title">{previewLabel}</span>
        <button className="content-ig-preview-close" onClick={onClose} title="Close side preview (ESC)">
          <X size={16} />
        </button>
      </div>
      <div className="content-ig-feed">
        <div className="content-ig-post">
          {/* Post header */}
          <div className="content-ig-post-header">
            {isLinkedin ? (
              <>
                {avatarUrl
                  ? <img src={avatarUrl} alt="" className="content-ig-avatar-li" onError={(e) => { e.target.style.display = 'none'; }} />
                  : <div className="content-ig-avatar-li content-ig-avatar--fallback">{displayName.charAt(0).toUpperCase()}</div>
                }
                <div className="content-ig-li-names">
                  <div className="content-ig-li-name">{displayName}</div>
                  <div className="content-ig-li-sub">Author · Just now</div>
                </div>
                <span className="content-ig-more-menu">⋯</span>
              </>
            ) : (
              <>
                <div className="content-ig-avatar-ring">
                  {avatarUrl
                    ? <img src={avatarUrl} alt="" className="content-ig-avatar" onError={(e) => { e.target.style.display = 'none'; }} />
                    : <div className="content-ig-avatar content-ig-avatar--fallback">{username.charAt(0).toUpperCase()}</div>
                  }
                </div>
                <span className="content-ig-username">{username}</span>
                <span className="content-ig-dot-sep">·</span>
                <span className="content-ig-follow">Following</span>
                <span className="content-ig-more-menu">⋯</span>
              </>
            )}
          </div>

          {/* Media — aspect swaps per platform */}
          <div className="content-ig-media">
            <img src={current.src} alt={`Slide ${idx + 1}`} className="content-ig-slide" />
            <div className="content-ig-counter">{idx + 1}/{images.length}</div>
            {!atStart && (
              <button className="content-ig-nav content-ig-nav--prev" onClick={() => setIdx(i => i - 1)} aria-label="Previous slide">
                <ChevronLeft size={20} />
              </button>
            )}
            {!atEnd && (
              <button className="content-ig-nav content-ig-nav--next" onClick={() => setIdx(i => i + 1)} aria-label="Next slide">
                <ChevronRight size={20} />
              </button>
            )}
            {/* Hover tools — only for this slide. Live actions, not fake icons. */}
            <div className="content-ig-tools">
              <button className="content-ig-tool" onClick={() => onFullscreen(current.idx)} title="Full screen" disabled={isGenerating}>
                <Maximize2 size={14} />
              </button>
              {onEdit && (
                <button className="content-ig-tool" onClick={() => onEdit(current.idx, current.src)} title="Edit slide (keeps design)" disabled={isGenerating}>
                  <Pencil size={14} />
                </button>
              )}
              {onRegenerate && (
                <button className="content-ig-tool" onClick={() => onRegenerate(current.idx)} title="Re-roll slide (same spec)" disabled={isGenerating}>
                  <RefreshCw size={14} />
                </button>
              )}
            </div>
          </div>

          {/* Dots indicator — both platforms */}
          {images.length > 1 && (
            <div className="content-ig-indicator">
              {images.map((_, i) => (
                <span key={i} className={`content-ig-indicator-dot${i === idx ? ' content-ig-indicator-dot--active' : ''}`} />
              ))}
            </div>
          )}

          {/* Platform-specific caption + action row */}
          {isLinkedin ? (
            <>
              <div className="content-li-caption">
                <span className="content-li-caption-body">
                  {captionDisplay}
                  {captionIsLong && !captionExpanded && (
                    <button className="content-li-more-link" onClick={() => setCaptionExpanded(true)}>…see more</button>
                  )}
                </span>
              </div>
              {/* Branded LinkedIn reaction SVGs — same set used in LinkedInPreview component */}
              <div className="content-li-reactions">
                <div className="content-li-reactions-icons">
                  <span className="content-li-reaction-emoji">
                    <svg width="16" height="16" viewBox="0 0 16 16"><defs><linearGradient id="liCarLikeGrad" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor="#378FE9"/><stop offset="100%" stopColor="#0D6BC6"/></linearGradient></defs><circle cx="8" cy="8" r="8" fill="url(#liCarLikeGrad)"/><path d="M11.5 7.2h-2l.3-1.5c.1-.5-.1-1-.5-1.2-.2-.1-.5 0-.6.2L7 7.2H5.5c-.3 0-.5.2-.5.5v3.8c0 .3.2.5.5.5h4.8c.4 0 .7-.2.8-.6l.8-2.6c.2-.5-.2-1.1-.7-1.1L11.5 7.2z" fill="#fff"/></svg>
                  </span>
                  <span className="content-li-reaction-emoji">
                    <svg width="16" height="16" viewBox="0 0 16 16"><circle cx="8" cy="8" r="8" fill="#44712E"/><path d="M6 10.5l1-4.5 2 1.5L8 12l-2-1.5z" fill="#fff" opacity="0.9"/><path d="M5 5l1.5 1M10 4.5l-1 1.5M7.5 3.5V5M11 6l-1 .5" stroke="#FFC233" strokeWidth="1" strokeLinecap="round"/></svg>
                  </span>
                  <span className="content-li-reaction-emoji">
                    <svg width="16" height="16" viewBox="0 0 16 16"><circle cx="8" cy="8" r="8" fill="#DF704D"/><path d="M8 12s-3.5-2.2-3.5-4.5C4.5 6.1 5.6 5 7 5c.8 0 1.4.4 1.7.9h.1c.3-.5 1-.9 1.7-.9 1.4 0 2.5 1.1 2.5 2.5C13 9.8 9.5 12 8 12z" fill="#fff"/></svg>
                  </span>
                </div>
                <span className="content-li-reaction-count">{dummyCounts.liReactions.toLocaleString()}</span>
                <span className="content-li-reaction-sep">·</span>
                <span className="content-li-comments-count">{dummyCounts.liComments} comments · {dummyCounts.liReposts} reposts</span>
              </div>
              <div className="content-li-divider" />
              <div className="content-li-actions">
                <button className="content-li-action" type="button">
                  <svg width="22" height="22" viewBox="0 0 24 24" fill="none"><path d="M19.46 11l-3.91-3.91a7 7 0 01-1.69-2.74l-.49-1.47A2.76 2.76 0 0010.76 1 2.75 2.75 0 008 3.74v1.12a9.19 9.19 0 00.46 2.85L8.89 9H4.12A2.12 2.12 0 002 11.12a2.16 2.16 0 00.92 1.76A2.11 2.11 0 002 14.62a2.14 2.14 0 001.28 2 2 2 0 00-.28 1 2.12 2.12 0 002 2.12v.14A2.12 2.12 0 007.12 22h7.49a8.08 8.08 0 003.58-.84l.31-.16H21V11z" stroke="#666" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/></svg>
                  <span>Like</span>
                </button>
                <button className="content-li-action" type="button">
                  <svg width="22" height="22" viewBox="0 0 24 24" fill="none"><path d="M7 9h10M7 13h6M21 20l-4-4H5a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v8a2 2 0 01-2 2h-1v4z" stroke="#666" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/></svg>
                  <span>Comment</span>
                </button>
                <button className="content-li-action" type="button">
                  <svg width="22" height="22" viewBox="0 0 24 24" fill="none"><path d="M13.5 2L17 5.5 13.5 9" stroke="#666" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/><path d="M6 10.5V8a2.5 2.5 0 012.5-2.5H17" stroke="#666" strokeWidth="1.5" strokeLinecap="round"/><path d="M10.5 22L7 18.5 10.5 15" stroke="#666" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/><path d="M18 13.5V16a2.5 2.5 0 01-2.5 2.5H7" stroke="#666" strokeWidth="1.5" strokeLinecap="round"/></svg>
                  <span>Repost</span>
                </button>
                <button className="content-li-action" type="button">
                  <svg width="22" height="22" viewBox="0 0 24 24" fill="none"><path d="M21 3L14.5 21l-3-7.5L4 10.5 21 3z" stroke="#666" strokeWidth="1.5" strokeLinejoin="round"/></svg>
                  <span>Send</span>
                </button>
              </div>
              {/* Comment area — matches LinkedInPreview's styling */}
              <div className="content-li-comment-area">
                <div className="content-li-comment-avatar">
                  {avatarUrl
                    ? <img src={avatarUrl} alt="" onError={(e) => { e.target.style.display = 'none'; }} />
                    : <div className="content-li-comment-avatar-ph">{displayName.charAt(0).toUpperCase()}</div>
                  }
                </div>
                <div className="content-li-comment-input">
                  <span className="content-li-comment-placeholder">Add a comment...</span>
                </div>
              </div>
            </>
          ) : (
            <>
              {/* IG action row — icons with per-action counts (Reel-style) */}
              <div className="content-ig-actions">
                <div className="content-ig-action">
                  <Heart size={26} strokeWidth={1.8} />
                  <span className="content-ig-action-count">{dummyCounts.likes.toLocaleString()}</span>
                </div>
                <div className="content-ig-action">
                  <MessageCircle size={26} strokeWidth={1.8} />
                  <span className="content-ig-action-count">{dummyCounts.comments}</span>
                </div>
                <div className="content-ig-action">
                  <Send size={26} strokeWidth={1.8} />
                  <span className="content-ig-action-count">{dummyCounts.shares}</span>
                </div>
                <div className="content-ig-action content-ig-action-save">
                  <Bookmark size={26} strokeWidth={1.8} />
                </div>
              </div>
              {/* Caption with IG's 125-char fold */}
              <div className="content-ig-caption">
                <span className="content-ig-caption-username">{username}</span>
                <span className="content-ig-caption-body">
                  {captionDisplay}
                  {captionIsLong && !captionExpanded && (
                    <button className="content-ig-more-link" onClick={() => setCaptionExpanded(true)}>more</button>
                  )}
                </span>
              </div>
              <div className="content-ig-meta">
                <span>View all {dummyCounts.comments} comments</span>
                <span className="content-ig-meta-time">Just now</span>
              </div>
              {/* IG-style comment input row — visual only */}
              <div className="content-ig-comment-row">
                <div className="content-ig-avatar-sm">
                  {avatarUrl
                    ? <img src={avatarUrl} alt="" onError={(e) => { e.target.style.display = 'none'; }} />
                    : <div className="content-ig-avatar-sm-fallback">{username.charAt(0).toUpperCase()}</div>
                  }
                </div>
                <span className="content-ig-comment-placeholder">Add a comment…</span>
                <span className="content-ig-comment-emoji">😊</span>
                <span className="content-ig-comment-more">⋯</span>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

// Full-screen slide viewer modal. ESC closes (falls back to chat),
// arrow keys navigate between slides. Pencil/refresh icons route back
// into the parent handlers (they close the viewer first so the user
// sees the slide's inline state update in context).
function SlideViewerModal({ image, position, total, onClose, onPrev, onNext, onEdit, onRegenerate, isGenerating }) {
  useEffect(() => {
    const onKey = (e) => {
      if (e.key === 'Escape') { e.preventDefault(); onClose(); }
      else if (e.key === 'ArrowLeft') { e.preventDefault(); onPrev(); }
      else if (e.key === 'ArrowRight') { e.preventDefault(); onNext(); }
    };
    window.addEventListener('keydown', onKey);
    // Lock body scroll while modal is open.
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      window.removeEventListener('keydown', onKey);
      document.body.style.overflow = prevOverflow;
    };
  }, [onClose, onPrev, onNext]);
  const atStart = position <= 0;
  const atEnd = position >= total - 1;
  return (
    <div className="content-slide-viewer" onClick={onClose} role="dialog" aria-modal="true">
      <div className="content-slide-viewer-toolbar" onClick={(e) => e.stopPropagation()}>
        {onEdit && (
          <button className="content-slide-viewer-tool" onClick={onEdit} title="Edit this slide (keeps design locked)" disabled={isGenerating}>
            <Pencil size={16} />
          </button>
        )}
        {onRegenerate && (
          <button className="content-slide-viewer-tool" onClick={onRegenerate} title="Re-roll this slide (same spec, new render)" disabled={isGenerating}>
            <RefreshCw size={16} />
          </button>
        )}
      </div>
      <button className="content-slide-viewer-close" onClick={(e) => { e.stopPropagation(); onClose(); }} aria-label="Close">
        <X size={22} />
      </button>
      <div className="content-slide-viewer-counter">{position + 1} / {total}</div>
      {!atStart && (
        <button className="content-slide-viewer-nav content-slide-viewer-nav--prev" onClick={(e) => { e.stopPropagation(); onPrev(); }} aria-label="Previous slide">
          <ChevronLeft size={28} />
        </button>
      )}
      {!atEnd && (
        <button className="content-slide-viewer-nav content-slide-viewer-nav--next" onClick={(e) => { e.stopPropagation(); onNext(); }} aria-label="Next slide">
          <ChevronRight size={28} />
        </button>
      )}
      <img src={image.src} alt={`Slide ${position + 1}`} className="content-slide-viewer-img" onClick={(e) => e.stopPropagation()} />
      <div className="content-slide-viewer-hint">ESC to close · ← → to navigate</div>
    </div>
  );
}

function CarouselActionsBar({ msgId, plan, images, onOpenSidePreview, platform = 'instagram' }) {
  const [downloading, setDownloading] = useState(false);
  const [showTip, setShowTip] = useState(() => {
    try { return localStorage.getItem('aiceo.carouselEditTipDismissed') !== '1'; } catch { return true; }
  });
  const dismissTip = () => {
    setShowTip(false);
    try { localStorage.setItem('aiceo.carouselEditTipDismissed', '1'); } catch {}
  };
  // Auto-dismiss after 12s so it doesn't linger forever.
  useEffect(() => {
    if (!showTip) return;
    const t = setTimeout(() => dismissTip(), 12000);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [showTip]);

  const downloadZip = async () => {
    if (downloading) return;
    setDownloading(true);
    try {
      const { default: JSZip } = await import('jszip');
      const zip = new JSZip();
      // Images may be either data: URLs (fresh generation) OR remote
      // Supabase storage URLs (after the debounced auto-save swaps them).
      // Handle both — the previous build assumed data: only and skipped
      // everything else, which is why the zip contained only text files.
      let added = 0;
      for (const img of images) {
        if (!img.src) continue;
        const slideLabel = String(img.idx + 1).padStart(2, '0');
        try {
          if (img.src.startsWith('data:')) {
            const commaIdx = img.src.indexOf(',');
            if (commaIdx === -1) continue;
            const b64 = img.src.slice(commaIdx + 1);
            const mime = (img.src.match(/^data:([^;]+);/) || [])[1] || 'image/png';
            const ext = (mime.split('/')[1] || 'png').split('+')[0];
            zip.file(`slide-${slideLabel}.${ext}`, b64, { base64: true });
            added++;
          } else {
            // Remote URL — fetch as blob so jszip can add it directly.
            const res = await fetch(img.src, { mode: 'cors' });
            if (!res.ok) throw new Error(`HTTP ${res.status}`);
            const blob = await res.blob();
            const ext = ((blob.type || 'image/png').split('/')[1] || 'png').split('+')[0];
            zip.file(`slide-${slideLabel}.${ext}`, blob);
            added++;
          }
        } catch (imgErr) {
          console.warn(`[zip] slide ${img.idx + 1} failed:`, imgErr);
        }
      }
      if (plan?.caption) zip.file('caption.txt', plan.caption);
      if (plan?.hook) zip.file('hook.txt', plan.hook);
      if (added === 0) throw new Error('No slides could be added — check your connection and try again.');
      const blob = await zip.generateAsync({ type: 'blob' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      const ts = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
      a.href = url;
      a.download = `carousel-${ts}.zip`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 2000);
    } catch (err) {
      console.error('ZIP download failed:', err);
      alert(err.message || 'Download failed. Try again or download slides individually.');
    } finally {
      setDownloading(false);
    }
  };

  // ── Schedule to Content Calendar ──
  // Creates a social_posts row (shared with ContentCalendar page). If any
  // image is still a data: URL (auto-save hasn't uploaded it yet) we
  // upload on the fly so the calendar entry holds real URLs, not huge
  // base64 blobs that would blow up the table.
  const [scheduleOpen, setScheduleOpen] = useState(false);
  // Outside-click to close the schedule popover. Scoped to when it's open
  // so we don't attach listeners for carousels that aren't interacting
  // with the popover.
  const scheduleWrapRef = useRef(null);
  useEffect(() => {
    if (!scheduleOpen) return;
    const onDown = (e) => {
      if (scheduleWrapRef.current && !scheduleWrapRef.current.contains(e.target)) {
        setScheduleOpen(false);
      }
    };
    document.addEventListener('mousedown', onDown);
    return () => document.removeEventListener('mousedown', onDown);
  }, [scheduleOpen]);
  const [scheduleWhen, setScheduleWhen] = useState(() => {
    const d = new Date();
    d.setDate(d.getDate() + 1);
    d.setHours(10, 0, 0, 0);
    return d.toISOString().slice(0, 16);
  });
  const [scheduling, setScheduling] = useState(false);
  const [scheduleStatus, setScheduleStatus] = useState(null); // 'saved' | 'published' | null

  // Upload any data-URL slides to storage and return the media array
  // ready for social_posts.
  const collectMedia = async () => {
    const media = [];
    for (const img of images) {
      if (!img.src) continue;
      let url = img.src;
      if (url.startsWith('data:')) {
        const commaIdx = url.indexOf(',');
        const mimeMatch = url.match(/^data:([^;]+);/);
        const base64 = url.slice(commaIdx + 1);
        const mimeType = mimeMatch?.[1] || 'image/png';
        const uploaded = await uploadImageToStorage(base64, mimeType);
        url = uploaded.url || uploaded.publicUrl || url;
      }
      media.push({ type: 'image', url });
    }
    return media;
  };

  const saveToCalendar = async (mode /* 'scheduled' | 'draft' | 'publish' */) => {
    if (scheduling) return;
    setScheduling(true);
    try {
      const media = await collectMedia();
      if (!media.length) throw new Error('No images to schedule');
      const { post } = await createCalendarPost({
        platform,
        caption: plan.caption || '',
        content_type: 'carousel',
        scheduled_at: mode === 'scheduled' ? new Date(scheduleWhen).toISOString() : null,
        media,
        status: mode === 'scheduled' ? 'scheduled' : 'draft',
      });
      if (mode === 'publish') {
        // Fire the BooSend → Instagram publish pipeline on the saved row.
        await publishCalendarPost(post.id);
        setScheduleStatus('published');
      } else {
        setScheduleStatus('saved');
      }
      setScheduleOpen(false);
      setTimeout(() => setScheduleStatus(null), 4000);
    } catch (err) {
      console.error('Calendar save failed:', err);
      alert(err.message || 'Failed to save to calendar');
    } finally {
      setScheduling(false);
    }
  };

  // Save the current design system as a reusable template. Upload the hook
  // slide as the preview thumbnail if it's still a data URL.
  const [savingTemplate, setSavingTemplate] = useState(false);
  // Seed from persisted plan.templateSaved so the button stays disabled
  // after a page refresh if this carousel's template was already saved.
  const [templateSaved, setTemplateSaved] = useState(!!plan?.templateSaved);
  useEffect(() => { setTemplateSaved(!!plan?.templateSaved); }, [plan?.templateSaved]);
  const [templateModalOpen, setTemplateModalOpen] = useState(false);
  const [templateNameDraft, setTemplateNameDraft] = useState('');
  const [templateModalError, setTemplateModalError] = useState('');
  const openTemplateModal = () => {
    if (templateSaved || savingTemplate) return;
    const platformTag = platform === 'linkedin' ? 'LI' : 'IG';
    const hookSnippet = (plan.hook || 'Carousel').replace(/\{\{\/?accent\}\}/g, '').slice(0, 48).trim();
    const defaultName = `${platformTag} · ${hookSnippet} · ${new Date().toLocaleDateString()}`;
    setTemplateNameDraft(defaultName);
    setTemplateModalError('');
    setTemplateModalOpen(true);
  };
  const saveAsTemplate = async () => {
    const name = templateNameDraft.trim();
    if (!name) {
      setTemplateModalError('Name is required.');
      return;
    }
    if (savingTemplate) return;
    setSavingTemplate(true);
    setTemplateModalError('');
    try {
      const hook = images.find(i => i.idx === 0);
      let previewUrl = null;
      if (hook?.src?.startsWith('data:')) {
        const commaIdx = hook.src.indexOf(',');
        const mimeMatch = hook.src.match(/^data:([^;]+);/);
        const base64 = hook.src.slice(commaIdx + 1);
        const mimeType = mimeMatch?.[1] || 'image/png';
        const uploaded = await uploadImageToStorage(base64, mimeType);
        previewUrl = uploaded.url || uploaded.publicUrl || null;
      } else if (hook?.src) {
        previewUrl = hook.src;
      }
      await createCarouselTemplate({
        name,
        design_system: plan.designSystem,
        preview_url: previewUrl,
      });
      setTemplateSaved(true);
      // Stamp it on the plan so auto-save persists the flag; button stays
      // disabled even after a page refresh.
      try {
        window.dispatchEvent(new CustomEvent('carousel-template-saved', { detail: { msgId } }));
      } catch {}
      setTemplateModalOpen(false);
      // Notify the sidebar card to refetch so the new template appears
      // immediately without a page reload.
      try { window.dispatchEvent(new CustomEvent('carousel-templates-changed')); } catch {}
    } catch (err) {
      console.error('Template save failed:', err);
      setTemplateModalError(err.message || 'Failed to save template');
    } finally {
      setSavingTemplate(false);
    }
  };

  return (
    <div className="content-carousel-actions">
      {onOpenSidePreview && (
        <button type="button" className="content-carousel-action-btn" onClick={onOpenSidePreview} title={`Preview as it would appear on ${platform === 'linkedin' ? 'LinkedIn' : 'Instagram'}`}>
          <Maximize2 size={14} /> Preview on {platform === 'linkedin' ? 'LinkedIn' : 'Instagram'}
        </button>
      )}
      <button type="button" className="content-carousel-action-btn" onClick={downloadZip} disabled={downloading}>
        <Download size={14} /> {downloading ? 'Packing…' : `Download all (${images.length} slides + caption)`}
      </button>
      <div className="content-carousel-schedule-wrap" ref={scheduleWrapRef}>
        <button type="button" className="content-carousel-action-btn" onClick={() => setScheduleOpen(v => !v)} disabled={scheduling}>
          <CalendarDays size={14} />
          {scheduleStatus === 'published' ? `Published to ${platform === 'linkedin' ? 'LinkedIn' : 'Instagram'}` : scheduleStatus === 'saved' ? 'Saved to calendar' : (scheduling ? 'Saving…' : 'Send to calendar')}
        </button>
        {scheduleOpen && (
          <div className="content-carousel-schedule-pop" onClick={(e) => e.stopPropagation()}>
            <label className="content-carousel-schedule-label">Schedule date/time</label>
            <input
              type="datetime-local"
              className="content-carousel-schedule-input"
              value={scheduleWhen}
              onChange={(e) => setScheduleWhen(e.target.value)}
            />
            <div className="content-carousel-schedule-actions">
              <button type="button" className="content-carousel-schedule-secondary" onClick={() => saveToCalendar('draft')} disabled={scheduling}>
                Save as draft
              </button>
              <button type="button" className="content-carousel-schedule-secondary" onClick={() => saveToCalendar('scheduled')} disabled={scheduling}>
                Schedule
              </button>
              <button type="button" className="content-carousel-schedule-primary" onClick={() => saveToCalendar('publish')} disabled={scheduling} title="Save + publish immediately via connected Instagram account">
                Publish now
              </button>
            </div>
            <div className="content-carousel-schedule-hint">
              "Publish now" uses the {platform === 'linkedin' ? 'LinkedIn' : 'Instagram'} account connected under Settings. If not connected, save as draft and publish from the Content Calendar later.
            </div>
          </div>
        )}
      </div>
      <button
        type="button"
        className="content-carousel-action-btn"
        onClick={openTemplateModal}
        disabled={savingTemplate || templateSaved}
        title={templateSaved ? 'Template saved for this carousel' : 'Save this design system so future carousels can inherit the look'}
      >
        <Zap size={14} /> {templateSaved ? 'Template saved' : (savingTemplate ? 'Saving…' : 'Save as template')}
      </button>
      {templateModalOpen && (
        <div className="content-template-modal-overlay" onClick={() => !savingTemplate && setTemplateModalOpen(false)} role="dialog" aria-modal="true">
          <div className="content-template-modal" onClick={(e) => e.stopPropagation()}>
            <div className="content-template-modal-header">
              <span className="content-template-modal-title">Save as template</span>
              <button type="button" className="content-template-modal-close" onClick={() => !savingTemplate && setTemplateModalOpen(false)} aria-label="Close">
                <X size={16} />
              </button>
            </div>
            <div className="content-template-modal-body">
              <label className="content-template-modal-label">Template name</label>
              <input
                type="text"
                className="content-template-modal-input"
                value={templateNameDraft}
                onChange={(e) => setTemplateNameDraft(e.target.value)}
                onKeyDown={(e) => { if (e.key === 'Enter') saveAsTemplate(); if (e.key === 'Escape' && !savingTemplate) setTemplateModalOpen(false); }}
                placeholder="e.g. Minimalist Amber, Bold Editorial…"
                autoFocus
                disabled={savingTemplate}
              />
              <div className="content-template-modal-hint">
                Captures the locked palette, typography, card style, glow, and mood. Future carousels can inherit this look from the sidebar "Saved samples" card.
              </div>
              {templateModalError && <div className="content-template-modal-error">{templateModalError}</div>}
            </div>
            <div className="content-template-modal-footer">
              <button type="button" className="content-template-modal-cancel" onClick={() => setTemplateModalOpen(false)} disabled={savingTemplate}>
                Cancel
              </button>
              <button type="button" className="content-template-modal-save" onClick={saveAsTemplate} disabled={savingTemplate || !templateNameDraft.trim()}>
                {savingTemplate ? 'Saving…' : 'Save template'}
              </button>
            </div>
          </div>
        </div>
      )}
      {showTip && (
        <div className="content-carousel-edit-tip" onClick={dismissTip} role="button" title="Dismiss">
          <Pencil size={12} />
          <span>Click the pencil on any slide to edit it, design is preserved.</span>
          <X size={12} className="content-carousel-edit-tip-close" />
        </div>
      )}
    </div>
  );
}

function SocialThumb({ src }) {
  const [failedSrc, setFailedSrc] = useState(null);
  if (!src || failedSrc === src) {
    return (
      <div className="cs-social-card-placeholder">
        <Link2 size={16} />
      </div>
    );
  }
  return (
    <img
      src={src}
      alt=""
      className="cs-social-card-img"
      referrerPolicy="no-referrer"
      onError={() => setFailedSrc(src)}
    />
  );
}

export default function Content() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [selectedPlatform, setSelectedPlatform] = useState('instagram');
  const [input, setInput] = useState('');
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [photos, setPhotos] = useState([]); // { id, file, status: 'pending'|'uploading'|'done'|'error', result?, dbId?, url? }
  const [documents, setDocuments] = useState([]); // { id, file, status, result?, dbId?, filename? }
  const [socialUrls, setSocialUrls] = useState([]); // { url, status: 'pending'|'extracting'|'done'|'error', result?, dbId? }
  const [socialError, setSocialError] = useState('');
  const [socialHover, setSocialHover] = useState(false);
  const [socialInput, setSocialInput] = useState('');
  const [photoHover, setPhotoHover] = useState(false);
  const [docHover, setDocHover] = useState(false);
  const [photoDragOver, setPhotoDragOver] = useState(false);
  const [docDragOver, setDocDragOver] = useState(false);
  const [tooltip, setTooltip] = useState({ text: '', x: 0, y: 0, visible: false });
  const [contextSheetOpen, setContextSheetOpen] = useState(false);
  const [contentResearchMode, setContentResearchMode] = useState(false);
  const [searchStatus, setSearchStatus] = useState(null);
  const [contentCtxMenuOpen, setContentCtxMenuOpen] = useState(false);
  const [contentHoveredCat, setContentHoveredCat] = useState(null);
  const [currentQuestion, setCurrentQuestion] = useState(null);
  const [customTyping, setCustomTyping] = useState(false);
  const [customText, setCustomText] = useState('');
  const [contentSelectedCtx, setContentSelectedCtx] = useState(new Set());
  const [showPasteBtn, setShowPasteBtn] = useState(false);
  const [messages, setMessages] = useState([]);
  const [isGenerating, setIsGenerating] = useState(false);
  // Tracks the id of the assistant message currently being generated.
  // The animated "thinking..." dots only show for THIS message — older
  // empty-content messages (from previous timeouts) render a static
  // "No response received" instead of flipping back to dots whenever
  // the user fires off a new request.
  const [activeAssistantId, setActiveAssistantId] = useState(null);
  const [editingImage, setEditingImage] = useState(null); // { msgId, imgIdx, src }
  const [slideViewer, setSlideViewer] = useState(null); // { msgId, idx } — full-screen slide viewer
  const [carouselSideView, setCarouselSideView] = useState(null); // { msgId } — IG-feed-style side panel preview
  const [creditsDepleted, setCreditsDepleted] = useState(false);
  const [sessionId, setSessionId] = useState(null);
  const [sessions, setSessions] = useState([]);
  const [showSessions, setShowSessions] = useState(false);
  const [renamingSessionId, setRenamingSessionId] = useState(null);
  const [renameDraft, setRenameDraft] = useState('');
  const [confirmDeleteId, setConfirmDeleteId] = useState(null);
  const customTitleIdsRef = useRef(new Set());
  const saveTimer = useRef(null);
  const sessionIdRef = useRef(null);
  const ensureSessionPromiseRef = useRef(null);
  const [editPrompt, setEditPrompt] = useState('');
  const [linkedinPreview, setLinkedinPreview] = useState(null); // { content, images, msgId }
  // Mirror so `sendToAI`'s finally block can read the latest preview
  // without capturing a stale closure. Needed to prevent the
  // "AI didn't produce a response" overwrite from firing on valid
  // tool-call-only responses that land in the preview panel.
  const linkedinPreviewRef = useRef(null);
  useEffect(() => { linkedinPreviewRef.current = linkedinPreview; }, [linkedinPreview]);
  // Mirror the linkedinPreview's text content onto the owning message so
  // a page refresh can rehydrate the preview. Images already live on
  // msg.images (auto-save uploads them), so we only persist the post
  // text + totalSlides here.
  useEffect(() => {
    if (!linkedinPreview?.msgId) return;
    const content = linkedinPreview.content || '';
    if (!content) return;
    setMessages(prev => prev.map(m => {
      if (m.id !== linkedinPreview.msgId) return m;
      const existing = m.linkedinPost || {};
      if (existing.content === content && existing.totalSlides === (linkedinPreview.totalSlides || 0)) {
        return m;
      }
      return {
        ...m,
        linkedinPost: {
          content,
          totalSlides: linkedinPreview.totalSlides || 0,
        },
      };
    }));
  }, [linkedinPreview?.content, linkedinPreview?.totalSlides, linkedinPreview?.msgId]);
  const [liGeneratingImage, setLiGeneratingImage] = useState(false);

  // Keep LinkedIn preview images in sync with the message's images
  // Only sync FROM message TO preview when message actually has images (text post image generation)
  // Skip when preview already has images (carousel — images are managed directly in preview state)
  useEffect(() => {
    if (!linkedinPreview?.msgId) return;
    if (linkedinPreview.totalSlides > 0) return; // Carousel — images managed in preview, not message
    const msg = messages.find(m => m.id === linkedinPreview.msgId);
    if (msg?.images?.length && msg.images.length !== linkedinPreview.images?.length) {
      setLinkedinPreview(prev => prev ? { ...prev, images: msg.images } : null);
    }
  }, [messages, linkedinPreview?.msgId, linkedinPreview?.totalSlides]);

  const [brandDna, setBrandDna] = useState(null);
  const [savedTemplates, setSavedTemplates] = useState([]); // user's carousel design-system templates
  const [selectedTemplateIds, setSelectedTemplateIds] = useState(new Set()); // which templates to inject as context
  const [templatesSidebarOpen, setTemplatesSidebarOpen] = useState(false); // dropdown toggle for sidebar templates card
  const [integrationCtx, setIntegrationCtx] = useState('');
  const [isLinkedInConnected, setIsLinkedInConnected] = useState(false);
  const longPressTimer = useRef(null);
  const messagesEndRef = useRef(null);
  const chatAreaRef = useRef(null);
  const isNearBottomRef = useRef(true);
  const abortRef = useRef(null);

  const photoInputRef = useRef(null);
  const docInputRef = useRef(null);
  const socialZoneRef = useRef(null);
  const contentCtxRef = useRef(null);

  const [contentCtxCategories, setContentCtxCategories] = useState([
    { id: 'newsletters', label: 'Past Newsletters', iconSrc: '/icon-marketing.png', items: [] },
    { id: 'emails', label: 'Past Emails', iconSrc: '/icon-inbox.png', items: [] },
    { id: 'calls', label: 'Calls', iconSrc: '/icon-call-recording.png', items: [] },
    { id: 'content', label: 'Content', iconSrc: '/icon-create-content.png', items: [] },
    { id: 'products', label: 'Products', iconSrc: '/icon-products.png', items: [] },
  ]);

  useEffect(() => {
    let cancelled = false;
    const fmt = (d) => { try { return new Date(d).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }); } catch { return ''; } };
    Promise.all([
      getTemplates('newsletter').catch(() => ({ templates: [] })),
      getEmails({ limit: 20 }).catch(() => ({ emails: [] })),
      getSalesCalls().catch(() => ({ calls: [] })),
      getContentItems().catch(() => ({ items: [] })),
      getProducts().catch(() => ({ products: [] })),
    ]).then(([nlRes, emRes, clRes, ctRes, prRes]) => {
      if (cancelled) return;
      setContentCtxCategories([
        {
          id: 'newsletters', label: 'Past Newsletters', iconSrc: '/icon-marketing.png',
          items: (nlRes.templates || []).map((t) => ({ id: `nl-${t.id}`, name: t.name || t.description || 'Untitled', date: fmt(t.created_at) })),
        },
        {
          id: 'emails', label: 'Past Emails', iconSrc: '/icon-inbox.png',
          items: (emRes.emails || []).map((e) => ({ id: `em-${e.id}`, name: e.subject || '(no subject)', date: fmt(e.date), sub: e.from_name || e.from_email || '' })),
        },
        {
          id: 'calls', label: 'Calls', iconSrc: '/icon-call-recording.png',
          items: (clRes.calls || []).map((c) => ({ id: `cl-${c.id}`, name: c.title || c.name || 'Untitled Call', date: fmt(c.date || c.created_at), sub: c.call_type || c.callType || '' })),
        },
        {
          id: 'content', label: 'Content', iconSrc: '/icon-create-content.png',
          items: (ctRes.items || []).map((c) => ({ id: `ct-${c.id}`, name: c.title || c.name || c.file_name || 'Untitled', date: fmt(c.created_at), sub: c.type || c.platform || '' })),
        },
        {
          id: 'products', label: 'Products', iconSrc: '/icon-products.png',
          items: (prRes.products || []).map((p) => ({ id: `pr-${p.id}`, name: p.name || 'Untitled Product', sub: `${p.type || p.product_type || ''} · $${p.price || 0}` })),
        },
      ]);
    });
    return () => { cancelled = true; };
  }, []);

  const toggleContentCtxItem = (id) => {
    setContentSelectedCtx((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  };

  const getContentSelectedDetails = () => {
    const all = [];
    for (const cat of contentCtxCategories) {
      for (const item of cat.items) {
        if (contentSelectedCtx.has(item.id)) all.push({ ...item, catLabel: cat.label });
      }
    }
    return all;
  };

  const buildContentContextString = () => {
    const items = getContentSelectedDetails();
    if (items.length === 0) return '';
    const parts = items.map((i) => `${i.catLabel}: "${i.name}"${i.sub ? ` (${i.sub})` : ''}${i.date ? `  -  ${i.date}` : ''}`);
    return `[CONTEXT  -  The user has selected the following items for reference:\n${parts.join('\n')}\nPrioritize this context when creating content. Use it to inform your tone, topics, and generated visuals.]\n\n`;
  };

  useEffect(() => {
    if (!contentCtxMenuOpen) return;
    const handleClickOutside = (e) => {
      if (contentCtxRef.current && !contentCtxRef.current.contains(e.target)) {
        setContentCtxMenuOpen(false);
        setContentHoveredCat(null);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [contentCtxMenuOpen]);

  const contentStarters = [
    `Create a carousel post for ${platforms.find(p => p.id === selectedPlatform)?.name || 'Instagram'} about my expertise`,
    'Write a hook-first caption that stops the scroll',
    'Repurpose my last video into multiple posts',
    'Generate a content calendar for this week',
  ];

  const activeIndex = platforms.findIndex((p) => p.id === selectedPlatform);
  const activePlatform = platforms[activeIndex];
  const hasMessages = messages.length > 0;

  let idCounter = useRef(0);
  const nextId = () => ++idCounter.current;

  // Fetch Brand DNA and integration context on mount
  useEffect(() => {
    supabase.auth.getSession().then(async ({ data: { session } }) => {
      if (!session?.user) { console.log('[Content] No session  -  skipping Brand DNA fetch'); return; }
      const { data, error } = await supabase
        .from('brand_dna')
        .select('*')
        .eq('user_id', session.user.id)
        .order('updated_at', { ascending: true })
        .limit(1);
      const brandRow = data?.[0] || null;
      console.log('[Content] Brand DNA loaded:', brandRow ? { logos: brandRow.logos?.length || (brandRow.logo_url ? 1 : 0), photos: brandRow.photo_urls?.length, colors: brandRow.colors, fonts: { main: brandRow.main_font } } : null, error?.message || '');
      if (brandRow) setBrandDna(brandRow);
    });
    getIntegrationContext().then(({ context }) => {
      if (context) setIntegrationCtx(context);
    }).catch(() => {});
    getIntegrations().then(({ integrations }) => {
      const liConnected = (integrations || []).some((i) => i.provider === 'linkedin' && i.is_active);
      setIsLinkedInConnected(liConnected);
    }).catch(() => {});
    // Load saved carousel templates so the sidebar card can show them.
    const loadTpls = () => getCarouselTemplates().then(({ templates }) => {
      if (templates) setSavedTemplates(templates);
    }).catch(() => {});
    loadTpls();
    // Refetch whenever a template is saved elsewhere in the page.
    const onChange = () => loadTpls();
    // Stamp templateSaved=true on the originating message's carouselPlan
    // so the "Save as template" button stays disabled across refreshes.
    const onSaved = (e) => {
      const msgId = e?.detail?.msgId;
      if (!msgId) return;
      setMessages(prev => prev.map(m => {
        if (m.id !== msgId || !m.carouselPlan) return m;
        if (m.carouselPlan.templateSaved) return m;
        return { ...m, carouselPlan: { ...m.carouselPlan, templateSaved: true } };
      }));
    };
    window.addEventListener('carousel-templates-changed', onChange);
    window.addEventListener('carousel-template-saved', onSaved);
    return () => {
      window.removeEventListener('carousel-templates-changed', onChange);
      window.removeEventListener('carousel-template-saved', onSaved);
    };
  }, []);

  const toggleSavedTemplate = useCallback((id) => {
    setSelectedTemplateIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  }, []);

  const removeSavedTemplate = useCallback(async (id) => {
    try {
      await deleteCarouselTemplate(id);
      setSavedTemplates(prev => prev.filter(t => t.id !== id));
      setSelectedTemplateIds(prev => { const n = new Set(prev); n.delete(id); return n; });
    } catch (err) {
      alert(err.message || 'Failed to delete template');
    }
  }, []);

  // The selected templates' design systems — injected into plan_carousel
  // system prompt so Claude anchors the new carousel to them.
  const selectedTemplatesData = useMemo(
    () => savedTemplates.filter(t => selectedTemplateIds.has(t.id)),
    [savedTemplates, selectedTemplateIds]
  );

  // ── Session persistence ──
  // Load sessions list on mount
  useEffect(() => {
    supabase.auth.getSession().then(async ({ data: { session } }) => {
      if (!session?.user) return;
      const { data } = await supabase
        .from('content_sessions')
        .select('id, title, platform, updated_at')
        .eq('user_id', session.user.id)
        .order('updated_at', { ascending: false })
        .limit(50);
      if (data) setSessions(data);
    });
  }, []);

  // Debounced auto-save: persist messages to Supabase whenever they change
  useEffect(() => {
    if (messages.length === 0) return;
    if (saveTimer.current) clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(async () => {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session?.user) return;
      const userId = session.user.id;
      // Upload base64 images to storage and replace with URLs
      const stripped = await Promise.all(messages.map(async (m) => {
        const uploadedImages = await Promise.all((m.images || []).map(async (img) => {
          if (img.src?.startsWith('data:')) {
            try {
              const commaIdx = img.src.indexOf(',');
              const mimeMatch = img.src.match(/^data:([^;]+);/);
              const base64 = img.src.slice(commaIdx + 1);
              const mimeType = mimeMatch?.[1] || 'image/png';
              const result = await uploadImageToStorage(base64, mimeType);
              return { idx: img.idx, src: result.url || result.publicUrl || img.src };
            } catch { return { idx: img.idx, src: img.src }; }
          }
          return { idx: img.idx, src: img.src };
        }));
        // Persist the carousel plan alongside content/images. Without this,
        // the plan (with locked design system + slide specs) is lost on
        // refresh, which means: no actions bar, no pencil-edit design
        // preservation, no regenerate button, no "Load template" context.
        // Strip transient fields (generating/failedSlides) — only the
        // static shape of the plan is useful to persist.
        const persistedPlan = m.carouselPlan
          ? {
              hook: m.carouselPlan.hook,
              angle: m.carouselPlan.angle,
              caption: m.carouselPlan.caption,
              slides: m.carouselPlan.slides,
              designSystem: m.carouselPlan.designSystem,
              approved: m.carouselPlan.approved,
              templateSaved: !!m.carouselPlan.templateSaved,
            }
          : undefined;
        const persisted = { id: m.id, role: m.role, content: m.content, images: uploadedImages };
        if (persistedPlan) persisted.carouselPlan = persistedPlan;
        if (m.platform) persisted.platform = m.platform;
        if (m.linkedinPost && m.linkedinPost.content) {
          persisted.linkedinPost = {
            content: m.linkedinPost.content,
            totalSlides: m.linkedinPost.totalSlides || 0,
          };
        }
        return persisted;
      }));
      // Also update local state with uploaded URLs so future saves don't re-upload
      setMessages((prev) => prev.map((m, i) => stripped[i]?.images?.length ? { ...m, images: stripped[i].images } : m));
      // Derive title from first user message
      const firstUser = messages.find((m) => m.role === 'user');
      const title = firstUser?.content?.replace(/\[CONTEXT[^\]]*\]\n?/g, '').slice(0, 80) || 'New conversation';

      if (sessionId) {
        // Update existing session. If user renamed this session, preserve their custom title.
        const isCustom = customTitleIdsRef.current.has(sessionId);
        const payload = isCustom
          ? { messages: stripped, platform: selectedPlatform, updated_at: new Date().toISOString() }
          : { messages: stripped, title, platform: selectedPlatform, updated_at: new Date().toISOString() };
        await supabase.from('content_sessions').update(payload).eq('id', sessionId);
        setSessions((prev) => prev.map((s) =>
          s.id === sessionId
            ? { ...s, title: isCustom ? s.title : title, updated_at: new Date().toISOString() }
            : s
        ));
      } else {
        // Create new session
        const { data, error } = await supabase.from('content_sessions').insert({
          user_id: userId, title, platform: selectedPlatform, messages: stripped,
        }).select('id').single();
        if (data && !error) {
          setSessionId(data.id);
          setSessions((prev) => [{ id: data.id, title, platform: selectedPlatform, updated_at: new Date().toISOString() }, ...prev]);
        }
      }
    }, 1500);
    return () => { if (saveTimer.current) clearTimeout(saveTimer.current); };
  }, [messages, sessionId, selectedPlatform]);

  // Load a past session
  const loadSession = useCallback(async (id) => {
    const { data, error } = await supabase
      .from('content_sessions')
      .select('id, title, platform, messages')
      .eq('id', id)
      .single();
    if (error || !data) return;
    // Clear sidebar state so the sessionId-scoped fetch below repopulates
    // from scratch — otherwise items from the previous session leak in.
    setPhotos([]);
    setDocuments([]);
    setSocialUrls([]);
    setContentSelectedCtx(new Set());
    ensureSessionPromiseRef.current = null;
    sessionIdRef.current = data.id;
    setSessionId(data.id);
    setSelectedPlatform(data.platform || 'instagram');
    setMessages(data.messages || []);
    setCurrentQuestion(null);
    setShowSessions(false);
    setLinkedinPreview(null);
  }, []);

  // Start a fresh conversation
  const newConversation = useCallback(() => {
    sessionIdRef.current = null;
    ensureSessionPromiseRef.current = null;
    setSessionId(null);
    setMessages([]);
    setPhotos([]);
    setDocuments([]);
    setSocialUrls([]);
    setContentSelectedCtx(new Set());
    setCurrentQuestion(null);
    setShowSessions(false);
    setLinkedinPreview(null);
  }, []);

  // Keep sessionIdRef in sync so non-React callers (upload pipeline) see it
  useEffect(() => { sessionIdRef.current = sessionId; }, [sessionId]);

  // Ensure a content_sessions row exists before uploading sidebar items.
  // Deduplicates concurrent callers via a promise ref so uploads that land
  // simultaneously don't create multiple sessions.
  const ensureSession = useCallback(async () => {
    if (sessionIdRef.current) return sessionIdRef.current;
    if (ensureSessionPromiseRef.current) return ensureSessionPromiseRef.current;
    const p = (async () => {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session?.user) throw new Error('Not authenticated');
      const userId = session.user.id;
      const { data, error } = await supabase.from('content_sessions').insert({
        user_id: userId,
        title: 'New conversation',
        platform: selectedPlatform,
        messages: [],
      }).select('id').single();
      if (error || !data) throw new Error(error?.message || 'Session create failed');
      sessionIdRef.current = data.id;
      setSessionId(data.id);
      setSessions((prev) => [{ id: data.id, title: 'New conversation', platform: selectedPlatform, updated_at: new Date().toISOString() }, ...prev]);
      return data.id;
    })();
    ensureSessionPromiseRef.current = p;
    try {
      return await p;
    } finally {
      if (ensureSessionPromiseRef.current === p) ensureSessionPromiseRef.current = null;
    }
  }, [selectedPlatform]);

  // Delete a session
  const startRenameSession = useCallback((s, e) => {
    e?.stopPropagation?.();
    setRenamingSessionId(s.id);
    setRenameDraft(s.title || '');
  }, []);

  const cancelRenameSession = useCallback(() => {
    setRenamingSessionId(null);
    setRenameDraft('');
  }, []);

  const commitRenameSession = useCallback(async () => {
    const id = renamingSessionId;
    if (!id) return;
    const next = renameDraft.trim() || 'Untitled conversation';
    const current = sessions.find((s) => s.id === id);
    if (current && current.title === next) {
      cancelRenameSession();
      return;
    }
    customTitleIdsRef.current.add(id);
    setSessions((prev) => prev.map((s) => s.id === id ? { ...s, title: next } : s));
    setRenamingSessionId(null);
    setRenameDraft('');
    await supabase.from('content_sessions').update({ title: next }).eq('id', id);
  }, [renamingSessionId, renameDraft, sessions, cancelRenameSession]);

  const requestDeleteSession = useCallback((id, e) => {
    e?.stopPropagation?.();
    setConfirmDeleteId(id);
  }, []);

  const confirmDeleteSession = useCallback(async () => {
    const id = confirmDeleteId;
    if (!id) return;
    setConfirmDeleteId(null);
    await supabase.from('content_sessions').delete().eq('id', id);
    setSessions((prev) => prev.filter((s) => s.id !== id));
    if (sessionId === id) newConversation();
  }, [confirmDeleteId, sessionId, newConversation]);

  // Track whether user is near the bottom of the chat (so streaming updates don't yank them down)
  useEffect(() => {
    const el = chatAreaRef.current;
    if (!el) return;
    const onScroll = () => {
      isNearBottomRef.current = el.scrollHeight - el.scrollTop - el.clientHeight < 150;
    };
    el.addEventListener('scroll', onScroll, { passive: true });
    return () => el.removeEventListener('scroll', onScroll);
  }, []);

  // Auto-scroll on new messages only if user is already near the bottom
  useEffect(() => {
    if (isNearBottomRef.current) {
      messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    }
  }, [messages]);

  // ── Chat logic ──
  const sendToAI = useCallback(async (chatHistory) => {
    setIsGenerating(true);
    const assistantMsgId = `msg-${Date.now()}-ai`;
    setActiveAssistantId(assistantMsgId);
    setMessages((prev) => [...prev, { id: assistantMsgId, role: 'assistant', content: '', images: [], pendingImages: 0 }]);

    try {
      const abort = new AbortController();
      abortRef.current = abort;
      const apiMessages = chatHistory.map((m) => ({ role: m.role, content: m.content }));
      const systemPrompt = buildSystemPrompt(activePlatform, photos, documents, socialUrls, brandDna, integrationCtx, selectedTemplatesData);

      console.group('📋 Content AI  -  Context being sent');
      console.log('Platform:', activePlatform.name);
      console.log('Photos:', photos.length, photos.map(p => ({ status: p.status, name: p.file?.name || p.result?.filename })));
      console.log('Documents:', documents.length, documents.map(d => ({ status: d.status, name: d.file?.name || d.filename, hasText: !!d.result?.extractedText, hasTranscript: !!d.result?.transcript })));
      console.log('Social URLs:', socialUrls.length, socialUrls.map(s => ({ url: s.url, status: s.status, title: s.result?.title, hasTranscript: !!s.result?.transcript })));
      console.log('Brand DNA:', brandDna ? { description: brandDna.description, colors: brandDna.colors, fonts: { main: brandDna.main_font, secondary: brandDna.secondary_font }, hasPhotos: !!brandDna.photo_urls?.length, hasDocs: brandDna.documents ? Object.keys(brandDna.documents) : [] } : null);
      console.log('Integration Context:', integrationCtx ? integrationCtx.slice(0, 200) + '...' : '(none)');
      console.log('Messages:', apiMessages.length);
      console.log('Full System Prompt:\n', systemPrompt);
      console.groupEnd();

      let streamedContent = '';
      let hadImageGeneration = false;
      await streamContentResponse(
        apiMessages,
        systemPrompt,
        // onTextChunk  -  stream text, but hide raw JSON questions
        (text) => {
          streamedContent = text;
          // Strip any JSON question block from display  -  show only the natural text before it
          let displayText = text;
          const jsonStart = text.indexOf('{"type"');
          const jsonStart2 = text.indexOf('{ "type"');
          const fenceStart = text.indexOf('```json');
          const fenceStart2 = text.indexOf('```\n{');
          const cutIdx = [jsonStart, jsonStart2, fenceStart, fenceStart2].filter(i => i !== -1).sort((a, b) => a - b)[0];
          if (cutIdx !== undefined) displayText = text.slice(0, cutIdx).trim();
          // Strip <<READY_A>> / <<READY_B>> / <<READY_CAROUSEL>> markers from LinkedIn chat display
          displayText = displayText.replace(/<<READY_(?:[AB]|CAROUSEL)>>/g, '').trim();
          setMessages((prev) => prev.map((m) => (m.id === assistantMsgId ? { ...m, content: displayText } : m)));
        },
        // onToolCalls  -  now handles two kinds:
        //   kind: 'plan'  → Instagram carousel plan_carousel. Attach the plan
        //                   to the message and WAIT for user approval. The
        //                   approval click fires the per-slide images with
        //                   the locked DESIGN SYSTEM block embedded.
        //   kind: 'image' → regular generate_image calls, run in parallel.
        async (toolCalls) => {
          // Backward compat: older call sites may still pass bare image arrays.
          const normalized = toolCalls.map(c => c.kind ? c : { kind: 'image', ...c });
          const planCalls = normalized.filter(c => c.kind === 'plan');
          const imageCalls = normalized.filter(c => c.kind === 'image');

          if (planCalls.length > 0) {
            // Only take the first plan — Claude should only produce one.
            const plan = planCalls[0].plan;
            console.log(`📋 Carousel plan received: ${plan.slides?.length} slides (${activePlatform.id})`);
            setMessages((prev) => prev.map((m) =>
              m.id === assistantMsgId ? { ...m, carouselPlan: { ...plan, approved: false, generating: false }, platform: activePlatform.id } : m
            ));
            // Do NOT fire generate_image — wait for approval click.
            return;
          }

          if (imageCalls.length === 0) return;
          hadImageGeneration = true;
          console.log(`🖼️ Generating ${imageCalls.length} image(s) in parallel`);
          setMessages((prev) => prev.map((m) =>
            m.id === assistantMsgId ? { ...m, pendingImages: imageCalls.length } : m
          ));

          // Collect previous images from the conversation for regeneration reference
          // Find the most recent assistant message that has images (the previous generation)
          const prevImages = [];
          for (let i = chatHistory.length - 1; i >= 0; i--) {
            const msg = messages.find(m => m.id === chatHistory[i]?.id) || chatHistory[i];
            if (msg?.role === 'assistant' && msg.images?.length) {
              // Extract base64 data from data URLs (strip the data:mime;base64, prefix)
              for (const img of msg.images) {
                if (img.src?.startsWith('data:')) {
                  const commaIdx = img.src.indexOf(',');
                  if (commaIdx !== -1) {
                    const mimeMatch = img.src.match(/^data:([^;]+);/);
                    prevImages.push({
                      data: img.src.slice(commaIdx + 1),
                      mimeType: mimeMatch?.[1] || 'image/jpeg',
                    });
                  }
                }
              }
              break; // Only use the most recent set of images
            }
          }
          if (prevImages.length) {
            console.log(`[Content] Regeneration detected  -  sending ${prevImages.length} previous image(s) as reference`);
          }

          const results = await Promise.allSettled(
            imageCalls.map(async ({ prompt: imgPrompt }, idx) => {
              console.log(`  🎨 [${idx + 1}/${imageCalls.length}] ${imgPrompt.slice(0, 80)}...`);
              // Sidebar reference photos (uploaded by user in content context)
              const uploadedPhotoUrls = photos.filter(p => p.status === 'done' && (p.url || p.result?.url)).map(p => p.url || p.result?.url).filter(Boolean);
              // Only send 1 brand DNA photo (for likeness reference), no logo
              const oneBrandPhoto = brandDna?.photo_urls?.length ? [brandDna.photo_urls[0]] : [];
              const allPhotoUrls = [...uploadedPhotoUrls, ...oneBrandPhoto];
              console.log(`[Content] Image gen  -  sidebar photos: ${uploadedPhotoUrls.length}, brand photo: ${oneBrandPhoto.length}, total: ${allPhotoUrls.length}`);
              const brandImageData = {
                photoUrls: allPhotoUrls,
                logoUrl: null, // never send logo for content image generation
                colors: brandDna?.colors || {},
                mainFont: brandDna?.main_font || null,
              };
              // Pass the matching previous image for this slide index (if regenerating)
              const refImages = prevImages.length ? [prevImages[idx] || prevImages[0]] : null;
              const result = await generateImage(imgPrompt, selectedPlatform, brandImageData, refImages);
              // Update message as each image completes
              if (result.image) {
                const src = `data:${result.image.mimeType};base64,${result.image.data}`;
                setMessages((prev) => prev.map((m) =>
                  m.id === assistantMsgId ? {
                    ...m,
                    images: [...m.images, { src, idx }],
                    pendingImages: m.pendingImages - 1,
                  } : m
                ));
              }
              return result;
            })
          );

          // Mark any remaining pending as done
          setMessages((prev) => prev.map((m) =>
            m.id === assistantMsgId ? { ...m, pendingImages: 0 } : m
          ));

          const failed = results.filter(r => r.status === 'rejected');
          if (failed.length > 0) {
            console.warn(`⚠️ ${failed.length} image(s) failed`);
          }
        },
        abort.signal,
        { searchMode: true, onSearchStatus: setSearchStatus },
      );
      // Check if the response contains a JSON question (may be preceded by text)
      const finalContent = streamedContent || '';
      let questionParsed = null;
      try {
        // Strip markdown code fences before parsing
        let jsonSource = finalContent;
        const fenceMatch = finalContent.match(/```(?:json)?\s*([\s\S]*?)```/);
        if (fenceMatch) jsonSource = fenceMatch[1].trim();
        // Extract JSON object from anywhere in the response
        const jsonMatch = jsonSource.match(/\{[\s\S]*"type"\s*:\s*"question"[\s\S]*\}/);
        if (jsonMatch) {
          const parsed = JSON.parse(jsonMatch[0]);
          if (parsed.type === 'question' && parsed.text && Array.isArray(parsed.options)) {
            questionParsed = parsed;
          }
        }
      } catch {}
      // Also try legacy <<OPTIONS>> format
      if (!questionParsed) {
        const { text, options } = parseMessageOptions(finalContent);
        if (options) questionParsed = { text, options };
      }
      // Fallback: detect plain-text questions with numbered/bullet options or bare questions
      if (!questionParsed) {
        questionParsed = parsePlainTextQuestion(finalContent, hadImageGeneration);
      }
      if (questionParsed) {
        setCurrentQuestion(questionParsed);
        // Auto-expand custom input when no predefined options (bare question)
        setCustomTyping(!questionParsed.options || questionParsed.options.length === 0);
        setCustomText('');
        // Show the question text as the message, not the raw JSON
        setMessages((prev) => prev.map((m) =>
          m.id === assistantMsgId ? { ...m, content: questionParsed.text } : m
        ));
      }
      // Detect <<READY_A>>, <<READY_B>>, or <<READY_CAROUSEL>> — trigger separate generation call
      const isLinkedinReady = selectedPlatform === 'linkedin' && !questionParsed && streamedContent;
      const readyA = isLinkedinReady && streamedContent.includes('<<READY_A>>');
      const readyB = isLinkedinReady && streamedContent.includes('<<READY_B>>');
      const readyCarousel = isLinkedinReady && streamedContent.includes('<<READY_CAROUSEL>>');

      if (readyA || readyB) {
        // TEXT POST — clean up chat, launch post generation
        const chatMsg = streamedContent.replace(/<<READY_(?:[AB]|CAROUSEL)>>/g, '').trim();
        setMessages((prev) => prev.map((m) =>
          m.id === assistantMsgId ? { ...m, content: chatMsg } : m
        ));
        const variationPrompt = readyA ? LINKEDIN_TEXT_VARIATION_A : LINKEDIN_TEXT_VARIATION_B;
        const variationName = readyA ? 'Variation A (Framework-Heavy)' : 'Variation B (Story-Flow)';
        const postMsgs = [...chatHistory.map(m => ({ role: m.role, content: m.content })), { role: 'assistant', content: chatMsg }];

        // Build reference context for Call 2 (social links, docs, transcripts)
        let refContext = '';
        const doneSocial = socialUrls.filter(s => s.status === 'done' && s.result);
        if (doneSocial.length > 0) {
          refContext += `=== REFERENCE CONTENT (HIGHEST PRIORITY) ===\n`;
          refContext += `The user attached this content as a STRUCTURAL BLUEPRINT. Your post MUST mirror its exact structure: same hook style, same flow, same engagement mechanics, same CTA approach. Only change the topic.\n\n`;
          doneSocial.forEach(item => {
            const r = item.result;
            refContext += `--- ${r.platform || 'Post'}: ${r.title || item.url} ---\n`;
            if (r.uploader) refContext += `Creator: ${r.uploader}\n`;
            if (r.description) refContext += `Caption: ${r.description.slice(0, 2000)}\n`;
            if (r.transcript) refContext += `Transcript:\n${r.transcript.slice(0, 4000)}\n`;
            refContext += '\n';
          });
        }
        const doneDocs = documents.filter(d => d.status === 'done' && d.result?.extractedText);
        if (doneDocs.length > 0) {
          refContext += `=== REFERENCE DOCUMENTS ===\n`;
          doneDocs.forEach((doc, i) => {
            refContext += `--- ${doc.result?.filename || `Doc ${i+1}`} ---\n${doc.result.extractedText.slice(0, 3000)}\n\n`;
          });
        }

        let postSystemPrompt = `You are a LinkedIn post writer using ${variationName}. Based on the conversation, generate the final LinkedIn post NOW.\n\nRULES:\n- Output ONLY the post text, ready to copy-paste into LinkedIn\n- No preamble, no commentary, no "here is your post", no character counts\n- Just the raw post content with proper line breaks\n- Follow the EXACT post structure from the writing guidelines below\n- ABSOLUTELY NEVER use em dashes (the long dash character "\u2014"). Use commas, periods, colons, or start a new sentence instead. This is non-negotiable. Zero em dashes.\n- NEVER use [Your Name] or [Name] placeholders. Use the user's ACTUAL name provided below.\n\n`;
        if (user?.name) postSystemPrompt += `USER'S NAME: ${user.name}\nAlways sign off with this exact name, never use [Your Name] or placeholders.\n\n`;
        if (brandDna?.description) postSystemPrompt += `BRAND DESCRIPTION: ${brandDna.description}\n\n`;
        if (refContext) postSystemPrompt += refContext;
        postSystemPrompt += `=== WRITING GUIDELINES ${refContext ? '(use as fallback if no reference content above)' : '(FOLLOW THIS STRUCTURE EXACTLY)'} ===\n${variationPrompt}\n\n`;
        postSystemPrompt += `=== FINAL OVERRIDE (READ THIS LAST) ===\nIGNORE the "INPUT FORMAT", "OUTPUT FORMAT", and "QUALITY CHECKLIST" sections in the guidelines above. Those are structural references, NOT instructions for you to output.\nYou already have all inputs from the conversation history. Do NOT output "Topic:", "Content Intent:", "Brain Dump:", "Client Voice DNA:", or any template fields.\n${refContext ? 'IMPORTANT: The reference content above is your PRIMARY template. Mirror its structure exactly. The writing guidelines are secondary.\n' : ''}Output ONLY the raw LinkedIn post text. Nothing before it, nothing after it. Just the post itself, ready to paste into LinkedIn.`;
        // Only ONE preview tenant in the right pane at a time.
        setCarouselSideView(null);
        setLinkedinPreview({ content: '', images: [], msgId: assistantMsgId });
        try {
          await streamContentResponse(
            postMsgs,
            postSystemPrompt,
            (postText) => {
              setLinkedinPreview(prev => prev ? { ...prev, content: postText.trim() } : { content: postText.trim(), images: [], msgId: assistantMsgId });
            },
            async () => {},
            abort.signal,
            { searchMode: false, onSearchStatus: null },
          );
        } catch (postErr) {
          if (postErr.name !== 'AbortError') console.error('LinkedIn post generation failed:', postErr);
        }
      } else if (readyCarousel) {
        // CAROUSEL — clean up chat, launch carousel generation with image tool
        const chatMsg = streamedContent.replace(/<<READY_(?:[AB]|CAROUSEL)>>/g, '').trim();
        setMessages((prev) => prev.map((m) =>
          m.id === assistantMsgId ? { ...m, content: chatMsg } : m
        ));
        const carouselMsgs = [...chatHistory.map(m => ({ role: m.role, content: m.content })), { role: 'assistant', content: chatMsg }];

        // Build reference context for carousel Call 2
        let carouselRefContext = '';
        const doneSocialC = socialUrls.filter(s => s.status === 'done' && s.result);
        if (doneSocialC.length > 0) {
          carouselRefContext += `=== REFERENCE CONTENT (HIGHEST PRIORITY) ===\n`;
          carouselRefContext += `The user attached this content as a STRUCTURAL BLUEPRINT. Your carousel MUST mirror its structure: same hook style, same slide flow, same engagement mechanics, same CTA. Only change the topic.\n\n`;
          doneSocialC.forEach(item => {
            const r = item.result;
            carouselRefContext += `--- ${r.platform || 'Post'}: ${r.title || item.url} ---\n`;
            if (r.uploader) carouselRefContext += `Creator: ${r.uploader}\n`;
            if (r.description) carouselRefContext += `Caption: ${r.description.slice(0, 2000)}\n`;
            if (r.transcript) carouselRefContext += `Transcript:\n${r.transcript.slice(0, 4000)}\n`;
            carouselRefContext += '\n';
          });
        }
        const docsC = documents.filter(d => d.status === 'done' && d.result?.extractedText);
        if (docsC.length > 0) {
          carouselRefContext += `=== REFERENCE DOCUMENTS ===\n`;
          docsC.forEach((doc, i) => {
            carouselRefContext += `--- ${doc.result?.filename || `Doc ${i+1}`} ---\n${doc.result.extractedText.slice(0, 3000)}\n\n`;
          });
        }

        let carouselSystemPrompt = `You are a LinkedIn carousel image generator. Based on the conversation, create the carousel slides NOW.\n\n`;
        carouselSystemPrompt += `=== ABSOLUTE RULES ===\n`;
        carouselSystemPrompt += `1. Your text output should be ONLY the LinkedIn caption (the short text that appears above the carousel when posted). Write it like a normal LinkedIn caption, 2-4 sentences max. No slide descriptions.\n`;
        carouselSystemPrompt += `2. Do NOT write "Slide 1:", "Slide 2:", "Cover Slide:", or ANY slide descriptions/headings in your text output. The slides are IMAGES, not text.\n`;
        carouselSystemPrompt += `3. Do NOT use hashtags. Zero hashtags.\n`;
        carouselSystemPrompt += `4. NEVER use em dashes. Zero tolerance.\n`;
        carouselSystemPrompt += `5. NEVER say "game-changer", "unlock", "dive in", or any AI slop phrases.\n`;
        carouselSystemPrompt += `6. Call generate_image for EACH slide separately. This is how slides are created.\n`;
        carouselSystemPrompt += `7. Each generate_image prompt must include the ACTUAL TEXT to render on the slide image.\n\n`;
        if (user?.name) carouselSystemPrompt += `USER'S NAME: ${user.name}\n\n`;
        if (brandDna?.description) carouselSystemPrompt += `BRAND DESCRIPTION: ${brandDna.description}\n\n`;
        if (carouselRefContext) carouselSystemPrompt += carouselRefContext;
        if (brandDna?.colors) {
          const c = brandDna.colors;
          carouselSystemPrompt += `BRAND COLORS: Primary: ${c.primary || 'N/A'}, Secondary: ${c.secondary || 'N/A'}, Text: ${c.text || 'N/A'}\n`;
        }
        if (brandDna?.main_font) carouselSystemPrompt += `BRAND FONT: ${brandDna.main_font}\n`;
        carouselSystemPrompt += `\n=== CAROUSEL CONTENT GUIDELINES ===\n${LINKEDIN_CAROUSEL_PROMPT}\n\n`;
        carouselSystemPrompt += `=== IMAGE GENERATION SPECS ===\n`;
        carouselSystemPrompt += `- 4:3 LANDSCAPE ratio for every slide (LinkedIn standard)\n`;
        carouselSystemPrompt += `- Include ACTUAL TEXT to render on the image (title, body text, key points)\n`;
        carouselSystemPrompt += `- Specify: "bold sans-serif text, clean modern design"\n`;
        carouselSystemPrompt += `- Use brand colors consistently across all slides\n`;
        carouselSystemPrompt += `- Same background color, same font style on every content slide\n`;
        carouselSystemPrompt += `- Cover: bold hook text, eye-catching, vibrant\n`;
        carouselSystemPrompt += `- Content slides: numbered title + 2-3 sentences body text, left-aligned\n`;
        carouselSystemPrompt += `- CTA: clear action text, profile reference\n\n`;
        carouselSystemPrompt += `=== FINAL OVERRIDE ===\nIGNORE "INPUT FORMAT" and "OUTPUT FORMAT" sections from the guidelines. You have all inputs from conversation.\nYour text = caption only. Your generate_image calls = the slides. Keep them separate.`;

        // Use a ref to accumulate images safely across concurrent promises
        const carouselImagesRef = [];
        setCarouselSideView(null);
        setLinkedinPreview({ content: '', images: [], totalSlides: 0, msgId: assistantMsgId });
        try {
          await streamContentResponse(
            carouselMsgs,
            carouselSystemPrompt,
            (postText) => {
              // Strip any slide descriptions that leak into text
              let caption = postText.trim();
              caption = caption.replace(/\*\*Slide \d+[^*]*\*\*/g, '').replace(/Slide \d+:.*/g, '').trim();
              setLinkedinPreview(prev => prev ? { ...prev, content: caption } : { content: caption, images: [], totalSlides: 0, msgId: assistantMsgId });
            },
            // onToolCalls — generate images for each carousel slide
            async (toolCalls) => {
              // Streamer now returns typed tool calls; LinkedIn flow only uses images.
              const imageCalls = toolCalls.map(c => c.kind ? c : { kind: 'image', ...c }).filter(c => c.kind === 'image');
              if (imageCalls.length === 0) return;
              // Set total slide count so the UI knows how many slots to show
              setLinkedinPreview(prev => prev ? { ...prev, totalSlides: (prev.totalSlides || 0) + imageCalls.length } : prev);
              const uploadedPhotoUrls = photos.filter(p => p.status === 'done' && (p.url || p.result?.url)).map(p => p.url || p.result?.url).filter(Boolean);
              const oneBrandPhoto = brandDna?.photo_urls?.length ? [brandDna.photo_urls[0]] : [];
              const allPhotoUrls = [...uploadedPhotoUrls, ...oneBrandPhoto];
              const brandImageData = {
                photoUrls: allPhotoUrls,
                logoUrl: null,
                colors: brandDna?.colors || {},
                mainFont: brandDna?.main_font || null,
              };
              const results = await Promise.allSettled(
                imageCalls.map(async ({ prompt: imgPrompt }, idx) => {
                  const result = await generateImage(imgPrompt, 'linkedin', brandImageData, null);
                  if (result.image) {
                    const src = `data:${result.image.mimeType};base64,${result.image.data}`;
                    // Accumulate in array ref to avoid race condition, then set state from it
                    carouselImagesRef.push({ src, idx });
                    setLinkedinPreview(prev => prev ? {
                      ...prev,
                      images: [...carouselImagesRef],
                    } : prev);
                  }
                  return result;
                })
              );
              const failed = results.filter(r => r.status === 'rejected');
              if (failed.length > 0) console.warn(`${failed.length} carousel slide(s) failed`);
            },
            abort.signal,
            { searchMode: false, onSearchStatus: null },
          );
        } catch (postErr) {
          if (postErr.name !== 'AbortError') console.error('LinkedIn carousel generation failed:', postErr);
        }
      }
    } catch (err) {
      if (err.name !== 'AbortError') {
        if (err.code === 'STREAM_TIMEOUT' || err.message === 'STREAM_TIMEOUT') {
          setMessages((prev) => prev.map((m) =>
            m.id === assistantMsgId
              ? { ...m, content: "The AI didn't respond within 60 seconds. This usually means the model is overloaded — please try again in a moment." }
              : m
          ));
        } else if (err.message?.includes('402') || err.message?.toLowerCase().includes('credits') || err.message?.toLowerCase().includes('insufficient')) {
          setCreditsDepleted(true);
          setMessages(prev => prev.filter(m => m.id !== assistantMsgId));
        } else {
          setMessages((prev) => prev.map((m) =>
            m.id === assistantMsgId ? { ...m, content: 'Something went wrong. Please try again.' } : m
          ));
        }
      }
    } finally {
      abortRef.current = null;
      setIsGenerating(false);
      setActiveAssistantId(null);
      // Safety net: if we got here without populating the assistant message
      // AND no images/plan/preview landed for this message, surface an
      // explicit message so the user isn't left staring at an empty bubble.
      // Covers cases like the stream closing cleanly with zero text,
      // tool-call-only responses that failed, and silent early termination.
      //
      // IMPORTANT: tool-call-only valid responses also reach this finally
      // with empty `content`. Recognize those and DON'T clobber them:
      //   - carouselPlan present → Instagram plan-first flow succeeded, the
      //     plan card IS the response.
      //   - linkedinPreview holds this msg's content/images/slides → the
      //     LinkedIn text-post / carousel preview panel IS the response.
      setMessages((prev) => prev.map((m) => {
        if (m.id !== assistantMsgId) return m;
        if (m.content) return m;
        if ((m.pendingImages || 0) > 0) return m;
        if ((m.images || []).length > 0) return m;
        if (m.carouselPlan) return m;
        const lp = linkedinPreviewRef.current;
        if (lp && lp.msgId === assistantMsgId && (lp.content || (lp.images?.length > 0) || (lp.totalSlides > 0))) return m;
        return { ...m, content: "The AI didn't produce a response. Please try again." };
      }));
    }
  }, [activePlatform, photos, documents, socialUrls, brandDna, integrationCtx]);

  const stopGenerating = useCallback(() => {
    if (abortRef.current) { abortRef.current.abort(); abortRef.current = null; setIsGenerating(false); setActiveAssistantId(null); }
  }, []);

  // Render a single carousel slide via NanoBanana with automatic retries.
  // Transient failures (Gemini overload, network blips, 500s, empty-image
  // responses) drop otherwise-good carousels to 5-of-7 territory — not
  // acceptable UX. Retry up to 3× per slide with escalating backoff before
  // giving up. Returns the result on success, or throws the last error.
  const generateSlideWithRetry = useCallback(async (slideIndex, slidePrompt, brandImageData, refImages, { maxAttempts = 3, platform = 'instagram' } = {}) => {
    // Backend routes LinkedIn carousels to a separate config (3:4 portrait)
    // without disturbing single LinkedIn text-post images (4:3 landscape).
    const backendPlatform = platform === 'linkedin' ? 'linkedin_carousel' : platform;
    let lastErr;
    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
      try {
        const result = await generateImage(slidePrompt, backendPlatform, brandImageData, refImages);
        // Tight validity check — Gemini can return a 200 with an empty string,
        // a placeholder, or missing mimeType when its safety filter fires.
        // Treat anything short of "usable base64 + mimetype" as a failure so
        // the retry loop runs instead of silently counting it as done.
        const d = result?.image?.data;
        const m = result?.image?.mimeType;
        if (d && m && typeof d === 'string' && d.length > 200) return result;
        throw new Error(`empty/invalid image response (dataLen=${d?.length || 0}, mime=${m || 'none'})`);
      } catch (err) {
        lastErr = err;
        console.warn(`[carousel] slide ${slideIndex + 1} attempt ${attempt}/${maxAttempts} failed: ${err.message || err}`);
        if (attempt < maxAttempts) {
          await new Promise(r => setTimeout(r, 1500 * attempt));
        }
      }
    }
    throw lastErr || new Error('generation failed');
  }, []);

  // Regenerate one carousel slide with the same locked spec (no edit text).
  // Useful when the content is right but NanoBanana's render has a bad
  // layout — re-roll without having to type a fake edit instruction.
  const handleCarouselSlideRegenerate = useCallback(async (msgId, slideIdx) => {
    if (isGenerating) return;
    const msg = messages.find(m => m.id === msgId);
    const plan = msg?.carouselPlan;
    const slide = plan?.slides?.[slideIdx];
    if (!slide) return;
    const platformId = msg.platform || 'instagram';

    setIsGenerating(true);
    setMessages(prev => prev.map(m => m.id === msgId ? { ...m, editingIdx: slideIdx } : m));

    try {
      const brandForPrompt = { name: brandDna?.brand_name || brandDna?.description?.split(/[.,]/)[0]?.trim() || '' };
      const uploadedPhotoUrls = photos.filter(p => p.status === 'done' && (p.url || p.result?.url)).map(p => p.url || p.result?.url).filter(Boolean);
      const oneBrandPhoto = brandDna?.photo_urls?.length ? [brandDna.photo_urls[0]] : [];
      const brandImageData = {
        photoUrls: [...uploadedPhotoUrls, ...oneBrandPhoto],
        logoUrl: null,
        colors: brandDna?.colors || {},
        mainFont: brandDna?.main_font || null,
      };

      const slidePrompt = buildCarouselSlidePrompt({
        designSystem: plan.designSystem,
        slide,
        index: slideIdx,
        total: plan.slides.length,
        brand: brandForPrompt,
        platform: platformId,
      });

      // Reference the hook image for palette anchoring (not the slide itself
      // — we want a fresh take, not an edit of the current render).
      const hookImg = (msg.images || []).find(i => i.idx === 0);
      let refs = null;
      if (hookImg?.src) {
        if (hookImg.src.startsWith('data:')) {
          const c = hookImg.src.indexOf(',');
          const mm = hookImg.src.match(/^data:([^;]+);/);
          if (c !== -1) refs = [{ data: hookImg.src.slice(c + 1), mimeType: mm?.[1] || 'image/jpeg' }];
        } else {
          // Remote URL — fetch to base64 for the image model.
          try {
            const r = await fetch(hookImg.src, { mode: 'cors' });
            const b = await r.blob();
            const buf = await b.arrayBuffer();
            const base64 = btoa(String.fromCharCode(...new Uint8Array(buf)));
            refs = [{ data: base64, mimeType: b.type || 'image/jpeg' }];
          } catch {}
        }
      }

      const result = await generateSlideWithRetry(slideIdx, slidePrompt, brandImageData, refs, { maxAttempts: 3, platform: platformId });
      const newSrc = `data:${result.image.mimeType};base64,${result.image.data}`;
      setMessages(prev => prev.map(m => {
        if (m.id !== msgId) return m;
        const newImages = [...(m.images || [])];
        const target = newImages.findIndex(img => img.idx === slideIdx);
        if (target !== -1) newImages[target] = { ...newImages[target], src: newSrc };
        else newImages.push({ src: newSrc, idx: slideIdx });
        const failedLeft = (m.carouselPlan?.failedSlides || []).filter(x => x !== slideIdx);
        return {
          ...m,
          images: newImages,
          editingIdx: undefined,
          carouselPlan: { ...m.carouselPlan, failedSlides: failedLeft },
        };
      }));
    } catch (err) {
      console.error('Slide regenerate failed:', err);
      setMessages(prev => prev.map(m => m.id === msgId ? { ...m, editingIdx: undefined } : m));
    } finally {
      setIsGenerating(false);
    }
  }, [messages, isGenerating, photos, brandDna, generateSlideWithRetry]);

  // Update a carousel plan in place — used while the user edits slides,
  // caption, hook, etc. on the plan card BEFORE they click Approve. Blocked
  // once approved so already-generated slides aren't invalidated.
  const handleUpdateCarouselPlan = useCallback((msgId, nextPlan) => {
    setMessages(prev => prev.map(m => {
      if (m.id !== msgId) return m;
      if (m.carouselPlan?.approved) return m;
      return { ...m, carouselPlan: { ...m.carouselPlan, ...nextPlan } };
    }));
  }, []);

  // Approve an Instagram carousel plan and render the slides.
  // Fires slide 1 first → once it lands, passes its bytes as a reference image
  // for slides 2..N so NanoBanana visually anchors to the hook's palette and
  // typography beyond what the text prompt alone encodes.
  const handleCarouselApprove = useCallback(async (msgId) => {
    const msg = messages.find(m => m.id === msgId);
    if (!msg?.carouselPlan || msg.carouselPlan.approved) return;
    const plan = msg.carouselPlan;
    const slides = plan.slides || [];
    if (!slides.length) return;
    const platformId = msg.platform || 'instagram';

    // Mark approved + kick off loading state so skeletons render.
    setMessages(prev => prev.map(m =>
      m.id === msgId ? { ...m, carouselPlan: { ...m.carouselPlan, approved: true, generating: true, failedSlides: [] }, pendingImages: slides.length, images: m.images || [] } : m
    ));
    setIsGenerating(true);
    setActiveAssistantId(msgId);

    const uploadedPhotoUrls = photos.filter(p => p.status === 'done' && (p.url || p.result?.url)).map(p => p.url || p.result?.url).filter(Boolean);
    const oneBrandPhoto = brandDna?.photo_urls?.length ? [brandDna.photo_urls[0]] : [];
    const allPhotoUrls = [...uploadedPhotoUrls, ...oneBrandPhoto];
    const brandImageData = {
      photoUrls: allPhotoUrls,
      logoUrl: null,
      colors: brandDna?.colors || {},
      mainFont: brandDna?.main_font || null,
    };
    const brandForPrompt = { name: brandDna?.brand_name || brandDna?.description?.split(/[.,]/)[0]?.trim() || '' };

    const appendImage = (src, idx) => {
      setMessages(prev => prev.map(m =>
        m.id === msgId ? {
          ...m,
          images: [...(m.images || []), { src, idx }],
          pendingImages: Math.max(0, (m.pendingImages || 0) - 1),
        } : m
      ));
    };

    const markSlideFailed = (idx) => {
      setMessages(prev => prev.map(m =>
        m.id === msgId ? {
          ...m,
          pendingImages: Math.max(0, (m.pendingImages || 0) - 1),
          carouselPlan: {
            ...m.carouselPlan,
            failedSlides: [...(m.carouselPlan?.failedSlides || []).filter(x => x !== idx), idx].sort((a, b) => a - b),
          },
        } : m
      ));
    };

    try {
      // Phase 3a: render slide 1 alone so its bytes can anchor the rest.
      const slide1Prompt = buildCarouselSlidePrompt({
        designSystem: plan.designSystem,
        slide: slides[0],
        index: 0,
        total: slides.length,
        brand: brandForPrompt,
        platform: platformId,
      });
      let hookRef = null;
      try {
        const slide1 = await generateSlideWithRetry(0, slide1Prompt, brandImageData, null, { platform: platformId });
        const src = `data:${slide1.image.mimeType};base64,${slide1.image.data}`;
        appendImage(src, 0);
        hookRef = { data: slide1.image.data, mimeType: slide1.image.mimeType };
      } catch (slide1Err) {
        console.error('[carousel] slide 1 failed after retries:', slide1Err);
        markSlideFailed(0);
        // Keep going — slides 2..N can still render without a hook reference.
      }

      // Phase 3b: render slides 2..N in parallel, each referencing slide 1
      // so NanoBanana visually locks onto the hook's palette/typography.
      const rest = slides.slice(1).map(async (slide, i) => {
        const idx = i + 1;
        const slidePrompt = buildCarouselSlidePrompt({
          designSystem: plan.designSystem,
          slide,
          index: idx,
          total: slides.length,
          brand: brandForPrompt,
          platform: platformId,
        });
        try {
          const result = await generateSlideWithRetry(idx, slidePrompt, brandImageData, hookRef ? [hookRef] : null, { platform: platformId });
          const src = `data:${result.image.mimeType};base64,${result.image.data}`;
          appendImage(src, idx);
        } catch (slideErr) {
          console.error(`[carousel] slide ${idx + 1} failed after retries:`, slideErr);
          markSlideFailed(idx);
        }
      });
      await Promise.allSettled(rest);

      // Consistency sweep: guarantee every slide index 0..N-1 is either in
      // images OR in failedSlides. If a slide silently vanished (state race,
      // promise dropped, etc.) it ends up in neither — sweep it into
      // failedSlides so the user sees the retry button instead of a missing
      // slide with no explanation.
      setMessages(prev => prev.map(m => {
        if (m.id !== msgId) return m;
        const presentIdx = new Set((m.images || []).map(img => img.idx));
        const failedSet = new Set(m.carouselPlan?.failedSlides || []);
        const recovered = [];
        for (let i = 0; i < slides.length; i++) {
          if (!presentIdx.has(i) && !failedSet.has(i)) recovered.push(i);
        }
        const mergedFailed = [...(m.carouselPlan?.failedSlides || []), ...recovered].sort((a, b) => a - b);
        if (recovered.length) console.warn(`[carousel] consistency sweep recovered missing slides: ${recovered.map(i => i + 1).join(', ')}`);
        return {
          ...m,
          pendingImages: 0,
          carouselPlan: {
            ...m.carouselPlan,
            generating: false,
            failedSlides: mergedFailed,
          },
          // If Claude included a caption in the plan, surface it as the message body.
          content: m.content || plan.caption || '',
        };
      }));
    } catch (err) {
      console.error('Carousel generation failed:', err);
      setMessages(prev => prev.map(m =>
        m.id === msgId ? { ...m, pendingImages: 0, carouselPlan: { ...m.carouselPlan, generating: false, error: err.message || 'Generation failed' } } : m
      ));
    } finally {
      setIsGenerating(false);
      setActiveAssistantId(null);
    }
  }, [messages, photos, brandDna, generateSlideWithRetry]);

  // Manual retry for slides that exhausted automatic retries. User clicks
  // "Retry failed slide(s)" on the plan card and we re-fire only the
  // failed indices, keeping successful slides untouched.
  const handleRetryFailedSlides = useCallback(async (msgId) => {
    const msg = messages.find(m => m.id === msgId);
    if (!msg?.carouselPlan) return;
    const plan = msg.carouselPlan;
    const failed = plan.failedSlides || [];
    if (!failed.length) return;
    const platformId = msg.platform || 'instagram';

    const slides = plan.slides || [];
    const uploadedPhotoUrls = photos.filter(p => p.status === 'done' && (p.url || p.result?.url)).map(p => p.url || p.result?.url).filter(Boolean);
    const oneBrandPhoto = brandDna?.photo_urls?.length ? [brandDna.photo_urls[0]] : [];
    const allPhotoUrls = [...uploadedPhotoUrls, ...oneBrandPhoto];
    const brandImageData = {
      photoUrls: allPhotoUrls,
      logoUrl: null,
      colors: brandDna?.colors || {},
      mainFont: brandDna?.main_font || null,
    };
    const brandForPrompt = { name: brandDna?.brand_name || brandDna?.description?.split(/[.,]/)[0]?.trim() || '' };

    // Use an existing successful slide (prefer slide 1) as the palette
    // reference if available. If slide 1 itself failed, any successful
    // slide works as an anchor.
    const existingImage = (msg.images || []).find(img => img.idx === 0) || (msg.images || [])[0];
    let hookRef = null;
    if (existingImage?.src?.startsWith('data:')) {
      const commaIdx = existingImage.src.indexOf(',');
      if (commaIdx !== -1) {
        const mimeMatch = existingImage.src.match(/^data:([^;]+);/);
        hookRef = {
          data: existingImage.src.slice(commaIdx + 1),
          mimeType: mimeMatch?.[1] || 'image/jpeg',
        };
      }
    }

    setIsGenerating(true);
    setActiveAssistantId(msgId);
    setMessages(prev => prev.map(m =>
      m.id === msgId ? {
        ...m,
        carouselPlan: { ...m.carouselPlan, generating: true },
        pendingImages: (m.pendingImages || 0) + failed.length,
      } : m
    ));

    const retryPromises = failed.map(async (idx) => {
      const slide = slides[idx];
      if (!slide) return;
      const slidePrompt = buildCarouselSlidePrompt({
        designSystem: plan.designSystem,
        slide,
        index: idx,
        total: slides.length,
        brand: brandForPrompt,
        platform: platformId,
      });
      try {
        const result = await generateSlideWithRetry(idx, slidePrompt, brandImageData, hookRef ? [hookRef] : null, { platform: platformId });
        const src = `data:${result.image.mimeType};base64,${result.image.data}`;
        setMessages(prev => prev.map(m => {
          if (m.id !== msgId) return m;
          // Replace any existing entry for this idx (defensive) and
          // remove this idx from the failed list.
          const images = (m.images || []).filter(img => img.idx !== idx).concat({ src, idx });
          const failedLeft = (m.carouselPlan?.failedSlides || []).filter(x => x !== idx);
          return {
            ...m,
            images,
            pendingImages: Math.max(0, (m.pendingImages || 0) - 1),
            carouselPlan: { ...m.carouselPlan, failedSlides: failedLeft },
          };
        }));
      } catch (err) {
        console.error(`[carousel] retry for slide ${idx + 1} failed:`, err);
        // Keep it in failedSlides, drop pending.
        setMessages(prev => prev.map(m =>
          m.id === msgId ? { ...m, pendingImages: Math.max(0, (m.pendingImages || 0) - 1) } : m
        ));
      }
    });

    await Promise.allSettled(retryPromises);

    setMessages(prev => prev.map(m =>
      m.id === msgId ? {
        ...m,
        pendingImages: 0,
        carouselPlan: { ...m.carouselPlan, generating: false },
      } : m
    ));
    setIsGenerating(false);
    setActiveAssistantId(null);
  }, [messages, photos, brandDna, generateSlideWithRetry]);

  // Block sending while any attachment is still uploading/extracting  -  otherwise the
  // AI receives a prompt without the context the user just attached.
  const pendingAttachments = useMemo(() => {
    const photoPending = photos.filter(p => p.status === 'pending' || p.status === 'uploading').length;
    const docPending = documents.filter(d => d.status === 'pending' || d.status === 'uploading').length;
    const socialPending = socialUrls.filter(s => s.status === 'pending' || s.status === 'extracting').length;
    return { photos: photoPending, documents: docPending, socialUrls: socialPending, total: photoPending + docPending + socialPending };
  }, [photos, documents, socialUrls]);
  const hasPendingAttachments = pendingAttachments.total > 0;

  const selectOption = useCallback((option) => {
    if (isGenerating || hasPendingAttachments) return;
    setCurrentQuestion(null);
    setCustomTyping(false);
    setCustomText('');
    const contextStr = buildContentContextString();
    const userMsg = { id: `msg-${Date.now()}-user`, role: 'user', content: contextStr + option };
    const updated = [...messages, userMsg];
    setMessages(updated);
    sendToAI(updated);
  }, [isGenerating, hasPendingAttachments, messages, sendToAI, contentSelectedCtx, contentCtxCategories]);

  const sendMessage = useCallback(() => {
    const text = input.trim();
    if (!text || isGenerating || hasPendingAttachments) return;
    const contextStr = buildContentContextString();
    const userMsg = { id: `msg-${Date.now()}-user`, role: 'user', content: contextStr + text };
    const updated = [...messages, userMsg];
    setMessages(updated);
    setInput('');
    sendToAI(updated);
  }, [input, isGenerating, hasPendingAttachments, messages, sendToAI, contentSelectedCtx, contentCtxCategories]);

  // Direct image edit  -  sends ONLY the image to Gemini, no brand data, no context
  const handleImageEdit = useCallback(async (editInstruction) => {
    if (!editingImage || !editInstruction.trim() || isGenerating) return;
    const { msgId, imgIdx, src } = editingImage;
    setEditingImage(null);
    setEditPrompt('');

    // Extract base64 from data URL once — used by both edit paths.
    const commaIdx = src.indexOf(',');
    const mimeMatch = src.match(/^data:([^;]+);/);
    const refImage = commaIdx !== -1 ? {
      data: src.slice(commaIdx + 1),
      mimeType: mimeMatch?.[1] || 'image/jpeg',
    } : null;

    // ── Carousel slide edit path ──
    // For a slide that belongs to a carousel with a locked design system,
    // we MUST rebuild the prompt from that design system. The generic
    // "EDIT THIS IMAGE" path would throw away the design system and the
    // slide would drift away from the rest of the set. Preserve the
    // locked visual DNA, reference both the current slide image and the
    // hook slide (for palette anchoring), and layer the user's edit
    // instruction on top as a modification.
    const carouselMsg = messages.find(m => m.id === msgId);
    const plan = carouselMsg?.carouselPlan;
    const slide = plan?.slides?.[imgIdx];
    if (plan && slide) {
      const platformId = carouselMsg.platform || 'instagram';
      setIsGenerating(true);
      setMessages(prev => prev.map(m => m.id === msgId ? { ...m, editingIdx: imgIdx } : m));
      try {
        const brandForPrompt = { name: brandDna?.brand_name || brandDna?.description?.split(/[.,]/)[0]?.trim() || '' };
        const uploadedPhotoUrls = photos.filter(p => p.status === 'done' && (p.url || p.result?.url)).map(p => p.url || p.result?.url).filter(Boolean);
        const oneBrandPhoto = brandDna?.photo_urls?.length ? [brandDna.photo_urls[0]] : [];
        const brandImageData = {
          photoUrls: [...uploadedPhotoUrls, ...oneBrandPhoto],
          logoUrl: null,
          colors: brandDna?.colors || {},
          mainFont: brandDna?.main_font || null,
        };

        // Build the slide prompt from the LOCKED design system, then
        // prepend the user's edit instruction as an override at the top.
        const basePrompt = buildCarouselSlidePrompt({
          designSystem: plan.designSystem,
          slide,
          index: imgIdx,
          total: plan.slides.length,
          brand: brandForPrompt,
          platform: platformId,
        });
        const editedPrompt = [
          `USER EDIT INSTRUCTION (apply ONLY this change to the slide below — keep every other element identical: palette, typography, layout zones, badge, branding strip, slide counter, chapter mark, glow position, mood):`,
          `  ${editInstruction.trim()}`,
          ``,
          `If the edit changes a specific piece of text, update ONLY that text in TEXT CONTENT below; all other text must render exactly as originally specified.`,
          ``,
          basePrompt,
        ].join('\n');

        // Reference images: the current slide (so the edit is incremental
        // not from-scratch) and the hook (so palette locks visually).
        const hookImg = (carouselMsg.images || []).find(i => i.idx === 0);
        const refs = [];
        if (refImage) refs.push(refImage);
        if (hookImg && hookImg.idx !== imgIdx && hookImg.src?.startsWith('data:')) {
          const hc = hookImg.src.indexOf(',');
          const hm = hookImg.src.match(/^data:([^;]+);/);
          if (hc !== -1) refs.push({ data: hookImg.src.slice(hc + 1), mimeType: hm?.[1] || 'image/jpeg' });
        }

        const result = await generateSlideWithRetry(imgIdx, editedPrompt, brandImageData, refs, { maxAttempts: 3, platform: platformId });
        const newSrc = `data:${result.image.mimeType};base64,${result.image.data}`;
        setMessages(prev => prev.map(m => {
          if (m.id !== msgId) return m;
          const newImages = [...(m.images || [])];
          const target = newImages.findIndex(img => img.idx === imgIdx);
          if (target !== -1) newImages[target] = { ...newImages[target], src: newSrc };
          else newImages.push({ src: newSrc, idx: imgIdx });
          // Clear any failed-slide entry for this index since it's now rendered.
          const failedLeft = (m.carouselPlan?.failedSlides || []).filter(x => x !== imgIdx);
          return {
            ...m,
            images: newImages,
            editingIdx: undefined,
            carouselPlan: { ...m.carouselPlan, failedSlides: failedLeft },
          };
        }));
      } catch (err) {
        console.error('Carousel slide edit failed:', err);
        setMessages(prev => prev.map(m => m.id === msgId ? { ...m, editingIdx: undefined } : m));
      } finally {
        setIsGenerating(false);
      }
      return;
    }

    // ── Generic single-image edit path (non-carousel) ──
    setIsGenerating(true);
    setMessages(prev => prev.map(m =>
      m.id === msgId ? { ...m, editingIdx: imgIdx } : m
    ));
    try {
      // Send the image + edit instruction + sidebar reference photos (for likeness), but no brand DNA or logo
      const sidebarPhotoUrls = photos.filter(p => p.status === 'done' && (p.url || p.result?.url)).map(p => p.url || p.result?.url).filter(Boolean);
      const editBrandData = sidebarPhotoUrls.length ? { photoUrls: sidebarPhotoUrls, logoUrl: null, colors: {}, mainFont: null } : null;
      const result = await generateImage(
        `EDIT THIS IMAGE: ${editInstruction.trim()}. Keep the same overall style and composition. Only apply the specific change requested.`,
        selectedPlatform,
        editBrandData,
        refImage ? [refImage] : null
      );
      if (result.image) {
        const newSrc = `data:${result.image.mimeType};base64,${result.image.data}`;
        setMessages(prev => prev.map(m => {
          if (m.id !== msgId) return m;
          const newImages = [...m.images];
          const target = newImages.findIndex(img => img.idx === imgIdx);
          if (target !== -1) newImages[target] = { ...newImages[target], src: newSrc };
          return { ...m, images: newImages, editingIdx: undefined };
        }));
      }
    } catch (err) {
      console.error('Image edit failed:', err);
      setMessages(prev => prev.map(m =>
        m.id === msgId ? { ...m, editingIdx: undefined } : m
      ));
    } finally {
      setIsGenerating(false);
    }
  }, [editingImage, isGenerating, selectedPlatform, messages, photos, brandDna, generateSlideWithRetry]);

  const handleLinkedinGenerateImage = useCallback(async (postText) => {
    if (!linkedinPreview || liGeneratingImage) return;
    setLiGeneratingImage(true);
    try {
      const imgPrompt = `Professional LinkedIn post image. Clean, minimal design with authority. 4:3 landscape ratio. The image should complement this LinkedIn post: "${postText.slice(0, 200)}". Use brand colors if available. Bold headline text, professional photography or clean graphic design. No cartoons, no clip-art.`;
      const uploadedPhotoUrls = photos.filter(p => p.status === 'done' && (p.url || p.result?.url)).map(p => p.url || p.result?.url).filter(Boolean);
      const oneBrandPhoto = brandDna?.photo_urls?.length ? [brandDna.photo_urls[0]] : [];
      const allPhotoUrls = [...uploadedPhotoUrls, ...oneBrandPhoto];
      const brandImageData = {
        photoUrls: allPhotoUrls,
        logoUrl: null,
        colors: brandDna?.colors || {},
        mainFont: brandDna?.main_font || null,
      };
      const result = await generateImage(imgPrompt, 'linkedin', brandImageData, null);
      if (result.image) {
        const src = `data:${result.image.mimeType};base64,${result.image.data}`;
        const newImg = { src, idx: 0 };
        setMessages(prev => prev.map(m =>
          m.id === linkedinPreview.msgId
            ? { ...m, images: [...(m.images || []), newImg] }
            : m
        ));
        setLinkedinPreview(prev => prev ? { ...prev, images: [...(prev.images || []), newImg] } : null);
      }
    } catch (err) {
      console.error('LinkedIn image generation failed:', err);
    } finally {
      setLiGeneratingImage(false);
    }
  }, [linkedinPreview, liGeneratingImage, photos, brandDna]);

  const handleKeyDown = (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      sendMessage();
    }
  };

  const autoResize = (e) => {
    const el = e.target;
    el.style.height = 'auto';
    el.style.height = el.scrollHeight + 'px';
  };

  const openSidebar = useCallback(() => { setSidebarOpen(true); setTooltip(t => ({ ...t, visible: false })); }, []);

  // ── File upload & processing ──
  const processFiles = useCallback(async (ids, files, setter) => {
    setter((prev) => prev.map((item) =>
      ids.includes(item.id) ? { ...item, status: 'uploading' } : item
    ));
    try {
      const sid = await ensureSession();
      const { files: results } = await uploadContextFiles(files, sid);
      setter((prev) => prev.map((item) => {
        const idx = ids.indexOf(item.id);
        if (idx === -1) return item;
        const result = results[idx];
        return result?.error
          ? { ...item, status: 'error', result }
          : { ...item, status: 'done', result, dbId: result?.dbId, url: result?.url || null };
      }));
    } catch {
      setter((prev) => prev.map((item) =>
        ids.includes(item.id) ? { ...item, status: 'error' } : item
      ));
    }
  }, [ensureSession]);

  const addPhotos = useCallback((newFiles) => {
    setPhotos((prev) => {
      const remaining = 4 - prev.length;
      if (remaining <= 0) return prev;
      const newItems = Array.from(newFiles).slice(0, remaining).map((file) => ({
        id: nextId(), file, status: 'pending',
      }));
      const ids = newItems.map((item) => item.id);
      const fileList = newItems.map((item) => item.file);
      setTimeout(() => processFiles(ids, fileList, setPhotos), 0);
      return [...prev, ...newItems];
    });
  }, [processFiles]);

  const addDocuments = useCallback((newFiles) => {
    const newItems = Array.from(newFiles).map((file) => ({
      id: nextId(), file, status: 'pending',
    }));
    const ids = newItems.map((item) => item.id);
    const fileList = newItems.map((item) => item.file);
    setDocuments((prev) => [...prev, ...newItems]);
    setTimeout(() => processFiles(ids, fileList, setDocuments), 0);
  }, [processFiles]);

  const removeFile = useCallback((index, setter) => {
    setter((prev) => {
      const item = prev[index];
      if (item?.dbId) deleteContentItem(item.dbId).catch(() => {});
      return prev.filter((_, i) => i !== index);
    });
  }, []);

  const handleDrop = useCallback((e, accept) => {
    e.preventDefault();
    const files = Array.from(e.dataTransfer.files).filter((f) => {
      if (accept === 'image/*') return f.type.startsWith('image/');
      return /\.(pdf|doc|docx|txt)$/i.test(f.name);
    });
    if (files.length) addDocuments(files);
  }, [addDocuments]);

  // Paste handlers
  const handleImagePaste = useCallback((e) => {
    const items = e.clipboardData?.items;
    if (!items) return;
    const imageFiles = [];
    for (const item of items) {
      if (item.type.startsWith('image/')) {
        const file = item.getAsFile();
        if (file) imageFiles.push(file);
      }
    }
    if (imageFiles.length > 0) { e.preventDefault(); addPhotos(imageFiles); }
  }, [addPhotos]);

  const handleDocPaste = useCallback((e) => {
    const items = e.clipboardData?.items;
    if (!items) return;
    const docFiles = [];
    for (const item of items) {
      if (item.kind === 'file' && !item.type.startsWith('image/')) {
        const file = item.getAsFile();
        if (file) docFiles.push(file);
      }
    }
    if (docFiles.length > 0) { e.preventDefault(); addDocuments(docFiles); }
  }, [addDocuments]);

  // ── Social URL extraction ──
  const processSocialUrl = useCallback(async (url) => {
    setSocialUrls((prev) => prev.map((item) =>
      item.url === url ? { ...item, status: 'extracting' } : item
    ));
    try {
      const sid = await ensureSession();
      const { results } = await extractSocialUrls([url], sid);
      const result = results[0];
      console.group(`[Content] Social URL extracted: ${url}`);
      console.log('Platform:', result?.platform);
      console.log('Source:', result?.source);
      console.log('Title:', result?.title?.slice(0, 100));
      console.log('Uploader:', result?.uploader);
      console.log('Duration:', result?.duration, 'seconds');
      console.log('Has transcript:', !!result?.transcript);
      console.log('Transcript preview:', result?.transcript ? result.transcript.slice(0, 200) + '...' : '(none)');
      console.log('Description preview:', result?.description ? result.description.slice(0, 200) + '...' : '(none)');
      console.log('Thumbnail:', result?.thumbnail ? 'yes' : 'no');
      console.log('Full result:', result);
      console.groupEnd();
      setSocialUrls((prev) => prev.map((item) =>
        item.url === url
          ? { ...item, status: result?.error ? 'error' : 'done', result, dbId: result?.dbId }
          : item
      ));
    } catch {
      setSocialUrls((prev) => prev.map((item) =>
        item.url === url ? { ...item, status: 'error' } : item
      ));
    }
  }, [ensureSession]);

  const addSocialUrl = useCallback((text) => {
    if (!SOCIAL_URL_PATTERN.test(text)) {
      setSocialError('Not a valid social media URL');
      return;
    }
    if (socialUrls.some((item) => item.url === text)) {
      setSocialError('Already added');
      return;
    }
    setSocialError('');
    setSocialUrls((prev) => [...prev, { url: text, status: 'pending' }]);
    setTimeout(() => processSocialUrl(text), 0);
  }, [socialUrls, processSocialUrl]);

  const handleSocialPaste = useCallback((e) => {
    const text = (e.clipboardData || window.clipboardData).getData('text').trim();
    if (!text) return;
    addSocialUrl(text);
  }, [addSocialUrl]);

  const handleClipboardPaste = useCallback(async () => {
    setShowPasteBtn(false);
    try {
      const text = (await navigator.clipboard.readText()).trim();
      if (!text) return;
      addSocialUrl(text);
    } catch {
      setSocialError('Clipboard access denied');
    }
  }, [addSocialUrl]);

  const submitSocialInput = useCallback((e) => {
    e?.preventDefault?.();
    const value = socialInput.trim();
    if (!value) return;
    addSocialUrl(value);
    setSocialInput('');
  }, [socialInput, addSocialUrl]);

  const handleLongPressStart = useCallback(() => {
    longPressTimer.current = setTimeout(() => setShowPasteBtn(true), 500);
  }, []);

  const handleLongPressEnd = useCallback(() => {
    if (longPressTimer.current) clearTimeout(longPressTimer.current);
  }, []);

  // Clear error after a delay
  useEffect(() => {
    if (!socialError) return;
    const t = setTimeout(() => setSocialError(''), 3000);
    return () => clearTimeout(t);
  }, [socialError]);

  // Listen for paste when hovering over zones
  useEffect(() => {
    if (!socialHover) return;
    const handler = (e) => handleSocialPaste(e);
    document.addEventListener('paste', handler);
    return () => document.removeEventListener('paste', handler);
  }, [socialHover, handleSocialPaste]);

  useEffect(() => {
    if (!photoHover) return;
    const handler = (e) => handleImagePaste(e);
    document.addEventListener('paste', handler);
    return () => document.removeEventListener('paste', handler);
  }, [photoHover, handleImagePaste]);

  useEffect(() => {
    if (!docHover) return;
    const handler = (e) => handleDocPaste(e);
    document.addEventListener('paste', handler);
    return () => document.removeEventListener('paste', handler);
  }, [docHover, handleDocPaste]);

  // Load saved content items from DB, scoped to the active session.
  // A null sessionId (fresh "New conversation") means empty sidebar — items
  // get created once the user uploads something (ensureSession creates the
  // session, upload tags items with its id).
  useEffect(() => {
    if (!sessionId) return;
    let cancelled = false;
    getContentItems(sessionId).then(({ items }) => {
      if (cancelled) return;
      console.log('[Content] Loaded content items for session', sessionId, items?.length, items?.map(i => ({ type: i.type, url: i.url?.slice(0, 60) })));
      if (!items?.length) return;
      const savedPhotos = [];
      const savedDocs = [];
      const savedSocial = [];
      for (const item of items) {
        if (item.type === 'photo') {
          savedPhotos.push({
            id: nextId(), dbId: item.id, status: 'done',
            file: null, url: item.url || item.storage_url,
            result: { type: 'image', filename: item.filename, url: item.url },
          });
        } else if (item.type === 'document') {
          savedDocs.push({
            id: nextId(), dbId: item.id, status: 'done',
            file: null, filename: item.filename,
            result: { type: 'document', filename: item.filename, url: item.url, extractedText: item.extracted_text, transcript: item.transcript },
          });
        } else if (item.type === 'social') {
          const m = item.metadata || {};
          savedSocial.push({
            url: item.url, dbId: item.id, status: 'done',
            result: {
              url: item.url, title: m.title, uploader: m.uploader,
              thumbnail: m.thumbnail, platform: m.platform,
              duration: m.duration, transcript: item.transcript,
              description: m.description,
            },
          });
        }
      }
      if (cancelled) return;
      console.log('[Content] Restored context  -  photos:', savedPhotos.length, 'docs:', savedDocs.length, 'social:', savedSocial.length);
      savedPhotos.forEach((p, i) => console.log(`  [photo ${i}] url: ${p.url?.slice(0, 80)}, result.url: ${p.result?.url?.slice(0, 80)}`));
      // Merge with existing state instead of replacing (avoids race with fresh uploads)
      if (savedPhotos.length) setPhotos(prev => {
        const existingDbIds = new Set(prev.filter(p => p.dbId).map(p => p.dbId));
        const newFromDb = savedPhotos.filter(p => !existingDbIds.has(p.dbId));
        return [...prev, ...newFromDb];
      });
      if (savedDocs.length) setDocuments(prev => {
        const existingDbIds = new Set(prev.filter(d => d.dbId).map(d => d.dbId));
        const newFromDb = savedDocs.filter(d => !existingDbIds.has(d.dbId));
        return [...prev, ...newFromDb];
      });
      if (savedSocial.length) setSocialUrls(prev => {
        const existingDbIds = new Set(prev.filter(s => s.dbId).map(s => s.dbId));
        const newFromDb = savedSocial.filter(s => !existingDbIds.has(s.dbId));
        return [...prev, ...newFromDb];
      });
    }).catch((err) => { console.error('[Content] Failed to load content items:', err); });
    return () => { cancelled = true; };
  }, [sessionId]);

  // ── Shared sidebar/sheet content ──
  const contextContent = (isSheet) => (
    <>
      {/* Photo thumbnails */}
      {photos.length > 0 && (
        <div className="cs-photo-grid">
          {photos.map((item, i) => (
            <div key={i} className={`cs-photo-thumb ${item.status === 'uploading' ? 'cs-photo-thumb--processing' : ''}`}>
              <img src={item.file ? URL.createObjectURL(item.file) : item.url} alt={item.file?.name || item.result?.filename || ''} className="cs-photo-img" />
              {(item.status === 'pending' || item.status === 'uploading') && (
                <div className="cs-thumb-overlay">
                  <Loader size={14} className="cs-spinner" />
                </div>
              )}
              {item.status === 'error' && (
                <div className="cs-thumb-overlay cs-thumb-overlay--error">!</div>
              )}
              <button className="cs-photo-remove" onClick={() => removeFile(i, setPhotos)}>
                <X size={10} />
              </button>
            </div>
          ))}
        </div>
      )}

      {/* Photos upload */}
      <input
        ref={isSheet ? undefined : photoInputRef}
        type="file"
        accept="image/*"
        multiple
        style={{ display: 'none' }}
        onChange={(e) => {
          const files = Array.from(e.target.files);
          if (files.length) addPhotos(files);
          e.target.value = '';
        }}
      />
      {photos.length < 4 && (
        <div
          className={`cs-upload-zone cs-upload-zone--expanded ${photoDragOver ? 'cs-upload-zone--dragover' : ''} ${photoHover ? 'cs-upload-zone--hover' : ''}`}
          onClick={() => photoInputRef.current?.click()}
          onMouseEnter={() => setPhotoHover(true)}
          onMouseLeave={() => setPhotoHover(false)}
          onDragOver={(e) => { e.preventDefault(); setPhotoDragOver(true); }}
          onDragLeave={() => setPhotoDragOver(false)}
          onDrop={(e) => {
            e.preventDefault();
            setPhotoDragOver(false);
            const files = Array.from(e.dataTransfer.files).filter((f) => f.type.startsWith('image/'));
            if (files.length) addPhotos(files);
          }}
        >
          <Image size={20} className="cs-upload-icon" />
          <span className="cs-upload-label cs-upload-label--show">Add reference photos</span>
          <span className="cs-upload-hint cs-upload-hint--show">{photos.length}/4 photos</span>
        </div>
      )}

      {/* Document thumbnails */}
      {documents.length > 0 && (
        <div className="cs-doc-grid">
          {documents.map((item, i) => {
            const fname = item.file?.name || item.filename || '';
            const ext = fname.split('.').pop().toLowerCase();
            return (
              <div
                key={i}
                className={`cs-doc-thumb ${item.status === 'uploading' ? 'cs-doc-thumb--processing' : ''}`}
                onMouseEnter={(e) => {
                  const rect = e.currentTarget.getBoundingClientRect();
                  const fn = item.file?.name || item.filename || 'file';
                  const statusText = item.status === 'done' ? `${fn} ✓` : item.status === 'error' ? `${fn}  -  failed` : fn;
                  setTooltip({ text: statusText, x: rect.left + rect.width / 2, y: rect.top - 6, visible: true });
                }}
                onMouseLeave={() => setTooltip((t) => ({ ...t, visible: false }))}
              >
                {(item.status === 'pending' || item.status === 'uploading') ? (
                  <Loader size={14} className="cs-spinner" />
                ) : (
                  <span className="cs-doc-ext">{ext}</span>
                )}
                {item.status === 'error' && (
                  <div className="cs-thumb-overlay cs-thumb-overlay--error">!</div>
                )}
                <button className="cs-doc-remove" onClick={() => { removeFile(i, setDocuments); setTooltip(t => ({ ...t, visible: false })); }}>
                  <X size={10} />
                </button>
              </div>
            );
          })}
        </div>
      )}

      {/* Documents upload */}
      <input
        ref={isSheet ? undefined : docInputRef}
        type="file"
        accept=".pdf,.doc,.docx,.txt,.json,.csv"
        multiple
        style={{ display: 'none' }}
        onChange={(e) => {
          const files = Array.from(e.target.files);
          if (files.length) addDocuments(files);
          e.target.value = '';
        }}
      />
      <div
        className={`cs-upload-zone cs-upload-zone--expanded ${docDragOver ? 'cs-upload-zone--dragover' : ''} ${docHover ? 'cs-upload-zone--hover' : ''}`}
        onClick={() => docInputRef.current?.click()}
        onMouseEnter={() => setDocHover(true)}
        onMouseLeave={() => setDocHover(false)}
        onDragOver={(e) => { e.preventDefault(); setDocDragOver(true); }}
        onDragLeave={() => setDocDragOver(false)}
        onDrop={(e) => { handleDrop(e, 'docs'); setDocDragOver(false); }}
      >
        <FileText size={20} className="cs-upload-icon" />
        <span className="cs-upload-label cs-upload-label--show">Add documents</span>
        <span className="cs-upload-hint cs-upload-hint--show">PDF, DOC, DOCX, TXT</span>
      </div>

      {/* Social URL paste zone */}
      <div
        ref={isSheet ? undefined : socialZoneRef}
        className={`cs-upload-zone cs-upload-zone--expanded cs-social-zone ${socialHover ? 'cs-social-zone--active' : ''} ${socialError ? 'cs-social-zone--error' : ''}`}
        onMouseEnter={() => setSocialHover(true)}
        onMouseLeave={() => { setSocialHover(false); setSocialError(''); }}
        {...(isSheet ? {
          onTouchStart: handleLongPressStart,
          onTouchEnd: handleLongPressEnd,
          onTouchMove: handleLongPressEnd,
        } : {})}
      >
        <div className="cs-social-icons" style={{ height: 32, gap: 0 }}>
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className="cs-social-float cs-social-float--sheet" style={{ animationDelay: '0s' }}>
            <rect x="2" y="2" width="20" height="20" rx="5" /><circle cx="12" cy="12" r="5" /><circle cx="17.5" cy="6.5" r="1" fill="currentColor" stroke="none" />
          </svg>
          <svg viewBox="0 0 24 24" fill="currentColor" className="cs-social-float cs-social-float--sheet" style={{ animationDelay: '0.8s' }}>
            <path d="M23.498 6.186a3.016 3.016 0 00-2.122-2.136C19.505 3.546 12 3.546 12 3.546s-7.505 0-9.377.504A3.017 3.017 0 00.502 6.186C0 8.07 0 12 0 12s0 3.93.502 5.814a3.016 3.016 0 002.122 2.136c1.871.504 9.376.504 9.376.504s7.505 0 9.377-.504a3.015 3.015 0 002.122-2.136C24 15.93 24 12 24 12s0-3.93-.502-5.814zM9.545 15.568V8.432L15.818 12l-6.273 3.568z" />
          </svg>
          <svg viewBox="0 0 24 24" fill="currentColor" className="cs-social-float cs-social-float--sheet" style={{ animationDelay: '1.6s' }}>
            <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z" />
          </svg>
          <svg viewBox="0 0 24 24" fill="currentColor" className="cs-social-float cs-social-float--sheet" style={{ animationDelay: '2.4s' }}>
            <path d="M16 8a6 6 0 016 6v7h-4v-7a2 2 0 00-4 0v7h-4v-7a6 6 0 016-6z" /><rect x="2" y="9" width="4" height="12" /><circle cx="4" cy="4" r="2" />
          </svg>
          <svg viewBox="0 0 24 24" fill="currentColor" className="cs-social-float cs-social-float--sheet" style={{ animationDelay: '3.2s' }}>
            <path d="M19.59 6.69a4.83 4.83 0 01-3.77-4.25V2h-3.45v13.67a2.89 2.89 0 01-2.88 2.5 2.89 2.89 0 01-2.89-2.89 2.89 2.89 0 012.89-2.89c.28 0 .54.04.79.1v-3.5a6.37 6.37 0 00-.79-.05A6.34 6.34 0 003.15 15a6.34 6.34 0 006.34 6.34 6.34 6.34 0 006.34-6.34V8.72a8.2 8.2 0 004.76 1.52V6.79a4.84 4.84 0 01-1-.1z" />
          </svg>
        </div>
        {isSheet && showPasteBtn && (
          <button className="cs-paste-btn" onClick={handleClipboardPaste}>
            Paste
          </button>
        )}
        <span className="cs-upload-label cs-upload-label--show">
          {socialError || 'Paste a social media link'}
        </span>
        <form className="cs-social-input-form" onSubmit={submitSocialInput} onClick={(e) => e.stopPropagation()}>
          <input
            type="url"
            className="cs-social-input"
            placeholder="Paste or type link"
            value={socialInput}
            onChange={(e) => setSocialInput(e.target.value)}
            onPaste={(e) => e.stopPropagation()}
          />
          <button type="submit" className="cs-social-input-submit" disabled={!socialInput.trim()} aria-label="Add link">
            <ArrowUp size={14} />
          </button>
        </form>
      </div>
      {socialUrls.length > 0 && (
        <div className="cs-social-cards">
          {socialUrls.map((item, i) => (
            <div key={i} className={`cs-social-card ${item.status === 'extracting' ? 'cs-social-card--extracting' : ''} ${item.status === 'error' ? 'cs-social-card--error' : ''}`}>
              <div className="cs-social-card-thumb">
                <SocialThumb src={item.result?.thumbnail} />
                {(item.status === 'pending' || item.status === 'extracting') && (
                  <div className="cs-thumb-overlay">
                    <Loader size={16} className="cs-spinner" />
                  </div>
                )}
              </div>
              <div className="cs-social-card-info">
                <span className="cs-social-card-title">
                  {item.result?.title || item.url.replace(/^https?:\/\/(www\.)?/, '')}
                </span>
                {item.result?.uploader && (
                  <span className="cs-social-card-uploader">{item.result.uploader}</span>
                )}
                {item.status === 'error' && (
                  <span className="cs-url-badge cs-url-badge--error">failed</span>
                )}
              </div>
              <button className="cs-social-card-remove" onClick={() => { if (item.dbId) deleteContentItem(item.dbId).catch(() => {}); setSocialUrls((prev) => prev.filter((_, j) => j !== i)); }}>
                <X size={12} />
              </button>
            </div>
          ))}
        </div>
      )}

      {/* Brand DNA */}
      <div className="cs-branddna cs-branddna--expanded">
        <div className="cs-branddna-top">
          {(() => { const u = brandDna?.logos?.find(l => l.isDefault)?.url || brandDna?.logos?.[0]?.url || brandDna?.logo_url; return u ? (
            <img src={u} alt="Logo" className="cs-branddna-logo" crossOrigin="anonymous" onError={(e) => { e.target.src = '/favicon.png'; }} />
          ) : (
            <img src="/favicon.png" alt="Brand DNA" className="cs-branddna-logo" />
          ); })()}
          <span className="cs-branddna-title cs-branddna-title--show">Brand DNA</span>
        </div>

        {/* Brand Photos */}
        {brandDna?.photo_urls?.length > 0 && (
          <div className="cs-branddna-photos">
            {brandDna.photo_urls.slice(0, 4).map((url, i) => (
              <img key={i} src={url} alt="" className="cs-branddna-photo" crossOrigin="anonymous" onError={(e) => { e.target.style.display = 'none'; }} />
            ))}
            {brandDna.photo_urls.length > 4 && (
              <span className="cs-branddna-photo-more">+{brandDna.photo_urls.length - 4}</span>
            )}
          </div>
        )}

        {/* Brand Colors */}
        {brandDna?.colors && Object.values(brandDna.colors).some(Boolean) && (
          <div className="cs-branddna-colors">
            {brandDna.colors.primary && <div className="cs-branddna-swatch" style={{ background: brandDna.colors.primary }} title={`Primary: ${brandDna.colors.primary}`} />}
            {brandDna.colors.text && <div className="cs-branddna-swatch" style={{ background: brandDna.colors.text }} title={`Text: ${brandDna.colors.text}`} />}
            {brandDna.colors.secondary && <div className="cs-branddna-swatch" style={{ background: brandDna.colors.secondary }} title={`Secondary: ${brandDna.colors.secondary}`} />}
          </div>
        )}

        {/* Brand Fonts */}
        {(brandDna?.main_font || brandDna?.secondary_font) && (
          <div className="cs-branddna-fonts">
            {brandDna.main_font && <span className="cs-branddna-font" style={{ fontFamily: brandDna.main_font }}>{brandDna.main_font}</span>}
            {brandDna.secondary_font && <span className="cs-branddna-font cs-branddna-font--secondary" style={{ fontFamily: brandDna.secondary_font }}>{brandDna.secondary_font}</span>}
          </div>
        )}

        {!brandDna && (
          <p className="cs-branddna-desc cs-branddna-desc--show">
            Set up your brand voice, photos, and visual style.
          </p>
        )}

        <button className="cs-branddna-btn cs-branddna-btn--show" onClick={(e) => { e.stopPropagation(); navigate('/settings', { state: { scrollTo: 'brand-dna' } }); }}>
          {brandDna ? 'Edit Brand DNA' : 'Set Up Brand DNA'}
        </button>
      </div>
    </>
  );

  // Credits depleted
  if (creditsDepleted) {
    return (
      <div className="content-page" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <div className="credits-depleted">
          <div className="credits-depleted-icon"><Zap size={24} /></div>
          <div className="credits-depleted-title">You've run out of credits</div>
          <p className="credits-depleted-text">
            Your credit balance has reached zero. Add more credits to continue creating content.
          </p>
          <button className="credits-depleted-link" onClick={() => navigate('/settings')}>
            Go to Billing & Usage
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="content-page">
      {/* Content Sidebar (desktop only) */}
      <aside
        className={`content-sidebar ${sidebarOpen ? 'content-sidebar--open' : ''}`}
        onClick={!sidebarOpen ? openSidebar : undefined}
      >
        {/* Header */}
        <div className="cs-header">
          {sidebarOpen ? (
            <>
              <span className="cs-title">Context</span>
              <button className="cs-collapse-btn" onClick={(e) => { e.stopPropagation(); setSidebarOpen(false); setTooltip(t => ({ ...t, visible: false })); }} title="Collapse">
                <ChevronLeft size={18} />
              </button>
            </>
          ) : (
            <button className="cs-expand-btn" onClick={openSidebar} title="Expand">
              <ChevronRight size={18} />
            </button>
          )}
        </div>

        <div className="cs-items">
          {/* Photo thumbnails */}
          {photos.length > 0 && (
            <div className="cs-photo-grid">
              {photos.map((item, i) => (
                <div key={i} className={`cs-photo-thumb ${item.status === 'uploading' ? 'cs-photo-thumb--processing' : ''}`}>
                  <img src={item.file ? URL.createObjectURL(item.file) : item.url} alt={item.file?.name || item.result?.filename || ''} className="cs-photo-img" />
                  {(item.status === 'pending' || item.status === 'uploading') && (
                    <div className="cs-thumb-overlay">
                      <Loader size={14} className="cs-spinner" />
                    </div>
                  )}
                  <button className="cs-photo-remove" onClick={() => removeFile(i, setPhotos)}>
                    <X size={10} />
                  </button>
                </div>
              ))}
            </div>
          )}

          {/* Photos upload */}
          <input
            ref={photoInputRef}
            type="file"
            accept="image/*"
            multiple
            style={{ display: 'none' }}
            onChange={(e) => {
              const files = Array.from(e.target.files);
              if (files.length) addPhotos(files);
              e.target.value = '';
            }}
          />
          {photos.length < 4 && (
            <div
              className={`cs-upload-zone ${photoDragOver ? 'cs-upload-zone--dragover' : ''} ${photoHover ? 'cs-upload-zone--hover' : ''}`}
              onClick={() => { if (sidebarOpen) photoInputRef.current?.click(); }}
              onMouseEnter={() => setPhotoHover(true)}
              onMouseLeave={() => setPhotoHover(false)}
              onDragOver={(e) => { e.preventDefault(); setPhotoDragOver(true); }}
              onDragLeave={() => setPhotoDragOver(false)}
              onDrop={(e) => {
                e.preventDefault();
                setPhotoDragOver(false);
                const files = Array.from(e.dataTransfer.files).filter((f) => f.type.startsWith('image/'));
                if (files.length) addPhotos(files);
              }}
            >
              <Image size={20} className="cs-upload-icon" />
              <span className="cs-upload-label">Add reference photos</span>
              <span className="cs-upload-hint">{photos.length}/4 photos</span>
            </div>
          )}

          {/* Document thumbnails */}
          {documents.length > 0 && (
            <div className="cs-doc-grid">
              {documents.map((item, i) => {
                const fname = item.file?.name || item.filename || '';
                const ext = fname.split('.').pop().toLowerCase();
                return (
                  <div
                    key={i}
                    className={`cs-doc-thumb ${item.status === 'uploading' ? 'cs-doc-thumb--processing' : ''}`}
                    onMouseEnter={(e) => {
                      const rect = e.currentTarget.getBoundingClientRect();
                      setTooltip({ text: item.file?.name || item.filename || 'file', x: rect.left + rect.width / 2, y: rect.top - 6, visible: true });
                    }}
                    onMouseLeave={() => setTooltip((t) => ({ ...t, visible: false }))}
                  >
                    {(item.status === 'pending' || item.status === 'uploading') ? (
                      <Loader size={14} className="cs-spinner" />
                    ) : (
                      <span className="cs-doc-ext">{ext}</span>
                    )}
                    <button className="cs-doc-remove" onClick={() => { removeFile(i, setDocuments); setTooltip(t => ({ ...t, visible: false })); }}>
                      <X size={10} />
                    </button>
                  </div>
                );
              })}
            </div>
          )}

          {/* Documents upload */}
          <input
            ref={docInputRef}
            type="file"
            accept=".pdf,.doc,.docx,.txt,.json,.csv"
            multiple
            style={{ display: 'none' }}
            onChange={(e) => {
              const files = Array.from(e.target.files);
              if (files.length) addDocuments(files);
              e.target.value = '';
            }}
          />
          <div
            className={`cs-upload-zone ${docDragOver ? 'cs-upload-zone--dragover' : ''} ${docHover ? 'cs-upload-zone--hover' : ''}`}
            onClick={() => { if (sidebarOpen) docInputRef.current?.click(); }}
            onMouseEnter={() => setDocHover(true)}
            onMouseLeave={() => setDocHover(false)}
            onDragOver={(e) => { e.preventDefault(); setDocDragOver(true); }}
            onDragLeave={() => setDocDragOver(false)}
            onDrop={(e) => { handleDrop(e, 'docs'); setDocDragOver(false); }}
          >
            <FileText size={20} className="cs-upload-icon" />
            <span className="cs-upload-label">Add documents</span>
            <span className="cs-upload-hint">PDF, DOC, DOCX, TXT</span>
          </div>

          {/* Social URL paste zone */}
          <div
            ref={socialZoneRef}
            className={`cs-upload-zone cs-social-zone ${socialHover ? 'cs-social-zone--active' : ''} ${socialError ? 'cs-social-zone--error' : ''}`}
            onMouseEnter={() => setSocialHover(true)}
            onMouseLeave={() => { setSocialHover(false); setSocialError(''); }}
          >
            <div className="cs-social-icons">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className="cs-social-float" style={{ animationDelay: '0s' }}>
                <rect x="2" y="2" width="20" height="20" rx="5" /><circle cx="12" cy="12" r="5" /><circle cx="17.5" cy="6.5" r="1" fill="currentColor" stroke="none" />
              </svg>
              <svg viewBox="0 0 24 24" fill="currentColor" className="cs-social-float" style={{ animationDelay: '0.8s' }}>
                <path d="M23.498 6.186a3.016 3.016 0 00-2.122-2.136C19.505 3.546 12 3.546 12 3.546s-7.505 0-9.377.504A3.017 3.017 0 00.502 6.186C0 8.07 0 12 0 12s0 3.93.502 5.814a3.016 3.016 0 002.122 2.136c1.871.504 9.376.504 9.376.504s7.505 0 9.377-.504a3.015 3.015 0 002.122-2.136C24 15.93 24 12 24 12s0-3.93-.502-5.814zM9.545 15.568V8.432L15.818 12l-6.273 3.568z" />
              </svg>
              <svg viewBox="0 0 24 24" fill="currentColor" className="cs-social-float" style={{ animationDelay: '1.6s' }}>
                <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z" />
              </svg>
              <svg viewBox="0 0 24 24" fill="currentColor" className="cs-social-float" style={{ animationDelay: '2.4s' }}>
                <path d="M16 8a6 6 0 016 6v7h-4v-7a2 2 0 00-4 0v7h-4v-7a6 6 0 016-6z" /><rect x="2" y="9" width="4" height="12" /><circle cx="4" cy="4" r="2" />
              </svg>
              <svg viewBox="0 0 24 24" fill="currentColor" className="cs-social-float" style={{ animationDelay: '3.2s' }}>
                <path d="M19.59 6.69a4.83 4.83 0 01-3.77-4.25V2h-3.45v13.67a2.89 2.89 0 01-2.88 2.5 2.89 2.89 0 01-2.89-2.89 2.89 2.89 0 012.89-2.89c.28 0 .54.04.79.1v-3.5a6.37 6.37 0 00-.79-.05A6.34 6.34 0 003.15 15a6.34 6.34 0 006.34 6.34 6.34 6.34 0 006.34-6.34V8.72a8.2 8.2 0 004.76 1.52V6.79a4.84 4.84 0 01-1-.1z" />
              </svg>
            </div>
            <span className="cs-upload-label">
              {socialError || 'Paste a social media link'}
            </span>
            <form className="cs-social-input-form" onSubmit={submitSocialInput} onClick={(e) => e.stopPropagation()}>
              <input
                type="url"
                className="cs-social-input"
                placeholder="Paste or type link"
                value={socialInput}
                onChange={(e) => setSocialInput(e.target.value)}
                onPaste={(e) => e.stopPropagation()}
              />
              <button type="submit" className="cs-social-input-submit" disabled={!socialInput.trim()} aria-label="Add link">
                <ArrowUp size={14} />
              </button>
            </form>
          </div>
          {socialUrls.length > 0 && (
            <div className="cs-social-cards">
              {socialUrls.map((item, i) => (
                <div key={i} className={`cs-social-card ${item.status === 'extracting' ? 'cs-social-card--extracting' : ''} ${item.status === 'error' ? 'cs-social-card--error' : ''}`}>
                  <div className="cs-social-card-thumb">
                    <SocialThumb src={item.result?.thumbnail} />
                    {(item.status === 'pending' || item.status === 'extracting') && (
                      <div className="cs-thumb-overlay">
                        <Loader size={16} className="cs-spinner" />
                      </div>
                    )}
                  </div>
                  <div className="cs-social-card-info">
                    <span className="cs-social-card-title">
                      {item.result?.title || item.url.replace(/^https?:\/\/(www\.)?/, '')}
                    </span>
                    {item.result?.uploader && (
                      <span className="cs-social-card-uploader">{item.result.uploader}</span>
                    )}
                    {item.status === 'error' && (
                      <span className="cs-url-badge cs-url-badge--error">failed</span>
                    )}
                  </div>
                  <button className="cs-social-card-remove" onClick={() => { if (item.dbId) deleteContentItem(item.dbId).catch(() => {}); setSocialUrls((prev) => prev.filter((_, j) => j !== i)); }}>
                    <X size={12} />
                  </button>
                </div>
              ))}
            </div>
          )}

          {/* Saved carousel templates  -  dropdown; sits between the attached
              links and Brand DNA so users see the workflow: (link) → (template
              context) → (brand). Collapsed by default so it stays out of the
              way when you're not picking a template. */}
          {sidebarOpen && savedTemplates.length > 0 && (
            <div className={`cs-templates-card${templatesSidebarOpen ? ' cs-templates-card--open' : ''}`}>
              <button
                type="button"
                className="cs-templates-toggle"
                onClick={() => setTemplatesSidebarOpen(v => !v)}
                title={templatesSidebarOpen ? 'Close saved samples' : 'Open saved samples'}
              >
                <Zap size={12} />
                <span className="cs-templates-toggle-label">Saved carousel samples</span>
                <span className="cs-templates-count">
                  {selectedTemplateIds.size > 0 ? `${selectedTemplateIds.size} on` : `${savedTemplates.length}`}
                </span>
                <ChevronRight size={14} className={`cs-templates-chevron${templatesSidebarOpen ? ' cs-templates-chevron--open' : ''}`} />
              </button>
              {templatesSidebarOpen && (
                <div className="cs-templates-list">
                  {savedTemplates.map(t => {
                    const on = selectedTemplateIds.has(t.id);
                    const p = t.design_system?.palette || {};
                    return (
                      <div key={t.id} className={`cs-template-item${on ? ' cs-template-item--on' : ''}`}>
                        <button type="button" className="cs-template-toggle" onClick={() => toggleSavedTemplate(t.id)} title={on ? 'Remove from chat context' : 'Add to chat context'}>
                          {t.preview_url && <img src={t.preview_url} alt="" className="cs-template-thumb" />}
                          <div className="cs-template-info">
                            <div className="cs-template-name">{t.name}</div>
                            <div className="cs-template-swatches">
                              {[p.background, p.accentPrimary, p.gradientStart, p.gradientEnd].filter(Boolean).map((hex, i) => (
                                <span key={i} className="cs-template-swatch" style={{ background: hex }} />
                              ))}
                            </div>
                          </div>
                          {on && <span className="cs-template-dot" />}
                        </button>
                        <button type="button" className="cs-template-delete" onClick={() => removeSavedTemplate(t.id)} title="Delete template">
                          <Trash2 size={11} />
                        </button>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          )}

          {/* Brand DNA */}
          {sidebarOpen ? (
            <div className="cs-branddna">
              <div className="cs-branddna-top">
                {(() => { const u = brandDna?.logos?.find(l => l.isDefault)?.url || brandDna?.logos?.[0]?.url || brandDna?.logo_url; return u ? (
                  <img src={u} alt="Logo" className="cs-branddna-logo" crossOrigin="anonymous" onError={(e) => { e.target.src = '/favicon.png'; }} />
                ) : (
                  <img src="/favicon.png" alt="Brand DNA" className="cs-branddna-logo" />
                ); })()}
                <span className="cs-branddna-title">Brand DNA</span>
              </div>
              {brandDna?.photo_urls?.length > 0 && (
                <div className="cs-branddna-photos">
                  {brandDna.photo_urls.slice(0, 4).map((url, i) => (
                    <img key={i} src={url} alt="" className="cs-branddna-photo" crossOrigin="anonymous" onError={(e) => { e.target.style.display = 'none'; }} />
                  ))}
                  {brandDna.photo_urls.length > 4 && (
                    <span className="cs-branddna-photo-more">+{brandDna.photo_urls.length - 4}</span>
                  )}
                </div>
              )}
              {brandDna?.colors && Object.values(brandDna.colors).some(Boolean) && (
                <div className="cs-branddna-colors">
                  {brandDna.colors.primary && <div className="cs-branddna-swatch" style={{ background: brandDna.colors.primary }} />}
                  {brandDna.colors.text && <div className="cs-branddna-swatch" style={{ background: brandDna.colors.text }} />}
                  {brandDna.colors.secondary && <div className="cs-branddna-swatch" style={{ background: brandDna.colors.secondary }} />}
                </div>
              )}
              {(brandDna?.main_font || brandDna?.secondary_font) && (
                <div className="cs-branddna-fonts">
                  {brandDna.main_font && <span className="cs-branddna-font">{brandDna.main_font}</span>}
                  {brandDna.secondary_font && <span className="cs-branddna-font cs-branddna-font--secondary">{brandDna.secondary_font}</span>}
                </div>
              )}
              <p className="cs-branddna-desc">
                {brandDna ? '' : 'Set up your brand identity.'}
              </p>
              <button className="cs-branddna-btn" onClick={(e) => { e.stopPropagation(); navigate('/settings', { state: { scrollTo: 'brand-dna' } }); }}>
                {brandDna ? 'Edit Brand DNA' : 'Set Up Brand DNA'}
              </button>
            </div>
          ) : (
            <button
              className="cs-branddna-collapsed"
              onClick={(e) => { e.stopPropagation(); navigate('/settings', { state: { scrollTo: 'brand-dna' } }); }}
              title={brandDna ? 'Edit Brand DNA' : 'Set Up Brand DNA'}
            >
              {(() => { const u = brandDna?.logos?.find(l => l.isDefault)?.url || brandDna?.logos?.[0]?.url || brandDna?.logo_url; return u ? (
                <img src={u} alt="Logo" className="cs-branddna-collapsed-logo" crossOrigin="anonymous" onError={(e) => { e.target.src = '/favicon.png'; }} />
              ) : (
                <img src="/favicon.png" alt="Brand DNA" className="cs-branddna-collapsed-logo" />
              ); })()}
              {brandDna?.colors && Object.values(brandDna.colors).some(Boolean) && (
                <div className="cs-branddna-collapsed-dots">
                  {brandDna.colors.primary && <span className="cs-branddna-collapsed-dot" style={{ background: brandDna.colors.primary }} />}
                  {brandDna.colors.secondary && <span className="cs-branddna-collapsed-dot" style={{ background: brandDna.colors.secondary }} />}
                </div>
              )}
            </button>
          )}
        </div>
      </aside>

      {/* Doc tooltip  -  rendered outside sidebar to avoid overflow clipping */}
      {tooltip.visible && (
        <div
          className="cs-doc-tooltip"
          style={{ left: tooltip.x, top: tooltip.y }}
        >
          {tooltip.text}
        </div>
      )}

      {/* Mobile Context Bottom Sheet */}
      <div
        className={`context-sheet-overlay ${contextSheetOpen ? 'context-sheet-overlay--open' : ''}`}
        onClick={() => { setContextSheetOpen(false); setShowPasteBtn(false); }}
      />
      <div className={`context-sheet ${contextSheetOpen ? 'context-sheet--open' : ''}`}>
        <div className="context-sheet-handle" onClick={() => { setContextSheetOpen(false); setShowPasteBtn(false); }}>
          <div className="context-sheet-bar" />
        </div>
        <div className="context-sheet-body">
          {contextContent(true)}
        </div>
      </div>

      {/* Main content area */}
      <div className={`content-main${linkedinPreview || carouselSideView ? ' content-main--split' : ''}`}>
        <div className="content-main-chat">
        {/* Platform Pill Selector */}
        <div className="content-top-bar">
          <button className="content-prev-convos" title="Previous conversations" onClick={() => setShowSessions((v) => { if (!v) setSidebarOpen(false); return !v; })}>
            <History size={18} className="content-prev-convos-icon" />
            <span className="content-prev-convos-label">Previous conversations</span>
          </button>
          <div className="content-pill-bar">
            <div className="content-pill">
              <div
                className="content-pill-slider"
                style={{ transform: `translateX(calc(${activeIndex} * var(--pill-size)))` }}
              />
              {platforms.map((p) => (
                <button
                  key={p.id}
                  className={`content-pill-btn ${selectedPlatform === p.id ? 'content-pill-btn--active' : ''}`}
                  onClick={() => { setSelectedPlatform(p.id); setLinkedinPreview(null); }}
                  title={p.name}
                >
                  {p.icon}
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* Sessions overlay + panel */}
        {showSessions && (
          <>
            <div className="content-sessions-backdrop" onClick={() => setShowSessions(false)} />
            <div className="content-sessions-panel">
              <div className="content-sessions-header">
                <span>Conversations</span>
                <button className="content-sessions-new" onClick={newConversation} title="New conversation">
                  <Plus size={16} /> New
                </button>
              </div>
              <div className="content-sessions-list">
                {sessions.length === 0 && (
                  <div className="content-sessions-empty">No past conversations yet</div>
                )}
                {sessions.map((s) => {
                  const isRenaming = renamingSessionId === s.id;
                  return (
                    <div
                      key={s.id}
                      className={`content-sessions-item ${s.id === sessionId ? 'content-sessions-item--active' : ''}`}
                      onClick={() => { if (!isRenaming) loadSession(s.id); }}
                    >
                      <div className="content-sessions-item-info">
                        {isRenaming ? (
                          <input
                            autoFocus
                            className="content-sessions-item-rename"
                            value={renameDraft}
                            onChange={(e) => setRenameDraft(e.target.value)}
                            onClick={(e) => e.stopPropagation()}
                            onKeyDown={(e) => {
                              if (e.key === 'Enter') { e.preventDefault(); commitRenameSession(); }
                              else if (e.key === 'Escape') { e.preventDefault(); cancelRenameSession(); }
                            }}
                            onBlur={commitRenameSession}
                            maxLength={120}
                          />
                        ) : (
                          <span className="content-sessions-item-title">{s.title}</span>
                        )}
                        <span className="content-sessions-item-meta">
                          {s.platform} &middot; {new Date(s.updated_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
                        </span>
                      </div>
                      {!isRenaming && (
                        <button className="content-sessions-item-rename-btn" onClick={(e) => startRenameSession(s, e)} title="Rename">
                          <Pencil size={13} />
                        </button>
                      )}
                      <button className="content-sessions-item-delete" onClick={(e) => requestDeleteSession(s.id, e)} title="Delete">
                        <Trash2 size={14} />
                      </button>
                    </div>
                  );
                })}
              </div>
            </div>
          </>
        )}

        {/* Delete confirmation modal */}
        {confirmDeleteId && (() => {
          const target = sessions.find((s) => s.id === confirmDeleteId);
          return (
            <div className="content-confirm-backdrop" onClick={() => setConfirmDeleteId(null)}>
              <div className="content-confirm-modal" onClick={(e) => e.stopPropagation()} role="dialog" aria-modal="true">
                <div className="content-confirm-icon"><Trash2 size={20} /></div>
                <div className="content-confirm-title">Delete this conversation?</div>
                <div className="content-confirm-desc">
                  {target ? `"${target.title}" will be permanently removed.` : 'This conversation will be permanently removed.'}
                </div>
                <div className="content-confirm-actions">
                  <button className="content-confirm-btn content-confirm-btn--cancel" onClick={() => setConfirmDeleteId(null)}>Cancel</button>
                  <button className="content-confirm-btn content-confirm-btn--danger" onClick={confirmDeleteSession} autoFocus>Delete</button>
                </div>
              </div>
            </div>
          );
        })()}

        {/* Chat area */}
        <div className="content-chat-area" ref={chatAreaRef}>
          {!hasMessages ? (
            <div className="content-hero">
              <div className="content-hero-cards">
                {/* Instagram Post */}
                <div className="content-mock content-mock--ig">
                  <div className="content-mock-header">
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className="content-mock-logo">
                      <rect x="2" y="2" width="20" height="20" rx="5" /><circle cx="12" cy="12" r="5" /><circle cx="17.5" cy="6.5" r="1" fill="currentColor" stroke="none" />
                    </svg>
                    <span className="content-mock-handle">yourpage</span>
                  </div>
                  <div className="content-mock-img">
                    <svg viewBox="0 0 48 48" fill="none" className="content-mock-placeholder-icon"><rect width="48" height="48" rx="6" fill="currentColor" opacity="0.08"/><path d="M14 34l8-10 6 7 4-5 6 8H14z" fill="currentColor" opacity="0.15"/><circle cx="18" cy="18" r="3" fill="currentColor" opacity="0.15"/></svg>
                  </div>
                  <div className="content-mock-caption">
                    <div className="content-mock-line" style={{ width: '80%' }} />
                    <div className="content-mock-line" style={{ width: '55%' }} />
                  </div>
                </div>

                {/* YouTube Video */}
                <div className="content-mock content-mock--yt">
                  <div className="content-mock-img content-mock-img--wide">
                    <svg viewBox="0 0 48 28" fill="none" className="content-mock-placeholder-icon"><rect width="48" height="28" rx="4" fill="currentColor" opacity="0.08"/><path d="M19 9v10l9-5-9-5z" fill="currentColor" opacity="0.18"/></svg>
                  </div>
                  <div className="content-mock-meta">
                    <svg viewBox="0 0 24 24" fill="currentColor" className="content-mock-logo">
                      <path d="M23.498 6.186a3.016 3.016 0 00-2.122-2.136C19.505 3.546 12 3.546 12 3.546s-7.505 0-9.377.504A3.017 3.017 0 00.502 6.186C0 8.07 0 12 0 12s0 3.93.502 5.814a3.016 3.016 0 002.122 2.136c1.871.504 9.376.504 9.376.504s7.505 0 9.377-.504a3.015 3.015 0 002.122-2.136C24 15.93 24 12 24 12s0-3.93-.502-5.814zM9.545 15.568V8.432L15.818 12l-6.273 3.568z" />
                    </svg>
                    <div className="content-mock-caption">
                      <div className="content-mock-line" style={{ width: '90%' }} />
                      <div className="content-mock-line" style={{ width: '40%' }} />
                    </div>
                  </div>
                </div>

                {/* X Tweet */}
                <div className="content-mock content-mock--x">
                  <div className="content-mock-header">
                    <svg viewBox="0 0 24 24" fill="currentColor" className="content-mock-logo">
                      <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z" />
                    </svg>
                    <span className="content-mock-handle">@yourbrand</span>
                  </div>
                  <div className="content-mock-caption content-mock-caption--tweet">
                    <div className="content-mock-line" style={{ width: '95%' }} />
                    <div className="content-mock-line" style={{ width: '80%' }} />
                    <div className="content-mock-line" style={{ width: '50%' }} />
                  </div>
                  <div className="content-mock-actions">
                    <div className="content-mock-line" style={{ width: '20%', height: 6 }} />
                    <div className="content-mock-line" style={{ width: '20%', height: 6 }} />
                    <div className="content-mock-line" style={{ width: '20%', height: 6 }} />
                  </div>
                </div>

                {/* TikTok Video */}
                <div className="content-mock content-mock--tt">
                  <div className="content-mock-img content-mock-img--tall">
                    <svg viewBox="0 0 36 48" fill="none" className="content-mock-placeholder-icon"><rect width="36" height="48" rx="6" fill="currentColor" opacity="0.08"/><path d="M15 18v12l9-6-9-6z" fill="currentColor" opacity="0.18"/></svg>
                  </div>
                  <div className="content-mock-meta">
                    <svg viewBox="0 0 24 24" fill="currentColor" className="content-mock-logo">
                      <path d="M19.59 6.69a4.83 4.83 0 01-3.77-4.25V2h-3.45v13.67a2.89 2.89 0 01-2.88 2.5 2.89 2.89 0 01-2.89-2.89 2.89 2.89 0 012.89-2.89c.28 0 .54.04.79.1v-3.5a6.37 6.37 0 00-.79-.05A6.34 6.34 0 003.15 15a6.34 6.34 0 006.34 6.34 6.34 6.34 0 006.34-6.34V8.72a8.2 8.2 0 004.76 1.52V6.79a4.84 4.84 0 01-1-.1z" />
                    </svg>
                    <div className="content-mock-caption">
                      <div className="content-mock-line" style={{ width: '75%' }} />
                    </div>
                  </div>
                </div>
              </div>

              <p className="content-hero-text">Ask your AI CEO to Plan, Ideate or Generate content.</p>

              <div className="content-starters">
                {contentStarters.map((s, i) => (
                  <button key={i} className="content-starter" onClick={() => { setInput(s); }}>
                    <span>{s}</span>
                    <ChevronRight size={14} className="content-starter-arrow" />
                  </button>
                ))}
              </div>
            </div>
          ) : (
            <div className="content-messages">
              {messages.map((msg) => {
                if (msg.role === 'user') {
                  return (
                    <div key={msg.id} className="content-bubble content-bubble--user">
                      <p className="content-user-text">{msg.content}</p>
                    </div>
                  );
                }
                // A message has something renderable if it has text, a plan
                // card, any images, or pending images being generated. Only
                // when NONE of those are present do we show the
                // thinking/no-response placeholder bubble.
                const hasRenderable =
                  !!msg.content ||
                  !!msg.carouselPlan ||
                  (msg.images || []).length > 0 ||
                  (msg.pendingImages || 0) > 0;
                if (!hasRenderable) {
                  // Only show the animated "thinking..." bubble for the
                  // ONE message that is actively being generated right now.
                  // Older empty-content messages (from previous timeouts
                  // or silent failures) must stay on the static "no
                  // response" copy even when the user fires off a new
                  // request — otherwise they'd flip back to animated dots
                  // every time isGenerating is true globally.
                  const stillWorking = isGenerating && msg.id === activeAssistantId;
                  return (
                    <div key={msg.id} className="content-assistant-row">
                      <img src="/favicon.png" alt="" className="content-assistant-avatar" />
                      <div className="content-thinking">
                        <span className="content-thinking-text">
                          {stillWorking ? (
                            searchStatus === 'searching' ? (
                              <><Search size={14} /> Searching the web<span className="content-dots"><span>.</span><span>.</span><span>.</span></span></>
                            ) : searchStatus === 'writing' ? (
                              <><PenLine size={14} /> Writing response<span className="content-dots"><span>.</span><span>.</span><span>.</span></span></>
                            ) : (
                              <>thinking<span className="content-dots"><span>.</span><span>.</span><span>.</span></span></>
                            )
                          ) : (
                            <>No response received. Please try again.</>
                          )}
                        </span>
                      </div>
                    </div>
                  );
                }
                const parsed = parseMessageOptions(msg.content);
                const sortedImages = [...(msg.images || [])].sort((a, b) => a.idx - b.idx);
                const hasPending = (msg.pendingImages || 0) > 0;
                const hasImages = sortedImages.length > 0 || hasPending;
                return (
                  <div key={msg.id} className="content-assistant-row">
                    <img src="/favicon.png" alt="" className="content-assistant-avatar" />
                    <div className="content-bubble content-bubble--assistant">
                      {parsed.text && (
                        <div className="content-markdown">
                          <ReactMarkdown remarkPlugins={[remarkGfm]} components={{
                            table: ({ children, ...props }) => (
                              <div className="content-table-scroll"><table {...props}>{children}</table></div>
                            ),
                          }}>{parsed.text}</ReactMarkdown>
                        </div>
                      )}
                      {/* Carousel plan approval card — Instagram only */}
                      {msg.carouselPlan && (
                        <CarouselPlanCard
                          plan={msg.carouselPlan}
                          onApprove={() => handleCarouselApprove(msg.id)}
                          onRetryFailed={() => handleRetryFailedSlides(msg.id)}
                          onUpdatePlan={(next) => handleUpdateCarouselPlan(msg.id, next)}
                        />
                      )}
                      {/* LinkedIn text-post reopen button — shows when a
                          persisted linkedinPost exists on the message but
                          no preview is currently open for it. Clicking
                          rehydrates linkedinPreview from the message. */}
                      {msg.linkedinPost && msg.linkedinPost.content && linkedinPreview?.msgId !== msg.id && (
                        <button
                          type="button"
                          className="content-carousel-action-btn content-linkedin-reopen"
                          onClick={() => {
                            setCarouselSideView(null);
                            setLinkedinPreview({
                              content: msg.linkedinPost.content,
                              images: msg.images || [],
                              totalSlides: msg.linkedinPost.totalSlides || 0,
                              msgId: msg.id,
                            });
                          }}
                        >
                          <Maximize2 size={14} /> Open LinkedIn preview
                        </button>
                      )}
                      {/* Image carousel  -  below text */}
                      {hasImages && (
                        <div className="content-image-carousel">
                          {sortedImages.map((img, i) => (
                            <div key={i} className={`content-carousel-slide content-generated-image--fadein${msg.editingIdx === img.idx ? ' content-carousel-slide--editing' : ''}`}>
                              {msg.editingIdx === img.idx && (
                                <div className="content-image-edit-overlay">
                                  <Loader size={20} className="cs-spinner" />
                                  <span>Editing...</span>
                                </div>
                              )}
                              <img src={img.src} alt={`Slide ${i + 1}`} onClick={() => setSlideViewer({ msgId: msg.id, idx: img.idx })} style={{ cursor: 'zoom-in' }} />
                              <button
                                className="content-carousel-edit"
                                onClick={(e) => { e.stopPropagation(); setEditingImage({ msgId: msg.id, imgIdx: img.idx, src: img.src }); setEditPrompt(''); }}
                                title="Edit this slide with an instruction (keeps design locked)"
                              >
                                <Pencil size={14} />
                              </button>
                              {msg.carouselPlan?.slides?.[img.idx] && (
                                <button
                                  type="button"
                                  className="content-carousel-regen"
                                  title="Re-roll this slide (same spec, new render)"
                                  disabled={isGenerating}
                                  onClick={(e) => { e.stopPropagation(); handleCarouselSlideRegenerate(msg.id, img.idx); }}
                                >
                                  <RefreshCw size={14} />
                                </button>
                              )}
                              <button
                                type="button"
                                className="content-carousel-download"
                                title="Download image"
                                onClick={async (e) => {
                                  // <a download> is ignored for cross-origin
                                  // URLs (Supabase storage) — browsers navigate
                                  // to the image instead of downloading, which
                                  // strands the user (no ESC, only Back). Fetch
                                  // as a blob and trigger download manually.
                                  e.stopPropagation();
                                  e.preventDefault();
                                  try {
                                    const res = await fetch(img.src, { mode: 'cors' });
                                    const blob = await res.blob();
                                    const ext = (blob.type.split('/')[1] || 'png').split('+')[0];
                                    const objectUrl = URL.createObjectURL(blob);
                                    const a = document.createElement('a');
                                    a.href = objectUrl;
                                    a.download = `slide-${i + 1}.${ext}`;
                                    document.body.appendChild(a);
                                    a.click();
                                    a.remove();
                                    setTimeout(() => URL.revokeObjectURL(objectUrl), 2000);
                                  } catch (err) {
                                    console.error('Image download failed:', err);
                                    // Last resort: open in new tab so the user at least sees the image
                                    window.open(img.src, '_blank', 'noopener');
                                  }
                                }}
                              >
                                <Download size={16} />
                              </button>
                              {editingImage?.msgId === msg.id && editingImage?.imgIdx === img.idx && (
                                <div className="content-image-edit-input" onClick={(e) => e.stopPropagation()}>
                                  <input
                                    type="text"
                                    placeholder="Describe the edit..."
                                    value={editPrompt}
                                    onChange={(e) => setEditPrompt(e.target.value)}
                                    onKeyDown={(e) => { if (e.key === 'Enter' && editPrompt.trim()) handleImageEdit(editPrompt); if (e.key === 'Escape') setEditingImage(null); }}
                                    autoFocus
                                  />
                                  <button disabled={!editPrompt.trim()} onClick={() => handleImageEdit(editPrompt)}>
                                    <ArrowUp size={14} />
                                  </button>
                                </div>
                              )}
                            </div>
                          ))}
                          {/* Skeleton placeholders for pending images */}
                          {Array.from({ length: msg.pendingImages || 0 }).map((_, i) => (
                            <div key={`pending-${i}`} className={`content-carousel-slide content-image-skeleton content-image-skeleton--${activePlatform?.id || 'default'}`}>
                              <div className="content-image-skeleton-shimmer" />
                              <div className="content-image-skeleton-label">
                                <Loader size={16} className="cs-spinner" />
                                <span>Generating {activePlatform?.id === 'youtube' ? 'thumbnail' : activePlatform?.id === 'linkedin' ? 'image' : `slide ${sortedImages.length + i + 1}`}...</span>
                              </div>
                            </div>
                          ))}
                        </div>
                      )}
                      {/* Actions bar — ZIP download, edit hint. Only when all slides finished. */}
                      {msg.carouselPlan && sortedImages.length > 0 && !hasPending && (
                        <CarouselActionsBar
                          msgId={msg.id}
                          plan={msg.carouselPlan}
                          images={sortedImages}
                          platform={msg.platform || 'instagram'}
                          onOpenSidePreview={() => {
                            // Opening the IG/LI side preview closes any open
                            // LinkedIn textpost preview so the split layout
                            // only has one tenant.
                            setLinkedinPreview(null);
                            setCarouselSideView({ msgId: msg.id });
                          }}
                        />
                      )}
                    </div>
                  </div>
                );
              })}
              {/* Full-screen slide viewer modal */}
              {slideViewer && (() => {
                const vMsg = messages.find(m => m.id === slideViewer.msgId);
                const vImages = [...(vMsg?.images || [])].sort((a, b) => a.idx - b.idx);
                const vCurrent = vImages.find(img => img.idx === slideViewer.idx) || vImages[0];
                if (!vCurrent) return null;
                const vPos = vImages.findIndex(img => img.idx === vCurrent.idx);
                return (
                  <SlideViewerModal
                    image={vCurrent}
                    position={vPos}
                    total={vImages.length}
                    isGenerating={isGenerating}
                    onClose={() => setSlideViewer(null)}
                    onPrev={() => {
                      const prevImg = vImages[vPos - 1];
                      if (prevImg) setSlideViewer({ msgId: slideViewer.msgId, idx: prevImg.idx });
                    }}
                    onNext={() => {
                      const nextImg = vImages[vPos + 1];
                      if (nextImg) setSlideViewer({ msgId: slideViewer.msgId, idx: nextImg.idx });
                    }}
                    onEdit={vMsg?.carouselPlan ? () => {
                      const msgId = slideViewer.msgId;
                      const idx = vCurrent.idx;
                      const src = vCurrent.src;
                      setSlideViewer(null);
                      setEditingImage({ msgId, imgIdx: idx, src });
                      setEditPrompt('');
                    } : null}
                    onRegenerate={vMsg?.carouselPlan?.slides?.[vCurrent.idx] ? () => {
                      const msgId = slideViewer.msgId;
                      const idx = vCurrent.idx;
                      setSlideViewer(null);
                      handleCarouselSlideRegenerate(msgId, idx);
                    } : null}
                  />
                );
              })()}
              {/* Question overlay  -  appears right after the last assistant bubble */}
              {currentQuestion && !isGenerating && (
                <div className="content-question-overlay">
                  <p className="content-question-text">{currentQuestion.text}</p>
                  {!customTyping ? (
                    <div className="content-question-options">
                      {currentQuestion.options.map((opt, i) => (
                        <button key={i} className="content-question-option" onClick={() => selectOption(opt)}>
                          {opt}
                        </button>
                      ))}
                      <button className="content-question-option content-question-option--custom" onClick={() => setCustomTyping(true)}>
                        Type your own...
                      </button>
                    </div>
                  ) : (
                    <div className="content-question-custom-row">
                      <input
                        className="content-question-custom-input"
                        placeholder="Type your answer..."
                        value={customText}
                        onChange={(e) => setCustomText(e.target.value)}
                        onKeyDown={(e) => { if (e.key === 'Enter' && customText.trim()) selectOption(customText); }}
                        autoFocus
                      />
                      <button className="content-question-custom-send" disabled={!customText.trim()} onClick={() => selectOption(customText)}>
                        <ArrowUp size={16} />
                      </button>
                    </div>
                  )}
                </div>
              )}
              <div ref={messagesEndRef} />
            </div>
          )}
        </div>

        {/* Chat Input */}
        <div className="content-input-area">
          {hasPendingAttachments && (
            <div className="content-pending-banner">
              <Loader size={13} className="cs-spinner" />
              <span>
                Processing {pendingAttachments.total} attachment{pendingAttachments.total === 1 ? '' : 's'}
                {pendingAttachments.photos > 0 && ` - ${pendingAttachments.photos} photo${pendingAttachments.photos === 1 ? '' : 's'}`}
                {pendingAttachments.documents > 0 && ` - ${pendingAttachments.documents} document${pendingAttachments.documents === 1 ? '' : 's'}`}
                {pendingAttachments.socialUrls > 0 && ` - ${pendingAttachments.socialUrls} link${pendingAttachments.socialUrls === 1 ? '' : 's'}`}
                . You can type now  -  send unlocks when they finish.
              </span>
            </div>
          )}
          <div className="content-input-wrapper">
            <div className="content-input-top-row">
              <div className="content-ctx-anchor" ref={contentCtxRef}>
                <button className="content-ctx-trigger" onClick={() => { setContentCtxMenuOpen((v) => !v); setContentHoveredCat(null); }}>
                  <Plus size={13} /> Add Context
                </button>
                {contentCtxMenuOpen && (
                  <div className="content-ctx-dropdown">
                    <div className="content-ctx-dropdown-header">Select Context</div>
                    {contentCtxCategories.map((cat) => {
                      const selectedCount = cat.items.filter((i) => contentSelectedCtx.has(i.id)).length;
                      return (
                        <div
                          key={cat.id}
                          className={`content-ctx-cat ${contentHoveredCat === cat.id ? 'content-ctx-cat--active' : ''}`}
                          onMouseEnter={() => setContentHoveredCat(cat.id)}
                        >
                          <div className="content-ctx-cat-icon">
                            <img src={cat.iconSrc} alt={cat.label} className="content-ctx-cat-img" />
                          </div>
                          <span className="content-ctx-cat-label">{cat.label}</span>
                          {selectedCount > 0 && (
                            <span className="content-ctx-cat-badge">{selectedCount}</span>
                          )}
                          <ChevronRight size={13} className="content-ctx-cat-arrow" />
                          {contentHoveredCat === cat.id && (
                            <div className="content-ctx-sub">
                              <div className="content-ctx-sub-header">{cat.label}</div>
                              {cat.items.map((item) => (
                                <div
                                  key={item.id}
                                  className={`content-ctx-sub-item ${contentSelectedCtx.has(item.id) ? 'content-ctx-sub-item--on' : ''}`}
                                  onClick={() => toggleContentCtxItem(item.id)}
                                >
                                  <div className="content-ctx-sub-info">
                                    <span className="content-ctx-sub-name">{item.name}</span>
                                    <span className="content-ctx-sub-meta">
                                      {item.sub && <span>{item.sub}</span>}
                                      {item.sub && item.date && <span className="content-ctx-sub-dot" />}
                                      {item.date && <span>{item.date}</span>}
                                    </span>
                                  </div>
                                  <div className={`content-ctx-radio ${contentSelectedCtx.has(item.id) ? 'content-ctx-radio--on' : ''}`}>
                                    <div className="content-ctx-radio-fill" />
                                  </div>
                                </div>
                              ))}
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
              <button
                className={`content-research-toggle ${contentResearchMode ? 'content-research-toggle--active' : ''}`}
                onClick={() => setContentResearchMode((v) => !v)}
                title="Enable web research mode"
              >
                <Globe size={13} /> Research
              </button>
              {contentSelectedCtx.size > 0 && (
                <div className="content-ctx-pills">
                  {getContentSelectedDetails().map((item) => (
                    <span key={item.id} className="content-ctx-pill">
                      {item.name}
                      <button className="content-ctx-pill-x" onClick={() => toggleContentCtxItem(item.id)}>
                        <X size={10} />
                      </button>
                    </span>
                  ))}
                </div>
              )}
            </div>
            <div className="content-input-bottom-row">
              <textarea
                className="content-input"
                placeholder={`Create content for ${activePlatform.name}...`}
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onInput={autoResize}
                onKeyDown={handleKeyDown}
                rows={1}
              />
              {isGenerating ? (
                <button className="content-send-btn content-stop-btn" onClick={stopGenerating}>
                  <CircleStop size={18} />
                </button>
              ) : (
                <button
                  className="content-send-btn"
                  disabled={!input.trim() || hasPendingAttachments}
                  onClick={sendMessage}
                  title={hasPendingAttachments ? `Waiting for ${pendingAttachments.total} attachment${pendingAttachments.total === 1 ? '' : 's'} to finish processing...` : undefined}
                >
                  {hasPendingAttachments ? <Loader size={18} className="cs-spinner" /> : <Send size={18} />}
                </button>
              )}
            </div>
          </div>
        </div>
        </div>
        {linkedinPreview && (
          <div className="content-main-preview">
            <LinkedInPreview
              content={linkedinPreview.content}
              images={linkedinPreview.images}
              userName={brandDna?.brand_name || user?.name}
              userAvatar={brandDna?.logos?.find(l => l.isDefault)?.url || brandDna?.logos?.[0]?.url || brandDna?.logo_url || brandDna?.photo_urls?.[0] || user?.avatar}
              userSubtitle={brandDna?.description?.split(/[.!?]/)[0]?.trim().slice(0, 80) || 'Author'}
              followerCount={brandDna?.linkedin_followers || '1,200'}
              postAge="1w"
              onClose={() => setLinkedinPreview(null)}
              onGenerateImage={handleLinkedinGenerateImage}
              isGeneratingImage={liGeneratingImage}
              streaming={isGenerating}
              totalSlides={linkedinPreview?.totalSlides || 0}
              onUploadImages={(files) => {
                const newImages = files.map((file, i) => ({
                  src: URL.createObjectURL(file),
                  idx: (linkedinPreview?.images?.length || 0) + i,
                }));
                setLinkedinPreview(prev => prev ? {
                  ...prev,
                  images: [...(prev.images || []), ...newImages],
                  totalSlides: newImages.length > 1 ? (prev.images?.length || 0) + newImages.length : prev.totalSlides,
                } : prev);
              }}
              isLinkedInConnected={isLinkedInConnected}
              onPostToLinkedIn={async ({ text, images, connect }) => {
                if (connect) {
                  navigate('/settings', { state: { scrollTo: 'integrations' } });
                  return;
                }
                const imageUrl = images?.[0]?.src || null;
                await postToLinkedIn(text, imageUrl);
              }}
              onSchedule={async ({ text, images, date, time, platform }) => {
                const scheduledAt = `${date}T${time}:00`;
                const thumbnailUrl = images?.[0]?.src || null;
                await schedulePost({
                  platform,
                  caption: text,
                  scheduledAt,
                  thumbnailUrl,
                  contentSessionId: sessionId || null,
                });
              }}
            />
          </div>
        )}
        {carouselSideView && !linkedinPreview && (() => {
          const panelMsg = messages.find(m => m.id === carouselSideView.msgId);
          if (!panelMsg) return null;
          const isLi = panelMsg.platform === 'linkedin';
          // LinkedIn carousels reuse the same LinkedInPreview component that
          // powers the text-post preview — authentic LI chrome, text-above-
          // media order, real reaction SVGs, real action bar. The carousel
          // images feed in via images + totalSlides; the caption feeds in
          // via content. Instagram carousels keep the dedicated IG-styled
          // CarouselSidePanel (profile ring, square media, IG action row).
          if (isLi) {
            const caption = panelMsg.carouselPlan?.caption || '';
            const sortedImgs = [...(panelMsg.images || [])].sort((a, b) => a.idx - b.idx);
            const displayName = brandDna?.brand_name || user?.name || 'Your Brand';
            const subtitle = brandDna?.description?.split(/[.!?]/)[0]?.trim().slice(0, 80) || 'Author';
            return (
              <div className="content-main-preview">
                <LinkedInPreview
                  content={caption}
                  images={sortedImgs}
                  userName={displayName}
                  userAvatar={brandDna?.logos?.find(l => l.isDefault)?.url || brandDna?.logos?.[0]?.url || brandDna?.logo_url || brandDna?.photo_urls?.[0]}
                  userSubtitle={subtitle}
                  followerCount={brandDna?.linkedin_followers || '1,200'}
                  postAge="1w"
                  totalSlides={sortedImgs.length}
                  streaming={false}
                  onClose={() => setCarouselSideView(null)}
                  isLinkedInConnected={isLinkedInConnected}
                  onPostToLinkedIn={async ({ text, images: imgs, connect }) => {
                    if (connect) { navigate('/settings', { state: { scrollTo: 'integrations' } }); return; }
                    const imageUrl = imgs?.[0]?.src || null;
                    await postToLinkedIn(text, imageUrl);
                  }}
                  onSchedule={async ({ text, images: imgs, date, time, platform }) => {
                    const scheduledAt = `${date}T${time}:00`;
                    const thumbnailUrl = imgs?.[0]?.src || null;
                    await schedulePost({
                      platform,
                      caption: text,
                      scheduledAt,
                      thumbnailUrl,
                      contentSessionId: sessionId || null,
                    });
                  }}
                />
              </div>
            );
          }
          return (
            <div className="content-main-preview">
              <CarouselSidePanel
                msg={panelMsg}
                brandDna={brandDna}
                user={user}
                isGenerating={isGenerating}
                onClose={() => setCarouselSideView(null)}
                onFullscreen={(idx) => setSlideViewer({ msgId: panelMsg.id, idx })}
                onEdit={panelMsg.carouselPlan ? (idx, src) => {
                  setEditingImage({ msgId: panelMsg.id, imgIdx: idx, src });
                  setEditPrompt('');
                } : null}
                onRegenerate={panelMsg.carouselPlan?.slides ? (idx) => {
                  handleCarouselSlideRegenerate(panelMsg.id, idx);
                } : null}
              />
            </div>
          );
        })()}
      </div>
    </div>
  );
}
