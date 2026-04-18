# PurelyPersonal AI CEO - Deployment Guide

## Architecture

3 Railway backend services + Netlify frontend + shared Supabase instance.

```
                       Netlify (Frontend)
                      /        |         \
        VITE_API_URL    VITE_PP_API_URL    VITE_LANDING_AGENT_URL
                   /           |                    \
                  v            v                     v
        aiceo-backend   purelypersonal-api   landing-page-agent
              |                |
              v                v
           Supabase (shared instance)
```

---

## Service 1: aiceo-backend-production

The main backend. Handles everything related to the AI CEO, marketing, sales, content, and integrations.

### What it does

**AI CEO Orchestrator** (`routes/orchestrate.js`)
- Powers the AI CEO chat page. User talks to the CEO, CEO decides what to do.
- Uses XAI Grok for the CEO brain with tool calling (ask_user, delegate_to_agent, create_artifact, send_email, save_to_soul, push_notification).
- When the CEO needs to create marketing assets, it delegates to specialist agents.

**Marketing Agents** (`agents/`)
- `newsletter.js` - Generates branded HTML email newsletters
- `landing-page.js` - Builds full landing pages with hero, features, testimonials, CTAs
- `squeeze-page.js` - Lead capture / opt-in pages
- `story-sequence.js` - Instagram story sequences with image prompts
- `lead-magnet.js` - PDFs, checklists, guides
- `dm-automation.js` - DM sequences for Instagram, LinkedIn, Twitter
- All agents use Anthropic Claude. They take brand DNA (colors, fonts, photos, logo) and generate brand-consistent output.
- Supports both generation and file-based editing (surgical find/replace edits on existing HTML).

**Sales Dashboard** (`routes/sales.js`)
- Revenue tracking from Stripe, Whop, Shopify, Kajabi, GoHighLevel
- Manual sale entry
- Call intelligence - pulls transcripts from PurelyPersonal meetings
- Call type tagging (sales call, coaching, client, other) and status tracking

**Contacts & CRM** (`routes/contacts.js`)
- Contact management with import/export
- Tags, stages, notes
- Links contacts to sales and email history

**Email** (`routes/email.js`, `services/imap.js`, `services/smtp.js`, `services/email-sender.js`)
- Full inbox: IMAP fetch, SMTP send, reply threading
- Email account connection (Gmail, Outlook, custom SMTP)
- Sends newsletters via Supabase Edge Function (bypasses Railway SMTP port blocking)

**Integrations** (`routes/integrations.js`, `services/integrations/`)
- Stripe, Whop, Shopify, Kajabi - revenue/sales data sync
- GoHighLevel - CRM sync (contacts, opportunities, pipelines)
- Netlify - deploy generated landing pages

**Outlier Detector** (in `server.js`, `services/youtube.js`, `services/tiktok.js`, `services/instagram.js`)
- Follow creators on YouTube, TikTok, Instagram
- Fetches their recent content and calculates which posts are outliers (2x, 5x, 10x above their average)
- YouTube filters out Shorts, only shows long-form

**Content & Brand** (`services/context.js`, `services/documents.js`, `services/social.js`)
- Brand DNA storage (description, colors, fonts, logo, photos, uploaded docs)
- Content items (uploaded docs with text extraction, social media references)
- Soul file (persistent user memory across conversations)
- Image generation via OpenAI

**Webhooks** (`routes/webhooks.js`)
- Stripe webhook for payment events

### Deployment

| Setting | Value |
|---|---|
| Root directory | `backend/` |
| Build | Dockerfile (node:22-slim + python3, ffmpeg, yt-dlp) |
| Start | `node server.js` |
| Health check | `GET /health` |

### Environment Variables

| Variable | Required | What it's for |
|---|---|---|
| `PORT` | Yes | `8080` |
| `SUPABASE_URL` | Yes | Supabase project URL |
| `SUPABASE_SERVICE_ROLE_KEY` | Yes | Supabase service role key |
| `ANTHROPIC_API_KEY` | Yes | Claude API - all marketing agents |
| `XAI_API_KEY` | Yes | Grok API - CEO orchestrator + research |
| `OPENAI_API_KEY` | Yes | Image generation |
| `GEMINI_API_KEY` | Optional | Alternative model |
| `YOUTUBE_API_KEY` | Optional | Outlier detector YouTube |
| `RAPIDAPI_KEY` | Optional | Outlier detector TikTok/Instagram |
| `RESEND_API_KEY` | Optional | Transactional email |
| `RESEND_FROM_EMAIL` | Optional | Default from address |
| `LANDING_AGENT_URL` | Optional | Landing page agent service URL |
| `FRONTEND_URL` | Optional | For CORS |

---

## Service 2: purelypersonal-api-production

The meeting intelligence backend. Handles everything related to the PurelyPersonal Call Assistant - joining meetings, recording, transcribing, and AI-powered analysis.

### What it does

**Meeting Bot Management** (`routes/bots.js`, `services/recall.js`)
- Creates Recall.ai bots that join Zoom, Google Meet, and Teams calls
- Sends bot to a meeting URL, bot records audio/video
- Tracks bot status (joining, in_call, done, etc.)
- Configurable bot name and image

**Transcription & AI Processing** (`routes/transcripts.js`, `services/ai-processor.js`)
- Pulls transcripts from Recall.ai after meeting ends
- AI-powered meeting analysis using XAI Grok:
  - Summary generation
  - Action items extraction
  - Key topics identification
  - Sentiment analysis
- Processes transcripts automatically via webhooks

**Meeting Management** (`routes/meetings.js`)
- CRUD for meetings (create, list, get, update, delete)
- Links meetings to contacts
- Stores meeting metadata (platform, duration, participants)
- Meeting search and filtering

**Calendar Integration** (`routes/calendar.js`)
- Google Calendar OAuth flow
- Fetches upcoming meetings
- Auto-join: can automatically send bot to scheduled meetings

**Webhooks** (`routes/webhooks.js`)
- Receives Recall.ai webhooks (bot status changes, recording ready)
- Svix webhook verification for security
- Triggers transcript processing when recording is complete

**Contact Linking** (`services/contact-linker.js`)
- Links meeting participants to contacts in the CRM
- Matches by email or name

**Meeting Sharing** (`routes/share.js`)
- Generate shareable links for meeting summaries
- Public access to meeting notes without auth

**Templates** (`routes/templates.js`)
- Save and manage meeting note templates
- Apply templates to format meeting outputs

**Search** (`routes/search.js`)
- Full-text search across meetings and transcripts

### Deployment

| Setting | Value |
|---|---|
| Root directory | `purelypersonal-backend/` |
| Build | Dockerfile (node:22-slim) |
| Start | `node server.js` |
| Health check | `GET /health` (configured in railway.json) |

### Environment Variables

| Variable | Required | What it's for |
|---|---|---|
| `PORT` | Yes | `8080` |
| `SUPABASE_URL` | Yes | Same Supabase instance |
| `SUPABASE_SERVICE_ROLE_KEY` | Yes | Same service role key |
| `XAI_API_KEY` | Yes | Call analysis and summaries |
| `RECALL_API_KEY` | Yes | Recall.ai - bot creation and management |
| `RECALL_REGION` | Yes | Recall.ai region, e.g. `us-west-2` |
| `RECALL_WEBHOOK_SECRET` | Yes | Svix secret for webhook verification |
| `API_BASE_URL` | Yes | This service's public URL (for Recall webhook callbacks) |
| `GOOGLE_CLIENT_ID` | Optional | Google Calendar OAuth |
| `GOOGLE_CLIENT_SECRET` | Optional | Google Calendar OAuth |
| `FRONTEND_URL` | Optional | OAuth redirect URL |

---

## Service 3: landing-page-agent-production

A lightweight, single-purpose service. It generates landing pages using Claude and returns the HTML.

### What it does

**Landing Page Generation** (`agent.js`, `prompts.js`)
- Receives a job request with brand context and page requirements
- Uses Anthropic Claude to generate a complete, self-contained HTML landing page
- Returns the generated HTML
- Job-based: submits a job, polls for completion (in-memory job store, auto-cleanup after 5 min)

**Endpoints:**
- `POST /generate` - Submit a landing page generation job
- `GET /status/:jobId` - Check job status and get result
- `GET /health` - Health check

### Deployment

| Setting | Value |
|---|---|
| Root directory | `landing-page-agent/` |
| Build | Dockerfile (node:20-slim) |
| Start | `node server.js` |
| Health check | `GET /health` |

### Environment Variables

| Variable | Required | What it's for |
|---|---|---|
| `PORT` | Optional | Defaults to `3002` |
| `ANTHROPIC_API_KEY` | Yes | Claude API for page generation |

---

## Frontend: Netlify

**Build command:** `npm run build`
**Publish directory:** `dist`
**Framework:** Vite + React

### Environment Variables (Netlify dashboard)

| Variable | What it's for |
|---|---|
| `VITE_SUPABASE_URL` | Supabase project URL |
| `VITE_SUPABASE_ANON_KEY` | Supabase anon key (public, not service role) |
| `VITE_API_URL` | Main backend Railway URL |
| `VITE_PP_API_URL` | PurelyPersonal backend Railway URL |
| `VITE_LANDING_AGENT_URL` | Landing page agent Railway URL |
| `VITE_XAI_API_KEY` | xAI key (used client-side on content page) |

### Netlify Config

Handled by `netlify.toml` in repo root:
- SPA redirects: all routes fallback to `/index.html`
- API proxy: `/api/xai/*` routes to `https://api.x.ai`

---
eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJsb2NhdGlvbl9pZCI6ImFXWDc5Yk1ldjhCVmJHQTFneDBYIiwidmVyc2lvbiI6MSwiaWF0IjoxNzczMjkzNzg1NDk5LCJzdWIiOiJ2TzdQWFB1S1FIdDBMN0d0RXl0NSJ9.EPwmzg-F2zc75tTjcwt9QSxmsGrKGNzN8vxwGKjBDdA

## Supabase (Shared)

All three backends connect to one Supabase instance.

- Backends use `SUPABASE_SERVICE_ROLE_KEY` (full access, bypasses RLS).
- Frontend uses `VITE_SUPABASE_ANON_KEY` (public, respects RLS).
- Supabase Edge Functions handle email sending (bypasses Railway's SMTP port restrictions).
- Auth is handled by Supabase Auth on the frontend.

---

## Railway Setup

1. Create a Railway project with 3 services.
2. Connect the same GitHub repo to all three. Set root directories:
   - Service 1: `backend`
   - Service 2: `purelypersonal-backend`
   - Service 3: `landing-page-agent`
3. Railway detects Dockerfiles automatically.
4. Set environment variables per service (see tables above).
5. Copy the generated Railway public URLs into the Netlify env vars.
6. For PurelyPersonal, set `API_BASE_URL` to its own Railway URL so Recall.ai webhooks can reach it.

All services have restart policy: ON_FAILURE, max 10 retries.
