// Unified /Content orchestration handler — Phase 1 + 1b of the unified
// content backend (docs/unified-content-backend-plan.md).
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
// Phase 1b (robustness parity — see claude-protocol.js and prompt.md):
//   The legacy text-marker protocol (inline JSON questions, <<READY_A/B>>,
//   <<EDIT_TEXT>>) was reliable on Grok but not on Claude — observed
//   failures: reasoning/planning leaking into the post preview, posts
//   written directly in chat, plain-text questions. The protocol now runs
//   through native tools (ask_user / generate_linkedin_post /
//   edit_linkedin_post / submit_post) and this handler TRANSLATES the tool
//   calls back into the legacy text conventions, so the /Content frontend
//   (parsers, safety nets, previews) is unchanged and byte-compatible.
//
// Intents (mirror the legacy call sites in src/pages/Content.jsx):
//   'chat'            → main strategist conversation (buildSystemPrompt)
//   'linkedin_post'   → Call 2 after <<READY_A>>/<<READY_B>> (variation prompt)
//   'linkedin_edit'   → Call 2 after <<EDIT_TEXT>> (in-place post rewrite)
//   'legacy_carousel' → Call 2 after deprecated <<READY_CAROUSEL>>
import { executeCeoOrchestrator } from '../base-agent.js';
import { SONNET_MODEL } from '../../config/models.js';
import { buildSystemPrompt } from './build-system-prompt.js';
import {
  buildLinkedInPostSystemPrompt,
  buildLinkedInEditSystemPrompt,
  buildLegacyCarouselSystemPrompt,
} from './second-pass-prompts.js';
import { IMAGE_TOOL, PLAN_CAROUSEL_TOOL } from './tools.js';
import {
  CONTENT_ASK_USER_TOOL,
  GENERATE_LINKEDIN_POST_TOOL,
  EDIT_LINKEDIN_POST_TOOL,
  SUBMIT_POST_TOOL,
  buildClaudeChatProtocolAddendum,
  SUBMIT_POST_ADDENDUM,
} from './claude-protocol.js';

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

  console.log(`[content-orchestrate] intent=${intent} platform=${platform?.id} planMode=${planMode} userId=${userId} msgCount=${messages?.length}`);

  // ── Call-2 passes: linkedin_post (READY_A/B) and linkedin_edit (EDIT_TEXT) ──
  // tool_choice is PINNED to submit_post so the model cannot stream
  // planning/meta-commentary into the preview — the only thing that
  // reaches the client is the structured post_text (prompt.md failure #1).
  if (intent === 'linkedin_post' || intent === 'linkedin_edit') {
    const systemPrompt = (intent === 'linkedin_post'
      ? buildLinkedInPostSystemPrompt({ variation, userName, brandDna, socialUrls, documents })
      : buildLinkedInEditSystemPrompt({
          editInstruction: edit?.editInstruction || 'Refine the post based on the conversation.',
          existingContent: edit?.existingContent || '',
          userName,
          brandDna,
        })
    ) + SUBMIT_POST_ADDENDUM;

    sendSSE(res, {
      type: 'debug_prompt',
      site: `content-${intent}`,
      model: SONNET_MODEL,
      systemPrompt,
      lastUser: messages?.findLast?.((m) => m.role === 'user')?.content?.toString?.().slice(0, 2000) || null,
    });
    sendSSE(res, { type: 'status', text: 'Writing...' });

    let submitted = null;
    const result = await executeCeoOrchestrator({
      systemPrompt,
      messages,
      tools: [SUBMIT_POST_TOOL],
      toolChoice: { function: { name: 'submit_post' } },
      // planMode:true = the orchestrator loop's exit-after-first-tool-round
      // switch — one forced submit_post call and we're done.
      planMode: true,
      searchMode: false,
      // Suppress free text: with a pinned tool there should be none, and
      // anything that does appear is reasoning that must not hit the preview.
      onChunk: () => {},
      onToolCalls: async (toolCalls) => {
        for (const call of toolCalls) {
          if (call.name !== 'submit_post') continue;
          let args;
          try { args = JSON.parse(call.arguments); } catch { args = {}; }
          if (args.post_text) {
            submitted = String(args.post_text).trim();
            sendSSE(res, { type: 'text_delta', content: submitted });
          }
        }
      },
    });

    // Fallback: if the model somehow returned text without calling the
    // tool (provider fallback quirks), forward the raw content rather than
    // leaving the preview empty.
    if (!submitted) {
      const fallbackText = (result?.content || '').trim();
      console.warn(`[content-orchestrate] ${intent}: no submit_post call — falling back to raw text (${fallbackText.length} chars)`);
      if (fallbackText) sendSSE(res, { type: 'text_delta', content: fallbackText });
    }
    return;
  }

  // ── Legacy carousel Call 2 (deprecated <<READY_CAROUSEL>> flow) ──
  if (intent === 'legacy_carousel') {
    const systemPrompt = buildLegacyCarouselSystemPrompt({ userName, brandDna, socialUrls, documents });
    sendSSE(res, { type: 'debug_prompt', site: 'content-legacy_carousel', model: SONNET_MODEL, systemPrompt, lastUser: null });
    sendSSE(res, { type: 'status', text: 'Thinking...' });
    await executeCeoOrchestrator({
      systemPrompt,
      messages,
      tools: [IMAGE_TOOL],
      planMode: true,
      searchMode: false,
      onChunk: (content) => sendSSE(res, { type: 'text_delta', content }),
      onToolCalls: async (toolCalls) => {
        for (const call of toolCalls) {
          if (call.name !== 'generate_image') continue;
          let args;
          try { args = JSON.parse(call.arguments); } catch { args = {}; }
          sendSSE(res, { type: 'tool_call', name: call.name, arguments: args });
        }
      },
    });
    return;
  }

  // ── Main strategist chat ──
  const isLinkedin = platform?.id === 'linkedin';
  // Mirror Content.jsx's edit-mode condition: a non-carousel LinkedIn post
  // is on screen (buildSystemPrompt switches into LinkedIn Edit Mode on
  // the same condition).
  const editModeActive = !!(isLinkedin && existingPost?.content && (existingPost.totalSlides || 0) === 0);

  const systemPrompt = buildSystemPrompt(
    platform, photos, documents, socialUrls, brandDna,
    integrationContext, carouselTemplates, existingPost, { planMode },
  ) + buildClaudeChatProtocolAddendum({ planMode, isLinkedin, editModeActive });

  // Plan Mode is text-only in the legacy flow (the plan HTML is the
  // output) — the only tool Claude gets is ask_user for the scoping
  // questions. Non-plan turns get the full protocol toolset.
  const tools = [CONTENT_ASK_USER_TOOL];
  if (!planMode) {
    tools.push(IMAGE_TOOL, PLAN_CAROUSEL_TOOL);
    if (isLinkedin) {
      tools.push(GENERATE_LINKEDIN_POST_TOOL);
      if (editModeActive) tools.push(EDIT_LINKEDIN_POST_TOOL);
    }
  }

  sendSSE(res, {
    type: 'debug_prompt',
    site: 'content-chat',
    model: SONNET_MODEL,
    systemPrompt,
    lastUser: messages?.findLast?.((m) => m.role === 'user')?.content?.toString?.().slice(0, 2000) || null,
  });
  sendSSE(res, { type: 'status', text: 'Thinking...' });

  // All base-agent streamers call onChunk with the FULL rolling content
  // (not deltas) — the same contract Content's onTextChunk expects. We
  // track it so protocol translations can APPEND to the visible stream:
  // the frontend's existing marker/JSON parsers operate on this cumulative
  // text and stay byte-compatible.
  let lastContent = '';
  const appendToStream = (chunk) => {
    lastContent = lastContent ? `${lastContent}\n\n${chunk}` : chunk;
    sendSSE(res, { type: 'text_delta', content: lastContent });
  };

  await executeCeoOrchestrator({
    systemPrompt,
    messages,
    tools,
    // Single-round tool semantics: the legacy Grok /Content flow is ONE
    // request — the model streams chat text and fires its tools at most
    // one round, then the client acts on them. planMode:true is the
    // orchestrator loop's exit-after-first-tool-round switch, which
    // reproduces that exactly (ask_user also always exits the loop).
    planMode: true,
    searchMode: false,
    onChunk: (content) => {
      lastContent = content;
      sendSSE(res, { type: 'text_delta', content });
    },
    onToolCalls: async (toolCalls) => {
      for (const call of toolCalls) {
        let args;
        try { args = JSON.parse(call.arguments); } catch { args = {}; }

        if (call.name === 'generate_image' || call.name === 'plan_carousel') {
          // Executed on the frontend (Phase 1) — relay like ceo mode does.
          sendSSE(res, { type: 'tool_call', name: call.name, arguments: args });
        } else if (call.name === 'ask_user') {
          // Translate to the legacy inline-JSON question block that
          // Content.jsx's questionParsed logic renders as clickable options.
          if (args.question) {
            appendToStream(JSON.stringify({
              type: 'question',
              text: args.question,
              options: Array.isArray(args.options) ? args.options : [],
            }));
          }
        } else if (call.name === 'generate_linkedin_post') {
          // Translate to the legacy READY marker that triggers Call 2.
          appendToStream(args.variation === 'B' ? '<<READY_B>>' : '<<READY_A>>');
        } else if (call.name === 'edit_linkedin_post') {
          // Translate to the legacy edit-mode markers. <<EDIT_TEXT>> carries
          // the rewrite instruction after the marker (Content.jsx splits on
          // the marker and treats the remainder as the instruction).
          const action = args.action;
          if (action === 'edit_text') {
            appendToStream(`<<EDIT_TEXT>>\n${args.instruction || 'Refine the post based on the conversation.'}`);
          } else if (action === 'add_image_ai') {
            appendToStream('<<ADD_IMAGE_AI>>');
          } else if (action === 'use_uploaded_image') {
            appendToStream('<<USE_UPLOADED_IMAGE>>');
          } else if (action === 'add_image_ask') {
            appendToStream('<<ADD_IMAGE_ASK>>');
          }
        }
      }
    },
  });
}
