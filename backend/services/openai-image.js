// OpenAI image generation — primary provider for /api/generate/image.
// Gemini remains available as an automatic fallback (see routes/generate.js).
//
// Model: gpt-image-2 (upgraded 2026-07-20 from gpt-image-1 after the
// founder's "no hands" finding — the key has gpt-image-2-2026-04-21
// access and both endpoints were live-verified with our exact params).
// Override with OPENAI_IMAGE_MODEL to roll back without a deploy.
// Supports both text-to-image and image-to-image (multi-reference) via
// two separate endpoints:
//   - /v1/images/generations  → text prompt only
//   - /v1/images/edits        → prompt + one or more reference images
//                               (brand logo + brand photos + user's own
//                                chat-attached image, in that order)
// NOTE: gpt-image-2 REJECTS the input_fidelity parameter (400) — do not
// add it; reference fidelity is native in this model.
//
// Aspect ratios: three sizes (1024x1024, 1536x1024, 1024x1536). Our
// platform configs use 1:1, 16:9, 9:16, 4:3, 3:4 — we map close matches.
// The image itself is still crop-safe on the consuming UI, but
// generating at the closest supported ratio keeps composition intact.
//
// Returns {ok, data, mimeType, error, status, timeout} — never throws so
// the caller can transparently fall through to Gemini on any failure.

import OpenAI from 'openai';
import { toFile } from 'openai/uploads';

const OPENAI_MODEL = process.env.OPENAI_IMAGE_MODEL || 'gpt-image-2';
// 150s default — gpt-image-2 at quality=high regularly needs >120s. The
// caller retries once at quality=medium with a shorter cap, then falls
// to Gemini; the whole chain must fit the frontend's 300s client cap.
// Per-call override via opts.timeoutMs.
const OPENAI_TIMEOUT_MS = 150_000;
// gpt-image-1 prompt cap is a few thousand tokens; our fully-built prompt
// (platform rules + brand context + quality rules + user prompt) can hit
// ~4-6k characters. OpenAI silently truncates past its limit but returns
// a valid image, so we don't pre-truncate — surfacing the truncation via
// a warning would only alarm without helping the caller.

let _client = null;
function getClient() {
  if (!_client) {
    if (!process.env.OPENAI_API_KEY) {
      throw new Error('OPENAI_API_KEY not configured');
    }
    _client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
  }
  return _client;
}

export function isOpenAIImageConfigured() {
  return !!process.env.OPENAI_API_KEY;
}

/**
 * Map a Gemini-style aspect ratio hint to the closest OpenAI supported size.
 * gpt-image-1 supports {1024x1024, 1536x1024, 1024x1536}. Anything wider
 * than 4:3 → landscape; anything taller than 3:4 → portrait; else square.
 */
function mapAspectToSize(aspectRatio) {
  if (!aspectRatio) return '1024x1024';
  const a = String(aspectRatio).toLowerCase();
  if (a === '9:16' || a === '3:4' || a === '2:3') return '1024x1536';
  if (a === '16:9' || a === '4:3' || a === '3:2') return '1536x1024';
  return '1024x1024';
}

/**
 * Map our '1K' / '2K' quality hint to OpenAI's low/medium/high/auto.
 * We default to 'high' — the whole reason to use OpenAI over Gemini is
 * text rendering + finer detail, both of which improve with higher
 * quality. If a caller ever needs to trade quality for latency they can
 * pass 'medium' explicitly.
 */
function mapQuality(hint) {
  if (hint === 'low' || hint === 'medium' || hint === 'high' || hint === 'auto') return hint;
  return 'high';
}

/**
 * Generate one image via OpenAI.
 *
 * @param {object} opts
 * @param {string} opts.prompt - the fully-composed image prompt
 * @param {Array<{data:string, mimeType:string}>} [opts.referenceImages] - base64 + mime for each ref
 * @param {string} [opts.aspectRatio] - '1:1' | '16:9' | '9:16' | '4:3' | '3:4' (Gemini shape)
 * @param {string} [opts.quality] - low|medium|high|auto (defaults to 'high')
 * @returns {Promise<{ok: boolean, data?: string, mimeType?: string, error?: string, status?: number, timeout?: boolean}>}
 */
export async function generateImageWithOpenAI({ prompt, referenceImages, aspectRatio, quality, timeoutMs }) {
  if (!prompt) return { ok: false, error: 'prompt is required' };
  if (!process.env.OPENAI_API_KEY) {
    return { ok: false, error: 'OPENAI_API_KEY not configured' };
  }

  const size = mapAspectToSize(aspectRatio);
  const q = mapQuality(quality);
  const refs = Array.isArray(referenceImages) ? referenceImages.filter((r) => r?.data) : [];

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs || OPENAI_TIMEOUT_MS);

  const client = getClient();

  try {
    let response;
    if (refs.length > 0) {
      // Multi-reference edit path. gpt-image-1 accepts an array here.
      const images = await Promise.all(
        refs.map(async (ref, i) => {
          const buffer = Buffer.from(ref.data, 'base64');
          const mime = ref.mimeType || 'image/png';
          const ext = mime.split('/')[1]?.split(';')[0] || 'png';
          return await toFile(buffer, `ref_${i}.${ext}`, { type: mime });
        }),
      );
      console.log(`[openai-image] edits size=${size} q=${q} refs=${images.length} promptChars=${prompt.length}`);
      response = await client.images.edit(
        {
          model: OPENAI_MODEL,
          image: images,
          prompt,
          size,
          quality: q,
          n: 1,
        },
        { signal: controller.signal },
      );
    } else {
      console.log(`[openai-image] generations size=${size} q=${q} refs=0 promptChars=${prompt.length}`);
      response = await client.images.generate(
        {
          model: OPENAI_MODEL,
          prompt,
          size,
          quality: q,
          n: 1,
        },
        { signal: controller.signal },
      );
    }

    // gpt-image-1 always returns b64_json (there's no URL mode). We keep
    // the mimeType 'image/png' because that's what the model produces
    // regardless of quality.
    const data = response?.data?.[0]?.b64_json;
    if (!data) {
      // Extremely rare — 200 with empty data. Treat as failure so the
      // caller can fall through to Gemini rather than serve a broken
      // <img src>.
      console.warn(`[openai-image] 200 but no image data (response keys: ${Object.keys(response || {}).join(',')})`);
      return { ok: false, error: 'no image data returned' };
    }
    console.log(`[openai-image] ✅ image generated (${Math.round(data.length / 1024)}KB base64)`);
    return { ok: true, data, mimeType: 'image/png' };
  } catch (err) {
    // OpenAI SDK v4 errors carry .status and .code. Our AbortController
    // firing surfaces as APIUserAbortError ("Request was aborted.") —
    // NOT AbortError — so match all abort shapes as timeout.
    const isTimeout = err.name === 'AbortError' || err.name === 'APIUserAbortError'
      || err.code === 'ETIMEDOUT' || /\baborted\b/i.test(err.message || '');
    const status = err.status || err.statusCode || null;
    // Try to extract the OpenAI error body if present — helpful for
    // triaging content-policy blocks vs auth vs quota errors.
    const detail = err.error?.message || err.message || 'OpenAI image request failed';
    console.error(`[openai-image] ❌ failed status=${status || 'n/a'}${isTimeout ? ' TIMEOUT' : ''}: ${detail}`);
    return {
      ok: false,
      error: detail,
      status,
      timeout: isTimeout,
    };
  } finally {
    clearTimeout(timer);
  }
}
