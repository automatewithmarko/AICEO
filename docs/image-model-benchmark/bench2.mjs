// Round 2 (founder, 2026-07-28): quality-variant comparison — gpt-image-2
// (high / medium / auto) vs NB2-via-Atlas (1K / 2K) — under HEAVY
// platform-realistic prompts (the text+graphics mix real carousel slides
// and image posts carry). All through Mentor. Usage:
//   MENTOR_API_KEY=... node docs/image-model-benchmark/bench2.mjs
import { writeFileSync } from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';

const OUT = dirname(fileURLToPath(import.meta.url));
const BASE = 'https://platform.thementorprogram.xyz';
const KEY = process.env.MENTOR_API_KEY;
if (!KEY) { console.error('MENTOR_API_KEY required'); process.exit(1); }

// Heavy prompts modeled on the platform's REAL generation prompts
// (carousel-slide-prompt.js design-system style + single-image post with
// mixed text/graphic elements) — deliberate stress: multiple text blocks,
// UI/chart elements, chips, exact spellings.
const PROMPTS = {
  slide_heavy: `Premium LinkedIn carousel slide, 1:1 square, dark editorial design system. Background deep charcoal (#101418) with a subtle dot-grid texture and a soft orange glow in the top-right corner. Top-left: small rounded badge chip with the text "STEP 03" in uppercase orange (#FCA311) on a translucent dark pill. Below it a large bold white sans-serif headline: "Automate the follow-up. Keep the relationship." — with ONLY the word "follow-up" in orange. Under the headline three short body lines in light gray, each on its own line: "Trigger a reply within 5 minutes." "Personalize from the CRM record." "Escalate hot leads to a human." Bottom-left: a small stat chip card showing "CAC $420 → $180" with a tiny upward arrow. Bottom-right: a minimal bar chart element with 5 ascending orange bars. Bottom edge: thin brand strip with "ESFORGE" in small caps on the left and a slide marker "03 / 07" on the right. Flat modern vector style, generous spacing, no photos, no watermark. Every word spelled EXACTLY as written.`,
  post_mixed: `Instagram single-image post, 1:1 square, mixed photo-and-graphic composition. Center: a slightly angled laptop on a clean desk, warm side light, screen showing a dark analytics dashboard with an orange rising line chart. Floating around the laptop, three small overlapping UI cards with soft shadows: one chat bubble card reading "Reply sent · 2:04 AM", one metric card reading "+38% replies" with a small sparkline, one calendar card showing "12 booked calls". Above the laptop, large bold navy (#14213D) headline text on the light background: "We tripled output. Headcount stayed flat." Below it a smaller subline in gray: "The 4-tool stack that did it". Small "ESFORGE" brand chip in the top-left corner. Light warm background (#F7F5F0), editorial-tech aesthetic, crisp text, no watermark. Every word spelled EXACTLY as written.`,
};

const VARIANTS = [
  { key: 'gpt2-high', model: 'openai/gpt-image-2', route: 'openai-wire', body: { quality: 'high' } },
  { key: 'gpt2-medium', model: 'openai/gpt-image-2', route: 'openai-wire', body: { quality: 'medium' } },
  { key: 'gpt2-auto', model: 'openai/gpt-image-2', route: 'openai-wire', body: { quality: 'auto' } },
  { key: 'nb2-1K', model: 'gemini-3.1-flash-image-preview', route: 'gemini-wire', imageSize: '1K' },
  { key: 'nb2-2K', model: 'gemini-3.1-flash-image-preview', route: 'gemini-wire', imageSize: '2K' },
];

async function callOpenAIWire(v, prompt) {
  const res = await fetch(`${BASE}/api/v1/images/generations`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${KEY}` },
    body: JSON.stringify({ model: v.model, prompt, n: 1, size: '1024x1024', ...v.body }),
    signal: AbortSignal.timeout(300_000),
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
  throw new Error('no image in response');
}

async function callGeminiWire(v, prompt) {
  const res = await fetch(`${BASE}/api/v1beta/models/${v.model}:generateContent`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${KEY}` },
    body: JSON.stringify({
      contents: [{ parts: [{ text: prompt }] }],
      generationConfig: { responseModalities: ['TEXT', 'IMAGE'], imageConfig: { aspectRatio: '1:1', imageSize: v.imageSize } },
    }),
    signal: AbortSignal.timeout(300_000),
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}: ${(await res.text()).slice(0, 200)}`);
  const json = await res.json();
  const inline = (json?.candidates?.[0]?.content?.parts || []).find((p) => p.inlineData?.data);
  if (!inline) throw new Error('no inlineData in response');
  return Buffer.from(inline.inlineData.data, 'base64');
}

const results = [];
for (const v of VARIANTS) {
  for (const [pid, prompt] of Object.entries(PROMPTS)) {
    const tag = `r2_${v.key}__${pid}`;
    process.stdout.write(`→ ${v.key} [${pid}] ... `);
    const t0 = Date.now();
    try {
      const buf = v.route === 'openai-wire' ? await callOpenAIWire(v, prompt) : await callGeminiWire(v, prompt);
      const secs = ((Date.now() - t0) / 1000).toFixed(1);
      writeFileSync(join(OUT, `${tag}.png`), buf);
      console.log(`OK ${secs}s (${Math.round(buf.length / 1024)}KB)`);
      results.push({ variant: v.key, model: v.model, prompt: pid, seconds: Number(secs), kb: Math.round(buf.length / 1024), file: `${tag}.png`, ok: true });
    } catch (err) {
      const secs = ((Date.now() - t0) / 1000).toFixed(1);
      console.log(`FAIL ${secs}s: ${err.message}`);
      results.push({ variant: v.key, model: v.model, prompt: pid, seconds: Number(secs), ok: false, error: err.message.slice(0, 300) });
    }
  }
}
writeFileSync(join(OUT, 'results-round2.json'), JSON.stringify(results, null, 2));
console.log('\nDone -> results-round2.json');
