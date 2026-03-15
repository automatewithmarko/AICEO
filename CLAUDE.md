# PurelyPersonal AI CEO

## Deployment

3 Railway backend services + Netlify frontend + shared Supabase instance.

### Railway Projects

| Railway Project | Service | Root Dir | Purpose |
|---|---|---|---|
| `aiceo-backend` | Main backend | `backend/` | AI CEO orchestrator (Grok), marketing agents (Claude), sales, CRM, email, integrations, outlier detector |
| `purelypersonal-backend` | PurelyPersonal API | `purelypersonal-backend/` | Meeting intelligence — Recall.ai bots, transcription, calendar, contact linking |
| `gleaming-encouragement` | Landing Page Agent | `landing-page-agent/` | Lightweight Claude-powered landing page HTML generator |

### Frontend

- **Platform:** Netlify
- **Framework:** Vite + React
- **Build:** `npm run build` → `dist/`
- Connects to all 3 backends via `VITE_API_URL`, `VITE_PP_API_URL`, `VITE_LANDING_AGENT_URL`

### Shared Infrastructure

- **Supabase:** Single shared instance for all services
  - Backends use `SUPABASE_SERVICE_ROLE_KEY` (bypasses RLS)
  - Frontend uses `VITE_SUPABASE_ANON_KEY` (respects RLS)
  - Edge Functions handle email sending (bypasses Railway SMTP port blocking)

### Key Details

- All Railway services use Dockerfiles, port `8080` (landing agent defaults `3002`)
- Health checks: `GET /health` on all services
- Restart policy: `ON_FAILURE`, max 10 retries
- Netlify: SPA redirects + `/api/xai/*` proxy to `https://api.x.ai`
