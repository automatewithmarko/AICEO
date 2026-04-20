# LinkedIn carousel port — implementation plan

This is the concrete plan for porting the Instagram carousel system (plan-first flow + design-system lock + retry + edit/regenerate/save/publish) to LinkedIn. Written after auditing the existing LinkedIn flow; see `docs/carousel-features.md` for feature inventory.

## Current state (what LinkedIn has today)

- Chat flow → Claude emits `<<READY_CAROUSEL>>` when ready → client fires a **second** streaming call with `LINKEDIN_CAROUSEL_PROMPT` as system prompt → that call streams caption text and calls `generate_image` ad-hoc for each slide → slides land in `linkedinPreview` state (not on the message) → rendered by `src/components/LinkedInPreview.jsx` in a split-pane layout.

**Missing (vs Instagram):** plan approval, design-system lock, retry, consistency sweep, design-system-aware edit, regenerate-same-slide, full-screen viewer, ZIP, save-as-template, plan persistence across refresh.

## Does it need 3-layer generation? Yes.

Consistency drift is arguably worse on LinkedIn than IG because readers expect polish. Today's flow asks the LLM to keep slides consistent in English and hopes. Bake the design system into every slide prompt verbatim — same fix we did for IG.

## Three PRs

### PR 1 — Core port (the big one)

**Files to change:**
- `src/pages/Content.jsx`
- `backend/routes/generate.js`
- `src/components/LinkedInPreview.jsx` (only to remove carousel handling; keep for single-image posts)

**Changes:**

1. **Parameterize `buildCarouselSlidePrompt({ platform })`.** Introduce a config object per platform:
   ```js
   const CAROUSEL_PLATFORM_CONFIG = {
     instagram: {
       canvas: '1080 x 1080 square',
       aspectLabel: 'square',
       headlineHookPx: '88-110',
       headlineMiddlePx: '92-108',
       bodyPx: '22-24',
       leftMargin: 96,
       rightMargin: 120,
       moodReferences: 'Offscreen magazine, Kinfolk, editorial trend',
       ghostNumeralPx: 520,
     },
     linkedin: {
       canvas: '1200 x 1500 portrait (4:5)', // or 1080x1350 for standard LI feed
       aspectLabel: '4:5 portrait',
       headlineHookPx: '72-92',
       headlineMiddlePx: '80-96',
       bodyPx: '24-26',
       leftMargin: 80,
       rightMargin: 100,
       moodReferences: 'Harvard Business Review cover, Stripe blog, Basecamp post',
       ghostNumeralPx: 480,
     },
   };
   ```
   Inject the right config based on `platform` arg. Keep the three archetypes (opening spread / editorial chapter / closing spread) — they apply identically.

2. **Extend `buildSystemPrompt` to route LinkedIn through `plan_carousel`.** Change `if (platform.id === 'instagram')` to `if (platform.id === 'instagram' || platform.id === 'linkedin')`. Inside, tweak the plan_carousel instructions per platform:
   - LinkedIn: tone the visual language down ("professional thought-leadership, not editorial-trendy"), bump slide count recommendation to 7–12 (LI audiences expect more depth), change aspect ratio language.

3. **Swap `'instagram'` hardcodes in handlers.** In `handleCarouselApprove`, `handleCarouselSlideEdit`, `handleCarouselSlideRegenerate`, `handleRetryFailedSlides` — replace the hardcoded `'instagram'` in every `generateImage(..., 'instagram', ...)` call with `activePlatform.id` (or persist `platform` on the message). This is a ~10-line change total.

4. **Backend `generate.js` LinkedIn rules.** Add the DESIGN SYSTEM deference pattern:
   ```
   DESIGN SYSTEM TAKES PRIORITY:
   - If the incoming prompt contains a "=== DESIGN SYSTEM (LOCKED ...)" block, follow it verbatim...
   ```
   Copy the pattern from the Instagram block.

5. **Retire the `<<READY_CAROUSEL>>` branch.** Behind a feature flag for one release (so we can A/B), then delete. The branch lives at Content.jsx ~L3621; replaced entirely by the plan_carousel flow the `<<READY_A>>` and `<<READY_B>>` text-post branches stay untouched.

6. **Persist `platform` on carousel messages.** When `plan_carousel` fires, stamp `msg.platform = activePlatform.id` so the handlers know which config to use after reload.

**Estimated: ~250 lines changed, 2-3 hours.**

### PR 2 — Enable "Publish now" for LinkedIn

Trivial. In `CarouselActionsBar`, the Publish-now button currently posts with `platform: 'instagram'`. The backend `publishCalendarPost` already handles `platform === 'linkedin'` via `linkedinApi.postText()` — but note LinkedIn's API doesn't support multi-image carousels directly through the posting endpoint; we'd publish the caption + link to images. OR: route LinkedIn carousels through BooSend if they have LI multi-image support. Check first.

Update the popover to use `activePlatform.id` instead of hardcoded `'instagram'`.

### PR 3 — Deprecate LinkedInPreview carousel rendering

Remove the carousel-specific branches from `LinkedInPreview` (keep only single-image post preview). Carousels now render inline on the message + in the optional side panel (see "Side panel" question).

## Platform-specific defaults to tune

- **LinkedIn aspect**: 4:5 portrait (1080×1350) is the standard for "document" carousels on LinkedIn. 4:3 (1200×900) is used but less common. Default to 4:5.
- **LinkedIn slide count**: 7–12 (vs IG's 5–9). LI users expect more depth.
- **LinkedIn mood**: professional, data-forward, thought-leadership. References like "HBR cover," "Stripe blog post hero," "Basecamp article header." NOT editorial/trendy (that's IG).
- **LinkedIn typography**: slightly smaller body, bigger body-to-headline ratio — more readable on a busier feed.
- **LinkedIn hook archetypes**: Claude's existing LINKEDIN_CAROUSEL_PROMPT has 5 intents (EDUCATING / NURTURING / SOFT SELLING / HARD SELLING / ENGAGEMENT). Feed those into the plan_carousel tool description as valid hook formats.
- **LinkedIn CTA types**: COMMENT [keyword], DM [keyword], FOLLOW, Link in bio. The CTA slide should lean COMMENT > DM > FOLLOW (LI engagement rewards comments heavily).

## What stays untouched

- `carousel_templates` table & routes (already generic — just tag templates with `platform` if we want strict separation)
- `CarouselPlanCard`, `CarouselActionsBar`, `SlideViewerModal` — all prop-driven
- ZIP download, schedule, calendar integration — already generic
- Auto-save carousel persistence — already generic
- `PLAN_CAROUSEL_TOOL` definition — just one sentence tweak in the description

## Tests to run before shipping

- IG carousel still works end-to-end (plan → approve → slides → edit → regenerate → schedule)
- LI carousel generates with plan card first
- LI plan approval fires image generation
- LI slide edit preserves design system
- LI regenerate re-rolls with same spec
- Mix of IG and LI carousels in the same session persist correctly
- Legacy `<<READY_CAROUSEL>>` path still works (if behind flag)

## Decisions to make before starting

- Default aspect: 4:5 portrait vs 4:3 landscape?
- Keep `<<READY_CAROUSEL>>` as fallback or full cutover?
- Should templates be platform-scoped or shared across IG/LI? (I'd say tag them with platform, show filtered in each tab's picker.)

---

*Plan drafted at end of IG carousel rollout. Execute as a single focused branch to avoid drift.*
