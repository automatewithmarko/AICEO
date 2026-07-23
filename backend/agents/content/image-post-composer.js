// Structured-copy composer for single-image posts.
//
// Turns a plain brief (a finished post's text, or a free-form image prompt
// the model wrote instead of filling the structured fields) into the
// {template, copy} spec that buildImagePostPrompt() needs.
//
// Three consumers:
//   1. The relay repair path (image-post-templates.applyImagePostTemplateToArgs)
//      — the model declared purpose:"post_image" but skipped post_copy, so
//      the render would otherwise fall back to free-form prose.
//   2. POST /api/orchestrate/compose-image-post — the /Content LinkedIn
//      "add an image to this post" button, which has a finished post text
//      and no model in the loop at all.
//   3. Anything future that has words but no layout spec.
//
// One forced tool call on Sonnet: tool_choice pins compose_image_post so
// nothing but the structured payload can come back (same technique as the
// LinkedIn writer's submit_post channel and the plan-item route).
import { executeCeoOrchestrator } from '../base-agent.js';
import {
  IMAGE_POST_TEMPLATE_IDS,
  IMAGE_POST_PLATFORM_CONFIG,
  buildImagePostTemplateCatalog,
} from './image-post-templates.js';

export const COMPOSE_IMAGE_POST_TOOL = {
  type: 'function',
  function: {
    name: 'compose_image_post',
    description: 'Return the template choice and the exact on-image copy for a single-image social post. The server renders the layout, spacing, brand colors, and typography from your template choice — you only choose the template and write the words that appear on the image.',
    parameters: {
      type: 'object',
      properties: {
        template: {
          type: 'string',
          enum: IMAGE_POST_TEMPLATE_IDS,
          description: 'The template whose "use when" matches what this post is doing.',
        },
        kicker: { type: 'string', description: 'Optional short label above the headline (2-4 words, e.g. "FRAMEWORK", "CASE STUDY", "NOW LIVE").' },
        headline: { type: 'string', description: 'The hero line — the one idea the image states. Under 12 words. Required unless the template leads with a metric.' },
        support: { type: 'string', description: 'Optional single supporting line under the headline. Under 12 words.' },
        items: {
          type: 'array',
          items: { type: 'string' },
          description: 'Optional list rows for framework / checklist / flow / versus / before-after / case templates. Max 5, each under 7 words.',
        },
        metric_value: { type: 'string', description: 'Optional hero number exactly as it should render, e.g. "$180" or "62%" or "3.2x".' },
        metric_label: { type: 'string', description: 'Optional one-line label under the metric, e.g. "cost per acquisition, after 6 weeks".' },
        attribution: { type: 'string', description: 'Optional attribution for quote/testimonial templates: name, then role or company.' },
        cta: { type: 'string', description: 'Optional call to action for offer/announcement templates. Under 5 words.' },
        visual_subject: { type: 'string', description: 'Optional description of the photographic or textural subject, for templates built on a photo. Never a real person\'s name, ethnicity, or physical description — say "the founder".' },
      },
      required: ['template'],
    },
  },
};

function buildComposerSystemPrompt({ platform, brandDna, userName }) {
  const p = platform === 'linkedin' ? 'linkedin' : 'instagram';
  const cfg = IMAGE_POST_PLATFORM_CONFIG[p];
  let prompt = `You are a senior art director. You are given a social post and you decide how its IMAGE should be laid out and what words appear on it.

${buildImagePostTemplateCatalog({ platform: p })}

YOUR JOB:
1. Read the brief below and decide what the post is actually DOING (teaching, proving, positioning, asking, selling, announcing, telling a story).
2. Choose the ONE template that matches.
3. Write the on-image copy: the fewest, strongest words that make the point land. Pull real specifics from the brief — numbers, names, timeframes — rather than paraphrasing into generalities.

HARD RULES:
- Total visible words across the image: ${cfg.maxWords} MAXIMUM. This is a ceiling; fewer is better.
- Fill ONLY the fields the chosen template uses. Leave the rest out entirely.
- Copy the brief's real numbers and specifics verbatim. Never invent a statistic, client name, price, or date that is not in the brief.
- No em dashes. No hashtags. No emoji. No quotation marks around the headline (the layout handles that).
- Never describe visual design, colors, fonts, or composition — the server owns all of it. visual_subject is the only exception and only when the template is built on a photograph.
- Never put a real person's name, ethnicity, or physical description in visual_subject. Say "the founder".

Call compose_image_post. Do not write anything else.`;

  if (brandDna?.description) prompt += `\n\nBRAND: ${String(brandDna.description).slice(0, 800)}`;
  if (userName) prompt += `\nFOUNDER NAME (for attribution fields only, never in visual_subject): ${userName}`;
  return prompt;
}

// Returns { template, copy } or null.
export async function composeImagePostSpec({
  platform = 'instagram',
  brief = '',
  brandDna = null,
  userName = null,
  abortSignal = null,
} = {}) {
  const text = String(brief || '').trim();
  if (!text) return null;

  const systemPrompt = buildComposerSystemPrompt({ platform, brandDna, userName });
  const messages = [{
    role: 'user',
    content: `BRIEF — the post this image belongs to:\n---\n${text.slice(0, 6000)}\n---\n\nChoose the template and write the on-image copy now.`,
  }];

  for (let attempt = 1; attempt <= 2; attempt += 1) {
    let captured = null;
    try {
      await executeCeoOrchestrator({
        systemPrompt,
        messages,
        tools: [COMPOSE_IMAGE_POST_TOOL],
        // Full OpenAI object form — the Grok fallback 422s without `type`.
        toolChoice: { type: 'function', function: { name: 'compose_image_post' } },
        planMode: true,   // exit after the one forced tool round
        searchMode: false,
        abortSignal,
        onChunk: () => {},
        onToolCalls: (calls) => {
          for (const c of calls) {
            if (c.name !== 'compose_image_post') continue;
            try { captured = JSON.parse(c.arguments); } catch { captured = null; }
          }
        },
      });
    } catch (err) {
      console.warn(`[image-post-composer] attempt ${attempt} failed: ${err?.message || err}`);
    }
    if (captured) {
      const { template, ...copy } = captured;
      return { template: template || null, copy };
    }
    if (abortSignal?.aborted) return null;
  }
  console.warn('[image-post-composer] no compose_image_post call after 2 attempts');
  return null;
}
