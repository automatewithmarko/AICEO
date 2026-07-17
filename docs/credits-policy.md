# AICEO Credits — What Costs Credits and What Doesn't

> Plain-language policy. Safe to share with clients. Last updated
> 2026-07-17.

## The principle

**Talking and planning are free. Creating is what costs credits.**

The real service of the platform is the content it produces — images,
carousel slides, and the assets built from them. Conversation with the
AI (in any tab) and building content plans never cost anything.

## Free — always

| What | Where |
|---|---|
| Chatting with the AI | AI CEO tab, Content tab — every message |
| Discovery questions and answers | all tabs |
| Content PLANS (the day-by-day plan card) | AI CEO tab, Content tab |
| Text-only deliverables (LinkedIn/X posts, reel scripts, YouTube scripts, emails, captions) | all tabs |
| Editing text ("make it shorter", caption edits) | all tabs |

## Costs credits

| What | Cost |
|---|---|
| One generated image (single post image, story frame, cover image) | 1 image credit |
| One carousel slide | 1 image credit per slide that is **successfully delivered** |

That's it. A 7-slide carousel costs 7 image credits. A single-image post
costs 1. A "Generate content" run on a 7-day plan costs exactly the
images/slides it produces — the plan itself and all the writing are free.

## Fairness rules built into the system

- **You pay for what you get.** Carousel slides are charged only when
  the slide is actually generated and delivered. If a slide fails (and
  the system's automatic retries fail too), you are not charged for it.
- **Runs stop when the balance is empty.** If credits run out in the
  middle of a carousel or a plan run, the remaining work pauses and the
  app tells you — top up and hit retry/resume to continue exactly where
  it stopped. Nothing already delivered is lost.
- **Closing the tab stops the meter.** If you close the page
  mid-generation, the system stops the work instead of billing in the
  background.

## For the team (implementation notes — not client-facing)

- Enforced in code as of 2026-07-17: `/api/orchestrate` and
  `/api/orchestrate/plan-item` use `requireActiveAccount()` (no debit;
  disputed-chargeback hold still applies). `/api/content-orchestrate`
  was already free. `/api/generate/image` debits 1 per call;
  `/api/generate/carousel` debits **on success per slide** (never per
  attempt/retry) and pre-checks the balance before each slide.
- If pricing ever changes, change it in these gates and update THIS file
  — it is the single statement of billing policy.
