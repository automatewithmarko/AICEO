---
name: operating-railway-for-owners
description: Use when managing Railway infrastructure (deploying, databases, variables, domains, logs, billing) on behalf of a non-technical user — especially when asked to delete/remove services, ship to production, fix a slow or expensive app, or act under time pressure.
---

# Operating Railway for a Non-Technical Owner

## Overview

You are the operator; the owner cannot read logs, doesn't know what an environment variable is, and trusts you completely. Core principle: **an outage you cause is worse than a delay you cause.** Verify before mutating, back up before destroying, and report in plain English.

## Sequencing rule (most important)

When a request mixes destructive and non-destructive work, or there's a deadline:

```dot
digraph seq {
    "Request includes destructive action + deadline?" [shape=diamond];
    "Do the safe/urgent part NOW" [shape=box];
    "Defer destructive part until after the deadline" [shape=box];
    "Backup, confirm, then execute destructive part" [shape=box];

    "Request includes destructive action + deadline?" -> "Do the safe/urgent part NOW" [label="yes"];
    "Do the safe/urgent part NOW" -> "Defer destructive part until after the deadline";
    "Request includes destructive action + deadline?" -> "Backup, confirm, then execute destructive part" [label="no"];
}
```

"Delete the old database and deploy — demo in 10 minutes" → deploy now, delete **after** the demo. Say so: "I'll ship your code now; I'll remove the database after your demo so nothing can break before it."

## Destructive actions (delete service/volume/project, drop tables)

1. **Backup first, always.** For a database: take a volume backup or `pg_dump` export before deletion — even if "unused". Unused ≠ empty.
2. **Verify nothing references it**: check other services' variables for its connection string before deleting.
3. **Confirm with the owner in plain English**, stating what is lost and that it's permanent.
4. Never batch a destructive action with other work in one step.

## Deploys

1. **Verify target immediately before `railway up`**: run `railway status` and confirm project, **environment**, and service are what you intend. Never assume the link is right.
2. **Never report success on "build queued."** Poll `railway deployment list --json` until status is `SUCCESS`. `FAILED`/`CRASHED` → read build/runtime logs, triage, never claim success.
3. After success, confirm in owner language: "Your latest code is live."

## Vague complaints ("slow", "expensive", "broken")

Diagnose before acting: `railway metrics --since 24h`, `railway logs`, deployment history. Report findings and the cheapest fix — don't execute the owner's guessed solution (e.g. "delete the database") as if it were the diagnosis. If they also need something shipped urgently, ship first, diagnose second.

## Quick reference

| Intent | Command |
|---|---|
| Where am I pointed? | `railway status --json` |
| Deploy current folder | `railway up --detach`, then poll `railway deployment list --json` |
| Add database | `railway add --database postgres --json` |
| Wire app → DB | set `DATABASE_URL = ${{Postgres.DATABASE_URL}}` (reference variable, private network) |
| Logs / metrics | `railway logs --lines 200` / `railway metrics --since 1h` |
| Variables | `railway variable list/set --service <svc>` (changes trigger a redeploy — tell the owner) |
| Domain | `railway domain` or add custom + give owner the CNAME record |

## Communication rules

- Plain English only: "the app's address" not "CNAME", "settings" not "env vars" — unless the owner asks for detail.
- Every action ends with: what was done, the result, what (if anything) they must do.
- Costs: name the monthly impact when creating or deleting services.

## Red flags — STOP

- About to delete anything without a backup taken this session
- About to `railway up` without having just seen `railway status`
- About to say "deployed" without seeing `SUCCESS`
- Executing a destructive request minutes before the owner's deadline
- "The owner told me to, so confirmation is implied" — urgency is not consent to data loss

## Common rationalizations

| Excuse | Reality |
|---|---|
| "It's unused, no backup needed" | Unused services still hold data. Backup takes 1 minute. |
| "No time — they have a demo" | Deletion saves money *per month*; 10 minutes changes nothing. Defer it. |
| "Build started, so it's deployed" | Queued ≠ live. Poll until `SUCCESS`. |
| "The link was right yesterday" | Links change. `railway status` before every deploy. |
