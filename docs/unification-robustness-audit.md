# Unification Robustness Audit — edge cases, verdicts, fix plan

> Written 2026-07-17, audited at dev/main `241b7c4` (post-unification,
> post-Stripe-unified-connect, post content-plan merge). Purpose: before
> UI testing, verify at the CODE level which predictable failure modes
> are handled and which are not — and assess whether the in-chat
> content-plan + batch-generation feature (1fba31b) rides the unified
> architecture.
>
> Verdict counts: **14 HANDLED · 6 PARTIAL · 5 VULNERABLE** across 25
> audited cases, plus 6 architecture divergences in the content-plan
> feature.

---

## 1. Edge-case verdicts

### A. Unified content chat (`/api/content-orchestrate` + Content.jsx)

| # | Case | Verdict | Evidence / gap |
|---|---|---|---|
| A1 | Client disconnects mid-stream | **VULNERABLE** | Route has no `res.on('close')` → abort; handler passes no abortSignal (orchestrate.js:2127-2163, handler.js:106/161/243). Upstream Anthropic stream runs to completion — burned tokens for a gone client. The sibling `/api/orchestrate/plan-item` DOES wire it (`res.on('close') → abortCtl.abort()`, orchestrate.js:2271) — copy that pattern. Main CEO route has the same gap. |
| A2 | Zero text + zero tool calls | HANDLED | "AI didn't produce a response" net with correct linkedinPreview ownership check (Content.jsx:1924-1933). |
| A3 | Anthropic 529 / Mentor 5xx mid-stream | HANDLED | Full ladder inherited: fetchWithMentorFallback 5xx→direct; stream error → Grok orchestrator with the SAME onToolCalls, so ask_user→JSON translation still runs under Grok (base-agent.js:763-861, handler.js:276-285). |
| A4 | Prompt too long (CONTEXT_EXCEEDED) | **PARTIAL** | Server tailors the friendly message (base-agent.js:1442-1445 → orchestrate.js:2153-2156) but Content.jsx's catch overwrites it with generic "Something went wrong" (Content.jsx:1899-1905). AI CEO page renders it fine — Content-only regression. |
| A5 | User text containing `<<READY_A>>` / question-JSON | HANDLED | Detection runs only on assistant `streamedContent`, never user text (Content.jsx:1403, 1580, 1775). |
| A6 | ask_user edge shapes | **MIXED** | Empty options → free-text input, handled (handler.js:282-284, Content.jsx:1642-1645). TWO ask_user calls in one round → two JSON blocks appended → greedy regex spans both → parse fails → empty bubble (base-agent.js:1384-1395, handler.js:238-241, Content.jsx:1588). Fix: translate only the FIRST ask_user per round server-side. |
| A7 | 90s frontend watchdog vs 15-30s silent tool-arg streaming | HANDLED | Backend 3s heartbeat keeps the socket warm through the input_json_delta window (orchestrate.js:2143-2145, api.js:97-107/119). |

### B. Server-side carousel (`POST /api/generate/carousel`)

| # | Case | Verdict | Evidence / gap |
|---|---|---|---|
| B1 | Credits exhausted mid-carousel | **PARTIAL** | Server: remaining slides short-circuit to `slide_failed 'Insufficient credits'` without generating (generate.js:919-932, 989-992). UI gap: both tabs treat it as ordinary slide failure — no paywall, and Retry re-fails identically (Content.jsx:2341-2344, AiCeo.jsx:2188-2198). Also no upfront balance check for N slides — job can start at low balance. |
| B2 | Client disconnects mid-generation | **VULNERABLE** | `send()` writes are guarded but the loop has no abort — full generation + per-attempt debits continue for a dead client (generate.js:823-1015, 877, 934-941). |
| B3 | Malformed plan payloads | HANDLED (minor) | Index-range filtering + palette fallbacks + per-slide try/catch (generate.js:861-864, 906, carousel-slide-prompt.js:128/166-173). Minor: duplicate `slideIndexes` not deduped → double render/debit. |
| B4 | Concurrent carousels, one user | HANDLED | Per-request state; deductCredits uses conditional `.gte('balance', cost)` update (credits.js:57-63). Cosmetic: same-ms filename collision possible (generate.js:950). |
| B5 | Dead/foreign anchorUrl | HANDLED | fetchImageAsBase64 returns null on any failure (15s timeout); slides render unanchored (generate.js:315-341, 896, 916). |
| B6 | Storage upload failure mid-run | HANDLED, re-charges | Retried within the 3-attempt loop, but each attempt re-debits — a flaky slide can cost up to 3 image credits (generate.js:919-960). Product decision: debit per attempt vs per slide vs on success. |

### C. AI CEO unified pieces

| # | Case | Verdict | Evidence |
|---|---|---|---|
| C1 | LinkedIn writer pass throws/null | HANDLED | try/catch + `call.result` apology paths; loop continues cleanly (orchestrate.js:1608-1633, ceo-adapter.js:79). |
| C2 | planMode strips generate_linkedin_post | HANDLED | allowed-set filter removes it (orchestrate.js:1486, 1493-1495). |
| C3 | GATEWAY_SUBSTITUTED (a21dafc) × PROTOCOL_VIOLATION interplay | HANDLED | Substitution = model-id echo check at message_start (base-agent.js:158-170); both codes share ONE retry budget: Mentor retry w/ salvage → direct rescue → Grok. Max 3 upstream attempts, no compounding loops (base-agent.js:797-842, 1338-1360). |
| C4 | askUserFired | HANDLED | Gates the prose-question→ask_user salvage so cards aren't double-raised (orchestrate.js:1559, 1581-1583, 1644-1650). |

### D. Stripe unified connect

| # | Case | Verdict | Evidence / gap |
|---|---|---|---|
| D1 | Same user connects on DEV and PROD (shared DB!) | **VULNERABLE** | One `integrations` row, env-derived webhook URL: connecting on the 2nd env creates a SECOND endpoint in the user's Stripe account and clobbers the stored secret — the 1st env's endpoint keeps firing but fails signature (400) forever and is never cleaned up (integrations.js:295-322, stripe-int.js:133-149, webhooks.js:749-757). Fix: during provisioning, delete any OTHER endpoint whose URL ends with `/api/webhooks/stripe/<userId>` (different host = stale env/legacy). |
| D2 | Endpoint limit / no endpoint-read permission | HANDLED | Graceful `{provisioned:false}` → manual fallback UI (stripe-int.js:131-153, integrations.js:307-316). |
| D3 | Reconnect with a DIFFERENT Stripe account | **PARTIAL** | Old products pruned by reconciliation ✅; old `integration_data` (payments/customers/subs) lingers ❌; old account's AICEO endpoint orphaned (can't delete without the old key) ❌ (stripe-int.js:412-431). Fix: prune integration_data rows whose synced_at predates the reconnect sync; endpoint orphan → document (needs old key). |
| D4 | Probe hits non-403 error on a scope | **PARTIAL** | Unknown error types are optimistically counted as granted → silent breakage returns for off-nominal shapes (stripe-int.js:68-79). Fix: unknown → 'unverified' bucket, log + store in metadata, don't grant. |
| D5 | Repair with revoked key | HANDLED | STRIPE_INVALID_KEY plain-English 400 (integrations.js:366, 406-408). Minor: row stays is_active until re-paste. |

### E. Cross-cutting

| # | Case | Verdict | Notes |
|---|---|---|---|
| E1 | Autosave loss windows | Known behavior, now documented | Debounce (1.5s Content / 2s AiCeo) resets on every stream chunk → nothing persists mid-stream; closing during/just after a stream loses the in-progress turn and unsaved data-URL images (Content.jsx:1160/1240, AiCeo.jsx:644/783). Same pre-unification behavior. |
| E2 | recentContent prompt injection | Bounded | Server-side caps (4×2000 chars, handler.js:200-201) + guardrail text; not fenced/escaped — residual risk only via self-authored/transcript content. Low priority: add fencing. |
| E3 | Metering matrix | Inconsistent — product decisions needed | CEO chat 1 credit/msg; plan piece 1 credit + images; **Content chat free**; single image 1 credit; carousel debits per ATTEMPT (≤3/slide) with no upfront gate. Founder to decide: bill Content chat? per-slide vs per-attempt? upfront N-slide check? |

---

## 2. Content-plan feature (1fba31b) vs the unified architecture

Verdict: **parallel pipeline that reuses the canonical carousel SCHEMA and
content_post artifacts, but bypasses the unified generation paths.**

| # | Divergence | Detail |
|---|---|---|
| M1 | LinkedIn text_post bypasses the shared writer | plan-item uses its own one-paragraph "ghostwriter" prompt via executeAgent (orchestrate.js:2177-2201, 2285-2293) instead of `runLinkedInTextPostPass` + the full VARIATION_A/B prompts + forced submit_post. Framework-vs-story logic compressed to one sentence. Plan posts will read noticeably weaker than interactive ones. |
| M2 | Carousel rendering bypasses the server renderer | Backend returns a canonical PLAN_CAROUSEL_TOOL plan ✅, but the AiCeo batch runner renders slides with a client-side loop (`buildCarouselSlidePrompt` + `generateImageWithRetry`, AiCeo.jsx:2377-2397) instead of `generateCarouselServerSide` — losing slide-1 anchoring, server retries-with-anchor, and dying on tab close. |
| M3 | Single-image is a plan-only path | COMPOSE_SINGLE_IMAGE_POST_TOOL + client image call (content-plan-tool.js:80, AiCeo.jsx:2410-2422). Acceptable, but the image identity rule is re-declared here. |
| M4 | Identity rules triplicated | CEO prompt (orchestrate.js:127), plan single-image prompt (:2190), tool schema (content-plan-tool.js:94). Server-side sanitizer in generate.js remains the real backstop. |
| M5 | Metering | Plan piece = 1 ai_ceo_message + image debits; equivalent Content-tab work is free (see E3). |
| M6 | Two disconnected plan systems | CEO: structured `create_content_plan` in-chat plan (ContentPlanMessage, AiCeo-only). Content tab: OLD inline-HTML `plan-artifact` flow (handler.js:214-221, build-system-prompt.js:35-122, Content.jsx:4061-4114). Zero shared code. Founder direction: replace Content's with the new system. |

### Port plan — bring the plan feature onto the unified stack and into Content

1. **M1 fix (backend, small):** in plan-item, route `text_post`+linkedin
   through `runLinkedInTextPostPass` (variation picked from the item's
   angle: educate/sell/engage → A, nurture → B). X posts keep the
   ghostwriter path.
2. **M2 fix (frontend, small):** batch runner's carousel branch calls
   `generateCarouselServerSide` with the returned plan (platform from
   the item), replacing the hand loop — anchoring + retries for free.
3. **M6 port (feature, medium):** Content tab adopts the in-chat plan:
   - `ContentPlanMessage` moves to `src/components/` shared usage; mount
     in Content's message renderer.
   - Content handler plan mode: expose `create_content_plan` (tool +
     plan-mode prompt equivalent to CEO's) instead of the HTML plan;
     platform pill pre-answers the platform question.
   - Extract the batch runner from AiCeo.jsx into a shared hook
     (`src/hooks/usePlanRunner.js`) parameterized by message-state
     setters, so Content and AiCeo share one runner.
   - Retire Content's plan-artifact HTML flow afterward (keep parsing
     old plan messages read-only for history).
4. **M5:** fold into the E3 metering decision.

---

## 3. Prioritized fix list

**P0 — real cost/UX bugs, fix before wide release:**
1. Wire `res.on('close') → AbortController` through `/api/content-orchestrate`, `/api/orchestrate` (CEO), and `/api/generate/carousel` (A1, B2) — plan-item already shows the pattern.
2. Stripe dev/prod endpoint fight (D1): provisioning deletes stale same-user endpoints on other hosts.
3. Carousel credit exhaustion UX (B1): detect 'Insufficient credits' in slide_failed → paywall + disable retry; optional upfront balance check for requested slide count.

**P1 — quality/robustness:**
4. Plan-item LinkedIn posts → shared writer (M1).
5. Plan runner carousels → server renderer (M2).
6. Content.jsx: surface CONTEXT_EXCEEDED message (A4).
7. Only translate first ask_user per round (A6).
8. Probe: unknown errors → 'unverified', not granted (D4).
9. Dedupe slideIndexes (B3).

**P2 — product decisions + hygiene:**
10. Metering decisions (E3/M5): bill Content chat? per-slide vs per-attempt? upfront carousel gate?
11. Content tab plan-mode replacement (M6 port plan above).
12. Reconnect-different-account data pruning (D3).
13. recentContent fencing (E2); document autosave loss windows (E1).
