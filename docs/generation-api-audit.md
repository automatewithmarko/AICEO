# Generation API Usage Audit — Mentor gateway vs direct provider APIs

**Date:** 2026-07-24 · **Last updated:** 2026-07-24 (post-merge: Mentor-first images, 429 throttle, ref sanitization, Whisper failover, Apify transcript actor, direct-call log markers)
**Scope:** every content-generation endpoint (text/LLM + image) across the Marketing AI, AI CEO, and Content tabs.
**Why:** live failures — images failing with `429`, and landing pages failing with "Anthropic credits have been depleted." This report maps which API each path uses (the **Mentor gateway** vs **direct** Anthropic / OpenAI / Gemini), the primary model, and the fallback chain, so it's clear where each error comes from and which lever fixes it.

---

## 0. TL;DR — the two live errors

| Symptom | What's actually happening | Fix lever |
|---|---|---|
| **Landing pages: "Anthropic credits depleted"** | Landing / squeeze / newsletter run on **Claude Sonnet through the Mentor gateway first**. Mentor's *own* upstream Anthropic account is out of credits, so it returns a 400/402 billing error. The code re-tags that and tries to rescue via **direct Anthropic** (`ANTHROPIC_API_KEY`) — but that key is unset or also depleted, so it fails. **FIXED 2026-07-24:** `executeAgent` now degrades **Claude → Grok** on any terminal Claude failure (the same safety net the AI CEO brain has), so these no longer hard-fail when both Anthropic routes are dry. | Fixed in code (Grok fallback). Still worth topping up the Mentor account's Anthropic balance or the direct `ANTHROPIC_API_KEY` so it stays on Claude quality; `ANTHROPIC_PREFER_DIRECT=true` skips the broken Mentor hop. |
| **Images: `429`** | Images try **OpenAI `gpt-image-2` first**, then fall back to **Gemini**. A `429` means the *active* image provider is rate-limited / out of quota. Gemini's prepay credits were already known depleted; if OpenAI (or Mentor's OpenAI account) is also throttled, both hops are exhausted and the user gets the friendly "temporarily unavailable" message. | Top up **Gemini** prepay (`GEMINI_API_KEY` account at ai.studio) and confirm the **OpenAI** image quota (`OPENAI_API_KEY`, or the Mentor account's OpenAI balance) isn't throttled. |

**Root pattern:** the platform prefers a shared **Mentor gateway** for LLM + (some) image calls; direct provider keys are fallbacks. When Mentor's upstream accounts run dry, resilience depends entirely on the direct keys being funded — and for the specialist page agents there is no cross-provider safety net at all.

---

## 1. The two subsystems

Generation splits cleanly into two independently-routed subsystems:

| | **TEXT / LLM** | **IMAGE** |
|---|---|---|
| Used by | landing/squeeze/newsletter/DM/story/lead-magnet pages, carousel *plans*, video scripts, LinkedIn/social copy, all chat | single images, carousel *slide renders*, post images |
| Primary provider | **Anthropic Claude** `claude-sonnet-4-6` | **OpenAI** `gpt-image-2` |
| Primary route | **Mentor gateway** (`/api/v1/messages`) | **Mentor gateway** for no-reference requests; **direct OpenAI** for reference-image requests |
| Fallback 1 | **direct Anthropic** (`api.anthropic.com`) | direct OpenAI, `quality=medium` retry |
| Fallback 2 | **xAI Grok** `grok-4-1-fast-non-reasoning` — **CEO orchestrator only** | **direct Gemini** `gemini-3.1-flash-image-preview` / `-pro-` |
| Gateway proxies it? | Yes (Anthropic + xAI) | Yes in principle (generations + NEW edits endpoint + Gemini-wire) — but our edits path stays direct for gpt-image-2 quality (see §2) |

**Model constants:**
- `SONNET_MODEL = 'claude-sonnet-4-6'` — `backend/config/models.js:11` (the *only* exported constant; no OPUS/HAIKU).
- Grok `grok-4-1-fast-non-reasoning` — hardcoded in `backend/agents/base-agent.js` (357, 482, 601, 631, 781, 894) and `routes/sales.js`.
- `OPENAI_MODEL = process.env.OPENAI_IMAGE_MODEL || 'gpt-image-2'` — `backend/services/openai-image.js:29`.
- `GEMINI_MODEL_FAST = 'gemini-3.1-flash-image-preview'`, `GEMINI_MODEL_PRO = 'gemini-3-pro-image-preview'` — `backend/routes/generate.js:13-14` (PRO only for `instagram_story` / `tiktok`; FAST for everything else — `generate.js:20-35`).

---

## 2. The Mentor gateway

**What it is:** a multi-provider proxy at `https://platform.thementorprogram.xyz` (`MENTOR_BASE_URL`, `base-agent.js:14`) — the "Power Bricks Super API". **Official endpoint list: `docs/API_ENDPOINTS.txt`** (auth, model roster, request/response shapes). It exposes Anthropic-, xAI-, OpenAI-, and Gemini-wire-compatible endpoints. `/api/v1/messages` is documented as a "pure passthrough to api.anthropic.com" (`base-agent.js:3-10`). All routing logic lives in `backend/agents/base-agent.js` — there is no separate `mentor.js`.

**Endpoints it fronts (per `docs/API_ENDPOINTS.txt` — what OUR code uses marked ✓):**
- ✓ Anthropic: `${MENTOR_BASE_URL}/api/v1/messages` (`base-agent.js:27`)
- ✓ xAI chat: `${MENTOR_BASE_URL}/api/v1/chat/completions` (`base-agent.js:52`)
- ✓ xAI responses (web search): `${MENTOR_BASE_URL}/api/v1/responses` (`base-agent.js:68`)
- ✓ Images (OpenAI-wire): `${MENTOR_BASE_URL}/api/v1/images/generations` (`services/openai-image.js:67`). **Caveat:** the official model list for this endpoint is Gemini/Flux/Seedream/SD-class — `gpt-image-2` is NOT listed, so our Mentor-first call may be rejected upstream and fall to direct OpenAI (which the code handles + logs). If Mentor image billing matters, switch the Mentor hop's `model` to a listed one (e.g. `google/gemini-2.5-flash-image`).
- ✗ **Images/edits (NEW — added by the gateway team 2026-07-24, later revision of the endpoint doc):** `${MENTOR_BASE_URL}/api/v1/images/edits` — reference-image editing THROUGH Mentor is now possible. Accepts multipart form-data compatible with the OpenAI SDK's `images.edit()` unchanged; input image required; auto-swaps to each model's edit variant; 400s loudly on non-edit models. Roster: `openai/gpt-image-1` (mask + multi-image), Gemini image models (up to 14 refs), seedream (10), qwen (3). **NOT adopted yet** — our edits path still goes direct because the gateway offers `gpt-image-1`, not the `gpt-image-2` we upgraded to for hands/text quality (founder decision needed: Mentor billing vs gpt-image-2 quality). 25 MB body cap (413 above it) — our sharp downscale to ≤2048px keeps refs well under.
- ✗ **Gemini-wire generateContent**: `${MENTOR_BASE_URL}/api/v1beta/models/{model}:generateContent` — the gateway DOES proxy Gemini-protocol image gen. **Our `generate.js` still calls `generativelanguage.googleapis.com` directly** (predates this doc); migrating the Gemini fallback to this endpoint would put the whole image chain behind Mentor billing. Adoption candidate.
- ✗ Video (async): `${MENTOR_BASE_URL}/api/v1/videos/generations` (Veo/Kling/Runway/etc., 202 + poll_url) — unused by the platform today.
- Auth: `Authorization: Bearer mnt_…` (also `x-api-key` or `?key=`). `401` bad key · `402` out of credits/over budget. Streaming only on chat/messages.

**Route selection (Mentor vs direct)** — the `*Target()` builders in `base-agent.js`:
- `anthropicTarget()` (`21-44`): default = **Mentor primary, direct Anthropic fallback**. `ANTHROPIC_PREFER_DIRECT==='true'` flips to **direct primary, Mentor fallback**. No `MENTOR_API_KEY` → direct only.
- `xaiChatTarget()` (`46-60`) and `xaiResponsesTarget()` (`62-76`): Mentor primary, direct xAI fallback.

**Transport guard** — `fetchWithMentorFallback()` (`base-agent.js:85-106`): runs the primary, retries the fallback **only on 5xx or network throw**. A **4xx is a real error and never falls back**; **aborts** (cancel/timeout) are re-thrown, never retried.

**Silent-model-substitution guard** (the known incident where Mentor served `"claude-sonnet-4-6 (via gemini-2.5-flash fallback)"`). Per `docs/API_ENDPOINTS.txt` this is the gateway's *documented* `/api/v1/messages` fallback chain (Anthropic → Gemini `gemini-3.6-flash` → OpenAI) — not a bug on their side. We still reject it deliberately: substituted models break the native tool protocol (pseudo tool-calls as chat text). The guard:
- `isSubstitutedModel()` (`158-163`), `gatewaySubstitutionError()` (`165-170`) throw `code='GATEWAY_SUBSTITUTED'`.
- Detected on the first stream event (`message_start`) in `streamAnthropicCore` (`331-334`) and `streamAnthropicWithToolsCore` (`1573-1576`), and on the `model` field in `executeAnthropicWithTools` (`712-724`).
- `throwAnthropicApiError()` (`180-189`) also maps a **Mentor 400/402 billing/credit** error to `GATEWAY_SUBSTITUTED` (`servedBy:'mentor-billing-error'`) so a depleted Mentor account reroutes to a direct key instead of failing outright.

**When the code bypasses Mentor and calls a provider SDK directly:**
- `ANTHROPIC_PREFER_DIRECT=true`, or no `MENTOR_API_KEY` set.
- The `preferDirect` rescue after two Mentor substitutions (`base-agent.js:231, 238, 847-863, 1485`).
- **Gemini image generation is direct today** (`generate.js`) — the gateway's `/api/v1beta/models/{model}:generateContent` proxy exists but is not yet adopted (see §2).
- **OpenAI `/images/edits`** (reference-image requests) — direct today for `gpt-image-2` (the gateway's new edits endpoint serves `gpt-image-1`/Gemini-class instead; adoption pending a quality call — see §2).

---

## 3. TEXT / LLM routing — per execution function

All in `backend/agents/base-agent.js`.

| Function | Used for | Primary | Fallback chain (trigger) |
|---|---|---|---|
| `executeAgent` (`581-644`) | **landing, squeeze, newsletter, DM, story, lead-magnet** (all specialist agents), plan-item text | Claude `claude-sonnet-4-6` via `streamAnthropic` (Mentor→direct) | **Mentor→direct-Anthropic only** (trigger: `GATEWAY_SUBSTITUTED`). **No Grok fallback.** `searchMode` runs a Grok research pass *first*, then Claude writes. |
| `streamAnthropic` (`191-350`) | the Anthropic transport under `executeAgent` | Claude via `anthropicTarget()` | substitution retry → direct-Anthropic rescue (`GATEWAY_SUBSTITUTED`); prompt-too-long → 1M-context beta retry → `CONTEXT_EXCEEDED` |
| `executeAnthropicWithTools` (`649-766`) | file-based artifact editing (non-streaming tool loop) | Claude `claude-sonnet-4-6`, Mentor + `fetchWithMentorFallback` | Mentor retry → direct-Anthropic on served-model substitution |
| `executeCeoOrchestrator` (`770-888`) | **AI CEO brain** (chat, carousel plans, delegation, LinkedIn writer) | Claude `claude-sonnet-4-6` via `streamAnthropicWithTools` (Mentor) | **The resilient one:** substitution/protocol retry (Mentor) → direct-Anthropic rescue → **`executeCeoOrchestratorGrok`** (`893-954`, Grok `grok-4-1-fast-non-reasoning`) on any non-abort/non-context Claude failure. Aborts & `CONTEXT_EXCEEDED` re-thrown. |
| `streamXai` (`353-459`) | Grok chat (CEO fallback, direct-agent Grok) | Grok `grok-4-1-fast-non-reasoning` via `xaiChatTarget()` (Mentor→direct xAI) | none cross-provider |
| `streamXaiResearch` (`462-578`) | web search (CEO searchMode, agent research pass) | Grok `grok-4-1-fast-non-reasoning`, xAI **Responses API** + `web_search`, via `xaiResponsesTarget()` | none cross-provider |

**The critical asymmetry (now resolved):** the **AI CEO orchestrator degrades Claude → Grok** on almost any failure. Until 2026-07-24 the **specialist page agents did not** — their only recovery was Mentor→direct-Anthropic, so a genuine credit exhaustion surfaced to the user with no safety net (the landing-page failure). **`executeAgent` now wraps its Anthropic calls in `streamAnthropicWithGrokFallback`** (`base-agent.js`), giving every specialist agent — and the Marketing AI direct-agent path — the same Claude→Grok degrade. Aborts and `CONTEXT_EXCEEDED` still bubble up; everything else falls back to Grok.

**Where the credit error is produced:** `throwAnthropicApiError()` (`base-agent.js:180-189`). Mentor + credit message → `GATEWAY_SUBSTITUTED` (reroutes to direct). Direct Anthropic + credit message → thrown raw as `Anthropic API error (400): ...credit balance is too low...`, which bubbles to `orchestrate.js:1039-1050` and is sent to the client verbatim as an SSE `error`.

---

## 4. IMAGE routing — verified order

Two HTTP entry points funnel into one core function `generateImageCore` (`backend/routes/generate.js:428`): `POST /api/generate/image` (`:819`) and `POST /api/generate/carousel` (per-slide, `:912→:1076`). The AI CEO `generate_image` tool reaches it via a server-to-server fetch (`stagedemo.js`). OpenAI details live in `backend/services/openai-image.js`.

**Provider order (`generate.js:646, 660-705`, verified):**

1. **OpenAI `gpt-image-2`** — primary, `quality:'high'`, 110s cap (`:660-672`).
   - **No reference images + `MENTOR_API_KEY` set →** Mentor gateway `/api/v1/images/generations` (`openai-image.js:139-150`). Success log: `✅ image generated via MENTOR gateway`.
   - **Reference images present (brand logo/photos/attachment — the common case) →** **direct** OpenAI `/v1/images/edits` (Mentor has no edits endpoint, `openai-image.js:156`). Because `generateImageCore` auto-fetches brand assets from the DB, most real requests carry references, so **direct OpenAI is the usual first hop, not Mentor.**
2. **OpenAI `quality=medium` retry** — only if attempt 1 returned a **timeout or ≥500** (`generate.js:679-688`). A `429` is *not* a timeout/5xx, so it **skips this retry and falls straight to Gemini.**
3. **Gemini** `gemini-3.1-flash-image-preview` (or `-pro-` for story/tiktok) — **always direct** (`generate.js:707-712`), 90s fast / 120s pro.

**Error handling:**
- OpenAI 429/400 → `openai-image.js` captures `status`; falls through to Gemini (not surfaced unless Gemini also fails).
- Gemini 429 (`RESOURCE_EXHAUSTED` / "prepayment credits are depleted") → raw body logged, user sees `"Image generation is temporarily unavailable (provider capacity)..."`.
- Carousel route: `isRateLimited` arms a shared cooldown gate on any slide 429 so parallel workers back off; concurrency capped at 4 with 500ms staggered worker starts; up to 4 attempts/slide (429s back off 8s+ escalating with jitter, other errors 1.5s×attempt).

**Reference-image hardening (2026-07-24, after the poisoned-ref incident):**
- Every fetched reference (brand logo/photos/anchor slides) is sanitized through **sharp** in `fetchImageAsBase64` (`generate.js`): decode-validate, downscale to ≤2048px, re-encode (PNG if alpha, else JPEG q92). An undecodable file is **dropped with a log**, not passed through. One corrupt brand photo used to 400 every OpenAI edits call and cascade the whole carousel onto Gemini, which then 429'd under the parallel burst.
- If OpenAI still rejects a specific reference (`400 "Invalid image file or mode for image N"`), `openai-image.js` drops that ref and **retries the edits call once** before falling to Gemini.

**Observability contract — every direct (non-Mentor) provider call announces itself in the logs:**
- `⚠️ DIRECT OPENAI API (images/edits, N reference images)` — forced direct, Mentor has no `/images/edits`.
- `⚠️ DIRECT OPENAI API — MENTOR_API_KEY not configured` — text-to-image with no gateway key.
- `⚠️ MENTOR gateway image generation failed (...) — FALLING BACK TO DIRECT OPENAI API`.
- `⚠️ DIRECT GEMINI API in use` — the whole Gemini path is inherently direct (no Mentor proxy).
- `⚠️ DIRECT GROQ API (Whisper)` — no Mentor audio endpoint.
Grep `railway logs` for `DIRECT` to see exactly which calls bypassed the gateway and why.

---

## 5. Per-feature / per-tab mapping

| Feature | Tab(s) | Endpoint | Handler / agent | Provider · Model |
|---|---|---|---|---|
| **Landing page** | AI CEO, Marketing AI | `POST /api/orchestrate` (ceo delegates / direct) | `landing-page` agent → `executeAgent` | **Text: Claude `claude-sonnet-4-6`** (Mentor→direct) |
| **Squeeze page** | AI CEO, Marketing AI | `POST /api/orchestrate` | `squeeze-page` → `executeAgent` | **Claude `claude-sonnet-4-6`** |
| **Newsletter** | AI CEO, Marketing AI | `POST /api/orchestrate` | `newsletter` → `executeAgent` | **Claude `claude-sonnet-4-6`** (+ cover image = OpenAI→Gemini) |
| **DM automation** | AI CEO, Marketing AI | `POST /api/orchestrate` | `dm-automation` → `executeAgent` | **Claude `claude-sonnet-4-6`** |
| **Story / Lead magnet** | Marketing AI | `POST /api/orchestrate` | `story-sequence` / `lead-magnet` → `executeAgent` | **Claude `claude-sonnet-4-6`** |
| **Carousel PLAN** (text) | AI CEO, Content | `/api/orchestrate` · `/api/content-orchestrate` · `/api/orchestrate/plan-item` | `plan_carousel` via `executeCeoOrchestrator` | **Claude `claude-sonnet-4-6`** (Grok fallback on CEO path) |
| **Carousel SLIDE render** (image) | AI CEO, Content | `POST /api/generate/carousel` | `generateImageCore` per slide | **OpenAI `gpt-image-2` → Gemini** |
| **Single image** | all tabs | `POST /api/generate/image` | `generateImageCore` | **OpenAI `gpt-image-2` → Gemini** |
| **Video scripts** | AI CEO, Content | `/api/orchestrate` · `/api/content-orchestrate` · `plan-item` | `create_artifact` / text formats | **Claude `claude-sonnet-4-6`** (no image) |
| **LinkedIn / social posts** | AI CEO, Content | `/api/orchestrate` · `plan-item` · `/api/content-orchestrate` | `runLinkedInTextPostPass` / `content_post` | **Claude `claude-sonnet-4-6`**; images = OpenAI→Gemini |

**`mode` selection in `POST /api/orchestrate`** (`orchestrate.js:920-1037`): `mode:'direct'` → `handleDirectAgent` (**Marketing AI** tab, runs the named specialist directly); `mode:'ceo'` (default) → `handleCeoOrchestration` (**AI CEO** tab). The **Content** tab does not use `/api/orchestrate` — it posts to `POST /api/content-orchestrate` → `handleContentOrchestration` (also Claude Sonnet). **Carousels exist only in AI CEO and Content**, not Marketing AI.

---

## 6. Other / adjacent LLM call sites (not the main content path)

- `routes/stagedemo.js:940-952` — **direct** Anthropic (`api.anthropic.com`, `x-api-key`), `claude-sonnet-4-6`, for HTML artifact edits in the stage-demo/voice flow. **Never uses Mentor, no fallback.**
- `routes/email.js` — AI email drafting via `anthropicTarget()` (Mentor→direct), `claude-sonnet-4-6`.
- `routes/sales.js` — sales insights/chat via OpenAI SDK pointed at Mentor `/api/v1` (or direct `api.x.ai/v1`), Grok `grok-4-1-fast-non-reasoning`.
- `routes/stagedemo.js` — OpenAI **Realtime voice** (`gpt-realtime-2`), direct `OPENAI_API_KEY`.
- `services/video.js` — transcription via **Groq** (`GROQ_API_KEY`) with a direct OpenAI `whisper-1` failover (added 2026-07-24 after the shared Groq key went 401-invalid on BOTH Railway environments — replace it when convenient, Groq is faster/cheaper).
- **IG reel transcript chain** (`services/social.js`): Apify reel scraper's own transcript → dedicated **Apify transcript actor** (`APIFY_IG_TRANSCRIPT_ACTOR`, default `apple_yang~instagram-transcripts-scraper` — ASR runs on Apify's infra, the default workhorse) → container-side Whisper (Groq→OpenAI) as last resort. `POST /api/content-items/backfill-transcripts` re-runs this chain for saved references stuck with `transcript=null` (fired automatically on Content/AI CEO tab mount, max 3 rows per call).

---

## 7. Environment variables (names only — no secrets)

| Env var | Role | In `.env.example`? |
|---|---|---|
| `MENTOR_API_KEY` | Mentor gateway auth; **when set, Mentor is the primary route** for Anthropic/xAI text and no-reference OpenAI images | **No — undocumented** |
| `MENTOR_BASE_URL` | Gateway base URL (default `https://platform.thementorprogram.xyz`) | **No — undocumented** |
| `ANTHROPIC_PREFER_DIRECT` | `'true'` → direct Anthropic primary, Mentor fallback (escape hatch when the gateway misbehaves) | **No — undocumented** |
| `ANTHROPIC_API_KEY` | Direct Anthropic (fallback / rescue / stagedemo edit) | Yes |
| `XAI_API_KEY` | Direct xAI Grok (fallback) | Yes |
| `OPENAI_API_KEY` | OpenAI image gen (primary), Realtime voice, whisper fallback | Yes |
| `OPENAI_IMAGE_MODEL` | Overrides image model (default `gpt-image-2`) | **No — undocumented** (comment still says `gpt-image-1`) |
| `GEMINI_API_KEY` | Gemini image fallback (always direct) | Yes |
| `GROQ_API_KEY` | Groq transcription | — |
| `LANDING_AGENT_URL` | Defined on the landing-page agent config but **dead** — nothing reads it (see Findings) | Yes |

---

## 8. Findings & recommendations

1. ~~**Specialist page agents have no cross-provider fallback.**~~ **RESOLVED 2026-07-24.** `executeAgent` now degrades Claude→Grok on any terminal Claude failure (`streamAnthropicWithGrokFallback` in `base-agent.js`), so landing/squeeze/newsletter/DM/story/lead-magnet — and the Marketing AI direct-agent chat — no longer hard-fail when both Anthropic routes are out of credits. **Remaining gap:** the file-based *edit* path (`executeAnthropicWithTools`, used when editing an existing artifact rather than generating a new one) still has no Grok fallback — its Anthropic-shaped tool loop would need OpenAI-format translation first. Initial generation is covered; editing an existing page while Claude is fully down is not.
2. **Images depend on two funded accounts.** OpenAI (primary) and Gemini (fallback). With Gemini prepay already depleted, OpenAI is effectively the only working provider; an OpenAI `429` then has nowhere to go. Keep both funded, or the pipeline has no headroom.
3. **A `429` on images skips the medium retry** (only timeouts/5xx retry) and goes straight to the other provider — correct, but means quota errors burn through the chain fast.
4. **Doc gaps:** `MENTOR_API_KEY`, `MENTOR_BASE_URL`, `ANTHROPIC_PREFER_DIRECT`, and `OPENAI_IMAGE_MODEL` are **not** in `backend/.env.example`, and its comment still says `gpt-image-1` while the code defaults to `gpt-image-2`. These are the exact knobs needed to diagnose the current outage — worth documenting.
5. **Dead code:** `backend/agents/landing-page.js` defines `externalUrl` from `LANDING_AGENT_URL` (a separate Railway "landing-page-agent" service), but nothing reads it. Landing pages run **in-process on Claude Sonnet**, not on that external service — so don't look there for landing-page API usage.

---

## Appendix — effective chains at a glance

**Text (landing page / specialist agent):**
`Mentor(Anthropic claude-sonnet-4-6)` → *(billing/5xx/substitution)* → `direct Anthropic claude-sonnet-4-6` → `Grok grok-4-1-fast-non-reasoning` (since 2026-07-24, `streamAnthropicWithGrokFallback`; only the artifact-EDIT tool loop still lacks Grok).

**Text (AI CEO brain):**
`Mentor(Anthropic claude-sonnet-4-6)` → `direct Anthropic claude-sonnet-4-6` → `Grok grok-4-1-fast-non-reasoning` (Mentor→direct xAI).

**Image (reference-image request — the usual case):**
`direct OpenAI gpt-image-2 (edits)` → *(timeout/5xx only)* `+medium retry` → `direct Gemini gemini-3.1-flash-image-preview / -pro-`.

**Image (no-reference request, `MENTOR_API_KEY` set):**
`Mentor(OpenAI gpt-image-2)` → `direct OpenAI gpt-image-2 (generate) +medium retry` → `direct Gemini`.
