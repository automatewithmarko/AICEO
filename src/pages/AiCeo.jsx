import { useState, useRef, useEffect, useCallback } from 'react';
import { useOutletContext, useParams, useNavigate } from 'react-router-dom';
import { Send, Mic, Square, CircleStop, PanelRightOpen, FileText, Plus, Globe, X, ChevronRight, Search, PenLine, ArrowUp, History, Pencil, Trash2 } from 'lucide-react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { generateImage, uploadImageToStorage, streamFromBackend, getTemplates, getEmails, getContentItems, getProducts } from '../lib/api';
import { getMeetings } from '../lib/meetings-api';
import { ARTIFACT_TYPES } from '../lib/artifacts';
import { supabase } from '../lib/supabase';
import ArtifactPanel from '../components/ArtifactPanel';
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

  const ERROR_IMG = 'data:image/svg+xml,' + encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" width="600" height="200" viewBox="0 0 600 200"><rect width="598" height="198" x="1" y="1" fill="#fff" rx="8" stroke="#dc2626" stroke-width="2"/><text x="300" y="105" text-anchor="middle" fill="#dc2626" font-family="Inter,system-ui,sans-serif" font-size="13" font-weight="600">Image generation failed</text></svg>');

  const total = matches.length;
  let completed = 0;
  let failed = 0;

  if (onProgress) onProgress({ completed: 0, failed: 0, total, done: false });

  // Fire all in parallel  -  returns a promise that resolves when ALL images are done
  const promise = Promise.all(matches.map(async (m) => {
    let imgSrc = null;
    try {
      const result = await generateImage(m.prompt.trim(), platform, null);
      if (result.image) {
        const uploaded = await uploadImageToStorage(result.image.data, result.image.mimeType);
        if (uploaded.url) imgSrc = uploaded.url;
      }
    } catch (err) {
      console.error('Image gen failed:', err.message);
    }

    completed++;
    if (!imgSrc) failed++;
    if (onProgress) onProgress({ completed, failed, total, done: completed === total });

    // Swap just the src value  -  keep the original <img> tag and all its styling intact
    if (setArtifactFn) {
      setArtifactFn(prev => {
        if (!prev?.content) return prev;
        const replacement = imgSrc || ERROR_IMG;
        const updated = prev.content.replaceAll(m.full, replacement);
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

// ── Component ──
export default function AiCeo() {
  const inboxCtx = useOutletContext() || {};
  const emailAccounts = inboxCtx.accounts || [];
  const { sessionId: urlSessionId } = useParams();
  const navigate = useNavigate();

  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState('');
  const [isListening, setIsListening] = useState(false);
  const [isGenerating, setIsGenerating] = useState(false);
  const [artifact, setArtifact] = useState(null);
  const [panelOpen, setPanelOpen] = useState(false);
  const [splitPct, setSplitPct] = useState(45);
  const [dragging, setDragging] = useState(false);
  const [isMobile, setIsMobile] = useState(typeof window !== 'undefined' ? window.innerWidth <= 768 : false);
  const [mobileArtifactOpen, setMobileArtifactOpen] = useState(false);
  const [ctxMenuOpen, setCtxMenuOpen] = useState(false);
  const [hoveredCat, setHoveredCat] = useState(null);
  const [selectedCtxItems, setSelectedCtxItems] = useState(new Set());
  const [researchMode, setResearchMode] = useState(false);
  const [searchStatus, setSearchStatus] = useState(null); // null | 'searching' | 'writing'
  const [currentQuestion, setCurrentQuestion] = useState(null); // { question, options }
  const [customTyping, setCustomTyping] = useState(false);
  const [customText, setCustomText] = useState('');
  const [sessionId, setSessionId] = useState(null);
  const [sessions, setSessions] = useState([]);
  const [showSessions, setShowSessions] = useState(false);
  const [renamingSessionId, setRenamingSessionId] = useState(null);
  const [renameDraft, setRenameDraft] = useState('');
  const [confirmDeleteId, setConfirmDeleteId] = useState(null);
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
  useEffect(() => { sessionsRef.current = sessions; }, [sessions]);

  const hasMessages = messages.length > 0;
  const showPanel = panelOpen && artifact && !isMobile;

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
    if (items.length === 0) return '';
    const parts = items.map((i) => `${i.catLabel}: "${i.name}"${i.sub ? ` (${i.sub})` : ''}${i.date ? `  -  ${i.date}` : ''}`);
    return `[CONTEXT  -  The user has selected the following items for reference:\n${parts.join('\n')}\nPrioritize this context when responding. Use it to inform your suggestions, decisions, and any generated content.]\n\n`;
  };

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
        ...(m.hasArtifact ? { hasArtifact: true, artifactTitle: m.artifactTitle, artifactType: m.artifactType } : {}),
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

      if (!upsertErr) {
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
    const loadedMessages = data.messages || [];
    const firstUser = loadedMessages.find((m) => m.role === 'user');
    const derivedTitle = firstUser?.content?.replace(/\[CONTEXT[^\]]*\]\n?/g, '').slice(0, 80) || 'New conversation';
    if (data.title && data.title !== derivedTitle) {
      customTitleIdsRef.current.add(data.id);
    }
    setSessionId(data.id);
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
    const assistantMsgId = `msg-${Date.now()}-ai`;
    setMessages(prev => [...prev, { id: assistantMsgId, role: 'assistant', content: '', hasArtifact: false }]);

    try {
      const abort = new AbortController();
      abortRef.current = abort;

      const apiMessages = chatHistory.map(m => ({ role: m.role, content: m.content }));

      // Pass current artifact HTML for editing support
      const currentArtifact = artifactRef.current;
      const hasHtmlArtifact = currentArtifact?.content && (currentArtifact.type === 'newsletter' || currentArtifact.type === 'html_template');

      await streamFromBackend('/api/orchestrate', {
        messages: apiMessages,
        mode: 'ceo',
        searchMode: researchMode,
        sessionId: sessionIdRef.current || null,
        assistantMsgId,
        ...(hasHtmlArtifact ? { currentHtml: currentArtifact.content, currentAgent: currentArtifact.agentSource || 'newsletter' } : {}),
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
            if (html.length > 50) {
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
              setArtifact(prev => ({
                id: prev?.id || Date.now(),
                type: isNewsletter ? 'newsletter' : 'html_template',
                title: hasImages ? finalTitle : (parsed.summary || finalTitle),
                content: html,
                images: [],
                agentSource: agentName,
              }));
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
              setArtifact({
                id: Date.now(),
                type: isNewsletter ? 'newsletter' : 'html_template',
                title: `${agentName} output`,
                content: rawHtml,
                images: [],
                agentSource: agentName,
              });
              setPanelOpen(true);
              if (isMobileRef.current) setMobileArtifactOpen(true);
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
        // Direct tool calls (create_artifact, generate_image)
        onToolCall: async (name, args) => {
          if (name === 'create_artifact') {
            setArtifact({
              id: Date.now(),
              type: args.type,
              title: args.title,
              content: args.content,
              images: [],
            });
            setPanelOpen(true);
            if (isMobileRef.current) setMobileArtifactOpen(true);
            setMessages(prev => prev.map(m =>
              m.id === assistantMsgId ? { ...m, hasArtifact: true, artifactTitle: args.title, artifactType: args.type } : m
            ));
          }
          if (name === 'generate_image') {
            try {
              const result = await generateImage(args.prompt, 'general', null);
              if (result.image) {
                const src = `data:${result.image.mimeType};base64,${result.image.data}`;
                setArtifact(prev => {
                  if (prev) return { ...prev, images: [...(prev.images || []), { src }] };
                  const newArt = { id: Date.now(), type: 'content_post', title: 'Generated Image', content: '', images: [{ src }] };
                  setPanelOpen(true);
                  if (isMobileRef.current) setMobileArtifactOpen(true);
                  return newArt;
                });
              }
            } catch (e) {
              console.error('Image gen error:', e);
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
            setMessages(prev => prev.map(m =>
              m.id === assistantMsgId ? { ...m, content: summary, hasArtifact: true, artifactTitle: 'Updated newsletter' } : m
            ));
          }
        },
        onAskUser: (question, options) => {
          console.log('[AiCeo] onAskUser fired:', { question, options, isGenerating });
          askUserFiredRef.current = true;
          setCurrentQuestion({ question, options });
          setCustomTyping(false);
          setCustomText('');
          // Save the question as the assistant's message so it appears in conversation history
          setMessages(prev => prev.map(m =>
            m.id === assistantMsgId ? { ...m, content: question, status: null } : m
          ));
        },
      }, abort.signal);
    } catch (err) {
      if (err.name !== 'AbortError') {
        setMessages(prev => prev.map(m =>
          m.id === assistantMsgId
            ? { ...m, content: 'Something went wrong. Please try again.' }
            : m
        ));
      }
    } finally {
      abortRef.current = null;
      // Wait for any pending image generation before marking as complete
      if (pendingImagesRef.current.length > 0) {
        const pending = [...pendingImagesRef.current];
        pendingImagesRef.current = [];
        await Promise.allSettled(pending);
      }
      // Fallback: if the model wrote a question as plain text instead of using ask_user,
      // detect it and convert to a popup. Use askUserFiredRef to avoid overwriting
      // a real ask_user popup that already arrived during the stream.
      if (!askUserFiredRef.current) {
        setMessages(prev => {
          const lastMsg = prev.find(m => m.id === assistantMsgId);
          if (lastMsg?.content) {
            const text = lastMsg.content.trim();
            // Check for numbered options pattern: "1. Option\n2. Option\n3. Option"
            const numberedMatch = text.match(/([\s\S]*?\?)\s*\n((?:\s*\d+[.)]\s*.+\n?){2,})/);
            if (numberedMatch) {
              const q = numberedMatch[1].trim();
              const opts = numberedMatch[2].trim().split('\n').map(l => l.replace(/^\s*\d+[.)]\s*/, '').trim()).filter(Boolean);
              if (opts.length >= 2) {
                console.log('[AiCeo] Fallback: converted plain-text question to popup:', q, opts);
                setCurrentQuestion({ question: q, options: opts });
                setCustomTyping(false);
                setCustomText('');
                return prev;
              }
            }
            // Check for bullet options: "- Option\n- Option"
            const bulletMatch = text.match(/([\s\S]*?\?)\s*\n((?:\s*[-•]\s*.+\n?){2,})/);
            if (bulletMatch) {
              const q = bulletMatch[1].trim();
              const opts = bulletMatch[2].trim().split('\n').map(l => l.replace(/^\s*[-•]\s*/, '').trim()).filter(Boolean);
              if (opts.length >= 2) {
                console.log('[AiCeo] Fallback: converted bullet question to popup:', q, opts);
                setCurrentQuestion({ question: q, options: opts });
                setCustomTyping(false);
                setCustomText('');
                return prev;
              }
            }
            // Check for bare question (short text ending with ?)
            if (text.endsWith('?') && text.length < 200) {
              console.log('[AiCeo] Fallback: bare question detected, showing custom input:', text);
              setCurrentQuestion({ question: text, options: [] });
              setCustomTyping(true);
              setCustomText('');
              return prev;
            }
          }
          return prev;
        });
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
    const userMsg = { id: `msg-${Date.now()}-user`, role: 'user', content: userContent };
    const updated = [...messages, userMsg];
    setMessages(updated);
    sendToAI(updated);
  }, [isGenerating, messages, sendToAI, selectedCtxItems, ceoContextCategories]);

  const sendMessage = useCallback(() => {
    const text = input.trim();
    if (!text || isGenerating) return;
    setCurrentQuestion(null);
    shouldScrollRef.current = true;
    const contextStr = buildCeoContextString();
    const userContent = contextStr + text;
    const userMsg = { id: `msg-${Date.now()}-user`, role: 'user', content: userContent };
    const updated = [...messages, userMsg];
    setMessages(updated);
    setInput('');
    // Reset textarea height
    const textarea = document.querySelector('.ceo-input-area--bottom .ceo-input');
    if (textarea) textarea.style.height = 'auto';
    sendToAI(updated);
  }, [input, isGenerating, messages, sendToAI, selectedCtxItems, ceoContextCategories]);

  const handleStarter = useCallback((text) => {
    if (isGenerating) return;
    shouldScrollRef.current = true;
    const contextStr = buildCeoContextString();
    const userContent = contextStr + text;
    const userMsg = { id: `msg-${Date.now()}-user`, role: 'user', content: userContent };
    const updated = [userMsg];
    setMessages(updated);
    sendToAI(updated);
  }, [isGenerating, sendToAI, selectedCtxItems, ceoContextCategories]);

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

  // ── Render ──
  return (
    <div className="ceo-page">
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
                  <div className="ceo-input-bottom-row">
                    <textarea
                      ref={inputRef}
                      className="ceo-input"
                      placeholder="How can your AI CEO help you?"
                      value={input}
                      onChange={(e) => setInput(e.target.value)}
                      onInput={autoResize}
                      onKeyDown={handleKeyDown}
                      rows={3}
                    />
                    <div className="ceo-input-actions">
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
                        disabled={!input.trim() || isGenerating}
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
                    return (
                      <div key={msg.id} className="ceo-bubble ceo-bubble--user">
                        <p className="ceo-user-text">{msg.content}</p>
                      </div>
                    );
                  }
                  if (!msg.content && !msg.hasArtifact) {
                    return (
                      <div key={msg.id} className={searchStatus === 'searching' ? 'ceo-research-card' : 'ceo-thinking'}>
                        {searchStatus === 'searching' ? (
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
                  <div className="ceo-input-bottom-row">
                    <textarea
                      className="ceo-input"
                      placeholder="Ask your AI CEO..."
                      value={input}
                      onChange={(e) => setInput(e.target.value)}
                      onInput={autoResize}
                      onKeyDown={handleKeyDown}
                      rows={1}
                    />
                    <div className="ceo-input-actions">
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
                          disabled={!input.trim()}
                        >
                          <Send size={18} />
                        </button>
                      )}
                      {artifact && !showPanel && !isMobile && (
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
              key={artifact?.id}
              artifact={artifact}
              emailAccounts={emailAccounts}
              onClose={() => setPanelOpen(false)}
              onChatMessage={(text) => setMessages(prev => [...prev, { id: `msg-${Date.now()}`, role: 'assistant', content: text }])}
              onContentChange={(html) => setArtifact(prev => prev ? { ...prev, content: html } : prev)}
              sessionId={sessionId}
            />
          </div>
        )}
      </div>

      {/* ── Mobile: Artifact Overlay ── */}
      {isMobile && mobileArtifactOpen && artifact && (
        <div className="ceo-mobile-overlay">
          <ArtifactPanel
            key={`mobile-${artifact?.id}`}
            artifact={artifact}
            emailAccounts={emailAccounts}
            onClose={() => setMobileArtifactOpen(false)}
            onChatMessage={(text) => setMessages(prev => [...prev, { id: `msg-${Date.now()}`, role: 'assistant', content: text }])}
            onContentChange={(html) => setArtifact(prev => prev ? { ...prev, content: html } : prev)}
          />
        </div>
      )}
    </div>
  );
}
