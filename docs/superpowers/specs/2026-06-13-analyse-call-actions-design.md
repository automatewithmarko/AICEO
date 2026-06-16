# Analyse Call actions — design

**Date:** 2026-06-13
**Trigger:** Client report (Danny, June 13): "Analyse Objections / Write email / Add context — all three not working." The three buttons in the Call Intelligence section (`src/pages/Sales.jsx:692-698`) were never wired: no onClick handlers, no backend endpoints.

## Context (verified)

- Calls listed in this section are PurelyPersonal meetings (`meetings` table), IDs prefixed `pp-` by `GET /api/sales/calls` (`backend/routes/sales.js:212`). Full transcript: `meetings.transcript_text`; `summary`/`action_items`/`participants` are jsonb; duration in `duration_seconds`.
- The AI CEO orchestrator loads sales context from the `sales_calls` table (`backend/services/context.js:15`) — **that table does not exist in the DB**; the query has been silently failing (Promise.allSettled). The stagedemo assistant also reads it (`stagedemo.js:746-768`, columns: id, title, participants, duration, created_at, summary, action_items).
- Existing LLM pattern in sales.js: Grok `grok-4-1-fast-non-reasoning` via OpenAI SDK (Mentor gateway when MENTOR_API_KEY set), JSON response_format (`sales.js:296-321`).
- Known bug bundled in: `PATCH /api/sales/calls/:id` writes the `pp-`-prefixed ID into `call_metadata.integration_data_id` (uuid) → Postgres error → 500 (clients hit this June 12). GET also never returns saved call_type/status (hardcoded `'Other'`/`null`), though the frontend already initializes its local state from those fields (`Sales.jsx:123-131`).
- Email drafts: `POST /api/emails/draft` (requires `account_id` of a connected email account); frontend `saveDraft()` exists in `api.js:962`.

## Changes

### Migration: `backend/migrations/add_sales_calls_table.sql`
Create `sales_calls` (id uuid pk, user_id uuid → auth.users, meeting_id uuid, title text, summary text, action_items jsonb, participants jsonb, duration int [seconds], created_at timestamptz) + index on user_id + `UNIQUE (user_id, meeting_id)` for idempotent add-to-context. Applied to prod via Supabase.

### Backend (`backend/routes/sales.js`)
Helper `resolveMeeting(userId, id)` — strips `pp-`, fetches the meeting row scoped to the user.

1. `POST /api/sales/calls/:id/analyze-objections` — gates: `requireFeature('call_intelligence')` + `requireCredits('call_intelligence')` (same as generate-action-items). Transcript (30k cap) → Grok → `{ objections: [{ objection, customer_quote, how_it_was_handled, suggested_response }] }`. Persists result to `meetings.metadata.objections` so the GET can return it and the modal can be reopened without paying again.
2. `POST /api/sales/calls/:id/write-email` — same gates. Transcript → Grok → `{ subject, body }` (plain-text follow-up email, grounded in what was discussed).
3. `POST /api/sales/calls/:id/add-to-context` — auth only (no LLM/credits). Copies meeting (title, summary text, action_items, participants, duration_seconds) into `sales_calls` keyed by (user_id, meeting_id); returns `{ ok, already }`. Orchestrator picks it up automatically.
4. Fix `PATCH /api/sales/calls/:id` — strip `pp-` before upsert into call_metadata.
5. `GET /api/sales/calls` — join call_metadata (callType/status) and sales_calls (in_context flag) and `meetings.metadata.objections` into the response.

### Frontend
- `src/lib/api.js`: `analyzeCallObjections(id)`, `writeCallFollowUpEmail(id)`, `addCallToContext(id)` — POST wrappers that surface backend error messages (402 insufficient credits / 403 plan).
- `src/pages/Sales.jsx`:
  - Wire the three buttons with per-call loading spinners.
  - Objections modal (reuses `sales-modal` pattern): list of objections with quote, how handled, suggested response. Opens instantly from cached `call.objections` when present; "Re-analyze" runs it again.
  - Email modal: editable subject + body, **Copy** and **Save to Drafts** (uses first connected email account via `getEmailAccounts()`; disabled with hint when none connected).
  - "Add to context" → spinner → "Added to context ✓" (persistent via `in_context` from GET; idempotent server-side).
  - Errors surface via alert with the backend's message instead of failing silently.
- `src/pages/Sales.css`: styles for objection list items and email draft fields, consistent with existing modal styles.

## Error handling
- 402/403 from gates → alert shows backend message ("Insufficient credits" / "Feature not available on your plan").
- Meeting without transcript → backend falls back to summary text; if neither, 422 with clear message.
- LLM/JSON failures → 500 with generic message, logged server-side (same as generate-action-items).

## Testing
No test framework in repo. Verification: `node --check` on backend files, `vite build` for the frontend, migration applied and verified with a SQL select, endpoint smoke-tested in production after deploy.
