import { useState, useRef, useCallback, useEffect, useMemo } from 'react';
import { Mail, Send, Users, BarChart3, Megaphone, Inbox, FileText, PenTool, ArrowUp, ChevronDown, Plus, X, ChevronRight, Paperclip, Globe, Loader } from 'lucide-react';
import { ReactFlow, Background, Handle, Position } from '@xyflow/react';
import '@xyflow/react/dist/style.css';
import { MOCK_EMAILS } from './Inbox';
import { MOCK_CALLS } from './Sales';
import { INITIAL_PRODUCTS } from './Products';
import { supabase } from '../lib/supabase';
import { generateImage, deployToNetlify } from '../lib/api';
import './Pages.css';
import './Marketing.css';

// ── Shared prompt skeleton ──
const SHARED_RULES = `CRITICAL: You MUST respond with ONLY valid JSON. No markdown, no plain text, no code fences. Every response must be one of these two formats:

FORMAT 1 — ASK A QUESTION (when you need more information):
{"type":"question","text":"Your question here","options":["Option A","Option B","Option C","Option D"]}

FORMAT 2 — GENERATE THE OUTPUT (when you have enough information):
{"type":"newsletter","html":"<complete HTML code here>"}

FORMAT 3 — GENERATE COVER IMAGE (when user selects a cover image option):
{"type":"cover_image","prompt":"Your extremely detailed image generation prompt here"}

COVER IMAGE PROMPT REQUIREMENTS (FORMAT 3):
- The prompt MUST be 150-250 words of rich, specific visual direction
- Specify the visual style: photographic, editorial illustration, 3D render, flat design, watercolor, etc.
- Describe exact composition: foreground subject, background elements, perspective, framing (wide/close-up/overhead)
- Include the EXACT color palette from the newsletter (reference specific hex codes like #E91A44, #1A1A2E, etc.)
- Describe the subject matter tied to the newsletter topic — make it conceptually relevant, not generic
- Specify mood and lighting: warm golden hour, cool corporate blue, dramatic chiaroscuro, bright and airy, etc.
- Include any text overlays: headline text, issue number, brand name — specify font style and placement
- ALWAYS specify dimensions: 1200x600px email header banner, landscape orientation
- DO NOT include generic stock photo descriptions — make every prompt unique and tied to the newsletter content
- Think like a professional art director briefing a designer for a premium email campaign

QUESTION FLOW:
- Ask ONE question at a time. Provide 3-4 specific, helpful options.
- If the user gives you a rich prompt with clear context, skip unnecessary questions and generate immediately.
- If context items are provided (emails, calls, products, content), use that information to make your options more relevant and specific.
- Keep questions concise and actionable. Don't ask generic questions — make each option feel like a real strategic choice.

EDIT MODE (when user already has output):
- When the user provides their CURRENT HTML and asks for changes, you MUST edit the existing HTML — do NOT rewrite from scratch.
- Make only the specific changes requested. Preserve the overall structure, styling, and content that wasn't mentioned.
- If the user says "rewrite", "start over", "from scratch", or similar, then you may generate completely new output.
- When editing, return the FULL updated HTML (with the edits applied), not just the changed parts.

UPLOADED FILES:
- If the user uploads images, they will be provided as placeholder references like src="{{IMAGE:file-id}}". Use these placeholder src values EXACTLY as given in your <img> tags — do NOT modify them. The system will automatically replace them with the actual image data.
- If the user uploads documents, their text content will be included as context. Use this information to inform the content.

IMPORTANT RULES:
- NEVER wrap your response in markdown code fences or backticks
- NEVER include explanatory text outside the JSON object
- NEVER use newlines within the JSON string values — use HTML tags for line breaks in the HTML
- The "html" field should contain the complete HTML as a single string
- Always respond with ONLY the JSON object, nothing else`;

// ── Tool Configs ──
const TOOL_CONFIGS = {
  newsletter: {
    systemPrompt: `You are an elite newsletter copywriter and email designer working inside the PuerlyPersonal AI CEO platform. Your job is to help users create stunning, high-converting email newsletters.\n\n${SHARED_RULES}\n\nHTML REQUIREMENTS:\n- Generate a COMPLETE, standalone HTML email document with <!DOCTYPE html>, <html>, <head>, <body>\n- Use ONLY inline CSS styles — no <style> blocks, no external stylesheets, no <script> tags\n- Use table-based layout for email client compatibility\n- Make it visually stunning: clean typography, good whitespace, professional color palette\n- Include: branded header area, compelling headline, body sections with engaging copy, a prominent CTA button, footer with unsubscribe placeholder\n- Use a max-width of 600px centered layout (standard email width)\n- Default color scheme: clean white background, dark text (#333), accent color #E91A44 for CTA buttons and highlights\n- Write STELLAR copywriting: compelling headlines, engaging opening hooks, scannable body with subheadings, clear and urgent CTAs\n- Make the copy feel human, warm, and persuasive — not robotic or generic\n- The HTML must be production-ready email code that renders beautifully\n- If the user provides image URLs or data URIs, embed them directly in the HTML using <img> tags\n- Typical question flow: topic/angle → target audience → tone/voice → key CTA/goal\n\nCOVER IMAGE FLOW (newsletters only):\n- When the user says "Now suggest 4 creative cover image options for this newsletter", respond with a FORMAT 1 question\n- Your question text should be: "Would you like me to generate a cover image for this newsletter? Here are 4 concepts inspired by your content:"\n- Provide exactly 4 creative, SPECIFIC cover image concepts as options — each one should be a vivid 1-2 sentence visual description tied to the newsletter topic, mentioning style (photographic/illustration/3D/etc.), key visual elements, and mood\n- Add a 5th option: "No thanks, the newsletter looks great as is"\n- Example options: "A cinematic wide-angle photo of [specific subject from newsletter] bathed in warm golden light, with bold sans-serif headline overlay in brand colors", "A sleek 3D render of [concept from newsletter] floating on a gradient from [brand color] to deep navy, modern and premium feel"\n- When the user selects a cover image option (not the 'No thanks' option), respond with FORMAT 3 (cover_image type) with a 150-250 word art-director-quality prompt\n- If the user says "No thanks" or similar, respond with a simple question asking if there is anything else they want to change\n- NEVER generate a cover image without asking first`,
    placeholder: 'Describe your newsletter idea...',
    ctaText: 'Ask the Newsletter AI to help you come up with ideas, edit your newsletter or even write one from scratch! Make sure to give it good context!',
    canvasTitle: 'Canvas',
    emptyText: 'Your newsletter will appear here',
    readyText: 'Your newsletter is ready! Check the canvas on the right.',
  },
  landing: {
    systemPrompt: `You are an elite landing page designer and conversion copywriter working inside the PuerlyPersonal AI CEO platform. Your job is to help users create stunning, high-converting landing pages.\n\n${SHARED_RULES}\n\nHTML REQUIREMENTS:\n- Generate a COMPLETE, standalone HTML page with <!DOCTYPE html>, <html>, <head>, <body>\n- Use modern CSS (inline styles or a single <style> block in <head>) — no external stylesheets, no <script> tags\n- Make it visually stunning: modern design, bold hero section, clean typography, professional color palette\n- Include: hero section with headline + subheadline, value proposition bullets, social proof/testimonials, feature sections, a prominent CTA button, footer\n- Use a max-width of 1200px centered responsive layout\n- Default color scheme: clean white background, dark text (#333), accent color #E91A44 for CTA buttons and highlights\n- Write STELLAR conversion copy: compelling headline, clear value proposition, urgency-driven CTA\n- Make the page mobile-responsive with media queries\n- Typical question flow: product/offer → target audience → key benefit/angle → CTA goal`,
    placeholder: 'Describe your landing page...',
    ctaText: 'Ask the Landing Page AI to design and build high-converting landing pages for your products, services, or offers!',
    canvasTitle: 'Canvas',
    emptyText: 'Your landing page will appear here',
    readyText: 'Your landing page is ready! Check the canvas on the right.',
    canvasActions: [
      { label: 'Import From Template', style: 'outline', hasChevron: true, isTemplateToggle: true },
      { label: 'Copy Code', style: 'primary', hasChevron: true, isCopyCode: true },
      { label: 'Deploy to Netlify', style: 'netlify', isNetlifyDeploy: true },
    ],
    templates: [
      { id: 'lp-1', name: 'Danny 1' },
      { id: 'lp-2', name: 'Danny 2' },
      { id: 'lp-3', name: 'Danny 3' },
      { id: 'lp-4', name: 'Danny 4' },
    ],
  },
  squeeze: {
    systemPrompt: `You are an elite squeeze page designer and lead generation expert working inside the PuerlyPersonal AI CEO platform. Your job is to help users create stunning, high-converting squeeze/opt-in pages that capture email addresses.\n\n${SHARED_RULES}\n\nHTML REQUIREMENTS:\n- Generate a COMPLETE, standalone HTML page with <!DOCTYPE html>, <html>, <head>, <body>\n- Use modern CSS (inline styles or a single <style> block in <head>) — no external stylesheets, no <script> tags\n- Make it visually striking and focused: minimal distractions, one clear action\n- Include: bold headline promising value, 3-4 bullet points of what they get, email opt-in form (with placeholder action), urgency element, trust badges or social proof\n- Use a max-width of 600px centered layout — squeeze pages are narrow and focused\n- Default color scheme: clean white background, dark text (#333), accent color #E91A44 for CTA buttons and highlights\n- Write COMPELLING copy: curiosity-driven headline, benefit-focused bullets, action-oriented CTA button text\n- Make the page mobile-responsive\n- Typical question flow: lead magnet/offer → target audience → main hook/angle → urgency element`,
    placeholder: 'Describe your squeeze page...',
    ctaText: 'Ask the Squeeze Page AI to create high-converting opt-in pages that capture leads and grow your email list!',
    canvasTitle: 'Canvas',
    emptyText: 'Your squeeze page will appear here',
    readyText: 'Your squeeze page is ready! Check the canvas on the right.',
    canvasActions: [
      { label: 'Import From Template', style: 'outline', hasChevron: true, isTemplateToggle: true },
      { label: 'Copy Code', style: 'primary', hasChevron: true, isCopyCode: true },
      { label: 'Deploy to Netlify', style: 'netlify', isNetlifyDeploy: true },
    ],
    templates: [
      { id: 'sp-1', name: 'Danny 1' },
      { id: 'sp-2', name: 'Danny 2' },
      { id: 'sp-3', name: 'Danny 3' },
      { id: 'sp-4', name: 'Danny 4' },
    ],
  },
  story: {
    systemPrompt: `You are an elite Instagram Story sequence strategist and visual content designer working inside the PurelyPersonal AI CEO platform. Your job is to help users create compelling 3-5 frame Instagram Story sequences that tell a story, engage viewers, and drive action.

${SHARED_RULES}

ADDITIONAL FORMAT — STORY SEQUENCE (use this instead of newsletter/html when generating stories):
{"type":"story_sequence","frames":[{"title":"Frame title","caption":"Short caption overlay text (max 15 words)","image_prompt":"Detailed image generation prompt for this frame. Include: style, composition, colors, text overlays, mood."},...],"summary":"Brief description"}

RULES FOR STORY SEQUENCES:
- Generate exactly 3-5 frames that tell a cohesive visual story
- Each frame should flow naturally into the next (beginning → middle → end/CTA)
- Frame 1: Hook/attention grabber
- Middle frames: Value/story/content
- Last frame: CTA (swipe up, link in bio, DM us, etc.)
- Image prompts must be highly detailed for professional Instagram story generation (1080x1920 portrait)
- Captions should be punchy, short (max 15 words), suitable for story text overlays
- Think like a top social media manager — trendy, on-brand, scroll-stopping
- Typical question flow: brand/topic → target audience → story goal (educate/sell/engage) → visual style preference`,
    placeholder: 'Describe your Instagram story sequence...',
    ctaText: 'Ask the Story Sequence AI to craft stunning multi-frame Instagram story sequences that captivate your audience!',
    canvasTitle: 'Story Sequence',
    emptyText: 'Your story sequence will appear here',
    readyText: 'Your story sequence is ready! Check the canvas on the right.',
    canvasActions: [
      { label: 'Download All', style: 'outline' },
      { label: 'Schedule Stories', style: 'primary' },
    ],
    canvasEmptyType: 'story-sequence',
  },
  leadmagnet: {
    systemPrompt: `You are an elite lead magnet designer and content strategist working inside the PuerlyPersonal AI CEO platform. Your job is to help users create irresistible lead magnets (PDFs, checklists, guides, cheat sheets, templates) that attract and convert their ideal audience.\n\n${SHARED_RULES}\n\nHTML REQUIREMENTS:\n- Generate a COMPLETE, standalone HTML document that serves as a beautiful, printable lead magnet\n- Use modern CSS (inline styles or a single <style> block in <head>) — no external stylesheets, no <script> tags\n- Make it visually stunning and professional: clean layout, branded feel, easy to scan\n- Include: eye-catching cover/title section, table of contents (if applicable), well-structured content sections, actionable tips/steps, branded footer with CTA\n- Use a max-width of 800px centered layout (document/PDF style)\n- Default color scheme: clean white background, dark text (#333), accent color #E91A44 for headings and highlights\n- Write HIGH-VALUE content: practical, actionable, specific — make the reader feel they got a steal\n- Format as appropriate for the type: checklist with checkboxes, guide with numbered sections, cheat sheet with quick-reference layout\n- Typical question flow: topic/niche → target audience → lead magnet type (checklist/guide/cheat sheet) → key outcomes`,
    placeholder: 'Describe your lead magnet idea...',
    ctaText: 'Ask the Lead Magnet AI to create irresistible lead magnets — checklists, guides, cheat sheets, and more — that grow your list!',
    canvasTitle: 'Canvas',
    emptyText: 'Your lead magnet will appear here',
    readyText: 'Your lead magnet is ready! Check the canvas on the right.',
  },
  dm: {
    systemPrompt: `You are an elite DM (direct message) automation strategist and copywriter working inside the PuerlyPersonal AI CEO platform. Your job is to help users create high-converting DM message sequences for Instagram, LinkedIn, Twitter/X, and other platforms.\n\n${SHARED_RULES}\n\nHTML REQUIREMENTS:\n- Generate a COMPLETE, standalone HTML document that displays the DM sequence as a visual chat-style preview\n- Use modern CSS (inline styles or a single <style> block in <head>) — no external stylesheets, no <script> tags\n- Show each message as a chat bubble with: message number, trigger/condition (e.g. "After they reply YES"), the message text, timing delay\n- Include visual branching for different responses (e.g. "If they say X → send Y")\n- Make it look like a real DM conversation flow: chat bubbles, alternating sides, clear sequence\n- Use a max-width of 500px centered layout (mobile chat feel)\n- Default color scheme: clean white background, dark text (#333), accent color #E91A44 for user's outgoing messages\n- Write NATURAL, conversational copy: no salesy language, feels like a real human DM, builds rapport before pitching\n- Include 5-8 messages in the sequence by default with branching logic\n- Typical question flow: platform → goal (sales/booking/engagement) → product/service → audience type`,
    placeholder: 'Describe your DM automation flow...',
    ctaText: 'Ask the DM Automation AI to craft high-converting DM sequences that turn followers into customers!',
    canvasTitle: 'Canvas',
    emptyText: 'Your DM sequence will appear here',
    readyText: 'Your DM sequence is ready! Check the canvas on the right.',
    canvasEmptyType: 'dm-flow',
    canvasActions: [
      { label: 'Import From Template', style: 'outline', hasChevron: true, isTemplateToggle: true },
      { label: 'Publish In BooSend', style: 'boosend', iconSrc: '/BooSend_Logo_Light.png' },
    ],
    templates: [
      { id: 'bs-1', name: 'Comment → Lead Magnet', desc: 'Watch for a keyword in your comments and deliver your resource to the lead after making sure they follow you.' },
      { id: 'bs-2', name: 'Comment → Lead Magnet (No Follow Check)', desc: 'Watch for a keyword in your Instagram comments and deliver the free resource without checking if they follow you.' },
      { id: 'bs-3', name: 'Live Comment → Link', desc: 'Deliver links to live stream viewers that leave a comment with a keyword.' },
      { id: 'bs-4', name: 'Inbox Lead Watcher', desc: 'AI automation that triggers when someone messages potentially interested in your services and qualifies them for you.' },
      { id: 'bs-5', name: 'Voice Note Lead Welcome', desc: 'Welcome new leads from your Instagram stories with voice notes and tag them so you can follow up later.' },
      { id: 'bs-6', name: 'Comment → AI Appt Setter', desc: 'Deliver a lead magnet to people that comment on your post, then use an AI Agent to set up a sales call.' },
      { id: 'bs-7', name: 'Story → Quiz Funnel', desc: 'Respond when users reply to your story with a keyword and take them through a quiz before sending them to a link.' },
      { id: 'bs-8', name: 'Comment → Newsletter Signup', desc: 'Monitor your comments for a keyword and automatically collect emails from people before delivering a resource.' },
      { id: 'bs-9', name: 'Inbox Agent', desc: 'Create an AI Agent that will reply to your incoming messages to either answer questions or book appointments for you.' },
    ],
  },
};

// ── Landing Page Agent (Kimi 2.5 on Railway) ──
const LANDING_AGENT_URL = import.meta.env.VITE_LANDING_AGENT_URL || 'https://landing-page-agent-production-b414.up.railway.app';

async function streamFromLandingAgent({ endpoint, body, onChunk, onStatus, abortSignal }) {
  // Step 1: POST to create job
  const submitRes = await fetch(`${LANDING_AGENT_URL}${endpoint}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
    signal: abortSignal,
  });

  if (!submitRes.ok) {
    const errText = await submitRes.text().catch(() => 'Unknown error');
    throw new Error(errText);
  }

  const { jobId } = await submitRes.json();
  if (!jobId) throw new Error('No job ID returned');

  // Step 2: GET SSE stream for the job
  const streamRes = await fetch(`${LANDING_AGENT_URL}/stream/${jobId}`, {
    signal: abortSignal,
  });

  if (!streamRes.ok) {
    const errText = await streamRes.text().catch(() => 'Unknown error');
    throw new Error(errText);
  }

  const reader = streamRes.body?.getReader();
  if (!reader) throw new Error('No response body');

  const decoder = new TextDecoder();
  let buffer = '';
  let finalContent = '';

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split('\n');
    buffer = lines.pop() || '';
    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed || !trimmed.startsWith('data: ')) continue;
      const data = trimmed.slice(6);
      if (data === '[DONE]') continue;
      try {
        const parsed = JSON.parse(data);
        if (parsed.type === 'status' && onStatus) onStatus(parsed.text);
        if (parsed.type === 'chunk') { finalContent = parsed.content; if (onChunk) onChunk(parsed.content); }
        if (parsed.type === 'done') { finalContent = parsed.content; if (onChunk) onChunk(parsed.content); }
        if (parsed.type === 'error') throw new Error(parsed.error);
      } catch (e) {
        if (e.message && !e.message.includes('JSON')) throw e;
      }
    }
  }
  return finalContent;
}

// ── Streaming ──
async function streamToolResponse(messages, systemPrompt, onChunk, abortSignal, { searchMode = false } = {}) {
  const body = {
    model: 'grok-3-fast',
    messages: [{ role: 'system', content: systemPrompt }, ...messages],
    stream: true,
  };
  if (searchMode) {
    body.search_parameters = { mode: 'auto' };
  }
  const res = await fetch('/api/xai/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${import.meta.env.VITE_XAI_API_KEY}`,
    },
    body: JSON.stringify(body),
    signal: abortSignal,
  });

  if (!res.ok) throw new Error(await res.text());

  const reader = res.body?.getReader();
  if (!reader) throw new Error('No response body');

  const decoder = new TextDecoder();
  let fullContent = '';
  let buffer = '';

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split('\n');
    buffer = lines.pop() || '';
    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed || !trimmed.startsWith('data: ')) continue;
      const data = trimmed.slice(6);
      if (data === '[DONE]') continue;
      try {
        const delta = JSON.parse(data).choices?.[0]?.delta?.content;
        if (delta) { fullContent += delta; onChunk(fullContent); }
      } catch { /* skip */ }
    }
  }
  return fullContent;
}

// ── Helpers ──
function tryParseAIResponse(text) {
  // Strip markdown code fences if AI wraps in them
  let cleaned = text.trim();
  if (cleaned.startsWith('```')) {
    cleaned = cleaned.replace(/^```(?:json)?\s*/, '').replace(/\s*```$/, '');
  }
  try {
    const parsed = JSON.parse(cleaned);
    if (parsed.type === 'question' && parsed.text && Array.isArray(parsed.options)) {
      return parsed;
    }
    if ((parsed.type === 'newsletter' || parsed.type === 'html') && typeof parsed.html === 'string') {
      return parsed;
    }
    if (parsed.type === 'story_sequence' && Array.isArray(parsed.frames)) {
      return parsed;
    }
    if (parsed.type === 'cover_image' && typeof parsed.prompt === 'string') {
      return parsed;
    }
  } catch {
    // not valid JSON
  }
  return null;
}

// Build system prompt with brand DNA injected
function buildToolSystemPrompt(basePrompt, brandDna) {
  let prompt = basePrompt;
  if (brandDna) {
    // Replace default accent color with brand primary
    const primary = brandDna.colors?.primary || '#E91A44';
    prompt = prompt.replace(/accent color #E91A44/g, () => `accent color ${primary}`);

    let section = '\n\n=== BRAND DNA (USE THESE IN ALL DESIGNS) ===\n';
    if (brandDna.description) section += `Brand Description: ${brandDna.description}\n`;
    if (brandDna.main_font) section += `Main Font: ${brandDna.main_font}\n`;
    if (brandDna.secondary_font) section += `Secondary Font: ${brandDna.secondary_font}\n`;
    if (brandDna.colors) {
      const c = brandDna.colors;
      if (c.primary) section += `Primary Color: ${c.primary}\n`;
      if (c.text) section += `Text Color: ${c.text}\n`;
      if (c.secondary) section += `Secondary Color: ${c.secondary}\n`;
    }
    section += `\nCRITICAL: Use the brand colors, fonts, and identity listed above in all generated designs. Replace default colors with these brand colors.\n`;
    prompt += section;
  }
  return prompt;
}

// Insert cover image into newsletter HTML
function insertCoverImage(html, imgSrc) {
  const bodyMatch = html.match(/<body[^>]*>/i);
  if (bodyMatch) {
    const idx = html.indexOf(bodyMatch[0]) + bodyMatch[0].length;
    const imgTag = `<div style="text-align:center;margin:0 auto;max-width:600px;"><img src="${imgSrc}" alt="Newsletter Cover" style="width:100%;height:auto;display:block;" /></div>`;
    return html.slice(0, idx) + imgTag + html.slice(idx);
  }
  return `<img src="${imgSrc}" alt="Newsletter Cover" style="width:100%;max-width:600px;height:auto;display:block;margin:0 auto;" />` + html;
}

function extractStreamingHtml(text) {
  // Try to extract partial HTML from a streaming newsletter response
  const htmlMatch = text.match(/"html"\s*:\s*"([\s\S]*)$/);
  if (htmlMatch) {
    let html = htmlMatch[1];
    // Remove trailing unfinished JSON
    if (html.endsWith('"}')) html = html.slice(0, -2);
    else if (html.endsWith('"')) html = html.slice(0, -1);
    // Unescape JSON string escapes
    try {
      html = JSON.parse('"' + html + '"');
    } catch {
      html = html.replace(/\\n/g, '\n').replace(/\\t/g, '\t').replace(/\\"/g, '"').replace(/\\\\/g, '\\');
    }
    return html;
  }
  return null;
}

// ── Constants ──
const TABS = [
  { id: 'label', label: 'Tools', isLabel: true },
  { id: 'newsletter', label: 'Newsletter AI' },
  { id: 'landing', label: 'Landing Page AI' },
  { id: 'squeeze', label: 'Squeeze Page AI' },
  { id: 'story', label: 'Story Sequence AI' },
  { id: 'leadmagnet', label: 'Lead Magnet AI' },
  { id: 'dm', label: 'DM Automation AI' },
];

function GhostCard({ icon, lines, className }) {
  return (
    <div className={`mkt-ghost ${className}`}>
      <div className="mkt-ghost-header">
        <div className="mkt-ghost-icon">{icon}</div>
        <div className="mkt-ghost-title-line" />
      </div>
      <div className="mkt-ghost-lines">
        {lines.map((w, i) => (
          <div key={i} className="mkt-ghost-line" style={{ width: w }} />
        ))}
      </div>
    </div>
  );
}

const CONTEXT_CATEGORIES = [
  {
    id: 'newsletters',
    label: 'Past Newsletters',
    iconSrc: '/icon-marketing.png',
    items: [
      { id: 'nl-1', name: 'Weekly Growth Tips #42', date: 'Mar 3' },
      { id: 'nl-2', name: 'Product Launch Announcement', date: 'Feb 24' },
      { id: 'nl-3', name: 'Year-End Recap & Vision', date: 'Feb 10' },
      { id: 'nl-4', name: 'Community Spotlight — Feb', date: 'Feb 3' },
      { id: 'nl-5', name: 'Weekly Growth Tips #41', date: 'Jan 27' },
    ],
  },
  {
    id: 'emails',
    label: 'Past Emails',
    iconSrc: '/icon-inbox.png',
    items: MOCK_EMAILS.map((e) => ({
      id: `em-${e.id}`,
      name: e.subject,
      date: e.date,
      sub: e.from,
    })),
  },
  {
    id: 'calls',
    label: 'Calls',
    iconSrc: '/fireflies-square-logo.png',
    items: MOCK_CALLS.map((c) => ({
      id: `cl-${c.id}`,
      name: c.name,
      date: c.date.replace(', 2026', ''),
      sub: c.callType,
    })),
  },
  {
    id: 'content',
    label: 'Content',
    iconSrc: '/icon-create-content.png',
    items: [
      { id: 'ct-1', name: '5 Tips for Scaling Your Biz', date: 'Mar 6', sub: 'Instagram' },
      { id: 'ct-2', name: 'Behind the Scenes — My Morning', date: 'Mar 4', sub: 'YouTube' },
      { id: 'ct-3', name: 'Client Transformation Story', date: 'Mar 2', sub: 'LinkedIn' },
      { id: 'ct-4', name: 'How I Grew to 10K Subs', date: 'Feb 28', sub: 'Instagram' },
    ],
  },
  {
    id: 'products',
    label: 'Products',
    iconSrc: '/icon-products.png',
    items: INITIAL_PRODUCTS.map((p) => ({
      id: `pr-${p.id}`,
      name: p.name,
      sub: `${p.type} · $${p.price}`,
    })),
  },
];

// ── Story Sequence React Flow Canvas ──
const STORY_W = 150;
const STAGGER_X = 200;
const STAGGER_Y = 340; // 267px card height + 73px gap for edge

function StoryCardNode({ data }) {
  return (
    <div className="sf-card">
      <Handle type="target" position={Position.Top} className="sf-handle" />
      <div className="sf-card-inner">
        {data.loading ? (
          <div className="sf-card-loading">
            <span className="mkt-msg-dots"><span /><span /><span /></span>
          </div>
        ) : data.imageSrc ? (
          <img src={data.imageSrc} alt={data.caption} className="sf-card-img" />
        ) : (
          <div className="sf-card-empty">
            <div className="mkt-story-ig-icon" />
          </div>
        )}
        <div className="sf-card-overlay">
          <span className="sf-card-num">Story {data.index + 1}</span>
          {data.caption && <span className="sf-card-caption">{data.caption}</span>}
        </div>
      </div>
      <Handle type="source" position={Position.Bottom} className="sf-handle" />
    </div>
  );
}

const storyNodeTypes = { storyCard: StoryCardNode };

function StoryFlowCanvas({ frames }) {
  const nodes = useMemo(() =>
    frames.map((f, i) => ({
      id: `story-${i}`,
      type: 'storyCard',
      position: {
        x: (i % 2 === 0 ? 0 : STAGGER_X),
        y: i * STAGGER_Y,
      },
      data: { ...f, index: i },
      draggable: false,
      selectable: false,
      connectable: false,
    })),
  [frames]);

  const edges = useMemo(() =>
    frames.slice(0, -1).map((_, i) => ({
      id: `e-${i}`,
      source: `story-${i}`,
      target: `story-${i + 1}`,
      type: 'smoothstep',
      animated: true,
      style: { stroke: '#c8c8cc', strokeWidth: 2, strokeDasharray: '8 4' },
      sourceHandle: null,
      targetHandle: null,
    })),
  [frames]);

  return (
    <div className="sf-canvas">
      <ReactFlow
        nodes={nodes}
        edges={edges}
        nodeTypes={storyNodeTypes}
        fitView
        fitViewOptions={{ padding: 0.4 }}
        nodesDraggable={false}
        nodesConnectable={false}
        elementsSelectable={false}
        panOnDrag
        zoomOnScroll
        zoomOnPinch
        minZoom={0.2}
        maxZoom={2}
        proOptions={{ hideAttribution: true }}
      >
        <Background color="#e5e7eb" gap={20} size={1} />
      </ReactFlow>
    </div>
  );
}

// ── Interactive DM Flow Canvas (pan & zoom, auto-fit) ──
const DM_CW = 1900, DM_CH = 280;

function DmFlowView() {
  const vpRef = useRef(null);
  const [tf, setTf] = useState({ x: 0, y: 0, s: 0.7 });
  const panRef = useRef({ active: false, lx: 0, ly: 0 });
  const pinchRef = useRef(0);

  const fitView = useCallback(() => {
    const el = vpRef.current;
    if (!el) return;
    const vw = el.clientWidth, vh = el.clientHeight;
    const s = Math.min((vw * 0.92) / DM_CW, (vh * 0.92) / DM_CH, 1.5);
    setTf({ x: (vw - DM_CW * s) / 2, y: (vh - DM_CH * s) / 2, s });
  }, []);

  // Fit on mount + resize
  useEffect(() => {
    fitView();
    const el = vpRef.current;
    if (!el) return;
    const obs = new ResizeObserver(fitView);
    obs.observe(el);
    return () => obs.disconnect();
  }, [fitView]);

  // Wheel zoom toward cursor
  useEffect(() => {
    const el = vpRef.current;
    if (!el) return;
    const h = (e) => {
      e.preventDefault();
      const r = el.getBoundingClientRect();
      const mx = e.clientX - r.left, my = e.clientY - r.top;
      setTf(p => {
        const ns = Math.min(Math.max(p.s * (e.deltaY > 0 ? 0.92 : 1.08), 0.15), 2.5);
        const ratio = ns / p.s;
        return { x: mx - ratio * (mx - p.x), y: my - ratio * (my - p.y), s: ns };
      });
    };
    el.addEventListener('wheel', h, { passive: false });
    return () => el.removeEventListener('wheel', h);
  }, []);

  // Touch pan & pinch zoom
  useEffect(() => {
    const el = vpRef.current;
    if (!el) return;
    const onTS = (e) => {
      if (e.touches.length === 1) {
        panRef.current = { active: true, lx: e.touches[0].clientX, ly: e.touches[0].clientY };
      } else if (e.touches.length === 2) {
        panRef.current.active = false;
        const dx = e.touches[0].clientX - e.touches[1].clientX;
        const dy = e.touches[0].clientY - e.touches[1].clientY;
        pinchRef.current = Math.hypot(dx, dy);
        panRef.current.lx = (e.touches[0].clientX + e.touches[1].clientX) / 2;
        panRef.current.ly = (e.touches[0].clientY + e.touches[1].clientY) / 2;
      }
    };
    const onTM = (e) => {
      e.preventDefault();
      if (e.touches.length === 1 && panRef.current.active) {
        const dx = e.touches[0].clientX - panRef.current.lx;
        const dy = e.touches[0].clientY - panRef.current.ly;
        panRef.current.lx = e.touches[0].clientX;
        panRef.current.ly = e.touches[0].clientY;
        setTf(p => ({ ...p, x: p.x + dx, y: p.y + dy }));
      } else if (e.touches.length === 2 && pinchRef.current > 0) {
        const dx = e.touches[0].clientX - e.touches[1].clientX;
        const dy = e.touches[0].clientY - e.touches[1].clientY;
        const dist = Math.hypot(dx, dy);
        const midX = (e.touches[0].clientX + e.touches[1].clientX) / 2;
        const midY = (e.touches[0].clientY + e.touches[1].clientY) / 2;
        const rect = el.getBoundingClientRect();
        const mx = midX - rect.left, my = midY - rect.top;
        const factor = dist / pinchRef.current;
        const panDx = midX - panRef.current.lx;
        const panDy = midY - panRef.current.ly;
        setTf(p => {
          const ns = Math.min(Math.max(p.s * factor, 0.15), 2.5);
          const r = ns / p.s;
          return { x: mx - r * (mx - p.x) + panDx, y: my - r * (my - p.y) + panDy, s: ns };
        });
        pinchRef.current = dist;
        panRef.current.lx = midX;
        panRef.current.ly = midY;
      }
    };
    const onTE = () => { panRef.current.active = false; pinchRef.current = 0; };
    el.addEventListener('touchstart', onTS, { passive: true });
    el.addEventListener('touchmove', onTM, { passive: false });
    el.addEventListener('touchend', onTE);
    return () => { el.removeEventListener('touchstart', onTS); el.removeEventListener('touchmove', onTM); el.removeEventListener('touchend', onTE); };
  }, []);

  // Mouse pan
  const onMD = useCallback((e) => {
    if (e.button !== 0) return;
    panRef.current = { active: true, lx: e.clientX, ly: e.clientY };
    e.currentTarget.style.cursor = 'grabbing';
  }, []);
  const onMM = useCallback((e) => {
    if (!panRef.current.active) return;
    const dx = e.clientX - panRef.current.lx, dy = e.clientY - panRef.current.ly;
    panRef.current.lx = e.clientX;
    panRef.current.ly = e.clientY;
    setTf(p => ({ ...p, x: p.x + dx, y: p.y + dy }));
  }, []);
  const onMU = useCallback(() => {
    panRef.current.active = false;
    if (vpRef.current) vpRef.current.style.cursor = 'grab';
  }, []);

  return (
    <div
      ref={vpRef}
      className="dmflow-viewport"
      onMouseDown={onMD}
      onMouseMove={onMM}
      onMouseUp={onMU}
      onMouseLeave={onMU}
      onDoubleClick={fitView}
    >
      <div
        className="dmflow-canvas"
        style={{ transform: `translate(${tf.x}px, ${tf.y}px) scale(${tf.s})` }}
      >
        {/* SVG edges — bezier curves matching ReactFlow */}
        <svg className="dmflow-edges">
          <defs>
            <marker id="dmflow-arrow" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse">
              <path d="M 0 0 L 10 5 L 0 10 z" fill="#6b7280" />
            </marker>
          </defs>
          <path d="M 358 120 C 440 120, 440 100, 522 100" stroke="#6b7280" strokeWidth="2" fill="none" markerEnd="url(#dmflow-arrow)" />
          <path d="M 808 100 C 914 100, 914 84, 1020 84" stroke="#6b7280" strokeWidth="2" fill="none" markerEnd="url(#dmflow-arrow)" />
          <path d="M 1318 84 C 1369 84, 1369 106, 1420 106" stroke="#6b7280" strokeWidth="2" fill="none" markerEnd="url(#dmflow-arrow)" />
        </svg>

        {/* Node 1: Trigger */}
        <div className="dmflow-node dmflow-trigger" style={{ left: 30, top: 40 }}>
          <div className="dmflow-handle dmflow-handle--right" />
          <div className="dmflow-handle-label">Next Step</div>
          <div className="dmflow-trigger-header">
            <img src="https://i.postimg.cc/cJnkg6sZ/boosend-logo.png" alt="" className="dmflow-logo-lg" />
            <h4 className="dmflow-trigger-title">AI Intent Recognition</h4>
          </div>
          <div className="dmflow-trigger-body">
            <p className="dmflow-trigger-label">Prompt:</p>
            <div className="dmflow-trigger-prompt">
              <p>&quot;Trigger whenever a person messages us asking for help automating their DMs&quot;</p>
            </div>
          </div>
        </div>

        {/* Node 2: Delay */}
        <div className="dmflow-node dmflow-delay" style={{ left: 530, top: 40 }}>
          <div className="dmflow-handle dmflow-handle--left" />
          <div className="dmflow-handle dmflow-handle--right-white" />
          <div className="dmflow-delay-header">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#4b5563" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10" /><polyline points="12 6 12 12 16 14" /></svg>
            <h4 className="dmflow-delay-title">Delay</h4>
          </div>
          <div className="dmflow-delay-body">
            <span>This is a </span>
            <span className="dmflow-pill-dark">Randomized</span>
            <span> delay.</span>
            <div className="dmflow-delay-values">
              <span>The delay is between </span>
              <span className="dmflow-val-underline">15</span>
              <span> and </span>
              <span className="dmflow-val-underline">60</span>
              <span className="dmflow-pill-dark">Minutes</span>
              <span>.</span>
            </div>
          </div>
        </div>

        {/* Node 3: AI Agent */}
        <div className="dmflow-node dmflow-agent" style={{ left: 1030, top: 40 }}>
          <div className="dmflow-handle dmflow-handle--left-dark" />
          <div className="dmflow-handle dmflow-handle--right-dark" />
          <div className="dmflow-handle-label dmflow-handle-label--dark">Next Step</div>
          <div className="dmflow-handle dmflow-handle--bottom-blue" />
          <div className="dmflow-handle-label-bottom">Tools</div>
          <div className="dmflow-agent-header">
            <img src="https://i.postimg.cc/cJnkg6sZ/boosend-logo.png" alt="" className="dmflow-logo-lg" />
            <div className="dmflow-agent-info">
              <h4 className="dmflow-agent-title">AI Agent</h4>
              <div className="dmflow-agent-meta">
                <span className="dmflow-agent-type">Basic Agent</span>
                <span className="dmflow-agent-steps">7 steps</span>
              </div>
            </div>
          </div>
        </div>

        {/* Node 4: AI Extractor */}
        <div className="dmflow-node dmflow-extractor" style={{ left: 1430, top: 40 }}>
          <div className="dmflow-handle dmflow-handle--left-dark" />
          <div className="dmflow-handle dmflow-handle--right-dark-sm" />
          <div className="dmflow-handle-label dmflow-handle-label--dark dmflow-handle-label--ext">Next Step</div>
          <div className="dmflow-extractor-header">
            <img src="https://i.postimg.cc/cJnkg6sZ/boosend-logo.png" alt="" className="dmflow-logo-lg" />
            <div className="dmflow-extractor-info">
              <h4 className="dmflow-extractor-title">AI Extractor</h4>
              <span className="dmflow-agent-steps">2 fields</span>
            </div>
          </div>
          <div className="dmflow-extractor-fields">
            <span className="dmflow-field-pill">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="2" y="4" width="20" height="16" rx="2"/><path d="m22 7-8.97 5.7a1.94 1.94 0 0 1-2.06 0L2 7"/></svg>
              Email
            </span>
            <span className="dmflow-field-pill">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7A2 2 0 0 1 22 16.92z"/></svg>
              Phone
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}

function ToolTab({ config, activeTool, brandDna }) {
  // Existing state
  const [chatInput, setChatInput] = useState('');
  const [splitPercent, setSplitPercent] = useState(50);
  const [contextOpen, setContextOpen] = useState(false);
  const [hoveredCat, setHoveredCat] = useState(null);
  const [selectedItems, setSelectedItems] = useState(new Set());
  const [researchMode, setResearchMode] = useState(false);

  // Chat state
  const [messages, setMessages] = useState([]);
  const [chatMessages, setChatMessages] = useState([]);
  const [isGenerating, setIsGenerating] = useState(false);
  const [generatingText, setGeneratingText] = useState('');
  const [currentQuestion, setCurrentQuestion] = useState(null);
  const [customTyping, setCustomTyping] = useState(false);
  const [customText, setCustomText] = useState('');
  const [canvasHtml, setCanvasHtml] = useState('');
  const [storyFrames, setStoryFrames] = useState([]); // [{ title, caption, image_prompt, imageSrc, loading }]
  const [uploadedFiles, setUploadedFiles] = useState([]); // { id, name, type, dataUrl?, textContent?, size }
  const [templateDropdownOpen, setTemplateDropdownOpen] = useState(false);
  const [copyCodeOpen, setCopyCodeOpen] = useState(false);
  const [deploying, setDeploying] = useState(false);
  const [deployResult, setDeployResult] = useState(null); // { url, site_name }

  const splitRef = useRef(null);
  const contextRef = useRef(null);
  const dragging = useRef(false);
  const abortRef = useRef(null);
  const messagesEndRef = useRef(null);
  const textareaRef = useRef(null);
  const fileInputRef = useRef(null);
  const canvasBodyRef = useRef(null);
  const templateRef = useRef(null);
  const copyCodeRef = useRef(null);
  const iframeRef = useRef(null);

  const chatStarted = chatMessages.length > 0;

  // Cycle generating status text
  useEffect(() => {
    if (!isGenerating) { setGeneratingText(''); return; }
    const phrases = [
      'Thinking...', 'Analyzing your request...', 'Crafting the design...',
      'Writing copy...', 'Polishing layout...', 'Almost there...',
    ];
    let i = 0;
    setGeneratingText(phrases[0]);
    const interval = setInterval(() => {
      i = (i + 1) % phrases.length;
      setGeneratingText(phrases[i]);
    }, 3000);
    return () => clearInterval(interval);
  }, [isGenerating]);

  // Auto-scroll chat
  useEffect(() => {
    if (messagesEndRef.current) {
      messagesEndRef.current.scrollIntoView({ behavior: 'smooth' });
    }
  }, [chatMessages, isGenerating]);

  // Auto-resize textarea whenever chatInput changes (including programmatic clears)
  useEffect(() => {
    const el = textareaRef.current;
    if (!el) return;
    if (!chatInput) {
      // Reset to CSS default height without jarring snap
      el.style.height = '';
      return;
    }
    el.style.height = 'auto';
    el.style.height = Math.min(el.scrollHeight, 160) + 'px';
  }, [chatInput]);

  // Write HTML directly into iframe document (avoids srcDoc reload flash)
  useEffect(() => {
    const iframe = iframeRef.current;
    if (!iframe) return;
    const doc = iframe.contentDocument;
    if (!doc) return;
    if (canvasHtml) {
      doc.open();
      doc.write(canvasHtml);
      doc.close();
    } else {
      doc.open();
      doc.write('<html><body></body></html>');
      doc.close();
    }
  }, [canvasHtml]);

  // Scale newsletter iframe to fit canvas width
  useEffect(() => {
    const container = canvasBodyRef.current;
    if (!container) return;
    const update = () => {
      const iframe = iframeRef.current;
      if (!iframe) return;
      const w = container.clientWidth;
      if (w < 620) {
        const scale = w / 620;
        iframe.style.transform = `scale(${scale})`;
        iframe.style.transformOrigin = 'top left';
        iframe.style.width = '620px';
        iframe.style.height = `${100 / scale}%`;
      } else {
        iframe.style.transform = '';
        iframe.style.transformOrigin = '';
        iframe.style.width = '100%';
        iframe.style.height = '100%';
      }
    };
    const observer = new ResizeObserver(update);
    observer.observe(container);
    return () => observer.disconnect();
  }, [canvasHtml]);

  // Context helpers
  const toggleItem = (itemId) => {
    setSelectedItems((prev) => {
      const next = new Set(prev);
      if (next.has(itemId)) next.delete(itemId);
      else next.add(itemId);
      return next;
    });
  };

  const removeItem = (itemId) => {
    setSelectedItems((prev) => {
      const next = new Set(prev);
      next.delete(itemId);
      return next;
    });
  };

  const getSelectedItemDetails = () => {
    const results = [];
    for (const cat of CONTEXT_CATEGORIES) {
      for (const item of cat.items) {
        if (selectedItems.has(item.id)) {
          results.push({ ...item, catLabel: cat.label });
        }
      }
    }
    return results;
  };

  // Build context string for AI
  const buildContextString = () => {
    const items = getSelectedItemDetails();
    if (items.length === 0) return '';
    const parts = items.map((i) => `${i.catLabel}: "${i.name}"${i.sub ? ` (${i.sub})` : ''}${i.date ? ` — ${i.date}` : ''}`);
    return `[CONTEXT — The user has selected the following items for reference:\n${parts.join('\n')}\nUse this context to inform your questions and generated content.]\n\n`;
  };

  // File upload handler
  const handleFileUpload = (e) => {
    const files = Array.from(e.target.files);
    files.forEach((file) => {
      const id = `file-${Date.now()}-${Math.random().toString(36).slice(2)}`;
      const isImage = file.type.startsWith('image/');

      if (isImage) {
        const reader = new FileReader();
        reader.onload = (ev) => {
          setUploadedFiles((prev) => [...prev, {
            id,
            name: file.name,
            type: 'image',
            dataUrl: ev.target.result,
            size: file.size,
          }]);
        };
        reader.readAsDataURL(file);
      } else {
        // Read as text for documents
        const reader = new FileReader();
        reader.onload = (ev) => {
          setUploadedFiles((prev) => [...prev, {
            id,
            name: file.name,
            type: 'document',
            textContent: ev.target.result,
            size: file.size,
          }]);
        };
        reader.readAsText(file);
      }
    });
    e.target.value = '';
  };

  const removeFile = (fileId) => {
    setUploadedFiles((prev) => prev.filter((f) => f.id !== fileId));
  };

  // Build file context for AI message (uses placeholders for images to avoid token overflow)
  const buildFileContext = () => {
    if (uploadedFiles.length === 0) return '';
    const parts = [];
    const images = uploadedFiles.filter((f) => f.type === 'image');
    const docs = uploadedFiles.filter((f) => f.type === 'document');
    if (images.length > 0) {
      parts.push(`[UPLOADED IMAGES — The user has uploaded ${images.length} image(s). When you include them in the HTML output, use exactly this src value for each image:\n${images.map((img) => `- "${img.name}": src="{{IMAGE:${img.id}}}"`).join('\n')}\nDo NOT modify the placeholder src values. Use them exactly as shown above.]`);
    }
    if (docs.length > 0) {
      parts.push(`[UPLOADED DOCUMENTS — The user has uploaded ${docs.length} document(s) as additional context:\n${docs.map((doc) => `- "${doc.name}":\n${doc.textContent.slice(0, 3000)}`).join('\n\n')}\n]`);
    }
    return parts.join('\n\n') + '\n\n';
  };

  // Replace image placeholders in HTML with actual data URIs
  const replaceImagePlaceholders = (html, files) => {
    let result = html;
    for (const file of files) {
      if (file.type === 'image' && file.dataUrl) {
        result = result.replaceAll(`{{IMAGE:${file.id}}}`, file.dataUrl);
      }
    }
    return result;
  };

  // Send message
  const sendMessage = useCallback(async (text) => {
    if (!text.trim() || isGenerating) return;

    // Capture files before clearing so we can replace placeholders later
    const filesSnapshot = [...uploadedFiles];

    // Build the content — inject context on first message, files always, edit mode when canvas exists
    const isFirstMessage = messages.length === 0;
    const contextStr = isFirstMessage ? buildContextString() : '';
    const fileContext = buildFileContext();
    const editContext = canvasHtml && !isFirstMessage
      ? `[EDIT MODE — The user already has generated output. Here is the current HTML. Make ONLY the changes they request — do NOT rewrite from scratch unless they explicitly ask:\n${canvasHtml}\n]\n\n`
      : '';
    const userContent = contextStr + fileContext + editContext + text.trim();

    const userMsg = { role: 'user', content: userContent };
    const newMessages = [...messages, userMsg];
    setMessages(newMessages);
    const imageChips = filesSnapshot
      .filter((f) => f.type === 'image')
      .map((f) => ({ id: f.id, name: f.name, dataUrl: f.dataUrl }));
    setChatMessages((prev) => [...prev, { id: `msg-${Date.now()}-user`, role: 'user', text: text.trim(), images: imageChips }]);
    setChatInput('');
    setCurrentQuestion(null);
    setCustomTyping(false);
    setCustomText('');
    setUploadedFiles([]);
    setIsGenerating(true);

    abortRef.current = new AbortController();

    try {
      let fullContent;

      // Route landing page requests through Kimi 2.5 agent on Railway
      if (activeTool === 'landing' || activeTool === 'squeeze') {
        const isEdit = canvasHtml && !isFirstMessage;

        fullContent = await streamFromLandingAgent({
          endpoint: isEdit ? '/edit' : '/generate',
          body: isEdit
            ? { currentHtml: canvasHtml, instruction: text.trim(), conversationHistory: messages, brandDna: brandDna || null }
            : { messages: newMessages, brandDna: brandDna || null },
          onChunk: (chunk) => {
            // Try to extract HTML for live preview while streaming
            if (chunk.includes('"type":"html"') || chunk.includes('"type": "html"') ||
                chunk.includes('"type":"newsletter"') || chunk.includes('"type": "newsletter"')) {
              let html = extractStreamingHtml(chunk);
              if (html) {
                html = replaceImagePlaceholders(html, filesSnapshot);
                setCanvasHtml(html);
              }
            }
          },
          onStatus: (statusText) => {
            setChatMessages((prev) => {
              const last = prev[prev.length - 1];
              if (last?.isStatus) return [...prev.slice(0, -1), { ...last, text: statusText }];
              return [...prev, { id: `status-${Date.now()}`, role: 'assistant', text: statusText, isStatus: true }];
            });
          },
          abortSignal: abortRef.current.signal,
        });
      } else {
        const systemPrompt = buildToolSystemPrompt(config.systemPrompt, brandDna);
        fullContent = await streamToolResponse(
          newMessages,
          systemPrompt,
          (chunk) => {
            // While streaming, try to extract HTML for live preview
            if (chunk.includes('"type":"newsletter"') || chunk.includes('"type": "newsletter"')) {
              let html = extractStreamingHtml(chunk);
              if (html) {
                html = replaceImagePlaceholders(html, filesSnapshot);
                setCanvasHtml(html);
              }
            }
          },
          abortRef.current.signal,
          { searchMode: researchMode },
        );
      }

      // Remove status messages
      setChatMessages((prev) => prev.filter((m) => !m.isStatus));

      // Parse the final response
      const parsed = tryParseAIResponse(fullContent);
      const assistantMsg = { role: 'assistant', content: fullContent };
      setMessages((prev) => [...prev, assistantMsg]);

      if (parsed?.type === 'question') {
        setCurrentQuestion({ text: parsed.text, options: parsed.options });
        setChatMessages((prev) => [...prev, { id: `msg-${Date.now()}-assistant`, role: 'assistant', text: parsed.text }]);
      } else if (parsed?.type === 'cover_image') {
        // Generate cover image and inject into newsletter
        setChatMessages((prev) => [...prev, { id: `msg-${Date.now()}-generating`, role: 'assistant', text: 'Generating your cover image...' }]);
        try {
          const brandData = brandDna ? {
            photoUrls: brandDna.photo_urls || [],
            logoUrl: brandDna.logo_url || null,
            colors: brandDna.colors || {},
            mainFont: brandDna.main_font || null,
          } : null;
          const result = await generateImage(parsed.prompt, 'newsletter', brandData);
          const allowedMime = ['image/png', 'image/jpeg', 'image/gif', 'image/webp'];
          if (result.image && allowedMime.includes(result.image.mimeType)) {
            const src = `data:${result.image.mimeType};base64,${result.image.data}`;
            setCanvasHtml((prev) => insertCoverImage(prev, src));
            setChatMessages((prev) => [
              ...prev.filter((m) => !m.id?.includes('-generating')),
              { id: `msg-${Date.now()}-assistant`, role: 'assistant', text: 'Cover image generated and added to your newsletter!' },
            ]);
          }
        } catch (imgErr) {
          setChatMessages((prev) => [
            ...prev.filter((m) => !m.id?.includes('-generating')),
            { id: `msg-${Date.now()}-err`, role: 'assistant', text: `Failed to generate cover image: ${imgErr.message}` },
          ]);
        }
      } else if (parsed?.type === 'story_sequence') {
        // Initialize frames with loading state
        const frames = parsed.frames.map((f, i) => ({
          ...f,
          imageSrc: null,
          loading: true,
          id: i,
        }));
        setStoryFrames(frames);
        setChatMessages((prev) => [...prev, { id: `msg-${Date.now()}-assistant`, role: 'assistant', text: parsed.summary || `Generating ${frames.length} story frames...` }]);

        // Generate all images in parallel
        const brandData = brandDna ? {
          photoUrls: brandDna.photo_urls || [],
          logoUrl: brandDna.logo_url || null,
          colors: brandDna.colors || {},
          mainFont: brandDna.main_font || null,
        } : null;

        await Promise.allSettled(
          frames.map(async (frame, idx) => {
            try {
              const result = await generateImage(frame.image_prompt, 'instagram_story', brandData);
              const allowedMime = ['image/png', 'image/jpeg', 'image/gif', 'image/webp'];
              if (result.image && allowedMime.includes(result.image.mimeType)) {
                const src = `data:${result.image.mimeType};base64,${result.image.data}`;
                setStoryFrames((prev) => prev.map((f, i) => i === idx ? { ...f, imageSrc: src, loading: false } : f));
              } else {
                setStoryFrames((prev) => prev.map((f, i) => i === idx ? { ...f, loading: false } : f));
              }
            } catch {
              setStoryFrames((prev) => prev.map((f, i) => i === idx ? { ...f, loading: false } : f));
            }
          })
        );

        setChatMessages((prev) => [...prev, { id: `msg-${Date.now()}-done`, role: 'assistant', text: 'All story frames generated! Check the canvas.' }]);
      } else if (parsed?.type === 'newsletter' || parsed?.type === 'html') {
        const finalHtml = replaceImagePlaceholders(parsed.html, filesSnapshot);
        setCanvasHtml(finalHtml);
        setChatMessages((prev) => [...prev, { id: `msg-${Date.now()}-assistant`, role: 'assistant', text: parsed.summary || config.readyText }]);

        // For newsletters, automatically ask about cover image generation
        if (activeTool === 'newsletter') {
          // Fire a follow-up AI call to get context-specific cover image suggestions
          try {
            const coverSuggestMsg = { role: 'user', content: 'Now suggest 4 creative cover image options for this newsletter.' };
            const coverMessages = [...newMessages, assistantMsg, coverSuggestMsg];
            const coverContent = await streamToolResponse(
              coverMessages,
              systemPrompt,
              () => {},
              abortRef.current.signal,
              { searchMode: false },
            );
            const coverParsed = tryParseAIResponse(coverContent);
            if (coverParsed?.type === 'question') {
              // Add the hidden request + AI response to conversation history so the AI has context when user picks an option
              setMessages((prev) => [...prev, coverSuggestMsg, { role: 'assistant', content: coverContent }]);
              setCurrentQuestion({ text: coverParsed.text, options: coverParsed.options });
              setChatMessages((prev) => [...prev, { id: `msg-${Date.now()}-cover-q`, role: 'assistant', text: coverParsed.text }]);
            }
          } catch {
            // Cover image suggestion failed silently — not critical
          }
        }
      } else {
        // Fallback — show raw text
        setChatMessages((prev) => [...prev, { id: `msg-${Date.now()}-assistant`, role: 'assistant', text: fullContent.slice(0, 500) }]);
      }
    } catch (err) {
      if (err.name !== 'AbortError') {
        setChatMessages((prev) => [
          ...prev.filter((m) => !m.isStatus),
          { id: `msg-${Date.now()}-err`, role: 'assistant', text: 'Something went wrong. Please try again.' },
        ]);
      }
    } finally {
      setIsGenerating(false);
    }
  }, [messages, isGenerating, selectedItems, uploadedFiles, canvasHtml, config, activeTool, brandDna, researchMode]);

  // Handle send button / enter key
  const handleSend = () => {
    if (chatInput.trim() && !isGenerating) sendMessage(chatInput);
  };

  const handleKeyDown = (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  // Click outside context dropdown
  useEffect(() => {
    if (!contextOpen) return;
    const handleClickOutside = (e) => {
      if (contextRef.current && !contextRef.current.contains(e.target)) {
        setContextOpen(false);
        setHoveredCat(null);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [contextOpen]);

  // Click outside template dropdown
  useEffect(() => {
    if (!templateDropdownOpen) return;
    const handleClickOutside = (e) => {
      if (templateRef.current && !templateRef.current.contains(e.target)) {
        setTemplateDropdownOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [templateDropdownOpen]);

  // Click outside copy code dropdown
  useEffect(() => {
    if (!copyCodeOpen) return;
    const handleClickOutside = (e) => {
      if (copyCodeRef.current && !copyCodeRef.current.contains(e.target)) {
        setCopyCodeOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [copyCodeOpen]);

  const handleCopyCode = () => {
    if (!canvasHtml) return;
    navigator.clipboard.writeText(canvasHtml);
    setCopyCodeOpen(false);
  };

  const handleDownloadFile = () => {
    if (!canvasHtml) return;
    const blob = new Blob([canvasHtml], { type: 'text/html' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'page.html';
    a.click();
    URL.revokeObjectURL(url);
    setCopyCodeOpen(false);
  };

  const handleCopyAsPrompt = () => {
    if (!canvasHtml) return;
    navigator.clipboard.writeText(canvasHtml);
  };

  const handleNetlifyDeploy = async () => {
    if (!canvasHtml || deploying) return;
    setDeploying(true);
    setDeployResult(null);
    try {
      const result = await deployToNetlify(canvasHtml);
      setDeployResult(result);
      setChatMessages((prev) => [...prev, {
        id: `msg-${Date.now()}-deploy`,
        role: 'assistant',
        text: `Deployed to Netlify! Your page is live at ${result.url}`,
      }]);
    } catch (err) {
      setChatMessages((prev) => [...prev, {
        id: `msg-${Date.now()}-deploy-err`,
        role: 'assistant',
        text: `Deploy failed: ${err.message}`,
      }]);
    } finally {
      setDeploying(false);
    }
  };

  // Cleanup abort on unmount
  useEffect(() => {
    return () => {
      if (abortRef.current) abortRef.current.abort();
    };
  }, []);

  // Drag handle — supports mouse + touch, horizontal (desktop) + vertical (mobile)
  const getPointerPercent = useCallback((clientX, clientY) => {
    if (!splitRef.current) return null;
    const rect = splitRef.current.getBoundingClientRect();
    const isVertical = window.matchMedia('(max-width: 900px)').matches;
    const pos = isVertical ? clientY - rect.top : clientX - rect.left;
    const size = isVertical ? rect.height : rect.width;
    return Math.min(Math.max((pos / size) * 100, 25), 75);
  }, []);

  const startDrag = useCallback((e) => {
    e.preventDefault();
    dragging.current = true;
    splitRef.current?.classList.add('mkt-split--dragging');
    const isVertical = window.matchMedia('(max-width: 900px)').matches;
    document.body.style.cursor = isVertical ? 'row-resize' : 'col-resize';
    document.body.style.userSelect = 'none';
  }, []);

  useEffect(() => {
    const onMove = (e) => {
      if (!dragging.current) return;
      const clientX = e.touches ? e.touches[0].clientX : e.clientX;
      const clientY = e.touches ? e.touches[0].clientY : e.clientY;
      const pct = getPointerPercent(clientX, clientY);
      if (pct !== null) setSplitPercent(pct);
    };
    const onEnd = () => {
      if (dragging.current) {
        dragging.current = false;
        splitRef.current?.classList.remove('mkt-split--dragging');
        document.body.style.cursor = '';
        document.body.style.userSelect = '';
      }
    };
    document.addEventListener('mousemove', onMove);
    document.addEventListener('mouseup', onEnd);
    document.addEventListener('touchmove', onMove, { passive: false });
    document.addEventListener('touchend', onEnd);
    return () => {
      document.removeEventListener('mousemove', onMove);
      document.removeEventListener('mouseup', onEnd);
      document.removeEventListener('touchmove', onMove);
      document.removeEventListener('touchend', onEnd);
    };
  }, [getPointerPercent]);

  return (
    <div className="mkt-split" ref={splitRef}>
      {/* Left — chat area */}
      <div className="mkt-split-left" style={{ flex: `0 0 ${splitPercent}%` }}>

        {/* Ghost cards + CTA (shown when no chat) */}
        {!chatStarted && (
          <div className="mkt-split-left-bg">
            <GhostCard className="mkt-ghost--1" icon={<Mail size={18} />} lines={['80%', '55%', '70%']} />
            <GhostCard className="mkt-ghost--2" icon={<Send size={18} />} lines={['90%', '65%', '45%', '75%']} />
            <GhostCard className="mkt-ghost--3" icon={<Users size={18} />} lines={['70%', '85%', '50%']} />
            <GhostCard className="mkt-ghost--4" icon={<BarChart3 size={18} />} lines={['95%', '60%', '80%']} />
            <GhostCard className="mkt-ghost--5" icon={<Megaphone size={18} />} lines={['75%', '50%', '65%']} />
            <GhostCard className="mkt-ghost--6" icon={<Inbox size={18} />} lines={['85%', '55%', '70%']} />
            <GhostCard className="mkt-ghost--7" icon={<FileText size={18} />} lines={['60%', '90%', '45%']} />
            <GhostCard className="mkt-ghost--8" icon={<PenTool size={18} />} lines={['75%', '65%', '85%']} />
            <div className="mkt-center-cta">
              <img src="/our-square-logo.png" alt="Logo" className="mkt-center-logo" />
              <p className="mkt-center-text">
                {config.ctaText}
              </p>
            </div>
          </div>
        )}

        {/* Chat messages (shown when chat started) */}
        {chatStarted && (
          <div className="mkt-messages">
            {chatMessages.map((msg) => (
              <div key={msg.id} className={`mkt-msg-row mkt-msg-row--${msg.role}`}>
                <div className={`mkt-msg mkt-msg--${msg.role}`}>
                  {msg.text}
                </div>
                {msg.images?.length > 0 && (
                  <div className="mkt-msg-images">
                    {msg.images.map((img) => (
                      <span key={img.id} className="mkt-msg-image-chip">
                        <img src={img.dataUrl} alt={img.name} className="mkt-msg-image-thumb" />
                        <span className="mkt-msg-image-name">{img.name}</span>
                      </span>
                    ))}
                  </div>
                )}
              </div>
            ))}
            {isGenerating && (
              <div className="mkt-msg-row mkt-msg-row--assistant">
                <div className="mkt-msg mkt-msg--assistant mkt-msg--generating">
                  <span className="mkt-msg-dots"><span /><span /><span /></span>
                  <span className="mkt-generating-text">{generatingText}</span>
                </div>
              </div>
            )}
            <div ref={messagesEndRef} />
          </div>
        )}

        {/* Question overlay — slides up from bottom */}
        <div className={`mkt-question-overlay ${currentQuestion ? 'mkt-question-overlay--visible' : 'mkt-question-overlay--hidden'}`}>
          {currentQuestion && (
            <>
              <p className="mkt-question-text">{currentQuestion.text}</p>
              {!customTyping ? (
                <div className="mkt-question-options">
                  {currentQuestion.options.map((opt, i) => (
                    <button
                      key={i}
                      className="mkt-question-option"
                      onClick={() => sendMessage(opt)}
                    >
                      {opt}
                    </button>
                  ))}
                  <button
                    className="mkt-question-option mkt-question-option--custom"
                    onClick={() => setCustomTyping(true)}
                  >
                    Type your own...
                  </button>
                </div>
              ) : (
                <div className="mkt-question-custom-row">
                  <input
                    className="mkt-question-custom-input"
                    placeholder="Type your answer..."
                    value={customText}
                    onChange={(e) => setCustomText(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' && customText.trim()) {
                        sendMessage(customText);
                      }
                    }}
                    autoFocus
                  />
                  <button
                    className="mkt-question-custom-send"
                    disabled={!customText.trim()}
                    onClick={() => sendMessage(customText)}
                  >
                    <ArrowUp size={16} />
                  </button>
                </div>
              )}
            </>
          )}
        </div>

        {/* Chat input */}
        <div className="mkt-chat-area">
          <div className="mkt-chat-input-wrapper">
            <div className="mkt-chat-top-row">
              <div className="mkt-ctx-anchor" ref={contextRef}>
                <button className="mkt-ctx-trigger" onClick={() => { setContextOpen((v) => !v); setHoveredCat(null); }}>
                  <Plus size={13} /> Add Context
                </button>
                {contextOpen && (
                  <div className="mkt-ctx-dropdown">
                    <div className="mkt-ctx-dropdown-header">Select Context</div>
                    {CONTEXT_CATEGORIES.map((cat) => {
                      const selectedCount = cat.items.filter((i) => selectedItems.has(i.id)).length;
                      return (
                        <div
                          key={cat.id}
                          className={`mkt-ctx-cat ${hoveredCat === cat.id ? 'mkt-ctx-cat--active' : ''}`}
                          onMouseEnter={() => setHoveredCat(cat.id)}
                        >
                          <div className="mkt-ctx-cat-icon">
                            <img src={cat.iconSrc} alt={cat.label} className="mkt-ctx-cat-img" />
                          </div>
                          <span className="mkt-ctx-cat-label">{cat.label}</span>
                          {selectedCount > 0 && (
                            <span className="mkt-ctx-cat-badge">{selectedCount}</span>
                          )}
                          <ChevronRight size={13} className="mkt-ctx-cat-arrow" />
                          {hoveredCat === cat.id && (
                            <div className="mkt-ctx-sub">
                              <div className="mkt-ctx-sub-header">{cat.label}</div>
                              {cat.items.map((item) => (
                                <div
                                  key={item.id}
                                  className={`mkt-ctx-sub-item ${selectedItems.has(item.id) ? 'mkt-ctx-sub-item--on' : ''}`}
                                  onClick={() => toggleItem(item.id)}
                                >
                                  <div className="mkt-ctx-sub-info">
                                    <span className="mkt-ctx-sub-name">{item.name}</span>
                                    <span className="mkt-ctx-sub-meta">
                                      {item.sub && <span>{item.sub}</span>}
                                      {item.sub && item.date && <span className="mkt-ctx-sub-dot" />}
                                      {item.date && <span>{item.date}</span>}
                                    </span>
                                  </div>
                                  <div className={`mkt-ctx-radio ${selectedItems.has(item.id) ? 'mkt-ctx-radio--on' : ''}`}>
                                    <div className="mkt-ctx-radio-fill" />
                                  </div>
                                </div>
                              ))}
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
              <button
                className={`mkt-research-toggle ${researchMode ? 'mkt-research-toggle--active' : ''}`}
                onClick={() => setResearchMode((v) => !v)}
                title="Enable web research mode"
              >
                <Globe size={13} /> Research
              </button>
              {selectedItems.size > 0 && (
                <div className="mkt-ctx-pills">
                  {getSelectedItemDetails().map((item) => (
                    <span key={item.id} className="mkt-ctx-pill">
                      {item.name}
                      <button className="mkt-ctx-pill-x" onClick={() => removeItem(item.id)}>
                        <X size={10} />
                      </button>
                    </span>
                  ))}
                </div>
              )}
              {uploadedFiles.length > 0 && (
                <div className="mkt-ctx-pills">
                  {uploadedFiles.map((file) => (
                    <span key={file.id} className={`mkt-ctx-pill ${file.type === 'image' ? 'mkt-ctx-pill--image' : 'mkt-ctx-pill--doc'}`}>
                      {file.type === 'image' && <img src={file.dataUrl} alt="" className="mkt-file-thumb" />}
                      {file.name}
                      <button className="mkt-ctx-pill-x" onClick={() => removeFile(file.id)}>
                        <X size={10} />
                      </button>
                    </span>
                  ))}
                </div>
              )}
            </div>
            <div className="mkt-chat-bottom-row">
              <button
                className="mkt-file-btn"
                onClick={() => fileInputRef.current?.click()}
                title="Upload files"
              >
                <Paperclip size={16} />
              </button>
              <input
                ref={fileInputRef}
                type="file"
                multiple
                accept="image/*,.pdf,.txt,.doc,.docx,.md,.csv,.json"
                onChange={handleFileUpload}
                style={{ display: 'none' }}
              />
              <textarea
                ref={textareaRef}
                className="mkt-chat-input"
                placeholder={config.placeholder}
                value={chatInput}
                onChange={(e) => setChatInput(e.target.value)}
                onKeyDown={handleKeyDown}
                rows={1}
              />
              <button
                className="mkt-chat-send"
                disabled={!chatInput.trim() || isGenerating}
                onClick={handleSend}
              >
                <ArrowUp size={16} />
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* Divider with drag handle */}
      <div
        className="mkt-split-divider"
        onMouseDown={startDrag}
        onTouchStart={startDrag}
      >
        <div className="mkt-split-handle" />
      </div>

      {/* Right — canvas */}
      <div className="mkt-split-right" style={{ flex: `0 0 ${100 - splitPercent}%` }}>
        <div className="mkt-canvas-header">
          <span className="mkt-canvas-title">{config.canvasTitle}</span>
          <div className="mkt-canvas-actions">
            {config.canvasActions ? (
              config.canvasActions.map((action, i) =>
                action.isTemplateToggle && config.templates ? (
                  <div key={i} className="mkt-template-anchor" ref={templateRef}>
                    <button
                      className={`mkt-canvas-btn mkt-canvas-btn--${action.style}`}
                      onClick={() => setTemplateDropdownOpen((v) => !v)}
                    >
                      {action.label}
                      <ChevronDown size={14} />
                    </button>
                    {templateDropdownOpen && (
                      <div className="mkt-template-dropdown">
                        <div className="mkt-template-dropdown-header">Choose a Template</div>
                        {config.templates.map((tpl) => (
                          <button
                            key={tpl.id}
                            className="mkt-template-item"
                            onClick={() => {
                              setTemplateDropdownOpen(false);
                              sendMessage(`Generate output based on the "${tpl.name}" template${tpl.desc ? ': ' + tpl.desc : ''}`);
                            }}
                          >
                            <span className="mkt-template-item-name">{tpl.name}</span>
                            <span className="mkt-template-item-desc">{tpl.desc}</span>
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                ) : action.isCopyCode ? (
                  <div key={i} className="mkt-template-anchor" ref={copyCodeRef}>
                    <button
                      className={`mkt-canvas-btn mkt-canvas-btn--${action.style}`}
                      onClick={() => setCopyCodeOpen((v) => !v)}
                    >
                      {action.label}
                      <ChevronDown size={14} />
                    </button>
                    {copyCodeOpen && (
                      <div className="mkt-copycode-dropdown">
                        <button className="mkt-copycode-item" onClick={() => { handleCopyAsPrompt(); setCopyCodeOpen(false); }}>
                          Copy As Prompt
                        </button>
                        <button className="mkt-copycode-item" onClick={handleCopyCode}>
                          Copy Code
                        </button>
                        <button className="mkt-copycode-item" onClick={handleDownloadFile}>
                          Download File
                        </button>
                      </div>
                    )}
                  </div>
                ) : action.isNetlifyDeploy ? (
                  <button
                    key={i}
                    className={`mkt-canvas-btn mkt-canvas-btn--netlify${deploying ? ' mkt-canvas-btn--loading' : ''}`}
                    onClick={handleNetlifyDeploy}
                    disabled={deploying}
                    title={deploying ? 'Deploying...' : deployResult ? 'Redeploy to Netlify' : 'Deploy to Netlify'}
                  >
                    {deploying ? <Loader size={16} className="mkt-spinner" /> : <>Deploy to <img src="/icon-netlify-white.webp" alt="Netlify" className="mkt-netlify-btn-logo" /></>}
                  </button>
                ) : (
                  <button
                    key={i}
                    className={`mkt-canvas-btn mkt-canvas-btn--${action.style}`}
                    onClick={action.label === 'Copy As Prompt' ? handleCopyAsPrompt : undefined}
                  >
                    {action.iconSrc && <img src={action.iconSrc} alt="" className="mkt-canvas-btn-icon" />}
                    {action.label}
                    {action.hasChevron && <ChevronDown size={14} />}
                  </button>
                )
              )
            ) : (
              <>
                <button className="mkt-canvas-btn mkt-canvas-btn--outline">
                  Import From Template <ChevronDown size={14} />
                </button>
                <button className="mkt-canvas-btn mkt-canvas-btn--outline">
                  Save As Template
                </button>
                <button className="mkt-canvas-btn mkt-canvas-btn--primary">
                  Send Email
                </button>
              </>
            )}
          </div>
        </div>
        {deployResult && (
          <div className="mkt-deploy-banner">
            <span className="mkt-deploy-banner-dot" />
            Live at{' '}
            <a href={deployResult.url} target="_blank" rel="noopener noreferrer" className="mkt-deploy-banner-link">
              {deployResult.url}
            </a>
          </div>
        )}
        <div className="mkt-canvas-body" ref={canvasBodyRef}>
          <iframe
            ref={iframeRef}
            className="mkt-canvas-iframe"
            title="Preview"
            sandbox="allow-same-origin"
          />
          {config.canvasEmptyType === 'story-sequence' && storyFrames.length > 0 && (
            <StoryFlowCanvas frames={storyFrames} />
          )}
          {config.canvasEmptyType === 'story-sequence' && storyFrames.length === 0 && !canvasHtml && (
            <div className="mkt-canvas-empty mkt-canvas-empty--story">
              <div className="mkt-story-flow">
                <div className="mkt-story-card mkt-story-card--left">
                  <div className="mkt-story-card-inner">
                    <div className="mkt-story-ig-icon" />
                    <div className="mkt-story-card-lines">
                      <div className="mkt-story-card-line" style={{ width: '70%' }} />
                      <div className="mkt-story-card-line" style={{ width: '50%' }} />
                    </div>
                  </div>
                </div>
                <div className="mkt-story-connector mkt-story-connector--lr">
                  <svg className="mkt-story-line" viewBox="0 0 260 90" fill="none">
                    <path d="M 100 -60 Q 120 -72, 142 -42 Q 168 -48, 185 -18 Q 210 8, 206 30" stroke="#d1d5db" strokeWidth="2" strokeDasharray="8 6" strokeLinecap="round" />
                  </svg>
                </div>
                <div className="mkt-story-card mkt-story-card--right">
                  <div className="mkt-story-card-inner">
                    <div className="mkt-story-ig-icon" />
                    <div className="mkt-story-card-lines">
                      <div className="mkt-story-card-line" style={{ width: '65%' }} />
                      <div className="mkt-story-card-line" style={{ width: '45%' }} />
                    </div>
                  </div>
                </div>
                <div className="mkt-story-connector mkt-story-connector--rl">
                  <svg className="mkt-story-line" viewBox="0 0 260 90" fill="none">
                    <path d="M 160 -60 Q 140 -72, 118 -42 Q 92 -48, 75 -18 Q 50 8, 46 30" stroke="#d1d5db" strokeWidth="2" strokeDasharray="8 6" strokeLinecap="round" />
                  </svg>
                </div>
                <div className="mkt-story-card mkt-story-card--left">
                  <div className="mkt-story-card-inner">
                    <div className="mkt-story-ig-icon" />
                    <div className="mkt-story-card-lines">
                      <div className="mkt-story-card-line" style={{ width: '60%' }} />
                      <div className="mkt-story-card-line" style={{ width: '75%' }} />
                    </div>
                  </div>
                </div>
                <div className="mkt-story-connector mkt-story-connector--lr">
                  <svg className="mkt-story-line" viewBox="0 0 260 90" fill="none">
                    <path d="M 100 -60 Q 118 -70, 140 -44 Q 170 -50, 188 -16 Q 212 10, 206 30" stroke="#d1d5db" strokeWidth="2" strokeDasharray="8 6" strokeLinecap="round" />
                  </svg>
                </div>
                <div className="mkt-story-card mkt-story-card--right">
                  <div className="mkt-story-card-inner">
                    <div className="mkt-story-ig-icon" />
                    <div className="mkt-story-card-lines">
                      <div className="mkt-story-card-line" style={{ width: '55%' }} />
                      <div className="mkt-story-card-line" style={{ width: '70%' }} />
                    </div>
                  </div>
                </div>
              </div>
              <p className="mkt-story-flow-text">{config.emptyText}</p>
            </div>
          )}
          {!canvasHtml && config.canvasEmptyType === 'dm-flow' && (
            <div className="mkt-canvas-empty mkt-canvas-empty--dmflow">
              <DmFlowView />
            </div>
          )}
          {!canvasHtml && !config.canvasEmptyType && (
            <div className="mkt-canvas-empty">
              <p>{config.emptyText}</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

export default function Marketing() {
  const [activeTab, setActiveTab] = useState('newsletter');
  const [brandDna, setBrandDna] = useState(null);

  // Load Brand DNA once on mount
  useEffect(() => {
    supabase.auth.getSession().then(async ({ data: { session } }) => {
      if (!session?.user) return;
      const { data, error } = await supabase
        .from('brand_dna')
        .select('*')
        .eq('user_id', session.user.id)
        .single();
      if (error) { console.error('Failed to load brand DNA:', error.message); return; }
      if (data) setBrandDna(data);
    }).catch((err) => console.error('Brand DNA load error:', err));
  }, []);

  return (
    <div className="marketing-page">
      <div className="marketing-tabs">
        {TABS.map((tab) =>
          tab.isLabel ? (
            <span key={tab.id} className="marketing-tab marketing-tab--label">
              {tab.label}
            </span>
          ) : (
            <button
              key={tab.id}
              className={`marketing-tab ${activeTab === tab.id ? 'marketing-tab--active' : ''}`}
              onClick={() => setActiveTab(tab.id)}
            >
              {tab.label}
            </button>
          )
        )}
      </div>
      <div className="marketing-content">
        <ToolTab config={TOOL_CONFIGS[activeTab]} activeTool={activeTab} brandDna={brandDna} key={activeTab} />
      </div>
    </div>
  );
}
