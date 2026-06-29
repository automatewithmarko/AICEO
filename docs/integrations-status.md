# Integrations — Status & Audit

> Snapshot of every third-party integration wired into AICEO: what it does,
> the methods it exposes, what the user can do with it, and where it works
> vs. needs attention. Generated 2026-06-29 from `backend/routes/integrations.js`,
> `backend/services/integrations/*`, and `backend/routes/webhooks.js`.

> **Live usage stats:** not pulled. The local `backend/.env` has placeholder
> values for `SUPABASE_SERVICE_ROLE_KEY` (literal `your_service_role_key_here`)
> and the Railway CLI on this machine exits with no output, so I couldn't
> query the `integrations` / `integration_data` tables. To fill in the
> "Users connected" column below, run one of:
>
> ```sql
> -- in Supabase SQL editor
> select provider, count(*) as rows, count(*) filter (where is_active) as active,
>        count(distinct user_id) as users, max(last_synced_at) as last_synced
> from integrations group by provider order by users desc;
>
> select provider, data_type, count(*) from integration_data
> group by provider, data_type order by provider, data_type;
> ```

---

## At a glance

| Provider     | Auth        | Sync          | Webhook | Status        |
|--------------|-------------|---------------|---------|---------------|
| Stripe       | API key     | Yes (charges, subs, customers) | Yes (platform-level via Stripe dashboard) | ⚠️ Sync return bug |
| Whop         | API key     | Yes (company, products, memberships) | Yes (per-user URL) | ✅ Working |
| Shopify      | API key + `store_url` | Yes (orders, products, customers) | Yes (per-user URL) | ⚠️ HMAC verify likely broken |
| Kajabi       | API key     | Yes (offers, transactions, subs, members) | Yes (per-user URL) | ⚠️ Silent failures; HMAC verify likely broken |
| GoHighLevel  | API key + `location_id` | Yes (contacts, pipelines, opportunities) + bidirectional contact sync | Yes (per-user URL) | ✅ Working — most complex flow |
| BooSend      | API key     | No-op         | No      | ⚠️ No real validation |
| Netlify      | API key     | No (action-driven) | No      | ✅ Working |
| LinkedIn     | OAuth 2.0   | No (post-only) | No      | ⚠️ State CSRF check missing |

Legend: ✅ green / ⚠️ has a real bug or fragile area / ❌ broken.

---

## 1. Stripe (`services/integrations/stripe-int.js`)

**What it does.** Pulls a user's own Stripe account so AICEO's chat can
answer "how's revenue this month?", list recent payments, list active
subscriptions, list customers. Backs the `## Stripe Data` section of
`/api/integration-context`.

**Methods exposed.**
- `validate(apiKey)` — `stripe.balance.retrieve()`, returns currency.
- `sync(integration)` — auto-paginates `charges.list` (capped at 500),
  `subscriptions.list({ status: 'active' })`, `customers.list({ limit: 50 })`.
  Upserts each into `integration_data` keyed on `(integration_id, external_id)`.
- `handleWebhook(event, integration)` — handles `charge.succeeded`,
  `charge.failed`, and any `customer.subscription.*` event.

**User can.** Connect their Stripe account in Settings → Integrations,
then ask the AI CEO chat questions about payments / subs / customers. The
**numbers-aware** chat behavior described in the sales doc depends on this.

**⚠️ Bug — `sync()` return value:** Line 106 returns
`{ synced, total: charges.data.length + subscriptions.data.length + customers.data.length }`
but the variable is `allCharges`, not `charges`. After every successful
sync this throws a `ReferenceError`, so the caller in `routes/integrations.js`
logs `initial sync failed: charges is not defined` even though the upserts
landed. Manual re-sync via `POST /api/integrations/stripe/sync` returns a
500 to the frontend.

**Fix:** rename to `allCharges.length + subscriptions.data.length + customers.data.length`.

---

## 2. Whop (`services/integrations/whop.js`)

**What it does.** Pulls a creator's Whop company info, products, and
member memberships. Used in the `## Whop Data` section of integration
context — so the chat can talk about the user's Whop members.

**Methods exposed.**
- `validate(apiKey)` — `GET /company`, returns company `{ name, id }`.
- `sync(integration)` — fetches company, products (50), memberships (50).
- `handleWebhook(payload, integration)` — upserts memberships for any
  event whose name contains `membership`.

**User can.** Connect Whop, then have the chat surface their Whop members,
products, and membership status changes.

**Status.** ✅ No obvious bugs. Whop API uses `Bearer` auth; pagination
isn't implemented (capped at 50). Webhook URL is auto-generated on
connect even though the route file lists only `shopify`/`kajabi`/`gohighlevel`
for webhook secret generation — so **Whop webhook isn't actually wired**
in routes/integrations.js:249. `handleWebhook` is dead code unless the
route is added.

---

## 3. Shopify (`services/integrations/shopify.js`)

**What it does.** Pulls a Shopify store's orders, products, customers via
the Admin REST API (v2024-01). Backs the `## Shopify Data` section.

**Methods exposed.**
- `validate(apiKey, metadata)` — requires `metadata.store_url`. Hits
  `GET /admin/api/2024-01/shop.json` with `X-Shopify-Access-Token`.
- `sync(integration)` — paginates orders (up to 5 pages × 250 = 1250),
  pulls products (250) and customers (250). Uses `Link: rel="next"` header.
- `handleWebhook(payload, integration)` — handles `orders/paid`,
  `orders/create`, `products/create`, `products/update`.

**User can.** Connect their Shopify store; have AICEO summarize orders
and revenue, list products and customers.

**⚠️ Bug — HMAC verification will fail for real webhooks:**
`routes/webhooks.js:711-714` computes
`crypto.createHmac('sha256', integration.webhook_secret).update(JSON.stringify(req.body))`.
Shopify signs the **raw request bytes**, but by that point Express's JSON
parser has already turned the body into a JS object. `JSON.stringify(req.body)`
produces a normalized string that almost never byte-matches what Shopify
signed (key order, whitespace, unicode). So every Shopify webhook with
a signature header returns **401 Invalid signature**.

**Additional concern — `webhook_secret` mismatch:** Shopify signs webhooks
with the **app's** secret, not a per-user random string we generated. The
auto-generated `record.webhook_secret = crypto.randomBytes(16).toString('hex')`
in `routes/integrations.js:252` can't match what Shopify is signing with.
For Shopify webhooks to actually verify, the user has to configure that
exact secret on the Shopify side as the webhook's shared secret — which
is unusual. Confirm with the user whether anyone has actually wired
Shopify webhooks end-to-end.

**Fix:** keep raw body for webhook routes (`express.raw({ type: 'application/json' })`),
verify HMAC against the raw buffer, then `JSON.parse` once. And clarify
the webhook secret story.

---

## 4. Kajabi (`services/integrations/kajabi.js`)

**What it does.** Pulls Kajabi offers (products/courses), transactions,
subscriptions, and members. Backs the `## Kajabi Data` section.

**Methods exposed.**
- `validate(apiKey)` — `GET /api/v1/site`.
- `sync(integration)` — pulls offers, transactions, subscriptions,
  members (100 each).
- `handleWebhook(payload, integration)` — handles `purchase.completed`,
  `sale.created`, `subscription.activated`, `subscription.renewed`.

**User can.** Connect their Kajabi tenant; chat about course sales,
recurring revenue, members.

**⚠️ Issues.**
- **Silent failures.** Each of the four sync sections is wrapped in
  `try/catch` that just `console.log`s the error. If Kajabi's auth fails
  or the `/offers` endpoint shape changes, `sync()` returns
  `{ synced: 0, total: 0 }` and the frontend reports success. There's no
  surfaced error.
- **HMAC verify same bug as Shopify** — `routes/webhooks.js:751` calls
  `JSON.stringify(req.body)` against the user-supplied
  `webhook_secret`. Same caveat about the per-user random secret.
- **Endpoint shape guessing.** The code does
  `offersData.offers || offersData.data || offersData` — a sign that
  the actual response shape wasn't pinned down at write time. This is
  defensive but flagging because if Kajabi's API responds with `null`
  for one of these keys, the `Array.isArray` check rescues it but
  data silently disappears.

**Recommend:** smoke-test against a real Kajabi key, decide what the
real response shape is, and tighten the parsing.

---

## 5. GoHighLevel (`services/integrations/gohighlevel.js`)

**What it does.** Two-way CRM sync. Fetches GHL contacts, pipelines,
and opportunities into `integration_data` AND materializes contacts into
AICEO's first-class `contacts` table. Pushes local AICEO contact changes
back to GHL. Most invested integration in the codebase.

**Methods exposed.**
- `validate(apiKey, metadata)` — requires `metadata.location_id`.
  `POST /contacts/search` with `pageLimit: 1`.
- `sync(integration)` — paginates contacts via cursor (`searchAfter`,
  up to 1000), then for each pipeline pulls its opportunities (50).
  For every contact, also calls `syncContactFromGHL` which upserts into
  the `contacts` table (matched by `ghl_contact_id` → `email` → phone
  last-10-digits).
- `handleWebhook(payload, integration)` — handles `ContactCreate`,
  `ContactUpdate`, `ContactDelete`. Delete marks local row
  `ghl_sync_status: 'local_only'`, doesn't actually delete.
- `syncContactToGHL(contact, integration)` — outbound. Has loop
  protection: an in-memory `syncingContacts` map with 10s TTL prevents
  webhook→update→webhook cycles.
- `createGHLContact / updateGHLContact / searchGHLContactByEmail` —
  low-level helpers, exposed.

**User can.** Connect GHL with a private integration token + location ID;
have GHL contacts populate AICEO's CRM tab; have local CRM edits push
back to GHL.

**Status.** ✅ Working. The two-way sync is the most complex code in
the integrations folder; loop prevention is in place. Worth verifying
that the webhook URL gets registered on the GHL side after
`/connect` returns it — there's no automated subscription, the user
has to paste it into GHL manually.

**Minor concern.** The phone-match query
(`select * from contacts where user_id=? and neq('phone', '')`) pulls
every non-empty-phone row into memory and filters client-side. Will
get slow per user once they have a few thousand contacts. Cheap fix:
add a generated `phone_last_10` column with an index.

---

## 6. BooSend (`services/integrations/boosend.js`)

**What it does.** Stores the user's BooSend API key for later use in
DM automations.

**Methods exposed.**
- `validate(apiKey)` — **just checks length > 10**. No API call.
- `sync()` — returns `{ synced: 0, total: 0 }` immediately. There's a
  comment saying "sync is handled externally."

**User can.** Connect BooSend; from there it's referenced by other
routes (`routes/boosend.js`) for sending DMs.

**⚠️ Issues.**
- **No real validation.** Any string ≥ 10 chars is accepted and stored.
  A typo means the user thinks they connected but every later API call
  fails. Add a real auth check against any BooSend endpoint that returns
  a stable 401 on bad keys.
- **No sync.** Acceptable if there's no inbound data, but it means the
  Settings UI shows "Last synced: never" forever, which is a tell that
  something's wrong.

---

## 7. Netlify (`services/integrations/netlify.js`)

**What it does.** Deploys AI-generated landing pages as Netlify sites.
Connection + per-deploy action flow, no scheduled sync.

**Methods exposed.**
- `validate(apiKey)` — `GET /accounts`, returns first account name + slug.
- `validateName(name)` — local regex check for Netlify site name rules.
- `checkNameAvailable(apiKey, rawName)` — two probes:
  1. `GET /sites?name=<name>` to see if the user already owns it.
  2. `HEAD https://<name>.netlify.app` — anything not-404 = taken.
- `deploy(token, html, { siteName, siteId })` — creates or reuses site,
  computes SHA1 of the HTML, creates a deploy with the file digest,
  PUTs the binary.

**User can.** Connect a personal Netlify access token, pick a site name
in the deploy modal, hit Deploy on any generated landing page. Site
ID + last name are cached so a re-deploy keeps the same URL when the
name is unchanged.

**Status.** ✅ Working. Error surface is well thought out:
- 401/403 → marks integration `is_active: false`, frontend asks user to
  reconnect.
- 422 → returns `409 netlify_name_taken`, frontend asks for a new name.

**Minor.** `checkNameAvailable` uses an unauthenticated HEAD probe — could
be defeated by Netlify's edge caching. Real check is still the POST at
deploy time, which is fine.

---

## 8. LinkedIn (`services/linkedin-api.js` + `routes/integrations.js`)

**What it does.** OAuth 2.0 flow + posting (text or text+image). Backs
the LinkedIn posting feature gated by `linkedin_posting`.

**Methods exposed.**
- `getAuthUrl(redirectUri, state)` — builds the LinkedIn authorize URL
  with scopes `openid profile w_member_social`.
- `exchangeCode(code, redirectUri)` — POSTs to `/oauth/v2/accessToken`,
  returns `{ access_token, expires_in }`.
- `getUserInfo(accessToken)` — `GET /v2/userinfo`, returns `{ sub, name }`.
- `postText(accessToken, linkedinUserId, text)` — `POST /rest/posts`,
  returns `{ postUrl, postUrn }`.
- `postWithImage(accessToken, linkedinUserId, text, imageUrl)` — 4-step
  flow: init upload → download from URL → PUT to upload URL → create
  post referencing the image URN.

**User can.** Click "Connect LinkedIn" in Settings (OAuth redirect), then
publish AI-generated posts (with or without an image) from the content
calendar / generation flows. Each post is mirrored to `social_posts`.

**⚠️ Bug — CSRF state isn't verified:**
`routes/integrations.js:88-95` looks up the
`linkedin_oauth_state` row by `is_active: false, order by updated_at desc, limit 1`
**without filtering by the `state` value returned in the callback**. If
two users start the LinkedIn OAuth flow within seconds, the second
user's callback can attach to the first user's `user_id`. Also defeats
CSRF — any attacker who can trigger a victim's browser to hit the
callback URL with a valid LinkedIn `code` will have it bind to whichever
state row is newest in the entire `integrations` table.

**Fix:** include `state` as a unique column filter on the lookup, and
return an error if no row matches.

**Other note.** The token's `expires_in` defaults to 60 days
(`5184000s`) when LinkedIn omits it. There's no refresh-token flow —
when the token expires, posting returns `linkedin_token_expired` and
the user has to reconnect. LinkedIn's `w_member_social` doesn't issue
refresh tokens by default, so this is expected.

---

## Adjacent integrations (not in the integrations table)

These aren't part of the user-installable integration set but are
worth knowing about when the user asks "what integrations does AICEO
have?":

- **Microsoft Outlook OAuth** (`services/outlook-oauth.js`, `outlook-graph.js`,
  `outlook-graph-sync.js`) — for the inbox feature. Uses Graph for both
  read and send; the legacy SMTP/IMAP path is documented as dead because
  Microsoft disabled SMTP AUTH.
- **IMAP** (`services/imap.js`) — for any other mail provider (e.g., generic
  Gmail-with-app-password). Used by the inbox tab. Note: Gmail full OAuth
  isn't wired here.
- **Apify / RapidAPI** (`services/instagram.js`, `tiktok.js`, `linkedin.js`,
  `youtube.js`) — powers the **Outlier Detector**. Keys are backend-only
  (`RAPIDAPI_KEY`, `APIFY_TOKEN`) — users don't connect their own.
- **Recall.ai** (referenced in the integration-context query as
  "PurelyPersonal Meeting Notes") — meeting recording + transcription.
  Configured backend-side; user connection is a Zoom/Meet meeting URL,
  not an API key.
- **Stripe (platform billing)** (`services/stripe.js`, `routes/billing.js`,
  `routes/webhooks.js`) — for AICEO's *own* subscriptions (Core / Diamond).
  Separate from the per-user "Stripe" integration above.

---

## Priorities (recommendation)

If you want to fix things in order of user-visible impact:

1. **Stripe sync return bug** — easy one-line fix, surfaces real errors
   to the frontend that aren't actually errors.
2. **LinkedIn OAuth state CSRF + cross-user race** — security issue and
   a real correctness risk in a multi-user world.
3. **Shopify / Kajabi webhook HMAC** — webhooks return 401 silently;
   real-time sync from those platforms isn't actually working. Confirm
   first with the live DB whether any webhook events have ever landed.
4. **BooSend validation** — users with typo keys think they're connected.
5. **Kajabi silent sync errors** — surface them so onboarding can debug.

Tell me which of these you want to start with (or something else from
the list) and I'll dig in.
