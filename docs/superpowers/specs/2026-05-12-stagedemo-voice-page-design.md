# Stage Demo — Voice-First AI CEO Page

## Overview

A `/stagedemo` route (behind login) providing a cinematic, voice-first AI CEO experience for live stage demos. User speaks to an AI CEO via OpenAI Realtime API, the AI asks discovery questions via voice, then generates marketing assets (newsletters, landing pages, etc.) using existing Anthropic-powered backend agents. Generated artifacts are revealed with theatrical animations.

## Tech Stack

- **Voice:** OpenAI Realtime API (ephemeral token, browser-direct WebSocket)
- **3D Blob:** Three.js via react-three-fiber + custom GLSL shaders
- **Animations:** framer-motion (page transitions, artifact panel entrance)
- **Frontend:** React 19, Vite, react-router-dom v7
- **Backend:** Express (new `/api/stagedemo` routes), delegates to existing agents

## Page States

### State 1: Idle
- Full black screen (`#000`), no app chrome
- HUD: top-left "SESSION · LIVE" (red dot), top-center "AI CEO", top-right version tag
- Center: Three.js orb with subtle breathing animation, dark red inner glow, concentric ring pulses
- Mic icon overlaid on orb (HTML, not 3D)
- Below orb: "SPACE OR TAP TO BRIEF YOUR CEO" (monospace, dim)
- Interaction: press/hold space or click orb → State 2

### State 2: Listening (user speaking)
- Orb expands, vertex displacement driven by mic audio analyser frequency data
- Color palette shifts red → pink → purple with amplitude
- Top: "LISTENING" badge with pulsing red dot
- Bottom: "Done speaking" button (or release space)
- Input mode: push-to-talk (hold space) for stage robustness — no VAD

### State 3: AI Speaking
- Orb animation driven by AI audio output amplitude
- Smoother, more rhythmic vertex displacement than user audio
- No user controls visible (clean stage look)
- User can barge-in by pressing space

### State 4: Artifact Reveal
- Triggered when backend agent returns generated HTML
- Transition sequence:
  1. Orb shrinks with spring physics
  2. 3D card loading animation (cards assembling/spinning) — 2-3 seconds
  3. Cards converge into artifact panel — slides up with spring animation
- Artifact panel: new dark-themed minimal component, HTML rendered in sandboxed iframe
- Voice bar docked at bottom: compact waveform strip, mic still active
- User can keep talking to edit ("change the headline", "make it shorter")
- Dismiss artifact (X or voice) → panel animates out, orb re-expands

## Voice Architecture

### Connection Flow
1. Page load → fetch brand DNA, soul, products, contacts (existing APIs)
2. User presses space → `POST /api/stagedemo/session` → backend creates OpenAI Realtime session with ephemeral token
3. Backend injects system prompt: CEO persona + brand context + voice-optimized instructions
4. Returns ephemeral token to frontend
5. Frontend opens WebSocket directly to OpenAI Realtime API
6. Bidirectional audio streaming begins

### System Prompt
CEO persona (from existing orchestrate.js), adapted for voice:
- Brand DNA (colors, fonts, description, tagline)
- Soul notes (user personality, preferences)
- Product catalog summary
- Voice-specific: keep responses to 2-3 sentences, ask one question at a time, be conversational and opinionated
- Discovery flow: ask 3-4 questions before generating, then call the appropriate tool

### Tools (defined in Realtime session config)

| Tool | Params | Backend handler |
|---|---|---|
| `generate_newsletter` | topic, audience, tone, cta | Runs newsletter agent |
| `generate_landing_page` | topic, audience, style, cta | Runs landing-page agent |
| `generate_squeeze_page` | topic, audience, offer, cta | Runs squeeze-page agent |
| `generate_story_sequence` | topic, audience, goal, visual_style | Runs story-sequence agent |
| `generate_lead_magnet` | niche, audience, pain_point, format | Runs lead-magnet agent |
| `generate_dm_automation` | platform, goal, product, audience | Runs dm-automation agent |
| `edit_artifact` | instruction | Runs edit flow on current HTML |

### Tool Execution Flow
1. OpenAI emits `response.function_call_arguments.done` event
2. Frontend enters State 4 (loading animation)
3. Frontend calls `POST /api/stagedemo/generate` with tool name, args, auth token
4. Backend loads brand context, runs the matching agent (existing code, unchanged)
5. Backend returns `{ html, agent, title }`
6. Frontend feeds tool result summary back to OpenAI ("Newsletter generated successfully")
7. OpenAI speaks confirmation ("Here's your newsletter, take a look")
8. Frontend reveals artifact panel with the HTML

### Edit Flow (via voice)
1. User says "change the headline to X" while artifact is showing
2. OpenAI calls `edit_artifact` tool with instruction
3. Frontend sends current HTML + instruction to `POST /api/stagedemo/generate` with `mode: "edit"`
4. Backend runs the existing file-based edit flow (replace_text / replace_section)
5. Returns updated HTML
6. Frontend updates iframe, OpenAI speaks confirmation

## Robustness

- **Push-to-talk** — no VAD, no false triggers from audience/speaker noise
- **Auto-reconnect** — 3 retries with exponential backoff on WebSocket drop
- **Connection-lost UI** — "Connection lost — tap to reconnect" if all retries fail
- **Generation timeout** — 60s max, voice feedback at 15s ("still working on it")
- **Ephemeral token** — API key never reaches the browser
- **Graceful degradation** — if generation fails, voice AI says "something went wrong, let me try again" and retries once

## New Files

### Frontend
- `src/pages/StageDemo.jsx` — main page component, state machine, layout
- `src/components/stagedemo/VoiceOrb.jsx` — Three.js r3f orb with GLSL shaders
- `src/components/stagedemo/VoiceBar.jsx` — compact bottom waveform bar (active during artifact view)
- `src/components/stagedemo/ArtifactReveal.jsx` — dark-themed artifact panel with iframe
- `src/components/stagedemo/CardLoader.jsx` — 3D card assembly loading animation
- `src/hooks/useRealtimeVoice.js` — OpenAI Realtime WebSocket hook (connect, send audio, receive audio, handle tool calls)
- `src/hooks/useAudioAnalyser.js` — mic audio analyser (frequency data for orb)

### Backend
- `backend/routes/stagedemo.js` — two endpoints:
  - `POST /api/stagedemo/session` — create ephemeral token with system prompt + tools
  - `POST /api/stagedemo/generate` — run agent or edit, return HTML

### Shader
- `src/components/stagedemo/blobShader.js` — GLSL vertex/fragment shaders for the fluid orb

## Route Registration
- Add `/stagedemo` to `src/App.jsx` (behind `ProtectedRoute`)
- Mount `stagedemo.js` router in Express app

## Dependencies to Add
- `three` — 3D engine
- `@react-three/fiber` — React renderer for Three.js
- `@react-three/drei` — helpers (if needed)
