# Carousel features shipped for Instagram — portability notes

This doc captures every carousel-related feature we built for Instagram in the Content tab, so the same patterns can be ported to LinkedIn, Facebook, YouTube (community posts / multi-image), X, TikTok (where relevant). Most features live in `src/pages/Content.jsx`; the table schema and routes are called out per item.

The Instagram flow is the reference implementation. For other platforms, the question is whether each feature makes sense given how that platform renders multi-image content — if yes, the code is largely reusable.

---

## 1. Plan-first generation (the big idea)

**What it does.** Instead of asking Claude to generate 7 images directly, we ask it to call a `plan_carousel` tool with a structured plan — hook, angle, caption, slides array (5–9), and a locked `designSystem` object. The user reviews and approves the plan *before* any image generation runs. Then the client fires per-slide image generation with a byte-identical DESIGN SYSTEM block embedded in every prompt, so NanoBanana (Gemini) produces a visually cohesive set.

**Why it matters.** The number one failure mode for carousels is visual drift between slides — different typography, different accent colors, different card styles. By locking the design system in one place and stapling it verbatim onto every slide's prompt, we force consistency at the prompt layer. We also pass slide 1's rendered bytes as a reference image to slides 2..N, which anchors NanoBanana visually beyond what text alone encodes.

**Key code.** `PLAN_CAROUSEL_TOOL` definition, `buildCarouselSlidePrompt()` builder, `handleCarouselApprove()`.

**Portability.**
- **LinkedIn:** Already has a separate `<<READY_CAROUSEL>>` flow using `LINKEDIN_CAROUSEL_PROMPT`. Port the plan-first model — LinkedIn carousels benefit just as much from visual consistency. Aspect ratio is 4:3 instead of 1:1.
- **Facebook:** Multi-image posts are rare and rendered as a grid, not a swipe. Plan-first is overkill. Skip, or reuse for FB "slideshow" type posts if adopted.
- **YouTube:** Community posts allow multiple images but aren't really carousels. Skip.
- **X/Twitter:** Up to 4 images, rendered as a 2×2 grid. Could reuse the design-system idea for consistency, but 4 slides doesn't benefit from narrative arcs. Low priority.
- **TikTok:** Photo carousels exist. Same 1:1 or 9:16 aspect. Good candidate for the same flow.

---

## 2. Three layout archetypes (the "designed book" model)

- **Slide 01 — Opening spread:** rich hero composition, headline + visual designed together.
- **Slides 02..N-1 — Editorial chapter pages:** three-zone magazine spread where typography IS the design. Chapter mark + rule at top, huge 92–108px display headline in the middle, body column below a hairline divider, one ghosted slide-index numeral as a typographic anchor.
- **Slide N — Closing spread:** centered minimal CTA with generous negative space above.

**Why.** Middle slides used to look "tweaked" — like a hook minus the visual. Treating them as their own intentional archetype (magazine chapter pages) makes them feel crafted instead of degraded.

**Key code.** `buildCarouselSlidePrompt()` branches on `isHook` / `isFinal` / `isMiddle`.

**Portability.** Works for any platform with 5+ slides. For 4-slide grids (X/Twitter), collapse to two archetypes (hook + supporting).

---

## 3. Prompt-safety: separating TEXT CONTENT from VISUAL STYLE

**What it does.** Every slide prompt is structured in three explicit sections: `=== TEXT CONTENT (render exactly these strings) ===`, `=== VISUAL STYLE (how to render) ===`, `=== DO NOT RENDER AS TEXT ===`. Hex codes, px sizes, font weights, and CSS fragments live in VISUAL STYLE only and NEVER adjacent to text-to-render strings.

**Why.** We had NanoBanana rendering `linear-gradient(90deg, #f4d19a);` and `#a8b0c2 | 18px, 400` as literal text on slides because the prompt mixed styling syntax with content. The strict separation + a DO-NOT-RENDER ban list fixed it.

**Helper functions.** `extractAccent()` pulls the `{{accent}}word{{/accent}}` span out cleanly so markers never leak. `sanitizeStyleText()` strips CSS function calls from LLM-provided styling fields.

**Portability.** This applies to *any* platform using image generation. Copy the pattern verbatim.

---

## 4. Retry + consistency sweep (no silent drops)

- `generateSlideWithRetry()` retries each slide up to 3× with escalating backoff (1.5s, 3s). Treats empty/short image data or missing mimeType as failure (Gemini safety-filter returns 200s with placeholder responses).
- End-of-generation consistency sweep: walks indices 0..N-1 and pushes anything that's neither in `images` nor `failedSlides` into `failedSlides`. Closes any silent-drop path.
- User-visible "Retry N failed slides" button for anything that still fails after the automatic retries.

**Portability.** Copy as-is for any platform doing multi-image generation through Gemini or any other image model.

---

## 5. Design-system-aware per-slide edit

**What it does.** Clicking the pencil on any carousel slide doesn't send a generic "EDIT THIS IMAGE" prompt — it rebuilds the slide's prompt from the stored `designSystem`, prepends the user's instruction as an override, and references both the current slide and the hook slide as images. The design system stays locked.

**Contrast.** Non-carousel images (single YouTube thumbnails, single IG posts, etc.) use the original generic edit path. The handler dispatches based on whether `msg.carouselPlan` is present.

**Key code.** `handleImageEdit()` has two branches; the carousel branch lives inside.

**Portability.** Any platform with a locked design system benefits. LinkedIn carousels should adopt this when the plan-first flow is ported.

---

## 6. Regenerate-same-slide

Refresh icon next to the pencil. Re-rolls a slide with the exact same locked spec (no edit text). Anchors to the hook image as reference. `handleCarouselSlideRegenerate()`.

**Portability.** Any multi-slide flow.

---

## 7. Editable plan before approval

The plan card is a drag-to-reorder grid of editable slide cards (hook + CTA locked at the ends; middle slides reorderable/deletable/insertable). Each card inline-edits badge/headline/body/CTA. Caption has a textarea with live char counter and a fold marker at 125 chars (IG's in-feed truncation boundary). Palette swatches are native `<input type="color">` for tuning.

**Key code.** `CarouselPlanCard` component + `handleUpdateCarouselPlan()` callback.

**Portability.** Fold marker should be per-platform:
- IG: 125 chars (in-feed)
- LinkedIn: ~140 chars (first line preview)
- FB: ~80 chars
- X: n/a (280 hard cap)

---

## 8. Full-screen slide viewer

Click any slide → modal at max size. ESC closes (falls back to chat). Left/right arrows navigate. Edit and Refresh icons in the toolbar route back to the same handlers used by inline slide actions, closing the viewer first so the user sees state changes in context.

**Key code.** `SlideViewerModal` component.

**Portability.** Universal — any platform with multi-image content should have this.

---

## 9. ZIP download

Button on the finished carousel packages `slide-01..N.png` + `caption.txt` + `hook.txt` into a timestamped zip. JSZip loaded via dynamic import to keep the initial bundle small.

**Gotcha that bit us.** Auto-save swaps data URLs for Supabase storage URLs after ~1s. The first build assumed data URLs only and silently skipped remote images. The fix handles both (decodes data URLs directly, fetches remote URLs as blobs).

**Portability.** Universal.

---

## 10. Schedule / Publish to Content Calendar

- New button on finished carousel opens a datetime picker with three actions: **Save as draft**, **Schedule**, **Publish now**.
- All three write to the existing `social_posts` table (shared with `ContentCalendar` tab). Status is `'draft'`, `'scheduled'`, or `'published'`.
- **Publish now** additionally fires `publishCalendarPost(id)`, which routes through the existing BooSend → Instagram pipeline in `backend/routes/calendar.js`.
- Data URLs are uploaded to storage before saving so the row holds real URLs, not giant base64 blobs.

**Portability.**
- **LinkedIn:** Existing LinkedIn publish already exists in `backend/routes/calendar.js` via `linkedinApi.postText()`. Wire the same "Send to calendar" button to LinkedIn carousels.
- **Facebook:** Would need FB Graph API for Pages publishing. BooSend may support this — check.
- **YouTube/TikTok/X:** Separate publish pipelines needed, but calendar persistence works regardless.

---

## 11. Save-as-template + load-template picker

- Saved design systems live in `carousel_templates` table (per-user, RLS, JSONB `design_system` + optional `preview_url`). Routes: `GET/POST/DELETE /api/carousel-templates`.
- "Save as template" button on the finished carousel captures the locked design system, uses the hook slide as the thumbnail (uploaded to storage if still a data URL), prompts for a name.
- On any unapproved plan card, a "Load template ▾" picker swaps the plan's `designSystem` in place.
- Templates also appear in a sidebar card ("Saved carousel samples") where the user can toggle them on to inject as context for the *next* carousel generation. The selected templates' design systems are baked into the `plan_carousel` system prompt so Claude anchors the new plan to them.

**Key code.** `CarouselPlanCard` header picker, `CarouselActionsBar` save button, sidebar `cs-templates-card`, `buildSystemPrompt(..., carouselTemplates)` parameter.

**Migration.** `backend/migrations/add_carousel_templates.sql` — needs to be applied in Supabase.

**Portability.** Any platform with a design-system model can reuse the table, just gate the UI by `selectedPlatform`. A LinkedIn template should never be offered on an IG carousel (different aspect ratio). Store `platform` column if we expand.

---

## 12. Plan persistence across refresh

Auto-save serializes `{id, role, content, images, carouselPlan}` per message. The plan is needed to render the actions bar, keep the pencil's design-system-aware edit path, and resolve the regenerate button's slide specs. Transient fields (`generating`, `failedSlides`, `error`) are NOT persisted.

**Portability.** Universal to any tool-call-based plan flow.

---

## Files touched (quick map)

- `src/pages/Content.jsx` — core flow, plan card, viewer, actions bar
- `src/pages/Content.css` — styles for all above
- `src/lib/api.js` — `getCarouselTemplates / createCarouselTemplate / deleteCarouselTemplate`, `publishCalendarPost`, `createCalendarPost`, `uploadImageToStorage`
- `backend/routes/carousel-templates.js` — template CRUD
- `backend/routes/calendar.js` — shared with Content Calendar, already had IG publish via BooSend
- `backend/routes/generate.js` — relaxed IG platform rules to defer to DESIGN SYSTEM block
- `backend/migrations/add_carousel_templates.sql` — new template table

---

## What each platform should adopt (priority order)

| Feature | LinkedIn | Facebook | YouTube | X/Twitter | TikTok |
|---|---|---|---|---|---|
| Plan-first + design system lock | ✅ HIGH | ⚠️ low | ❌ | ⚠️ low | ✅ HIGH |
| 3-archetype layout | ✅ HIGH | ❌ | ❌ | ⚠️ collapse to 2 | ✅ HIGH |
| TEXT/STYLE separation in prompts | ✅ HIGH | ✅ HIGH | ✅ HIGH | ✅ HIGH | ✅ HIGH |
| Retry + consistency sweep | ✅ HIGH | ✅ HIGH | ✅ HIGH | ✅ HIGH | ✅ HIGH |
| Design-system-aware edit | ✅ HIGH | ❌ | ❌ | ❌ | ✅ HIGH |
| Regenerate-same-slide | ✅ HIGH | ✅ | ✅ | ✅ | ✅ HIGH |
| Editable plan before approval | ✅ HIGH | ⚠️ | ❌ | ⚠️ | ✅ HIGH |
| Full-screen viewer | ✅ | ✅ | ✅ | ✅ | ✅ |
| ZIP download | ✅ | ✅ | ✅ | ✅ | ✅ |
| Schedule → Calendar | ✅ HIGH (exists) | ✅ | ✅ (needs API) | ✅ (needs API) | ✅ (needs API) |
| Save-as-template | ✅ HIGH | ⚠️ | ❌ | ⚠️ | ✅ HIGH |
| Plan persistence | ✅ | ✅ | ✅ | ✅ | ✅ |

LinkedIn is the best next port — the table `social_posts` already handles both platforms, the publish pipeline already works (via `linkedinApi.postText`), and LinkedIn carousels benefit hugely from visual consistency. Biggest change: aspect ratio (4:3 landscape instead of 1:1 square) and the design-system defaults should swing more professional/editorial.

TikTok photo carousels are the second-best port — same 1:1 aspect, same narrative arc, but posting would need a new publish pipeline.
