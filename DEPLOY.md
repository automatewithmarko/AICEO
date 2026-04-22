# Deployment & Environment Guide

**Read this before pushing, deploying, or changing env vars.**
Future Claude instances (and humans): these rules exist to keep production safe now that AICEO has live users.

---

## Environment matrix

| Thing | Production | Dev / Staging |
|---|---|---|
| **Git branch** | `main` | `dev` |
| **Frontend (Netlify)** | `https://aiceoproduction.netlify.app` *(auto-deploys on push to `main`)* | `https://aiceo-dev.netlify.app` *(auto-deploys on push to `dev`)* |
| **Backend (Railway)** | `https://aiceo-backend-production.up.railway.app` *(or equivalent)* — service `aiceo-backend`, environment `production`. **CLI-only deploy** — pushing to `main` does NOT auto-deploy to Railway. The user runs `railway up` against the `production` environment themselves when they're ready to ship. | `https://aiceo-backend-dev.up.railway.app` — service `aiceo-backend`, environment `dev`. **CLI-only deploy** — `railway up` against the `dev` environment. GitHub integration is disabled on this env too. |
| **Database (Supabase)** | Shared — same project for both envs (dev writes affect prod data) | Shared |
| **Stripe** | Live keys | Test keys *(webhook secret still missing — billing tests will fail signature check until secret is added)* |
| **LinkedIn OAuth redirect URI** | `https://aiceo-backend-production.up.railway.app/api/integrations/linkedin/callback` | `https://aiceo-backend-dev.up.railway.app/api/integrations/linkedin/callback` — must be added to the LinkedIn dev app's allowed redirect URIs |

---

## Hard rules (do not violate without explicit user request)

1. **Never push to `main`.** Push to `dev` only. Promote to `main` only when the user explicitly says *"merge"*, *"promote"*, *"ship to main"*, *"release"*, or similar.
2. **Never run `railway up` against the `production` environment.** The `production` env deploys via CLI, but only the user runs that deploy — Claude should not trigger it. If you accidentally run `railway up` while `production` is the active env, you ship whatever is in the local working tree directly to live users.
3. **Always verify the active Railway environment before `railway up`.** Run `railway status` first. If it says `Environment: production`, switch with `railway environment dev` BEFORE deploying.
4. **Pushing to `main` does NOT auto-deploy Railway.** Railway production is CLI-only. Frontend (Netlify) does auto-deploy `main` → `aiceoproduction.netlify.app`, but backend stays on the previous version until the user explicitly runs `railway up` with the production env active.
5. **Never commit secrets.** `.env` stays local. Railway dashboard and Netlify dashboard hold the server/client env vars.
6. **Shared database means:** dev writes (scheduled posts, templates, brand DNA changes, etc.) can land in the same `social_posts` / `brand_dna` / etc. tables that production users read. Use a test account on dev. Avoid "Publish now" unless you actually want to post to a real connected account.

---

## How to ship changes

### Normal dev iteration

```bash
# 1. make changes
git add <files>
git commit -m "…"

# 2. push to dev (Netlify auto-deploys aiceo-dev.netlify.app)
git push origin HEAD:dev    # or: git checkout dev && git push origin dev

# 3. if backend changed, deploy backend to Railway dev env
railway status               # confirm Environment: production ← you need to switch
railway environment dev
railway service aiceo-backend
railway up --detach          # uploads local tree and deploys to dev env
railway environment production   # optional — reset so future commands don't accidentally target dev
```

### Promoting dev → production (only when user asks)

```bash
# 1. merge git — Claude may do this when asked
git checkout main
git pull origin main
git merge --no-ff origin/dev -m "Promote dev → main"
git push origin main

# 2. Netlify will auto-deploy main → aiceoproduction.netlify.app (frontend).
# 3. Railway production backend stays on the OLD version until the user
#    explicitly deploys it themselves. The user runs:
#       railway environment production
#       railway service aiceo-backend
#       railway up --detach
#       railway environment dev   # reset
#    Claude does NOT run these commands unless explicitly told.
```

---

## Env vars that must differ between prod and dev

Railway → `aiceo-backend` project → switch to the right env → Variables tab.

| Var | Prod value (example) | Dev value |
|---|---|---|
| `FRONTEND_URL` | `https://aiceoproduction.netlify.app` | `https://aiceo-dev.netlify.app` |
| `API_BASE_URL` | Railway prod domain | `https://aiceo-backend-dev.up.railway.app` |
| `STRIPE_SECRET_KEY` | `sk_live_…` | `sk_test_…` |
| `STRIPE_WEBHOOK_SECRET` | live webhook signing secret | dev webhook signing secret *(TODO — user will add when ready)* |
| `VITE_API_URL` *(Netlify)* | prod Railway URL | `https://aiceo-backend-dev.up.railway.app` |

**Shared across both** (same values): `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `SUPABASE_ANON_KEY` *(because the DB is shared — see above)*, `GEMINI_API_KEY`, `ANTHROPIC_API_KEY`, `XAI_API_KEY`, `APIFY_TOKEN`, `BOOSEND_API_KEY`, etc.

---

## External integrations to watch

- **Stripe webhooks** — one per environment. Prod webhook → prod URL, dev webhook → dev URL. Do not point a dev webhook at prod or vice versa.
- **LinkedIn OAuth app** — redirect URIs allow-list must include both prod AND dev callback URLs. If you add a new deployment domain, add it here too.
- **BooSend** (Instagram publishing pipeline) — same API key for both; no per-env config needed unless BooSend ships a sandbox.
- **Stripe Connect / OAuth** — redirect URIs same story as LinkedIn.

---

## Commit message conventions

- `feat(area): …` — new feature
- `fix(area): …` — bug fix
- `refactor/chore/docs: …` — non-feature
- Body should explain *why* more than *what* — the diff shows what.
- Sign with `Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>` when Claude assisted.

---

## When stuck / unsure

- `git status` + `git log --oneline -5` → where we are
- `git fetch --all --prune && git log --oneline origin/main..origin/dev` → what's on dev but not main
- `railway status` → which Railway env is linked locally
- `railway environment list` → all Railway envs
- Netlify site settings → Deploys → most recent build per branch

When genuinely unsure about a destructive action (deploy to prod, force push, destructive migration, etc.) — **ask the user first.** Better to pause than to ship a regression to live users.

---

*Last reviewed: 2026-04-22. Update when deployment architecture changes.*
