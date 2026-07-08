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
  if (process.env.MENTOR_API_KEY) {
    return {
      url: `${MENTOR_BASE_URL}/api/v1/messages`,
      key: process.env.MENTOR_API_KEY,
      via: 'mentor',
      fallback: direct,
    };
  }
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
async function streamAnthropic(args) {
  try {
    return await streamAnthropicCore(args);
  } catch (err) {
    if (!isPromptTooLongError(err)) throw err;
    const model = args.model || SONNET_MODEL;
    if (!/sonnet/i.test(model)) throw err; // 1M beta is Sonnet-only as of 2026-06
    console.log('[anthropic] prompt-too-long despite estimate — retrying with 1M context flag forced');
    try {
      return await streamAnthropicCore({ ...args, forceMillionContext: true });
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

async function streamAnthropicCore({ systemPrompt, messages, model, maxTokens, onChunk, abortSignal, streamIdleMs, forceMillionContext = false }) {
  const target = anthropicTarget();

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
        if (parsed.type === 'content_block_delta' && parsed.delta?.text) {
          fullContent += parsed.delta.text;
          if (onChunk) onChunk(fullContent);
        }
        if (parsed.type === 'error') {
          console.error('[base-agent] Anthropic stream error:', JSON.stringify(parsed));
        }
      } catch {
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
  const target = anthropicTarget();

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
export async function executeCeoOrchestrator({ systemPrompt, messages, tools, toolChoice, onChunk, onToolCalls, searchMode, onSearchStatus, abortSignal, planMode = false }) {
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
    console.warn(`[ceo] Claude failed (${err?.message?.slice(0, 200) || err}), falling back to Grok`);
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
      if (hasAskUser || planMode) {
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

// CEO orchestrator on Claude Sonnet. Uses Anthropic's native streaming
// tool_use protocol. Loop follows the same shape as the Grok version:
//   Iteration 1 — model streams text + optional tool_use blocks.
//   If tool_use fires, run handlers, feed results back, iterate.
//   If ask_user was one of the tools OR planMode is on, exit after one
//   iteration (single tool call = the whole response).
// Automatically opts into the 1M-context beta header when the estimated
// input tokens exceed the safe 200K cap (Sonnet-only feature).
async function executeCeoOrchestratorClaude({ systemPrompt, messages, tools, toolChoice, onChunk, onToolCalls, abortSignal, planMode, streamIdleMs }) {
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
      abortSignal,
      streamIdleMs,
    });

    const { text, toolUses } = streamResult;

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
      // exits (wait for user's answer), planMode exits after any tool.
      const hasAskUser = toolCalls.some(tc => tc.name === 'ask_user');
      if (hasAskUser || planMode) {
        if (text) accumulatedText += text;
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

      if (text) accumulatedText += text;
      continue;
    }

    // No tool calls → this is the final text response.
    if (text) accumulatedText += text;
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

async function streamAnthropicWithToolsCore({ systemPrompt, messages, model, tools, toolChoice, maxTokens, onChunk, abortSignal, streamIdleMs, forceMillionContext = false }) {
  const target = anthropicTarget();

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
        }
        // Tool input deltas: content_block_delta with delta.type === 'input_json_delta'
        if (parsed.type === 'content_block_delta' && parsed.delta?.type === 'input_json_delta') {
          const idx = parsed.index ?? 0;
          if (toolBlocks[idx]) {
            toolBlocks[idx].inputJson += parsed.delta.partial_json || '';
          }
        }
        // Errors surface as message_delta or explicit error events.
        if (parsed.type === 'error') {
          console.error('[anthropic] CEO stream error:', JSON.stringify(parsed));
          throw new Error(parsed.error?.message || 'Anthropic stream error');
        }
      } catch (e) {
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
