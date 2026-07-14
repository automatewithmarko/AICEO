// plan_carousel tool schema — shared between:
//   - AICEO CEO orchestrator (Sonnet), via backend/agents/registry.js
//   - /Content tab (Grok/XAI), via src/pages/Content.jsx's local copy
//
// The Content.jsx copy is intentionally kept in-place until the /Content
// tab is migrated to /api/orchestrate; when that happens, both consumers
// import from this single source. Until then, keep the two literal
// definitions byte-identical so Sonnet and Grok get the same schema.
//
// The schema drives the SAME per-slide prompt builder (buildCarouselSlidePrompt
// in src/lib/carouselGen.js) so image cohesion is identical across both tabs.

export const PLAN_CAROUSEL_TOOL = {
  type: 'function',
  function: {
    name: 'plan_carousel',
    description: 'Plan a carousel (Instagram or LinkedIn). Call this FIRST for every carousel request on those platforms. Do NOT call generate_image — the client will fire per-slide image generation after receiving the plan. Produces a hook, slide roster (5-9 for IG, 7-12 for LinkedIn), locked design system, and a caption. Tone + visual language should match the target platform (IG: editorial-trendy / LinkedIn: professional thought-leadership). Do NOT call this for reels, videos, short-form video content, single-image posts, or stories — carousels are static swipeable slides, not video, not one-image feed posts, not story frames. If the user said "reel", "video", "TikTok", "short", "single post", or "story", this is the WRONG tool.',
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
