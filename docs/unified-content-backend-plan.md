# Unified Content Backend & Canvas — Master Plan

> Written 2026-07-15 (branch `dev`). Companion to
> `docs/backend-unification-audit.md` (the wiring audit). This doc is the
> single source of truth for the AI CEO ⇄ Content unification: the vision,
> the complete inventory of prompts/guardrails/canvas features that MUST be
> preserved, the target architecture, and the phased migration.
>
> **Future AI: read this before touching Content.jsx, AiCeo.jsx,
> orchestrate.js, or the agents folder. The research below cost several
> deep passes — don't redo it.**

---

## 0. Locked decisions (from the founder)

1. **Sonnet everywhere.** Content tab drops Grok; all planning/generation
   brains run Claude Sonnet like AI CEO and Marketing already do.
2. **Carousel generation moves fully server-side** (plan phase already is;
   the per-slide render loop moves too).
3. **DM automation / Boosend is OUT of scope** for this effort. Ignore it.
4. **Marketing AI tab stays as-is.** It already uses the shared agents via
   `/api/orchestrate` `mode:'direct'`. Work targets AI CEO + Content only.
5. **One backend agent/function per content type** — this is the product
   philosophy: dedicated, narrow agents per task (like the carousel
   plan→ship two-phase design) so the model can't hallucinate or drift
   while shipping a specific content type.
6. **Nothing gets lost.** Every existing prompt, planning flow (discovery
   questions → plan → generate), guardrail, and canvas action survives the
   migration. When two tabs disagree, we reconcile explicitly (§4), never
   silently drop.
7. **NO DELETIONS until the unified path is shipped AND stress-tested.**
   All unification work is ADDITIVE: the legacy Content (Grok/client-side)
   path and the legacy AI CEO inline paths stay fully intact and reachable.
   The unified path ships behind a feature flag
   (`localStorage.aiceo_unified_content = '1'` or
   `VITE_UNIFIED_CONTENT=true`); the legacy path stays the default until
   the founder flips it after stress-testing. Cleanup of legacy code is a
   dedicated final phase (Phase 5) that runs ONLY on explicit approval.
8. **Instagram parity is first-class, not an afterthought.** Every flow in
   this plan applies to Instagram exactly as to LinkedIn: IG discovery flow
   (Single/Carousel/Story format question → intent → angle), IG carousel
   plan (5-9 slides, 1:1, Offscreen/Kinfolk mood config), IG story frames
   (3-4 × 9:16 via the PRO image model at 2K), IG reel scripts (script-only
   rule), IG caption rules (editorial tone, banned hook patterns), IG
   publishing (BooSend pipeline via calendar row) and IG preview chrome
   (`SocialPreview`). The prompt inventory in §2.1 covers these via
   `PLATFORM_GUIDANCE.instagram`, the IG branches of the CONTENT-TYPE
   ROUTER, `CAROUSEL_PLATFORM_CONFIG.instagram`, and
   `PLATFORM_IMAGE_RULES.instagram/instagram_story` — all migrate verbatim
   alongside the LinkedIn assets.

## 0b. Platform vision (context for why this matters)

- AICEO generates text posts, carousels, image posts, stories, and video
  scripts for Instagram and LinkedIn (plus FB/X/YouTube/TikTok variants).
- Every tab has a **canvas**. Content's canvas always shows social posts in
  IG/LinkedIn preview chrome. Marketing's canvas shows HTML artifacts
  (newsletters, landing pages). **AI CEO is the superset** — its canvas
  must display BOTH social content AND marketing artifacts.
- Generation flows are deliberately conversational: for a LinkedIn post the
  agent asks a few questions (format, intent/goal, angle/topic, CTA/tone),
  then plans, then generates. These discovery flows are product features,
  not incidental prompt text.

---

## 1. Where everything lives today (condensed map)

Full wiring in `docs/backend-unification-audit.md`. Short version:

| Piece | AI CEO tab | Content tab |
|---|---|---|
| Chat brain | `POST /api/orchestrate` `mode:'ceo'` → Sonnet (`orchestrate.js:1282`) | **client-side Grok** via `/api/xai/v1/responses` (`Content.jsx:2447`), key exposed as `VITE_XAI_API_KEY` ⚠️ |
| System prompt | backend `buildCeoSystemPrompt` (`orchestrate.js:48-656`) | frontend `buildSystemPrompt` (`Content.jsx:1383-1905`) |
| Text post | `create_artifact type:'content_post'` (Sonnet writes copy directly) | `<<READY_A>>`/`<<READY_B>>` markers → second pass with variation prompts |
| Carousel plan | `plan_carousel` tool (`backend/agents/plan-carousel-tool.js`) | local `PLAN_CAROUSEL_TOOL` copy (`Content.jsx:1930`) — **drifted: missing `platform` field** |
| Carousel slides | frontend loop `AiCeo.jsx:1961` using `src/lib/carouselGen.js` | frontend loop using byte-copies inside `Content.jsx:2050-2327` |
| Images | `POST /api/generate/image` (shared ✅) | same (shared ✅) |
| Publish/schedule | `postToInstagram` direct + `schedulePost` | calendar row → `publishCalendarPost` + `schedulePost` |
| Marketing assets | delegates to `backend/agents/*` (shared ✅) | n/a |

---

## 2. PRESERVATION INVENTORY — prompts, flows, guardrails

Everything below must exist, verbatim in spirit (and mostly verbatim in
text), after migration. File:line refs are pre-migration locations.

### 2.1 Content tab prompt assets (`src/pages/Content.jsx`)

| Asset | Lines | What it is |
|---|---|---|
| `LINKEDIN_TEXT_PROMPT` | 87–398 | LinkedIn text-post strategist: intent framework (Educating/Nurturing/Soft sell/Hard sell/Engagement), hook requirements + forbidden hook patterns, per-intent structure templates, "(Save this + Repost if useful ♻️)" convention |
| `LINKEDIN_CAROUSEL_PROMPT` | 400–589 | Senior-strategist carousel doctrine: emotional triggers, high-performing hook patterns (banned: "Are you making these mistakes?" question hooks), **"CAPTION IS THE POST"** (caption carries 90% of value; slides = visual summary), caption structure (hook <140 chars, no "link in bio"), wall-of-text test, slide 1 = hook / slide N = CTA, intent→CTA mapping, no hashtags by default |
| `LINKEDIN_TEXT_VARIATION_A` | 591–830 | Framework-heavy post generator (saves/reposts optimized, tactical playbook style, "If I was CEO of [Platform]:" hooks) |
| `LINKEDIN_TEXT_VARIATION_B` | 832–1170 | Story-flow post generator with **anti-fabrication guardrail**: story details must come from provided files or be deleted; authenticity checklist |
| `PLATFORM_GUIDANCE` map | 1172–1312 | Per-platform rules. LinkedIn: em-dash zero-tolerance, DISCOVERY FLOW (Format→Intent→Angle→Tone, cap 3 questions, always a "Surprise me" fallback option), **ABSOLUTE TURN-TAKING RULE** (one message = ONE thing: one question OR one generation action OR conversation), **CRITICAL OUTPUT RULES** ("never write the post text in chat — a separate system generates it", `<<READY_A>>`/`<<READY_B>>` markers). Instagram: carousel = story-arc not tip-list; reels = script only, no images, "Direction:" note, <60s; discovery flow. TikTok: script-as-output, <30s |
| `buildSystemPrompt()` | 1383–1905 | Master assembly: ABSOLUTE OUTPUT RULES (em-dash ban, hashtag ban by default, filler ban) · Plan Mode branch (5 scoping questions, `plan-artifact` inline HTML template, format-variety rule, format color coding) · platform enforcement ("only creating for {platform}; tell user to switch tabs") · prior-plan awareness (reuse Topic/Hook/CTA from plan rows) · engage-quietly rules (cap 2 questions, default 0) · CONTENT-TYPE ROUTER (carousel→plan_carousel; text→READY markers; single→one generate_image; story→3-4 frames; **reel→NO tools, script as text**) · plan_carousel field instructions (IG 5-9 slides, LinkedIn 7-12, SLIDE VISUAL BUDGET: rich visuals only on first/last, middle slides text-forward, `{{accent}}` hero-word markers) · LinkedIn caption standard + BAN LIST (em dashes, hashtags, 🚀🔥, "leverage", "unlock", "game-changer", "dive in"…) + slide-body scannable-lines standard · legacy carousel slide types for non-IG/LI platforms (dark-bg numbered slides, tweet-style option) · question rules · image standards (Figma-quality graphic design, NO cartoons/clip-art/stock, per-platform aspect ratios) · LinkedIn EDIT MODE markers (`<<EDIT_TEXT>>`, `<<ADD_IMAGE_AI>>`, `<<USE_UPLOADED_IMAGE>>`, `<<ADD_IMAGE_ASK>>`) · Brand DNA injection (always use founder's face from reference photos; never mention logo unless asked) · attached image/doc/transcript handling · **Outlier template COPY-EXACT-WORDING mode** (mirror structure/tone/signature phrases, only swap topic; overrides em-dash/hashtag bans) · context-priority rules |
| `IMAGE_TOOL` schema | 1908–1924 | generate_image: prompt must include style/subject/palette/exact text + typography |
| `PLAN_CAROUSEL_TOOL` schema | 1930–2044 | hook/angle/caption/slides[]/designSystem (8-hex palette anchored to Brand DNA primary, texture, card, badge, typography, brandStrip, accentTreatment, rotating glowCorners, mood). **Missing `platform` field — backend copy has it; unify on backend copy** |
| `extractAccent` / `sanitizeStyleText` | 2050–2087 | marker & CSS-fragment strippers so image models never render `{{}}`/gradients as literal text |
| `CAROUSEL_PLATFORM_CONFIG` | 2093–2128 | IG 1080×1080 (Offscreen/Kinfolk mood) vs LinkedIn 1080×1440 3:4 (HBR/Stripe mood, no emoji) |
| `buildCarouselSlidePrompt()` | 2142–2327 | Deterministic per-slide prompt: VISUAL STYLE with **color lock**, UNIVERSAL VERTICAL GRID (fixed y-anchors), three layout archetypes (hook OPENING SPREAD / middle EDITORIAL CHAPTER PAGE with ghosted numeral / final CLOSING SPREAD with CTA button), strict DO-NOT-RENDER-AS-TEXT list, per-slide doNot defaults |

### 2.2 AI CEO prompt assets (`backend/routes/orchestrate.js` + shared)

| Asset | Lines | What it is |
|---|---|---|
| `GLOBAL_OUTPUT_RULES` | orchestrate.js:20–45 | em-dash/hashtag/filler bans + **BRIEF CAPTURE** (every generation response includes `brief` {offer,audience,tone,goal,key_benefit} saved as active campaign brief) |
| `buildCeoSystemPrompt` | orchestrate.js:48–656 | CEO persona + CRITICAL RULES: `ask_user` for all questions · **4-question rule** for marketing assets (newsletter/landing/squeeze/lead-magnet/DM only — explicitly NOT for reels/stories) · never fabricate product names · **rule 8 REELS** ("overrides everything": immediate script via create_artifact, no questions/images) · **SOCIAL POST RULE** (any social post = `create_artifact type:'content_post'` + `platform`; plain text only) · IMAGE INTEGRITY RULE (must actually call generate_image, never hallucinate) · IMAGE PROMPT IDENTITY RULE (never include user's real name/ethnicity — "the founder") · landing/squeeze PAGE_STYLE flows (per-style Q7-Q12 question sequences) · soul/brand/products/sales/meetings/outlier context injections |
| `SOCIAL_POST_DISCOVERY_PROMPT` | backend/shared/social-post-discovery.js (78 lines) | Mandatory discovery before any social post ("the word 'post' alone does NOT mean text post — ask format first"), per-platform question sequences via `ask_user`, cap 3; generation routing (text→content_post, carousel→plan_carousel, story→3-4 frames 9:16, single→one image); skip-discovery edge cases (format+topic given, outlier link, "no questions") |
| CEO Plan Mode | orchestrate.js:1294–1532 | Tool-restricted mode (only ask_user + create_artifact): 6 scoping questions (adds Platforms Q1), format-variety rule, STAGE 1 overview plan (html_template with plan-shell CSS + Day/Platform/Format/Topic/Hook/CTA tables), STAGE 2 "expand week N" detailed brief (per-post mini-briefs with verbatim visual/image plans), quality bar, hard-sell ≤1-in-3 |
| Prior-plan awareness | orchestrate.js:1539–1553 | Reuse "Content Plan — …" artifact rows as generation briefs; Stage-2 visual plan = image prompt verbatim |
| Social-post edit mode | orchestrate.js:1561–1582 | Tweak requests → re-emit create_artifact same type/platform; "add image" → generate_image without rewriting text |
| `PLAN_CAROUSEL_TOOL` (backend) | backend/agents/plan-carousel-tool.js | Same as Content's + **required `platform` enum** ('linkedin'\|'instagram') driving aspect ratio and preview chrome |
| `src/lib/carouselGen.js` | whole file | The CEO-path twin of Content's slide builder (byte-identical helpers) — becomes the single frontend copy in Phase 0, then moves server-side in Phase 2 |

### 2.3 Image backend guardrails (`backend/routes/generate.js`) — already shared, keep untouched

- `sanitizeIdentityFromPrompt` (:48–72) — strips real names/ethnicity →
  "the founder" (avoids Google safety blocks).
- `sanitizeMarkersFromPrompt` (:98–116) — server-side belt-and-suspenders
  marker scrub (`{{accent}}`, `[ACCENT]`, `<tags>`).
- `PLATFORM_IMAGE_RULES` (:127–296) — per-platform art direction; the
  **DESIGN SYSTEM (LOCKED) deference block** for IG/LinkedIn carousels
  (":follow verbatim, byte-identical across slides") is THE shared guardrail
  both carousel paths rely on.
- `PLATFORM_CONFIG` (:16–28) — model/aspect/size per platform (story+tiktok
  use PRO model at 2K, LinkedIn carousel 3:4).
- Provider order: gpt-image-1 → Gemini fallback (`services/openai-image.js`).

### 2.4 Canvas feature inventory (must all survive)

Preview shells **already shared**: `SocialPreview.jsx` (IG/FB/X/TikTok chrome
+ SlideViewerModal) and `LinkedInPreview.jsx` (LinkedIn chrome + carousel
slots + inline text edit) are used by BOTH tabs today.

**Content tab canvas actions** (`Content.jsx` + previews):
inline caption edit · per-slide edit-with-instruction (design kept) ·
regenerate slide · retry failed slides · plan editing (reorder / insert /
delete slides — `CarouselPlanCard` at `Content.jsx:2674`, the RICH editor) ·
upload/replace/delete image (`uploadImageToStorage`) · generate image for a
text post · download per-slide · **download ZIP (slides + caption.txt +
hook.txt, JSZip `Content.jsx:3122`)** · **download PDF (jsPDF
`Content.jsx:3183`)** · save-to-calendar draft/schedule/publish
(`createCalendarPost` → `publishCalendarPost`) · schedule popover
(`schedulePost`) · post to LinkedIn now (`postToLinkedIn`) · save/load
**carousel design-system templates** (`/api/carousel-templates`) · copy
text · LinkedIn OAuth connect/reconnect · fullscreen slide viewer ·
plan-mode HTML modal (iframe).

**AI CEO canvas actions** (`ArtifactPanel.jsx` + `CanvasActionsBar.jsx` +
`AiCeo.jsx`): everything content_post-related above (via shared previews +
`CanvasActionsBar`: PDF download, schedule, IG upload-first publish
`postToInstagram`, LinkedIn publish) **plus** artifact-only capabilities
that must stay: email send (single + batched bulk newsletter w/ contact
picker) · Netlify deploy/redeploy with name check · HTML template
save/import · **version history + restore** (`/api/artifact-versions`) ·
iframe inline HTML editing (text/CTA/image move-resize) · story-sequence
player (`StorySequenceRenderer`, frames + auto-advance) · image viewer ·
code block · markdown editor · edit-by-chat re-emission · carousel
approve/edit/regenerate/delete slide · connected-socials detection.

**Known per-tab gaps to reconcile in the shared canvas** (§4.8):
Content has ZIP download + rich plan editor + calendar-row IG publish;
AI CEO has PDF-only download + approve-only plan card + direct IG publish.

### 2.5 Artifact state shapes today (to be unified)

- AI CEO: one `artifact` object `{id, type, title, content, images[{src,idx}],
  agentSource, carouselPlan{hook,angle,caption,slides[],designSystem,
  approved,generating,failedSlides}, totalSlides, pendingImages, streaming,
  frames[], _planPending}` (`AiCeo.jsx:1006+`), frozen per-message snapshots.
- Content: per-message `{content, images[], platform, carouselPlan{…},
  linkedinPost{content,totalSlides}}` + separate `linkedinPreview` /
  `carouselSideView` states (`Content.jsx:4151, 4685`).
- Divergence: CEO keys on `type`+`agentSource`; Content keys on
  `platform` + presence-of-carouselPlan. Caption lives in
  `carouselPlan.caption` for carousels but `content` for text posts.

---

## 3. TARGET ARCHITECTURE

### 3.1 Backend — one agent per content type, one registry, one entry point

```
backend/agents/
  content/                          ← NEW folder: social content agents
    output-rules.js                 shared bans (em-dash/hashtag/filler) + outlier override
    discovery.js                    per-platform discovery flows (merged from
                                    PLATFORM_GUIDANCE + social-post-discovery.js)
    text-post.js                    LinkedIn/IG/X/FB text posts.
                                    TWO-PHASE like today: strategist phase decides
                                    variation, generation phase runs
                                    LINKEDIN_TEXT_VARIATION_A or _B verbatim.
    carousel.js                     plan phase: PLAN_CAROUSEL_TOOL (backend copy,
                                    WITH platform field) + caption standards
                                    ("CAPTION IS THE POST", BAN LIST, slide-body standard)
    carousel-slide-prompt.js        buildCarouselSlidePrompt + extractAccent +
                                    sanitizeStyleText + CAROUSEL_PLATFORM_CONFIG
                                    (moved server-side from src/lib/carouselGen.js)
    story.js                        IG story frames (3-4 × 9:16 generate_image)
    video-script.js                 reels/TikTok scripts (script-only, no tools,
                                    "Direction:" note, 60s/30s caps)
    plan-mode.js                    unified two-stage plan flow (§4.6)
  (existing marketing agents unchanged: landing-page, newsletter,
   squeeze-page, lead-magnet, story-sequence, dm-automation)
  registry.js                       registers content agents alongside marketing ones

backend/services/
  carousel-render.js                ← NEW: server-side slide loop (§3.2)

backend/routes/
  orchestrate.js                    modes: 'ceo' | 'direct' | 'content' (NEW)
  generate.js                       + POST /api/generate/carousel (+ retry/edit endpoints)
```

**`mode:'content'`** on `/api/orchestrate`: Sonnet, system prompt assembled
server-side from the content-agent modules + `buildBrandContext` +
`loadUserContext` (same context plumbing as ceo/direct modes), scoped by a
`platform` request param (the tab's platform pill). Toolset: `ask_user`,
`plan_carousel`, `generate_image`, `create_artifact` (content_post only),
plus the text-post two-phase trigger. The `/api/xai` proxy and
`VITE_XAI_API_KEY` are deleted.

**AI CEO** keeps `mode:'ceo'` but its social-content behavior is rebuilt on
the SAME modules: `SOCIAL_POST_DISCOVERY_PROMPT` is replaced by
`discovery.js`, the SOCIAL POST RULE routes text posts through
`text-post.js`'s two-phase pipeline (CEO gains variation-quality posts),
carousels use `carousel.js` (CEO gains the caption standards). The CEO
keeps everything non-social unchanged (marketing delegation, 4-question
gate, emails, forms, soul, plan mode superset).

### 3.2 Server-side carousel rendering (locked decision)

New endpoint `POST /api/generate/carousel` (SSE):
1. Input: approved plan `{platform, hook, caption, slides[], designSystem}`
   + brand refs. Creates a `carousel_jobs` row (survives tab close).
2. Loop slides server-side in `services/carousel-render.js`: build each
   prompt with `carousel-slide-prompt.js`, call the existing internal image
   pipeline (same code path as `/api/generate/image` — sanitizers, platform
   rules, provider fallback), upload each slide to storage.
3. Stream `slide_done {idx, url}` / `slide_failed {idx}` SSE events so both
   canvases show per-slide progress exactly as today.
4. `POST /api/generate/carousel/:jobId/retry` (failed slides) and
   `POST /api/generate/carousel/:jobId/slide/:idx` (edit-with-instruction /
   regenerate single slide) replace the frontend retry/edit loops.
5. Credits: one debit path via `requireCredits`, per-slide accounting.

Frontend keeps: plan approval UX, per-slide progress UI, slide edit
instruction overlay — all driven by the SSE events instead of local loops.

### 3.3 Unified artifact model

```js
{
  id, kind,        // 'text_post' | 'carousel' | 'story' | 'video_script' |
                   // 'image' | 'email' | 'html' | 'markdown' | 'code'
  platform,        // 'linkedin' | 'instagram' | 'facebook' | 'x' | 'tiktok' | 'youtube' | null
  title,
  content,         // caption for posts, HTML for html kind, script text, …
  images: [{ src, idx, status: 'pending'|'done'|'failed' }],
  carouselPlan: { hook, angle, caption, slides[], designSystem,
                  approved, jobId, failedSlides },
  frames: [],      // story kind
  agentSource,     // which agent produced it (for edit routing + version history)
  sessionId, messageId, versionNumber
}
```
Adapters map the old shapes during migration; `content_post` ≙
`kind:'text_post'|'carousel'` by presence of `carouselPlan` (same rule
Content uses today).

### 3.4 Unified canvas

```
src/components/social-canvas/
  SocialCanvas.jsx        entry: routes kind+platform → preview + actions
  SocialActionsBar.jsx    UNION of CanvasActionsBar + Content's CarouselActionsBar:
                          Upload · Download (per-slide + PDF + ZIP w/ caption.txt+hook.txt)
                          · Schedule · Save draft · Publish (IG + LinkedIn)
                          · Save/Load design-system template · Copy text
  CarouselPlanCard.jsx    Content's RICH plan editor extracted (reorder/insert/
                          delete/edit slides, template picker) — replaces AI CEO's
                          approve-only CarouselPlanApproval
```
- Reuses `SocialPreview` / `LinkedInPreview` unchanged (already shared).
- **Canvas routing rules are preserved exactly** — each tab today knows
  precisely when to open the canvas and which preview to mount, and the
  unified canvas keeps the same triggers:
  - Content: assistant message with `carouselPlan` → carousel preview
    (platform decides IG `SocialPreview` vs LinkedIn `LinkedInPreview`
    chrome); `linkedinPost` → LinkedIn text-post preview panel; `images[]`
    on other platforms → `SocialPreview`; plan-artifact HTML → iframe
    modal; `slideViewer`/`carouselSideView` states for fullscreen/side
    views (`Content.jsx:7354, 7495, 7563, 7609`).
  - AI CEO: `artifact.type` + `agentSource` routing in
    `ArtifactPanel.jsx:775-984` — `content_post` + platform → social
    previews or `CarouselPlanApproval`/plan-pending placeholder;
    `newsletter`/`html_template` → iframe HTML renderer;
    `story_sequence` → story player; `email`/`image`/`code_block`/
    `markdown_doc` → their renderers. The unified `kind`+`platform` model
    maps 1:1 onto these rules via the adapter (§3.3) — no routing behavior
    changes.
  - Publish/schedule wiring per platform stays exactly as inventoried in
    §2.4 (IG BooSend pipeline, LinkedIn text/image/PDF-document carousel,
    schedule popover → `social_posts` row, draft/schedule/publish
    tri-state modal).
- **Content tab** renders `SocialCanvas` for everything (it only does social).
- **AI CEO** keeps `ArtifactPanel` as the outer shell; for kinds
  `text_post|carousel|story|image` it mounts `SocialCanvas`; for
  `html|email|markdown|code` it keeps its existing renderers (Netlify
  deploy, email send, version history, iframe editing — untouched). This
  preserves the "AI CEO = superset" vision.
- **Marketing tab is not migrated** (decision #4), but nothing prevents it
  mounting SocialCanvas later.

### 3.5 One publish path

Standardize Instagram publishing on the **calendar-row path**
(`createCalendarPost` → `publishCalendarPost` → `publishSocialPostRow` in
`calendar.js:154`) for both tabs — it's the same pipeline the scheduler
uses, so publish-now/scheduled/draft become one code path. Keep AI CEO's
**upload-first** behavior (blob/data URLs → storage before publish) by
moving that normalization INTO `createCalendarPost` handling (or a shared
pre-publish helper), so both tabs get it. LinkedIn already shares
`postToLinkedIn` — unchanged.

---

## 4. RECONCILIATION DECISIONS (where the tabs disagree)

1. **Discovery mechanism** — standardize on the `ask_user` tool (backend
   events). Content's UI adds a renderer for `ask_user` SSE events (AiCeo's
   UI already has one). Keep Content's richer option wording ("Surprise me /
   Match my brand voice / Let me write my own" fallbacks) as the canonical
   text. Keep hard cap 3 for social content.
2. **Text-post generation** — keep Content's two-phase design (strategist
   never writes the post; variation prompt writes it) and make it the
   shared `text-post.js` agent. The `<<READY_A>>`/`<<READY_B>>` marker
   mechanism becomes an internal backend handoff (tool call or second model
   pass server-side) instead of a frontend-parsed marker. CEO's
   direct-write `content_post` path is upgraded to this (quality win).
   `<<EDIT_TEXT>>`-family edit markers likewise become backend-internal.
3. **`plan_carousel` schema** — backend copy (with required `platform`)
   wins everywhere. Content's tab context pre-fills the platform.
4. **LinkedIn caption standards** ("CAPTION IS THE POST", BAN LIST,
   wall-of-text test, slide-body standard) — move into `carousel.js`,
   apply to BOTH tabs (CEO gains them).
5. **Reel/video-script rule** — single `video-script.js` module; keep the
   platform-specific length caps (IG <60s, TikTok <30s).
6. **Plan Mode** — unify on the CEO's two-stage artifact flow (overview →
   "expand week N" briefs) as the richer superset. In Content mode the
   Platforms question (Q1) is auto-answered by the active tab, so Content
   users get 5 questions as today. Content renders the plan artifact in its
   existing iframe modal; keep recognizing legacy `plan-artifact` divs in
   history for prior-plan awareness during transition.
7. **Legacy non-IG/LinkedIn carousel path** (Content.jsx:1656–1694 dark-bg
   slide types) — carry into `carousel.js` as the fallback branch for other
   platforms, verbatim. Do not delete.
8. **Canvas gaps** — union, both tabs get everything: ZIP download, rich
   plan editor, design-system templates (CEO gains); versioned artifacts
   (Content gains — social artifacts start writing `artifact_versions`).
9. **Sanitizers** — server-side (`generate.js` + `carousel-slide-prompt.js`)
   become the only copies once slide rendering moves; client copies deleted.
10. **Global output rules** — one `output-rules.js`, including Content's
    outlier-template override (templates may re-enable em-dashes/hashtags).
11. **BRIEF CAPTURE** (CEO-only today) — stays CEO-mode-only for now;
    content mode doesn't emit briefs. Revisit later.
12. **4-question marketing-asset gate** — CEO-only, unchanged. Content mode
    has no marketing asset types.

---

## 5. MIGRATION PHASES (each shippable to dev alone)

> **Standing rule for every phase (decision #7): ADDITIVE ONLY.** New code
> lives beside the old code; the legacy path remains the default and fully
> functional. The unified path activates only behind the feature flag
> (`localStorage.aiceo_unified_content = '1'` or `VITE_UNIFIED_CONTENT=true`).
> No legacy code is deleted, moved, or reworded until Phase 5.

### Phase 1 — Backend content agents + `mode:'content'` (flagged)
- Create `backend/agents/content/*` by **COPYING** the §2.1/§2.2 prompt
  assets **verbatim** (extract exact line ranges — diff the strings; the
  frontend originals stay in place untouched).
- Add `mode:'content'` to orchestrate.js (additive branch): Sonnet,
  platform-scoped prompt built server-side from the copied modules, tools =
  `generate_image` + `plan_carousel` (backend schema with `platform`).
  Tool execution stays ON THE FRONTEND in this phase (relayed as
  `tool_call` SSE events, exactly like ceo mode) so Content's existing
  execution code keeps doing the work — this phase swaps ONLY the brain
  (Grok→Sonnet) and the transport (client xAI call → backend SSE).
- To preserve behavior exactly, the client sends the same context it
  already holds (platform, photos, documents, socialUrls, brandDna,
  integrationContext, carouselTemplates, existingPost, planMode) in the
  request body; the server assembles the prompt with the verbatim-copied
  `buildSystemPrompt`. (Server-side context loading can replace this
  later — not required for parity.)
- Two-phase text posts: the `<<READY_A>>`/`<<READY_B>>` markers stream back
  to the client as today; the client's second pass calls
  `mode:'content'` with a `variation:'A'|'B'` param and the backend uses
  the copied `LINKEDIN_TEXT_VARIATION_A/B` as the system prompt. Edit
  markers (`<<EDIT_TEXT>>` etc.) flow through unchanged.
- Content.jsx gains a FLAGGED sibling transport function; the legacy Grok
  path remains the default and untouched. `VITE_XAI_API_KEY` is NOT removed
  yet (legacy path still needs it) — it dies in Phase 5.
- **Verification gate:** flag on vs flag off side-by-side on the golden
  flows (§6).

### Phase 2 — Server-side carousel rendering (flagged)
- Build `POST /api/generate/carousel` + retry/edit endpoints +
  `carousel_jobs` persistence + SSE progress (§3.2); server-side copy of
  `buildCarouselSlidePrompt`.
- Behind the same flag, both tabs' slide loops call the endpoint; the
  legacy frontend loops (`AiCeo.jsx:1870-2050`, Content's call-sites) stay
  in place as the flag-off path.

### Phase 3 — Unified SocialCanvas (flagged)
- Build `social-canvas/` (§3.4): union actions bar, extracted rich plan
  card, unified artifact adapter, preserving the routing rules in §3.4.
- Behind the flag, Content mounts it and ArtifactPanel mounts it for social
  kinds; legacy previews/action bars remain the flag-off render path.
- Unify IG publish on the calendar-row path with upload-first normalization
  (§3.5) — the new canvas uses it; legacy paths keep their current wiring.

### Phase 4 — CEO adoption (flagged) + versioning
- CEO social flows rebuilt on the shared content agents (discovery,
  text-post two-phase, caption standards) behind the flag;
  `SOCIAL_POST_DISCOVERY_PROMPT` and the inline SOCIAL POST RULE remain the
  flag-off behavior.
- Social artifacts write `artifact_versions` from all unified paths.

### Phase 5 — Cleanup (ONLY after founder-approved stress test)
- Runs only when the founder explicitly says the unified path is stress-
  tested and approved. Flip the flag default, then delete: Content's
  inline prompt constants + local carousel helper copies, the client xAI
  transport + `VITE_XAI_API_KEY`, frontend slide loops, duplicate approval
  card + actions bar, CEO inline social rules, legacy `<<READY_CAROUSEL>>`
  mentions. One model-config map (agent → model) in registry.

### Rollout safety
- Ship each phase behind a quick env/user flag on dev where cheap
  (especially Phase 1's transport switch), test with a test account
  (shared prod DB — see DEPLOY.md), then remove the flag.
- Deploy flow per repo rules: commit → `git push origin dev` →
  `railway up --detach` (dev env). Netlify dev auto-builds the frontend.

---

## 5b. IMPLEMENTATION LOG

### Phase 1 — SHIPPED to dev 2026-07-15 (flag-off by default)

**Backend (new files, zero legacy changes):**
- `backend/agents/content/linkedin-prompts.js` — verbatim sed-extracted
  copies of LINKEDIN_TEXT_PROMPT / LINKEDIN_CAROUSEL_PROMPT /
  LINKEDIN_TEXT_VARIATION_A / LINKEDIN_TEXT_VARIATION_B.
- `backend/agents/content/platform-guidance.js` — verbatim PLATFORM_GUIDANCE.
- `backend/agents/content/build-system-prompt.js` — verbatim
  buildSystemPrompt() (pure function; ports unchanged).
- `backend/agents/content/second-pass-prompts.js` — faithful ports of the
  Call-2 prompt builders: <<READY_A/B>> text post, <<EDIT_TEXT>> in-place
  edit, <<READY_CAROUSEL>> legacy carousel.
- `backend/agents/content/tools.js` — verbatim IMAGE_TOOL + re-export of
  the canonical PLAN_CAROUSEL_TOOL (with `platform` field).
- `backend/agents/content/handler.js` — intents chat / linkedin_post /
  linkedin_edit / legacy_carousel. Sonnet via the shared
  executeCeoOrchestrator (tool turns, `planMode:true` = single-round
  exit, matching Grok's one-request semantics) or executeAgent
  (text-only turns). Relays generate_image/plan_carousel as `tool_call`
  SSE — execution stays on the frontend in this phase.
- `backend/routes/orchestrate.js` — additive `POST /api/content-orchestrate`
  route (same SSE plumbing as /api/orchestrate).
- `backend/server.js` — additive auth registration; gated on the
  **'content'** tab permission (not 'ai-ceo').

**Frontend (additive; legacy path untouched and default):**
- `src/pages/Content.jsx` — `isUnifiedContentBackend()` flag helper,
  `streamContentUnified()` transport twin (same contract as
  streamContentResponse: cumulative onTextChunk, end-of-stream
  onToolCall([{kind,...}]), {content,hadToolCall} return), a flag gate at
  the top of streamContentResponse, and `unified:{intent,...}` metadata on
  all four call sites (main chat, EDIT_TEXT, READY_A/B, READY_CAROUSEL).

**Flag (founder decision 2026-07-15): default ON.** The unified backend is
the standing path on the dev branch — localhost and the dev site both use
it with no setup. `localStorage.aiceo_unified_content = '0'` is the
per-browser kill switch back to the legacy Grok path (byte-identical
legacy behavior).

**Merge note:** the default ships with the code, so promoting dev→main
puts the unified path live in production. That promotion is already gated
on the founder's stress-test sign-off, so by the time this reaches main it
is the intended behavior. The legacy path itself is NOT deleted until
Phase 5.

**Two consequences to be aware of (decided during implementation):**
1. **Billing:** `/api/content-orchestrate` deliberately has NO
   `requireCredits` gate — legacy Content chat is free (client-side xAI
   call), so charging it would be a silent pricing change. Images still
   debit via /api/generate/image as today. Whether Content chat should
   cost credits is an open product decision for the founder.
2. **Web search:** legacy Content chat always has Grok web_search
   available (Responses API, searchMode:true hardcoded). The unified path
   runs Sonnet (founder decision), which has no always-on web search —
   same behavior as AI CEO's normal turns. If needed, add a search toggle
   that routes to server-side Grok research (AI CEO pattern) in a later
   phase.

### Phase 1b — Claude protocol adapter (robustness parity) — SHIPPED 2026-07-15

**Why:** first live tests (see prompt.md) showed the unified path generating
but not at legacy robustness. Root cause: the /Content prompts drive
control flow through TEXT conventions tuned for Grok — inline JSON
question blocks, `<<READY_A/B>>` markers, `<<EDIT_TEXT>>` markers, and
"output ONLY the post text" Call-2 contracts. Claude complies unreliably:
observed failures were (1) planning/"Constraint Checklist"/"Mental
Sandbox" reasoning leaking into the LinkedIn post preview, (2) the post
written directly in chat instead of triggering Call 2, (3) questions asked
as plain text instead of the JSON block.

**Fix (architectural, not prompt-tweaks):** encode the protocol as native
tools — Claude follows tool schemas near-perfectly (the AI CEO tab is
built on this) — and translate tool calls back into the legacy text
conventions server-side, so the frontend parsers/safety nets/previews are
byte-compatible and unchanged:
- `backend/agents/content/claude-protocol.js` — tools `ask_user` (→
  translated to the inline `{"type":"question",...}` block),
  `generate_linkedin_post` (→ `<<READY_A>>`/`<<READY_B>>`),
  `edit_linkedin_post` (→ `<<EDIT_TEXT>>\n<instruction>` /
  `<<ADD_IMAGE_AI>>` / `<<USE_UPLOADED_IMAGE>>` / `<<ADD_IMAGE_ASK>>`),
  `submit_post` (Call-2 forced output), plus a runtime protocol addendum
  APPENDED to the verbatim prompts (mechanism-only override; strategy,
  quality bars, and guardrails untouched).
- `handler.js` — Call-2 intents (`linkedin_post`, `linkedin_edit`) now pin
  `tool_choice` to `submit_post` and suppress free text entirely: the
  preview can only ever receive the structured post_text, making the
  reasoning-leak failure impossible. Chat intent translates protocol tool
  calls into the legacy cumulative text stream.

**Known minor trade-offs:** Call-2 posts now arrive in the preview in one
shot (structured tool arg) instead of streaming progressively. Instagram
story frames rely on Claude batching its 3-4 generate_image calls in one
round (it normally does; the single-round exit matches legacy semantics).

## 6. GOLDEN TEST FLOWS (manual verification checklist per phase)

1. Content/LinkedIn: "make me a LinkedIn post" → asks Format Q first →
   text post via variation A or B → preview → inline caption edit →
   `<<EDIT_TEXT>>`-equivalent edit → add AI image → schedule.
2. Content/LinkedIn: carousel → ≤3 discovery Qs → plan (7-12 slides,
   caption meets "CAPTION IS THE POST" bar, accent markers present) →
   edit/reorder slides in plan card → approve → per-slide progress →
   retry a failed slide → download ZIP + PDF → publish to LinkedIn.
3. Content/Instagram: single post (1 image, square) · story (3-4 frames) ·
   reel ("write a reel about X" → script only, NO images, Direction note).
4. Content Plan Mode: 5 questions → plan artifact → "expand week 2" →
   generate a post from a plan row without re-asking scoping.
5. AI CEO: same social flows as 1–3 produce IDENTICAL-quality output
   (same agents), rendered in ArtifactPanel; carousel approve →
   server-side job continues if tab closes.
6. AI CEO regression: newsletter (4 questions → delegate → HTML + cover
   image → bulk send) · landing page (PAGE_STYLE flow → deploy to Netlify)
   · version history restore · story sequence player · email artifact ·
   markdown/code artifacts · soul notes · check_emails.
7. Outlier template flow: exact-wording copy mode still overrides bans.
8. Guardrail spot-checks: no em dashes; no hashtags unless asked; image
   prompts never contain the user's real name; no `{{}}`/`[ACCENT]`/CSS
   fragments rendered on any slide; middle slides text-forward; brand
   primary color respected; LinkedIn carousel 3:4 / IG 1:1.

---

## 7. Evidence index

- Wiring audit: `docs/backend-unification-audit.md` (§6 there for line refs).
- Prompt inventory line refs: §2 above (verified 2026-07-15).
- Canvas inventory line refs: §2.4 above.
- Deploy rules: `DEPLOY.md` (dev-only pushes, Railway CLI deploys,
  shared prod database — use a test account).
