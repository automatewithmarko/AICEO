# Stripe Unified Connect — Audit & Implementation

> Shipped 2026-07-16. One connection process for everyone — new users,
> existing users, upgrades. Non-technical users paste ONE key and never
> open Stripe's Developers section.

---

## Why there were "two processes" (audit summary)

1. **The webhook was manual.** AICEO never created the Stripe webhook —
   users built it by hand in the Stripe dashboard from a URL + 20-event
   list shown in the connect wizard. When product-catalog sync shipped
   later, existing users needed a DIFFERENT manual procedure (edit the
   old endpoint, add 8 events) documented separately. No code migrated
   anyone.
2. **Validation checked only Balance:Read** (`stripe-int.js` old
   `validate`). The integration actually needs 7 resource scopes; a
   restricted key missing any connected "successfully" then failed
   silently (catalog sync errors were swallowed into console.log).
3. **No signing secret was ever stored** for the per-user webhook — all
   incoming user-Stripe events were processed unsigned.
4. **Disconnect/reconnect left stale state** — products deleted in
   Stripe never pruned; orphaned webhook endpoints kept posting.

## The single process (implemented)

`connect`, `reconnect`, and `Repair connection` all run the SAME
pipeline:

1. **Permission probe** (`stripe-int.js probePermissions`): harmless
   1-item reads of Charges/Customers/Subscriptions/Products/Prices/
   Payment Links (+ Balance and Webhook Endpoints as optional). Missing
   REQUIRED scopes → connect fails immediately with a plain-English
   message telling the user exactly what's missing and that the standard
   Secret key is the easy fix. Granted/missing list is stored on
   `integrations.metadata.permissions`.
2. **Webhook auto-provisioning** (`provisionWebhook`): finds AICEO's
   endpoint in the user's Stripe account by URL —
   - exists + we hold its secret → update `enabled_events` to the
     canonical list (single source: `STRIPE_WEBHOOK_EVENTS` in
     stripe-int.js);
   - exists but no stored secret (legacy manual endpoint) → delete +
     recreate (secrets are only revealed on creation);
   - missing → create.
   Stores `webhook_url` + `webhook_secret` + `metadata.webhook
   {provisioned, mode, endpointId}`. Never throws — on failure
   (restricted key without Webhook Endpoints write, endpoint limit)
   connect still succeeds with `provisioned:false` and the UI shows the
   manual fallback screen.
3. **Full sync with reconciliation**: catalog sync now prunes AICEO
   products whose Stripe product is no longer active — but ONLY when the
   full product list fetched without error (partial fetches never wipe).
4. **Signature verification**: with a secret now stored, the per-user
   webhook handler verifies signatures (existing fail-closed branch).
   Legacy rows without a secret keep the unsigned grace path with a
   warning log until one Repair/reconnect closes the gap.

### Existing users = one click

`POST /api/integrations/stripe/repair` + the **Repair connection**
button on the connected Stripe card: re-runs the whole pipeline with the
STORED key (no re-pasting), then re-syncs. Disconnect→reconnect works
identically (same code path). The old "edit your webhook manually" doc
procedure is obsolete.

### Disconnect = clean uninstall

Best-effort deletion of the AICEO-managed webhook endpoint from the
user's Stripe account. Imported products are deliberately KEPT (user
data; reconnect merges + reconciles).

### UI

- Connect wizard: paste key → if auto-provisioned, a SUCCESS screen
  (✅ key verified / ✅ webhook installed / ✅ import started) — one step,
  done. Manual webhook screen only appears as the fallback, with the
  failure reason and "reconnect with your standard Secret key" guidance.
- Connected card: **Repair connection** (primary) + **Webhook setup**
  (manual fallback, secondary) + Disconnect.

### Files

- `backend/services/integrations/stripe-int.js` — probe, canonical
  events, provisionWebhook/removeWebhook, hardened client (timeout +
  retries), sync reconciliation.
- `backend/routes/integrations.js` — connect provisioning branch,
  `POST /api/integrations/stripe/repair`, disconnect cleanup.
- `backend/routes/webhooks.js` — unsigned-legacy warning log.
- `src/pages/Settings.jsx` — success step, fallback framing, Repair
  button; `src/lib/api.js` — `repairStripeIntegration()`.

### Notes / follow-ups

- Write scopes (Products/Prices/Payment Links) can't be probed without
  side effects; the standard-key guidance covers them. If a restricted
  key with read-only product scopes slips through, product CREATION
  still errors at use time — acceptable, now that read gaps are caught.
- Webhook URL base = `API_BASE_URL` env (falls back to
  RAILWAY_PUBLIC_DOMAIN / localhost) — same convention as
  shopify/kajabi. Ensure `API_BASE_URL` is set correctly per Railway
  environment so dev connects don't register dev URLs for prod users
  (shared DB!).
- `docs/Stripe_permissions.md` and `docs/stripe-sync-update-for-users.md`
  should be updated to describe the automatic flow (kept as-is for now;
  the manual steps remain accurate for the fallback path).
