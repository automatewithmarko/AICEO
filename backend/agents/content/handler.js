// Unified /Content orchestration handler — Phase 1 of the unified content
// backend (docs/unified-content-backend-plan.md).
//
// This is the server-side brain for the /Content tab: same prompts as the
// legacy client-side Grok path (verbatim copies in this folder), but
// running Claude Sonnet via the shared base-agent plumbing — the same
// engine the AI CEO and Marketing AI tabs use.
//
// Phase 1 scope (deliberate):
//   - Tool EXECUTION stays on the frontend: generate_image / plan_carousel
//     calls are relayed as `tool_call` SSE events exactly like ceo mode
//     does, and Content's existing execution code does the work. Phase 2
//     moves carousel rendering server-side.
//   - The client sends the same context ingredients it already holds
//     (platform, photos, documents, socialUrls, brandDna,
//     integrationContext, carouselTemplates, existingPost, planMode) and
//     the prompt is assembled here with the verbatim-copied builder —
//     byte-identical prompts, zero behavior drift.
//   - searchMode (web research) is NOT handled here: research turns stay
//     on the legacy client path until a later phase (Grok web_search has
//     no Sonnet equivalent in this stack).
//
// Intents (mirror the legacy call sites in src/pages/Content.jsx):
//   'chat'            → main strategist conversation (buildSystemPrompt)
//   'linkedin_post'   → Call 2 after <<READY_A>>/<<READY_B>> (variation prompt)
//   'linkedin_edit'   → Call 2 after <<EDIT_TEXT>> (in-place post rewrite)
//   'legacy_carousel' → Call 2 after deprecated <<READY_CAROUSEL>>
import { executeAgent, executeCeoOrchestrator } from '../base-agent.js';
import { SONNET_MODEL } from '../../config/models.js';
import { buildSystemPrompt } from './build-system-prompt.js';
import {
  buildLinkedInPostSystemPrompt,
  buildLinkedInEditSystemPrompt,
  buildLegacyCarouselSystemPrompt,
} from './second-pass-prompts.js';
import { IMAGE_TOOL, PLAN_CAROUSEL_TOOL } from './tools.js';

export async function handleContentOrchestration({ res, sendSSE, body, userId }) {
  const {
    messages,
    intent = 'chat',
    platform = { id: 'instagram', name: 'Instagram' },
    contentContext = {},
    planMode = false,
    variation = 'A',
    edit = null,
  } = body || {};

  const {
    photos = [],
    documents = [],
    socialUrls = [],
    brandDna = null,
    integrationContext = null,
    carouselTemplates = [],
    existingPost = null,
    userName = null,
  } = contentContext;

  let systemPrompt;
  let tools = null;

  if (intent === 'linkedin_post') {
    systemPrompt = buildLinkedInPostSystemPrompt({ variation, userName, brandDna, socialUrls, documents });
  } else if (intent === 'linkedin_edit') {
    systemPrompt = buildLinkedInEditSystemPrompt({
      editInstruction: edit?.editInstruction || 'Refine the post based on the conversation.',
      existingContent: edit?.existingContent || '',
      userName,
      brandDna,
    });
  } else if (intent === 'legacy_carousel') {
    systemPrompt = buildLegacyCarouselSystemPrompt({ userName, brandDna, socialUrls, documents });
    tools = [IMAGE_TOOL];
  } else {
    systemPrompt = buildSystemPrompt(
      platform, photos, documents, socialUrls, brandDna,
      integrationContext, carouselTemplates, existingPost, { planMode },
    );
    // Plan Mode is text-only by design — the legacy path omits the tools
    // entirely so the model can only emit the plan HTML (Content.jsx keeps
    // the same rule on its Chat Completions fallback).
    if (!planMode) tools = [IMAGE_TOOL, PLAN_CAROUSEL_TOOL];
  }

  console.log(`[content-orchestrate] intent=${intent} platform=${platform?.id} planMode=${planMode} userId=${userId} msgCount=${messages?.length}`);
  sendSSE(res, {
    type: 'debug_prompt',
    site: `content-${intent}`,
    model: SONNET_MODEL,
    systemPrompt,
    lastUser: messages?.findLast?.((m) => m.role === 'user')?.content?.toString?.().slice(0, 2000) || null,
  });
  sendSSE(res, { type: 'status', text: 'Thinking...' });

  // All base-agent streamers call onChunk with the FULL rolling content
  // (not deltas) — the same contract Content's onTextChunk expects.
  const onChunk = (content) => sendSSE(res, { type: 'text_delta', content });

  if (!tools) {
    // Text-only turns: Plan Mode chat + LinkedIn text-post Call 2.
    await executeAgent({
      agent: {
        name: `content-${intent}`,
        systemPrompt,
        model: SONNET_MODEL,
        maxTokens: 16000,
        provider: 'anthropic',
        streamIdleTimeoutMs: 180_000,
      },
      messages,
      onChunk,
    });
    return;
  }

  await executeCeoOrchestrator({
    systemPrompt,
    messages,
    tools,
    // Single-round tool semantics: the legacy Grok /Content flow is ONE
    // request — the model streams chat text and fires generate_image /
    // plan_carousel at most one round, then the client executes them.
    // planMode:true is the orchestrator loop's exit-after-first-tool-round
    // switch (see executeCeoOrchestratorClaude), which reproduces that
    // exactly. It does NOT restrict which tools are available.
    planMode: true,
    searchMode: false,
    onChunk,
    onToolCalls: async (toolCalls) => {
      for (const call of toolCalls) {
        if (call.name !== 'generate_image' && call.name !== 'plan_carousel') continue;
        let args;
        try { args = JSON.parse(call.arguments); } catch { args = {}; }
        sendSSE(res, { type: 'tool_call', name: call.name, arguments: args });
      }
    },
  });
}
