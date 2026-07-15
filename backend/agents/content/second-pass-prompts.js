// Second-pass ("Call 2") system-prompt builders for the /Content flows.
//
// Faithful ports of the inline prompt assembly in src/pages/Content.jsx:
//   - <<READY_A>>/<<READY_B>> LinkedIn text-post generation (@4536-4587)
//   - <<READY_CAROUSEL>> legacy LinkedIn carousel generation (@4611-4680)
// as of 2026-07-15, parametrized for the unified content backend
// (mode:'content', intent:'linkedin_post' | 'legacy_carousel') per
// docs/unified-content-backend-plan.md. Given the same inputs these
// produce byte-identical prompts to the client originals.
//
// IMPORTANT: until Phase 5 cleanup, the Content.jsx originals remain the
// runtime source for the legacy (flag-off) path. If you edit a prompt,
// edit BOTH copies or ship the change behind the unified flag only.
import {
  LINKEDIN_TEXT_VARIATION_A,
  LINKEDIN_TEXT_VARIATION_B,
  LINKEDIN_CAROUSEL_PROMPT,
} from './linkedin-prompts.js';

const isOutlierRef = (item) => item?.source === 'outlier-detector' || item?.result?.source === 'outlier-detector';

// Reference context for the LinkedIn text-post Call 2 (social links, docs,
// transcripts). Outlier-detector items are the user's explicit "copy this
// viral post" templates — separated into their own section with a stricter
// copy directive than the generic reference block.
// Port of Content.jsx @4544-4580.
function buildTextPostRefContext(socialUrls = [], documents = []) {
  let refContext = '';
  const doneSocial = socialUrls.filter(s => s.status === 'done' && s.result);
  const outlierRefs = doneSocial.filter(isOutlierRef);
  const otherRefs = doneSocial.filter((s) => !isOutlierRef(s));
  if (outlierRefs.length > 0) {
    refContext += `=== OUTLIER TEMPLATES — COPY EXACT WORDING, TONE, STRUCTURE ===\n`;
    refContext += `The user picked these viral posts as templates. This is NOT "get inspired" — reproduce them for the user's own topic. Mirror hook openings verbatim, sentence pacing, transition phrasing, CTA wording. Change only the nouns/verbs that carry the topic.\n\n`;
    outlierRefs.forEach((item, i) => {
      const r = item.result;
      refContext += `--- Template ${i + 1}: ${r.platform || 'Post'}: ${r.title || item.url} ---\n`;
      if (r.uploader) refContext += `Original creator: ${r.uploader}\n`;
      if (r.description) refContext += `Caption: ${r.description.slice(0, 2000)}\n`;
      if (r.transcript) refContext += `Full script:\n${r.transcript.slice(0, 6000)}\n`;
      refContext += '\n';
    });
    refContext += `Do NOT soften, generic-ify, or add safety hedges the original didn't have. Match voice, cadence, vocabulary register, and emotional beats. Line 1 of yours mirrors line 1 of theirs.\n\n`;
  }
  if (otherRefs.length > 0) {
    refContext += `=== REFERENCE CONTENT (HIGHEST PRIORITY) ===\n`;
    refContext += `The user attached this content as a STRUCTURAL BLUEPRINT. Your post MUST mirror its exact structure: same hook style, same flow, same engagement mechanics, same CTA approach. Only change the topic.\n\n`;
    otherRefs.forEach(item => {
      const r = item.result;
      refContext += `--- ${r.platform || 'Post'}: ${r.title || item.url} ---\n`;
      if (r.uploader) refContext += `Creator: ${r.uploader}\n`;
      if (r.description) refContext += `Caption: ${r.description.slice(0, 2000)}\n`;
      if (r.transcript) refContext += `Transcript:\n${r.transcript.slice(0, 4000)}\n`;
      refContext += '\n';
    });
  }
  const doneDocs = documents.filter(d => d.status === 'done' && d.result?.extractedText);
  if (doneDocs.length > 0) {
    refContext += `=== REFERENCE DOCUMENTS ===\n`;
    doneDocs.forEach((doc, i) => {
      refContext += `--- ${doc.result?.filename || `Doc ${i + 1}`} ---\n${doc.result.extractedText.slice(0, 3000)}\n\n`;
    });
  }
  return refContext;
}

// LinkedIn text-post Call 2 system prompt (fires after <<READY_A>> /
// <<READY_B>>). Port of Content.jsx @4582-4587.
export function buildLinkedInPostSystemPrompt({ variation, userName, brandDna, socialUrls = [], documents = [] }) {
  const readyA = variation === 'A';
  const variationPrompt = readyA ? LINKEDIN_TEXT_VARIATION_A : LINKEDIN_TEXT_VARIATION_B;
  const variationName = readyA ? 'Variation A (Framework-Heavy)' : 'Variation B (Story-Flow)';
  const refContext = buildTextPostRefContext(socialUrls, documents);

  let postSystemPrompt = `You are a LinkedIn post writer using ${variationName}. Based on the conversation, generate the final LinkedIn post NOW.\n\nRULES:\n- Output ONLY the post text, ready to copy-paste into LinkedIn\n- No preamble, no commentary, no "here is your post", no character counts\n- Just the raw post content with proper line breaks\n- Follow the EXACT post structure from the writing guidelines below\n- ABSOLUTELY NEVER use em dashes (the long dash character "—"). Use commas, periods, colons, or start a new sentence instead. This is non-negotiable. Zero em dashes.\n- NEVER use [Your Name] or [Name] placeholders. Use the user's ACTUAL name provided below.\n\n`;
  if (userName) postSystemPrompt += `USER'S NAME: ${userName}\nAlways sign off with this exact name, never use [Your Name] or placeholders.\n\n`;
  if (brandDna?.description) postSystemPrompt += `BRAND DESCRIPTION: ${brandDna.description}\n\n`;
  if (refContext) postSystemPrompt += refContext;
  postSystemPrompt += `=== WRITING GUIDELINES ${refContext ? '(use as fallback if no reference content above)' : '(FOLLOW THIS STRUCTURE EXACTLY)'} ===\n${variationPrompt}\n\n`;
  postSystemPrompt += `=== FINAL OVERRIDE (READ THIS LAST) ===\nIGNORE the "INPUT FORMAT", "OUTPUT FORMAT", and "QUALITY CHECKLIST" sections in the guidelines above. Those are structural references, NOT instructions for you to output.\nYou already have all inputs from the conversation history. Do NOT output "Topic:", "Content Intent:", "Brain Dump:", "Client Voice DNA:", or any template fields.\n${refContext ? 'IMPORTANT: The reference content above is your PRIMARY template. Mirror its structure exactly. The writing guidelines are secondary.\n' : ''}Output ONLY the raw LinkedIn post text. Nothing before it, nothing after it. Just the post itself, ready to paste into LinkedIn.`;
  return postSystemPrompt;
}

// LinkedIn EDIT_TEXT Call 2 system prompt (fires after <<EDIT_TEXT>> when
// a non-carousel LinkedIn post is on screen — rewrite in place, keep
// images). Port of Content.jsx @4440-4452.
export function buildLinkedInEditSystemPrompt({ editInstruction, existingContent, userName, brandDna }) {
  let editSystemPrompt = `You are editing an existing LinkedIn post. Apply the user's requested change while preserving the original voice, structure, paragraph rhythm, and overall length unless the change explicitly asks otherwise.\n\n`;
  editSystemPrompt += `RULES:\n`;
  editSystemPrompt += `- Output ONLY the updated post text, ready to copy-paste into LinkedIn.\n`;
  editSystemPrompt += `- No preamble, no commentary, no quotes around the post, no "here is your updated post".\n`;
  editSystemPrompt += `- ABSOLUTELY NEVER use em dashes. Use commas, periods, colons, or new sentences. Zero em dashes.\n`;
  editSystemPrompt += `- Preserve mobile-readable line breaks (LinkedIn's blank-line paragraph scan).\n`;
  editSystemPrompt += `- Keep specificity (numbers, named clients, timelines) unless the change asks to remove them.\n`;
  editSystemPrompt += `- NEVER use [Your Name] or [Name] placeholders. If the original ends with a sign-off, keep it intact.\n\n`;
  if (userName) editSystemPrompt += `USER'S NAME (for any sign-off): ${userName}\n\n`;
  if (brandDna?.description) editSystemPrompt += `BRAND DESCRIPTION: ${brandDna.description}\n\n`;
  editSystemPrompt += `EXISTING POST:\n---\n${existingContent}\n---\n\n`;
  editSystemPrompt += `REQUESTED CHANGE:\n${editInstruction}\n\n`;
  editSystemPrompt += `Output the updated post now.`;
  return editSystemPrompt;
}

// Reference context for the legacy carousel Call 2. Same split as the
// text-post one — outlier-detector picks get a stricter directive.
// Port of Content.jsx @4615-4651.
function buildCarouselRefContext(socialUrls = [], documents = []) {
  let carouselRefContext = '';
  const doneSocialC = socialUrls.filter(s => s.status === 'done' && s.result);
  const outlierCarouselRefs = doneSocialC.filter(isOutlierRef);
  const otherCarouselRefs = doneSocialC.filter((s) => !isOutlierRef(s));
  if (outlierCarouselRefs.length > 0) {
    carouselRefContext += `=== OUTLIER TEMPLATES — COPY EXACT SLIDE FLOW, TONE, HOOK ===\n`;
    carouselRefContext += `The user picked these viral carousels/videos as templates. Reproduce their slide flow for the user's topic: same hook slide format, same slide-by-slide beats, same CTA slide. Change only the topic.\n\n`;
    outlierCarouselRefs.forEach((item, i) => {
      const r = item.result;
      carouselRefContext += `--- Template ${i + 1}: ${r.platform || 'Post'}: ${r.title || item.url} ---\n`;
      if (r.uploader) carouselRefContext += `Original creator: ${r.uploader}\n`;
      if (r.description) carouselRefContext += `Caption: ${r.description.slice(0, 2000)}\n`;
      if (r.transcript) carouselRefContext += `Full script:\n${r.transcript.slice(0, 6000)}\n`;
      carouselRefContext += '\n';
    });
    carouselRefContext += `Do NOT soften or generic-ify. Match voice + slide cadence + emotional beats. Slide 1 of yours mirrors slide 1 of theirs.\n\n`;
  }
  if (otherCarouselRefs.length > 0) {
    carouselRefContext += `=== REFERENCE CONTENT (HIGHEST PRIORITY) ===\n`;
    carouselRefContext += `The user attached this content as a STRUCTURAL BLUEPRINT. Your carousel MUST mirror its structure: same hook style, same slide flow, same engagement mechanics, same CTA. Only change the topic.\n\n`;
    otherCarouselRefs.forEach(item => {
      const r = item.result;
      carouselRefContext += `--- ${r.platform || 'Post'}: ${r.title || item.url} ---\n`;
      if (r.uploader) carouselRefContext += `Creator: ${r.uploader}\n`;
      if (r.description) carouselRefContext += `Caption: ${r.description.slice(0, 2000)}\n`;
      if (r.transcript) carouselRefContext += `Transcript:\n${r.transcript.slice(0, 4000)}\n`;
      carouselRefContext += '\n';
    });
  }
  const docsC = documents.filter(d => d.status === 'done' && d.result?.extractedText);
  if (docsC.length > 0) {
    carouselRefContext += `=== REFERENCE DOCUMENTS ===\n`;
    docsC.forEach((doc, i) => {
      carouselRefContext += `--- ${doc.result?.filename || `Doc ${i + 1}`} ---\n${doc.result.extractedText.slice(0, 3000)}\n\n`;
    });
  }
  return carouselRefContext;
}

// Legacy LinkedIn carousel Call 2 system prompt (fires after the
// deprecated <<READY_CAROUSEL>> marker — preserved for parity).
// Port of Content.jsx @4653-4680.
export function buildLegacyCarouselSystemPrompt({ userName, brandDna, socialUrls = [], documents = [] }) {
  const carouselRefContext = buildCarouselRefContext(socialUrls, documents);

  let carouselSystemPrompt = `You are a LinkedIn carousel image generator. Based on the conversation, create the carousel slides NOW.\n\n`;
  carouselSystemPrompt += `=== ABSOLUTE RULES ===\n`;
  carouselSystemPrompt += `1. Your text output should be ONLY the LinkedIn caption (the short text that appears above the carousel when posted). Write it like a normal LinkedIn caption, 2-4 sentences max. No slide descriptions.\n`;
  carouselSystemPrompt += `2. Do NOT write "Slide 1:", "Slide 2:", "Cover Slide:", or ANY slide descriptions/headings in your text output. The slides are IMAGES, not text.\n`;
  carouselSystemPrompt += `3. Do NOT use hashtags. Zero hashtags.\n`;
  carouselSystemPrompt += `4. NEVER use em dashes. Zero tolerance.\n`;
  carouselSystemPrompt += `5. NEVER say "game-changer", "unlock", "dive in", or any AI slop phrases.\n`;
  carouselSystemPrompt += `6. Call generate_image for EACH slide separately. This is how slides are created.\n`;
  carouselSystemPrompt += `7. Each generate_image prompt must include the ACTUAL TEXT to render on the slide image.\n\n`;
  if (userName) carouselSystemPrompt += `USER'S NAME: ${userName}\n\n`;
  if (brandDna?.description) carouselSystemPrompt += `BRAND DESCRIPTION: ${brandDna.description}\n\n`;
  if (carouselRefContext) carouselSystemPrompt += carouselRefContext;
  if (brandDna?.colors) {
    const c = brandDna.colors;
    carouselSystemPrompt += `BRAND COLORS: Primary: ${c.primary || 'N/A'}, Secondary: ${c.secondary || 'N/A'}, Text: ${c.text || 'N/A'}\n`;
  }
  if (brandDna?.main_font) carouselSystemPrompt += `BRAND FONT: ${brandDna.main_font}\n`;
  carouselSystemPrompt += `\n=== CAROUSEL CONTENT GUIDELINES ===\n${LINKEDIN_CAROUSEL_PROMPT}\n\n`;
  carouselSystemPrompt += `=== IMAGE GENERATION SPECS ===\n`;
  carouselSystemPrompt += `- 4:3 LANDSCAPE ratio for every slide (LinkedIn standard)\n`;
  carouselSystemPrompt += `- Include ACTUAL TEXT to render on the image (title, body text, key points)\n`;
  carouselSystemPrompt += `- Specify: "bold sans-serif text, clean modern design"\n`;
  carouselSystemPrompt += `- Use brand colors consistently across all slides\n`;
  carouselSystemPrompt += `- Same background color, same font style on every content slide\n`;
  carouselSystemPrompt += `- Cover: bold hook text, eye-catching, vibrant\n`;
  carouselSystemPrompt += `- Content slides: numbered title + 2-3 sentences body text, left-aligned\n`;
  carouselSystemPrompt += `- CTA: clear action text, profile reference\n\n`;
  carouselSystemPrompt += `=== FINAL OVERRIDE ===\nIGNORE "INPUT FORMAT" and "OUTPUT FORMAT" sections from the guidelines. You have all inputs from conversation.\nYour text = caption only. Your generate_image calls = the slides. Keep them separate.`;
  return carouselSystemPrompt;
}
