// create_content_plan tool schema — the in-chat multi-day content plan.
//
// Called by the AICEO CEO orchestrator (Sonnet) whenever the user asks to
// plan MULTIPLE days/pieces of content ("plan my next 14 days", "a week of
// posts", "content calendar for July"). The client renders the payload as a
// day-by-day list INSIDE the chat bubble with a "Generate content" button —
// it never touches the side canvas. Replaces the old Plan-Mode flow that
// emitted a styled html_template "Content Plan" page.
//
// The items[] schema is the contract with two consumers:
//   - src/components/ContentPlanMessage.jsx (renders the day list + run state)
//   - POST /api/orchestrate/plan-item (generates one piece per item)
// Change fields here and both must follow.

// Formats the batch runner can actually execute, per platform. Keep in
// sync with the validation matrix in routes/orchestrate.js plan-item.
export const PLAN_PLATFORM_FORMATS = {
  linkedin: ['text_post', 'single_image', 'carousel'],
  instagram: ['single_image', 'carousel', 'reel_script'],
  x: ['text_post', 'single_image'],
  facebook: ['text_post', 'single_image'],
  tiktok: ['reel_script', 'single_image'],
  youtube: ['youtube_script'],
};

export const CREATE_CONTENT_PLAN_TOOL = {
  type: 'function',
  function: {
    name: 'create_content_plan',
    description: 'Create a multi-day content plan. The client renders it in the chat as a day-by-day list with a "Generate content" button — NOT in the canvas. Call this for ANY multi-day / multi-piece planning request ("plan my next 14 days of content", "a week of posts", "content calendar for July"). Do NOT call create_artifact for plans. Do NOT run the social-post discovery questions first — the ONLY question allowed before this tool is the single multi-select platform question via ask_user, and ONLY when the user has not named platforms. Formats MUST be platform-appropriate: linkedin -> text_post | single_image | carousel; instagram -> single_image | carousel | reel_script; x -> text_post | single_image; youtube -> youtube_script; facebook -> text_post | single_image; tiktok -> reel_script | single_image. Rotate formats — never more than 2 consecutive items with the same format on the same platform. Cap plans at 31 items; for longer requests plan the first month and say so.',
    parameters: {
      type: 'object',
      properties: {
        title: {
          type: 'string',
          description: 'Short plan title, e.g. "14-Day Content Plan — AICEO Launch".',
        },
        timeframe_days: {
          type: 'integer',
          description: 'How many days the plan covers. Infer from the request ("next 14 days" -> 14); default 7 when unstated.',
        },
        platforms: {
          type: 'array',
          items: { type: 'string', enum: ['linkedin', 'youtube', 'instagram', 'x', 'facebook', 'tiktok'] },
          description: 'The platforms this plan covers, from the user request or their platform-question answer. "All platforms" -> all four.',
        },
        summary: {
          type: 'string',
          description: 'One sentence describing the strategic focus of the plan, shown above the day list.',
        },
        items: {
          type: 'array',
          description: 'One entry per content piece, ordered by day. One piece per day unless the user asked for more. Topics MUST be specific to THIS user (Brand DNA, products, sales, real data) — never generic. Hard-sell CTAs at most 1 in every 3 items.',
          items: {
            type: 'object',
            properties: {
              day: { type: 'integer', description: '1-based day number within the plan.' },
              date: { type: 'string', description: 'Optional human label, e.g. "Mon Jul 20".' },
              platform: { type: 'string', enum: ['linkedin', 'youtube', 'instagram', 'x', 'facebook', 'tiktok'] },
              format: {
                type: 'string',
                enum: ['text_post', 'single_image', 'carousel', 'reel_script', 'youtube_script'],
                description: 'MUST be valid for the platform (see tool description matrix).',
              },
              topic: { type: 'string', description: 'What this piece is about — specific to the user\'s business, never generic.' },
              hook: { type: 'string', description: 'Verbatim scroll-stopping first line, written in the user\'s voice.' },
              cta: { type: 'string', description: 'What the reader should do (soft or hard ask).' },
              details: { type: 'string', description: '2-3 sentences of angle/beats the generator will follow when writing this piece.' },
            },
            required: ['day', 'platform', 'format', 'topic', 'hook'],
          },
        },
      },
      required: ['title', 'timeframe_days', 'platforms', 'items'],
    },
  },
};

// Server-side only — forced via tool_choice inside POST /api/orchestrate/
// plan-item for single_image items so the copy and the image prompt come
// back as one structured payload. NOT part of the CEO tool list.
export const COMPOSE_SINGLE_IMAGE_POST_TOOL = {
  type: 'function',
  function: {
    name: 'compose_single_image_post',
    description: 'Return the finished post copy plus the image prompt for a single-image social post.',
    parameters: {
      type: 'object',
      properties: {
        content: {
          type: 'string',
          description: 'The exact post copy, plain text, hook as the first line. Ready to paste.',
        },
        image_prompt: {
          type: 'string',
          description: 'Actionable image description an AI image generator can execute: subject, composition, mood, style, brand-color hints, text overlay if any. NEVER a real person\'s name, ethnicity, or identity.',
        },
      },
      required: ['content', 'image_prompt'],
    },
  },
};
