// Carousel message normalizer — runs when a session's messages hydrate
// from the DB.
//
// A hard interrupt mid-generation (tab close, PC shutdown, crash) can
// persist a carousel message whose plan still says generating/pending
// and whose images array has silent index gaps: the server loop emits
// neither slide_done nor slide_failed for slides it never reached, and
// the client-side consistency sweep only runs when the generation await
// resolves — which a hard interrupt prevents (founder incident,
// 2026-07-20: 5-slide plan persisted with 2 images, empty failedSlides →
// the previews showed "Generating slide N..." forever with no retry).
//
// On load there is by definition no live generation run, so: zero any
// stale pending counters, clear the generating flag, and sweep every
// missing non-blank slide index into failedSlides so the previews render
// their failed-with-Regenerate state instead of an eternal spinner.
// Sweep one carousel holder — anything with { carouselPlan, images,
// pendingImages }: a /Content message, an AI CEO artifact, or an AI CEO
// per-message artifact snapshot. Returns the same reference when nothing
// needed fixing.
export function sweepCarouselHolder(holder) {
  const cp = holder?.carouselPlan;
  const slides = cp?.slides;
  // Only approved plans have ever started generating — sweeping an
  // unapproved plan would mark every slide failed before it begins.
  if (!cp?.approved || !Array.isArray(slides) || slides.length === 0) return holder;

  const presentIdx = new Set((holder.images || []).filter((im) => im?.src).map((im, i) => (Number.isInteger(im.idx) ? im.idx : i)));
  const failedSet = new Set(cp.failedSlides || []);
  const recovered = [];
  for (let i = 0; i < slides.length; i++) {
    if (!presentIdx.has(i) && !failedSet.has(i) && slides[i]?.blank !== true) recovered.push(i);
  }
  const stale = (holder.pendingImages || 0) > 0 || cp.generating === true || holder.streaming === true;
  if (recovered.length === 0 && !stale) return holder;

  if (recovered.length) {
    console.warn(`[carousel] hydrate sweep: slides ${recovered.map((i) => i + 1).join(', ')} never arrived — marked failed (retryable)`);
  }
  return {
    ...holder,
    pendingImages: 0,
    ...(holder.streaming !== undefined ? { streaming: false } : {}),
    carouselPlan: {
      ...cp,
      generating: false,
      failedSlides: [...failedSet, ...recovered].sort((a, b) => a - b),
    },
  };
}

export function sweepCarouselMessages(msgs) {
  if (!Array.isArray(msgs)) return msgs;
  let changed = false;
  const out = msgs.map((m) => {
    let next = sweepCarouselHolder(m);
    // AI CEO messages carry the carousel state inside per-message
    // artifact snapshots rather than on the message itself.
    if (m?.artifact?.carouselPlan) {
      const sweptArt = sweepCarouselHolder(m.artifact);
      if (sweptArt !== m.artifact) next = { ...next, artifact: sweptArt };
    }
    if (next !== m) changed = true;
    return next;
  });
  return changed ? out : msgs;
}
