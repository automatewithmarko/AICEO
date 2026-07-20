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
  SUBMIT_SCRIPT_TOOL,
  buildClaudeChatProtocolAddendum,
  SUBMIT_POST_ADDENDUM,
} from './claude-protocol.js';
import { CREATE_CONTENT_PLAN_TOOL } from '../content-plan-tool.js';
import { buildPlanModeDirective } from './plan-mode.js';

export async function handleContentOrchestration({ res, sendSSE, body, userId, abortSignal = null }) {
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
    recentContent = [],
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
      abortSignal,
      // Suppress free text: with a pinned tool there should be none, and
      // anything that does appear is reasoning that must not hit the preview.
      onChunk: () => {},
      // Word-by-word streaming: extract the growing post_text string from
      // the partial tool-argument JSON on every delta and forward it as a
      // cumulative text_delta — the preview fills progressively like the
      // legacy Grok flow did, while the forced-tool channel still keeps
      // reasoning out of the post.
      onToolInputDelta: (name, partialJson) => {
        if (name !== 'submit_post') return;
        const m = partialJson.match(/"post_text"\s*:\s*"((?:[^"\\]|\\.)*)/);
        if (!m) return;
        try {
          const partial = JSON.parse(`"${m[1]}"`);
          if (partial) sendSSE(res, { type: 'text_delta', content: partial });
        } catch { /* mid-escape tick — next delta will parse */ }
      },
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
      abortSignal,
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

  // Cross-platform content reuse: the client ships the TEXT of recently
  // generated posts (any platform) so the model can repurpose actual
  // wording after a platform switch ("make an Instagram version of that
  // LinkedIn post"). Text reference ONLY — hard-fenced from the artifact
  // and edit-mode machinery, which key off `existingPost`/message state.
  let recentContentBlock = '';
  if (Array.isArray(recentContent) && recentContent.length > 0) {
    recentContentBlock = `\n\n=== PREVIOUSLY GENERATED CONTENT IN THIS CONVERSATION (cross-platform reference) ===\n`
      + `These posts were already generated in this conversation — possibly for OTHER platforms. When the user references earlier content ("make an Instagram version of that post", "same idea as the LinkedIn post"), reuse the actual wording and ideas below as your source material.\n`
      + `RULES:\n`
      + `- Reference text ONLY. These are NOT on-screen artifacts: never enter edit mode for them, never assume they are visible to the user right now.\n`
      + `- Anything NEW you create still follows the CURRENT platform's format, tone, and tool rules exactly as specified above.\n\n`
      + recentContent
          .slice(-4)
          .map((r, i) => `--- ${i + 1}. [${String(r.platform || 'unknown')}] ${String(r.kind || 'post')} ---\n${String(r.text || '').slice(0, 2000)}`)
          .join('\n\n');
  }

  // Plan Mode — the SAME in-chat content-plan system the AI CEO uses
  // (shared directive in plan-mode.js, create_content_plan tool,
  // ContentPlanMessage card, plan-item generation): one implementation,
  // fixes ship to every tab. The /Content platform pill pre-answers the
  // platform question. The legacy inline-HTML plan flow is RETIRED
  // (founder direction 2026-07-17) — every platform pill has a
  // plan-format matrix entry now.
  let systemPrompt;
  if (planMode) {
    systemPrompt = buildPlanModeDirective({ lockedPlatform: platform })
      + buildSystemPrompt(
          platform, photos, documents, socialUrls, brandDna,
          integrationContext, carouselTemplates, existingPost, { planMode: false },
        )
      + recentContentBlock;
  } else {
    systemPrompt = buildSystemPrompt(
      platform, photos, documents, socialUrls, brandDna,
      integrationContext, carouselTemplates, existingPost, { planMode: false },
    ) + recentContentBlock
      + buildClaudeChatProtocolAddendum({ isLinkedin, editModeActive, planPlatformId: platform?.id });
  }

  // Toolsets: plan mode = [ask_user, create_content_plan] (same
  // restriction as the CEO's plan mode). Normal turns get the full
  // protocol toolset PLUS create_content_plan — a typed "plan my next
  // 2 weeks" works without the Plan Mode toggle, exactly like AI CEO.
  const tools = [CONTENT_ASK_USER_TOOL, CREATE_CONTENT_PLAN_TOOL];
  if (!planMode) {
    tools.push(IMAGE_TOOL, PLAN_CAROUSEL_TOOL, SUBMIT_SCRIPT_TOOL);
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
  let questionEmitted = false;
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
    abortSignal,
    onChunk: (content) => {
      lastContent = content;
      sendSSE(res, { type: 'text_delta', content });
    },
    // Progress during the silent tool-argument streaming window — a big
    // carousel plan takes 15-30s to stream after the model's chat text has
    // already finished, which used to look like a hang.
    onToolStart: (name) => {
      if (name === 'plan_carousel') {
        sendSSE(res, { type: 'status', text: 'Building your carousel plan…' });
      } else if (name === 'create_content_plan') {
        sendSSE(res, { type: 'status', text: 'Building your content plan…' });
      } else if (name === 'generate_image') {
        sendSSE(res, { type: 'status', text: 'Preparing your image…' });
      } else if (name === 'submit_script') {
        sendSSE(res, { type: 'status', text: 'Writing your script…' });
      }
    },
    onToolCalls: async (toolCalls) => {
      for (const call of toolCalls) {
        let args;
        try { args = JSON.parse(call.arguments); } catch { args = {}; }

        if (call.name === 'generate_image' || call.name === 'plan_carousel' || call.name === 'create_content_plan' || call.name === 'submit_script') {
          // Executed on the frontend (Phase 1) — relay like ceo mode does.
          sendSSE(res, { type: 'tool_call', name: call.name, arguments: args });
        } else if (call.name === 'ask_user') {
          // Translate to the legacy inline-JSON question block that
          // Content.jsx's questionParsed logic renders as clickable options.
          // ONLY the first ask_user of the turn: two JSON blocks in one
          // stream break the frontend's greedy question extractor and the
          // user would see an empty bubble (robustness audit A6). The
          // model is instructed one-question-per-turn anyway — dropping a
          // second violates nothing the user was promised.
          if (args.question && !questionEmitted) {
            questionEmitted = true;
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
