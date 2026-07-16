// Claude protocol adapter for the unified /Content backend (Phase 1b,
// docs/unified-content-backend-plan.md).
//
// WHY THIS EXISTS: the /Content prompts (copied verbatim into this folder)
// drive their control flow through TEXT conventions that Grok followed
// reliably but Claude does not:
//   - inline JSON question blocks:  {"type":"question","text":...,"options":[...]}
//   - generation markers:           <<READY_A>> / <<READY_B>>
//   - edit-mode markers:            <<EDIT_TEXT>> / <<ADD_IMAGE_AI>> /
//                                   <<USE_UPLOADED_IMAGE>> / <<ADD_IMAGE_ASK>>
//   - "output ONLY the post text"   (Call-2 variation prompts)
// Observed Claude failures (see prompt.md, 2026-07-15): planning notes /
// "Constraint Checklist" / "Mental Sandbox" leaking into the post preview,
// posts written directly in chat, questions asked as plain text.
//
// THE FIX: encode the protocol as native tools — Claude follows tool
// schemas near-perfectly (the AI CEO tab is built on this) — and translate
// tool calls BACK into the legacy text conventions server-side, so the
// /Content frontend (parsers, safety nets, previews) is byte-compatible
// and completely unchanged.
//
// The verbatim prompt files stay pristine; the addendum below is APPENDED
// at runtime and only overrides the MECHANISM (how to ask / how to
// trigger), never the strategy, quality bars, or guardrails.

// Ask the user one question with clickable options. Server-side this is
// translated into the legacy inline-JSON question block that
// Content.jsx's questionParsed logic already renders.
export const CONTENT_ASK_USER_TOOL = {
  type: 'function',
  function: {
    name: 'ask_user',
    description: 'Ask the user ONE question with clickable options. Use this for EVERY question you ask — discovery-flow questions, Plan Mode scoping questions, clarifications, and image choices. Never type a question as plain chat text and never type a JSON question block. All the question RULES from the system prompt still apply: one question per turn, hard caps on question counts, 3-4 options, always include the fallback option (e.g. "Surprise me" / "Match my brand voice" / "Let me write my own") where the system prompt calls for one.',
    parameters: {
      type: 'object',
      properties: {
        question: { type: 'string', description: 'The question text, short and specific.' },
        options: {
          type: 'array',
          items: { type: 'string' },
          description: '3-4 clickable answer options following the option rules in the system prompt. Use [] only for a genuinely open-ended question.',
        },
      },
      required: ['question', 'options'],
    },
  },
};

// Trigger the LinkedIn text-post generation pass (Call 2). Server-side this
// is translated into the legacy <<READY_A>> / <<READY_B>> marker that
// Content.jsx already detects to launch the variation-prompt generation.
export const GENERATE_LINKEDIN_POST_TOOL = {
  type: 'function',
  function: {
    name: 'generate_linkedin_post',
    description: 'Commit to generating the final LinkedIn TEXT post. A separate system writes the post — you must NEVER write the post text yourself in chat. Call this ONLY when the discovery flow is complete (or the user explicitly said to skip questions / already gave format + topic), exactly where the system prompt says to emit <<READY_A>> or <<READY_B>>. Write the short one-sentence commitment message ("I\'ll create a framework post about X...") as normal text in the same turn, then call this tool. Do NOT call this for carousels (use plan_carousel), edits to an existing post (use edit_linkedin_post), or non-LinkedIn platforms.',
    parameters: {
      type: 'object',
      properties: {
        variation: {
          type: 'string',
          enum: ['A', 'B'],
          description: 'A = Variation A (framework-heavy: numbered lists, tactical playbook, saves/reposts). B = Variation B (story-flow: personal narrative, emotional connection). Choose by the same criteria the system prompt gives for <<READY_A>> vs <<READY_B>>.',
        },
      },
      required: ['variation'],
    },
  },
};

// Edit-mode actions for an existing on-screen LinkedIn post. Server-side
// translated into the legacy <<EDIT_TEXT>>/<<ADD_IMAGE_*>> markers.
export const EDIT_LINKEDIN_POST_TOOL = {
  type: 'function',
  function: {
    name: 'edit_linkedin_post',
    description: 'Modify the LinkedIn post currently on screen WITHOUT regenerating it. Use exactly where the system prompt\'s LinkedIn Edit Mode says to emit an edit marker: edit_text = rewrite the post text in place (keeps images), add_image_ai = generate an AI image for the post (text untouched), use_uploaded_image = attach the user\'s uploaded image, add_image_ask = ask which image source to use. A tweak/shorten/lengthen/tone request is ALWAYS an edit — never a regeneration.',
    parameters: {
      type: 'object',
      properties: {
        action: {
          type: 'string',
          enum: ['edit_text', 'add_image_ai', 'use_uploaded_image', 'add_image_ask'],
          description: 'Which edit-mode action to perform.',
        },
        instruction: {
          type: 'string',
          description: 'REQUIRED for edit_text: the rewrite instruction for the post editor (e.g. "make it shorter and punchier, keep the CTA"). Ignored for the image actions.',
        },
      },
      required: ['action'],
    },
  },
};

// Forced-output tool for the Call-2 passes (linkedin_post / linkedin_edit).
// tool_choice is pinned to this tool so the model CANNOT stream planning
// or meta-commentary into the preview — the post arrives as a structured
// argument, nothing else reaches the client.
export const SUBMIT_POST_TOOL = {
  type: 'function',
  function: {
    name: 'submit_post',
    description: 'Deliver the final post text. post_text must contain ONLY the ready-to-paste post — no preamble, no commentary, no planning notes, no checklists, no "here is your post", no character counts. All writing rules from the system prompt apply to post_text exactly.',
    parameters: {
      type: 'object',
      properties: {
        post_text: { type: 'string', description: 'The complete, final post text with proper line breaks. Nothing before it, nothing after it.' },
      },
      required: ['post_text'],
    },
  },
};

// Runtime addendum appended AFTER the verbatim /Content system prompt for
// the 'chat' intent. Only overrides the delivery MECHANISM.
export function buildClaudeChatProtocolAddendum({ planMode = false, isLinkedin = false, editModeActive = false } = {}) {
  let a = `\n\n=== TOOL PROTOCOL (READ LAST — OVERRIDES THE TEXT-MARKER MECHANICS ABOVE) ===\n`;
  a += `You are running with native tools. Everything above about WHAT to ask, WHEN to ask, question limits, content strategy, quality bars, guardrails, and output rules still applies EXACTLY. Only the delivery MECHANISM changes:\n`;
  a += `1. QUESTIONS: never type a question as plain text and never type the {"type":"question",...} JSON block. Call the ask_user tool instead. The question content, option style, and hard caps follow the rules above.\n`;
  if (planMode) {
    a += `2. PLAN OUTPUT: your plan HTML output stays exactly as instructed above — emit it as normal text. Never call any tool other than ask_user.\n`;
    a += `3. NO META-COMMENTARY: never output planning notes, checklists, "Constraint Checklist", "Mental Sandbox", option analysis, or internal reasoning as text. Your visible text is only what the user should read.\n`;
    return a;
  }
  if (isLinkedin) {
    a += `2. LINKEDIN TEXT POSTS: never type <<READY_A>> or <<READY_B>>, and never write the post text yourself. When the flow above says to emit a READY marker, call generate_linkedin_post with variation "A" or "B" instead (same one-sentence commitment text first, then the tool call).\n`;
    if (editModeActive) {
      a += `3. LINKEDIN EDIT MODE: never type <<EDIT_TEXT>>, <<ADD_IMAGE_AI>>, <<USE_UPLOADED_IMAGE>>, or <<ADD_IMAGE_ASK>>. Call edit_linkedin_post with the matching action (and the rewrite instruction for edit_text) exactly where the Edit Mode rules above say to emit a marker.\n`;
    }
  }
  a += `${isLinkedin ? (editModeActive ? '4' : '3') : '2'}. CAROUSELS AND IMAGES: unchanged — call plan_carousel / generate_image exactly as described above. For SINGLE POSTS and STORIES you MUST write the ready-to-post caption as normal chat text in the SAME turn as your generate_image call(s) — an image with no caption is an incomplete deliverable and a bug. (Carousels are the exception: their caption lives in the plan_carousel caption field, not chat text.)\n`;
  a += `${isLinkedin ? (editModeActive ? '5' : '4') : '3'}. ONE ACTION PER TURN (same turn-taking rule as above): either ONE ask_user call, OR one generation action (generate_linkedin_post, plan_carousel, or a set of generate_image calls), OR pure conversation. Never combine a question with a generation action in the same turn.\n`;
  a += `${isLinkedin ? (editModeActive ? '6' : '5') : '4'}. NO META-COMMENTARY: never output planning notes, checklists, "Constraint Checklist", "Mental Sandbox", option analysis, or internal reasoning as text. Your visible text is only what the user should read in chat.\n`;
  a += `${isLinkedin ? (editModeActive ? '7' : '6') : '5'}. NEVER WRITE A TOOL CALL AS TEXT: no {"tool_code": ...}, no JSON function syntax, no pseudo-code invocations in your reply. If you intend to generate an image or plan a carousel you MUST invoke the actual tool. A tool call typed as text reaches the user as raw JSON and executes nothing — it is the worst possible failure.\n`;
  return a;
}

// Runtime addendum appended AFTER the verbatim Call-2 system prompts
// (linkedin_post variation prompt / linkedin_edit prompt).
export const SUBMIT_POST_ADDENDUM = `\n\n=== DELIVERY (READ LAST) ===\nDeliver the post by calling the submit_post tool with the complete final post as post_text. Every writing rule above applies to post_text exactly. Do not write anything else.`;
