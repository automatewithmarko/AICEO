// Deterministic prompt-module router for the /Content chat brain.
//
// WHY (founder, 2026-07-25): the strategist prompt shipped EVERY craft
// guide on EVERY turn — video-script engine, carousel spec, image
// standards, the full LinkedIn text library — 26-77K chars even for
// "hello". The model doesn't need the reel guide to plan a carousel, and
// a 19K-token prompt makes it slow AND makes it lose the "never ask
// topic questions" rules in the noise.
//
// This router decides WHICH craft modules the current turn needs, from
// keywords in the recent conversation window — pure regex, zero extra
// model calls, so routing adds no latency. Detection is deliberately
// generous (a module loading unnecessarily costs a little prompt size;
// a module missing when needed costs output quality):
//   - keywords are scanned across the last few turns, not just the last
//     message, so "Carousel" as an answer to the format question routes
//     correctly;
//   - a generation verb with NO format keyword anywhere → ALL modules
//     (identical to the old always-everything behavior, so ambiguous
//     asks can never regress);
//   - pure conversation (greetings, analysis, questions) → core only.

const CAROUSEL_RE = /\bcarousels?\b|\bslides?\b|slide\s*deck|swipe\s*(?:post|file)|multi[-\s]?slide/i;
const VIDEO_RE = /\breels?\b|\bvideos?\b|\bshorts?\b|\bscripts?\b|\btik\s?toks?\b|\bvlogs?\b|\btalking\s*head|\bvoice\s*over|\bhooks?\b.{0,20}\bvideo/i;
// "story"/"stories" are image frames (3-4 generate_image calls), so they
// live in the image module, not video.
const IMAGE_RE = /\bposts?\b|\bimages?\b|\bphotos?\b|\bpictures?\b|\bgraphics?\b|\bthumbnails?\b|\bbanners?\b|\bstor(?:y|ies)\b|\bvisuals?\b|\bcovers?\b/i;
const LI_TEXT_RE = /\btext\s*post|\bposts?\b|\barticles?\b|\bwrite[- ]?up/i;
// Deliberately NO bare "do"/"help" here — conversational questions ("what
// do you think…") must not trip the everything-on fallback.
const GEN_VERB_RE = /\b(?:make|create|generate|write|draft|design|produce|craft|build|give\s+me|need|want|whip)\b/i;
// Plans already in history switch on the PRIOR PLAN AWARENESS block.
const PLAN_HISTORY_RE = /\[CONTENT PLAN|plan-artifact/;

function textOf(content) {
  if (typeof content === 'string') return content;
  if (Array.isArray(content)) {
    return content.map((c) => (typeof c === 'string' ? c : c?.text || '')).join(' ');
  }
  return String(content ?? '');
}

// Returns { carousel, video, image, liText, anyGen, planAware } booleans.
export function detectContentModules({
  messages = [],
  platform = null,
  photos = [],
  socialUrls = [],
  carouselTemplates = [],
  existingPost = null,
  replicationMode = false,
} = {}) {
  const platformId = platform?.id || 'instagram';
  const isLinkedin = platformId === 'linkedin';

  // Scan window: the last 6 messages. Assistant messages count (accepting
  // an offer like "Want me to design a thumbnail?" with "yes" must load
  // the image module), EXCEPT the format-question messages — their options
  // list contains every format word, which would wash out the user's
  // actual answer ("Carousel") with all-modules noise.
  const windowText = (messages || [])
    .slice(-6)
    .filter((msg) => !(msg?.role === 'assistant' && textOf(msg?.content).includes('"type":"question"')))
    .map((msg) => textOf(msg?.content))
    .join('\n');
  const allText = (messages || []).map((m) => textOf(m?.content)).join('\n');

  let carousel = CAROUSEL_RE.test(windowText);
  let video = VIDEO_RE.test(windowText);
  let image = IMAGE_RE.test(windowText);
  let liText = isLinkedin && LI_TEXT_RE.test(windowText);

  // State signals beat keywords:
  // - a selected carousel template in the sidebar IS carousel intent;
  // - an on-screen carousel means the user may iterate on it;
  // - an on-screen LinkedIn text post means edit mode (liText);
  // - uploaded photos almost always become image posts / edits;
  // - Replication Mode clones a reference VIDEO transcript.
  if (carouselTemplates?.length) carousel = true;
  if ((existingPost?.totalSlides || 0) > 0) carousel = true;
  else if (isLinkedin && existingPost?.content) liText = true;
  if ((photos || []).some((p) => p?.status === 'done')) image = true;
  if (replicationMode) video = true;
  // A reference with a transcript is a video reference — the user will
  // usually ask for "content like this", which lands as a script.
  if ((socialUrls || []).some((s) => s?.status === 'done' && s?.result?.transcript)) video = true;

  // Platform floor: YouTube's deliverables are scripts + thumbnails, so a
  // generation ask there implies video; TikTok implies video.
  const genIntent = GEN_VERB_RE.test(windowText) || carousel || video || image || liText;
  if (genIntent && platformId === 'youtube') video = true;
  if (genIntent && platformId === 'tiktok') video = true;

  // Ambiguous generation ask ("create something for me") with no format
  // signal at all → everything on. This is the old behavior, kept as the
  // safety net so vague asks never lose quality.
  if (genIntent && !carousel && !video && !image && !liText) {
    carousel = true;
    video = true;
    image = true;
    liText = isLinkedin;
  }

  return {
    carousel,
    video,
    image,
    liText,
    anyGen: carousel || video || image || liText,
    planAware: PLAN_HISTORY_RE.test(allText),
  };
}

// Everything-on module set — used for callers that predate routing and as
// the explicit "no trimming" switch.
export const ALL_MODULES = Object.freeze({
  carousel: true, video: true, image: true, liText: true, anyGen: true, planAware: true,
});
