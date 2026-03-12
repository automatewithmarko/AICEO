import { useState, useRef, useEffect, useCallback } from 'react';
import { useOutletContext } from 'react-router-dom';
import { Send, Mic, Square, CircleStop, PanelRightOpen, FileText, Plus, Globe, X, ChevronRight } from 'lucide-react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { supabase } from '../lib/supabase';
import { getContentItems, getIntegrationContext, getSalesStats, getSalesRevenue, getSalesCalls, getProducts, getContacts, getOutlierCreators, getOutlierVideos, generateImage } from '../lib/api';
import { ARTIFACT_TYPES } from '../lib/artifacts';
import ArtifactPanel from '../components/ArtifactPanel';
import './AiCeo.css';

// ── System Prompt ──
const BASE_PROMPT = `You are the AI CEO of the user's business, powered by PuerlyPersonal. You have FULL access to their business data — brand identity, content library, sales numbers, products, contacts, call transcripts, and outlier content research. You help them with content creation, marketing strategy, sales optimization, and overall business growth. Be direct, actionable, and strategic. Speak like a sharp, experienced CEO who genuinely cares about the user's revenue and growth. Use markdown formatting with headers, tables, bullet points, and bold text to make your analysis clear and scannable.

IMPORTANT: You already have the user's data loaded below. Reference it directly — don't ask them to provide information you already have.

=== COMMAND CENTER CAPABILITIES ===
You have tools to CREATE tangible outputs in a split-screen artifact panel next to this chat:

**create_artifact** — Use when the user asks you to MAKE something:
- "Write an email to..." → type: "email", content: JSON string {"to":"recipient@email.com","subject":"Subject","body_html":"<p>HTML body</p>"}
- "Create a newsletter" / "Build a landing page" → type: "html_template", content: complete standalone HTML with inline CSS
- "Write a post for Instagram/LinkedIn/etc" → type: "content_post", content: the caption text with hashtags
- "Write code for..." → type: "code_block", content: the code
- "Draft a plan/strategy/report" → type: "markdown_doc", content: markdown text

**generate_image** — Use for visual content: social graphics, thumbnails, etc.

WHEN TO CREATE AN ARTIFACT vs JUST REPLY:
- User asks to CREATE/WRITE/BUILD/DRAFT something tangible → use create_artifact
- User asks a QUESTION or wants ANALYSIS/ADVICE → reply in text only
- You CAN combine text + artifact: explain your approach, then create it

ARTIFACT RULES:
- For emails: write professional, well-formatted HTML. Include greeting and sign-off. Use brand colors if available.
- For html_template: generate complete standalone HTML (<!DOCTYPE html>) with inline CSS. Make it beautiful and production-ready. Max-width 600px for emails, 1200px for landing pages.
- For content_post: write the actual caption ready to copy-paste. Include relevant hashtags.
- For code_block: include the language name at the top as a comment.
- For markdown_doc: use proper heading hierarchy and formatting.
- Always ask for missing critical info (like email recipient) before creating the artifact.
- When generating images for content, call generate_image in addition to create_artifact.`;

function buildFullSystemPrompt(brandDna, contentItems, integrationCtx, salesData, products, contacts, outlierData) {
  let prompt = BASE_PROMPT + '\n\n';

  if (brandDna) {
    prompt += `=== BRAND DNA ===\n`;
    if (brandDna.description) prompt += `Description: ${brandDna.description}\n`;
    if (brandDna.main_font) prompt += `Main Font: ${brandDna.main_font}\n`;
    if (brandDna.secondary_font) prompt += `Secondary Font: ${brandDna.secondary_font}\n`;
    if (brandDna.colors && Object.keys(brandDna.colors).length) {
      const c = brandDna.colors;
      if (c.primary) prompt += `Primary Color: ${c.primary}\n`;
      if (c.text) prompt += `Text Color: ${c.text}\n`;
      if (c.secondary) prompt += `Secondary Color: ${c.secondary}\n`;
    }
    if (brandDna.photo_urls?.length) prompt += `Brand Photos: ${brandDna.photo_urls.length} photos uploaded\n`;
    if (brandDna.logo_url) prompt += `Logo: uploaded\n`;
    if (brandDna.documents && Object.keys(brandDna.documents).length) {
      for (const [key, doc] of Object.entries(brandDna.documents)) {
        if (doc.extracted_text) {
          const label = key.replace(/([A-Z])/g, ' $1').replace(/^./, s => s.toUpperCase());
          prompt += `\n--- ${label} ---\n${doc.extracted_text.slice(0, 3000)}\n`;
        }
      }
    }
    prompt += '\n';
  }

  if (contentItems?.length) {
    const docs = contentItems.filter(i => i.type === 'document' && i.extracted_text);
    const social = contentItems.filter(i => i.type === 'social');
    const videos = contentItems.filter(i => i.transcript);

    if (docs.length) {
      prompt += `=== UPLOADED DOCUMENTS ===\n`;
      docs.forEach((doc, i) => {
        prompt += `--- ${doc.filename || `Document ${i + 1}`} ---\n${doc.extracted_text.slice(0, 3000)}\n\n`;
      });
    }
    if (social.length) {
      prompt += `=== SOCIAL MEDIA REFERENCES ===\n`;
      social.forEach(item => {
        const m = item.metadata || {};
        prompt += `--- ${m.title || item.url} ---\n`;
        prompt += `URL: ${item.url}\n`;
        if (m.platform) prompt += `Platform: ${m.platform}\n`;
        if (m.uploader) prompt += `Creator: ${m.uploader}\n`;
        if (m.description) prompt += `Description: ${m.description.slice(0, 1000)}\n`;
        if (item.transcript) prompt += `Transcript:\n${item.transcript.slice(0, 3000)}\n`;
        prompt += '\n';
      });
    }
    if (videos.length) {
      prompt += `=== VIDEO TRANSCRIPTS ===\n`;
      videos.forEach(v => {
        prompt += `--- ${v.filename || v.url || 'Video'} ---\n${v.transcript.slice(0, 3000)}\n\n`;
      });
    }
  }

  if (integrationCtx) {
    prompt += `=== BUSINESS DATA FROM INTEGRATIONS ===\n${integrationCtx}\n\n`;
  }

  if (salesData) {
    if (salesData.stats && Object.keys(salesData.stats).length) {
      prompt += `=== SALES STATS ===\n`;
      const s = salesData.stats;
      if (s.total_revenue != null) prompt += `Total Revenue: $${Number(s.total_revenue).toLocaleString()}\n`;
      if (s.total_sales != null) prompt += `Total Sales: ${s.total_sales}\n`;
      if (s.avg_deal_size != null) prompt += `Avg Deal Size: $${Number(s.avg_deal_size).toLocaleString()}\n`;
      if (s.conversion_rate != null) prompt += `Conversion Rate: ${s.conversion_rate}%\n`;
      prompt += '\n';
    }
    if (salesData.revenue?.length) {
      prompt += `=== MONTHLY REVENUE ===\n`;
      salesData.revenue.slice(0, 12).forEach(r => {
        prompt += `${r.period || r.month}: $${Number(r.revenue || r.amount || 0).toLocaleString()}\n`;
      });
      prompt += '\n';
    }
    if (salesData.calls?.length) {
      prompt += `=== RECENT SALES CALLS (${salesData.calls.length}) ===\n`;
      salesData.calls.slice(0, 20).forEach(call => {
        prompt += `--- ${call.contact_name || call.title || 'Call'} (${call.date || call.created_at?.slice(0, 10) || 'unknown'}) ---\n`;
        if (call.outcome) prompt += `Outcome: ${call.outcome}\n`;
        if (call.notes) prompt += `Notes: ${call.notes.slice(0, 500)}\n`;
        if (call.transcript) prompt += `Transcript: ${call.transcript.slice(0, 2000)}\n`;
        prompt += '\n';
      });
    }
  }

  if (products?.length) {
    prompt += `=== PRODUCTS (${products.length}) ===\n`;
    products.forEach(p => {
      prompt += `- ${p.name}: $${p.price || 0}`;
      if (p.description) prompt += ` — ${p.description.slice(0, 200)}`;
      if (p.total_sales != null) prompt += ` (${p.total_sales} sales)`;
      prompt += '\n';
    });
    prompt += '\n';
  }

  if (contacts?.length) {
    prompt += `=== CONTACTS / CRM (${contacts.length}) ===\n`;
    contacts.slice(0, 50).forEach(c => {
      prompt += `- ${c.name || c.email}`;
      if (c.company) prompt += ` @ ${c.company}`;
      if (c.stage || c.status) prompt += ` [${c.stage || c.status}]`;
      if (c.deal_value) prompt += ` ($${Number(c.deal_value).toLocaleString()})`;
      prompt += '\n';
    });
    prompt += '\n';
  }

  if (outlierData) {
    if (outlierData.creators?.length) {
      prompt += `=== OUTLIER RESEARCH — CREATORS FOLLOWED (${outlierData.creators.length}) ===\n`;
      outlierData.creators.forEach(c => {
        prompt += `- ${c.display_name || c.username} (${c.platform})`;
        if (c.avg_views) prompt += ` — avg ${Number(c.avg_views).toLocaleString()} views`;
        prompt += '\n';
      });
      prompt += '\n';
    }
    if (outlierData.videos?.length) {
      prompt += `=== TOP OUTLIER VIDEOS (${outlierData.videos.length}) ===\n`;
      outlierData.videos.slice(0, 15).forEach(v => {
        prompt += `- "${v.title}" by ${v.outlier_creators?.display_name || v.outlier_creators?.username || 'unknown'}`;
        if (v.views) prompt += ` — ${Number(v.views).toLocaleString()} views`;
        if (v.views_multiplier) prompt += ` (${v.views_multiplier.toFixed(1)}x avg)`;
        prompt += '\n';
      });
      prompt += '\n';
    }
  }

  return prompt;
}

// ── Tool Definitions ──
const CEO_TOOLS = [
  {
    type: 'function',
    function: {
      name: 'create_artifact',
      description: 'Create a visual artifact in the split-screen panel. Use for emails, HTML templates (newsletters/landing pages), social media posts, code, or documents.',
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
            description: 'Short descriptive title for the artifact.',
          },
          content: {
            type: 'string',
            description: 'The artifact content. email: JSON string {"to":"...","subject":"...","body_html":"..."}. html_template: complete standalone HTML. content_post: caption text. code_block: code. markdown_doc: markdown.',
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
            description: 'Detailed image prompt: style, subject, composition, colors, text overlays. Must be professional quality.',
          },
        },
        required: ['prompt'],
      },
    },
  },
];

// ── Streaming with Tool Calls ──
async function streamWithTools(messages, systemPrompt, onTextChunk, onToolCalls, abortSignal) {
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
      tools: CEO_TOOLS,
      tool_choice: 'auto',
    }),
    signal: abortSignal,
  });

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
        if (textDelta) {
          fullContent += textDelta;
          onTextChunk(fullContent);
        }

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
      } catch { /* skip malformed */ }
    }
  }

  const calls = Object.values(toolCalls).filter(tc => tc.name);
  if (calls.length > 0) await onToolCalls(calls);

  return { content: fullContent, toolCalls: calls };
}

// ── Component ──
export default function AiCeo() {
  const inboxCtx = useOutletContext() || {};
  const emailAccounts = inboxCtx.accounts || [];

  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState('');
  const [isListening, setIsListening] = useState(false);
  const [isGenerating, setIsGenerating] = useState(false);
  const [contextReady, setContextReady] = useState(false);
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

  const messagesEndRef = useRef(null);
  const inputRef = useRef(null);
  const recognitionRef = useRef(null);
  const abortRef = useRef(null);
  const splitRef = useRef(null);
  const isMobileRef = useRef(isMobile);
  const ctxMenuRef = useRef(null);
  const contextRef = useRef({
    brandDna: null,
    contentItems: [],
    integrationCtx: '',
    salesData: null,
    products: [],
    contacts: [],
    outlierData: null,
  });

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

  // ── Responsive ──
  useEffect(() => {
    isMobileRef.current = isMobile;
  }, [isMobile]);

  useEffect(() => {
    const handleResize = () => setIsMobile(window.innerWidth <= 768);
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  // ── Fetch Business Context ──
  useEffect(() => {
    async function loadContext() {
      const results = await Promise.allSettled([
        supabase.auth.getSession().then(async ({ data: { session } }) => {
          if (!session?.user) return null;
          const { data } = await supabase.from('brand_dna').select('*').eq('user_id', session.user.id).single();
          return data;
        }),
        getContentItems().then(r => r.items || []),
        getIntegrationContext().then(r => r.context || ''),
        getSalesStats().then(r => r.stats || {}),
        getSalesRevenue('Month').then(r => r.data || []),
        getSalesCalls().then(r => r.calls || []),
        getProducts().then(r => r.products || []),
        getContacts().then(r => r.contacts || []),
        getOutlierCreators().then(r => r.creators || []),
        getOutlierVideos({ outliersOnly: true }).then(r => r.videos || []),
      ]);

      const val = (i) => results[i].status === 'fulfilled' ? results[i].value : null;

      contextRef.current = {
        brandDna: val(0),
        contentItems: val(1) || [],
        integrationCtx: val(2) || '',
        salesData: {
          stats: val(3) || {},
          revenue: val(4) || [],
          calls: val(5) || [],
        },
        products: val(6) || [],
        contacts: val(7) || [],
        outlierData: {
          creators: val(8) || [],
          videos: val(9) || [],
        },
      };

      setContextReady(true);
    }
    loadContext();
  }, []);

  // ── Auto-scroll ──
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
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

  // ── Send to AI ──
  const sendToAI = useCallback(async (chatHistory) => {
    setIsGenerating(true);
    const assistantMsgId = `msg-${Date.now()}-ai`;
    setMessages(prev => [...prev, { id: assistantMsgId, role: 'assistant', content: '', hasArtifact: false }]);

    try {
      const abort = new AbortController();
      abortRef.current = abort;

      const apiMessages = chatHistory.map(m => ({ role: m.role, content: m.content }));
      const ctx = contextRef.current;
      const systemPrompt = buildFullSystemPrompt(
        ctx.brandDna, ctx.contentItems, ctx.integrationCtx,
        ctx.salesData, ctx.products, ctx.contacts, ctx.outlierData,
      );

      await streamWithTools(
        apiMessages,
        systemPrompt,
        // onTextChunk
        (text) => {
          setMessages(prev => prev.map(m =>
            m.id === assistantMsgId ? { ...m, content: text } : m
          ));
        },
        // onToolCalls
        async (calls) => {
          let createdArtifact = null;

          for (const call of calls) {
            if (call.name === 'create_artifact') {
              try {
                const args = JSON.parse(call.arguments);
                createdArtifact = {
                  id: Date.now(),
                  type: args.type,
                  title: args.title,
                  content: args.content,
                  images: [],
                };
                setArtifact(createdArtifact);
                setPanelOpen(true);
                if (isMobileRef.current) setMobileArtifactOpen(true);
                // Mark message as having an artifact
                setMessages(prev => prev.map(m =>
                  m.id === assistantMsgId ? { ...m, hasArtifact: true, artifactTitle: args.title, artifactType: args.type } : m
                ));
              } catch (e) {
                console.error('Artifact parse error:', e);
              }
            }
          }

          // Process image generation calls
          for (const call of calls) {
            if (call.name === 'generate_image') {
              try {
                const args = JSON.parse(call.arguments);
                const brandData = ctx.brandDna ? {
                  photoUrls: ctx.brandDna.photo_urls || [],
                  logoUrl: ctx.brandDna.logo_url || null,
                  colors: ctx.brandDna.colors || {},
                  mainFont: ctx.brandDna.main_font || null,
                } : null;
                const result = await generateImage(args.prompt, 'general', brandData);
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
          }
        },
        abort.signal,
      );
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
  }, []);

  const stopGenerating = useCallback(() => {
    if (abortRef.current) {
      abortRef.current.abort();
      abortRef.current = null;
      setIsGenerating(false);
    }
  }, []);

  const sendMessage = useCallback(() => {
    const text = input.trim();
    if (!text || isGenerating) return;
    const userMsg = { id: `msg-${Date.now()}-user`, role: 'user', content: text };
    const updated = [...messages, userMsg];
    setMessages(updated);
    setInput('');
    sendToAI(updated);
  }, [input, isGenerating, messages, sendToAI]);

  const handleStarter = useCallback((text) => {
    if (isGenerating) return;
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
              <div className="ceo-messages">
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
                          thinking<span className="ceo-dots"><span>.</span><span>.</span><span>.</span></span>
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
                <div ref={messagesEndRef} />
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
