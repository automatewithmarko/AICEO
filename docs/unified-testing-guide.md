# Unified Backend — Testing Guide (all phases)

> For the founder. One file, updated with every phase. Simple language,
> user-experience level. Work top to bottom; each phase has its own
> checklist. Technical background lives in
> `docs/unified-content-backend-plan.md` — this file is only about WHAT
> shipped and HOW to test it by hand.

 Note: Any Point below starting with "- *" is my/user comments or observations.  
---

## Before you start (2 minutes)

**Where to test:** localhost or https://aiceo-dev.netlify.app — both work.
On localhost, make sure your local backend is running the latest dev code
(`cd backend && npm run dev`), or point `VITE_API_URL` at the Railway dev
backend.

**The switch:** the unified system is ON by default everywhere on the dev
branch. You don't need to enable anything. If something misbehaves and you
want to instantly compare against the OLD system, open DevTools (F12) →
Console and type:

```js
localStorage.aiceo_unified_content = '0'   // OLD system (legacy)
```
then reload. To go back to the new system:
```js
localStorage.aiceo_unified_content = '1'   // or localStorage.removeItem('aiceo_unified_content')
```
then reload. This only affects YOUR browser. Nothing else changes.

**How to tell which system answered a chat message:** DevTools Console
shows a collapsed line for every generation:
- New system: `[prompt] content-chat (model=claude-sonnet-4-6)` (or
  `content-linkedin_post`, `content-linkedin_edit`)
- Old system: the Grok request logging you're used to.

**When something looks wrong:** flip the flag to '0', redo the exact same
flow, and note whether the old system does it better. That comparison is
the single most useful thing you can capture (like you did in prompt.md —
that format is perfect).

---

## Phase 1 + 1b — Content tab chat runs on our backend (Claude)

**What shipped, in plain words:** the Content tab's "brain" used to run in
your browser talking directly to Grok. Now the same prompts run on OUR
backend on Claude Sonnet — the same engine the AI CEO uses. Because Claude
follows instructions differently than Grok, we also shipped a "protocol
adapter": questions, the post-generation trigger, and edit commands are
now internal tool calls that Claude is extremely reliable at, and the final
LinkedIn post is delivered through a forced channel that physically cannot
contain the AI's internal planning notes (the "Constraint Checklist /
Mental Sandbox" leak you caught in prompt.md can no longer reach the
preview).

### Test checklist — LinkedIn (Content tab, LinkedIn platform selected)

1. **Discovery flow.** Type "make me a LinkedIn post". It should ask ONE
   question at a time with clickable options (Format first: Text post vs
   Carousel), max ~3 questions, always including a fallback option like
   "Surprise me". It must NEVER ask two questions in one message, and
   never as loose text without clickable options.

2. **Text post generation.** After you answer, it writes a short one-line
   commitment ("I'll create a framework post about...") and the post
   appears in the RIGHT-SIDE preview panel — never in the chat bubble.
   - Check the post: no em dashes anywhere, no hashtags, signs off with
     your actual name (never "[Your Name]"), 1300-1500 characters-ish,
     proper line breaks.
   - **The prompt.md bugs specifically:** no planning text, no
     "Constraint Checklist", no "Okay, proceeding.", no meta-sentence
     instead of a post. The preview should contain ONLY the post.
   - FOUNDER FINDING (round 1): post quality good, but it does not stream
     word-by-word — wanted back. → **FIXED**: the writer's output now
     streams progressively into the preview again (the backend extracts
     the post text from the tool's argument stream as it generates, so
     you get word-by-word AND the no-reasoning-leak guarantee). Re-test.

3. **Edits on the post.** With the post on screen, say "make it shorter".
   The existing post should be rewritten IN PLACE (images kept, preview
   updates). Say "add an image" → it should generate/attach without
   rewriting your text. Then try "actually scrap this, write a new post
   about X" → THAT should restart the generation flow.

   - FOUNDER FINDING (round 1): edits didn't appear in the preview until
     a page refresh; same pattern elsewhere — artifact cards not switching
     between modified versions. → **FIXED** (root cause found): the
     preview components (LinkedInPreview + SocialPreview) keep a local
     draft for inline caption editing, and once you had ever clicked into
     the text (even without typing), that draft permanently blocked every
     later content update from the AI — refresh remounted the component,
     which is why the edit "appeared after refresh". External content
     changes (AI edits, switching message cards/versions) now override the
     stale draft; your own unsaved typing is still protected. Re-test both
     symptoms: (a) "make it shorter" updates the preview live, (b)
     switching between artifact cards/versions shows each card's own
     content.

4. **Carousel.** Ask for a LinkedIn carousel. Expect: up to 3 discovery
   questions → a PLAN CARD (hook, slides, design palette, caption) →
   nothing generates until you click Approve. Check the caption is
   substantial (LinkedIn caption = the post itself, 150-450 words), 7-12
   slides, hook slide + CTA slide.

   - FOUNDER FINDING (round 1): after "Here's the plan — approve to
     generate" the chat went silent — no loading/planning UI while the
     plan was actually being built. → **FIXED**: the moment the model
     commits to building a plan, a "Building your carousel plan…" status
     row now shows under the chat (and "Preparing your image…" for image
     turns) until the plan card / image lands. Re-test.

5. **"No questions" escape hatches.** Say "write a LinkedIn post about
   pricing mistakes, framework style, no questions" — it should skip
   discovery and go straight to generation.
   - FOUNDER FINDING (round 1): ✅ worked.

6. **Outlier template copy.** Attach an outlier post/creator link, ask for
   a post based on it — wording/structure should mirror the template
   closely (this mode may legitimately use em dashes/hashtags if the
   template does).

### Test checklist — Instagram (Content tab, Instagram platform)

7. **Single post:** ask for an IG post → discovery (Single/Carousel/
   Story) → ONE square image + caption in the preview.
   - FOUNDER FINDING (round 1): image generated but NO caption. →
     **FIXED** (prompt-level): the model is now explicitly required to
     write the ready-to-post caption in the same turn as every
     generate_image call for single posts and stories — an image without
     a caption is called out as an incomplete deliverable. Re-test; if it
     still happens occasionally, report it and we'll add a server-side
     enforcement pass.
   - FOUNDER FINDING (round 1): Content/Instagram chat has no
     message-level artifact versioning like AI CEO (open a previous
     artifact from its message card). → **PLANNED, not yet built** — this
     is a feature, not a regression (the legacy Content never had it
     either). Design intent: each assistant message already owns its
     images/carouselPlan; add an "open in preview" affordance on IG
     message cards mirroring the LinkedIn "Open preview" button. Note:
     part of the pain here was the stale-preview bug above — with that
     fixed, re-evaluate how much is still missing.

     - * Instagram image Posts generated are not dispalyed in CANVAS, SO FIX it and above now. 

8. **Story:** ask for a story → 3-4 vertical frames generate.
   - *  Didn't generate and Previewd proper story sequence. FIX it, take reference from Marketing-ai/Story-sequence. 

9. **Reel:** ask for a reel → a SCRIPT as text (spoken words, "Direction:"
   note at the end). NO images must generate. No [HOOK]/[SCENE] labels.
   - * Gives"Direction:" at the end. 

10. **Carousel:** plan card → approve → slides (5-9, square).
   - * After "Here's the plan — approve to generate.", there's no Loading/Planning/Generating UI, FIX it.
   - * Didn't write caption with carousal, fix it.  

### Also check

11. **Plan Mode** (the plan toggle in Content): 5 scoping questions one at
    a time → a styled HTML plan renders in chat → "generate Monday's
    post" uses the plan row without re-asking everything.
12. **Chat memory:** multi-turn conversations behave; asking a follow-up
    question after a generated post doesn't regenerate it.
13. **Web search caveat (known change):** the old Content chat could
    quietly search the web mid-answer (Grok). The new one doesn't (same
    as AI CEO's normal turns). If you feel this loss in real use, tell me
    and we'll add a search toggle like AI CEO's.
14. **Billing note:** Content chat still costs no credits (unchanged);
    images still debit like before.

---

## Phase 2 — Carousel slides render on the server

**What shipped, in plain words:** when you click "Approve & generate
slides" (either tab), your browser no longer generates slides one by one.
One request goes to our backend, which renders every slide with the exact
same locked design system, retries each failed slide up to 3 times
automatically, renders slide 1 FIRST and uses it as the visual anchor so
all slides match, and uploads finished slides to storage. Your browser
just receives them as they finish. Bonus: the AI CEO tab never had retries
or anchoring before — now it does.

### Test checklist — both tabs (Content AND AI CEO)

1. **Approve a carousel** (IG and LinkedIn, in both tabs = 4 combos if
   you're thorough). Slides appear progressively; slide 1 lands first;
   all slides share palette/typography; correct shapes (IG square,
   LinkedIn tall 3:4).
2. **Network check (optional):** DevTools → Network → you should see ONE
   `carousel` request streaming, instead of 5-12 separate `image` calls.
3. **Tab-survival bonus:** slides keep rendering server-side even if you
   navigate away mid-generation (you won't see them arrive if you leave —
   no resume UI yet — but generation doesn't die like before).
4. **Failed slides.** If any slide fails all 3 server retries, it shows in
   the plan card / retry banner with a "Retry" button. Click it — only
   the failed slides regenerate, and they should visually match the
   existing ones (anchored).
5. **Slides are now URLs, not embedded images** — downloads, scheduling,
   and publishing should all still work exactly the same (test in Phase 3
   checklist below).
6. **Single-slide edit and re-roll** (pencil / re-roll on one slide) still
   work as before — these deliberately kept their old path.
7. **Credits:** each slide (and each automatic retry attempt) debits one
   image_generation credit — same cost model as before.

---

## Phase 3 — Canvas parity: AI CEO gets /Content's best tools + one publish pipeline

**What shipped, in plain words:** three gaps between the two tabs are
closed, always in the direction of "both tabs get the best version":

- **AI CEO now shows the FULL editable plan card** before a carousel
  generates (the same one Content has): tap any slide text to edit it,
  add/delete/reorder slides (hook and CTA are locked in place), change
  palette colors with a color picker, edit the caption with the 125-char
  fold counter, and load a saved design-system template. Before, AI CEO
  only had a read-only "Approve" card.
- **AI CEO gets "Download ZIP"** next to Download PDF for carousels — all
  slides as image files plus caption.txt and hook.txt (identical to
  Content's ZIP).
- **Instagram publish from AI CEO now goes through the Content Calendar
  pipeline** — the same path Content and the scheduler use. Practical
  effect: a post published from the AI CEO canvas now appears in your
  Content Calendar as a published row (before, it bypassed the calendar
  entirely).

### Test checklist — AI CEO tab

1. **Rich plan card:** ask AI CEO for an IG or LinkedIn carousel → when
   the plan card appears, before approving: edit a headline, insert a
   slide (+), delete a middle slide, move a slide with the arrows, change
   a palette color, edit the caption. Then approve — generated slides
   must reflect ALL your edits.
2. **Template picker:** on the plan card, "Load template ▾" should list
   design systems you saved from Content, and applying one recolors the
   plan. (Save new templates from Content's canvas as before.)
3. **Download ZIP:** after a carousel generates, the toolbar shows both
   "Download PDF" and "Download ZIP". The ZIP should contain
   slide-01.jpg…slide-NN.jpg + caption.txt + hook.txt.
4. **Publish to Instagram from AI CEO:** post a carousel/image → it
   should publish AND show up in the Content Calendar as a published
   post. (Use a test account — this posts for real!)
5. **Failed-slide retry in AI CEO:** if slides fail, a red banner with
   "Retry" appears above the preview (AI CEO previously had NO retry at
   all).
6. **Regression sweep (nothing else should have changed):** LinkedIn
   publish from AI CEO, schedule popover, upload image, caption inline
   edit, newsletter/landing page generation + Netlify deploy + email
   send, version history — all as before.

### What did NOT ship yet (so you don't hunt for it)

- One physical merged canvas component: intentionally deferred to Phase 5
  (it inherently replaces the old canvas code, which you told me not to
  remove until you sign off). Everything user-facing about it (feature
  parity) already shipped above.
- Old flows stay fully available via the '0' kill switch.

---

## Phase 4 — AI CEO writes LinkedIn posts with Content's writer

**What shipped, in plain words:** until now, AI CEO wrote LinkedIn post
copy "itself" in one pass — decent, but without the specialized writing
system Content has (the two writing styles, the strict hook rules, the
anti-fabrication guardrail that refuses to invent personal stories). Now,
when AI CEO decides a LinkedIn text post is ready to generate, it hands
off to the SAME dedicated writer Content uses. You should no longer be
able to tell which tab wrote a LinkedIn post. AI CEO's LinkedIn CAROUSEL
captions were also upgraded to Content's standard (the caption is the
post: 150-450 words of real value, not 2 throwaway sentences).

### Test checklist — AI CEO tab

1. **LinkedIn text post.** Ask AI CEO for a LinkedIn post. It should ask
   its discovery questions as usual (clickable options), then say ONE
   short commitment sentence, show "Writing your LinkedIn post..." and the
   finished post appears on the canvas as a normal post artifact.
   - Quality bar (same as Content): scroll-stopping first line, no em
     dashes, no hashtags, your real name in the sign-off, 1300-1500
     chars-ish, framework-style OR story-style structure.
   - The chat bubble must NOT contain the post text — only the short
     wrap-up sentence. The post lives on the canvas.
2. **Side-by-side quality check (the point of this phase):** generate a
   post on the same topic in Content and in AI CEO — they should feel
   like the same writer.
3. **Story posts don't invent facts:** ask AI CEO for a story-style post
   about something it has no documents for — it should NOT fabricate
   specific personal anecdotes (numbers, client names, dramatic events
   that never happened).
4. **Edits unchanged:** with the post on canvas, "make it shorter" /
   "change the CTA" should tweak the existing post in place (no full
   regeneration, no discovery questions).
5. **LinkedIn carousel caption upgrade:** ask AI CEO for a LinkedIn
   carousel → in the plan card, the caption should now be a substantial
   150-450-word post (before this phase it was often 2-5 thin sentences).
6. **Everything else identical:** Instagram posts/stories/reels from AI
   CEO, newsletters, landing pages, emails — no behavior change expected.
   A reel request must still produce a script instantly with no questions.

---

## Phase 5 — Cleanup: the old system is gone (dev branch)

**What shipped, in plain words:** the legacy code paths were removed. The
unified backend is now the ONLY way Content and AI CEO generate content on
the dev branch. Practical consequences:

- **The kill switch no longer exists.** `localStorage.aiceo_unified_content`
  does nothing now — there's no old system to fall back to. If something
  breaks, we fix forward (or `git revert` the cleanup commits).
- Content.jsx shrank by ~2,900 lines; all prompts live on the backend as
  the single source of truth.
- The browser no longer talks to x.ai at all — you can remove
  `VITE_XAI_API_KEY` from the Netlify env whenever convenient.
- Merging dev→main from this point puts the unified system live in
  production. Do that only when this guide is fully green.

### Test checklist — full regression sweep (everything above, once more)

Since the fallback is gone, this phase's "test" is simply: run the Phase
1-4 checklists above one final time and confirm nothing regressed after
the deletions. Pay extra attention to:
1. Content: text post, carousel (plan → edit plan → approve → slides),
   story, reel, plan mode, edit mode, outlier template — all still work.
2. Content: single-slide pencil-edit and re-roll on a finished carousel
   (these kept a separate path through the image endpoint — make sure
   they still render slides that match the set).
3. AI CEO: carousel plan card still fully editable; approve → slides;
   retry banner on failures; ZIP/PDF downloads; IG publish lands in the
   Content Calendar; LinkedIn post via the shared writer.
4. Anything that FEELS slower/different than during your Phase 1-4
   testing — report it; the cleanup should have changed nothing
   behaviorally.

---

## FINDINGS LOG

### Round 1 — founder testing (2026-07-16) → fix batch 1 (same day)

| # | Finding | Status |
|---|---|---|
| 1 | LinkedIn post doesn't stream word-by-word | **FIXED** — post text streams progressively from the writer's tool-argument stream (backend/agents/content/handler.js `onToolInputDelta`; new streaming observers in base-agent.js) |
| 2 | Post edits invisible until refresh; artifact cards not switching versions | **FIXED** — stale local caption-draft in LinkedInPreview/SocialPreview froze prop updates forever after any click-into-text; external content changes now override the draft |
| 3 | No planning UI while carousel plan builds | **FIXED** — "Building your carousel plan…" / "Preparing your image…" status row during the tool-argument streaming window (`onToolStart` → SSE status → Content status row) |
| 4 | "No questions" escape hatch | ✅ worked, no change |
| 5 | IG single post: image without caption | **FIXED (prompt-level)** — caption required in the same turn as generate_image; escalate to server-side enforcement if it recurs |
| 6 | Content/IG message-level artifact versioning (like AI CEO) | **PLANNED** — feature build; re-evaluate need after the stale-preview fix (#2) since that bug masked version switching |

Notes for round 2: re-test items 1-3 and 5; finish the unrecorded checks
(IG story, reel, IG carousel, outlier copy, Plan Mode, AI CEO checklist,
Phase 5 regression sweep).

### Round 2 — founder testing (2026-07-16) → fix batch 2 (same day)

| # | Finding | Status |
|---|---|---|
| 7 | **CRITICAL** (prompt.md): model printed `{"tool_code": "generate_image(...)"}` as literal chat text — no image generated, raw JSON visible, model then claimed it had generated the post | **FIXED, 4 layers.** Root cause: Claude requests route through the Mentor gateway first, and some gateway responses come from a non-Claude backend (the `tool_code` JSON shape and "Mental Sandbox" style are Gemini conventions) that ignores our native tools. (1) The backend now detects pseudo tool-call text and automatically retries the turn against api.anthropic.com directly; (2) if one still slips through, the frontend parses the prompt out of the pseudo call and fires the image generation anyway (self-healing); (3) raw `{"tool_code"...}` JSON is stripped from the chat display while keeping the caption around it; (4) prompt-level ban added. **Also new: set `ANTHROPIC_PREFER_DIRECT=true` on Railway to flip routing (direct Anthropic primary, Mentor only as fallback) with no code change — recommended if this recurs.** |
| 8 | Word-by-word streaming not working on Instagram posts | **Believed same root cause as #7** — the misbehaving gateway backend streams coarsely (the whole caption arrived in one blob in the same broken turn). With the direct-Anthropic retry (and especially with `ANTHROPIC_PREFER_DIRECT=true`), genuine Claude streams finely. Re-test; if IG captions still arrive in one blob on turns that are otherwise healthy, report — that would point at something else. |

### Round 3 — founder report + platform-switching audit (2026-07-16)

| # | Finding | Status |
|---|---|---|
| 9 | Arrow keys flip carousel slides even while typing in the chat input | **FIXED** — the slide-nav key listeners are global; they now ignore any keypress that originates in an input/textarea/contentEditable (chat box, caption editor, edit-instruction fields). Applies to the side preview AND the fullscreen slide viewer, in both tabs (shared component). |

**Platform-switching audit (Instagram ↔ LinkedIn in /Content)** — every
case examined, what was broken, and what was done:

| Case | Verdict | Action |
|---|---|---|
| Pending discovery question survives a switch (e.g. IG asks "Single/Carousel/Story?", you switch to LinkedIn, click an option → confusing out-of-context answer sent into the LinkedIn flow) | **WAS BROKEN** | **FIXED** — switching platforms now dismisses the pending question + custom-answer input |
| Carousel side panel / fullscreen slide viewer stay open showing the old platform's content under the new pill | **WAS BROKEN (cosmetic/confusing)** | **FIXED** — both close on switch |
| Edit mode dies after a pill round-trip (LinkedIn post on screen → switch to IG → back to LinkedIn → "make it shorter" would REGENERATE instead of editing, because the preview was cleared and edit mode requires an on-screen post) | **WAS BROKEN** | **FIXED** — switching back to LinkedIn auto-restores the most recent LinkedIn post into the preview, so edit mode keeps working |
| Mid-generation switch (switch pills while a generation is running) | OK by design — the in-flight turn keeps the platform it was sent with (closures), plan cards are stamped with their own platform, and Approve uses the message's platform, not the current pill | No change; keep an eye on it |
| Approving an IG plan card while the pill is on LinkedIn (or vice versa) | OK — slide generation uses the plan message's own platform stamp | No change |
| One chat session mixing both platforms' history (the model sees IG discovery/plans in history while generating for LinkedIn) | Acceptable — the system prompt hard-scopes to the active platform ("ONLY creating content for X"), and the question-leak fix above removes the main confusion vector. Sessions save the LAST platform used, so reopening a mixed session lands on the most recent platform | Documented as known behavior; if the model ever gets visibly confused by other-platform history, report it and we'll add a history-filtering pass |
| Switching to FB / X / TikTok / YouTube | Same code path as IG (image-based flow + platform guidance) — inherits all the fixes above | Covered |

**Re-test recipe for switching:** (1) start an IG carousel until it asks a
question → switch to LinkedIn → confirm the question disappears and
LinkedIn chat works normally; (2) generate a LinkedIn post → switch to IG
→ generate an IG image post → switch back to LinkedIn → confirm the post
preview reappears and "make it shorter" EDITS it (doesn't regenerate);
(3) with a carousel open in side view, switch pills → panel closes; (4)
approve an IG plan, switch to LinkedIn mid-generation → slides still
arrive square (IG), not 3:4.

### Round 4 — founder requests (2026-07-16)

| # | Request | Status |
|---|---|---|
| 10 | Cross-platform content reuse: after switching platforms, the new platform should see the TEXT of previously generated posts (so IG can repurpose the LinkedIn post's wording) — but without mixing in the artifacts/functionality | **SHIPPED** — every chat turn now carries the text of the last 4 generated items (LinkedIn posts, carousel hooks+captions, IG captions), each tagged with its platform, injected as a clearly-fenced "previously generated content" reference block. Rules baked in: text reference only, never treated as an on-screen artifact, never triggers edit mode, and new output still follows the current platform's rules. **Test:** generate a LinkedIn post → switch to Instagram → "make an Instagram version of that post" → the IG caption should reuse the actual wording/ideas, and the LinkedIn preview/edit behavior should be untouched. |
| 11 | Brand Brain download (Settings → Brand DNA) produces .txt — should be PDF | **SHIPPED** — the download button now produces a paginated PDF (title header + date, wrapped text, A4). If PDF generation ever fails it falls back to .txt rather than downloading nothing. **Test:** Settings → Brand DNA → Brand Brain → download button → expect `brand-brain-YYYY-MM-DD.pdf`. |

### Round 5 — Stripe unified connect (2026-07-16)

**What shipped, in plain words:** Stripe now has ONE connection process
for everyone. You paste your Secret key and AICEO does the rest: verifies
every permission it needs (and tells you in plain English if your key is
missing any), installs the webhook in your Stripe account automatically
(you never open Stripe's Developers section), and imports your products.
Existing users don't have a separate procedure anymore — the new **Repair
connection** button on the Stripe card re-verifies, reinstalls the
webhook, and re-syncs everything in one click using your already-saved
key. Disconnect → reconnect does the same thing. Bonus fixes: products
deleted in Stripe now disappear from AICEO on every sync; webhook events
are now signature-verified; disconnect cleans up the webhook it created.

**Test checklist (use a Stripe TEST key `sk_test_...` if you have one):**
1. **Fresh connect:** Settings → Stripe → Connect → paste key → you
   should land on the SUCCESS screen ("webhook installed automatically"),
   with NO manual webhook step. Verify in Stripe Dashboard → Developers →
   Webhooks that an AICEO endpoint now exists with ~21 events.
2. **Products imported:** your Stripe products appear in the Products tab
   within a minute.
3. **Repair:** click "Repair connection" on the connected card → green
   confirmation → check the webhook in Stripe still exists (it should be
   updated/recreated, not duplicated).
4. **Reconnect:** Disconnect (check the AICEO webhook DISAPPEARS from
   your Stripe dashboard) → Connect again with the same key → success
   screen, webhook back, products still there (no duplicates).
5. **Bad key:** paste a made-up key → clear "Stripe rejected this API
   key" error. If you have a restricted key missing permissions → the
   error should LIST what's missing in plain English.
6. **Live sync:** create a product in Stripe → appears in AICEO within
   seconds; archive it in Stripe → disappears.

### Round 6 — unified content planning + robustness fixes (2026-07-17)

**What shipped, in plain words:** Content planning is now ONE system used
by both tabs. Plan Mode in the Content tab produces the same in-chat plan
card (day-by-day list + "Generate content" button) the AI CEO has — no
more old HTML plan page on supported platforms. Under the hood, plan
pieces generate through the exact same engines as everything else: plan
LinkedIn posts use the full shared writer now (they'll read like your
interactive posts), and plan carousels render server-side with retries
and visual anchoring. Also: chat and planning are now FREE everywhere
(see docs/credits-policy.md — credits only pay for images/slides), and a
batch of robustness fixes landed (closing the tab now stops generation
and billing; running out of credits mid-carousel shows the paywall
instead of a dead retry loop).

**Test checklist:**
1. **Content tab Plan Mode (LinkedIn or Instagram pill):** toggle Plan
   Mode → "plan my next 7 days" → an in-chat plan card appears (day-by-
   day list, no HTML page, and it must NOT ask which platform — the pill
   decides). Items only for the pill's platform, formats rotating.
2. **Generate content from the plan (Content tab):** hit "Generate
   content" → pieces appear one at a time as normal chat messages —
   LinkedIn text posts get the summary card + Open Preview, carousels
   arrive with slides (server-rendered), image posts with caption +
   image. Stop mid-run → Resume works. Reload mid-run → Resume works.
3. **Same in AI CEO:** plan → generate → identical behavior (artifact
   chips there). Plan LinkedIn posts should now read like interactive
   ones (full writer quality, your sign-off).
4. **Quality check:** compare a plan-generated LinkedIn post vs an
   interactive one — same writer, should be indistinguishable.
5. **Free chat:** verify chat messages and planning no longer deduct
   credits (balance unchanged after chatting/planning; drops only when
   images/slides generate).
6. **Tab-close stop:** start a carousel, close the tab, reopen — the
   run should NOT have kept billing to completion in the background.
7. **Credit exhaustion:** (if testable) run credits to zero mid-carousel
   → paywall appears instead of silent slide failures.
8. **Facebook/TikTok pills:** Plan Mode there still uses the old HTML
   plan (intentional fallback — these platforms have no plan formats yet).
   *(Superseded in Round 7 — Facebook/TikTok now use the unified plan
   card too; the old HTML plan is fully retired.)*

### Round 7 — your 6 findings from 2026-07-17, fixed

**What shipped, in plain words:** all six things you wrote in prompt.md.

1. **"Thinking..." during plan creation → real status.** While the AI
   builds a plan you now see "Building your content plan…" instead of
   the generic thinking dots. Test: ask for a plan in either tab and
   watch the status line while it works.
2. **Old HTML content planning removed.** The legacy "styled HTML plan
   page" (Open in canvas / Download HTML / Copy HTML) is gone from the
   backend entirely — every platform pill, including Facebook and
   TikTok, produces the unified in-chat plan card. Old chats that
   already contain an HTML plan still display it (read-only), and the
   AI can still generate pieces FROM an old HTML plan if you reference
   it. Test: Plan Mode on every pill → always the plan card, never the
   HTML page, never "Which formats do you want" style questions.
3. **Stop button stops immediately.** Stop now aborts the in-flight
   request (not just "finish this piece first") and shows a "Stopping…"
   state the moment you click. The piece being generated goes back to
   pending so Resume regenerates it cleanly. Test: start a plan run,
   hit Stop mid-piece → footer flips to "Stopping…" then "Stopped — N
   of M done", and the interrupted piece is NOT marked done.
4. **Carousel slides no longer stuck on slide 1.** While a carousel is
   still rendering, the preview's next/prev arrows now move through ALL
   planned slides — slides that haven't arrived yet show a "Generating
   slide N…" placeholder (and if a slide failed after the run, it says
   so and offers "Retry slide" right there). Test: generate an
   Instagram carousel, open the preview while it renders, click next
   repeatedly → you should advance through placeholders, and arrived
   slides fill in live. Arrow keys still type in chat normally.
5. **Content tab planning = AI CEO planning, no platform question.**
   Typed requests like "create a biweekly plan" in the Content tab now
   go through the same unified system without Plan Mode toggled, and
   the pill answers the platform question — it must never ask "Which
   platforms should I plan for?" in the Content tab. Test: type a plan
   request on the LinkedIn pill without toggling Plan Mode → plan card
   for LinkedIn only, zero discovery questions.
6. **Resize slider in Content tab.** The chat/preview split in the
   Content tab now has the same draggable divider as the AI CEO
   chat/canvas split. Test: open any post preview (LinkedIn or
   Instagram) → drag the handle between chat and preview → both panes
   resize (25%–75% range), on desktop only (mobile preview stays
   fullscreen).

### Round 8 — reel-script cards, real faces, workflow-first DM builds (2026-07-20)

**What shipped, in plain words:** your three findings from 2026-07-20.

1. **Reel/YouTube scripts open in a card, not inline chat.** In the
   Content tab a generated script now arrives as a compact "Reel script"
   card with an "Open script" button — the full script lives in a side
   panel (with edit, copy, and download), never dumped into the chat.
   Works for scripts asked in chat AND scripts generated from a content
   plan. The AI CEO tab already did this via its canvas. Test: on the
   Instagram or TikTok pill ask for "a 30-second reel script about X" →
   one hand-off sentence in chat + script card → Open script → side
   panel; the resize divider works there too. Old sessions with inline
   scripts still display as before.
2. **Faces look like the person, with real skin.** Every image path
   (single posts, LinkedIn images, carousel slides, stories) now demands
   the exact likeness from your reference photos AND real photographic
   skin — visible pores, natural imperfections, no airbrush/beauty-filter
   smoothing. Also fixed: carousels no longer force your face onto
   text-first slides — the founder photo only appears where the slide
   design calls for one (hook/CTA). Test: generate an image post with
   brand photos set → the face should be recognizably you with natural
   skin texture, not a smoothed "Botox" lookalike.
3. **DM automation builder prefers simple workflows.** Every build
   request to the BooSend builder now carries a build policy: requests
   that are trigger → condition → messages/buttons (like your
   story-comment "book" → follower check → ebook link example) must be
   built as plain deterministic workflows with keyword triggers and ZERO
   AI nodes; AI agents only when the request genuinely needs free-form
   language understanding at runtime. Test: Marketing → DM automation →
   paste the "book" story example → the resulting graph should show
   trigger/condition/message nodes, no "AI Agent" node.
   **Note:** the builder LLM itself runs on the external
   `boosend-automation-api` service (it's in your Railway team, but its
   code isn't in this repo). This policy rides on every request we send
   it and should steer it; if it still insists on agent builds after
   this, the deeper fix is in that service's own system prompt — point
   me at that repo and I'll fix it there.

### Round 9 — text-post canvas, script-guide engine, builder question cap (2026-07-20)

**What shipped, in plain words:** the prompt.md findings from later on 2026-07-20.

1. **Text-only AND single-image posts open in canvas in /Content.** An
   Instagram (or Facebook/X/TikTok) post — with or without an image —
   now arrives as a post card with "Open preview": the caption lives in
   the social preview panel paired with its image (editable, with the
   schedule/publish toolbar), never dumped inline. Plan-generated
   single-image pieces get the same card (LinkedIn ones use the LinkedIn
   preview card). Also fixed along the way: scheduling a single-image or
   text-only post from the preview toolbar now carries the caption (it
   used to crash — the toolbar only knew carousel captions), and the
   "Template" button only shows on carousels where it applies. Test:
   Instagram pill → "make me an image post about X" → hand-off sentence
   + post card + preview auto-opens with caption + image together;
   schedule it and check the calendar entry has the caption.
2. **Script canvas buttons visible.** The script panel's Edit/Copy/
   Download/Close buttons no longer hide behind the floating
   notification bell — the header reserves space for it.
3. **BooSend builder: max 1-2 questions, only critical ones.** The build
   policy now orders the builder to build immediately when the request
   describes trigger + conditions + messages, ask ONLY for details the
   automation cannot work without (like the actual ebook URL), never ask
   about goals/niche/tone/audience, never re-ask, and default the
   non-critical details (noting them in the build summary). Test: paste
   the "book" story example → it should ask for the ebook link at most,
   then build.
4. **VIDEO SCRIPT ENGINE is now the script brain.** The master pack
   (docs/VIDEO SCRIPT ENGINE — COMPLETE MASTER PACK.docx) is distilled
   into backend/agents/content/video-script-guide.js — ONE source used
   by every script path: Content chat, AI CEO chat, and plan-generated
   reel/YouTube scripts. Short-form scripts now follow the full craft
   spec (3-second hook ≤12 words, word budgets per duration, but/
   therefore beats, re-hooks, [VISUAL]/[TEXT ON SCREEN] cues, production
   notes, banned AI-cliché words, loop endings); YouTube scripts follow
   the long-form spec (click confirmation, payoff map, chapter
   micro-hooks, mid-video subscribe ask, bridge ending — no outro).
   Test: ask for a 45s reel script → it should arrive in the script card
   with HOOK/BODY/CTA structure, visual cues, and production notes; ask
   for a 10-min YouTube script → payoff map + chapters + no "thanks for
   watching".

### Round 10 — caption reliability, gpt-image-2, script-guide compliance (2026-07-20)

**What shipped, in plain words:**

1. **Caption always shows in the canvas on the FIRST attempt.** Root
   cause found: while slides/images were still generating, the preview
   showed the loading skeleton (which has no caption area at all); when
   the first image arrived, the caption editor appeared but its
   fill-in logic only ran when the caption TEXT changed — so it stayed
   empty until a reload remounted the panel. The editor now re-seeds on
   every render (safe — it never overwrites your typing). Plus a safety
   net: if the AI generates an image but delivers the caption the
   old-style way (as chat text) instead of through the post card, that
   text is automatically promoted into the canvas caption. Test:
   Instagram pill → image post → open preview WHILE the image renders →
   caption must be there the moment the image lands, no reload needed.
2. **Image model upgraded: gpt-image-1 → gpt-image-2.** The "no hands"
   audit found we were two generations behind — your OpenAI key has
   gpt-image-2 (April 2026). Both endpoints were live-verified with our
   exact parameters before switching. Roll back anytime by setting
   OPENAI_IMAGE_MODEL=gpt-image-1 on Railway (no deploy needed).
   Note: anatomy glitches can still happen on ANY model — if a specific
   image has one, hit regenerate; but the rate should drop sharply.
3. **Scripts now actually follow the master guide.** The submit_script
   tool's own description still asked for the OLD format ("spoken script
   with direction notes") and was overriding the guide — your example
   reel (plain lines + "Direction:" note) is exactly that old format.
   Now the tool description defers to the guide.

**How to test a script against the master guide (60-second check):**
- Shape: **HOOK** (with [VISUAL: …] and [TEXT ON SCREEN: …]) → **BODY**
  (one sentence per line, [B-ROLL]/[CUT] cues) → **CTA** →
  --- PRODUCTION NOTES --- (delivery marks, captions style, music,
  B-roll list). If it's plain paragraphs with a "Direction:" line at the
  end, it's the OLD format — report it.
- Hook: first line ≤12 words, no greeting/intro, specific (a number or
  named thing beats a vague claim).
- Length: ~2.5 words/second — a 60s reel should be 140-170 words of
  spoken text; 30s ≈ 70-90.
- Sound: read it aloud — short sentences, "you", contractions; beats
  connected by "but"/"so", never "and then".
- Bans: no "Hey guys", no "In today's world", no "unlock/leverage/
  game-changing" AI-speak, no spoken "like and follow" ending.
- Ending: last line twists or loops back to the first line — never
  "thanks for watching".
- YouTube long-form instead: # title + payoff map + [CHAPTER] sections
  with hook-style titles + bridge ending to a named next video.

### Round 11 — image timeouts, honest progress UX, LinkedIn 422 (2026-07-20)

**What shipped, in plain words:**

1. **Images no longer die at 2 minutes.** The stuck "Generating slide
   1…" was a timeout chain: gpt-image-2 at high quality can take over 2
   minutes, and BOTH our server cap and the browser cap were exactly
   120s — the request was killed mid-render ("TimeoutError: signal
   timed out" in your console). Server now allows 180s for OpenAI (then
   still falls back to Gemini), browser allows 300s.
2. **Failures are never silent anymore.** If an image still fails after
   all that, you now get a clear chat message saying what happened
   ("took too long and timed out") and how to retry — instead of a
   forever-spinner or a caption-only post with no explanation. In AI
   CEO, plain image requests also show a loading panel the whole time
   they render (that path previously had no progress UI at all).
3. **The AI stops claiming a rendering image is "done."** Both tabs'
   prompts now force in-progress phrasing — "Generating your image now,
   it'll appear in the canvas in a minute" — never "your image is
   ready" while the panel is still empty.
4. **LinkedIn 422 fixed.** Your "XAI API error (422) … ToolChoice"
   came from the LinkedIn writer's forced tool call: its tool_choice
   object was missing the type field. Claude tolerated it, but when a
   turn fell back to the Grok provider, xAI rejected the request.
   Fixed at both call sites plus a normalization guard in the
   transport so no future caller can hit it.

**Test:** Instagram pill → "generate me a single image post" → caption
card + preview open while the image renders (up to ~3 min) → image lands
next to the caption. Kill your network mid-generation → you should get
the ⚠️ failure message, not a stuck spinner. LinkedIn pill → generate a
single-image post → no 422, post text arrives via the normal preview.

### Round 12 — image-wait UI everywhere + founder on middle slides (2026-07-20)

**What shipped, in plain words:**

1. **Visible "Generating image…" everywhere an image can render.** The
   remaining blind spot was adding an image to an existing LinkedIn
   TEXT post (both tabs): the preview showed nothing at all while the
   image rendered — the media area now shows a "Generating image… this
   can take a minute or two" placeholder where the image will land.
   Plain image requests in AI CEO already open a loading panel (Round
   11); Content chat already shows pending placeholders. Test: open a
   LinkedIn text post → Generate Image → the gray generating box appears
   immediately in the post preview, image replaces it when done.
2. **Founder photo threads through carousel middle slides.** EVERY
   middle slide now carries a very subtle founder profile chip (~64px
   circular avatar, footer row, same spot each slide — like the
   poster's avatar on a feed), and the center middle slide (plus a
   second on 9+ decks) gets a slightly more prominent ~140px portrait.
   Hook/CTA keep their prominent treatment. Exact likeness + natural
   skin rules apply; if no founder photos are set in Brand DNA the
   chip is omitted entirely (never an invented face). Applies to
   LinkedIn and Instagram carousels from every path. Test: 7-slide
   carousel → small avatar chip bottom-left on slides 2-6, larger one
   on slide 4.

## If you find a problem

Capture it like prompt.md: what you typed, what happened, what you
expected (a screenshot of the console `[prompt]` line helps). Flip the
flag to '0' and note whether legacy behaves differently. That's exactly
the evidence that lets me fix it in one pass.
