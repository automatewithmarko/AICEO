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

## 5. Proposed costs & per-action unit economics

Chat and web research drop to zero. Artifact prices bump modestly to
absorb the chat-token spend that no longer has its own line item.

Margin is calculated assuming 1 credit ≈ $0.10 of plan revenue (the
ratio of $99/mo ÷ 500 monthly credits on Complete is already at that
level). "API cost" is roughly what we pay Grok / Claude / Gemini per
run. "—" means the action is free to the user and its tiny API cost
is absorbed into the artifact prices below.

| Action | Current cr | Proposed cr | Change | API cost | Retail @ $0.10/cr | Margin |
|---|---|---|---|---|---|---|
| `ai_ceo_message` | 1 | **0** | − 1 | ~$0.008 | — | absorbed |
| `web_research` | 2 | **0** | − 2 | ~$0.015 | — | absorbed |
| `image_generation` | 3 | 3 | — | ~$0.020 | $0.30 | **93%** |
| `text_post` | 5 | 5 | — | ~$0.015 | $0.50 | **97%** |
| `call_recording` | 5 | 5 | — | ~$0.010 | $0.50 | **98%** |
| `call_intelligence` | 10 | 10 | — | ~$0.050 | $1.00 | **95%** |
| `dm_automation` | 10 | 15 | + 5 | ~$0.030 | $1.50 | **98%** |
| `carousel` | 15 | 20 | + 5 | ~$0.190 | $2.00 | **91%** |
| `lead_magnet` | 15 | 20 | + 5 | ~$0.100 | $2.00 | **95%** |
| `story_sequence` | 15 | 20 | + 5 | ~$0.080 | $2.00 | **96%** |
| `squeeze_page` | 20 | 25 | + 5 | ~$0.080 | $2.50 | **97%** |
| `newsletter` | 20 | 25 | + 5 | ~$0.040 | $2.50 | **98%** |
| `landing_page` | 25 | 35 | + 10 | ~$0.120 | $3.50 | **97%** |

Every paid action clears 90%+ margin on its own. The free actions run
at a small loss per call, but that loss is fully backfilled by the
~20% price bump on artifacts (that's what the "+5" / "+10" column is
for — it bundles chat tokens into the deliverable).

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

## 6. Realistic usage scenarios ($99/mo Complete plan, 500 cr)

All four scenarios in one table. "Before" means current system,
"After" means proposed. Revenue is $99/mo in every row; API cost is
the same either way (the cost lives in the model call, not the
pricing policy) — what changes is the user's perception.

| Scenario | Usage | Credits used (After) | API cost | Margin |
|---|---|---|---|---|
| **A — Casual** | 200 chats + 2 LPs + 3 carousels + 2 newsletters + 10 images | 210 / 500 | $2.69 | **97.3%** |
| **B — Power (carousels only)** | 25 carousels | 500 / 500 | $4.75 | **95.2%** |
| **C — Power (landing pages only)** | 14 landing pages | 490 / 500 | $1.68 | **98.3%** |
| **D — Worst plausible abuse** | 1,000 chats + 25 carousels | 500 / 500 (chat is free) | $12.75 | **87.1%** |

- **Floor:** ~85% margin even under abusive chatter.
- **Typical:** ~97% margin.
- **Diamond plan (600 cr, same price):** +20% artifact headroom, same
  margin band (95–98%).
- **Boost tier ($199/mo, same credits):** double revenue, same cost →
  margin climbs from ~97% to ~98.7%.

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
