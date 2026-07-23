// Tool schemas for the unified /Content chat brain (mode:'content').
//
// IMAGE_TOOL started as a VERBATIM copy of the const in src/pages/Content.jsx
// (@1908-1924 as of 2026-07-15). PLAN_CAROUSEL_TOOL is re-exported from
// the canonical backend copy (backend/agents/plan-carousel-tool.js),
// which is the Content.jsx schema PLUS the required `platform` field —
// the unified path standardizes on the backend schema per
// docs/unified-content-backend-plan.md §4.3.
//
// 2026-07-23: IMAGE_TOOL gained the single-image POST template fields
// (purpose / post_platform / post_template / post_copy). When they're
// present the server replaces `prompt` with a deterministic layout prompt
// composed from image-post-templates.js — same enforcement model the
// curated carousel templates use. `prompt` itself is unchanged, so every
// client keeps passing args.prompt straight through to /api/generate/image.
import { IMAGE_POST_TEMPLATE_IDS } from './image-post-templates.js';

const IMAGE_TOOL = {
  type: 'function',
  function: {
    name: 'generate_image',
    description: 'Generate a professional image for the content. MUST be called when producing final content. For an Instagram or LinkedIn SINGLE-IMAGE POST also pass purpose:"post_image" plus post_platform, post_template and post_copy — the server then renders a designed, brand-colored layout instead of using your prompt text. For anything else (story frames, thumbnails, plain images, edits of an attached image) set the matching purpose and write a normal descriptive prompt.',
    parameters: {
      type: 'object',
      properties: {
        prompt: {
          type: 'string',
          description: 'Image generation prompt. For post_image calls: ONE plain sentence naming the subject (a fallback — the server replaces it with the composed layout). For every other purpose: a full prompt covering 1) Style (photorealistic, modern graphic design, or cinematic  -  NEVER cartoon/pixel-art/clip-art), 2) Specific subject and composition, 3) Color palette and lighting, 4) Any text overlays with exact wording and typography style.',
        },
        purpose: {
          type: 'string',
          enum: ['post_image', 'story_frame', 'thumbnail', 'plain_image', 'edit_existing'],
          description: 'What this image is for. "post_image" = the single static image of an Instagram or LinkedIn feed post (this is the only value that triggers the template system).',
        },
        post_platform: {
          type: 'string',
          enum: ['instagram', 'linkedin'],
          description: 'Required with purpose "post_image": which feed this post image is for. Instagram images carry the value themselves; LinkedIn images are visual support for the caption.',
        },
        post_template: {
          type: 'string',
          enum: IMAGE_POST_TEMPLATE_IDS,
          description: 'Required with purpose "post_image": the layout template whose "use when" matches what this post is doing. See the SINGLE-IMAGE POST TEMPLATES section of your instructions.',
        },
        post_copy: {
          type: 'object',
          description: 'Required with purpose "post_image": the exact words that appear ON the image. Fill ONLY the fields the chosen template uses and respect the copy budget — the layout is built on whitespace and breaks when overfilled.',
          properties: {
            kicker: { type: 'string', description: 'Short label above the headline (2-4 words, e.g. "FRAMEWORK", "CASE STUDY", "NOW LIVE").' },
            headline: { type: 'string', description: 'The hero line — the one idea the image states. Under 12 words.' },
            support: { type: 'string', description: 'Single supporting line. Under 12 words.' },
            items: { type: 'array', items: { type: 'string' }, description: 'List rows for framework / checklist / flow / versus / before-after / case templates. Max 5, each under 7 words.' },
            metric_value: { type: 'string', description: 'Hero number exactly as it should render, e.g. "$180", "62%", "3.2x".' },
            metric_label: { type: 'string', description: 'One-line label under the metric.' },
            attribution: { type: 'string', description: 'Attribution for quote/testimonial templates: name, then role or company.' },
            cta: { type: 'string', description: 'Call to action for offer/announcement templates. Under 5 words.' },
            visual_subject: { type: 'string', description: 'The photographic or textural subject, for photo-led templates only. Never a real person\'s name, ethnicity, or physical description — say "the founder".' },
          },
        },
      },
      required: ['prompt'],
    },
  },
};

export { IMAGE_TOOL };
export { PLAN_CAROUSEL_TOOL } from '../plan-carousel-tool.js';
