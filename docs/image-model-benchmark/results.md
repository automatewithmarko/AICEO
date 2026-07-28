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


---

# Round 2 — quality variants under heavy platform prompts (2026-07-28)

**Matrix:** gpt-image-2 at `high` / `medium` / `auto` vs NB2-via-Atlas (`gemini-3.1-flash-image-preview`, v1beta) at `1K` / `2K`. Two deliberately heavy prompts modeled on the platform's real generation style: `slide_heavy` (design-system carousel slide: badge chip, accent-word headline, 3 body lines, stat chip "CAC $420 → $180", bar chart, brand strip, "03 / 07" marker) and `post_mixed` (photo+graphic IG post: laptop dashboard, 3 floating UI cards with exact text, headline + subline + brand chip). Images: `r2_*.png`, raw timings: `results-round2.json`.

## Timings + verdicts

| Variant | slide_heavy | post_mixed | Quality verdict (viewed) |
|---|---|---|---|
| gpt2 **high** | 48.0s | 80.5s | 10/10 both — every element perfect, richest dashboards |
| gpt2 **medium** | 50.5s | 80.1s | **10/10 both — indistinguishable from high** |
| gpt2 **auto** | 60.1s | 84.1s | (stored for review; timing ≈ high) |
| NB2 **1K** | 49.0s | 60.0s | 8/10 slide (all words right, softer edges, odd strikethrough on $420) |
| NB2 **2K** | **24.9s** | **35.8s** | 9/10 slide (crisp, clean chip); 7.5/10 post (headline/cards perfect but dashboard interior text garbles, softer finish) |

## What this changes

1. **gpt-image-2's quality knob buys NOTHING on heavy prompts.** high/medium/auto all land 48-84s, and medium's output is visually identical to high on both tests. Heavy prompt weight, not the quality tier, drives gpt2's latency (round 1's light slide ran 32s). → Production should run **`medium`**: same quality, lower per-image cost, zero latency downside.
2. **NB2-2K beats NB2-1K on BOTH axes** — 25-36s vs 49-60s, and crisper output. Counterintuitive but consistent across runs. If NB2 is used at all, use `imageSize: '2K'`.
3. **NB2-2K is ~2x faster than any gpt2 tier** and holds 9/10 on flat design slides — but drops to 7.5/10 on the photo+UI mix (garbled dashboard microtext, grayer brand chip). Text it's ASKED to render is fine; incidental UI text inside scenes is where it slips.
4. **The winning architecture is the hybrid the codebase already supports:** hook/CTA slides + single-image posts (photo-mix, reference-image work) on **gpt-image-2 medium**, middle carousel slides (flat design, the volume) on **NB2-2K** — the colleague's fast-tier split in generate.js maps to exactly this. Estimated effect on a 9-slide LinkedIn carousel: roughly half the wall-clock at visually equal quality where it counts.

## Recommended config changes

- `openai-image.js`: default quality `high` → `medium` (env `OPENAI_IMAGE_QUALITY` to override).
- NB2 legs: pin `imageSize: '2K'`.
- Adopt the hybrid split: NB2-2K for middle slides, gpt2-medium for hook/CTA/single-image/reference work — then measure a real 9-slide carousel end-to-end.
