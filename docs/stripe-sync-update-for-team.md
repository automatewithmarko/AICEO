# Stripe Integration Update — Team Note

For the AICEO team. Summary of what changed and what to tell customers.

---

## What's new

Stripe now syncs **both ways** with AICEO Products.

| Direction | Before | After |
|---|---|---|
| AICEO → Stripe | Already worked. Products created in AICEO appear in Stripe. | Same — no change. |
| Stripe → AICEO | **Did not work.** Products in Stripe stayed invisible to AICEO. | **Now works.** Stripe products + prices + payment links flow into AICEO Products tab. |

So when a customer asks *"if I create a product in Stripe, will it show up in AICEO?"* — the answer is now **yes**.

## What customers need to do

Two small one-time updates in their Stripe Dashboard. Send them `docs/stripe-sync-update-for-users.md` — it's the step-by-step.

The short version:

1. **Edit their existing Stripe webhook endpoint** to subscribe to the new product/price events.
2. **No AICEO reconnect needed.** Their API key already has the right permissions (if they've ever successfully created a product in AICEO with Stripe selected).

## Who's affected

- **Existing customers using Stripe** — they need the webhook update. Sales gets to push this as a free product improvement: "your existing Stripe catalog now imports into AICEO automatically."
- **New customers** — they'll be guided to subscribe to the right events when they connect Stripe for the first time. No friction.
- **Customers not using Stripe** — nothing to do.

## What it unlocks for them

- They can keep managing their product catalog in Stripe if they want, and AICEO sees everything.
- Edits in Stripe (rename a product, change a price, archive an offer) sync to AICEO in seconds via webhook.
- They no longer have to recreate their entire catalog inside AICEO to use the platform.

## Customer FAQ — short answers

**"Do I have to disconnect Stripe and reconnect?"**
No. Just edit the existing webhook in Stripe and tick the new events.

**"What if I had products in Stripe before connecting?"**
Run a sync from Settings → Integrations → Stripe → Sync, or wait — the next scheduled sync picks them up automatically.

**"If I delete a product from Stripe, does it delete from AICEO?"**
Yes (or if you archive it in Stripe, it's removed from AICEO's product list).

**"If I edit a product in AICEO, will Stripe update?"**
Yes — that direction already worked. The name and description sync.

**"Do I need a paid Stripe plan?"**
No. All Stripe accounts have webhooks and API access. The Stripe-side feature isn't gated by plan.

**"Will this break my existing payment links?"**
No. Existing payment links keep working. The sync only reads from Stripe and updates AICEO — it doesn't touch live links.

## How to verify it's working

After a customer updates their Stripe webhook:

1. Have them create a test product in Stripe (Dashboard → Products → Add product, with at least one price).
2. Within 5–10 seconds, the product should appear in their AICEO Products tab.
3. If it doesn't, check the Railway logs filtered to their userId — `[stripe]` and `[webhook/stripe]` lines will show what happened.

For an internal end-to-end test without a real customer, use:
```
node backend/scripts/smoke-stripe-webhook.js --url <backend> --user <uuid> --type product.created --product-id <real-prod-id>
```
(see the script header for full args).

## What we documented

- **For us:** `docs/Stripe_permissions.md` — full list of API key scopes and webhook events with explanations.
- **For customers:** `docs/stripe-sync-update-for-users.md` — the 2-minute walkthrough they can follow themselves.
- **This file:** the team's quick-reference cheat sheet.
