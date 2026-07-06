# ZorroMail Transactional Email — Integration Guide

This file is a complete, self-contained reference for sending transactional
email through ZorroMail. It is written so an LLM or coding agent can implement
the integration without any other context.

## Essentials

- Base URL: `https://api.zorromail.app`
- Auth: every request needs `Authorization: Bearer <API_KEY>` (keys look like `tk_live_…`; created in the ZorroMail dashboard → Transactional → API keys)
- The `from` address MUST be on a sending domain that is VERIFIED in the dashboard (e.g. `receipts@yourdomain.com`). Sends from unverified domains are rejected with 422.
- Store the API key in an environment variable (e.g. `ZORROMAIL_API_KEY`). Never commit it.

## Send a message

`POST https://api.zorromail.app/tx/v1/messages` → `202 Accepted`

Request body (JSON):

| Field | Type | Required | Notes |
|---|---|---|---|
| from | string | yes | e.g. `receipts@yourdomain.com` — domain must be verified |
| to | string[] | yes | recipient addresses |
| subject | string | yes | max 998 chars |
| html | string | html or text | HTML body |
| text | string | html or text | plaintext body |
| cc, bcc | string[] | no | additional recipients |
| replyTo | string | no | where replies go (use a real inbox) |
| headers | object | no | extra headers, e.g. `{"X-Order-Id": "123"}` |
| attachments | array | no | `{filename, contentBase64, contentType}` |

Optional request header: `Idempotency-Key: <unique-string>` — retries with the
same key return the original result instead of sending twice. Use it for
anything triggered by payments or retried jobs.

Response: `{"id": "<messageId>", "status": "SENT", "suppressedRecipients": ["a@b.com"]}`
(`suppressedRecipients` is present only when some recipients were skipped —
addresses that previously bounced, complained, or unsubscribed are suppressed
automatically and never contacted again.)

### curl

```bash
curl -X POST "https://api.zorromail.app/tx/v1/messages" \
  -H "Authorization: Bearer $ZORROMAIL_API_KEY" \
  -H "Content-Type: application/json" \
  -H "Idempotency-Key: order-1042-receipt" \
  -d '{
    "from": "receipts@yourdomain.com",
    "to": ["customer@example.com"],
    "subject": "Your receipt",
    "html": "<h1>Thanks!</h1><p>Order #1042 confirmed.</p>",
    "text": "Thanks! Order #1042 confirmed."
  }'
```

### Node.js

```js
const res = await fetch('https://api.zorromail.app/tx/v1/messages', {
  method: 'POST',
  headers: {
    Authorization: `Bearer ${process.env.ZORROMAIL_API_KEY}`,
    'Content-Type': 'application/json',
    'Idempotency-Key': 'order-1042-receipt',
  },
  body: JSON.stringify({
    from: 'receipts@yourdomain.com',
    to: ['customer@example.com'],
    subject: 'Your receipt',
    html: '<h1>Thanks!</h1><p>Order #1042 confirmed.</p>',
  }),
});
if (!res.ok) throw new Error(`send failed: ${res.status} ${await res.text()}`);
const { id, status, suppressedRecipients } = await res.json();
```

### Python

```python
import os, requests

res = requests.post(
    "https://api.zorromail.app/tx/v1/messages",
    headers={
        "Authorization": f"Bearer {os.environ['ZORROMAIL_API_KEY']}",
        "Idempotency-Key": "order-1042-receipt",
    },
    json={
        "from": "receipts@yourdomain.com",
        "to": ["customer@example.com"],
        "subject": "Your receipt",
        "html": "<h1>Thanks!</h1><p>Order #1042 confirmed.</p>",
    },
    timeout=30,
)
res.raise_for_status()
message = res.json()
```

## Suppression list

Recipients who hard-bounce, complain, or unsubscribe are suppressed
automatically. Manage the list with the same API key:

- `GET https://api.zorromail.app/tx/v1/suppressions` — list suppressed addresses
- `POST https://api.zorromail.app/tx/v1/suppressions` — body `{"email": "a@b.com"}` (manual suppression)
- `DELETE https://api.zorromail.app/tx/v1/suppressions/a@b.com` — remove

## Errors

| Status | Meaning | What to do |
|---|---|---|
| 400 | Validation failed (missing field, bad email) | Fix the payload; do not retry as-is |
| 401 | Missing/invalid/revoked API key | Check the key |
| 422 | `from` domain is not a verified sending domain | Verify the domain in the dashboard |
| 429 | Rate limit (100 req/min per key) or monthly quota reached | Back off and retry after a delay |
| 502 | Upstream provider failure | Safe to retry with the same Idempotency-Key |

## Behavior you get for free

- Delivery, bounce, complaint, open, and click events are tracked per message.
- Hard bounces and complaints auto-suppress the recipient.
- A one-click List-Unsubscribe header is added automatically (recommended for
  any non-essential mail; suppressed on replies when you set your own).
- Raw MIME of every send is archived for audit.

## Rules for the integrating agent

1. Read the API key from an environment variable; never hardcode it.
2. Always send BOTH html and text when possible (better deliverability).
3. Use Idempotency-Key for any send triggered by a retryable job or payment.
4. Treat 429 with exponential backoff; treat 400/422 as bugs to surface, not retry.
5. Do not build your own suppression logic — the platform already enforces it.
