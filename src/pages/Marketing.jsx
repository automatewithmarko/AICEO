import { useState, useRef, useCallback, useEffect, useMemo } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { Mail, Send, Users, BarChart3, Megaphone, Inbox, ArrowUp, ChevronDown, Plus, X, ChevronRight, Paperclip, Globe, Search, PenLine, Pencil, Loader, History, Trash2, Upload } from 'lucide-react';
import { ReactFlow, Background, Handle, Position } from '@xyflow/react';
import '@xyflow/react/dist/style.css';
import { supabase } from '../lib/supabase';
import { generateImage, uploadImageToStorage, streamFromBackend, getEmailAccounts, getContacts, sendEmailApi, getTemplates, getTemplate, saveTemplate, deleteTemplate, getEmails, getSalesCalls, getProducts, getContentItems, getBoosendTemplates, getBoosendTemplate } from '../lib/api';
import AutomationGraph from '../components/AutomationGraph';
import NetlifyDeployButton from '../components/NetlifyDeployButton';
import { injectEditIds, applyTextEdit } from '../lib/editableHtml';
import { getIframeEditScript } from '../lib/iframeEditScript';
import { getIframeImageScript } from '../lib/iframeImageScript';
import './Pages.css';
import './Marketing.css';

// ── Shared prompt skeleton ──
const SHARED_RULES = `=== ABSOLUTE OUTPUT RULES (NON-NEGOTIABLE) ===
1. NEVER use em dashes (the long dash character). Use commas, periods, or start a new sentence.
2. NEVER use hashtags (#anything) in any output unless the user explicitly asks for hashtags. No #Entrepreneurship, no #FounderLife, no #GrowthMindset. Hashtags are banned by default.
3. NEVER use filler phrases like "Great question!", "Absolutely!", "I'd be happy to help!"
These rules override everything else below.

CRITICAL: You MUST respond with ONLY valid JSON. No markdown, no plain text, no code fences. Every response must be one of these two formats:

FORMAT 1  -  ASK A QUESTION (when you need more information):
{"type":"question","text":"Your question here","options":["Option A","Option B","Option C","Option D"]}

FORMAT 2  -  GENERATE THE OUTPUT (when you have enough information):
{"type":"newsletter","html":"<complete HTML code here>"}

FORMAT 3  -  GENERATE COVER IMAGE (when user selects a cover image option):
{"type":"cover_image","prompt":"Your extremely detailed image generation prompt here"}

COVER IMAGE PROMPT REQUIREMENTS (FORMAT 3):
- The prompt MUST be 150-250 words of rich, specific visual direction
- Specify the visual style: photographic, editorial illustration, 3D render, flat design, watercolor, etc.
- Describe exact composition: foreground subject, background elements, perspective, framing (wide/close-up/overhead)
- Include the EXACT color palette from the newsletter (reference specific hex codes like #E91A44, #1A1A2E, etc.)
- Describe the subject matter tied to the newsletter topic  -  make it conceptually relevant, not generic
- Specify mood and lighting: warm golden hour, cool corporate blue, dramatic chiaroscuro, bright and airy, etc.
- Include any text overlays: headline text, issue number, brand name  -  specify font style and placement
- ALWAYS specify dimensions: 1200x600px email header banner, landscape orientation
- DO NOT include generic stock photo descriptions  -  make every prompt unique and tied to the newsletter content
- Think like a professional art director briefing a designer for a premium email campaign

QUESTION FLOW:
- Ask ONE question at a time. Provide 3-4 specific, helpful options.
- If the user gives you a rich prompt with clear context, skip unnecessary questions and generate immediately.
- If context items are provided (emails, calls, products, content), use that information to make your options more relevant and specific.
- Keep questions concise and actionable. Don't ask generic questions  -  make each option feel like a real strategic choice.

EDIT MODE (when user already has output):
- When the user provides their CURRENT HTML and asks for changes, you MUST edit the existing HTML  -  do NOT rewrite from scratch.
- Make only the specific changes requested. Preserve the overall structure, styling, and content that wasn't mentioned.
- If the user says "rewrite", "start over", "from scratch", or similar, then you may generate completely new output.
- When editing, return the FULL updated HTML (with the edits applied), not just the changed parts.

UPLOADED FILES:
- If the user uploads images, they will be provided as placeholder references like src="{{IMAGE:file-id}}". Use these placeholder src values EXACTLY as given in your <img> tags  -  do NOT modify them. The system will automatically replace them with the actual image data.
- If the user uploads documents, their text content will be included as context. Use this information to inform the content.

IMPORTANT RULES:
- NEVER wrap your response in markdown code fences or backticks
- NEVER include explanatory text outside the JSON object
- NEVER use newlines within the JSON string values  -  use HTML tags for line breaks in the HTML
- The "html" field should contain the complete HTML as a single string
- Always respond with ONLY the JSON object, nothing else`;

// ── Tool Configs ──
const TOOL_CONFIGS = {
  newsletter: {
    systemPrompt: `You are an elite newsletter copywriter and email designer working inside the PuerlyPersonal AI CEO platform. Your job is to help users create stunning, high-converting email newsletters.\n\n${SHARED_RULES}\n\nHTML REQUIREMENTS:\n- Generate a COMPLETE, standalone HTML email document with <!DOCTYPE html>, <html>, <head>, <body>\n- Use ONLY inline CSS styles  -  no <style> blocks, no external stylesheets, no <script> tags\n- Use table-based layout for email client compatibility\n- Make it visually stunning: clean typography, good whitespace, professional color palette\n- Include: branded header area, compelling headline, body sections with engaging copy, a prominent CTA button, footer with unsubscribe placeholder\n- Use a max-width of 600px centered layout (standard email width)\n- Default color scheme: clean white background, dark text (#333), accent color #E91A44 for CTA buttons and highlights\n- Write STELLAR copywriting: compelling headlines, engaging opening hooks, scannable body with subheadings, clear and urgent CTAs\n- Make the copy feel human, warm, and persuasive  -  not robotic or generic\n- The HTML must be production-ready email code that renders beautifully\n- If the user provides image URLs or data URIs, embed them directly in the HTML using <img> tags\n- Typical question flow: topic/angle → target audience → tone/voice → key CTA/goal\n\nCOVER IMAGE:\n- The cover image is generated automatically from the cover_image_prompt field in the backend agent response. No need to ask the user about it.`,
    placeholder: 'Describe your newsletter idea...',
    ctaText: 'Ask the Newsletter AI to help you come up with ideas, edit your newsletter or even write one from scratch! Make sure to give it good context!',
    canvasTitle: 'Canvas',
    emptyText: 'Your newsletter will appear here',
    readyText: 'Your newsletter is ready! Check the canvas on the right.',
  },
  landing: {
    systemPrompt: `You are an elite landing page architect who builds pages that look like they cost $10,000+ from a top agency. Your pages rival Stripe, Reddit Business, and high-end direct-response pages.\n\nCRITICAL: You MUST respond with ONLY valid JSON. No markdown, no plain text, no code fences.\n\nFORMAT 1  -  ASK A QUESTION:\n{"type":"question","text":"Your question here","options":["Option A","Option B","Option C","Option D"]}\n\nFORMAT 2  -  GENERATE THE LANDING PAGE:\n{"type":"html","html":"<complete HTML code here>","summary":"Brief description"}\n\nQUESTION FLOW:\n- Ask ONE question at a time with 3-4 options.\n- Up to 4 questions: product/offer, target audience & pain, CTA goal, visual style.\n- Skip questions if the user gives rich context.\n\nEDIT MODE: Edit existing HTML when provided. Return full updated HTML.\n\nHTML REQUIREMENTS:\n- Complete standalone HTML with <!DOCTYPE html>.\n- Single <style> block in <head>. Google Fonts via <link> (Inter, Plus Jakarta Sans, DM Sans, Space Grotesk, or Outfit). NO external CSS. NO <script>.\n- Max-width 1200px, responsive with media queries at 768px and 1024px.\n- Use section markers: <!-- SECTION:name --> ... <!-- /SECTION:name -->\n\nREQUIRED SECTIONS: nav, hero, social-proof, features, testimonials, how-it-works, faq, final-cta, footer.\n\n=== DESIGN SYSTEM (what makes it look premium) ===\n\nHERO (most important section):\n- NEVER plain white. Use bold gradient background (brand color to darker shade) or dark background with light text, or split layout with colored accent shape behind the image.\n- Headline: clamp(36px, 5vw, 64px), weight 800. Highlight key words with <span> styled with accent-color background (padding 2px 8px, border-radius 4px) or wavy CSS underline.\n- Subheadline: 20-24px, lighter weight, slightly muted.\n- CTA: LARGE pill button (18px font, 18px 40px padding, border-radius: 50px, brand color, box-shadow: 0 4px 20px rgba(accent,0.4)). Hover: translateY(-2px) + deeper shadow.\n- Trust row below CTA: small text + inline icons ("500+ businesses", star ratings).\n- {{GENERATE:hero image}} on the right or behind.\n- Padding: 100px top/bottom minimum.\n\nVISUAL RHYTHM (critical  -  never all-white):\n- Alternate sections: white (#fff), light gray (#f6f9fb), one BOLD dark section (#0f172a or brand dark) with white text, one subtle brand-tinted section.\n- Each section: 80-100px vertical padding (60px mobile).\n\nTYPOGRAPHY:\n- Use clamp() for fluid sizes. Hero: clamp(36px,5vw,64px). Sections: clamp(28px,3.5vw,42px). Body: clamp(16px,1.2vw,18px).\n- Line-height: 1.15 headlines, 1.7 body.\n- Section headings: pill badge above in small uppercase (brand bg, border-radius 50px, padding 6px 16px) + accent line below (40px wide, 3px, brand color).\n\nCARDS:\n- White bg, border-radius: 16px, box-shadow: 0 4px 24px rgba(0,0,0,0.06), padding: 32px.\n- Hover: translateY(-4px), shadow: 0 12px 40px rgba(0,0,0,0.12), transition: all 0.3s ease.\n- CSS grid: repeat(auto-fit, minmax(300px, 1fr)), gap 24px.\n- Each card: 48px icon in brand-colored circle + 20px bold title + 16px muted description.\n\nCTA BUTTONS:\n- Primary: brand color, white text, 18px, 18px 40px padding, border-radius 50px, box-shadow.\n- Hover: translateY(-2px), brightness(1.1), deeper shadow.\n- Place in hero + final-cta at minimum.\n- Text: first-person action ("Get My Free Strategy Call", "Book Your Free Consultation").\n\nTESTIMONIALS / REVIEWS  -  CRITICAL:\n- NEVER fabricate reviews or make up fake names/quotes. All testimonials must be real data from the user.\n- If the user has NOT provided real testimonials, ASK them: "Do you have real customer testimonials? I need their name, quote, and optionally a photo URL. I never use fake reviews."\n- If user says use placeholders, use obvious placeholder text: "[Customer Name]", "[Their quote here]" so it is clear these must be replaced.\n- When real data IS provided: 3-column grid (2 tablet, 1 mobile), cards with 3px left-border in brand color.\n- Use provided photo URLs as headshot circles (64px, border-radius 50%). No photos = CSS initial avatars (colored circle + letter).\n- Include SPECIFIC results from the real testimonials.\n\nFAQ:\n- Styled accordion on light gray background. Question bars: 18px bold, padded, border-bottom, colored +/arrow indicator.\n- Use CSS :checked checkbox hack for toggle, or show all with clear visual separation.\n\nSOCIAL PROOF:\n- Stats row: 3-4 large numbers (48px bold) + labels (14px muted). Colored left-border accent per stat.\n\nHOW IT WORKS:\n- 3 numbered steps horizontally (vertical mobile). Large number (72px, brand color, 0.15 opacity) + title + description.\n- Connect with dashed line via CSS ::before/::after.\n\nICONS  -  ABSOLUTE RULE:\n- NEVER use emoji as icons. No emoji checkmarks, arrows, stars, or any emoji characters anywhere.\n- ALWAYS use inline SVG for all icons: checkmarks, arrows, stars, feature icons, social icons.\n- Feature cards: 48px colored circle with inline SVG icon inside.\n- Star ratings: inline SVG stars, never text/emoji.\n\nDECORATIVE POLISH:\n- Pill badges above section headings.\n- Accent highlights on hero keywords.\n- Subtle radial-gradient dots or mesh on hero background.\n- Box-shadow glow behind hero image.\n- All transitions: 0.3s ease.\n\nCOPYWRITING:\n- Specific outcome promises: "From [X] to [Y] in [timeframe]".\n- Lead with results, not features. Real numbers.\n- Invite, never sell.\n- Active voice only. No buzzwords.\n\nIMAGES: Use {{GENERATE:detailed prompt}} for hero, features, how-it-works, final-cta. CSS initials for testimonials. Brand logo in nav/footer.\n\nIMPORTANT:\n- NEVER wrap response in markdown code fences or backticks\n- NEVER include explanatory text outside the JSON object\n- Always respond with ONLY the JSON object, nothing else`,
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
    systemPrompt: `You are an elite squeeze page designer and lead generation expert working inside the PuerlyPersonal AI CEO platform. You create focused, high-converting opt-in pages.\n\nCRITICAL: You MUST respond with ONLY valid JSON. No markdown, no plain text, no code fences. Every response must be one of these formats:\n\nFORMAT 1  -  ASK A QUESTION:\n{"type":"question","text":"Your question here","options":["Option A","Option B","Option C","Option D"]}\n\nFORMAT 2  -  GENERATE THE SQUEEZE PAGE:\n{"type":"html","html":"<complete HTML code here>","summary":"Brief description"}\n\nQUESTION FLOW:\n- Ask ONE question at a time. Provide 3-4 specific, helpful options.\n- Ask up to 4 questions: lead magnet/offer → target audience → main hook/angle → urgency element.\n- If the user gives rich context, skip unnecessary questions and generate immediately.\n\nEDIT MODE: When the user provides CURRENT HTML and asks for changes, edit the existing HTML. Return full updated HTML.\n\nHTML REQUIREMENTS:\n- Complete standalone HTML: <!DOCTYPE html>, <html>, <head>, <body>\n- Single <style> block in <head>. Google Fonts via <link> allowed. NO external stylesheets. NO <script> tags.\n- Max-width 600px centered (squeeze pages are narrow and focused). Fully responsive.\n- Use section markers: <!-- SECTION:name --> ... <!-- /SECTION:name -->\n\nREQUIRED SECTIONS:\n- hero: bold headline promising value (what they get), subheadline with urgency, {{GENERATE:hero visual}}\n- benefits: 3-4 bullet points of what they get (use inline SVG checkmark icons)\n- form: email input + CTA button. Clean, prominent. The form is the ONE action on this page.\n- trust: social proof badges, subscriber count, testimonial quote, or security badges\n- footer: minimal, just copyright\n\nDESIGN STANDARDS:\n- This is a WEBSITE, not an email. Use modern CSS: flexbox, border-radius, box-shadow.\n- Narrow and focused: every element drives toward the form. Minimal distractions.\n- Typography: hero 36-48px bold, body 18px, clean sans-serif (Google Fonts)\n- Generous whitespace. Light background (#FFFFFF) with subtle accent sections.\n- CTA button: large, brand accent color, full-width on mobile, bold text like "Get My Free Guide"\n- Form input: large (48px height), subtle border, focus state with accent color\n- No emoji. Use inline SVG icons.\n- All images use {{GENERATE:detailed prompt}}\n\nCOPYWRITING:\n- Headline: curiosity + specific benefit. "The 5-Step Framework That Generated $47K in 30 Days"\n- Bullets: benefit-focused, specific. "Exact email templates that convert at 12%"\n- CTA: first-person. "Get My Free Guide" beats "Download Now"\n- Add urgency: limited spots, time-sensitive, exclusive access\n- Active voice only. No corporate buzzwords.\n\nIMPORTANT:\n- NEVER wrap response in markdown code fences or backticks\n- NEVER include explanatory text outside the JSON object\n- Always respond with ONLY the JSON object, nothing else`,
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

ADDITIONAL FORMAT  -  STORY SEQUENCE (use this instead of newsletter/html when generating stories):
{"type":"story_sequence","frames":[{"title":"Frame title","caption":"Short caption overlay text (max 15 words)","image_prompt":"Detailed image generation prompt for this frame. Include: style, composition, colors, text overlays, mood."},...],"summary":"Brief description"}
RULES FOR STORY SEQUENCES:
- Generate exactly 3-5 frames that tell a cohesive visual story
- Each frame should flow naturally into the next (beginning → middle → end/CTA)
- Frame 1: Hook/attention grabber
- Middle frames: Value/story/content
- Last frame: CTA (swipe up, link in bio, DM us, etc.)
- Image prompts must describe ONLY the photo/visual content  -  never mention Instagram UI elements
- NEVER include in image_prompt: progress bars, profile pictures, usernames, close buttons, send message bar, heart icons, or any Instagram interface elements
- The image_prompt should describe the SCENE/PHOTO only. The text overlay is added separately by the system.
- Captions should be punchy, short (max 15 words), suitable for story text overlays
- Think like a top social media manager  -  trendy, on-brand, scroll-stopping
- Typical question flow: brand/topic → target audience → story goal (educate/sell/engage) → visual style preference`,
    placeholder: 'Describe your Instagram story sequence...',
    ctaText: 'Ask the Story Sequence AI to craft stunning multi-frame Instagram story sequences that captivate your audience!',
    canvasTitle: 'Story Sequence',
    emptyText: 'Your story sequence will appear here',
    readyText: 'Your story sequence is ready! Check the canvas on the right.',
    canvasActions: [
      { label: 'Upload Images', style: 'outline', isUploadStoryImages: true },
      { label: 'Download All', style: 'outline' },
      { label: 'Schedule Stories', style: 'primary' },
    ],
    canvasEmptyType: 'story-sequence',
  },
  leadmagnet: {
    systemPrompt: `You are an elite lead magnet designer and content strategist working inside the PuerlyPersonal AI CEO platform. Your job is to help users create irresistible lead magnets (PDFs, checklists, guides, cheat sheets, templates) that attract and convert their ideal audience.\n\n${SHARED_RULES}\n\nHTML REQUIREMENTS:\n- Generate a COMPLETE, standalone HTML document that serves as a beautiful, printable lead magnet\n- Use modern CSS (inline styles or a single <style> block in <head>)  -  no external stylesheets, no <script> tags\n- Make it visually stunning and professional: clean layout, branded feel, easy to scan\n- Include: eye-catching cover/title section, table of contents (if applicable), well-structured content sections, actionable tips/steps, branded footer with CTA\n- Use a max-width of 800px centered layout (document/PDF style)\n- Default color scheme: clean white background, dark text (#333), accent color #E91A44 for headings and highlights\n- Write HIGH-VALUE content: practical, actionable, specific  -  make the reader feel they got a steal\n- Format as appropriate for the type: checklist with checkboxes, guide with numbered sections, cheat sheet with quick-reference layout\n- Typical question flow: topic/niche → target audience → lead magnet type (checklist/guide/cheat sheet) → key outcomes`,
    placeholder: 'Describe your lead magnet idea...',
    ctaText: 'Ask the Lead Magnet AI to create irresistible lead magnets  -  checklists, guides, cheat sheets, and more  -  that grow your list!',
    canvasTitle: 'Canvas',
    emptyText: 'Your lead magnet will appear here',
    readyText: 'Your lead magnet is ready! Check the canvas on the right.',
  },
  dm: {
    systemPrompt: `You are an elite DM (direct message) automation strategist and copywriter working inside the PuerlyPersonal AI CEO platform. Your job is to help users create high-converting DM message sequences for Instagram, LinkedIn, Twitter/X, and other platforms.\n\n${SHARED_RULES}\n\nHTML REQUIREMENTS:\n- Generate a COMPLETE, standalone HTML document that displays the DM sequence as a visual chat-style preview\n- Use modern CSS (inline styles or a single <style> block in <head>)  -  no external stylesheets, no <script> tags\n- Show each message as a chat bubble with: message number, trigger/condition (e.g. "After they reply YES"), the message text, timing delay\n- Include visual branching for different responses (e.g. "If they say X → send Y")\n- Make it look like a real DM conversation flow: chat bubbles, alternating sides, clear sequence\n- Use a max-width of 500px centered layout (mobile chat feel)\n- Default color scheme: clean white background, dark text (#333), accent color #E91A44 for user's outgoing messages\n- Write NATURAL, conversational copy: no salesy language, feels like a real human DM, builds rapport before pitching\n- Include 5-8 messages in the sequence by default with branching logic\n- Typical question flow: platform → goal (sales/booking/engagement) → product/service → audience type`,
    placeholder: 'Describe your DM automation flow...',
    ctaText: 'Ask the DM Automation AI to craft high-converting DM sequences that turn followers into customers!',
    canvasTitle: 'Canvas',
    emptyText: 'Your DM sequence will appear here',
    readyText: 'Your DM sequence is ready! Check the canvas on the right.',
    canvasEmptyType: 'dm-flow',
    canvasActions: [
      { label: 'Templates', style: 'outline', hasChevron: true, isBoosendTemplates: true },
      { label: 'Publish In BooSend', style: 'boosend', iconSrc: '/BooSend_Logo_Light.png' },
    ],
  },
};

// All AI streaming is now handled server-side via /api/orchestrate

// ── Helpers ──
// Fix broken JSON caused by raw newlines inside string values
// Escapes actual newlines/tabs inside JSON string values so JSON.parse succeeds
function fixJsonNewlines(str) {
  // Replace actual newlines/tabs inside JSON strings with their escaped forms
  // This handles the common case where the AI puts real newlines in the "html" field
  return str.replace(/("(?:[^"\\]|\\.)*")|[\n\r\t]/g, (match, quoted) => {
    if (quoted) return quoted; // inside a properly quoted string  -  leave it
    // bare newline/tab outside quotes  -  escape it
    if (match === '\n') return '\\n';
    if (match === '\r') return '\\r';
    if (match === '\t') return '\\t';
    return match;
  });
}

function tryParseAIResponse(text) {
  if (!text) return null;

  // Try multiple parsing strategies
  let parsed = null;

  // Strategy 1: direct parse
  try { parsed = JSON.parse(text.trim()); } catch {}

  // Strategy 1b: fix raw newlines in JSON strings and retry
  if (!parsed) {
    try { parsed = JSON.parse(fixJsonNewlines(text.trim())); } catch {}
  }

  // Strategy 2: strip markdown code fences
  if (!parsed) {
    let cleaned = text.trim();
    if (cleaned.startsWith('```')) {
      cleaned = cleaned.replace(/^```(?:json)?\s*/, '').replace(/\s*```$/, '');
    }
    try { parsed = JSON.parse(cleaned); } catch {}
    if (!parsed) try { parsed = JSON.parse(fixJsonNewlines(cleaned)); } catch {}
  }

  // Strategy 3: extract JSON object from mixed content
  if (!parsed) {
    const objMatch = text.match(/\{[\s\S]*\}/);
    if (objMatch) {
      try { parsed = JSON.parse(objMatch[0]); } catch {}
      if (!parsed) try { parsed = JSON.parse(fixJsonNewlines(objMatch[0])); } catch {}
    }
  }

  if (!parsed) {
    // Strategy 4: try to extract HTML from a partial/broken JSON response
    if (text.includes('"html"') && (text.includes('<!DOCTYPE') || text.includes('<html') || text.includes('<table') || text.includes('<style'))) {
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

// Cover image placeholder marker  -  inserted at top of newsletter while generating
const COVER_IMAGE_PLACEHOLDER = '{{COVER_IMAGE_PLACEHOLDER}}';

// Insert cover image (or placeholder) into newsletter HTML right after <body>
function insertCoverImage(html, imgSrc) {
  const bodyMatch = html.match(/<body[^>]*>/i);
  if (bodyMatch) {
    const idx = html.indexOf(bodyMatch[0]) + bodyMatch[0].length;
    const imgTag = `<div style="text-align:center;margin:0 auto;max-width:600px;"><img src="${imgSrc}" alt="Newsletter Cover" style="width:100%;height:auto;display:block;" /></div>`;
    return html.slice(0, idx) + imgTag + html.slice(idx);
  }
  return `<img src="${imgSrc}" alt="Newsletter Cover" style="width:100%;max-width:600px;height:auto;display:block;margin:0 auto;" />` + html;
}

// Insert the cover image placeholder marker into the HTML (will be rendered as shimmer)
function insertCoverPlaceholder(html) {
  const bodyMatch = html.match(/<body[^>]*>/i);
  if (bodyMatch) {
    const idx = html.indexOf(bodyMatch[0]) + bodyMatch[0].length;
    return html.slice(0, idx) + COVER_IMAGE_PLACEHOLDER + html.slice(idx);
  }
  return COVER_IMAGE_PLACEHOLDER + html;
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
function StoryPhoneViewer({ frames, onEditFrame, onReorderFrames }) {
  const [activeIndex, setActiveIndex] = useState(0);
  const [paused, setPaused] = useState(false);
  const [editingIdx, setEditingIdx] = useState(null);
  const [editPrompt, setEditPrompt] = useState('');
  const [dragIdx, setDragIdx] = useState(null);
  const [dragOverIdx, setDragOverIdx] = useState(null);
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
      const currentFrame = frames[activeIndex];
      if (!currentFrame?.imageSrc || currentFrame?.loading) {
        const firstReady = frames.findIndex(f => f.imageSrc && !f.loading);
        if (firstReady >= 0) setActiveIndex(firstReady);
      }
      prevReadyRef.current = readyCount;
    }
  }, [readyCount, frames, activeIndex]);

  // Autoplay timer
  useEffect(() => {
    if (total === 0 || paused || editingIdx !== null) return;
    timerRef.current = setTimeout(() => {
      setActiveIndex(prev => (prev + 1) % total);
    }, DURATION);
    return () => clearTimeout(timerRef.current);
  }, [paused, total, activeIndex, editingIdx]);

  const goPrev = (e) => { e.stopPropagation(); setActiveIndex(prev => Math.max(0, prev - 1)); };
  const goNext = (e) => { e.stopPropagation(); setActiveIndex(prev => Math.min(total - 1, prev + 1)); };

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

  const handleEdit = () => {
    if (!editPrompt.trim() || !onEditFrame) return;
    onEditFrame(activeIndex, editPrompt.trim());
    setEditingIdx(null);
    setEditPrompt('');
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

        {/* Left/Right arrows */}
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

        {/* Edit button (AI re-draw via prompt)  -  top right */}
        {frame.imageSrc && !frame.loading && !frame.editing && onEditFrame && (
          <button
            className="sp-edit-btn"
            onClick={(e) => { e.stopPropagation(); setEditingIdx(activeIndex); setEditPrompt(''); }}
            title="Edit this frame with a prompt"
          >
            <Pencil size={14} />
          </button>
        )}

        {/* Frame content */}
        <div className="sp-frame">
          {frame.editing ? (
            <div className="sp-frame-loading">
              <Loader size={20} className="sp-edit-spinner" />
              <span style={{ color: '#fff', fontSize: 12, marginTop: 8 }}>Editing...</span>
            </div>
          ) : frame.loading ? (
            <div className="sp-frame-loading">
              <span className="mkt-msg-dots"><span /><span /><span /></span>
            </div>
          ) : frame.imageSrc ? (
            <img src={frame.imageSrc} alt={frame.caption || ''} className="sp-frame-img" />
          ) : frame.error ? (
            <div className="sp-frame-empty" style={{ background: '#1a1a1a' }}>
              <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="#ef4444" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"/><line x1="15" y1="9" x2="9" y2="15"/><line x1="9" y1="9" x2="15" y2="15"/></svg>
              <span style={{ color: '#ef4444', fontSize: 12, marginTop: 8, fontWeight: 500 }}>Failed to generate</span>
            </div>
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

        {/* Edit input bar */}
        {editingIdx === activeIndex && (
          <div className="sp-edit-bar" onClick={(e) => e.stopPropagation()}>
            <input
              type="text"
              placeholder="Describe the edit..."
              value={editPrompt}
              onChange={(e) => setEditPrompt(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter' && editPrompt.trim()) handleEdit(); if (e.key === 'Escape') setEditingIdx(null); }}
              autoFocus
            />
            <button disabled={!editPrompt.trim()} onClick={handleEdit}>
              <ArrowUp size={14} />
            </button>
          </div>
        )}
      </div>

      {/* Thumbnail strip — click to navigate, drag-and-drop to reorder. */}
      {total > 1 && onReorderFrames && (
        <div className="sp-thumbs">
          {frames.map((f, i) => (
            <div
              key={i}
              className={`sp-thumb${i === activeIndex ? ' sp-thumb--active' : ''}${dragOverIdx === i && dragIdx !== null && dragIdx !== i ? ' sp-thumb--drop' : ''}`}
              draggable
              onClick={() => setActiveIndex(i)}
              onDragStart={(e) => {
                setDragIdx(i);
                // Firefox needs effectAllowed + setData for drag to fire.
                e.dataTransfer.effectAllowed = 'move';
                try { e.dataTransfer.setData('text/plain', String(i)); } catch { /* ignore */ }
              }}
              onDragOver={(e) => { e.preventDefault(); e.dataTransfer.dropEffect = 'move'; setDragOverIdx(i); }}
              onDragLeave={() => setDragOverIdx((cur) => (cur === i ? null : cur))}
              onDrop={(e) => {
                e.preventDefault();
                if (dragIdx === null || dragIdx === i) { setDragIdx(null); setDragOverIdx(null); return; }
                onReorderFrames(dragIdx, i);
                // Keep the user's selection on the dragged frame after the move.
                setActiveIndex(i);
                setDragIdx(null);
                setDragOverIdx(null);
              }}
              onDragEnd={() => { setDragIdx(null); setDragOverIdx(null); }}
              title={`Frame ${i + 1}${f.caption ? ' — ' + f.caption : ''}`}
            >
              {f.imageSrc ? (
                <img src={f.imageSrc} alt="" className="sp-thumb-img" />
              ) : f.error ? (
                <div className="sp-thumb-placeholder sp-thumb-placeholder--err">!</div>
              ) : (
                <div className="sp-thumb-placeholder">
                  <span className="mkt-msg-dots"><span /><span /><span /></span>
                </div>
              )}
              <span className="sp-thumb-num">{i + 1}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ── DM Automation View  -  shows automation graph canvas ──
const DEFAULT_DM_NODES = [
  {
    id: 'trigger-1',
    type: 'trigger',
    position: { x: 250, y: 80 },
    data: {
      triggerConditions: [
        { id: '1', type: 'message', keywords: [], messageDetectionType: 'keywords' }
      ],
    },
  },
];

function DmFlowView({ graphData }) {
  const nodes = graphData?.nodes?.length ? graphData.nodes : DEFAULT_DM_NODES;
  const edges = graphData?.edges || [];
  return <AutomationGraph nodes={nodes} edges={edges} />;
}

// ── Legacy static DM flow for fallback ──
const DM_CW = 1900, DM_CH = 280;

function DmFlowViewStatic() {
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
        {/* SVG edges  -  bezier curves matching ReactFlow */}
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

function ToolTab({ config, activeTool, brandDna, urlSessionId }) {
  const navigate = useNavigate();
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
    { id: 'calls', label: 'Calls', iconSrc: '/our-square-logo.png', items: [] },
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
          id: 'calls', label: 'Calls', iconSrc: '/our-square-logo.png',
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
  const [bsTemplatesOpen, setBsTemplatesOpen] = useState(false);
  const [bsTemplates, setBsTemplates] = useState([]);
  const [bsTemplatesLoading, setBsTemplatesLoading] = useState(false);
  const [dmGraphData, setDmGraphData] = useState(null); // { nodes, edges }
  const [deployResult, setDeployResult] = useState(null); // { url, site_name } — set by <NetlifyDeployButton onDeployed>, used for "Redeploy" label + banner
  const [sendModalOpen, setSendModalOpen] = useState(false);
  const [saveTemplateOpen, setSaveTemplateOpen] = useState(false);
  const [importTemplateOpen, setImportTemplateOpen] = useState(false);

  // ── Chat history / sessions (per-tool) ──
  const [sessionId, setSessionId] = useState(null);
  const [sessions, setSessions] = useState([]);
  const [showSessions, setShowSessions] = useState(false);
  const [renamingSessionId, setRenamingSessionId] = useState(null);
  const [renameDraft, setRenameDraft] = useState('');
  const [confirmDeleteId, setConfirmDeleteId] = useState(null);
  const saveTimer = useRef(null);
  const sessionIdRef = useRef(null);
  const customTitleIdsRef = useRef(new Set());
  useEffect(() => { sessionIdRef.current = sessionId; }, [sessionId]);

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
  const bsTemplatesRef = useRef(null);
  const iframeRef = useRef(null);
  const editMapRef = useRef(new Map());
  const skipIframeWriteRef = useRef(false);

  const chatStarted = chatMessages.length > 0;

  // ── Load session list for this tool ──
  useEffect(() => {
    supabase.auth.getSession().then(async ({ data: { session } }) => {
      if (!session?.user) return;
      const { data, error } = await supabase
        .from('marketing_sessions')
        .select('id, title, tool, updated_at')
        .eq('user_id', session.user.id)
        .eq('tool', activeTool)
        .order('updated_at', { ascending: false })
        .limit(50);
      if (error) {
        console.warn('[marketing] sessions list failed:', error.message || error);
        return;
      }
      if (data) setSessions(data);
    });
  }, [activeTool]);

  // Strip UI-only fields before persisting so we don't balloon the
  // jsonb column with base64 image dataUrls (one upload can blow the
  // row past the 1MB sweet spot) and so we don't have to serialize
  // transient flags like isStatus/loading.
  const sanitizeMessagesForSave = useCallback((list) => {
    return (list || [])
      .filter((m) => !m.isStatus)
      // Drop assistant bubbles that have no text AND no images. These come
      // from streams that were aborted mid-turn — if we persist them,
      // loadSession re-hydrates the empty-content assistant, sendMessage
      // forwards it to Anthropic, and Anthropic 400s with "assistant
      // message must not be empty". User messages can never be empty
      // (sendMessage requires text.trim()), so no role-specific check needed.
      .filter((m) => {
        const text = m.text || m.content || '';
        const hasImages = Array.isArray(m.images) && m.images.length > 0;
        return text.trim().length > 0 || hasImages;
      })
      .map((m) => {
        const out = { id: m.id, role: m.role, text: m.text || m.content || '' };
        if (Array.isArray(m.images) && m.images.length) {
          out.images = m.images.map((img) => ({
            id: img.id,
            name: img.name,
            type: img.type,
            // Don't persist the raw base64 dataUrl — it's gigantic and
            // the file is already ephemeral. Keep just the metadata so
            // the UI can re-render a placeholder on reload.
          }));
        }
        return out;
      });
  }, []);

  // ── Debounced auto-save — persist chat + canvas + frames ──
  useEffect(() => {
    if (chatMessages.length === 0 && !canvasHtml && storyFrames.length === 0) return;
    if (saveTimer.current) clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(async () => {
      try {
        const { data: { session } } = await supabase.auth.getSession();
        if (!session?.user) return;
        const userId = session.user.id;
        const cleanMessages = sanitizeMessagesForSave(chatMessages);
        // Skip if the only "content" is a status bubble that got filtered out.
        if (cleanMessages.length === 0 && !canvasHtml && storyFrames.length === 0) return;
        const firstUser = cleanMessages.find((m) => m.role === 'user');
        const title = firstUser?.text?.slice(0, 80) || 'New conversation';
        const payload = {
          messages: cleanMessages,
          canvas_html: canvasHtml || null,
          story_frames: storyFrames.length ? storyFrames : null,
          updated_at: new Date().toISOString(),
        };
        // sessionId is always set (newConversation + URL sync both pre-mint
        // the uuid). Use upsert so the first save creates the row and
        // subsequent saves update it — no separate insert/update branches.
        const id = sessionIdRef.current;
        if (!id) return;
        const isCustom = customTitleIdsRef.current.has(id);
        const finalPayload = isCustom
          ? { id, user_id: userId, tool: activeTool, ...payload }
          : { id, user_id: userId, tool: activeTool, title, ...payload };
        const { data, error: upErr } = await supabase
          .from('marketing_sessions')
          .upsert(finalPayload, { onConflict: 'id' })
          .select('id, title, tool, updated_at')
          .single();
        if (upErr) {
          console.error('[marketing] session upsert failed:', upErr.message || upErr);
          return;
        }
        if (data) {
          setSessions((prev) => {
            const existing = prev.find((s) => s.id === data.id);
            if (existing) {
              return prev.map((s) => s.id === data.id ? { ...s, title: isCustom ? s.title : data.title, updated_at: data.updated_at } : s);
            }
            return [data, ...prev];
          });
        }
      } catch (err) {
        console.error('[marketing] autosave threw:', err?.message || err);
      }
    }, 1200);
    return () => clearTimeout(saveTimer.current);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [chatMessages, canvasHtml, storyFrames, activeTool]);

  // ── Session lifecycle handlers ──
  const loadSession = useCallback(async (id, { navigateToUrl = true } = {}) => {
    const { data, error } = await supabase
      .from('marketing_sessions')
      .select('*')
      .eq('id', id)
      .single();
    if (error || !data) {
      // Session doesn't exist (e.g. URL to a deleted session) — treat as a
      // fresh conversation with this id so the user lands somewhere sane.
      // Mirrors AiCeo's behaviour.
      sessionIdRef.current = id;
      setSessionId(id);
      setChatMessages([]);
      setMessages([]);
      setCanvasHtml('');
      setStoryFrames([]);
      setCurrentQuestion(null);
      return;
    }
    sessionIdRef.current = data.id;
    setSessionId(data.id);
    // Belt for old sessions saved before the empty-message filter: skip any
    // empty-content assistants so a legacy aborted-turn row can't poison
    // the next orchestrate call with an empty assistant that Anthropic 400s on.
    const safeMessages = (data.messages || []).filter((m) => {
      const text = m.text || m.content || '';
      const hasImages = Array.isArray(m.images) && m.images.length > 0;
      return text.trim().length > 0 || hasImages;
    });
    setChatMessages(safeMessages);
    // ApiMessages mirror chatMessages but without UI-only fields; rebuild.
    setMessages(safeMessages.map((m) => ({ role: m.role, content: m.text || m.content || '' })));
    setCanvasHtml(data.canvas_html || '');
    setStoryFrames(Array.isArray(data.story_frames) ? data.story_frames : []);
    setCurrentQuestion(null);
    setCustomTyping(false);
    setCustomText('');
    setShowSessions(false);
    if (navigateToUrl) navigate(`/marketing/${activeTool}/${data.id}`, { replace: true });
  }, [activeTool, navigate]);

  const newConversation = useCallback(() => {
    // Mint the session uuid up front — mirrors AiCeo. This way the URL and any
    // backend calls (artifact_versions, file-based edits) all agree from turn
    // zero instead of waiting for the first autosave ~1.2s later.
    const newId = (typeof crypto !== 'undefined' && crypto.randomUUID)
      ? crypto.randomUUID()
      : `mkt-${Date.now()}-${Math.random().toString(36).slice(2)}`;
    sessionIdRef.current = newId;
    setSessionId(newId);
    setChatMessages([]);
    setMessages([]);
    setCanvasHtml('');
    setStoryFrames([]);
    setCurrentQuestion(null);
    setCustomTyping(false);
    setCustomText('');
    setShowSessions(false);
    navigate(`/marketing/${activeTool}/${newId}`, { replace: true });
  }, [activeTool, navigate]);

  const startRenameSession = useCallback((s, e) => {
    e?.stopPropagation?.();
    setRenamingSessionId(s.id);
    setRenameDraft(s.title || '');
  }, []);
  const cancelRenameSession = useCallback(() => {
    setRenamingSessionId(null);
    setRenameDraft('');
  }, []);
  const commitRenameSession = useCallback(async () => {
    const id = renamingSessionId;
    if (!id) return;
    const next = renameDraft.trim() || 'Untitled conversation';
    const current = sessions.find((s) => s.id === id);
    if (current && current.title === next) { cancelRenameSession(); return; }
    customTitleIdsRef.current.add(id);
    setSessions((prev) => prev.map((s) => s.id === id ? { ...s, title: next } : s));
    setRenamingSessionId(null);
    setRenameDraft('');
    await supabase.from('marketing_sessions').update({ title: next }).eq('id', id);
  }, [renamingSessionId, renameDraft, sessions, cancelRenameSession]);

  const requestDeleteSession = useCallback((id, e) => {
    e?.stopPropagation?.();
    setConfirmDeleteId(id);
  }, []);
  const confirmDeleteSession = useCallback(async () => {
    const id = confirmDeleteId;
    if (!id) return;
    setConfirmDeleteId(null);
    await supabase.from('marketing_sessions').delete().eq('id', id);
    setSessions((prev) => prev.filter((s) => s.id !== id));
    if (sessionIdRef.current === id) newConversation();
  }, [confirmDeleteId, newConversation]);

  // ── URL -> session sync ──
  // When the :sessionId route param changes (direct URL, back/forward, refresh),
  // load that session. When missing on mount, mint a fresh one so the URL and
  // any backend calls (artifact_versions, file-based edits) agree from turn 0.
  // Mirrors AiCeo.jsx.
  useEffect(() => {
    if (urlSessionId) {
      if (urlSessionId !== sessionIdRef.current) {
        loadSession(urlSessionId, { navigateToUrl: false });
      }
    } else if (!sessionIdRef.current) {
      newConversation();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [urlSessionId]);

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
  // Also inject CTA link editor overlay and text editing for hover-to-edit functionality
  useEffect(() => {
    // Skip rewrite if the change came from an inline text edit (preserves cursor/DOM state)
    if (skipIframeWriteRef.current) {
      skipIframeWriteRef.current = false;
      return;
    }

    const iframe = iframeRef.current;
    if (!iframe) return;
    const doc = iframe.contentDocument;
    if (!doc) return;
    if (canvasHtml) {
      // Replace {{GENERATE:...}} and cover image placeholders with shimmer for display
      let displayHtml = canvasHtml;
      const placeholderDiv = `<div class="gen-shimmer" style="width:100%;height:250px;background:#e2e2e2;border-radius:12px;display:flex;align-items:center;justify-content:center;position:relative;overflow:hidden"><style>.gen-shimmer::before{content:'';position:absolute;width:300%;height:300%;top:-100%;left:-100%;background:linear-gradient(135deg,transparent 35%,rgba(255,255,255,0.5) 48%,rgba(255,255,255,0.8) 50%,rgba(255,255,255,0.5) 52%,transparent 65%);animation:genShimmer 2s linear infinite}@keyframes genShimmer{0%{transform:translate(-33%,-33%)}100%{transform:translate(33%,33%)}}</style><span style="color:#9e9e9e;font-size:13px;font-weight:600;font-family:Inter,system-ui,sans-serif;position:relative;z-index:1;letter-spacing:0.5px">Generating</span></div>`;
      if (displayHtml.includes('{{GENERATE:')) {
        // Replace full <img> tags containing {{GENERATE:...}}
        displayHtml = displayHtml.replace(/<img[^>]*\{\{GENERATE:[\s\S]*?\}\}[^>]*\/?>/gi, placeholderDiv);
        // Catch any remaining bare {{GENERATE:...}}
        displayHtml = displayHtml.replace(/\{\{GENERATE:[\s\S]*?\}\}/g, placeholderDiv);
      }
      // Replace cover image placeholder with shimmer
      if (displayHtml.includes(COVER_IMAGE_PLACEHOLDER)) {
        const coverShimmer = `<div style="max-width:600px;margin:0 auto;">${placeholderDiv}</div>`;
        displayHtml = displayHtml.replace(COVER_IMAGE_PLACEHOLDER, coverShimmer);
      }

      // Inject edit IDs for inline text editing (display-only, not stored in state)
      const { taggedHtml, editMap } = injectEditIds(displayHtml);
      editMapRef.current = editMap;
      displayHtml = taggedHtml;

      doc.open();
      doc.write(displayHtml);
      doc.close();

      // Inject shimmer animation CSS directly into iframe head (survives DOMParser processing)
      const needsShimmer = displayHtml.includes('gen-shimmer');
      if (needsShimmer) {
        const shimmerCss = '.gen-shimmer{width:100%;height:250px;background:#e2e2e2;border-radius:12px;display:flex;align-items:center;justify-content:center;position:relative;overflow:hidden}.gen-shimmer::before{content:"";position:absolute;width:300%;height:300%;top:-100%;left:-100%;background:linear-gradient(135deg,transparent 35%,rgba(255,255,255,0.5) 48%,rgba(255,255,255,0.8) 50%,rgba(255,255,255,0.5) 52%,transparent 65%);animation:genShimmer 2s linear infinite}.gen-shimmer-text{color:#9e9e9e;font-size:13px;font-weight:600;font-family:Inter,system-ui,sans-serif;position:relative;z-index:1;letter-spacing:0.5px}@keyframes genShimmer{0%{transform:translate(-33%,-33%)}100%{transform:translate(33%,33%)}}';
        const shimmerStyle = doc.createElement('style');
        shimmerStyle.textContent = shimmerCss;
        doc.head.appendChild(shimmerStyle);
      }

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
            if (window.__textEditing) return;
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

      // Inject inline text editing script
      const editScript = doc.createElement('script');
      editScript.textContent = getIframeEditScript();
      doc.body.appendChild(editScript);

      // Inject image resize/move/align script
      const imgScript = doc.createElement('script');
      imgScript.textContent = getIframeImageScript();
      doc.body.appendChild(imgScript);
    } else {
      doc.open();
      doc.write('<html><body></body></html>');
      doc.close();
    }
  }, [canvasHtml]);

  // Listen for CTA link edits and text edits from the iframe
  useEffect(() => {
    function handleMessage(e) {
      if (e.data?.type === 'cta-link-edit') {
        const { oldHref, newHref } = e.data;
        setCanvasHtml(prev => {
          if (!prev) return prev;
          const escaped = oldHref.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
          const regex = new RegExp('href="' + escaped + '"', 'g');
          return prev.replace(regex, 'href="' + newHref.replace(/"/g, '&quot;') + '"');
        });
      } else if (e.data?.type === 'text-edit') {
        const { editId, newHtml } = e.data;
        skipIframeWriteRef.current = true;
        setCanvasHtml(prev => applyTextEdit(prev, editMapRef.current, editId, newHtml));
      } else if (e.data?.type === 'image-edit') {
        const { src, width, marginLeft, marginRight, textAlign } = e.data;
        if (!src) return;
        skipIframeWriteRef.current = true;
        setCanvasHtml(prev => {
          if (!prev) return prev;
          // Find the img tag with this src and update its container styles
          const escapedSrc = src.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
          // Match the parent div/container that wraps the image
          const containerRegex = new RegExp('(<(?:div|td)[^>]*style="[^"]*text-align:\\s*(?:left|center|right)[^"]*"[^>]*>\\s*<img[^>]*src="' + escapedSrc + '"[^>]*/?>)', 'i');
          const simpleImgRegex = new RegExp('(<div[^>]*>\\s*)?(<img[^>]*src="' + escapedSrc + '"[^>]*/?>)(\\s*</div>)?', 'i');
          const match = prev.match(simpleImgRegex);
          if (match) {
            const imgTag = match[2];
            // Update width on the img tag
            let newImg = imgTag;
            if (width) {
              newImg = newImg.replace(/style="[^"]*"/, (s) => {
                let style = s.slice(7, -1);
                style = style.replace(/width:\s*[^;]+;?/g, '');
                style = 'width:' + width + ';' + style;
                return 'style="' + style + '"';
              });
              // If no style attr, add one
              if (!/style="/.test(newImg)) {
                newImg = newImg.replace(/<img/, '<img style="width:' + width + ';height:auto;display:block;"');
              }
            }
            // Wrap with alignment div
            const alignStyle = textAlign ? 'text-align:' + textAlign + ';' : 'text-align:center;';
            const mStyle = (marginLeft ? 'margin-left:' + marginLeft + ';' : '') + (marginRight ? 'margin-right:' + marginRight + ';' : '');
            const wrapDiv = '<div style="' + alignStyle + 'margin:0 auto;max-width:600px;"><div style="display:inline-block;' + mStyle + 'width:' + (width || '100%') + ';max-width:100%;">' + newImg + '</div></div>';
            return prev.replace(match[0], wrapDiv);
          }
          return prev;
        });
      }
    }
    window.addEventListener('message', handleMessage);
    return () => window.removeEventListener('message', handleMessage);
  }, []);

  // Scale newsletter iframe to fit canvas width  -  iframe scrolls internally
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
    const parts = items.map((i) => `${i.catLabel}: "${i.name}"${i.sub ? ` (${i.sub})` : ''}${i.date ? `  -  ${i.date}` : ''}`);
    return `[CONTEXT  -  The user has selected the following items for reference:\n${parts.join('\n')}\nUse this context to inform your questions and generated content.]\n\n`;
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
      parts.push(`[UPLOADED IMAGES  -  The user has uploaded ${images.length} image(s). When you include them in the HTML output, use exactly this src value for each image:\n${images.map((img) => `- "${img.name}": src="{{IMAGE:${img.id}}}"`).join('\n')}\nDo NOT modify the placeholder src values. Use them exactly as shown above.]`);
    }
    if (docs.length > 0) {
      parts.push(`[UPLOADED DOCUMENTS  -  The user has uploaded ${docs.length} document(s) as additional context:\n${docs.map((doc) => `- "${doc.name}":\n${doc.textContent.slice(0, 3000)}`).join('\n\n')}\n]`);
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

    // Build the content  -  inject context on every message so AI always has it
    const contextStr = buildContextString();
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

    // Auto-timeout after 3 minutes to prevent infinite "thinking" hangs
    const timeoutId = setTimeout(() => {
      if (abortRef.current) abortRef.current.abort();
    }, 180_000);

    // Edit mode = we already have a canvas from a prior turn. canvasHtml is
    // set only AFTER a successful generation, so empty canvas ⇒ first turn,
    // any populated canvas ⇒ subsequent turn ⇒ edit.
    const isEdit = !!canvasHtml;

    // Unique per-turn assistant message id so the backend can tag file-based
    // edits, artifact versions, and logs against the specific chat turn.
    // Mirrors AiCeo's pattern. sessionId comes from the current marketing
    // session (or null on the very first turn before autosave mints one).
    const assistantMsgId = `msg-${Date.now()}-ai`;

    try {
      let fullContent = '';
      let editHandled = false;
      // Surface server-side errors that arrive as SSE 'error' events
      // (e.g. upstream Anthropic abort, model timeout). streamFromBackend
      // routes these through onError but resolves normally on [DONE],
      // so without a flag the caller can't distinguish "completed cleanly
      // with empty content" from "server aborted mid-turn". The former
      // is a rare but valid no-op; the latter must NOT be persisted as
      // an empty assistant message (Anthropic 400s on empty assistants
      // in subsequent turns).
      let streamError = null;

      await streamFromBackend('/api/orchestrate', {
        messages: newMessages,
        mode: 'direct',
        agent: activeTool,
        searchMode: researchMode,
        sessionId: sessionIdRef.current || null,
        assistantMsgId,
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
          // File-based edit  -  backend applied a surgical diff
          editHandled = true;
          setCanvasHtml(html);
          // Check if the edit introduced new {{GENERATE:...}} placeholders
          if (html && html.includes('{{GENERATE:')) {
            const genRegex = /\{\{GENERATE:([\s\S]*?)\}\}/g;
            const matches = [];
            let m;
            while ((m = genRegex.exec(html)) !== null) matches.push({ full: m[0], prompt: m[1] });
            if (matches.length > 0) {
              const isLandingTool = activeTool === 'landing' || activeTool === 'squeeze';
              const imgPlatform = isLandingTool ? 'landing_page' : 'newsletter';
              matches.forEach((match) => {
                (async () => {
                  try {
                    const mktBrand = brandDna ? {
                      photoUrls: brandDna.photo_urls || [],
                      logoUrl: isLandingTool ? null : ((brandDna.logos?.find(l => l.isDefault) || brandDna.logos?.[0])?.url || brandDna.logo_url || null),
                      colors: brandDna.colors || {},
                      mainFont: brandDna.main_font || null,
                    } : null;
                    const result = await generateImage(match.prompt.trim(), imgPlatform, mktBrand);
                    if (result.image) {
                      const uploaded = await uploadImageToStorage(result.image.data, result.image.mimeType);
                      if (uploaded.url) {
                        setCanvasHtml(prev => prev.replaceAll(match.full, uploaded.url));
                      }
                    }
                  } catch (err) {
                    console.error('Edit image gen failed:', err.message);
                  }
                })();
              });
            }
          }
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
          streamError = error || 'Upstream error';
        },
      }, abortRef.current.signal);

      // Remove status messages
      setChatMessages((prev) => prev.filter((m) => !m.isStatus));

      // If the backend streamed an error event (e.g. upstream LLM aborted),
      // treat the whole turn as failed: do NOT push anything to `messages`
      // (an empty or partial assistant would poison the next turn) and
      // surface a user-friendly message in the chat.
      if (streamError && !editHandled) {
        const raw = String(streamError);
        const msg = /idle for \d+s|stream idle|aborted/i.test(raw)
          ? "The AI took too long to reply and I stopped waiting. It's usually a hiccup on the model's side — please try again. If this keeps happening, start a new conversation."
          : /empty|must not be empty|position \d+ with role/i.test(raw)
          ? "This conversation picked up a bad message earlier and the model won't accept it. Please click \"New\" to start fresh — your drafts in the canvas are saved."
          : /rate.?limit|429/i.test(raw)
          ? "We're being rate-limited by the model right now. Give it a minute and try again."
          : /402|credits|insufficient/i.test(raw)
          ? "You're out of credits. Top up in Billing to keep going."
          : "Something went wrong on the model's side. Please try again.";
        setChatMessages((prev) => [
          ...prev.filter((m) => !m.isStatus),
          { id: `msg-${Date.now()}-srverr`, role: 'assistant', text: msg },
        ]);
        return;
      }

      // If the backend handled this as a file-based edit, we're done
      if (editHandled) {
        setMessages((prev) => [...prev, { role: 'assistant', content: '[edit applied]' }]);
      } else {
        // Parse the final response
        const parsed = tryParseAIResponse(fullContent);
        // Guard: never persist an empty assistant into `messages`. An empty
        // content field gets forwarded to Anthropic on the next turn, which
        // rejects with 400 "assistant message must not be empty" and then
        // the whole session is stuck. If the stream closed cleanly with no
        // content AND no canvas update, surface a retry message instead.
        if (!fullContent || !fullContent.trim()) {
          setChatMessages((prev) => [
            ...prev.filter((m) => !m.isStatus),
            { id: `msg-${Date.now()}-empty`, role: 'assistant', text: "The AI didn't produce a response. Please try again." },
          ]);
          return;
        }
        const assistantMsg = { role: 'assistant', content: fullContent };
        setMessages((prev) => [...prev, assistantMsg]);

      if (parsed?.type === 'question') {
        setCurrentQuestion({ text: parsed.text, options: parsed.options });
        setChatMessages((prev) => [...prev, { id: `msg-${Date.now()}-assistant`, role: 'assistant', text: parsed.text }]);
      } else if (parsed?.type === 'cover_image') {
        // Legacy cover_image responses  -  generate and insert directly
        try {
          const mktDefaultLogo = brandDna?.logos?.find(l => l.isDefault) || brandDna?.logos?.[0];
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
          }
        } catch (imgErr) {
          console.error('Cover image gen failed:', imgErr.message);
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

        // Generate ALL frames in parallel  -  no sequential dependency
        // Only pass 1 user photo (for likeness reference), NO logo
        const storyPhotos = brandDna?.photo_urls?.length ? [brandDna.photo_urls[0]] : [];
        const brandData = brandDna ? {
          photoUrls: storyPhotos,
          logoUrl: null,
          colors: brandDna.colors || {},
          mainFont: brandDna.main_font || null,
        } : null;

        const visualStyle = parsed.visual_style || '';

        await Promise.all(frames.map(async (frame, idx) => {
          const captionText = frame.caption || frame.title || '';
          const captionInstruction = captionText ? `\n\nTEXT OVERLAY  -  ONE text sticker:\n- Render EXACTLY ONE text sticker: "${captionText}"\n- Flat solid white (#FFFFFF) rectangle with rounded corners (~12px radius). NO border, NO outline, NO stroke around the pill  -  just a clean flat white shape.\n- Text: "${captionText}" in pure black (#000000), bold weight, clean sans-serif (SF Pro, Helvetica), ~30px\n- Snug padding: pill tightly wraps text. Only as wide as the text needs.\n- Centered horizontally, upper third of frame.\n- ONE sticker only. Do NOT duplicate text. Do NOT add any border or outline around the white pill.\n\nDO NOT RENDER:\n- No Instagram UI (no progress bars, profile pics, usernames, send bar, hearts)\n- No borders or outlines around the text sticker\n- No second copy of the text\n- Just the photo with one clean white text sticker on top.` : '';
          const sequencePrompt = `${visualStyle ? `VISUAL STYLE FOR THIS SERIES: ${visualStyle}\n\n` : ''}This is frame ${idx + 1} of ${frames.length} in a cohesive Instagram Story sequence. Follow the visual style exactly so all frames feel like ONE continuous story.\n\nIMPORTANT: Generate ONLY the photo/image content. Do NOT render any Instagram UI (no progress bars, no profile icons, no usernames, no send message bar, no close button). Just the raw image with the text sticker overlay.\n\n${frame.image_prompt}${captionInstruction}`;

          try {
            const result = await generateImage(sequencePrompt, 'instagram_story', brandData);
            const allowedMime = ['image/png', 'image/jpeg', 'image/gif', 'image/webp'];
            if (result.image && allowedMime.includes(result.image.mimeType)) {
              const src = `data:${result.image.mimeType};base64,${result.image.data}`;
              setStoryFrames((prev) => prev.map((f, i) => i === idx ? { ...f, imageSrc: src, loading: false } : f));
            } else {
              setStoryFrames((prev) => prev.map((f, i) => i === idx ? { ...f, loading: false, error: true } : f));
            }
          } catch (err) {
            console.error(`Story frame ${idx + 1} failed:`, err.message);
            setStoryFrames((prev) => prev.map((f, i) => i === idx ? { ...f, loading: false, error: true } : f));
          }
        }));

        // Read latest frame state via a one-shot ref instead of putting a
        // setChatMessages side-effect inside a setStoryFrames updater.
        // React 19 / StrictMode invokes updater functions twice for purity
        // checks, which was firing the chat message twice with the same
        // Date.now()-based id (duplicate-key warning).
        let failCount = 0;
        setStoryFrames((current) => {
          failCount = current.filter(f => f.error).length;
          return current;
        });
        // Microtask hop so the read above settles before we push the message.
        await Promise.resolve();
        setChatMessages((prev) => [...prev, {
          id: `msg-${Date.now()}-${Math.random().toString(36).slice(2, 8)}-done`,
          role: 'assistant',
          text: failCount > 0
            ? `Story frames done  -  ${frames.length - failCount}/${frames.length} generated (${failCount} failed)`
            : 'All story frames generated! Check the canvas.',
        }]);
      } else if (parsed?.type === 'edit' && parsed.sections) {
        // Section-based edit  -  merge only changed sections into current HTML
        const mergedHtml = mergeSectionEdits(canvasHtml, parsed.sections);
        const finalHtml = replaceImagePlaceholders(mergedHtml, filesSnapshot);
        setCanvasHtml(finalHtml);
        const sectionNames = Object.keys(parsed.sections).join(', ');
        setChatMessages((prev) => [...prev, { id: `msg-${Date.now()}-assistant`, role: 'assistant', text: parsed.summary || `Updated sections: ${sectionNames}` }]);
      } else if (parsed?.type === 'newsletter' || parsed?.type === 'html') {
        let finalHtml = replaceImagePlaceholders(parsed.html, filesSnapshot);

        // If the agent included a cover_image_prompt, insert a placeholder at the top
        // so the shimmer shows while the cover image generates
        const hasCoverPrompt = parsed.cover_image_prompt && activeTool === 'newsletter';
        if (hasCoverPrompt) {
          finalHtml = insertCoverPlaceholder(finalHtml);
        }

        setCanvasHtml(finalHtml);
        setChatMessages((prev) => [...prev, { id: `msg-${Date.now()}-assistant`, role: 'assistant', text: parsed.summary || config.readyText }]);

        // Collect image generation promises  -  isGenerating stays true until all resolve
        const imagePromises = [];

        // Generate AI images for {{GENERATE:...}} placeholders  -  each swaps in independently
        if (finalHtml.includes('{{GENERATE:')) {
          const genRegex = /\{\{GENERATE:([\s\S]*?)\}\}/g;
          const genMatches = [];
          let genMatch;
          while ((genMatch = genRegex.exec(finalHtml)) !== null) {
            genMatches.push({ full: genMatch[0], prompt: genMatch[1] });
          }
          const ERROR_IMG = 'data:image/svg+xml,' + encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" width="600" height="200" viewBox="0 0 600 200"><rect width="598" height="198" x="1" y="1" fill="#fff" rx="8" stroke="#dc2626" stroke-width="2"/><text x="300" y="105" text-anchor="middle" fill="#dc2626" font-family="Inter,system-ui,sans-serif" font-size="13" font-weight="600">Image generation failed</text></svg>');

          // Show status message
          const total = genMatches.length;
          let completed = 0;
          let failed = 0;
          const statusId = `msg-${Date.now()}-imgstatus`;
          setChatMessages((prev) => [...prev, { id: statusId, role: 'assistant', text: `Generating ${total} image${total > 1 ? 's' : ''}...`, isStatus: true }]);

          const inlinePromise = Promise.all(genMatches.map(async (m) => {
            let imgSrc = null;
            try {
              const isLandingTool = activeTool === 'landing' || activeTool === 'squeeze';
              const mktBrandData = brandDna ? {
                photoUrls: brandDna.photo_urls || [],
                logoUrl: isLandingTool ? null : ((brandDna.logos?.find(l => l.isDefault) || brandDna.logos?.[0])?.url || brandDna.logo_url || null),
                colors: brandDna.colors || {},
                mainFont: brandDna.main_font || null,
              } : null;
              const imgPlatform = activeTool === 'landing' || activeTool === 'squeeze' ? 'landing_page' : 'newsletter';
              const result = await generateImage(m.prompt.trim(), imgPlatform, mktBrandData);
              if (result.image) {
                const uploaded = await uploadImageToStorage(result.image.data, result.image.mimeType);
                if (uploaded.url) imgSrc = uploaded.url;
              }
            } catch (err) {
              console.error('Image gen failed:', err.message);
            }

            // Update progress
            completed++;
            if (!imgSrc) failed++;
            const done = completed === total;
            setChatMessages((prev) => prev.map((msg) =>
              msg.id === statusId
                ? { ...msg, text: done
                    ? (failed > 0
                      ? `Generated ${total - failed}/${total} images (${failed} failed)`
                      : `All ${total} image${total > 1 ? 's' : ''} generated`)
                    : `Generating images... ${completed}/${total}${failed > 0 ? ` (${failed} failed)` : ''}`,
                  isStatus: !done }
                : msg
            ));

            setCanvasHtml((prev) => {
              const replacement = imgSrc || ERROR_IMG;
              return prev.replaceAll(m.full, replacement);
            });
          }));
          imagePromises.push(inlinePromise);
        }

        // Generate cover image async  -  shimmer placeholder is already in the HTML
        if (hasCoverPrompt) {
          const coverPromise = (async () => {
            try {
              const mktDefaultLogo = brandDna?.logos?.find(l => l.isDefault) || brandDna?.logos?.[0];
              const brandData = brandDna ? {
                photoUrls: brandDna.photo_urls || [],
                logoUrl: mktDefaultLogo?.url || brandDna.logo_url || null,
                colors: brandDna.colors || {},
                mainFont: brandDna.main_font || null,
              } : null;
              const result = await generateImage(parsed.cover_image_prompt.trim(), 'newsletter', brandData);
              const allowedMime = ['image/png', 'image/jpeg', 'image/gif', 'image/webp'];
              if (result.image && allowedMime.includes(result.image.mimeType)) {
                const uploaded = await uploadImageToStorage(result.image.data, result.image.mimeType);
                const imgSrc = uploaded?.url || `data:${result.image.mimeType};base64,${result.image.data}`;
                setCanvasHtml((prev) => {
                  const coverTag = `<div style="text-align:center;margin:0 auto;max-width:600px;"><img src="${imgSrc}" alt="Newsletter Cover" style="width:100%;height:auto;display:block;" /></div>`;
                  return prev.replace(COVER_IMAGE_PLACEHOLDER, coverTag);
                });
              } else {
                setCanvasHtml((prev) => prev.replace(COVER_IMAGE_PLACEHOLDER, ''));
              }
            } catch (err) {
              console.error('Cover image gen failed:', err.message);
              setCanvasHtml((prev) => prev.replace(COVER_IMAGE_PLACEHOLDER, ''));
            }
          })();
          imagePromises.push(coverPromise);
        }

        // Wait for all image generation to complete before marking as done
        if (imagePromises.length > 0) {
          await Promise.allSettled(imagePromises);
        }
      } else {
        // Fallback  -  show raw text
        setChatMessages((prev) => [...prev, { id: `msg-${Date.now()}-assistant`, role: 'assistant', text: fullContent.slice(0, 500) }]);
      }
      } // end !editHandled
    } catch (err) {
      if (err.name !== 'AbortError') {
        const raw = err.message || '';
        let errText = 'Something went wrong. Please try again.';
        if (err.code === 'STREAM_TIMEOUT' || raw === 'STREAM_TIMEOUT' || /idle|Connection idle/i.test(raw)) {
          errText = "The AI took too long to reply and I stopped waiting. It's usually a hiccup on the model's side — please try again.";
        } else if (/empty|must not be empty|position \d+ with role/i.test(raw)) {
          errText = "This conversation picked up a bad message earlier and the model won't accept it. Please click \"New\" to start fresh — your drafts in the canvas are saved.";
        } else if (/rate.?limit|429/i.test(raw)) {
          errText = "We're being rate-limited by the model right now. Give it a minute and try again.";
        } else if (/402|credits|insufficient/i.test(raw)) {
          errText = "You're out of credits. Top up in Billing to keep going.";
        }
        setChatMessages((prev) => [
          ...prev.filter((m) => !m.isStatus),
          { id: `msg-${Date.now()}-err`, role: 'assistant', text: errText },
        ]);
      }
    } finally {
      clearTimeout(timeoutId);
      setIsGenerating(false);
      // Safety net (ported from Content.jsx): the stream can close cleanly
      // without the backend ever emitting a file_update / edit_summary /
      // agent_chunk that we know how to render. Without this, the UI sits
      // on the rotating "thinking / analyzing…" loader forever because the
      // spinner ends but no assistant bubble ever lands for this turn.
      // If we reach here and the chat still has no non-status assistant
      // message for this turn, surface an explicit "no response" line so
      // the user can retry instead of staring at an empty thread.
      setChatMessages((prev) => {
        const cleaned = prev.filter((m) => !m.isStatus);
        const last = cleaned[cleaned.length - 1];
        if (last?.role === 'assistant') return cleaned;
        return [
          ...cleaned,
          { id: `msg-${Date.now()}-noresp`, role: 'assistant', text: "The AI didn't produce a response. Please try again." },
        ];
      });
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

  // Close BooSend templates dropdown on outside click
  useEffect(() => {
    if (!bsTemplatesOpen) return;
    const handleClickOutside = (e) => {
      if (bsTemplatesRef.current && !bsTemplatesRef.current.contains(e.target)) {
        setBsTemplatesOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [bsTemplatesOpen]);

  // Edit a single story frame  -  sends ONLY that image, no brand data
  const handleEditStoryFrame = useCallback(async (frameIdx, editInstruction) => {
    const frame = storyFrames[frameIdx];
    if (!frame?.imageSrc) return;

    // Mark frame as editing
    setStoryFrames(prev => prev.map((f, i) => i === frameIdx ? { ...f, editing: true } : f));

    // Extract base64 from data URL
    const commaIdx = frame.imageSrc.indexOf(',');
    const mimeMatch = frame.imageSrc.match(/^data:([^;]+);/);
    const refImage = commaIdx !== -1 ? { data: frame.imageSrc.slice(commaIdx + 1), mimeType: mimeMatch?.[1] || 'image/jpeg' } : null;

    try {
      const result = await generateImage(
        `EDIT THIS IMAGE: ${editInstruction}. Keep the same overall style, composition, and photo. Only apply the specific change requested.`,
        'instagram_story',
        null, // no brand data  -  only the image itself
        refImage ? [refImage] : null
      );
      if (result.image) {
        const allowedMime = ['image/png', 'image/jpeg', 'image/gif', 'image/webp'];
        if (allowedMime.includes(result.image.mimeType)) {
          const src = `data:${result.image.mimeType};base64,${result.image.data}`;
          setStoryFrames(prev => prev.map((f, i) => i === frameIdx ? { ...f, imageSrc: src, editing: false } : f));
        } else {
          setStoryFrames(prev => prev.map((f, i) => i === frameIdx ? { ...f, editing: false } : f));
        }
      } else {
        setStoryFrames(prev => prev.map((f, i) => i === frameIdx ? { ...f, editing: false } : f));
      }
    } catch (err) {
      console.error(`Story frame edit failed:`, err.message);
      setStoryFrames(prev => prev.map((f, i) => i === frameIdx ? { ...f, editing: false } : f));
    }
  }, [storyFrames]);

  // Append uploaded image files as new story frames. Pattern lifted from
  // Content.jsx LinkedIn text-post upload (which is known to work):
  //   1. blob: URL for instant optimistic preview (no FileReader needed)
  //   2. Sequential await loop — each file uploads then its frame swaps
  //      (no index races vs parallel setStoryFrames)
  //   3. Stable _uploadKey on each frame so we update by ID, not index —
  //      reorder/delete during upload won't update the wrong frame.
  //   4. Per-file try/catch — one failure doesn't kill the rest.
  const storyUploadInputRef = useRef(null);
  const handleUploadStoryImages = useCallback(async (files) => {
    const list = Array.from(files || []).filter((f) => f && f.type.startsWith('image/'));
    if (list.length === 0) return;

    // Stable key per upload so we find the right frame by id, not index.
    const placeholders = list.map((file) => ({
      _uploadKey: `up-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      title: '',
      caption: '',
      image_prompt: '',
      imageSrc: URL.createObjectURL(file), // instant preview, in-memory
      loading: false,
      uploading: true,
    }));
    setStoryFrames((prev) => [...prev, ...placeholders]);

    for (let i = 0; i < list.length; i++) {
      const file = list[i];
      const key = placeholders[i]._uploadKey;
      try {
        const base64 = await new Promise((resolve, reject) => {
          const reader = new FileReader();
          reader.onload = () => {
            const result = String(reader.result || '');
            const comma = result.indexOf(',');
            resolve(comma !== -1 ? result.slice(comma + 1) : result);
          };
          reader.onerror = reject;
          reader.readAsDataURL(file);
        });
        const uploaded = await uploadImageToStorage(base64, file.type || 'image/png');
        const url = uploaded?.url || uploaded?.publicUrl || null;
        if (!url) throw new Error('upload returned no URL');
        // Swap blob URL for real https URL on the matching frame.
        setStoryFrames((prev) => prev.map((f) =>
          f._uploadKey === key ? { ...f, imageSrc: url, uploading: false } : f
        ));
      } catch (err) {
        console.error('[story-upload]', file.name, err.message || err);
        setStoryFrames((prev) => prev.map((f) =>
          f._uploadKey === key ? { ...f, uploading: false, error: true } : f
        ));
      }
    }
  }, []);

  // Reorder story frames by moving frame at fromIdx into toIdx position.
  // Used by the thumbnail drag-and-drop in StoryPhoneViewer.
  const handleReorderStoryFrames = useCallback((fromIdx, toIdx) => {
    setStoryFrames((prev) => {
      if (fromIdx < 0 || toIdx < 0 || fromIdx >= prev.length || toIdx >= prev.length || fromIdx === toIdx) return prev;
      const next = prev.slice();
      const [moved] = next.splice(fromIdx, 1);
      next.splice(toIdx, 0, moved);
      return next;
    });
  }, []);

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

  // Cleanup abort on unmount
  useEffect(() => {
    return () => {
      if (abortRef.current) abortRef.current.abort();
    };
  }, []);

  // Drag handle  -  supports mouse + touch, horizontal (desktop) + vertical (mobile)
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
    {/* Top bar — sibling of .mkt-split (NOT inside .mkt-split-left). Lives
        directly under the chrome tabs in the column-flex parent so chat-load
        layout reflow inside the split panes can never displace or cover it. */}
    <div className="mkt-chat-topbar">
      <button
        type="button"
        className="mkt-prev-convos"
        onClick={() => setShowSessions((v) => !v)}
        title="Previous conversations"
      >
        <History size={16} />
        <span>Previous conversations</span>
      </button>
      {chatStarted && (
        <button
          type="button"
          className="mkt-new-convo"
          onClick={newConversation}
          title="Start a new conversation"
        >
          <Plus size={14} /> New
        </button>
      )}
    </div>

    <div className="mkt-split" ref={splitRef}>
      {/* Left  -  chat area */}
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

        {/* Question overlay  -  slides up from bottom */}
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

      {/* Right  -  canvas */}
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
                ) : action.isBoosendTemplates ? (
                  <div key={i} className="mkt-template-anchor" ref={bsTemplatesRef}>
                    <button
                      className={`mkt-canvas-btn mkt-canvas-btn--${action.style}`}
                      onClick={() => {
                        setBsTemplatesOpen(v => !v);
                        if (!bsTemplates.length && !bsTemplatesLoading) {
                          setBsTemplatesLoading(true);
                          getBoosendTemplates()
                            .then(res => setBsTemplates(res.templates || []))
                            .catch(() => {})
                            .finally(() => setBsTemplatesLoading(false));
                        }
                      }}
                    >
                      {action.label}
                      <ChevronDown size={14} />
                    </button>
                    {bsTemplatesOpen && (
                      <div className="mkt-bs-dropdown">
                        {bsTemplatesLoading ? (
                          <div className="mkt-bs-dropdown-loading">Loading...</div>
                        ) : bsTemplates.length === 0 ? (
                          <div className="mkt-bs-dropdown-empty">Connect BooSend in Settings first</div>
                        ) : (
                          bsTemplates.map(tpl => (
                            <button
                              key={tpl.id}
                              className="mkt-bs-dropdown-item"
                              onClick={async () => {
                                setBsTemplatesOpen(false);
                                const graph = tpl.automation_graph;
                                if (graph?.nodes?.length) {
                                  setDmGraphData({ nodes: graph.nodes, edges: graph.edges || [] });
                                } else {
                                  try {
                                    const full = await getBoosendTemplate(tpl.id);
                                    const t = full.template || full;
                                    const g = t.automation_graph || {};
                                    setDmGraphData({ nodes: g.nodes || [], edges: g.edges || [] });
                                  } catch { setDmGraphData(null); }
                                }
                              }}
                            >
                              <div className="mkt-bs-dropdown-item-name">{tpl.name}</div>
                              {tpl.description && <div className="mkt-bs-dropdown-item-desc">{tpl.description}</div>}
                            </button>
                          ))
                        )}
                      </div>
                    )}
                  </div>
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
                  <NetlifyDeployButton
                    key={i}
                    getHtml={() => canvasHtml}
                    titleHint={config.label || activeTool}
                    disabled={!canvasHtml}
                    className="mkt-canvas-btn mkt-canvas-btn--netlify"
                    label={deployResult ? 'Redeploy' : 'Deploy to Netlify'}
                    loadingLabel="Deploying..."
                    onDeployed={(url) => {
                      setDeployResult({ url });
                      setChatMessages((prev) => [...prev, {
                        id: `msg-${Date.now()}-deploy`,
                        role: 'assistant',
                        text: `Deployed to Netlify! Your page is live at ${url}`,
                      }]);
                    }}
                    onError={(msg) => setChatMessages((prev) => [...prev, {
                      id: `msg-${Date.now()}-deploy-err`,
                      role: 'assistant',
                      text: `Deploy failed: ${msg}`,
                    }])}
                  />
                ) : action.isUploadStoryImages ? (
                  <span key={i} className="mkt-canvas-upload-anchor">
                    <button
                      className={`mkt-canvas-btn mkt-canvas-btn--${action.style}`}
                      onClick={() => storyUploadInputRef.current?.click()}
                      title="Upload one or more images as new story frames"
                    >
                      <Upload size={14} />
                      {action.label}
                    </button>
                    <input
                      ref={storyUploadInputRef}
                      type="file"
                      accept="image/*"
                      multiple
                      style={{ display: 'none' }}
                      onChange={(e) => {
                        // CRITICAL: snapshot to a plain Array BEFORE clearing
                        // input.value. Setting value='' empties the live
                        // FileList — if we captured a reference to it
                        // beforehand, the handler would see zero files.
                        // Same pattern Content.jsx uses for LI uploads.
                        const files = Array.from(e.target.files || []);
                        e.target.value = '';
                        handleUploadStoryImages(files);
                      }}
                    />
                  </span>
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
            <StoryPhoneViewer
              frames={storyFrames}
              onEditFrame={handleEditStoryFrame}
              onReorderFrames={handleReorderStoryFrames}
            />
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
          {config.canvasEmptyType === 'dm-flow' && (
            <div className="mkt-canvas-empty mkt-canvas-empty--dmflow">
              <DmFlowView graphData={dmGraphData} />
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

    {/* Sessions overlay + panel */}
    {showSessions && (
      <>
        <div className="mkt-sessions-backdrop" onClick={() => setShowSessions(false)} />
        <div className="mkt-sessions-panel">
          <div className="mkt-sessions-header">
            <span>Conversations</span>
            <button className="mkt-sessions-new" onClick={newConversation} title="New conversation">
              <Plus size={14} /> New
            </button>
          </div>
          <div className="mkt-sessions-list">
            {sessions.length === 0 && (
              <div className="mkt-sessions-empty">No past conversations yet for {config.label || activeTool}</div>
            )}
            {sessions.map((s) => {
              const isRenaming = renamingSessionId === s.id;
              return (
                <div
                  key={s.id}
                  className={`mkt-sessions-item ${s.id === sessionId ? 'mkt-sessions-item--active' : ''}`}
                  onClick={() => { if (!isRenaming) loadSession(s.id); }}
                >
                  <div className="mkt-sessions-item-info">
                    {isRenaming ? (
                      <input
                        autoFocus
                        className="mkt-sessions-item-rename"
                        value={renameDraft}
                        onChange={(e) => setRenameDraft(e.target.value)}
                        onClick={(e) => e.stopPropagation()}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter') { e.preventDefault(); commitRenameSession(); }
                          else if (e.key === 'Escape') { e.preventDefault(); cancelRenameSession(); }
                        }}
                        onBlur={commitRenameSession}
                        maxLength={120}
                      />
                    ) : (
                      <span className="mkt-sessions-item-title">{s.title}</span>
                    )}
                    <span className="mkt-sessions-item-meta">
                      {new Date(s.updated_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
                    </span>
                  </div>
                  {!isRenaming && (
                    <button className="mkt-sessions-item-rename-btn" onClick={(e) => startRenameSession(s, e)} title="Rename">
                      <Pencil size={12} />
                    </button>
                  )}
                  <button className="mkt-sessions-item-delete" onClick={(e) => requestDeleteSession(s.id, e)} title="Delete">
                    <Trash2 size={13} />
                  </button>
                </div>
              );
            })}
          </div>
        </div>
      </>
    )}

    {/* Delete confirmation */}
    {confirmDeleteId && (() => {
      const target = sessions.find((s) => s.id === confirmDeleteId);
      return (
        <div className="mkt-confirm-backdrop" onClick={() => setConfirmDeleteId(null)}>
          <div className="mkt-confirm-modal" onClick={(e) => e.stopPropagation()} role="dialog" aria-modal="true">
            <div className="mkt-confirm-icon"><Trash2 size={20} /></div>
            <div className="mkt-confirm-title">Delete this conversation?</div>
            <div className="mkt-confirm-desc">
              {target ? `"${target.title}" will be permanently removed.` : 'This conversation will be permanently removed.'}
            </div>
            <div className="mkt-confirm-actions">
              <button className="mkt-confirm-btn mkt-confirm-btn--cancel" onClick={() => setConfirmDeleteId(null)}>Cancel</button>
              <button className="mkt-confirm-btn mkt-confirm-btn--danger" onClick={confirmDeleteSession} autoFocus>Delete</button>
            </div>
          </div>
        </div>
      );
    })()}
  </>
  );
}

const VALID_TOOLS = ['newsletter', 'landing', 'squeeze', 'story', 'leadmagnet', 'dm'];

export default function Marketing() {
  const { tool: urlTool, sessionId: urlSessionId } = useParams();
  const navigate = useNavigate();
  const [brandDna, setBrandDna] = useState(null);

  // URL is source of truth for which tool is active. If URL has no tool,
  // default to newsletter and redirect so the URL stays honest.
  const activeTab = VALID_TOOLS.includes(urlTool) ? urlTool : 'newsletter';
  useEffect(() => {
    if (!urlTool) {
      navigate('/marketing/newsletter', { replace: true });
    } else if (!VALID_TOOLS.includes(urlTool)) {
      // Unknown tool in URL (typo, renamed tool) — redirect to newsletter.
      navigate('/marketing/newsletter', { replace: true });
    }
  }, [urlTool, navigate]);

  const handleTabClick = useCallback((tabId) => {
    navigate(`/marketing/${tabId}`);
  }, [navigate]);

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
              onClick={() => handleTabClick(tab.id)}
            >
              {tab.label}
            </button>
          )
        )}
      </div>
      <div className="marketing-content">
        <ToolTab
          config={TOOL_CONFIGS[activeTab]}
          activeTool={activeTab}
          brandDna={brandDna}
          urlSessionId={urlSessionId}
          key={activeTab}
        />
      </div>
    </div>
  );
}
