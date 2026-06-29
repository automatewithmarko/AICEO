# Stripe — Required Permissions & Webhook Events

> Hand this to clients before they connect Stripe to AICEO. Two parts:
> (1) what their **API key** needs access to, and (2) which **webhook
> events** they should subscribe to in their Stripe Dashboard.

---

## Part 1 — API Key

In Stripe Dashboard → **Developers → API keys**, the user creates either:

- **A Secret key** (`sk_live_...` or `sk_test_...`) — full account access. Simplest. **Recommended for most users.**
- **A Restricted key** — granular per-resource permissions. Use this if the client requires least-privilege access.

### If using a Restricted key, grant these resources

AICEO calls these Stripe APIs:

| Stripe resource    | Permission | Why                                                  |
|--------------------|------------|------------------------------------------------------|
| **Balance**        | Read       | Validate the key works when connecting               |
| **Charges**        | Read       | Sync historical payments for revenue analytics       |
| **Customers**      | Read       | Sync customer list for the CRM                       |
| **Subscriptions**  | Read       | Sync active recurring revenue                        |
| **Products**       | Read + Write | Read: import client's existing Stripe catalog into AICEO. Write: create products when the client uses AICEO's Products tab with Stripe selected as processor |
| **Prices**         | Read + Write | Same as Products — read for import, write for AICEO-created products |
| **Payment Links**  | Read + Write | Same — read for import, write for AICEO-generated checkout links |
| **Webhook Endpoints** | Read    | Optional. Lets AICEO verify the webhook is configured |

Without **Products / Prices / Payment Links write**, creating a new
product in AICEO with Stripe selected as the payment processor will
fail.

Without **Products / Prices read**, AICEO can't import the client's
existing Stripe catalog — they'd have to recreate everything.

---

## Part 2 — Webhook Events

In Stripe Dashboard → **Developers → Webhooks → Add endpoint**, the
user pastes the webhook URL AICEO gives them on connect:

```
https://<aiceo-backend>/api/webhooks/stripe/<their-user-id>
```

Then they pick which events to send. Below is the complete list,
grouped by what they unlock in AICEO.

---

### 🛒 Product catalog sync (bidirectional Stripe ↔ AICEO)

Subscribe to these so changes the client makes directly in Stripe
(adding a product, editing a price, archiving an offer) flow into
AICEO automatically.

| Event | Why You Need It |
|---|---|
| `product.created` | New Stripe product appears in AICEO Products tab |
| `product.updated` | Renaming/editing in Stripe updates AICEO |
| `product.deleted` | Archived Stripe product marked inactive in AICEO |
| `price.created` | New price tier becomes available in AICEO |
| `price.updated` | Price changes (active/inactive, metadata) sync |
| `price.deleted` | Removed prices clean up in AICEO |
| `payment_link.created` | New checkout link auto-imports |
| `payment_link.updated` | Active/inactive status syncs |

---

### 💳 Subscriptions

| Event | Why You Need It |
|---|---|
| `customer.subscription.created` | User successfully subscribed |
| `customer.subscription.updated` | Plan changed, quantity updated |
| `customer.subscription.deleted` | Subscription cancelled |
| `customer.subscription.trial_will_end` | Trial ending in 3 days — send reminder |
| `invoice.payment_succeeded` | Recurring payment went through |
| `invoice.payment_failed` | Payment failed — notify user, retry logic |

---

### 🔼 Top-ups (adding credit to a balance)

| Event | Why You Need It |
|---|---|
| `topup.created` | Top-up initiated |
| `topup.succeeded` | Credit added successfully |
| `topup.failed` | Top-up failed — notify user |
| `topup.reversed` | Top-up was reversed |

---

### ⏱ Pay-as-you-go (usage-based billing)

| Event | Why You Need It |
|---|---|
| `invoice.created` | Invoice generated based on usage |
| `invoice.finalized` | Invoice locked in — no more changes |
| `invoice.payment_succeeded` | Usage payment collected |
| `invoice.payment_failed` | Payment failed — handle access/retry |
| `customer.subscription.updated` | Usage limits or thresholds changed |

---

### 🔔 Universal — recommended for ALL billing models

| Event | Why You Need It |
|---|---|
| `payment_intent.succeeded` | Any payment succeeded |
| `payment_intent.payment_failed` | Any payment failed |
| `charge.succeeded` | One-time charge cleared (one-off product sales) |
| `charge.failed` | One-time charge failed |
| `charge.refunded` | Refund issued — adjust revenue reporting |
| `charge.dispute.created` | Chargeback filed — act fast |
| `charge.dispute.closed` | Chargeback resolved |
| `customer.created` | New customer appears in AICEO CRM |
| `customer.updated` | Customer details changed |
| `customer.deleted` | Customer removed |

---

## Quick reference: the bare minimum to "make it all work"

If the client is overwhelmed, this is the shortest list that unlocks
every AICEO feature that touches Stripe:

**API key:** Standard Secret key (full access) — easiest.

**Webhook events** (paste these into the "Select events" filter, one
line at a time):

```
product.created
product.updated
product.deleted
price.created
price.updated
price.deleted
payment_link.created
payment_link.updated
payment_intent.succeeded
payment_intent.payment_failed
charge.succeeded
charge.refunded
charge.dispute.created
customer.created
customer.updated
customer.deleted
customer.subscription.created
customer.subscription.updated
customer.subscription.deleted
invoice.payment_succeeded
invoice.payment_failed
```

---

## Where to find the webhook signing secret

After creating the endpoint in Stripe, click into it and copy the
**Signing secret** (`whsec_...`). The client pastes this into AICEO's
Settings → Integrations → Stripe → "Webhook Signing Secret" field
during connect. AICEO uses it to verify every incoming event is
genuinely from Stripe and not a forged request.

---

## What changes when the client adds these

Today, only some of this is wired. The product-catalog-sync events
are being added as part of the Stripe ↔ AICEO bidirectional sync
work. The billing events have been supported for some time.

If the client already has a Stripe key connected and a webhook
configured, they just need to **edit the existing webhook endpoint
in Stripe** and tick the additional events from this list — they
don't have to disconnect or reconnect anything.
