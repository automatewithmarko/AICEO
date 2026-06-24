// Shared helpers for resilient AI image generation in newsletter /
// landing page / squeeze HTML produced by our agents.
//
// Why this exists: a single generateImage call fails ~10-15% of the
// time in production — Gemini's safety filter trips, the upstream
// 502s, or it returns a 200 with no image. With a single attempt the
// user sees a red "Image generation failed" placeholder in their
// newsletter and has to ask us to retry. Add a retry loop and most
// of those failures resolve transparently.
//
// When even retries fail, the better UX is to DELETE the broken
// image rather than leave a placeholder — a newsletter with a
// missing image still reads fine; a newsletter with a red error
// rectangle looks broken.

import { generateImage } from './api';

// Default backoffs are BEFORE attempts 2..N. 5 attempts total at:
// 0ms, 800ms, 1.5s, 3s, 5s — worst case ~10s per image. Images run
// in parallel across the document so total wall-clock stays bounded.
const DEFAULT_BACKOFF_MS = [800, 1500, 3000, 5000];

// Generate an image, retrying on transient failures. Mirrors the
// behavior the StageDemo helper has shipped with for weeks:
//   - bail immediately on AbortError (user navigated away)
//   - bail immediately on HTTP 4xx-shaped errors (won't recover)
//   - retry on thrown network errors, 5xx, and the "200-but-no-image"
//     shape generateImage returns when safety filters trip
export async function generateImageWithRetry(prompt, platform, brandData, referenceImages, opts, retryConfig = {}) {
  const backoffs = retryConfig.backoffsMs || DEFAULT_BACKOFF_MS;
  const maxAttempts = backoffs.length + 1;
  let lastErr = null;
  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    try {
      const result = await generateImage(prompt, platform, brandData, referenceImages, opts);
      if (result?.image) return result;
      // 200 but no image — Gemini safety filter or transient. Retry by
      // falling through as if we'd thrown.
      lastErr = new Error('generateImage returned no image');
    } catch (e) {
      if (e?.name === 'AbortError') throw e;
      // 4xx errors look like "HTTP 4xx" — no point retrying.
      const msg = String(e?.message || '');
      if (/^HTTP 4\d\d/.test(msg)) throw e;
      lastErr = e;
    }
    if (attempt < maxAttempts - 1) {
      await new Promise(r => setTimeout(r, backoffs[attempt]));
    }
  }
  throw lastErr || new Error('generateImage failed after retries');
}

// Strip a failed {{GENERATE:...}} placeholder from a newsletter / landing
// page HTML blob. If the placeholder lives inside an <img> tag's
// attribute (the common case — `<img src="{{GENERATE:...}}" ... />`),
// remove the entire <img> element so the layout reflows cleanly with no
// broken image box. If it lives somewhere else (e.g. inside a CSS
// `background-image: url('{{GENERATE:...}}')`), strip just the marker
// so the surrounding CSS becomes a no-op (`url('')`).
export function removeFailedImagePlaceholder(html, fullPlaceholder) {
  if (!html || !fullPlaceholder) return html;
  const escapeRegex = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const ph = escapeRegex(fullPlaceholder);
  // Anchor on the <img tag opening, scan attributes up to the closing
  // bracket. `[^>]*?` is non-greedy so we don't span sibling tags.
  const imgTagRegex = new RegExp(`<img\\b[^>]*?${ph}[^>]*?>`, 'gi');
  const stripped = html.replace(imgTagRegex, '');
  if (stripped !== html) return stripped;
  // Fallback — placeholder isn't inside an <img>. Just delete the
  // marker. (Removing a wrapping <figure>/<div> is risky without a
  // proper DOM parse, and leaving an empty wrapper is harmless.)
  return html.replaceAll(fullPlaceholder, '');
}
