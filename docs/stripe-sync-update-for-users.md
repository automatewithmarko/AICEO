# Stripe ↔ AICEO — Two-Way Sync Is Now Live

> Good news: your Stripe products now automatically appear in AICEO, and
> any product you create in Stripe will show up in your AICEO Products
> tab within seconds. This is a free upgrade — no extra cost, no plan
> change, nothing to install.
>
> If you're an existing user, there's a **2-minute setup** below to turn
> on the new events. If you're connecting Stripe for the first time,
> just follow the steps inside AICEO and you're done.

---

## What changed

| Before | Now |
|---|---|
| Create a product in **AICEO** → shows up in Stripe ✅ | Still works ✅ |
| Create a product in **Stripe** → shows up in AICEO ❌ | **Now works ✅** |
| Edit a product in Stripe → AICEO out of date ❌ | **Now syncs automatically ✅** |

You can manage your catalog wherever you prefer — both sides stay in sync.

---

## Existing user setup — 2 minutes

You don't have to disconnect or reconnect AICEO. You just need to add
a few extra events to the **webhook** AICEO already set up in your
Stripe account.

### Step 1 — Open your Stripe Dashboard

Go to **Developers → Webhooks**.

You'll see your existing AICEO webhook in the list. It looks like:

```
https://<aiceo-backend>/api/webhooks/stripe/<your-user-id>
```

### Step 2 — Click into the webhook, then click "Update details"

(In the top right of the webhook page, depending on your Stripe UI version it may say *"Update endpoint"* or *"Edit"*.)

### Step 3 — Under "Events to send", click "Select events"

Add these events (you can copy the whole block and paste them one at a time into Stripe's event picker):

```
product.created
product.updated
product.deleted
price.created
price.updated
price.deleted
payment_link.created
payment_link.updated
```

Keep all of your existing events ticked. Just **add** these new ones.

### Step 4 — Click "Update endpoint" / "Save"

That's it. Done.

---

## How to verify it's working

1. In Stripe, go to **Products → Add product**. Create a test product called something like *"AICEO sync test"* and give it any price.
2. Open AICEO → **Products** tab.
3. Within about 5–10 seconds, the test product should appear in your *Imported Products* section.
4. Delete or archive the test product in Stripe. It should disappear from AICEO shortly after.

If that works, you're set.

---

## First-time setup (you're connecting Stripe to AICEO for the first time)

1. In AICEO, go to **Settings → Integrations → Stripe**.
2. Paste your Stripe **Secret key** (`sk_live_...` or `sk_test_...`). You'll find it in Stripe → Developers → API keys.
3. AICEO will give you a webhook URL.
4. In Stripe → Developers → Webhooks → **Add endpoint**:
   - Paste the URL AICEO showed you.
   - Under "Events to send", paste the events from Step 3 above **plus** these (for revenue tracking):
     ```
     payment_intent.succeeded
     payment_intent.payment_failed
     charge.succeeded
     charge.refunded
     customer.created
     customer.updated
     customer.subscription.created
     customer.subscription.updated
     customer.subscription.deleted
     invoice.payment_succeeded
     invoice.payment_failed
     ```
   - Click **Add endpoint**.
5. Click into the new endpoint, copy the **Signing secret** (starts with `whsec_...`), paste it into AICEO when prompted.

You're done. Your existing Stripe products will sync in over the next minute or two.

---

## Troubleshooting

**"My Stripe products aren't showing up in AICEO."**
- Double-check Step 3 — make sure `product.created` and `product.updated` are ticked on the webhook.
- Go to AICEO → Settings → Integrations → Stripe → click **Sync**. This pulls everything fresh.
- If still nothing, contact support — we'll check your account.

**"I got an error when AICEO tried to create a product in Stripe."**
- This means your Stripe key doesn't have write access to products. If you're using a **Secret key** this shouldn't happen — let support know.
- If you're using a **Restricted key**, you need to grant Products / Prices / Payment Links permission as "read + write" in the Stripe Dashboard.

**"I deleted a product in Stripe but it's still in AICEO."**
- Stripe doesn't always emit a `product.deleted` event — usually products are *archived* (the `active` flag flips to `false`). AICEO handles both. If the product persists for more than a minute, hit the Sync button in Settings.

**"Will any of this affect my live customers or payment links?"**
- No. The sync only reads from Stripe and writes to AICEO. It never modifies your live Stripe payment links or customer data.

**"Do I have to pay for anything extra?"**
- No. Stripe doesn't charge for webhooks or API access. AICEO doesn't charge extra for this feature.

---

## Questions?

If anything's unclear or doesn't work as expected, reach out to AICEO
support and mention "Stripe two-way sync" so we can route it to the
right person.
