# Release notes — 2026-06-16

## Tasks delivered

**Newsletter image generation failed.**
Anthropic deprecated the model we were using. Swapped in the new one across every agent. All generations (newsletter, landing, squeeze, lead magnet, story, DM) work again.

**Input details once across all marketing tools.**
Added a Campaign Brief card at the top of the Marketing chat. Fill offer + audience + tone + goal + key benefit once and every tool reuses it — no more repeating per tab. Also auto-captures from chat so users who skip the card still get the benefit on the next tool.

**Go back to a previous design — no option in canvas side.**
Click any old chat message and the canvas swaps to that version. Send an edit while viewing it and a new version branches at the bottom (older versions stay intact). Works in Marketing and AICEO chat.

**Lead Magnet AI — logo squeezed.**
Lead Magnet now also gets the click-old-message + branching versioning treatment. The model fix above also unblocked its generation pipeline.

## Other small fixes

- Campaign Brief card was reading as "tucked under" the Previous-conversations bar; gave it its own visual zone.
- Replaced the browser confirm() popup with a themed modal when clearing the brief.
- Snapshot helper now shared between Marketing and AICEO instead of duplicated.
- Bug where past snapshots froze with "Generating" placeholders instead of the final images — fixed.

## Shipped to

Dev + production (frontend + backend), Railway CLI back on dev as the safe default.
