// Central agent registry — all specialist agents registered here

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
        description: 'Create a visual artifact directly in the split-screen panel. Use for emails, social posts, code, or documents — NOT for newsletters, landing pages, or other marketing assets (use delegate_to_agent for those). For emails, follow the Daniel Paul Email Framework: result before story, one sentence per paragraph, one CTA only, PS line mandatory, first name sign-off only, invite framing not sales framing. NEVER use "leverage/synergy/utilize/paradigm", passive voice, or em dashes.',
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
        description: 'Ask the user a question with multiple choice options before proceeding. Use this BEFORE delegating to an agent — ask 1-2 focused questions to understand what they want. The question appears as a popup overlay with clickable options. ALWAYS use this instead of asking questions in plain text.',
        parameters: {
          type: 'object',
          properties: {
            question: {
              type: 'string',
              description: 'The question to ask — keep it short and direct.',
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
        description: 'Save something you learned about the USER as a person to their soul file. This is your deep understanding of WHO they are — not what they asked you to do. Save their name, personality, communication style, business identity, values, frustrations, dreams, preferences, and quirks. This is how you build a real relationship across conversations. Do NOT save tasks, to-dos, conversation summaries, or things you generated for them.',
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
              description: 'The notification body — actionable insight or suggestion',
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
