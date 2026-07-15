# Unified Backend — Testing Guide (all phases)

> For the founder. One file, updated with every phase. Simple language,
> user-experience level. Work top to bottom; each phase has its own
> checklist. Technical background lives in
> `docs/unified-content-backend-plan.md` — this file is only about WHAT
> shipped and HOW to test it by hand.

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
   - Note: the post now appears in one go rather than word-by-word
     (deliberate trade for reliability).
3. **Edits on the post.** With the post on screen, say "make it shorter".
   The existing post should be rewritten IN PLACE (images kept, preview
   updates). Say "add an image" → it should generate/attach without
   rewriting your text. Then try "actually scrap this, write a new post
   about X" → THAT should restart the generation flow.
4. **Carousel.** Ask for a LinkedIn carousel. Expect: up to 3 discovery
   questions → a PLAN CARD (hook, slides, design palette, caption) →
   nothing generates until you click Approve. Check the caption is
   substantial (LinkedIn caption = the post itself, 150-450 words), 7-12
   slides, hook slide + CTA slide.
5. **"No questions" escape hatches.** Say "write a LinkedIn post about
   pricing mistakes, framework style, no questions" — it should skip
   discovery and go straight to generation.
6. **Outlier template copy.** Attach an outlier post/creator link, ask for
   a post based on it — wording/structure should mirror the template
   closely (this mode may legitimately use em dashes/hashtags if the
   template does).

### Test checklist — Instagram (Content tab, Instagram platform)

7. **Single post:** ask for an IG post → discovery (Single/Carousel/
   Story) → ONE square image + caption in the preview.
8. **Story:** ask for a story → 3-4 vertical frames generate.
9. **Reel:** ask for a reel → a SCRIPT as text (spoken words, "Direction:"
   note at the end). NO images must generate. No [HOOK]/[SCENE] labels.
10. **Carousel:** plan card → approve → slides (5-9, square).

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

## If you find a problem

Capture it like prompt.md: what you typed, what happened, what you
expected (a screenshot of the console `[prompt]` line helps). Flip the
flag to '0' and note whether legacy behaves differently. That's exactly
the evidence that lets me fix it in one pass.
