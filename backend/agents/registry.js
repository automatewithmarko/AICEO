// Central agent registry  -  all specialist agents registered here

import newsletter from './newsletter.js';
import landingPage from './landing-page.js';
import squeezePage from './squeeze-page.js';
import storySequence from './story-sequence.js';
import leadMagnet from './lead-magnet.js';
import dmAutomation from './dm-automation.js';

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
        description: 'Create a visual artifact directly in the split-screen panel. Use for emails, social posts, code, or documents  -  NOT for newsletters, landing pages, or other marketing assets (use delegate_to_agent for those). For emails, follow the Daniel Paul Email Framework: result before story, one sentence per paragraph, one CTA only, PS line mandatory, first name sign-off only, invite framing not sales framing. NEVER use "leverage/synergy/utilize/paradigm", passive voice, em dashes, or hashtags.',
        parameters: {
          type: 'object',
          properties: {
            type: {
              type: 'string',
              enum: ['email', 'html_template', 'content_post', 'code_block', 'markdown_doc'],
              description: 'The artifact type.',
            },
            title: {
              type: 'string',
              description: 'Short descriptive title.',
            },
            content: {
              type: 'string',
              description: 'The artifact content.',
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
        description: 'Generate a professional image for content, social media graphics, or thumbnails.',
        parameters: {
          type: 'object',
          properties: {
            prompt: {
              type: 'string',
              description: 'Detailed image prompt: style, subject, composition, colors, text overlays.',
            },
          },
          required: ['prompt'],
        },
      },
    },
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
