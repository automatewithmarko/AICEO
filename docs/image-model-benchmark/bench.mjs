// Image-model benchmark through the Mentor gateway (founder task,
// 2026-07-28): compare speed + quality across the candidate models with
// IDENTICAL prompts. Everything routes through Mentor — no direct
// provider calls. Usage:
//   MENTOR_API_KEY=... node docs/image-model-benchmark/bench.mjs
// Writes PNGs + results.json next to itself.
import { writeFileSync, mkdirSync } from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';

const OUT = dirname(fileURLToPath(import.meta.url));
const BASE = 'https://platform.thementorprogram.xyz';
const KEY = process.env.MENTOR_API_KEY;
if (!KEY) { console.error('MENTOR_API_KEY required'); process.exit(1); }

// The exact kind of work the platform does — one text-heavy carousel
// slide (text fidelity is why we pay for gpt-image-2) and one cleaner
// visual post graphic.
const PROMPTS = {
  slide: `Professional LinkedIn carousel slide, 1:1 square, modern editorial design. Clean light background (#F7F5F0), deep navy text (#14213D), one orange accent (#FCA311). Large bold sans-serif headline: "Your funnel isn't broken. Your follow-up is." Below it three short lines in smaller text: "48% of leads never get a second touch." "The fix costs nothing." "It takes 11 minutes a week." Small brand chip top-left reading "ESFORGE". Generous whitespace, flat design, subtle grid texture, no photos, no watermark. Every word spelled exactly as written.`,
  visual: `Instagram post graphic, 1:1 square: a sleek laptop on a minimal desk at golden hour, warm rim light, soft shadows, a glowing dashboard on screen showing a rising revenue chart, shallow depth of field, premium tech-brand aesthetic, photorealistic, no text, no watermark.`,
};

// route: 'openai-wire' = /api/v1/images/generations · 'gemini-wire' =
// /api/v1beta/models/{model}:generateContent (what generate.js uses for
// the NB2 leg — 3.x ids alias through to AtlasCloud Nano Banana).
const MODELS = [
  { id: 'openai/gpt-image-2', route: 'openai-wire', label: 'gpt-image-2 (current primary)' },
  { id: 'google/gemini-2.5-flash-image', route: 'openai-wire', label: 'gemini-2.5-flash-image / Nano Banana 1 (old fast baseline)' },
  { id: 'gemini-3-pro-image-preview', route: 'openai-wire', label: 'gemini-3-pro-image-preview' },
  { id: 'gemini-3.1-flash-image-preview', route: 'gemini-wire', label: 'gemini-3.1-flash via v1beta -> Atlas NB2 (the NB2 leg)' },
];

async function callOpenAIWire(model, prompt) {
  const res = await fetch(`${BASE}/api/v1/images/generations`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${KEY}` },
    body: JSON.stringify({ model, prompt, n: 1, size: '1024x1024' }),
    signal: AbortSignal.timeout(240_000),
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}: ${(await res.text()).slice(0, 200)}`);
  const json = await res.json();
  const item = json?.data?.[0];
  if (item?.b64_json) return Buffer.from(item.b64_json, 'base64');
  if (item?.url) {
    const img = await fetch(item.url, { signal: AbortSignal.timeout(60_000) });
    if (!img.ok) throw new Error(`image url fetch ${img.status}`);
    return Buffer.from(await img.arrayBuffer());
  }
  throw new Error(`no image in response (keys: ${Object.keys(json).join(',')})`);
}

async function callGeminiWire(model, prompt) {
  const res = await fetch(`${BASE}/api/v1beta/models/${model}:generateContent`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${KEY}` },
    body: JSON.stringify({
      contents: [{ parts: [{ text: prompt }] }],
      generationConfig: { responseModalities: ['TEXT', 'IMAGE'], imageConfig: { aspectRatio: '1:1', imageSize: '1K' } },
    }),
    signal: AbortSignal.timeout(240_000),
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}: ${(await res.text()).slice(0, 200)}`);
  const json = await res.json();
  const parts = json?.candidates?.[0]?.content?.parts || [];
  const inline = parts.find((p) => p.inlineData?.data);
  if (!inline) throw new Error('no inlineData in response');
  return Buffer.from(inline.inlineData.data, 'base64');
}

const results = [];
for (const m of MODELS) {
  for (const [pid, prompt] of Object.entries(PROMPTS)) {
    const tag = `${m.id.replace(/[/.:]/g, '_')}__${pid}`;
    process.stdout.write(`→ ${m.id} [${pid}] ... `);
    const t0 = Date.now();
    try {
      const buf = m.route === 'openai-wire' ? await callOpenAIWire(m.id, prompt) : await callGeminiWire(m.id, prompt);
      const secs = ((Date.now() - t0) / 1000).toFixed(1);
      const file = join(OUT, `${tag}.png`);
      writeFileSync(file, buf);
      console.log(`OK ${secs}s (${Math.round(buf.length / 1024)}KB)`);
      results.push({ model: m.id, label: m.label, route: m.route, prompt: pid, seconds: Number(secs), kb: Math.round(buf.length / 1024), file: `${tag}.png`, ok: true });
    } catch (err) {
      const secs = ((Date.now() - t0) / 1000).toFixed(1);
      console.log(`FAIL ${secs}s: ${err.message}`);
      results.push({ model: m.id, label: m.label, route: m.route, prompt: pid, seconds: Number(secs), ok: false, error: err.message.slice(0, 300) });
    }
  }
}
writeFileSync(join(OUT, 'results.json'), JSON.stringify(results, null, 2));
console.log('\nDone -> results.json');
