import { useState, useRef, useCallback, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Send, Image, FileText, Link2, ChevronRight, ChevronLeft, X, Plus, History, Loader, CircleStop, Download, Globe, Search, PenLine, ArrowUp } from 'lucide-react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { uploadContextFiles, extractSocialUrls, getContentItems, deleteContentItem, getIntegrationContext, generateImage, getTemplates, getEmails, getSalesCalls, getProducts } from '../lib/api';
import { supabase } from '../lib/supabase';
import './Content.css';

const platforms = [
  {
    id: 'instagram',
    name: 'Instagram',
    color: '#E4405F',
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className="content-pill-icon">
        <rect x="2" y="2" width="20" height="20" rx="5" />
        <circle cx="12" cy="12" r="5" />
        <circle cx="17.5" cy="6.5" r="1" fill="currentColor" stroke="none" />
      </svg>
    ),
  },
  {
    id: 'facebook',
    name: 'Facebook',
    color: '#1877F2',
    icon: (
      <svg viewBox="0 0 24 24" fill="currentColor" className="content-pill-icon">
        <path d="M18 2h-3a5 5 0 00-5 5v3H7v4h3v8h4v-8h3l1-4h-4V7a1 1 0 011-1h3V2z" />
      </svg>
    ),
  },
  {
    id: 'linkedin',
    name: 'LinkedIn',
    color: '#0A66C2',
    icon: (
      <svg viewBox="0 0 24 24" fill="currentColor" className="content-pill-icon">
        <path d="M16 8a6 6 0 016 6v7h-4v-7a2 2 0 00-4 0v7h-4v-7a6 6 0 016-6z" />
        <rect x="2" y="9" width="4" height="12" />
        <circle cx="4" cy="4" r="2" />
      </svg>
    ),
  },
  {
    id: 'youtube',
    name: 'YouTube',
    color: '#FF0000',
    icon: (
      <svg viewBox="0 0 24 24" fill="currentColor" className="content-pill-icon">
        <path d="M23.498 6.186a3.016 3.016 0 00-2.122-2.136C19.505 3.546 12 3.546 12 3.546s-7.505 0-9.377.504A3.017 3.017 0 00.502 6.186C0 8.07 0 12 0 12s0 3.93.502 5.814a3.016 3.016 0 002.122 2.136c1.871.504 9.376.504 9.376.504s7.505 0 9.377-.504a3.015 3.015 0 002.122-2.136C24 15.93 24 12 24 12s0-3.93-.502-5.814zM9.545 15.568V8.432L15.818 12l-6.273 3.568z" />
      </svg>
    ),
  },
  {
    id: 'x',
    name: 'X',
    color: '#000000',
    icon: (
      <svg viewBox="0 0 24 24" fill="currentColor" className="content-pill-icon">
        <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z" />
      </svg>
    ),
  },
  {
    id: 'tiktok',
    name: 'TikTok',
    color: '#010101',
    icon: (
      <svg viewBox="0 0 24 24" fill="currentColor" className="content-pill-icon">
        <path d="M19.59 6.69a4.83 4.83 0 01-3.77-4.25V2h-3.45v13.67a2.89 2.89 0 01-2.88 2.5 2.89 2.89 0 01-2.89-2.89 2.89 2.89 0 012.89-2.89c.28 0 .54.04.79.1v-3.5a6.37 6.37 0 00-.79-.05A6.34 6.34 0 003.15 15a6.34 6.34 0 006.34 6.34 6.34 6.34 0 006.34-6.34V8.72a8.2 8.2 0 004.76 1.52V6.79a4.84 4.84 0 01-1-.1z" />
      </svg>
    ),
  },
];

const SOCIAL_URL_PATTERN = /^https?:\/\/(www\.)?(instagram\.com|facebook\.com|fb\.watch|linkedin\.com|youtube\.com|youtu\.be|x\.com|twitter\.com|tiktok\.com)\//i;

const PLATFORM_GUIDANCE = {
  instagram: `Instagram content that actually performs. Study what top creators do:
- Carousels: A carousel is a STORY told across slides, not a list of random tips. The first slide hooks with a bold claim. Every following slide builds on that hook — revealing, explaining, proving, and concluding. The viewer should NEED to swipe to get the payoff. Last slide = CTA. ALL slides must share the EXACT same visual style (background color, font, layout) so they look like one cohesive set.
- Reels: Hook in first 0.5s. Pattern interrupt. Fast cuts. Text overlays that tell the story on mute. Trending audio when relevant.
- Stories: Raw, authentic, behind-the-scenes. Polls/questions for engagement. Keep it casual.
- Captions: Lead with a strong first line (it's the hook before "...more"). Write like you talk. Break into short paragraphs. 3-5 relevant hashtags max, not 30.
- NEVER use generic filler, excessive emojis, or "Hey guys!" energy. Write like a real person, not a marketing bot.`,
  facebook: `Facebook content that gets shared, not scrolled past. Focus on storytelling, relatable moments, and discussion starters. Longer-form posts perform well. Ask genuine questions. Use line breaks for readability.`,
  linkedin: `LinkedIn content that positions you as a thought leader. Study what works on LinkedIn:

HOOK (first 2 lines — before the "...see more" fold):
- Open with a bold claim, surprising number, contrarian take, or personal story opener
- These 2 lines determine if anyone reads further — make them impossible to scroll past
- Examples: "I lost $200k because I ignored one metric." / "Everyone says X. They're wrong." / "3 years ago I almost quit."

STRUCTURE:
- One sentence per paragraph. White space is your weapon.
- Short paragraphs (1-3 sentences max). Wall of text = death on LinkedIn.
- Use line breaks aggressively — every new thought gets its own line.
- Bold key phrases with asterisks (*like this*) so skimmers get value.
- Numbered lists and bullet points for frameworks/steps.

TONE:
- Write like a smart founder talking to another founder over coffee.
- Share real experiences, real numbers, real results. Vague = invisible.
- No corporate jargon. No "leveraging synergies." No buzzwords.
- Be direct and opinionated. Lukewarm takes get zero engagement.
- First person. "I" not "we." Personal stories outperform everything.

CTA:
- End with a question, a repost prompt, or a soft CTA.
- "What's your take?" / "Repost if you agree" / "DM me X for the full framework"
- Never end with "Let me know your thoughts!" — be specific.

WHAT TO AVOID:
- Excessive emojis (1-2 max, or none)
- Hashtags in the body (put 3-5 at the very end if any)
- Corporate tone or press release energy
- Generic advice with no specifics
- Asking for engagement without giving value first`,
  youtube: `YouTube content built for retention. Titles: curiosity gap + clarity (not clickbait). Descriptions: front-load keywords, include timestamps. Scripts: open with the payoff/promise, deliver value fast, use pattern interrupts every 30-60s. Thumbnails: high contrast, expressive face or striking visual, 3-4 words max.`,
  x: `X/Twitter content that spreads. One idea per tweet. Strong opening line. No filler words. Threads: first tweet must stand alone and hook. Use contrarian takes, specific numbers, or "Here's what nobody tells you about X" patterns. No hashtag spam.`,
  tiktok: `TikTok content that hooks immediately. First frame must stop the scroll — movement, text hook, or pattern interrupt. Keep it under 30s for better completion rate. Use trending sounds. Text overlays that tell the story on mute. Raw > polished.`,
};

// Parse <<OPTIONS>> blocks from AI response
function parseMessageOptions(content) {
  const match = content.match(/<<OPTIONS>>\n?([\s\S]*?)\n?<<\/OPTIONS>>/);
  if (!match) return { text: content, options: null };
  const options = match[1].split('\n').map(o => o.trim()).filter(Boolean);
  const text = content.replace(/<<OPTIONS>>[\s\S]*?<<\/OPTIONS>>/, '').trim();
  return { text, options: options.length > 0 ? options : null };
}

// Fallback: detect plain-text questions with numbered/bullet options
// e.g. "What tone?\n1. Professional\n2. Bold\n3. Casual\n4. Fun"
// Also detects bare questions (ending with ?) when no tool calls or HTML were returned
function parsePlainTextQuestion(content, hadImages) {
  if (!content) return null;
  // Don't treat as question if images were generated (post-generation follow-up)
  if (hadImages) return null;
  // Strip any JSON blocks to avoid false positives
  const text = content.replace(/```[\s\S]*?```/g, '').trim();
  // Skip if the text contains HTML — that's generated content, not a question
  if (text.includes('<!DOCTYPE') || text.includes('<html') || text.includes('<table')) return null;
  // Look for numbered options: "1. Option" or "1) Option" patterns
  const numberedMatch = text.match(/([\s\S]*?\?)\s*\n((?:\s*\d+[.)]\s*.+\n?){3,})/);
  if (numberedMatch) {
    const questionText = numberedMatch[1].trim();
    const optionsBlock = numberedMatch[2].trim();
    const options = optionsBlock.split('\n').map(l => l.replace(/^\s*\d+[.)]\s*/, '').trim()).filter(Boolean);
    if (options.length >= 3) return { text: questionText, options };
  }
  // Look for bullet/dash options: "- Option" patterns
  const bulletMatch = text.match(/([\s\S]*?\?)\s*\n((?:\s*[-•]\s*.+\n?){3,})/);
  if (bulletMatch) {
    const questionText = bulletMatch[1].trim();
    const optionsBlock = bulletMatch[2].trim();
    const options = optionsBlock.split('\n').map(l => l.replace(/^\s*[-•]\s*/, '').trim()).filter(Boolean);
    if (options.length >= 3) return { text: questionText, options };
  }
  // Look for bold/star markdown options: "**Option A**" on separate lines after a question
  const boldMatch = text.match(/([\s\S]*?\?)\s*\n((?:\s*\*\*.+\*\*.*\n?){3,})/);
  if (boldMatch) {
    const questionText = boldMatch[1].trim();
    const optionsBlock = boldMatch[2].trim();
    const options = optionsBlock.split('\n').map(l => l.replace(/^\s*\*\*(.+?)\*\*.*$/, '$1').trim()).filter(Boolean);
    if (options.length >= 3) return { text: questionText, options };
  }
  // Bare question: text ends with "?" and is short enough to be a clarifying question (not a long essay)
  // Extract the last sentence ending with ?
  const lines = text.split('\n').map(l => l.trim()).filter(Boolean);
  const lastLine = lines[lines.length - 1] || '';
  if (lastLine.endsWith('?') && text.length < 500) {
    // Use the whole text as the question (may include preamble like "Got it.")
    return { text: text, options: [] };
  }
  return null;
}

function buildSystemPrompt(platform, photos, documents, socialUrls, brandDna, integrationContext) {
  let prompt = `You are a senior content strategist who creates content that actually performs on social media. You study what top creators and brands do — you understand hooks, retention, visual hierarchy, and what makes people stop scrolling.\n\n`;
  prompt += `You do NOT produce generic AI slop. No excessive emojis. No "Hey guys!" energy. No corporate marketing speak. No cartoonish or clip-art style visuals. You write like a real human who understands the platform.\n\n`;
  prompt += `Platform: ${platform.name}\n\n`;

  prompt += `=== PLATFORM ENFORCEMENT ===\n`;
  prompt += `You are ONLY creating content for ${platform.name}. If the user asks for content for a different platform (e.g. "make a LinkedIn post" while on YouTube), politely tell them to switch to that platform's tab first. Do NOT generate content for other platforms.\n\n`;

  prompt += `=== GUIDED CONTENT CREATION FLOW ===\n`;
  prompt += `When the user describes content they want to create:\n`;
  prompt += `1. Detect the content type (carousel, reel, story, post, script, etc.)\n`;
  prompt += `2. You MUST ask 2-3 quick clarifying questions ONE AT A TIME before generating. These questions shape the output quality.\n`;
  prompt += `3. Format EVERY question as JSON: {"type":"question","text":"Your question here","options":["Option A","Option B","Option C","Option D"]}\n`;
  prompt += `4. After 2-3 questions are answered, generate the FINAL content — no more questions.\n`;
  prompt += `5. EXCEPTION: If the user explicitly says "just generate it" or "skip questions", generate immediately.\n`;
  prompt += `6. When generating final content, ALWAYS call generate_image for EVERY visual needed:\n`;
  prompt += `   - CAROUSEL: You MUST plan the FULL carousel as a STORYLINE before generating any slides. Follow this structure:\n`;
  prompt += `     a) First, decide the narrative arc: Hook → Context/Problem → Key Points (2-3 slides) → Proof/Example → CTA\n`;
  prompt += `     b) Each slide MUST advance the story — slide 2 builds on slide 1, slide 3 builds on slide 2, etc.\n`;
  prompt += `     c) Think of it like a mini-presentation: the viewer should NEED to swipe to get the full value\n`;
  prompt += `     d) Call generate_image SEPARATELY for EACH slide (5-7 slides)\n`;
  prompt += `   - SINGLE POST: Call generate_image once for the post image.\n`;
  prompt += `   - STORY FLOW: Call generate_image for each story frame (3-4 images).\n`;
  prompt += `   - YOUTUBE: Call generate_image for the thumbnail.\n`;
  prompt += `   You can make MULTIPLE generate_image calls in the same response. Each slide needs its own call.\n\n`;

  prompt += `=== CAROUSEL VISUAL CONSISTENCY (CRITICAL) ===\n`;
  prompt += `Every slide in a carousel MUST look like it belongs to the SAME set. To achieve this:\n`;
  prompt += `1. PICK ONE background style and use it across ALL slides: e.g. "solid dark navy (#1a1a2e) background" or "clean white background with subtle gray gradient"\n`;
  prompt += `2. PICK ONE text style and repeat it in EVERY slide prompt: e.g. "bold white sans-serif text, Inter/Helvetica style, centered"\n`;
  prompt += `3. PICK ONE layout template: e.g. "text centered with small subtext below" — do NOT switch layouts between slides\n`;
  prompt += `4. In EVERY generate_image call, include the EXACT SAME style prefix, like:\n`;
  prompt += `   "Style: solid dark navy (#1a1a2e) background, bold white sans-serif headline text centered, thin gray subtext below. [Slide-specific content follows]"\n`;
  prompt += `5. The ONLY thing that changes between slides is the text content and whether the founder appears\n`;
  prompt += `6. Slide 1 (hook) may feature the founder photo — all other slides should be TEXT-FOCUSED with the same clean design\n`;
  prompt += `7. Do NOT alternate between photorealistic and graphic design styles within the same carousel\n\n`;

  prompt += `=== CAROUSEL NARRATIVE STRUCTURE ===\n`;
  prompt += `A good carousel tells a STORY. Each slide has a role:\n`;
  prompt += `- Slide 1 (HOOK): Bold statement or surprising claim that creates curiosity. NOT a question. Makes them swipe.\n`;
  prompt += `- Slide 2 (CONTEXT): Set up the problem or situation. "Here's what most people get wrong..." / "The reality is..."\n`;
  prompt += `- Slides 3-5 (VALUE): Each slide = ONE clear point that builds on the previous. Number them or use a progression.\n`;
  prompt += `- Slide 6 (PROOF/RESULT): What happens when you apply this? A result, transformation, or example.\n`;
  prompt += `- Slide 7 (CTA): Clear next step. "Follow for more" / "Save this for later" / "DM me X"\n`;
  prompt += `The viewer should feel like they're reading a short story, not 7 random tips.\n\n`;
  prompt += `QUESTION RULES:\n`;
  prompt += `- Ask smart questions that shape the output (angle, tone, hook style) — not obvious ones\n`;
  prompt += `- 4 options per question, concise (2-5 words)\n`;
  prompt += `- ONE question per message, keep the preamble to 1-2 sentences max\n`;
  prompt += `- Format: {"type":"question","text":"...","options":["...","...","...","..."]}\n`;
  prompt += `- NEVER skip questions unless the user explicitly asks to skip\n\n`;

  prompt += `=== CONTENT QUALITY STANDARDS ===\n`;
  prompt += `When producing final content:\n`;
  prompt += `- Write ONLY the caption/script/copy that goes in the post — ready to copy and paste\n`;
  prompt += `- Captions: strong first line (the hook), short paragraphs, natural voice\n`;
  prompt += `- DO NOT describe what the slides/images contain in your text. Just write the caption. The images speak for themselves.\n`;
  prompt += `- DO NOT write "Slide 1:", "Slide 2:", etc. in your text output. That content goes INTO the images via generate_image calls.\n`;
  prompt += `- Your text output = the caption the user posts. Your generate_image calls = the visuals. Keep them separate.\n`;
  prompt += `- No filler, no fluff, no "Let me know what you think!" unless it fits naturally\n`;
  prompt += `- MAX 3-5 hashtags, placed at the end, relevant ones only\n\n`;

  prompt += `=== IMAGE GENERATION STANDARDS ===\n`;
  prompt += `When calling generate_image, your prompt MUST follow these rules:\n`;
  prompt += `- The image prompt must describe a REAL graphic design — the kind a professional designer would make in Figma\n`;
  prompt += `- Include ACTUAL TEXT to render on the image — bold headline text, hook text, key phrases. This text IS the content.\n`;
  prompt += `- Specify typography: "bold sans-serif text", "clean modern font", "large white text on dark background"\n`;
  prompt += `- NO cartoons, NO pixel art, NO clip-art, NO illustrations, NO stock photos\n`;
  if (platform.id === 'instagram') {
    prompt += `- INSTAGRAM: Image MUST be SQUARE (1:1). Bold text as the main element. Clean background (solid color, gradient, or blurred photo). Think carousel slide that @garyvee or @chriswillx would post.\n`;
    prompt += `- INSTAGRAM CAROUSEL: Every generate_image call for a carousel MUST start with the SAME style prefix so all slides match visually. Example:\n`;
    prompt += `  "STYLE: Solid dark navy (#1B2838) background, bold white sans-serif headline text centered, light gray subtext below, clean minimal layout. SLIDE CONTENT: [the actual slide text here]"\n`;
    prompt += `  Copy-paste this exact style prefix into every slide's prompt. Only change the SLIDE CONTENT part.\n`;
  } else if (platform.id === 'youtube') {
    prompt += `- YOUTUBE: Image MUST be LANDSCAPE (16:9). Thumbnail style — dramatic, high contrast, 3-4 words max in huge bold text.\n`;
  } else if (platform.id === 'tiktok') {
    prompt += `- TIKTOK: Image MUST be PORTRAIT (9:16). Bold centered text overlay, eye-catching at small size.\n`;
  } else if (platform.id === 'linkedin') {
    prompt += `- LINKEDIN: Image MUST be 4:3 LANDSCAPE ratio. Professional, clean design with authority. Bold headline text, minimal layout.\n`;
  }
  prompt += `- Always specify exact colors (e.g. "black background with white text and red accent")\n`;
  prompt += `- The text on the image should be the HOOK or KEY MESSAGE — not decorative\n\n`;

  prompt += `=== TARGET PLATFORM: ${platform.name} ===\n`;
  prompt += (PLATFORM_GUIDANCE[platform.id] || `Tailor all content for ${platform.name}.`) + '\n\n';

  if (brandDna) {
    prompt += `=== BRAND DNA (MUST USE) ===\n`;
    if (brandDna.description) prompt += `Description: ${brandDna.description}\n`;
    if (brandDna.main_font) prompt += `Main Font: ${brandDna.main_font}\n`;
    if (brandDna.secondary_font) prompt += `Secondary Font: ${brandDna.secondary_font}\n`;
    if (brandDna.colors && Object.keys(brandDna.colors).length) {
      const c = brandDna.colors;
      if (c.primary) prompt += `Primary Color: ${c.primary}\n`;
      if (c.text) prompt += `Text Color: ${c.text}\n`;
      if (c.secondary) prompt += `Secondary Color: ${c.secondary}\n`;
    }
    if (brandDna.photo_urls?.length) prompt += `Brand Photos: ${brandDna.photo_urls.length} reference photo(s) of the user are attached to image generation. Use the person's likeness in every generated image.\n`;
    if (brandDna.documents && Object.keys(brandDna.documents).length) {
      for (const [key, doc] of Object.entries(brandDna.documents)) {
        if (doc.extracted_text) {
          const label = key.replace(/([A-Z])/g, ' $1').replace(/^./, s => s.toUpperCase());
          prompt += `\n--- ${label} ---\n${doc.extracted_text.slice(0, 2000)}\n`;
        }
      }
    }
    prompt += `\nCRITICAL: Every generate_image call MUST incorporate the user's brand identity. In your image prompts, explicitly instruct: "Use the brand colors [${brandDna.colors?.primary || ''}, ${brandDna.colors?.secondary || ''}] and use ${brandDna.main_font || 'the brand font'} typography."\n`;
    prompt += `- Do NOT mention "brand logo" in your image prompts unless the user specifically asks for it. Most social media content (thumbnails, carousels, posts) should NOT have a logo.\n`;
    prompt += `- ALWAYS instruct: "Use the person's face and likeness from the attached reference photos" — the person MUST appear in every image.\n\n`;
  }

  let hasContext = false;

  const donePhotos = photos.filter((p) => p.status === 'done');
  if (donePhotos.length > 0) {
    prompt += `=== REFERENCE PHOTOS ===\n`;
    prompt += `The user has uploaded ${donePhotos.length} reference photo(s):\n`;
    donePhotos.forEach((p, i) => { prompt += `- ${p.file?.name || p.result?.filename || `Photo ${i + 1}`}\n`; });
    prompt += `These photos are visual references for the content. Acknowledge and reference the visual content when generating captions, descriptions, or scripts.\n\n`;
    hasContext = true;
  }

  const doneDocs = documents.filter((d) => d.status === 'done' && d.result?.extractedText);
  if (doneDocs.length > 0) {
    prompt += `=== UPLOADED DOCUMENTS ===\n`;
    doneDocs.forEach((doc, i) => {
      const text = doc.result.extractedText.slice(0, 3000);
      prompt += `--- Document ${i + 1}: ${doc.result?.filename || 'Untitled'} ---\n${text}\n\n`;
    });
    hasContext = true;
  }

  const doneVideoTranscripts = documents.filter((d) => d.status === 'done' && d.result?.transcript);
  if (doneVideoTranscripts.length > 0) {
    prompt += `=== VIDEO TRANSCRIPTS ===\n`;
    doneVideoTranscripts.forEach((doc, i) => {
      const text = doc.result.transcript.slice(0, 3000);
      prompt += `--- ${doc.result?.filename || 'Video'} ---\n${text}\n\n`;
    });
    hasContext = true;
  }

  const doneSocial = socialUrls.filter((s) => s.status === 'done' && s.result);
  if (doneSocial.length > 0) {
    prompt += `=== SOCIAL MEDIA LINKS ===\n`;
    doneSocial.forEach((item) => {
      const r = item.result;
      prompt += `--- ${r.title || item.url} ---\n`;
      prompt += `URL: ${r.url || item.url}\n`;
      if (r.platform) prompt += `Platform: ${r.platform}\n`;
      if (r.uploader) prompt += `Creator: ${r.uploader}\n`;
      if (r.description) prompt += `Description: ${r.description.slice(0, 1000)}\n`;
      if (r.duration) prompt += `Duration: ${r.duration}s\n`;
      if (r.transcript) prompt += `Transcript:\n${r.transcript.slice(0, 3000)}\n`;
      prompt += '\n';
    });
    hasContext = true;
  }

  if (hasContext) {
    prompt += `Use ALL of the above context — photos, documents, transcripts, and social media links — as source material when the user asks you to create or repurpose content. Reference specific quotes, topics, ideas, and visual elements from the provided context.\n\n`;
  }

  if (integrationContext) {
    prompt += `=== BUSINESS DATA FROM INTEGRATIONS ===\n${integrationContext}\n\nUse this business data (call transcripts, payment data, CRM contacts, etc.) to inform your content suggestions with real business context.\n\n`;
  }

  prompt += `Output the ACTUAL content ready to post. Not advice about content. Not suggestions. The real thing. And ALWAYS call generate_image for the visual.`;
  return prompt;
}

// Grok tool definition for image generation
const IMAGE_TOOL = {
  type: 'function',
  function: {
    name: 'generate_image',
    description: 'Generate a professional image for the content. MUST be called when producing final content. The image should look like it belongs on a top-performing Instagram/YouTube account — clean, modern, high production value.',
    parameters: {
      type: 'object',
      properties: {
        prompt: {
          type: 'string',
          description: 'Detailed image generation prompt. MUST include: 1) Style (photorealistic, modern graphic design, or cinematic — NEVER cartoon/pixel-art/clip-art), 2) Specific subject and composition, 3) Color palette and lighting, 4) Any text overlays with exact wording and typography style. Think professional design studio output.',
        },
      },
      required: ['prompt'],
    },
  },
};

// Extract image prompt from AI text when it describes an image instead of calling the tool
function extractImagePromptFromText(text) {
  // Look for common patterns: "Image Description:", "Image Concept:", "Thumbnail Concept:", markdown image blocks, etc.
  const patterns = [
    /(?:image\s*(?:description|concept|prompt|idea)[\s:]*(?:for\s*generation)?[\s:]*)\n*([\s\S]{30,500}?)(?:\n\n|\n(?:##|---|Feel free|Let me know|Caption|Script|Post|Here))/i,
    /(?:thumbnail\s*(?:description|concept|design)[\s:]*)\n*([\s\S]{30,500}?)(?:\n\n|\n(?:##|---|Feel free|Let me know))/i,
    /(?:visual\s*(?:description|concept)[\s:]*)\n*([\s\S]{30,500}?)(?:\n\n|\n(?:##|---|Feel free|Let me know))/i,
  ];
  for (const pat of patterns) {
    const match = text.match(pat);
    if (match) return match[1].trim();
  }
  return null;
}

// Stream Grok response with tool calling support
async function streamContentResponse(messages, systemPrompt, onTextChunk, onToolCall, abortSignal, { searchMode = false, onSearchStatus } = {}) {
  // Research mode: use Responses API with web_search tool (no image tool in research)
  if (searchMode) {
    if (onSearchStatus) onSearchStatus('searching');

    const input = [
      { role: 'system', content: systemPrompt },
      ...messages,
    ];

    const res = await fetch('/api/xai/v1/responses', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${import.meta.env.VITE_XAI_API_KEY}`,
      },
      body: JSON.stringify({
        model: 'grok-3-fast',
        input,
        stream: true,
        tools: [{ type: 'web_search' }],
      }),
      signal: abortSignal,
    });

    if (!res.ok) throw new Error(await res.text());

    const reader = res.body?.getReader();
    if (!reader) throw new Error('No response body');

    const decoder = new TextDecoder();
    let fullContent = '';
    let buffer = '';
    let citations = [];

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
          const eventType = parsed.type;

          if (eventType === 'response.web_search_call.in_progress' || eventType === 'response.web_search_call.searching') {
            if (onSearchStatus) onSearchStatus('searching');
          } else if (eventType === 'response.web_search_call.completed') {
            if (onSearchStatus) onSearchStatus('writing');
          }

          if (eventType === 'response.output_text.delta') {
            const delta = parsed.delta;
            if (delta) { fullContent += delta; onTextChunk(fullContent); }
          }

          if (eventType === 'response.completed' || eventType === 'response.done') {
            const respCitations = parsed.response?.citations || [];
            if (respCitations.length) citations = respCitations;
          }

          // Fallback for chat-completions compatible format
          const choice = parsed.choices?.[0];
          if (choice?.delta?.content) {
            fullContent += choice.delta.content;
            onTextChunk(fullContent);
          }
        } catch { /* skip */ }
      }
    }

    if (citations.length > 0) {
      const sourcesBlock = '\n\n---\n**Sources:**\n' + citations.map((url, i) => `${i + 1}. ${url}`).join('\n');
      fullContent += sourcesBlock;
      onTextChunk(fullContent);
    }

    if (onSearchStatus) onSearchStatus(null);
    return { content: fullContent, hadToolCall: false };
  }

  // Normal mode: Chat Completions API with image tool
  const res = await fetch('/api/xai/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${import.meta.env.VITE_XAI_API_KEY}`,
    },
    body: JSON.stringify({
      model: 'grok-3-fast',
      messages: [{ role: 'system', content: systemPrompt }, ...messages],
      stream: true,
      tools: [IMAGE_TOOL],
      tool_choice: 'auto',
    }),
    signal: abortSignal,
  });
  console.log(`Streaming started (${messages.filter(m => m.role === 'user').length} user messages)`);

  if (!res.ok) throw new Error(await res.text());

  const reader = res.body?.getReader();
  if (!reader) throw new Error('No response body');

  const decoder = new TextDecoder();
  let fullContent = '';
  let buffer = '';
  let toolCalls = {};

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
        const choice = parsed.choices?.[0];
        if (!choice) continue;

        const textDelta = choice.delta?.content;
        if (textDelta) { fullContent += textDelta; onTextChunk(fullContent); }

        const tc = choice.delta?.tool_calls;
        if (tc) {
          for (const call of tc) {
            const idx = call.index ?? 0;
            if (!toolCalls[idx]) toolCalls[idx] = { id: call.id || '', name: '', arguments: '' };
            if (call.id) toolCalls[idx].id = call.id;
            if (call.function?.name) toolCalls[idx].name = call.function.name;
            if (call.function?.arguments) toolCalls[idx].arguments += call.function.arguments;
          }
        }
      } catch { /* skip */ }
    }
  }

  const calls = Object.values(toolCalls).filter((tc) => tc.name === 'generate_image');

  let hadToolCall = false;
  const imageCalls = [];
  for (const call of calls) {
    try {
      const args = JSON.parse(call.arguments);
      if (args.prompt) imageCalls.push({ id: call.id, prompt: args.prompt });
    } catch (e) { console.error('Tool call parse error:', e, call.arguments); }
  }

  if (imageCalls.length === 0 && fullContent) {
    const extractedPrompt = extractImagePromptFromText(fullContent);
    if (extractedPrompt) {
      imageCalls.push({ id: 'fallback', prompt: extractedPrompt });
    }
  }

  if (imageCalls.length > 0) {
    hadToolCall = true;
    await onToolCall(imageCalls);
  }

  return { content: fullContent, hadToolCall };
}

export default function Content() {
  const navigate = useNavigate();
  const [selectedPlatform, setSelectedPlatform] = useState('instagram');
  const [input, setInput] = useState('');
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [photos, setPhotos] = useState([]); // { id, file, status: 'pending'|'uploading'|'done'|'error', result?, dbId?, url? }
  const [documents, setDocuments] = useState([]); // { id, file, status, result?, dbId?, filename? }
  const [socialUrls, setSocialUrls] = useState([]); // { url, status: 'pending'|'extracting'|'done'|'error', result?, dbId? }
  const [socialError, setSocialError] = useState('');
  const [socialHover, setSocialHover] = useState(false);
  const [photoHover, setPhotoHover] = useState(false);
  const [docHover, setDocHover] = useState(false);
  const [photoDragOver, setPhotoDragOver] = useState(false);
  const [docDragOver, setDocDragOver] = useState(false);
  const [tooltip, setTooltip] = useState({ text: '', x: 0, y: 0, visible: false });
  const [contextSheetOpen, setContextSheetOpen] = useState(false);
  const [contentResearchMode, setContentResearchMode] = useState(false);
  const [searchStatus, setSearchStatus] = useState(null);
  const [contentCtxMenuOpen, setContentCtxMenuOpen] = useState(false);
  const [contentHoveredCat, setContentHoveredCat] = useState(null);
  const [currentQuestion, setCurrentQuestion] = useState(null);
  const [customTyping, setCustomTyping] = useState(false);
  const [customText, setCustomText] = useState('');
  const [contentSelectedCtx, setContentSelectedCtx] = useState(new Set());
  const [showPasteBtn, setShowPasteBtn] = useState(false);
  const [messages, setMessages] = useState([]);
  const [isGenerating, setIsGenerating] = useState(false);
  const [brandDna, setBrandDna] = useState(null);
  const [integrationCtx, setIntegrationCtx] = useState('');
  const longPressTimer = useRef(null);
  const messagesEndRef = useRef(null);
  const abortRef = useRef(null);

  const photoInputRef = useRef(null);
  const docInputRef = useRef(null);
  const socialZoneRef = useRef(null);
  const contentCtxRef = useRef(null);

  const [contentCtxCategories, setContentCtxCategories] = useState([
    { id: 'newsletters', label: 'Past Newsletters', iconSrc: '/icon-marketing.png', items: [] },
    { id: 'emails', label: 'Past Emails', iconSrc: '/icon-inbox.png', items: [] },
    { id: 'calls', label: 'Calls', iconSrc: '/icon-call-recording.png', items: [] },
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
      setContentCtxCategories([
        {
          id: 'newsletters', label: 'Past Newsletters', iconSrc: '/icon-marketing.png',
          items: (nlRes.templates || []).map((t) => ({ id: `nl-${t.id}`, name: t.name || t.description || 'Untitled', date: fmt(t.created_at) })),
        },
        {
          id: 'emails', label: 'Past Emails', iconSrc: '/icon-inbox.png',
          items: (emRes.emails || []).map((e) => ({ id: `em-${e.id}`, name: e.subject || '(no subject)', date: fmt(e.date), sub: e.from_name || e.from_email || '' })),
        },
        {
          id: 'calls', label: 'Calls', iconSrc: '/icon-call-recording.png',
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

  const toggleContentCtxItem = (id) => {
    setContentSelectedCtx((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  };

  const getContentSelectedDetails = () => {
    const all = [];
    for (const cat of contentCtxCategories) {
      for (const item of cat.items) {
        if (contentSelectedCtx.has(item.id)) all.push({ ...item, catLabel: cat.label });
      }
    }
    return all;
  };

  const buildContentContextString = () => {
    const items = getContentSelectedDetails();
    if (items.length === 0) return '';
    const parts = items.map((i) => `${i.catLabel}: "${i.name}"${i.sub ? ` (${i.sub})` : ''}${i.date ? ` — ${i.date}` : ''}`);
    return `[CONTEXT — The user has selected the following items for reference:\n${parts.join('\n')}\nPrioritize this context when creating content. Use it to inform your tone, topics, and generated visuals.]\n\n`;
  };

  useEffect(() => {
    if (!contentCtxMenuOpen) return;
    const handleClickOutside = (e) => {
      if (contentCtxRef.current && !contentCtxRef.current.contains(e.target)) {
        setContentCtxMenuOpen(false);
        setContentHoveredCat(null);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [contentCtxMenuOpen]);

  const contentStarters = [
    `Create a carousel post for ${platforms.find(p => p.id === selectedPlatform)?.name || 'Instagram'} about my expertise`,
    'Write a hook-first caption that stops the scroll',
    'Repurpose my last video into multiple posts',
    'Generate a content calendar for this week',
  ];

  const activeIndex = platforms.findIndex((p) => p.id === selectedPlatform);
  const activePlatform = platforms[activeIndex];
  const hasMessages = messages.length > 0;

  let idCounter = useRef(0);
  const nextId = () => ++idCounter.current;

  // Fetch Brand DNA and integration context on mount
  useEffect(() => {
    supabase.auth.getSession().then(async ({ data: { session } }) => {
      if (!session?.user) { console.log('[Content] No session — skipping Brand DNA fetch'); return; }
      const { data, error } = await supabase
        .from('brand_dna')
        .select('*')
        .eq('user_id', session.user.id)
        .order('updated_at', { ascending: true })
        .limit(1);
      const brandRow = data?.[0] || null;
      console.log('[Content] Brand DNA loaded:', brandRow ? { logos: brandRow.logos?.length || (brandRow.logo_url ? 1 : 0), photos: brandRow.photo_urls?.length, colors: brandRow.colors, fonts: { main: brandRow.main_font } } : null, error?.message || '');
      if (brandRow) setBrandDna(brandRow);
    });
    getIntegrationContext().then(({ context }) => {
      if (context) setIntegrationCtx(context);
    }).catch(() => {});
  }, []);

  // Auto-scroll messages
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  // ── Chat logic ──
  const sendToAI = useCallback(async (chatHistory) => {
    setIsGenerating(true);
    const assistantMsgId = `msg-${Date.now()}-ai`;
    setMessages((prev) => [...prev, { id: assistantMsgId, role: 'assistant', content: '', images: [], pendingImages: 0 }]);

    try {
      const abort = new AbortController();
      abortRef.current = abort;
      const apiMessages = chatHistory.map((m) => ({ role: m.role, content: m.content }));
      const systemPrompt = buildSystemPrompt(activePlatform, photos, documents, socialUrls, brandDna, integrationCtx);

      console.group('📋 Content AI — Context being sent');
      console.log('Platform:', activePlatform.name);
      console.log('Photos:', photos.length, photos.map(p => ({ status: p.status, name: p.file?.name || p.result?.filename })));
      console.log('Documents:', documents.length, documents.map(d => ({ status: d.status, name: d.file?.name || d.filename, hasText: !!d.result?.extractedText, hasTranscript: !!d.result?.transcript })));
      console.log('Social URLs:', socialUrls.length, socialUrls.map(s => ({ url: s.url, status: s.status, title: s.result?.title, hasTranscript: !!s.result?.transcript })));
      console.log('Brand DNA:', brandDna ? { description: brandDna.description, colors: brandDna.colors, fonts: { main: brandDna.main_font, secondary: brandDna.secondary_font }, hasPhotos: !!brandDna.photo_urls?.length, hasDocs: brandDna.documents ? Object.keys(brandDna.documents) : [] } : null);
      console.log('Integration Context:', integrationCtx ? integrationCtx.slice(0, 200) + '...' : '(none)');
      console.log('Messages:', apiMessages.length);
      console.log('Full System Prompt:\n', systemPrompt);
      console.groupEnd();

      let streamedContent = '';
      let hadImageGeneration = false;
      await streamContentResponse(
        apiMessages,
        systemPrompt,
        // onTextChunk — stream text, but hide raw JSON questions
        (text) => {
          streamedContent = text;
          // Strip any JSON question block from display — show only the natural text before it
          let displayText = text;
          const jsonStart = text.indexOf('{"type"');
          const jsonStart2 = text.indexOf('{ "type"');
          const fenceStart = text.indexOf('```json');
          const fenceStart2 = text.indexOf('```\n{');
          const cutIdx = [jsonStart, jsonStart2, fenceStart, fenceStart2].filter(i => i !== -1).sort((a, b) => a - b)[0];
          if (cutIdx !== undefined) displayText = text.slice(0, cutIdx).trim();
          setMessages((prev) => prev.map((m) => (m.id === assistantMsgId ? { ...m, content: displayText } : m)));
        },
        // onToolCalls — all generate_image calls at once, run in parallel
        async (imageCalls) => {
          hadImageGeneration = true;
          console.log(`🖼️ Generating ${imageCalls.length} image(s) in parallel`);
          setMessages((prev) => prev.map((m) =>
            m.id === assistantMsgId ? { ...m, pendingImages: imageCalls.length } : m
          ));

          // Collect previous images from the conversation for regeneration reference
          // Find the most recent assistant message that has images (the previous generation)
          const prevImages = [];
          for (let i = chatHistory.length - 1; i >= 0; i--) {
            const msg = messages.find(m => m.id === chatHistory[i]?.id) || chatHistory[i];
            if (msg?.role === 'assistant' && msg.images?.length) {
              // Extract base64 data from data URLs (strip the data:mime;base64, prefix)
              for (const img of msg.images) {
                if (img.src?.startsWith('data:')) {
                  const commaIdx = img.src.indexOf(',');
                  if (commaIdx !== -1) {
                    const mimeMatch = img.src.match(/^data:([^;]+);/);
                    prevImages.push({
                      data: img.src.slice(commaIdx + 1),
                      mimeType: mimeMatch?.[1] || 'image/jpeg',
                    });
                  }
                }
              }
              break; // Only use the most recent set of images
            }
          }
          if (prevImages.length) {
            console.log(`[Content] Regeneration detected — sending ${prevImages.length} previous image(s) as reference`);
          }

          const results = await Promise.allSettled(
            imageCalls.map(async ({ prompt: imgPrompt }, idx) => {
              console.log(`  🎨 [${idx + 1}/${imageCalls.length}] ${imgPrompt.slice(0, 80)}...`);
              // Merge user-uploaded photos with brand photos — user uploads take priority
              const uploadedPhotoUrls = photos.filter(p => p.status === 'done' && (p.url || p.result?.url)).map(p => p.url || p.result?.url).filter(Boolean);
              const allPhotoUrls = [...uploadedPhotoUrls, ...(brandDna?.photo_urls || [])];
              console.log(`[Content] Image gen — photos state: ${photos.length}, done: ${photos.filter(p => p.status === 'done').length}, urls: ${uploadedPhotoUrls.length}, brand: ${brandDna?.photo_urls?.length || 0}, total: ${allPhotoUrls.length}`);
              if (uploadedPhotoUrls.length) console.log(`[Content] Photo URLs:`, uploadedPhotoUrls.map(u => u?.slice(0, 80)));
              // Only include logo if the USER asked for it in their messages (not the AI's prompt)
              const userMessages = chatHistory.filter(m => m.role === 'user').map(m => m.content).join(' ');
              const wantsLogo = /logo/i.test(userMessages);
              const defaultLogo = brandDna?.logos?.find(l => l.isDefault) || brandDna?.logos?.[0];
              const brandImageData = {
                photoUrls: allPhotoUrls,
                logoUrl: wantsLogo ? (defaultLogo?.url || brandDna?.logo_url || null) : null,
                colors: brandDna?.colors || {},
                mainFont: brandDna?.main_font || null,
              };
              // Pass the matching previous image for this slide index (if regenerating)
              const refImages = prevImages.length ? [prevImages[idx] || prevImages[0]] : null;
              const result = await generateImage(imgPrompt, selectedPlatform, brandImageData, refImages);
              // Update message as each image completes
              if (result.image) {
                const src = `data:${result.image.mimeType};base64,${result.image.data}`;
                setMessages((prev) => prev.map((m) =>
                  m.id === assistantMsgId ? {
                    ...m,
                    images: [...m.images, { src, idx }],
                    pendingImages: m.pendingImages - 1,
                  } : m
                ));
              }
              return result;
            })
          );

          // Mark any remaining pending as done
          setMessages((prev) => prev.map((m) =>
            m.id === assistantMsgId ? { ...m, pendingImages: 0 } : m
          ));

          const failed = results.filter(r => r.status === 'rejected');
          if (failed.length > 0) {
            console.warn(`⚠️ ${failed.length} image(s) failed`);
          }
        },
        abort.signal,
        { searchMode: contentResearchMode, onSearchStatus: setSearchStatus },
      );
      // Check if the response contains a JSON question (may be preceded by text)
      const finalContent = streamedContent || '';
      let questionParsed = null;
      try {
        // Strip markdown code fences before parsing
        let jsonSource = finalContent;
        const fenceMatch = finalContent.match(/```(?:json)?\s*([\s\S]*?)```/);
        if (fenceMatch) jsonSource = fenceMatch[1].trim();
        // Extract JSON object from anywhere in the response
        const jsonMatch = jsonSource.match(/\{[\s\S]*"type"\s*:\s*"question"[\s\S]*\}/);
        if (jsonMatch) {
          const parsed = JSON.parse(jsonMatch[0]);
          if (parsed.type === 'question' && parsed.text && Array.isArray(parsed.options)) {
            questionParsed = parsed;
          }
        }
      } catch {}
      // Also try legacy <<OPTIONS>> format
      if (!questionParsed) {
        const { text, options } = parseMessageOptions(finalContent);
        if (options) questionParsed = { text, options };
      }
      // Fallback: detect plain-text questions with numbered/bullet options or bare questions
      if (!questionParsed) {
        questionParsed = parsePlainTextQuestion(finalContent, hadImageGeneration);
      }
      if (questionParsed) {
        setCurrentQuestion(questionParsed);
        // Auto-expand custom input when no predefined options (bare question)
        setCustomTyping(!questionParsed.options || questionParsed.options.length === 0);
        setCustomText('');
        // Show the question text as the message, not the raw JSON
        setMessages((prev) => prev.map((m) =>
          m.id === assistantMsgId ? { ...m, content: questionParsed.text } : m
        ));
      }
    } catch (err) {
      if (err.name !== 'AbortError') {
        setMessages((prev) => prev.map((m) =>
          m.id === assistantMsgId ? { ...m, content: 'Something went wrong. Please try again.' } : m
        ));
      }
    } finally {
      abortRef.current = null;
      setIsGenerating(false);
    }
  }, [activePlatform, photos, documents, socialUrls, brandDna, integrationCtx]);

  const stopGenerating = useCallback(() => {
    if (abortRef.current) { abortRef.current.abort(); abortRef.current = null; setIsGenerating(false); }
  }, []);

  const selectOption = useCallback((option) => {
    if (isGenerating) return;
    setCurrentQuestion(null);
    setCustomTyping(false);
    setCustomText('');
    const contextStr = buildContentContextString();
    const userMsg = { id: `msg-${Date.now()}-user`, role: 'user', content: contextStr + option };
    const updated = [...messages, userMsg];
    setMessages(updated);
    sendToAI(updated);
  }, [isGenerating, messages, sendToAI, contentSelectedCtx, contentCtxCategories]);

  const sendMessage = useCallback(() => {
    const text = input.trim();
    if (!text || isGenerating) return;
    const contextStr = buildContentContextString();
    const userMsg = { id: `msg-${Date.now()}-user`, role: 'user', content: contextStr + text };
    const updated = [...messages, userMsg];
    setMessages(updated);
    setInput('');
    sendToAI(updated);
  }, [input, isGenerating, messages, sendToAI, contentSelectedCtx, contentCtxCategories]);

  const handleKeyDown = (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      sendMessage();
    }
  };

  const autoResize = (e) => {
    const el = e.target;
    el.style.height = 'auto';
    el.style.height = el.scrollHeight + 'px';
  };

  const openSidebar = useCallback(() => { setSidebarOpen(true); setTooltip(t => ({ ...t, visible: false })); }, []);

  // ── File upload & processing ──
  const processFiles = useCallback(async (ids, files, setter) => {
    setter((prev) => prev.map((item) =>
      ids.includes(item.id) ? { ...item, status: 'uploading' } : item
    ));
    try {
      const { files: results } = await uploadContextFiles(files);
      setter((prev) => prev.map((item) => {
        const idx = ids.indexOf(item.id);
        if (idx === -1) return item;
        const result = results[idx];
        return result?.error
          ? { ...item, status: 'error', result }
          : { ...item, status: 'done', result, dbId: result?.dbId, url: result?.url || null };
      }));
    } catch {
      setter((prev) => prev.map((item) =>
        ids.includes(item.id) ? { ...item, status: 'error' } : item
      ));
    }
  }, []);

  const addPhotos = useCallback((newFiles) => {
    setPhotos((prev) => {
      const remaining = 4 - prev.length;
      if (remaining <= 0) return prev;
      const newItems = Array.from(newFiles).slice(0, remaining).map((file) => ({
        id: nextId(), file, status: 'pending',
      }));
      const ids = newItems.map((item) => item.id);
      const fileList = newItems.map((item) => item.file);
      setTimeout(() => processFiles(ids, fileList, setPhotos), 0);
      return [...prev, ...newItems];
    });
  }, [processFiles]);

  const addDocuments = useCallback((newFiles) => {
    const newItems = Array.from(newFiles).map((file) => ({
      id: nextId(), file, status: 'pending',
    }));
    const ids = newItems.map((item) => item.id);
    const fileList = newItems.map((item) => item.file);
    setDocuments((prev) => [...prev, ...newItems]);
    setTimeout(() => processFiles(ids, fileList, setDocuments), 0);
  }, [processFiles]);

  const removeFile = useCallback((index, setter) => {
    setter((prev) => {
      const item = prev[index];
      if (item?.dbId) deleteContentItem(item.dbId).catch(() => {});
      return prev.filter((_, i) => i !== index);
    });
  }, []);

  const handleDrop = useCallback((e, accept) => {
    e.preventDefault();
    const files = Array.from(e.dataTransfer.files).filter((f) => {
      if (accept === 'image/*') return f.type.startsWith('image/');
      return /\.(pdf|doc|docx|txt)$/i.test(f.name);
    });
    if (files.length) addDocuments(files);
  }, [addDocuments]);

  // Paste handlers
  const handleImagePaste = useCallback((e) => {
    const items = e.clipboardData?.items;
    if (!items) return;
    const imageFiles = [];
    for (const item of items) {
      if (item.type.startsWith('image/')) {
        const file = item.getAsFile();
        if (file) imageFiles.push(file);
      }
    }
    if (imageFiles.length > 0) { e.preventDefault(); addPhotos(imageFiles); }
  }, [addPhotos]);

  const handleDocPaste = useCallback((e) => {
    const items = e.clipboardData?.items;
    if (!items) return;
    const docFiles = [];
    for (const item of items) {
      if (item.kind === 'file' && !item.type.startsWith('image/')) {
        const file = item.getAsFile();
        if (file) docFiles.push(file);
      }
    }
    if (docFiles.length > 0) { e.preventDefault(); addDocuments(docFiles); }
  }, [addDocuments]);

  // ── Social URL extraction ──
  const processSocialUrl = useCallback(async (url) => {
    setSocialUrls((prev) => prev.map((item) =>
      item.url === url ? { ...item, status: 'extracting' } : item
    ));
    try {
      const { results } = await extractSocialUrls([url]);
      const result = results[0];
      setSocialUrls((prev) => prev.map((item) =>
        item.url === url
          ? { ...item, status: result?.error ? 'error' : 'done', result, dbId: result?.dbId }
          : item
      ));
    } catch {
      setSocialUrls((prev) => prev.map((item) =>
        item.url === url ? { ...item, status: 'error' } : item
      ));
    }
  }, []);

  const addSocialUrl = useCallback((text) => {
    if (!SOCIAL_URL_PATTERN.test(text)) {
      setSocialError('Not a valid social media URL');
      return;
    }
    if (socialUrls.some((item) => item.url === text)) {
      setSocialError('Already added');
      return;
    }
    setSocialError('');
    setSocialUrls((prev) => [...prev, { url: text, status: 'pending' }]);
    setTimeout(() => processSocialUrl(text), 0);
  }, [socialUrls, processSocialUrl]);

  const handleSocialPaste = useCallback((e) => {
    const text = (e.clipboardData || window.clipboardData).getData('text').trim();
    if (!text) return;
    addSocialUrl(text);
  }, [addSocialUrl]);

  const handleClipboardPaste = useCallback(async () => {
    setShowPasteBtn(false);
    try {
      const text = (await navigator.clipboard.readText()).trim();
      if (!text) return;
      addSocialUrl(text);
    } catch {
      setSocialError('Clipboard access denied');
    }
  }, [addSocialUrl]);

  const handleLongPressStart = useCallback(() => {
    longPressTimer.current = setTimeout(() => setShowPasteBtn(true), 500);
  }, []);

  const handleLongPressEnd = useCallback(() => {
    if (longPressTimer.current) clearTimeout(longPressTimer.current);
  }, []);

  // Clear error after a delay
  useEffect(() => {
    if (!socialError) return;
    const t = setTimeout(() => setSocialError(''), 3000);
    return () => clearTimeout(t);
  }, [socialError]);

  // Listen for paste when hovering over zones
  useEffect(() => {
    if (!socialHover) return;
    const handler = (e) => handleSocialPaste(e);
    document.addEventListener('paste', handler);
    return () => document.removeEventListener('paste', handler);
  }, [socialHover, handleSocialPaste]);

  useEffect(() => {
    if (!photoHover) return;
    const handler = (e) => handleImagePaste(e);
    document.addEventListener('paste', handler);
    return () => document.removeEventListener('paste', handler);
  }, [photoHover, handleImagePaste]);

  useEffect(() => {
    if (!docHover) return;
    const handler = (e) => handleDocPaste(e);
    document.addEventListener('paste', handler);
    return () => document.removeEventListener('paste', handler);
  }, [docHover, handleDocPaste]);

  // Load saved content items from DB on mount
  useEffect(() => {
    getContentItems().then(({ items }) => {
      console.log('[Content] Loaded content items:', items?.length, items?.map(i => ({ type: i.type, url: i.url?.slice(0, 60) })));
      if (!items?.length) return;
      const savedPhotos = [];
      const savedDocs = [];
      const savedSocial = [];
      for (const item of items) {
        if (item.type === 'photo') {
          savedPhotos.push({
            id: nextId(), dbId: item.id, status: 'done',
            file: null, url: item.url || item.storage_url,
            result: { type: 'image', filename: item.filename, url: item.url },
          });
        } else if (item.type === 'document') {
          savedDocs.push({
            id: nextId(), dbId: item.id, status: 'done',
            file: null, filename: item.filename,
            result: { type: 'document', filename: item.filename, url: item.url, extractedText: item.extracted_text, transcript: item.transcript },
          });
        } else if (item.type === 'social') {
          const m = item.metadata || {};
          savedSocial.push({
            url: item.url, dbId: item.id, status: 'done',
            result: {
              url: item.url, title: m.title, uploader: m.uploader,
              thumbnail: m.thumbnail, platform: m.platform,
              duration: m.duration, transcript: item.transcript,
              description: m.description,
            },
          });
        }
      }
      console.log('[Content] Restored context — photos:', savedPhotos.length, 'docs:', savedDocs.length, 'social:', savedSocial.length);
      savedPhotos.forEach((p, i) => console.log(`  [photo ${i}] url: ${p.url?.slice(0, 80)}, result.url: ${p.result?.url?.slice(0, 80)}`));
      // Merge with existing state instead of replacing (avoids race with fresh uploads)
      if (savedPhotos.length) setPhotos(prev => {
        const existingDbIds = new Set(prev.filter(p => p.dbId).map(p => p.dbId));
        const newFromDb = savedPhotos.filter(p => !existingDbIds.has(p.dbId));
        return [...prev, ...newFromDb];
      });
      if (savedDocs.length) setDocuments(prev => {
        const existingDbIds = new Set(prev.filter(d => d.dbId).map(d => d.dbId));
        const newFromDb = savedDocs.filter(d => !existingDbIds.has(d.dbId));
        return [...prev, ...newFromDb];
      });
      if (savedSocial.length) setSocialUrls(prev => {
        const existingDbIds = new Set(prev.filter(s => s.dbId).map(s => s.dbId));
        const newFromDb = savedSocial.filter(s => !existingDbIds.has(s.dbId));
        return [...prev, ...newFromDb];
      });
    }).catch((err) => { console.error('[Content] Failed to load content items:', err); });
  }, []);

  // ── Shared sidebar/sheet content ──
  const contextContent = (isSheet) => (
    <>
      {/* Photo thumbnails */}
      {photos.length > 0 && (
        <div className="cs-photo-grid">
          {photos.map((item, i) => (
            <div key={i} className={`cs-photo-thumb ${item.status === 'uploading' ? 'cs-photo-thumb--processing' : ''}`}>
              <img src={item.file ? URL.createObjectURL(item.file) : item.url} alt={item.file?.name || item.result?.filename || ''} className="cs-photo-img" />
              {(item.status === 'pending' || item.status === 'uploading') && (
                <div className="cs-thumb-overlay">
                  <Loader size={14} className="cs-spinner" />
                </div>
              )}
              {item.status === 'error' && (
                <div className="cs-thumb-overlay cs-thumb-overlay--error">!</div>
              )}
              <button className="cs-photo-remove" onClick={() => removeFile(i, setPhotos)}>
                <X size={10} />
              </button>
            </div>
          ))}
        </div>
      )}

      {/* Photos upload */}
      <input
        ref={isSheet ? undefined : photoInputRef}
        type="file"
        accept="image/*"
        multiple
        style={{ display: 'none' }}
        onChange={(e) => {
          const files = Array.from(e.target.files);
          if (files.length) addPhotos(files);
          e.target.value = '';
        }}
      />
      {photos.length < 4 && (
        <div
          className={`cs-upload-zone cs-upload-zone--expanded ${photoDragOver ? 'cs-upload-zone--dragover' : ''} ${photoHover ? 'cs-upload-zone--hover' : ''}`}
          onClick={() => photoInputRef.current?.click()}
          onMouseEnter={() => setPhotoHover(true)}
          onMouseLeave={() => setPhotoHover(false)}
          onDragOver={(e) => { e.preventDefault(); setPhotoDragOver(true); }}
          onDragLeave={() => setPhotoDragOver(false)}
          onDrop={(e) => {
            e.preventDefault();
            setPhotoDragOver(false);
            const files = Array.from(e.dataTransfer.files).filter((f) => f.type.startsWith('image/'));
            if (files.length) addPhotos(files);
          }}
        >
          <Image size={20} className="cs-upload-icon" />
          <span className="cs-upload-label cs-upload-label--show">Add reference photos</span>
          <span className="cs-upload-hint cs-upload-hint--show">{photos.length}/4 photos</span>
        </div>
      )}

      {/* Document thumbnails */}
      {documents.length > 0 && (
        <div className="cs-doc-grid">
          {documents.map((item, i) => {
            const fname = item.file?.name || item.filename || '';
            const ext = fname.split('.').pop().toLowerCase();
            return (
              <div
                key={i}
                className={`cs-doc-thumb ${item.status === 'uploading' ? 'cs-doc-thumb--processing' : ''}`}
                onMouseEnter={(e) => {
                  const rect = e.currentTarget.getBoundingClientRect();
                  const fn = item.file?.name || item.filename || 'file';
                  const statusText = item.status === 'done' ? `${fn} ✓` : item.status === 'error' ? `${fn} — failed` : fn;
                  setTooltip({ text: statusText, x: rect.left + rect.width / 2, y: rect.top - 6, visible: true });
                }}
                onMouseLeave={() => setTooltip((t) => ({ ...t, visible: false }))}
              >
                {(item.status === 'pending' || item.status === 'uploading') ? (
                  <Loader size={14} className="cs-spinner" />
                ) : (
                  <span className="cs-doc-ext">{ext}</span>
                )}
                {item.status === 'error' && (
                  <div className="cs-thumb-overlay cs-thumb-overlay--error">!</div>
                )}
                <button className="cs-doc-remove" onClick={() => { removeFile(i, setDocuments); setTooltip(t => ({ ...t, visible: false })); }}>
                  <X size={10} />
                </button>
              </div>
            );
          })}
        </div>
      )}

      {/* Documents upload */}
      <input
        ref={isSheet ? undefined : docInputRef}
        type="file"
        accept=".pdf,.doc,.docx,.txt,.json,.csv"
        multiple
        style={{ display: 'none' }}
        onChange={(e) => {
          const files = Array.from(e.target.files);
          if (files.length) addDocuments(files);
          e.target.value = '';
        }}
      />
      <div
        className={`cs-upload-zone cs-upload-zone--expanded ${docDragOver ? 'cs-upload-zone--dragover' : ''} ${docHover ? 'cs-upload-zone--hover' : ''}`}
        onClick={() => docInputRef.current?.click()}
        onMouseEnter={() => setDocHover(true)}
        onMouseLeave={() => setDocHover(false)}
        onDragOver={(e) => { e.preventDefault(); setDocDragOver(true); }}
        onDragLeave={() => setDocDragOver(false)}
        onDrop={(e) => { handleDrop(e, 'docs'); setDocDragOver(false); }}
      >
        <FileText size={20} className="cs-upload-icon" />
        <span className="cs-upload-label cs-upload-label--show">Add documents</span>
        <span className="cs-upload-hint cs-upload-hint--show">PDF, DOC, DOCX, TXT</span>
      </div>

      {/* Social URL paste zone */}
      <div
        ref={isSheet ? undefined : socialZoneRef}
        className={`cs-upload-zone cs-upload-zone--expanded cs-social-zone ${socialHover ? 'cs-social-zone--active' : ''} ${socialError ? 'cs-social-zone--error' : ''}`}
        onMouseEnter={() => setSocialHover(true)}
        onMouseLeave={() => { setSocialHover(false); setSocialError(''); }}
        {...(isSheet ? {
          onTouchStart: handleLongPressStart,
          onTouchEnd: handleLongPressEnd,
          onTouchMove: handleLongPressEnd,
        } : {})}
      >
        <div className="cs-social-icons" style={{ height: 32, gap: 0 }}>
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className="cs-social-float cs-social-float--sheet" style={{ animationDelay: '0s' }}>
            <rect x="2" y="2" width="20" height="20" rx="5" /><circle cx="12" cy="12" r="5" /><circle cx="17.5" cy="6.5" r="1" fill="currentColor" stroke="none" />
          </svg>
          <svg viewBox="0 0 24 24" fill="currentColor" className="cs-social-float cs-social-float--sheet" style={{ animationDelay: '0.8s' }}>
            <path d="M23.498 6.186a3.016 3.016 0 00-2.122-2.136C19.505 3.546 12 3.546 12 3.546s-7.505 0-9.377.504A3.017 3.017 0 00.502 6.186C0 8.07 0 12 0 12s0 3.93.502 5.814a3.016 3.016 0 002.122 2.136c1.871.504 9.376.504 9.376.504s7.505 0 9.377-.504a3.015 3.015 0 002.122-2.136C24 15.93 24 12 24 12s0-3.93-.502-5.814zM9.545 15.568V8.432L15.818 12l-6.273 3.568z" />
          </svg>
          <svg viewBox="0 0 24 24" fill="currentColor" className="cs-social-float cs-social-float--sheet" style={{ animationDelay: '1.6s' }}>
            <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z" />
          </svg>
          <svg viewBox="0 0 24 24" fill="currentColor" className="cs-social-float cs-social-float--sheet" style={{ animationDelay: '2.4s' }}>
            <path d="M16 8a6 6 0 016 6v7h-4v-7a2 2 0 00-4 0v7h-4v-7a6 6 0 016-6z" /><rect x="2" y="9" width="4" height="12" /><circle cx="4" cy="4" r="2" />
          </svg>
          <svg viewBox="0 0 24 24" fill="currentColor" className="cs-social-float cs-social-float--sheet" style={{ animationDelay: '3.2s' }}>
            <path d="M19.59 6.69a4.83 4.83 0 01-3.77-4.25V2h-3.45v13.67a2.89 2.89 0 01-2.88 2.5 2.89 2.89 0 01-2.89-2.89 2.89 2.89 0 012.89-2.89c.28 0 .54.04.79.1v-3.5a6.37 6.37 0 00-.79-.05A6.34 6.34 0 003.15 15a6.34 6.34 0 006.34 6.34 6.34 6.34 0 006.34-6.34V8.72a8.2 8.2 0 004.76 1.52V6.79a4.84 4.84 0 01-1-.1z" />
          </svg>
        </div>
        {isSheet && showPasteBtn && (
          <button className="cs-paste-btn" onClick={handleClipboardPaste}>
            Paste
          </button>
        )}
        <span className="cs-upload-label cs-upload-label--show">
          {socialError || 'Paste a social media link'}
        </span>
        <span className="cs-upload-hint cs-upload-hint--show">
          {isSheet ? 'Press & hold to paste' : 'Hover + Ctrl V'}
        </span>
      </div>
      {socialUrls.length > 0 && (
        <div className="cs-social-cards">
          {socialUrls.map((item, i) => (
            <div key={i} className={`cs-social-card ${item.status === 'extracting' ? 'cs-social-card--extracting' : ''} ${item.status === 'error' ? 'cs-social-card--error' : ''}`}>
              <div className="cs-social-card-thumb">
                {item.result?.thumbnail ? (
                  <img src={item.result.thumbnail} alt="" className="cs-social-card-img" />
                ) : (
                  <div className="cs-social-card-placeholder">
                    <Link2 size={16} />
                  </div>
                )}
                {(item.status === 'pending' || item.status === 'extracting') && (
                  <div className="cs-thumb-overlay">
                    <Loader size={16} className="cs-spinner" />
                  </div>
                )}
              </div>
              <div className="cs-social-card-info">
                <span className="cs-social-card-title">
                  {item.result?.title || item.url.replace(/^https?:\/\/(www\.)?/, '')}
                </span>
                {item.result?.uploader && (
                  <span className="cs-social-card-uploader">{item.result.uploader}</span>
                )}
                {item.status === 'error' && (
                  <span className="cs-url-badge cs-url-badge--error">failed</span>
                )}
              </div>
              <button className="cs-social-card-remove" onClick={() => { if (item.dbId) deleteContentItem(item.dbId).catch(() => {}); setSocialUrls((prev) => prev.filter((_, j) => j !== i)); }}>
                <X size={12} />
              </button>
            </div>
          ))}
        </div>
      )}

      {/* Brand DNA */}
      <div className="cs-branddna cs-branddna--expanded">
        <div className="cs-branddna-top">
          {(() => { const u = brandDna?.logos?.find(l => l.isDefault)?.url || brandDna?.logos?.[0]?.url || brandDna?.logo_url; return u ? (
            <img src={u} alt="Logo" className="cs-branddna-logo" crossOrigin="anonymous" onError={(e) => { e.target.src = '/favicon.png'; }} />
          ) : (
            <img src="/favicon.png" alt="Brand DNA" className="cs-branddna-logo" />
          ); })()}
          <span className="cs-branddna-title cs-branddna-title--show">Brand DNA</span>
        </div>

        {/* Brand Photos */}
        {brandDna?.photo_urls?.length > 0 && (
          <div className="cs-branddna-photos">
            {brandDna.photo_urls.slice(0, 4).map((url, i) => (
              <img key={i} src={url} alt="" className="cs-branddna-photo" crossOrigin="anonymous" onError={(e) => { e.target.style.display = 'none'; }} />
            ))}
            {brandDna.photo_urls.length > 4 && (
              <span className="cs-branddna-photo-more">+{brandDna.photo_urls.length - 4}</span>
            )}
          </div>
        )}

        {/* Brand Colors */}
        {brandDna?.colors && Object.values(brandDna.colors).some(Boolean) && (
          <div className="cs-branddna-colors">
            {brandDna.colors.primary && <div className="cs-branddna-swatch" style={{ background: brandDna.colors.primary }} title={`Primary: ${brandDna.colors.primary}`} />}
            {brandDna.colors.text && <div className="cs-branddna-swatch" style={{ background: brandDna.colors.text }} title={`Text: ${brandDna.colors.text}`} />}
            {brandDna.colors.secondary && <div className="cs-branddna-swatch" style={{ background: brandDna.colors.secondary }} title={`Secondary: ${brandDna.colors.secondary}`} />}
          </div>
        )}

        {/* Brand Fonts */}
        {(brandDna?.main_font || brandDna?.secondary_font) && (
          <div className="cs-branddna-fonts">
            {brandDna.main_font && <span className="cs-branddna-font" style={{ fontFamily: brandDna.main_font }}>{brandDna.main_font}</span>}
            {brandDna.secondary_font && <span className="cs-branddna-font cs-branddna-font--secondary" style={{ fontFamily: brandDna.secondary_font }}>{brandDna.secondary_font}</span>}
          </div>
        )}

        {!brandDna && (
          <p className="cs-branddna-desc cs-branddna-desc--show">
            Set up your brand voice, photos, and visual style.
          </p>
        )}

        <button className="cs-branddna-btn cs-branddna-btn--show" onClick={(e) => { e.stopPropagation(); navigate('/settings', { state: { scrollTo: 'brand-dna' } }); }}>
          {brandDna ? 'Edit Brand DNA' : 'Set Up Brand DNA'}
        </button>
      </div>
    </>
  );

  return (
    <div className="content-page">
      {/* Content Sidebar (desktop only) */}
      <aside
        className={`content-sidebar ${sidebarOpen ? 'content-sidebar--open' : ''}`}
        onClick={!sidebarOpen ? openSidebar : undefined}
      >
        {/* Header */}
        <div className="cs-header">
          {sidebarOpen ? (
            <>
              <span className="cs-title">Context</span>
              <button className="cs-collapse-btn" onClick={(e) => { e.stopPropagation(); setSidebarOpen(false); setTooltip(t => ({ ...t, visible: false })); }} title="Collapse">
                <ChevronLeft size={18} />
              </button>
            </>
          ) : (
            <button className="cs-expand-btn" onClick={openSidebar} title="Expand">
              <ChevronRight size={18} />
            </button>
          )}
        </div>

        <div className="cs-items">
          {/* Photo thumbnails */}
          {photos.length > 0 && (
            <div className="cs-photo-grid">
              {photos.map((item, i) => (
                <div key={i} className={`cs-photo-thumb ${item.status === 'uploading' ? 'cs-photo-thumb--processing' : ''}`}>
                  <img src={item.file ? URL.createObjectURL(item.file) : item.url} alt={item.file?.name || item.result?.filename || ''} className="cs-photo-img" />
                  {(item.status === 'pending' || item.status === 'uploading') && (
                    <div className="cs-thumb-overlay">
                      <Loader size={14} className="cs-spinner" />
                    </div>
                  )}
                  <button className="cs-photo-remove" onClick={() => removeFile(i, setPhotos)}>
                    <X size={10} />
                  </button>
                </div>
              ))}
            </div>
          )}

          {/* Photos upload */}
          <input
            ref={photoInputRef}
            type="file"
            accept="image/*"
            multiple
            style={{ display: 'none' }}
            onChange={(e) => {
              const files = Array.from(e.target.files);
              if (files.length) addPhotos(files);
              e.target.value = '';
            }}
          />
          {photos.length < 4 && (
            <div
              className={`cs-upload-zone ${photoDragOver ? 'cs-upload-zone--dragover' : ''} ${photoHover ? 'cs-upload-zone--hover' : ''}`}
              onClick={() => { if (sidebarOpen) photoInputRef.current?.click(); }}
              onMouseEnter={() => setPhotoHover(true)}
              onMouseLeave={() => setPhotoHover(false)}
              onDragOver={(e) => { e.preventDefault(); setPhotoDragOver(true); }}
              onDragLeave={() => setPhotoDragOver(false)}
              onDrop={(e) => {
                e.preventDefault();
                setPhotoDragOver(false);
                const files = Array.from(e.dataTransfer.files).filter((f) => f.type.startsWith('image/'));
                if (files.length) addPhotos(files);
              }}
            >
              <Image size={20} className="cs-upload-icon" />
              <span className="cs-upload-label">Add reference photos</span>
              <span className="cs-upload-hint">{photos.length}/4 photos</span>
            </div>
          )}

          {/* Document thumbnails */}
          {documents.length > 0 && (
            <div className="cs-doc-grid">
              {documents.map((item, i) => {
                const fname = item.file?.name || item.filename || '';
                const ext = fname.split('.').pop().toLowerCase();
                return (
                  <div
                    key={i}
                    className={`cs-doc-thumb ${item.status === 'uploading' ? 'cs-doc-thumb--processing' : ''}`}
                    onMouseEnter={(e) => {
                      const rect = e.currentTarget.getBoundingClientRect();
                      setTooltip({ text: item.file?.name || item.filename || 'file', x: rect.left + rect.width / 2, y: rect.top - 6, visible: true });
                    }}
                    onMouseLeave={() => setTooltip((t) => ({ ...t, visible: false }))}
                  >
                    {(item.status === 'pending' || item.status === 'uploading') ? (
                      <Loader size={14} className="cs-spinner" />
                    ) : (
                      <span className="cs-doc-ext">{ext}</span>
                    )}
                    <button className="cs-doc-remove" onClick={() => { removeFile(i, setDocuments); setTooltip(t => ({ ...t, visible: false })); }}>
                      <X size={10} />
                    </button>
                  </div>
                );
              })}
            </div>
          )}

          {/* Documents upload */}
          <input
            ref={docInputRef}
            type="file"
            accept=".pdf,.doc,.docx,.txt,.json,.csv"
            multiple
            style={{ display: 'none' }}
            onChange={(e) => {
              const files = Array.from(e.target.files);
              if (files.length) addDocuments(files);
              e.target.value = '';
            }}
          />
          <div
            className={`cs-upload-zone ${docDragOver ? 'cs-upload-zone--dragover' : ''} ${docHover ? 'cs-upload-zone--hover' : ''}`}
            onClick={() => { if (sidebarOpen) docInputRef.current?.click(); }}
            onMouseEnter={() => setDocHover(true)}
            onMouseLeave={() => setDocHover(false)}
            onDragOver={(e) => { e.preventDefault(); setDocDragOver(true); }}
            onDragLeave={() => setDocDragOver(false)}
            onDrop={(e) => { handleDrop(e, 'docs'); setDocDragOver(false); }}
          >
            <FileText size={20} className="cs-upload-icon" />
            <span className="cs-upload-label">Add documents</span>
            <span className="cs-upload-hint">PDF, DOC, DOCX, TXT</span>
          </div>

          {/* Social URL paste zone */}
          <div
            ref={socialZoneRef}
            className={`cs-upload-zone cs-social-zone ${socialHover ? 'cs-social-zone--active' : ''} ${socialError ? 'cs-social-zone--error' : ''}`}
            onMouseEnter={() => setSocialHover(true)}
            onMouseLeave={() => { setSocialHover(false); setSocialError(''); }}
          >
            <div className="cs-social-icons">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className="cs-social-float" style={{ animationDelay: '0s' }}>
                <rect x="2" y="2" width="20" height="20" rx="5" /><circle cx="12" cy="12" r="5" /><circle cx="17.5" cy="6.5" r="1" fill="currentColor" stroke="none" />
              </svg>
              <svg viewBox="0 0 24 24" fill="currentColor" className="cs-social-float" style={{ animationDelay: '0.8s' }}>
                <path d="M23.498 6.186a3.016 3.016 0 00-2.122-2.136C19.505 3.546 12 3.546 12 3.546s-7.505 0-9.377.504A3.017 3.017 0 00.502 6.186C0 8.07 0 12 0 12s0 3.93.502 5.814a3.016 3.016 0 002.122 2.136c1.871.504 9.376.504 9.376.504s7.505 0 9.377-.504a3.015 3.015 0 002.122-2.136C24 15.93 24 12 24 12s0-3.93-.502-5.814zM9.545 15.568V8.432L15.818 12l-6.273 3.568z" />
              </svg>
              <svg viewBox="0 0 24 24" fill="currentColor" className="cs-social-float" style={{ animationDelay: '1.6s' }}>
                <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z" />
              </svg>
              <svg viewBox="0 0 24 24" fill="currentColor" className="cs-social-float" style={{ animationDelay: '2.4s' }}>
                <path d="M16 8a6 6 0 016 6v7h-4v-7a2 2 0 00-4 0v7h-4v-7a6 6 0 016-6z" /><rect x="2" y="9" width="4" height="12" /><circle cx="4" cy="4" r="2" />
              </svg>
              <svg viewBox="0 0 24 24" fill="currentColor" className="cs-social-float" style={{ animationDelay: '3.2s' }}>
                <path d="M19.59 6.69a4.83 4.83 0 01-3.77-4.25V2h-3.45v13.67a2.89 2.89 0 01-2.88 2.5 2.89 2.89 0 01-2.89-2.89 2.89 2.89 0 012.89-2.89c.28 0 .54.04.79.1v-3.5a6.37 6.37 0 00-.79-.05A6.34 6.34 0 003.15 15a6.34 6.34 0 006.34 6.34 6.34 6.34 0 006.34-6.34V8.72a8.2 8.2 0 004.76 1.52V6.79a4.84 4.84 0 01-1-.1z" />
              </svg>
            </div>
            <span className="cs-upload-label">
              {socialError || 'Paste a social media link'}
            </span>
            <span className="cs-upload-hint">Hover + Ctrl V</span>
          </div>
          {socialUrls.length > 0 && (
            <div className="cs-social-cards">
              {socialUrls.map((item, i) => (
                <div key={i} className={`cs-social-card ${item.status === 'extracting' ? 'cs-social-card--extracting' : ''} ${item.status === 'error' ? 'cs-social-card--error' : ''}`}>
                  <div className="cs-social-card-thumb">
                    {item.result?.thumbnail ? (
                      <img src={item.result.thumbnail} alt="" className="cs-social-card-img" />
                    ) : (
                      <div className="cs-social-card-placeholder">
                        <Link2 size={16} />
                      </div>
                    )}
                    {(item.status === 'pending' || item.status === 'extracting') && (
                      <div className="cs-thumb-overlay">
                        <Loader size={16} className="cs-spinner" />
                      </div>
                    )}
                  </div>
                  <div className="cs-social-card-info">
                    <span className="cs-social-card-title">
                      {item.result?.title || item.url.replace(/^https?:\/\/(www\.)?/, '')}
                    </span>
                    {item.result?.uploader && (
                      <span className="cs-social-card-uploader">{item.result.uploader}</span>
                    )}
                    {item.status === 'error' && (
                      <span className="cs-url-badge cs-url-badge--error">failed</span>
                    )}
                  </div>
                  <button className="cs-social-card-remove" onClick={() => { if (item.dbId) deleteContentItem(item.dbId).catch(() => {}); setSocialUrls((prev) => prev.filter((_, j) => j !== i)); }}>
                    <X size={12} />
                  </button>
                </div>
              ))}
            </div>
          )}

          {/* Brand DNA */}
          {sidebarOpen ? (
            <div className="cs-branddna">
              <div className="cs-branddna-top">
                {(() => { const u = brandDna?.logos?.find(l => l.isDefault)?.url || brandDna?.logos?.[0]?.url || brandDna?.logo_url; return u ? (
                  <img src={u} alt="Logo" className="cs-branddna-logo" crossOrigin="anonymous" onError={(e) => { e.target.src = '/favicon.png'; }} />
                ) : (
                  <img src="/favicon.png" alt="Brand DNA" className="cs-branddna-logo" />
                ); })()}
                <span className="cs-branddna-title">Brand DNA</span>
              </div>
              {brandDna?.photo_urls?.length > 0 && (
                <div className="cs-branddna-photos">
                  {brandDna.photo_urls.slice(0, 4).map((url, i) => (
                    <img key={i} src={url} alt="" className="cs-branddna-photo" crossOrigin="anonymous" onError={(e) => { e.target.style.display = 'none'; }} />
                  ))}
                  {brandDna.photo_urls.length > 4 && (
                    <span className="cs-branddna-photo-more">+{brandDna.photo_urls.length - 4}</span>
                  )}
                </div>
              )}
              {brandDna?.colors && Object.values(brandDna.colors).some(Boolean) && (
                <div className="cs-branddna-colors">
                  {brandDna.colors.primary && <div className="cs-branddna-swatch" style={{ background: brandDna.colors.primary }} />}
                  {brandDna.colors.text && <div className="cs-branddna-swatch" style={{ background: brandDna.colors.text }} />}
                  {brandDna.colors.secondary && <div className="cs-branddna-swatch" style={{ background: brandDna.colors.secondary }} />}
                </div>
              )}
              {(brandDna?.main_font || brandDna?.secondary_font) && (
                <div className="cs-branddna-fonts">
                  {brandDna.main_font && <span className="cs-branddna-font">{brandDna.main_font}</span>}
                  {brandDna.secondary_font && <span className="cs-branddna-font cs-branddna-font--secondary">{brandDna.secondary_font}</span>}
                </div>
              )}
              <p className="cs-branddna-desc">
                {brandDna ? '' : 'Set up your brand identity.'}
              </p>
              <button className="cs-branddna-btn" onClick={(e) => { e.stopPropagation(); navigate('/settings', { state: { scrollTo: 'brand-dna' } }); }}>
                {brandDna ? 'Edit Brand DNA' : 'Set Up Brand DNA'}
              </button>
            </div>
          ) : (
            <button
              className="cs-branddna-collapsed"
              onClick={(e) => { e.stopPropagation(); navigate('/settings', { state: { scrollTo: 'brand-dna' } }); }}
              title={brandDna ? 'Edit Brand DNA' : 'Set Up Brand DNA'}
            >
              {(() => { const u = brandDna?.logos?.find(l => l.isDefault)?.url || brandDna?.logos?.[0]?.url || brandDna?.logo_url; return u ? (
                <img src={u} alt="Logo" className="cs-branddna-collapsed-logo" crossOrigin="anonymous" onError={(e) => { e.target.src = '/favicon.png'; }} />
              ) : (
                <img src="/favicon.png" alt="Brand DNA" className="cs-branddna-collapsed-logo" />
              ); })()}
              {brandDna?.colors && Object.values(brandDna.colors).some(Boolean) && (
                <div className="cs-branddna-collapsed-dots">
                  {brandDna.colors.primary && <span className="cs-branddna-collapsed-dot" style={{ background: brandDna.colors.primary }} />}
                  {brandDna.colors.secondary && <span className="cs-branddna-collapsed-dot" style={{ background: brandDna.colors.secondary }} />}
                </div>
              )}
            </button>
          )}
        </div>
      </aside>

      {/* Doc tooltip — rendered outside sidebar to avoid overflow clipping */}
      {tooltip.visible && (
        <div
          className="cs-doc-tooltip"
          style={{ left: tooltip.x, top: tooltip.y }}
        >
          {tooltip.text}
        </div>
      )}

      {/* Mobile Context Bottom Sheet */}
      <div
        className={`context-sheet-overlay ${contextSheetOpen ? 'context-sheet-overlay--open' : ''}`}
        onClick={() => { setContextSheetOpen(false); setShowPasteBtn(false); }}
      />
      <div className={`context-sheet ${contextSheetOpen ? 'context-sheet--open' : ''}`}>
        <div className="context-sheet-handle" onClick={() => { setContextSheetOpen(false); setShowPasteBtn(false); }}>
          <div className="context-sheet-bar" />
        </div>
        <div className="context-sheet-body">
          {contextContent(true)}
        </div>
      </div>

      {/* Main content area */}
      <div className="content-main">
        {/* Platform Pill Selector */}
        <div className="content-top-bar">
          <button className="content-prev-convos" title="Previous conversations">
            <History size={18} className="content-prev-convos-icon" />
            <span className="content-prev-convos-label">Previous conversations</span>
          </button>
          <div className="content-pill-bar">
            <div className="content-pill">
              <div
                className="content-pill-slider"
                style={{ transform: `translateX(calc(${activeIndex} * var(--pill-size)))` }}
              />
              {platforms.map((p) => (
                <button
                  key={p.id}
                  className={`content-pill-btn ${selectedPlatform === p.id ? 'content-pill-btn--active' : ''}`}
                  onClick={() => setSelectedPlatform(p.id)}
                  title={p.name}
                >
                  {p.icon}
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* Chat area */}
        <div className="content-chat-area">
          {!hasMessages ? (
            <div className="content-hero">
              <div className="content-hero-cards">
                {/* Instagram Post */}
                <div className="content-mock content-mock--ig">
                  <div className="content-mock-header">
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className="content-mock-logo">
                      <rect x="2" y="2" width="20" height="20" rx="5" /><circle cx="12" cy="12" r="5" /><circle cx="17.5" cy="6.5" r="1" fill="currentColor" stroke="none" />
                    </svg>
                    <span className="content-mock-handle">yourpage</span>
                  </div>
                  <div className="content-mock-img">
                    <svg viewBox="0 0 48 48" fill="none" className="content-mock-placeholder-icon"><rect width="48" height="48" rx="6" fill="currentColor" opacity="0.08"/><path d="M14 34l8-10 6 7 4-5 6 8H14z" fill="currentColor" opacity="0.15"/><circle cx="18" cy="18" r="3" fill="currentColor" opacity="0.15"/></svg>
                  </div>
                  <div className="content-mock-caption">
                    <div className="content-mock-line" style={{ width: '80%' }} />
                    <div className="content-mock-line" style={{ width: '55%' }} />
                  </div>
                </div>

                {/* YouTube Video */}
                <div className="content-mock content-mock--yt">
                  <div className="content-mock-img content-mock-img--wide">
                    <svg viewBox="0 0 48 28" fill="none" className="content-mock-placeholder-icon"><rect width="48" height="28" rx="4" fill="currentColor" opacity="0.08"/><path d="M19 9v10l9-5-9-5z" fill="currentColor" opacity="0.18"/></svg>
                  </div>
                  <div className="content-mock-meta">
                    <svg viewBox="0 0 24 24" fill="currentColor" className="content-mock-logo">
                      <path d="M23.498 6.186a3.016 3.016 0 00-2.122-2.136C19.505 3.546 12 3.546 12 3.546s-7.505 0-9.377.504A3.017 3.017 0 00.502 6.186C0 8.07 0 12 0 12s0 3.93.502 5.814a3.016 3.016 0 002.122 2.136c1.871.504 9.376.504 9.376.504s7.505 0 9.377-.504a3.015 3.015 0 002.122-2.136C24 15.93 24 12 24 12s0-3.93-.502-5.814zM9.545 15.568V8.432L15.818 12l-6.273 3.568z" />
                    </svg>
                    <div className="content-mock-caption">
                      <div className="content-mock-line" style={{ width: '90%' }} />
                      <div className="content-mock-line" style={{ width: '40%' }} />
                    </div>
                  </div>
                </div>

                {/* X Tweet */}
                <div className="content-mock content-mock--x">
                  <div className="content-mock-header">
                    <svg viewBox="0 0 24 24" fill="currentColor" className="content-mock-logo">
                      <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z" />
                    </svg>
                    <span className="content-mock-handle">@yourbrand</span>
                  </div>
                  <div className="content-mock-caption content-mock-caption--tweet">
                    <div className="content-mock-line" style={{ width: '95%' }} />
                    <div className="content-mock-line" style={{ width: '80%' }} />
                    <div className="content-mock-line" style={{ width: '50%' }} />
                  </div>
                  <div className="content-mock-actions">
                    <div className="content-mock-line" style={{ width: '20%', height: 6 }} />
                    <div className="content-mock-line" style={{ width: '20%', height: 6 }} />
                    <div className="content-mock-line" style={{ width: '20%', height: 6 }} />
                  </div>
                </div>

                {/* TikTok Video */}
                <div className="content-mock content-mock--tt">
                  <div className="content-mock-img content-mock-img--tall">
                    <svg viewBox="0 0 36 48" fill="none" className="content-mock-placeholder-icon"><rect width="36" height="48" rx="6" fill="currentColor" opacity="0.08"/><path d="M15 18v12l9-6-9-6z" fill="currentColor" opacity="0.18"/></svg>
                  </div>
                  <div className="content-mock-meta">
                    <svg viewBox="0 0 24 24" fill="currentColor" className="content-mock-logo">
                      <path d="M19.59 6.69a4.83 4.83 0 01-3.77-4.25V2h-3.45v13.67a2.89 2.89 0 01-2.88 2.5 2.89 2.89 0 01-2.89-2.89 2.89 2.89 0 012.89-2.89c.28 0 .54.04.79.1v-3.5a6.37 6.37 0 00-.79-.05A6.34 6.34 0 003.15 15a6.34 6.34 0 006.34 6.34 6.34 6.34 0 006.34-6.34V8.72a8.2 8.2 0 004.76 1.52V6.79a4.84 4.84 0 01-1-.1z" />
                    </svg>
                    <div className="content-mock-caption">
                      <div className="content-mock-line" style={{ width: '75%' }} />
                    </div>
                  </div>
                </div>
              </div>

              <p className="content-hero-text">Ask your AI CEO to Plan, Ideate or Generate content.</p>

              <div className="content-starters">
                {contentStarters.map((s, i) => (
                  <button key={i} className="content-starter" onClick={() => { setInput(s); }}>
                    <span>{s}</span>
                    <ChevronRight size={14} className="content-starter-arrow" />
                  </button>
                ))}
              </div>
            </div>
          ) : (
            <div className="content-messages">
              {messages.map((msg) => {
                if (msg.role === 'user') {
                  return (
                    <div key={msg.id} className="content-bubble content-bubble--user">
                      <p className="content-user-text">{msg.content}</p>
                    </div>
                  );
                }
                if (!msg.content) {
                  return (
                    <div key={msg.id} className="content-assistant-row">
                      <img src="/favicon.png" alt="" className="content-assistant-avatar" />
                      <div className="content-thinking">
                        <span className="content-thinking-text">
                          {searchStatus === 'searching' ? (
                            <><Search size={14} /> Searching the web<span className="content-dots"><span>.</span><span>.</span><span>.</span></span></>
                          ) : searchStatus === 'writing' ? (
                            <><PenLine size={14} /> Writing response<span className="content-dots"><span>.</span><span>.</span><span>.</span></span></>
                          ) : (
                            <>thinking<span className="content-dots"><span>.</span><span>.</span><span>.</span></span></>
                          )}
                        </span>
                      </div>
                    </div>
                  );
                }
                const parsed = parseMessageOptions(msg.content);
                const sortedImages = [...(msg.images || [])].sort((a, b) => a.idx - b.idx);
                const hasPending = (msg.pendingImages || 0) > 0;
                const hasImages = sortedImages.length > 0 || hasPending;
                return (
                  <div key={msg.id} className="content-assistant-row">
                    <img src="/favicon.png" alt="" className="content-assistant-avatar" />
                    <div className="content-bubble content-bubble--assistant">
                      {parsed.text && (
                        <div className="content-markdown">
                          <ReactMarkdown remarkPlugins={[remarkGfm]} components={{
                            table: ({ children, ...props }) => (
                              <div className="content-table-scroll"><table {...props}>{children}</table></div>
                            ),
                          }}>{parsed.text}</ReactMarkdown>
                        </div>
                      )}
                      {/* Image carousel — below text */}
                      {hasImages && (
                        <div className="content-image-carousel">
                          {sortedImages.map((img, i) => (
                            <div key={i} className="content-carousel-slide content-generated-image--fadein">
                              <img src={img.src} alt={`Slide ${i + 1}`} />
                              <a
                                className="content-carousel-download"
                                href={img.src}
                                download={`slide-${i + 1}.png`}
                                onClick={(e) => e.stopPropagation()}
                              >
                                <Download size={16} />
                              </a>
                            </div>
                          ))}
                          {/* Skeleton placeholders for pending images */}
                          {Array.from({ length: msg.pendingImages || 0 }).map((_, i) => (
                            <div key={`pending-${i}`} className="content-carousel-slide content-image-skeleton">
                              <div className="content-image-skeleton-shimmer" />
                              <div className="content-image-skeleton-label">
                                <Loader size={16} className="cs-spinner" />
                                <span>Generating {activePlatform?.id === 'youtube' ? 'thumbnail' : activePlatform?.id === 'linkedin' ? 'image' : `slide ${sortedImages.length + i + 1}`}...</span>
                              </div>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  </div>
                );
              })}
              {/* Question overlay — appears right after the last assistant bubble */}
              {currentQuestion && !isGenerating && (
                <div className="content-question-overlay">
                  <p className="content-question-text">{currentQuestion.text}</p>
                  {!customTyping ? (
                    <div className="content-question-options">
                      {currentQuestion.options.map((opt, i) => (
                        <button key={i} className="content-question-option" onClick={() => selectOption(opt)}>
                          {opt}
                        </button>
                      ))}
                      <button className="content-question-option content-question-option--custom" onClick={() => setCustomTyping(true)}>
                        Type your own...
                      </button>
                    </div>
                  ) : (
                    <div className="content-question-custom-row">
                      <input
                        className="content-question-custom-input"
                        placeholder="Type your answer..."
                        value={customText}
                        onChange={(e) => setCustomText(e.target.value)}
                        onKeyDown={(e) => { if (e.key === 'Enter' && customText.trim()) selectOption(customText); }}
                        autoFocus
                      />
                      <button className="content-question-custom-send" disabled={!customText.trim()} onClick={() => selectOption(customText)}>
                        <ArrowUp size={16} />
                      </button>
                    </div>
                  )}
                </div>
              )}
              <div ref={messagesEndRef} />
            </div>
          )}
        </div>

        {/* Chat Input */}
        <div className="content-input-area">
          <div className="content-input-wrapper">
            <div className="content-input-top-row">
              <div className="content-ctx-anchor" ref={contentCtxRef}>
                <button className="content-ctx-trigger" onClick={() => { setContentCtxMenuOpen((v) => !v); setContentHoveredCat(null); }}>
                  <Plus size={13} /> Add Context
                </button>
                {contentCtxMenuOpen && (
                  <div className="content-ctx-dropdown">
                    <div className="content-ctx-dropdown-header">Select Context</div>
                    {contentCtxCategories.map((cat) => {
                      const selectedCount = cat.items.filter((i) => contentSelectedCtx.has(i.id)).length;
                      return (
                        <div
                          key={cat.id}
                          className={`content-ctx-cat ${contentHoveredCat === cat.id ? 'content-ctx-cat--active' : ''}`}
                          onMouseEnter={() => setContentHoveredCat(cat.id)}
                        >
                          <div className="content-ctx-cat-icon">
                            <img src={cat.iconSrc} alt={cat.label} className="content-ctx-cat-img" />
                          </div>
                          <span className="content-ctx-cat-label">{cat.label}</span>
                          {selectedCount > 0 && (
                            <span className="content-ctx-cat-badge">{selectedCount}</span>
                          )}
                          <ChevronRight size={13} className="content-ctx-cat-arrow" />
                          {contentHoveredCat === cat.id && (
                            <div className="content-ctx-sub">
                              <div className="content-ctx-sub-header">{cat.label}</div>
                              {cat.items.map((item) => (
                                <div
                                  key={item.id}
                                  className={`content-ctx-sub-item ${contentSelectedCtx.has(item.id) ? 'content-ctx-sub-item--on' : ''}`}
                                  onClick={() => toggleContentCtxItem(item.id)}
                                >
                                  <div className="content-ctx-sub-info">
                                    <span className="content-ctx-sub-name">{item.name}</span>
                                    <span className="content-ctx-sub-meta">
                                      {item.sub && <span>{item.sub}</span>}
                                      {item.sub && item.date && <span className="content-ctx-sub-dot" />}
                                      {item.date && <span>{item.date}</span>}
                                    </span>
                                  </div>
                                  <div className={`content-ctx-radio ${contentSelectedCtx.has(item.id) ? 'content-ctx-radio--on' : ''}`}>
                                    <div className="content-ctx-radio-fill" />
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
                className={`content-research-toggle ${contentResearchMode ? 'content-research-toggle--active' : ''}`}
                onClick={() => setContentResearchMode((v) => !v)}
                title="Enable web research mode"
              >
                <Globe size={13} /> Research
              </button>
              {contentSelectedCtx.size > 0 && (
                <div className="content-ctx-pills">
                  {getContentSelectedDetails().map((item) => (
                    <span key={item.id} className="content-ctx-pill">
                      {item.name}
                      <button className="content-ctx-pill-x" onClick={() => toggleContentCtxItem(item.id)}>
                        <X size={10} />
                      </button>
                    </span>
                  ))}
                </div>
              )}
            </div>
            <div className="content-input-bottom-row">
              <textarea
                className="content-input"
                placeholder={`Create content for ${activePlatform.name}...`}
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onInput={autoResize}
                onKeyDown={handleKeyDown}
                rows={1}
              />
              {isGenerating ? (
                <button className="content-send-btn content-stop-btn" onClick={stopGenerating}>
                  <CircleStop size={18} />
                </button>
              ) : (
                <button className="content-send-btn" disabled={!input.trim()} onClick={sendMessage}>
                  <Send size={18} />
                </button>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
