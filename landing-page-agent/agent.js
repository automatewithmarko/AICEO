import { buildSystemPrompt } from './prompts.js';

const ANTHROPIC_API = 'https://api.anthropic.com/v1/messages';
const MODEL = 'claude-sonnet-4-20250514';

function getHeaders() {
  return {
    'Content-Type': 'application/json',
    'x-api-key': process.env.ANTHROPIC_API_KEY,
    'anthropic-version': '2023-06-01',
  };
}

export async function streamGenerate({ messages, brandDna, onChunk }) {
  const systemPrompt = buildSystemPrompt(brandDna);

  // Convert messages to Anthropic format (separate system from user/assistant)
  const anthropicMessages = messages.map(m => ({
    role: m.role === 'system' ? 'user' : m.role,
    content: m.content,
  })).filter(m => m.role === 'user' || m.role === 'assistant');

  console.log('[agent] Sending request to Anthropic API...');
  console.log('[agent] Messages count:', anthropicMessages.length);

  let res;
  try {
    res = await fetch(ANTHROPIC_API, {
      method: 'POST',
      headers: getHeaders(),
      body: JSON.stringify({
        model: MODEL,
        max_tokens: 16000,
        system: systemPrompt,
        messages: anthropicMessages,
        stream: true,
      }),
    });
  } catch (fetchErr) {
    console.error('[agent] Fetch failed:', fetchErr.message);
    throw fetchErr;
  }

  console.log('[agent] Anthropic API response status:', res.status);

  if (!res.ok) {
    const errText = await res.text().catch(() => 'Unknown error');
    console.error('[agent] API error body:', errText);
    throw new Error(`Claude API error (${res.status}): ${errText}`);
  }

  const reader = res.body?.getReader();
  if (!reader) throw new Error('No response body from Claude');

  const decoder = new TextDecoder();
  let fullContent = '';
  let buffer = '';

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
        if (parsed.type === 'content_block_delta' && parsed.delta?.text) {
          fullContent += parsed.delta.text;
          if (onChunk) onChunk(fullContent);
        }
        if (parsed.type === 'error') {
          console.error('[agent] Anthropic stream error:', JSON.stringify(parsed));
        }
      } catch {
        // skip malformed chunks
      }
    }
  }

  console.log(`[agent] Stream complete. Length: ${fullContent.length}`);
  return fullContent;
}

export async function streamEdit({ currentHtml, instruction, conversationHistory, brandDna, onChunk }) {
  // Don't send full conversation history for edits — it wastes tokens.
  // Send only: system prompt + the current HTML + edit instruction.
  const messages = [
    {
      role: 'user',
      content: `Here is my current landing page HTML. It uses section markers (<!-- SECTION:name --> ... <!-- /SECTION:name -->).

Please edit ONLY the sections that need to change based on my instruction. Respond with:
- {"type":"edit","sections":{"sectionName":"<updated section HTML>"},"summary":"..."} for targeted edits
- {"type":"html","html":"<full HTML>","summary":"..."} only if I ask for a full rewrite

Current HTML:
${currentHtml}`,
    },
    {
      role: 'assistant',
      content: 'I have your current landing page with section markers. What changes would you like me to make?',
    },
    {
      role: 'user',
      content: instruction,
    },
  ];

  return streamGenerate({ messages, brandDna, onChunk });
}
