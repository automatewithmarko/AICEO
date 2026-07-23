// AI CEO adapter for the shared content agents (Phase 4,
// docs/unified-content-backend-plan.md).
//
// Purpose: make the AI CEO tab produce LinkedIn text posts through the
// SAME two-phase pipeline /Content uses — a strategist decides the
// variation, then a dedicated writer pass runs the variation prompt
// (LINKEDIN_TEXT_VARIATION_A framework-heavy / _B story-flow, with their
// hook rules and anti-fabrication guardrails) — instead of the CEO
// drafting post copy inline in a create_artifact call. Also raises the
// CEO's LinkedIn CAROUSEL caption bar to /Content's "CAPTION IS THE POST"
// standard.
//
// Flag-gated: orchestrate.js only activates this when the request carries
// unified:true (the client-side unified flag). Flag-off requests keep the
// legacy CEO behavior byte-identical.
import { executeCeoOrchestrator } from '../base-agent.js';
import { buildLinkedInPostSystemPrompt } from './second-pass-prompts.js';
import { SUBMIT_POST_TOOL, GENERATE_LINKEDIN_POST_TOOL, SUBMIT_POST_ADDENDUM } from './claude-protocol.js';
import { LINKEDIN_CAROUSEL_PROMPT } from './linkedin-prompts.js';
import { CURATED_CAROUSEL_TEMPLATES } from './curated-carousel-templates.js';
import { buildImagePostTemplateCatalog } from './image-post-templates.js';

export { GENERATE_LINKEDIN_POST_TOOL };

// Appended to buildCeoSystemPrompt() on unified requests (non-plan-mode).
// Mechanism-only override: discovery flow, 4-question marketing gate,
// reels rule, image rules etc. all stay exactly as written above it.
export function buildCeoUnifiedSocialAddendum() {
  let a = `\n\n=== UNIFIED LINKEDIN PIPELINE (READ LAST — OVERRIDES THE SOCIAL POST RULE FOR LINKEDIN TEXT POSTS ONLY) ===\n`;
  a += `1. LINKEDIN TEXT POSTS: do NOT write the post copy yourself and do NOT call create_artifact for a NEW LinkedIn text post. When discovery is complete and you are ready to generate, call the generate_linkedin_post tool with variation "A" (framework-heavy: numbered lists, tactical playbook, optimized for saves/reposts) or "B" (story-flow: personal narrative, emotional connection). A dedicated writer generates the post and it appears on the user's canvas automatically. Write your usual one-sentence commitment message as text in the same turn.\n`;
  a += `2. EDITS to a LinkedIn post already on screen are unchanged: small tweaks (shorten, change tone, new CTA, add image) keep using create_artifact / generate_image directly as described above. Only a brand-new post goes through generate_linkedin_post.\n`;
  a += `3. Every OTHER platform (Instagram, X, Facebook, TikTok) and every other content type (carousels, stories, reels, images) is unchanged — follow the rules above.\n`;
  a += `4. LINKEDIN CAROUSELS: when you call plan_carousel with platform "linkedin", the caption field must meet the standard below — on LinkedIn the CAPTION IS THE POST (150-450 words carrying 90% of the value; slides are the visual summary). Apply these standards to the caption and slide copy you put in the plan:\n\n`;
  a += `--- LINKEDIN CAROUSEL COPY STANDARDS (from the /Content strategist — apply when planning LinkedIn carousels) ---\n`;
  a += LINKEDIN_CAROUSEL_PROMPT;
  a += `\n--- END LINKEDIN CAROUSEL COPY STANDARDS ---\n`;
  a += `5. PREMADE CAROUSEL TEMPLATES: these curated visual templates exist — ${CURATED_CAROUSEL_TEMPLATES.map((t) => `"${t.name}" (id: ${t.id})`).join(', ')}. If the user names one (or asks for "a premade/template style"), set designSystem.templateId to that template's id in your plan_carousel call and plan only the slide CONTENT — the server substitutes the template's exact design system and layout, so any palette you provide will be overridden. If the user asks what templates exist, list the names.\n`;
  a += `6. CAROUSEL COPY BUDGET (always, and doubly so with a premade template — they live on generous whitespace): headlines ≤ 8 words; body ≤ 2 short sentences (≈ 12-20 words total); ONE idea per slide — split dense points across two slides instead of packing one. Overstuffed slide copy renders as a cluttered, hard-to-scan image.\n`;
  a += `7. SINGLE-IMAGE POSTS (Instagram or LinkedIn feed post with ONE static image): the image is rendered from a layout template, not from your prose. Call generate_image with purpose:"post_image", post_platform, post_template, and post_copy — the server substitutes the layout, spacing, brand colors, and typography, so any visual description you write is discarded.\n\n`;
  a += `${buildImagePostTemplateCatalog({ platform: 'both' })}\n`;
  return a;
}

// The writer pass: same prompt builder + forced submit_post channel the
// /Content Call-2 uses (handler.js), run inline within the CEO's request.
// Returns the finished post text, or null on failure.
export async function runLinkedInTextPostPass({ messages, variation = 'A', userName = null, brandDna = null, abortSignal = null }) {
  const systemPrompt = buildLinkedInPostSystemPrompt({
    variation: variation === 'B' ? 'B' : 'A',
    userName,
    brandDna,
    // CEO reference material (outlier links, docs, transcripts) is
    // carried in the enriched conversation messages rather than the
    // socialUrls/documents arrays /Content uploads — the writer reads it
    // from history.
    socialUrls: [],
    documents: [],
  }) + SUBMIT_POST_ADDENDUM;

  let submitted = null;
  const result = await executeCeoOrchestrator({
    systemPrompt,
    messages,
    tools: [SUBMIT_POST_TOOL],
    // Full OpenAI object form — the Grok fallback forwards this verbatim
    // and XAI 422s without the `type` field (untagged-enum deserialize).
    toolChoice: { type: 'function', function: { name: 'submit_post' } },
    planMode: true,      // exit after the one forced tool round
    searchMode: false,
    abortSignal,
    onChunk: () => {},   // suppress any free text — reasoning must not leak
    onToolCalls: async (toolCalls) => {
      for (const call of toolCalls) {
        if (call.name !== 'submit_post') continue;
        let args;
        try { args = JSON.parse(call.arguments); } catch { args = {}; }
        if (args.post_text) submitted = String(args.post_text).trim();
      }
    },
  });

  if (submitted) return submitted;
  const fallback = (result?.content || '').trim();
  if (fallback) {
    console.warn(`[ceo-adapter] linkedin post pass: no submit_post call — using raw text fallback (${fallback.length} chars)`);
    return fallback;
  }
  return null;
}
