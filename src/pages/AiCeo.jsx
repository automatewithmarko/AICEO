import { useState, useRef, useEffect, useCallback, useMemo } from 'react';
import { useOutletContext, useParams, useNavigate } from 'react-router-dom';
import { Send, Mic, Square, CircleStop, PanelRightOpen, FileText, Plus, Globe, X, ChevronRight, Search, PenLine, ArrowUp, History, Pencil, Trash2, Zap, Paperclip, Loader2, AlertCircle, CalendarDays } from 'lucide-react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { generateImage, uploadImageToStorage, streamFromBackend, getTemplates, getEmails, getContentItems, getProducts, uploadContextFiles, getIntegrations } from '../lib/api';
import { buildCarouselSlidePrompt } from '../lib/carouselGen';
import { generateImageWithRetry, removeFailedImagePlaceholder } from '../lib/imageRetry';
import { getMeetings } from '../lib/meetings-api';
import { ARTIFACT_TYPES } from '../lib/artifacts';
import { snapshotArtifactOnMessage } from '../lib/artifactSnapshot';
import { supabase } from '../lib/supabase';
import { useAuth } from '../context/AuthContext';
import Paywall from '../components/Paywall';
import '../components/Paywall.css';
import ArtifactPanel from '../components/ArtifactPanel';
import ChatDropOverlay from '../components/ChatDropOverlay';
import { useChatFileDropZone } from '../hooks/useChatFileDropZone';
import './AiCeo.css';

// CEO prompt and tools are now handled server-side via /api/orchestrate

// Generate AI images for {{GENERATE:prompt}} placeholders in newsletter HTML
// Images are uploaded to Supabase storage and replaced with public URLs (not base64)
// Each image swaps in immediately when ready (true parallel, not wait-for-all)
// Returns { total, statusRef } so caller can show progress
function generateNewsletterImages(html, setArtifactFn, onProgress, platform = 'newsletter') {
  const regex = /\{\{GENERATE:([\s\S]*?)\}\}/g;
  const matches = [];
  let match;
  while ((match = regex.exec(html)) !== null) {
    matches.push({ full: match[0], prompt: match[1] });
  }
  if (matches.length === 0) return null;

  const total = matches.length;
  let completed = 0;
  let failed = 0;

  if (onProgress) onProgress({ completed: 0, failed: 0, total, done: false });

  // Fire all in parallel — generateImageWithRetry already does 5
  // attempts with backoff before throwing. If it still fails we delete
  // the entire <img> tag rather than leaving a broken red placeholder.
  const promise = Promise.all(matches.map(async (m) => {
    let imgSrc = null;
    try {
      const result = await generateImageWithRetry(m.prompt.trim(), platform, null);
      if (result?.image) {
        const uploaded = await uploadImageToStorage(result.image.data, result.image.mimeType);
        if (uploaded.url) imgSrc = uploaded.url;
      }
    } catch (err) {
      console.error('Newsletter image gen failed after retries:', err?.message);
    }

    completed++;
    if (!imgSrc) failed++;
    if (onProgress) onProgress({ completed, failed, total, done: completed === total });

    if (setArtifactFn) {
      setArtifactFn(prev => {
        if (!prev?.content) return prev;
        const updated = imgSrc
          ? prev.content.replaceAll(m.full, imgSrc)
          : removeFailedImagePlaceholder(prev.content, m.full);
        return { ...prev, content: updated };
      });
    }
  }));

  return { total, promise };
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
      result = result.slice(0, startIdx) + startMarker + '\n' + sectionHtml.trim() + '\n' + endMarker + result.slice(endIdx + endMarker.length);
    }
  }
  return result;
}

// Strip the AI-only context blocks ([CONTEXT…] / [ATTACHED IMAGES…]
// / [ATTACHED DOCUMENTS…]) from a message's saved content. Used as a
// render-time fallback for legacy user messages persisted before
// displayText was added to the schema. Each block opens with a known
// tag, contains no nested `]`, and ends with `]` followed by
// optional newlines. New messages stamp displayText directly and
// don't go through this path.
function stripCeoContextBlocks(content) {
  if (!content) return '';
  return content
    .replace(/\[(?:CONTEXT|ATTACHED IMAGES|ATTACHED DOCUMENTS)\b[^\]]*\]\s*\n*/g, '')
    .trim();
}

// ── Component ──
export default function AiCeo() {
  const { hasFeature, user } = useAuth();
  const inboxCtx = useOutletContext() || {};
  const emailAccounts = inboxCtx.accounts || [];
  const { sessionId: urlSessionId } = useParams();
  const navigate = useNavigate();

  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState('');
  const [isListening, setIsListening] = useState(false);
  const [isGenerating, setIsGenerating] = useState(false);
  const [artifact, setArtifact] = useState(null);
  // When set, the artifact panel previews this message's committed
  // snapshot (msg.artifact) instead of the live `artifact` state.
  // Cleared at the start of every new turn so streaming flows back
  // to the live panel. Lets a single chat keep multiple independent
  // artifact cards (e.g. one newsletter + one landing page) where
  // each card opens its own preview.
  const [selectedMsgId, setSelectedMsgId] = useState(null);
  const [panelOpen, setPanelOpen] = useState(false);
  const [splitPct, setSplitPct] = useState(45);
  const [dragging, setDragging] = useState(false);
  const [isMobile, setIsMobile] = useState(typeof window !== 'undefined' ? window.innerWidth <= 768 : false);
  const [mobileArtifactOpen, setMobileArtifactOpen] = useState(false);
  const [ctxMenuOpen, setCtxMenuOpen] = useState(false);
  const [hoveredCat, setHoveredCat] = useState(null);
  const [selectedCtxItems, setSelectedCtxItems] = useState(new Set());
  const [researchMode, setResearchMode] = useState(false);
  // Plan Mode — asks the CEO to produce a full weekly/monthly content plan
  // instead of individually generating posts. Handed to the backend so the
  // CEO orchestrator can suppress content-generation tools and produce a
  // schedule table.
  const [planMode, setPlanMode] = useState(false);
  const [searchStatus, setSearchStatus] = useState(null); // null | 'searching' | 'writing'
  const [currentQuestion, setCurrentQuestion] = useState(null); // { question, options }
  const [customTyping, setCustomTyping] = useState(false);
  const [customText, setCustomText] = useState('');
  const [sessionId, setSessionId] = useState(null);
  const [sessions, setSessions] = useState([]);
  const [showSessions, setShowSessions] = useState(false);
  const [renamingSessionId, setRenamingSessionId] = useState(null);
  const [renameDraft, setRenameDraft] = useState('');
  const [creditsDepleted, setCreditsDepleted] = useState(false);
  const [confirmDeleteId, setConfirmDeleteId] = useState(null);
  // Cached Brand DNA — fetched once on mount, passed to ArtifactPanel
  // so the shared SocialPreview can render the user's real brand
  // avatar + display name + username instead of the 'your_brand'
  // fallback. Same row that the inline story-image flow already loads
  // ad-hoc; lifting it to component state lets every consumer reuse
  // the result without re-querying.
  const [brandDna, setBrandDna] = useState(null);
  // Track LinkedIn connection so the ArtifactPanel → LinkedInPreview shows
  // "Post to LinkedIn" instead of the fallback "Connect LinkedIn" button
  // (which was the AICEO canvas's silent failure — the post button was
  // never rendered because the prop was undefined).
  const [isLinkedInConnected, setIsLinkedInConnected] = useState(false);
  useEffect(() => {
    getIntegrations().then(({ integrations }) => {
      setIsLinkedInConnected((integrations || []).some(i => i.provider === 'linkedin' && i.is_active));
    }).catch(() => {});
  }, []);
  // Files attached to the next outbound message. Same shape Marketing
  // uses so the two pages can converge on a shared helper later.
  // Images keep a data URL for preview; documents keep their text
  // content so the AI orchestrator can reference it inline.
  const [attachedFiles, setAttachedFiles] = useState([]);
  const fileInputRef = useRef(null);
  // Snapshot of attachedFiles for the CURRENT turn. Captured on send
  // (because attachedFiles state is cleared immediately after) so that
  // the streaming onToolCall handler — which fires later in the
  // pipeline — can still inject the user's images as reference for
  // any generate_image tool call the orchestrator emits.
  const currentTurnAttachmentsRef = useRef([]);
  // Track sessions whose title the user manually edited so the autosave
  // doesn't keep clobbering it with the derived "first user message" title.
  const customTitleIdsRef = useRef(new Set());
  // Mirror of `sessions` so the debounced autosave can look up the current
  // custom title without adding `sessions` to its dep array (which would
  // cancel the pending save every time the list changes).
  const sessionsRef = useRef([]);

  const messagesEndRef = useRef(null);
  const saveTimer = useRef(null);
  const messagesContainerRef = useRef(null);
  const inputRef = useRef(null);
  const recognitionRef = useRef(null);
  const abortRef = useRef(null);
  const askUserFiredRef = useRef(false);
  const pendingImagesRef = useRef([]);
  const splitRef = useRef(null);
  const isMobileRef = useRef(isMobile);
  const ctxMenuRef = useRef(null);
  const artifactRef = useRef(null);
  // Kept in sync with the `sessionId` state so sendToAI's useCallback (which
  // intentionally isn't recreated on every sessionId change) always reads
  // the current value when it fires a backend request.
  const sessionIdRef = useRef(null);
  useEffect(() => { sessionIdRef.current = sessionId; }, [sessionId]);
  // Mirror of selectedMsgId. sendToAI's useCallback isn't recreated on
  // selection changes (deps = [researchMode]), so without a ref the
  // fork-from-snapshot check inside it would read a stale value.
  const selectedMsgIdRef = useRef(null);
  useEffect(() => { selectedMsgIdRef.current = selectedMsgId; }, [selectedMsgId]);
  useEffect(() => { sessionsRef.current = sessions; }, [sessions]);

  // Fetch Brand DNA once on mount so SocialPreview (rendered inside
  // ArtifactPanel for content_post artifacts) can show the user's real
  // brand identity. Fire-and-forget — preview falls back gracefully
  // to 'your_brand' placeholder while in flight or if absent.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const { data: { session } } = await supabase.auth.getSession();
        if (!session?.user) return;
        const { data } = await supabase
          .from('brand_dna')
          .select('*')
          .eq('user_id', session.user.id)
          .order('updated_at', { ascending: true })
          .limit(1);
        if (!cancelled && data?.[0]) setBrandDna(data[0]);
      } catch (err) {
        console.error('[AiCeo] Brand DNA load failed:', err.message);
      }
    })();
    return () => { cancelled = true; };
  }, []);

  const hasMessages = messages.length > 0;

  // Resolved artifact for the panel: a clicked-card's frozen snapshot when
  // selectedMsgId is set, otherwise the live streaming `artifact` state.
  // Falls back to live if a card was clicked but its snapshot is missing
  // (legacy session loaded from a pre-snapshot DB row).
  const displayedArtifact = useMemo(() => {
    if (selectedMsgId) {
      const m = messages.find(x => x.id === selectedMsgId);
      if (m?.artifact) {
        console.log(`[panel] showing msg snapshot ${selectedMsgId} type=${m.artifact.type} title="${m.artifact.title}"`);
        return m.artifact;
      }
      console.warn(`[panel] msg ${selectedMsgId} has no .artifact → falling back to live`, { msgExists: !!m, hasArtifactFlag: !!m?.hasArtifact });
    }
    return artifact;
  }, [selectedMsgId, messages, artifact]);

  const showPanel = panelOpen && displayedArtifact && !isMobile;

  const starters = [
    'Draft an email to follow up with my leads about my top product.',
    'Create a newsletter announcing my latest offer to my audience.',
    'Write a LinkedIn post highlighting my business growth.',
    'Build a strategy to increase my conversion rate this month.',
  ];

  const [ceoContextCategories, setCeoContextCategories] = useState([
    { id: 'newsletters', label: 'Past Newsletters', iconSrc: '/icon-marketing.png', items: [] },
    { id: 'emails', label: 'Past Emails', iconSrc: '/icon-inbox.png', items: [] },
    { id: 'meetings', label: 'Meetings', iconSrc: '/icon-call-recording.png', items: [] },
    { id: 'content', label: 'Content', iconSrc: '/icon-create-content.png', items: [] },
    { id: 'products', label: 'Products', iconSrc: '/icon-products.png', items: [] },
  ]);

  // Fetch real context data from APIs
  useEffect(() => {
    let cancelled = false;
    const fmt = (d) => { try { return new Date(d).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }); } catch { return ''; } };
    Promise.all([
      getTemplates('newsletter').catch(() => ({ templates: [] })),
      getEmails({ limit: 20 }).catch(() => ({ emails: [] })),
      getMeetings({ limit: 20 }).catch(() => ({ meetings: [] })),
      getContentItems().catch(() => ({ items: [] })),
      getProducts().catch(() => ({ products: [] })),
    ]).then(([nlRes, emRes, mtRes, ctRes, prRes]) => {
      if (cancelled) return;
      setCeoContextCategories([
        {
          id: 'newsletters', label: 'Past Newsletters', iconSrc: '/icon-marketing.png',
          items: (nlRes.templates || []).map((t) => ({ id: `nl-${t.id}`, name: t.name || t.description || 'Untitled', date: fmt(t.created_at) })),
        },
        {
          id: 'emails', label: 'Past Emails', iconSrc: '/icon-inbox.png',
          items: (emRes.emails || []).map((e) => ({ id: `em-${e.id}`, name: e.subject || '(no subject)', date: fmt(e.date), sub: e.from_name || e.from_email || '' })),
        },
        {
          id: 'meetings', label: 'Meetings', iconSrc: '/icon-call-recording.png',
          items: (mtRes.meetings || []).map((m) => ({ id: `mt-${m.id}`, name: m.title || m.name || 'Untitled Meeting', date: fmt(m.started_at || m.created_at), sub: m.platform || '' })),
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

  const toggleCtxItem = (id) => {
    setSelectedCtxItems((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  };

  const getSelectedCtxDetails = () => {
    const all = [];
    for (const cat of ceoContextCategories) {
      for (const item of cat.items) {
        if (selectedCtxItems.has(item.id)) all.push({ ...item, catLabel: cat.label });
      }
    }
    return all;
  };

  // Build context string to inject into messages for the AI
  const buildCeoContextString = () => {
    const items = getSelectedCtxDetails();
    const parts = [];
    if (items.length > 0) {
      const lines = items.map((i) => `${i.catLabel}: "${i.name}"${i.sub ? ` (${i.sub})` : ''}${i.date ? `  -  ${i.date}` : ''}`);
      parts.push(`[CONTEXT  -  The user has selected the following items for reference:\n${lines.join('\n')}\nPrioritize this context when responding. Use it to inform your suggestions, decisions, and any generated content.]`);
    }
    // Only fold READY attachments into the context. In-flight uploads
    // (status='uploading') are blocked at sendMessage so the AI never
    // sees them; errored uploads are also skipped.
    const ready = attachedFiles.filter((f) => f.status === 'done');
    if (ready.length > 0) {
      const images = ready.filter((f) => f.type === 'image');
      const docs = ready.filter((f) => f.type === 'document');
      if (images.length > 0) {
        // Tell the orchestrator (a) the images exist by name, and (b)
        // that calling generate_image will AUTOMATICALLY attach these
        // pixels as visual reference. The frontend's onToolCall
        // handler injects them at call time, so the AI doesn't need to
        // pass URLs or worry about the wire format — it just calls
        // generate_image with an edit instruction.
        parts.push(
          `[ATTACHED IMAGES  -  The user attached ${images.length} image(s):\n` +
          images.map((i) => `- "${i.name}"`).join('\n') +
          `\n\nIf the user asks you to edit, modify, build on, or add anything to these image(s) (e.g. "add a CTA button labeled X", "make the background brighter", "add my logo top-right", "change the headline to Y"), call generate_image with a prompt describing the desired change. The system automatically attaches these image(s) to the call as visual reference — you do NOT need to pass URLs or describe the existing image content; just describe the EDIT.]`
        );
      }
      if (docs.length > 0) {
        // textContent here is the backend-extracted text from
        // pdf-parse / mammoth (NOT the raw file bytes). This is the
        // fix for the "PDF arrives as gibberish" bug — client-side
        // readAsText on a PDF blob produced binary noise.
        parts.push(`[ATTACHED DOCUMENTS  -  The user attached ${docs.length} document(s). Use the extracted text where relevant:\n${docs.map((d) => `- "${d.name}":\n${(d.textContent || '').slice(0, 5000)}`).join('\n\n')}\n]`);
      }
    }
    if (parts.length === 0) return '';
    return parts.join('\n\n') + '\n\n';
  };

  // Reserve a pill immediately for each picked / dropped file and
  // upload them in parallel via /api/upload — the same backend path
  // Content uses, with proper PDF text extraction (pdf-parse) and
  // Supabase storage for images. Client-side FileReader was wrong:
  // readAsText on a PDF returns binary garbage, and we never sent the
  // image bytes anywhere so the AI only ever saw a filename.
  //
  // Each pill goes through statuses: 'uploading' → 'done' / 'error'.
  // Images additionally show a local thumbnail (read via FileReader
  // off the original File for instant preview) while the network
  // upload runs in parallel — both arrive at status='done'.
  const ingestFiles = useCallback(async (fileLike) => {
    const files = Array.from(fileLike || []);
    if (files.length === 0) return;

    const reservations = files.map((file) => ({
      id: `file-${Date.now()}-${Math.random().toString(36).slice(2)}`,
      file,
      name: file.name,
      size: file.size,
      type: file.type.startsWith('image/') ? 'image' : 'document',
      status: 'uploading',
    }));

    // Push pills first (drop the File ref so it doesn't sit in state).
    // eslint-disable-next-line no-unused-vars
    setAttachedFiles((prev) => [...prev, ...reservations.map(({ file: _file, ...rest }) => rest)]);

    // Local thumbnail preview for images — runs in parallel with the
    // actual backend upload so the user sees the pill immediately.
    for (const res of reservations) {
      if (res.type !== 'image') continue;
      const reader = new FileReader();
      reader.onload = (ev) => {
        setAttachedFiles((prev) => prev.map((f) =>
          f.id === res.id ? { ...f, dataUrl: ev.target?.result || null } : f,
        ));
      };
      reader.readAsDataURL(res.file);
    }

    try {
      const { files: results } = await uploadContextFiles(reservations.map((r) => r.file));
      setAttachedFiles((prev) => prev.map((item) => {
        const ridx = reservations.findIndex((r) => r.id === item.id);
        if (ridx === -1) return item;
        const result = results?.[ridx];
        if (!result || result.type === 'error') {
          return {
            ...item,
            status: 'error',
            errorMessage: result?.error || 'Upload failed',
          };
        }
        // Backend types: 'photo' (image) | 'video' | 'document'
        const isImage = result.type === 'photo';
        return {
          ...item,
          status: 'done',
          type: isImage ? 'image' : 'document',
          url: result.url || null,
          dbId: result.dbId || null,
          // Backend pre-extracts text via pdf-parse / mammoth /
          // plain-text reader — this is what the AI actually sees.
          textContent: result.extractedText || null,
          ...(result.transcript ? { transcript: result.transcript } : {}),
        };
      }));
    } catch (err) {
      setAttachedFiles((prev) => prev.map((item) =>
        reservations.some((r) => r.id === item.id)
          ? { ...item, status: 'error', errorMessage: err.message || 'Upload failed' }
          : item,
      ));
    }
  }, []);

  // True while at least one attachment is still being uploaded.
  // Used to disable Send so the message can't go out before the AI
  // gets the actual file contents.
  const hasPendingUploads = attachedFiles.some((f) => f.status === 'uploading');

  const removeAttachedFile = useCallback((id) => {
    setAttachedFiles((prev) => prev.filter((f) => f.id !== id));
  }, []);

  const handleFileInputChange = (e) => {
    ingestFiles(e.target.files);
    e.target.value = '';
  };

  // Window-level drag-and-drop. Drop a file anywhere on the AI CEO
  // page to attach it to the next message — same as Marketing /
  // Content. The Paperclip button is just a manual fallback.
  const { dragging: filesDragging } = useChatFileDropZone({
    onFiles: ingestFiles,
  });

  // Click outside context menu
  useEffect(() => {
    if (!ctxMenuOpen) return;
    const handleClickOutside = (e) => {
      if (ctxMenuRef.current && !ctxMenuRef.current.contains(e.target)) {
        setCtxMenuOpen(false);
        setHoveredCat(null);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [ctxMenuOpen]);

  // ── Keep artifact ref in sync ──
  useEffect(() => {
    artifactRef.current = artifact;
  }, [artifact]);

  // Commit the current live artifact as a frozen snapshot onto the message
  // that produced it. Once committed, that message's chat card opens THIS
  // snapshot independently of whatever future generations replace the live
  // `artifact` slot with. Skips for type='image' on purpose: multi-image
  // generations all share the cumulative live gallery (legacy behavior the
  // user explicitly wants preserved). Uploads any base64 image payloads
  // first so the snapshot persists cleanly into the messages JSONB row
  // without bloating the page-reload size.
  const commitOwnedArtifact = useCallback(async (msgId, artOverride = null) => {
    if (!msgId) {
      console.log('[snapshot] skip — no msgId');
      return;
    }
    let art;
    if (artOverride) {
      art = artOverride;
    } else {
      // Capture the latest committed artifact state via a functional setState
      // pass-through. artifactRef.current is updated by a useEffect that
      // only fires AFTER React commits a render, so it lags behind any
      // image-URL setArtifact calls queued by generateNewsletterImages.
      // Reading the ref directly would snapshot the pre-swap HTML (with
      // {{GENERATE:...}} placeholders) and the card preview would render
      // shimmer "Generating" boxes instead of the actual images. React
      // processes setState callbacks in queue order, so our pass-through
      // sees the latest reduced state (post-images, post-title).
      art = await new Promise(resolve => {
        setArtifact(prev => {
          resolve(prev);
          return prev;
        });
      });
    }
    if (!art) {
      console.log(`[snapshot] skip — no art for ${msgId}`);
      return;
    }
    if (art.type === 'image') {
      // Multi-image generations all share the cumulative live gallery
      // (legacy behavior preserved on purpose).
      console.log(`[snapshot] skip — type=image for ${msgId} (cumulative gallery)`);
      return;
    }
    const hasPlaceholders = !!art.content?.includes('{{GENERATE:');
    console.log(`[snapshot] start ${msgId} type=${art.type} title="${art.title}" contentLen=${art.content?.length || 0} hasPlaceholders=${hasPlaceholders}`);
    await snapshotArtifactOnMessage({ msgId, art, setMessages, label: 'snapshot' });
  }, []);

  // ── Responsive ──
  useEffect(() => {
    isMobileRef.current = isMobile;
  }, [isMobile]);

  useEffect(() => {
    const handleResize = () => setIsMobile(window.innerWidth <= 768);
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  // Context is now loaded server-side by the orchestrator

  // ── Auto-scroll  -  only when user sends a message or generation starts ──
  const shouldScrollRef = useRef(false);

  useEffect(() => {
    if (shouldScrollRef.current) {
      const container = messagesContainerRef.current;
      if (container) {
        container.scrollTo({ top: container.scrollHeight, behavior: 'smooth' });
      }
      shouldScrollRef.current = false;
    }
  }, [messages]);

  // ── Draggable Divider ──
  useEffect(() => {
    if (!dragging) return;
    const handleMove = (e) => {
      const container = splitRef.current;
      if (!container) return;
      const rect = container.getBoundingClientRect();
      const x = (e.clientX ?? e.touches?.[0]?.clientX) - rect.left;
      const pct = (x / rect.width) * 100;
      setSplitPct(Math.max(25, Math.min(75, pct)));
    };
    const handleUp = () => setDragging(false);
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
  }, [dragging]);

  // ── Session persistence ──
  useEffect(() => {
    supabase.auth.getSession().then(async ({ data: { session } }) => {
      if (!session?.user) return;
      const { data } = await supabase
        .from('ceo_sessions')
        .select('id, title, updated_at')
        .eq('user_id', session.user.id)
        .order('updated_at', { ascending: false })
        .limit(50);
      if (data) setSessions(data);
    });
  }, []);

  // Debounced auto-save
  useEffect(() => {
    if (messages.length === 0) return;
    if (saveTimer.current) clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(async () => {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session?.user) return;
      const userId = session.user.id;

      const stripped = messages.map((m) => ({
        id: m.id, role: m.role, content: m.content,
        // Persist the user-facing display fields so a hard refresh
        // doesn't fall back to rendering the raw [ATTACHED IMAGES…]
        // context block in the bubble. Both fields are optional —
        // assistant messages and legacy user messages won't have them.
        ...(m.displayText ? { displayText: m.displayText } : {}),
        // Strip dataUrl before persisting. dataUrl is the full base64
        // payload from FileReader (1–5 MB per image) — saving it to
        // the JSONB row blows past Supabase's REST payload limit and
        // the entire upsert is silently rejected. The Supabase storage
        // `url` is enough for the bubble's <img>; we only need dataUrl
        // for the brief pre-upload preview window in fresh state.
        ...(m.attachments?.length ? {
          attachments: m.attachments.map((a) => ({
            id: a.id,
            type: a.type,
            name: a.name,
            url: a.url || null,
          })),
        } : {}),
        ...(m.hasArtifact ? { hasArtifact: true, artifactTitle: m.artifactTitle, artifactType: m.artifactType } : {}),
        // Per-message artifact snapshot. Already base64-stripped at
        // commitOwnedArtifact time, so this is just URL-and-text payload.
        // Lets each chat card open its own frozen preview after reload.
        ...(m.artifact ? { artifact: m.artifact } : {}),
      }));

      // Prepare artifact for storage - upload base64 images
      let artifactData = null;
      if (artifact) {
        let savedContent = artifact.content || '';
        // Upload inline base64 images in HTML to storage
        const b64re = /src="(data:image\/[^;]+;base64,[^"]+)"/g;
        for (const match of [...savedContent.matchAll(b64re)]) {
          try {
            const dataUri = match[1];
            const commaIdx = dataUri.indexOf(',');
            const mimeMatch = dataUri.match(/^data:([^;]+);/);
            const result = await uploadImageToStorage(dataUri.slice(commaIdx + 1), mimeMatch?.[1] || 'image/png');
            if (result.url) savedContent = savedContent.replaceAll(dataUri, result.url);
          } catch {}
        }
        // Upload images array
        const uploadedImages = await Promise.all((artifact.images || []).map(async (img) => {
          if (img.src?.startsWith('data:')) {
            try {
              const commaIdx = img.src.indexOf(',');
              const mimeMatch = img.src.match(/^data:([^;]+);/);
              const result = await uploadImageToStorage(img.src.slice(commaIdx + 1), mimeMatch?.[1] || 'image/png');
              return { ...img, src: result.url || img.src };
            } catch { return img; }
          }
          return img;
        }));
        // Upload story frames
        let savedFrames = artifact.frames ? await Promise.all(artifact.frames.map(async (f) => {
          if (f.imageSrc?.startsWith('data:')) {
            try {
              const commaIdx = f.imageSrc.indexOf(',');
              const mimeMatch = f.imageSrc.match(/^data:([^;]+);/);
              const result = await uploadImageToStorage(f.imageSrc.slice(commaIdx + 1), mimeMatch?.[1] || 'image/png');
              return { ...f, imageSrc: result.url || f.imageSrc };
            } catch { return f; }
          }
          return f;
        })) : null;

        // Update local state with uploaded URLs
        if (savedContent !== artifact.content || uploadedImages.some((img, i) => img.src !== artifact.images?.[i]?.src)) {
          setArtifact((prev) => prev ? { ...prev, content: savedContent, images: uploadedImages, ...(savedFrames ? { frames: savedFrames } : {}) } : prev);
        }

        artifactData = {
          id: artifact.id, type: artifact.type, title: artifact.title,
          content: savedContent, images: uploadedImages,
          agentSource: artifact.agentSource || null,
          ...(savedFrames ? { frames: savedFrames } : {}),
        };
      }

      const firstUser = messages.find((m) => m.role === 'user');
      const derivedTitle = firstUser?.content?.replace(/\[CONTEXT[^\]]*\]\n?/g, '').slice(0, 80) || 'New conversation';

      if (!sessionId) return; // nothing to save against yet

      // If the user manually renamed this session, preserve their title
      // across autosaves instead of reverting it to the first-user-message.
      const isCustom = customTitleIdsRef.current.has(sessionId);
      const existing = sessionsRef.current.find((s) => s.id === sessionId);
      const title = isCustom ? (existing?.title || derivedTitle) : derivedTitle;

      // Upsert — client owns the uuid now so the URL is stable from the very
      // first message and can be bookmarked before the server ever sees it.
      const { error: upsertErr } = await supabase.from('ceo_sessions').upsert({
        id: sessionId,
        user_id: userId,
        title,
        messages: stripped,
        artifact: artifactData,
        updated_at: new Date().toISOString(),
      }, { onConflict: 'id' });

      if (upsertErr) {
        // Surface autosave failures instead of silently dropping them
        // — silent failures are how we ended up with messages whose
        // attachments field got rejected at the REST layer (row too
        // big from base64 dataUrls) without anyone noticing for days.
        console.error('[AiCeo] ceo_sessions autosave FAILED', {
          code: upsertErr.code,
          message: upsertErr.message,
          details: upsertErr.details,
          hint: upsertErr.hint,
        });
      } else {
        setSessions((prev) => {
          const idx = prev.findIndex((s) => s.id === sessionId);
          if (idx === -1) {
            return [{ id: sessionId, title, updated_at: new Date().toISOString() }, ...prev];
          }
          const next = [...prev];
          next[idx] = { ...next[idx], title, updated_at: new Date().toISOString() };
          return next;
        });
      }
    }, 2000);
    return () => { if (saveTimer.current) clearTimeout(saveTimer.current); };
  }, [messages, sessionId, artifact]);

  const loadSession = useCallback(async (id, { navigateToUrl = true } = {}) => {
    const { data, error } = await supabase
      .from('ceo_sessions')
      .select('id, title, messages, artifact')
      .eq('id', id)
      .single();
    if (error || !data) {
      // Session doesn't exist (e.g. URL to a deleted session) — treat as a
      // fresh conversation with this id so the user lands somewhere sane.
      setSessionId(id);
      setMessages([]);
      setArtifact(null);
      setSelectedMsgId(null);
      setPanelOpen(false);
      setCurrentQuestion(null);
      return;
    }
    // Detect manual rename on load. customTitleIdsRef is in-memory so it
    // resets on page refresh; without this, the debounced autosave would
    // fire ~2s after load and clobber the stored title with the derived
    // first-user-message title. If the stored title doesn't match what
    // we'd derive, it was manually renamed — mark it custom so autosave
    // preserves it.
    let loadedMessages = data.messages || [];
    const firstUser = loadedMessages.find((m) => m.role === 'user');
    const derivedTitle = firstUser?.content?.replace(/\[CONTEXT[^\]]*\]\n?/g, '').slice(0, 80) || 'New conversation';
    if (data.title && data.title !== derivedTitle) {
      customTitleIdsRef.current.add(data.id);
    }
    setSessionId(data.id);
    setSelectedMsgId(null);
    // Backfill the most-recent hasArtifact message with the legacy
    // session-level `artifact` row when no per-message snapshots exist.
    // This keeps pre-fix sessions previewable: the latest card opens the
    // saved artifact, earlier cards fall through to the live state (same
    // as their behavior before the fix). New sessions written post-fix
    // already carry per-message snapshots and skip this branch.
    if (data.artifact && !loadedMessages.some((m) => m.artifact)) {
      let lastIdx = -1;
      for (let i = loadedMessages.length - 1; i >= 0; i--) {
        if (loadedMessages[i].hasArtifact) { lastIdx = i; break; }
      }
      if (lastIdx >= 0) {
        loadedMessages = loadedMessages.map((m, i) =>
          i === lastIdx ? { ...m, artifact: data.artifact } : m
        );
      }
    }
    setMessages(loadedMessages);
    setCurrentQuestion(null);
    if (data.artifact) {
      setArtifact(data.artifact);
      setPanelOpen(true);
      if (isMobile) setMobileArtifactOpen(true);
    } else {
      setArtifact(null);
      setPanelOpen(false);
    }
    setShowSessions(false);
    if (navigateToUrl) navigate(`/ai-ceo/${data.id}`, { replace: true });
  }, [isMobile, navigate]);

  const newConversation = useCallback(() => {
    // Generate the session uuid up front so the URL and any backend calls
    // (including the new version-history writes) all agree from turn zero.
    const newId = (typeof crypto !== 'undefined' && crypto.randomUUID)
      ? crypto.randomUUID()
      : `ceo-${Date.now()}-${Math.random().toString(36).slice(2)}`;
    setSessionId(newId);
    setMessages([]);
    setArtifact(null);
    setSelectedMsgId(null);
    setPanelOpen(false);
    setMobileArtifactOpen(false);
    setCurrentQuestion(null);
    setShowSessions(false);
    navigate(`/ai-ceo/${newId}`, { replace: true });
  }, [navigate]);

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
    await supabase.from('ceo_sessions').update({ title: next }).eq('id', id);
  }, [renamingSessionId, renameDraft, sessions, cancelRenameSession]);

  const requestDeleteSession = useCallback((id, e) => {
    e?.stopPropagation?.();
    setConfirmDeleteId(id);
  }, []);

  const confirmDeleteSession = useCallback(async () => {
    const id = confirmDeleteId;
    if (!id) return;
    setConfirmDeleteId(null);
    await supabase.from('ceo_sessions').delete().eq('id', id);
    setSessions((prev) => prev.filter((s) => s.id !== id));
    if (sessionId === id) newConversation();
  }, [confirmDeleteId, sessionId, newConversation]);

  // Sync URL -> session state. When the route's :sessionId changes (direct
  // URL, back/forward, refresh), load that session; when missing, mint a
  // fresh uuid so the new conversation has a stable URL from the start.
  useEffect(() => {
    if (urlSessionId) {
      if (urlSessionId !== sessionId) {
        loadSession(urlSessionId, { navigateToUrl: false });
      }
    } else if (!sessionId) {
      // No URL param and no in-memory session — mint one.
      newConversation();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [urlSessionId]);

  // ── Send to AI (via backend orchestrator) ──
  const sendToAI = useCallback(async (chatHistory) => {
    setIsGenerating(true);
    // If the user was previewing a past message's snapshot when they
    // sent, FORK from that snapshot: the new turn's edit base is the
    // snapshot's HTML rather than the live artifact, so the result
    // becomes a new branched version at the bottom while the older
    // snapshots stay intact. We hoist the snapshot onto the live
    // artifact + clear the selection so the panel transitions smoothly
    // (it was showing the snapshot, live is now the same content, and
    // streaming will mutate it in place).
    const forkFromSnapshot = (() => {
      const sel = selectedMsgIdRef.current;
      if (!sel) return null;
      // chatHistory is the fresh post-userMsg array the caller just
      // setMessages()'d — so its snapshots are current. The closure's
      // `messages` would be stale.
      const m = chatHistory.find((x) => x.id === sel);
      return m?.artifact?.content ? m.artifact : null;
    })();
    if (forkFromSnapshot) {
      setArtifact(forkFromSnapshot);
      artifactRef.current = forkFromSnapshot;
    }
    // Drop any old-card preview so the panel follows the live streaming
    // artifact for this turn. Old cards' frozen snapshots remain intact;
    // user can click them again after the turn settles.
    setSelectedMsgId(null);
    const assistantMsgId = `msg-${Date.now()}-ai`;
    // When Plan Mode is on, seed the assistant bubble with a rich
    // "planWorking" status so the user immediately sees the AI is
    // building the plan. Regular chats get the default 'Thinking...'
    // triggered by the backend's status SSE event. The planWorking
    // flag is cleared once real content, a question, or an artifact
    // lands on the message.
    setMessages(prev => [...prev, {
      id: assistantMsgId,
      role: 'assistant',
      content: '',
      hasArtifact: false,
      ...(planMode ? { planWorking: true, status: 'Building your plan' } : {}),
    }]);

    // TEMP DEBUG — track which tools actually fired this turn so we can
    // detect when the orchestrator wrote text claiming an image but never
    // emitted a generate_image tool call (the silent-image bug).
    const firedTools = [];
    const turnStart = Date.now();
    console.log(`[AiCeo] ▶ turn start — msgId=${assistantMsgId}`);

    try {
      const abort = new AbortController();
      abortRef.current = abort;

      // Defense-in-depth: strip embedded HTML artifact bodies from
      // prior turn message content before sending. In normal flow the
      // chat message `content` doesn't carry HTML — artifacts live in
      // the separate `messages[i].artifact` snapshot field — so this
      // is mostly a no-op. It only kicks in if the user pasted raw
      // HTML into the textarea or some future code path embeds HTML
      // in content. The real defense against context-overload is the
      // 1M-context opt-in + auto-retry in base-agent.js streamAnthropic.
      //
      // Heuristic: only triggers when content is >2K chars AND has
      // both a starting tag and a closing </html>/</body>.
      const stripEmbeddedHtml = (content) => {
        if (typeof content !== 'string' || content.length < 2000) return content;
        const hasFullDoc = /<!DOCTYPE\s+html/i.test(content) || /<html[\s>]/i.test(content);
        const hasClose = /<\/html>|<\/body>/i.test(content);
        if (!hasFullDoc || !hasClose) return content;
        // Replace each full HTML block with a one-line marker.
        return content.replace(
          /(?:<!DOCTYPE[\s\S]*?<\/html>|<html[\s\S]*?<\/html>|<body[\s\S]*?<\/body>)/gi,
          '[embedded HTML artifact from earlier in the conversation — omitted to save context; the current artifact is provided separately]'
        );
      };
      const apiMessages = chatHistory.map((m, idx) => {
        // Only strip from PRIOR turns; keep the latest user message
        // intact in case they're pasting a fresh artifact this turn.
        const isLatest = idx === chatHistory.length - 1;
        const msg = {
          role: m.role,
          content: isLatest ? m.content : stripEmbeddedHtml(m.content),
        };
        if (m.wasAskUser) { msg.wasAskUser = true; msg.askUserOptions = m.askUserOptions; }
        return msg;
      });

      // Pass current artifact HTML for editing support
      const currentArtifact = artifactRef.current;
      const hasHtmlArtifact = currentArtifact?.content && (currentArtifact.type === 'newsletter' || currentArtifact.type === 'html_template');
      // For content_post (social posts created via create_artifact) we
      // pass the current text + platform so the CEO knows there's a
      // post on screen and can re-emit create_artifact with edits
      // instead of just chatting. Without this the AI has zero
      // awareness of the panel's current state.
      const hasContentPostArtifact = currentArtifact?.content && currentArtifact.type === 'content_post';

      await streamFromBackend('/api/orchestrate', {
        messages: apiMessages,
        mode: 'ceo',
        searchMode: researchMode,
        planMode,
        sessionId: sessionIdRef.current || null,
        assistantMsgId,
        ...(hasHtmlArtifact ? {
          currentHtml: currentArtifact.content,
          currentAgent: currentArtifact.agentSource || 'newsletter',
          currentTitle: currentArtifact.title || '',
        } : {}),
        ...(hasContentPostArtifact ? {
          currentContentPost: {
            content: currentArtifact.content,
            platform: currentArtifact.agentSource || 'instagram',
            title: currentArtifact.title || '',
          },
        } : {}),
      }, {
        // CEO text streaming
        onTextDelta: (content) => {
          if (content && content.includes('?')) console.log('[AiCeo] text_delta contains question mark:', content.slice(-100));
          setMessages(prev => prev.map(m =>
            m.id === assistantMsgId ? { ...m, content } : m
          ));
        },
        // Status updates (e.g., "Delegating to newsletter agent...")
        onStatus: (text) => {
          setMessages(prev => prev.map(m =>
            m.id === assistantMsgId ? { ...m, status: text } : m
          ));
        },
        // Agent started delegation
        onAgentStart: (agentName) => {
          setMessages(prev => prev.map(m =>
            m.id === assistantMsgId ? { ...m, status: `Running ${agentName} agent...` } : m
          ));
          // Open panel immediately with a loading placeholder so user doesn't see a blank screen
          const isVisualAgent = ['landing-page', 'landing', 'squeeze-page', 'squeeze', 'newsletter'].includes(agentName);
          if (isVisualAgent) {
            const label = agentName === 'newsletter' ? 'Newsletter' : agentName.includes('squeeze') ? 'Squeeze Page' : 'Landing Page';
            setArtifact({
              id: Date.now(),
              type: agentName === 'newsletter' ? 'newsletter' : 'html_template',
              title: `Crafting your ${label}...`,
              content: '',
              loading: true,
              agentSource: agentName,
            });
            setPanelOpen(true);
            if (isMobileRef.current) setMobileArtifactOpen(true);
          }
        },
        // Agent streaming chunks (show in artifact panel)
        onAgentChunk: (agentName, content) => {
          // Try to extract HTML from the agent's streaming response for live preview
          const htmlMatch = content.match(/"html"\s*:\s*"([\s\S]*?)(?:"\s*[,}]|$)/);
          if (htmlMatch) {
            let html = htmlMatch[1];
            try { html = JSON.parse('"' + html + '"'); } catch {
              html = html.replace(/\\n/g, '\n').replace(/\\t/g, '\t').replace(/\\"/g, '"').replace(/\\\\/g, '\\');
            }
            // Sanity-gate the streaming preview: the lazy regex above
            // can occasionally truncate mid-HTML at a CSS or JS '}'
            // boundary, producing garbage that renders as visible
            // code-lines in the iframe instead of UI. Only accept
            // chunks that actually look like HTML (start with '<'
            // and contain a real document/element marker). Drops the
            // false-positive cases without affecting the happy path.
            const trimmed = html.trim();
            const looksLikeHtml = trimmed.startsWith('<') && /<(!doctype|html|body|head|div|section|main|header|nav)/i.test(trimmed.slice(0, 200));
            if (html.length > 50 && looksLikeHtml) {
              const isNewsletter = agentName === 'newsletter' || content.includes('"type":"newsletter"') || content.includes('"type": "newsletter"');
              const streamTitle = isNewsletter ? 'Crafting your Newsletter...' : `Crafting your ${agentName === 'landing' ? 'Landing Page' : agentName === 'squeeze' ? 'Squeeze Page' : 'content'}...`;
              setArtifact(prev => ({
                id: prev?.id || Date.now(),
                type: isNewsletter ? 'newsletter' : 'html_template',
                title: streamTitle,
                content: html,
                images: prev?.images || [],
                agentSource: agentName,
              }));
              setPanelOpen(true);
              if (isMobileRef.current) setMobileArtifactOpen(true);
              setMessages(prev => prev.map(m =>
                m.id === assistantMsgId ? { ...m, hasArtifact: true, artifactTitle: streamTitle, artifactType: 'html_template' } : m
              ));
            }
          }
        },
        // Agent finished  -  parse final result
        onAgentResult: (agentName, content) => {
          try {
            // Fix broken JSON caused by raw newlines inside string values
            const fixNl = (s) => s.replace(/("(?:[^"\\]|\\.)*")|[\n\r\t]/g, (m, q) => q ? q : m === '\n' ? '\\n' : m === '\r' ? '\\r' : m === '\t' ? '\\t' : m);
            // Try direct parse, then fix newlines, then strip fences, then extract JSON
            let parsed;
            try { parsed = JSON.parse(content); } catch {
              try { parsed = JSON.parse(fixNl(content)); } catch {
                let cleaned = content.trim();
                if (cleaned.startsWith('```')) cleaned = cleaned.replace(/^```(?:json)?\s*/, '').replace(/\s*```$/, '');
                try { parsed = JSON.parse(cleaned); } catch {
                  try { parsed = JSON.parse(fixNl(cleaned)); } catch {
                    const objMatch = cleaned.match(/\{[\s\S]*\}/);
                    if (objMatch) {
                      try { parsed = JSON.parse(objMatch[0]); } catch {
                        parsed = JSON.parse(fixNl(objMatch[0]));
                      }
                    }
                  }
                }
              }
            }
            if (!parsed) throw new Error('No valid JSON');
            // Section-based edit  -  merge only changed sections into current artifact HTML
            if (parsed.type === 'edit' && parsed.sections) {
              const currentArt = artifactRef.current;
              if (currentArt?.content) {
                const mergedHtml = mergeSectionEdits(currentArt.content, parsed.sections);
                setArtifact(prev => prev ? { ...prev, content: mergedHtml } : prev);
                setPanelOpen(true);
                if (isMobileRef.current) setMobileArtifactOpen(true);
                const sectionNames = Object.keys(parsed.sections).join(', ');
                setMessages(prev => prev.map(m =>
                  m.id === assistantMsgId ? { ...m, content: parsed.summary || `Updated sections: ${sectionNames}`, hasArtifact: true, artifactTitle: currentArt.title || 'Updated output' } : m
                ));
              }
            } else if (parsed.html || parsed.type === 'newsletter' || parsed.type === 'html') {
              const html = parsed.html;
              const isNewsletter = agentName === 'newsletter' || parsed.type === 'newsletter';
              const hasImages = (html && html.includes('{{GENERATE:')) || (isNewsletter && parsed.cover_image_prompt);
              const finalTitle = isNewsletter ? 'Crafting your Newsletter...' : `Crafting your ${agentName === 'landing' ? 'Landing Page' : agentName === 'squeeze' ? 'Squeeze Page' : 'content'}...`;
              const newArt = {
                id: artifactRef.current?.id || Date.now(),
                type: isNewsletter ? 'newsletter' : 'html_template',
                title: hasImages ? finalTitle : (parsed.summary || finalTitle),
                content: html,
                images: [],
                agentSource: agentName,
              };
              setArtifact(newArt);
              setPanelOpen(true);
              if (isMobileRef.current) setMobileArtifactOpen(true);

              // If images need generating, don't show the artifact card yet  -  wait until done
              if (hasImages) {
                setMessages(prev => prev.map(m =>
                  m.id === assistantMsgId ? { ...m, content: 'Generating images for your newsletter...', status: 'Generating images...' } : m
                ));
              } else {
                setMessages(prev => prev.map(m =>
                  m.id === assistantMsgId ? { ...m, hasArtifact: true, artifactTitle: parsed.summary || finalTitle, artifactType: 'html_template' } : m
                ));
                // Snapshot this final artifact onto the message so its
                // chat card opens THIS HTML even after the user generates
                // something else later in the same chat.
                commitOwnedArtifact(assistantMsgId, newArt);
              }

              // Generate AI images for {{GENERATE:...}} placeholders
              if (html && html.includes('{{GENERATE:')) {
                const imgPlatform = (agentName === 'landing-page' || agentName === 'squeeze') ? 'landing_page' : 'newsletter';
                const imgResult = generateNewsletterImages(html, setArtifact, () => {}, imgPlatform);
                if (imgResult?.promise) pendingImagesRef.current.push(imgResult.promise);
              }

              // Generate cover image  -  insert shimmer placeholder immediately, swap when done
              if (isNewsletter && parsed.cover_image_prompt) {
                const COVER_PLACEHOLDER_ID = 'cover-img-placeholder';
                const coverShimmer = `<div id="${COVER_PLACEHOLDER_ID}" style="width:100%;height:250px;background:#e2e2e2;border-radius:8px;display:flex;align-items:center;justify-content:center;position:relative;overflow:hidden;margin-bottom:16px"><style>#${COVER_PLACEHOLDER_ID}::before{content:'';position:absolute;width:300%;height:300%;top:-100%;left:-100%;background:linear-gradient(135deg,transparent 35%,rgba(255,255,255,0.5) 48%,rgba(255,255,255,0.8) 50%,rgba(255,255,255,0.5) 52%,transparent 65%);animation:genShimmer 2s linear infinite}@keyframes genShimmer{0%{transform:translate(-33%,-33%)}100%{transform:translate(33%,33%)}}</style><span style="color:#9e9e9e;font-size:13px;font-weight:600;font-family:Inter,system-ui,sans-serif;position:relative;z-index:1;letter-spacing:0.5px">Generating cover image</span></div>`;

                // Insert shimmer into hero section  -  strip any existing images first to prevent duplicates
                setArtifact(prev => {
                  if (!prev?.content) return prev;
                  let h = prev.content;
                  const heroStart = h.indexOf('<!-- SECTION:hero -->');
                  const heroEnd = h.indexOf('<!-- /SECTION:hero -->');
                  if (heroStart !== -1 && heroEnd !== -1) {
                    // Remove any existing <img> tags in the hero section
                    const heroContent = h.slice(heroStart, heroEnd);
                    const cleanedHero = heroContent.replace(/<img[^>]*>/gi, '');
                    h = h.slice(0, heroStart) + cleanedHero + h.slice(heroEnd);
                    // Re-find positions after cleanup
                    const newHeroStart = h.indexOf('<!-- SECTION:hero -->');
                    const tdMatch = h.indexOf('<td', newHeroStart);
                    const tdEnd = tdMatch !== -1 ? h.indexOf('>', tdMatch) + 1 : -1;
                    if (tdEnd > 0) {
                      h = h.slice(0, tdEnd) + coverShimmer + h.slice(tdEnd);
                    }
                  }
                  return { ...prev, content: h };
                });

                const coverPromise = (async () => {
                  try {
                    const imgResult = await generateImage(parsed.cover_image_prompt, 'newsletter', null);
                    if (imgResult.image) {
                      const uploaded = await uploadImageToStorage(imgResult.image.data, imgResult.image.mimeType);
                      if (uploaded.url) {
                        const imgTag = `<img src="${uploaded.url}" alt="Newsletter Cover" style="width:100%;height:auto;display:block;border-radius:8px;margin-bottom:16px;" />`;
                        setArtifact(prev => {
                          if (!prev?.content) return prev;
                          // Replace the shimmer placeholder with the real image
                          const placeholderRegex = new RegExp(`<div id="${COVER_PLACEHOLDER_ID}"[\\s\\S]*?<\\/div>`);
                          const h = prev.content.replace(placeholderRegex, imgTag);
                          return { ...prev, content: h };
                        });
                      } else {
                        // Remove placeholder on failure
                        setArtifact(prev => {
                          if (!prev?.content) return prev;
                          const placeholderRegex = new RegExp(`<div id="${COVER_PLACEHOLDER_ID}"[\\s\\S]*?<\\/div>`);
                          return { ...prev, content: prev.content.replace(placeholderRegex, '') };
                        });
                      }
                    } else {
                      setArtifact(prev => {
                        if (!prev?.content) return prev;
                        const placeholderRegex = new RegExp(`<div id="${COVER_PLACEHOLDER_ID}"[\\s\\S]*?<\\/div>`);
                        return { ...prev, content: prev.content.replace(placeholderRegex, '') };
                      });
                    }
                  } catch (err) {
                    console.error('Cover image gen failed:', err.message);
                    setArtifact(prev => {
                      if (!prev?.content) return prev;
                      const placeholderRegex = new RegExp(`<div id="${COVER_PLACEHOLDER_ID}"[\\s\\S]*?<\\/div>`);
                      return { ...prev, content: prev.content.replace(placeholderRegex, '') };
                    });
                  }
                })();
                pendingImagesRef.current.push(coverPromise);
              }

              // After all images are done, mark the message as complete with the artifact card
              if (hasImages) {
                const allImagePromises = [...pendingImagesRef.current];
                (async () => {
                  await Promise.allSettled(allImagePromises);
                  const doneTitle = parsed.summary || (isNewsletter ? 'Your Newsletter is ready' : `Your ${agentName === 'landing' ? 'Landing Page' : agentName === 'squeeze' ? 'Squeeze Page' : 'content'} is ready`);
                  setArtifact(prev => prev ? { ...prev, title: doneTitle } : prev);
                  setMessages(prev => prev.map(m =>
                    m.id === assistantMsgId ? { ...m, content: doneTitle, status: null, hasArtifact: true, artifactTitle: doneTitle, artifactType: 'html_template' } : m
                  ));
                  // Snapshot the final post-images artifact so this card
                  // stays independently previewable later.
                  commitOwnedArtifact(assistantMsgId);
                })();
              }
            }
            // Cover image prompt  -  generate and inject into newsletter (fallback for manual requests)
            if (parsed.type === 'cover_image' && parsed.prompt) {
              setMessages(prev => prev.map(m =>
                m.id === assistantMsgId ? { ...m, content: 'Generating your cover image...' } : m
              ));
              (async () => {
                try {
                  const imgResult = await generateImage(parsed.prompt, 'newsletter', null);
                  if (imgResult.image) {
                    const uploaded = await uploadImageToStorage(imgResult.image.data, imgResult.image.mimeType);
                    if (uploaded.url) {
                      setArtifact(prev => {
                        if (!prev?.content) return prev;
                        let html = prev.content;
                        const heroStart = html.indexOf('<!-- SECTION:hero -->');
                        if (heroStart !== -1) {
                          const tdMatch = html.indexOf('<td', heroStart);
                          const tdEnd = tdMatch !== -1 ? html.indexOf('>', tdMatch) + 1 : -1;
                          if (tdEnd > 0) {
                            const imgTag = `<img src="${uploaded.url}" alt="Newsletter Cover" style="width:100%;height:auto;display:block;border-radius:8px;margin-bottom:16px;" />`;
                            html = html.slice(0, tdEnd) + imgTag + html.slice(tdEnd);
                          }
                        }
                        return { ...prev, content: html };
                      });
                      setMessages(prev => prev.map(m =>
                        m.id === assistantMsgId ? { ...m, content: 'Cover image added to your newsletter!' } : m
                      ));
                    } else {
                      setMessages(prev => prev.map(m =>
                        m.id === assistantMsgId ? { ...m, content: 'Cover image generation returned no image  -  try again.' } : m
                      ));
                    }
                  } else {
                    setMessages(prev => prev.map(m =>
                      m.id === assistantMsgId ? { ...m, content: 'Cover image generation returned no image  -  try again.' } : m
                    ));
                  }
                } catch (err) {
                  setMessages(prev => prev.map(m =>
                    m.id === assistantMsgId ? { ...m, content: `Cover image generation failed: ${err.message}` } : m
                  ));
                }
              })();
            }

            if (parsed.type === 'story_sequence' && parsed.frames) {
              const storyFrames = parsed.frames.map((f, i) => ({
                ...f,
                imageSrc: null,
                loading: true,
                id: i,
              }));
              setArtifact({
                id: Date.now(),
                type: 'story_sequence',
                title: parsed.summary || 'Story Sequence',
                content: JSON.stringify(parsed),
                frames: storyFrames,
                images: [],
              });
              setPanelOpen(true);
              if (isMobileRef.current) setMobileArtifactOpen(true);

              setMessages(prev => prev.map(m =>
                m.id === assistantMsgId ? { ...m, hasArtifact: true, artifactTitle: parsed.summary || 'Story Sequence', artifactType: 'story_sequence' } : m
              ));

              // Generate images for each frame in parallel
              (async () => {
                let brandData = null;
                try {
                  const { data: { session } } = await supabase.auth.getSession();
                  if (session?.user) {
                    const { data } = await supabase.from('brand_dna').select('*').eq('user_id', session.user.id).order('updated_at', { ascending: true }).limit(1);
                    if (data?.[0]) {
                      const bd = data[0];
                      brandData = {
                        photoUrls: bd.photo_urls?.length ? [bd.photo_urls[0]] : [],
                        logoUrl: null,
                        colors: bd.colors || {},
                        mainFont: bd.main_font || null,
                      };
                    }
                  }
                } catch (e) { console.error('Brand DNA load for stories:', e); }

                const visualStyle = parsed.visual_style || '';
                await Promise.all(storyFrames.map(async (frame, idx) => {
                  const captionText = frame.caption || frame.title || '';
                  const captionInstruction = captionText ? `\n\nTEXT OVERLAY  -  ONE text sticker:\n- Render EXACTLY ONE text sticker: "${captionText}"\n- Flat solid white (#FFFFFF) rectangle with rounded corners (~12px radius). NO border, NO outline, NO stroke around the pill  -  just a clean flat white shape.\n- Text: "${captionText}" in pure black (#000000), bold weight, clean sans-serif (SF Pro, Helvetica), ~30px\n- Snug padding: pill tightly wraps text. Only as wide as the text needs.\n- Centered horizontally, upper third of frame.\n- ONE sticker only. Do NOT duplicate text. Do NOT add any border or outline around the white pill.\n\nDO NOT RENDER:\n- No Instagram UI (no progress bars, profile pics, usernames, send bar, hearts)\n- No borders or outlines around the text sticker\n- No second copy of the text\n- Just the photo with one clean white text sticker on top.` : '';
                  const sequencePrompt = `${visualStyle ? `VISUAL STYLE FOR THIS SERIES: ${visualStyle}\n\n` : ''}This is frame ${idx + 1} of ${storyFrames.length} in a cohesive Instagram Story sequence. Follow the visual style exactly so all frames feel like ONE continuous story.\n\nIMPORTANT: Generate ONLY the photo/image content. Do NOT render any Instagram UI (no progress bars, no profile icons, no usernames, no send message bar, no close button). Just the raw image with the text sticker overlay.\n\n${frame.image_prompt}${captionInstruction}`;

                  try {
                    const result = await generateImage(sequencePrompt, 'instagram_story', brandData);
                    const allowedMime = ['image/png', 'image/jpeg', 'image/gif', 'image/webp'];
                    if (result.image && allowedMime.includes(result.image.mimeType)) {
                      const src = `data:${result.image.mimeType};base64,${result.image.data}`;
                      setArtifact(prev => prev ? { ...prev, frames: prev.frames.map((f, i) => i === idx ? { ...f, imageSrc: src, loading: false } : f) } : prev);
                    } else {
                      setArtifact(prev => prev ? { ...prev, frames: prev.frames.map((f, i) => i === idx ? { ...f, loading: false, error: true } : f) } : prev);
                    }
                  } catch (err) {
                    console.error(`Story frame ${idx + 1} failed:`, err.message);
                    setArtifact(prev => prev ? { ...prev, frames: prev.frames.map((f, i) => i === idx ? { ...f, loading: false, error: true } : f) } : prev);
                  }
                }));
                // All frames have settled (success or error). Snapshot the
                // finished story sequence onto this message so its card
                // independently previews these frames even after the next
                // generation replaces the live `artifact`.
                commitOwnedArtifact(assistantMsgId);
              })();
            }
          } catch (parseErr) {
            console.log('[agent-result] JSON parse failed, attempting raw HTML extraction:', parseErr.message?.slice(0, 100));

            // The LLM returned {"type":"html","html":"...","summary":"..."} but
            // with raw newlines and/or unescaped quotes inside the HTML value,
            // so every JSON.parse variant failed. Instead of trying to parse the
            // malformed JSON, extract the HTML by its own boundaries (<!DOCTYPE
            // or <html through </html>) which are always present and unambiguous.
            let rawHtml = '';

            // Strategy 1: extract <!DOCTYPE.....</html> by HTML boundaries.
            // Works regardless of surrounding JSON, markdown fences, or any
            // other wrapper — we just grab the HTML document itself.
            const docStart = content.indexOf('<!DOCTYPE');
            const htmlTagStart = docStart === -1 ? content.indexOf('<html') : docStart;
            if (htmlTagStart !== -1) {
              const htmlEnd = content.lastIndexOf('</html>');
              if (htmlEnd !== -1 && htmlEnd > htmlTagStart) {
                let extracted = content.slice(htmlTagStart, htmlEnd + '</html>'.length);
                // The HTML may still have JSON string escapes baked in
                // (e.g. \" instead of ", \\n instead of newline) if the LLM
                // wrote it inside a JSON string value. Unescape them.
                if (extracted.includes('\\n') || extracted.includes('\\"')) {
                  extracted = extracted
                    .replace(/\\n/g, '\n')
                    .replace(/\\t/g, '\t')
                    .replace(/\\r/g, '\r')
                    .replace(/\\"/g, '"')
                    .replace(/\\\\/g, '\\');
                }
                rawHtml = extracted;
              }
            }

            // Strategy 2: content itself is raw HTML without any wrapper.
            if (!rawHtml && !content.trimStart().startsWith('{')) {
              if (content.includes('<html') || content.includes('<body') || content.includes('<table')) {
                rawHtml = content;
              }
            }

            if (rawHtml && (rawHtml.includes('<html') || rawHtml.includes('<body') || rawHtml.includes('<!DOCTYPE'))) {
              const isNewsletter = agentName === 'newsletter';
              const newArt = {
                id: Date.now(),
                type: isNewsletter ? 'newsletter' : 'html_template',
                title: `${agentName} output`,
                content: rawHtml,
                images: [],
                agentSource: agentName,
              };
              setArtifact(newArt);
              setPanelOpen(true);
              if (isMobileRef.current) setMobileArtifactOpen(true);
              // Snapshot — but only if this message already has hasArtifact
              // (set earlier in the streaming path). Don't add a card here
              // since the original behavior was no-card on this fallback.
              commitOwnedArtifact(assistantMsgId, newArt);
            } else {
              // Extraction failed. If the streaming preview already has a good
              // artifact loaded, DON'T overwrite it — the preview is better
              // than nothing. Only show an error if there's no preview either.
              const currentArt = artifactRef.current;
              if (currentArt?.content && currentArt.content.includes('<html')) {
                console.log('[agent-result] Extraction failed but streaming preview is intact — keeping it.');
                // Just update the title so it doesn't say "Crafting..."
                setArtifact(prev => prev ? { ...prev, title: `${agentName} output` } : prev);
              } else {
                console.error('[agent-result] Could not extract HTML. Content starts with:', content.slice(0, 200));
                setMessages(prev => prev.map(m =>
                  m.id === assistantMsgId ? { ...m, content: 'The page was generated but couldn\'t be rendered. Please try again.' } : m
                ));
              }
            }
          }
        },
        // Direct tool calls (create_artifact, generate_image, plan_carousel)
        onToolCall: async (name, args) => {
          firedTools.push(name);
          console.log(`[AiCeo] 🔧 tool_call: ${name}`, args);

          // ── Format-question hard gate ──
          // Sonnet has been skipping the "text post vs carousel" (LinkedIn)
          // and "single vs carousel vs story" (Instagram) discovery
          // question despite the system prompt telling it not to. Multiple
          // prompt-level tightenings didn't hold; this is the client-side
          // enforcement.
          //
          // Rule: for LinkedIn/Instagram content_post artifacts AND for
          // any plan_carousel call, if the current session's recent user
          // messages don't contain a literal format keyword, we intercept
          // the tool call, drop it, and surface the format question
          // ourselves. On the next user turn the answer lands in
          // messages, Sonnet sees it, and the follow-up create_artifact /
          // plan_carousel goes through.
          const isSocialArtifact = (
            (name === 'create_artifact' && args.type === 'content_post')
            || name === 'plan_carousel'
          );
          if (isSocialArtifact) {
            const recentUserText = messages
              .filter((m) => m.role === 'user')
              .slice(-4)
              .map((m) => String(m.content || ''))
              .join(' ')
              .toLowerCase();
            // Format keywords covering LinkedIn (text/carousel), Instagram
            // (single/carousel/story), X (tweet/thread), Facebook (story/
            // question/announcement). Users clicking a popup option get
            // that option string appended as a user message, so answering
            // via ask_user counts here too.
            const FORMAT_KEYWORDS = [
              'text post', 'carousel', 'single post', 'story', 'stories',
              'tweet', 'thread', 'reply', 'quote',
              'question post', 'announcement',
              'surprise me',
            ];
            const formatConfirmed = FORMAT_KEYWORDS.some((kw) => recentUserText.includes(kw));
            if (!formatConfirmed) {
              // Derive platform for the question wording. plan_carousel
              // itself doesn't carry it — infer from recent user text.
              const isLinkedin = /\blinkedin\b/.test(recentUserText);
              const isInstagram = /\binstagram\b/.test(recentUserText);
              const isTwitter = /\b(twitter|x post|tweet)\b/.test(recentUserText);
              const isFacebook = /\bfacebook\b/.test(recentUserText);
              // Argment platform (from create_artifact) is a stronger
              // signal when present.
              const argsPlatform = String(args.platform || '').toLowerCase();
              const platform = argsPlatform
                || (isLinkedin ? 'linkedin'
                  : isInstagram ? 'instagram'
                  : isTwitter ? 'twitter'
                  : isFacebook ? 'facebook'
                  : 'linkedin');

              const questionByPlatform = {
                linkedin: {
                  question: 'What type of LinkedIn post?',
                  options: ['Text post', 'Carousel', 'Surprise me'],
                },
                instagram: {
                  question: 'What kind of Instagram post?',
                  options: ['Single post', 'Carousel', 'Story', 'Surprise me'],
                },
                twitter: {
                  question: 'What kind of X post?',
                  options: ['Single tweet', 'Thread', 'Reply/quote', 'Surprise me'],
                },
                facebook: {
                  question: 'What kind of Facebook post?',
                  options: ['Story post', 'Question/discussion', 'Announcement', 'Surprise me'],
                },
              };
              const q = questionByPlatform[platform] || questionByPlatform.linkedin;

              console.warn(`[AiCeo] ${name} intercepted — format never confirmed. Surfacing format question for ${platform}.`);
              askUserFiredRef.current = true;
              setCurrentQuestion({ question: q.question, options: q.options });
              setCustomTyping(false);
              setCustomText('');
              setMessages(prev => prev.map(m =>
                m.id === assistantMsgId
                  ? { ...m, content: q.question, status: null, wasAskUser: true, askUserOptions: q.options }
                  : m
              ));
              // Swallow the tool call — do NOT continue below.
              return;
            }
          }

          if (name === 'create_artifact') {
            // `platform` arrives for content_post artifacts so the
            // panel can route LinkedIn posts to the LinkedIn card
            // instead of falling back to Instagram. Stamp it on
            // agentSource — ArtifactPanel already matches /linkedin/i
            // on agentSource to pick the LinkedIn variant.
            // FALLBACK: models sometimes omit `platform` even when
            // asked. Sniff title + content for explicit platform
            // mentions so a LinkedIn post never silently renders as an
            // Instagram card. Title is checked first (clearer signal),
            // content second (less reliable but catches edge cases
            // like "Here is your LinkedIn post: ...").
            let inferredPlatform = args.platform || null;
            let effectiveType = args.type;
            if (!inferredPlatform && args.type === 'content_post') {
              const haystack = `${args.title || ''} ${(args.content || '').slice(0, 400)}`.toLowerCase();
              if (/\blinkedin\b/.test(haystack)) inferredPlatform = 'linkedin';
              else if (/\btwitter\b|\bx post\b|\btweet\b/.test(haystack)) inferredPlatform = 'twitter';
              else if (/\btiktok\b/.test(haystack)) inferredPlatform = 'tiktok';
              else if (/\bfacebook\b/.test(haystack)) inferredPlatform = 'facebook';
              else if (/\binstagram\b/.test(haystack)) inferredPlatform = 'instagram';
              if (inferredPlatform) console.log(`[AiCeo] create_artifact platform missing — inferred "${inferredPlatform}" from title/content`);
            }
            // Defensive fallback: the model sometimes picks type='html_template'
            // (or 'markdown_doc') for a LinkedIn post despite the tool
            // description telling it not to. Detect that case and reroute to
            // content_post so the LinkedIn feed card renders instead of a
            // full-page HTML canvas / markdown wall.
            //
            // Gate: content must NOT contain real HTML document markers
            // (a legit html_template will have <html>/<body>/<!DOCTYPE>).
            // Title or content must mention a social platform. Content
            // length has to be plausibly post-sized (< 4000 chars).
            if ((args.type === 'html_template' || args.type === 'markdown_doc') && args.content) {
              const contentLower = (args.content || '').toLowerCase();
              const looksLikeHtml = /<(?:!doctype|html|body|head|style|table)\b/.test(contentLower);
              const isShort = (args.content || '').length < 4000;
              if (!looksLikeHtml && isShort) {
                const haystack = `${args.title || ''} ${args.content || ''}`.toLowerCase();
                let sniffed = null;
                if (/\blinkedin\b/.test(haystack)) sniffed = 'linkedin';
                else if (/\btwitter\b|\bx post\b|\btweet\b/.test(haystack)) sniffed = 'twitter';
                else if (/\btiktok\b/.test(haystack)) sniffed = 'tiktok';
                else if (/\bfacebook\b/.test(haystack)) sniffed = 'facebook';
                else if (/\binstagram\b/.test(haystack)) sniffed = 'instagram';
                if (sniffed) {
                  console.warn(`[AiCeo] create_artifact type=${args.type} but content looks like a ${sniffed} post — rerouting to content_post`);
                  effectiveType = 'content_post';
                  inferredPlatform = sniffed;
                }
              }
            }
            const newArt = {
              id: Date.now(),
              type: effectiveType,
              title: args.title,
              content: args.content,
              images: [],
              ...(inferredPlatform ? { agentSource: inferredPlatform } : {}),
            };
            setArtifact(newArt);
            setPanelOpen(true);
            if (isMobileRef.current) setMobileArtifactOpen(true);
            setMessages(prev => prev.map(m =>
              m.id === assistantMsgId ? { ...m, hasArtifact: true, artifactTitle: args.title, artifactType: effectiveType } : m
            ));
            commitOwnedArtifact(assistantMsgId, newArt);
          }
          if (name === 'plan_carousel') {
            // Instagram / LinkedIn carousel — Sonnet has emitted the plan
            // (hook, angle, caption, slides, designSystem). We render the
            // plan in the canvas immediately so the user sees progress,
            // then loop through slides calling generate_image with the
            // SAME deterministic per-slide prompt builder /Content uses.
            // Result: byte-identical visual cohesion across AICEO and
            // /Content, and the user's own upload / schedule / post
            // buttons in the canvas keep working because we produce a
            // real content_post artifact.
            const plan = {
              hook: args.hook || '',
              angle: args.angle || '',
              caption: args.caption || '',
              slides: Array.isArray(args.slides) ? args.slides : [],
              designSystem: args.designSystem || {},
            };
            if (plan.slides.length === 0) {
              console.warn('[AiCeo] plan_carousel with zero slides — ignoring');
              return;
            }
            // Platform detection: scan the recent user messages in this
            // session for a literal platform mention. LinkedIn takes
            // priority when both appear (rare). Fall back to instagram —
            // Content's own default for plan_carousel — when neither
            // side has spoken the platform yet (a Surprise-me path).
            const recentUserText = messages
              .filter((m) => m.role === 'user')
              .slice(-3)
              .map((m) => String(m.content || ''))
              .join(' ')
              .toLowerCase();
            const platform = /\blinkedin\b/i.test(recentUserText) ? 'linkedin' : 'instagram';
            const brandName = brandDna?.brand_name || user?.name || '';

            const initialArt = {
              id: Date.now(),
              type: 'content_post',
              title: `${platform === 'linkedin' ? 'LinkedIn' : 'Instagram'} carousel: ${plan.hook.slice(0, 60)}`,
              content: plan.caption,
              images: [],
              pendingImages: plan.slides.length,
              totalSlides: plan.slides.length,
              carouselPlan: plan,
              agentSource: platform,
              streaming: true,
            };
            setArtifact(initialArt);
            setPanelOpen(true);
            if (isMobileRef.current) setMobileArtifactOpen(true);
            setMessages(prev => prev.map(m =>
              m.id === assistantMsgId
                ? { ...m, hasArtifact: true, artifactTitle: initialArt.title, artifactType: 'content_post' }
                : m
            ));

            // Generate slides sequentially. Parallel would be faster but
            // caps out on the image API's concurrent-request limit and
            // produces choppy UI updates. Sequential shows a visible
            // "1/8 done, 2/8 done, …" progression via pendingImages.
            (async () => {
              for (let i = 0; i < plan.slides.length; i++) {
                const slide = plan.slides[i];
                let prompt;
                try {
                  prompt = buildCarouselSlidePrompt({
                    designSystem: plan.designSystem,
                    slide,
                    index: i,
                    total: plan.slides.length,
                    brand: { name: brandName },
                    platform,
                  });
                } catch (buildErr) {
                  console.error(`[AiCeo] carousel prompt build failed for slide ${i + 1}:`, buildErr);
                  setArtifact((prev) => prev ? { ...prev, pendingImages: Math.max(0, (prev.pendingImages || 1) - 1) } : prev);
                  continue;
                }
                try {
                  // Backend has a dedicated 'linkedin_carousel' config
                  // (3:4 portrait). Instagram carousels use the regular
                  // 'instagram' platform (1:1 square).
                  const backendPlatform = platform === 'linkedin' ? 'linkedin_carousel' : 'instagram';
                  const result = await generateImage(prompt, backendPlatform, null, null, {});
                  if (result?.image?.data) {
                    const src = `data:${result.image.mimeType};base64,${result.image.data}`;
                    setArtifact((prev) => prev ? {
                      ...prev,
                      images: [...(prev.images || []), { src, idx: i }],
                      pendingImages: Math.max(0, (prev.pendingImages || 1) - 1),
                    } : prev);
                  } else {
                    setArtifact((prev) => prev ? { ...prev, pendingImages: Math.max(0, (prev.pendingImages || 1) - 1) } : prev);
                  }
                } catch (imgErr) {
                  console.error(`[AiCeo] carousel slide ${i + 1} failed:`, imgErr);
                  setArtifact((prev) => prev ? { ...prev, pendingImages: Math.max(0, (prev.pendingImages || 1) - 1) } : prev);
                }
              }
              // All slides attempted — clear streaming flag and stamp
              // the snapshot so the chat card owns the finished artifact.
              setArtifact((prev) => prev ? { ...prev, streaming: false } : prev);
              commitOwnedArtifact(assistantMsgId);
            })();
          }
          if (name === 'generate_image') {
            // Build referenceImages from any image the user attached
            // this turn, so generate_image edits/builds on the user's
            // image instead of generating from scratch. dataUrl is set
            // locally by FileReader at attach time; we strip the
            // "data:<mime>;base64," prefix to match the backend's
            // expected { data, mimeType } shape.
            const turnAttachments = currentTurnAttachmentsRef.current || [];
            const refImages = turnAttachments
              .filter((f) => f.type === 'image' && f.dataUrl)
              .map((f) => {
                const commaIdx = f.dataUrl.indexOf(',');
                const mimeMatch = f.dataUrl.match(/^data:([^;]+);/);
                return {
                  data: commaIdx !== -1 ? f.dataUrl.slice(commaIdx + 1) : f.dataUrl,
                  mimeType: mimeMatch?.[1] || 'image/jpeg',
                };
              });
            console.log(`[AiCeo] 🖼  generate_image START — prompt="${(args.prompt || '').slice(0, 120)}...", refImages=${refImages.length}`);
            try {
              // editUserImage flag tells the backend "these reference
              // images are the user's primary subject — don't fall back
              // to brand-DNA photos." Without this, the backend would
              // attach brand-DNA photos as the dominant reference and
              // Gemini would edit one of those instead of the user's
              // attached image.
              const result = await generateImage(
                args.prompt,
                'general',
                null,
                refImages.length ? refImages : null,
                refImages.length ? { editUserImage: true } : {},
              );
              console.log(`[AiCeo] 🖼  generate_image RESULT — image: ${!!result.image}, text: ${result.text ? `"${result.text.slice(0, 100)}"` : '<none>'}`, result);
              if (result.image) {
                const src = `data:${result.image.mimeType};base64,${result.image.data}`;
                setArtifact(prev => {
                  // Existing artifact: append the new image to whatever
                  // type the panel is already showing. Don't reshape it.
                  if (prev) return { ...prev, images: [...(prev.images || []), { src }] };
                  // Fresh panel: use the new 'image' artifact type. This
                  // gets a clean centered viewer (no fake Instagram
                  // phone mockup) — generate_image with no platform
                  // context isn't social content, so don't pretend it
                  // is. Platform-targeted content (create_content with
                  // instagram_post / linkedin_post / etc.) keeps the
                  // 'content_post' type where the social wrapper makes
                  // sense.
                  const newArt = { id: Date.now(), type: 'image', title: 'Generated Image', content: '', images: [{ src }] };
                  setPanelOpen(true);
                  if (isMobileRef.current) setMobileArtifactOpen(true);
                  return newArt;
                });
                // Flag the assistant message so the "Open preview" artifact
                // card renders — gives the user a way back to the image
                // panel after they close it.
                setMessages(prev => prev.map(m =>
                  m.id === assistantMsgId
                    ? { ...m, hasArtifact: true, artifactTitle: 'Open preview', artifactType: 'image' }
                    : m
                ));
              }
            } catch (e) {
              console.error(`[AiCeo] 🖼  generate_image ERROR:`, e);
            }
          }
        },
        onSearchStatus: setSearchStatus,
        // File-based edit updates (live preview while editing)
        onFileUpdate: (html) => {
          setArtifact(prev => prev ? { ...prev, content: html } : prev);
          setPanelOpen(true);
          if (isMobileRef.current) setMobileArtifactOpen(true);
          // Check if the edit introduced new {{GENERATE:...}} placeholders
          if (html && html.includes('{{GENERATE:')) {
            const currentAgent = artifactRef.current?.agentSource || 'newsletter';
            const imgPlatform = (currentAgent === 'landing-page' || currentAgent === 'squeeze') ? 'landing_page' : 'newsletter';
            generateNewsletterImages(html, setArtifact, () => {}, imgPlatform);
          }
        },
        // Edit summary after file-based edits complete
        onEditSummary: (summary) => {
          if (summary) {
            // Derive a real title from the CURRENT artifact so the edit
            // card doesn't hard-code "Updated newsletter" for every edit.
            // Preserves the original artifact's identity (Content Plan,
            // Week N brief, landing page, etc.) and appends a version
            // suffix so the chat clearly shows lineage.
            const currentArt = artifactRef.current || artifact;
            const baseTitle = currentArt?.title || 'Updated output';
            // If the previous title already has "v2" / "v3" / … increment;
            // otherwise start at v2.
            const vMatch = baseTitle.match(/\bv(\d+)\s*$/i);
            const versionedTitle = vMatch
              ? baseTitle.replace(/\bv(\d+)\s*$/i, `v${Number(vMatch[1]) + 1}`)
              : `${baseTitle} v2`;
            setMessages(prev => prev.map(m =>
              m.id === assistantMsgId ? { ...m, content: summary, hasArtifact: true, artifactTitle: versionedTitle } : m
            ));
            // Snapshot the post-edit artifact onto this edit-turn message.
            // The pre-edit message keeps its original frozen snapshot, so the
            // chat now has two cards: the original and the edited version,
            // each previewing independently.
            commitOwnedArtifact(assistantMsgId);
          }
        },
        onAskUser: (question, options) => {
          console.log('[AiCeo] onAskUser fired:', { question, options, isGenerating });
          askUserFiredRef.current = true;
          setCurrentQuestion({ question, options });
          setCustomTyping(false);
          setCustomText('');
          // Save the question with ask_user metadata so the backend can reconstruct tool call format
          setMessages(prev => prev.map(m =>
            m.id === assistantMsgId ? { ...m, content: question, status: null, wasAskUser: true, askUserOptions: options } : m
          ));
        },
        // In-stream error (orchestrate caught it after SSE was opened so
        // streamFromBackend can't throw). Surface whatever friendly
        // message orchestrate translated for us instead of leaving the
        // assistant bubble empty or showing "Something went wrong".
        onError: (errMsg) => {
          console.error('[AiCeo] orchestrate error event:', errMsg);
          setMessages(prev => prev.map(m =>
            m.id === assistantMsgId
              ? { ...m, content: errMsg || 'Something went wrong. Please try again.', status: null }
              : m
          ));
        },
      }, abort.signal);
    } catch (err) {
      if (err.name !== 'AbortError') {
        // Check for 402 credits depleted
        if (err.message?.includes('402') || err.message?.toLowerCase().includes('credits') || err.message?.toLowerCase().includes('insufficient')) {
          setCreditsDepleted(true);
          setMessages(prev => prev.filter(m => m.id !== assistantMsgId));
        } else {
          setMessages(prev => prev.map(m =>
            m.id === assistantMsgId
              ? { ...m, content: 'Something went wrong. Please try again.' }
              : m
          ));
        }
      }
    } finally {
      abortRef.current = null;
      // Wait for any pending image generation before marking as complete
      if (pendingImagesRef.current.length > 0) {
        const pending = [...pendingImagesRef.current];
        pendingImagesRef.current = [];
        await Promise.allSettled(pending);
      }

      // TEMP DEBUG — turn-end summary + hallucination detector. If the
      // assistant's text mentions an image but generate_image never fired,
      // the orchestrator hallucinated the tool call. Surface a warning to
      // the user inline and shout in the console so we can grep it.
      let finalContent = '';
      setMessages(prev => {
        const m = prev.find((x) => x.id === assistantMsgId);
        finalContent = m?.content || '';
        return prev;
      });
      const elapsed = Date.now() - turnStart;
      console.log(`[AiCeo] ◀ turn end — ${elapsed}ms, tools=[${firedTools.join(', ') || 'none'}], textLen=${finalContent.length}`);
      const imageWords = /(image panel|image is ready|generated (the |an? )?image|here'?s your image|made you (an? )?image|check the (image|panel|canvas)|image attached|image below)/i;
      const claimedImage = imageWords.test(finalContent);
      const actuallyMade = firedTools.includes('generate_image');
      if (claimedImage && !actuallyMade) {
        console.warn(`[AiCeo] ⚠️ HALLUCINATED IMAGE — assistant text claims an image but generate_image was never called. Text: "${finalContent.slice(0, 300)}"`);
        setMessages(prev => prev.map(m =>
          m.id === assistantMsgId
            ? { ...m, content: (m.content || '') + '\n\n_[debug: model claimed it generated an image but never called the tool — try again or switch provider]_' }
            : m
        ));
      }

      // Safety-net snapshot. The completion paths above already snapshot
      // the artifact onto this turn's message, but there are async/race
      // edge cases (image-IIFE late completion, hot reload, etc.) where
      // the snapshot might not have landed yet. Commit it again here AFTER
      // image promises have settled and BEFORE isGenerating flips false,
      // so the user can't click an old card before the snapshot exists.
      // Skips ask_user-only turns (no artifact ownership) and image-type
      // artifacts (cumulative gallery — handled by commitOwnedArtifact).
      if (!askUserFiredRef.current && artifactRef.current) {
        let shouldSnapshot = false;
        setMessages(prev => {
          const m = prev.find(x => x.id === assistantMsgId);
          shouldSnapshot = !!(m && m.hasArtifact);
          return prev;
        });
        if (shouldSnapshot) {
          console.log(`[snapshot] safety-net commit at turn end for ${assistantMsgId}`);
          await commitOwnedArtifact(assistantMsgId);
        }
      }

      askUserFiredRef.current = false;
      setIsGenerating(false);
    }
  }, [researchMode]);

  const stopGenerating = useCallback(() => {
    if (abortRef.current) {
      abortRef.current.abort();
      abortRef.current = null;
      setIsGenerating(false);
    }
  }, []);

  const answerQuestion = useCallback((answer) => {
    if (!answer.trim() || isGenerating) return;
    setCurrentQuestion(null);
    setCustomTyping(false);
    setCustomText('');
    shouldScrollRef.current = true;
    const contextStr = buildCeoContextString();
    const userContent = contextStr + answer.trim();
    const userMsg = {
      id: `msg-${Date.now()}-user`,
      role: 'user',
      content: userContent,
      displayText: answer.trim(),
    };
    const updated = [...messages, userMsg];
    setMessages(updated);
    sendToAI(updated);
  }, [isGenerating, messages, sendToAI, selectedCtxItems, ceoContextCategories]);

  const sendMessage = useCallback(() => {
    const text = input.trim();
    if (!text || isGenerating) return;
    // Don't send while an attachment is mid-upload — the AI would see
    // the file as "in flight" / errored and miss the actual content.
    if (attachedFiles.some((f) => f.status === 'uploading')) return;
    setCurrentQuestion(null);
    shouldScrollRef.current = true;
    // Snapshot DONE attachments BEFORE we clear state. The streaming
    // onToolCall handler reads this ref later in the turn to inject
    // referenceImages on any generate_image call.
    currentTurnAttachmentsRef.current = attachedFiles.filter((f) => f.status === 'done');
    const contextStr = buildCeoContextString();
    const userContent = contextStr + text;
    // Trim the attachment list for storage on the message — we only
    // need what the bubble renders (type, name, url, dataUrl). Drop
    // status / textContent / dbId etc. so the message payload stays
    // small and DB-friendly.
    const msgAttachments = currentTurnAttachmentsRef.current.map((f) => ({
      id: f.id,
      type: f.type,
      name: f.name,
      url: f.url || null,
      dataUrl: f.type === 'image' ? f.dataUrl || null : null,
    }));
    const userMsg = {
      id: `msg-${Date.now()}-user`,
      role: 'user',
      content: userContent,
      // displayText is what the user sees in their own bubble.
      // content is what the AI sees (with [CONTEXT…] / [ATTACHED IMAGES…]
      // blocks prepended) — those should never leak into the UI.
      displayText: text,
      ...(msgAttachments.length ? { attachments: msgAttachments } : {}),
    };
    const updated = [...messages, userMsg];
    setMessages(updated);
    setInput('');
    // Drop the staged attachments — they've been folded into the
    // outbound message via buildCeoContextString. Keeping them around
    // would silently re-attach the same files to the next message.
    setAttachedFiles([]);
    // Reset textarea height
    const textarea = document.querySelector('.ceo-input-area--bottom .ceo-input');
    if (textarea) textarea.style.height = 'auto';
    sendToAI(updated);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [input, isGenerating, messages, sendToAI, selectedCtxItems, ceoContextCategories, attachedFiles]);

  const handleStarter = useCallback((text) => {
    if (isGenerating) return;
    shouldScrollRef.current = true;
    // Same per-turn snapshot as sendMessage — see comment there.
    currentTurnAttachmentsRef.current = attachedFiles.filter((f) => f.status === 'done');
    const contextStr = buildCeoContextString();
    const userContent = contextStr + text;
    const msgAttachments = currentTurnAttachmentsRef.current.map((f) => ({
      id: f.id,
      type: f.type,
      name: f.name,
      url: f.url || null,
      dataUrl: f.type === 'image' ? f.dataUrl || null : null,
    }));
    const userMsg = {
      id: `msg-${Date.now()}-user`,
      role: 'user',
      content: userContent,
      displayText: text,
      ...(msgAttachments.length ? { attachments: msgAttachments } : {}),
    };
    const updated = [userMsg];
    setMessages(updated);
    setAttachedFiles([]);
    sendToAI(updated);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isGenerating, sendToAI, selectedCtxItems, ceoContextCategories, attachedFiles]);

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

  useEffect(() => {
    const els = document.querySelectorAll('.ceo-input');
    els.forEach((el) => {
      el.style.height = 'auto';
      el.style.height = el.scrollHeight + 'px';
    });
  }, [input]);

  const toggleVoice = () => {
    if (isListening) {
      recognitionRef.current?.stop();
      setIsListening(false);
      return;
    }
    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SpeechRecognition) return;
    const recognition = new SpeechRecognition();
    recognition.continuous = false;
    recognition.interimResults = false;
    recognition.lang = 'en-US';
    recognition.onresult = (event) => {
      const transcript = event.results[0][0].transcript;
      setInput(prev => (prev ? prev + ' ' + transcript : transcript));
      setIsListening(false);
    };
    recognition.onerror = () => setIsListening(false);
    recognition.onend = () => setIsListening(false);
    recognitionRef.current = recognition;
    recognition.start();
    setIsListening(true);
  };

  // ── Feature gate ──
  if (!hasFeature('ai_ceo_unified')) {
    return <Paywall feature="ai_ceo_unified" featureLabel="AI CEO" planRequired="diamond" />;
  }

  // ── Credits depleted ──
  if (creditsDepleted) {
    return (
      <div className="ceo-page" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <div className="credits-depleted">
          <div className="credits-depleted-icon"><Zap size={24} /></div>
          <div className="credits-depleted-title">You've run out of credits</div>
          <p className="credits-depleted-text">
            Your credit balance has reached zero. Add more credits to continue using AI CEO.
          </p>
          <button className="credits-depleted-link" onClick={() => navigate('/settings')}>
            Go to Billing & Usage
          </button>
        </div>
      </div>
    );
  }

  // ── Render ──
  return (
    <div className={`ceo-page${planMode ? ' ceo-page--plan-mode' : ''}`}>
      {/* Window-level drag-and-drop overlay. Visible while a file
          is being dragged over the page; drop wires straight into
          the same ingestFiles() the paperclip button uses. */}
      <ChatDropOverlay visible={filesDragging} hint="Drop to attach to your next message — images preview, documents are added as context." />
      <div
        className={`ceo-split ${dragging ? 'ceo-split--dragging' : ''}`}
        ref={splitRef}
      >
        {/* ── Chat Panel ── */}
        <div
          className={`ceo-chat ${showPanel ? 'ceo-chat--split' : ''}`}
          style={showPanel ? { width: `${splitPct}%` } : undefined}
        >
          {/* Previous conversations button */}
          <button className="ceo-prev-convos" onClick={() => setShowSessions((v) => !v)}>
            <History size={18} />
            <span className="ceo-prev-convos-label">Previous conversations</span>
          </button>

          {/* Sessions overlay + panel */}
          {showSessions && (
            <>
              <div className="ceo-sessions-backdrop" onClick={() => setShowSessions(false)} />
              <div className="ceo-sessions-panel">
                <div className="ceo-sessions-header">
                  <span>Conversations</span>
                  <button className="ceo-sessions-new" onClick={newConversation}>
                    <Plus size={16} /> New
                  </button>
                </div>
                <div className="ceo-sessions-list">
                  {sessions.length === 0 && (
                    <div className="ceo-sessions-empty">No past conversations yet</div>
                  )}
                  {sessions.map((s) => {
                    const isRenaming = renamingSessionId === s.id;
                    return (
                      <div
                        key={s.id}
                        className={`ceo-sessions-item ${s.id === sessionId ? 'ceo-sessions-item--active' : ''}`}
                        onClick={() => { if (!isRenaming) loadSession(s.id); }}
                      >
                        <div className="ceo-sessions-item-info">
                          {isRenaming ? (
                            <input
                              autoFocus
                              className="ceo-sessions-item-rename"
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
                            <span className="ceo-sessions-item-title">{s.title}</span>
                          )}
                          <span className="ceo-sessions-item-meta">
                            {new Date(s.updated_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
                          </span>
                        </div>
                        {!isRenaming && (
                          <button className="ceo-sessions-item-rename-btn" onClick={(e) => startRenameSession(s, e)} title="Rename">
                            <Pencil size={13} />
                          </button>
                        )}
                        <button className="ceo-sessions-item-delete" onClick={(e) => requestDeleteSession(s.id, e)} title="Delete">
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
              <div className="ceo-confirm-backdrop" onClick={() => setConfirmDeleteId(null)}>
                <div className="ceo-confirm-modal" onClick={(e) => e.stopPropagation()} role="dialog" aria-modal="true">
                  <div className="ceo-confirm-icon"><Trash2 size={20} /></div>
                  <div className="ceo-confirm-title">Delete this conversation?</div>
                  <div className="ceo-confirm-desc">
                    {target ? `"${target.title}" will be permanently removed.` : 'This conversation will be permanently removed.'}
                  </div>
                  <div className="ceo-confirm-actions">
                    <button className="ceo-confirm-btn ceo-confirm-btn--cancel" onClick={() => setConfirmDeleteId(null)}>Cancel</button>
                    <button className="ceo-confirm-btn ceo-confirm-btn--danger" onClick={confirmDeleteSession} autoFocus>Delete</button>
                  </div>
                </div>
              </div>
            );
          })()}

          {!hasMessages && (
            <div className="ceo-hero">
              <img src="/favicon.png" alt="AI CEO" className="ceo-hero-logo" />
              <div className="ceo-starters">
                {starters.map((s, i) => (
                  <button key={i} className="ceo-starter" onClick={() => handleStarter(s)}>
                    <img src="/favicon.png" alt="" className="ceo-starter-logo" />
                    <span>{s}</span>
                  </button>
                ))}
              </div>
              <div className="ceo-input-area">
                <div className="ceo-input-glow" />
                <div className="ceo-input-wrapper">
                  <svg className="ceo-orbit-svg" aria-hidden="true">
                    <rect className="ceo-orbit-glow" rx="25" ry="25" pathLength="1" />
                    <rect className="ceo-orbit-edge" rx="23" ry="23" pathLength="1" />
                    <rect className="ceo-orbit-mid" rx="23" ry="23" pathLength="1" />
                    <rect className="ceo-orbit-core" rx="23" ry="23" pathLength="1" />
                  </svg>
                  <div className="ceo-input-top-row">
                    <div className="ceo-ctx-anchor" ref={ctxMenuRef}>
                      <button className="ceo-ctx-trigger" onClick={() => { setCtxMenuOpen((v) => !v); setHoveredCat(null); }}>
                        <Plus size={13} /> Add Context
                      </button>
                      {ctxMenuOpen && (
                        <div className="ceo-ctx-dropdown">
                          <div className="ceo-ctx-dropdown-header">Select Context</div>
                          {ceoContextCategories.map((cat) => {
                            const selectedCount = cat.items.filter((i) => selectedCtxItems.has(i.id)).length;
                            return (
                              <div
                                key={cat.id}
                                className={`ceo-ctx-cat ${hoveredCat === cat.id ? 'ceo-ctx-cat--active' : ''}`}
                                onMouseEnter={() => setHoveredCat(cat.id)}
                              >
                                <div className="ceo-ctx-cat-icon">
                                  <img src={cat.iconSrc} alt={cat.label} className="ceo-ctx-cat-img" />
                                </div>
                                <span className="ceo-ctx-cat-label">{cat.label}</span>
                                {selectedCount > 0 && (
                                  <span className="ceo-ctx-cat-badge">{selectedCount}</span>
                                )}
                                <ChevronRight size={13} className="ceo-ctx-cat-arrow" />
                                {hoveredCat === cat.id && (
                                  <div className="ceo-ctx-sub">
                                    <div className="ceo-ctx-sub-header">{cat.label}</div>
                                    {cat.items.map((item) => (
                                      <div
                                        key={item.id}
                                        className={`ceo-ctx-sub-item ${selectedCtxItems.has(item.id) ? 'ceo-ctx-sub-item--on' : ''}`}
                                        onClick={() => toggleCtxItem(item.id)}
                                      >
                                        <div className="ceo-ctx-sub-info">
                                          <span className="ceo-ctx-sub-name">{item.name}</span>
                                          <span className="ceo-ctx-sub-meta">
                                            {item.sub && <span>{item.sub}</span>}
                                            {item.sub && item.date && <span className="ceo-ctx-sub-dot" />}
                                            {item.date && <span>{item.date}</span>}
                                          </span>
                                        </div>
                                        <div className={`ceo-ctx-radio ${selectedCtxItems.has(item.id) ? 'ceo-ctx-radio--on' : ''}`}>
                                          <div className="ceo-ctx-radio-fill" />
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
                      className={`ceo-research-toggle ${researchMode ? 'ceo-research-toggle--active' : ''}`}
                      onClick={() => setResearchMode((v) => !v)}
                      title="Enable web research mode"
                    >
                      <Globe size={13} /> Research
                    </button>
                    <button
                      className={`ceo-research-toggle ceo-plan-toggle ${planMode ? 'ceo-research-toggle--active ceo-plan-toggle--active' : ''}`}
                      onClick={() => setPlanMode((v) => !v)}
                      title="Plan a week or month of content in one session instead of generating individual pieces"
                    >
                      <CalendarDays size={13} /> Plan mode
                    </button>
                    {selectedCtxItems.size > 0 && (
                      <div className="ceo-ctx-pills">
                        {getSelectedCtxDetails().map((item) => (
                          <span key={item.id} className="ceo-ctx-pill">
                            {item.name}
                            <button className="ceo-ctx-pill-x" onClick={() => toggleCtxItem(item.id)}>
                              <X size={10} />
                            </button>
                          </span>
                        ))}
                      </div>
                    )}
                  </div>
                  {attachedFiles.length > 0 && (
                    <div className="ceo-attached-files">
                      {attachedFiles.map((f) => (
                        <span
                          key={f.id}
                          className={`ceo-attached-pill ceo-attached-pill--${f.type} ${f.status === 'error' ? 'ceo-attached-pill--error' : ''} ${f.status === 'uploading' ? 'ceo-attached-pill--uploading' : ''}`}
                          title={f.status === 'error' ? (f.errorMessage || 'Upload failed') : f.name}
                        >
                          {f.type === 'image' && (f.dataUrl || f.url) ? (
                            <img src={f.dataUrl || f.url} alt={f.name} className="ceo-attached-thumb" />
                          ) : (
                            <FileText size={14} className="ceo-attached-icon" />
                          )}
                          <span className="ceo-attached-name">{f.name}</span>
                          {f.status === 'uploading' && (
                            <Loader2 size={12} className="ceo-attached-spinner" />
                          )}
                          {f.status === 'error' && (
                            <AlertCircle size={12} className="ceo-attached-err" />
                          )}
                          <button className="ceo-attached-x" onClick={() => removeAttachedFile(f.id)} title="Remove">
                            <X size={11} />
                          </button>
                        </span>
                      ))}
                    </div>
                  )}
                  <div className="ceo-input-bottom-row">
                    <textarea
                      ref={inputRef}
                      className="ceo-input"
                      placeholder={planMode ? 'Plan a week or month of content...' : 'How can your AI CEO help you?'}
                      value={input}
                      onChange={(e) => setInput(e.target.value)}
                      onInput={autoResize}
                      onKeyDown={handleKeyDown}
                      rows={3}
                    />
                    <div className="ceo-input-actions">
                      <button
                        className="ceo-attach-btn"
                        onClick={() => fileInputRef.current?.click()}
                        title="Attach files"
                      >
                        <Paperclip size={18} />
                      </button>
                      <input
                        ref={fileInputRef}
                        type="file"
                        multiple
                        accept="image/*,.pdf,.txt,.doc,.docx,.md,.csv,.json"
                        onChange={handleFileInputChange}
                        style={{ display: 'none' }}
                      />
                      <button
                        className={`ceo-voice-btn ${isListening ? 'ceo-voice-btn--active' : ''}`}
                        onClick={toggleVoice}
                        title={isListening ? 'Stop listening' : 'Voice input'}
                      >
                        {isListening ? <Square size={18} /> : <Mic size={18} />}
                      </button>
                      <button
                        className="ceo-send-btn"
                        onClick={sendMessage}
                        disabled={!input.trim() || isGenerating || hasPendingUploads}
                        title={hasPendingUploads ? 'Wait for attachments to finish uploading' : 'Send'}
                      >
                        <Send size={18} />
                      </button>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          )}

          {hasMessages && (
            <>
              <div className="ceo-messages" ref={messagesContainerRef}>
                {messages.map((msg) => {
                  if (msg.role === 'user') {
                    // Render only what the user actually typed.
                    // msg.content has the [CONTEXT…] / [ATTACHED IMAGES…]
                    // blocks prepended for the AI; users shouldn't see
                    // those in their own bubble. msg.displayText is set
                    // for new messages; older messages without it fall
                    // back to content.
                    return (
                      <div key={msg.id} className="ceo-bubble ceo-bubble--user">
                        <p className="ceo-user-text">{msg.displayText || stripCeoContextBlocks(msg.content)}</p>
                        {msg.attachments?.length > 0 && (
                          <div className="ceo-msg-attachments">
                            {msg.attachments.map((a) => (
                              a.type === 'image' ? (
                                <a
                                  key={a.id}
                                  href={a.url || a.dataUrl || '#'}
                                  target="_blank"
                                  rel="noreferrer"
                                  className="ceo-msg-attach-img"
                                  title={a.name}
                                >
                                  {/* Prefer the persisted url (always present after upload + on reload).
                                      dataUrl exists only briefly in fresh-send state before upload
                                      finishes, and is dropped on save — falling back to it covers
                                      the brief pre-upload window only. */}
                                  <img src={a.url || a.dataUrl} alt={a.name} />
                                </a>
                              ) : (
                                <a
                                  key={a.id}
                                  href={a.url || '#'}
                                  target="_blank"
                                  rel="noreferrer"
                                  className="ceo-msg-attach-doc"
                                  title={a.name}
                                >
                                  <FileText size={14} />
                                  <span className="ceo-msg-attach-doc-name">{a.name}</span>
                                </a>
                              )
                            ))}
                          </div>
                        )}
                      </div>
                    );
                  }
                  if (!msg.content && !msg.hasArtifact) {
                    // Plan Mode gets a themed multi-step working card so
                    // the user sees a distinct signal that the plan is
                    // being built (rather than the plain "thinking..."
                    // dots which don't communicate the heavier workload).
                    const isPlanWorking = msg.planWorking || (planMode && !searchStatus);
                    return (
                      <div key={msg.id} className={
                        isPlanWorking ? 'ceo-plan-working'
                        : searchStatus === 'searching' ? 'ceo-research-card'
                        : 'ceo-thinking'
                      }>
                        {isPlanWorking ? (
                          <>
                            <div className="ceo-plan-working-header">
                              <CalendarDays size={14} className="ceo-plan-working-icon" />
                              <span>Building your plan</span>
                            </div>
                            <div className="ceo-plan-working-steps">
                              <div className="ceo-plan-working-step ceo-plan-working-step--1">
                                <span className="ceo-plan-working-step-dot" />
                                <span>Reading brand DNA + past content</span>
                              </div>
                              <div className="ceo-plan-working-step ceo-plan-working-step--2">
                                <span className="ceo-plan-working-step-dot" />
                                <span>Drafting week-by-week roadmap</span>
                              </div>
                              <div className="ceo-plan-working-step ceo-plan-working-step--3">
                                <span className="ceo-plan-working-step-dot" />
                                <span>Composing hooks + visual briefs</span>
                              </div>
                            </div>
                            <span className="ceo-plan-working-label">
                              {msg.status || 'Working on your content plan'}
                              <span className="ceo-dots"><span>.</span><span>.</span><span>.</span></span>
                            </span>
                          </>
                        ) : searchStatus === 'searching' ? (
                          <>
                            <div className="ceo-research-header">
                              <Globe size={14} className="ceo-research-icon" />
                              <span>Researching</span>
                            </div>
                            <div className="ceo-research-bars">
                              <div className="ceo-research-bar" style={{ animationDelay: '0s' }} />
                              <div className="ceo-research-bar" style={{ animationDelay: '0.2s' }} />
                              <div className="ceo-research-bar" style={{ animationDelay: '0.4s' }} />
                            </div>
                            <span className="ceo-research-label">Searching the web for relevant information<span className="ceo-dots"><span>.</span><span>.</span><span>.</span></span></span>
                          </>
                        ) : searchStatus === 'writing' ? (
                          <>
                            <div className="ceo-research-header">
                              <PenLine size={14} className="ceo-research-icon" />
                              <span>Writing</span>
                            </div>
                            <div className="ceo-research-bars">
                              <div className="ceo-research-bar ceo-research-bar--done" />
                              <div className="ceo-research-bar ceo-research-bar--done" />
                              <div className="ceo-research-bar ceo-research-bar--done" />
                            </div>
                            <span className="ceo-research-label">Composing response with research<span className="ceo-dots"><span>.</span><span>.</span><span>.</span></span></span>
                          </>
                        ) : msg.status ? (
                          <span className="ceo-thinking-text">{msg.status}<span className="ceo-dots"><span>.</span><span>.</span><span>.</span></span></span>
                        ) : (
                          <span className="ceo-thinking-text">thinking<span className="ceo-dots"><span>.</span><span>.</span><span>.</span></span></span>
                        )}
                      </div>
                    );
                  }
                  return (
                    <div key={msg.id} className="ceo-msg-group">
                      <div className={`ceo-bubble ceo-bubble--assistant ${msg.hasArtifact ? 'ceo-bubble--has-artifact' : ''}`}>
                        {msg.content && (
                          <div className="ceo-markdown">
                            <ReactMarkdown
                              remarkPlugins={[remarkGfm]}
                              components={{
                                table: ({ children, ...props }) => (
                                  <div className="ceo-table-scroll">
                                    <table {...props}>{children}</table>
                                  </div>
                                ),
                              }}
                            >
                              {msg.content}
                            </ReactMarkdown>
                          </div>
                        )}
                        {msg.hasArtifact && (
                          <div
                            className="ceo-artifact-card"
                            onClick={() => {
                              // Switch the panel to THIS message's frozen
                              // snapshot. Falls back to the live artifact if
                              // this message predates per-msg snapshots (e.g.
                              // legacy session loaded from an older DB row).
                              console.log(`[card] click ${msg.id} hasArtifact=${msg.hasArtifact} title="${msg.artifactTitle}" hasSnapshot=${!!msg.artifact}`);
                              setSelectedMsgId(msg.id);
                              setPanelOpen(true);
                              if (isMobile) setMobileArtifactOpen(true);
                            }}
                          >
                            <div className="ceo-artifact-card-left">
                              <FileText size={14} className="ceo-artifact-card-icon" />
                              <div className="ceo-artifact-card-marquee">
                                <span className="ceo-artifact-card-title">{msg.artifactTitle || 'View Artifact'}</span>
                              </div>
                            </div>
                            <span className="ceo-artifact-card-open">Open</span>
                          </div>
                        )}
                      </div>
                    </div>
                  );
                })}
                {currentQuestion && <div style={{ minHeight: 200, flexShrink: 0 }} />}
                <div ref={messagesEndRef} />
              </div>

              {/* Question popup overlay */}
              <div className={`ceo-question-overlay ${currentQuestion ? 'ceo-question-overlay--visible' : 'ceo-question-overlay--hidden'}`}>
                {currentQuestion && (
                  <>
                    <p className="ceo-question-text">{currentQuestion.question}</p>
                    {!customTyping ? (
                      <div className="ceo-question-options">
                        {currentQuestion.options.map((opt, i) => (
                          <button key={i} className="ceo-question-option" onClick={() => answerQuestion(opt)}>
                            {opt}
                          </button>
                        ))}
                        <button className="ceo-question-option ceo-question-option--custom" onClick={() => setCustomTyping(true)}>
                          Type your own...
                        </button>
                      </div>
                    ) : (
                      <div className="ceo-question-custom-row">
                        <input
                          className="ceo-question-custom-input"
                          placeholder="Type your answer..."
                          value={customText}
                          onChange={(e) => setCustomText(e.target.value)}
                          onKeyDown={(e) => { if (e.key === 'Enter' && customText.trim()) answerQuestion(customText); }}
                          autoFocus
                        />
                        <button className="ceo-question-custom-send" disabled={!customText.trim()} onClick={() => answerQuestion(customText)}>
                          <ArrowUp size={16} />
                        </button>
                      </div>
                    )}
                  </>
                )}
              </div>

              <div className="ceo-input-area ceo-input-area--bottom">
                <div className="ceo-input-glow" />
                <div className="ceo-input-wrapper">
                  <div className="ceo-input-top-row">
                    <div className="ceo-ctx-anchor" ref={ctxMenuRef}>
                      <button className="ceo-ctx-trigger" onClick={() => { setCtxMenuOpen((v) => !v); setHoveredCat(null); }}>
                        <Plus size={13} /> Add Context
                      </button>
                      {ctxMenuOpen && (
                        <div className="ceo-ctx-dropdown">
                          <div className="ceo-ctx-dropdown-header">Select Context</div>
                          {ceoContextCategories.map((cat) => {
                            const selectedCount = cat.items.filter((i) => selectedCtxItems.has(i.id)).length;
                            return (
                              <div
                                key={cat.id}
                                className={`ceo-ctx-cat ${hoveredCat === cat.id ? 'ceo-ctx-cat--active' : ''}`}
                                onMouseEnter={() => setHoveredCat(cat.id)}
                              >
                                <div className="ceo-ctx-cat-icon">
                                  <img src={cat.iconSrc} alt={cat.label} className="ceo-ctx-cat-img" />
                                </div>
                                <span className="ceo-ctx-cat-label">{cat.label}</span>
                                {selectedCount > 0 && (
                                  <span className="ceo-ctx-cat-badge">{selectedCount}</span>
                                )}
                                <ChevronRight size={13} className="ceo-ctx-cat-arrow" />
                                {hoveredCat === cat.id && (
                                  <div className="ceo-ctx-sub">
                                    <div className="ceo-ctx-sub-header">{cat.label}</div>
                                    {cat.items.map((item) => (
                                      <div
                                        key={item.id}
                                        className={`ceo-ctx-sub-item ${selectedCtxItems.has(item.id) ? 'ceo-ctx-sub-item--on' : ''}`}
                                        onClick={() => toggleCtxItem(item.id)}
                                      >
                                        <div className="ceo-ctx-sub-info">
                                          <span className="ceo-ctx-sub-name">{item.name}</span>
                                          <span className="ceo-ctx-sub-meta">
                                            {item.sub && <span>{item.sub}</span>}
                                            {item.sub && item.date && <span className="ceo-ctx-sub-dot" />}
                                            {item.date && <span>{item.date}</span>}
                                          </span>
                                        </div>
                                        <div className={`ceo-ctx-radio ${selectedCtxItems.has(item.id) ? 'ceo-ctx-radio--on' : ''}`}>
                                          <div className="ceo-ctx-radio-fill" />
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
                      className={`ceo-research-toggle ${researchMode ? 'ceo-research-toggle--active' : ''}`}
                      onClick={() => setResearchMode((v) => !v)}
                      title="Enable web research mode"
                    >
                      <Globe size={13} /> Research
                    </button>
                    <button
                      className={`ceo-research-toggle ceo-plan-toggle ${planMode ? 'ceo-research-toggle--active ceo-plan-toggle--active' : ''}`}
                      onClick={() => setPlanMode((v) => !v)}
                      title="Plan a week or month of content in one session instead of generating individual pieces"
                    >
                      <CalendarDays size={13} /> Plan mode
                    </button>
                    {selectedCtxItems.size > 0 && (
                      <div className="ceo-ctx-pills">
                        {getSelectedCtxDetails().map((item) => (
                          <span key={item.id} className="ceo-ctx-pill">
                            {item.name}
                            <button className="ceo-ctx-pill-x" onClick={() => toggleCtxItem(item.id)}>
                              <X size={10} />
                            </button>
                          </span>
                        ))}
                      </div>
                    )}
                  </div>
                  {attachedFiles.length > 0 && (
                    <div className="ceo-attached-files">
                      {attachedFiles.map((f) => (
                        <span
                          key={f.id}
                          className={`ceo-attached-pill ceo-attached-pill--${f.type} ${f.status === 'error' ? 'ceo-attached-pill--error' : ''} ${f.status === 'uploading' ? 'ceo-attached-pill--uploading' : ''}`}
                          title={f.status === 'error' ? (f.errorMessage || 'Upload failed') : f.name}
                        >
                          {f.type === 'image' && (f.dataUrl || f.url) ? (
                            <img src={f.dataUrl || f.url} alt={f.name} className="ceo-attached-thumb" />
                          ) : (
                            <FileText size={14} className="ceo-attached-icon" />
                          )}
                          <span className="ceo-attached-name">{f.name}</span>
                          {f.status === 'uploading' && (
                            <Loader2 size={12} className="ceo-attached-spinner" />
                          )}
                          {f.status === 'error' && (
                            <AlertCircle size={12} className="ceo-attached-err" />
                          )}
                          <button className="ceo-attached-x" onClick={() => removeAttachedFile(f.id)} title="Remove">
                            <X size={11} />
                          </button>
                        </span>
                      ))}
                    </div>
                  )}
                  <div className="ceo-input-bottom-row">
                    <textarea
                      className="ceo-input"
                      placeholder={planMode ? 'Plan a week or month of content...' : 'Ask your AI CEO...'}
                      value={input}
                      onChange={(e) => setInput(e.target.value)}
                      onInput={autoResize}
                      onKeyDown={handleKeyDown}
                      rows={1}
                    />
                    <div className="ceo-input-actions">
                      <button
                        className="ceo-attach-btn"
                        onClick={() => fileInputRef.current?.click()}
                        title="Attach files"
                      >
                        <Paperclip size={18} />
                      </button>
                      <input
                        ref={fileInputRef}
                        type="file"
                        multiple
                        accept="image/*,.pdf,.txt,.doc,.docx,.md,.csv,.json"
                        onChange={handleFileInputChange}
                        style={{ display: 'none' }}
                      />
                      <button
                        className={`ceo-voice-btn ${isListening ? 'ceo-voice-btn--active' : ''}`}
                        onClick={toggleVoice}
                        title={isListening ? 'Stop listening' : 'Voice input'}
                      >
                        {isListening ? <Square size={18} /> : <Mic size={18} />}
                      </button>
                      {isGenerating ? (
                        <button className="ceo-send-btn ceo-stop-btn" onClick={stopGenerating}>
                          <CircleStop size={18} />
                        </button>
                      ) : (
                        <button
                          className="ceo-send-btn"
                          onClick={sendMessage}
                          disabled={!input.trim() || hasPendingUploads}
                          title={hasPendingUploads ? 'Wait for attachments to finish uploading' : 'Send'}
                        >
                          <Send size={18} />
                        </button>
                      )}
                      {displayedArtifact && !showPanel && !isMobile && (
                        <button
                          className="ceo-panel-toggle"
                          onClick={() => setPanelOpen(true)}
                          title="Show artifact panel"
                        >
                          <PanelRightOpen size={18} />
                        </button>
                      )}
                    </div>
                  </div>
                </div>
              </div>
            </>
          )}
        </div>

        {/* ── Divider ── */}
        {showPanel && (
          <div
            className="ceo-divider"
            onMouseDown={(e) => { e.preventDefault(); setDragging(true); }}
            onTouchStart={(e) => { e.preventDefault(); setDragging(true); }}
          >
            <div className="ceo-divider-handle" />
          </div>
        )}

        {/* ── Artifact Panel (desktop) ── */}
        {showPanel && (
          <div className="ceo-artifact-panel" style={{ width: `${100 - splitPct}%` }}>
            <ArtifactPanel
              key={displayedArtifact?.id}
              artifact={displayedArtifact}
              emailAccounts={emailAccounts}
              user={user}
              brandDna={brandDna}
              isLinkedInConnected={isLinkedInConnected}
              onClose={() => setPanelOpen(false)}
              onChatMessage={(text) => setMessages(prev => [...prev, { id: `msg-${Date.now()}`, role: 'assistant', content: text }])}
              onContentChange={(html) => {
                // When viewing an old card's snapshot, route inline edits
                // (iframe text/link edits) into that message's snapshot so
                // its preview stays consistent. Otherwise update the live
                // artifact as before.
                if (selectedMsgId) {
                  setMessages(prev => prev.map(m =>
                    m.id === selectedMsgId && m.artifact
                      ? { ...m, artifact: { ...m.artifact, content: html } }
                      : m
                  ));
                } else {
                  setArtifact(prev => prev ? { ...prev, content: html } : prev);
                }
              }}
              onArtifactChange={(updater) => {
                // Canvas image upload / clear pushes patch updates back to
                // the artifact state so LinkedInPreview + SocialPreview can
                // reflect newly uploaded images without a round trip.
                const apply = typeof updater === 'function' ? updater : () => updater;
                if (selectedMsgId) {
                  setMessages(prev => prev.map(m => {
                    if (m.id !== selectedMsgId || !m.artifact) return m;
                    return { ...m, artifact: apply(m.artifact) };
                  }));
                } else {
                  setArtifact(prev => prev ? apply(prev) : prev);
                }
              }}
              sessionId={sessionId}
            />
          </div>
        )}
      </div>

      {/* ── Mobile: Artifact Overlay ── */}
      {isMobile && mobileArtifactOpen && displayedArtifact && (
        <div className="ceo-mobile-overlay">
          <ArtifactPanel
            key={`mobile-${displayedArtifact?.id}`}
            artifact={displayedArtifact}
            emailAccounts={emailAccounts}
            user={user}
            brandDna={brandDna}
            isLinkedInConnected={isLinkedInConnected}
            onClose={() => setMobileArtifactOpen(false)}
            onChatMessage={(text) => setMessages(prev => [...prev, { id: `msg-${Date.now()}`, role: 'assistant', content: text }])}
            onContentChange={(html) => {
              if (selectedMsgId) {
                setMessages(prev => prev.map(m =>
                  m.id === selectedMsgId && m.artifact
                    ? { ...m, artifact: { ...m.artifact, content: html } }
                    : m
                ));
              } else {
                setArtifact(prev => prev ? { ...prev, content: html } : prev);
              }
            }}
          />
        </div>
      )}
    </div>
  );
}
