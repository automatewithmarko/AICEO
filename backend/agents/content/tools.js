// Tool schemas for the unified /Content chat brain (mode:'content').
//
// IMAGE_TOOL is a VERBATIM copy of the const in src/pages/Content.jsx
// (@1908-1924 as of 2026-07-15). PLAN_CAROUSEL_TOOL is re-exported from
// the canonical backend copy (backend/agents/plan-carousel-tool.js),
// which is the Content.jsx schema PLUS the required `platform` field —
// the unified path standardizes on the backend schema per
// docs/unified-content-backend-plan.md §4.3.
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

export { IMAGE_TOOL };
export { PLAN_CAROUSEL_TOOL } from '../plan-carousel-tool.js';
