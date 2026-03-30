# Edit Landing Page AI

You are editing the landing page generation system for the PurelyPersonal AI CEO platform. The user will describe what they want changed about how landing pages are generated (design, copy, structure, prompts, image generation, etc.).

## Architecture Overview

Landing pages are generated through TWO paths that must stay in sync:

### Path 1: Marketing AI (frontend direct)
- **File**: `src/pages/Marketing.jsx`
- **Location**: `TOOL_CONFIGS.landing.systemPrompt` (around line 72) — this is a template literal string with `\n` for newlines
- **How it works**: The Marketing page sends this system prompt directly to the backend orchestrator via `streamFromBackend('/api/orchestrate', { agent: 'landing', ... })`
- **Note**: Landing pages use `{"type":"html","html":"..."}` response format (NOT `"type":"newsletter"`)

### Path 2: AI CEO delegation (backend agent)
- **File**: `backend/agents/landing-page.js`
- **Location**: `SYSTEM_PROMPT` constant — this is the full agent system prompt with all design rules
- **How it works**: When the AI CEO delegates to the landing-page agent, the orchestrator uses this prompt via `agent.buildSystemPrompt(brandDna)`
- **Orchestration wrapper**: `backend/routes/orchestrate.js` — the `handleAgentDelegation` function wraps the task with `designRules` (search for `isLandingAgent`). These rules are applied ON TOP of the agent prompt when delegating from AI CEO.

### Path 3: Squeeze pages (variant)
- **Frontend**: `src/pages/Marketing.jsx` — `TOOL_CONFIGS.squeeze.systemPrompt`
- **Backend**: `backend/agents/squeeze-page.js`
- Squeeze pages are narrower (600px) lead-capture focused variants of landing pages

## Image Generation for Landing Pages
- **File**: `backend/routes/generate.js`
- **Platform rules**: `PLATFORM_IMAGE_RULES.landing_page` — controls what Gemini generates for `{{GENERATE:...}}` placeholders
- **Quality rules**: Conditional based on platform (line ~363) — landing pages use general quality rules
- Landing pages use `{{GENERATE:prompt}}` placeholders in the HTML that get replaced with AI-generated images

## Key Design Principles (current)
- Pages should look like $10k+ agency builds (Stripe, Reddit Business quality)
- Bold hero with gradient/dark background, NOT plain white
- Visual rhythm: alternate section backgrounds (white, light gray, one dark section)
- Cards with shadows, hover effects (translateY), border-radius 16px
- Large pill-shaped CTA buttons with box-shadow
- Fluid typography with clamp()
- Section heading pill badges
- CSS grid for features (2-3 columns)
- Testimonials: NEVER fake — must ask user for real data or use placeholders
- Icons: ALWAYS inline SVG, NEVER emoji
- All images: `{{GENERATE:...}}` placeholders, never placeholder.com URLs
- Section markers: `<!-- SECTION:name --> ... <!-- /SECTION:name -->`
- Required sections: nav, hero, social-proof, features, testimonials, how-it-works, faq, final-cta, footer

## JSON Parsing
- Both `Marketing.jsx` and `AiCeo.jsx` have `fixJsonNewlines()` that handles raw newlines in JSON strings
- The `tryParseAIResponse()` function in Marketing.jsx handles multiple parse strategies
- Landing pages return `{"type":"html","html":"<full HTML>","summary":"..."}` — NOT `"type":"newsletter"`

## When Making Changes

1. **Design/prompt changes**: Update ALL THREE locations (Marketing.jsx landing prompt, backend agent prompt, orchestrate.js design rules) to stay in sync
2. **Image generation changes**: Update `backend/routes/generate.js` — the `PLATFORM_IMAGE_RULES.landing_page` section
3. **After making changes**: Build with `npx vite build` and deploy with `railway up` (from the project root `/Users/bazil/Documents/AICEO/`, NOT the backend folder)

## Deployment

After editing, ALWAYS:
```bash
npx vite build  # verify no build errors
railway up       # deploy from project root
```

The Railway project is `aiceo-backend` linked to production. Deploy from the ROOT folder (`/Users/bazil/Documents/AICEO/`), not the backend folder.

---

Now apply the user's requested changes to the landing page system. Edit all relevant files, build, and deploy.

User's request: $ARGUMENTS
