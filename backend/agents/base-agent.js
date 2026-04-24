// Generic LLM streaming executor  -  supports Anthropic and XAI providers

const MENTOR_BASE = process.env.MENTOR_BASE_URL || 'https://platform.thementorprogram.xyz';
const ANTHROPIC_API = `${MENTOR_BASE}/api/v1/messages`;
const XAI_API = `${MENTOR_BASE}/api/v1/chat/completions`;

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

// Stream from Anthropic Claude API (via Mentor gateway)
async function streamAnthropic({ systemPrompt, messages, model, maxTokens, onChunk, abortSignal, streamIdleMs }) {
  const apiKey = process.env.MENTOR_API_KEY;
  if (!apiKey) throw new Error('MENTOR_API_KEY not configured');

  // Convert to Anthropic format (separate system from user/assistant)
  const anthropicMessages = messages
    .filter(m => m.role === 'user' || m.role === 'assistant')
    .map(m => ({ role: m.role, content: m.content }));

  // Link caller's abort signal to our internal controller so the idle watchdog
  // can abort the upstream fetch even when the caller didn't pass a signal.
  const controller = new AbortController();
  if (abortSignal) {
    if (abortSignal.aborted) controller.abort();
    else abortSignal.addEventListener('abort', () => controller.abort(), { once: true });
  }

  const res = await fetch(ANTHROPIC_API, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify({
      model: model || 'claude-sonnet-4-20250514',
      max_tokens: maxTokens || 16000,
      system: systemPrompt,
      messages: anthropicMessages,
      stream: true,
    }),
    signal: controller.signal,
  });

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

// Stream from XAI Grok API via Mentor (OpenAI-compatible)
async function streamXai({ systemPrompt, messages, model, maxTokens, tools, onChunk, onToolCalls, abortSignal, streamIdleMs }) {
  const apiKey = process.env.MENTOR_API_KEY;
  if (!apiKey) throw new Error('MENTOR_API_KEY not configured');

  const body = {
    model: model || 'grok-4-1-fast-non-reasoning',
    messages: [{ role: 'system', content: systemPrompt }, ...messages],
    stream: true,
    max_tokens: maxTokens || 8000,
  };

  if (tools?.length) {
    body.tools = tools;
    body.tool_choice = 'auto';
  }

  // Link caller's abort signal to our internal controller so the idle watchdog
  // can abort the upstream fetch.
  const controller = new AbortController();
  if (abortSignal) {
    if (abortSignal.aborted) controller.abort();
    else abortSignal.addEventListener('abort', () => controller.abort(), { once: true });
  }

  const res = await fetch(XAI_API, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify(body),
    signal: controller.signal,
  });

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

// Stream from XAI Responses API with web_search (via Mentor gateway)
async function streamXaiResearch({ systemPrompt, messages, model, onChunk, onSearchStatus, onSearchResult, abortSignal, streamIdleMs }) {
  const apiKey = process.env.MENTOR_API_KEY;
  if (!apiKey) throw new Error('MENTOR_API_KEY not configured');

  if (onSearchStatus) onSearchStatus('searching');

  const input = [{ role: 'system', content: systemPrompt }, ...messages];

  const controller = new AbortController();
  if (abortSignal) {
    if (abortSignal.aborted) controller.abort();
    else abortSignal.addEventListener('abort', () => controller.abort(), { once: true });
  }

  const res = await fetch(`${MENTOR_BASE}/api/v1/responses`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${apiKey}`,
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
export async function executeAnthropicWithTools({ systemPrompt, messages, tools, maxTokens, onToolCall, onText, abortSignal }) {
  const apiKey = process.env.MENTOR_API_KEY;
  if (!apiKey) throw new Error('MENTOR_API_KEY not configured');

  let conversationMessages = messages
    .filter(m => m.role === 'user' || m.role === 'assistant')
    .map(m => ({ role: m.role, content: m.content }));

  let iterations = 0;
  const MAX_ITERATIONS = 15;

  while (iterations < MAX_ITERATIONS) {
    iterations++;

    const res = await fetch(ANTHROPIC_API, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: 'claude-sonnet-4-20250514',
        max_tokens: maxTokens || 4096,
        system: systemPrompt,
        messages: conversationMessages,
        tools,
      }),
      signal: abortSignal,
    });

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
export async function executeCeoOrchestrator({ systemPrompt, messages, tools, onChunk, onToolCalls, searchMode, onSearchStatus, abortSignal }) {
  if (searchMode) {
    return streamXaiResearch({ systemPrompt, messages, model: 'grok-4-1-fast-non-reasoning', onChunk, onSearchStatus, abortSignal });
  }

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
      onChunk: iterations === 1 || !lastContent ? onChunk : (content) => {
        // For follow-up turns, append to previous content
        if (onChunk) onChunk(lastContent + content);
      },
      onToolCalls: null, // We handle tool calls here, not in streamXai
      abortSignal,
    });

    const { content, toolCalls } = result;

    // If there are tool calls, execute them and continue the loop
    if (toolCalls.length > 0) {
      // Execute tool calls via the handler
      if (onToolCalls) await onToolCalls(toolCalls);

      // If ask_user was called, stop the loop  -  wait for user's answer
      const hasAskUser = toolCalls.some(tc => tc.name === 'ask_user');
      if (hasAskUser) {
        if (content) lastContent += content;
        return { content: lastContent, toolCalls: [] };
      }

      // Build assistant message with tool calls (OpenAI format)
      const assistantMsg = { role: 'assistant', content: content || null };
      assistantMsg.tool_calls = toolCalls.map(tc => ({
        id: tc.id,
        type: 'function',
        function: { name: tc.name, arguments: tc.arguments },
      }));
      conversationMessages.push(assistantMsg);

      // Build tool result messages. Handlers can attach `tc.result` to feed
      // real data back to the model (e.g. check_emails returns the inbox).
      for (const tc of toolCalls) {
        conversationMessages.push({
          role: 'tool',
          tool_call_id: tc.id,
          content: typeof tc.result === 'string' && tc.result.length > 0 ? tc.result : 'Done',
        });
      }

      // Track accumulated content
      if (content) lastContent += content;

      // Continue loop  -  model will respond with follow-up text
      continue;
    }

    // No tool calls  -  we have the final text response
    if (content) lastContent += content;
    return { content: lastContent, toolCalls: [] };
  }

  return { content: lastContent || '', toolCalls: [] };
}
