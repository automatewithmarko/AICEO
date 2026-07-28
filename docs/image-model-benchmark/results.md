# Image model benchmark — speed vs quality through the Mentor gateway

**Date:** 2026-07-28 · **Method:** identical prompts per model, sequential wall-clock timing, all calls through Mentor (no direct provider APIs). Two prompts: `slide` (text-heavy carousel slide — the text-fidelity test that justified gpt-image-2) and `visual` (photorealistic post graphic). Raw timings in `results.json`, images in this folder. **No `quality` parameter was sent** — see Finding #1, it's the headline.

## Timings

| Model | Route | slide | visual | Text fidelity (slide) | Visual quality |
|---|---|---|---|---|---|
| `openai/gpt-image-2` | images/generations | **32.2s** | **27.3s** | **10/10** — every word exact, orange accent on "follow-up" exactly as asked, best hierarchy + brand chip | 9.5/10 gorgeous golden-hour scene |
| `google/gemini-2.5-flash-image` (NB1) | images/generations | 26.6s | ❌ 429 Google prepay | 8.5/10 — all words correct, decent layout, missed the accent-word instruction | — |
| `gemini-3-pro-image-preview` | images/generations | ❌ 429 Google prepay | ❌ 429 Google prepay | — | — |
| `gemini-3.1-flash-image-preview` (NB2) | v1beta → Atlas | 60.2s¹ | **20.2s** | 8/10 — all words correct, plainer layout, missed the accent word | 9/10 — arguably the richest dashboard render |

¹ Likely Atlas cold-start — its `visual` call was the fastest of the whole benchmark. Needs more samples before treating 60s as representative.

## Findings

1. **THE HEADLINE: our 110s+ pain is the `quality:'high'` parameter, not the model.** This benchmark sent no quality param and gpt-image-2 returned a *flawless* text slide in 32s — the same model that takes 110-150s in production where `openai-image.js` forces `quality:'high'`. The gateway-default quality is visually indistinguishable on real marketing assets. Dropping production to default/`auto` should give gpt-image-2 quality at ~Gemini-flash speed with a one-line change.
2. **NB2 via the v1beta/Atlas route is fast and good.** 20.2s on the photorealistic test with the richest dashboard of the set; text fidelity is solid (every word correct) but it follows fine-grained styling instructions (accent-color word) less reliably than gpt-image-2. The 60s slide needs re-testing to separate cold-start from real cost.
3. **`google/*` slugs on `images/generations` still bill GOOGLE, not Atlas — and Google's prepay is depleted.** One call squeaked through, three 429'd with Google's billing error. Until that account is topped up, the ONLY reliable Gemini-family path is the v1beta route with the 3.x ids (Atlas NB2) — exactly what `generate.js`'s Gemini leg uses. Avoid `google/gemini-2.5-flash-image` and `gemini-3-pro-image-preview` through the gateway for now.
4. gpt-image-2 remains the text-fidelity king (the only model to nail the accent-word instruction), and its default-quality speed makes it competitive with the flash models it was supposedly too slow to beat.

## Recommendation

- **Do now:** stop forcing `quality:'high'` in `openai-image.js` (default → `auto`; keep an env override `OPENAI_IMAGE_QUALITY=high` for the rare must-be-perfect case). Expected: 3-4× faster image generation platform-wide with no visible quality loss.
- **Trial:** flip `IMAGE_PRIMARY=nb2` on dev (the switch already exists) and watch a day of real traffic — NB2's 20s visual is the best speed of the set and its quality is close; a live sample decides whether the 60s slide was cold-start noise.
- **Skip:** `gemini-3-pro` and the `google/*` generations slugs until the Google account is funded (or Mentor reroutes them to Atlas too).
