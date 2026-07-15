# Backend Unification Audit — AI CEO vs Content vs Marketing AI

> Audit date: 2026-07-15 (branch `dev`). Goal: one backend agent/function per
> content type, callable from any tab. This doc maps what exists today, where
> the duplication is, and the migration plan.

---

## 1. The three brains (current state)

There are **three separate "planning brains"** producing content today, and they
only partially share code:

### Brain A — AI CEO tab (`src/pages/AiCeo.jsx`)
- Calls `POST /api/orchestrate` with `mode:'ceo'` (SSE stream).
- Backend: `backend/routes/orchestrate.js` → `executeCeoOrchestrator`
  (`backend/agents/base-agent.js:661`), model = Claude Sonnet.
- Tools come from `buildAgentTools()` (`backend/agents/registry.js:42`).
- **Split personality:**
  - Heavy HTML assets (landing page, squeeze page, newsletter, lead magnet,
    story sequence, DM automation) → `delegate_to_agent` →
    `handleAgentDelegation` (`orchestrate.js:1968`) → **shared agents in
    `backend/agents/`**. ✅ shared.
  - Social posts, carousels, images, reels → `create_artifact` /
    `plan_carousel` / `generate_image` tool calls are **NOT executed on the
    backend** — they're relayed as SSE `tool_call` events
    (`orchestrate.js:1689-1692`) and the **frontend** does the work
    (post copy = tool args from Sonnet; carousel slides = per-slide loop in
    `AiCeo.jsx:1961+` using `src/lib/carouselGen.js`; images =
    `POST /api/generate/image`). ⚠️ inline, frontend-driven.

### Brain B — Marketing AI tab (`src/pages/Marketing.jsx`)
- Calls the **same** `POST /api/orchestrate` but with `mode:'direct'` +
  `agent:<toolId>` (`Marketing.jsx:2374`) → `handleDirectAgent`
  (`orchestrate.js:929`) → `getAgent` + `executeAgent` → **shared agents**. ✅
- Exception: the **DM tab does not use the `dm-automation` agent** — it calls
  `POST /api/boosend/agent/build` (`Marketing.jsx:2274-2333`,
  `backend/routes/boosend.js:91`), an external Boosend service, with its own
  lightweight client-side brand context. The `dm-automation` agent is only
  reachable via CEO delegation. ⚠️ two DM implementations.

### Brain C — Content tab (`src/pages/Content.jsx`)
- **Completely bypasses the backend for text generation.** Runs Grok
  (`grok-4-1-fast-non-reasoning`) **client-side** via an xAI proxy
  (`POST /api/xai/v1/responses`, `Content.jsx:2447`; key is
  `VITE_XAI_API_KEY` — a client-exposed secret). ⚠️⚠️
- System prompt is inline in the frontend (`buildSystemPrompt()`,
  `Content.jsx:1383`).
- Duplicated tool schemas: `IMAGE_TOOL` (`Content.jsx:1908`) vs
  `registry.js:102`; `PLAN_CAROUSEL_TOOL` (`Content.jsx:1930`) vs
  `backend/agents/plan-carousel-tool.js:13` (already drifted: agent copy has a
  required `platform` field the Content copy lacks).
- Duplicated carousel builders: `buildCarouselSlidePrompt`, `extractAccent`,
  `sanitizeStyleText`, `CAROUSEL_PLATFORM_CONFIG` exist byte-for-byte in both
  `src/lib/carouselGen.js` (CEO path) and `Content.jsx:2050-2274`. Code
  comments in both files say the copies are temporary "until /Content migrates
  to /api/orchestrate."
- Uses backend only for: images (`/api/generate/image`), image upload,
  scheduling/publishing (`/api/calendar/*`), carousel templates.

---

## 2. What is already shared (the good news)

The **execution layer** converges; the duplication is concentrated in the
**planning/prompt layer**:

| Shared thing | File | Used by |
|---|---|---|
| Image rendering (gpt-image-1 → Gemini fallback, brand refs, platform rules) | `backend/routes/generate.js:369` + `services/openai-image.js` | all three tabs |
| Publishing (LinkedIn text/image/PDF-doc carousel; IG via BooSend) | `publishSocialPostRow` in `backend/routes/calendar.js:154` + `services/linkedin-api.js` | all tabs + scheduler |
| Scheduling dispatcher (60s loop over `social_posts`) | `backend/services/scheduled-posts.js` | everything scheduled |
| Specialist agents (landing, squeeze, newsletter, lead magnet, story, DM) | `backend/agents/*` via `registry.js` | AI CEO (delegated) + Marketing (direct) |
| Brand/product/brief context injection | `backend/agents/brand-context.js` + `services/context.js`, assembled at `orchestrate.js:958-962` and `:2029-2033` | both orchestrate paths only |
| Artifact version history | `orchestrate.js:1065` → `artifact_versions` table, `routes/artifact-versions.js` | orchestrate paths only |

---

## 3. The duplication list (what breaks parity today)

1. **Social post copy (LinkedIn/IG/X…)** — two different prompts and two
   different models for the same task: CEO inline rules in
   `buildCeoSystemPrompt` (`orchestrate.js:91-97`, Sonnet) vs Content's inline
   Grok prompt (`Content.jsx:1383`). No shared "social-post agent" exists.
2. **Carousels** — three copies of the `plan_carousel` schema (one already
   drifted) and two copies of the slide-prompt builder; the slide-generation
   loop is implemented twice in the frontend (`AiCeo.jsx` and `Content.jsx`).
3. **`generate_image` tool schema** — duplicated (`Content.jsx:1908` vs
   `registry.js:102`).
4. **DM automation** — Boosend external build (Marketing tab) vs
   `dm-automation` agent (CEO delegation).
5. **Brand context** — server-side `buildBrandContext` for orchestrate paths;
   client-assembled context for Content (Grok prompt) and Marketing DM;
   `generate.js` trusts a client-supplied `brandData` object instead of the DB.
6. **Model choice** — Grok for Content, Sonnet for CEO/Marketing, decided in
   scattered places rather than one config.
7. **Versioning** — only orchestrate-path artifacts get `artifact_versions`
   rows; Content keeps client-side snapshots; the plain Marketing direct
   generation only writes the 2-hour in-memory `file-store`.
8. **Security** — `VITE_XAI_API_KEY` ships to the browser; Content's whole
   text brain runs on a client-exposed key.
9. **Frontend-executed generation** — CEO's `create_artifact` /
   `plan_carousel` / `generate_image` are pure SSE relays with no backend
   side-effect; if the browser tab closes mid-carousel, generation dies.

---

## 4. Target architecture (simple statement)

**One capability = one backend agent = one endpoint, and every tab is a thin
UI over the same registry.**

```
frontend tabs (AI CEO / Content / Marketing)      ← UI + approval flows only
        │  POST /api/orchestrate  (mode: ceo | direct | content)
        ▼
backend/agents/registry.js                        ← THE single catalog
  landing-page  squeeze-page  newsletter  lead-magnet  story-sequence
  dm-automation  social-post*  carousel*  (new*)
        │ each agent: buildSystemPrompt(brandDna) + model + tools
        ▼
shared execution:  base-agent.js  brand-context.js  services/context.js
shared rendering:  routes/generate.js (+ new /api/generate/carousel)
shared publishing: calendar.js publishSocialPostRow + scheduled-posts.js
shared history:    artifact_versions
```

---

## 5. Migration plan (phased, each phase shippable)

### Phase 0 — Deduplicate the copies that already have TODOs (low risk)
- Content.jsx drops its local copies of `buildCarouselSlidePrompt`,
  `extractAccent`, `sanitizeStyleText`, `CAROUSEL_PLATFORM_CONFIG` and imports
  from `src/lib/carouselGen.js` (the lib header already asks for this).
- Fix the `plan_carousel` schema drift (add `platform` to the Content copy or,
  better, serve the schema from the backend so there's only one).
- No behavior change intended; pure dedup.

### Phase 1 — Create the missing shared agents (backend)
- **`social-post` agent** (`backend/agents/social-post.js`): owns post-copy
  generation for all platforms (prompt rules currently split between
  `buildCeoSystemPrompt`'s SOCIAL POST RULE and Content's Grok prompt).
  Registered in `registry.js`; CEO's `create_artifact type:'content_post'`
  path and Content's caption flow both route to it.
- **`carousel` agent + `POST /api/generate/carousel`**: takes an approved plan
  `{hook, slides[], designSystem, platform}` and generates all slides
  **server-side** (moves the per-slide loop out of both frontends), streaming
  per-slide progress over SSE. Slide-prompt builder moves to the backend as the
  single source; `src/lib/carouselGen.js` shrinks to display helpers.
- Benefit: carousels survive tab-close, credits/retries accounted in one
  place, and both tabs get identical output.

### Phase 2 — Move the Content tab's brain to the backend
- Add `mode:'content'` to `/api/orchestrate` (or reuse `ceo` with a restricted
  toolset): system prompt moves server-side, tools = `social-post`,
  `plan_carousel`, `generate_image`, context loaded via `loadUserContext` +
  `buildBrandContext` like the other modes.
- Model stays configurable per mode — keep Grok for Content if the tone is
  wanted, but call xAI **from the backend** and kill `VITE_XAI_API_KEY`.
- Content.jsx becomes a UI: chat transport + previews + approval, no prompts.

### Phase 3 — Single DM implementation
- Decide the canonical DM builder: either (a) Marketing DM tab routes through
  the `dm-automation` agent, or (b) Boosend build becomes the canonical and
  the CEO's `delegate_to_agent('dm-automation')` proxies to Boosend. Either
  way, one implementation, brand context injected server-side.

### Phase 4 — Consistency cleanup
- `generate.js` loads brand DNA from the DB per user (it already has a
  fallback path) instead of trusting client `brandData`.
- `commitArtifactVersion` runs for **all** generation paths (Marketing direct
  currently skips it; Content has none).
- One model-config map (agent → model) so Grok/Sonnet choices live in one
  place.
- Delete dead/duplicated code: Content's inline schemas + prompt, CEO inline
  social-post rules, `plan-carousel-tool.js` "keep byte-identical" comments.

### Order of work and why
Phase 0 is prep. Phase 1 creates the shared functions so Phase 2 has
something to point at. Phase 2 is the big win (Content tab = biggest
divergence + the exposed API key). Phases 3–4 are consolidation. Each phase
deploys independently to `dev`.

### Key decisions needed from the team
1. **Model for Content mode** — keep Grok (server-side) or standardize on
   Sonnet? Output tone will shift if we switch.
2. **DM canonical implementation** — Boosend or the local agent?
3. **Carousel generation location** — plan approved in UI, slides generated
   server-side (recommended) vs keeping the frontend loop.

---

## 6. Evidence index (for whoever implements)

- CEO tool dispatch: `orchestrate.js:1669-1695`; delegation:
  `orchestrate.js:1968`; direct mode: `orchestrate.js:929`.
- CEO system prompt (inline social/reel rules): `orchestrate.js:48-97`; Plan
  Mode HTML template: `orchestrate.js:1295-1532`.
- Registry + tool schemas: `registry.js:42-318`;
  `plan-carousel-tool.js:1-24` (drift note in header).
- Content tab Grok calls: `Content.jsx:2447, 2576`; inline prompt:
  `Content.jsx:1383`; inline schemas: `Content.jsx:1908, 1930`; duplicated
  carousel helpers: `Content.jsx:2050-2274` ↔ `src/lib/carouselGen.js`.
- Marketing dispatch: `Marketing.jsx:2374`; DM bypass: `Marketing.jsx:2274-2333`
  → `boosend.js:91`.
- Image pipeline: `generate.js:369` (sanitizers `:56, :98`; platform rules
  `:127`; provider order `:506-645`); upload `:708`.
- Publish: `calendar.js:154` (`publishSocialPostRow`), LinkedIn
  `:155-193` → `services/linkedin-api.js`, IG → BooSend `:209-288`;
  dispatcher `services/scheduled-posts.js:18-101`.
- Versioning: `orchestrate.js:1065` (`commitArtifactVersion`), called at
  `:1189` (edits) and `:2135` (CEO delegation) — not on direct generation.
- Brand context assembly: `orchestrate.js:958-962` (direct), `:2029-2033`
  (delegated); builders in `agents/brand-context.js:4, :80`.
