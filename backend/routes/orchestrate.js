import { Router } from 'express';
import { getAgent, buildAgentTools } from '../agents/registry.js';
import { executeAgent, executeCeoOrchestrator, executeAnthropicWithTools } from '../agents/base-agent.js';
import { loadUserContext, saveSoulNote } from '../services/context.js';
import { supabase } from '../services/storage.js';
import { saveFile, getFile, updateFile } from '../services/file-store.js';
import { buildBrandContext } from '../agents/brand-context.js';
import { sendEmailViaEdgeFunction, getUserEmailAccount } from '../services/email-sender.js';
import { extractFromUrl } from '../services/social.js';

const router = Router();

// Social URL pattern  -  same as frontend Content.jsx
const SOCIAL_URL_RE = /https?:\/\/(www\.)?(instagram\.com|facebook\.com|fb\.watch|linkedin\.com|youtube\.com|youtu\.be|x\.com|twitter\.com|tiktok\.com)\/\S+/gi;

// Global output rules injected into EVERY agent and CEO prompt
const GLOBAL_OUTPUT_RULES = `

=== GLOBAL OUTPUT RULES (NON-NEGOTIABLE) ===
1. NEVER use em dashes (the long dash character). Use commas, periods, or start a new sentence instead.
2. NEVER use hashtags (#anything) in any output. No #Entrepreneurship, no #FounderLife, no #GrowthMindset. Hashtags are banned unless the user explicitly asks for them.
3. NEVER use filler phrases like "Great question!", "Absolutely!", "I'd be happy to help!", or any generic AI slop.
These rules override everything else. Every piece of content you produce must follow them.
`;

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
5. For simple stuff (emails, posts, docs, code, reel scripts) just create_artifact directly.
8. REELS / VIDEO SCRIPTS (THIS OVERRIDES EVERYTHING ABOVE): When the user asks to "make a reel", "create a reel", "write a reel script", "make a TikTok", "make a Short", or ANYTHING about short-form video content  -  you MUST use create_artifact IMMEDIATELY to write a VIDEO SCRIPT. Do NOT ask questions first. Do NOT use ask_user. Do NOT delegate to any agent. Do NOT generate images. Reels are NOT carousels, NOT stories, NOT slides. Just write the script directly. Structure: [HOOK] (first 1-3 seconds, stop the scroll), [BRIDGE] (transition that pulls them in), [SCENE 1] and optionally [SCENE 2] (max 2 scenes, keep it tight), [CTA] only if needed. Each section gets [VISUAL] + [VOICEOVER] or [ON-SCREEN TEXT]. Suggest a trending audio direction. Keep it punchy and direct.
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

send_email: Send an email from the user's connected account. Works for newsletters and plain text. NEVER use this to "check" emails  -  only for outbound sends.

check_emails: Read the user's inbox (or sent/drafts). Use whenever they ask about their emails. Always call this directly, never ask them questions first.

generate_image: Create social graphics, thumbnails, cover images.

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
  const allPossibleIntegrations = ['fireflies', 'fathom', 'stripe', 'whop', 'shopify', 'kajabi', 'gohighlevel', 'netlify'];
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
- If they mention calls but Fireflies/Fathom isn't connected, suggest it.
- If they have social content but no outlier tracking, suggest adding creators to track.
- Use push_notification for important observations they should see even outside this conversation.\n`;

  prompt += '\n';

  const { brandDna, contentItems, salesData, products, contacts, outlierData, integrationCtx } = context;

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
      prompt += `=== RECENT SALES CALLS (${salesData.calls.length}) ===\n`;
      salesData.calls.slice(0, 10).forEach(call => {
        prompt += `- ${call.contact_name || call.title || 'Call'} (${call.date || call.created_at?.slice(0, 10) || ''})\n`;
      });
      prompt += '\n';
    }
  }

  if (products?.length) {
    prompt += `=== PRODUCTS (${products.length}) ===\n`;
    products.forEach(p => {
      prompt += `- ${p.name}: $${p.price || 0}`;
      if (p.description) prompt += `  -  ${p.description.slice(0, 200)}`;
      prompt += '\n';
    });
    prompt += '\n';
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

  return prompt + GLOBAL_OUTPUT_RULES;
}

// ── SSE Helper ──
function sendSSE(res, event) {
  try {
    res.write(`data: ${JSON.stringify(event)}\n\n`);
  } catch {}
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
7. Preserve all existing styles, classes, and structure unless the user asks to change them.`;

  if (brandDna) {
    prompt += '\n\n' + buildBrandContext(brandDna);
  }

  return prompt;
}

// ── POST /api/orchestrate ──
// mode: "ceo" or "direct" (direct handles both generation and editing)
router.post('/api/orchestrate', async (req, res) => {
  const userId = req.user?.id;
  const { messages, mode = 'ceo', agent: agentName, searchMode = false, currentHtml, editInstruction, currentAgent } = req.body;

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

  try {
    console.log(`[orchestrate] mode=${mode} agent=${agentName} userId=${userId} hasEdit=${!!editInstruction} hasHtml=${!!currentHtml} msgCount=${messages?.length}`);
    const context = await loadUserContext(userId);
    console.log(`[orchestrate] Context loaded, brandDna=${!!context.brandDna}`);

    if (mode === 'direct') {
      await handleDirectAgent({ res, agentName, messages, context, searchMode, userId, currentHtml, editInstruction });
    } else if (mode === 'ceo' && currentHtml && currentAgent) {
      // User is editing an existing artifact  -  try surgical file-based edit first
      const lastUserMsg = messages.filter(m => m.role === 'user').pop()?.content || '';
      const agent = getAgent(currentAgent);
      if (agent && lastUserMsg) {
        console.log(`[orchestrate] CEO edit shortcut: trying file-based edit for ${currentAgent}`);
        sendSSE(res, { type: 'status', text: 'Editing...' });
        try {
          const edited = await tryFileBasedEdit({
            res, agent, agentName: currentAgent,
            editInstruction: lastUserMsg,
            userId, context, currentHtml,
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
      await handleCeoOrchestration({ res, messages, context, searchMode, userId, currentHtml, currentAgent });
    } else {
      await handleCeoOrchestration({ res, messages, context, searchMode, userId, currentHtml, currentAgent });
    }
    console.log('[orchestrate] Handler completed successfully');
  } catch (err) {
    console.error('[orchestrate] Error:', err.message, err.stack);
    sendSSE(res, { type: 'error', error: err.message });
  } finally {
    clearInterval(heartbeat);
    sendSSE(res, { type: 'done' });
    res.write('data: [DONE]\n\n');
    res.end();
  }
});

// ── Direct Agent Execution ──
// Handles both generation (no currentHtml) and editing (currentHtml + editInstruction)
async function handleDirectAgent({ res, agentName, messages, context, searchMode, userId, currentHtml, editInstruction }) {
  const agent = getAgent(agentName);
  if (!agent) {
    sendSSE(res, { type: 'error', error: `Unknown agent: ${agentName}` });
    return;
  }

  // If we have currentHtml + editInstruction, try file-based editing first
  if (currentHtml && editInstruction) {
    console.log(`[orchestrate] Attempting file-based edit for ${agentName}`);
    try {
      const edited = await tryFileBasedEdit({ res, agent, agentName, editInstruction, userId, context, currentHtml });
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

  const systemPrompt = agent.buildSystemPrompt(context.brandDna) + GLOBAL_OUTPUT_RULES;

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

  // After generation, save to file store for future edits
  if (userId && finalContent) {
    try {
      const parsed = tryParseJSON(finalContent);
      if (parsed) {
        const html = parsed.html || null;
        if (html) {
          saveFile(userId, agentName, html);
        }
      }
    } catch {
      // Not critical
    }
  }
}

// ── File-Based Edit (Claude Code style) ──
// Returns true if edit succeeded, false/throws if should fall back
async function tryFileBasedEdit({ res, agent, agentName, editInstruction, userId, context, currentHtml }) {
  // Always prefer currentHtml from frontend (most up-to-date, includes cover images etc.)
  let fileHtml = currentHtml || getFile(userId, agentName);
  if (!fileHtml) return false;
  saveFile(userId, agentName, fileHtml);

  sendSSE(res, { type: 'status', text: 'Editing...' });

  const systemPrompt = buildEditSystemPrompt(context.brandDna);

  const editMessages = [
    {
      role: 'user',
      content: `Here is the current HTML file:\n\n${fileHtml}\n\nEdit request: ${editInstruction}`,
    },
  ];

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
      sendSSE(res, { type: 'edit_summary', text, editCount });
    },
  });

  if (editCount === 0) {
    // Claude didn't make any edits  -  fall back to regular agent
    throw new Error('No edits were applied');
  }

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
async function handleCeoOrchestration({ res, messages, context, searchMode, userId, currentHtml, currentAgent }) {
  const systemPrompt = buildCeoSystemPrompt(context);
  const tools = buildAgentTools();

  // Auto-extract video/social URLs from the user's message before the model sees it
  const enrichedMessages = await enrichMessagesWithVideoContext(messages, userId, res);

  sendSSE(res, { type: 'status', text: 'Thinking...' });

  const result = await executeCeoOrchestrator({
    systemPrompt,
    messages: enrichedMessages,
    tools,
    searchMode,
    onChunk: (content) => {
      sendSSE(res, { type: 'text_delta', content });
    },
    onSearchStatus: (status) => {
      sendSSE(res, { type: 'search_status', status });
    },
    onToolCalls: async (toolCalls) => {
      for (const call of toolCalls) {
        if (call.name === 'delegate_to_agent') {
          await handleAgentDelegation({ res, call, context, userId, currentHtml, currentAgent });
        } else if (call.name === 'ask_user') {
          let args;
          try { args = JSON.parse(call.arguments); } catch { args = {}; }
          if (args.question && args.options) {
            sendSSE(res, { type: 'ask_user', question: args.question, options: args.options });
          }
        } else if (call.name === 'save_to_soul') {
          await handleSaveSoul({ res, call, userId });
        } else if (call.name === 'push_notification') {
          await handlePushNotification({ res, call, userId });
        } else if (call.name === 'send_email') {
          await handleSendEmail({ res, call, userId });
        } else if (call.name === 'check_emails') {
          await handleCheckEmails({ res, call, userId });
        } else if (call.name === 'create_artifact' || call.name === 'generate_image') {
          let args;
          try { args = JSON.parse(call.arguments); } catch { args = {}; }
          sendSSE(res, { type: 'tool_call', name: call.name, arguments: args });
        }
      }
    },
  });
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

// ── Agent Delegation (CEO calls a specialist agent) ──
async function handleAgentDelegation({ res, call, context, userId, currentHtml, currentAgent }) {
  let args;
  try { args = JSON.parse(call.arguments); } catch { args = {}; }

  const agentName = args.agent_name;
  const taskDescription = args.task_description;

  const agent = getAgent(agentName);
  if (!agent) {
    sendSSE(res, { type: 'error', error: `Unknown agent: ${agentName}` });
    return;
  }

  sendSSE(res, { type: 'status', text: `Delegating to ${agent.name} agent...` });
  sendSSE(res, { type: 'agent_start', agent: agent.name });

  // If we have existing HTML and the delegation is to the same agent type, try file-based editing
  const isEditMode = currentHtml && currentAgent && (agentName === currentAgent);
  if (isEditMode && userId) {
    console.log(`[orchestrate] CEO edit mode: trying file-based edit for ${agentName}`);
    try {
      const edited = await tryFileBasedEdit({
        res,
        agent,
        agentName,
        editInstruction: taskDescription,
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

  const systemPrompt = agent.buildSystemPrompt(context.brandDna) + GLOBAL_OUTPUT_RULES;

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

  // Save to file store for future edits
  if (userId && result.content) {
    try {
      const parsed = tryParseJSON(result.content);
      if (parsed?.html) {
        saveFile(userId, agentName, parsed.html);
      }
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

export default router;
