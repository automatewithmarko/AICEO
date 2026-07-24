// Tool schemas for the unified /Content chat brain (mode:'content').
//
// IMAGE_TOOL started as a VERBATIM copy of the const in src/pages/Content.jsx
// (@1908-1924 as of 2026-07-15). PLAN_CAROUSEL_TOOL is re-exported from
// the canonical backend copy (backend/agents/plan-carousel-tool.js),
// which is the Content.jsx schema PLUS the required `platform` field —
// the unified path standardizes on the backend schema per
// docs/unified-content-backend-plan.md §4.3.
//
// 2026-07-24: the single-image POST template fields (purpose /
// post_platform / post_template / post_copy) were removed — the template
// system was unplugged (founder call, pre-demo): free-form prompts are
// back for single-image posts.

const IMAGE_TOOL = {
  type: 'function',
  function: {
    name: 'generate_image',
    description: 'Generate a professional image for the content. MUST be called when producing final content.',
    parameters: {
      type: 'object',
      properties: {
        prompt: {
          type: 'string',
          description: 'Image generation prompt. Must cover: 1) Style (photorealistic, modern graphic design, or cinematic  -  NEVER cartoon/pixel-art/clip-art), 2) Specific subject and composition, 3) Color palette and lighting, 4) Any text overlays with exact wording and typography style.',
        },
      },
      required: ['prompt'],
    },
  },
};

export { IMAGE_TOOL };
export { PLAN_CAROUSEL_TOOL } from '../plan-carousel-tool.js';
