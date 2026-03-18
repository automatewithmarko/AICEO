import { useState, useRef, useCallback, useEffect, useMemo } from 'react';
import { Mail, Send, Users, BarChart3, Megaphone, Inbox, FileText, PenTool, ArrowUp, ChevronDown, Plus, X, ChevronRight, Paperclip, Globe, Search, PenLine } from 'lucide-react';
import { ReactFlow, Background, Handle, Position } from '@xyflow/react';
import '@xyflow/react/dist/style.css';
import { supabase } from '../lib/supabase';
import { generateImage, uploadImageToStorage, deployToNetlify, streamFromBackend, getEmailAccounts, getContacts, sendEmailApi, getTemplates, getTemplate, saveTemplate, deleteTemplate, getEmails, getSalesCalls, getProducts, getContentItems } from '../lib/api';
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
      { label: 'Save As Template', style: 'outline', isSaveTemplate: true },
      { label: 'Copy Code', style: 'primary', hasChevron: true, isCopyCode: true },
      { label: 'Deploy to Netlify', style: 'netlify', isNetlifyDeploy: true },
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
      { label: 'Save As Template', style: 'outline', isSaveTemplate: true },
      { label: 'Copy Code', style: 'primary', hasChevron: true, isCopyCode: true },
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

// All AI streaming is now handled server-side via /api/orchestrate

// ── Helpers ──
function tryParseAIResponse(text) {
  if (!text) return null;

  // Try multiple parsing strategies
  let parsed = null;

  // Strategy 1: direct parse
  try { parsed = JSON.parse(text.trim()); } catch {}

  // Strategy 2: strip markdown code fences
  if (!parsed) {
    let cleaned = text.trim();
    if (cleaned.startsWith('```')) {
      cleaned = cleaned.replace(/^```(?:json)?\s*/, '').replace(/\s*```$/, '');
    }
    try { parsed = JSON.parse(cleaned); } catch {}
  }

  // Strategy 3: extract JSON object from mixed content
  if (!parsed) {
    const objMatch = text.match(/\{[\s\S]*\}/);
    if (objMatch) {
      try { parsed = JSON.parse(objMatch[0]); } catch {}
    }
  }

  if (!parsed) {
    // Strategy 4: try to extract HTML from a partial/broken JSON response
    if (text.includes('"html"') && (text.includes('<!DOCTYPE') || text.includes('<html') || text.includes('<table'))) {
      const htmlMatch = text.match(/"html"\s*:\s*"([\s\S]+)/);
      if (htmlMatch) {
        let html = htmlMatch[1];
        try { html = JSON.parse('"' + html.replace(/"\s*[,}]\s*$/, '') + '"'); } catch {
          html = html.replace(/\\n/g, '\n').replace(/\\t/g, '\t').replace(/\\"/g, '"').replace(/\\\\/g, '\\').replace(/"\s*[,}]\s*$/, '');
        }
        if (html.includes('<')) {
          const isNewsletter = text.includes('"type":"newsletter"') || text.includes('"type": "newsletter"');
          return { type: isNewsletter ? 'newsletter' : 'html', html, summary: '' };
        }
      }
    }
    return null;
  }

  // Validate parsed response
  if (parsed.type === 'question' && parsed.text && Array.isArray(parsed.options)) return parsed;
  if ((parsed.type === 'newsletter' || parsed.type === 'html') && typeof parsed.html === 'string') return parsed;
  if (parsed.type === 'story_sequence' && Array.isArray(parsed.frames)) return parsed;
  if (parsed.type === 'cover_image' && typeof parsed.prompt === 'string') return parsed;
  if (parsed.type === 'edit' && typeof parsed.sections === 'object') return parsed;

  // If it has html field but wrong/missing type, still accept it
  if (typeof parsed.html === 'string' && parsed.html.includes('<')) {
    return { ...parsed, type: parsed.type || 'html' };
  }

  return null;
}

// System prompts with brand DNA are now built server-side in backend/agents/

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

// Merge section-based edits into existing HTML using section markers
function mergeSectionEdits(currentHtml, sections) {
  let result = currentHtml;
  for (const [sectionName, sectionHtml] of Object.entries(sections)) {
    const startMarker = `<!-- SECTION:${sectionName} -->`;
    const endMarker = `<!-- /SECTION:${sectionName} -->`;
    const startIdx = result.indexOf(startMarker);
    const endIdx = result.indexOf(endMarker);
    if (startIdx !== -1 && endIdx !== -1) {
      // Replace content between markers (inclusive of markers)
      result = result.slice(0, startIdx) + startMarker + '\n' + sectionHtml.trim() + '\n' + endMarker + result.slice(endIdx + endMarker.length);
    }
  }
  return result;
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

// Context categories are now fetched dynamically inside ToolTab

// ── Story Sequence Phone Viewer ──
function StoryPhoneViewer({ frames }) {
  const [activeIndex, setActiveIndex] = useState(0);
  const [paused, setPaused] = useState(false);
  const timerRef = useRef(null);
  const touchStartRef = useRef(null);
  const DURATION = 5000;

  const total = frames.length;
  const frame = frames[activeIndex] || {};

  // Auto-advance to first ready frame when images load
  const readyCount = frames.filter(f => f.imageSrc && !f.loading).length;
  const prevReadyRef = useRef(0);
  useEffect(() => {
    if (readyCount > prevReadyRef.current) {
      // A new image just loaded — jump to it if we're on a loading/empty frame
      const currentFrame = frames[activeIndex];
      if (!currentFrame?.imageSrc || currentFrame?.loading) {
        const firstReady = frames.findIndex(f => f.imageSrc && !f.loading);
        if (firstReady >= 0) setActiveIndex(firstReady);
      }
      prevReadyRef.current = readyCount;
    }
  }, [readyCount, frames, activeIndex]);

  // Autoplay timer — runs even on hover so navigation works, just skips auto-advance when paused
  useEffect(() => {
    if (total === 0) return;
    if (paused) return;
    timerRef.current = setTimeout(() => {
      setActiveIndex(prev => (prev + 1) % total);
    }, DURATION);
    return () => clearTimeout(timerRef.current);
  }, [paused, total, activeIndex]);

  const goPrev = (e) => {
    e.stopPropagation();
    setActiveIndex(prev => Math.max(0, prev - 1));
  };
  const goNext = (e) => {
    e.stopPropagation();
    setActiveIndex(prev => Math.min(total - 1, prev + 1));
  };

  // Touch/swipe handling
  const onTouchStart = (e) => { touchStartRef.current = e.touches[0].clientX; };
  const onTouchEnd = (e) => {
    if (touchStartRef.current === null) return;
    const diff = e.changedTouches[0].clientX - touchStartRef.current;
    if (Math.abs(diff) > 40) {
      if (diff < 0) setActiveIndex(prev => Math.min(total - 1, prev + 1));
      else setActiveIndex(prev => Math.max(0, prev - 1));
    }
    touchStartRef.current = null;
  };

  return (
    <div className="sp-wrapper">
      <div
        className="sp-phone"
        onMouseEnter={() => setPaused(true)}
        onMouseLeave={() => setPaused(false)}
        onTouchStart={onTouchStart}
        onTouchEnd={onTouchEnd}
      >
        {/* Timeline bars */}
        <div className="sp-timeline">
          {frames.map((_, i) => (
            <div key={i} className="sp-timeline-bar" onClick={() => setActiveIndex(i)}>
              <div
                className={`sp-timeline-fill ${i === activeIndex ? (paused ? 'sp-timeline-fill--paused' : 'sp-timeline-fill--active') : i < activeIndex ? 'sp-timeline-fill--done' : ''}`}
                style={i === activeIndex ? { animationDuration: `${DURATION}ms` } : undefined}
              />
            </div>
          ))}
        </div>

        {/* Left/Right tap zones */}
        <div className="sp-tap sp-tap--left" onClick={goPrev} />
        <div className="sp-tap sp-tap--right" onClick={goNext} />

        {/* Left/Right arrows (visible on hover) */}
        {activeIndex > 0 && (
          <button className="sp-arrow sp-arrow--left" onClick={goPrev}>
            <ChevronRight size={20} style={{ transform: 'rotate(180deg)' }} />
          </button>
        )}
        {activeIndex < total - 1 && (
          <button className="sp-arrow sp-arrow--right" onClick={goNext}>
            <ChevronRight size={20} />
          </button>
        )}

        {/* Frame content */}
        <div className="sp-frame">
          {frame.loading ? (
            <div className="sp-frame-loading">
              <span className="mkt-msg-dots"><span /><span /><span /></span>
            </div>
          ) : frame.imageSrc ? (
            <img src={frame.imageSrc} alt={frame.caption || ''} className="sp-frame-img" />
          ) : (
            <div className="sp-frame-empty">
              <div className="mkt-story-ig-icon" />
            </div>
          )}
          <div className="sp-frame-overlay">
            <span className="sp-frame-num">Story {activeIndex + 1} / {total}</span>
            {frame.caption && <span className="sp-frame-caption">{frame.caption}</span>}
          </div>
        </div>
      </div>
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

// ── Send Newsletter Modal ──
function SendNewsletterModal({ open, onClose, canvasHtml }) {
  const [accounts, setAccounts] = useState([]);
  const [contacts, setContacts] = useState([]);
  const [selectedAccount, setSelectedAccount] = useState('');
  const [selectedContacts, setSelectedContacts] = useState(new Set());
  const [searchQuery, setSearchQuery] = useState('');
  const [subject, setSubject] = useState('');
  const [sending, setSending] = useState(false);
  const [sendResult, setSendResult] = useState(null); // { success, failed, total }
  const [loading, setLoading] = useState(true);
  const [selectAll, setSelectAll] = useState(false);
  const [filterTag, setFilterTag] = useState('');

  // Load accounts and contacts on open
  useEffect(() => {
    if (!open) return;
    setLoading(true);
    setSendResult(null);
    Promise.all([getEmailAccounts(), getContacts()])
      .then(([accRes, conRes]) => {
        const accs = accRes.accounts || accRes || [];
        setAccounts(Array.isArray(accs) ? accs : []);
        const cons = conRes.contacts || conRes || [];
        setContacts(Array.isArray(cons) ? cons : []);
        if (Array.isArray(accs) && accs.length > 0) setSelectedAccount(accs[0].id);
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [open]);

  // Get all unique tags
  const allTags = useMemo(() => {
    const tags = new Set();
    contacts.forEach(c => {
      if (Array.isArray(c.tags)) c.tags.forEach(t => tags.add(t));
    });
    return Array.from(tags).sort();
  }, [contacts]);

  // Filter contacts
  const filteredContacts = useMemo(() => {
    let list = contacts.filter(c => c.email);
    if (searchQuery) {
      const q = searchQuery.toLowerCase();
      list = list.filter(c =>
        (c.name || '').toLowerCase().includes(q) ||
        (c.email || '').toLowerCase().includes(q) ||
        (c.business || '').toLowerCase().includes(q)
      );
    }
    if (filterTag) {
      list = list.filter(c => Array.isArray(c.tags) && c.tags.includes(filterTag));
    }
    return list;
  }, [contacts, searchQuery, filterTag]);

  // Toggle select all
  useEffect(() => {
    if (selectAll) {
      setSelectedContacts(new Set(filteredContacts.map(c => c.id)));
    }
  }, [selectAll, filteredContacts]);

  const toggleContact = (id) => {
    setSelectedContacts(prev => {
      const next = new Set(prev);
      if (next.has(id)) { next.delete(id); setSelectAll(false); }
      else next.add(id);
      return next;
    });
  };

  const handleSend = async () => {
    if (!selectedAccount || selectedContacts.size === 0 || !canvasHtml) return;
    setSending(true);
    setSendResult(null);

    const recipients = contacts.filter(c => selectedContacts.has(c.id) && c.email);
    let success = 0;
    let failed = 0;

    // Send in batches of 5 to avoid overwhelming the server
    for (let i = 0; i < recipients.length; i += 5) {
      const batch = recipients.slice(i, i + 5);
      const results = await Promise.allSettled(
        batch.map(contact =>
          sendEmailApi({
            account_id: selectedAccount,
            to: contact.email,
            subject: subject || 'Newsletter',
            body_html: canvasHtml,
            body_text: '',
          })
        )
      );
      results.forEach(r => {
        if (r.status === 'fulfilled') success++;
        else failed++;
      });
    }

    setSendResult({ success, failed, total: recipients.length });
    setSending(false);
  };

  if (!open) return null;

  return (
    <div className="send-nl-overlay" onClick={onClose}>
      <div className="send-nl-modal" onClick={e => e.stopPropagation()}>
        <div className="send-nl-header">
          <h3>Send Newsletter</h3>
          <button className="send-nl-close" onClick={onClose}><X size={18} /></button>
        </div>

        {loading ? (
          <div className="send-nl-loading">Loading accounts & contacts...</div>
        ) : sendResult ? (
          <div className="send-nl-result">
            <div className="send-nl-result-icon">{sendResult.failed === 0 ? '\u2713' : '\u26A0'}</div>
            <div className="send-nl-result-text">
              Sent to {sendResult.success} of {sendResult.total} contacts
              {sendResult.failed > 0 && <span className="send-nl-result-fail"> ({sendResult.failed} failed)</span>}
            </div>
            <button className="send-nl-btn send-nl-btn--primary" onClick={onClose}>Done</button>
          </div>
        ) : (
          <>
            {/* From Account */}
            <div className="send-nl-section">
              <label className="send-nl-label">From Account</label>
              {accounts.length === 0 ? (
                <div className="send-nl-empty">No email accounts connected. Go to Inbox to add one.</div>
              ) : (
                <select
                  className="send-nl-select"
                  value={selectedAccount}
                  onChange={e => setSelectedAccount(e.target.value)}
                >
                  {accounts.map(a => (
                    <option key={a.id} value={a.id}>{a.display_name || a.email} ({a.email})</option>
                  ))}
                </select>
              )}
            </div>

            {/* Subject */}
            <div className="send-nl-section">
              <label className="send-nl-label">Subject Line</label>
              <input
                className="send-nl-input"
                type="text"
                placeholder="Enter email subject..."
                value={subject}
                onChange={e => setSubject(e.target.value)}
              />
            </div>

            {/* Contact Selection */}
            <div className="send-nl-section send-nl-section--contacts">
              <label className="send-nl-label">
                Recipients
                <span className="send-nl-count">{selectedContacts.size} selected</span>
              </label>

              <div className="send-nl-filters">
                <div className="send-nl-search-wrap">
                  <Search size={14} />
                  <input
                    className="send-nl-search"
                    type="text"
                    placeholder="Search contacts..."
                    value={searchQuery}
                    onChange={e => setSearchQuery(e.target.value)}
                  />
                </div>
                {allTags.length > 0 && (
                  <select
                    className="send-nl-tag-filter"
                    value={filterTag}
                    onChange={e => setFilterTag(e.target.value)}
                  >
                    <option value="">All Tags</option>
                    {allTags.map(t => <option key={t} value={t}>{t}</option>)}
                  </select>
                )}
              </div>

              <div className="send-nl-select-all">
                <label>
                  <input
                    type="checkbox"
                    checked={selectAll}
                    onChange={e => {
                      setSelectAll(e.target.checked);
                      if (!e.target.checked) setSelectedContacts(new Set());
                    }}
                  />
                  Select All ({filteredContacts.length})
                </label>
              </div>

              <div className="send-nl-contact-list">
                {filteredContacts.length === 0 ? (
                  <div className="send-nl-empty">No contacts with email addresses found.</div>
                ) : (
                  filteredContacts.map(c => (
                    <label key={c.id} className={`send-nl-contact ${selectedContacts.has(c.id) ? 'send-nl-contact--selected' : ''}`}>
                      <input
                        type="checkbox"
                        checked={selectedContacts.has(c.id)}
                        onChange={() => toggleContact(c.id)}
                      />
                      <div className="send-nl-contact-info">
                        <span className="send-nl-contact-name">{c.name || c.email}</span>
                        <span className="send-nl-contact-email">{c.email}</span>
                      </div>
                      {Array.isArray(c.tags) && c.tags.length > 0 && (
                        <div className="send-nl-contact-tags">
                          {c.tags.slice(0, 2).map(t => <span key={t} className="send-nl-tag">{t}</span>)}
                        </div>
                      )}
                    </label>
                  ))
                )}
              </div>
            </div>

            {/* Send Button */}
            <div className="send-nl-footer">
              <button className="send-nl-btn send-nl-btn--outline" onClick={onClose}>Cancel</button>
              <button
                className="send-nl-btn send-nl-btn--primary"
                disabled={!selectedAccount || selectedContacts.size === 0 || !subject.trim() || sending}
                onClick={handleSend}
              >
                {sending ? `Sending (${selectedContacts.size})...` : `Send to ${selectedContacts.size} Contact${selectedContacts.size !== 1 ? 's' : ''}`}
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

// ── Save Template Modal ──
function SaveTemplateModal({ open, onClose, canvasHtml, activeTool }) {
  const [name, setName] = useState('');
  const [desc, setDesc] = useState('');
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  useEffect(() => { if (open) { setName(''); setDesc(''); setSaved(false); } }, [open]);

  const handleSave = async () => {
    if (!name.trim() || !canvasHtml) return;
    setSaving(true);
    try {
      await saveTemplate({ name: name.trim(), description: desc.trim(), tool: activeTool, html: canvasHtml });
      setSaved(true);
    } catch {}
    setSaving(false);
  };

  if (!open) return null;
  return (
    <div className="send-nl-overlay" onClick={onClose}>
      <div className="send-nl-modal" style={{ maxHeight: 'auto' }} onClick={e => e.stopPropagation()}>
        <div className="send-nl-header">
          <h3>Save As Template</h3>
          <button className="send-nl-close" onClick={onClose}><X size={18} /></button>
        </div>
        {saved ? (
          <div className="send-nl-result">
            <div className="send-nl-result-icon">{'\u2713'}</div>
            <div className="send-nl-result-text">Template saved!</div>
            <button className="send-nl-btn send-nl-btn--primary" onClick={onClose}>Done</button>
          </div>
        ) : (
          <>
            <div className="send-nl-section">
              <label className="send-nl-label">Template Name</label>
              <input className="send-nl-input" placeholder="e.g. Product Launch Newsletter" value={name} onChange={e => setName(e.target.value)} />
            </div>
            <div className="send-nl-section">
              <label className="send-nl-label">Description (optional)</label>
              <input className="send-nl-input" placeholder="Brief description..." value={desc} onChange={e => setDesc(e.target.value)} />
            </div>
            <div className="send-nl-footer">
              <button className="send-nl-btn send-nl-btn--outline" onClick={onClose}>Cancel</button>
              <button className="send-nl-btn send-nl-btn--primary" disabled={!name.trim() || saving} onClick={handleSave}>
                {saving ? 'Saving...' : 'Save Template'}
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

// ── Import Template Modal ──
function ImportTemplateModal({ open, onClose, activeTool, onImport }) {
  const [templates, setTemplates] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!open) return;
    setLoading(true);
    getTemplates(activeTool).then(res => {
      setTemplates(res.templates || []);
    }).catch(() => {}).finally(() => setLoading(false));
  }, [open, activeTool]);

  const handleImport = async (id) => {
    try {
      const { template } = await getTemplate(id);
      if (template?.html) onImport(template.html);
      onClose();
    } catch {}
  };

  const handleDelete = async (e, id) => {
    e.stopPropagation();
    await deleteTemplate(id);
    setTemplates(prev => prev.filter(t => t.id !== id));
  };

  if (!open) return null;
  return (
    <div className="send-nl-overlay" onClick={onClose}>
      <div className="send-nl-modal" onClick={e => e.stopPropagation()}>
        <div className="send-nl-header">
          <h3>Import From Template</h3>
          <button className="send-nl-close" onClick={onClose}><X size={18} /></button>
        </div>
        <div style={{ flex: 1, overflow: 'auto', minHeight: 200 }}>
          {loading ? (
            <div className="send-nl-loading">Loading templates...</div>
          ) : templates.length === 0 ? (
            <div className="send-nl-empty">No saved templates yet. Create content and save it as a template first.</div>
          ) : (
            templates.map(t => (
              <div key={t.id} className="tpl-import-item" onClick={() => handleImport(t.id)}>
                <div className="tpl-import-info">
                  <div className="tpl-import-name">{t.name}</div>
                  {t.description && <div className="tpl-import-desc">{t.description}</div>}
                  <div className="tpl-import-meta">{new Date(t.created_at).toLocaleDateString()}</div>
                </div>
                <button className="tpl-import-delete" onClick={(e) => handleDelete(e, t.id)} title="Delete template">
                  <X size={14} />
                </button>
              </div>
            ))
          )}
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
  const [searchStatus, setSearchStatus] = useState(null);

  // Dynamic context categories (fetched from real APIs)
  const [contextCategories, setContextCategories] = useState([
    { id: 'newsletters', label: 'Past Newsletters', iconSrc: '/icon-marketing.png', items: [] },
    { id: 'emails', label: 'Past Emails', iconSrc: '/icon-inbox.png', items: [] },
    { id: 'calls', label: 'Calls', iconSrc: '/fireflies-square-logo.png', items: [] },
    { id: 'content', label: 'Content', iconSrc: '/icon-create-content.png', items: [] },
    { id: 'products', label: 'Products', iconSrc: '/icon-products.png', items: [] },
  ]);

  useEffect(() => {
    let cancelled = false;
    const fmt = (d) => { try { return new Date(d).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }); } catch { return ''; } };
    Promise.all([
      getTemplates('newsletter').catch(() => ({ templates: [] })),
      getEmails({ limit: 20 }).catch(() => ({ emails: [] })),
      getSalesCalls().catch(() => ({ calls: [] })),
      getContentItems().catch(() => ({ items: [] })),
      getProducts().catch(() => ({ products: [] })),
    ]).then(([nlRes, emRes, clRes, ctRes, prRes]) => {
      if (cancelled) return;
      setContextCategories([
        {
          id: 'newsletters', label: 'Past Newsletters', iconSrc: '/icon-marketing.png',
          items: (nlRes.templates || []).map((t) => ({ id: `nl-${t.id}`, name: t.name || t.description || 'Untitled', date: fmt(t.created_at) })),
        },
        {
          id: 'emails', label: 'Past Emails', iconSrc: '/icon-inbox.png',
          items: (emRes.emails || []).map((e) => ({ id: `em-${e.id}`, name: e.subject || '(no subject)', date: fmt(e.date), sub: e.from_name || e.from_email || '' })),
        },
        {
          id: 'calls', label: 'Calls', iconSrc: '/fireflies-square-logo.png',
          items: (clRes.calls || []).map((c) => ({ id: `cl-${c.id}`, name: c.title || c.name || 'Untitled Call', date: fmt(c.date || c.created_at), sub: c.call_type || c.callType || '' })),
        },
        {
          id: 'content', label: 'Content', iconSrc: '/icon-create-content.png',
          items: (ctRes.items || []).map((c) => ({ id: `ct-${c.id}`, name: c.title || c.name || c.file_name || 'Untitled', date: fmt(c.created_at), sub: c.type || c.platform || '' })),
        },
        {
          id: 'products', label: 'Products', iconSrc: '/icon-products.png',
          items: (prRes.products || []).map((p) => ({ id: `pr-${p.id}`, name: p.name || 'Untitled Product', sub: `${p.type || p.product_type || ''} · $${p.price || 0}` })),
        },
      ]);
    });
    return () => { cancelled = true; };
  }, []);

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
  const [sendModalOpen, setSendModalOpen] = useState(false);
  const [saveTemplateOpen, setSaveTemplateOpen] = useState(false);
  const [importTemplateOpen, setImportTemplateOpen] = useState(false);

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
  // Also inject CTA link editor overlay for hover-to-edit functionality
  useEffect(() => {
    const iframe = iframeRef.current;
    if (!iframe) return;
    const doc = iframe.contentDocument;
    if (!doc) return;
    if (canvasHtml) {
      // Replace {{GENERATE:...}} placeholders with loading spinners for display
      let displayHtml = canvasHtml;
      if (displayHtml.includes('{{GENERATE:')) {
        const placeholderDiv = '<div class="gen-shimmer"><span class="gen-shimmer-text">Generating</span></div><style>.gen-shimmer{width:100%;height:250px;background:#e2e2e2;border-radius:12px;display:flex;align-items:center;justify-content:center;position:relative;overflow:hidden}.gen-shimmer::before{content:"";position:absolute;width:300%;height:300%;top:-100%;left:-100%;background:linear-gradient(135deg,transparent 35%,rgba(255,255,255,0.5) 48%,rgba(255,255,255,0.8) 50%,rgba(255,255,255,0.5) 52%,transparent 65%);animation:genShimmer 2s linear infinite}.gen-shimmer-text{color:#9e9e9e;font-size:13px;font-weight:600;font-family:Inter,system-ui,sans-serif;position:relative;z-index:1;letter-spacing:0.5px}@keyframes genShimmer{0%{transform:translate(-33%,-33%)}100%{transform:translate(33%,33%)}}</style>';
        // Replace full <img> tags containing {{GENERATE:...}}
        displayHtml = displayHtml.replace(/<img[^>]*\{\{GENERATE:[\s\S]*?\}\}[^>]*\/?>/gi, placeholderDiv);
        // Catch any remaining bare {{GENERATE:...}}
        displayHtml = displayHtml.replace(/\{\{GENERATE:[\s\S]*?\}\}/g, '');
      }
      doc.open();
      doc.write(displayHtml);
      doc.close();

      // Inject CTA link editor overlay
      const script = doc.createElement('script');
      script.textContent = `
        (function() {
          // Styles for the link editor overlay
          var style = document.createElement('style');
          style.textContent = [
            '.cta-link-overlay { position: absolute; display: none; align-items: center; gap: 6px; padding: 6px 10px; background: #1a1a2e; color: #fff; border-radius: 8px; font: 12px/1.3 Inter, system-ui, sans-serif; z-index: 99999; box-shadow: 0 4px 16px rgba(0,0,0,0.25); pointer-events: auto; max-width: 340px; }',
            '.cta-link-overlay-url { color: #a78bfa; text-decoration: none; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; max-width: 180px; cursor: default; }',
            '.cta-link-overlay-edit { background: none; border: 1px solid rgba(255,255,255,0.2); color: #fff; padding: 3px 8px; border-radius: 4px; cursor: pointer; font: 11px/1 Inter, system-ui, sans-serif; white-space: nowrap; }',
            '.cta-link-overlay-edit:hover { background: rgba(255,255,255,0.1); }',
            '.cta-link-input-wrap { position: absolute; display: none; align-items: center; gap: 6px; padding: 6px 10px; background: #1a1a2e; border-radius: 8px; z-index: 100000; box-shadow: 0 4px 16px rgba(0,0,0,0.25); }',
            '.cta-link-input { background: #2a2a3e; border: 1px solid #4a4a6e; color: #fff; padding: 5px 8px; border-radius: 4px; font: 12px/1 Inter, system-ui, sans-serif; width: 220px; outline: none; }',
            '.cta-link-input:focus { border-color: #a78bfa; }',
            '.cta-link-save { background: #a78bfa; border: none; color: #fff; padding: 4px 10px; border-radius: 4px; cursor: pointer; font: 11px/1.2 Inter, system-ui, sans-serif; }',
            '.cta-link-save:hover { background: #8b6fe0; }',
            'a[href]:hover { outline: 2px solid rgba(167,139,250,0.5); outline-offset: 2px; border-radius: 2px; }',
          ].join('\\n');
          document.head.appendChild(style);

          // Create overlay elements
          var overlay = document.createElement('div');
          overlay.className = 'cta-link-overlay';
          overlay.innerHTML = '<span class="cta-link-overlay-url"></span><button class="cta-link-overlay-edit">Edit Link</button>';
          document.body.appendChild(overlay);

          var inputWrap = document.createElement('div');
          inputWrap.className = 'cta-link-input-wrap';
          inputWrap.innerHTML = '<input class="cta-link-input" type="text" placeholder="https://..." /><button class="cta-link-save">Save</button>';
          document.body.appendChild(inputWrap);

          var urlDisplay = overlay.querySelector('.cta-link-overlay-url');
          var editBtn = overlay.querySelector('.cta-link-overlay-edit');
          var linkInput = inputWrap.querySelector('.cta-link-input');
          var saveBtn = inputWrap.querySelector('.cta-link-save');
          var activeLink = null;
          var hideTimer = null;

          function positionOverlay(el, target) {
            var rect = target.getBoundingClientRect();
            var scrollY = window.scrollY || document.documentElement.scrollTop;
            el.style.left = Math.max(4, rect.left) + 'px';
            el.style.top = (rect.bottom + scrollY + 6) + 'px';
          }

          // Show overlay on link hover
          document.addEventListener('mouseover', function(e) {
            var link = e.target.closest('a[href]');
            if (!link) return;
            clearTimeout(hideTimer);
            activeLink = link;
            urlDisplay.textContent = link.getAttribute('href') || '#';
            positionOverlay(overlay, link);
            overlay.style.display = 'flex';
          });

          document.addEventListener('mouseout', function(e) {
            var link = e.target.closest('a[href]');
            if (!link) return;
            hideTimer = setTimeout(function() {
              if (!overlay.matches(':hover') && !inputWrap.matches(':hover')) {
                overlay.style.display = 'none';
              }
            }, 300);
          });

          overlay.addEventListener('mouseover', function() { clearTimeout(hideTimer); });
          overlay.addEventListener('mouseout', function() {
            hideTimer = setTimeout(function() {
              if (!inputWrap.matches(':hover')) overlay.style.display = 'none';
            }, 300);
          });

          // Prevent link navigation
          document.addEventListener('click', function(e) {
            var link = e.target.closest('a[href]');
            if (link) e.preventDefault();
          });

          // Edit button opens input
          editBtn.addEventListener('click', function() {
            if (!activeLink) return;
            linkInput.value = activeLink.getAttribute('href') || '';
            positionOverlay(inputWrap, activeLink);
            inputWrap.style.display = 'flex';
            overlay.style.display = 'none';
            linkInput.focus();
            linkInput.select();
          });

          // Save link change
          function saveLink() {
            if (!activeLink) return;
            var oldHref = activeLink.getAttribute('href') || '';
            var newHref = linkInput.value.trim();
            if (newHref && newHref !== oldHref) {
              activeLink.setAttribute('href', newHref);
              window.parent.postMessage({ type: 'cta-link-edit', oldHref: oldHref, newHref: newHref, linkText: activeLink.textContent.trim() }, '*');
            }
            inputWrap.style.display = 'none';
          }

          saveBtn.addEventListener('click', saveLink);
          linkInput.addEventListener('keydown', function(e) {
            if (e.key === 'Enter') saveLink();
            if (e.key === 'Escape') inputWrap.style.display = 'none';
          });

          inputWrap.addEventListener('mouseover', function() { clearTimeout(hideTimer); });
          inputWrap.addEventListener('mouseout', function() {
            hideTimer = setTimeout(function() { inputWrap.style.display = 'none'; }, 500);
          });
        })();
      `;
      doc.body.appendChild(script);
    } else {
      doc.open();
      doc.write('<html><body></body></html>');
      doc.close();
    }
  }, [canvasHtml]);

  // Listen for CTA link edits from the iframe
  useEffect(() => {
    function handleMessage(e) {
      if (e.data?.type === 'cta-link-edit') {
        const { oldHref, newHref } = e.data;
        setCanvasHtml(prev => {
          if (!prev) return prev;
          // Replace the href in the HTML — use exact attribute match to avoid false positives
          const escaped = oldHref.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
          const regex = new RegExp('href="' + escaped + '"', 'g');
          return prev.replace(regex, 'href="' + newHref.replace(/"/g, '&quot;') + '"');
        });
      }
    }
    window.addEventListener('message', handleMessage);
    return () => window.removeEventListener('message', handleMessage);
  }, []);

  // Scale newsletter iframe to fit canvas width — iframe scrolls internally
  useEffect(() => {
    const container = canvasBodyRef.current;
    if (!container) return;
    const update = () => {
      const iframe = iframeRef.current;
      if (!iframe) return;
      const w = container.clientWidth;
      const h = container.clientHeight;
      if (w < 620) {
        const scale = w / 620;
        iframe.style.transform = `scale(${scale})`;
        iframe.style.transformOrigin = 'top left';
        // Inverse-scale width & height so the iframe fills the container after transform
        iframe.style.width = '620px';
        iframe.style.height = Math.round(h / scale) + 'px';
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
    for (const cat of contextCategories) {
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

    // Build the content — inject context on first message, files always
    const isFirstMessage = messages.length === 0;
    const contextStr = isFirstMessage ? buildContextString() : '';
    const fileContext = buildFileContext();
    const userContent = contextStr + fileContext + text.trim();

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

    // Detect edit mode — canvas exists and not first message
    const isEdit = canvasHtml && !isFirstMessage;

    try {
      let fullContent = '';
      let editHandled = false;

      await streamFromBackend('/api/orchestrate', {
        messages: newMessages,
        mode: 'direct',
        agent: activeTool,
        searchMode: researchMode,
        ...(isEdit ? { currentHtml: canvasHtml, editInstruction: text.trim() } : {}),
      }, {
        onAgentChunk: (_agentName, chunk) => {
          fullContent = chunk;
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
        onAgentResult: (_agentName, content) => {
          fullContent = content;
        },
        onFileUpdate: (html) => {
          // File-based edit — backend applied a surgical diff
          editHandled = true;
          setCanvasHtml(html);
        },
        onEditSummary: (summary) => {
          editHandled = true;
          setChatMessages((prev) => [
            ...prev.filter((m) => !m.isStatus),
            { id: `msg-${Date.now()}-assistant`, role: 'assistant', text: summary },
          ]);
        },
        onStatus: (statusText) => {
          setChatMessages((prev) => {
            const last = prev[prev.length - 1];
            if (last?.isStatus) return [...prev.slice(0, -1), { ...last, text: statusText }];
            return [...prev, { id: `status-${Date.now()}`, role: 'assistant', text: statusText, isStatus: true }];
          });
        },
        onSearchStatus: setSearchStatus,
        onError: (error) => {
          console.error('[marketing] Agent error:', error);
        },
      }, abortRef.current.signal);

      // Remove status messages
      setChatMessages((prev) => prev.filter((m) => !m.isStatus));

      // If the backend handled this as a file-based edit, we're done
      if (editHandled) {
        setMessages((prev) => [...prev, { role: 'assistant', content: '[edit applied]' }]);
      } else {
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
          const mktDefaultLogo = brandDna.logos?.find(l => l.isDefault) || brandDna.logos?.[0];
          const brandData = brandDna ? {
            photoUrls: brandDna.photo_urls || [],
            logoUrl: mktDefaultLogo?.url || brandDna.logo_url || null,
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

        // Generate images sequentially — each frame references the previous for visual continuity
        const storyDefaultLogo = brandDna?.logos?.find(l => l.isDefault) || brandDna?.logos?.[0];
        const brandData = brandDna ? {
          photoUrls: brandDna.photo_urls || [],
          logoUrl: storyDefaultLogo?.url || brandDna.logo_url || null,
          colors: brandDna.colors || {},
          mainFont: brandDna.main_font || null,
        } : null;

        const visualStyle = parsed.visual_style || '';
        let prevImageData = null; // Pass previous frame as reference to Gemini

        for (let idx = 0; idx < frames.length; idx++) {
          const frame = frames[idx];
          const sequencePrompt = `${visualStyle ? `VISUAL STYLE FOR THIS SERIES: ${visualStyle}\n\n` : ''}This is frame ${idx + 1} of ${frames.length} in a cohesive Instagram Story sequence. ${idx > 0 ? 'CRITICAL: Match the EXACT same visual style, color palette, typography, and art direction as the previous frame shown in the attached reference image. The viewer should feel like they are swiping through ONE continuous story.' : 'This is the FIRST frame — establish the visual style that all subsequent frames will match.'}\n\n${frame.image_prompt}`;

          try {
            // Pass previous frame image as reference for continuity
            const refBrand = prevImageData ? {
              ...brandData,
              // Prepend previous frame as first "photo" so Gemini sees it as reference
              photoUrls: [`data:${prevImageData.mimeType};base64,${prevImageData.data}`, ...(brandData?.photoUrls || [])],
            } : brandData;

            const result = await generateImage(sequencePrompt, 'instagram_story', refBrand);
            const allowedMime = ['image/png', 'image/jpeg', 'image/gif', 'image/webp'];
            if (result.image && allowedMime.includes(result.image.mimeType)) {
              const src = `data:${result.image.mimeType};base64,${result.image.data}`;
              prevImageData = result.image; // Save for next frame's reference
              setStoryFrames((prev) => prev.map((f, i) => i === idx ? { ...f, imageSrc: src, loading: false } : f));
            } else {
              setStoryFrames((prev) => prev.map((f, i) => i === idx ? { ...f, loading: false } : f));
            }
          } catch {
            setStoryFrames((prev) => prev.map((f, i) => i === idx ? { ...f, loading: false } : f));
          }
        }

        setChatMessages((prev) => [...prev, { id: `msg-${Date.now()}-done`, role: 'assistant', text: 'All story frames generated! Check the canvas.' }]);
      } else if (parsed?.type === 'edit' && parsed.sections) {
        // Section-based edit — merge only changed sections into current HTML
        const mergedHtml = mergeSectionEdits(canvasHtml, parsed.sections);
        const finalHtml = replaceImagePlaceholders(mergedHtml, filesSnapshot);
        setCanvasHtml(finalHtml);
        const sectionNames = Object.keys(parsed.sections).join(', ');
        setChatMessages((prev) => [...prev, { id: `msg-${Date.now()}-assistant`, role: 'assistant', text: parsed.summary || `Updated sections: ${sectionNames}` }]);
      } else if (parsed?.type === 'newsletter' || parsed?.type === 'html') {
        let finalHtml = replaceImagePlaceholders(parsed.html, filesSnapshot);
        setCanvasHtml(finalHtml);
        setChatMessages((prev) => [...prev, { id: `msg-${Date.now()}-assistant`, role: 'assistant', text: parsed.summary || config.readyText }]);

        // Generate AI images for {{GENERATE:...}} placeholders — each swaps in independently
        if (finalHtml.includes('{{GENERATE:')) {
          const genRegex = /\{\{GENERATE:([\s\S]*?)\}\}/g;
          const genMatches = [];
          let genMatch;
          while ((genMatch = genRegex.exec(finalHtml)) !== null) {
            genMatches.push({ full: genMatch[0], prompt: genMatch[1] });
          }
          const ERROR_IMG = 'data:image/svg+xml,' + encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" width="600" height="200" viewBox="0 0 600 200"><rect width="598" height="198" x="1" y="1" fill="#fff" rx="8" stroke="#dc2626" stroke-width="2"/><text x="300" y="105" text-anchor="middle" fill="#dc2626" font-family="Inter,system-ui,sans-serif" font-size="13" font-weight="600">Image generation failed</text></svg>');
          genMatches.forEach((m) => {
            (async () => {
              let imgSrc = null;
              try {
                const result = await generateImage(m.prompt.trim(), 'newsletter', null);
                if (result.image) {
                  const uploaded = await uploadImageToStorage(result.image.data, result.image.mimeType);
                  if (uploaded.url) imgSrc = uploaded.url;
                }
              } catch (err) {
                console.error('Image gen failed:', err.message);
              }
              setCanvasHtml((prev) => {
                const replacement = imgSrc || ERROR_IMG;
                return prev.replaceAll(m.full, replacement);
              });
            })();
          });
        }

        // For newsletters, automatically ask about cover image generation
        if (activeTool === 'newsletter') {
          try {
            const coverSuggestMsg = { role: 'user', content: 'Now suggest 4 creative cover image options for this newsletter.' };
            const coverMessages = [...newMessages, assistantMsg, coverSuggestMsg];
            let coverContent = '';
            await streamFromBackend('/api/orchestrate', {
              messages: coverMessages,
              mode: 'direct',
              agent: 'newsletter',
              searchMode: false,
            }, {
              onAgentChunk: (_name, content) => { coverContent = content; },
              onAgentResult: (_name, content) => { coverContent = content; },
            }, abortRef.current.signal);
            const coverParsed = tryParseAIResponse(coverContent);
            if (coverParsed?.type === 'question') {
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
      } // end !editHandled
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
  <>
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
                  <span className="mkt-generating-text">
                    {searchStatus === 'searching' ? <><Search size={14} /> Searching the web...</> : searchStatus === 'writing' ? <><PenLine size={14} /> Writing response...</> : generatingText}
                  </span>
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
                    {contextCategories.map((cat) => {
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
          <div
            className="mkt-canvas-title"
            onMouseEnter={(e) => {
              const el = e.currentTarget;
              const overflow = el.scrollWidth - el.clientWidth;
              if (overflow > 0) {
                const speed = 60;
                const duration = Math.max(3, (overflow / speed) * 2 + 1);
                el.style.setProperty('--marquee-distance', `-${overflow}px`);
                el.style.setProperty('--marquee-duration', `${duration}s`);
                el.classList.add('mkt-canvas-title--scrolling');
              }
            }}
            onMouseLeave={(e) => {
              e.currentTarget.classList.remove('mkt-canvas-title--scrolling');
            }}
          ><span className="mkt-canvas-title-text">{config.canvasTitle}</span></div>
          <div className="mkt-canvas-actions">
            {config.canvasActions ? (
              config.canvasActions.map((action, i) =>
                action.isTemplateToggle ? (
                  <button
                    key={i}
                    className={`mkt-canvas-btn mkt-canvas-btn--${action.style}`}
                    onClick={() => setImportTemplateOpen(true)}
                  >
                    {action.label}
                    <ChevronDown size={14} />
                  </button>
                ) : action.isSaveTemplate ? (
                  <button
                    key={i}
                    className={`mkt-canvas-btn mkt-canvas-btn--${action.style}`}
                    onClick={() => setSaveTemplateOpen(true)}
                    disabled={!canvasHtml}
                  >
                    {action.label}
                  </button>
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
                    disabled={!canvasHtml || deploying}
                  >
                    {deploying ? 'Deploying...' : deployResult ? 'Redeploy' : 'Deploy to Netlify'}
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
                <button className="mkt-canvas-btn mkt-canvas-btn--outline" onClick={() => setImportTemplateOpen(true)}>
                  Import From Template <ChevronDown size={14} />
                </button>
                <button className="mkt-canvas-btn mkt-canvas-btn--outline" onClick={() => setSaveTemplateOpen(true)} disabled={!canvasHtml}>
                  Save As Template
                </button>
                <button className="mkt-canvas-btn mkt-canvas-btn--primary" onClick={() => setSendModalOpen(true)}>
                  <Mail size={14} /> Send Email
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
            sandbox="allow-same-origin allow-scripts"
          />
          {config.canvasEmptyType === 'story-sequence' && storyFrames.length > 0 && (
            <StoryPhoneViewer frames={storyFrames} />
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

    {/* Send Newsletter Modal */}
    <SendNewsletterModal open={sendModalOpen} onClose={() => setSendModalOpen(false)} canvasHtml={canvasHtml} />
    <SaveTemplateModal open={saveTemplateOpen} onClose={() => setSaveTemplateOpen(false)} canvasHtml={canvasHtml} activeTool={activeTool} />
    <ImportTemplateModal open={importTemplateOpen} onClose={() => setImportTemplateOpen(false)} activeTool={activeTool} onImport={(html) => setCanvasHtml(html)} />
  </>
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
        .order('updated_at', { ascending: true })
        .limit(1);
      if (error) { console.error('Failed to load brand DNA:', error.message); return; }
      if (data?.[0]) setBrandDna(data[0]);
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
