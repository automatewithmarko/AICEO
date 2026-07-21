import { useState, useRef, useCallback, useEffect, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { Send, Image, FileText, Link2, ChevronRight, ChevronLeft, X, Plus, History, Loader, CircleStop, Download, Globe, Search, PenLine, ArrowUp, Pencil, Trash2, Zap, CalendarDays, RefreshCw, Maximize2, ExternalLink, Clapperboard } from 'lucide-react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import rehypeRaw from 'rehype-raw';
import DOMPurify from 'dompurify';
import { uploadContextFiles, extractSocialUrls, getContentItems, deleteContentItem, getIntegrationContext, generateImage, uploadImageToStorage, getTemplates, getEmails, getSalesCalls, getProducts, getIntegrations, postToLinkedIn, schedulePost, createCalendarPost, publishCalendarPost, getCarouselTemplates, createCarouselTemplate, deleteCarouselTemplate, getLinkedInAuthUrl, streamFromBackend, generateCarouselServerSide, generatePlanItem, getCuratedCarouselTemplates, findCuratedCarouselTemplate } from '../lib/api';
import { supabase } from '../lib/supabase';
import { buildCarouselSlidePrompt } from '../lib/carouselGen';
import CarouselPlanCard from '../components/social-canvas/CarouselPlanCard';
import ContentPlanMessage from '../components/ContentPlanMessage';
import { serializeContentPlan, planPieceLabel, runPlanItems, makeRunToken } from '../lib/planRunner';
import { useAuth } from '../context/AuthContext';
import LinkedInPreview from '../components/LinkedInPreview';
import ChatDropOverlay from '../components/ChatDropOverlay';
import SocialPreview, { SlideViewerModal } from '../components/SocialPreview';
import ScriptPreview from '../components/ScriptPreview';
import { useChatFileDropZone } from '../hooks/useChatFileDropZone';
import '../components/Paywall.css';
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


// Parse <<OPTIONS>> blocks from AI response
// Strip the AI-only [CONTEXT — …] block from a saved user message so
// the bubble renders the user's typed text only. New messages stamp
// `displayText` directly and skip this path; this is the render-time
// fallback for legacy messages persisted before displayText existed.
// Content only emits [CONTEXT — …] (its photos / docs live in the
// sidebar, never in the prompt as text blocks), so a single tag is
// enough.
function stripContentContextBlocks(content) {
  if (!content) return '';
  return content
    .replace(/\[CONTEXT\b[^\]]*\]\s*\n*/g, '')
    .trim();
}

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
  // Skip if the text contains HTML  -  that's generated content, not a question
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


// Extract image prompt from AI text when it describes an image instead of calling the tool
// Extract a `<div class="plan-artifact">…</div>` block from assistant
// message text. Returns { before, planHtml, after } if a well-balanced
// block is found; null otherwise. Used to hoist Plan Mode HTML into a
// canvas card with Download / Copy / Open-in-canvas actions.
function extractPlanArtifact(text) {
  if (!text || typeof text !== 'string') return null;
  const openMatch = text.match(/<div\b[^>]*class="[^"]*\bplan-artifact\b[^"]*"[^>]*>/i);
  if (!openMatch) return null;
  const startIdx = openMatch.index;
  const afterOpen = startIdx + openMatch[0].length;
  // Balance nested divs until the matching close tag.
  let depth = 1;
  let i = afterOpen;
  const openRe = /<div\b/gi;
  const closeRe = /<\/div>/gi;
  while (depth > 0 && i < text.length) {
    openRe.lastIndex = i;
    closeRe.lastIndex = i;
    const nextOpen = openRe.exec(text);
    const nextClose = closeRe.exec(text);
    if (!nextClose) return null; // unterminated
    if (nextOpen && nextOpen.index < nextClose.index) {
      depth++;
      i = nextOpen.index + nextOpen[0].length;
    } else {
      depth--;
      i = nextClose.index + nextClose[0].length;
    }
  }
  if (depth !== 0) return null;
  return {
    before: text.slice(0, startIdx),
    planHtml: text.slice(startIdx, i),
    after: text.slice(i),
  };
}

function extractImagePromptFromText(text) {
  // Self-healing for gateway protocol violations: a non-Claude backend
  // behind the LLM gateway can emit the tool call as literal text —
  // {"tool_code": "generate_image(prompt='...')"} — instead of a native
  // tool call (see prompt.md, 2026-07-16). Parse the prompt out so the
  // zero-toolcall fallback below still fires the image generation. The
  // backend also retries such turns against direct Anthropic; this is the
  // last line of defense if a pseudo call slips through anyway.
  const pseudo = text.match(/\{\s*"tool_code"\s*:\s*"generate_image\(prompt='([\s\S]+?)'\)"\s*\}/);
  if (pseudo?.[1]) {
    console.warn('[Content] Pseudo tool-call text detected — recovering the image prompt from it');
    return pseudo[1].replace(/\\'/g, "'").replace(/\\"/g, '"').trim();
  }

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


// ─── Unified content backend (Phase 1, docs/unified-content-backend-plan.md) ───
// Feature flag for routing /Content generation through the backend
// (POST /api/content-orchestrate → Claude Sonnet with the same prompts,
// copied verbatim into backend/agents/content/). Legacy client-side Grok
// path stays the DEFAULT and fully intact until the unified path is
// stress-tested (Phase 5 does the cleanup, on explicit approval only).
// All /Content generation runs through the unified backend
// (docs/unified-content-backend-plan.md). The legacy client-side Grok
// pipeline and its feature flag were removed in Phase 5 (see git history).

// Unified-transport twin of streamContentResponse: same contract
// (cumulative onTextChunk, single end-of-stream onToolCall with
// [{kind:'image'|'plan', ...}], returns {content, hadToolCall}) but the
// brain runs server-side. The `unified` payload carries the intent + the
// same context ingredients the legacy path feeds buildSystemPrompt with,
// so the backend assembles a byte-identical prompt.
async function streamContentUnified(messages, onTextChunk, onToolCall, abortSignal, unified = {}, onStatus = null) {
  const { intent = 'chat', platform = null, contentContext = {}, planMode = false, variation = 'A', edit = null } = unified;
  const toolCallsOut = [];
  let fullContent = '';
  let streamError = null;

  await streamFromBackend('/api/content-orchestrate', {
    messages,
    intent,
    platform: platform ? { id: platform.id, name: platform.name } : null,
    contentContext,
    planMode,
    variation,
    edit,
  }, {
    onTextDelta: (content) => {
      fullContent = content;
      // Fresh text supersedes any tool-progress status line.
      if (onStatus) onStatus(null);
      onTextChunk(content);
    },
    // Backend tool-progress events ("Building your carousel plan…") —
    // shown while a tool's argument JSON streams after the chat text has
    // finished. The generic per-turn "Thinking..." is filtered out; the
    // default animated-dots indicator already covers that phase.
    onStatus: (text) => {
      if (!onStatus) return;
      onStatus(text && text !== 'Thinking...' ? text : null);
    },
    onToolCall: (name, args = {}) => {
      // Mirror the legacy parsers: only well-formed calls pass through.
      if (name === 'generate_image' && args.prompt) {
        toolCallsOut.push({ kind: 'image', id: `unified-${toolCallsOut.length}`, prompt: args.prompt });
      } else if (name === 'plan_carousel' && Array.isArray(args.slides) && args.designSystem) {
        toolCallsOut.push({ kind: 'plan', id: `unified-${toolCallsOut.length}`, plan: args });
      } else if (name === 'create_content_plan' && Array.isArray(args.items) && args.items.length > 0) {
        // In-chat content plan (shared with AI CEO — planRunner.js).
        toolCallsOut.push({ kind: 'content_plan', id: `unified-${toolCallsOut.length}`, plan: args });
      } else if (name === 'submit_script' && args.script) {
        // Video script (reel / short / YouTube) — rendered as a script
        // card + side preview instead of inline chat text.
        toolCallsOut.push({ kind: 'script', id: `unified-${toolCallsOut.length}`, title: args.title || '', script: args.script });
      } else if (name === 'submit_text_post' && args.caption) {
        // Finished text-only post — rendered as a post card that opens
        // the social preview instead of inline chat text.
        toolCallsOut.push({ kind: 'text_post', id: `unified-${toolCallsOut.length}`, caption: args.caption });
      }
    },
    onError: (err) => {
      streamError = new Error(err || 'Generation failed');
    },
  }, abortSignal);

  if (onStatus) onStatus(null);
  if (streamError) throw streamError;

  // Same fallback + dispatch shape as the legacy path.
  let hadToolCall = false;
  if (toolCallsOut.length === 0 && fullContent) {
    const extractedPrompt = extractImagePromptFromText(fullContent);
    if (extractedPrompt) toolCallsOut.push({ kind: 'image', id: 'fallback', prompt: extractedPrompt });
  }
  if (toolCallsOut.length > 0) {
    hadToolCall = true;
    await onToolCall(toolCallsOut);
  }
  return { content: fullContent, hadToolCall };
}

// All /Content generation runs through the unified backend
// (docs/unified-content-backend-plan.md, Phase 5 cleanup 2026-07-15).
// This wrapper keeps the historical call-site signature; the client-built
// systemPrompt argument is ignored — prompts are assembled server-side
// from the `unified` metadata (intent + context ingredients). The legacy
// client-side Grok transport was removed here; see git history.
async function streamContentResponse(messages, _systemPrompt, onTextChunk, onToolCall, abortSignal, { planMode = false, unified = null, onSearchStatus = null } = {}) {
  return streamContentUnified(messages, onTextChunk, onToolCall, abortSignal, { ...(unified || {}), planMode }, onSearchStatus);
}


// Actions bar that appears below a finished carousel: ZIP download + a
// one-time "pencil discovery" tooltip so first-time users know they can
// edit any slide. Dismisses on click, localStorage flag so it doesn't
// re-show on every carousel.
// Instagram-feed-style side preview panel. Shows the carousel as it
// would actually appear in the IG app — profile header, square media
// with swipe nav + dots, like/comment/share/save row, and the caption
// with IG's 125-char fold + "more" toggle. Reads straight from the
// message (no data copy) so edits/regenerates made elsewhere reflect
// here immediately. ESC + arrow keys wired.
// Deterministic pseudo-random from a string — gives each message stable
// dummy reaction/comment/share counts so they don't fluctuate on every
// render but still vary between posts.

function CarouselActionsBar({ msgId, plan, images, onOpenSidePreview, platform = 'instagram', caption = '' }) {
  const navigate = useNavigate();
  const [downloading, setDownloading] = useState(false);
  const [showTip, setShowTip] = useState(() => {
    try { return localStorage.getItem('aiceo.carouselEditTipDismissed') !== '1'; } catch { return true; }
  });
  const dismissTip = () => {
    setShowTip(false);
    try { localStorage.setItem('aiceo.carouselEditTipDismissed', '1'); } catch {}
  };
  // Auto-dismiss after 12s so it doesn't linger forever.
  useEffect(() => {
    if (!showTip) return;
    const t = setTimeout(() => dismissTip(), 12000);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [showTip]);

  const downloadZip = async () => {
    if (downloading) return;
    setDownloading(true);
    try {
      const { default: JSZip } = await import('jszip');
      const zip = new JSZip();
      // Images may be either data: URLs (fresh generation) OR remote
      // Supabase storage URLs (after the debounced auto-save swaps them).
      // Handle both — the previous build assumed data: only and skipped
      // everything else, which is why the zip contained only text files.
      let added = 0;
      for (const img of images) {
        if (!img.src) continue;
        const slideLabel = String(img.idx + 1).padStart(2, '0');
        try {
          if (img.src.startsWith('data:')) {
            const commaIdx = img.src.indexOf(',');
            if (commaIdx === -1) continue;
            const b64 = img.src.slice(commaIdx + 1);
            const mime = (img.src.match(/^data:([^;]+);/) || [])[1] || 'image/png';
            const ext = (mime.split('/')[1] || 'png').split('+')[0];
            zip.file(`slide-${slideLabel}.${ext}`, b64, { base64: true });
            added++;
          } else {
            // Remote URL — fetch as blob so jszip can add it directly.
            const res = await fetch(img.src, { mode: 'cors' });
            if (!res.ok) throw new Error(`HTTP ${res.status}`);
            const blob = await res.blob();
            const ext = ((blob.type || 'image/png').split('/')[1] || 'png').split('+')[0];
            zip.file(`slide-${slideLabel}.${ext}`, blob);
            added++;
          }
        } catch (imgErr) {
          console.warn(`[zip] slide ${img.idx + 1} failed:`, imgErr);
        }
      }
      if (plan?.caption) zip.file('caption.txt', plan.caption);
      if (plan?.hook) zip.file('hook.txt', plan.hook);
      if (added === 0) throw new Error('No slides could be added — check your connection and try again.');
      const blob = await zip.generateAsync({ type: 'blob' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      const ts = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
      a.href = url;
      a.download = `carousel-${ts}.zip`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 2000);
    } catch (err) {
      console.error('ZIP download failed:', err);
      alert(err.message || 'Download failed. Try again or download slides individually.');
    } finally {
      setDownloading(false);
    }
  };

  // Bundle all slides into a single multi-page PDF, one slide per page,
  // sized to each image's native dimensions. Same source handling as the
  // ZIP: works for both data: URLs (fresh generation) and remote Supabase
  // storage URLs (after auto-save swap).
  const downloadPdf = async () => {
    if (downloading) return;
    setDownloading(true);
    try {
      const { default: jsPDF } = await import('jspdf');
      // Sort slides by their carousel index so pages come out in order.
      const ordered = [...images].filter(x => x?.src).sort((a, b) => (a.idx ?? 0) - (b.idx ?? 0));
      if (ordered.length === 0) throw new Error('No slides to include in the PDF.');

      // Load an image and resolve its natural dimensions + a data URL that
      // jsPDF can embed. Fetches cross-origin sources through the browser
      // cache so we don't tromp on the network twice.
      const loadSlide = async (img) => {
        let dataUrl = img.src;
        if (!dataUrl.startsWith('data:')) {
          const res = await fetch(dataUrl, { mode: 'cors' });
          if (!res.ok) throw new Error(`HTTP ${res.status}`);
          const blob = await res.blob();
          dataUrl = await new Promise((resolve, reject) => {
            const r = new FileReader();
            r.onload = () => resolve(r.result);
            r.onerror = () => reject(new Error('Could not read slide as data URL'));
            r.readAsDataURL(blob);
          });
        }
        // window.Image (not lucide-react's Image icon which shadows the
        // global in this file's imports).
        const dims = await new Promise((resolve, reject) => {
          const im = new window.Image();
          im.onload = () => resolve({ w: im.naturalWidth, h: im.naturalHeight });
          im.onerror = () => reject(new Error('Could not decode slide image'));
          im.src = dataUrl;
        });
        const format = dataUrl.startsWith('data:image/jpeg') ? 'JPEG' : 'PNG';
        return { dataUrl, format, ...dims };
      };

      const slides = [];
      for (const img of ordered) {
        try {
          slides.push(await loadSlide(img));
        } catch (imgErr) {
          console.warn(`[pdf] slide ${(img.idx ?? 0) + 1} skipped:`, imgErr);
        }
      }
      if (slides.length === 0) throw new Error('No slides could be loaded for the PDF.');

      // Build multi-page PDF. Each page uses the slide's own dimensions
      // (px unit) so square IG carousels and vertical stories both render
      // 1:1 with no letterboxing.
      const first = slides[0];
      const doc = new jsPDF({
        unit: 'px',
        format: [first.w, first.h],
        orientation: first.w >= first.h ? 'l' : 'p',
        compress: true,
      });
      slides.forEach((s, i) => {
        if (i > 0) {
          doc.addPage([s.w, s.h], s.w >= s.h ? 'l' : 'p');
        }
        doc.addImage(s.dataUrl, s.format, 0, 0, s.w, s.h);
      });

      const ts = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
      doc.save(`carousel-${ts}.pdf`);
    } catch (err) {
      console.error('PDF download failed:', err);
      alert(err.message || 'PDF export failed. Try again.');
    } finally {
      setDownloading(false);
    }
  };

  // ONE download format per platform:
  //   LinkedIn  → always PDF (LinkedIn document-carousel native format)
  //   Instagram → single image file for one slide, ZIP for carousels
  const slidesWithSrc = images.filter(i => i?.src);
  const downloadLabel = platform === 'linkedin'
    ? 'Download PDF'
    : (slidesWithSrc.length > 1 ? 'Download ZIP' : 'Download');
  const handleDownload = () => {
    if (downloading) return;
    if (platform === 'linkedin') { downloadPdf(); return; }
    if (slidesWithSrc.length === 1) {
      // Single image: direct download — no archive wrapping needed.
      const img = slidesWithSrc[0];
      const a = document.createElement('a');
      a.href = img.src;
      a.download = `${platform}-image.${img.src.startsWith('data:image/png') ? 'png' : 'jpg'}`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      return;
    }
    downloadZip();
  };

  // ── Schedule to Content Calendar ──
  // Creates a social_posts row (shared with ContentCalendar page). If any
  // image is still a data: URL (auto-save hasn't uploaded it yet) we
  // upload on the fly so the calendar entry holds real URLs, not huge
  // base64 blobs that would blow up the table.
  const [scheduleOpen, setScheduleOpen] = useState(false);
  const [scheduleWhen, setScheduleWhen] = useState(() => {
    const d = new Date();
    d.setDate(d.getDate() + 1);
    d.setHours(10, 0, 0, 0);
    return d.toISOString().slice(0, 16);
  });
  const [scheduling, setScheduling] = useState(false);
  const [scheduleStatus, setScheduleStatus] = useState(null); // 'saved' | 'published' | null
  const [scheduleError, setScheduleError] = useState(''); // last publish/schedule error text, shown inline

  // Upload any data-URL slides to storage and return the media array
  // ready for social_posts.
  const collectMedia = async () => {
    const media = [];
    for (const img of images) {
      if (!img.src) continue;
      let url = img.src;
      if (url.startsWith('data:')) {
        const commaIdx = url.indexOf(',');
        const mimeMatch = url.match(/^data:([^;]+);/);
        const base64 = url.slice(commaIdx + 1);
        const mimeType = mimeMatch?.[1] || 'image/png';
        const uploaded = await uploadImageToStorage(base64, mimeType);
        url = uploaded.url || uploaded.publicUrl || url;
      }
      media.push({ type: 'image', url });
    }
    return media;
  };

  const saveToCalendar = async (mode /* 'scheduled' | 'draft' | 'publish' */) => {
    if (scheduling) return;
    setScheduling(true);
    try {
      const media = await collectMedia();
      // Publishing to LinkedIn (image or carousel) or Instagram needs at
      // least one media item; a text-only LinkedIn draft/schedule does
      // not. Only reject the empty case when the platform requires media.
      const needsMedia = platform !== 'linkedin' || (plan?.slides?.length || 0) > 0;
      if (needsMedia && !media.length) throw new Error('No images to schedule');
      const { post } = await createCalendarPost({
        platform,
        // plan.caption for carousels; the caption prop covers single-image
        // and text-only posts (plan is undefined there).
        caption: plan?.caption || caption || '',
        content_type: media.length > 1 ? 'carousel' : media.length === 1 ? 'image' : 'text',
        scheduled_at: mode === 'scheduled' ? new Date(scheduleWhen).toISOString() : null,
        media,
        status: mode === 'scheduled' ? 'scheduled' : 'draft',
      });
      if (mode === 'publish') {
        // Fire the BooSend → Instagram publish pipeline on the saved row.
        await publishCalendarPost(post.id);
        setScheduleStatus('published');
      } else {
        setScheduleStatus('saved');
      }
      setScheduleOpen(false);
      setTimeout(() => setScheduleStatus(null), 4000);
    } catch (err) {
      console.error('Calendar save failed:', err);
      // Prefer the inline error banner (with Reconnect actions) over
      // the blocking browser alert() so the user can act on the error
      // without losing their draft.
      setScheduleError(err?.message || 'Failed to save to calendar');
    } finally {
      setScheduling(false);
    }
  };

  // Save the current design system as a reusable template. Upload the hook
  // slide as the preview thumbnail if it's still a data URL.
  const [savingTemplate, setSavingTemplate] = useState(false);
  // Seed from persisted plan.templateSaved so the button stays disabled
  // after a page refresh if this carousel's template was already saved.
  const [templateSaved, setTemplateSaved] = useState(!!plan?.templateSaved);
  useEffect(() => { setTemplateSaved(!!plan?.templateSaved); }, [plan?.templateSaved]);
  const [templateModalOpen, setTemplateModalOpen] = useState(false);
  const [templateNameDraft, setTemplateNameDraft] = useState('');
  const [templateModalError, setTemplateModalError] = useState('');
  const openTemplateModal = () => {
    if (templateSaved || savingTemplate) return;
    const platformTag = platform === 'linkedin' ? 'LI' : 'IG';
    const hookSnippet = (plan.hook || 'Carousel').replace(/\{\{\/?accent\}\}/g, '').slice(0, 48).trim();
    const defaultName = `${platformTag} · ${hookSnippet} · ${new Date().toLocaleDateString()}`;
    setTemplateNameDraft(defaultName);
    setTemplateModalError('');
    setTemplateModalOpen(true);
  };
  const saveAsTemplate = async () => {
    const name = templateNameDraft.trim();
    if (!name) {
      setTemplateModalError('Name is required.');
      return;
    }
    if (savingTemplate) return;
    setSavingTemplate(true);
    setTemplateModalError('');
    try {
      const hook = images.find(i => i.idx === 0);
      let previewUrl = null;
      if (hook?.src?.startsWith('data:')) {
        const commaIdx = hook.src.indexOf(',');
        const mimeMatch = hook.src.match(/^data:([^;]+);/);
        const base64 = hook.src.slice(commaIdx + 1);
        const mimeType = mimeMatch?.[1] || 'image/png';
        const uploaded = await uploadImageToStorage(base64, mimeType);
        previewUrl = uploaded.url || uploaded.publicUrl || null;
      } else if (hook?.src) {
        previewUrl = hook.src;
      }
      await createCarouselTemplate({
        name,
        design_system: plan.designSystem,
        preview_url: previewUrl,
      });
      setTemplateSaved(true);
      // Stamp it on the plan so auto-save persists the flag; button stays
      // disabled even after a page refresh.
      try {
        window.dispatchEvent(new CustomEvent('carousel-template-saved', { detail: { msgId } }));
      } catch {}
      setTemplateModalOpen(false);
      // Notify the sidebar card to refetch so the new template appears
      // immediately without a page reload.
      try { window.dispatchEvent(new CustomEvent('carousel-templates-changed')); } catch {}
    } catch (err) {
      console.error('Template save failed:', err);
      setTemplateModalError(err.message || 'Failed to save template');
    } finally {
      setSavingTemplate(false);
    }
  };

  // Two modes:
  //   CHAT mode (onOpenSidePreview is passed): ONLY the Open Preview button.
  //     Chat stays a summary. All the real actions live in the preview.
  //   PREVIEW mode (no onOpenSidePreview): the full action toolbar —
  //     Download / Send to calendar / Save as template. Rendered inside
  //     the side preview panels so users act where they're looking.
  if (onOpenSidePreview) {
    const previewLabel = platform === 'linkedin' ? 'LinkedIn' : 'Instagram';
    return (
      <div className="content-carousel-actions">
        <button
          type="button"
          className="content-carousel-action-btn content-carousel-action-btn--primary"
          onClick={onOpenSidePreview}
          title={`Open the ${previewLabel} preview to download, schedule, publish, and edit slides`}
        >
          <Maximize2 size={14} /> Open {previewLabel} preview
        </button>
        {showTip && (
          <div className="content-carousel-edit-tip" onClick={dismissTip} role="button" title="Dismiss">
            <Pencil size={12} />
            <span>Open the preview — every action (edit, download, schedule, template) lives there.</span>
            <X size={12} className="content-carousel-edit-tip-close" />
          </div>
        )}
      </div>
    );
  }

  // Preview-mode: render as a Fragment so buttons flow INTO the parent
  // toolbar row (LinkedInPreview / IG panel). No wrapper div.
  return (
    <>
      {/* Download — ONE button, one format per platform. LinkedIn is
          always PDF (its document-carousel native format); Instagram
          gets the raw image for a single slide or a ZIP for carousels. */}
      <button
        type="button"
        className="li-toolbar-btn"
        onClick={handleDownload}
        disabled={downloading}
        title={platform === 'linkedin'
          ? 'Download as PDF'
          : (images.filter(i => i?.src).length > 1 ? `Download all ${images.length} slides as images (ZIP)` : 'Download image')}
      >
        <Download size={14} /> {downloading ? 'Packing…' : downloadLabel}
      </button>
      <button type="button" className="li-toolbar-btn" onClick={() => setScheduleOpen(true)} disabled={scheduling} title="Send to content calendar — draft, schedule, or publish now">
        <CalendarDays size={14} />
        {scheduleStatus === 'published' ? 'Published' : scheduleStatus === 'saved' ? 'Saved' : (scheduling ? 'Saving…' : 'Schedule')}
      </button>
      {/* Template only applies to carousels (it saves plan.designSystem);
          single-image / text-only posts have no plan. */}
      {plan?.designSystem && (
      <button
        type="button"
        className="li-toolbar-btn"
        onClick={openTemplateModal}
        disabled={savingTemplate || templateSaved}
        title={templateSaved ? 'Template saved for this carousel' : 'Save this design system so future carousels can inherit the look'}
      >
        <Zap size={14} /> {templateSaved ? 'Template saved' : (savingTemplate ? 'Saving…' : 'Template')}
      </button>
      )}
      {/* Post to {Platform} button — direct publish via connected account.
          On LinkedIn carousels this sits alongside the native Post to
          LinkedIn button below — both route through the same BooSend →
          platform publish pipeline. */}
      {platform === 'instagram' && (
        <>
          <button
            type="button"
            className="li-toolbar-btn li-toolbar-btn--instagram"
            onClick={() => { setScheduleError(''); saveToCalendar('publish'); }}
            disabled={scheduling}
            title="Publish now to your connected Instagram account"
          >
            <Send size={14} /> Post to Instagram
          </button>
          {scheduleError && /does not exist|missing permissions|cannot be loaded|invalid access token|expired|boosend|reconnect/i.test(scheduleError) && (
            <button
              type="button"
              className="li-toolbar-btn li-toolbar-btn--linkedin-connect"
              onClick={() => navigate('/settings', { state: { scrollTo: 'integrations', highlight: 'boosend' } })}
              title="Instagram token can't post to this account — reconnect BooSend to grant fresh permissions"
            >
              <ExternalLink size={14} /> Reconnect Instagram
            </button>
          )}
        </>
      )}
      {/* Schedule modal — centered overlay so it escapes the toolbar's
          overflow clipping. Backed by the same draft/schedule/publish
          flow. */}
      {scheduleOpen && (
        <div className="content-template-modal-overlay" onClick={() => !scheduling && setScheduleOpen(false)} role="dialog" aria-modal="true">
          <div className="content-template-modal" onClick={(e) => e.stopPropagation()}>
            <div className="content-template-modal-header">
              <span className="content-template-modal-title">Send to content calendar</span>
              <button type="button" className="content-template-modal-close" onClick={() => !scheduling && setScheduleOpen(false)} aria-label="Close">
                <X size={16} />
              </button>
            </div>
            <div className="content-template-modal-body">
              <label className="content-template-modal-label">Schedule date/time</label>
              <input
                type="datetime-local"
                className="content-template-modal-input"
                value={scheduleWhen}
                onChange={(e) => setScheduleWhen(e.target.value)}
                disabled={scheduling}
              />
              <div className="content-template-modal-hint">
                "Publish now" posts immediately via your connected {platform === 'linkedin' ? 'LinkedIn' : 'Instagram'} account. "Schedule" pins it to the chosen date. "Save as draft" parks it in the Content Calendar for later.
              </div>
            </div>
            <div className="content-template-modal-footer">
              <button type="button" className="content-template-modal-cancel" onClick={() => saveToCalendar('draft')} disabled={scheduling}>
                Save as draft
              </button>
              <button type="button" className="content-template-modal-cancel" onClick={() => saveToCalendar('scheduled')} disabled={scheduling}>
                Schedule
              </button>
              <button type="button" className="content-template-modal-save" onClick={() => saveToCalendar('publish')} disabled={scheduling}>
                {scheduling ? 'Working…' : 'Publish now'}
              </button>
            </div>
          </div>
        </div>
      )}
      {templateModalOpen && (
        <div className="content-template-modal-overlay" onClick={() => !savingTemplate && setTemplateModalOpen(false)} role="dialog" aria-modal="true">
          <div className="content-template-modal" onClick={(e) => e.stopPropagation()}>
            <div className="content-template-modal-header">
              <span className="content-template-modal-title">Save as template</span>
              <button type="button" className="content-template-modal-close" onClick={() => !savingTemplate && setTemplateModalOpen(false)} aria-label="Close">
                <X size={16} />
              </button>
            </div>
            <div className="content-template-modal-body">
              <label className="content-template-modal-label">Template name</label>
              <input
                type="text"
                className="content-template-modal-input"
                value={templateNameDraft}
                onChange={(e) => setTemplateNameDraft(e.target.value)}
                onKeyDown={(e) => { if (e.key === 'Enter') saveAsTemplate(); if (e.key === 'Escape' && !savingTemplate) setTemplateModalOpen(false); }}
                placeholder="e.g. Minimalist Amber, Bold Editorial…"
                autoFocus
                disabled={savingTemplate}
              />
              <div className="content-template-modal-hint">
                Captures the locked palette, typography, card style, glow, and mood. Future carousels can inherit this look from the sidebar "Saved samples" card.
              </div>
              {templateModalError && <div className="content-template-modal-error">{templateModalError}</div>}
            </div>
            <div className="content-template-modal-footer">
              <button type="button" className="content-template-modal-cancel" onClick={() => setTemplateModalOpen(false)} disabled={savingTemplate}>
                Cancel
              </button>
              <button type="button" className="content-template-modal-save" onClick={saveAsTemplate} disabled={savingTemplate || !templateNameDraft.trim()}>
                {savingTemplate ? 'Saving…' : 'Save template'}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}

function SocialThumb({ src }) {
  const [failedSrc, setFailedSrc] = useState(null);
  if (!src || failedSrc === src) {
    return (
      <div className="cs-social-card-placeholder">
        <Link2 size={16} />
      </div>
    );
  }
  return (
    <img
      src={src}
      alt=""
      className="cs-social-card-img"
      referrerPolicy="no-referrer"
      onError={() => setFailedSrc(src)}
    />
  );
}

export default function Content() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [selectedPlatform, setSelectedPlatform] = useState('instagram');
  const [input, setInput] = useState('');
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [photos, setPhotos] = useState([]); // { id, file, status: 'pending'|'uploading'|'done'|'error', result?, dbId?, url? }
  const [documents, setDocuments] = useState([]); // { id, file, status, result?, dbId?, filename? }
  const [socialUrls, setSocialUrls] = useState([]); // { url, status: 'pending'|'extracting'|'done'|'error', result?, dbId? }
  const [socialError, setSocialError] = useState('');
  const [socialHover, setSocialHover] = useState(false);
  const [socialInput, setSocialInput] = useState('');
  const [photoHover, setPhotoHover] = useState(false);
  const [docHover, setDocHover] = useState(false);
  const [sidebarDragOver, setSidebarDragOver] = useState(false);
  const [tooltip, setTooltip] = useState({ text: '', x: 0, y: 0, visible: false });
  const [contextSheetOpen, setContextSheetOpen] = useState(false);
  const [contentResearchMode, setContentResearchMode] = useState(false);
  // Plan Mode — user asks for content, AI produces a full weekly/monthly
  // content plan (topics, hooks, formats, dates) INSTEAD of running
  // generate_image / plan_carousel. Meant for weekend batch planning.
  const [planMode, setPlanMode] = useState(false);
  // Plan Mode canvas modal — pops when the user clicks "Open in canvas"
  // on a plan-artifact HTML block. Holds the HTML string being viewed +
  // edited so the modal survives message re-renders and cross-message
  // navigation.
  const [planCanvasHtml, setPlanCanvasHtml] = useState(null);
  const [planCanvasMsgId, setPlanCanvasMsgId] = useState(null);
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
  // Tracks the id of the assistant message currently being generated.
  // The animated "thinking..." dots only show for THIS message — older
  // empty-content messages (from previous timeouts) render a static
  // "No response received" instead of flipping back to dots whenever
  // the user fires off a new request.
  const [activeAssistantId, setActiveAssistantId] = useState(null);
  const [editingImage, setEditingImage] = useState(null); // { msgId, imgIdx, src }
  const [slideViewer, setSlideViewer] = useState(null); // { msgId, idx } — full-screen slide viewer
  const [carouselSideView, setCarouselSideView] = useState(null); // { msgId } — IG-feed-style side panel preview
  // Chat/preview split — draggable divider, same pattern as AiCeo's
  // chat/canvas slider. splitPct = chat column width in %.
  const [splitPct, setSplitPct] = useState(50);
  const [splitDragging, setSplitDragging] = useState(false);
  const splitRef = useRef(null);
  // Video-script side preview — { msgId }. The script itself lives on the
  // message as msg.scriptDoc = { title, content, platform }.
  const [scriptView, setScriptView] = useState(null);

  useEffect(() => {
    if (!splitDragging) return;
    const handleMove = (e) => {
      const container = splitRef.current;
      if (!container) return;
      const rect = container.getBoundingClientRect();
      const x = (e.clientX ?? e.touches?.[0]?.clientX) - rect.left;
      const pct = (x / rect.width) * 100;
      setSplitPct(Math.max(25, Math.min(75, pct)));
    };
    const handleUp = () => setSplitDragging(false);
    document.addEventListener('mousemove', handleMove);
    document.addEventListener('mouseup', handleUp);
    document.addEventListener('touchmove', handleMove);
    document.addEventListener('touchend', handleUp);
    return () => {
      document.removeEventListener('mousemove', handleMove);
      document.removeEventListener('mouseup', handleUp);
      document.removeEventListener('touchmove', handleMove);
      document.removeEventListener('touchend', handleUp);
    };
  }, [splitDragging]);
  const [creditsDepleted, setCreditsDepleted] = useState(false);
  const [sessionId, setSessionId] = useState(null);
  const [sessions, setSessions] = useState([]);
  const [showSessions, setShowSessions] = useState(false);
  const [renamingSessionId, setRenamingSessionId] = useState(null);
  const [renameDraft, setRenameDraft] = useState('');
  const [confirmDeleteId, setConfirmDeleteId] = useState(null);
  const customTitleIdsRef = useRef(new Set());
  const saveTimer = useRef(null);
  const sessionIdRef = useRef(null);
  const ensureSessionPromiseRef = useRef(null);
  const [editPrompt, setEditPrompt] = useState('');
  const [linkedinPreview, setLinkedinPreview] = useState(null); // { content, images, msgId }

  // Only ONE side-preview tenant at a time: opening the LinkedIn or
  // carousel preview evicts the script preview (the reverse eviction is
  // done explicitly at the script-open call sites).
  useEffect(() => {
    if (linkedinPreview || carouselSideView) setScriptView(null);
  }, [linkedinPreview, carouselSideView]);
  // Mirror so `sendToAI`'s finally block can read the latest preview
  // without capturing a stale closure. Needed to prevent the
  // "AI didn't produce a response" overwrite from firing on valid
  // tool-call-only responses that land in the preview panel.
  const linkedinPreviewRef = useRef(null);
  useEffect(() => { linkedinPreviewRef.current = linkedinPreview; }, [linkedinPreview]);
  // Mirror the linkedinPreview's text content onto the owning message so
  // a page refresh can rehydrate the preview. Images already live on
  // msg.images (auto-save uploads them), so we only persist the post
  // text + totalSlides here.
  useEffect(() => {
    if (!linkedinPreview?.msgId) return;
    const content = linkedinPreview.content || '';
    if (!content) return;
    setMessages(prev => prev.map(m => {
      if (m.id !== linkedinPreview.msgId) return m;
      const existing = m.linkedinPost || {};
      if (existing.content === content && existing.totalSlides === (linkedinPreview.totalSlides || 0)) {
        return m;
      }
      return {
        ...m,
        linkedinPost: {
          content,
          totalSlides: linkedinPreview.totalSlides || 0,
        },
      };
    }));
  }, [linkedinPreview?.content, linkedinPreview?.totalSlides, linkedinPreview?.msgId]);
  const [liGeneratingImage, setLiGeneratingImage] = useState(false);

  // Keep LinkedIn preview images in sync with the message's images
  // Only sync FROM message TO preview when message actually has images (text post image generation)
  // Skip when preview already has images (carousel — images are managed directly in preview state)
  useEffect(() => {
    if (!linkedinPreview?.msgId) return;
    if (linkedinPreview.totalSlides > 0) return; // Carousel — images managed in preview, not message
    const msg = messages.find(m => m.id === linkedinPreview.msgId);
    if (msg?.images?.length && msg.images.length !== linkedinPreview.images?.length) {
      setLinkedinPreview(prev => prev ? { ...prev, images: msg.images } : null);
    }
  }, [messages, linkedinPreview?.msgId, linkedinPreview?.totalSlides]);

  const [brandDna, setBrandDna] = useState(null);
  const [savedTemplates, setSavedTemplates] = useState([]); // user's carousel design-system templates
  const [selectedTemplateIds, setSelectedTemplateIds] = useState(new Set()); // which templates to inject as context
  const [templatesSidebarOpen, setTemplatesSidebarOpen] = useState(false); // dropdown toggle for sidebar templates card
  const [integrationCtx, setIntegrationCtx] = useState('');
  const [isLinkedInConnected, setIsLinkedInConnected] = useState(false);
  const longPressTimer = useRef(null);
  const messagesEndRef = useRef(null);
  const chatAreaRef = useRef(null);
  const isNearBottomRef = useRef(true);
  const abortRef = useRef(null);

  const photoInputRef = useRef(null);
  const docInputRef = useRef(null);
  const socialZoneRef = useRef(null);
  const contentCtxRef = useRef(null);
  const sidebarDragCounter = useRef(0);
  const sheetDragCounter = useRef(0);

  const [contentCtxCategories, setContentCtxCategories] = useState([
    { id: 'newsletters', label: 'Past Newsletters', iconSrc: '/icon-marketing.png', items: [] },
    { id: 'emails', label: 'Past Emails', iconSrc: '/icon-inbox.png', items: [] },
    { id: 'calls', label: 'Calls', iconSrc: '/icon-call-recording.png', items: [] },
    { id: 'content', label: 'Content', iconSrc: '/icon-create-content.png', items: [] },
    { id: 'products', label: 'Products', iconSrc: '/icon-products.png', items: [] },
  ]);

  // Fetch context sidebar data. Depends on `user` so it re-runs once auth
  // is restored from local storage (avoids the race where the first fetch
  // hits the backend as anonymous and gets empty arrays back).
  useEffect(() => {
    console.log('[Content/ctx] useEffect fired, user:', user?.id || user?.email || user);
    if (!user) { console.log('[Content/ctx] No user yet — skipping fetch'); return; }
    let cancelled = false;
    const fmt = (d) => { try { return new Date(d).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }); } catch { return ''; } };
    console.log('[Content/ctx] Fetching context sidebar data...');
    Promise.all([
      getTemplates('newsletter').catch((e) => { console.error('[Content/ctx] getTemplates failed:', e.message); return { templates: [] }; }),
      getEmails({ limit: 20 }).catch((e) => { console.error('[Content/ctx] getEmails failed:', e.message); return { emails: [] }; }),
      getSalesCalls().catch((e) => { console.error('[Content/ctx] getSalesCalls failed:', e.message); return { calls: [] }; }),
      getContentItems().catch((e) => { console.error('[Content/ctx] getContentItems failed:', e.message); return { items: [] }; }),
      getProducts().catch((e) => { console.error('[Content/ctx] getProducts failed:', e.message); return { products: [] }; }),
    ]).then(([nlRes, emRes, clRes, ctRes, prRes]) => {
      if (cancelled) { console.log('[Content/ctx] Cancelled — skipping setState'); return; }
      console.log('[Content/ctx] Results:', {
        newsletters: (nlRes.templates || []).length,
        emails: (emRes.emails || []).length,
        calls: (clRes.calls || []).length,
        content: (ctRes.items || []).length,
        products: (prRes.products || []).length,
      });
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
  }, [user?.id]);

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
    const parts = items.map((i) => `${i.catLabel}: "${i.name}"${i.sub ? ` (${i.sub})` : ''}${i.date ? `  -  ${i.date}` : ''}`);
    return `[CONTEXT  -  The user has selected the following items for reference:\n${parts.join('\n')}\nPrioritize this context when creating content. Use it to inform your tone, topics, and generated visuals.]\n\n`;
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
      if (!session?.user) { console.log('[Content] No session  -  skipping Brand DNA fetch'); return; }
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
    getIntegrations().then(({ integrations }) => {
      const liConnected = (integrations || []).some((i) => i.provider === 'linkedin' && i.is_active);
      setIsLinkedInConnected(liConnected);
    }).catch(() => {});
    // Load saved carousel templates so the sidebar card can show them.
    const loadTpls = () => getCarouselTemplates().then(({ templates }) => {
      if (templates) setSavedTemplates(templates);
    }).catch(() => {});
    loadTpls();
    // Refetch whenever a template is saved elsewhere in the page.
    const onChange = () => loadTpls();
    // Stamp templateSaved=true on the originating message's carouselPlan
    // so the "Save as template" button stays disabled across refreshes.
    const onSaved = (e) => {
      const msgId = e?.detail?.msgId;
      if (!msgId) return;
      setMessages(prev => prev.map(m => {
        if (m.id !== msgId || !m.carouselPlan) return m;
        if (m.carouselPlan.templateSaved) return m;
        return { ...m, carouselPlan: { ...m.carouselPlan, templateSaved: true } };
      }));
    };
    window.addEventListener('carousel-templates-changed', onChange);
    window.addEventListener('carousel-template-saved', onSaved);
    return () => {
      window.removeEventListener('carousel-templates-changed', onChange);
      window.removeEventListener('carousel-template-saved', onSaved);
    };
  }, []);

  const toggleSavedTemplate = useCallback((id) => {
    setSelectedTemplateIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  }, []);

  const removeSavedTemplate = useCallback(async (id) => {
    try {
      await deleteCarouselTemplate(id);
      setSavedTemplates(prev => prev.filter(t => t.id !== id));
      setSelectedTemplateIds(prev => { const n = new Set(prev); n.delete(id); return n; });
    } catch (err) {
      alert(err.message || 'Failed to delete template');
    }
  }, []);

  // Curated (premade) templates — the client-supplied designs digested
  // into replicable profiles. Single-select; a curated pick takes
  // precedence over saved samples in the prompt injection.
  const [curatedTemplates, setCuratedTemplates] = useState([]);
  const [selectedCuratedId, setSelectedCuratedId] = useState(null);
  useEffect(() => {
    getCuratedCarouselTemplates().then(setCuratedTemplates).catch(() => {});
  }, []);

  // The selected templates' design systems — injected into plan_carousel
  // system prompt so Claude anchors the new carousel to them. A curated
  // template rides first with curatedId set → build-system-prompt locks
  // the designSystem verbatim + templateId for the layout engine.
  const selectedTemplatesData = useMemo(() => {
    const curated = selectedCuratedId ? curatedTemplates.find(t => t.id === selectedCuratedId) : null;
    const curatedEntry = curated
      ? [{ curatedId: curated.id, name: curated.name, design_system: curated.designSystem }]
      : [];
    return [...curatedEntry, ...savedTemplates.filter(t => selectedTemplateIds.has(t.id))];
  }, [savedTemplates, selectedTemplateIds, curatedTemplates, selectedCuratedId]);

  // ── Session persistence ──
  // Load sessions list on mount and auto-restore the most recent session
  // so uploaded context (photos, docs, social URLs) survives page refresh.
  useEffect(() => {
    supabase.auth.getSession().then(async ({ data: { session } }) => {
      if (!session?.user) return;
      const { data } = await supabase
        .from('content_sessions')
        .select('id, title, platform, messages, updated_at')
        .eq('user_id', session.user.id)
        .order('updated_at', { ascending: false })
        .limit(50);
      if (data) {
        setSessions(data.map(({ messages: _m, ...rest }) => rest));
        // Auto-load the most recent session so sidebar context is restored
        const latest = data[0];
        if (latest && !sessionIdRef.current) {
          sessionIdRef.current = latest.id;
          setSessionId(latest.id);
          setSelectedPlatform(latest.platform || 'instagram');
          if (latest.messages?.length) setMessages(latest.messages);
        }
      }
    });
  }, []);

  // Debounced auto-save: persist messages to Supabase whenever they change
  useEffect(() => {
    if (messages.length === 0) return;
    if (saveTimer.current) clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(async () => {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session?.user) return;
      const userId = session.user.id;
      // Upload base64 images to storage and replace with URLs
      const stripped = await Promise.all(messages.map(async (m) => {
        const uploadedImages = await Promise.all((m.images || []).map(async (img) => {
          if (img.src?.startsWith('data:')) {
            try {
              const commaIdx = img.src.indexOf(',');
              const mimeMatch = img.src.match(/^data:([^;]+);/);
              const base64 = img.src.slice(commaIdx + 1);
              const mimeType = mimeMatch?.[1] || 'image/png';
              const result = await uploadImageToStorage(base64, mimeType);
              return { idx: img.idx, src: result.url || result.publicUrl || img.src };
            } catch { return { idx: img.idx, src: img.src }; }
          }
          return { idx: img.idx, src: img.src };
        }));
        // Persist the carousel plan alongside content/images. Without this,
        // the plan (with locked design system + slide specs) is lost on
        // refresh, which means: no actions bar, no pencil-edit design
        // preservation, no regenerate button, no "Load template" context.
        // Strip transient fields (generating/failedSlides) — only the
        // static shape of the plan is useful to persist.
        const persistedPlan = m.carouselPlan
          ? {
              hook: m.carouselPlan.hook,
              angle: m.carouselPlan.angle,
              caption: m.carouselPlan.caption,
              slides: m.carouselPlan.slides,
              designSystem: m.carouselPlan.designSystem,
              approved: m.carouselPlan.approved,
              templateSaved: !!m.carouselPlan.templateSaved,
            }
          : undefined;
        const persisted = { id: m.id, role: m.role, content: m.content, images: uploadedImages };
        // Persist displayText so a reload doesn't fall back to
        // rendering the raw [CONTEXT — …] block in the user bubble.
        // Optional — assistant messages and legacy user messages
        // won't have it.
        if (m.displayText) persisted.displayText = m.displayText;
        if (persistedPlan) persisted.carouselPlan = persistedPlan;
        if (m.platform) persisted.platform = m.platform;
        if (m.linkedinPost && m.linkedinPost.content) {
          persisted.linkedinPost = {
            content: m.linkedinPost.content,
            totalSlides: m.linkedinPost.totalSlides || 0,
          };
        }
        if (m.scriptDoc && m.scriptDoc.content) {
          persisted.scriptDoc = {
            title: m.scriptDoc.title || '',
            content: m.scriptDoc.content,
            platform: m.scriptDoc.platform || null,
          };
        }
        if (m.socialPost && m.socialPost.caption) {
          persisted.socialPost = { caption: m.socialPost.caption };
        }
        // In-chat content plan (shared with AI CEO): persist the plan +
        // per-item run states so a reload resumes exactly where it left
        // off; planItemRef ties generated pieces back to their plan row.
        if (m.contentPlan) persisted.contentPlan = m.contentPlan;
        if (m.planItemRef) persisted.planItemRef = m.planItemRef;
        return persisted;
      }));
      // Also update local state with uploaded URLs so future saves don't re-upload
      setMessages((prev) => prev.map((m, i) => stripped[i]?.images?.length ? { ...m, images: stripped[i].images } : m));
      // Derive title from first user message
      const firstUser = messages.find((m) => m.role === 'user');
      const title = firstUser?.content?.replace(/\[CONTEXT[^\]]*\]\n?/g, '').slice(0, 80) || 'New conversation';

      if (sessionId) {
        // Update existing session. If user renamed this session, preserve their custom title.
        const isCustom = customTitleIdsRef.current.has(sessionId);
        const payload = isCustom
          ? { messages: stripped, platform: selectedPlatform, updated_at: new Date().toISOString() }
          : { messages: stripped, title, platform: selectedPlatform, updated_at: new Date().toISOString() };
        await supabase.from('content_sessions').update(payload).eq('id', sessionId);
        setSessions((prev) => prev.map((s) =>
          s.id === sessionId
            ? { ...s, title: isCustom ? s.title : title, updated_at: new Date().toISOString() }
            : s
        ));
      } else {
        // Create new session
        const { data, error } = await supabase.from('content_sessions').insert({
          user_id: userId, title, platform: selectedPlatform, messages: stripped,
        }).select('id').single();
        if (data && !error) {
          setSessionId(data.id);
          setSessions((prev) => [{ id: data.id, title, platform: selectedPlatform, updated_at: new Date().toISOString() }, ...prev]);
        }
      }
    }, 1500);
    return () => { if (saveTimer.current) clearTimeout(saveTimer.current); };
  }, [messages, sessionId, selectedPlatform]);

  // Load a past session
  const loadSession = useCallback(async (id) => {
    const { data, error } = await supabase
      .from('content_sessions')
      .select('id, title, platform, messages')
      .eq('id', id)
      .single();
    if (error || !data) return;
    // Uploads and context selections are global — NOT cleared on session switch.
    ensureSessionPromiseRef.current = null;
    sessionIdRef.current = data.id;
    setSessionId(data.id);
    setSelectedPlatform(data.platform || 'instagram');
    setMessages(data.messages || []);
    setCurrentQuestion(null);
    setShowSessions(false);
    setLinkedinPreview(null);
  }, []);

  // Start a fresh conversation
  const newConversation = useCallback(() => {
    sessionIdRef.current = null;
    ensureSessionPromiseRef.current = null;
    setSessionId(null);
    setMessages([]);
    // Uploads and context selections are global — NOT cleared on new conversation.
    setCurrentQuestion(null);
    setShowSessions(false);
    setLinkedinPreview(null);
  }, []);

  // Keep sessionIdRef in sync so non-React callers (upload pipeline) see it
  useEffect(() => { sessionIdRef.current = sessionId; }, [sessionId]);

  // Ensure a content_sessions row exists before uploading sidebar items.
  // Deduplicates concurrent callers via a promise ref so uploads that land
  // simultaneously don't create multiple sessions.
  const ensureSession = useCallback(async () => {
    if (sessionIdRef.current) return sessionIdRef.current;
    if (ensureSessionPromiseRef.current) return ensureSessionPromiseRef.current;
    const p = (async () => {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session?.user) throw new Error('Not authenticated');
      const userId = session.user.id;
      const { data, error } = await supabase.from('content_sessions').insert({
        user_id: userId,
        title: 'New conversation',
        platform: selectedPlatform,
        messages: [],
      }).select('id').single();
      if (error || !data) throw new Error(error?.message || 'Session create failed');
      sessionIdRef.current = data.id;
      setSessionId(data.id);
      setSessions((prev) => [{ id: data.id, title: 'New conversation', platform: selectedPlatform, updated_at: new Date().toISOString() }, ...prev]);
      return data.id;
    })();
    ensureSessionPromiseRef.current = p;
    try {
      return await p;
    } finally {
      if (ensureSessionPromiseRef.current === p) ensureSessionPromiseRef.current = null;
    }
  }, [selectedPlatform]);

  // Delete a session
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
    if (current && current.title === next) {
      cancelRenameSession();
      return;
    }
    customTitleIdsRef.current.add(id);
    setSessions((prev) => prev.map((s) => s.id === id ? { ...s, title: next } : s));
    setRenamingSessionId(null);
    setRenameDraft('');
    await supabase.from('content_sessions').update({ title: next }).eq('id', id);
  }, [renamingSessionId, renameDraft, sessions, cancelRenameSession]);

  const requestDeleteSession = useCallback((id, e) => {
    e?.stopPropagation?.();
    setConfirmDeleteId(id);
  }, []);

  const confirmDeleteSession = useCallback(async () => {
    const id = confirmDeleteId;
    if (!id) return;
    setConfirmDeleteId(null);
    await supabase.from('content_sessions').delete().eq('id', id);
    setSessions((prev) => prev.filter((s) => s.id !== id));
    if (sessionId === id) newConversation();
  }, [confirmDeleteId, sessionId, newConversation]);

  // Track whether user is near the bottom of the chat (so streaming updates don't yank them down)
  useEffect(() => {
    const el = chatAreaRef.current;
    if (!el) return;
    const onScroll = () => {
      isNearBottomRef.current = el.scrollHeight - el.scrollTop - el.clientHeight < 150;
    };
    el.addEventListener('scroll', onScroll, { passive: true });
    return () => el.removeEventListener('scroll', onScroll);
  }, []);

  // Auto-scroll on new messages only if user is already near the bottom
  useEffect(() => {
    if (isNearBottomRef.current) {
      messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    }
  }, [messages]);

  // ── Chat logic ──
  const sendToAI = useCallback(async (chatHistory) => {
    setIsGenerating(true);
    const assistantMsgId = `msg-${Date.now()}-ai`;
    setActiveAssistantId(assistantMsgId);
    setMessages((prev) => [...prev, { id: assistantMsgId, role: 'assistant', content: '', images: [], pendingImages: 0 }]);

    try {
      const abort = new AbortController();
      abortRef.current = abort;
      const apiMessages = chatHistory.map((m) => ({ role: m.role, content: m.content }));
      // Pass the existing LinkedIn preview state so the backend prompt can
      // swap into EDIT MODE (preserves images & post text instead of
      // wiping). The prompt itself is assembled server-side from the
      // `unified` context below (Phase 5 — client-side prompt building
      // removed; the backend echoes it as a [prompt] console group).
      const existingPost = linkedinPreviewRef.current;

      console.group('📋 Content AI  -  Context being sent');
      console.log('Platform:', activePlatform.name);
      console.log('Photos:', photos.length, photos.map(p => ({ status: p.status, name: p.file?.name || p.result?.filename })));
      console.log('Documents:', documents.length, documents.map(d => ({ status: d.status, name: d.file?.name || d.filename, hasText: !!d.result?.extractedText, hasTranscript: !!d.result?.transcript })));
      console.log('Social URLs:', socialUrls.length, socialUrls.map(s => ({ url: s.url, status: s.status, title: s.result?.title, hasTranscript: !!s.result?.transcript })));
      console.log('Brand DNA:', brandDna ? { description: brandDna.description, colors: brandDna.colors, fonts: { main: brandDna.main_font, secondary: brandDna.secondary_font }, hasPhotos: !!brandDna.photo_urls?.length, hasDocs: brandDna.documents ? Object.keys(brandDna.documents) : [] } : null);
      console.log('Integration Context:', integrationCtx ? integrationCtx.slice(0, 200) + '...' : '(none)');
      console.log('Messages:', apiMessages.length);
      console.groupEnd();

      let streamedContent = '';
      let hadImageGeneration = false;
      await streamContentResponse(
        apiMessages,
        null,
        // onTextChunk  -  stream text, but hide raw JSON questions
        (text) => {
          streamedContent = text;
          // Strip any JSON question block from display  -  show only the natural text before it
          let displayText = text;
          // Pseudo tool-call hygiene (gateway protocol violation): never
          // show raw {"tool_code": "generate_image(...)"} JSON in chat —
          // remove the object but KEEP any caption text around it (the
          // model often writes the caption after the pseudo call).
          displayText = displayText.replace(/\{\s*"tool_code"\s*:\s*"[\s\S]*?"\s*\}\s*/g, '').trim();
          // A pseudo call still mid-stream (no closing brace yet) — cut at
          // its opening so the JSON never flashes while streaming.
          const jsonStart = displayText.indexOf('{"type"');
          const jsonStart2 = displayText.indexOf('{ "type"');
          const fenceStart = displayText.indexOf('```json');
          const fenceStart2 = displayText.indexOf('```\n{');
          const pseudoStart = displayText.indexOf('{"tool_code"');
          const cutIdx = [jsonStart, jsonStart2, fenceStart, fenceStart2, pseudoStart].filter(i => i !== -1).sort((a, b) => a - b)[0];
          if (cutIdx !== undefined) displayText = displayText.slice(0, cutIdx).trim();
          // Strip <<READY_A>> / <<READY_B>> / <<READY_CAROUSEL>> markers from LinkedIn chat display
          displayText = displayText.replace(/<<READY_(?:[AB]|CAROUSEL)>>/g, '').trim();
          // Strip LinkedIn EDIT MODE markers AND any instruction line that
          // follows <<EDIT_TEXT>> — the chat bubble should show only the
          // one-line ack the model wrote before the marker, not the raw
          // edit instruction (which is for the text editor, not the user).
          displayText = displayText.replace(/<<EDIT_TEXT>>[\s\S]*$/, '').trim();
          displayText = displayText.replace(/<<(?:ADD_IMAGE_AI|ADD_IMAGE_ASK|USE_UPLOADED_IMAGE)>>/g, '').trim();
          setMessages((prev) => prev.map((m) => (m.id === assistantMsgId ? { ...m, content: displayText } : m)));
        },
        // onToolCalls  -  now handles two kinds:
        //   kind: 'plan'  → Instagram carousel plan_carousel. Attach the plan
        //                   to the message and WAIT for user approval. The
        //                   approval click fires the per-slide images with
        //                   the locked DESIGN SYSTEM block embedded.
        //   kind: 'image' → regular generate_image calls, run in parallel.
        async (toolCalls) => {
          // Backward compat: older call sites may still pass bare image arrays.
          const normalized = toolCalls.map(c => c.kind ? c : { kind: 'image', ...c });
          // Defensive filter: in Plan Mode, plan_carousel is stripped from
          // the tools list AND banned in the prompt, but if a cached JS
          // bundle or a race with the toggle lets one through, silently
          // drop it before it can attach a carouselPlan to the message
          // and render the CAROUSEL PLAN card the user was seeing.
          const planCalls = planMode ? [] : normalized.filter(c => c.kind === 'plan');
          const imageCalls = planMode ? [] : normalized.filter(c => c.kind === 'image');
          const contentPlanCalls = normalized.filter(c => c.kind === 'content_plan');

          if (contentPlanCalls.length > 0) {
            // In-chat content plan (unified with AI CEO): attach to the
            // message; ContentPlanMessage renders the day-by-day card with
            // its "Generate content" button. Generation runs through the
            // shared planRunner + the same plan-item / carousel / image
            // endpoints every other tab uses.
            const cp = contentPlanCalls[0].plan;
            console.log(`📅 Content plan received: ${cp.items?.length} pieces (${activePlatform.id})`);
            setMessages((prev) => prev.map((m) =>
              m.id === assistantMsgId
                ? {
                    ...m,
                    contentPlan: {
                      title: cp.title || 'Content plan',
                      timeframeDays: cp.timeframe_days || cp.timeframeDays || (cp.items?.length ?? 7),
                      platforms: cp.platforms || [activePlatform.id],
                      summary: cp.summary || '',
                      items: cp.items || [],
                      itemStates: [],
                      runState: 'idle',
                    },
                    platform: activePlatform.id,
                  }
                : m
            ));
            return;
          }

          const textPostCalls = normalized.filter(c => c.kind === 'text_post');
          if (textPostCalls.length > 0) {
            // Finished post caption (text-only OR image post) → post card;
            // the caption lives in the social preview, never inline chat.
            const tp = textPostCalls[0];
            setMessages((prev) => prev.map((m) =>
              m.id === assistantMsgId
                ? { ...m, socialPost: { caption: tp.caption }, platform: m.platform || activePlatform.id }
                : m
            ));
            if (imageCalls.length === 0) {
              // Text-only: open the preview now. Image posts fall through —
              // the generate_image path below opens it as slides stream in.
              setLinkedinPreview(null);
              setScriptView(null);
              setCarouselSideView({ msgId: assistantMsgId });
              return;
            }
          }

          const scriptCalls = normalized.filter(c => c.kind === 'script');
          if (scriptCalls.length > 0) {
            // Video script → card on the message + auto-open the side
            // preview (same pattern as LinkedIn's auto-open).
            const sc = scriptCalls[0];
            setMessages((prev) => prev.map((m) =>
              m.id === assistantMsgId
                ? { ...m, scriptDoc: { title: sc.title || '', content: sc.script, platform: activePlatform.id }, platform: m.platform || activePlatform.id }
                : m
            ));
            setLinkedinPreview(null);
            setCarouselSideView(null);
            setScriptView({ msgId: assistantMsgId });
            return;
          }

          if (planCalls.length > 0) {
            // Only take the first plan — Claude should only produce one.
            const plan = planCalls[0].plan;
            console.log(`📋 Carousel plan received: ${plan.slides?.length} slides (${activePlatform.id})`);
            setMessages((prev) => prev.map((m) =>
              m.id === assistantMsgId ? { ...m, carouselPlan: { ...plan, approved: false, generating: false }, platform: activePlatform.id } : m
            ));
            // Do NOT fire generate_image — wait for approval click.
            return;
          }

          if (imageCalls.length === 0) return;
          hadImageGeneration = true;
          // Safety net: if the model generated an image but skipped
          // submit_text_post (caption streamed as chat text, old-style),
          // promote that text to socialPost so the canvas still shows a
          // caption on the FIRST attempt — not only after a reload.
          if (textPostCalls.length === 0 && activePlatform.id !== 'linkedin') {
            setMessages((prev) => prev.map((m) => {
              if (m.id !== assistantMsgId || m.socialPost) return m;
              const caption = (m.content || '').trim();
              return caption ? { ...m, socialPost: { caption } } : m;
            }));
          }
          console.log(`🖼️ Generating ${imageCalls.length} image(s) in parallel`);
          setMessages((prev) => prev.map((m) =>
            m.id === assistantMsgId ? { ...m, pendingImages: imageCalls.length, platform: m.platform || activePlatform.id } : m
          ));
          // Auto-open the side preview for Instagram image generation
          // (carousel, single post, or story) so the user sees slides
          // stream in without scrolling. Matches LinkedIn's auto-open.
          // Also auto-open whenever a submit_text_post caption landed
          // this turn (image post on any non-LinkedIn pill) — the canvas
          // pairs the caption with the incoming image.
          if (activePlatform.id === 'instagram' || textPostCalls.length > 0) {
            setLinkedinPreview(null);
            setScriptView(null);
            setCarouselSideView({ msgId: assistantMsgId });
          }

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
            console.log(`[Content] Regeneration detected  -  sending ${prevImages.length} previous image(s) as reference`);
          }

          // For regenerations, the per-slide previous image takes the
          // referenceImages slot (Gemini iterates on it). For fresh
          // generations with user-uploaded photos, those user photos
          // take the slot via editUserImage so the manifest labels
          // them as the PRIMARY subject and the AI follows the user's
          // exact prompt instruction. Only one or the other can use
          // the slot — regen wins because it's a more specific signal.
          const isRegenerating = prevImages.length > 0;
          const imgArgs = isRegenerating ? null : await buildImageGenArgs();
          const results = await Promise.allSettled(
            imageCalls.map(async ({ prompt: imgPrompt }, idx) => {
              console.log(`  🎨 [${idx + 1}/${imageCalls.length}] ${imgPrompt.slice(0, 80)}...`);
              const brandImageData = isRegenerating
                ? {
                    // Regeneration path — keep user photos mixed in for
                    // continuity with the previous image's likeness.
                    photoUrls: [
                      ...photos.filter(p => p.status === 'done' && (p.url || p.result?.url)).map(p => p.url || p.result?.url).filter(Boolean),
                      ...(brandDna?.photo_urls?.length ? [brandDna.photo_urls[0]] : []),
                    ],
                    logoUrl: null,
                    colors: brandDna?.colors || {},
                    mainFont: brandDna?.main_font || null,
                  }
                : imgArgs.brandImageData;
              const refImages = isRegenerating
                ? [prevImages[idx] || prevImages[0]]
                : imgArgs.referenceImages;
              const opts = (!isRegenerating && imgArgs.editUserImage)
                ? { editUserImage: true }
                : {};
              const result = await generateImage(imgPrompt, selectedPlatform, brandImageData, refImages, opts);
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
            // Surface it — a silent failure left the preview caption-only
            // with no explanation and no path forward.
            const reason = failed[0]?.reason;
            const why = reason?.name === 'TimeoutError'
              ? 'it took too long and timed out'
              : (reason?.message || 'generation failed');
            setMessages((prev) => [...prev, {
              id: `msg-${Date.now()}-imgfail`,
              role: 'assistant',
              content: `⚠️ ${failed.length === 1 ? 'The image' : `${failed.length} images`} for this post didn't finish (${why}). Say "regenerate the image" and I'll retry it.`,
              images: [],
            }]);
          }
        },
        abort.signal,
        {
          searchMode: true,
          onSearchStatus: setSearchStatus,
          planMode,
          // Unified content backend (flag-gated): same ingredients the
          // client-side buildSystemPrompt call above uses, so the backend
          // assembles a byte-identical prompt server-side.
          unified: {
            intent: 'chat',
            platform: activePlatform,
            contentContext: {
              photos,
              documents,
              socialUrls,
              brandDna,
              integrationContext: integrationCtx,
              carouselTemplates: selectedTemplatesData,
              existingPost,
              userName: user?.name || null,
            },
          },
        },
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
      // SAFETY NET — the model sometimes chains "What's the goal? Which
      // angle? I'll create... <<READY_A>>" or fires plan_carousel in the
      // same turn as questions. The system prompt forbids this but the
      // model occasionally ignores it. If the response contains a "?"
      // AND (a generation marker OR an attached carouselPlan), we treat
      // the FIRST question in the text as the real intent, drop the
      // marker/plan, and let the user answer first.
      if (!questionParsed && finalContent && !hadImageGeneration) {
        const hasMarker = /<<READY_(?:[AB]|CAROUSEL)>>/.test(finalContent);
        let planAttached = false;
        setMessages(prev => {
          const m = prev.find(x => x.id === assistantMsgId);
          if (m?.carouselPlan) planAttached = true;
          return prev;
        });
        if (hasMarker || planAttached) {
          // Strip marker / edit-mode noise, then grab the first "?" sentence.
          const cleaned = finalContent
            .replace(/<<READY_(?:[AB]|CAROUSEL)>>/g, '')
            .replace(/<<EDIT_TEXT>>[\s\S]*$/, '')
            .replace(/<<(?:ADD_IMAGE_AI|ADD_IMAGE_ASK|USE_UPLOADED_IMAGE)>>/g, '')
            .trim();
          const firstQ = cleaned.match(/[^.!?\n]{5,250}\?/);
          if (firstQ) {
            const qText = firstQ[0].trim();
            questionParsed = { text: qText, options: [] };
            console.warn('[Content] Model chained question + generation; surfacing question, dropping marker/plan.');
            if (planAttached) {
              // Remove the prematurely-attached plan so the user sees the
              // question first, not a half-baked plan card.
              setMessages(prev => prev.map(m =>
                m.id === assistantMsgId ? { ...m, carouselPlan: undefined } : m
              ));
            }
          }
        }
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
      // Detect LinkedIn EDIT MODE markers FIRST — preserve preview state.
      // Only valid when a non-carousel LinkedIn post is already on screen.
      const existingPreview = linkedinPreviewRef.current;
      const isLinkedinEditing = selectedPlatform === 'linkedin'
        && !questionParsed
        && streamedContent
        && existingPreview?.content
        && (existingPreview.totalSlides || 0) === 0;

      const editText = isLinkedinEditing && streamedContent.includes('<<EDIT_TEXT>>');
      const addImageAi = isLinkedinEditing && streamedContent.includes('<<ADD_IMAGE_AI>>');
      const useUploadedImage = isLinkedinEditing && streamedContent.includes('<<USE_UPLOADED_IMAGE>>');
      const addImageAsk = isLinkedinEditing && streamedContent.includes('<<ADD_IMAGE_ASK>>');

      if (editText) {
        // EDIT_TEXT — rewrite the existing post in place, keep images.
        // The instruction is the line(s) after the marker.
        const parts = streamedContent.split('<<EDIT_TEXT>>');
        const chatMsg = (parts[0] || '').trim() || 'Updating the post…';
        const editInstruction = (parts[1] || '').trim() || 'Refine the post based on the conversation.';
        setMessages((prev) => prev.map((m) =>
          m.id === assistantMsgId ? { ...m, content: chatMsg } : m
        ));
        // Re-bind preview to the new assistant message so the new chat
        // bubble owns the updated snapshot. Carry images forward — that's
        // the whole point of edit mode (text changes never touch images).
        const carriedImages = existingPreview.images || [];
        const existingContent = existingPreview.content || '';
        setLinkedinPreview({
          content: existingContent,
          images: carriedImages,
          totalSlides: 0,
          msgId: assistantMsgId,
        });
        // Mirror carried images onto the new message so its summary card
        // shows the thumbnail (matches first-gen behavior).
        setMessages(prev => prev.map(m =>
          m.id === assistantMsgId ? { ...m, images: carriedImages } : m
        ));

        // The edit prompt is assembled server-side from the `unified`
        // metadata below (backend/agents/content/second-pass-prompts.js).

        const editMsgs = [{ role: 'user', content: editInstruction }];
        try {
          await streamContentResponse(
            editMsgs,
            null,
            (postText) => {
              setLinkedinPreview(prev => prev ? { ...prev, content: postText.trim() } : prev);
            },
            async () => {},
            abort.signal,
            {
              searchMode: false,
              onSearchStatus: null,
              unified: {
                intent: 'linkedin_edit',
                contentContext: { userName: user?.name || null, brandDna },
                edit: { editInstruction, existingContent },
              },
            },
          );
        } catch (editErr) {
          if (editErr.name !== 'AbortError') console.error('LinkedIn edit_text failed:', editErr);
        }
      } else if (addImageAi || useUploadedImage || addImageAsk) {
        // Image-add markers — text untouched, only images change.
        const chatMsg = streamedContent
          .replace(/<<(?:ADD_IMAGE_AI|ADD_IMAGE_ASK|USE_UPLOADED_IMAGE)>>/g, '')
          .trim() || (addImageAsk ? 'Want to use the image you uploaded, or have me generate one?' : 'Adding the image…');
        setMessages((prev) => prev.map((m) =>
          m.id === assistantMsgId ? { ...m, content: chatMsg } : m
        ));
        // Re-bind preview to the new message so it owns the updated snapshot.
        const prevPreview = existingPreview;
        const carriedImages = prevPreview.images || [];
        setLinkedinPreview({
          content: prevPreview.content || '',
          images: carriedImages,
          totalSlides: 0,
          msgId: assistantMsgId,
        });
        setMessages(prev => prev.map(m =>
          m.id === assistantMsgId ? { ...m, images: carriedImages } : m
        ));

        if (addImageAi) {
          // Reuse the existing AI-image flow — preserves text.
          await handleLinkedinGenerateImage(prevPreview.content || '');
        } else if (useUploadedImage) {
          // Pull the most recent uploaded photo and attach it.
          const donePhotos = photos.filter(p => p.status === 'done' && (p.url || p.result?.url));
          const photo = donePhotos[donePhotos.length - 1];
          if (photo) {
            const src = photo.url || photo.result?.url;
            const startIdx = (prevPreview.images || []).length;
            const newImg = { src, idx: startIdx };
            const nextImages = [...(prevPreview.images || []), newImg];
            setLinkedinPreview(prev => prev ? { ...prev, images: nextImages } : prev);
            setMessages(prev => prev.map(m =>
              m.id === assistantMsgId ? { ...m, images: nextImages } : m
            ));
          } else {
            // No upload found — fall through to AI generation rather than
            // leaving the user with a no-op.
            await handleLinkedinGenerateImage(prevPreview.content || '');
          }
        } else if (addImageAsk) {
          // Render the chooser via the existing question UI.
          setCurrentQuestion({
            text: 'Which image do you want with this post?',
            options: ['Use the one I uploaded', 'Generate an AI image', 'No image'],
          });
          setCustomTyping(false);
          setCustomText('');
        }
      }

      // Detect <<READY_A>>, <<READY_B>>, or <<READY_CAROUSEL>> — trigger separate generation call.
      // Skipped when edit-mode markers already fired (mutually exclusive).
      const skipReady = editText || addImageAi || useUploadedImage || addImageAsk;
      const isLinkedinReady = !skipReady && selectedPlatform === 'linkedin' && !questionParsed && streamedContent;
      const readyA = isLinkedinReady && streamedContent.includes('<<READY_A>>');
      const readyB = isLinkedinReady && streamedContent.includes('<<READY_B>>');
      const readyCarousel = isLinkedinReady && streamedContent.includes('<<READY_CAROUSEL>>');

      if (readyA || readyB) {
        // TEXT POST — clean up chat, launch post generation
        const chatMsg = streamedContent.replace(/<<READY_(?:[AB]|CAROUSEL)>>/g, '').trim();
        setMessages((prev) => prev.map((m) =>
          m.id === assistantMsgId ? { ...m, content: chatMsg } : m
        ));
        const postMsgs = [...chatHistory.map(m => ({ role: m.role, content: m.content })), { role: 'assistant', content: chatMsg }];

        // The writer prompt (variation + reference context + name/brand) is
        // assembled server-side from the `unified` metadata below
        // (backend/agents/content/second-pass-prompts.js).
        // Only ONE preview tenant in the right pane at a time.
        setCarouselSideView(null);
        setLinkedinPreview({ content: '', images: [], msgId: assistantMsgId });
        try {
          await streamContentResponse(
            postMsgs,
            null,
            (postText) => {
              setLinkedinPreview(prev => prev ? { ...prev, content: postText.trim() } : { content: postText.trim(), images: [], msgId: assistantMsgId });
            },
            async () => {},
            abort.signal,
            {
              searchMode: false,
              onSearchStatus: null,
              unified: {
                intent: 'linkedin_post',
                variation: readyA ? 'A' : 'B',
                contentContext: { userName: user?.name || null, brandDna, socialUrls, documents },
              },
            },
          );
        } catch (postErr) {
          if (postErr.name !== 'AbortError') console.error('LinkedIn post generation failed:', postErr);
        }
      } else if (readyCarousel) {
        // CAROUSEL — clean up chat, launch carousel generation with image tool
        const chatMsg = streamedContent.replace(/<<READY_(?:[AB]|CAROUSEL)>>/g, '').trim();
        setMessages((prev) => prev.map((m) =>
          m.id === assistantMsgId ? { ...m, content: chatMsg } : m
        ));
        const carouselMsgs = [...chatHistory.map(m => ({ role: m.role, content: m.content })), { role: 'assistant', content: chatMsg }];

        // The legacy-carousel prompt is assembled server-side from the
        // `unified` metadata below (intent legacy_carousel).
        // Use a ref to accumulate images safely across concurrent promises
        const carouselImagesRef = [];
        setCarouselSideView(null);
        setLinkedinPreview({ content: '', images: [], totalSlides: 0, msgId: assistantMsgId });
        try {
          await streamContentResponse(
            carouselMsgs,
            null,
            (postText) => {
              // Strip any slide descriptions that leak into text
              let caption = postText.trim();
              caption = caption.replace(/\*\*Slide \d+[^*]*\*\*/g, '').replace(/Slide \d+:.*/g, '').trim();
              setLinkedinPreview(prev => prev ? { ...prev, content: caption } : { content: caption, images: [], totalSlides: 0, msgId: assistantMsgId });
            },
            // onToolCalls — generate images for each carousel slide
            async (toolCalls) => {
              // Streamer now returns typed tool calls; LinkedIn flow only uses images.
              const imageCalls = toolCalls.map(c => c.kind ? c : { kind: 'image', ...c }).filter(c => c.kind === 'image');
              if (imageCalls.length === 0) return;
              // Set total slide count so the UI knows how many slots to show
              setLinkedinPreview(prev => prev ? { ...prev, totalSlides: (prev.totalSlides || 0) + imageCalls.length } : prev);
              // Split user-uploaded photos from brand-DNA so the backend's
              // positional manifest can label the user's image as the
              // PRIMARY subject (editUserImage). The user then drives the
              // intent through the prompt — "post this image", "add a
              // CTA", "edit the logo" — instead of all uploads getting
              // mashed into a single generic face reference.
              const imgArgs = await buildImageGenArgs();
              const results = await Promise.allSettled(
                imageCalls.map(async ({ prompt: imgPrompt }, idx) => {
                  const result = await generateImage(
                    imgPrompt,
                    'linkedin',
                    imgArgs.brandImageData,
                    imgArgs.referenceImages,
                    { editUserImage: imgArgs.editUserImage },
                  );
                  if (result.image) {
                    const src = `data:${result.image.mimeType};base64,${result.image.data}`;
                    // Accumulate in array ref to avoid race condition, then set state from it
                    carouselImagesRef.push({ src, idx });
                    setLinkedinPreview(prev => prev ? {
                      ...prev,
                      images: [...carouselImagesRef],
                    } : prev);
                  }
                  return result;
                })
              );
              const failed = results.filter(r => r.status === 'rejected');
              if (failed.length > 0) console.warn(`${failed.length} carousel slide(s) failed`);
            },
            abort.signal,
            {
              searchMode: false,
              onSearchStatus: null,
              unified: {
                intent: 'legacy_carousel',
                contentContext: { userName: user?.name || null, brandDna, socialUrls, documents },
              },
            },
          );
        } catch (postErr) {
          if (postErr.name !== 'AbortError') console.error('LinkedIn carousel generation failed:', postErr);
        }
      }
    } catch (err) {
      if (err.name !== 'AbortError') {
        if (err.code === 'STREAM_TIMEOUT' || err.message === 'STREAM_TIMEOUT') {
          setMessages((prev) => prev.map((m) =>
            m.id === assistantMsgId
              ? { ...m, content: "The AI didn't respond within 60 seconds. This usually means the model is overloaded — please try again in a moment." }
              : m
          ));
        } else if (err.message?.includes('402') || err.message?.toLowerCase().includes('credits') || err.message?.toLowerCase().includes('insufficient')) {
          setCreditsDepleted(true);
          setMessages(prev => prev.filter(m => m.id !== assistantMsgId));
        } else if (/too large to continue|fresh chat|working memory/i.test(err.message || '')) {
          // CONTEXT_EXCEEDED: the backend already tailored an actionable
          // message ("start a fresh chat") — show it verbatim instead of
          // the generic fallback (robustness audit A4).
          setMessages((prev) => prev.map((m) =>
            m.id === assistantMsgId ? { ...m, content: err.message } : m
          ));
        } else {
          setMessages((prev) => prev.map((m) =>
            m.id === assistantMsgId ? { ...m, content: 'Something went wrong. Please try again.' } : m
          ));
        }
      }
    } finally {
      abortRef.current = null;
      setIsGenerating(false);
      setActiveAssistantId(null);
      // Safety net: if we got here without populating the assistant message
      // AND no images/plan/preview landed for this message, surface an
      // explicit message so the user isn't left staring at an empty bubble.
      // Covers cases like the stream closing cleanly with zero text,
      // tool-call-only responses that failed, and silent early termination.
      //
      // IMPORTANT: tool-call-only valid responses also reach this finally
      // with empty `content`. Recognize those and DON'T clobber them:
      //   - carouselPlan present → Instagram plan-first flow succeeded, the
      //     plan card IS the response.
      //   - linkedinPreview holds this msg's content/images/slides → the
      //     LinkedIn text-post / carousel preview panel IS the response.
      setMessages((prev) => prev.map((m) => {
        if (m.id !== assistantMsgId) return m;
        if (m.content) return m;
        if ((m.pendingImages || 0) > 0) return m;
        if ((m.images || []).length > 0) return m;
        if (m.carouselPlan) return m;
        const lp = linkedinPreviewRef.current;
        if (lp && lp.msgId === assistantMsgId && (lp.content || (lp.images?.length > 0) || (lp.totalSlides > 0))) return m;
        return { ...m, content: "The AI didn't produce a response. Please try again." };
      }));
    }
  }, [activePlatform, photos, documents, socialUrls, brandDna, integrationCtx, planMode]);

  const stopGenerating = useCallback(() => {
    if (abortRef.current) { abortRef.current.abort(); abortRef.current = null; setIsGenerating(false); setActiveAssistantId(null); }
  }, []);

  // Render a single carousel slide via NanoBanana with automatic retries.
  // Transient failures (Gemini overload, network blips, 500s, empty-image
  // responses) drop otherwise-good carousels to 5-of-7 territory — not
  // acceptable UX. Retry up to 3× per slide with escalating backoff before
  // giving up. Returns the result on success, or throws the last error.
  const generateSlideWithRetry = useCallback(async (slideIndex, slidePrompt, brandImageData, refImages, { maxAttempts = 3, platform = 'instagram' } = {}) => {
    // Backend routes LinkedIn carousels to a separate config (3:4 portrait)
    // without disturbing single LinkedIn text-post images (3:4 portrait).
    const backendPlatform = platform === 'linkedin' ? 'linkedin_carousel' : platform;
    let lastErr;
    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
      try {
        const result = await generateImage(slidePrompt, backendPlatform, brandImageData, refImages);
        // Tight validity check — Gemini can return a 200 with an empty string,
        // a placeholder, or missing mimeType when its safety filter fires.
        // Treat anything short of "usable base64 + mimetype" as a failure so
        // the retry loop runs instead of silently counting it as done.
        const d = result?.image?.data;
        const m = result?.image?.mimeType;
        if (d && m && typeof d === 'string' && d.length > 200) return result;
        throw new Error(`empty/invalid image response (dataLen=${d?.length || 0}, mime=${m || 'none'})`);
      } catch (err) {
        lastErr = err;
        console.warn(`[carousel] slide ${slideIndex + 1} attempt ${attempt}/${maxAttempts} failed: ${err.message || err}`);
        if (attempt < maxAttempts) {
          await new Promise(r => setTimeout(r, 1500 * attempt));
        }
      }
    }
    throw lastErr || new Error('generation failed');
  }, []);

  // Regenerate one carousel slide with the same locked spec (no edit text).
  // Useful when the content is right but NanoBanana's render has a bad
  // layout — re-roll without having to type a fake edit instruction.
  // Standalone carousel-slide edit runner. Used by the inline pencil
  // (via handleImageEdit) AND by the side preview panels (LinkedInPreview,
  // CarouselSidePanel) so they can host their own edit input field
  // instead of having the edit UI live in the chat.
  const executeCarouselSlideEdit = useCallback(async (msgId, imgIdx, editInstruction) => {
    if (!editInstruction?.trim()) return;
    const carouselMsg = messages.find(m => m.id === msgId);
    const plan = carouselMsg?.carouselPlan;
    const slide = plan?.slides?.[imgIdx];
    if (!plan || !slide) return;
    const platformId = carouselMsg.platform || 'instagram';
    setIsGenerating(true);
    setMessages(prev => prev.map(m => m.id === msgId ? { ...m, editingIdx: imgIdx } : m));

    // BLANK slide path: the user added a new slide and is describing it
    // for the first time. Treat the instruction as the SOURCE OF TRUTH
    // for the slide's content, not as a modification to existing text.
    // Parse the instruction into {badge, headline, body}, update the plan
    // in place (clears the blank flag and replaces placeholders), then
    // render the slide with the filled-in spec — NO "apply only this
    // change" override, since there's nothing to preserve.
    const isBlankSlide = !!slide.blank;
    let slideForPrompt = slide;
    if (isBlankSlide) {
      const instr = editInstruction.trim();
      const sentences = instr.split(/(?<=[.!?])\s+/).filter(Boolean);
      const first = sentences[0] || instr;
      const rest = sentences.slice(1).join(' ').trim();
      // Heuristic: keep the first sentence short enough to be a headline
      // (≤ 10 words). If shorter than that, use it as-is; if longer,
      // trim words and promote the rest of the text to body.
      const firstWords = first.split(/\s+/);
      let headline;
      let bodyText;
      if (firstWords.length <= 10) {
        headline = first.replace(/[.!?]+$/, '').trim();
        bodyText = rest || '';
      } else {
        headline = firstWords.slice(0, 8).join(' ').replace(/[.,;:]+$/, '').trim();
        bodyText = (firstWords.slice(8).join(' ') + (rest ? ' ' + rest : '')).trim();
      }
      // Auto-mark the hero word (first noun-ish word >= 4 chars) with the
      // accent syntax so every slide keeps its gradient highlight.
      const hasMarker = /\{\{accent\}\}/i.test(headline);
      if (!hasMarker) {
        const words = headline.split(/\s+/);
        const targetIdx = words.findIndex(w => w.length >= 4 && /^[A-Za-z0-9]/.test(w));
        if (targetIdx !== -1) {
          words[targetIdx] = `{{accent}}${words[targetIdx]}{{/accent}}`;
          headline = words.join(' ');
        }
      }
      slideForPrompt = {
        ...slide,
        blank: false,
        headline,
        body: bodyText,
        badge: slide.badge || 'NEW',
      };
      // Persist the filled spec on the plan so subsequent edits/regens
      // operate on real content, not the placeholder.
      setMessages(prev => prev.map(m => {
        if (m.id !== msgId || !m.carouselPlan) return m;
        const nextSlides = (m.carouselPlan.slides || []).map((s, i) => i === imgIdx ? slideForPrompt : s);
        return { ...m, carouselPlan: { ...m.carouselPlan, slides: nextSlides } };
      }));
    }

    try {
      const brandForPrompt = { name: brandDna?.brand_name || brandDna?.description?.split(/[.,]/)[0]?.trim() || '' };
      const uploadedPhotoUrls = photos.filter(p => p.status === 'done' && (p.url || p.result?.url)).map(p => p.url || p.result?.url).filter(Boolean);
      const oneBrandPhoto = brandDna?.photo_urls?.length ? [brandDna.photo_urls[0]] : [];
      const brandImageData = {
        photoUrls: [...uploadedPhotoUrls, ...oneBrandPhoto],
        logoUrl: null,
        colors: brandDna?.colors || {},
        mainFont: brandDna?.main_font || null,
      };
      const basePrompt = buildCarouselSlidePrompt({
        designSystem: plan.designSystem,
        template: findCuratedCarouselTemplate(plan.designSystem?.templateId),
        slide: slideForPrompt,
        index: imgIdx,
        total: plan.slides.length,
        brand: brandForPrompt,
        platform: platformId,
      });
      // For blank→filled slides we skip the "edit override" wrapper and
      // render the filled spec directly. For real edits on an existing
      // slide, prepend the instruction so the model only changes what
      // the user asked to change.
      const editedPrompt = isBlankSlide
        ? basePrompt
        : [
            `USER EDIT INSTRUCTION (apply ONLY this change to the slide below — keep every other element identical: palette, typography, layout zones, badge, branding strip, slide counter, chapter mark, glow position, mood):`,
            `  ${editInstruction.trim()}`,
            ``,
            `If the edit changes a specific piece of text, update ONLY that text in TEXT CONTENT below; all other text must render exactly as originally specified.`,
            ``,
            basePrompt,
          ].join('\n');
      // Reference current slide + hook so palette anchors visually.
      const currentImg = (carouselMsg.images || []).find(i => i.idx === imgIdx);
      const hookImg = (carouselMsg.images || []).find(i => i.idx === 0);
      const toRef = async (img) => {
        if (!img?.src) return null;
        if (img.src.startsWith('data:')) {
          const c = img.src.indexOf(',');
          const m = img.src.match(/^data:([^;]+);/);
          return c !== -1 ? { data: img.src.slice(c + 1), mimeType: m?.[1] || 'image/jpeg' } : null;
        }
        try {
          const r = await fetch(img.src, { mode: 'cors' });
          const b = await r.blob();
          const buf = await b.arrayBuffer();
          const base64 = btoa(String.fromCharCode(...new Uint8Array(buf)));
          return { data: base64, mimeType: b.type || 'image/jpeg' };
        } catch { return null; }
      };
      const refs = [];
      const currentRef = await toRef(currentImg);
      if (currentRef) refs.push(currentRef);
      if (hookImg && hookImg.idx !== imgIdx) {
        const hookRef = await toRef(hookImg);
        if (hookRef) refs.push(hookRef);
      }
      const result = await generateSlideWithRetry(imgIdx, editedPrompt, brandImageData, refs, { maxAttempts: 3, platform: platformId });
      const newSrc = `data:${result.image.mimeType};base64,${result.image.data}`;
      setMessages(prev => prev.map(m => {
        if (m.id !== msgId) return m;
        const newImages = [...(m.images || [])];
        const target = newImages.findIndex(img => img.idx === imgIdx);
        if (target !== -1) newImages[target] = { ...newImages[target], src: newSrc };
        else newImages.push({ src: newSrc, idx: imgIdx });
        const failedLeft = (m.carouselPlan?.failedSlides || []).filter(x => x !== imgIdx);
        return {
          ...m,
          images: newImages,
          editingIdx: undefined,
          carouselPlan: { ...m.carouselPlan, failedSlides: failedLeft },
        };
      }));
    } catch (err) {
      console.error('Carousel slide edit failed:', err);
      setMessages(prev => prev.map(m => m.id === msgId ? { ...m, editingIdx: undefined } : m));
    } finally {
      setIsGenerating(false);
    }
  }, [messages, photos, brandDna, generateSlideWithRetry]);

  // Insert a blank slide into a carousel at the given position. The new
  // slide is a placeholder with an empty body — the user drives its
  // content by clicking Edit on the blank and typing an instruction,
  // which goes through executeCarouselSlideEdit to generate the image.
  //
  // Hook (idx 0) and CTA (last) stay locked; blank slides always land
  // somewhere in the middle. Inserting at insertAfterIdx means the new
  // slide becomes index insertAfterIdx + 1. All higher indexes shift up.
  const handleCarouselAddSlide = useCallback((msgId, insertAfterIdx) => {
    setMessages(prev => prev.map(m => {
      if (m.id !== msgId || !m.carouselPlan) return m;
      const slides = m.carouselPlan.slides || [];
      // Block inserting after the CTA (would push CTA off the end).
      const safeInsert = Math.min(insertAfterIdx, slides.length - 2);
      const newSlide = {
        type: 'explanation',
        badge: 'NEW POINT',
        headline: 'Describe this slide with the edit button',
        body: '',
        visualElement: { kind: 'minimal-icon', description: '' },
        doNot: [],
        blank: true,
      };
      const nextSlides = [...slides.slice(0, safeInsert + 1), newSlide, ...slides.slice(safeInsert + 1)];
      // Images shift up too — bump idx for every image at or after the
      // new position. The blank slide has no image (yet).
      const nextImages = (m.images || []).map(img => {
        if (img.idx > safeInsert) return { ...img, idx: img.idx + 1 };
        return img;
      });
      return {
        ...m,
        carouselPlan: { ...m.carouselPlan, slides: nextSlides },
        images: nextImages,
      };
    }));
  }, []);

  // Remove a middle slide. Hook (0) and CTA (last) are uneligible.
  // Shifts all higher indexes down by 1 so the plan and images stay
  // consistent. Persists via auto-save.
  const handleCarouselRemoveSlide = useCallback((msgId, slideIdx) => {
    setMessages(prev => prev.map(m => {
      if (m.id !== msgId || !m.carouselPlan) return m;
      const slides = m.carouselPlan.slides || [];
      if (slideIdx <= 0 || slideIdx >= slides.length - 1) return m; // hook + CTA locked
      const nextSlides = slides.filter((_, i) => i !== slideIdx);
      const nextImages = (m.images || [])
        .filter(img => img.idx !== slideIdx)
        .map(img => (img.idx > slideIdx ? { ...img, idx: img.idx - 1 } : img));
      return {
        ...m,
        carouselPlan: { ...m.carouselPlan, slides: nextSlides },
        images: nextImages,
      };
    }));
  }, []);

  const handleCarouselSlideRegenerate = useCallback(async (msgId, slideIdx) => {
    if (isGenerating) return;
    const msg = messages.find(m => m.id === msgId);
    const plan = msg?.carouselPlan;
    const slide = plan?.slides?.[slideIdx];
    if (!slide) return;
    const platformId = msg.platform || 'instagram';

    setIsGenerating(true);
    setMessages(prev => prev.map(m => m.id === msgId ? { ...m, editingIdx: slideIdx } : m));

    try {
      const brandForPrompt = { name: brandDna?.brand_name || brandDna?.description?.split(/[.,]/)[0]?.trim() || '' };
      const uploadedPhotoUrls = photos.filter(p => p.status === 'done' && (p.url || p.result?.url)).map(p => p.url || p.result?.url).filter(Boolean);
      const oneBrandPhoto = brandDna?.photo_urls?.length ? [brandDna.photo_urls[0]] : [];
      const brandImageData = {
        photoUrls: [...uploadedPhotoUrls, ...oneBrandPhoto],
        logoUrl: null,
        colors: brandDna?.colors || {},
        mainFont: brandDna?.main_font || null,
      };

      const slidePrompt = buildCarouselSlidePrompt({
        designSystem: plan.designSystem,
        template: findCuratedCarouselTemplate(plan.designSystem?.templateId),
        slide,
        index: slideIdx,
        total: plan.slides.length,
        brand: brandForPrompt,
        platform: platformId,
      });

      // Reference the hook image for palette anchoring (not the slide itself
      // — we want a fresh take, not an edit of the current render).
      const hookImg = (msg.images || []).find(i => i.idx === 0);
      let refs = null;
      if (hookImg?.src) {
        if (hookImg.src.startsWith('data:')) {
          const c = hookImg.src.indexOf(',');
          const mm = hookImg.src.match(/^data:([^;]+);/);
          if (c !== -1) refs = [{ data: hookImg.src.slice(c + 1), mimeType: mm?.[1] || 'image/jpeg' }];
        } else {
          // Remote URL — fetch to base64 for the image model.
          try {
            const r = await fetch(hookImg.src, { mode: 'cors' });
            const b = await r.blob();
            const buf = await b.arrayBuffer();
            const base64 = btoa(String.fromCharCode(...new Uint8Array(buf)));
            refs = [{ data: base64, mimeType: b.type || 'image/jpeg' }];
          } catch {}
        }
      }

      const result = await generateSlideWithRetry(slideIdx, slidePrompt, brandImageData, refs, { maxAttempts: 3, platform: platformId });
      const newSrc = `data:${result.image.mimeType};base64,${result.image.data}`;
      setMessages(prev => prev.map(m => {
        if (m.id !== msgId) return m;
        const newImages = [...(m.images || [])];
        const target = newImages.findIndex(img => img.idx === slideIdx);
        if (target !== -1) newImages[target] = { ...newImages[target], src: newSrc };
        else newImages.push({ src: newSrc, idx: slideIdx });
        const failedLeft = (m.carouselPlan?.failedSlides || []).filter(x => x !== slideIdx);
        return {
          ...m,
          images: newImages,
          editingIdx: undefined,
          carouselPlan: { ...m.carouselPlan, failedSlides: failedLeft },
        };
      }));
    } catch (err) {
      console.error('Slide regenerate failed:', err);
      setMessages(prev => prev.map(m => m.id === msgId ? { ...m, editingIdx: undefined } : m));
    } finally {
      setIsGenerating(false);
    }
  }, [messages, isGenerating, photos, brandDna, generateSlideWithRetry]);

  // Update a carousel plan in place — used while the user edits slides,
  // caption, hook, etc. on the plan card BEFORE they click Approve. Blocked
  // once approved so already-generated slides aren't invalidated.
  const handleUpdateCarouselPlan = useCallback((msgId, nextPlan) => {
    setMessages(prev => prev.map(m => {
      if (m.id !== msgId) return m;
      if (m.carouselPlan?.approved) return m;
      return { ...m, carouselPlan: { ...m.carouselPlan, ...nextPlan } };
    }));
  }, []);

  // Approve an Instagram carousel plan and render the slides.
  // Fires slide 1 first → once it lands, passes its bytes as a reference image
  // for slides 2..N so NanoBanana visually anchors to the hook's palette and
  // typography beyond what the text prompt alone encodes.
  const handleCarouselApprove = useCallback(async (msgId) => {
    const msg = messages.find(m => m.id === msgId);
    if (!msg?.carouselPlan || msg.carouselPlan.approved) return;
    const plan = msg.carouselPlan;
    const slides = plan.slides || [];
    if (!slides.length) return;
    const platformId = msg.platform || 'instagram';

    // Mark approved + kick off loading state so skeletons render.
    setMessages(prev => prev.map(m =>
      m.id === msgId ? { ...m, carouselPlan: { ...m.carouselPlan, approved: true, generating: true, failedSlides: [] }, pendingImages: slides.length, images: m.images || [] } : m
    ));
    setIsGenerating(true);
    setActiveAssistantId(msgId);
    // Auto-open the side preview just like LinkedIn text-posts do when
    // they start streaming. Slides appear inside the preview panel as
    // they render; user gets live feedback without scrolling up.
    setLinkedinPreview(null);
    setCarouselSideView({ msgId });

    const uploadedPhotoUrls = photos.filter(p => p.status === 'done' && (p.url || p.result?.url)).map(p => p.url || p.result?.url).filter(Boolean);
    const oneBrandPhoto = brandDna?.photo_urls?.length ? [brandDna.photo_urls[0]] : [];
    const allPhotoUrls = [...uploadedPhotoUrls, ...oneBrandPhoto];
    const brandImageData = {
      photoUrls: allPhotoUrls,
      logoUrl: null,
      colors: brandDna?.colors || {},
      mainFont: brandDna?.main_font || null,
    };
    const brandForPrompt = { name: brandDna?.brand_name || brandDna?.description?.split(/[.,]/)[0]?.trim() || '' };

    const appendImage = (src, idx) => {
      setMessages(prev => prev.map(m =>
        m.id === msgId ? {
          ...m,
          images: [...(m.images || []), { src, idx }],
          pendingImages: Math.max(0, (m.pendingImages || 0) - 1),
        } : m
      ));
    };

    const markSlideFailed = (idx) => {
      setMessages(prev => prev.map(m =>
        m.id === msgId ? {
          ...m,
          pendingImages: Math.max(0, (m.pendingImages || 0) - 1),
          carouselPlan: {
            ...m.carouselPlan,
            failedSlides: [...(m.carouselPlan?.failedSlides || []).filter(x => x !== idx), idx].sort((a, b) => a - b),
          },
        } : m
      ));
    };

    try {
      {
        // Unified path (Phase 2): the backend renders the whole carousel —
        // same slide-1-anchors-the-rest ordering, same per-slide 3-attempt
        // retry policy, same locked design-system prompts — and streams
        // per-slide progress. Slides arrive as storage URLs.
        await generateCarouselServerSide({
          platform: platformId,
          plan: { hook: plan.hook, caption: plan.caption, slides, designSystem: plan.designSystem },
          brand: brandForPrompt,
          brandData: brandImageData,
        }, {
          onSlideDone: (idx, url) => appendImage(url, idx),
          onSlideFailed: (idx, error) => {
            console.error(`[carousel] slide ${idx + 1} failed (server): ${error}`);
            // Credit exhaustion → paywall, not a dead retry loop (audit B1).
            if (/insufficient credits/i.test(String(error || ''))) setCreditsDepleted(true);
            markSlideFailed(idx);
          },
        });
      }

      // Consistency sweep: guarantee every slide index 0..N-1 is either in
      // images OR in failedSlides. If a slide silently vanished (state race,
      // promise dropped, etc.) it ends up in neither — sweep it into
      // failedSlides so the user sees the retry button instead of a missing
      // slide with no explanation.
      setMessages(prev => prev.map(m => {
        if (m.id !== msgId) return m;
        const presentIdx = new Set((m.images || []).map(img => img.idx));
        const failedSet = new Set(m.carouselPlan?.failedSlides || []);
        const recovered = [];
        for (let i = 0; i < slides.length; i++) {
          if (!presentIdx.has(i) && !failedSet.has(i)) recovered.push(i);
        }
        const mergedFailed = [...(m.carouselPlan?.failedSlides || []), ...recovered].sort((a, b) => a - b);
        if (recovered.length) console.warn(`[carousel] consistency sweep recovered missing slides: ${recovered.map(i => i + 1).join(', ')}`);
        return {
          ...m,
          pendingImages: 0,
          carouselPlan: {
            ...m.carouselPlan,
            generating: false,
            failedSlides: mergedFailed,
          },
          // If Claude included a caption in the plan, surface it as the message body.
          content: m.content || plan.caption || '',
        };
      }));
    } catch (err) {
      console.error('Carousel generation failed:', err);
      setMessages(prev => prev.map(m =>
        m.id === msgId ? { ...m, pendingImages: 0, carouselPlan: { ...m.carouselPlan, generating: false, error: err.message || 'Generation failed' } } : m
      ));
    } finally {
      setIsGenerating(false);
      setActiveAssistantId(null);
    }
  }, [messages, photos, brandDna, generateSlideWithRetry]);

  // Manual retry for slides that exhausted automatic retries. User clicks
  // "Retry failed slide(s)" on the plan card and we re-fire only the
  // failed indices, keeping successful slides untouched.
  const handleRetryFailedSlides = useCallback(async (msgId) => {
    const msg = messages.find(m => m.id === msgId);
    if (!msg?.carouselPlan) return;
    const plan = msg.carouselPlan;
    const failed = plan.failedSlides || [];
    if (!failed.length) return;
    const platformId = msg.platform || 'instagram';

    const slides = plan.slides || [];
    const uploadedPhotoUrls = photos.filter(p => p.status === 'done' && (p.url || p.result?.url)).map(p => p.url || p.result?.url).filter(Boolean);
    const oneBrandPhoto = brandDna?.photo_urls?.length ? [brandDna.photo_urls[0]] : [];
    const allPhotoUrls = [...uploadedPhotoUrls, ...oneBrandPhoto];
    const brandImageData = {
      photoUrls: allPhotoUrls,
      logoUrl: null,
      colors: brandDna?.colors || {},
      mainFont: brandDna?.main_font || null,
    };
    const brandForPrompt = { name: brandDna?.brand_name || brandDna?.description?.split(/[.,]/)[0]?.trim() || '' };

    // Use an existing successful slide (prefer slide 1) as the palette
    // reference if available. If slide 1 itself failed, any successful
    // slide works as an anchor.
    const existingImage = (msg.images || []).find(img => img.idx === 0) || (msg.images || [])[0];
    let hookRef = null;
    if (existingImage?.src?.startsWith('data:')) {
      const commaIdx = existingImage.src.indexOf(',');
      if (commaIdx !== -1) {
        const mimeMatch = existingImage.src.match(/^data:([^;]+);/);
        hookRef = {
          data: existingImage.src.slice(commaIdx + 1),
          mimeType: mimeMatch?.[1] || 'image/jpeg',
        };
      }
    }

    setIsGenerating(true);
    setActiveAssistantId(msgId);
    setMessages(prev => prev.map(m =>
      m.id === msgId ? {
        ...m,
        carouselPlan: { ...m.carouselPlan, generating: true },
        pendingImages: (m.pendingImages || 0) + failed.length,
      } : m
    ));

    // Shared per-slide state updaters for both retry paths.
    const retrySlideDone = (idx, src) => {
      setMessages(prev => prev.map(m => {
        if (m.id !== msgId) return m;
        // Replace any existing entry for this idx (defensive) and
        // remove this idx from the failed list.
        const images = (m.images || []).filter(img => img.idx !== idx).concat({ src, idx });
        const failedLeft = (m.carouselPlan?.failedSlides || []).filter(x => x !== idx);
        return {
          ...m,
          images,
          pendingImages: Math.max(0, (m.pendingImages || 0) - 1),
          carouselPlan: { ...m.carouselPlan, failedSlides: failedLeft },
        };
      }));
    };
    const retrySlideFailed = (idx, err) => {
      console.error(`[carousel] retry for slide ${idx + 1} failed:`, err);
      // Keep it in failedSlides, drop pending.
      setMessages(prev => prev.map(m =>
        m.id === msgId ? { ...m, pendingImages: Math.max(0, (m.pendingImages || 0) - 1) } : m
      ));
    };

    {
      // Unified path (Phase 2): server re-renders only the failed indexes,
      // anchored to an existing successful slide for visual cohesion.
      // Anchor can be a storage URL (server slides) or extracted base64
      // (legacy data-URL slides / single-slide edits).
      const anchorUrl = existingImage?.src?.startsWith('http') ? existingImage.src : null;
      try {
        await generateCarouselServerSide({
          platform: platformId,
          plan: { hook: plan.hook, caption: plan.caption, slides, designSystem: plan.designSystem },
          slideIndexes: failed,
          brand: brandForPrompt,
          brandData: brandImageData,
          anchorImage: hookRef || null,
          anchorUrl,
        }, {
          onSlideDone: (idx, url) => retrySlideDone(idx, url),
          onSlideFailed: (idx, error) => {
            if (/insufficient credits/i.test(String(error || ''))) setCreditsDepleted(true);
            retrySlideFailed(idx, error);
          },
        });
      } catch (err) {
        console.error('[carousel] server-side retry failed:', err);
        failed.forEach((idx) => retrySlideFailed(idx, err));
      }
    }

    setMessages(prev => prev.map(m =>
      m.id === msgId ? {
        ...m,
        pendingImages: 0,
        carouselPlan: { ...m.carouselPlan, generating: false },
      } : m
    ));
    setIsGenerating(false);
    setActiveAssistantId(null);
  }, [messages, photos, brandDna, generateSlideWithRetry]);

  // ── In-chat content plan runner ──
  // The SAME plan system the AI CEO uses: shared run loop + helpers in
  // src/lib/planRunner.js, generation via the unified backend endpoints
  // (plan-item → shared LinkedIn writer, /api/generate/carousel,
  // /api/generate/image). This tab only defines how a finished piece
  // becomes a /Content chat message (inline images/carousel/LinkedIn
  // preview instead of AI CEO's artifact chips).
  const activePlanRunsRef = useRef(new Map());
  const [activePlanRunMsgId, setActivePlanRunMsgId] = useState(null);

  const handleStopPlanRun = useCallback((planMsgId) => {
    const token = activePlanRunsRef.current.get(planMsgId);
    if (!token) return;
    token.cancelled = true;
    // Hard-abort the in-flight request so Stop is immediate, and show
    // "Stopping…" on the card right away.
    try { token.abort?.abort(); } catch { /* already aborted */ }
    setMessages((prev) => prev.map((m) =>
      m.id === planMsgId && m.contentPlan
        ? { ...m, contentPlan: { ...m.contentPlan, runState: 'stopping' } }
        : m
    ));
  }, []);

  // Open a finished plan piece: carousels/images → side preview panel,
  // LinkedIn text posts → LinkedIn preview.
  const openPlanPiece = useCallback((pieceMsgId) => {
    const msg = messages.find((m) => m.id === pieceMsgId);
    if (!msg) return;
    if (msg.linkedinPost?.content) {
      setCarouselSideView(null);
      setLinkedinPreview({
        content: msg.linkedinPost.content,
        images: msg.images || [],
        totalSlides: msg.linkedinPost.totalSlides || 0,
        msgId: msg.id,
      });
      return;
    }
    if (msg.scriptDoc?.content) {
      setLinkedinPreview(null);
      setCarouselSideView(null);
      setScriptView({ msgId: msg.id });
      return;
    }
    if ((msg.images?.length || 0) > 0 || msg.carouselPlan) {
      setLinkedinPreview(null);
      setCarouselSideView({ msgId: msg.id });
    }
  }, [messages]);

  const handleGeneratePlanContent = useCallback(async (planMsgId, { retryFailedOnly = false } = {}) => {
    if (isGenerating || activePlanRunsRef.current.size > 0) return;

    // Freshest plan + messages via a setState pass-through (closure lag).
    const snapshot = await new Promise((resolve) => {
      setMessages((prev) => {
        const m = prev.find((x) => x.id === planMsgId);
        resolve(m?.contentPlan ? { plan: m.contentPlan, allMessages: prev } : null);
        return prev;
      });
    });
    if (!snapshot) return;
    const { plan, allMessages } = snapshot;
    const items = plan.items || [];
    if (items.length === 0) return;

    // Reconcile against pieces that actually exist (autosave debounce can
    // lose the last tick across a reload — planItemRef is ground truth).
    const itemStates = items.map((_, i) => {
      const prevState = { ...(plan.itemStates?.[i] || { status: 'pending' }) };
      const pieceMsg = allMessages.find((m) => m.planItemRef?.planMsgId === planMsgId && m.planItemRef?.index === i);
      if (pieceMsg) return { ...prevState, status: 'done', msgId: pieceMsg.id };
      if (retryFailedOnly && prevState.status === 'failed') return { status: 'pending' };
      if (prevState.status === 'done' || prevState.status === 'running') return { status: 'pending' };
      return prevState;
    });

    const updatePlan = (patch) => {
      setMessages((prev) => prev.map((m) =>
        m.id === planMsgId && m.contentPlan
          ? { ...m, contentPlan: { ...m.contentPlan, ...patch, itemStates: [...itemStates] } }
          : m
      ));
    };

    const token = makeRunToken();
    activePlanRunsRef.current.set(planMsgId, token);
    setActivePlanRunMsgId(planMsgId);
    setIsGenerating(true);
    updatePlan({ runState: 'running' });
    const runSessionId = sessionIdRef.current;

    try {
      await runPlanItems({
        items,
        itemStates,
        token,
        updatePlan,
        isRunValid: () => {
          if (sessionIdRef.current !== runSessionId) token.cancelled = true;
          return sessionIdRef.current === runSessionId;
        },
        generateItem: (item) => generatePlanItem({
          item,
          planTitle: plan.title,
          planContext: serializeContentPlan({ ...plan, itemStates }),
          userName: user?.name || null,
        }, token.abort.signal),
        materializePiece: async ({ item, index: i, resp }) => {
          const pieceMsgId = `msg-${Date.now()}-plan-${i}`;
          let imageFailed = false;
          const piece = {
            id: pieceMsgId,
            role: 'assistant',
            content: '',
            images: [],
            pendingImages: 0,
            platform: item.platform,
            planItemRef: { planMsgId, index: i },
          };

          if (resp.kind === 'carousel' && resp.carouselPlan?.slides?.length) {
            const slides = resp.carouselPlan.slides;
            const images = [];
            itemStates[i] = { status: 'running', progress: { done: 0, total: slides.length } };
            updatePlan({});
            try {
              await generateCarouselServerSide({
                platform: item.platform === 'linkedin' ? 'linkedin' : 'instagram',
                plan: {
                  hook: resp.carouselPlan.hook,
                  caption: resp.carouselPlan.caption,
                  slides,
                  designSystem: resp.carouselPlan.designSystem,
                },
                brand: { name: brandDna?.brand_name || user?.name || '' },
              }, {
                onSlideDone: (idx, url) => {
                  images.push({ src: url, idx });
                  itemStates[i] = { status: 'running', progress: { done: images.length, total: slides.length } };
                  updatePlan({});
                },
                onSlideFailed: (idx, error) => {
                  imageFailed = true;
                  if (/insufficient credits/i.test(String(error || ''))) setCreditsDepleted(true);
                },
              }, token.abort.signal);
            } catch (carErr) {
              if (carErr?.name === 'AbortError' || token.cancelled) throw carErr;
              console.error('[Content] plan carousel failed:', carErr?.message);
              imageFailed = true;
            }
            images.sort((a, b) => (a.idx ?? 0) - (b.idx ?? 0));
            piece.content = resp.carouselPlan.caption || planPieceLabel(item, imageFailed);
            piece.images = images;
            piece.carouselPlan = { ...resp.carouselPlan, approved: true, generating: false, failedSlides: [] };
          } else if (resp.kind === 'single_image' && resp.image_prompt) {
            try {
              const imgPlatform = item.platform === 'linkedin' ? 'linkedin' : item.platform === 'instagram' ? 'instagram' : 'general';
              const r = await generateImage(resp.image_prompt, imgPlatform, null, null, {});
              if (r?.image?.data) piece.images = [{ src: `data:${r.image.mimeType};base64,${r.image.data}`, idx: 0 }];
              else imageFailed = true;
            } catch (imgErr) {
              console.error('[Content] plan single image failed:', imgErr?.message);
              imageFailed = true;
            }
            // Caption lives in the preview canvas (post card in chat),
            // same treatment as interactive image posts — never inline.
            const caption = resp.content || '';
            piece.content = planPieceLabel(item, imageFailed);
            if (item.platform === 'linkedin') {
              piece.linkedinPost = { content: caption, totalSlides: 0 };
            } else {
              piece.socialPost = { caption };
            }
          } else if (item.platform === 'linkedin' && item.format === 'text_post') {
            // LinkedIn text post → summary card + Open Preview, same as
            // interactive posts in this tab.
            piece.content = planPieceLabel(item, false);
            piece.linkedinPost = { content: resp.content || '', totalSlides: 0 };
          } else if (item.format === 'reel_script' || item.format === 'youtube_script') {
            // Video script → script card + side preview, never the full
            // script dumped inline (same treatment as interactive scripts).
            piece.content = planPieceLabel(item, false);
            piece.scriptDoc = {
              title: resp.title || item.topic || '',
              content: resp.content || '',
              platform: item.platform,
            };
          } else {
            piece.content = resp.content || '';
          }

          setMessages((prev) => [...prev, piece]);
          return { pieceMsgId, imageFailed };
        },
      });
      if (token.creditsDepleted) setCreditsDepleted(true);
    } finally {
      activePlanRunsRef.current.delete(planMsgId);
      setActivePlanRunMsgId(null);
      setIsGenerating(false);
    }

    if (token.cancelled || sessionIdRef.current !== runSessionId) {
      if (sessionIdRef.current === runSessionId) updatePlan({ runState: 'stopped' });
      return;
    }
    updatePlan({ runState: 'done' });
    const doneCount = itemStates.filter((s) => s.status === 'done').length;
    const failedCount = itemStates.filter((s) => s.status === 'failed').length;
    setMessages((prev) => [...prev, {
      id: `msg-${Date.now()}-plan-complete`,
      role: 'assistant',
      content: failedCount === 0
        ? `All of your content is generated. ${doneCount} pieces are ready above — open any of them to review, edit, or schedule.`
        : `Generated ${doneCount} of ${items.length} pieces. ${failedCount} failed — hit "Retry failed" on the plan card and I'll take another pass.`,
      images: [],
    }]);
  }, [isGenerating, brandDna, user]);

  // Block sending while any attachment is still uploading/extracting  -  otherwise the
  // AI receives a prompt without the context the user just attached.
  const pendingAttachments = useMemo(() => {
    const photoPending = photos.filter(p => p.status === 'pending' || p.status === 'uploading').length;
    const docPending = documents.filter(d => d.status === 'pending' || d.status === 'uploading').length;
    const socialPending = socialUrls.filter(s => s.status === 'pending' || s.status === 'extracting').length;
    return { photos: photoPending, documents: docPending, socialUrls: socialPending, total: photoPending + docPending + socialPending };
  }, [photos, documents, socialUrls]);
  const hasPendingAttachments = pendingAttachments.total > 0;

  // Platform pill switch — reset every piece of cross-platform UI state
  // so nothing from the previous platform's flow leaks into the next one
  // (platform-switch audit, 2026-07-16):
  //   - a pending discovery question (clickable options) belonged to the
  //     OLD platform's flow; answering it after switching sent a
  //     confusing out-of-context reply into the new platform's chat;
  //   - the carousel side panel / fullscreen slide viewer showed the old
  //     platform's content under the new platform's pill;
  //   - switching BACK to LinkedIn now restores the most recent LinkedIn
  //     post into the preview, so edit mode ("make it shorter") keeps
  //     working across pill round-trips instead of silently regenerating
  //     from scratch (edit mode needs an on-screen post to exist).
  const switchPlatform = useCallback((pid) => {
    if (pid === selectedPlatform) return;
    setSelectedPlatform(pid);
    setCurrentQuestion(null);
    setCustomTyping(false);
    setCustomText('');
    setCarouselSideView(null);
    setSlideViewer(null);
    if (pid === 'linkedin') {
      const lastLi = [...messages].reverse().find((m) => m.role === 'assistant' && m.linkedinPost?.content);
      if (lastLi) {
        setLinkedinPreview({
          content: lastLi.linkedinPost.content,
          images: lastLi.images || [],
          totalSlides: lastLi.linkedinPost.totalSlides || 0,
          msgId: lastLi.id,
        });
        return;
      }
    }
    setLinkedinPreview(null);
  }, [selectedPlatform, messages]);

  const selectOption = useCallback((option) => {
    if (isGenerating || hasPendingAttachments) return;
    setCurrentQuestion(null);
    setCustomTyping(false);
    setCustomText('');
    const contextStr = buildContentContextString();
    const userMsg = {
      id: `msg-${Date.now()}-user`,
      role: 'user',
      content: contextStr + option,
      // displayText is what the bubble shows. content carries the
      // [CONTEXT — …] block prepended for the AI; users shouldn't
      // see that noise in their own bubble.
      displayText: option,
    };
    const updated = [...messages, userMsg];
    setMessages(updated);
    sendToAI(updated);
  }, [isGenerating, hasPendingAttachments, messages, sendToAI, contentSelectedCtx, contentCtxCategories]);

  const sendMessage = useCallback(() => {
    const text = input.trim();
    if (!text || isGenerating || hasPendingAttachments) return;
    const contextStr = buildContentContextString();
    const userMsg = {
      id: `msg-${Date.now()}-user`,
      role: 'user',
      content: contextStr + text,
      displayText: text,
    };
    const updated = [...messages, userMsg];
    setMessages(updated);
    setInput('');
    sendToAI(updated);
  }, [input, isGenerating, hasPendingAttachments, messages, sendToAI, contentSelectedCtx, contentCtxCategories]);

  // Direct image edit  -  sends ONLY the image to Gemini, no brand data, no context
  const handleImageEdit = useCallback(async (editInstruction) => {
    if (!editingImage || !editInstruction.trim() || isGenerating) return;
    const { msgId, imgIdx, src } = editingImage;
    setEditingImage(null);
    setEditPrompt('');

    // Extract base64 from data URL once — used by both edit paths.
    const commaIdx = src.indexOf(',');
    const mimeMatch = src.match(/^data:([^;]+);/);
    const refImage = commaIdx !== -1 ? {
      data: src.slice(commaIdx + 1),
      mimeType: mimeMatch?.[1] || 'image/jpeg',
    } : null;

    // ── Carousel slide edit path ──
    // For a slide that belongs to a carousel with a locked design system,
    // we MUST rebuild the prompt from that design system. The generic
    // "EDIT THIS IMAGE" path would throw away the design system and the
    // slide would drift away from the rest of the set. Preserve the
    // locked visual DNA, reference both the current slide image and the
    // hook slide (for palette anchoring), and layer the user's edit
    // instruction on top as a modification.
    const carouselMsg = messages.find(m => m.id === msgId);
    const plan = carouselMsg?.carouselPlan;
    const slide = plan?.slides?.[imgIdx];
    if (plan && slide) {
      const platformId = carouselMsg.platform || 'instagram';
      setIsGenerating(true);
      setMessages(prev => prev.map(m => m.id === msgId ? { ...m, editingIdx: imgIdx } : m));
      try {
        const brandForPrompt = { name: brandDna?.brand_name || brandDna?.description?.split(/[.,]/)[0]?.trim() || '' };
        const uploadedPhotoUrls = photos.filter(p => p.status === 'done' && (p.url || p.result?.url)).map(p => p.url || p.result?.url).filter(Boolean);
        const oneBrandPhoto = brandDna?.photo_urls?.length ? [brandDna.photo_urls[0]] : [];
        const brandImageData = {
          photoUrls: [...uploadedPhotoUrls, ...oneBrandPhoto],
          logoUrl: null,
          colors: brandDna?.colors || {},
          mainFont: brandDna?.main_font || null,
        };

        // Build the slide prompt from the LOCKED design system, then
        // prepend the user's edit instruction as an override at the top.
        const basePrompt = buildCarouselSlidePrompt({
          designSystem: plan.designSystem,
          template: findCuratedCarouselTemplate(plan.designSystem?.templateId),
          slide,
          index: imgIdx,
          total: plan.slides.length,
          brand: brandForPrompt,
          platform: platformId,
        });
        const editedPrompt = [
          `USER EDIT INSTRUCTION (apply ONLY this change to the slide below — keep every other element identical: palette, typography, layout zones, badge, branding strip, slide counter, chapter mark, glow position, mood):`,
          `  ${editInstruction.trim()}`,
          ``,
          `If the edit changes a specific piece of text, update ONLY that text in TEXT CONTENT below; all other text must render exactly as originally specified.`,
          ``,
          basePrompt,
        ].join('\n');

        // Reference images: the current slide (so the edit is incremental
        // not from-scratch) and the hook (so palette locks visually).
        const hookImg = (carouselMsg.images || []).find(i => i.idx === 0);
        const refs = [];
        if (refImage) refs.push(refImage);
        if (hookImg && hookImg.idx !== imgIdx && hookImg.src?.startsWith('data:')) {
          const hc = hookImg.src.indexOf(',');
          const hm = hookImg.src.match(/^data:([^;]+);/);
          if (hc !== -1) refs.push({ data: hookImg.src.slice(hc + 1), mimeType: hm?.[1] || 'image/jpeg' });
        }

        const result = await generateSlideWithRetry(imgIdx, editedPrompt, brandImageData, refs, { maxAttempts: 3, platform: platformId });
        const newSrc = `data:${result.image.mimeType};base64,${result.image.data}`;
        setMessages(prev => prev.map(m => {
          if (m.id !== msgId) return m;
          const newImages = [...(m.images || [])];
          const target = newImages.findIndex(img => img.idx === imgIdx);
          if (target !== -1) newImages[target] = { ...newImages[target], src: newSrc };
          else newImages.push({ src: newSrc, idx: imgIdx });
          // Clear any failed-slide entry for this index since it's now rendered.
          const failedLeft = (m.carouselPlan?.failedSlides || []).filter(x => x !== imgIdx);
          return {
            ...m,
            images: newImages,
            editingIdx: undefined,
            carouselPlan: { ...m.carouselPlan, failedSlides: failedLeft },
          };
        }));
      } catch (err) {
        console.error('Carousel slide edit failed:', err);
        setMessages(prev => prev.map(m => m.id === msgId ? { ...m, editingIdx: undefined } : m));
      } finally {
        setIsGenerating(false);
      }
      return;
    }

    // ── Generic single-image edit path (non-carousel) ──
    setIsGenerating(true);
    setMessages(prev => prev.map(m =>
      m.id === msgId ? { ...m, editingIdx: imgIdx } : m
    ));
    try {
      // Send the image + edit instruction + sidebar reference photos (for likeness), but no brand DNA or logo
      const sidebarPhotoUrls = photos.filter(p => p.status === 'done' && (p.url || p.result?.url)).map(p => p.url || p.result?.url).filter(Boolean);
      const editBrandData = sidebarPhotoUrls.length ? { photoUrls: sidebarPhotoUrls, logoUrl: null, colors: {}, mainFont: null } : null;
      const result = await generateImage(
        `EDIT THIS IMAGE: ${editInstruction.trim()}. Keep the same overall style and composition. Only apply the specific change requested.`,
        selectedPlatform,
        editBrandData,
        refImage ? [refImage] : null
      );
      if (result.image) {
        const newSrc = `data:${result.image.mimeType};base64,${result.image.data}`;
        setMessages(prev => prev.map(m => {
          if (m.id !== msgId) return m;
          const newImages = [...m.images];
          const target = newImages.findIndex(img => img.idx === imgIdx);
          if (target !== -1) newImages[target] = { ...newImages[target], src: newSrc };
          return { ...m, images: newImages, editingIdx: undefined };
        }));
      }
    } catch (err) {
      console.error('Image edit failed:', err);
      setMessages(prev => prev.map(m =>
        m.id === msgId ? { ...m, editingIdx: undefined } : m
      ));
    } finally {
      setIsGenerating(false);
    }
  }, [editingImage, isGenerating, selectedPlatform, messages, photos, brandDna, generateSlideWithRetry]);

  const handleLinkedinGenerateImage = useCallback(async (postText) => {
    // Read the latest preview from the ref so callers in stale closures
    // (e.g. sendToAI's edit-mode marker dispatcher) still see the current
    // msgId / images. The state-bound version would race.
    const livePreview = linkedinPreviewRef.current;
    if (!livePreview || liGeneratingImage) return;
    setLiGeneratingImage(true);
    try {
      const imgPrompt = `Professional LinkedIn post image. Clean, minimal design with authority. 3:4 portrait ratio. The image should complement this LinkedIn post: "${(postText || '').slice(0, 200)}". Use brand colors if available. Bold headline text, professional photography or clean graphic design. No cartoons, no clip-art.`;
      const uploadedPhotoUrls = photos.filter(p => p.status === 'done' && (p.url || p.result?.url)).map(p => p.url || p.result?.url).filter(Boolean);
      const oneBrandPhoto = brandDna?.photo_urls?.length ? [brandDna.photo_urls[0]] : [];
      const allPhotoUrls = [...uploadedPhotoUrls, ...oneBrandPhoto];
      const brandImageData = {
        photoUrls: allPhotoUrls,
        logoUrl: null,
        colors: brandDna?.colors || {},
        mainFont: brandDna?.main_font || null,
      };
      const result = await generateImage(imgPrompt, 'linkedin', brandImageData, null);
      if (result.image) {
        const src = `data:${result.image.mimeType};base64,${result.image.data}`;
        // Re-read the ref AFTER the await — preview may have advanced.
        const liveAfter = linkedinPreviewRef.current || livePreview;
        const nextIdx = (liveAfter.images || []).length;
        const newImg = { src, idx: nextIdx };
        setMessages(prev => prev.map(m =>
          m.id === liveAfter.msgId
            ? { ...m, images: [...(m.images || []), newImg] }
            : m
        ));
        setLinkedinPreview(prev => prev ? { ...prev, images: [...(prev.images || []), newImg] } : null);
      }
    } catch (err) {
      console.error('LinkedIn image generation failed:', err);
    } finally {
      setLiGeneratingImage(false);
    }
  }, [liGeneratingImage, photos, brandDna]);

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
      const sid = await ensureSession();
      const { files: results } = await uploadContextFiles(files, sid);
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
  }, [ensureSession]);

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

  // Window-level drag-and-drop. Splits dropped files by MIME type:
  // images route to the photos strip (with addPhotos' 4-photo cap),
  // everything else routes to the documents list. Same ingest path
  // as the Image / Document buttons in the UI, so behaviour and
  // limits stay consistent regardless of how files arrive.
  const handleWindowFileDrop = useCallback((files) => {
    const images = [];
    const docs = [];
    for (const f of files) {
      if (f.type?.startsWith('image/')) images.push(f);
      else docs.push(f);
    }
    if (images.length) addPhotos(images);
    if (docs.length) addDocuments(docs);
  }, [addPhotos, addDocuments]);

  // Build the (brandImageData, referenceImages, editUserImage) triple
  // for a generateImage() call from the current photos/brandDna state.
  // Splits user-uploaded photos out of brandImageData.photoUrls so the
  // backend's positional manifest labels them as "USER-PROVIDED IMAGE"
  // (the same editUserImage path AI CEO uses) — Gemini then follows
  // the user's exact prompt instruction for each image rather than
  // mashing all attached photos into a generic face reference.
  //
  // Fetches each user photo and converts to base64 because the
  // generate_image backend reads referenceImages as inline {data,
  // mimeType} payloads (URLs would need a separate fetch on the
  // server). Brand-DNA photo stays as a URL — the backend already
  // does the URL fetch for brand assets.
  const buildImageGenArgs = useCallback(async () => {
    const userPhotos = photos.filter((p) => p.status === 'done' && (p.url || p.result?.url));
    const userPhotoUrls = userPhotos.map((p) => p.url || p.result?.url).filter(Boolean);
    const brandImageData = {
      photoUrls: brandDna?.photo_urls?.length ? [brandDna.photo_urls[0]] : [],
      logoUrl: null,
      colors: brandDna?.colors || {},
      mainFont: brandDna?.main_font || null,
    };
    let referenceImages = null;
    if (userPhotoUrls.length) {
      const refs = await Promise.all(userPhotoUrls.map(async (url) => {
        try {
          const r = await fetch(url, { mode: 'cors' });
          const b = await r.blob();
          const buf = await b.arrayBuffer();
          const base64 = btoa(String.fromCharCode(...new Uint8Array(buf)));
          return { data: base64, mimeType: b.type || 'image/jpeg' };
        } catch (err) {
          console.warn('[Content] buildImageGenArgs: failed to fetch user photo', url, err?.message);
          return null;
        }
      }));
      const filtered = refs.filter(Boolean);
      if (filtered.length) referenceImages = filtered;
    }
    return {
      brandImageData,
      referenceImages,
      editUserImage: !!referenceImages?.length,
    };
  }, [photos, brandDna]);

  const { dragging: filesDragging } = useChatFileDropZone({
    onFiles: handleWindowFileDrop,
  });

  const removeFile = useCallback((index, setter) => {
    setter((prev) => {
      const item = prev[index];
      if (item?.dbId) deleteContentItem(item.dbId).catch(() => {});
      return prev.filter((_, i) => i !== index);
    });
  }, []);

  // Container-level drag handlers — drop ANYWHERE on the context panel and
  // auto-route by mime type. dragCounterRef handles child-element flicker
  // (dragenter/leave fire when crossing nested element boundaries).
  const isFileDrag = (e) => {
    const types = e.dataTransfer?.types;
    if (!types) return false;
    return Array.from(types).includes('Files');
  };

  const makeContainerDragHandlers = useCallback((counterRef, setDragOver, onEnterExtra) => ({
    onDragEnter: (e) => {
      if (!isFileDrag(e)) return;
      e.preventDefault();
      counterRef.current += 1;
      if (counterRef.current === 1) {
        setDragOver(true);
        onEnterExtra?.();
      }
    },
    onDragOver: (e) => {
      if (!isFileDrag(e)) return;
      e.preventDefault();
      e.dataTransfer.dropEffect = 'copy';
    },
    onDragLeave: (e) => {
      if (!isFileDrag(e)) return;
      counterRef.current = Math.max(0, counterRef.current - 1);
      if (counterRef.current === 0) setDragOver(false);
    },
    onDrop: (e) => {
      if (!isFileDrag(e)) return;
      e.preventDefault();
      counterRef.current = 0;
      setDragOver(false);
      const files = Array.from(e.dataTransfer?.files || []);
      if (!files.length) return;
      const images = files.filter((f) => f.type.startsWith('image/'));
      const others = files.filter((f) => !f.type.startsWith('image/'));
      if (images.length) addPhotos(images);
      if (others.length) addDocuments(others);
    },
  }), [addPhotos, addDocuments]);

  const sidebarDragHandlers = useMemo(
    () => makeContainerDragHandlers(sidebarDragCounter, setSidebarDragOver, () => setSidebarOpen(true)),
    [makeContainerDragHandlers]
  );
  const sheetDragHandlers = useMemo(
    () => makeContainerDragHandlers(sheetDragCounter, setSidebarDragOver),
    [makeContainerDragHandlers]
  );

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
      const sid = await ensureSession();
      const { results } = await extractSocialUrls([url], sid);
      const result = results[0];
      console.group(`[Content] Social URL extracted: ${url}`);
      console.log('Platform:', result?.platform);
      console.log('Source:', result?.source);
      console.log('Title:', result?.title?.slice(0, 100));
      console.log('Uploader:', result?.uploader);
      console.log('Duration:', result?.duration, 'seconds');
      console.log('Has transcript:', !!result?.transcript);
      console.log('Transcript preview:', result?.transcript ? result.transcript.slice(0, 200) + '...' : '(none)');
      console.log('Description preview:', result?.description ? result.description.slice(0, 200) + '...' : '(none)');
      console.log('Thumbnail:', result?.thumbnail ? 'yes' : 'no');
      console.log('Full result:', result);
      console.groupEnd();
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
  }, [ensureSession]);

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

  const submitSocialInput = useCallback((e) => {
    e?.preventDefault?.();
    const value = socialInput.trim();
    if (!value) return;
    addSocialUrl(value);
    setSocialInput('');
  }, [socialInput, addSocialUrl]);

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

  // Load ALL saved content items for this user (global, not session-scoped).
  // Uploaded photos, docs, and social URLs persist across all chats.
  useEffect(() => {
    if (!user) return;
    let cancelled = false;
    getContentItems().then(({ items }) => {
      if (cancelled) return;
      console.log('[Content] Loaded content items (global):', items?.length, items?.map(i => ({ type: i.type, url: i.url?.slice(0, 60) })));
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
            // Preserve metadata.source so buildSystemPrompt can route
            // outlier-detector items into the dedicated COPY-EXACT block
            // instead of the generic social-links block.
            source: m.source || null,
            result: {
              url: item.url, title: m.title, uploader: m.uploader,
              thumbnail: m.thumbnail, platform: m.platform,
              duration: m.duration, transcript: item.transcript,
              description: m.description,
              source: m.source || null,
            },
          });
        }
      }
      if (cancelled) return;
      console.log('[Content] Restored context  -  photos:', savedPhotos.length, 'docs:', savedDocs.length, 'social:', savedSocial.length);
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
    return () => { cancelled = true; };
  }, [user?.id]);

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
          className={`cs-upload-zone cs-upload-zone--expanded ${photoHover ? 'cs-upload-zone--hover' : ''}`}
          onClick={() => photoInputRef.current?.click()}
          onMouseEnter={() => setPhotoHover(true)}
          onMouseLeave={() => setPhotoHover(false)}
        >
          <Image size={20} className="cs-upload-icon" />
          <span className="cs-upload-label cs-upload-label--show">Add reference photos</span>
          <span className="cs-upload-hint cs-upload-hint--show">{photos.length}/4 photos</span>
        </div>
      )}

      {/* Document thumbnails */}
      {documents.length > 0 && (
        <div className="cs-doc-list">
          {documents.map((item, i) => {
            const fname = item.file?.name || item.filename || 'file';
            const ext = fname.split('.').pop().toLowerCase();
            const statusTitle = item.status === 'error'
              ? (item.errorMessage ? `${fname} — ${item.errorMessage}` : `${fname} — failed`)
              : item.status === 'done' ? fname
              : `${fname} — uploading…`;
            return (
              <div
                key={i}
                className={`cs-doc-pill ${item.status === 'uploading' ? 'cs-doc-pill--processing' : ''} ${item.status === 'error' ? 'cs-doc-pill--error' : ''}`}
                title={statusTitle}
              >
                {(item.status === 'pending' || item.status === 'uploading') ? (
                  <Loader size={12} className="cs-spinner cs-doc-pill-icon" />
                ) : item.status === 'error' ? (
                  <span className="cs-doc-pill-icon cs-doc-pill-icon--err">!</span>
                ) : (
                  <span className="cs-doc-pill-ext">{ext || 'doc'}</span>
                )}
                <span className="cs-doc-pill-name">{fname}</span>
                <button className="cs-doc-pill-remove" onClick={() => { removeFile(i, setDocuments); setTooltip(t => ({ ...t, visible: false })); }} title="Remove">
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
        className={`cs-upload-zone cs-upload-zone--expanded ${docHover ? 'cs-upload-zone--hover' : ''}`}
        onClick={() => docInputRef.current?.click()}
        onMouseEnter={() => setDocHover(true)}
        onMouseLeave={() => setDocHover(false)}
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
        <form className="cs-social-input-form" onSubmit={submitSocialInput} onClick={(e) => e.stopPropagation()}>
          <input
            type="url"
            className="cs-social-input"
            placeholder="Paste or type link"
            value={socialInput}
            onChange={(e) => setSocialInput(e.target.value)}
            onPaste={(e) => e.stopPropagation()}
          />
          <button type="submit" className="cs-social-input-submit" disabled={!socialInput.trim()} aria-label="Add link">
            <ArrowUp size={14} />
          </button>
        </form>
      </div>
      {socialUrls.length > 0 && (
        <div className="cs-social-cards">
          {socialUrls.map((item, i) => (
            <div key={i} className={`cs-social-card ${item.status === 'extracting' ? 'cs-social-card--extracting' : ''} ${item.status === 'error' ? 'cs-social-card--error' : ''}`}>
              <div className="cs-social-card-thumb">
                <SocialThumb src={item.result?.thumbnail} />
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

  // Credits depleted
  if (creditsDepleted) {
    return (
      <div className="content-page" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <div className="credits-depleted">
          <div className="credits-depleted-icon"><Zap size={24} /></div>
          <div className="credits-depleted-title">You've run out of credits</div>
          <p className="credits-depleted-text">
            Your credit balance has reached zero. Add more credits to continue creating content.
          </p>
          <button className="credits-depleted-link" onClick={() => navigate('/settings')}>
            Go to Billing & Usage
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className={`content-page${planMode ? ' content-page--plan-mode' : ''}`}>
      {/* Window-level drag-and-drop overlay. Drops anywhere on the page
          land in the chat context (images → photos strip, others →
          documents list). The existing sidebar drop-target stays — it
          wins on overlap because it has its own onDragEnter handlers
          and they fire before our window listener picks up the event. */}
      <ChatDropOverlay visible={filesDragging && !sidebarDragOver} hint="Images join your photos strip; documents land in the docs list." />
      {/* Content Sidebar (desktop only) */}
      <aside
        className={`content-sidebar ${sidebarOpen ? 'content-sidebar--open' : ''} ${sidebarDragOver ? 'content-sidebar--dragover' : ''}`}
        onClick={!sidebarOpen ? openSidebar : undefined}
        {...sidebarDragHandlers}
      >
        {sidebarDragOver && (
          <div className="cs-drop-overlay">
            <div className="cs-drop-overlay-inner">
              <div className="cs-drop-overlay-icon">
                <Image size={28} />
                <FileText size={28} />
              </div>
              <div className="cs-drop-overlay-title">Drop to add</div>
              <div className="cs-drop-overlay-hint">Images become reference photos · Files become documents</div>
            </div>
          </div>
        )}
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
              className={`cs-upload-zone ${photoHover ? 'cs-upload-zone--hover' : ''}`}
              onClick={() => { if (sidebarOpen) photoInputRef.current?.click(); }}
              onMouseEnter={() => setPhotoHover(true)}
              onMouseLeave={() => setPhotoHover(false)}
            >
              <Image size={20} className="cs-upload-icon" />
              <span className="cs-upload-label">Add reference photos</span>
              <span className="cs-upload-hint">{photos.length}/4 photos</span>
            </div>
          )}

          {/* Document thumbnails — pill list with filename visible. */}
          {documents.length > 0 && (
            <div className="cs-doc-list">
              {documents.map((item, i) => {
                const fname = item.file?.name || item.filename || 'file';
                const ext = fname.split('.').pop().toLowerCase();
                const statusTitle = item.status === 'error'
                  ? (item.errorMessage ? `${fname} — ${item.errorMessage}` : `${fname} — failed`)
                  : item.status === 'done' ? fname
                  : `${fname} — uploading…`;
                return (
                  <div
                    key={i}
                    className={`cs-doc-pill ${item.status === 'uploading' ? 'cs-doc-pill--processing' : ''} ${item.status === 'error' ? 'cs-doc-pill--error' : ''}`}
                    title={statusTitle}
                  >
                    {(item.status === 'pending' || item.status === 'uploading') ? (
                      <Loader size={12} className="cs-spinner cs-doc-pill-icon" />
                    ) : item.status === 'error' ? (
                      <span className="cs-doc-pill-icon cs-doc-pill-icon--err">!</span>
                    ) : (
                      <span className="cs-doc-pill-ext">{ext || 'doc'}</span>
                    )}
                    <span className="cs-doc-pill-name">{fname}</span>
                    <button className="cs-doc-pill-remove" onClick={() => { removeFile(i, setDocuments); setTooltip(t => ({ ...t, visible: false })); }} title="Remove">
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
            className={`cs-upload-zone ${docHover ? 'cs-upload-zone--hover' : ''}`}
            onClick={() => { if (sidebarOpen) docInputRef.current?.click(); }}
            onMouseEnter={() => setDocHover(true)}
            onMouseLeave={() => setDocHover(false)}
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
            <form className="cs-social-input-form" onSubmit={submitSocialInput} onClick={(e) => e.stopPropagation()}>
              <input
                type="url"
                className="cs-social-input"
                placeholder="Paste or type link"
                value={socialInput}
                onChange={(e) => setSocialInput(e.target.value)}
                onPaste={(e) => e.stopPropagation()}
              />
              <button type="submit" className="cs-social-input-submit" disabled={!socialInput.trim()} aria-label="Add link">
                <ArrowUp size={14} />
              </button>
            </form>
          </div>
          {socialUrls.length > 0 && (
            <div className="cs-social-cards">
              {socialUrls.map((item, i) => (
                <div key={i} className={`cs-social-card ${item.status === 'extracting' ? 'cs-social-card--extracting' : ''} ${item.status === 'error' ? 'cs-social-card--error' : ''}`}>
                  <div className="cs-social-card-thumb">
                    <SocialThumb src={item.result?.thumbnail} />
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

          {/* Saved carousel templates  -  dropdown; sits between the attached
              links and Brand DNA so users see the workflow: (link) → (template
              context) → (brand). Collapsed by default so it stays out of the
              way when you're not picking a template. */}
          {sidebarOpen && savedTemplates.length > 0 && (
            <div className={`cs-templates-card${templatesSidebarOpen ? ' cs-templates-card--open' : ''}`}>
              <button
                type="button"
                className="cs-templates-toggle"
                onClick={() => setTemplatesSidebarOpen(v => !v)}
                title={templatesSidebarOpen ? 'Close saved samples' : 'Open saved samples'}
              >
                <Zap size={12} />
                <span className="cs-templates-toggle-label">Saved carousel samples</span>
                <span className="cs-templates-count">
                  {selectedTemplateIds.size > 0 ? `${selectedTemplateIds.size} on` : `${savedTemplates.length}`}
                </span>
                <ChevronRight size={14} className={`cs-templates-chevron${templatesSidebarOpen ? ' cs-templates-chevron--open' : ''}`} />
              </button>
              {templatesSidebarOpen && (
                <div className="cs-templates-list">
                  {/* Premade (curated) templates — single-select gallery */}
                  {curatedTemplates.length > 0 && (
                    <div className="cs-templates-group-label">Premade templates</div>
                  )}
                  {curatedTemplates.map(t => {
                    const on = selectedCuratedId === t.id;
                    const p = t.designSystem?.palette || {};
                    return (
                      <div key={t.id} className={`cs-template-item${on ? ' cs-template-item--on' : ''}`}>
                        <button
                          type="button"
                          className="cs-template-toggle"
                          onClick={() => setSelectedCuratedId(on ? null : t.id)}
                          title={on ? 'Deselect this premade template' : `Generate carousels in the "${t.name}" style`}
                        >
                          {t.preview && <img src={t.preview} alt="" className="cs-template-thumb" />}
                          <div className="cs-template-info">
                            <div className="cs-template-name">{t.name}</div>
                            <div className="cs-template-swatches">
                              {[p.background, p.accentPrimary, p.gradientStart, p.gradientEnd].filter(Boolean).map((hex, i) => (
                                <span key={i} className="cs-template-swatch" style={{ background: hex }} />
                              ))}
                            </div>
                          </div>
                          {on && <span className="cs-template-dot" />}
                        </button>
                      </div>
                    );
                  })}
                  {savedTemplates.length > 0 && curatedTemplates.length > 0 && (
                    <div className="cs-templates-group-label">Your saved samples</div>
                  )}
                  {savedTemplates.map(t => {
                    const on = selectedTemplateIds.has(t.id);
                    const p = t.design_system?.palette || {};
                    return (
                      <div key={t.id} className={`cs-template-item${on ? ' cs-template-item--on' : ''}`}>
                        <button type="button" className="cs-template-toggle" onClick={() => toggleSavedTemplate(t.id)} title={on ? 'Remove from chat context' : 'Add to chat context'}>
                          {t.preview_url && <img src={t.preview_url} alt="" className="cs-template-thumb" />}
                          <div className="cs-template-info">
                            <div className="cs-template-name">{t.name}</div>
                            <div className="cs-template-swatches">
                              {[p.background, p.accentPrimary, p.gradientStart, p.gradientEnd].filter(Boolean).map((hex, i) => (
                                <span key={i} className="cs-template-swatch" style={{ background: hex }} />
                              ))}
                            </div>
                          </div>
                          {on && <span className="cs-template-dot" />}
                        </button>
                        <button type="button" className="cs-template-delete" onClick={() => removeSavedTemplate(t.id)} title="Delete template">
                          <Trash2 size={11} />
                        </button>
                      </div>
                    );
                  })}
                </div>
              )}
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

      {/* Doc tooltip  -  rendered outside sidebar to avoid overflow clipping */}
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
        <div
          className={`context-sheet-body ${sidebarDragOver ? 'context-sheet-body--dragover' : ''}`}
          {...sheetDragHandlers}
        >
          {sidebarDragOver && (
            <div className="cs-drop-overlay">
              <div className="cs-drop-overlay-inner">
                <div className="cs-drop-overlay-icon">
                  <Image size={28} />
                  <FileText size={28} />
                </div>
                <div className="cs-drop-overlay-title">Drop to add</div>
                <div className="cs-drop-overlay-hint">Images become reference photos · Files become documents</div>
              </div>
            </div>
          )}
          {contextContent(true)}
        </div>
      </div>

      {/* Main content area. When split, the chat/preview widths come from
          the draggable divider via the --content-split CSS variable. */}
      <div
        className={`content-main${linkedinPreview || carouselSideView || scriptView ? ' content-main--split' : ''}${splitDragging ? ' content-main--dragging' : ''}`}
        ref={splitRef}
        style={linkedinPreview || carouselSideView || scriptView ? { '--content-split': `${splitPct}%` } : undefined}
      >
        <div className="content-main-chat">
        {/* Platform Pill Selector */}
        <div className="content-top-bar">
          <div className="content-topbtns">
            <button className="content-prev-convos" title="Chat history" onClick={() => setShowSessions((v) => { if (!v) setSidebarOpen(false); return !v; })}>
              <History size={18} className="content-prev-convos-icon" />
              <span className="content-prev-convos-label">Chat history</span>
            </button>
            <button className="content-new-chat" onClick={newConversation} title="New chat">
              <Plus size={18} />
              <span className="content-new-chat-label">New chat</span>
            </button>
          </div>
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
                  onClick={() => switchPlatform(p.id)}
                  title={p.name}
                >
                  {p.icon}
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* Sessions overlay + panel */}
        {showSessions && (
          <>
            <div className="content-sessions-backdrop" onClick={() => setShowSessions(false)} />
            <div className="content-sessions-panel">
              <div className="content-sessions-header">
                <span>Chat history</span>
              </div>
              <div className="content-sessions-list">
                {sessions.length === 0 && (
                  <div className="content-sessions-empty">No past conversations yet</div>
                )}
                {sessions.map((s) => {
                  const isRenaming = renamingSessionId === s.id;
                  return (
                    <div
                      key={s.id}
                      className={`content-sessions-item ${s.id === sessionId ? 'content-sessions-item--active' : ''}`}
                      onClick={() => { if (!isRenaming) loadSession(s.id); }}
                    >
                      <div className="content-sessions-item-info">
                        {isRenaming ? (
                          <input
                            autoFocus
                            className="content-sessions-item-rename"
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
                          <span className="content-sessions-item-title">{s.title}</span>
                        )}
                        <span className="content-sessions-item-meta">
                          {s.platform} &middot; {new Date(s.updated_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
                        </span>
                      </div>
                      {!isRenaming && (
                        <button className="content-sessions-item-rename-btn" onClick={(e) => startRenameSession(s, e)} title="Rename">
                          <Pencil size={13} />
                        </button>
                      )}
                      <button className="content-sessions-item-delete" onClick={(e) => requestDeleteSession(s.id, e)} title="Delete">
                        <Trash2 size={14} />
                      </button>
                    </div>
                  );
                })}
              </div>
            </div>
          </>
        )}

        {/* Delete confirmation modal */}
        {confirmDeleteId && (() => {
          const target = sessions.find((s) => s.id === confirmDeleteId);
          return (
            <div className="content-confirm-backdrop" onClick={() => setConfirmDeleteId(null)}>
              <div className="content-confirm-modal" onClick={(e) => e.stopPropagation()} role="dialog" aria-modal="true">
                <div className="content-confirm-icon"><Trash2 size={20} /></div>
                <div className="content-confirm-title">Delete this conversation?</div>
                <div className="content-confirm-desc">
                  {target ? `"${target.title}" will be permanently removed.` : 'This conversation will be permanently removed.'}
                </div>
                <div className="content-confirm-actions">
                  <button className="content-confirm-btn content-confirm-btn--cancel" onClick={() => setConfirmDeleteId(null)}>Cancel</button>
                  <button className="content-confirm-btn content-confirm-btn--danger" onClick={confirmDeleteSession} autoFocus>Delete</button>
                </div>
              </div>
            </div>
          );
        })()}

        {/* Chat area */}
        <div className="content-chat-area" ref={chatAreaRef}>
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
                  // Render only what the user actually typed.
                  // msg.content has the [CONTEXT — …] block prepended
                  // for the AI; users shouldn't see that in their own
                  // bubble. New messages stamp displayText directly;
                  // legacy messages without it fall back through the
                  // strip helper.
                  return (
                    <div key={msg.id} className="content-bubble content-bubble--user">
                      <p className="content-user-text">{msg.displayText || stripContentContextBlocks(msg.content)}</p>
                    </div>
                  );
                }
                // A message has something renderable if it has text, a plan
                // card, any images, or pending images being generated. Only
                // when NONE of those are present do we show the
                // thinking/no-response placeholder bubble.
                const hasRenderable =
                  !!msg.content ||
                  !!msg.carouselPlan ||
                  (msg.images || []).length > 0 ||
                  (msg.pendingImages || 0) > 0;
                if (!hasRenderable) {
                  // Only show the animated "thinking..." bubble for the
                  // ONE message that is actively being generated right now.
                  // Older empty-content messages (from previous timeouts
                  // or silent failures) must stay on the static "no
                  // response" copy even when the user fires off a new
                  // request — otherwise they'd flip back to animated dots
                  // every time isGenerating is true globally.
                  const stillWorking = isGenerating && msg.id === activeAssistantId;
                  // Plan Mode gets the themed multi-step working card so
                  // users see a clear indicator that the plan is being
                  // built (matches the AICEO chat plan indicator).
                  if (stillWorking && planMode && !searchStatus) {
                    return (
                      <div key={msg.id} className="content-assistant-row">
                        <img src="/favicon.png" alt="" className="content-assistant-avatar" />
                        <div className="content-plan-working">
                          <div className="content-plan-working-header">
                            <CalendarDays size={14} className="content-plan-working-icon" />
                            <span>Building your plan</span>
                          </div>
                          <div className="content-plan-working-steps">
                            <div className="content-plan-working-step content-plan-working-step--1">
                              <span className="content-plan-working-step-dot" />
                              <span>Reading brand DNA + past content</span>
                            </div>
                            <div className="content-plan-working-step content-plan-working-step--2">
                              <span className="content-plan-working-step-dot" />
                              <span>Drafting week-by-week roadmap</span>
                            </div>
                            <div className="content-plan-working-step content-plan-working-step--3">
                              <span className="content-plan-working-step-dot" />
                              <span>Composing hooks + visual briefs</span>
                            </div>
                          </div>
                          <span className="content-plan-working-label">
                            Working on your content plan<span className="content-dots"><span>.</span><span>.</span><span>.</span></span>
                          </span>
                        </div>
                      </div>
                    );
                  }
                  return (
                    <div key={msg.id} className="content-assistant-row">
                      <img src="/favicon.png" alt="" className="content-assistant-avatar" />
                      <div className="content-thinking">
                        <span className="content-thinking-text">
                          {stillWorking ? (
                            searchStatus === 'searching' ? (
                              <><Search size={14} /> Searching the web<span className="content-dots"><span>.</span><span>.</span><span>.</span></span></>
                            ) : searchStatus === 'writing' ? (
                              <><PenLine size={14} /> Writing response<span className="content-dots"><span>.</span><span>.</span><span>.</span></span></>
                            ) : (
                              <>thinking<span className="content-dots"><span>.</span><span>.</span><span>.</span></span></>
                            )
                          ) : (
                            <>No response received. Please try again.</>
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
                      {parsed.text && (() => {
                        // Plan Mode HTML detection — if the message
                        // contains a <div class="plan-artifact">…</div>
                        // block, hoist it into a compact canvas card
                        // with Download / Copy / Open buttons instead
                        // of inlining the whole HTML.
                        const planParts = extractPlanArtifact(parsed.text);
                        if (planParts) {
                          const renderMd = (chunk) => chunk && chunk.trim() ? (
                            <div className="content-markdown">
                              <ReactMarkdown
                                remarkPlugins={[remarkGfm]}
                                rehypePlugins={[rehypeRaw]}
                                skipHtml={false}
                                components={{
                                  table: ({ children, ...props }) => (
                                    <div className="content-table-scroll"><table {...props}>{children}</table></div>
                                  ),
                                }}
                              >{DOMPurify.sanitize(chunk, { ADD_TAGS: ['style'], ADD_ATTR: ['style'] })}</ReactMarkdown>
                            </div>
                          ) : null;
                          return (
                            <>
                              {renderMd(planParts.before)}
                              <div className="content-plan-card">
                                <div className="content-plan-card-preview">
                                  <div
                                    className="content-plan-card-preview-inner"
                                    dangerouslySetInnerHTML={{ __html: DOMPurify.sanitize(planParts.planHtml, { ADD_TAGS: ['style'], ADD_ATTR: ['style'] }) }}
                                  />
                                  <div className="content-plan-card-fade" />
                                </div>
                                <div className="content-plan-card-actions">
                                  <button
                                    type="button"
                                    className="content-plan-card-btn content-plan-card-btn--primary"
                                    onClick={() => { setPlanCanvasHtml(planParts.planHtml); setPlanCanvasMsgId(msg.id); }}
                                    title="Open the plan in a full canvas view to edit or copy"
                                  >
                                    <Maximize2 size={13} /> Open in canvas
                                  </button>
                                  <button
                                    type="button"
                                    className="content-plan-card-btn"
                                    onClick={() => {
                                      const blob = new Blob([`<!doctype html><meta charset="utf-8"><title>Content Plan</title>${planParts.planHtml}`], { type: 'text/html' });
                                      const url = URL.createObjectURL(blob);
                                      const a = document.createElement('a');
                                      a.href = url;
                                      a.download = `content-plan-${new Date().toISOString().slice(0,10)}.html`;
                                      document.body.appendChild(a);
                                      a.click();
                                      a.remove();
                                      setTimeout(() => URL.revokeObjectURL(url), 2000);
                                    }}
                                    title="Download this plan as an .html file"
                                  >
                                    <Download size={13} /> Download HTML
                                  </button>
                                  <button
                                    type="button"
                                    className="content-plan-card-btn"
                                    onClick={() => {
                                      navigator.clipboard?.writeText(planParts.planHtml);
                                    }}
                                    title="Copy the plan HTML to your clipboard"
                                  >
                                    Copy HTML
                                  </button>
                                </div>
                              </div>
                              {renderMd(planParts.after)}
                            </>
                          );
                        }
                        return (
                          <div className="content-markdown">
                            <ReactMarkdown
                              remarkPlugins={[remarkGfm]}
                              rehypePlugins={[rehypeRaw]}
                              skipHtml={false}
                              components={{
                                table: ({ children, ...props }) => (
                                  <div className="content-table-scroll"><table {...props}>{children}</table></div>
                                ),
                              }}
                            >{DOMPurify.sanitize(parsed.text, { ADD_TAGS: ['style'], ADD_ATTR: ['style'] })}</ReactMarkdown>
                          </div>
                        );
                      })()}
                      {/* Carousel plan approval card — Instagram only */}
                      {msg.carouselPlan && (
                        <CarouselPlanCard
                          plan={msg.carouselPlan}
                          onApprove={() => handleCarouselApprove(msg.id)}
                          onRetryFailed={() => handleRetryFailedSlides(msg.id)}
                          onUpdatePlan={(next) => handleUpdateCarouselPlan(msg.id, next)}
                        />
                      )}
                      {/* In-chat content plan — the SAME card + runner the
                          AI CEO uses (src/lib/planRunner.js). */}
                      {msg.contentPlan && (
                        <ContentPlanMessage
                          plan={msg.contentPlan}
                          isRunActive={activePlanRunMsgId === msg.id}
                          runLocked={isGenerating || activePlanRunMsgId !== null}
                          onGenerate={() => handleGeneratePlanContent(msg.id)}
                          onRetryFailed={() => handleGeneratePlanContent(msg.id, { retryFailedOnly: true })}
                          onStop={() => handleStopPlanRun(msg.id)}
                          onOpenItem={(pieceMsgId) => openPlanPiece(pieceMsgId)}
                        />
                      )}
                      {/* LinkedIn text-post summary card — always visible.
                          Shows the generated image thumbnail (if any) and
                          first-line caption snippet, plus an Open Preview
                          button. Stays visible even if the preview is
                          already open so the user always has a path back. */}
                      {msg.linkedinPost && msg.linkedinPost.content && (
                        <div className="content-linkedin-summary">
                          {(msg.images || []).length > 0 && (
                            <div className="content-linkedin-summary-thumb">
                              <img src={(msg.images[0]?.src) || ''} alt="" />
                            </div>
                          )}
                          <div className="content-linkedin-summary-body">
                            <div className="content-linkedin-summary-label">LinkedIn post</div>
                            <div className="content-linkedin-summary-snippet">
                              {msg.linkedinPost.content.split('\n')[0].slice(0, 120)}{msg.linkedinPost.content.length > 120 ? '…' : ''}
                            </div>
                          </div>
                          <button
                            type="button"
                            className="content-linkedin-summary-open"
                            onClick={() => {
                              const alreadyOpen = linkedinPreview?.msgId === msg.id;
                              if (alreadyOpen) return;
                              setCarouselSideView(null);
                              setLinkedinPreview({
                                content: msg.linkedinPost.content,
                                images: msg.images || [],
                                totalSlides: msg.linkedinPost.totalSlides || 0,
                                msgId: msg.id,
                              });
                            }}
                            disabled={linkedinPreview?.msgId === msg.id}
                            title={linkedinPreview?.msgId === msg.id ? 'Already open in the side panel' : 'Open the LinkedIn preview'}
                          >
                            <Maximize2 size={14} />
                            {linkedinPreview?.msgId === msg.id ? 'Preview open' : 'Open preview'}
                          </button>
                        </div>
                      )}
                      {/* Text-only post summary card — the caption lives
                          in the side preview, never inline chat. */}
                      {msg.socialPost && msg.socialPost.caption && (
                        <div className="content-linkedin-summary">
                          <div className="content-script-summary-icon content-post-summary-icon">
                            <PenLine size={18} />
                          </div>
                          <div className="content-linkedin-summary-body">
                            <div className="content-linkedin-summary-label">
                              {(platforms.find((p) => p.id === msg.platform)?.name || 'Social')} post
                            </div>
                            <div className="content-linkedin-summary-snippet">
                              {msg.socialPost.caption.split('\n')[0].slice(0, 120)}{msg.socialPost.caption.length > 120 ? '…' : ''}
                            </div>
                          </div>
                          <button
                            type="button"
                            className="content-linkedin-summary-open"
                            onClick={() => {
                              if (carouselSideView?.msgId === msg.id) return;
                              setLinkedinPreview(null);
                              setScriptView(null);
                              setCarouselSideView({ msgId: msg.id });
                            }}
                            disabled={carouselSideView?.msgId === msg.id}
                            title={carouselSideView?.msgId === msg.id ? 'Already open in the side panel' : 'Open the post preview'}
                          >
                            <Maximize2 size={14} />
                            {carouselSideView?.msgId === msg.id ? 'Preview open' : 'Open preview'}
                          </button>
                        </div>
                      )}
                      {/* Video-script summary card — the script itself
                          lives in the side preview, never inline chat. */}
                      {msg.scriptDoc && msg.scriptDoc.content && (
                        <div className="content-linkedin-summary content-script-summary">
                          <div className="content-script-summary-icon">
                            <Clapperboard size={18} />
                          </div>
                          <div className="content-linkedin-summary-body">
                            <div className="content-linkedin-summary-label">
                              {(msg.scriptDoc.platform || msg.platform) === 'youtube' ? 'YouTube script' : 'Reel script'}
                            </div>
                            <div className="content-linkedin-summary-snippet">
                              {(msg.scriptDoc.title || msg.scriptDoc.content.split('\n')[0]).slice(0, 120)}
                            </div>
                          </div>
                          <button
                            type="button"
                            className="content-linkedin-summary-open"
                            onClick={() => {
                              if (scriptView?.msgId === msg.id) return;
                              setLinkedinPreview(null);
                              setCarouselSideView(null);
                              setScriptView({ msgId: msg.id });
                            }}
                            disabled={scriptView?.msgId === msg.id}
                            title={scriptView?.msgId === msg.id ? 'Already open in the side panel' : 'Open the script'}
                          >
                            <Maximize2 size={14} />
                            {scriptView?.msgId === msg.id ? 'Script open' : 'Open script'}
                          </button>
                        </div>
                      )}
                      {/* Image carousel — inline slides act as a compact
                          thumbnail strip even for carousels (preview holds
                          the editing surface; chat keeps a visual summary
                          so the user can see what they made at a glance). */}
                      {hasImages && (
                        <div className="content-image-carousel">
                          {sortedImages.map((img, i) => (
                            <div key={i} className={`content-carousel-slide content-generated-image--fadein${msg.editingIdx === img.idx ? ' content-carousel-slide--editing' : ''}`}>
                              {msg.editingIdx === img.idx && (
                                <div className="content-image-edit-overlay">
                                  <Loader size={20} className="cs-spinner" />
                                  <span>Editing...</span>
                                </div>
                              )}
                              <img src={img.src} alt={`Slide ${i + 1}`} onClick={() => setSlideViewer({ msgId: msg.id, idx: img.idx })} style={{ cursor: 'zoom-in' }} />
                              <button
                                className="content-carousel-edit"
                                onClick={(e) => { e.stopPropagation(); setEditingImage({ msgId: msg.id, imgIdx: img.idx, src: img.src }); setEditPrompt(''); }}
                                title="Edit this slide with an instruction (keeps design locked)"
                              >
                                <Pencil size={14} />
                              </button>
                              {msg.carouselPlan?.slides?.[img.idx] && (
                                <button
                                  type="button"
                                  className="content-carousel-regen"
                                  title="Re-roll this slide (same spec, new render)"
                                  disabled={isGenerating}
                                  onClick={(e) => { e.stopPropagation(); handleCarouselSlideRegenerate(msg.id, img.idx); }}
                                >
                                  <RefreshCw size={14} />
                                </button>
                              )}
                              <button
                                type="button"
                                className="content-carousel-download"
                                title="Download image"
                                onClick={async (e) => {
                                  // <a download> is ignored for cross-origin
                                  // URLs (Supabase storage) — browsers navigate
                                  // to the image instead of downloading, which
                                  // strands the user (no ESC, only Back). Fetch
                                  // as a blob and trigger download manually.
                                  e.stopPropagation();
                                  e.preventDefault();
                                  try {
                                    const res = await fetch(img.src, { mode: 'cors' });
                                    const blob = await res.blob();
                                    const ext = (blob.type.split('/')[1] || 'png').split('+')[0];
                                    const objectUrl = URL.createObjectURL(blob);
                                    const a = document.createElement('a');
                                    a.href = objectUrl;
                                    a.download = `slide-${i + 1}.${ext}`;
                                    document.body.appendChild(a);
                                    a.click();
                                    a.remove();
                                    setTimeout(() => URL.revokeObjectURL(objectUrl), 2000);
                                  } catch (err) {
                                    console.error('Image download failed:', err);
                                    // Last resort: open in new tab so the user at least sees the image
                                    window.open(img.src, '_blank', 'noopener');
                                  }
                                }}
                              >
                                <Download size={16} />
                              </button>
                              {editingImage?.msgId === msg.id && editingImage?.imgIdx === img.idx && (
                                <div className="content-image-edit-input" onClick={(e) => e.stopPropagation()}>
                                  <input
                                    type="text"
                                    placeholder="Describe the edit..."
                                    value={editPrompt}
                                    onChange={(e) => setEditPrompt(e.target.value)}
                                    onKeyDown={(e) => { if (e.key === 'Enter' && editPrompt.trim()) handleImageEdit(editPrompt); if (e.key === 'Escape') setEditingImage(null); }}
                                    autoFocus
                                  />
                                  <button disabled={!editPrompt.trim()} onClick={() => handleImageEdit(editPrompt)}>
                                    <ArrowUp size={14} />
                                  </button>
                                </div>
                              )}
                            </div>
                          ))}
                          {/* Skeleton placeholders for pending images */}
                          {Array.from({ length: msg.pendingImages || 0 }).map((_, i) => (
                            <div key={`pending-${i}`} className={`content-carousel-slide content-image-skeleton content-image-skeleton--${activePlatform?.id || 'default'}`}>
                              <div className="content-image-skeleton-shimmer" />
                              <div className="content-image-skeleton-label">
                                <Loader size={16} className="cs-spinner" />
                                <span>Generating {activePlatform?.id === 'youtube' ? 'thumbnail' : activePlatform?.id === 'linkedin' ? 'image' : `slide ${sortedImages.length + i + 1}`}...</span>
                              </div>
                            </div>
                          ))}
                        </div>
                      )}
                      {/* Progress badge — shows while slides are still rendering. */}
                      {msg.carouselPlan && hasPending && (
                        <div className="content-carousel-progress">
                          <Loader size={14} className="cs-spinner" />
                          <span>Rendering {sortedImages.length} / {sortedImages.length + (msg.pendingImages || 0)} slides…</span>
                        </div>
                      )}
                      {/* Actions bar — minimal now: just Open Preview. All
                          other actions (download, schedule, template) live
                          inside the preview panel itself. */}
                      {msg.carouselPlan && sortedImages.length > 0 && !hasPending && (
                        <CarouselActionsBar
                          msgId={msg.id}
                          plan={msg.carouselPlan}
                          images={sortedImages}
                          platform={msg.platform || 'instagram'}
                          onOpenSidePreview={() => {
                            // Opening the IG/LI side preview closes any open
                            // LinkedIn textpost preview so the split layout
                            // only has one tenant.
                            setLinkedinPreview(null);
                            setCarouselSideView({ msgId: msg.id });
                          }}
                        />
                      )}
                    </div>
                  </div>
                );
              })}
              {/* Full-screen slide viewer modal */}
              {slideViewer && (() => {
                const vMsg = messages.find(m => m.id === slideViewer.msgId);
                const vImages = [...(vMsg?.images || [])].sort((a, b) => a.idx - b.idx);
                const vCurrent = vImages.find(img => img.idx === slideViewer.idx) || vImages[0];
                if (!vCurrent) return null;
                const vPos = vImages.findIndex(img => img.idx === vCurrent.idx);
                return (
                  <SlideViewerModal
                    image={vCurrent}
                    position={vPos}
                    total={vImages.length}
                    isGenerating={isGenerating}
                    onClose={() => setSlideViewer(null)}
                    onPrev={() => {
                      const prevImg = vImages[vPos - 1];
                      if (prevImg) setSlideViewer({ msgId: slideViewer.msgId, idx: prevImg.idx });
                    }}
                    onNext={() => {
                      const nextImg = vImages[vPos + 1];
                      if (nextImg) setSlideViewer({ msgId: slideViewer.msgId, idx: nextImg.idx });
                    }}
                    onEdit={vMsg?.carouselPlan ? () => {
                      const msgId = slideViewer.msgId;
                      const idx = vCurrent.idx;
                      const src = vCurrent.src;
                      setSlideViewer(null);
                      setEditingImage({ msgId, imgIdx: idx, src });
                      setEditPrompt('');
                    } : null}
                    onRegenerate={vMsg?.carouselPlan?.slides?.[vCurrent.idx] ? () => {
                      const msgId = slideViewer.msgId;
                      const idx = vCurrent.idx;
                      setSlideViewer(null);
                      handleCarouselSlideRegenerate(msgId, idx);
                    } : null}
                  />
                );
              })()}
              {/* Question overlay  -  appears right after the last assistant bubble */}
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
              {/* Tool-progress status row — shows DURING generation even
                  when the assistant bubble already has text (e.g. the
                  15-30s silent window while a carousel plan's tool
                  arguments stream after "Here's the plan…"). Backend
                  emits these as SSE status events (handler.js
                  onToolStart). The 'searching'/'writing' enums belong to
                  the legacy thinking indicator above, not here. */}
              {isGenerating && searchStatus && !['searching', 'writing'].includes(searchStatus) && (
                <div className="content-assistant-row">
                  <img src="/favicon.png" alt="" className="content-assistant-avatar" />
                  <div className="content-thinking">
                    <span className="content-thinking-text">
                      <PenLine size={14} /> {searchStatus}<span className="content-dots"><span>.</span><span>.</span><span>.</span></span>
                    </span>
                  </div>
                </div>
              )}
              <div ref={messagesEndRef} />
            </div>
          )}
        </div>

        {/* Chat Input */}
        <div className="content-input-area">
          {hasPendingAttachments && (
            <div className="content-pending-banner">
              <Loader size={13} className="cs-spinner" />
              <span>
                Processing {pendingAttachments.total} attachment{pendingAttachments.total === 1 ? '' : 's'}
                {pendingAttachments.photos > 0 && ` - ${pendingAttachments.photos} photo${pendingAttachments.photos === 1 ? '' : 's'}`}
                {pendingAttachments.documents > 0 && ` - ${pendingAttachments.documents} document${pendingAttachments.documents === 1 ? '' : 's'}`}
                {pendingAttachments.socialUrls > 0 && ` - ${pendingAttachments.socialUrls} link${pendingAttachments.socialUrls === 1 ? '' : 's'}`}
                . You can type now  -  send unlocks when they finish.
              </span>
            </div>
          )}
          <div className="content-input-wrapper">
            <div className="content-input-top-row">
              <div className="content-ctx-anchor" ref={contentCtxRef}>
                <button className="content-ctx-trigger" onClick={() => { console.log('[Content/ctx] Add Context clicked, categories:', contentCtxCategories.map(c => `${c.id}:${c.items.length}`).join(', ')); setContentCtxMenuOpen((v) => !v); setContentHoveredCat(null); }}>
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
              <button
                className={`content-research-toggle content-plan-toggle ${planMode ? 'content-research-toggle--active content-plan-toggle--active' : ''}`}
                onClick={() => setPlanMode((v) => !v)}
                title="Plan a week or month of content in one session instead of generating individual posts"
              >
                <CalendarDays size={13} /> Plan mode
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
                placeholder={planMode
                  ? `Plan a week or month of ${activePlatform.name} content...`
                  : `Create content for ${activePlatform.name}...`}
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
                <button
                  className="content-send-btn"
                  disabled={!input.trim() || hasPendingAttachments}
                  onClick={sendMessage}
                  title={hasPendingAttachments ? `Waiting for ${pendingAttachments.total} attachment${pendingAttachments.total === 1 ? '' : 's'} to finish processing...` : undefined}
                >
                  {hasPendingAttachments ? <Loader size={18} className="cs-spinner" /> : <Send size={18} />}
                </button>
              )}
            </div>
          </div>
        </div>
        </div>
        {/* Draggable divider between chat and preview — same interaction
            as the AI CEO chat/canvas slider. */}
        {(linkedinPreview || carouselSideView || scriptView) && (
          <div
            className="content-divider"
            onMouseDown={(e) => { e.preventDefault(); setSplitDragging(true); }}
            onTouchStart={(e) => { e.preventDefault(); setSplitDragging(true); }}
          >
            <div className="content-divider-handle" />
          </div>
        )}
        {linkedinPreview && (
          <div className="content-main-preview">
            <LinkedInPreview
              content={linkedinPreview.content}
              images={linkedinPreview.images}
              userName={brandDna?.brand_name || user?.name}
              userAvatar={brandDna?.logos?.find(l => l.isDefault)?.url || brandDna?.logos?.[0]?.url || brandDna?.logo_url || brandDna?.photo_urls?.[0] || user?.avatar}
              userSubtitle={brandDna?.description?.split(/[.!?]/)[0]?.trim().slice(0, 80) || 'Author'}
              followerCount={brandDna?.linkedin_followers || '1,200'}
              postAge="1w"
              onClose={() => setLinkedinPreview(null)}
              onGenerateImage={handleLinkedinGenerateImage}
              isGeneratingImage={liGeneratingImage}
              streaming={isGenerating && activeAssistantId === linkedinPreview.msgId}
              totalSlides={linkedinPreview?.totalSlides || 0}
              onContentChange={(newText) => {
                // Commit user's text edits back to preview + the message so
                // the change survives refresh (msg.linkedinPost.content).
                setLinkedinPreview(prev => prev ? { ...prev, content: newText } : null);
              }}
              onDeleteImage={() => {
                // Clear the generated image on a text-post preview. Images
                // live in linkedinPreview.images AND on the underlying
                // message — wipe both so it doesn't return on re-save.
                setLinkedinPreview(prev => prev ? { ...prev, images: [] } : null);
                if (linkedinPreview?.msgId) {
                  setMessages(prev => prev.map(m =>
                    m.id === linkedinPreview.msgId ? { ...m, images: [] } : m
                  ));
                }
              }}
              onUploadImages={async (files) => {
                // Instant optimistic render via blob: URLs, then upload to
                // Supabase storage so the real URL lands on msg.images and
                // the image survives a page refresh. Blob URLs are in-
                // memory only — they die on reload, which is why the
                // previous implementation silently "lost" uploads.
                const msgId = linkedinPreview?.msgId;
                if (!msgId) return;
                const startIdx = (linkedinPreview?.images?.length || 0);
                const optimistic = files.map((file, i) => ({
                  src: URL.createObjectURL(file),
                  idx: startIdx + i,
                  _uploading: true,
                }));
                setLinkedinPreview(prev => prev ? {
                  ...prev,
                  images: [...(prev.images || []), ...optimistic],
                  totalSlides: optimistic.length > 1 ? (prev.images?.length || 0) + optimistic.length : prev.totalSlides,
                } : prev);
                // Upload each file sequentially — get a real Supabase URL
                // and swap it in both on the preview and the owning msg.
                for (let i = 0; i < files.length; i++) {
                  const file = files[i];
                  const idx = startIdx + i;
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
                    const url = uploaded.url || uploaded.publicUrl || null;
                    if (!url) throw new Error('upload returned no URL');
                    // Replace the blob placeholder on the preview.
                    setLinkedinPreview(prev => {
                      if (!prev) return prev;
                      const next = (prev.images || []).map(im => im.idx === idx ? { src: url, idx } : im);
                      return { ...prev, images: next };
                    });
                    // Persist onto the message so auto-save + reload see it.
                    setMessages(prev => prev.map(m => {
                      if (m.id !== msgId) return m;
                      const existing = m.images || [];
                      const without = existing.filter(im => im.idx !== idx);
                      return { ...m, images: [...without, { src: url, idx }] };
                    }));
                  } catch (err) {
                    console.error('Upload failed:', err);
                    // Clear the broken placeholder rather than leave it.
                    setLinkedinPreview(prev => prev ? {
                      ...prev,
                      images: (prev.images || []).filter(im => im.idx !== idx),
                    } : prev);
                  }
                }
              }}
              isLinkedInConnected={isLinkedInConnected}
              onPostToLinkedIn={async ({ text, images, connect, reconnect }) => {
                if (connect || reconnect) {
                  try {
                    const { url } = await getLinkedInAuthUrl();
                    if (url) { window.location.href = url; return; }
                  } catch (err) { console.error('[linkedin] auth URL fetch failed:', err.message); }
                  navigate('/settings', { state: { scrollTo: 'integrations' } });
                  return;
                }
                const orderedImgs = Array.isArray(images)
                  ? [...images].sort((a, b) => (a?.idx || 0) - (b?.idx || 0)).map((im) => im?.src).filter(Boolean)
                  : [];
                await postToLinkedIn(text, orderedImgs);
              }}
              onSchedule={async ({ text, images, date, time, platform }) => {
                const [y, m, d] = date.split('-').map(Number);
                const [hh, mm] = time.split(':').map(Number);
                const scheduledAt = new Date(y, (m || 1) - 1, d || 1, hh || 0, mm || 0, 0).toISOString();
                await schedulePost({
                  platform,
                  caption: text,
                  scheduledAt,
                  images,
                  contentType: (images?.length || 0) > 1 ? 'carousel' : (images?.length ? 'image' : 'text'),
                });
              }}
            />
          </div>
        )}
        {carouselSideView && !linkedinPreview && (() => {
          const panelMsg = messages.find(m => m.id === carouselSideView.msgId);
          if (!panelMsg) return null;
          const isLi = panelMsg.platform === 'linkedin';
          // LinkedIn carousels reuse the same LinkedInPreview component that
          // powers the text-post preview — authentic LI chrome, text-above-
          // media order, real reaction SVGs, real action bar. The carousel
          // images feed in via images + totalSlides; the caption feeds in
          // via content. Instagram carousels keep the dedicated IG-styled
          // CarouselSidePanel (profile ring, square media, IG action row).
          if (isLi) {
            const caption = panelMsg.carouselPlan?.caption || '';
            const sortedImgs = [...(panelMsg.images || [])].sort((a, b) => a.idx - b.idx);
            // Total slide count comes from the plan, not completed images —
            // so LinkedInPreview can show pending placeholders as slides
            // stream in during generation.
            const planSlideCount = panelMsg.carouselPlan?.slides?.length || sortedImgs.length;
            const displayName = brandDna?.brand_name || user?.name || 'Your Brand';
            const subtitle = brandDna?.description?.split(/[.!?]/)[0]?.trim().slice(0, 80) || 'Author';
            return (
              <div className="content-main-preview">
                <LinkedInPreview
                  content={caption}
                  images={sortedImgs}
                  userName={displayName}
                  userAvatar={brandDna?.logos?.find(l => l.isDefault)?.url || brandDna?.logos?.[0]?.url || brandDna?.logo_url || brandDna?.photo_urls?.[0]}
                  userSubtitle={subtitle}
                  followerCount={brandDna?.linkedin_followers || '1,200'}
                  postAge="1w"
                  totalSlides={planSlideCount}
                  streaming={false}
                  isGenerating={isGenerating}
                  onClose={() => setCarouselSideView(null)}
                  plan={panelMsg.carouselPlan}
                  onAddSlide={(afterIdx) => handleCarouselAddSlide(panelMsg.id, afterIdx)}
                  onRemoveSlide={(idx) => handleCarouselRemoveSlide(panelMsg.id, idx)}
                  onEditSlide={(idx, src, instruction) => executeCarouselSlideEdit(panelMsg.id, idx, instruction)}
                  onRegenerateSlide={(idx) => handleCarouselSlideRegenerate(panelMsg.id, idx)}
                  onFullscreen={(idx) => setSlideViewer({ msgId: panelMsg.id, idx })}
                  onContentChange={(nextCaption) => {
                    // Persist the edited LinkedIn carousel caption on
                    // the source message so downstream publish/schedule
                    // sees the user's version, not the AI's original.
                    setMessages(prev => prev.map(m => m.id === panelMsg.id
                      ? { ...m, carouselPlan: { ...m.carouselPlan, caption: nextCaption } }
                      : m
                    ));
                  }}
                  isLinkedInConnected={isLinkedInConnected}
                  onPostToLinkedIn={async ({ text, images: imgs, connect, reconnect }) => {
                    if (connect || reconnect) {
                      try {
                        const { url } = await getLinkedInAuthUrl();
                        if (url) { window.location.href = url; return; }
                      } catch (err) { console.error('[linkedin] auth URL fetch failed:', err.message); }
                      navigate('/settings', { state: { scrollTo: 'integrations' } });
                      return;
                    }
                    const orderedImgs = Array.isArray(imgs)
                      ? [...imgs].sort((a, b) => (a?.idx || 0) - (b?.idx || 0)).map((im) => im?.src).filter(Boolean)
                      : [];
                    await postToLinkedIn(text, orderedImgs);
                  }}
                  onSchedule={async ({ text, images: imgs, date, time, platform }) => {
                    const [y, m, d] = date.split('-').map(Number);
                    const [hh, mm] = time.split(':').map(Number);
                    const scheduledAt = new Date(y, (m || 1) - 1, d || 1, hh || 0, mm || 0, 0).toISOString();
                    await schedulePost({
                      platform,
                      caption: text,
                      scheduledAt,
                      images: imgs,
                      contentType: (imgs?.length || 0) > 1 ? 'carousel' : (imgs?.length ? 'image' : 'text'),
                    });
                  }}
                  actionsSlot={
                    <CarouselActionsBar
                      msgId={panelMsg.id}
                      plan={panelMsg.carouselPlan}
                      images={sortedImgs}
                      platform="linkedin"
                      caption={panelMsg.linkedinPost?.content || ''}
                    />
                  }
                />
              </div>
            );
          }
          return (
            <div className="content-main-preview">
              <SocialPreview
                msg={panelMsg.socialPost?.caption
                  ? { ...panelMsg, content: panelMsg.socialPost.caption }
                  : panelMsg}
                brandDna={brandDna}
                user={user}
                isGenerating={isGenerating}
                onClose={() => setCarouselSideView(null)}
                onFullscreen={(idx) => setSlideViewer({ msgId: panelMsg.id, idx })}
                onContentChange={(nextCaption) => {
                  // Persist the edited caption on the source message so
                  // subsequent renders and any downstream publish/schedule
                  // pipeline see the user's version, not the AI's original.
                  // carouselPlan.caption for carousels, socialPost.caption
                  // for text-only posts, content for plain single posts.
                  setMessages(prev => prev.map(m => {
                    if (m.id !== panelMsg.id) return m;
                    if (m.carouselPlan) {
                      return { ...m, carouselPlan: { ...m.carouselPlan, caption: nextCaption } };
                    }
                    if (m.socialPost) {
                      return { ...m, socialPost: { ...m.socialPost, caption: nextCaption } };
                    }
                    return { ...m, content: nextCaption };
                  }));
                }}
                actionsSlot={
                  <CarouselActionsBar
                    msgId={panelMsg.id}
                    plan={panelMsg.carouselPlan}
                    images={[...(panelMsg.images || [])].sort((a, b) => a.idx - b.idx)}
                    platform="instagram"
                    caption={panelMsg.socialPost?.caption || panelMsg.content || ''}
                  />
                }
                onEdit={panelMsg.carouselPlan ? (idx, src, instruction) => {
                  executeCarouselSlideEdit(panelMsg.id, idx, instruction);
                } : null}
                onRegenerate={panelMsg.carouselPlan?.slides ? (idx) => {
                  handleCarouselSlideRegenerate(panelMsg.id, idx);
                } : null}
              />
            </div>
          );
        })()}
        {/* Video-script side preview — the /Content "canvas" for reel /
            YouTube scripts (AI CEO renders the same content as a
            markdown_doc artifact). */}
        {scriptView && (() => {
          const sMsg = messages.find((m) => m.id === scriptView.msgId);
          if (!sMsg?.scriptDoc?.content) return null;
          return (
            <div className="content-main-preview">
              <ScriptPreview
                title={sMsg.scriptDoc.title}
                content={sMsg.scriptDoc.content}
                platform={sMsg.scriptDoc.platform || sMsg.platform}
                onClose={() => setScriptView(null)}
                onContentChange={(next) => {
                  // Persist user edits on the source message so they
                  // survive re-renders and session saves.
                  setMessages((prev) => prev.map((m) =>
                    m.id === sMsg.id ? { ...m, scriptDoc: { ...m.scriptDoc, content: next } } : m
                  ));
                }}
              />
            </div>
          );
        })()}
      </div>

      {/* Plan Mode canvas modal — pops when the user clicks "Open in
          canvas" on a plan-artifact card. Renders the plan HTML inside
          a sandboxed iframe (so its inline CSS never leaks into the
          host page), with a toolbar for Download / Copy / Close. */}
      {planCanvasHtml && (
        <div
          className="content-plan-canvas-overlay"
          role="dialog"
          aria-modal="true"
          onClick={() => { setPlanCanvasHtml(null); setPlanCanvasMsgId(null); }}
        >
          <div className="content-plan-canvas-modal" onClick={(e) => e.stopPropagation()}>
            <div className="content-plan-canvas-toolbar">
              <span className="content-plan-canvas-title">Content Plan</span>
              <div className="content-plan-canvas-actions">
                <button
                  type="button"
                  className="content-plan-card-btn"
                  onClick={() => {
                    const blob = new Blob([`<!doctype html><meta charset="utf-8"><title>Content Plan</title>${planCanvasHtml}`], { type: 'text/html' });
                    const url = URL.createObjectURL(blob);
                    const a = document.createElement('a');
                    a.href = url;
                    a.download = `content-plan-${new Date().toISOString().slice(0,10)}.html`;
                    document.body.appendChild(a);
                    a.click();
                    a.remove();
                    setTimeout(() => URL.revokeObjectURL(url), 2000);
                  }}
                >
                  <Download size={13} /> Download
                </button>
                <button
                  type="button"
                  className="content-plan-card-btn"
                  onClick={() => navigator.clipboard?.writeText(planCanvasHtml)}
                >
                  Copy HTML
                </button>
                <button
                  type="button"
                  className="content-plan-canvas-close"
                  onClick={() => { setPlanCanvasHtml(null); setPlanCanvasMsgId(null); }}
                  aria-label="Close"
                >
                  <X size={18} />
                </button>
              </div>
            </div>
            <iframe
              className="content-plan-canvas-iframe"
              title="Content Plan"
              srcDoc={`<!doctype html><html><head><meta charset="utf-8"><style>body{margin:0;background:#f5f5f7;}</style></head><body>${DOMPurify.sanitize(planCanvasHtml, { ADD_TAGS: ['style'], ADD_ATTR: ['style'] })}</body></html>`}
              sandbox=""
            />
          </div>
        </div>
      )}
    </div>
  );
}
