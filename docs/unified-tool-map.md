# Unified Tool Map — which UI calls which backend function

> The "fix it once" reference (founder request, 2026-07-17). Every row is
> ONE backend implementation; the columns show every UI surface that
> calls it. If something misbehaves in any tab, fix the file in the
> "single implementation" column and every listed surface gets the fix.
> Update this table whenever a tool is added or moved.

## Content generation

| Capability | Single implementation (fix here) | AI CEO tab | Content tab | Marketing AI tab | Plan runner (both tabs) |
|---|---|---|---|---|---|
| **LinkedIn text post writer** (variation A/B prompts, forced submit_post channel) | `backend/agents/content/ceo-adapter.js` → `runLinkedInTextPostPass` + `backend/agents/content/second-pass-prompts.js` + `linkedin-prompts.js` | ✅ via `generate_linkedin_post` tool (orchestrate.js) | ✅ via `<<READY_A/B>>` → intent `linkedin_post` (content handler) | — | ✅ plan-item route, format `text_post`+linkedin |
| **LinkedIn post edit-in-place** | `second-pass-prompts.js` → `buildLinkedInEditSystemPrompt` (intent `linkedin_edit`) | (CEO edits via create_artifact re-emit) | ✅ `<<EDIT_TEXT>>` flow | — | — |
| **Carousel PLANNING** (hook/slides/designSystem schema) | `backend/agents/plan-carousel-tool.js` (`PLAN_CAROUSEL_TOOL`) | ✅ CEO chat tool | ✅ Content chat tool | — | ✅ plan-item, format `carousel` |
| **Carousel slide RENDERING** (per-slide retries, slide-1 anchoring, storage upload, per-slide billing) | `POST /api/generate/carousel` (backend/routes/generate.js) + `backend/agents/content/carousel-slide-prompt.js` | ✅ approve + retry | ✅ approve + retry | — | ✅ both tabs' runners |
| **Single image generation** (brand refs, identity/marker sanitizers, provider fallback) | `generateImageCore` in backend/routes/generate.js (`POST /api/generate/image`) | ✅ generate_image tool | ✅ generate_image tool, story frames, LI post images | ✅ cover images (via imageRetry) | ✅ single_image pieces |
| **Content PLANNING (multi-day plans)** | Directive: `backend/agents/content/plan-mode.js` · Tool: `backend/agents/content-plan-tool.js` · Per-piece: `POST /api/orchestrate/plan-item` · Run loop: `src/lib/planRunner.js` · Card: `src/components/ContentPlanMessage.jsx` | ✅ Plan Mode | ✅ Plan Mode (platform pill = locked platform; facebook/tiktok pills fall back to legacy HTML plan) | — | (is the runner) |
| **Chat brain / strategist prompts** | `backend/agents/content/build-system-prompt.js` + `platform-guidance.js` (Content) · `buildCeoSystemPrompt` in orchestrate.js (CEO) — plus shared `claude-protocol.js` addendum + `buildCeoUnifiedSocialAddendum` | ✅ | ✅ | ✅ (direct agent mode) | — |
| **Marketing HTML assets** (newsletter, landing, squeeze, lead magnet, story sequence) | `backend/agents/*.js` via `registry.js` (`delegate_to_agent` / direct mode) | ✅ delegation | — | ✅ direct mode | — |

## Publishing & scheduling

| Capability | Single implementation | Called from |
|---|---|---|
| **Publish/schedule pipeline** (LinkedIn text/image/PDF-carousel; Instagram via BooSend) | `publishSocialPostRow` in backend/routes/calendar.js + `services/scheduled-posts.js` dispatcher | Content canvas, AI CEO canvas (calendar-row path), Content Calendar page, the 60s scheduler |
| **LinkedIn API posting** | `backend/services/linkedin-api.js` | calendar pipeline + direct `POST /api/integrations/linkedin/post` |
| **Schedule rows** | `POST /api/calendar/posts` (`social_posts` table) | both canvases' Schedule buttons, saveToCalendar |

## Previews & canvas (frontend shared components)

| Component | File | Used by |
|---|---|---|
| Instagram/FB/X/TikTok preview + fullscreen viewer | `src/components/SocialPreview.jsx` | Content + AI CEO |
| LinkedIn preview | `src/components/LinkedInPreview.jsx` | Content + AI CEO |
| Rich carousel plan editor | `src/components/social-canvas/CarouselPlanCard.jsx` | Content + AI CEO |
| Content plan card | `src/components/ContentPlanMessage.jsx` | Content + AI CEO |
| Plan batch runner | `src/lib/planRunner.js` | Content + AI CEO |
| Canvas actions (upload/download PDF+ZIP/schedule/post) | `src/components/CanvasActionsBar.jsx` (AI CEO) · Content's inline `CarouselActionsBar` (Content-layout-specific by design) | see files |
| Slide prompt builder (single-slide edit/regen only) | `src/lib/carouselGen.js` (frontend copy) ↔ `backend/agents/content/carousel-slide-prompt.js` (server copy) — **keep in sync** | Content + AI CEO pencil/re-roll |

## Integrations

| Capability | Single implementation | Notes |
|---|---|---|
| Stripe connect/repair/disconnect (probe, auto-webhook, reconcile) | `backend/services/integrations/stripe-int.js` + `backend/routes/integrations.js` | One Connect flow; repair endpoint is API/support-only |
| Per-user Stripe webhook processing | `stripe-int.js handleWebhook` via `POST /api/webhooks/stripe/:userId` | signature-verified when a secret is stored |

## Billing gates (see docs/credits-policy.md)

| Endpoint | Gate |
|---|---|
| `/api/orchestrate`, `/api/orchestrate/plan-item`, `/api/content-orchestrate` | free (`requireActiveAccount` / none) |
| `/api/generate/image` | 1 image credit per call |
| `/api/generate/carousel` | 1 image credit per successfully delivered slide |

## Known intentional divergences (not bugs)

- Plan `single_image` pieces use `COMPOSE_SINGLE_IMAGE_POST_TOOL`
  (plan-only compose step) before the shared image endpoint.
- X text posts use the plan-item ghostwriter (no LinkedIn-style variation
  system exists for X yet).
- facebook/tiktok Content pills keep the legacy HTML plan flow (no
  plan-format matrix entries yet).
- Content's `CarouselActionsBar` stays separate from `CanvasActionsBar`
  (different layout modes, same underlying actions/endpoints).
