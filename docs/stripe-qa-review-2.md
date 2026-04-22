# Stripe Billing — QA Review (post-Phase-2)

Done as a senior-QA pass before greenlighting cancellations / refunds /
upgrades. Findings ordered by blast radius.

---

## P0 — Fixed in this commit

### 1. Dedupe table blocked legitimate retries

**Symptom:** if a webhook handler threw (now likely after we added strict
error checks on every upsert), Stripe would retry the event 5 minutes
later. Our dedupe row was inserted at the START of the handler, so the
retry would hit "already processed → skip" → activation lost forever.

This is the same failure mode that gave us the missing-column incident,
just made worse by my "throw on upsert error" fix. Without this fix,
the very next schema mismatch / transient DB error would silently lose
a customer's activation again.

**Fix:** inserts into `stripe_events` now happen at the END of
successful handler execution. If processing throws → no dedupe row →
Stripe's retry reprocesses cleanly. All handlers are idempotent
(upserts on `user_id`, `addCredits` guards on `stripe_event_id`), so
double-processing during the rare race window between two parallel
deliveries is also safe.

Files: `backend/routes/webhooks.js`.

---

## P1 — Fixed in this commit

### 2. `customer.subscription.deleted` and `invoice.payment_failed` swallowed errors

Same silent-failure pattern — those two handlers had unchecked
`supabase.update(...)` calls. If the underlying update failed, we'd log
"Subscription cancelled" / "Payment FAILED" without actually changing
the row. Now both check `.error` and `throw` on failure → 5xx → Stripe
retries.

Files: `backend/routes/webhooks.js`.

### 3. `FRONTEND_URL` fallback was fail-open

```
const origin = process.env.FRONTEND_URL || req.headers.origin || 'http://localhost:5173';
```

If `FRONTEND_URL` is ever missing in production, the request's `Origin`
header gets used instead. `Origin` is attacker-controllable on a
CSRF-shaped request (cross-origin POST with a stolen JWT). An attacker
could craft a checkout session whose `success_url` redirects the user
through their own site after payment.

**Fix:** new `resolveFrontendOrigin(req)` helper:
- prod (NODE_ENV=production): require FRONTEND_URL, throw if missing
- dev: keep the fallback so localhost works

Files: `backend/routes/billing.js`.

### 4. Silent 500-credit fallback hid plan misconfiguration

Both `getUserPlan` and `refillMonthlyCredits` defaulted to
`credits_per_month: 500` if the user's `subscription.plan` didn't
match any row in `plans`. This silently masked the test-plan-not-in-DB
issue and would mask similar issues in the future. Now both log a
`console.warn` so the misconfiguration is discoverable.

Files: `backend/services/plans.js`, `backend/services/credits.js`.

---

## P2 — Document, fix in next phase

### 5. Polling vs initial-load race in `Billing.jsx`

Both effects call `setPlanData`. If the polling fires its first read
and settles BEFORE the initial `Promise.all` resolves, the data
loader's later `setPlanData(stale)` overwrites the activated plan for
~100–500ms. Hard to notice in practice. Fix: gate the data loader's
setPlanData on a "polling has not settled" flag.

### 6. No timeout on outbound Stripe API calls

`stripe.subscriptions.retrieve(session.subscription)` and friends have
no explicit timeout. If Stripe's API hangs, our handler hangs until
Stripe's webhook delivery times out (30s) and gives up. Acceptable for
now, fix with `{ timeout: 10000 }` on the Stripe client config.

### 7. Idempotency-key bucket boundary

Bucket = `Math.floor(Date.now() / 600000)`. A user clicking Subscribe
at 12:09:55 vs 12:10:05 generates different keys despite being 10
seconds apart. Stripe creates two sessions; both expire harmlessly.
Edge case, low impact.

### 8. No rate-limiting on POST `/api/billing/checkout`

An authenticated user can spam checkout creation. Each call hits
Stripe API. Stripe rate-limits us at the platform level, but it's
still budget burn. Add 3-per-minute-per-user limit.

### 9. Race between two parallel webhook deliveries (theoretical)

If Stripe sends the same event twice in parallel (very rare — Stripe
retries with delay, not parallel), both handlers run. With the fix in
P0, both would attempt to insert the dedupe row at the end; one wins,
the other gets unique-violation and we swallow it. All handlers are
idempotent so no corruption. Documented behavior.

### 10. `customer.subscription.updated` may fire BEFORE `checkout.session.completed`

Stripe doesn't guarantee event order. Both handlers correctly upsert
on `user_id` so whichever lands later wins for fields they both write
(which are the same). No bug, just worth noting.

---

## P3 — Operational follow-ups

### 11. Structured logging

Currently `console.log` everywhere. Hard to trace one event end-to-end
without grepping Railway logs by event id. Move to a structured
logger (pino, winston) with `event_id`, `user_id`, `plan`, `tier` as
first-class fields.

### 12. Webhook failure alerting

A 5xx from our webhook = silent in production unless someone watches
Railway logs. Wire up Sentry or a Slack webhook for any
`[webhook/stripe]` log line containing `FAILED` / `Error`.

### 13. No Stripe-side observability check

We never query Stripe to verify our DB matches Stripe's reality. A
nightly reconciliation job would catch: phantom rows, abandoned subs,
mismatched plans. Useful before scaling past ~100 customers.

### 14. Atomic credit deduction (Postgres function)

`deductCredits` does balance-check + balance-update + transaction-log
in three separate Supabase calls. The conditional update prevents
going negative, but if the transaction log insert fails after the
balance is decremented, the deduction goes unrecorded. Wrap in a
Postgres `RPC` for atomicity. Phase 3 territory.

### 15. Test plan ('test') not in plans table

`PlanSelector.jsx` shows a 🧪 Test Plan card hard-coded into the
component. The user-facing test row in the `plans` table was
documented in `docs/credit-system-plan.md` but the SQL never seems
to have been applied (which is why we kept seeing the 500-credit
fallback). Either apply the SQL or remove the test card before public
launch. Right now if a real user signs up they see the test plan and
can buy a $1 subscription with 500 credits attached — small revenue
leak, weird UX.

---

## Security review

| Surface | Status | Notes |
|---|---|---|
| Webhook signature verification | ✅ enforced | Fail-closed when secret missing |
| Webhook payload parsing pre-verify | ✅ none | `constructEvent` is the only parser |
| Auth on billing routes | ✅ 401 for anonymous | `requireAuth` wraps all `/api/billing/*` |
| CSRF on POST endpoints | ✅ N/A | Bearer-token auth (not cookies); attacker can't read JWT cross-origin |
| Origin header trust | ✅ now fail-closed in prod | Was fail-open — fixed in #3 |
| IDOR on portal | ✅ scoped to `req.user.id` | Looks up own `stripe_customer_id` only |
| Sensitive env logging | ✅ no leakage | Keys never printed |
| RLS on new tables | ⚠️ unverified | `stripe_events` table — should explicitly deny `anon`/`authenticated` (backend uses service role anyway, but defense in depth) |
| Rate limiting | ❌ missing on checkout | See #8 |
| Webhook replay (Stripe-signature) | ✅ Stripe handles tolerance window | Default 5-min skew |

---

## What's now safe to build on top

After P0 + P1 are deployed, the foundation is solid for:
- **Cancellations** — `customer.subscription.deleted` already wired and now error-checked. Frontend `canceling` banner + Reactivate button already built (Phase 2). Just needs Customer Portal "Cancel" enabled in Stripe Dashboard.
- **Upgrades** — Customer Portal handles plan switches with proration. `customer.subscription.updated` handler already updates plan/tier/price_id. Setup fee correctly skipped on upgrades (per-Q4 logic).
- **Refunds** (Phase 3) — `charge.refunded` handler not yet implemented. Will pro-rate credit revocation per the agreed Q1 policy.
- **Disputes** (Phase 3) — `charge.dispute.created` handler not yet implemented. Will freeze access via a boolean flag.

---

## Test plan before greenlight

End-to-end fresh-user test on the 🧪 $1 Test Plan, every step verified:

1. Sign up → confirm email → log in → PlanSelector shows
2. Pick Test Plan → Stripe Checkout shows **$1 + $2 = $3** (setup attached)
3. Pay → land on `/billing?checkout=success`
4. "Activating your subscription…" banner shows for ≥1.5s
5. "You're all set — welcome to Test Plan. Taking you to your AI CEO…" shows
6. Auto-navigate to `/ai-ceo` after ~1.8s
7. AI CEO page renders without PlanSelector overlay
8. Verify in Supabase:
   - `subscriptions` row: plan='test', tier='standard', status='active',
     `stripe_subscription_id` populated, `stripe_customer_id` populated,
     `stripe_price_id` = test standard price id
   - `profiles.stripe_customer_id` populated
   - `credits.balance` = 10 (or 500 if test plan row not seeded — either way, single seeding only)
   - `credit_transactions` has one `monthly_refill` row tagged with the
     Stripe `event.id`
   - `stripe_events` has one row per delivered Stripe event
9. Open Customer Portal via "Manage" → cancel subscription
10. Webhook fires → `subscriptions.status = 'canceling'`, banner appears
11. Reactivate → status flips to 'active' / 'canceling' as appropriate
12. Cancel + period end → `subscriptions.status = 'cancelled'`
13. Resub → no setup fee charged (already a returning customer)
14. Refund test charge in Stripe dashboard (no handler yet — Phase 3)
