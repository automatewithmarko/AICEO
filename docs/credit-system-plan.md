# AI CEO — Credit System Improvement

**For the client.** A plan for how credits should be spent so that
users never feel "nickel-and-dimed" for simple chats, while the
business nets ≥70% margin on every realistic usage pattern.

Numbers here are pulled live from the `plans` and `credit_costs`
tables on the production Supabase — nothing invented.

---

## 1. What users see today (the problem)

Every AI CEO chat message **costs 1 credit**. The moment a user types
a casual "what should I focus on today?", the credit counter ticks
down. The AI CEO is a chat window — visually in the same category as
ChatGPT, which is free. So the user's instinct is:

> "Why am I paying per sentence? I could've asked ChatGPT for free."

This is the single most damaging perception the product can create.
Users who feel metered on every sentence will churn in week one,
before they ever produce an artifact worth paying for.

---

## 2. Your current packages (live from Supabase)

| Plan | Setup fee | Monthly (standard) | Monthly (with Boost) | Credits/mo |
|---|---|---|---|---|
| **The Complete Platform** (`complete`) | $1,999 | $99 | $199 | 500 |
| **Run Your Business From One Platform** (`diamond`) | $2,999 | $99 | $199 | 600 |

**No changes to pricing, setup fees, plan names, features, or monthly
credit allocations.** All of that stays exactly as-is. The only thing
that changes is **what a credit buys**.

---

## 3. Your current credit costs (what the app charges today)

| Action | Credits |
|---|---|
| `ai_ceo_message` | **1** ← the one that feels like a meter |
| `web_research` | 2 |
| `image_generation` | 3 |
| `text_post` | 5 |
| `call_recording` | 5 |
| `call_intelligence` | 10 |
| `dm_automation` | 10 |
| `carousel` | 15 |
| `lead_magnet` | 15 |
| `story_sequence` | 15 |
| `squeeze_page` | 20 |
| `newsletter` | 20 |
| `landing_page` | 25 |

---

## 4. The change in one sentence

> **Stop charging for the conversation. Charge for the output.**

Users should chat with the AI CEO as much as they want without
watching a number tick down. Credits only get spent when the AI
produces a **real asset** — a landing page, a carousel, a newsletter,
a DM sequence, etc.

This maps directly to how users think about value:
> "I paid for a landing page" feels fair.
> "I paid to ask a question" feels like theft.

---

## 5. Proposed credit costs (what we reseed the table with)

Chat drops to zero. Web research drops to zero (rate-limited behind
the scenes). Artifact prices bump modestly to absorb the chat-token
spend that no longer has its own line item.

| Action | Current | Proposed | Change |
|---|---|---|---|
| `ai_ceo_message` | 1 | **0** | − 1 |
| `web_research` | 2 | **0** | − 2 |
| `image_generation` | 3 | 3 | — |
| `text_post` | 5 | 5 | — |
| `call_recording` | 5 | 5 | — |
| `call_intelligence` | 10 | 10 | — |
| `dm_automation` | 10 | 15 | + 5 |
| `carousel` | 15 | 20 | + 5 |
| `lead_magnet` | 15 | 20 | + 5 |
| `story_sequence` | 15 | 20 | + 5 |
| `squeeze_page` | 20 | 25 | + 5 |
| `newsletter` | 20 | 25 | + 5 |
| `landing_page` | 25 | 35 | + 10 |

The bumps are small in absolute terms and the artifacts still land at
round, memorable numbers.

### How this looks to the Complete user (500 credits/month)

| They can produce | Today | After |
|---|---|---|
| Landing pages (if nothing else) | 20 | 14 |
| Carousels (if nothing else) | 33 | 25 |
| Newsletters (if nothing else) | 25 | 20 |
| Chat messages (on top of all the above) | **Costs credits** | **Unlimited, free** |

The "slightly fewer artifacts" line is more than paid for by
**unlimited chat** — which is what users feel every day.

---

## 6. Unit economics — before vs after

### Real API cost per action (roughly what we pay the LLM providers)

| Item | Cost |
|---|---|
| Chat turn (AI CEO, Grok) | ~$0.008 |
| Web research turn | ~$0.015 |
| One image | ~$0.02 |
| Text post | ~$0.015 |
| Call intelligence | ~$0.05 |
| DM automation | ~$0.03 |
| Newsletter HTML | ~$0.04 |
| Squeeze page | ~$0.08 |
| Lead magnet PDF | ~$0.10 |
| Story sequence (text + images) | ~$0.08 |
| Landing page | ~$0.12 |
| Carousel (plan + 8 slides) | ~$0.19 |

### Scenario A — casual user on Complete ($99/mo)

200 chat messages + 2 landing pages + 3 carousels + 2 newsletters +
10 one-off images.

|  | Before | After |
|---|---|---|
| Credits used | 200 + 50 + 45 + 40 + 30 = **365** / 500 | 0 + 70 + 60 + 50 + 30 = **210** / 500 |
| Real API cost | $1.60 + $0.24 + $0.57 + $0.08 + $0.20 = **$2.69** | Same: **$2.69** |
| Revenue | $99 | $99 |
| **Margin** | **97.3%** | **97.3%** |
| User feels | "I burned 40% of my credits just chatting" | "I chatted all day for free AND have 7 finished assets" |

Margin is identical (cost to us is the same either way). What
changes is the user's **willingness to continue**.

### Scenario B — power user on Complete, max artifacts only

Burns every credit on carousels: 500 / 20 = **25 carousels/mo**.

| | Value |
|---|---|
| Real API cost | 25 × $0.19 = **$4.75** |
| Revenue | $99 |
| **Margin** | **95.2%** |

### Scenario C — power user on Complete, max landing pages

Burns every credit on landing pages: 500 / 35 = **14 landing pages/mo**.

| | Value |
|---|---|
| Real API cost | 14 × $0.12 = **$1.68** |
| Revenue | $99 |
| **Margin** | **98.3%** |

### Scenario D — worst plausible abuse

Heavy chatter (1,000 messages/mo = $8 API) + max carousels on top
(25 × $0.19 = $4.75).

| | Value |
|---|---|
| Real API cost | **$12.75** |
| Revenue | $99 |
| **Margin** | **87.1%** |

Every realistic usage pattern clears 70% by a wide margin. The
floor is ~85% and the typical case is ~97%.

### Diamond plan ($99/mo, 600 credits) behaves the same, slightly roomier

Same math, +20% more artifact headroom. Margins land in the same
95–98% band.

### Boost tier ($199/mo) doubles the revenue on identical cost, so

pushes margin from ~97% to ~98.7% for the same output.

---

## 7. What users see in the app

Three small UI changes, no new pages:

1. **Every "Generate" button shows its cost** — e.g.
   `Generate landing page — 35 credits`. Users consent before
   spending. No surprise deductions.
2. **If a generation fails**, credits auto-refund. A toast says
   *"That didn't turn out right — credits refunded."* Shows up in the
   existing transaction log.
3. **Chat stays silent.** No credit counter decrements while the user
   is chatting, ever.

No new dashboards, no new plan tiers, no new add-on packs.

---

## 8. What actually changes in the code

Four small changes, no schema migrations:

1. Remove the "charge per chat" line on the orchestrate endpoint
   (`backend/routes/orchestrate.js:645`).
2. Inside the agent-delegation handler, deduct credits **after** an
   agent successfully returns an artifact, keyed by artifact type.
3. Wrap that deduction in try/catch; on failure, auto-refund via the
   existing `addCredits(... 'refund_failure')` helper.
4. Run `UPDATE credit_costs SET cost = <new>` in Supabase for each
   row in Section 5.

No new tables. No new plans. No new billing logic.

---

## 9. Summary

| | Before | After |
|---|---|---|
| Chat message | 1 credit each | **Free** |
| Web research | 2 credits each | **Free** |
| Every artifact | Has a price | Has a (slightly higher) price |
| Complete plan: $99 + $1,999 setup, 500 cr | **Unchanged** | **Unchanged** |
| Diamond plan: $99 + $2,999 setup, 600 cr | **Unchanged** | **Unchanged** |
| User perception | "Metered like a taxi" | "Buying finished deliverables" |
| Margin (realistic mix) | ~97% | ~97% |
| Margin (worst case) | at risk if user feels robbed and churns before ever producing an artifact | **≥85%** and user stays past month one |

The business keeps the same pricing page, the same plans, the same
revenue per user — and stops bleeding month-one users who compared
the chat meter to free ChatGPT.
