// Generic LLM streaming executor  -  supports Anthropic and XAI providers
//
// Routing: when MENTOR_API_KEY is set we hit the Mentor gateway
// (https://platform.thementorprogram.xyz/api/v1/*). Mentor's /v1/messages is
// a pure passthrough to api.anthropic.com — same wire bytes in and out — so
// AICEO's response parsing (JSON content blocks for landing-page etc.) is
// unchanged. When MENTOR_API_KEY is missing we fall back to direct provider
// calls so dev/local without Mentor still works.
//
// Gemini stays direct (image gen in routes/generate.js).

import { SONNET_MODEL } from '../config/models.js';

const MENTOR_BASE_URL = process.env.MENTOR_BASE_URL || 'https://platform.thementorprogram.xyz';

// Each target carries an optional `fallback` to its direct-provider sibling.
// `fetchWithMentorFallback` retries against the fallback once when the
// primary returns 5xx or the network throws — so a Mentor outage doesn't
// take the app down. A 4xx is a real input error and never falls back.

function anthropicTarget() {
  const direct = process.env.ANTHROPIC_API_KEY
    ? { url: 'https://api.anthropic.com/v1/messages', key: process.env.ANTHROPIC_API_KEY, via: 'direct' }
    : null;
  const mentor = process.env.MENTOR_API_KEY
    ? {
        url: `${MENTOR_BASE_URL}/api/v1/messages`,
        key: process.env.MENTOR_API_KEY,
        via: 'mentor',
      }
    : null;
  // ANTHROPIC_PREFER_DIRECT=true flips routing priority: direct Anthropic
  // primary, Mentor as the 5xx fallback. Set this on Railway when the
  // gateway misbehaves — observed 2026-07-16: Mentor returned 200s whose
  // backing model ignored the native tool protocol (emitted
  // {"tool_code": ...} pseudo tool calls as chat text, Gemini-style
  // meta-commentary, coarse streaming). No code change needed to flip.
  if (process.env.ANTHROPIC_PREFER_DIRECT === 'true' && direct) {
    return { ...direct, fallback: mentor || undefined };
  }
  if (mentor) return { ...mentor, fallback: direct };
  if (direct) return direct;
  throw new Error('No Anthropic credential — set MENTOR_API_KEY (preferred) or ANTHROPIC_API_KEY');
}

function xaiChatTarget() {
  const direct = process.env.XAI_API_KEY
    ? { url: 'https://api.x.ai/v1/chat/completions', key: process.env.XAI_API_KEY, via: 'direct' }
    : null;
  if (process.env.MENTOR_API_KEY) {
    return {
      url: `${MENTOR_BASE_URL}/api/v1/chat/completions`,
      key: process.env.MENTOR_API_KEY,
      via: 'mentor',
      fallback: direct,
    };
  }
  if (direct) return direct;
  throw new Error('No xAI credential — set MENTOR_API_KEY (preferred) or XAI_API_KEY');
}

function xaiResponsesTarget() {
  const direct = process.env.XAI_API_KEY
    ? { url: 'https://api.x.ai/v1/responses', key: process.env.XAI_API_KEY, via: 'direct' }
    : null;
  if (process.env.MENTOR_API_KEY) {
    return {
      url: `${MENTOR_BASE_URL}/api/v1/responses`,
      key: process.env.MENTOR_API_KEY,
      via: 'mentor',
      fallback: direct,
    };
  }
  if (direct) return direct;
  throw new Error('No xAI credential — set MENTOR_API_KEY (preferred) or XAI_API_KEY');
}

/**
 * Run a fetch against `target`, retrying once against `target.fallback` on
 * 5xx or network failure. `buildInit(target)` builds the fetch options for
 * a given target — needed because the auth header value depends on the
 * target's key. Aborts (user cancel / timeout) are NOT retried — they
 * surface to the caller untouched.
 */
async function fetchWithMentorFallback(target, buildInit) {
  let primaryReason = null;
  try {
    const res = await fetch(target.url, buildInit(target));
    if (res.status < 500) return res;            // 2xx-4xx: caller decides
    primaryReason = `${target.via} ${res.status}`;
    // Drain the body so it can be logged but the caller still gets a fresh
    // response from the fallback. A 5xx body is usually a JSON error from
    // the gateway — small enough to read entirely.
    try { primaryReason += `: ${(await res.text()).slice(0, 200)}`; } catch { /* drain failed */ }
  } catch (err) {
    if (err?.name === 'AbortError') throw err;  // user cancel / timeout — don't fall back
    primaryReason = `${target.via} ${err.name || 'Error'}: ${err.message}`;
  }

  if (!target.fallback) {
    throw new Error(primaryReason);
  }

  console.warn(`[gateway] Primary failed (${primaryReason}) — falling back to ${target.fallback.via}`);
  return fetch(target.fallback.url, buildInit(target.fallback));
}

// Re-exports so other backend modules (routes/email.js, routes/sales.js) can
// pick the same routing without duplicating env/branch logic.
export { anthropicTarget, xaiChatTarget, fetchWithMentorFallback, MENTOR_BASE_URL };

// Watchdog for upstream LLM streams. If no chunk arrives within idleMs we
// abort the upstream connection and throw. Prevents the server from hanging
// forever when an LLM provider stalls mid-stream.
const STREAM_IDLE_TIMEOUT_MS = 60_000;

async function readWithIdleTimeout(reader, controller, idleMs = STREAM_IDLE_TIMEOUT_MS) {
  let timer;
  const idle = new Promise((_, reject) => {
    timer = setTimeout(() => {
      try { controller?.abort(); } catch { /* ignore */ }
      reject(new Error(`LLM stream idle for ${Math.round(idleMs / 1000)}s — aborted`));
    }, idleMs);
  });
  try {
    return await Promise.race([reader.read(), idle]);
  } finally {
    clearTimeout(timer);
  }
}

// Detect the specific Anthropic 400 that means "the input doesn't fit
// in the model's context window". Worded a few different ways depending
// on the API revision, so match broadly.
function isPromptTooLongError(err) {
  const msg = String(err?.message || '');
  return /prompt is too long|context.{0,12}length|input.{0,8}too.{0,8}long|max.{0,12}context|context_length_exceeded|tokens.{0,6}>.{0,8}\d{3},\d{3}/i.test(msg);
}

// Stream from Anthropic Claude API (via Mentor gateway when configured, else direct).
// Wraps the actual call with auto-retry on "prompt too long": if we
// missed the 1M-context opt-in (estimate undershot) and Anthropic
// rejects the call, we automatically retry with the beta header
// forced on. Belt-and-suspenders so a token-estimate miss can't
// surface as "Something went wrong" to the user.
// ─── Gateway model-substitution guard ───
//
// Measured 2026-07-16: the Mentor gateway silently serves Claude requests
// with a NON-Claude backend when its Claude capacity degrades, and says so
// in its own response metadata:
//   message_start → model: "claude-sonnet-4-6 (via gemini-2.5-flash fallback)"
// Substituted backends ignore the native tool protocol (tool calls as
// text, prose questions, empty streams) — measured 0/6 tool-correct via a
// substituted Mentor turn vs 6/6 via real Claude. message_start is the
// FIRST stream event, so we can reject the response before a single token
// reaches the user and retry — Mentor first, direct Anthropic only as the
// per-turn rescue when Mentor twice declares it is not serving Claude.
function isSubstitutedModel(served, requested) {
  if (!served) return false;                    // no metadata — can't judge
  if (served === requested) return false;
  if (/\bfallback\b|\bvia\b/i.test(served)) return true;
  return !served.startsWith(requested);         // date-suffixed ids are fine
}

function gatewaySubstitutionError(served, requested) {
  const e = new Error(`Gateway substituted the model: requested ${requested}, served "${served}"`);
  e.code = 'GATEWAY_SUBSTITUTED';
  e.servedBy = served;
  return e;
}

async function streamAnthropic(args) {
  try {
    return await streamAnthropicWithSubstitutionRetry(args);
  } catch (err) {
    if (!isPromptTooLongError(err)) throw err;
    const model = args.model || SONNET_MODEL;
    if (!/sonnet/i.test(model)) throw err; // 1M beta is Sonnet-only as of 2026-06
    console.log('[anthropic] prompt-too-long despite estimate — retrying with 1M context flag forced');
    try {
      return await streamAnthropicWithSubstitutionRetry({ ...args, forceMillionContext: true });
    } catch (retryErr) {
      // If the retry also fails with prompt-too-long, the prompt
      // genuinely exceeds 1M. Tag the error so the orchestrator can
      // surface a precise message to the user instead of the generic
      // 500 → "Something went wrong".
      if (isPromptTooLongError(retryErr)) {
        const e = new Error('Prompt exceeded the 1M context window — conversation is too large to continue. Start a fresh chat session.');
        e.code = 'CONTEXT_EXCEEDED';
        throw e;
      }
      throw retryErr;
    }
  }
}

// Substitution retry policy shared by every agent stream (newsletter,
// landing page, …): Mentor once more, then the direct-Anthropic rescue if
// a direct key exists. Mentor stays the primary route always — direct
// serves ONLY the turns Mentor itself marks as not-Claude.
async function streamAnthropicWithSubstitutionRetry(args) {
  try {
    return await streamAnthropicCore(args);
  } catch (err) {
    if (err?.code !== 'GATEWAY_SUBSTITUTED') throw err;
    console.warn(`[anthropic] ${err.message} — retrying via Mentor once`);
    try {
      return await streamAnthropicCore(args);
    } catch (err2) {
      if (err2?.code !== 'GATEWAY_SUBSTITUTED' || !anthropicTarget().fallback) throw err2;
      console.warn(`[anthropic] Mentor still substituting (${err2.servedBy}) — rescuing this turn via direct Anthropic`);
      return await streamAnthropicCore({ ...args, preferDirect: true });
    }
  }
}

async function streamAnthropicCore({ systemPrompt, messages, model, maxTokens, onChunk, abortSignal, streamIdleMs, forceMillionContext = false, preferDirect = false }) {
  const baseTarget = anthropicTarget();
  const target = preferDirect && baseTarget.fallback ? baseTarget.fallback : baseTarget;

  // Convert to Anthropic format (separate system from user/assistant)
  const anthropicMessages = messages
    .filter(m => m.role === 'user' || m.role === 'assistant')
    .map(m => ({ role: m.role, content: m.content }));

  // Rough char→token estimate (~3.5 chars/token for HTML + English mix
  // — within ~10% of tiktoken for our payloads). Used to opt in to the
  // 1M context tier when the assembled prompt is about to exceed the
  // default 200K cap.
  const charCount =
    (systemPrompt?.length || 0) +
    anthropicMessages.reduce((sum, m) => sum + (typeof m.content === 'string' ? m.content.length : 0), 0);
  const estimatedTokens = Math.ceil(charCount / 3.5);

  // Dynamic threshold: the 200K cap is INPUT+OUTPUT combined, so the
  // safe input ceiling is 200K minus the reserved output (max_tokens)
  // minus a 10K margin for our estimate error. Stays below 160K floor
  // so we never over-engage 1M on small generators.
  const safeInputCap = 200_000 - (maxTokens || 16_000) - 10_000;
  const threshold = Math.max(140_000, safeInputCap);
  const wantMillion = estimatedTokens > threshold;
  // 1M beta is Sonnet-only as of June 2026 — Opus/Haiku ignore the
  // beta header but we gate explicitly for clarity in logs.
  const isSonnet = /sonnet/i.test(model || SONNET_MODEL);
  const useMillionContext = (forceMillionContext || wantMillion) && isSonnet;

  if (useMillionContext) {
    console.log(`[anthropic] 1M-context beta engaged — model=${model || 'default'} estimated=${estimatedTokens.toLocaleString()} threshold=${threshold.toLocaleString()} forced=${forceMillionContext}`);
  } else if (estimatedTokens > 120_000) {
    console.log(`[anthropic] standard 200K window — model=${model || 'default'} estimated=${estimatedTokens.toLocaleString()} (margin ~${(threshold - estimatedTokens).toLocaleString()})`);
  }

  // Link caller's abort signal to our internal controller so the idle watchdog
  // can abort the upstream fetch even when the caller didn't pass a signal.
  const controller = new AbortController();
  if (abortSignal) {
    if (abortSignal.aborted) controller.abort();
    else abortSignal.addEventListener('abort', () => controller.abort(), { once: true });
  }

  const buildInit = (t) => ({
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': t.key,
      'anthropic-version': '2023-06-01',
      // Conditional beta header for 1M context window. Anthropic
      // ignores unknown beta names so this is safe to send when the
      // flag is on; gating keeps the log + future swaps cleaner.
      ...(useMillionContext ? { 'anthropic-beta': 'context-1m-2025-08-07' } : {}),
    },
    body: JSON.stringify({
      model: model || SONNET_MODEL,
      max_tokens: maxTokens || 16000,
      system: systemPrompt,
      messages: anthropicMessages,
      stream: true,
    }),
    signal: controller.signal,
  });
  const res = await fetchWithMentorFallback(target, buildInit);

  if (!res.ok) {
    const errText = await res.text().catch(() => 'Unknown error');
    throw new Error(`Anthropic API error (${res.status}): ${errText}`);
  }

  const reader = res.body?.getReader();
  if (!reader) throw new Error('No response body from Anthropic');

  const decoder = new TextDecoder();
  let fullContent = '';
  let buffer = '';

  while (true) {
    const { done, value } = await readWithIdleTimeout(reader, controller, streamIdleMs);
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
        // Reject gateway-substituted responses before any content flows —
        // message_start is the first event and carries the served model.
        if (parsed.type === 'message_start' && isSubstitutedModel(parsed.message?.model, model || SONNET_MODEL)) {
          try { controller.abort(); } catch { /* already closed */ }
          throw gatewaySubstitutionError(parsed.message.model, model || SONNET_MODEL);
        }
        if (parsed.type === 'content_block_delta' && parsed.delta?.text) {
          fullContent += parsed.delta.text;
          if (onChunk) onChunk(fullContent);
        }
        if (parsed.type === 'error') {
          console.error('[base-agent] Anthropic stream error:', JSON.stringify(parsed));
        }
      } catch (e) {
        if (e?.code === 'GATEWAY_SUBSTITUTED') throw e;
        // skip malformed chunks
      }
    }
  }

  return fullContent;
}

// Stream from XAI Grok API (OpenAI-compatible) — via Mentor gateway when configured, else direct
async function streamXai({ systemPrompt, messages, model, maxTokens, tools, toolChoice, onChunk, onToolCalls, abortSignal, streamIdleMs }) {
  const target = xaiChatTarget();

  const body = {
    model: model || 'grok-4-1-fast-non-reasoning',
    messages: [{ role: 'system', content: systemPrompt }, ...messages],
    stream: true,
    max_tokens: maxTokens || 8000,
  };

  if (tools?.length) {
    body.tools = tools;
    // Callers can force the model to call SOME tool (no free-text response)
    // by passing toolChoice='required'. Used by Plan Mode to prevent the CEO
    // from typing plans as inline chat instead of calling create_artifact.
    body.tool_choice = toolChoice || 'auto';
  }

  // Link caller's abort signal to our internal controller so the idle watchdog
  // can abort the upstream fetch.
  const controller = new AbortController();
  if (abortSignal) {
    if (abortSignal.aborted) controller.abort();
    else abortSignal.addEventListener('abort', () => controller.abort(), { once: true });
  }

  const buildInit = (t) => ({
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${t.key}`,
    },
    body: JSON.stringify(body),
    signal: controller.signal,
  });
  const res = await fetchWithMentorFallback(target, buildInit);

  if (!res.ok) {
    const errText = await res.text().catch(() => 'Unknown error');
    throw new Error(`XAI API error (${res.status}): ${errText}`);
  }

  const reader = res.body?.getReader();
  if (!reader) throw new Error('No response body from XAI');

  const decoder = new TextDecoder();
  let fullContent = '';
  let buffer = '';
  let toolCallsMap = {};

  while (true) {
    const { done, value } = await readWithIdleTimeout(reader, controller, streamIdleMs);
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
          if (onChunk) onChunk(fullContent);
        }

        const tc = choice.delta?.tool_calls;
        if (tc) {
          for (const call of tc) {
            const idx = call.index ?? 0;
            if (!toolCallsMap[idx]) toolCallsMap[idx] = { id: call.id || '', name: '', arguments: '' };
            if (call.id) toolCallsMap[idx].id = call.id;
            if (call.function?.name) toolCallsMap[idx].name = call.function.name;
            if (call.function?.arguments) toolCallsMap[idx].arguments += call.function.arguments;
          }
        }
      } catch {
        // skip malformed
      }
    }
  }

  const calls = Object.values(toolCallsMap).filter(tc => tc.name);
  if (calls.length > 0 && onToolCalls) {
    await onToolCalls(calls);
  }

  return { content: fullContent, toolCalls: calls };
}

// Stream from XAI Responses API with web_search — via Mentor gateway when configured, else direct
async function streamXaiResearch({ systemPrompt, messages, model, onChunk, onSearchStatus, onSearchResult, abortSignal, streamIdleMs }) {
  const target = xaiResponsesTarget();

  if (onSearchStatus) onSearchStatus('searching');

  const input = [{ role: 'system', content: systemPrompt }, ...messages];

  const controller = new AbortController();
  if (abortSignal) {
    if (abortSignal.aborted) controller.abort();
    else abortSignal.addEventListener('abort', () => controller.abort(), { once: true });
  }

  const buildInit = (t) => ({
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${t.key}`,
    },
    body: JSON.stringify({
      model: 'grok-4-1-fast-non-reasoning',
      input,
      stream: true,
      tools: [{ type: 'web_search' }],
      include: ['inline_citations'],
    }),
    signal: controller.signal,
  });
  const res = await fetchWithMentorFallback(target, buildInit);

  if (!res.ok) {
    const errText = await res.text().catch(() => 'Unknown error');
    throw new Error(`XAI Responses API error (${res.status}): ${errText}`);
  }

  const reader = res.body?.getReader();
  if (!reader) throw new Error('No response body');

  const decoder = new TextDecoder();
  let fullContent = '';
  let buffer = '';
  let citations = [];

  while (true) {
    const { done, value } = await readWithIdleTimeout(reader, controller, streamIdleMs);
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

        // Capture citation annotations as they arrive
        if (eventType === 'response.output_text.annotation.added') {
          const ann = parsed.annotation;
          if (ann?.type === 'url_citation' && ann.url) {
            if (!citations.includes(ann.url)) {
              citations.push(ann.url);
              if (onSearchResult) onSearchResult(ann.url);
            }
          }
        }

        if (eventType === 'response.output_text.delta') {
          const delta = parsed.delta;
          if (delta) {
            fullContent += delta;
            if (onChunk) onChunk(fullContent);
          }
        }

        if (eventType === 'response.completed' || eventType === 'response.done') {
          const respCitations = parsed.response?.citations || [];
          for (const url of respCitations) {
            if (!citations.includes(url)) {
              citations.push(url);
              if (onSearchResult) onSearchResult(url);
            }
          }
        }

        // Fallback: Chat Completions compatible format
        const choice = parsed.choices?.[0];
        if (choice?.delta?.content) {
          fullContent += choice.delta.content;
          if (onChunk) onChunk(fullContent);
        }
      } catch {
        // skip malformed
      }
    }
  }

  if (citations.length > 0) {
    const sourcesBlock = '\n\n---\n**Sources:**\n' + citations.map((url, i) => `${i + 1}. ${url}`).join('\n');
    fullContent += sourcesBlock;
    if (onChunk) onChunk(fullContent);
  }

  if (onSearchStatus) onSearchStatus(null);
  return { content: fullContent, toolCalls: [] };
}

// Unified execute function
export async function executeAgent({ agent, messages, onChunk, onToolCalls, onSearchStatus, searchMode, abortSignal }) {
  const systemPrompt = agent.systemPrompt;
  const model = agent.model;
  const maxTokens = agent.maxTokens;
  const provider = agent.provider || 'anthropic';
  // Per-agent stream-idle watchdog. Agents that produce long outputs (e.g.
  // landing-page, squeeze-page at 16K maxTokens) can have a long
  // first-token latency from Anthropic — the default 60s watchdog aborts
  // them mid-generation. Those agents override via streamIdleTimeoutMs.
  const streamIdleMs = agent.streamIdleTimeoutMs;

  if (searchMode && provider === 'anthropic') {
    // For content generation agents (newsletter, landing page, etc.), do research first
    // then feed the research results into the agent as extra context
    if (onSearchStatus) onSearchStatus('searching');
    let researchContent = '';
    try {
      const researchResult = await streamXaiResearch({
        systemPrompt: 'You are a research assistant. Find relevant, current information to help create content.',
        messages,
        model: 'grok-4-1-fast-non-reasoning',
        onChunk: () => {}, // Don't stream research chunks to the user
        onSearchStatus,
        abortSignal,
        streamIdleMs,
      });
      researchContent = researchResult.content || '';
    } catch (err) {
      console.log(`[agent] Research phase failed: ${err.message}`);
    }

    if (onSearchStatus) onSearchStatus('writing');

    // Inject research results into the agent messages as context
    const enrichedMessages = [...messages];
    if (researchContent) {
      const lastUserIdx = enrichedMessages.findLastIndex(m => m.role === 'user');
      if (lastUserIdx >= 0) {
        enrichedMessages[lastUserIdx] = {
          ...enrichedMessages[lastUserIdx],
          content: enrichedMessages[lastUserIdx].content + `\n\n--- RESEARCH RESULTS (use these for accurate, current content) ---\n${researchContent.slice(0, 4000)}`,
        };
      }
    }

    const content = await streamAnthropic({ systemPrompt, messages: enrichedMessages, model, maxTokens, onChunk, abortSignal, streamIdleMs });
    return { content, toolCalls: [] };
  }

  if (searchMode) {
    return streamXaiResearch({ systemPrompt, messages, model: 'grok-4-1-fast-non-reasoning', onChunk, onSearchStatus, abortSignal, streamIdleMs });
  }

  if (provider === 'anthropic') {
    const content = await streamAnthropic({ systemPrompt, messages, model, maxTokens, onChunk, abortSignal, streamIdleMs });
    return { content, toolCalls: [] };
  }

  if (provider === 'xai') {
    return streamXai({ systemPrompt, messages, model, maxTokens, tools: agent.tools, onChunk, onToolCalls, abortSignal, streamIdleMs });
  }

  throw new Error(`Unknown provider: ${provider}`);
}

// Execute Anthropic Claude with tool_use loop (non-streaming for speed)
// Used for file-based editing  -  Claude calls replace_text/replace_section tools
// Routes via Mentor's /v1/messages passthrough when configured (tools preserved).
export async function executeAnthropicWithTools({ systemPrompt, messages, tools, maxTokens, onToolCall, onText, abortSignal }) {
  let target = anthropicTarget();
  let substitutionRetries = 0;

  let conversationMessages = messages
    .filter(m => m.role === 'user' || m.role === 'assistant')
    .map(m => ({ role: m.role, content: m.content }));

  let iterations = 0;
  const MAX_ITERATIONS = 15;
  // Per-iteration ceiling. Non-streaming, so without a timeout a stalled
  // upstream (Mentor or Anthropic) hangs the whole edit loop until the
  // platform-level connection timeout. 120s is generous — we've seen
  // healthy responses in <30s direct, ~45s via Mentor.
  const PER_ITER_TIMEOUT_MS = 120_000;

  while (iterations < MAX_ITERATIONS) {
    iterations++;

    // Chain the caller's abortSignal with our per-iteration timer. If
    // either fires, we abort the upstream fetch.
    const iterCtl = new AbortController();
    const iterTimer = setTimeout(() => iterCtl.abort(), PER_ITER_TIMEOUT_MS);
    const onCallerAbort = () => iterCtl.abort();
    if (abortSignal) {
      if (abortSignal.aborted) iterCtl.abort();
      else abortSignal.addEventListener('abort', onCallerAbort, { once: true });
    }

    let res;
    try {
      const buildInit = (t) => ({
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': t.key,
          'anthropic-version': '2023-06-01',
        },
        body: JSON.stringify({
          model: SONNET_MODEL,
          max_tokens: maxTokens || 4096,
          system: systemPrompt,
          messages: conversationMessages,
          tools,
        }),
        signal: iterCtl.signal,
      });
      res = await fetchWithMentorFallback(target, buildInit);
    } finally {
      clearTimeout(iterTimer);
      abortSignal?.removeEventListener?.('abort', onCallerAbort);
    }

    if (!res.ok) {
      const errText = await res.text().catch(() => 'Unknown error');
      throw new Error(`Anthropic API error (${res.status}): ${errText}`);
    }

    const response = await res.json();

    // Reject gateway-substituted responses (non-streaming: the top-level
    // model field carries the served model). Substituted backends dump
    // the whole edited HTML as a text block instead of calling
    // replace_text. Retry Mentor once, then rescue via direct Anthropic.
    if (isSubstitutedModel(response.model, SONNET_MODEL)) {
      substitutionRetries++;
      if (substitutionRetries === 1) {
        console.warn(`[edit] Gateway substituted the model (${response.model}) — retrying via Mentor once`);
        continue;
      }
      if (substitutionRetries === 2 && target.fallback) {
        console.warn(`[edit] Mentor still substituting (${response.model}) — rescuing this edit via direct Anthropic`);
        target = target.fallback;
        continue;
      }
      throw gatewaySubstitutionError(response.model, SONNET_MODEL);
    }

    const { content, stop_reason } = response;

    // Process content blocks
    let textContent = '';
    const toolUses = [];

    for (const block of content) {
      if (block.type === 'text') {
        textContent += block.text;
      } else if (block.type === 'tool_use') {
        toolUses.push(block);
      }
    }

    if (textContent && onText) {
      onText(textContent);
    }

    // If no tool use, we're done
    if (stop_reason !== 'tool_use' || toolUses.length === 0) {
      return textContent;
    }

    // Execute tool calls and build results
    const toolResults = [];
    for (const toolUse of toolUses) {
      const result = await onToolCall(toolUse.name, toolUse.input);
      toolResults.push({
        type: 'tool_result',
        tool_use_id: toolUse.id,
        content: result,
      });
    }

    // Add assistant response and tool results to conversation
    conversationMessages.push({ role: 'assistant', content });
    conversationMessages.push({ role: 'user', content: toolResults });
  }

  return 'Max edit iterations reached';
}

// Execute the CEO orchestrator with tool_use loop
// After tool calls, sends results back to the model for a follow-up response
export async function executeCeoOrchestrator({ systemPrompt, messages, tools, toolChoice, onChunk, onToolCalls, onToolStart, onToolInputDelta, searchMode, onSearchStatus, abortSignal, planMode = false }) {
  // The Mentor gateway adds cold-start latency on top of the upstream
  // provider's own time-to-first-token. Combined with a long system
  // prompt + tool-call setup, the first chunk on each turn of the
  // orchestrator's tool-use loop can cross the default 60s idle watchdog.
  // Bumping to 180s gives Mentor + Claude room for the first chunk on
  // every turn. Per-chunk reset means a healthy stream is unaffected.
  const ceoStreamIdleMs = 180_000;

  // Web research still routes through Grok (it has native web_search).
  if (searchMode) {
    return streamXaiResearch({ systemPrompt, messages, model: 'grok-4-1-fast-non-reasoning', onChunk, onSearchStatus, abortSignal, streamIdleMs: ceoStreamIdleMs });
  }

  // Primary: Claude Sonnet with native tool_use + 1M context.
  // Backup: Grok orchestrator on any Claude failure (5xx, network,
  // context-exceeded that survives the 1M retry, or explicit throws in
  // the tool-use loop). The user asked to keep xAI as a fallback so we
  // don't take an outage from either provider individually.
  try {
    return await executeCeoOrchestratorClaude({
      systemPrompt,
      messages,
      tools,
      toolChoice,
      onChunk,
      onToolCalls,
      // Streaming observers (Claude path only; the Grok fallback has no
      // equivalent events and simply never fires them).
      onToolStart,
      onToolInputDelta,
      abortSignal,
      planMode,
      streamIdleMs: ceoStreamIdleMs,
    });
  } catch (err) {
    // Never fall back on user aborts — the user cancelled deliberately.
    if (err?.name === 'AbortError' || abortSignal?.aborted) throw err;
    // Never fall back on CONTEXT_EXCEEDED — the conversation genuinely
    // won't fit in either provider's window. Let it bubble to the route
    // handler so the frontend can show the "start a fresh chat" message.
    if (err?.code === 'CONTEXT_EXCEEDED') throw err;
    // Protocol violation (tool call emitted as text — see the guard in
    // executeCeoOrchestratorClaude): the turn answered 200 but the
    // response ignored the native tool protocol. These are intermittent,
    // so retry ONCE through the SAME route (Mentor stays the standing
    // platform — no direct-Anthropic switching). The retry runs with
    // salvageOnViolation: if the fresh sample ALSO emits protocol text,
    // the orchestrator translates it into the equivalent native tool call
    // server-side instead of failing — the user gets their card/artifact
    // and clean chat text either way. The frontend's cumulative
    // text_delta contract means the fresh stream cleanly replaces
    // whatever partial text the bad attempt displayed.
    if (err?.code === 'PROTOCOL_VIOLATION' || err?.code === 'GATEWAY_SUBSTITUTED') {
      console.warn(`[ceo] ${err.code === 'GATEWAY_SUBSTITUTED' ? `Gateway substituted the model (${err.servedBy})` : 'Protocol violation (tool call as text)'} — retrying once via Mentor, salvage armed`);
      try {
        return await executeCeoOrchestratorClaude({
          systemPrompt,
          messages,
          tools,
          toolChoice,
          onChunk,
          onToolCalls,
          onToolStart,
          onToolInputDelta,
          abortSignal,
          planMode,
          streamIdleMs: ceoStreamIdleMs,
          salvageOnViolation: true,
        });
      } catch (retryErr) {
        if (retryErr?.name === 'AbortError' || abortSignal?.aborted) throw retryErr;
        if (retryErr?.code === 'CONTEXT_EXCEEDED') throw retryErr;
        // Mentor twice declared it isn't serving Claude — rescue THIS
        // turn via direct Anthropic (real Claude honors the native tool
        // protocol; measured 6/6 vs Mentor-fallback 0/6). Mentor remains
        // the primary route for every new turn.
        if (retryErr?.code === 'GATEWAY_SUBSTITUTED' && process.env.ANTHROPIC_API_KEY) {
          console.warn(`[ceo] Mentor still substituting (${retryErr.servedBy}) — rescuing this turn via direct Anthropic`);
          try {
            return await executeCeoOrchestratorClaude({
              systemPrompt,
              messages,
              tools,
              toolChoice,
              onChunk,
              onToolCalls,
              onToolStart,
              onToolInputDelta,
              abortSignal,
              planMode,
              streamIdleMs: ceoStreamIdleMs,
              preferDirect: true,
            });
          } catch (directErr) {
            if (directErr?.name === 'AbortError' || abortSignal?.aborted) throw directErr;
            if (directErr?.code === 'CONTEXT_EXCEEDED') throw directErr;
            console.warn(`[ceo] Direct rescue also failed (${directErr?.message?.slice(0, 150) || directErr}) — falling back to Grok`);
          }
        } else {
          console.warn(`[ceo] Retry also failed (${retryErr?.message?.slice(0, 150) || retryErr}) — falling back to Grok`);
        }
      }
    } else {
      console.warn(`[ceo] Claude failed (${err?.message?.slice(0, 200) || err}), falling back to Grok`);
    }
    return executeCeoOrchestratorGrok({
      systemPrompt,
      messages,
      tools,
      toolChoice,
      onChunk,
      onToolCalls,
      abortSignal,
      planMode,
      streamIdleMs: ceoStreamIdleMs,
    });
  }
}

// Grok orchestrator — kept as a fallback path so a Claude outage doesn't
// take the app down. Same shape as the previous CEO loop: OpenAI-style
// tool_calls, 5-iteration cap, planMode + ask_user early exit.
async function executeCeoOrchestratorGrok({ systemPrompt, messages, tools, toolChoice, onChunk, onToolCalls, abortSignal, planMode, streamIdleMs }) {
  const model = 'grok-4-1-fast-non-reasoning';
  let conversationMessages = [...messages];
  let iterations = 0;
  const MAX_ITERATIONS = 5;
  let lastContent = '';

  while (iterations < MAX_ITERATIONS) {
    iterations++;
    const result = await streamXai({
      systemPrompt,
      messages: conversationMessages,
      model,
      maxTokens: 16000,
      tools,
      toolChoice,
      onChunk: iterations === 1 || !lastContent ? onChunk : (content) => {
        if (onChunk) onChunk(lastContent + content);
      },
      onToolCalls: null,
      abortSignal,
      streamIdleMs,
    });

    const { content, toolCalls } = result;

    if (toolCalls.length > 0) {
      if (onToolCalls) await onToolCalls(toolCalls);
      const hasAskUser = toolCalls.some(tc => tc.name === 'ask_user');
      // create_content_plan is terminal like ask_user: the client renders
      // the plan + "Generate content" button and the user drives the next
      // step. Iterating again after the tool_result would make the model
      // re-type the plan as prose in chat.
      const hasContentPlan = toolCalls.some(tc => tc.name === 'create_content_plan');
      if (hasAskUser || hasContentPlan || planMode) {
        if (content) lastContent += content;
        return { content: lastContent, toolCalls: [] };
      }
      const assistantMsg = { role: 'assistant', content: content || null };
      assistantMsg.tool_calls = toolCalls.map(tc => ({
        id: tc.id,
        type: 'function',
        function: { name: tc.name, arguments: tc.arguments },
      }));
      conversationMessages.push(assistantMsg);
      for (const tc of toolCalls) {
        conversationMessages.push({
          role: 'tool',
          tool_call_id: tc.id,
          content: typeof tc.result === 'string' && tc.result.length > 0 ? tc.result : 'Done',
        });
      }
      if (content) lastContent += content;
      continue;
    }

    if (content) lastContent += content;
    return { content: lastContent, toolCalls: [] };
  }

  return { content: lastContent, toolCalls: [] };
}

// Translate OpenAI-format tool schemas (used by the rest of AICEO) into
// Anthropic-format tool blocks. OpenAI: { type: 'function', function: {
// name, description, parameters } }. Anthropic: { name, description,
// input_schema }. Only OpenAI-style entries are translated; anything
// already shaped correctly passes through.
function openAiToolsToAnthropic(tools) {
  if (!Array.isArray(tools)) return [];
  return tools.map((t) => {
    if (t?.function?.name) {
      return {
        name: t.function.name,
        description: t.function.description || '',
        input_schema: t.function.parameters || { type: 'object', properties: {} },
      };
    }
    if (t?.name && (t.input_schema || t.parameters)) {
      return {
        name: t.name,
        description: t.description || '',
        input_schema: t.input_schema || t.parameters,
      };
    }
    return null;
  }).filter(Boolean);
}

// Translate our OpenAI-format tool_choice ('auto' | 'required' | 'none' |
// { function: { name } }) to Anthropic's shape ({ type: 'auto' | 'any' |
// 'tool', name? }). Anthropic doesn't support 'none' — the caller should
// just not pass tools instead. If undefined, we return undefined and let
// Anthropic default (which is equivalent to 'auto').
function openAiToolChoiceToAnthropic(toolChoice) {
  if (!toolChoice) return undefined;
  if (toolChoice === 'auto') return { type: 'auto' };
  if (toolChoice === 'required') return { type: 'any' };
  if (toolChoice === 'none') return undefined; // caller should strip tools
  if (typeof toolChoice === 'object' && toolChoice.function?.name) {
    return { type: 'tool', name: toolChoice.function.name };
  }
  return undefined;
}

// Convert incoming CEO conversation history (OpenAI-shaped tool_calls +
// tool-result messages) into Anthropic's tool_use / tool_result content
// blocks. Anthropic rejects content: null and content: string when the
// message either has tool_use blocks or follows one. This translation
// runs on every request because our callers (routes/orchestrate.js) build
// the OpenAI shape for compatibility with the previous Grok orchestrator.
//
// OpenAI shape we accept:
//   { role: 'user', content: string }
//   { role: 'assistant', content: string }
//   { role: 'assistant', content: null, tool_calls: [{ id, type, function: { name, arguments } }] }
//   { role: 'tool', tool_call_id: string, content: string }
// Anthropic shape we emit:
//   { role: 'user', content: string }
//   { role: 'assistant', content: string }
//   { role: 'assistant', content: [ {type:'text', text}?, {type:'tool_use', id, name, input} ] }
//   { role: 'user',      content: [ {type:'tool_result', tool_use_id, content} ] }
function convertOpenAiHistoryToAnthropic(messages) {
  const out = [];
  for (const m of messages) {
    if (m.role === 'tool') {
      // Tool result — Anthropic wraps in a user turn.
      out.push({
        role: 'user',
        content: [{
          type: 'tool_result',
          tool_use_id: m.tool_call_id || 'unknown',
          content: typeof m.content === 'string' ? m.content : JSON.stringify(m.content ?? ''),
        }],
      });
      continue;
    }
    if (m.role === 'assistant' && Array.isArray(m.tool_calls) && m.tool_calls.length > 0) {
      const blocks = [];
      if (typeof m.content === 'string' && m.content.length > 0) {
        blocks.push({ type: 'text', text: m.content });
      }
      for (const tc of m.tool_calls) {
        let input = {};
        try { input = tc.function?.arguments ? JSON.parse(tc.function.arguments) : {}; } catch { input = {}; }
        blocks.push({
          type: 'tool_use',
          id: tc.id,
          name: tc.function?.name || tc.name,
          input,
        });
      }
      out.push({ role: 'assistant', content: blocks });
      continue;
    }
    // Plain user or assistant message — normalize null content to empty
    // string (Anthropic rejects null but accepts '').
    if (m.role === 'user' || m.role === 'assistant') {
      out.push({
        role: m.role,
        content: typeof m.content === 'string' ? m.content : (m.content == null ? '' : JSON.stringify(m.content)),
      });
    }
  }
  // Anthropic requires the last message to be role: 'user'. If the
  // history ends with an assistant turn (e.g. an unresolved tool_use),
  // append a synthetic user prompt so the model has something to
  // respond to. This shouldn't happen in practice — the CEO route always
  // ends the transformed history with a real user message — but the
  // guardrail is cheap and makes the failure mode explicit.
  if (out.length === 0 || out[out.length - 1].role !== 'user') {
    out.push({ role: 'user', content: 'Continue.' });
  }
  return out;
}

// ─── Gateway protocol-violation detection + salvage ───
//
// The Mentor gateway (mandatory route — no direct-Anthropic switching)
// intermittently serves /v1/messages with a backing model that ignores
// the native tool protocol and writes what SHOULD be tool_use blocks
// into the text channel. Observed shapes (prompt.md, 2026-07-16):
//   {"tool_code": "print(delegate_to_agent(...))"}       — Gemini-style pseudo call
//   {"type":"newsletter","html":"...","brief":{...}}     — agent generation JSON
//   ask_user(question="...", options=["a","b"])          — bare fn-call syntax
//   plan_carousel(hook="...", slides=[...])              — bare fn-call syntax
//   <!DOCTYPE html>...                                    — raw artifact HTML
// Every one of these used to stream straight into the visible chat.
//
// Strategy: detect → retry ONCE through the same Mentor route (violations
// are intermittent) → if the retry also violates, TRANSLATE the text into
// the native tool call it was meant to be and dispatch it server-side.

// EVERY tool the CEO can call — a pseudo-call of any of them in the text
// channel is a violation. Missing names here = raw tool calls in chat
// (generate_linkedin_post was the gap on 2026-07-16).
const PROTOCOL_FN_NAMES = [
  'ask_user', 'plan_carousel', 'delegate_to_agent', 'generate_image', 'create_artifact',
  'generate_linkedin_post', 'send_email', 'check_emails', 'create_form', 'push_notification', 'save_to_soul',
];
const PROTOCOL_FN_RE = new RegExp(`\\b(${PROTOCOL_FN_NAMES.join('|')})\\s*\\(`);
const AGENT_JSON_TYPE_RE = /"type"\s*:\s*"(newsletter|html|story_sequence|automation|lead_magnet_plan)"/;
const AGENT_JSON_PAYLOAD_RE = /"(html|frames|steps)"\s*:/;
const HTML_DOC_RE = /<!DOCTYPE\s+html|<html[\s>]/i;

// Classify protocol text in a CEO turn. Returns a shape label or null.
export function detectProtocolText(text) {
  const t = text || '';
  // Both variants: {"tool_code": "..."} JSON AND the bare unquoted
  // `tool_code print(fn(...))` form observed 2026-07-16.
  if (/["']?tool_code["']?\s*(:|print\s*\(|\()/.test(t)) return 'tool_code';
  if (AGENT_JSON_TYPE_RE.test(t) && AGENT_JSON_PAYLOAD_RE.test(t)) return 'agent_json';
  if (PROTOCOL_FN_RE.test(t)) return 'fn_call';
  if (HTML_DOC_RE.test(t)) return 'html_doc';
  return null;
}

// Index where protocol content begins in a text blob, or -1. Used to
// keep the conversational preamble and drop everything from the blob on.
export function protocolTextStart(text) {
  const t = text || '';
  const candidates = [];
  const jsonBlob = t.search(/\{\s*"(tool_code|type)"/);
  if (jsonBlob !== -1) candidates.push(jsonBlob);
  const bareToolCode = t.search(/\btool_code\b\s*(:|print\s*\(|\()/);
  if (bareToolCode !== -1) candidates.push(bareToolCode);
  const fnCall = t.search(PROTOCOL_FN_RE);
  if (fnCall !== -1) candidates.push(fnCall);
  const htmlDoc = t.search(HTML_DOC_RE);
  if (htmlDoc !== -1) candidates.push(htmlDoc);
  return candidates.length ? Math.min(...candidates) : -1;
}

// Strip protocol content from a turn's text, keeping the human preamble.
export function stripProtocolText(text) {
  const idx = protocolTextStart(text);
  if (idx === -1) return text || '';
  return (text || '').slice(0, idx).trim();
}

// Parse a python-ish pseudo call — name(key='value', list=[...]) — into
// { name, args }. Tolerant of single/double quotes and flat lists;
// nested structures fall back through a python→JSON literal conversion.
// Returns null when nothing parseable is found.
function parsePseudoCall(text) {
  const m = (text || '').match(PROTOCOL_FN_RE);
  if (!m) return null;
  const name = m[1];
  const openIdx = (text || '').indexOf('(', m.index);
  if (openIdx === -1) return null;
  // Balanced scan for the closing paren, respecting quotes.
  let depth = 0, inStr = null, end = -1;
  for (let i = openIdx; i < text.length; i++) {
    const ch = text[i];
    if (inStr) {
      if (ch === '\\') { i++; continue; }
      if (ch === inStr) inStr = null;
      continue;
    }
    if (ch === '"' || ch === "'") { inStr = ch; continue; }
    if (ch === '(' || ch === '[' || ch === '{') depth++;
    else if (ch === ')' || ch === ']' || ch === '}') {
      depth--;
      if (depth === 0) { end = i; break; }
    }
  }
  if (end === -1) return null;
  const argsSrc = text.slice(openIdx + 1, end);

  // Split top-level `key=value` pairs (commas inside strings/brackets
  // don't split).
  const pairs = [];
  let key = '', buf = '', readingKey = true;
  depth = 0; inStr = null;
  const pushPair = () => {
    if (key.trim()) pairs.push([key.trim(), buf.trim()]);
    key = ''; buf = ''; readingKey = true;
  };
  for (let i = 0; i < argsSrc.length; i++) {
    const ch = argsSrc[i];
    if (inStr) {
      buf += ch;
      if (ch === '\\') { buf += argsSrc[++i] ?? ''; continue; }
      if (ch === inStr) inStr = null;
      continue;
    }
    if (ch === '"' || ch === "'") { inStr = ch; buf += ch; continue; }
    if (ch === '(' || ch === '[' || ch === '{') { depth++; buf += ch; continue; }
    if (ch === ')' || ch === ']' || ch === '}') { depth--; buf += ch; continue; }
    if (readingKey && ch === '=') { readingKey = false; continue; }
    if (!readingKey && ch === ',' && depth === 0) { pushPair(); continue; }
    if (readingKey) key += ch; else buf += ch;
  }
  pushPair();
  if (pairs.length === 0) return null;

  // Convert a python-ish literal to a JS value.
  const toValue = (src) => {
    const s = src.trim();
    if (!s) return '';
    if (s[0] === '"' || s[0] === "'") {
      // Quoted string — unescape the matching quote style.
      const q = s[0];
      const inner = s.slice(1, s.endsWith(q) ? -1 : undefined);
      return inner.replace(new RegExp(`\\\\${q}`, 'g'), q).replace(/\\n/g, '\n');
    }
    if (/^(true|false)$/i.test(s)) return /^true$/i.test(s);
    if (/^-?\d+(\.\d+)?$/.test(s)) return Number(s);
    // Lists / dicts: convert python conventions to JSON with a
    // quote-aware pass (a naive regex corrupts strings containing
    // apostrophes, e.g. "It's great"), then parse.
    try {
      let out = '', run = '', inQuote = null;
      const flushRun = () => {
        out += run.replace(/\bTrue\b/g, 'true').replace(/\bFalse\b/g, 'false').replace(/\bNone\b/g, 'null');
        run = '';
      };
      for (let i = 0; i < s.length; i++) {
        const ch = s[i];
        if (inQuote) {
          if (ch === '\\') {
            const next = s[++i] ?? '';
            // \' inside a python string is just an apostrophe in JSON.
            out += next === "'" ? "'" : '\\' + next;
            continue;
          }
          if (ch === inQuote) { out += '"'; inQuote = null; continue; }
          if (ch === '"') { out += '\\"'; continue; }
          if (ch === '\n') { out += '\\n'; continue; }
          out += ch;
          continue;
        }
        if (ch === "'" || ch === '"') { flushRun(); inQuote = ch; out += '"'; continue; }
        run += ch;
      }
      flushRun();
      return JSON.parse(out);
    } catch {
      return s;
    }
  };

  const args = {};
  for (const [k, v] of pairs) args[k] = toValue(v);
  return { name, args };
}

// Translate protocol text into the OpenAI-style tool calls orchestrate.js
// already dispatches. Returns { cleanText, calls } or null.
export function salvageProtocolTextToToolCalls(rawText) {
  const text = rawText || '';
  const preamble = stripProtocolText(text);

  // Shape 1: {"tool_code": "print(delegate_to_agent(...))"} — the inner
  // string is itself a pseudo call; recurse on it.
  const tcMatch = text.match(/"tool_code"\s*:\s*"((?:[^"\\]|\\.)*)"/);
  if (tcMatch) {
    const inner = tcMatch[1].replace(/\\"/g, '"').replace(/\\n/g, '\n');
    const call = parsePseudoCall(inner);
    if (call && Object.keys(call.args).length) {
      return {
        cleanText: preamble,
        calls: [{ id: `salvage-${Date.now()}`, name: call.name, arguments: JSON.stringify(call.args) }],
      };
    }
    return null;
  }

  // Shape 2: agent generation JSON — {"type":"newsletter","html":...}.
  // The CEO never legitimately answers in this protocol; translate to
  // create_artifact so the user still gets their artifact.
  if (AGENT_JSON_TYPE_RE.test(text) && AGENT_JSON_PAYLOAD_RE.test(text)) {
    const objMatch = text.match(/\{[\s\S]*\}/);
    if (objMatch) {
      const fixNl = (s) => s.replace(/("(?:[^"\\]|\\.)*")|[\n\r\t]/g, (m, q) => q ? q : m === '\n' ? '\\n' : m === '\r' ? '\\r' : '\\t');
      let parsed = null;
      try { parsed = JSON.parse(objMatch[0]); } catch {
        try { parsed = JSON.parse(fixNl(objMatch[0])); } catch { parsed = null; }
      }
      if (parsed && typeof parsed.html === 'string' && parsed.html.includes('<')) {
        const isNewsletter = parsed.type === 'newsletter';
        return {
          cleanText: preamble || parsed.summary || '',
          calls: [{
            id: `salvage-${Date.now()}`,
            name: 'create_artifact',
            arguments: JSON.stringify({
              type: isNewsletter ? 'newsletter' : 'html_template',
              title: (parsed.summary || (isNewsletter ? 'Your newsletter' : 'Generated page')).slice(0, 120),
              content: parsed.html,
            }),
          }],
        };
      }
    }
    return null;
  }

  // Shape 3: bare fn-call syntax — ask_user(...), plan_carousel(...), etc.
  const call = parsePseudoCall(text);
  if (call && Object.keys(call.args).length) {
    // ask_user needs both fields to render the card; don't dispatch half.
    if (call.name === 'ask_user' && !(call.args.question && Array.isArray(call.args.options))) return null;
    return {
      cleanText: preamble,
      calls: [{ id: `salvage-${Date.now()}`, name: call.name, arguments: JSON.stringify(call.args) }],
    };
  }

  return null;
}

// CEO orchestrator on Claude Sonnet. Uses Anthropic's native streaming
// tool_use protocol. Loop follows the same shape as the Grok version:
//   Iteration 1 — model streams text + optional tool_use blocks.
//   If tool_use fires, run handlers, feed results back, iterate.
//   If ask_user was one of the tools OR planMode is on, exit after one
//   iteration (single tool call = the whole response).
// Automatically opts into the 1M-context beta header when the estimated
// input tokens exceed the safe 200K cap (Sonnet-only feature).
async function executeCeoOrchestratorClaude({ systemPrompt, messages, tools, toolChoice, onChunk, onToolCalls, onToolStart, onToolInputDelta, abortSignal, planMode, streamIdleMs, preferDirect = false, salvageOnViolation = false }) {
  const anthropicTools = openAiToolsToAnthropic(tools);
  const anthropicToolChoice = openAiToolChoiceToAnthropic(toolChoice);
  const model = SONNET_MODEL;

  // Translate OpenAI-format conversation (with tool_calls / tool
  // messages) into Anthropic's tool_use / tool_result content blocks.
  // Without this, Anthropic rejects the request with 400
  // "Input should be a valid array" because content: null is invalid.
  let conversationMessages = convertOpenAiHistoryToAnthropic(messages);

  let iterations = 0;
  const MAX_ITERATIONS = 5;
  let accumulatedText = '';

  while (iterations < MAX_ITERATIONS) {
    iterations++;

    const streamResult = await streamAnthropicWithTools({
      systemPrompt,
      messages: conversationMessages,
      model,
      tools: anthropicTools,
      toolChoice: anthropicToolChoice,
      maxTokens: 16000,
      // For follow-up iterations, prepend the already-emitted text so the
      // frontend's cumulative-append onChunk contract holds (each chunk
      // is the FULL rolling content, not a delta).
      onChunk: (rollingChunk) => {
        if (onChunk) onChunk(accumulatedText + rollingChunk);
      },
      onToolStart,
      onToolInputDelta,
      abortSignal,
      streamIdleMs,
      preferDirect,
    });

    const { text, toolUses } = streamResult;

    // Gateway protocol-violation guard. A non-Claude backend behind the
    // Mentor gateway can return 200 but ignore the native tool protocol —
    // emitting the tool call in the TEXT channel instead of a tool_use
    // block. Detection covers every observed shape (tool_code JSON,
    // agent-protocol JSON, bare fn-call syntax, raw HTML docs — see
    // detectProtocolText above).
    //
    // First occurrence in a turn: throw so executeCeoOrchestrator retries
    // once through the SAME Mentor route (violations are intermittent).
    // Retry attempt (salvageOnViolation): don't fail — TRANSLATE. The
    // model did the work; it just delivered it on the wrong channel.
    if (toolUses.length === 0 && detectProtocolText(text)) {
      if (salvageOnViolation) {
        const salvaged = salvageProtocolTextToToolCalls(text);
        if (salvaged) {
          console.warn(`[ceo] Salvaging protocol-text turn → ${salvaged.calls.map(c => c.name).join(', ')}`);
          // Finalize the visible bubble first: the cumulative text_delta
          // contract means this replaces any protocol text that streamed.
          const cleanContent = (accumulatedText + salvaged.cleanText).trim();
          if (onChunk) onChunk(cleanContent);
          if (onToolCalls) await onToolCalls(salvaged.calls);
          return { content: cleanContent, toolCalls: [] };
        }
        // Unsalvageable: strip the protocol text so the user at least
        // gets a clean bubble instead of raw JSON/HTML.
        console.warn('[ceo] Protocol-text turn could not be salvaged — stripping blob from chat');
        const stripped = (accumulatedText + stripProtocolText(text)).trim()
          || 'I hit a glitch preparing that — please try again.';
        if (onChunk) onChunk(stripped);
        return { content: stripped, toolCalls: [] };
      }
      const e = new Error('Model emitted a tool call as text instead of a native tool_use block (gateway protocol violation)');
      e.code = 'PROTOCOL_VIOLATION';
      throw e;
    }

    // Mixed turn: native tool calls fired AND the text channel carries a
    // protocol blob (e.g. the model narrated the artifact HTML alongside
    // a real create_artifact call). Keep the tool calls, strip the blob
    // from the visible text.
    let turnText = text;
    if (toolUses.length > 0 && detectProtocolText(text)) {
      console.warn('[ceo] Mixed turn — stripping protocol blob from chat text alongside native tool calls');
      turnText = stripProtocolText(text);
      if (onChunk) onChunk((accumulatedText + turnText).trim());
    }

    // Convert Anthropic tool_use blocks to the OpenAI-style shape that
    // orchestrate.js expects: { id, name, arguments (JSON string) }.
    // Preserves compatibility with all existing tool handlers.
    const toolCalls = toolUses.map((tu) => ({
      id: tu.id,
      name: tu.name,
      arguments: JSON.stringify(tu.input || {}),
    }));

    if (toolCalls.length > 0) {
      if (onToolCalls) await onToolCalls(toolCalls);

      // Same early-exit behavior as the Grok version — ask_user always
      // exits (wait for user's answer), create_content_plan exits (the
      // client renders the plan + Generate button), planMode exits after
      // any tool.
      const hasAskUser = toolCalls.some(tc => tc.name === 'ask_user');
      const hasContentPlan = toolCalls.some(tc => tc.name === 'create_content_plan');
      if (hasAskUser || hasContentPlan || planMode) {
        if (turnText) accumulatedText += turnText;
        return { content: accumulatedText, toolCalls: [] };
      }

      // Push assistant turn (with tool_use blocks) into conversation
      // history, then push the tool_result blocks as a user turn — this
      // is Anthropic's protocol for multi-turn tool use.
      const assistantBlocks = [];
      if (text) assistantBlocks.push({ type: 'text', text });
      for (const tu of toolUses) {
        assistantBlocks.push({ type: 'tool_use', id: tu.id, name: tu.name, input: tu.input });
      }
      conversationMessages.push({ role: 'assistant', content: assistantBlocks });

      const userToolResults = [];
      for (const tc of toolCalls) {
        userToolResults.push({
          type: 'tool_result',
          tool_use_id: tc.id,
          content: typeof tc.result === 'string' && tc.result.length > 0 ? tc.result : 'Done',
        });
      }
      conversationMessages.push({ role: 'user', content: userToolResults });

      if (turnText) accumulatedText += turnText;
      continue;
    }

    // No tool calls → this is the final text response.
    if (turnText) accumulatedText += turnText;
    return { content: accumulatedText, toolCalls: [] };
  }

  return { content: accumulatedText, toolCalls: [] };
}

// Streaming Anthropic call with tool_use support. Returns the assembled
// text + tool_use blocks. Wraps with 1M-context auto-opt-in via the
// existing streamAnthropic prompt-too-long retry.
async function streamAnthropicWithTools(args) {
  try {
    return await streamAnthropicWithToolsCore(args);
  } catch (err) {
    if (!isPromptTooLongError(err)) throw err;
    if (!/sonnet/i.test(args.model || SONNET_MODEL)) throw err;
    console.log('[anthropic] CEO orchestrator — prompt-too-long, retrying with 1M context flag forced');
    try {
      return await streamAnthropicWithToolsCore({ ...args, forceMillionContext: true });
    } catch (retryErr) {
      if (isPromptTooLongError(retryErr)) {
        const e = new Error('Prompt exceeded the 1M context window — conversation is too large to continue. Start a fresh chat session.');
        e.code = 'CONTEXT_EXCEEDED';
        throw e;
      }
      throw retryErr;
    }
  }
}

async function streamAnthropicWithToolsCore({ systemPrompt, messages, model, tools, toolChoice, maxTokens, onChunk, onToolStart, onToolInputDelta, abortSignal, streamIdleMs, forceMillionContext = false, preferDirect = false }) {
  const baseTarget = anthropicTarget();
  // preferDirect: skip the Mentor gateway for this attempt. Used by the
  // protocol-violation retry — when the gateway returns 200 but its
  // backing model ignores the native tool protocol (emits tool calls as
  // literal text), the only fix is re-running against api.anthropic.com
  // directly. Only meaningful when a direct key exists as the fallback.
  const target = preferDirect && baseTarget.fallback ? baseTarget.fallback : baseTarget;

  // Estimate tokens the same way streamAnthropicCore does. Messages here
  // may contain structured tool_use / tool_result blocks — sum their
  // string content for the estimate.
  const stringifyBlock = (b) => typeof b === 'string' ? b : JSON.stringify(b);
  const charCount =
    (systemPrompt?.length || 0) +
    messages.reduce((sum, m) => {
      const c = m.content;
      if (typeof c === 'string') return sum + c.length;
      if (Array.isArray(c)) return sum + c.reduce((s, b) => s + stringifyBlock(b).length, 0);
      return sum;
    }, 0);
  const estimatedTokens = Math.ceil(charCount / 3.5);
  const safeInputCap = 200_000 - (maxTokens || 16_000) - 10_000;
  const threshold = Math.max(140_000, safeInputCap);
  const wantMillion = estimatedTokens > threshold;
  const isSonnet = /sonnet/i.test(model || SONNET_MODEL);
  const useMillionContext = (forceMillionContext || wantMillion) && isSonnet;

  if (useMillionContext) {
    console.log(`[anthropic] CEO 1M-context engaged — model=${model} estimated=${estimatedTokens.toLocaleString()} threshold=${threshold.toLocaleString()} forced=${forceMillionContext}`);
  }

  const controller = new AbortController();
  if (abortSignal) {
    if (abortSignal.aborted) controller.abort();
    else abortSignal.addEventListener('abort', () => controller.abort(), { once: true });
  }

  const buildInit = (t) => ({
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': t.key,
      'anthropic-version': '2023-06-01',
      ...(useMillionContext ? { 'anthropic-beta': 'context-1m-2025-08-07' } : {}),
    },
    body: JSON.stringify({
      model: model || SONNET_MODEL,
      max_tokens: maxTokens || 16000,
      system: systemPrompt,
      messages,
      stream: true,
      ...(tools?.length ? { tools } : {}),
      ...(toolChoice ? { tool_choice: toolChoice } : {}),
    }),
    signal: controller.signal,
  });
  const res = await fetchWithMentorFallback(target, buildInit);

  if (!res.ok) {
    const errText = await res.text().catch(() => 'Unknown error');
    throw new Error(`Anthropic API error (${res.status}): ${errText}`);
  }

  const reader = res.body?.getReader();
  if (!reader) throw new Error('No response body from Anthropic');

  const decoder = new TextDecoder();
  let buffer = '';
  let fullText = '';
  // Anthropic streams content_block_start / content_block_delta events.
  // We assemble tool_use blocks by index. `toolBlocks[idx] = { id, name,
  // inputJson }` — the JSON is accumulated as a string then parsed at
  // the end (safer than parsing partial JSON on every delta).
  const toolBlocks = {};

  while (true) {
    const { done, value } = await readWithIdleTimeout(reader, controller, streamIdleMs);
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
        // Reject gateway-substituted responses before any content flows —
        // message_start is the first event and carries the served model.
        // A substituted backend is what emits tool calls as text (the
        // protocol violations this file guards against downstream).
        if (parsed.type === 'message_start' && isSubstitutedModel(parsed.message?.model, model || SONNET_MODEL)) {
          try { controller.abort(); } catch { /* already closed */ }
          throw gatewaySubstitutionError(parsed.message.model, model || SONNET_MODEL);
        }
        // Text chunks: content_block_delta with delta.type === 'text_delta'
        if (parsed.type === 'content_block_delta' && parsed.delta?.type === 'text_delta') {
          fullText += parsed.delta.text || '';
          if (onChunk) onChunk(fullText);
        }
        // Tool use block starts: content_block_start with content_block.type === 'tool_use'
        if (parsed.type === 'content_block_start' && parsed.content_block?.type === 'tool_use') {
          const idx = parsed.index ?? 0;
          toolBlocks[idx] = {
            id: parsed.content_block.id,
            name: parsed.content_block.name,
            inputJson: '',
          };
          // Fires as soon as the model COMMITS to a tool, long before the
          // (potentially large) argument JSON finishes streaming — lets
          // callers show progress ("Building your carousel plan…") during
          // the silent argument-streaming window.
          if (onToolStart) {
            try { onToolStart(parsed.content_block.name); } catch { /* observer-only */ }
          }
        }
        // Tool input deltas: content_block_delta with delta.type === 'input_json_delta'
        if (parsed.type === 'content_block_delta' && parsed.delta?.type === 'input_json_delta') {
          const idx = parsed.index ?? 0;
          if (toolBlocks[idx]) {
            toolBlocks[idx].inputJson += parsed.delta.partial_json || '';
            // Cumulative partial JSON per tick — lets callers extract
            // progressively-streaming argument fields (e.g. the LinkedIn
            // writer's post_text) for word-by-word UI streaming.
            if (onToolInputDelta) {
              try { onToolInputDelta(toolBlocks[idx].name, toolBlocks[idx].inputJson); } catch { /* observer-only */ }
            }
          }
        }
        // Errors surface as message_delta or explicit error events.
        if (parsed.type === 'error') {
          console.error('[anthropic] CEO stream error:', JSON.stringify(parsed));
          throw new Error(parsed.error?.message || 'Anthropic stream error');
        }
      } catch (e) {
        if (e?.code === 'GATEWAY_SUBSTITUTED') throw e;
        if (e?.message?.startsWith('Anthropic')) throw e;
        // Skip malformed SSE lines.
      }
    }
  }

  // Parse accumulated tool inputs.
  const toolUses = Object.values(toolBlocks).map((tb) => {
    let input = {};
    try { input = tb.inputJson ? JSON.parse(tb.inputJson) : {}; } catch { input = {}; }
    return { id: tb.id, name: tb.name, input };
  });

  return { text: fullText, toolUses };
}
