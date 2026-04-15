# Landing Page Conversion Playbook

*What our landing-page agent needs to produce to actually convert — the direct-response school, not the corporate SaaS school.*

---

## 1. The gap we're closing

The current landing-page agent (`backend/agents/landing-page.js`) is tuned for a **"$10k agency" visual standard** — Stripe, Linear, Reddit Business. That aesthetic is *prestige design*: minimal, polished, breathing room, subtle gradients, one hero, a features grid, a CTA.

That's the wrong playbook for our users. Our users are coaches, consultants, course creators, SMB operators selling offers in the $97–$50,000 range. Their buyers don't convert on prestige. They convert on **direct-response mechanics**:

- A person talking to the camera promising a specific outcome.
- Story-driven long scroll that pulls the reader through an emotional arc.
- Testimonials *everywhere*, not tucked in one section.
- Stacked offers with price anchoring.
- Scarcity, guarantees, and urgency as first-class citizens.
- Typography that looks like it was made by a marketer in a weekend, not an agency in six weeks.

Reference brands and people our users want to mimic: **Alex Hormozi (acquisition.com), Russell Brunson (ClickFunnels / Funnel Hacking Live), Dan Kennedy, Dan Henry, Jason Wojo, Tai Lopez.**

These pages look "ugly" by Figma standards. They print money.

---

## 2. Two landing-page schools — pick one up front

| | **Corporate SaaS** (current default) | **Direct Response** (what we need) |
|---|---|---|
| Typical use | SaaS product, B2B platform, agency website, technical tool | Coaching offer, course, info product, service, challenge, webinar, mastermind, community, high-ticket offer |
| Feel | Sleek, quiet, breathing room, refined | Loud, crowded, urgent, friend-to-friend |
| Hero | Product screenshot or illustration + headline | **VSL (Video Sales Letter)** or big bold hook + first frame from the video |
| Length | 1.5–3 screens | 8–20 screens (long scroll is a FEATURE, not a bug) |
| Typography | Single premium font (Inter, Plus Jakarta), uniform weights | **Multiple fonts, mixed weights, highlighter backgrounds, handwritten accents, hand-drawn arrows** |
| Colors | Brand palette, subtle | **High contrast — usually yellow/red highlighter on black or white, red CTA buttons, yellow accents** |
| CTA | "Get Started", "Book a Demo", "Start Free Trial" | "**YES — I Want the [SPECIFIC OUTCOME]**" with subtext: "Get instant access", "Start in 60 seconds" |
| Social proof | Logo bar + 3–6 testimonial cards | **Testimonials interleaved between EVERY major section** — video testimonials, text quotes, screenshots of DMs, revenue screenshots |
| Urgency | None | Countdown timer, seat count, "Bonus expires in 72 hours" |
| Price | Three-tier pricing table | **Single offer, stacked bonuses, total value anchored ($4,997 value → $497 today)** |

### When the agent should pick DR vs SaaS

The agent should ask *one early routing question* before the normal 4 discovery questions, or infer from the CTA/audience answer:

- CTA is "Book a call", "Apply for a mastermind", "Get the course", "Join the challenge", "Register for the webinar", "Download the PDF" → **Direct Response**
- CTA is "Start free trial", "See a demo", "Sign up", "Get an account" → **Corporate SaaS**
- When unclear, default to **Direct Response** for our user base.

---

## 3. The psychology engine (why DR works)

Every section on a DR page pulls one of seven psychological levers. The agent must know which lever each section is for:

| Lever | What it does | Where it shows up |
|---|---|---|
| **Pattern interrupt** | Stops scroll, earns the next 3 seconds | Hero headline, VSL thumbnail, opening hook |
| **Pain recognition** | "Finally, someone who gets it" | "If you've ever…" bullets, story opener, problem agitation |
| **Aspiration** | Paints the specific after-state | "Imagine waking up to…" / outcome bullets / dream-state imagery |
| **Proof** | Kills skepticism | Testimonials, case studies, screenshots, numbers, logos, media mentions |
| **Mechanism** | Explains *why* this works | "Here's the system / the 3-step method / the framework" |
| **Risk reversal** | Removes the cost of trying | Money-back guarantee, "try it for 30 days", "if it doesn't work, keep everything" |
| **Urgency / scarcity** | Forces a decision now | Countdown, limited seats, price increase, bonus expiry |

**Rule:** every section justifies itself by naming the lever it pulls. If a section doesn't pull a lever, delete it.

---

## 4. Direct-response page anatomy (the sections, in order)

Long scroll is intentional. Each stage is a checkpoint where a skeptical reader either commits or bounces — we want enough surface area to move every reader type through.

```
[SECTION:pre-header]            — scarcity bar
[SECTION:hero]                  — VSL + hook headline + sub-hook + CTA #1
[SECTION:social-proof-1]        — media logos / client logos / "as seen in"
[SECTION:pain-agitation]        — "this is for you if…" bullets
[SECTION:story]                 — founder story / "I was where you are"
[SECTION:dream-state]           — "imagine if…" outcome painting
[SECTION:mechanism]             — "here's how it works" (the unique method)
[SECTION:proof-1]               — testimonials block 1 (3–6 text quotes)
[SECTION:offer]                 — the offer stack with anchored pricing
[SECTION:bonuses]               — bonus stack (visual bonus boxes)
[SECTION:proof-2]               — testimonials block 2 (video testimonials / case studies)
[SECTION:guarantee]             — money-back guarantee / risk reversal
[SECTION:about]                 — credibility / who is the founder
[SECTION:faq]                   — objection handling
[SECTION:proof-3]               — testimonials block 3 (DM screenshots / revenue screenshots / results)
[SECTION:final-cta]             — hook re-asserted + CTA #2 + urgency re-asserted
[SECTION:ps]                    — "P.S." recap (like a sales letter)
[SECTION:footer]                — contact, legal, disclaimers
```

**Critical patterns:**
- CTA repeats **at least 5 times** down the page, with at least 3 visual variations (big button, text link, arrow + button, etc.).
- Testimonials appear in at least **three separate blocks**, not consolidated into one.
- Every paragraph is 1–2 sentences. No walls of text.

---

## 5. Copy playbook — patterns that convert

### 5.1 Hero headline

Formula: **[Specific outcome] + [Timeframe] + [Without major objection]**

- ❌ "Grow Your Business with Our Platform"
- ✅ "How to **Add $10K/Month** to Your Coaching Business **in 90 Days** — Without Running Ads or Making Videos"
- ✅ "The Exact System We Used to **Book 47 Sales Calls in 14 Days** Using LinkedIn Messages"

**Formatting:** bold the outcome and timeframe. Use yellow highlighter CSS on the key phrase. Never a centered, thin, elegant headline — DR headlines feel **typed with conviction**.

### 5.2 Sub-hook (below headline)

One sentence that:
1. Names the audience ("For coaches, consultants, and agency owners")
2. Collapses the objection ("even if you hate sales calls and have zero audience")
3. Hints at the mechanism ("using our 3-step Client Attraction System")

### 5.3 Pain agitation — "this is for you if"

A bulleted list of **7–12** very specific pain statements. The reader should be nodding by bullet 3. Pattern:

> This page is for you if…
> - You're tired of posting content that gets crickets
> - You've tried 3 different coaching programs and none gave you a client
> - You close a call and then they ghost you on the follow-up
> - [...]

**Rule:** these bullets must be written in the *audience's own language* — not "scale your operations" but "you're stuck at $5k and can't break past it".

### 5.4 The offer stack (the pricing section)

This is the highest-converting element on the page. Pattern:

```
Here's everything you get:

✓ The Core [Program/Course/Service]               ($1,997 value)
✓ Weekly Group Coaching Calls (12 weeks)           ($3,000 value)
✓ Private Community Access                         ($497 value)
✓ The [Specific Asset] Template Library            ($297 value)

── Bonus stack (for action-takers) ──
🎁 BONUS 1: [Name of bonus]                        ($497 value)
🎁 BONUS 2: [Name of bonus]                        ($297 value)
🎁 BONUS 3: [Name of bonus]                        ($197 value)

                      ──────
        Total value: $6,782
        Today: $497
        (or 3 payments of $197)
                      ──────

           [  YES — I WANT IN  ]
```

- **Strike through** the total value.
- Use a boxed, bordered container around the whole stack.
- Include a payment plan option when price > $200.
- Specific dollar values on every line item.

### 5.5 Guarantee

A **named** guarantee with a badge-style visual. Examples:
- "The 30-Day Results-Or-Refund Guarantee"
- "The Double-Your-Money-Back Promise"
- "The Try-It-Risk-Free-For-14-Days Guarantee"

Format: icon badge (shield, seal, ribbon), 2–3 sentences explaining, bold-font signature of founder.

### 5.6 P.S. section (end of page)

Mirrors the old-school sales letter convention. 2–3 PS lines that recap the urgency, outcome, and CTA:

> **P.S.** Just to recap: you get the full program, 12 weeks of coaching, the bonus stack (worth $6,782 total), and my personal guarantee — all for $497 today (or 3 payments of $197).
>
> **P.P.S.** The $497 price is only valid until Friday at midnight. After that it goes back to $997. Click below to lock it in.

---

## 6. Visual playbook — what makes DR pages *feel* DR

### 6.1 Typography

- **Mix 2–3 fonts.** A bold display (Anton, Oswald, Bebas Neue, or a clean bold sans) for headlines + a readable sans for body + an optional *handwritten* font (Caveat, Kalam, Permanent Marker, Shadows Into Light) for accents like "Act fast!", "← This is the one", "I'll explain this in the video ↓".
- **Never monotone weights.** Body 400, subheads 600, hero 800/900. Mix them aggressively.
- **Italicize and bold** specific words mid-sentence for scan-ability.

### 6.2 Highlighter emphasis (signature DR move)

```css
.hl-yellow {
  background: linear-gradient(transparent 60%, #ffe066 60%);
  padding: 0 4px;
}
.hl-red-underline {
  background: linear-gradient(transparent 92%, #e91a44 92%);
  padding: 0 2px;
}
```

Apply to 2–4 key phrases per headline. Never to whole sentences.

### 6.3 Handwritten / hand-drawn accents

- Yellow or red arrows pointing to the CTA — hand-drawn SVG, slightly crooked on purpose.
- "← This" or "↓ Watch this first" in a handwriting font next to key elements.
- Circles around testimonial stats drawn like a whiteboard marker.

### 6.4 Color contrast

DR pages are **high contrast**. A typical palette:
- Dominant background: clean white (#ffffff)
- Secondary background: soft cream (#fffaf0) or light peach for highlight sections
- Text: near-black (#1a1a1a)
- Primary CTA: **red-orange (#e84a3f) or bold green (#2bb673)** — never blue for primary CTA
- Accent / highlights: yellow (#ffe066), red (#dc2626)
- Section dividers: thick solid color blocks (full-bleed black strip with white text) for the **offer** and **guarantee** sections to stop the scroll

### 6.5 CTAs (buttons)

- **Size:** 20–24px font, 18–22px vertical padding, 36–48px horizontal padding. Bigger than anything else on the page.
- **Shape:** rounded (8–12px), not pill — pill feels SaaS.
- **Color:** red-orange or bright green.
- **Text:** first-person, outcome-oriented, with a sub-line:
  - "**YES — Give Me Access Now**"
  - small text below: "Secure checkout • Instant access • 30-day guarantee"
- **Always preceded by an arrow** (hand-drawn SVG pointing down or at the button).

### 6.6 Testimonials — everywhere

Three blocks minimum:

1. **After pain agitation** — 3 short text quotes in cards. Style: left-border red accent, italic quote, photo + name + result.
2. **After offer** — 2–3 longer case studies with a "before → after" revenue/outcome stat callout.
3. **Before final CTA** — 6–9 DM-screenshot-style testimonials OR a 3x3 grid of tiny avatars + 1-liner quotes.

For each testimonial include, when provided by the user:
- Real name, photo, role
- Specific outcome with number ("$23k in 60 days", "booked 11 calls in week 1")
- Date / timeframe
- Optional: video embed or screenshot of actual DM/revenue

**Never fabricate testimonials.** If the user has none, show `[Testimonial placeholder — add yours]` slots with clear annotation.

### 6.7 VSL (Video Sales Letter) hero

The DR hero is the VSL, not a product screenshot. Pattern:

- 16:9 video container, centered, max-width 900px.
- Prominent **play button overlay** (red triangle).
- "**WATCH THIS VIDEO FIRST** ↓" above.
- Caption below: "Turn sound on 🔊 • Plays automatically" (even if autoplay is off, the suggestion primes engagement).
- If the user has no VSL yet: embed a **placeholder** with a play button overlay on top of the hero image, and an annotation: `[Replace with VSL — loom.com / youtube.com unlisted URL]`.

### 6.8 Scarcity and urgency

- **Pre-header bar** (full-bleed, red/yellow background, black text): "🔥 Offer expires Friday at 11:59pm PT — Only 17 seats left"
- **Countdown timer** (pure CSS + the target date set in a data attribute) next to the CTA.
- **Inventory counter** ("Only 7 spots remaining in this cohort").
- **Price increase threat**: "Price increases to $997 on [date]".

---

## 7. New discovery questions (to expand AI CEO's flow)

To generate a real DR page we need more data than the current 4 questions. Here's the expanded flow AI CEO should run when the route is direct-response:

**Existing 4 (keep as-is):**
1. What's the offer? (product / service / program / course)
2. Who's the audience?
3. CTA — what should they do? (book call / buy / apply / register)
4. Tone (authoritative / friendly / contrarian / educational)

**New DR-specific questions (add 4 more, one at a time):**

5. **Specific outcome + timeframe.** "What's the specific result your buyer gets, and how fast?"
   *Options:* Open input — examples: "Add $10k/mo in 90 days", "Book 10 calls in 30 days", "Lose 15 lbs in 8 weeks"

6. **VSL status.** "Do you have a video sales letter for this offer?"
   *Options:* "Yes, I have a URL" / "No, use a placeholder" / "Skip the VSL, use a static hero"
   If "Yes" → collect URL.

7. **Price and value stack.** "What's the price and what's inside?"
   *Options:* Open input — prompt them to list each deliverable with an estimated dollar value so we can build the offer stack.

8. **Risk reversal.** "What's your guarantee?"
   *Options:* "30-day money-back" / "Results-or-refund" / "Double your money back" / "No guarantee" / Custom

9. **Scarcity mechanic.** "What's the urgency?"
   *Options:* "Countdown to a date" / "Limited seats (cohort)" / "Price increase on [date]" / "No urgency (evergreen)"

10. **Testimonials.** "Do you have real testimonials, DM screenshots, or revenue proof to include?"
    *Options:* "Yes, I'll paste them" / "Yes, but no data yet — use placeholders" / "No, skip testimonials section"

**Rule:** skip any question where the user already gave the answer in a prior turn. AI CEO should carry context and only ask what's missing.

---

## 8. Implementation plan

Concrete deltas to the codebase:

### 8.1 `backend/routes/orchestrate.js` (AI CEO prompt)

- Add a **routing question** after Q3 (CTA): if CTA is book-call / apply / buy / register / download → set internal flag `page_style: 'direct_response'`.
- Add Qs 5–10 above, gated on `page_style === 'direct_response'`.
- When delegating, prepend `PAGE STYLE: direct-response` to the `task_description` so the agent picks the right playbook.

### 8.2 `backend/agents/landing-page.js` (agent prompt)

- **Split the prompt** into two stylistic modes. Keep the current SaaS prompt intact as the "corporate" mode. Add a new "direct-response" mode block activated when `task_description` contains `PAGE STYLE: direct-response`.
- The DR mode block should specify the **exact section order** from §4 above, with section markers like `<!-- SECTION:pre-header -->`, `<!-- SECTION:pain-agitation -->`, `<!-- SECTION:offer -->`, `<!-- SECTION:bonuses -->`, `<!-- SECTION:guarantee -->`, `<!-- SECTION:ps -->`.
- Bake in the typography rules (§6.1), highlighter CSS (§6.2), CTA styling (§6.5), testimonial-everywhere rule (§6.6), VSL hero (§6.7), scarcity patterns (§6.8).
- Copy rules (§5): outcome-in-headline formula, pain bullets, offer stack, guarantee, PS.
- Keep the existing rules about:
  - Never fabricating testimonials.
  - {{GENERATE:…}} for hero, bonuses, founder.
  - Form embedding via `EMBED FORM: slug=…, title=…`.
  - Inline SVGs (no emoji as icons).

### 8.3 Example snippets the agent should embed

Provide the agent with pre-baked CSS snippets for:
- `.hl-yellow` / `.hl-red-underline`
- `.dr-cta` button (large red-orange, shadow, arrow prefix)
- `.dr-offer-stack` (bordered box with line items + strike-through total)
- `.dr-guarantee-badge` (seal / shield / ribbon)
- `.dr-countdown` (pure CSS countdown styling — JS is out of scope but structure supports future wiring)
- `.dr-pre-header` (full-bleed urgency bar)

These snippets are "reference implementations" the agent riffs on, not copy-paste templates — the agent still tailors colors/copy to the brand.

### 8.4 Edit mode stays as-is

Section-scoped edits (`FORMAT 3`) already work with section markers. The new DR sections just add to the valid marker list.

### 8.5 Testing heuristic

Before accepting a DR page as "good," these must all be true:
- [ ] ≥ 5 CTA instances on the page
- [ ] ≥ 3 separate testimonials blocks
- [ ] VSL hero (or placeholder) present
- [ ] Offer stack with strike-through total
- [ ] Named guarantee with badge visual
- [ ] Urgency element (countdown / seat count / price-increase warning)
- [ ] PS section at the end
- [ ] No phrase uses "leverage/synergy/utilize/paradigm"
- [ ] Every paragraph ≤ 2 sentences
- [ ] Highlighter emphasis on ≥ 2 key phrases in the hero headline

---

## 9. What this doesn't change

- **Form embedding** (`EMBED FORM: slug=…, title=…`) stays identical. The DR page just places the embed in the `offer` or `final-cta` section, inside a bordered "Apply now" container, instead of a dedicated form section.
- **Brand DNA usage** (colors, fonts, photos) still applies — DR pages still honor the user's brand palette, just with added DR-signature colors (yellow highlighter, red CTAs) if the brand doesn't already specify them.
- **The SaaS / corporate agent** stays available for users who genuinely want that aesthetic (tech products, B2B platforms). Route on intent, not opinion.

---

## 10. Next steps (if you want me to ship this)

Once you approve the playbook, the concrete implementation work is:

1. **Update the AI CEO prompt** in `orchestrate.js` with routing + extra questions (§8.1) — ~40 lines.
2. **Add the direct-response mode** to `agents/landing-page.js` (§8.2) — ~200 lines of new prompt content that lives beside the existing SaaS rules, gated on the `PAGE STYLE:` marker.
3. **Bake in the CSS snippet library** (§8.3) — roughly 150 lines of reference CSS the agent is told to riff on.
4. **Smoke test** with one of the reference URLs in `temp.md` — generate a landing page for "a $997 coaching program for agency owners, CTA book a call, 30-day guarantee" and score against §8.5.

Estimated: 1 focused session to land all three prompt updates; validation depends on a few test runs.
