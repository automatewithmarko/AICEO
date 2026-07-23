// Central agent registry  -  all specialist agents registered here

import newsletter from './newsletter.js';
import landingPage from './landing-page.js';
import squeezePage from './squeeze-page.js';
import storySequence from './story-sequence.js';
import leadMagnet from './lead-magnet.js';
import dmAutomation from './dm-automation.js';
import { PLAN_CAROUSEL_TOOL } from './plan-carousel-tool.js';
import { CREATE_CONTENT_PLAN_TOOL } from './content-plan-tool.js';
import { IMAGE_POST_TEMPLATE_IDS } from './content/image-post-templates.js';

const agents = {
  newsletter,
  'landing-page': landingPage,
  landing: landingPage,           // alias for frontend compatibility
  'squeeze-page': squeezePage,
  squeeze: squeezePage,           // alias
  'story-sequence': storySequence,
  story: storySequence,           // alias
  'lead-magnet': leadMagnet,
  leadmagnet: leadMagnet,         // alias
  'dm-automation': dmAutomation,
  dm: dmAutomation,               // alias
};

export function getAgent(name) {
  return agents[name] || null;
}

export function getAllAgents() {
  // Return unique agents (no aliases)
  const unique = new Map();
  for (const [key, agent] of Object.entries(agents)) {
    if (!unique.has(agent.name)) {
      unique.set(agent.name, { key, ...agent });
    }
  }
  return Array.from(unique.values());
}

// Build tool definitions for the CEO orchestrator
// Each agent becomes a tool the CEO can call
export function buildAgentTools() {
  const uniqueAgents = getAllAgents();

  return [
    {
      type: 'function',
      function: {
        name: 'delegate_to_agent',
        description: `Delegate a creative/marketing task to a specialist agent. Available agents:\n${uniqueAgents.map(a => `- "${a.name}": ${a.description}`).join('\n')}\n\nUse this when the user asks you to CREATE something (newsletter, landing page, lead magnet, etc.). The agent will generate the output and present it in the artifact panel.`,
        parameters: {
          type: 'object',
          properties: {
            agent_name: {
              type: 'string',
              enum: uniqueAgents.map(a => a.name),
              description: 'Which specialist agent to delegate to.',
            },
            task_description: {
              type: 'string',
              description: 'Clear instructions for the agent. Include: what to create, target audience, key messaging, tone, and any specific requirements the user mentioned.',
            },
          },
          required: ['agent_name', 'task_description'],
        },
      },
    },
    {
      type: 'function',
      function: {
        name: 'create_artifact',
        description: 'Create a visual artifact directly in the split-screen panel. Use for emails, social posts, code, or documents  -  NOT for newsletters, landing pages, or other marketing assets (use delegate_to_agent for those). For emails, follow the Daniel Paul Email Framework: result before story, one sentence per paragraph, one CTA only, PS line mandatory, first name sign-off only, invite framing not sales framing. NEVER use "leverage/synergy/utilize/paradigm", passive voice, em dashes, or hashtags.\n\nTYPE MAPPING — choose based on what the user asked for (this is not optional, mis-choosing renders the wrong preview UI):\n- "content_post" — ANY social media post (LinkedIn, Instagram, X/Twitter, TikTok, Facebook). This is the ONLY correct type for a social post. NEVER use html_template for a social post. NEVER use markdown_doc for a social post. If the user said "post", "caption", "LinkedIn post", "IG post", "tweet", "TikTok caption", etc. -> content_post. You MUST also set platform="linkedin"|"instagram"|"twitter"|"tiktok"|"facebook" — the preview UI (LinkedIn card vs Instagram card vs Twitter card) is chosen from that field.\n- "email" — a single email body (subject + body, plain or minimal HTML).\n- "code_block" — code snippets in any language.\n- "markdown_doc" — long-form docs, reports, checklists, briefs, meeting notes, video scripts, reels, TikTok scripts. Plain markdown.\n- "html_template" — a full styled HTML page (one-off HTML mockups). Do NOT use for social posts. Do NOT use for content plans — multi-day plans go through create_content_plan.\n\nCRITICAL LINKEDIN GOTCHA: LinkedIn posts are NOT html pages. When user says "LinkedIn post" you MUST call create_artifact with type="content_post" AND platform="linkedin". Using html_template makes the UI render a full-page HTML canvas instead of the LinkedIn feed card — the user will see their post styled like a PDF/webpage and complain.',
        parameters: {
          type: 'object',
          properties: {
            type: {
              type: 'string',
              enum: ['email', 'html_template', 'content_post', 'code_block', 'markdown_doc'],
              description: 'Artifact type. SOCIAL MEDIA POSTS -> "content_post" (ALWAYS). LinkedIn / Instagram / Twitter / TikTok / Facebook posts are ALL "content_post" — never "html_template". "html_template" is reserved for full HTML pages (one-off mockups — NOT content plans). See tool description for the full mapping.',
            },
            title: {
              type: 'string',
              description: 'Short descriptive title.',
            },
            content: {
              type: 'string',
              description: 'The artifact content.',
            },
            platform: {
              type: 'string',
              enum: ['instagram', 'linkedin', 'twitter', 'tiktok', 'facebook'],
              description: 'REQUIRED when type=content_post. The social platform the post is for. MUST match what the user asked for: "LinkedIn post" -> linkedin (NOT instagram), "Instagram post" -> instagram, "tweet" or "X post" -> twitter, "TikTok caption" -> tiktok, "Facebook post" -> facebook. This drives the preview chrome (LinkedIn card vs Instagram card vs Twitter card). FAILING TO SET THIS FOR A LINKEDIN POST IS A BUG — the user will see an Instagram card with a LinkedIn post inside it, which is wrong. If you cannot infer the platform from the conversation, ask the user before calling create_artifact. Never guess instagram.',
            },
          },
          required: ['type', 'title', 'content'],
        },
      },
    },
    {
      type: 'function',
      function: {
        name: 'generate_image',
        description: 'Generate a professional image for content, social media graphics, or thumbnails. For an Instagram or LinkedIn SINGLE-IMAGE POST also pass purpose:"post_image" plus post_platform, post_template and post_copy — the server then renders a designed, brand-colored layout instead of using your prompt text. For anything else (story frames, thumbnails, plain images, edits of an attached image) set the matching purpose and write a normal descriptive prompt.',
        parameters: {
          type: 'object',
          properties: {
            prompt: {
              type: 'string',
              description: 'For post_image calls: ONE plain sentence naming the subject (a fallback — the server replaces it with the composed layout). Otherwise a detailed image prompt: style, subject, composition, colors, text overlays.',
            },
            purpose: {
              type: 'string',
              enum: ['post_image', 'story_frame', 'thumbnail', 'plain_image', 'edit_existing'],
              description: 'What this image is for. "post_image" = the single static image of an Instagram or LinkedIn feed post (the only value that triggers the template system).',
            },
            post_platform: {
              type: 'string',
              enum: ['instagram', 'linkedin'],
              description: 'Required with purpose "post_image": which feed this post image is for. Instagram images carry the value themselves; LinkedIn images are visual support for the post text.',
            },
            post_template: {
              type: 'string',
              enum: IMAGE_POST_TEMPLATE_IDS,
              description: 'Required with purpose "post_image": the layout template whose "use when" matches what this post is doing. See the SINGLE-IMAGE POST TEMPLATES section of your instructions.',
            },
            post_copy: {
              type: 'object',
              description: 'Required with purpose "post_image": the exact words that appear ON the image. Fill ONLY the fields the chosen template uses.',
              properties: {
                kicker: { type: 'string', description: 'Short label above the headline (2-4 words).' },
                headline: { type: 'string', description: 'The hero line — the one idea the image states. Under 12 words.' },
                support: { type: 'string', description: 'Single supporting line. Under 12 words.' },
                items: { type: 'array', items: { type: 'string' }, description: 'List rows for framework / checklist / flow / versus / before-after / case templates. Max 5, each under 7 words.' },
                metric_value: { type: 'string', description: 'Hero number exactly as it should render, e.g. "$180", "62%", "3.2x".' },
                metric_label: { type: 'string', description: 'One-line label under the metric.' },
                attribution: { type: 'string', description: 'Attribution for quote/testimonial templates: name, then role or company.' },
                cta: { type: 'string', description: 'Call to action for offer/announcement templates. Under 5 words.' },
                visual_subject: { type: 'string', description: 'The photographic subject, for photo-led templates only. Never a real person\'s name, ethnicity, or physical description — say "the founder".' },
              },
            },
          },
          required: ['prompt'],
        },
      },
    },
    // plan_carousel: Instagram / LinkedIn carousels only. Same schema
    // /Content uses today, so both tabs generate slides through the same
    // per-slide prompt builder for identical visual cohesion.
    PLAN_CAROUSEL_TOOL,
    // create_content_plan: multi-day content plans rendered as an in-chat
    // day-by-day list with a "Generate content" button. The client, not
    // the model, drives the per-piece generation afterwards.
    CREATE_CONTENT_PLAN_TOOL,
    {
      type: 'function',
      function: {
        name: 'ask_user',
        description: 'Ask the user a question with multiple choice options. The question appears as a popup overlay with clickable options. You MUST use this tool for EVERY question you ask. NEVER type questions in plain text. Call this tool once per question, and keep calling it for each follow-up question until all questions are answered. There is no limit on how many times you can call this tool.',
        parameters: {
          type: 'object',
          properties: {
            question: {
              type: 'string',
              description: 'The question to ask  -  keep it short and direct.',
            },
            options: {
              type: 'array',
              items: { type: 'string' },
              description: '3-5 specific options for the user to choose from. Make them concrete and actionable.',
            },
            multi_select: {
              type: 'boolean',
              description: 'When true the options render as toggleable checkboxes and the user can pick several; their answer arrives as a comma-separated list (e.g. "LinkedIn, Instagram"). Use ONLY when several answers are simultaneously valid (e.g. platform selection). Omit for normal single-choice questions.',
            },
          },
          required: ['question', 'options'],
        },
      },
    },
    {
      type: 'function',
      function: {
        name: 'save_to_soul',
        description: 'Save something you learned about the USER as a person to their soul file. This is your deep understanding of WHO they are  -  not what they asked you to do. Save their name, personality, communication style, business identity, values, frustrations, dreams, preferences, and quirks. This is how you build a real relationship across conversations. Do NOT save tasks, to-dos, conversation summaries, or things you generated for them.',
        parameters: {
          type: 'object',
          properties: {
            content: {
              type: 'string',
              description: 'A concise insight about the user. e.g., "Name is Bazil. Hates fluff, wants direct no-BS communication." or "Runs a coaching business for fitness pros. Solo founder, does everything." or "Gets frustrated when AI acts robotic. Wants it to feel like talking to a real partner."',
            },
            category: {
              type: 'string',
              enum: ['identity', 'personality', 'business', 'preference', 'communication_style', 'values', 'frustration', 'dream', 'relationship'],
              description: 'What aspect of the user this is about.',
            },
          },
          required: ['content', 'category'],
        },
      },
    },
    {
      type: 'function',
      function: {
        name: 'push_notification',
        description: 'Push a notification to the user\'s notification panel. Use this PROACTIVELY when you spot something important: a missing integration that would help them, a strategic insight from their data, a suggestion based on their sales/content performance, or a follow-up on a previous conversation. The user sees these in their notification bell even when they\'re not talking to you.',
        parameters: {
          type: 'object',
          properties: {
            title: {
              type: 'string',
              description: 'Short notification title (max 60 chars)',
            },
            message: {
              type: 'string',
              description: 'The notification body  -  actionable insight or suggestion',
            },
            type: {
              type: 'string',
              enum: ['insight', 'action_needed', 'missing_integration', 'milestone', 'suggestion', 'warning'],
              description: 'Notification type',
            },
            priority: {
              type: 'string',
              enum: ['low', 'normal', 'high'],
              description: 'Priority level',
            },
          },
          required: ['title', 'message', 'type'],
        },
      },
    },
    {
      type: 'function',
      function: {
        name: 'check_emails',
        description: "Read the user's recent emails from their connected inbox. Call this IMMEDIATELY whenever the user asks to check/read/review/summarize their emails, find a specific message, or see what's new. NEVER ask follow-up questions before calling this  -  just call it with sensible defaults (limit 10, folder inbox). You'll get the emails back as structured data so you can summarize them in your own words.",
        parameters: {
          type: 'object',
          properties: {
            limit: {
              type: 'number',
              description: 'Max emails to fetch (1-30). Default 10.',
            },
            folder: {
              type: 'string',
              enum: ['inbox', 'sent', 'drafts'],
              description: 'Folder to read from. Default "inbox".',
            },
            unread_only: {
              type: 'boolean',
              description: 'If true, only return unread emails. Default false.',
            },
            search: {
              type: 'string',
              description: 'Optional keyword to match subject/sender/body (case-insensitive substring).',
            },
          },
          required: [],
        },
      },
    },
    {
      type: 'function',
      function: {
        name: 'create_form',
        description: `Create AND publish a new lead capture form for the user. Use this when the user is building a landing page or squeeze page and either:
(a) has NO existing published forms, OR
(b) explicitly picks "Create a new form" / "Create a simple form" when offered.

Design the form intelligently based on what you already learned from the 4 discovery questions (audience, CTA, tone, topic). Rules of thumb for landing-page lead capture forms:
- Keep it SHORT: 3-5 fields total. Every extra field drops conversions.
- Always start with a contact_block (first + last name + email) unless the user asked for something specific.
- Add contact_phone ONLY if the CTA is a call/booking/demo.
- Add contact_business ONLY if the audience is businesses/operators.
- Include ONE qualifier question (dropdown preferred, short_text if options don't fit cleanly) relevant to the audience and CTA — e.g., "What's your biggest challenge with X?", "Team size?", "Budget range?". Make dropdown options concrete (3-5 options).
- Never add more than ONE qualifier unless the user explicitly asks for more fields.

The form is auto-published on creation. The tool returns { slug, title, id } — immediately after, delegate to the landing-page or squeeze-page agent and include "EMBED FORM: slug=<slug>, title=<title>" in the task_description so the agent embeds it into the page.`,
        parameters: {
          type: 'object',
          properties: {
            title: {
              type: 'string',
              description: 'Short, conversion-focused form title (visible to form takers). e.g., "Join the Waitlist", "Book a Strategy Call", "Get Your Free Guide".',
            },
            questions: {
              type: 'array',
              description: 'Ordered list of questions. Lowest friction first (usually contact_block). 3-5 items total.',
              items: {
                type: 'object',
                properties: {
                  type: {
                    type: 'string',
                    enum: [
                      'contact_block', 'contact_first_name', 'contact_last_name', 'contact_full_name',
                      'contact_email', 'contact_phone', 'contact_business',
                      'contact_instagram', 'contact_linkedin', 'contact_x',
                      'short_text', 'long_text', 'number', 'date',
                      'dropdown', 'checkboxes', 'yes_no', 'rating', 'opinion_scale', 'url',
                    ],
                    description: 'Question type. Prefer contact_block as the first item for lead capture.',
                  },
                  title: { type: 'string', description: 'Question prompt shown to the user.' },
                  description: { type: 'string', description: 'Optional helper text beneath the prompt.' },
                  required: { type: 'boolean', description: 'Whether the field is required. Default true for contact fields.' },
                  options: {
                    type: 'array',
                    items: { type: 'string' },
                    description: 'For dropdown / checkboxes only. Provide 3-5 concrete options.',
                  },
                },
                required: ['type', 'title'],
              },
            },
          },
          required: ['title', 'questions'],
        },
      },
    },
    {
      type: 'function',
      function: {
        name: 'send_email',
        description: 'Send an email using the user\'s connected email account. Use when the user asks you to send an email, newsletter, or message to contacts. You can send HTML emails (newsletters) or plain text.',
        parameters: {
          type: 'object',
          properties: {
            to: {
              type: 'array',
              items: { type: 'string' },
              description: 'Array of recipient email addresses.',
            },
            subject: {
              type: 'string',
              description: 'Email subject line.',
            },
            body_html: {
              type: 'string',
              description: 'HTML body of the email (for newsletters, formatted emails).',
            },
            body_text: {
              type: 'string',
              description: 'Plain text body (fallback or for simple emails).',
            },
            cc: {
              type: 'array',
              items: { type: 'string' },
              description: 'CC recipients (optional).',
            },
          },
          required: ['to', 'subject'],
        },
      },
    },
  ];
}

export default agents;
