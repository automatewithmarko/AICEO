import { useState, useRef, useEffect, useCallback } from 'react';
import { useOutletContext } from 'react-router-dom';
import { Send, Mic, Square, CircleStop, PanelRightOpen, FileText, Plus, Globe, X, ChevronRight, Search, PenLine, ArrowUp } from 'lucide-react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { generateImage, uploadImageToStorage, streamFromBackend } from '../lib/api';
import { ARTIFACT_TYPES } from '../lib/artifacts';
import ArtifactPanel from '../components/ArtifactPanel';
import './AiCeo.css';

// CEO prompt and tools are now handled server-side via /api/orchestrate

// Generate AI images for {{GENERATE:prompt}} placeholders in newsletter HTML
// Images are uploaded to Supabase storage and replaced with public URLs (not base64)
async function generateNewsletterImages(html, setArtifactFn) {
  const regex = /\{\{GENERATE:(.*?)\}\}/g;
  const matches = [];
  let match;
  while ((match = regex.exec(html)) !== null) {
    matches.push({ full: match[0], prompt: match[1] });
  }
  if (matches.length === 0) return html;

  let updatedHtml = html;

  // Generate and upload images in parallel
  const results = await Promise.allSettled(
    matches.map(async (m) => {
      try {
        const result = await generateImage(m.prompt.trim(), 'general', null);
        if (result.image) {
          // Upload to Supabase storage, get public URL
          const uploaded = await uploadImageToStorage(result.image.data, result.image.mimeType);
          if (uploaded.url) {
            return { placeholder: m.full, src: uploaded.url };
          }
        }
      } catch (err) {
        console.error('Newsletter image gen/upload failed:', err);
      }
      return null;
    })
  );

  // Replace placeholders with public URLs
  for (const r of results) {
    if (r.status === 'fulfilled' && r.value) {
      updatedHtml = updatedHtml.replace(r.value.placeholder, r.value.src);
      if (setArtifactFn) {
        const currentHtml = updatedHtml;
        setArtifactFn(prev => prev ? { ...prev, content: currentHtml } : prev);
      }
    }
  }
  return updatedHtml;
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

  const messagesEndRef = useRef(null);
  const messagesContainerRef = useRef(null);
  const inputRef = useRef(null);
  const recognitionRef = useRef(null);
  const abortRef = useRef(null);
  const splitRef = useRef(null);
  const isMobileRef = useRef(isMobile);
  const ctxMenuRef = useRef(null);
  const artifactRef = useRef(null);

  const hasMessages = messages.length > 0;
  const showPanel = panelOpen && artifact && !isMobile;

  const starters = [
    'Draft an email to follow up with my leads about my top product.',
    'Create a newsletter announcing my latest offer to my audience.',
    'Write a LinkedIn post highlighting my business growth.',
    'Build a strategy to increase my conversion rate this month.',
  ];

  const CEO_CONTEXT_CATEGORIES = [
    {
      id: 'newsletters', label: 'Past Newsletters', iconSrc: '/icon-marketing.png',
      items: [
        { id: 'nl-1', name: 'Weekly Growth Tips #42', date: 'Mar 3' },
        { id: 'nl-2', name: 'Product Launch Announcement', date: 'Feb 24' },
        { id: 'nl-3', name: 'Year-End Recap & Vision', date: 'Feb 10' },
      ],
    },
    {
      id: 'emails', label: 'Past Emails', iconSrc: '/icon-inbox.png',
      items: [
        { id: 'em-1', name: 'Re: Partnership Proposal', date: 'Mar 8', sub: 'client@example.com' },
        { id: 'em-2', name: 'Invoice Follow-up', date: 'Mar 5', sub: 'billing@example.com' },
      ],
    },
    {
      id: 'calls', label: 'Calls', iconSrc: '/icon-call-recording.png',
      items: [
        { id: 'cl-1', name: 'Sales Discovery Call', date: 'Mar 7', sub: 'Sales Call' },
        { id: 'cl-2', name: 'Client Onboarding', date: 'Mar 4', sub: 'Onboarding' },
      ],
    },
    {
      id: 'content', label: 'Content', iconSrc: '/icon-create-content.png',
      items: [
        { id: 'ct-1', name: '5 Tips for Scaling Your Biz', date: 'Mar 6', sub: 'Instagram' },
        { id: 'ct-2', name: 'Behind the Scenes — My Morning', date: 'Mar 4', sub: 'YouTube' },
      ],
    },
    {
      id: 'products', label: 'Products', iconSrc: '/icon-products.png',
      items: [
        { id: 'pr-1', name: '1:1 Coaching Program', sub: 'Coaching · $500' },
        { id: 'pr-2', name: 'Growth Masterclass', sub: 'Course · $197' },
      ],
    },
  ];

  const toggleCtxItem = (id) => {
    setSelectedCtxItems((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  };

  const getSelectedCtxDetails = () => {
    const all = [];
    for (const cat of CEO_CONTEXT_CATEGORIES) {
      for (const item of cat.items) {
        if (selectedCtxItems.has(item.id)) all.push(item);
      }
    }
    return all;
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

  // ── Auto-scroll — only when user sends a message or generation starts ──
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
        ...(hasHtmlArtifact ? { currentHtml: currentArtifact.content, currentAgent: currentArtifact.agentSource || 'newsletter' } : {}),
      }, {
        // CEO text streaming
        onTextDelta: (content) => {
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
              setArtifact(prev => ({
                id: prev?.id || Date.now(),
                type: isNewsletter ? 'newsletter' : 'html_template',
                title: `${agentName} output`,
                content: html,
                images: prev?.images || [],
                agentSource: agentName,
              }));
              setPanelOpen(true);
              if (isMobileRef.current) setMobileArtifactOpen(true);
              setMessages(prev => prev.map(m =>
                m.id === assistantMsgId ? { ...m, hasArtifact: true, artifactTitle: `${agentName} output`, artifactType: 'html_template' } : m
              ));
            }
          }
        },
        // Agent finished — parse final result
        onAgentResult: (agentName, content) => {
          try {
            const parsed = JSON.parse(content);
            // Section-based edit — merge only changed sections into current artifact HTML
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
              setArtifact({
                id: Date.now(),
                type: isNewsletter ? 'newsletter' : 'html_template',
                title: parsed.summary || `${agentName} output`,
                content: html,
                images: [],
                agentSource: agentName,
              });
              setPanelOpen(true);
              if (isMobileRef.current) setMobileArtifactOpen(true);
              setMessages(prev => prev.map(m =>
                m.id === assistantMsgId ? { ...m, hasArtifact: true, artifactTitle: parsed.summary || `${agentName} output`, artifactType: 'html_template' } : m
              ));

              // Generate AI images for {{GENERATE:...}} placeholders
              if (html && html.includes('{{GENERATE:')) {
                generateNewsletterImages(html, setArtifact).catch(err => {
                  console.error('Newsletter image generation failed:', err);
                });
              }
            }
            if (parsed.type === 'story_sequence' && parsed.frames) {
              setArtifact({
                id: Date.now(),
                type: 'story_sequence',
                title: parsed.summary || 'Story Sequence',
                content: JSON.stringify(parsed),
                frames: parsed.frames,
                images: [],
              });
              setPanelOpen(true);
              if (isMobileRef.current) setMobileArtifactOpen(true);
            }
          } catch {
            // Not JSON — treat as raw content
            if (content.includes('<!DOCTYPE') || content.includes('<html')) {
              setArtifact({
                id: Date.now(),
                type: 'html_template',
                title: `${agentName} output`,
                content,
                images: [],
              });
              setPanelOpen(true);
              if (isMobileRef.current) setMobileArtifactOpen(true);
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
    const userMsg = { id: `msg-${Date.now()}-user`, role: 'user', content: answer.trim() };
    const updated = [...messages, userMsg];
    setMessages(updated);
    sendToAI(updated);
  }, [isGenerating, messages, sendToAI]);

  const sendMessage = useCallback(() => {
    const text = input.trim();
    if (!text || isGenerating) return;
    setCurrentQuestion(null);
    shouldScrollRef.current = true;
    const userMsg = { id: `msg-${Date.now()}-user`, role: 'user', content: text };
    const updated = [...messages, userMsg];
    setMessages(updated);
    setInput('');
    // Reset textarea height
    const textarea = document.querySelector('.ceo-input-area--bottom .ceo-input');
    if (textarea) textarea.style.height = 'auto';
    sendToAI(updated);
  }, [input, isGenerating, messages, sendToAI]);

  const handleStarter = useCallback((text) => {
    if (isGenerating) return;
    shouldScrollRef.current = true;
    const userMsg = { id: `msg-${Date.now()}-user`, role: 'user', content: text };
    const updated = [userMsg];
    setMessages(updated);
    sendToAI(updated);
  }, [isGenerating, sendToAI]);

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
                  <div className="ceo-input-top-row">
                    <div className="ceo-ctx-anchor" ref={ctxMenuRef}>
                      <button className="ceo-ctx-trigger" onClick={() => { setCtxMenuOpen((v) => !v); setHoveredCat(null); }}>
                        <Plus size={13} /> Add Context
                      </button>
                      {ctxMenuOpen && (
                        <div className="ceo-ctx-dropdown">
                          <div className="ceo-ctx-dropdown-header">Select Context</div>
                          {CEO_CONTEXT_CATEGORIES.map((cat) => {
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
                      <div key={msg.id} className="ceo-thinking">
                        <span className="ceo-thinking-text">
                          {searchStatus === 'searching' ? (
                            <><Search size={14} /> Searching the web<span className="ceo-dots"><span>.</span><span>.</span><span>.</span></span></>
                          ) : searchStatus === 'writing' ? (
                            <><PenLine size={14} /> Writing response<span className="ceo-dots"><span>.</span><span>.</span><span>.</span></span></>
                          ) : (
                            <>thinking<span className="ceo-dots"><span>.</span><span>.</span><span>.</span></span></>
                          )}
                        </span>
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
                          {CEO_CONTEXT_CATEGORIES.map((cat) => {
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
          />
        </div>
      )}
    </div>
  );
}
