// Compare Mentor gateway vs direct Google Gemini using the SAME request
// body (text + reference images), so we isolate which side is dropping
// the multipart payload when AI CEO image gen attaches founder photos.
//
// Usage: railway run --service aiceo-backend --environment dev node backend/_probe_mentor_vs_direct.js

import { writeFile, mkdir } from 'node:fs/promises';
import path from 'node:path';

const mentorKey = process.env.MENTOR_API_KEY;
const geminiKey = process.env.GEMINI_API_KEY;
const mentorBase = (process.env.MENTOR_BASE_URL || 'https://platform.thementorprogram.xyz') + '/api/v1beta';
const directBase = 'https://generativelanguage.googleapis.com/v1beta';
const model = process.argv[2] || 'gemini-3.1-flash-image-preview';
const outDir = path.resolve('mentor_probe_out');

if (!mentorKey) { console.error('MENTOR_API_KEY missing'); process.exit(1); }
if (!geminiKey) { console.error('GEMINI_API_KEY missing'); process.exit(1); }

await mkdir(outDir, { recursive: true });

// Fetch a public image and convert to base64 to use as a "reference photo"
async function fetchAsBase64(url) {
  const res = await fetch(url);
  const buf = Buffer.from(await res.arrayBuffer());
  const mime = res.headers.get('content-type') || 'image/jpeg';
  return { mime, data: buf.toString('base64'), bytes: buf.length };
}

// Use a small public placeholder image as a stand-in reference photo.
// Real founder photos are usually 100KB-2MB JPEGs from Supabase storage.
console.log(`Model: ${model}`);
console.log('Fetching reference images (1 logo + 2 photos like real route)...');
const refs = await Promise.all([
  fetchAsBase64('https://picsum.photos/seed/logo/256/256.jpg'),
  fetchAsBase64('https://picsum.photos/seed/face1/512/512.jpg'),
  fetchAsBase64('https://picsum.photos/seed/face2/512/512.jpg'),
]);
refs.forEach((r, i) => console.log(`  ref[${i}]: ${r.mime}, ${r.bytes.toLocaleString()} bytes`));

const body = {
  contents: [{
    parts: [
      { text: 'A simple flat-design illustration of a smiling person reading a book. FIRST attached image is the brand LOGO — place small in corner. REMAINING images are REFERENCE PHOTOS of the person — match their face and likeness. Square 1:1 composition, pastel colors.' },
      ...refs.map((r) => ({ inlineData: { mimeType: r.mime, data: r.data } })),
    ],
  }],
  generationConfig: {
    responseModalities: ['TEXT', 'IMAGE'],
    imageConfig: { aspectRatio: '1:1', imageSize: '1K' },
  },
};

async function callOne(label, base, key) {
  console.log(`\n──── ${label} ────`);
  const url = `${base}/models/${model}:generateContent?key=${key}`;
  console.log(`POST ${url.replace(key, '<KEY>')}`);
  const t0 = Date.now();
  let res;
  try {
    res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(120_000),
    });
  } catch (e) {
    console.error(`  network error: ${e.message}`);
    return;
  }
  const ms = Date.now() - t0;
  console.log(`  HTTP ${res.status} in ${ms}ms`);

  const text = await res.text();
  let json = null;
  try { json = JSON.parse(text); } catch {}

  if (!res.ok) {
    console.error('  body (first 1500 chars):');
    console.error('  ' + text.slice(0, 1500).replace(/\n/g, '\n  '));
    return;
  }

  const promptFb = json?.promptFeedback;
  const candidates = json?.candidates || [];
  const parts = candidates[0]?.content?.parts || [];
  const hasImage = parts.some((p) => p.inlineData);
  const txt = parts.filter((p) => p.text).map((p) => p.text).join('').slice(0, 200);
  const finishReason = candidates[0]?.finishReason;

  console.log(`  candidates: ${candidates.length}`);
  console.log(`  finishReason: ${finishReason || '<none>'}`);
  console.log(`  promptFeedback: ${promptFb ? JSON.stringify(promptFb) : '<none>'}`);
  console.log(`  parts: ${parts.length} (image: ${hasImage}, text: "${txt}")`);

  if (hasImage) {
    const imgPart = parts.find((p) => p.inlineData);
    const ext = (imgPart.inlineData.mimeType || 'image/png').split('/')[1] || 'png';
    const file = path.join(outDir, `${label}-${Date.now()}.${ext}`);
    await writeFile(file, Buffer.from(imgPart.inlineData.data, 'base64'));
    console.log(`  ✓ saved: ${file}`);
  } else {
    const file = path.join(outDir, `${label}-${Date.now()}.json`);
    await writeFile(file, JSON.stringify(json, null, 2));
    console.log(`  ✗ no image. full response saved: ${file}`);
  }
}

await callOne('MENTOR', mentorBase, mentorKey);
await callOne('DIRECT', directBase, geminiKey);
