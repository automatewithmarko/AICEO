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
//
// imagesOverride (founder bug 2026-07-28): AI CEO messages carry the
// plan on the MESSAGE but the rendered slides on the message's ARTIFACT
// snapshot — sweeping the message against its own (empty) images array
// marked every slide failed on reload while the canvas + PDF were fine.
// The caller passes the artifact's images so completion is judged where
// the slides actually live.
export function sweepCarouselHolder(holder, imagesOverride = null, canMarkFailed = true) {
  const cp = holder?.carouselPlan;
  const slides = cp?.slides;
  // Only approved plans have ever started generating — sweeping an
  // unapproved plan would mark every slide failed before it begins.
  if (!cp?.approved || !Array.isArray(slides) || slides.length === 0) return holder;

  const imageList = imagesOverride || holder.images || [];
  const presentIdx = new Set(imageList.filter((im) => im?.src).map((im, i) => (Number.isInteger(im.idx) ? im.idx : i)));
  const failedSet = new Set(cp.failedSlides || []);
  const recovered = [];
  if (canMarkFailed) {
    for (let i = 0; i < slides.length; i++) {
      if (!presentIdx.has(i) && !failedSet.has(i) && slides[i]?.blank !== true) recovered.push(i);
    }
  }
  // Self-heal the inverse corruption: slides marked failed whose image
  // IS present (earlier sweeps ran against the wrong images array and
  // persisted bogus failedSlides — clear them so the chat plan card
  // stops offering "Retry N slides" for a finished deck).
  const healed = canMarkFailed
    ? [...failedSet].filter((i) => presentIdx.has(i))
    : [...failedSet]; // no image visibility -> old sweeps' verdicts are untrustworthy; clear them
  const stale = (holder.pendingImages || 0) > 0 || cp.generating === true || holder.streaming === true;
  if (recovered.length === 0 && healed.length === 0 && !stale) return holder;

  if (recovered.length) {
    console.warn(`[carousel] hydrate sweep: slides ${recovered.map((i) => i + 1).join(', ')} never arrived — marked failed (retryable)`);
  }
  if (healed.length) {
    console.log(`[carousel] hydrate sweep: slides ${healed.map((i) => i + 1).join(', ')} were marked failed but their images exist — cleared`);
  }
  const nextFailed = canMarkFailed
    ? [...failedSet, ...recovered].filter((i) => !presentIdx.has(i)).sort((a, b) => a - b)
    : [];
  return {
    ...holder,
    pendingImages: 0,
    ...(holder.streaming !== undefined ? { streaming: false } : {}),
    carouselPlan: {
      ...cp,
      generating: false,
      failedSlides: nextFailed,
    },
  };
}

// canMarkFailed=false: clear stale generating/pending flags and heal
// bogus failedSlides, but NEVER invent new failures — used for AI CEO
// messages whose images live in a session artifact we may not see.
export function sweepCarouselMessages(msgs, sessionArtifact = null) {
  if (!Array.isArray(msgs)) return msgs;
  let changed = false;
  const out = msgs.map((m) => {
    // AI CEO: slides live on the artifact snapshot, not the message —
    // judge the message's plan against wherever images actually are.
    const artImages = m?.artifact?.images;
    // Session-level artifact heals the message when it holds THIS plan's
    // slides (matched by hook) — hydrated AI CEO messages carry no images
    // of their own (founder bug 2026-07-28, second report).
    const sessImages = (sessionArtifact?.carouselPlan?.hook && sessionArtifact.carouselPlan.hook === m?.carouselPlan?.hook)
      ? sessionArtifact.images : null;
    const imagesForMsg = (m?.images?.length ? m.images : (artImages?.length ? artImages : (sessImages?.length ? sessImages : null)));
    // A message that owns NO image array anywhere must never have
    // failures invented for it — run-time bookkeeping (mirrorPlan) is
    // the only truth for those; the sweep only clears stale flags.
    const ownsImages = !!imagesForMsg;
    let next = sweepCarouselHolder(m, imagesForMsg, ownsImages);
    if (m?.artifact?.carouselPlan) {
      const sweptArt = sweepCarouselHolder(m.artifact);
      if (sweptArt !== m.artifact) next = { ...next, artifact: sweptArt };
    }
    if (next !== m) changed = true;
    return next;
  });
  return changed ? out : msgs;
}
