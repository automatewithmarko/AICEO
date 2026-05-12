// backend/routes/stagedemo.js
import { Router } from 'express';
import { loadUserContext } from '../services/context.js';
import { getAgent } from '../agents/registry.js';

import { executeAgent } from '../agents/base-agent.js';

const router = Router();

// ─── Voice-adapted CEO persona for OpenAI Realtime ───
function buildVoiceSystemPrompt(context) {
  const { brandDna, soulNotes, products, contacts } = context;

  let prompt = `You are the user's AI CEO — their business partner. You know their brand, products, audience, and numbers. You speak naturally, like a sharp friend who runs businesses.

VOICE RULES:
- Keep responses SHORT. 2-3 sentences max per turn. You're in a real-time conversation, not writing an essay.
- Be direct and opinionated. "Do this" not "you might consider."
- No corporate speak, no filler ("Great question!", "Absolutely!").
- No em dashes. Use commas, periods, or new sentences.
- Reference their actual data when relevant.
- Sound human. Casual but sharp.

WORKFLOW — MARKETING ASSETS:
When the user wants to create a newsletter, landing page, squeeze page, story sequence, lead magnet, or DM automation:
1. Ask exactly 4 discovery questions, ONE AT A TIME. Wait for each answer.
2. Question 1: Topic — offer options based on their actual products/services
3. Question 2: Audience — offer segments based on their actual customers
4. Question 3: Tone — e.g. "Authority style", "Witty Morning Brew style", "Wisdom James Clear style"
5. Question 4: CTA — offer options relevant to their actual offers/links
6. After all 4 answers, call the matching generate tool.
7. Say something like "Building that now, give me a moment" while it generates.
8. When you get the result, say "Done! Take a look at what I built" or similar.

NEVER fabricate product names, features, or services. If unsure, keep options generic.

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
  ];
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
        model: 'gpt-4o-realtime-preview',
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

    // Parse agent output — agents return JSON with { type, html, summary }
    let html = finalContent;
    let title = agentName;
    try {
      // Try to parse as JSON (newsletter/landing-page agents output JSON)
      const parsed = JSON.parse(finalContent);
      if (parsed.html) html = parsed.html;
      if (parsed.summary) title = parsed.summary;
    } catch {
      // Not JSON — might be raw HTML, use as-is
    }

    res.json({ html, agent: agentName, title });
  } catch (err) {
    console.error('[stagedemo] generate error:', err);
    res.status(500).json({ error: 'generation_failed', detail: err.message });
  }
});

export default router;
