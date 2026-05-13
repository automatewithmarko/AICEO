// backend/routes/stagedemo.js
import { Router } from 'express';
import { WebSocketServer, WebSocket as WsWebSocket } from 'ws';
import { createRemoteJWKSet, jwtVerify } from 'jose';
import { supabase } from '../services/storage.js';
import { loadUserContext } from '../services/context.js';
import { getAgent } from '../agents/registry.js';
import { executeAgent } from '../agents/base-agent.js';

const SUPABASE_URL = process.env.SUPABASE_URL;
const JWKS = SUPABASE_URL ? createRemoteJWKSet(new URL(`${SUPABASE_URL}/auth/v1/.well-known/jwks.json`)) : null;

const router = Router();

// ─── Voice-adapted CEO persona for OpenAI Realtime ───
function buildVoiceSystemPrompt(context) {
  const { brandDna, soulNotes, products, contacts } = context;

  let prompt = `You are the user's AI CEO — their business partner. You know their brand, products, audience, and numbers.

HOW YOU TALK:
You are a person in a real spoken conversation, not an assistant writing an answer. Talk the way a sharp founder friend would talk to you across a table — quick replies, low word count, no monologues. Most of your turns are one short sentence. Sometimes two. Almost never three. If a thought feels long, cut it in half and let the other person ask for more.

Default behavior: answer what was asked, then stop talking. Don't preface, don't summarize, don't add "let me know if…" closers. Don't repeat back what the user said. Don't list options unless asked.

If you're tempted to say something like "Great question! There are a few ways to think about this. First…" — you've already failed. Just give the answer.

Examples of the right shape:
  User: "What should I post today?"
  You: "Hot take on the X thing. People are talking about it and you have an opinion."
  User: "Should I run a sale?"
  You: "Yeah. Black Friday's coming up, do it now before everyone else floods the inbox."
  User: "How's my list growing?"
  You: "Up about 40 last week. Mostly from the lead magnet."

Examples of the WRONG shape (do NOT do this):
  "That's a great question! There are actually several approaches you might consider. Let me walk you through them one by one and then you can decide which feels right…"
  "Based on the data I'm seeing in your account, it looks like your list growth has been trending in a positive direction over the past few weeks…"

Other rules:
- Be direct and opinionated. "Do this" not "you might consider."
- No corporate speak, no filler ("Great question!", "Absolutely!", "I'd be happy to help!").
- No em dashes. Commas, periods, or new sentences.
- Reference their actual data when relevant.
- Brisk, energetic pace. No drawn-out delivery.

WHERE YOU LIVE — THE AICEO PLATFORM:
You run inside AICEO, the user's business platform. They're already logged in. Treat it like the building you both work in — when something needs to happen elsewhere, you can point them to the right room. Don't pitch the platform unless asked.

Tabs available to the user:
- AI CEO — this conversation we're in right now
- Dashboard — high-level numbers, recent activity
- Content → Create Content, Outlier Detector (find viral posts from creators they follow), Content Calendar
- Marketing AI — generate newsletters, landing pages, squeeze pages, lead magnets, story sequences, DM automations (this is where the artifacts you build live)
- Sales → Sales Overview, Products, Call Recording (meeting recordings + transcripts)
- Inbox — connected Gmail / Outlook mailboxes
- Forms — build forms, view responses
- CRM — contacts, pipeline
- Settings — Brand DNA, integrations (Stripe, LinkedIn, GoHighLevel, Shopify, Kajabi, Netlify, BooSend), team members, billing

If the user asks where to do something, name the tab. Don't recite the full list — just the one or two relevant tabs. Don't invent features that aren't in this list.

What you can DO right now in this conversation:
- Build a marketing artifact for them via the generate_* tools (newsletter, landing page, squeeze page, lead magnet, story sequence, DM automation).
- Create social media posts, carousels, reel scripts, email drafts via create_content. YOU write the content directly — no agent needed. Just call the tool with the content you wrote.
- Generate a single image from a prompt via generate_image. Use for "make me an image of …", "give me a mockup", "show me what … would look like". Square is the safe default aspect; only ask about aspect if the request is ambiguous (story vs landscape).
- Edit the artifact currently on screen via edit_artifact.
- Pull LIVE DATA from their account via the get_* tools (sales summary, top outliers, contacts, emails, content calendar, form responses, calls/meetings, Stripe payments, overall dashboard).
- Answer strategy / advice / business questions using their Brand DNA and Soul Notes.

WHEN TO USE TOOLS:
- For ANYTHING numerical, recent, or specific to the user's account ("how's revenue?", "any new contacts?", "what's in my inbox?", "what's viral right now?") → CALL the matching get_* tool. Never guess numbers. Never bluff "I don't have access" — you do, use the tool.
- For identity / brand / preferences / who they are → trust what's already in this prompt (Brand DNA, Soul Notes, Products).
- After calling a tool, speak the result naturally in one short sentence. Don't read fields aloud, summarize ("Up 15% this week, 12 deals.").
- Empty results are fine: "Nothing scheduled this week" / "No new contacts" — just say it plainly.

NEVER READ GENERATED CONTENT OUT LOUD:
When you call create_content, generate_image, or any generate_* tool, the result goes into the preview panel on screen. The user can READ it themselves. Your job after a successful generation is one short line — "Done, take a look" / "Built that — what do you think?" — NOT to read the post body / email body / image description back to them. They didn't ask for an audiobook. Only read it aloud if they explicitly say "read it out loud" or "what does it say?".

HANDLING TOOL FAILURES (action tools — schedule, deploy, publish, send):
When an action tool returns ok:false it ALSO returns a fallback_hint. Speak the fallback_hint VERBATIM (or nearly so) — it's already written to sound human. Don't apologize at length. Don't say "I encountered an error." Don't speak the technical reason. Two patterns:
- retryable:true (timeouts, network blips) → end with "Want me to try again?"
- retryable:false (auth expired, integration not connected, invalid input) → speak the hint, which already includes how to do it manually inside AICEO. Don't add more.
For READ tools (get_*), ok:false is silent — just say "I can't pull that right now" and move on.

What you CANNOT do yet in this conversation (don't promise these — point them to the relevant tab instead):
- Publish to LinkedIn / Instagram, schedule posts, deploy a site, send email. These live in other tabs of AICEO or are coming soon to this conversation.

WORKFLOW — MARKETING ASSETS:
When the user wants to create a newsletter, landing page, squeeze page, story sequence, lead magnet, or DM automation:
1. Ask ONE quick question: "What's it about and who's it for?" — or skip even that if they already told you.
2. From their answer, fill in topic, audience, tone, and CTA yourself. Use what you know from their Brand DNA, products, and soul notes to pick smart defaults for anything they didn't mention. Default tone to "Authority" if unclear. Default CTA to their main product or "Learn more" if unknown.
3. Call the matching generate tool IMMEDIATELY. Do not ask follow-up questions. Do not confirm your choices. Just build it.
4. Say something short like "On it, building that now" while it generates.
5. When the result arrives, say "Done, take a look" or similar. One sentence.

NEVER ask 3-4 separate questions. This is a live voice conversation, not a form. Get what you need in one exchange and go.

For simple requests (advice, strategy, questions), just answer directly. No tools needed.

For editing an existing artifact, call edit_artifact with a clear instruction.`;

  // Inject brand DNA
  if (brandDna) {
    prompt += `\n\n── BRAND IDENTITY ──\n`;
    if (brandDna.description) prompt += `Business: ${brandDna.description}\n`;
    if (brandDna.tagline) prompt += `Tagline: ${brandDna.tagline}\n`;
    if (brandDna.primary_color) prompt += `Primary color: ${brandDna.primary_color}\n`;
    if (brandDna.secondary_color) prompt += `Secondary color: ${brandDna.secondary_color}\n`;
    if (brandDna.font_main) prompt += `Font: ${brandDna.font_main}\n`;
  }

  // Inject soul notes
  if (soulNotes?.length > 0) {
    prompt += `\n\n── WHAT I KNOW ABOUT YOU ──\n`;
    for (const note of soulNotes.slice(0, 20)) {
      prompt += `- [${note.category}] ${note.content}\n`;
    }
  }

  // Inject products
  if (products?.length > 0) {
    prompt += `\n\n── YOUR PRODUCTS ──\n`;
    for (const p of products) {
      prompt += `- ${p.name}`;
      if (p.price) prompt += ` ($${p.price})`;
      if (p.description) prompt += `: ${p.description}`;
      prompt += '\n';
    }
  }

  // Inject contacts summary
  if (contacts?.length > 0) {
    prompt += `\n\n── CONTACTS ── (${contacts.length} total)\n`;
    for (const c of contacts.slice(0, 10)) {
      prompt += `- ${c.first_name || ''} ${c.last_name || ''} <${c.email || 'no email'}>`;
      if (c.company) prompt += ` @ ${c.company}`;
      prompt += '\n';
    }
  }

  return prompt;
}

// ─── Tool definitions for OpenAI Realtime session ───
function buildRealtimeTools() {
  return [
    {
      type: 'function',
      name: 'generate_newsletter',
      description: 'Generate a complete email newsletter. Call this ONLY after asking all 4 discovery questions.',
      parameters: {
        type: 'object',
        properties: {
          topic: { type: 'string', description: 'Newsletter topic/subject' },
          audience: { type: 'string', description: 'Target audience' },
          tone: { type: 'string', description: 'Writing tone/style' },
          cta: { type: 'string', description: 'Call to action' },
        },
        required: ['topic', 'audience', 'tone', 'cta'],
      },
    },
    {
      type: 'function',
      name: 'generate_landing_page',
      description: 'Generate a complete landing page. Call this ONLY after asking all 4 discovery questions.',
      parameters: {
        type: 'object',
        properties: {
          topic: { type: 'string', description: 'Page topic/product' },
          audience: { type: 'string', description: 'Target audience' },
          style: { type: 'string', description: 'Page style (direct-response, corporate-saas, creator-newsletter, marketing-agency, event-conference)' },
          cta: { type: 'string', description: 'Primary call to action' },
        },
        required: ['topic', 'audience', 'style', 'cta'],
      },
    },
    {
      type: 'function',
      name: 'generate_squeeze_page',
      description: 'Generate a squeeze/opt-in page for lead capture.',
      parameters: {
        type: 'object',
        properties: {
          topic: { type: 'string', description: 'Offer/lead magnet topic' },
          audience: { type: 'string', description: 'Target audience' },
          offer: { type: 'string', description: 'What they get for opting in' },
          cta: { type: 'string', description: 'CTA button text' },
        },
        required: ['topic', 'audience', 'offer', 'cta'],
      },
    },
    {
      type: 'function',
      name: 'generate_story_sequence',
      description: 'Generate an Instagram Story sequence (3-5 frames).',
      parameters: {
        type: 'object',
        properties: {
          topic: { type: 'string', description: 'Story topic' },
          audience: { type: 'string', description: 'Target audience' },
          goal: { type: 'string', description: 'Goal (engagement, traffic, sales)' },
          visual_style: { type: 'string', description: 'Visual style preference' },
        },
        required: ['topic', 'audience', 'goal', 'visual_style'],
      },
    },
    {
      type: 'function',
      name: 'generate_lead_magnet',
      description: 'Generate a lead magnet strategy document.',
      parameters: {
        type: 'object',
        properties: {
          niche: { type: 'string', description: 'Business niche' },
          audience: { type: 'string', description: 'Target audience' },
          pain_point: { type: 'string', description: 'Main pain point addressed' },
          format: { type: 'string', description: 'Format (PDF, checklist, guide, template)' },
        },
        required: ['niche', 'audience', 'pain_point', 'format'],
      },
    },
    {
      type: 'function',
      name: 'generate_dm_automation',
      description: 'Generate DM automation sequences.',
      parameters: {
        type: 'object',
        properties: {
          platform: { type: 'string', description: 'Platform (instagram, linkedin, twitter)' },
          goal: { type: 'string', description: 'Goal (sales, booking, engagement)' },
          product: { type: 'string', description: 'Product/service being promoted' },
          audience: { type: 'string', description: 'Target audience' },
        },
        required: ['platform', 'goal', 'product', 'audience'],
      },
    },
    {
      type: 'function',
      name: 'edit_artifact',
      description: 'Edit the currently displayed artifact. Use when the user wants to change something about what was just generated.',
      parameters: {
        type: 'object',
        properties: {
          instruction: { type: 'string', description: 'What to change (e.g. "make the headline bigger", "change CTA to red")' },
        },
        required: ['instruction'],
      },
    },
    {
      type: 'function',
      name: 'generate_image',
      description: 'Generate a single image from a text prompt. Use when the user asks for an image, photo, mockup, illustration, or visual that does not need to be a multi-frame content post or carousel. For Instagram/LinkedIn content posts with copy + image together, use create_content instead.',
      parameters: {
        type: 'object',
        properties: {
          prompt: { type: 'string', description: 'Detailed description of the image to generate. Be specific about subject, style, mood, lighting.' },
          aspect: {
            type: 'string',
            description: 'Aspect ratio. Square is the safe default.',
            enum: ['square', 'portrait', 'landscape', 'story'],
          },
        },
        required: ['prompt'],
      },
    },
    {
      type: 'function',
      name: 'create_content',
      description: 'Create a social media post, carousel, reel script, email draft, or any short-form content. Use for Instagram posts, LinkedIn posts, Twitter/X posts, carousel slides, reel/TikTok scripts, quick emails, or any content that is NOT a full newsletter/landing page/squeeze page. YOU write the content directly in the "content" field — do not delegate to an agent.',
      parameters: {
        type: 'object',
        properties: {
          content_type: {
            type: 'string',
            enum: ['instagram_post', 'linkedin_post', 'twitter_post', 'carousel', 'reel_script', 'email_draft', 'other'],
            description: 'What kind of content this is.',
          },
          title: { type: 'string', description: 'Short title (e.g. "Product launch IG post")' },
          content: { type: 'string', description: 'The full content — caption, slides, script, or email body. For carousels, separate each slide with ---. For reel scripts, write the spoken script line by line.' },
          image_prompt: { type: 'string', description: 'Optional. If the post needs an image, describe what to generate.' },
        },
        required: ['content_type', 'title', 'content'],
      },
    },

    // ─── PHASE 2: Lookup tools — server-side, fast, read-only ───
    // Each runs in the WS handler with a 4s timeout and returns
    // { ok: true, ... } on success or { ok: false, reason } on failure.
    // The voice prompt teaches the bot to handle ok:false gracefully.
    {
      type: 'function',
      name: 'get_dashboard_stats',
      description: 'Quick high-level snapshot: total revenue, number of sales, contacts, sent emails, social posts this month. Use when the user asks "how are things going?", "what are my numbers?", or any general overview question.',
      parameters: { type: 'object', properties: {} },
    },
    {
      type: 'function',
      name: 'get_sales_summary',
      description: 'Aggregated sales: total revenue, deal count, average deal size, growth vs previous period. Use for "how\'s revenue?", "what are sales like this week?", etc.',
      parameters: {
        type: 'object',
        properties: {
          period: {
            type: 'string',
            description: 'Time window: today, week, month, quarter, year, all. Defaults to month.',
            enum: ['today', 'week', 'month', 'quarter', 'year', 'all'],
          },
        },
      },
    },
    {
      type: 'function',
      name: 'get_top_outliers',
      description: 'Top viral posts/videos from creators the user is tracking, sorted by views multiplier. Use when the user asks "what\'s working?", "what should I post about?", or "show me viral stuff".',
      parameters: {
        type: 'object',
        properties: {
          platform: { type: 'string', description: 'Filter by platform: youtube, tiktok, instagram, linkedin. Omit for all.' },
          limit: { type: 'number', description: 'How many to return (default 5, max 10).' },
        },
      },
    },
    {
      type: 'function',
      name: 'get_recent_contacts',
      description: 'List of contacts in the CRM. Use when the user asks "who are my contacts?", "find <name>", or "any new leads?".',
      parameters: {
        type: 'object',
        properties: {
          search: { type: 'string', description: 'Filter by name, email, or company (substring match).' },
          limit: { type: 'number', description: 'How many to return (default 10, max 25).' },
        },
      },
    },
    {
      type: 'function',
      name: 'get_recent_emails',
      description: 'Recent emails from the user\'s connected mailbox. Use when the user asks "what\'s in my inbox?", "any new emails?", or "who emailed me?".',
      parameters: {
        type: 'object',
        properties: {
          folder: { type: 'string', description: 'Folder: inbox, sent. Defaults to inbox.', enum: ['inbox', 'sent'] },
          limit: { type: 'number', description: 'How many to return (default 5, max 15).' },
        },
      },
    },
    {
      type: 'function',
      name: 'get_content_calendar',
      description: 'Upcoming and recent scheduled social media posts. Use when the user asks "what\'s scheduled?", "what\'s going out this week?", or "anything coming up?".',
      parameters: {
        type: 'object',
        properties: {
          days: { type: 'number', description: 'Look-ahead window in days (default 14, max 60).' },
        },
      },
    },
    {
      type: 'function',
      name: 'get_form_responses',
      description: 'Summary of recent responses across the user\'s forms. Use when the user asks "any new form responses?", "who signed up?", or about a specific form.',
      parameters: {
        type: 'object',
        properties: {
          formId: { type: 'string', description: 'Specific form ID. Omit for all forms.' },
          limit: { type: 'number', description: 'How many to return per form (default 5, max 20).' },
        },
      },
    },
    {
      type: 'function',
      name: 'get_payment_history',
      description: 'Recent Stripe payments, charges, and active subscriptions. Use when the user asks "any payments?", "show my Stripe", "who paid?", "revenue from Stripe", or about payment/subscription history.',
      parameters: {
        type: 'object',
        properties: {
          limit: { type: 'number', description: 'How many payments to return (default 10, max 20).' },
        },
      },
    },
    {
      type: 'function',
      name: 'get_recent_calls',
      description: 'Recent meeting recordings and call transcripts. Use when the user asks "any meetings?", "what calls did I have?", "show my recordings", or anything about past meetings/calls.',
      parameters: {
        type: 'object',
        properties: {
          limit: { type: 'number', description: 'How many to return (default 5, max 10).' },
        },
      },
    },

    // ─── PHASE 3 — Action tools — server-side, with graceful fallback ───
    {
      type: 'function',
      name: 'schedule_post',
      description: 'Schedule a social media post for a future date/time. Adds it to the Content Calendar so it shows up there. Use when the user says "schedule this for tomorrow at 9am", "queue this for Tuesday", "post this next week". If the user just made a content post via create_content, you already have the content — reuse it.',
      parameters: {
        type: 'object',
        properties: {
          platform: { type: 'string', description: 'Where to publish: instagram, linkedin, facebook, twitter, tiktok, youtube. Ask the user if unclear.' },
          scheduled_at: { type: 'string', description: 'ISO 8601 datetime, e.g. "2026-05-15T09:00:00Z". Convert relative phrases ("tomorrow 9am", "Tuesday at 3pm") to an absolute timestamp before calling. Assume UTC if no timezone is given.' },
          content: { type: 'string', description: 'The post body / caption text.' },
          title: { type: 'string', description: 'Optional short label for the calendar entry. Defaults to the first line of content.' },
        },
        required: ['platform', 'scheduled_at', 'content'],
      },
    },
  ];
}

// ─── PHASE 2+3: Tool registry + dispatch ────────────────────────────
// SERVER_SIDE_TOOLS resolve inside the WS handler — no frontend
// round-trip. Includes:
//   - lookups (get_*) — read-only data fetches
//   - actions (schedule_*, save_*, etc) — small writes with no UI
//     artifact, just a verbal confirmation or fallback hint.
// Generators (generate_*, create_content, edit_artifact, future
// deploy_to_netlify) stay on the frontend dispatch path because they
// need to update the artifact panel.
const LOOKUP_TOOLS = new Set([
  'get_dashboard_stats',
  'get_sales_summary',
  'get_top_outliers',
  'get_recent_contacts',
  'get_recent_emails',
  'get_content_calendar',
  'get_form_responses',
  'get_recent_calls',
  'get_payment_history',
  // Phase 3 actions that also dispatch server-side (no UI artifact).
  'schedule_post',
]);

// Helper for action-tool failures. Shape is the contract the bot
// reads — fallback_hint becomes the verbatim spoken response, so it
// MUST sound human and include the manual AICEO escape path when
// retry won't help.
function actionFail(reason, fallback_hint, { retryable = false } = {}) {
  return { ok: false, reason, retryable, fallback_hint };
}

// Demo-safety wrapper: every tool must return within 4s. On timeout or
// throw, we return a sanitized {ok:false} that the model is prompted
// to handle gracefully ("I can't pull that right now, let me skip
// ahead") rather than speaking a raw error to a live audience.
async function runWithTimeout(name, fn, ms = 4000) {
  let timer;
  try {
    const result = await Promise.race([
      Promise.resolve().then(fn),
      new Promise((_, reject) => {
        timer = setTimeout(() => reject(Object.assign(new Error('timeout'), { code: 'TIMEOUT' })), ms);
      }),
    ]);
    return result;
  } catch (err) {
    console.error(`[stagedemo-tool] ${name} failed:`, err.code || err.message);
    return { ok: false, reason: err.code === 'TIMEOUT' ? 'timeout' : 'lookup_failed' };
  } finally {
    clearTimeout(timer);
  }
}

// Period helpers used by sales aggregations.
function startOfPeriod(period) {
  const now = new Date();
  switch (period) {
    case 'today': return new Date(now.getFullYear(), now.getMonth(), now.getDate());
    case 'week': { const d = new Date(now); d.setDate(d.getDate() - 7); return d; }
    case 'month': return new Date(now.getFullYear(), now.getMonth(), 1);
    case 'quarter': { const q = Math.floor(now.getMonth() / 3) * 3; return new Date(now.getFullYear(), q, 1); }
    case 'year': return new Date(now.getFullYear(), 0, 1);
    case 'all': default: return new Date(0);
  }
}

// ─── Individual lookup implementations ──────────────────────────────
// Each returns a small JSON object the model can speak from. Keep
// responses TIGHT — a verbose tool result tempts a verbose answer.

async function toolGetDashboardStats(userId) {
  const [salesRes, contactsRes, postsRes] = await Promise.all([
    supabase.from('sales').select('amount').eq('user_id', userId),
    supabase.from('contacts').select('id', { count: 'exact', head: true }).eq('user_id', userId),
    supabase.from('social_posts').select('id', { count: 'exact', head: true }).eq('user_id', userId).gte('published_at', startOfPeriod('month').toISOString()),
  ]);
  const sales = salesRes.data || [];
  const revenue = sales.reduce((s, r) => s + (Number(r.amount) || 0), 0);
  return {
    ok: true,
    revenue_total: Math.round(revenue),
    deals_total: sales.length,
    contacts_total: contactsRes.count || 0,
    posts_this_month: postsRes.count || 0,
  };
}

async function toolGetSalesSummary(userId, args) {
  const period = args.period || 'month';
  const start = startOfPeriod(period).toISOString();
  // Pull current and previous window for growth comparison.
  const periodMs = Date.now() - new Date(start).getTime();
  const prevStart = new Date(new Date(start).getTime() - periodMs).toISOString();

  const [currRes, prevRes] = await Promise.all([
    supabase.from('sales').select('amount').eq('user_id', userId).gte('created_at', start),
    supabase.from('sales').select('amount').eq('user_id', userId).gte('created_at', prevStart).lt('created_at', start),
  ]);
  const curr = (currRes.data || []).reduce((s, r) => s + (Number(r.amount) || 0), 0);
  const prev = (prevRes.data || []).reduce((s, r) => s + (Number(r.amount) || 0), 0);
  const growthPct = prev > 0 ? Math.round(((curr - prev) / prev) * 100) : null;
  return {
    ok: true,
    period,
    revenue: Math.round(curr),
    deals: (currRes.data || []).length,
    avg_deal: currRes.data?.length ? Math.round(curr / currRes.data.length) : 0,
    growth_vs_previous_pct: growthPct,
  };
}

async function toolGetTopOutliers(userId, args) {
  const limit = Math.min(Math.max(args.limit || 5, 1), 10);
  let q = supabase
    .from('outlier_videos')
    .select('title, url, platform, views, views_multiplier, outlier_creators!inner(display_name, username)')
    .eq('user_id', userId)
    .eq('is_outlier', true)
    .order('views_multiplier', { ascending: false })
    .limit(limit);
  if (args.platform) q = q.eq('platform', args.platform);
  const { data } = await q;
  return {
    ok: true,
    count: data?.length || 0,
    items: (data || []).map((v) => ({
      title: v.title,
      creator: v.outlier_creators?.display_name || v.outlier_creators?.username,
      platform: v.platform,
      views: v.views,
      multiplier: v.views_multiplier ? `${v.views_multiplier.toFixed(1)}x` : null,
    })),
  };
}

async function toolGetRecentContacts(userId, args) {
  const limit = Math.min(Math.max(args.limit || 10, 1), 25);
  let q = supabase
    .from('contacts')
    .select('first_name, last_name, email, company, created_at')
    .eq('user_id', userId)
    .order('created_at', { ascending: false })
    .limit(limit);
  if (args.search) {
    const term = `%${args.search}%`;
    q = q.or(`first_name.ilike.${term},last_name.ilike.${term},email.ilike.${term},company.ilike.${term}`);
  }
  const { data } = await q;
  return {
    ok: true,
    count: data?.length || 0,
    contacts: (data || []).map((c) => ({
      name: `${c.first_name || ''} ${c.last_name || ''}`.trim() || c.email,
      email: c.email,
      company: c.company,
    })),
  };
}

async function toolGetRecentEmails(userId, args) {
  const folder = args.folder || 'inbox';
  const limit = Math.min(Math.max(args.limit || 5, 1), 15);
  // NOTE: emails table has body_text, NOT snippet. Earlier version
  // selected a 'snippet' column that doesn't exist — PostgREST 4xx'd
  // the request silently, our caller saw data:null, and the bot said
  // "no emails" even though the inbox was full.
  const { data, error } = await supabase
    .from('emails')
    .select('subject, from_email, from_name, date, body_text')
    .eq('user_id', userId)
    .eq('folder', folder)
    .order('date', { ascending: false })
    .limit(limit);
  if (error) {
    console.error('[stagedemo-tool] get_recent_emails:', error.message);
    return { ok: false, reason: 'lookup_failed' };
  }
  return {
    ok: true,
    folder,
    count: data?.length || 0,
    emails: (data || []).map((e) => ({
      subject: e.subject,
      from: e.from_name || e.from_email,
      preview: (e.body_text || '').replace(/\s+/g, ' ').trim().slice(0, 120),
      received: e.date,
    })),
  };
}

async function toolGetContentCalendar(userId, args) {
  const days = Math.min(Math.max(args.days || 14, 1), 60);
  const start = new Date();
  const end = new Date(start.getTime() + days * 24 * 3600 * 1000);
  const { data } = await supabase
    .from('social_posts')
    .select('platform, scheduled_at, published_at, status, title')
    .eq('user_id', userId)
    .or(`scheduled_at.gte.${start.toISOString()},published_at.gte.${start.toISOString()}`)
    .lte('scheduled_at', end.toISOString())
    .order('scheduled_at', { ascending: true })
    .limit(25);
  return {
    ok: true,
    window_days: days,
    count: data?.length || 0,
    posts: (data || []).map((p) => ({
      platform: p.platform,
      when: p.scheduled_at || p.published_at,
      status: p.status,
      title: p.title,
    })),
  };
}

async function toolGetFormResponses(userId, args) {
  const limit = Math.min(Math.max(args.limit || 5, 1), 20);
  let formsQuery = supabase
    .from('forms')
    .select('id, title')
    .eq('user_id', userId);
  if (args.formId) formsQuery = formsQuery.eq('id', args.formId);
  const { data: forms } = await formsQuery.limit(10);
  if (!forms?.length) return { ok: true, count: 0, forms: [] };

  const results = await Promise.all(
    forms.map(async (f) => {
      const { data: responses, count } = await supabase
        .from('form_responses')
        .select('created_at', { count: 'exact' })
        .eq('form_id', f.id)
        .order('created_at', { ascending: false })
        .limit(limit);
      return {
        form_id: f.id,
        title: f.title,
        total_responses: count || 0,
        latest_at: responses?.[0]?.created_at || null,
      };
    })
  );
  return { ok: true, count: results.length, forms: results };
}

async function toolGetPaymentHistory(userId, args) {
  const limit = Math.min(args?.limit || 10, 20);
  const { data: payments } = await supabase
    .from('integration_data')
    .select('title, content, metadata, synced_at')
    .eq('user_id', userId)
    .eq('provider', 'stripe')
    .eq('data_type', 'payment')
    .order('synced_at', { ascending: false })
    .limit(limit);

  const { data: subs } = await supabase
    .from('integration_data')
    .select('title, metadata, synced_at')
    .eq('user_id', userId)
    .eq('provider', 'stripe')
    .eq('data_type', 'subscription')
    .limit(10);

  if (!payments?.length && !subs?.length) return { ok: true, payments: [], subscriptions: [], message: 'No Stripe data found. Make sure Stripe is connected in Settings > Integrations.' };

  return {
    ok: true,
    payments: (payments || []).map(p => ({
      title: p.title,
      amount: p.metadata?.amount ? (p.metadata.amount / 100).toFixed(2) : null,
      currency: p.metadata?.currency?.toUpperCase() || 'USD',
      status: p.metadata?.status,
      email: p.metadata?.receipt_email,
      date: p.metadata?.created ? new Date(p.metadata.created * 1000).toISOString() : p.synced_at,
    })),
    active_subscriptions: (subs || []).map(s => s.title),
  };
}

async function toolGetRecentCalls(userId, args) {
  const limit = Math.min(args?.limit || 5, 10);
  const { data: calls } = await supabase
    .from('sales_calls')
    .select('id, title, participants, duration, created_at, summary, action_items')
    .eq('user_id', userId)
    .order('created_at', { ascending: false })
    .limit(limit);
  if (!calls?.length) return { ok: true, count: 0, calls: [] };
  return {
    ok: true,
    count: calls.length,
    calls: calls.map(c => ({
      id: c.id,
      title: c.title,
      participants: c.participants,
      duration_min: c.duration ? Math.round(c.duration / 60) : null,
      date: c.created_at,
      summary: c.summary?.slice(0, 200) || null,
      action_items: c.action_items?.slice(0, 3) || [],
    })),
  };
}

// ─── PHASE 3 — Action tool implementations ──────────────────────────

async function toolSchedulePost(userId, args) {
  if (!args?.platform) return actionFail('missing_platform', "I need to know where to post it — Instagram, LinkedIn, somewhere else?");
  if (!args?.scheduled_at) return actionFail('missing_time', "I need a date and time to schedule it for. When do you want it to go out?");
  if (!args?.content) return actionFail('missing_content', "I don't have the post text. Tell me what to schedule.");

  const when = new Date(args.scheduled_at);
  if (isNaN(when.getTime())) {
    return actionFail('invalid_date', "I couldn't make sense of that date. Try giving me a specific day and time.");
  }
  if (when.getTime() < Date.now() - 60_000) {
    return actionFail('past_date', "That's in the past. Pick a future date and I'll queue it up.");
  }

  const title = (args.title || args.content.split('\n')[0] || '').slice(0, 80);
  const platform = String(args.platform).toLowerCase().trim();

  const { error } = await supabase.from('social_posts').insert({
    user_id: userId,
    platform,
    title,
    caption: args.content,
    scheduled_at: when.toISOString(),
    status: 'scheduled',
  });

  if (error) {
    console.error('[stagedemo-tool] schedule_post insert failed:', error.message);
    return actionFail(
      'db_failed',
      "Couldn't save that to the calendar right now. You can add it manually in Content → Content Calendar — just click '+ New post', paste the text, and pick the time.",
      { retryable: true },
    );
  }
  return {
    ok: true,
    platform,
    scheduled_at: when.toISOString(),
    summary: `${platform} post scheduled for ${when.toLocaleString('en-US', { dateStyle: 'medium', timeStyle: 'short' })}.`,
  };
}

// Dispatch — invoked from the WS handler when OpenAI calls a lookup tool.
async function executeLookupTool(name, args, userId) {
  return runWithTimeout(name, async () => {
    switch (name) {
      case 'get_dashboard_stats': return toolGetDashboardStats(userId);
      case 'get_sales_summary': return toolGetSalesSummary(userId, args);
      case 'get_top_outliers': return toolGetTopOutliers(userId, args);
      case 'get_recent_contacts': return toolGetRecentContacts(userId, args);
      case 'get_recent_emails': return toolGetRecentEmails(userId, args);
      case 'get_content_calendar': return toolGetContentCalendar(userId, args);
      case 'get_form_responses': return toolGetFormResponses(userId, args);
      case 'get_recent_calls': return toolGetRecentCalls(userId, args);
      case 'get_payment_history': return toolGetPaymentHistory(userId, args);
      case 'schedule_post': return toolSchedulePost(userId, args);
      default: return { ok: false, reason: 'unknown_tool' };
    }
  });
}

// ─── Endpoint 1: Create ephemeral session ───
router.post('/api/stagedemo/session', async (req, res) => {
  const userId = req.user?.id;
  if (!userId || userId === 'anonymous') {
    return res.status(401).json({ error: 'auth_required' });
  }

  try {
    // Load all user context (brand, soul, products, contacts, etc.)
    const context = await loadUserContext(userId);
    const systemPrompt = buildVoiceSystemPrompt(context);
    const tools = buildRealtimeTools();

    // Create ephemeral session with OpenAI
    const response = await fetch('https://api.openai.com/v1/realtime/sessions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${process.env.OPENAI_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'gpt-4o-realtime-preview-2025-06-03',
        voice: 'ash',
        modalities: ['audio', 'text'],
        instructions: systemPrompt,
        turn_detection: null, // push-to-talk — no VAD
        tools,
        input_audio_format: 'pcm16',
        output_audio_format: 'pcm16',
      }),
    });

    if (!response.ok) {
      const err = await response.text();
      console.error('[stagedemo] OpenAI session creation failed:', err);
      return res.status(502).json({ error: 'openai_session_failed', detail: err });
    }

    const session = await response.json();
    res.json({
      ephemeralKey: session.client_secret.value,
      expiresAt: session.client_secret.expires_at,
    });
  } catch (err) {
    console.error('[stagedemo] session error:', err);
    res.status(500).json({ error: 'session_creation_failed' });
  }
});

// ─── Endpoint 2: Generate artifact via existing agent ───
router.post('/api/stagedemo/generate', async (req, res) => {
  const userId = req.user?.id;
  if (!userId || userId === 'anonymous') {
    return res.status(401).json({ error: 'auth_required' });
  }

  const { tool, args, currentHtml } = req.body;
  if (!tool || !args) {
    return res.status(400).json({ error: 'missing_tool_or_args' });
  }

  try {
    const context = await loadUserContext(userId);

    // Handle edit_artifact separately
    if (tool === 'edit_artifact') {
      if (!currentHtml) {
        return res.status(400).json({ error: 'no_current_html_for_edit' });
      }
      // Use the orchestrate edit flow — call Anthropic with the edit instruction
      const editPrompt = `You are an expert HTML editor. The user wants to edit this HTML artifact.

CURRENT HTML:
${currentHtml}

USER'S EDIT REQUEST: ${args.instruction}

Respond with ONLY the complete updated HTML. No explanation, no markdown fences. Just the raw HTML.`;

      const editRes = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: {
          'x-api-key': process.env.ANTHROPIC_API_KEY,
          'anthropic-version': '2023-06-01',
          'content-type': 'application/json',
        },
        body: JSON.stringify({
          model: 'claude-sonnet-4-20250514',
          max_tokens: 16000,
          messages: [{ role: 'user', content: editPrompt }],
        }),
      });

      if (!editRes.ok) {
        const errText = await editRes.text();
        console.error('[stagedemo] Anthropic edit failed:', errText);
        return res.status(502).json({ error: 'edit_failed' });
      }
      const editData = await editRes.json();
      const editedHtml = editData.content?.[0]?.text || currentHtml;
      return res.json({ html: editedHtml, agent: 'edit', title: 'Edited artifact' });
    }

    // ─── Phase 3 — Image generation ──────────────────────────────
    // Server-to-server proxy to /api/generate/image (Gemini). Returns
    // base64 image data; we wrap it in a minimal HTML page so the
    // existing ArtifactPanel html_template renderer can show it
    // without any new artifact type or frontend changes. The original
    // endpoint already enforces credits + brand context; we just pass
    // the user's JWT through.
    if (tool === 'generate_image') {
      if (!args.prompt) return res.status(400).json({ error: 'prompt_required' });
      const aspectToPlatform = {
        square: 'instagram',
        portrait: 'linkedin_carousel',
        landscape: 'youtube',
        story: 'instagram_story',
      };
      const platform = aspectToPlatform[args.aspect] || 'instagram';
      const authHeader = req.headers.authorization || '';
      const internalPort = process.env.PORT || 3001;

      let imgRes;
      try {
        imgRes = await fetch(`http://127.0.0.1:${internalPort}/api/generate/image`, {
          method: 'POST',
          headers: { 'Authorization': authHeader, 'Content-Type': 'application/json' },
          body: JSON.stringify({ prompt: args.prompt, platform }),
        });
      } catch (err) {
        console.error('[stagedemo] image gen request threw:', err.message);
        return res.status(502).json({ error: 'image_failed', detail: 'internal_fetch_failed' });
      }

      if (!imgRes.ok) {
        const errText = await imgRes.text().catch(() => '');
        console.error('[stagedemo] image gen failed:', imgRes.status, errText.slice(0, 300));
        return res.status(imgRes.status).json({ error: 'image_failed', detail: errText.slice(0, 200) });
      }
      const imgData = await imgRes.json();
      if (!imgData?.image?.data) {
        return res.status(502).json({ error: 'image_failed', detail: 'no_image_data' });
      }

      // Embed as data URL — keeps the pipeline single-hop and avoids a
      // round-trip to Supabase storage. ~500KB-1.5MB base64 for 1K
      // images; the artifact panel renders fine.
      const mime = imgData.image.mimeType || 'image/png';
      const dataUrl = `data:${mime};base64,${imgData.image.data}`;
      const title = args.prompt.split(/\s+/).slice(0, 4).join(' ');
      const html = `<!DOCTYPE html>
<html><head><meta charset="utf-8"/><style>
  html,body{margin:0;height:100%;background:#0a0a0a;color:#eee;font-family:system-ui,-apple-system,sans-serif}
  .wrap{min-height:100vh;display:flex;flex-direction:column;align-items:center;justify-content:center;padding:24px;box-sizing:border-box;gap:14px}
  img{max-width:100%;max-height:80vh;object-fit:contain;display:block;border-radius:10px;box-shadow:0 20px 60px rgba(0,0,0,0.5)}
  .caption{opacity:0.5;font-size:13px;text-align:center;max-width:560px;line-height:1.45}
</style></head><body>
  <div class="wrap">
    <img src="${dataUrl}" alt=""/>
    <div class="caption">${args.prompt.replace(/[<>&"]/g, (c) => ({'<':'&lt;','>':'&gt;','&':'&amp;','"':'&quot;'}[c]))}</div>
  </div>
</body></html>`;
      return res.json({ html, agent: 'image', title });
    }

    // Map tool name to agent name
    const agentMap = {
      generate_newsletter: 'newsletter',
      generate_landing_page: 'landing-page',
      generate_squeeze_page: 'squeeze-page',
      generate_story_sequence: 'story-sequence',
      generate_lead_magnet: 'lead-magnet',
      generate_dm_automation: 'dm-automation',
    };

    const agentName = agentMap[tool];
    if (!agentName) {
      return res.status(400).json({ error: `unknown_tool: ${tool}` });
    }

    const agent = getAgent(agentName);
    if (!agent) {
      return res.status(400).json({ error: `agent_not_found: ${agentName}` });
    }

    // Build system prompt with brand context (same as orchestrate.js delegation)
    const systemPrompt = agent.buildSystemPrompt(context.brandDna);

    // Build task description from args (simulate what the CEO would pass)
    const taskParts = Object.entries(args).map(([k, v]) => `${k}: ${v}`);
    const taskDescription = `Create this asset with the following details:\n${taskParts.join('\n')}\n\nThe CEO already asked the discovery questions. Skip questions and generate immediately.`;

    // Build products context if available
    let productsCtx = '';
    if (context.products?.length > 0) {
      productsCtx = '\n\n── PRODUCTS ──\n' + context.products.map(p =>
        `- ${p.name}${p.price ? ` ($${p.price})` : ''}${p.description ? `: ${p.description}` : ''}`
      ).join('\n');
    }

    const fullSystemPrompt = systemPrompt + productsCtx;
    const messages = [{ role: 'user', content: taskDescription }];

    // Execute agent (non-streaming — collect full output)
    const result = await executeAgent({
      agent: { ...agent, systemPrompt: fullSystemPrompt },
      messages,
      onChunk: () => {},
    });
    const finalContent = result?.content || '';

    // Parse agent output — agents return JSON with { type, html, summary, frames }
    let html = finalContent;
    let title = agentName;
    let frames = [];
    try {
      const parsed = JSON.parse(finalContent);
      console.log('[stagedemo] Agent response type:', parsed.type, 'keys:', Object.keys(parsed));
      if (parsed.html) html = parsed.html;
      if (parsed.summary) title = parsed.summary;
      if (parsed.frames) frames = parsed.frames;
      // If agent returned a question instead of content, pass it through
      if (parsed.type === 'question') {
        return res.json({ html: null, agent: agentName, title: parsed.text || 'Question', frames: [], question: parsed });
      }
    } catch {
      console.log('[stagedemo] Agent returned non-JSON, length:', finalContent.length);
    }

    console.log('[stagedemo] Returning:', { agent: agentName, title, htmlLen: html?.length, framesCount: frames.length });
    res.json({ html, agent: agentName, title, frames });
  } catch (err) {
    console.error('[stagedemo] generate error:', err);
    res.status(500).json({ error: 'generation_failed', detail: err.message });
  }
});

// ─── WebSocket proxy: browser → our server → OpenAI Realtime ───
const wss = new WebSocketServer({ noServer: true });

async function verifyToken(token) {
  if (!token || !JWKS) return null;
  try {
    const { payload } = await jwtVerify(token, JWKS, { issuer: `${SUPABASE_URL}/auth/v1` });
    return payload.sub || null;
  } catch { return null; }
}

export function handleStagedemoUpgrade(req, socket, head) {
  // Extract token from query string
  const url = new URL(req.url, `http://${req.headers.host}`);
  const token = url.searchParams.get('token');

  verifyToken(token).then((userId) => {
    if (!userId) {
      socket.write('HTTP/1.1 401 Unauthorized\r\n\r\n');
      socket.destroy();
      return;
    }

    wss.handleUpgrade(req, socket, head, (clientWs) => {
      wss.emit('connection', clientWs, req, userId);
    });
  });
}

wss.on('connection', async (clientWs, req, userId) => {
  console.log('[stagedemo-ws] Client connected, userId:', userId);

  try {
    // Load context and build session config
    const context = await loadUserContext(userId);
    const systemPrompt = buildVoiceSystemPrompt(context);
    const tools = buildRealtimeTools();

    // Connect directly to OpenAI Realtime with API key (server-to-server, no ephemeral token needed)
    const openaiWs = new WsWebSocket(
      'wss://api.openai.com/v1/realtime?model=gpt-realtime-2',
      {
        headers: {
          'Authorization': `Bearer ${process.env.OPENAI_API_KEY}`,
        },
      }
    );

    openaiWs.on('open', () => {
      console.log('[stagedemo-ws] Connected to OpenAI Realtime');

      // Configure session via session.update event (GA API schema)
      openaiWs.send(JSON.stringify({
        type: 'session.update',
        session: {
          type: 'realtime',
          model: 'gpt-realtime-2',
          output_modalities: ['audio'],
          instructions: systemPrompt,
          audio: {
            input: {
              format: { type: 'audio/pcm', rate: 24000 },
              turn_detection: { type: 'semantic_vad' },
            },
            output: {
              format: { type: 'audio/pcm', rate: 24000 },
              voice: 'verse',
            },
          },
          reasoning: { effort: 'medium' },
          tools,
          tool_choice: 'auto',
        },
      }));

      clientWs.send(JSON.stringify({ type: 'session.created' }));
    });

    // Proxy: OpenAI → Client (with server-side interception for lookup tools)
    openaiWs.on('message', async (data) => {
      const str = data.toString();
      let evt = null;
      try { evt = JSON.parse(str); } catch { /* binary frame, just forward */ }

      if (evt) {
        if (evt.type === 'error' || evt.type === 'session.updated' || evt.type === 'session.created') {
          console.log('[stagedemo-ws] OpenAI event:', evt.type, JSON.stringify(evt).slice(0, 500));
        }

        // ─── Server-side lookup tool dispatch ───
        // Generators / edit_artifact still bounce through the frontend
        // because they update the artifact panel. Lookups (sales,
        // outliers, contacts, emails, calendar, forms, dashboard) run
        // here for low-latency round-trip and so the frontend never
        // sees them (no UI surface to update).
        if (evt.type === 'response.function_call_arguments.done' && LOOKUP_TOOLS.has(evt.name)) {
          let parsedArgs = {};
          try { parsedArgs = JSON.parse(evt.arguments || '{}'); } catch { /* fall through with empty args */ }
          console.log(`[stagedemo-ws] Lookup tool: ${evt.name}`, parsedArgs);
          const result = await executeLookupTool(evt.name, parsedArgs, userId);

          if (openaiWs.readyState === WsWebSocket.OPEN) {
            openaiWs.send(JSON.stringify({
              type: 'conversation.item.create',
              item: {
                type: 'function_call_output',
                call_id: evt.call_id,
                output: JSON.stringify(result),
              },
            }));
            openaiWs.send(JSON.stringify({ type: 'response.create' }));
          }
          // Don't forward this tool call event to the client — no UI
          // surface and we don't want the frontend's onToolCall handler
          // to attempt /api/stagedemo/generate for a lookup.
          return;
        }
      }

      if (clientWs.readyState === WsWebSocket.OPEN) {
        clientWs.send(str);
      }
    });

    // Proxy: Client → OpenAI
    clientWs.on('message', (data) => {
      if (openaiWs.readyState === WsWebSocket.OPEN) {
        openaiWs.send(data.toString());
      }
    });

    // Cleanup
    openaiWs.on('close', (code, reason) => {
      console.log('[stagedemo-ws] OpenAI closed:', code, reason?.toString());
      if (clientWs.readyState === WsWebSocket.OPEN) clientWs.close(1000, 'OpenAI disconnected');
    });

    openaiWs.on('error', (err) => {
      console.error('[stagedemo-ws] OpenAI error:', err.message);
      if (clientWs.readyState === WsWebSocket.OPEN) clientWs.close(1011, 'OpenAI error');
    });

    clientWs.on('close', () => {
      console.log('[stagedemo-ws] Client disconnected');
      if (openaiWs.readyState === WsWebSocket.OPEN) openaiWs.close();
    });

    clientWs.on('error', (err) => {
      console.error('[stagedemo-ws] Client error:', err.message);
      if (openaiWs.readyState === WsWebSocket.OPEN) openaiWs.close();
    });

  } catch (err) {
    console.error('[stagedemo-ws] Setup error:', err);
    clientWs.close(1011, 'Setup failed');
  }
});

export default router;
