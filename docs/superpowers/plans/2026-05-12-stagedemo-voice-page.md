# Stage Demo Voice Page — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build `/stagedemo` — a cinematic, voice-first AI CEO page for live stage demos. User speaks via OpenAI Realtime API, AI asks discovery questions by voice, then generates marketing assets using existing Anthropic-powered agents, revealed with theatrical animations.

**Architecture:** OpenAI Realtime API handles voice conversation (push-to-talk, ephemeral token, browser-direct WebSocket). When AI calls a tool (e.g. `generate_newsletter`), the frontend hits a new backend endpoint that delegates to existing Anthropic-powered agents. Three.js renders a fluid audio-reactive orb. framer-motion handles all UI transitions.

**Tech Stack:** React 19, Vite, three + @react-three/fiber + @react-three/drei, framer-motion, OpenAI Realtime API (WebSocket), existing Express backend + Anthropic agents

**Spec:** `docs/superpowers/specs/2026-05-12-stagedemo-voice-page-design.md`

---

## File Map

### New Files — Frontend
| File | Responsibility |
|------|---------------|
| `src/pages/StageDemo.jsx` | Page component, state machine (idle/listening/speaking/generating/artifact), layout, keyboard handler |
| `src/components/stagedemo/VoiceOrb.jsx` | Three.js r3f scene — displaced sphere with GLSL shaders, driven by audio data |
| `src/components/stagedemo/blobShader.js` | GLSL vertex + fragment shaders for the fluid orb |
| `src/components/stagedemo/VoiceBar.jsx` | Compact bottom waveform bar shown during artifact view |
| `src/components/stagedemo/CardLoader.jsx` | 3D card assembly loading animation (framer-motion) |
| `src/components/stagedemo/ArtifactReveal.jsx` | Dark-themed artifact panel with sandboxed iframe |
| `src/hooks/useRealtimeVoice.js` | OpenAI Realtime WebSocket — connect, stream audio, handle tool calls, playback |
| `src/hooks/useAudioAnalyser.js` | Mic + playback audio analysis — frequency data for orb/waveform |

### New Files — Backend
| File | Responsibility |
|------|---------------|
| `backend/routes/stagedemo.js` | Two endpoints: `POST /api/stagedemo/session` (ephemeral token) + `POST /api/stagedemo/generate` (run agent) |

### Modified Files
| File | Change |
|------|--------|
| `src/App.jsx` | Add `<Route path="/stagedemo" element={<StageDemo />} />` inside Layout |
| `backend/server.js` | Import + mount stagedemo routes with requireAuth |
| `package.json` | Add `three`, `@react-three/fiber`, `@react-three/drei` |

---

## Task 1: Install Dependencies

**Files:**
- Modify: `package.json`

- [ ] **Step 1: Install three.js ecosystem**

```bash
cd /Users/bazil/Documents/Marko/AICEO && npm install three @react-three/fiber @react-three/drei
```

- [ ] **Step 2: Verify installation**

```bash
node -e "require('three'); console.log('three OK')"
node -e "require('@react-three/fiber'); console.log('r3f OK')"
```

Expected: both print OK

- [ ] **Step 3: Ensure OPENAI_API_KEY is in backend .env**

Check `backend/.env` for `OPENAI_API_KEY=sk-...`. If missing, add it. The key is needed for creating ephemeral Realtime sessions.

- [ ] **Step 4: Commit**

```bash
git add package.json package-lock.json
git commit -m "chore: add three.js, r3f, drei for stage demo"
```

---

## Task 2: Backend — Stage Demo Routes

**Files:**
- Create: `backend/routes/stagedemo.js`

This creates two endpoints:
1. `POST /api/stagedemo/session` — creates an OpenAI Realtime ephemeral token with CEO voice persona + tools
2. `POST /api/stagedemo/generate` — runs an existing agent (newsletter, landing-page, etc.) and returns final HTML

- [ ] **Step 1: Create the route file**

```javascript
// backend/routes/stagedemo.js
import { Router } from 'express';
import { loadUserContext } from '../services/context.js';
import { getAgent } from '../agents/registry.js';
import { buildBrandContext } from '../agents/brand-context.js';
import { executeAgent } from '../agents/base-agent.js';

const router = Router();

// ─── Voice-adapted CEO persona for OpenAI Realtime ───
function buildVoiceSystemPrompt(context) {
  const { brandDna, soulNotes, products, contacts } = context;

  let prompt = `You are the user's AI CEO — their business partner. You know their brand, products, audience, and numbers. You speak naturally, like a sharp friend who runs businesses.

VOICE RULES:
- Keep responses SHORT. 2-3 sentences max per turn. You're in a real-time conversation, not writing an essay.
- Be direct and opinionated. "Do this" not "you might consider."
- No corporate speak, no filler ("Great question!", "Absolutely!").
- No em dashes. Use commas, periods, or new sentences.
- Reference their actual data when relevant.
- Sound human. Casual but sharp.

WORKFLOW — MARKETING ASSETS:
When the user wants to create a newsletter, landing page, squeeze page, story sequence, lead magnet, or DM automation:
1. Ask exactly 4 discovery questions, ONE AT A TIME. Wait for each answer.
2. Question 1: Topic — offer options based on their actual products/services
3. Question 2: Audience — offer segments based on their actual customers
4. Question 3: Tone — e.g. "Authority style", "Witty Morning Brew style", "Wisdom James Clear style"
5. Question 4: CTA — offer options relevant to their actual offers/links
6. After all 4 answers, call the matching generate tool.
7. Say something like "Building that now, give me a moment" while it generates.
8. When you get the result, say "Done! Take a look at what I built" or similar.

NEVER fabricate product names, features, or services. If unsure, keep options generic.

For simple requests (advice, strategy, questions), just answer directly. No tools needed.

For editing an existing artifact, call edit_artifact with a clear instruction.`;

  // Inject brand DNA
  if (brandDna) {
    prompt += `\n\n── BRAND IDENTITY ──\n`;
    if (brandDna.description) prompt += `Business: ${brandDna.description}\n`;
    if (brandDna.tagline) prompt += `Tagline: ${brandDna.tagline}\n`;
    if (brandDna.primary_color) prompt += `Primary color: ${brandDna.primary_color}\n`;
    if (brandDna.secondary_color) prompt += `Secondary color: ${brandDna.secondary_color}\n`;
    if (brandDna.font_main) prompt += `Font: ${brandDna.font_main}\n`;
  }

  // Inject soul notes
  if (soulNotes?.length > 0) {
    prompt += `\n\n── WHAT I KNOW ABOUT YOU ──\n`;
    for (const note of soulNotes.slice(0, 20)) {
      prompt += `- [${note.category}] ${note.content}\n`;
    }
  }

  // Inject products
  if (products?.length > 0) {
    prompt += `\n\n── YOUR PRODUCTS ──\n`;
    for (const p of products) {
      prompt += `- ${p.name}`;
      if (p.price) prompt += ` ($${p.price})`;
      if (p.description) prompt += `: ${p.description}`;
      prompt += '\n';
    }
  }

  // Inject contacts summary
  if (contacts?.length > 0) {
    prompt += `\n\n── CONTACTS ── (${contacts.length} total)\n`;
    for (const c of contacts.slice(0, 10)) {
      prompt += `- ${c.first_name || ''} ${c.last_name || ''} <${c.email || 'no email'}>`;
      if (c.company) prompt += ` @ ${c.company}`;
      prompt += '\n';
    }
  }

  return prompt;
}

// ─── Tool definitions for OpenAI Realtime session ───
function buildRealtimeTools() {
  return [
    {
      type: 'function',
      name: 'generate_newsletter',
      description: 'Generate a complete email newsletter. Call this ONLY after asking all 4 discovery questions.',
      parameters: {
        type: 'object',
        properties: {
          topic: { type: 'string', description: 'Newsletter topic/subject' },
          audience: { type: 'string', description: 'Target audience' },
          tone: { type: 'string', description: 'Writing tone/style' },
          cta: { type: 'string', description: 'Call to action' },
        },
        required: ['topic', 'audience', 'tone', 'cta'],
      },
    },
    {
      type: 'function',
      name: 'generate_landing_page',
      description: 'Generate a complete landing page. Call this ONLY after asking all 4 discovery questions.',
      parameters: {
        type: 'object',
        properties: {
          topic: { type: 'string', description: 'Page topic/product' },
          audience: { type: 'string', description: 'Target audience' },
          style: { type: 'string', description: 'Page style (direct-response, corporate-saas, creator-newsletter, marketing-agency, event-conference)' },
          cta: { type: 'string', description: 'Primary call to action' },
        },
        required: ['topic', 'audience', 'style', 'cta'],
      },
    },
    {
      type: 'function',
      name: 'generate_squeeze_page',
      description: 'Generate a squeeze/opt-in page for lead capture.',
      parameters: {
        type: 'object',
        properties: {
          topic: { type: 'string', description: 'Offer/lead magnet topic' },
          audience: { type: 'string', description: 'Target audience' },
          offer: { type: 'string', description: 'What they get for opting in' },
          cta: { type: 'string', description: 'CTA button text' },
        },
        required: ['topic', 'audience', 'offer', 'cta'],
      },
    },
    {
      type: 'function',
      name: 'generate_story_sequence',
      description: 'Generate an Instagram Story sequence (3-5 frames).',
      parameters: {
        type: 'object',
        properties: {
          topic: { type: 'string', description: 'Story topic' },
          audience: { type: 'string', description: 'Target audience' },
          goal: { type: 'string', description: 'Goal (engagement, traffic, sales)' },
          visual_style: { type: 'string', description: 'Visual style preference' },
        },
        required: ['topic', 'audience', 'goal', 'visual_style'],
      },
    },
    {
      type: 'function',
      name: 'generate_lead_magnet',
      description: 'Generate a lead magnet strategy document.',
      parameters: {
        type: 'object',
        properties: {
          niche: { type: 'string', description: 'Business niche' },
          audience: { type: 'string', description: 'Target audience' },
          pain_point: { type: 'string', description: 'Main pain point addressed' },
          format: { type: 'string', description: 'Format (PDF, checklist, guide, template)' },
        },
        required: ['niche', 'audience', 'pain_point', 'format'],
      },
    },
    {
      type: 'function',
      name: 'generate_dm_automation',
      description: 'Generate DM automation sequences.',
      parameters: {
        type: 'object',
        properties: {
          platform: { type: 'string', description: 'Platform (instagram, linkedin, twitter)' },
          goal: { type: 'string', description: 'Goal (sales, booking, engagement)' },
          product: { type: 'string', description: 'Product/service being promoted' },
          audience: { type: 'string', description: 'Target audience' },
        },
        required: ['platform', 'goal', 'product', 'audience'],
      },
    },
    {
      type: 'function',
      name: 'edit_artifact',
      description: 'Edit the currently displayed artifact. Use when the user wants to change something about what was just generated.',
      parameters: {
        type: 'object',
        properties: {
          instruction: { type: 'string', description: 'What to change (e.g. "make the headline bigger", "change CTA to red")' },
        },
        required: ['instruction'],
      },
    },
  ];
}

// ─── Endpoint 1: Create ephemeral session ───
router.post('/api/stagedemo/session', async (req, res) => {
  const userId = req.user?.id;
  if (!userId || userId === 'anonymous') {
    return res.status(401).json({ error: 'auth_required' });
  }

  try {
    // Load all user context (brand, soul, products, contacts, etc.)
    const context = await loadUserContext(userId);
    const systemPrompt = buildVoiceSystemPrompt(context);
    const tools = buildRealtimeTools();

    // Create ephemeral session with OpenAI
    const response = await fetch('https://api.openai.com/v1/realtime/sessions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${process.env.OPENAI_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'gpt-4o-realtime-preview',
        voice: 'ash',
        modalities: ['audio', 'text'],
        instructions: systemPrompt,
        turn_detection: null, // push-to-talk — no VAD
        tools,
        input_audio_format: 'pcm16',
        output_audio_format: 'pcm16',
      }),
    });

    if (!response.ok) {
      const err = await response.text();
      console.error('[stagedemo] OpenAI session creation failed:', err);
      return res.status(502).json({ error: 'openai_session_failed', detail: err });
    }

    const session = await response.json();
    res.json({
      ephemeralKey: session.client_secret.value,
      expiresAt: session.client_secret.expires_at,
    });
  } catch (err) {
    console.error('[stagedemo] session error:', err);
    res.status(500).json({ error: 'session_creation_failed' });
  }
});

// ─── Endpoint 2: Generate artifact via existing agent ───
router.post('/api/stagedemo/generate', async (req, res) => {
  const userId = req.user?.id;
  if (!userId || userId === 'anonymous') {
    return res.status(401).json({ error: 'auth_required' });
  }

  const { tool, args, currentHtml } = req.body;
  if (!tool || !args) {
    return res.status(400).json({ error: 'missing_tool_or_args' });
  }

  try {
    const context = await loadUserContext(userId);

    // Handle edit_artifact separately
    if (tool === 'edit_artifact') {
      if (!currentHtml) {
        return res.status(400).json({ error: 'no_current_html_for_edit' });
      }
      // Use the orchestrate edit flow — call Anthropic with the edit instruction
      const editPrompt = `You are an expert HTML editor. The user wants to edit this HTML artifact.

CURRENT HTML:
${currentHtml}

USER'S EDIT REQUEST: ${args.instruction}

Respond with ONLY the complete updated HTML. No explanation, no markdown fences. Just the raw HTML.`;

      const editRes = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: {
          'x-api-key': process.env.ANTHROPIC_API_KEY,
          'anthropic-version': '2023-06-01',
          'content-type': 'application/json',
        },
        body: JSON.stringify({
          model: 'claude-sonnet-4-20250514',
          max_tokens: 16000,
          messages: [{ role: 'user', content: editPrompt }],
        }),
      });

      const editData = await editRes.json();
      const editedHtml = editData.content?.[0]?.text || currentHtml;
      return res.json({ html: editedHtml, agent: 'edit', title: 'Edited artifact' });
    }

    // Map tool name to agent name
    const agentMap = {
      generate_newsletter: 'newsletter',
      generate_landing_page: 'landing-page',
      generate_squeeze_page: 'squeeze-page',
      generate_story_sequence: 'story-sequence',
      generate_lead_magnet: 'lead-magnet',
      generate_dm_automation: 'dm-automation',
    };

    const agentName = agentMap[tool];
    if (!agentName) {
      return res.status(400).json({ error: `unknown_tool: ${tool}` });
    }

    const agent = getAgent(agentName);
    if (!agent) {
      return res.status(400).json({ error: `agent_not_found: ${agentName}` });
    }

    // Build system prompt with brand context (same as orchestrate.js delegation)
    const systemPrompt = agent.buildSystemPrompt(context.brandDna);

    // Build task description from args (simulate what the CEO would pass)
    const taskParts = Object.entries(args).map(([k, v]) => `${k}: ${v}`);
    const taskDescription = `Create this asset with the following details:\n${taskParts.join('\n')}\n\nThe CEO already asked the discovery questions. Skip questions and generate immediately.`;

    // Build products context if available
    let productsCtx = '';
    if (context.products?.length > 0) {
      productsCtx = '\n\n── PRODUCTS ──\n' + context.products.map(p =>
        `- ${p.name}${p.price ? ` ($${p.price})` : ''}${p.description ? `: ${p.description}` : ''}`
      ).join('\n');
    }

    const fullSystemPrompt = systemPrompt + productsCtx;
    const messages = [{ role: 'user', content: taskDescription }];

    // Execute agent (non-streaming — collect full output)
    let finalContent = '';
    await executeAgent({
      agent: { ...agent, systemPrompt: fullSystemPrompt },
      messages,
      onChunk: (content) => { finalContent = content; },
    });

    // Parse agent output — agents return JSON with { type, html, summary }
    let html = finalContent;
    let title = agentName;
    try {
      // Try to parse as JSON (newsletter/landing-page agents output JSON)
      const parsed = JSON.parse(finalContent);
      if (parsed.html) html = parsed.html;
      if (parsed.summary) title = parsed.summary;
    } catch {
      // Not JSON — might be raw HTML, use as-is
    }

    res.json({ html, agent: agentName, title });
  } catch (err) {
    console.error('[stagedemo] generate error:', err);
    res.status(500).json({ error: 'generation_failed', detail: err.message });
  }
});

export default router;
```

- [ ] **Step 2: Verify the file compiles**

```bash
cd /Users/bazil/Documents/Marko/AICEO && node -e "import('./backend/routes/stagedemo.js').then(() => console.log('OK')).catch(e => console.error(e.message))"
```

- [ ] **Step 3: Commit**

```bash
git add backend/routes/stagedemo.js
git commit -m "feat(stagedemo): backend routes for ephemeral voice session + agent generation"
```

---

## Task 3: Mount Backend Routes + Register Frontend Route

**Files:**
- Modify: `backend/server.js` (~line 15 for import, ~line 920 for mounting)
- Modify: `src/App.jsx` (add route)

- [ ] **Step 1: Add import to server.js**

At the top of `backend/server.js`, alongside other route imports (around line 15), add:

```javascript
import stagedemoRoutes from './routes/stagedemo.js';
```

- [ ] **Step 2: Mount the route with auth**

In `backend/server.js`, after the last `app.use(...)` block for routes (around line 920, after the boosend routes block), add:

```javascript
// ─── Stage Demo routes (auth required) ───
app.use((req, res, next) => {
  if (req.path.startsWith('/api/stagedemo')) return requireAuth(req, res, next);
  next();
});
app.use(stagedemoRoutes);
```

- [ ] **Step 3: Add frontend route to App.jsx**

In `src/App.jsx`, add the import at the top:

```javascript
import StageDemo from './pages/StageDemo';
```

Inside the `<Route element={<Layout />}>` group, add:

```jsx
<Route path="/stagedemo" element={<StageDemo />} />
```

- [ ] **Step 4: Create a placeholder StageDemo page so the app doesn't crash**

Create `src/pages/StageDemo.jsx` with a minimal placeholder (will be replaced in Task 10):

```jsx
export default function StageDemo() {
  return <div style={{ background: '#000', color: '#fff', height: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>Stage Demo — Loading...</div>;
}
```

- [ ] **Step 5: Verify the app starts**

```bash
cd /Users/bazil/Documents/Marko/AICEO && npm run dev
```

Open browser to `/stagedemo` — should see the placeholder text on a black background.

- [ ] **Step 6: Commit**

```bash
git add backend/server.js src/App.jsx src/pages/StageDemo.jsx
git commit -m "feat(stagedemo): mount backend routes, register frontend route with placeholder"
```

---

## Task 4: useAudioAnalyser Hook

**Files:**
- Create: `src/hooks/useAudioAnalyser.js`

This hook provides real-time audio frequency data for driving the orb and waveform visualizations. It exposes two analyser nodes — one for mic input, one for AI playback.

- [ ] **Step 1: Create the hook**

```javascript
// src/hooks/useAudioAnalyser.js
import { useRef, useCallback } from 'react';

export function useAudioAnalyser() {
  const audioCtxRef = useRef(null);
  const micAnalyserRef = useRef(null);
  const playbackAnalyserRef = useRef(null);
  const micStreamRef = useRef(null);

  // Initialize AudioContext (must be called after user gesture)
  const initAudio = useCallback(async () => {
    if (audioCtxRef.current) return audioCtxRef.current;

    const ctx = new AudioContext({ sampleRate: 24000 });
    audioCtxRef.current = ctx;

    // Mic analyser
    const micAnalyser = ctx.createAnalyser();
    micAnalyser.fftSize = 256;
    micAnalyser.smoothingTimeConstant = 0.8;
    micAnalyserRef.current = micAnalyser;

    // Playback analyser (AI audio goes through this)
    const playbackAnalyser = ctx.createAnalyser();
    playbackAnalyser.fftSize = 256;
    playbackAnalyser.smoothingTimeConstant = 0.85;
    playbackAnalyserRef.current = playbackAnalyser;

    // Connect playback analyser to speakers
    playbackAnalyser.connect(ctx.destination);

    return ctx;
  }, []);

  // Connect mic stream to analyser
  const connectMic = useCallback(async () => {
    const ctx = audioCtxRef.current;
    if (!ctx) return null;

    const stream = await navigator.mediaDevices.getUserMedia({
      audio: { sampleRate: 24000, channelCount: 1, echoCancellation: true, noiseSuppression: true },
    });
    micStreamRef.current = stream;

    const source = ctx.createMediaStreamSource(stream);
    source.connect(micAnalyserRef.current);

    return stream;
  }, []);

  // Get mic frequency data (0-255 per bin)
  const getMicFrequencyData = useCallback(() => {
    if (!micAnalyserRef.current) return new Uint8Array(128);
    const data = new Uint8Array(micAnalyserRef.current.frequencyBinCount);
    micAnalyserRef.current.getByteFrequencyData(data);
    return data;
  }, []);

  // Get playback frequency data
  const getPlaybackFrequencyData = useCallback(() => {
    if (!playbackAnalyserRef.current) return new Uint8Array(128);
    const data = new Uint8Array(playbackAnalyserRef.current.frequencyBinCount);
    playbackAnalyserRef.current.getByteFrequencyData(data);
    return data;
  }, []);

  // Get normalized average level (0-1) from frequency data
  const getLevel = useCallback((data) => {
    let sum = 0;
    for (let i = 0; i < data.length; i++) sum += data[i];
    return sum / (data.length * 255);
  }, []);

  // Cleanup
  const cleanup = useCallback(() => {
    if (micStreamRef.current) {
      micStreamRef.current.getTracks().forEach(t => t.stop());
      micStreamRef.current = null;
    }
    if (audioCtxRef.current) {
      audioCtxRef.current.close();
      audioCtxRef.current = null;
    }
  }, []);

  return {
    audioCtxRef,
    playbackAnalyserRef,
    initAudio,
    connectMic,
    getMicFrequencyData,
    getPlaybackFrequencyData,
    getLevel,
    cleanup,
  };
}
```

- [ ] **Step 2: Commit**

```bash
git add src/hooks/useAudioAnalyser.js
git commit -m "feat(stagedemo): useAudioAnalyser hook for mic + playback frequency data"
```

---

## Task 5: useRealtimeVoice Hook

**Files:**
- Create: `src/hooks/useRealtimeVoice.js`

This is the critical hook. It manages the OpenAI Realtime WebSocket connection, sends mic audio, receives AI audio for playback, and handles tool calls. Push-to-talk mode (no VAD).

- [ ] **Step 1: Create the hook**

```javascript
// src/hooks/useRealtimeVoice.js
import { useState, useRef, useCallback, useEffect } from 'react';
import { supabase } from '../lib/supabase';

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:3001';

// Convert Float32 audio samples to base64-encoded PCM16
function float32ToPcm16Base64(float32Array) {
  const pcm16 = new Int16Array(float32Array.length);
  for (let i = 0; i < float32Array.length; i++) {
    const s = Math.max(-1, Math.min(1, float32Array[i]));
    pcm16[i] = s < 0 ? s * 0x8000 : s * 0x7FFF;
  }
  const bytes = new Uint8Array(pcm16.buffer);
  let binary = '';
  for (let i = 0; i < bytes.length; i++) binary += String.fromCharCode(bytes[i]);
  return btoa(binary);
}

// Convert base64-encoded PCM16 to Float32 samples
function pcm16Base64ToFloat32(base64) {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  const pcm16 = new Int16Array(bytes.buffer);
  const float32 = new Float32Array(pcm16.length);
  for (let i = 0; i < pcm16.length; i++) {
    float32[i] = pcm16[i] / (pcm16[i] < 0 ? 0x8000 : 0x7FFF);
  }
  return float32;
}

export function useRealtimeVoice({ audioCtxRef, playbackAnalyserRef, onToolCall, onAiSpeakingChange, onTranscript }) {
  const [status, setStatus] = useState('disconnected'); // disconnected | connecting | connected | error
  const wsRef = useRef(null);
  const micProcessorRef = useRef(null);
  const micSourceRef = useRef(null);
  const isCapturingRef = useRef(false);
  const playbackTimeRef = useRef(0);
  const reconnectAttemptsRef = useRef(0);
  const currentResponseIdRef = useRef(null);

  // Get auth token
  const getToken = useCallback(async () => {
    const { data: { session } } = await supabase.auth.getSession();
    return session?.access_token;
  }, []);

  // Connect to OpenAI Realtime via backend ephemeral token
  const connect = useCallback(async () => {
    if (wsRef.current?.readyState === WebSocket.OPEN) return;

    setStatus('connecting');
    try {
      const token = await getToken();
      if (!token) throw new Error('Not authenticated');

      // Get ephemeral key from backend
      const res = await fetch(`${API_URL}/api/stagedemo/session`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
      });

      if (!res.ok) throw new Error(`Session creation failed: ${res.status}`);
      const { ephemeralKey } = await res.json();

      // Connect WebSocket to OpenAI Realtime
      const ws = new WebSocket(
        'wss://api.openai.com/v1/realtime?model=gpt-4o-realtime-preview',
        [
          'openai-insecure-api-key.' + ephemeralKey,
          'openai-beta.realtime-v1',
        ]
      );

      ws.onopen = () => {
        console.log('[voice] WebSocket connected');
        setStatus('connected');
        reconnectAttemptsRef.current = 0;
      };

      ws.onmessage = (event) => {
        const msg = JSON.parse(event.data);
        handleServerEvent(msg);
      };

      ws.onerror = (err) => {
        console.error('[voice] WebSocket error:', err);
        setStatus('error');
      };

      ws.onclose = (event) => {
        console.log('[voice] WebSocket closed:', event.code, event.reason);
        wsRef.current = null;

        // Auto-reconnect (max 3 attempts)
        if (reconnectAttemptsRef.current < 3 && status !== 'disconnected') {
          reconnectAttemptsRef.current++;
          const delay = Math.pow(2, reconnectAttemptsRef.current) * 1000;
          console.log(`[voice] Reconnecting in ${delay}ms (attempt ${reconnectAttemptsRef.current})`);
          setTimeout(() => connect(), delay);
        } else {
          setStatus('error');
        }
      };

      wsRef.current = ws;
    } catch (err) {
      console.error('[voice] Connection failed:', err);
      setStatus('error');
    }
  }, [getToken, status]);

  // Handle incoming server events
  const handleServerEvent = useCallback((msg) => {
    switch (msg.type) {
      case 'session.created':
      case 'session.updated':
        console.log('[voice] Session ready');
        break;

      case 'response.audio.delta':
        // AI audio chunk — play it
        if (msg.delta) {
          playAudioChunk(msg.delta);
          onAiSpeakingChange?.(true);
        }
        break;

      case 'response.audio_transcript.delta':
        // AI speech transcript
        onTranscript?.('ai', msg.delta);
        break;

      case 'response.audio.done':
        onAiSpeakingChange?.(false);
        break;

      case 'response.function_call_arguments.done':
        // Tool call complete — execute it
        console.log('[voice] Tool call:', msg.name, msg.arguments);
        if (onToolCall) {
          let args = {};
          try { args = JSON.parse(msg.arguments); } catch {}
          onToolCall(msg.name, args, msg.call_id);
        }
        break;

      case 'response.done':
        currentResponseIdRef.current = null;
        break;

      case 'error':
        console.error('[voice] Server error:', msg.error);
        break;

      default:
        break;
    }
  }, [onToolCall, onAiSpeakingChange, onTranscript]);

  // Play an AI audio chunk through the playback analyser
  const playAudioChunk = useCallback((base64Audio) => {
    const ctx = audioCtxRef.current;
    const analyser = playbackAnalyserRef.current;
    if (!ctx || !analyser) return;

    const float32 = pcm16Base64ToFloat32(base64Audio);
    const buffer = ctx.createBuffer(1, float32.length, 24000);
    buffer.getChannelData(0).set(float32);

    const source = ctx.createBufferSource();
    source.buffer = buffer;
    source.connect(analyser); // analyser is already connected to destination

    const now = ctx.currentTime;
    if (playbackTimeRef.current < now) playbackTimeRef.current = now;
    source.start(playbackTimeRef.current);
    playbackTimeRef.current += buffer.duration;
  }, [audioCtxRef, playbackAnalyserRef]);

  // Start capturing mic audio (push-to-talk: call on space down)
  const startCapture = useCallback(async () => {
    if (isCapturingRef.current) return;
    isCapturingRef.current = true;

    const ctx = audioCtxRef.current;
    if (!ctx) return;

    // Resume audio context if suspended (browser autoplay policy)
    if (ctx.state === 'suspended') await ctx.resume();

    const stream = await navigator.mediaDevices.getUserMedia({
      audio: { sampleRate: 24000, channelCount: 1, echoCancellation: true, noiseSuppression: true },
    });

    const source = ctx.createMediaStreamSource(stream);
    micSourceRef.current = { source, stream };

    // Use ScriptProcessor for mic capture (simpler than AudioWorklet, works everywhere)
    const processor = ctx.createScriptProcessor(4096, 1, 1);
    processor.onaudioprocess = (e) => {
      if (!isCapturingRef.current || !wsRef.current) return;
      const input = e.inputBuffer.getChannelData(0);
      const base64 = float32ToPcm16Base64(input);
      wsRef.current.send(JSON.stringify({
        type: 'input_audio_buffer.append',
        audio: base64,
      }));
    };

    source.connect(processor);
    processor.connect(ctx.destination); // ScriptProcessor needs to be connected
    micProcessorRef.current = processor;
  }, [audioCtxRef]);

  // Stop capturing (push-to-talk: call on space up)
  const stopCapture = useCallback(() => {
    isCapturingRef.current = false;

    // Disconnect mic processor
    if (micProcessorRef.current) {
      micProcessorRef.current.disconnect();
      micProcessorRef.current = null;
    }
    if (micSourceRef.current) {
      micSourceRef.current.source.disconnect();
      micSourceRef.current.stream.getTracks().forEach(t => t.stop());
      micSourceRef.current = null;
    }

    // Commit the audio buffer and request a response
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify({ type: 'input_audio_buffer.commit' }));
      wsRef.current.send(JSON.stringify({ type: 'response.create' }));
    }
  }, []);

  // Send tool result back to OpenAI so it can speak the confirmation
  const sendToolResult = useCallback((callId, result) => {
    if (!wsRef.current || wsRef.current.readyState !== WebSocket.OPEN) return;

    // Add the tool result as a conversation item
    wsRef.current.send(JSON.stringify({
      type: 'conversation.item.create',
      item: {
        type: 'function_call_output',
        call_id: callId,
        output: typeof result === 'string' ? result : JSON.stringify(result),
      },
    }));

    // Request a new response (AI will speak confirmation)
    wsRef.current.send(JSON.stringify({ type: 'response.create' }));
  }, []);

  // Disconnect
  const disconnect = useCallback(() => {
    reconnectAttemptsRef.current = 999; // prevent auto-reconnect
    if (wsRef.current) {
      wsRef.current.close();
      wsRef.current = null;
    }
    setStatus('disconnected');
  }, []);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      reconnectAttemptsRef.current = 999;
      if (wsRef.current) wsRef.current.close();
    };
  }, []);

  return {
    status,
    connect,
    disconnect,
    startCapture,
    stopCapture,
    sendToolResult,
  };
}
```

- [ ] **Step 2: Commit**

```bash
git add src/hooks/useRealtimeVoice.js
git commit -m "feat(stagedemo): useRealtimeVoice hook — OpenAI Realtime WebSocket with push-to-talk"
```

---

## Task 6: GLSL Blob Shader

**Files:**
- Create: `src/components/stagedemo/blobShader.js`

Custom vertex + fragment shaders for the fluid, audio-reactive orb. Uses simplex noise for organic vertex displacement, with color gradients driven by displacement amount and audio energy.

- [ ] **Step 1: Create the shader file**

```javascript
// src/components/stagedemo/blobShader.js

// Simplex 3D noise (Ashima Arts — public domain)
const simplexNoise = `
vec3 mod289(vec3 x) { return x - floor(x * (1.0 / 289.0)) * 289.0; }
vec4 mod289(vec4 x) { return x - floor(x * (1.0 / 289.0)) * 289.0; }
vec4 permute(vec4 x) { return mod289(((x*34.0)+1.0)*x); }
vec4 taylorInvSqrt(vec4 r) { return 1.79284291400159 - 0.85373472095314 * r; }

float snoise(vec3 v) {
  const vec2 C = vec2(1.0/6.0, 1.0/3.0);
  const vec4 D = vec4(0.0, 0.5, 1.0, 2.0);
  vec3 i  = floor(v + dot(v, C.yyy));
  vec3 x0 = v - i + dot(i, C.xxx);
  vec3 g = step(x0.yzx, x0.xyz);
  vec3 l = 1.0 - g;
  vec3 i1 = min(g.xyz, l.zxy);
  vec3 i2 = max(g.xyz, l.zxy);
  vec3 x1 = x0 - i1 + C.xxx;
  vec3 x2 = x0 - i2 + C.yyy;
  vec3 x3 = x0 - D.yyy;
  i = mod289(i);
  vec4 p = permute(permute(permute(
    i.z + vec4(0.0, i1.z, i2.z, 1.0))
    + i.y + vec4(0.0, i1.y, i2.y, 1.0))
    + i.x + vec4(0.0, i1.x, i2.x, 1.0));
  float n_ = 0.142857142857;
  vec3 ns = n_ * D.wyz - D.xzx;
  vec4 j = p - 49.0 * floor(p * ns.z * ns.z);
  vec4 x_ = floor(j * ns.z);
  vec4 y_ = floor(j - 7.0 * x_);
  vec4 x = x_ * ns.x + ns.yyyy;
  vec4 y = y_ * ns.x + ns.yyyy;
  vec4 h = 1.0 - abs(x) - abs(y);
  vec4 b0 = vec4(x.xy, y.xy);
  vec4 b1 = vec4(x.zw, y.zw);
  vec4 s0 = floor(b0)*2.0 + 1.0;
  vec4 s1 = floor(b1)*2.0 + 1.0;
  vec4 sh = -step(h, vec4(0.0));
  vec4 a0 = b0.xzyw + s0.xzyw*sh.xxyy;
  vec4 a1 = b1.xzyw + s1.xzyw*sh.zzww;
  vec3 p0 = vec3(a0.xy, h.x);
  vec3 p1 = vec3(a0.zw, h.y);
  vec3 p2 = vec3(a1.xy, h.z);
  vec3 p3 = vec3(a1.zw, h.w);
  vec4 norm = taylorInvSqrt(vec4(dot(p0,p0), dot(p1,p1), dot(p2,p2), dot(p3,p3)));
  p0 *= norm.x; p1 *= norm.y; p2 *= norm.z; p3 *= norm.w;
  vec4 m = max(0.6 - vec4(dot(x0,x0), dot(x1,x1), dot(x2,x2), dot(x3,x3)), 0.0);
  m = m * m;
  return 42.0 * dot(m*m, vec4(dot(p0,x0), dot(p1,x1), dot(p2,x2), dot(p3,x3)));
}
`;

export const vertexShader = `
${simplexNoise}

uniform float uTime;
uniform float uAudioLevel;     // 0-1 overall audio energy
uniform float uBassLevel;      // 0-1 low freq energy
uniform float uDisplacement;   // base displacement scale (0.3 idle, up to 1.0 active)

varying float vDisplacement;
varying vec3 vNormal;
varying vec3 vPosition;

void main() {
  // Multi-octave noise for organic feel
  float noise1 = snoise(position * 1.5 + uTime * 0.3) * 0.6;
  float noise2 = snoise(position * 3.0 + uTime * 0.5) * 0.3;
  float noise3 = snoise(position * 6.0 + uTime * 0.8) * 0.1;
  float noise = noise1 + noise2 + noise3;

  // Audio-reactive displacement
  float audioMod = 0.2 + 0.8 * uAudioLevel;
  float bassMod = 1.0 + uBassLevel * 0.5;
  float displacement = noise * uDisplacement * audioMod * bassMod;

  vec3 newPosition = position + normal * displacement;
  vDisplacement = displacement;
  vNormal = normalMatrix * normal;
  vPosition = (modelViewMatrix * vec4(newPosition, 1.0)).xyz;

  gl_Position = projectionMatrix * modelViewMatrix * vec4(newPosition, 1.0);
}
`;

export const fragmentShader = `
uniform float uAudioLevel;
uniform float uBassLevel;
uniform float uTime;

varying float vDisplacement;
varying vec3 vNormal;
varying vec3 vPosition;

void main() {
  // Fresnel effect for edge glow
  vec3 viewDir = normalize(-vPosition);
  float fresnel = pow(1.0 - max(dot(viewDir, normalize(vNormal)), 0.0), 2.5);

  // Base color: dark red core
  vec3 coreColor = vec3(0.15, 0.02, 0.02);

  // Displacement-driven color (red → pink → purple)
  vec3 midColor = vec3(0.6, 0.1, 0.15);
  vec3 hotColor = vec3(0.7, 0.15, 0.5);
  vec3 purpleColor = vec3(0.4, 0.1, 0.7);

  float d = clamp(vDisplacement * 2.0 + 0.5, 0.0, 1.0);
  vec3 displaceColor = mix(midColor, hotColor, d);
  displaceColor = mix(displaceColor, purpleColor, uBassLevel * 0.6);

  // Combine core + displacement + fresnel
  vec3 color = mix(coreColor, displaceColor, d * 0.7);
  color += fresnel * vec3(0.8, 0.2, 0.3) * (0.3 + 0.7 * uAudioLevel);

  // Subtle pulsing glow
  float pulse = sin(uTime * 2.0) * 0.05 + 0.95;
  color *= pulse;

  // Alpha: solid core, slight transparency at edges
  float alpha = mix(0.95, 0.6, fresnel * 0.5);

  gl_FragColor = vec4(color, alpha);
}
`;
```

- [ ] **Step 2: Commit**

```bash
mkdir -p src/components/stagedemo
git add src/components/stagedemo/blobShader.js
git commit -m "feat(stagedemo): GLSL blob shader with simplex noise + audio-reactive displacement"
```

---

## Task 7: VoiceOrb Component

**Files:**
- Create: `src/components/stagedemo/VoiceOrb.jsx`

Three.js scene using react-three-fiber. Renders the displaced icosphere with glow rings. Receives audio data as props and passes to shader uniforms.

- [ ] **Step 1: Create the component**

```jsx
// src/components/stagedemo/VoiceOrb.jsx
import { useRef, useMemo } from 'react';
import { Canvas, useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import { vertexShader, fragmentShader } from './blobShader';

function Blob({ audioLevel = 0, bassLevel = 0, isActive = false }) {
  const meshRef = useRef();
  const materialRef = useRef();

  const uniforms = useMemo(() => ({
    uTime: { value: 0 },
    uAudioLevel: { value: 0 },
    uBassLevel: { value: 0 },
    uDisplacement: { value: 0.3 },
  }), []);

  useFrame((state) => {
    if (!materialRef.current) return;
    const t = state.clock.getElapsedTime();
    materialRef.current.uniforms.uTime.value = t;

    // Smooth audio values
    const target = isActive ? audioLevel : 0.05;
    const current = materialRef.current.uniforms.uAudioLevel.value;
    materialRef.current.uniforms.uAudioLevel.value += (target - current) * 0.15;

    const bassTarget = isActive ? bassLevel : 0.02;
    const bassCurrent = materialRef.current.uniforms.uBassLevel.value;
    materialRef.current.uniforms.uBassLevel.value += (bassTarget - bassCurrent) * 0.12;

    // Scale displacement based on activity
    const dispTarget = isActive ? 0.5 + audioLevel * 0.5 : 0.3;
    const dispCurrent = materialRef.current.uniforms.uDisplacement.value;
    materialRef.current.uniforms.uDisplacement.value += (dispTarget - dispCurrent) * 0.1;

    // Gentle rotation
    if (meshRef.current) {
      meshRef.current.rotation.y = t * 0.1;
      meshRef.current.rotation.x = Math.sin(t * 0.05) * 0.1;
    }
  });

  return (
    <mesh ref={meshRef}>
      <icosahedronGeometry args={[1.8, 64]} />
      <shaderMaterial
        ref={materialRef}
        vertexShader={vertexShader}
        fragmentShader={fragmentShader}
        uniforms={uniforms}
        transparent
        depthWrite={false}
      />
    </mesh>
  );
}

export default function VoiceOrb({ audioLevel, bassLevel, isActive, scale = 1 }) {
  return (
    <Canvas
      camera={{ position: [0, 0, 5], fov: 45 }}
      style={{ position: 'absolute', inset: 0, pointerEvents: 'none' }}
      gl={{ alpha: true, antialias: true }}
    >
      <ambientLight intensity={0.2} />
      <group scale={scale}>
        <Blob audioLevel={audioLevel} bassLevel={bassLevel} isActive={isActive} />
      </group>
    </Canvas>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add src/components/stagedemo/VoiceOrb.jsx
git commit -m "feat(stagedemo): VoiceOrb Three.js component with audio-reactive GLSL blob"
```

---

## Task 8: VoiceBar Component

**Files:**
- Create: `src/components/stagedemo/VoiceBar.jsx`

Compact waveform bar docked at the bottom of the screen during artifact view. Shows audio levels and provides mic/end controls.

- [ ] **Step 1: Create the component**

```jsx
// src/components/stagedemo/VoiceBar.jsx
import { useRef, useEffect } from 'react';
import { motion } from 'framer-motion';

export default function VoiceBar({ frequencyData, isListening, onEndSession }) {
  const canvasRef = useRef(null);

  // Draw waveform
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || !frequencyData) return;

    const ctx = canvas.getContext('2d');
    const w = canvas.width;
    const h = canvas.height;
    ctx.clearRect(0, 0, w, h);

    const barCount = 48;
    const barWidth = 3;
    const gap = (w - barCount * barWidth) / (barCount + 1);
    const step = Math.floor(frequencyData.length / barCount);

    for (let i = 0; i < barCount; i++) {
      const value = frequencyData[i * step] / 255;
      const barHeight = Math.max(2, value * h * 0.8);
      const x = gap + i * (barWidth + gap);
      const y = (h - barHeight) / 2;

      ctx.fillStyle = `rgba(220, 50, 60, ${0.4 + value * 0.6})`;
      ctx.fillRect(x, y, barWidth, barHeight);
    }
  }, [frequencyData]);

  return (
    <motion.div
      initial={{ y: 100, opacity: 0 }}
      animate={{ y: 0, opacity: 1 }}
      exit={{ y: 100, opacity: 0 }}
      transition={{ type: 'spring', damping: 25, stiffness: 200 }}
      style={{
        position: 'fixed',
        bottom: 32,
        left: '50%',
        transform: 'translateX(-50%)',
        display: 'flex',
        alignItems: 'center',
        gap: 16,
        padding: '12px 24px',
        background: 'rgba(255,255,255,0.05)',
        backdropFilter: 'blur(20px)',
        border: '1px solid rgba(255,255,255,0.08)',
        borderRadius: 50,
        zIndex: 100,
      }}
    >
      {/* Mic indicator */}
      <div style={{
        width: 12, height: 12, borderRadius: '50%',
        background: isListening ? '#dc323c' : 'rgba(220,50,60,0.4)',
        boxShadow: isListening ? '0 0 12px rgba(220,50,60,0.6)' : 'none',
        transition: 'all 0.2s',
      }} />

      {/* Waveform */}
      <canvas ref={canvasRef} width={280} height={32} style={{ display: 'block' }} />

      {/* End button */}
      <button
        onClick={onEndSession}
        style={{
          background: 'none',
          border: '1px solid rgba(255,255,255,0.15)',
          color: 'rgba(255,255,255,0.5)',
          borderRadius: 20,
          padding: '4px 14px',
          fontSize: 11,
          cursor: 'pointer',
          fontFamily: 'monospace',
          letterSpacing: 1,
          textTransform: 'uppercase',
        }}
      >
        End
      </button>
    </motion.div>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add src/components/stagedemo/VoiceBar.jsx
git commit -m "feat(stagedemo): VoiceBar compact waveform component"
```

---

## Task 9: CardLoader Component

**Files:**
- Create: `src/components/stagedemo/CardLoader.jsx`

3D card assembly animation shown while the backend agent generates content. Cards spin/float then converge toward center before morphing into the artifact panel.

- [ ] **Step 1: Create the component**

```jsx
// src/components/stagedemo/CardLoader.jsx
import { motion } from 'framer-motion';

const cards = [
  { id: 1, rotate: -12, x: -120, y: -40, scale: 0.9, delay: 0 },
  { id: 2, rotate: 6, x: 80, y: -80, scale: 0.85, delay: 0.1 },
  { id: 3, rotate: -4, x: 40, y: 60, scale: 0.95, delay: 0.2 },
];

function MockCard({ style }) {
  return (
    <div style={{
      width: 280,
      height: 180,
      borderRadius: 12,
      background: 'rgba(255,255,255,0.04)',
      backdropFilter: 'blur(10px)',
      border: '1px solid rgba(255,255,255,0.08)',
      padding: 20,
      ...style,
    }}>
      {/* Skeleton lines */}
      <div style={{ width: '60%', height: 8, borderRadius: 4, background: 'rgba(220,50,60,0.3)', marginBottom: 12 }} />
      <div style={{ width: '90%', height: 6, borderRadius: 3, background: 'rgba(255,255,255,0.08)', marginBottom: 8 }} />
      <div style={{ width: '75%', height: 6, borderRadius: 3, background: 'rgba(255,255,255,0.08)', marginBottom: 8 }} />
      <div style={{ width: '40%', height: 6, borderRadius: 3, background: 'rgba(255,255,255,0.08)', marginBottom: 16 }} />
      <div style={{ width: 80, height: 24, borderRadius: 6, background: 'rgba(220,50,60,0.2)' }} />
    </div>
  );
}

export default function CardLoader({ onComplete }) {
  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      style={{
        position: 'absolute',
        inset: 0,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        perspective: 1200,
      }}
    >
      {cards.map((card) => (
        <motion.div
          key={card.id}
          initial={{
            x: card.x * 3,
            y: card.y * 3,
            rotate: card.rotate * 2,
            rotateY: 45,
            scale: 0.3,
            opacity: 0,
          }}
          animate={{
            x: card.x,
            y: card.y,
            rotate: card.rotate,
            rotateY: 0,
            scale: card.scale,
            opacity: 1,
          }}
          transition={{
            type: 'spring',
            damping: 20,
            stiffness: 100,
            delay: card.delay,
          }}
          style={{
            position: 'absolute',
            transformStyle: 'preserve-3d',
          }}
        >
          <motion.div
            animate={{
              y: [0, -8, 0],
              rotate: [card.rotate, card.rotate + 1, card.rotate],
            }}
            transition={{
              duration: 3,
              repeat: Infinity,
              ease: 'easeInOut',
              delay: card.delay,
            }}
          >
            <MockCard />
          </motion.div>
        </motion.div>
      ))}

      {/* "Building..." text */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.5 }}
        style={{
          position: 'absolute',
          bottom: 120,
          color: 'rgba(255,255,255,0.4)',
          fontFamily: 'monospace',
          fontSize: 13,
          letterSpacing: 2,
          textTransform: 'uppercase',
        }}
      >
        <motion.span
          animate={{ opacity: [0.4, 1, 0.4] }}
          transition={{ duration: 1.5, repeat: Infinity }}
        >
          Building your asset...
        </motion.span>
      </motion.div>
    </motion.div>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add src/components/stagedemo/CardLoader.jsx
git commit -m "feat(stagedemo): CardLoader 3D card assembly loading animation"
```

---

## Task 10: ArtifactReveal Component

**Files:**
- Create: `src/components/stagedemo/ArtifactReveal.jsx`

Dark-themed artifact panel with sandboxed iframe. Enters with a spring animation. Shows the generated HTML content.

- [ ] **Step 1: Create the component**

```jsx
// src/components/stagedemo/ArtifactReveal.jsx
import { useRef, useEffect } from 'react';
import { motion } from 'framer-motion';

export default function ArtifactReveal({ html, title, onClose }) {
  const iframeRef = useRef(null);

  useEffect(() => {
    if (!iframeRef.current || !html) return;
    const doc = iframeRef.current.contentDocument;
    doc.open();
    doc.write(html);
    doc.close();
  }, [html]);

  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.85, y: 40 }}
      animate={{ opacity: 1, scale: 1, y: 0 }}
      exit={{ opacity: 0, scale: 0.9, y: 30 }}
      transition={{ type: 'spring', damping: 22, stiffness: 180 }}
      style={{
        position: 'fixed',
        top: 40,
        left: 40,
        right: 40,
        bottom: 100,
        display: 'flex',
        flexDirection: 'column',
        borderRadius: 16,
        overflow: 'hidden',
        background: '#111',
        border: '1px solid rgba(255,255,255,0.08)',
        boxShadow: '0 32px 80px rgba(0,0,0,0.6), 0 0 120px rgba(220,50,60,0.08)',
        zIndex: 50,
      }}
    >
      {/* Title bar */}
      <div style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        padding: '12px 20px',
        borderBottom: '1px solid rgba(255,255,255,0.06)',
        background: 'rgba(255,255,255,0.02)',
      }}>
        {/* Fake browser dots */}
        <div style={{ display: 'flex', gap: 6 }}>
          <div style={{ width: 10, height: 10, borderRadius: '50%', background: '#ff5f56' }} />
          <div style={{ width: 10, height: 10, borderRadius: '50%', background: '#ffbd2e' }} />
          <div style={{ width: 10, height: 10, borderRadius: '50%', background: '#27c93f' }} />
        </div>

        <span style={{
          color: 'rgba(255,255,255,0.4)',
          fontSize: 12,
          fontFamily: 'monospace',
          letterSpacing: 1,
        }}>
          {title || 'Generated Asset'}
        </span>

        <button
          onClick={onClose}
          style={{
            background: 'none',
            border: 'none',
            color: 'rgba(255,255,255,0.3)',
            fontSize: 18,
            cursor: 'pointer',
            padding: '0 4px',
            lineHeight: 1,
          }}
        >
          x
        </button>
      </div>

      {/* Iframe */}
      <div style={{ flex: 1, background: '#fff' }}>
        <iframe
          ref={iframeRef}
          sandbox="allow-same-origin"
          style={{
            width: '100%',
            height: '100%',
            border: 'none',
          }}
          title="Artifact Preview"
        />
      </div>
    </motion.div>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add src/components/stagedemo/ArtifactReveal.jsx
git commit -m "feat(stagedemo): ArtifactReveal dark-themed artifact panel with iframe"
```

---

## Task 11: StageDemo Page — Full Implementation

**Files:**
- Modify: `src/pages/StageDemo.jsx` (replace placeholder from Task 3)

This is the main page component. It manages the state machine (idle → listening → speaking → generating → artifact), wires up all hooks and components, handles keyboard events (space for push-to-talk).

- [ ] **Step 1: Replace the placeholder with the full implementation**

```jsx
// src/pages/StageDemo.jsx
import { useState, useEffect, useCallback, useRef } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { useAudioAnalyser } from '../hooks/useAudioAnalyser';
import { useRealtimeVoice } from '../hooks/useRealtimeVoice';
import { supabase } from '../lib/supabase';
import VoiceOrb from '../components/stagedemo/VoiceOrb';
import VoiceBar from '../components/stagedemo/VoiceBar';
import CardLoader from '../components/stagedemo/CardLoader';
import ArtifactReveal from '../components/stagedemo/ArtifactReveal';

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:3001';

export default function StageDemo() {
  // ── State machine ──
  // idle: orb breathing, waiting for space
  // listening: user holding space, mic active
  // speaking: AI responding with voice
  // generating: backend agent building artifact
  // artifact: showing generated HTML + voice bar
  const [phase, setPhase] = useState('idle');
  const [artifactHtml, setArtifactHtml] = useState(null);
  const [artifactTitle, setArtifactTitle] = useState('');
  const [artifactAgent, setArtifactAgent] = useState('');
  const [orbScale, setOrbScale] = useState(1);
  const [error, setError] = useState(null);
  const [isConnected, setIsConnected] = useState(false);

  // Audio data for visualizations
  const [audioLevel, setAudioLevel] = useState(0);
  const [bassLevel, setBassLevel] = useState(0);
  const [frequencyData, setFrequencyData] = useState(null);

  const animFrameRef = useRef(null);
  const spaceDownRef = useRef(false);
  const generateTimeoutRef = useRef(null);

  // ── Audio analyser ──
  const {
    audioCtxRef, playbackAnalyserRef,
    initAudio, connectMic,
    getMicFrequencyData, getPlaybackFrequencyData, getLevel,
    cleanup: cleanupAudio,
  } = useAudioAnalyser();

  // ── Tool call handler ──
  const handleToolCall = useCallback(async (toolName, args, callId) => {
    console.log('[stagedemo] Tool call:', toolName, args);
    setPhase('generating');
    setOrbScale(0.3); // shrink orb

    // Set a timeout for long generations
    generateTimeoutRef.current = setTimeout(() => {
      // The voice AI already said "building..." — no action needed
    }, 15000);

    try {
      const { data: { session } } = await supabase.auth.getSession();
      const token = session?.access_token;

      const res = await fetch(`${API_URL}/api/stagedemo/generate`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          tool: toolName,
          args,
          currentHtml: artifactHtml || undefined,
        }),
      });

      if (!res.ok) throw new Error(`Generation failed: ${res.status}`);
      const data = await res.json();

      clearTimeout(generateTimeoutRef.current);

      setArtifactHtml(data.html);
      setArtifactTitle(data.title || toolName.replace('generate_', ''));
      setArtifactAgent(data.agent);

      // Send result back to voice AI so it speaks confirmation
      sendToolResult(callId, `Successfully generated ${data.agent}. The user can now see it on screen.`);

      // Transition to artifact view after a brief card animation
      setTimeout(() => setPhase('artifact'), 2500);
    } catch (err) {
      console.error('[stagedemo] Generation error:', err);
      clearTimeout(generateTimeoutRef.current);
      sendToolResult(callId, `Generation failed: ${err.message}. Let the user know and offer to try again.`);
      setPhase('speaking'); // go back to voice
      setOrbScale(1);
    }
  }, [artifactHtml]);

  // ── Voice hook ──
  const {
    status: voiceStatus,
    connect, disconnect,
    startCapture, stopCapture,
    sendToolResult,
  } = useRealtimeVoice({
    audioCtxRef,
    playbackAnalyserRef,
    onToolCall: handleToolCall,
    onAiSpeakingChange: (speaking) => {
      if (speaking && phase !== 'generating' && phase !== 'artifact') {
        setPhase('speaking');
      }
    },
    onTranscript: (role, text) => {
      // Could show captions — skipping for clean stage look
    },
  });

  // ── Audio visualization loop ──
  useEffect(() => {
    const loop = () => {
      const isListening = phase === 'listening';
      const isSpeaking = phase === 'speaking';

      const data = isListening
        ? getMicFrequencyData()
        : isSpeaking
          ? getPlaybackFrequencyData()
          : new Uint8Array(128);

      setFrequencyData(data);
      setAudioLevel(getLevel(data));

      // Bass level (first 8 bins)
      let bassSum = 0;
      for (let i = 0; i < Math.min(8, data.length); i++) bassSum += data[i];
      setBassLevel(bassSum / (8 * 255));

      animFrameRef.current = requestAnimationFrame(loop);
    };

    animFrameRef.current = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(animFrameRef.current);
  }, [phase, getMicFrequencyData, getPlaybackFrequencyData, getLevel]);

  // ── Connect voice on first interaction ──
  const handleActivate = useCallback(async () => {
    if (isConnected) return;
    try {
      await initAudio();
      await connectMic();
      await connect();
      setIsConnected(true);
    } catch (err) {
      console.error('[stagedemo] Activation failed:', err);
      setError(err.message);
    }
  }, [isConnected, initAudio, connectMic, connect]);

  // ── Keyboard handler (space = push-to-talk) ──
  useEffect(() => {
    const handleKeyDown = async (e) => {
      if (e.code !== 'Space' || e.repeat) return;
      e.preventDefault();
      spaceDownRef.current = true;

      if (!isConnected) {
        await handleActivate();
      }

      setPhase('listening');
      startCapture();
    };

    const handleKeyUp = (e) => {
      if (e.code !== 'Space') return;
      e.preventDefault();
      if (!spaceDownRef.current) return;
      spaceDownRef.current = false;

      stopCapture();
      setPhase('speaking'); // AI will respond
    };

    window.addEventListener('keydown', handleKeyDown);
    window.addEventListener('keyup', handleKeyUp);
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      window.removeEventListener('keyup', handleKeyUp);
    };
  }, [isConnected, handleActivate, startCapture, stopCapture]);

  // ── Cleanup on unmount ──
  useEffect(() => {
    return () => {
      disconnect();
      cleanupAudio();
      clearTimeout(generateTimeoutRef.current);
    };
  }, [disconnect, cleanupAudio]);

  // ── Close artifact ──
  const handleCloseArtifact = () => {
    setPhase('idle');
    setOrbScale(1);
  };

  // ── End session ──
  const handleEndSession = () => {
    disconnect();
    cleanupAudio();
    setPhase('idle');
    setIsConnected(false);
    setArtifactHtml(null);
    setOrbScale(1);
  };

  const isActive = phase === 'listening' || phase === 'speaking';
  const showOrb = phase !== 'artifact';
  const showArtifact = phase === 'artifact' && artifactHtml;
  const showCardLoader = phase === 'generating';

  return (
    <div style={{
      position: 'fixed',
      inset: 0,
      background: '#000',
      overflow: 'hidden',
      userSelect: 'none',
      cursor: 'default',
    }}>
      {/* ── HUD ── */}
      <div style={{
        position: 'absolute',
        top: 20,
        left: 24,
        display: 'flex',
        alignItems: 'center',
        gap: 8,
        zIndex: 200,
      }}>
        <div style={{
          width: 6, height: 6, borderRadius: '50%',
          background: isConnected ? '#dc323c' : 'rgba(220,50,60,0.3)',
          boxShadow: isConnected ? '0 0 8px rgba(220,50,60,0.5)' : 'none',
        }} />
        <span style={{
          color: 'rgba(255,255,255,0.25)',
          fontFamily: 'monospace',
          fontSize: 11,
          letterSpacing: 2,
          textTransform: 'uppercase',
        }}>
          Session {isConnected ? '· Live' : '· Standby'}
        </span>
      </div>

      <div style={{
        position: 'absolute',
        top: 20,
        left: '50%',
        transform: 'translateX(-50%)',
        zIndex: 200,
      }}>
        <span style={{
          color: 'rgba(255,255,255,0.3)',
          fontFamily: 'monospace',
          fontSize: 13,
          letterSpacing: 6,
          textTransform: 'uppercase',
        }}>
          AI CEO
        </span>
      </div>

      <div style={{
        position: 'absolute',
        top: 20,
        right: 24,
        zIndex: 200,
      }}>
        <span style={{
          color: 'rgba(255,255,255,0.15)',
          fontFamily: 'monospace',
          fontSize: 11,
          letterSpacing: 2,
        }}>
          V1.0 | CONFIDENTIAL
        </span>
      </div>

      {/* ── Orb ── */}
      <AnimatePresence>
        {showOrb && (
          <motion.div
            key="orb"
            initial={{ opacity: 0, scale: 0.5 }}
            animate={{ opacity: 1, scale: orbScale }}
            exit={{ opacity: 0, scale: 0.2 }}
            transition={{ type: 'spring', damping: 20, stiffness: 100 }}
            style={{
              position: 'absolute',
              inset: 0,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            <div style={{ width: 400, height: 400, position: 'relative' }}>
              {/* Glow rings */}
              <div style={{
                position: 'absolute',
                inset: -40,
                borderRadius: '50%',
                border: `1px solid rgba(220,50,60,${isActive ? 0.15 : 0.06})`,
                transition: 'all 0.5s',
              }} />
              <div style={{
                position: 'absolute',
                inset: -80,
                borderRadius: '50%',
                border: `1px solid rgba(220,50,60,${isActive ? 0.08 : 0.03})`,
                transition: 'all 0.5s',
              }} />

              {/* Three.js orb */}
              <VoiceOrb
                audioLevel={audioLevel}
                bassLevel={bassLevel}
                isActive={isActive}
              />

              {/* Mic icon (idle only) */}
              {phase === 'idle' && !isConnected && (
                <motion.div
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  style={{
                    position: 'absolute',
                    top: '50%',
                    left: '50%',
                    transform: 'translate(-50%, -50%)',
                    zIndex: 10,
                  }}
                >
                  <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="rgba(255,255,255,0.5)" strokeWidth="1.5">
                    <path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z" />
                    <path d="M19 10v2a7 7 0 0 1-14 0v-2" />
                    <line x1="12" y1="19" x2="12" y2="23" />
                    <line x1="8" y1="23" x2="16" y2="23" />
                  </svg>
                </motion.div>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* ── Status badges ── */}
      <AnimatePresence>
        {phase === 'listening' && (
          <motion.div
            key="listening-badge"
            initial={{ opacity: 0, y: -10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
            style={{
              position: 'absolute',
              top: 80,
              left: '50%',
              transform: 'translateX(-50%)',
              display: 'flex',
              alignItems: 'center',
              gap: 8,
              padding: '8px 20px',
              background: 'rgba(255,255,255,0.04)',
              border: '1px solid rgba(255,255,255,0.08)',
              borderRadius: 24,
              zIndex: 100,
            }}
          >
            <motion.div
              animate={{ opacity: [1, 0.3, 1] }}
              transition={{ duration: 1, repeat: Infinity }}
              style={{ width: 6, height: 6, borderRadius: '50%', background: '#dc323c' }}
            />
            <span style={{
              color: 'rgba(255,255,255,0.5)',
              fontFamily: 'monospace',
              fontSize: 12,
              letterSpacing: 3,
              textTransform: 'uppercase',
            }}>
              Listening
            </span>
          </motion.div>
        )}
      </AnimatePresence>

      {/* ── Idle prompt ── */}
      <AnimatePresence>
        {phase === 'idle' && !isConnected && (
          <motion.div
            key="idle-prompt"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            style={{
              position: 'absolute',
              bottom: 120,
              left: '50%',
              transform: 'translateX(-50%)',
              display: 'flex',
              alignItems: 'center',
              gap: 10,
              zIndex: 100,
            }}
          >
            <span style={{
              padding: '4px 10px',
              border: '1px solid rgba(255,255,255,0.15)',
              borderRadius: 4,
              color: 'rgba(255,255,255,0.4)',
              fontFamily: 'monospace',
              fontSize: 12,
            }}>
              SPACE
            </span>
            <span style={{
              color: 'rgba(255,255,255,0.25)',
              fontFamily: 'monospace',
              fontSize: 12,
              letterSpacing: 2,
              textTransform: 'uppercase',
            }}>
              or tap to brief your CEO
            </span>
          </motion.div>
        )}
      </AnimatePresence>

      {/* ── "Done speaking" button ── */}
      <AnimatePresence>
        {phase === 'listening' && (
          <motion.button
            key="done-btn"
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 10 }}
            onClick={() => {
              spaceDownRef.current = false;
              stopCapture();
              setPhase('speaking');
            }}
            style={{
              position: 'absolute',
              bottom: 80,
              left: '50%',
              transform: 'translateX(-50%)',
              display: 'flex',
              alignItems: 'center',
              gap: 8,
              padding: '10px 24px',
              background: 'rgba(255,255,255,0.04)',
              border: '1px solid rgba(255,255,255,0.1)',
              borderRadius: 24,
              color: 'rgba(255,255,255,0.5)',
              fontFamily: 'monospace',
              fontSize: 12,
              cursor: 'pointer',
              zIndex: 100,
            }}
          >
            <div style={{ width: 8, height: 8, borderRadius: 2, background: '#dc323c' }} />
            Done speaking
          </motion.button>
        )}
      </AnimatePresence>

      {/* ── Card loader (generating) ── */}
      <AnimatePresence>
        {showCardLoader && (
          <CardLoader key="card-loader" />
        )}
      </AnimatePresence>

      {/* ── Artifact panel ── */}
      <AnimatePresence>
        {showArtifact && (
          <ArtifactReveal
            key="artifact"
            html={artifactHtml}
            title={artifactTitle}
            onClose={handleCloseArtifact}
          />
        )}
      </AnimatePresence>

      {/* ── Voice bar (during artifact view) ── */}
      <AnimatePresence>
        {phase === 'artifact' && (
          <VoiceBar
            key="voice-bar"
            frequencyData={frequencyData}
            isListening={spaceDownRef.current}
            onEndSession={handleEndSession}
          />
        )}
      </AnimatePresence>

      {/* ── Error overlay ── */}
      {error && (
        <div style={{
          position: 'absolute',
          bottom: 40,
          left: '50%',
          transform: 'translateX(-50%)',
          padding: '12px 24px',
          background: 'rgba(220,50,60,0.15)',
          border: '1px solid rgba(220,50,60,0.3)',
          borderRadius: 8,
          color: 'rgba(255,255,255,0.7)',
          fontFamily: 'monospace',
          fontSize: 12,
          zIndex: 300,
          cursor: 'pointer',
        }}
          onClick={() => { setError(null); handleActivate(); }}
        >
          {error} — tap to retry
        </div>
      )}

      {/* ── Click handler for mobile/tap ── */}
      {phase === 'idle' && !isConnected && (
        <div
          onClick={handleActivate}
          style={{
            position: 'absolute',
            inset: 0,
            zIndex: 1,
            cursor: 'pointer',
          }}
        />
      )}
    </div>
  );
}
```

- [ ] **Step 2: Verify the page renders**

```bash
cd /Users/bazil/Documents/Marko/AICEO && npm run dev
```

Navigate to `/stagedemo`. Should see:
- Black screen with HUD elements (SESSION · STANDBY, AI CEO, V1.0)
- Three.js orb in center with subtle breathing animation
- Mic icon overlay
- "SPACE or tap to brief your CEO" prompt at bottom

- [ ] **Step 3: Commit**

```bash
git add src/pages/StageDemo.jsx
git commit -m "feat(stagedemo): full page implementation — state machine, keyboard handler, all components wired"
```

---

## Task 12: Layout Passthrough for StageDemo

**Files:**
- Modify: `src/App.jsx` (potentially)

The StageDemo page is full-screen with `position: fixed; inset: 0`. If the Layout component adds a sidebar or nav that conflicts, the StageDemo route should either:
1. Be placed outside the `<Route element={<Layout />}>` group (public route pattern), OR
2. The Layout should detect the `/stagedemo` path and hide its chrome

Check which approach works. Read the Layout component to decide.

- [ ] **Step 1: Check the Layout component**

Read the Layout component file to understand what chrome it renders (sidebar, nav, etc.). If it wraps children in padding or adds visible UI, move the StageDemo route outside the Layout group in App.jsx.

- [ ] **Step 2: Move route if needed**

If Layout adds chrome, move the route in `src/App.jsx` from inside `<Route element={<Layout />}>` to the public routes section:

```jsx
<Route path="/stagedemo" element={<StageDemo />} />
```

Place it before or after the other non-Layout routes like `/shared/:token` and `/f/:slug`.

Note: Auth is still handled by the backend (the `/api/stagedemo/session` endpoint requires a valid token). The frontend just needs the user to be logged in via Supabase. If the user isn't logged in, the voice connection will fail and show an error.

- [ ] **Step 3: Verify**

Navigate to `/stagedemo` — confirm no sidebar, no nav bar, just the pure black full-screen experience.

- [ ] **Step 4: Commit**

```bash
git add src/App.jsx
git commit -m "feat(stagedemo): ensure full-screen layout without app chrome"
```

---

## Task 13: End-to-End Verification

- [ ] **Step 1: Verify backend starts**

```bash
cd /Users/bazil/Documents/Marko/AICEO/backend && node server.js
```

Check logs for: no import errors, stagedemo routes registered.

- [ ] **Step 2: Verify frontend starts**

```bash
cd /Users/bazil/Documents/Marko/AICEO && npm run dev
```

No build errors. Navigate to `/stagedemo`.

- [ ] **Step 3: Visual check — idle state**

Confirm:
- Pure black background, no app chrome
- Three.js orb renders with breathing animation
- HUD: "SESSION · STANDBY", "AI CEO", "V1.0 | CONFIDENTIAL"
- "SPACE or tap to brief your CEO" visible

- [ ] **Step 4: Voice connection test**

Press space. Confirm:
- Mic permission prompt appears
- After granting: orb becomes more active, "LISTENING" badge appears
- Release space: phase transitions to "speaking"
- AI voice responds within 1-2 seconds

- [ ] **Step 5: Tool call test**

Say: "I want to create a newsletter"
Confirm:
- AI asks discovery questions one at a time via voice
- After 4 answers, AI calls `generate_newsletter`
- Card loader animation appears
- After generation completes (~5-15s), artifact panel slides in
- Voice bar appears at bottom
- HTML renders correctly in iframe

- [ ] **Step 6: Voice editing test**

While artifact is shown, hold space and say: "Change the headline to something catchier"
Confirm:
- AI calls `edit_artifact`
- Artifact updates in iframe
- AI speaks confirmation

- [ ] **Step 7: Robustness checks**

- Kill and restart backend — confirm auto-reconnect works (up to 3 attempts)
- Press space rapidly — confirm no double connections or crashes
- Test with no products/brand DNA set up — confirm AI still works, just with less context

- [ ] **Step 8: Final commit**

```bash
git add -A
git commit -m "feat(stagedemo): complete voice-first AI CEO stage demo page"
```
