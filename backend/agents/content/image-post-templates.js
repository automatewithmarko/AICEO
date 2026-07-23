// Single-image POST template registry (founder request 2026-07-23).
//
// WHY THIS EXISTS: carousels got a curated template system
// (curated-carousel-templates.js) that made them look designed instead of
// AI-generated — a registry of layouts, deterministic server-side
// enforcement, and hard spacing rules. Single-image posts had none of it:
// every IG/LI post image was whatever free-form prose the model wrote into
// generate_image.prompt. No layout system, no copy budget, no matching of
// post INTENT to visual FORMAT.
//
// WHAT THIS IS: ~17 brand-AGNOSTIC layout archetypes, one per post intent
// (educational / authority / proof / engagement / promotional / story).
// The model picks one per post; the server composes the final image prompt
// deterministically from the template's layout spec + the user's Brand DNA.
// Colors live here as ROLE names (surface / accent / text / muted) only —
// actual hex is interpolated per user at compose time, so the same template
// looks like a different brand for every account.
//
// THE PLATFORM DYNAMIC (founder direction, the core requirement):
//   LinkedIn  — the CAPTION is the post. The image is VISUAL SUPPORT: one
//               idea, ≤14 visible words, legible as a phone thumbnail.
//   Instagram — the IMAGE is the post. It must carry the full value on its
//               own; the caption is secondary context.
// That dynamic is written ONCE (PLATFORM_ROLE below) and applied to every
// template, rather than duplicated into 17 layout strings.
//
// Keep ids STABLE once shipped — logs, and a future user-facing picker,
// reference them.

// ── Per-platform canvas + copy budget ──
export const IMAGE_POST_PLATFORM_CONFIG = {
  instagram: {
    label: 'Instagram',
    canvas: '1080 x 1080 pixels (square, 1:1 aspect ratio)',
    canvasShort: '1080x1080 square',
    maxWords: 32,
    headlinePx: '80-104',
    bodyPx: '30-38',
    marginPx: 88,
    role: `INSTAGRAM — THE IMAGE IS THE POST (primary value carrier).
- The caption is secondary context. A reader who never expands the caption must still get the COMPLETE point from this image alone, and want to save it.
- The image must be self-contained: the claim, the payoff, and enough specificity to be useful all live on the canvas.
- Total visible words across the whole image: 32 MAXIMUM. That is a ceiling, not a target — fewer words rendered larger always wins.
- Editorial, high-craft, confident. This is the kind of image people screenshot and send to a colleague.`,
  },
  linkedin: {
    label: 'LinkedIn',
    canvas: '1080 x 1440 pixels (portrait, 3:4 aspect ratio)',
    canvasShort: '1080x1440 portrait',
    maxWords: 14,
    headlinePx: '72-92',
    bodyPx: '28-34',
    marginPx: 96,
    role: `LINKEDIN — THE IMAGE IS VISUAL SUPPORT FOR THE POST TEXT.
- The written post (the caption) carries the argument and the full value. This image exists to stop the scroll and to state ONE idea from that post with total clarity.
- Do NOT try to fit the argument onto the image. One idea, rendered big.
- Total visible words across the whole image: 14 MAXIMUM. A LinkedIn feed image is read at thumbnail size in under a second — anything smaller than roughly 3% of the canvas height is unreadable and should not exist.
- Restrained, professional, confident. Boardroom-credible, not trendy. No emoji, no meme energy, no decorative clutter.`,
  },
};

// ── The registry ──
// slots: which copy fields this layout consumes. "?" = optional.
// surface: 'ink' (near-black ground) | 'paper' (off-white ground) | 'brand' (brand primary as ground)
// founderTreatment: 'none' | 'chip' | 'portrait-side' | 'portrait-hero'
export const IMAGE_POST_TEMPLATES = [
  // ─────────── EDUCATIONAL ───────────
  {
    id: 'insight-statement',
    name: 'Statement Card',
    intent: 'educational',
    platforms: ['linkedin', 'instagram'],
    whenToUse: 'One sharp claim, lesson, or reframe carries the whole post. The safe default when nothing more specific fits.',
    slots: ['kicker?', 'headline', 'support?'],
    copyBudget: { headlineWords: 12, items: 0 },
    surface: 'ink',
    founderTreatment: 'none',
    layout: 'Single centered text block occupying the middle band of the canvas (roughly y 30% to y 62%). The headline is the hero: set it as large as it can go while keeping generous side margins and never exceeding four lines, weight 700-800, tight leading (about 1.1), left-aligned with a hard left margin. A short uppercase kicker with wide letter-spacing sits directly above the headline in the accent color, separated by a clear gap. If a support line exists it sits below the headline in the muted color at roughly a third of the headline size, separated by at least 6% of canvas height, capped at two lines. Everything above y 25% and below y 72% stays EMPTY except a thin accent rule (about 100px long, 4px thick) at the very top of the text block. No imagery, no icons, no cards.',
    notes: 'The power is in the restraint: one idea, huge type, enormous negative space. Reads like a book cover or a gallery wall text, not a poster.',
    doNot: ['stock photography', 'icons or illustrations', 'decorative frames or borders', 'more than one accent color'],
  },
  {
    id: 'numbered-framework',
    name: 'Numbered Framework',
    intent: 'educational',
    platforms: ['linkedin', 'instagram'],
    whenToUse: 'The post teaches a repeatable framework, playbook, or list of 3-5 named parts the reader could apply today.',
    slots: ['kicker?', 'headline', 'items', 'support?'],
    copyBudget: { headlineWords: 9, items: 5, itemWords: 7 },
    surface: 'paper',
    founderTreatment: 'none',
    layout: 'Title block in the top third: optional uppercase kicker in the accent color, then the headline in near-black, weight 700, two lines maximum, left-aligned to the margin. Below it a stack of numbered rows filling the middle band, each row a large accent-colored numeral (roughly 1.6x the row text size, weight 800) on the left, a clear fixed gutter, then the row label in near-black weight 600 on the right, one line each. Rows are evenly spaced with a full row-height of empty space between them — generous, never a tight list. A hairline rule in the muted color at 20% opacity may separate rows. Bottom 12% of the canvas stays empty except an optional muted support line.',
    notes: 'The numerals are the visual system: oversized, accent-colored, perfectly aligned. Everything else is quiet. Feels like a page from a well-set business book.',
    doNot: ['bullet points instead of numerals', 'icons beside every row', 'more than five rows', 'boxes or cards around rows'],
  },
  {
    id: 'versus-split',
    name: 'This vs That',
    intent: 'educational',
    platforms: ['linkedin', 'instagram'],
    whenToUse: 'The post contrasts two things — old way vs new way, myth vs truth, what most people do vs what actually works.',
    slots: ['kicker?', 'headline?', 'items', 'support?'],
    copyBudget: { headlineWords: 8, items: 2, itemWords: 10 },
    surface: 'ink',
    founderTreatment: 'none',
    layout: 'The canvas splits into two equal halves along the long axis (left/right on square canvases, top/bottom on portrait canvases), divided by a single clean 2px rule in the muted color at 30% opacity. The FIRST half is the rejected side: a small uppercase label in the muted color (for example the first word of the pair, or a plain "BEFORE"/"MYTH" style label derived from the copy), then its text in the muted color at 60% opacity, weight 500, with a thin strike-through rule across it. The SECOND half is the winning side: the same label position in the accent color, then its text in the primary text color at full weight 700, roughly 15% larger than the first half. Each half keeps at least 25% of its own area empty. An optional short headline sits centered in the top 15%, above the split. Nothing crosses the divider.',
    notes: 'Asymmetry does the arguing: the winning side is brighter, bigger, and accent-marked, so the point lands before a single word is read.',
    doNot: ['arrows between the halves', 'red X and green check icons', 'three or more columns', 'photos in either half'],
  },
  {
    id: 'checklist-card',
    name: 'Checklist',
    intent: 'educational',
    platforms: ['instagram', 'linkedin'],
    whenToUse: 'The post is a set of criteria, signs, or must-haves the reader can audit themselves against.',
    slots: ['kicker?', 'headline', 'items'],
    copyBudget: { headlineWords: 8, items: 5, itemWords: 6 },
    surface: 'paper',
    founderTreatment: 'none',
    layout: 'Headline in the top quarter, near-black, weight 700, two lines maximum, left-aligned to the margin, with an optional uppercase accent kicker above it. Below, a vertical list of items, each preceded by a simple hand-drawn-feeling check mark stroke in the accent color (about the same height as the item text, drawn as two clean strokes — never a boxed tick, never an emoji). Item text sits in near-black weight 500 on a single line. Between every item leave a gap equal to at least one full line of text. The list ends no lower than y 85%; the remaining space stays empty.',
    notes: 'Warm and human: paper ground, ink text, one accent, hand-quality check strokes. Should feel like a well-designed worksheet, not a UI screenshot.',
    doNot: ['checkbox squares or UI controls', 'emoji ticks', 'alternating row background colors', 'more than six items'],
  },
  {
    id: 'process-flow',
    name: 'Step Flow',
    intent: 'educational',
    platforms: ['linkedin', 'instagram'],
    whenToUse: 'The post explains a sequence — how something moves from A to B to C. Order matters to the meaning.',
    slots: ['kicker?', 'headline?', 'items', 'support?'],
    copyBudget: { headlineWords: 8, items: 4, itemWords: 5 },
    surface: 'ink',
    founderTreatment: 'none',
    layout: 'An optional short headline occupies the top 18%. The stages run down the centre of the canvas as a vertical sequence (or across the middle band horizontally when there are only three short stages on a square canvas). Each stage is a plain text label in the primary text color, weight 600, with a small accent-colored dot or short numeral above it; stages are connected by a single thin accent line at 40% opacity running through the dots. Stage spacing is even and wide — the connector line is clearly longer than the text it joins. The final stage is emphasized: its label in the accent color, weight 700, roughly 20% larger. Keep at least 20% of the canvas empty at the top and bottom of the flow.',
    notes: 'A diagram made only of type, dots, and one hairline. No boxes, no shadows, no arrows with heads — the connector line and the emphasis on the last stage do all the work.',
    doNot: ['flowchart boxes or rounded rectangles', 'arrowheads or chevrons', 'icons inside the nodes', 'more than four stages'],
  },

  // ─────────── AUTHORITY ───────────
  {
    id: 'founder-portrait-headline',
    name: 'Founder Poster',
    intent: 'authority',
    platforms: ['linkedin', 'instagram'],
    whenToUse: 'A first-person point of view, a stance, or a personal lesson where the founder BEING the source is the credibility.',
    slots: ['headline', 'support?', 'attribution?'],
    copyBudget: { headlineWords: 10, items: 0 },
    surface: 'ink',
    founderTreatment: 'portrait-hero',
    layout: 'A photographic portrait of the founder fills the canvas as the ground layer, cropped from roughly mid-chest up and positioned so the face occupies the upper outer third and the opposite lower area stays visually quiet. A smooth dark gradient rises from the bottom edge to roughly y 55%, deep enough that text over it is fully legible. The headline sits in that darkened zone, primary text color, weight 700, left-aligned to the margin, three lines maximum, with one key phrase in the accent color. A thin accent rule about 90px long sits directly above the headline. If an attribution exists it sits at the very bottom in the muted color, small and uppercase with wide letter-spacing (name, then role). Nothing else on the canvas.',
    notes: 'Editorial magazine cover energy: real photograph, real depth, restrained type. The gradient is a lighting effect, never a flat translucent panel.',
    doNot: ['flat semi-transparent text boxes over the photo', 'cut-out person floating on a solid color', 'logos', 'second person in the frame'],
  },
  {
    id: 'quote-card-portrait',
    name: 'Pull Quote + Portrait',
    intent: 'authority',
    platforms: ['linkedin', 'instagram'],
    whenToUse: 'One quotable line from the post deserves to be lifted out and attributed to the founder.',
    slots: ['headline', 'attribution?', 'kicker?'],
    copyBudget: { headlineWords: 14, items: 0 },
    surface: 'paper',
    founderTreatment: 'portrait-side',
    layout: 'The canvas divides roughly 40/60. The smaller zone holds a photographic portrait of the founder, cropped to the shoulders and bled to the canvas edge — never a floating circle, never a cut-out. The larger zone sits on the paper ground and holds the quote: near-black, weight 600, left-aligned, five lines maximum, with a single oversized accent-colored quotation mark placed above and slightly overlapping the first line. Below the quote, separated by a clear gap and a short accent rule, the attribution in the muted color: name on one line, role on the next, small and uppercase with wide letter-spacing. The quote zone keeps at least 20% of its area empty.',
    notes: 'Print-interview feel. The oversized quote mark and the bled photo edge are the signature; keep everything else quiet.',
    doNot: ['circular avatar crops', 'drop shadows on the photo', 'decorative quotation graphics on both sides', 'headline above the quote'],
  },
  {
    id: 'typographic-quote',
    name: 'Quote Card',
    intent: 'authority',
    platforms: ['linkedin', 'instagram'],
    whenToUse: 'A quotable line stands alone — or the founder has no usable photo and a portrait layout would fail.',
    slots: ['headline', 'attribution?'],
    copyBudget: { headlineWords: 16, items: 0 },
    surface: 'brand',
    founderTreatment: 'chip',
    layout: 'Pure typography on the brand ground. An oversized quotation mark sits in the upper area at very low opacity (roughly 12%), large enough to read as texture rather than punctuation, bleeding partially off one edge. The quote is centered vertically in the middle band, weight 600, five lines maximum, with comfortable leading (about 1.35) and side margins that keep the line length short and readable. Below it, separated by a generous gap and a short rule, the attribution: small, uppercase, wide letter-spacing. Everything above y 22% and below y 80% stays empty.',
    notes: 'The brand color doing the heavy lifting as a full-bleed ground makes this instantly recognizable in a feed while staying entirely brand-agnostic in structure.',
    doNot: ['photographic backgrounds', 'gradients over the brand ground', 'italic script fonts', 'second color besides the text color'],
  },

  // ─────────── PROOF ───────────
  {
    id: 'metric-hero',
    name: 'Big Number',
    intent: 'proof',
    platforms: ['linkedin', 'instagram'],
    whenToUse: 'The post turns on ONE number — a result, a benchmark, a price, a percentage, a delta.',
    slots: ['kicker?', 'metric_value', 'metric_label', 'support?'],
    copyBudget: { headlineWords: 8, items: 0 },
    surface: 'ink',
    founderTreatment: 'none',
    layout: 'The metric value is the entire composition: set it enormous (roughly 40-48% of the canvas height for a short value), weight 800, in the accent color, optically centered slightly above the vertical middle. The metric label sits directly beneath it in the primary text color, weight 600, at roughly one sixth of the value size, one line only. An optional uppercase kicker in the muted color sits above the value with wide letter-spacing. An optional support line sits near the bottom in the muted color, one line, small. Side margins stay wide and the corners stay completely empty — the number should feel like it is floating in space.',
    notes: 'Scale is the message. If the number is not the first and loudest thing seen from across a room, the render failed.',
    doNot: ['charts, graphs, axes, or plotted lines', 'gauge or progress-ring graphics', 'multiple competing numbers', 'currency icons as decoration'],
  },
  {
    id: 'before-after',
    name: 'Before / After',
    intent: 'proof',
    platforms: ['linkedin', 'instagram'],
    whenToUse: 'The post shows a change in state or number over a defined period — what it was, what it became.',
    slots: ['kicker?', 'items', 'support?', 'headline?'],
    copyBudget: { headlineWords: 8, items: 2, itemWords: 8 },
    surface: 'ink',
    founderTreatment: 'none',
    layout: 'Two stacked zones separated by a generous empty band (at least 10% of canvas height) containing a single short accent-colored rule or a small accent dot as the pivot. The upper zone is the BEFORE state: a small uppercase muted label, then its value or phrase in the muted color at 60% opacity, weight 600. The lower zone is the AFTER state: the same structure but in the accent color, weight 800, and clearly larger (roughly 1.5x the before size). An optional headline sits in the top 15% in the primary text color; an optional support line (a timeframe, for example) sits at the bottom in the muted color, small. Both zones keep wide side margins.',
    notes: 'Size and brightness carry the improvement; no arrows required. The empty pivot band is what makes it read as a transformation rather than a list.',
    doNot: ['arrows or chevrons between the states', 'green up-arrows or red down-arrows', 'side-by-side photo comparisons', 'chart axes'],
  },
  {
    id: 'testimonial-card',
    name: 'Client Quote',
    intent: 'proof',
    platforms: ['linkedin', 'instagram'],
    whenToUse: 'A client or customer said something worth showing — social proof in their words, not the founder\'s.',
    slots: ['headline', 'attribution?', 'kicker?', 'metric_value?', 'metric_label?'],
    copyBudget: { headlineWords: 18, items: 0 },
    surface: 'paper',
    founderTreatment: 'none',
    layout: 'A single card occupies the middle band of the canvas — a soft off-white or near-white surface with a very large corner radius (roughly 40px), a hairline border in the muted color at 15% opacity, and a soft wide shadow, sitting on a slightly deeper ground so the card lifts. Inside the card: an optional small uppercase accent kicker, then the quote in near-black weight 500 at comfortable leading, six lines maximum, then a thin divider rule, then the attribution in the muted color (name and company, small, one or two lines). When a metric is supplied, it sits inside the card beneath the divider as a compact accent-colored value with its label beside it in the muted color. The card keeps at least 8% of the canvas as clear margin on every side, and its internal padding is generous — at least 6% of the canvas width.',
    notes: 'The lifted card is the whole idea: it reads as a testimonial pulled out of an interface. Keep the ground plain so the card is the only object.',
    doNot: ['five-star rating graphics', 'fake avatar photos of the client', 'quotation-mark stamps at both ends', 'social-network UI chrome'],
  },
  {
    id: 'case-snapshot',
    name: 'Case Snapshot',
    intent: 'proof',
    platforms: ['linkedin', 'instagram'],
    whenToUse: 'The post walks through a real engagement: the problem, what was done, and the outcome.',
    slots: ['kicker?', 'headline?', 'items', 'metric_value?', 'metric_label?'],
    copyBudget: { headlineWords: 8, items: 3, itemWords: 9 },
    surface: 'ink',
    founderTreatment: 'none',
    layout: 'An optional headline occupies the top 16%. Below it, three horizontal rows fill the middle band, each with a short uppercase label in the muted color with wide letter-spacing on the left (the stage name derived from the copy, for example the challenge, the action, the result) and the row text in the primary text color, weight 600, on the right, one or two lines each. Rows are separated by a hairline rule in the muted color at 15% opacity and a full line-height of space above and below. The FINAL row is the result and is emphasized: its text renders in the accent color at roughly 1.3x the other rows. When a metric value is supplied it replaces that final row\'s text and renders larger still. The bottom 12% stays empty.',
    notes: 'Reads like a well-set case-study spread: labels quiet, content loud, the outcome unmistakably the payoff.',
    doNot: ['icons per row', 'timeline graphics', 'more than three rows', 'client logos'],
  },

  // ─────────── ENGAGEMENT ───────────
  {
    id: 'question-card',
    name: 'Question Card',
    intent: 'engagement',
    platforms: ['linkedin', 'instagram'],
    whenToUse: 'The post exists to start a conversation — it asks the audience something real and expects replies.',
    slots: ['headline', 'support?', 'kicker?'],
    copyBudget: { headlineWords: 12, items: 0 },
    surface: 'brand',
    founderTreatment: 'chip',
    layout: 'The question is centered in the middle band of the brand-colored canvas, weight 700, four lines maximum, with short line lengths and comfortable leading. An optional small uppercase kicker sits above it with wide letter-spacing at 70% opacity. An optional support line sits below the question, separated by a generous gap, small and at 70% opacity. Everything above y 25% and below y 78% stays empty apart from the founder chip. No cards, no rules, no imagery.',
    notes: 'Full-bleed brand color plus one centered question is deliberately bare — the emptiness is what makes it feel like a direct address rather than a graphic.',
    doNot: ['question-mark illustrations', 'poll or vote UI graphics', 'emoji', 'multiple questions'],
  },
  {
    id: 'hot-take',
    name: 'Hot Take',
    intent: 'engagement',
    platforms: ['linkedin', 'instagram'],
    whenToUse: 'The post takes a contrarian or uncomfortable position the audience will react to.',
    slots: ['kicker?', 'headline', 'support?'],
    copyBudget: { headlineWords: 14, items: 0 },
    surface: 'ink',
    founderTreatment: 'none',
    layout: 'A solid accent-colored pill sits in the upper area, left-aligned to the margin, holding a short uppercase label in the contrasting color with wide letter-spacing (for example "UNPOPULAR OPINION" or a label derived from the kicker). Below it, separated by a clear gap of at least 6% of the canvas height, the claim runs in the primary text color, weight 800, left-aligned, four lines maximum, set as large as the margins allow. A thick accent-colored vertical bar (about 10px wide) runs down the left margin alongside the full height of the claim. An optional support line sits below in the muted color, one line. The bottom 15% stays empty.',
    notes: 'The label pill plus the left bar give it an editorial "column" signature — opinionated without shouting in all caps.',
    doNot: ['fire or flame graphics', 'all-caps body text', 'exclamation marks', 'meme formatting'],
  },

  // ─────────── PROMOTIONAL ───────────
  {
    id: 'offer-card',
    name: 'Offer Card',
    intent: 'promotional',
    platforms: ['linkedin', 'instagram'],
    whenToUse: 'The post sells something specific — a service, a program, a product — and names what the buyer gets.',
    slots: ['kicker?', 'headline', 'items', 'cta', 'support?'],
    copyBudget: { headlineWords: 9, items: 3, itemWords: 6 },
    surface: 'ink',
    founderTreatment: 'none',
    layout: 'Optional uppercase accent kicker at the top margin. The offer headline sits in the upper third, primary text color, weight 700, two lines maximum, left-aligned. Beneath it a short list of what is included: each line preceded by a small accent-colored dot or short dash, text in the primary text color weight 500, one line each, with a full line of space between them. Near the bottom, a solid accent-colored CTA pill spanning roughly 55% of the canvas width with the CTA text centered inside it in the contrasting color, weight 700 — with at least 8% of the canvas height of clear space above the pill. An optional support line (price, timeframe, or scarcity) sits directly beneath the pill in the muted color, small.',
    notes: 'Sales clarity without the infomercial: one headline, three concrete inclusions, one button. The generous gap above the CTA is what keeps it premium.',
    doNot: ['starbursts, badges, or "LIMITED TIME" stamps', 'strike-through pricing graphics', 'more than three inclusions', 'multiple CTA buttons'],
  },
  {
    id: 'announcement-card',
    name: 'Announcement',
    intent: 'promotional',
    platforms: ['linkedin', 'instagram'],
    whenToUse: 'Something is new or now live — a launch, a feature, a partnership, an event, a milestone.',
    slots: ['kicker?', 'headline', 'support?', 'cta?'],
    copyBudget: { headlineWords: 10, items: 0 },
    surface: 'paper',
    founderTreatment: 'chip',
    layout: 'A small solid accent-colored pill sits centered in the upper area holding a short uppercase label with wide letter-spacing (for example the kicker, or a plain word like "NEW" or "NOW LIVE" derived from the copy). Below it, centered and separated by a generous gap, the announcement headline in near-black, weight 700, three lines maximum, with short line lengths. Below that an optional support line in the muted color, one or two lines, at roughly a third of the headline size. An optional CTA renders as accent-colored text with a short underline rule near the bottom — text, never a second pill. The outer 10% of the canvas on every side stays completely empty.',
    notes: 'Centered, calm, and paper-clean so the news itself is the event. The single accent pill is the only saturated element.',
    doNot: ['confetti, sparkles, or celebration graphics', 'megaphone or bell icons', 'multiple badges', 'product screenshots'],
  },

  // ─────────── STORY ───────────
  {
    id: 'story-photo-overlay',
    name: 'Photo Moment',
    intent: 'story',
    platforms: ['instagram', 'linkedin'],
    whenToUse: 'The post is a personal moment, a behind-the-scenes look, or a narrative where a real scene beats a graphic.',
    slots: ['headline', 'support?'],
    copyBudget: { headlineWords: 10, items: 0 },
    surface: 'ink',
    founderTreatment: 'portrait-hero',
    layout: 'A single real photographic scene fills the entire canvas — natural available light, real environment, believable depth of field, the kind of frame a good photographer would catch rather than stage. Composition leaves the lower third visually calm. A smooth dark gradient rises from the bottom edge to roughly y 45%. The line of copy sits inside that zone in the primary text color, weight 600, left-aligned to the margin, two lines maximum, at a modest size — this is a caption on a photograph, never a poster headline. An optional support line sits beneath it in the muted color, one line, smaller. No other elements.',
    notes: 'The photograph is the content and it must look photographed, not rendered: natural color, real texture, no studio rim lighting or neon grading.',
    doNot: ['studio or three-point lighting', 'neon or teal-and-orange color grading', 'text boxes or panels over the photo', 'illustrated or CGI-looking scenes'],
  },
];

export const IMAGE_POST_TEMPLATE_IDS = IMAGE_POST_TEMPLATES.map((t) => t.id);

const TEMPLATES_BY_ID = new Map(IMAGE_POST_TEMPLATES.map((t) => [t.id, t]));

export function getImagePostTemplate(templateId) {
  if (!templateId) return null;
  return TEMPLATES_BY_ID.get(String(templateId).trim()) || null;
}

// ── Catalog block for system prompts ──
// Compact on purpose: the model needs id + name + "use when", nothing more.
// The layout prose stays server-side — the model never needs to see it.
//
// platform: 'instagram' | 'linkedin' (a /Content tab, where the platform is
// already fixed) or 'both' (the AI CEO tab, which serves both feeds — the
// template list is emitted ONCE with both role blocks rather than twice).
//
// includeUsage: emit the "call generate_image with these fields" section.
// Pass false where the template choice arrives through a DIFFERENT tool
// (the plan-item route's compose_single_image_post), so the model isn't
// told to call a tool it doesn't have.
export function buildImagePostTemplateCatalog({ platform = 'instagram', includeUsage = true } = {}) {
  const both = platform === 'both';
  const p = platform === 'linkedin' ? 'linkedin' : 'instagram';
  const cfg = IMAGE_POST_PLATFORM_CONFIG[p];

  const byIntent = new Map();
  for (const t of IMAGE_POST_TEMPLATES) {
    if (!both && !t.platforms.includes(p)) continue;
    if (!byIntent.has(t.intent)) byIntent.set(t.intent, []);
    byIntent.get(t.intent).push(t);
  }
  const lines = [];
  for (const [intent, list] of byIntent) {
    lines.push(`${intent.toUpperCase()}:`);
    for (const t of list) lines.push(`  - ${t.id} ("${t.name}") — ${t.whenToUse}`);
  }

  const roleBlock = both
    ? `The two feeds are NOT the same job:\n\n${IMAGE_POST_PLATFORM_CONFIG.linkedin.role}\n\n${IMAGE_POST_PLATFORM_CONFIG.instagram.role}`
    : cfg.role;
  const platformLine = both
    ? `  post_platform: "instagram" or "linkedin" — whichever feed this post is for`
    : `  post_platform: "${p}"`;
  const budgetLine = both
    ? `total visible words across the image: ${IMAGE_POST_PLATFORM_CONFIG.linkedin.maxWords} MAXIMUM on LinkedIn, ${IMAGE_POST_PLATFORM_CONFIG.instagram.maxWords} MAXIMUM on Instagram.`
    : `total visible words across the image ${cfg.maxWords} MAXIMUM.`;

  const usage = includeUsage
    ? `
HOW TO USE THEM — when you call generate_image for a SINGLE-IMAGE POST you MUST pass:
  purpose: "post_image"
${platformLine}
  post_template: one id from the list above
  post_copy: only the fields that template needs (headline, kicker, support, items, metric_value, metric_label, attribution, cta, visual_subject)
  prompt: one plain sentence describing the subject — a fallback only, the server replaces it with the composed layout.
`
    : '';
  const tail = includeUsage
    ? `\nStories, thumbnails, plain images, and edits of an attached image do NOT use templates: call generate_image with purpose "story_frame" / "thumbnail" / "plain_image" / "edit_existing" and a normal descriptive prompt.`
    : '';

  return `=== SINGLE-IMAGE POST TEMPLATES (the server renders the layout — you choose it and write the copy) ===
${roleBlock}

Pick the ONE template whose "use when" matches what this post is actually doing. The server owns the layout, the spacing, the brand colors, and the typography — you never describe visual design for a post image. Every template works on both feeds; the role above is what changes.

${lines.join('\n')}
${usage}
COPY BUDGET (hard limits — the layout is built on whitespace and breaks when overfilled): ${budgetLine} Headline ≤ 12 words. List items ≤ 5 items, ≤ 7 words each. One idea per image. If the copy does not fit, cut words — never add another element.${tail}`;
}

// ── Deterministic fallback selection ──
// Used when the model gave us structured copy but no (or an invalid)
// template id. Ordered by signal strength; never random, so a regeneration
// composes the identical prompt.
export function pickImagePostTemplate({ platform = 'instagram', copy = {} } = {}) {
  const p = platform === 'linkedin' ? 'linkedin' : 'instagram';
  const fits = (id) => {
    const t = getImagePostTemplate(id);
    return t && t.platforms.includes(p) ? t : null;
  };
  const items = Array.isArray(copy.items) ? copy.items.filter(Boolean) : [];
  const text = `${copy.kicker || ''} ${copy.headline || ''} ${copy.support || ''}`.toLowerCase();

  if (copy.metric_value && items.length === 2) return fits('before-after') || fits('metric-hero');
  if (copy.metric_value) return fits('metric-hero');
  if (items.length >= 3 && /step|then|next|first|stage|phase/.test(text)) return fits('process-flow');
  if (items.length >= 3) return fits('numbered-framework');
  if (items.length === 2) return fits('versus-split');
  if (copy.attribution) return fits('typographic-quote');
  if (copy.cta) return fits('offer-card');
  if (/\?\s*$/.test(String(copy.headline || '').trim())) return fits('question-card');
  return fits('insight-statement') || IMAGE_POST_TEMPLATES[0];
}

// ── Brand resolution ──
// Templates are brand-agnostic; this turns the user's Brand DNA into the
// concrete hex values the image model needs. Deterministic — the same
// inputs always produce the same palette, so regenerating an image
// reproduces the original prompt exactly.
const NEUTRAL_ACCENT = '#2F6FED';
const INK = '#0B0D10';
const PAPER = '#F6F5F2';

function normalizeHex(v) {
  const s = String(v || '').trim();
  return /^#[0-9a-fA-F]{6}$/.test(s) ? s.toUpperCase() : null;
}

// Relative luminance (sRGB) — decides readable text on a brand-colored ground.
function readableTextOn(hex) {
  const h = normalizeHex(hex);
  if (!h) return '#FFFFFF';
  const chan = (i) => {
    const c = parseInt(h.slice(1 + i * 2, 3 + i * 2), 16) / 255;
    return c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
  };
  const L = 0.2126 * chan(0) + 0.7152 * chan(1) + 0.0722 * chan(2);
  return L > 0.45 ? INK : '#FFFFFF';
}

function resolvePalette(template, brandDna) {
  const colors = brandDna?.colors || {};
  const brandPrimary = normalizeHex(colors.primary);
  const brandSecondary = normalizeHex(colors.secondary);
  const accent = brandPrimary || brandSecondary || NEUTRAL_ACCENT;

  if (template.surface === 'paper') {
    return {
      surfaceLabel: 'light',
      background: PAPER,
      text: INK,
      muted: '#5A5F66',
      accent,
      onAccent: readableTextOn(accent),
    };
  }
  if (template.surface === 'brand') {
    const ground = brandPrimary || NEUTRAL_ACCENT;
    const onGround = readableTextOn(ground);
    return {
      surfaceLabel: 'brand',
      background: ground,
      text: onGround,
      muted: onGround === '#FFFFFF' ? '#E4E7EC' : '#3D434B',
      // On a brand-colored ground the accent must contrast with it, so the
      // accent role flips to the text color rather than fighting the ground.
      accent: onGround,
      onAccent: ground,
    };
  }
  return {
    surfaceLabel: 'dark',
    background: INK,
    text: '#FFFFFF',
    muted: '#A7ADB6',
    accent,
    onAccent: readableTextOn(accent),
  };
}

// Strip CSS-ish syntax an LLM may have put in a copy field — image models
// render "linear-gradient(...)" and "{{x}}" as literal text on the canvas.
// (Same failure mode the carousel builder guards against.)
function cleanCopy(s) {
  return String(s || '')
    .replace(/\{\{\/?accent\}\}/gi, '')
    .replace(/\[\/?ACCENT\]/gi, '')
    .replace(/\{\{([^{}]+?)\}\}/g, '$1')
    .replace(/<\/?[a-zA-Z][^<>]*>/g, '')
    .replace(/\[([A-Z][A-Z0-9_-]{1,30})\]/g, '$1')
    .replace(/linear-gradient\([^)]*\)/gi, '')
    .replace(/radial-gradient\([^)]*\)/gi, '')
    .replace(/rgba?\([^)]*\)/gi, '')
    .replace(/\s{2,}/g, ' ')
    .trim();
}

// Marker the render route looks for to know this prompt owns its own
// composition (person placement included) — mirrors how a carousel slide
// prompt is recognised by its "DESIGN SYSTEM" block.
export const IMAGE_POST_PROMPT_MARKER = 'IMAGE POST TEMPLATE';

const BREATHING_ROOM = `BREATHING ROOM — AS IMPORTANT AS THE LAYOUT ITSELF: this design lives on empty space. Keep roughly a third of the canvas visually EMPTY. Leave a clear gap between every zone; never let two text blocks sit closer than one full line of text. Headline leading about 1.15, body leading about 1.5. If the TEXT CONTENT does not fit comfortably, render it SMALLER — never tighten the margins, never squeeze the leading, never add a second column to make it fit. A dense, cluttered, information-heavy image is a FAILED render.`;

const PERSON_TREATMENT = {
  none: 'PERSON: no person appears in this image. Do NOT add a portrait, an avatar, a silhouette, or any human figure — this layout is deliberately face-free.',
  chip: 'PERSON: a single small circular founder avatar as a quiet byline mark, about 64px in diameter on the 1080 canvas, in a bottom corner inside the margin, cropped from the attached founder reference photo with exact likeness and natural photographic skin texture. It is a signature, never a subject: it must not overlap or crowd any text. If NO founder reference photo is attached, OMIT this element entirely — never invent a face.',
  'portrait-side': 'PERSON: the founder appears as a real photographic portrait occupying the zone described in the layout, cropped to the shoulders and bled to the canvas edge. Use the attached founder reference photo: exact likeness (same facial structure, hairline, and skin tone), real photographic skin with visible texture, natural lighting. If NO founder reference photo is attached, OMIT the portrait entirely and let the text zone expand to fill the canvas — never invent a face.',
  'portrait-hero': 'PERSON: the founder is the photographic subject of this image, rendered from the attached founder reference photo with exact likeness (same facial structure, nose, jawline, eye shape, hairline, hair texture, and skin tone), real photographic skin with visible pores and natural asymmetry, and natural believable lighting. Never idealize, slim, de-age, or airbrush them. If NO founder reference photo is attached, OMIT the person entirely and render the scene or the type alone — never invent a face.',
};

const DO_NOT_RENDER_AS_TEXT = [
  'do not render any hex color codes (like #abc123) anywhere on the image',
  'do not render any CSS syntax or fragments such as "linear-gradient", "rgba", "span", "div", "px", "em", "weight"',
  'do not render ANY measurement annotation anywhere: no pixel values ("48px"), no percentage values ("28%", "y 45%"), no coordinates — every number in the LAYOUT section is an invisible blueprint coordinate, never visible content',
  'do not draw the layout grid itself: no ruler marks, no spacing labels, no dimension callouts along the edges (an image with small px/% numbers down its sides is a FAILED render)',
  'do not render font weight numbers (for example "600", "700") anywhere on the image',
  'do not render curly braces, square brackets, or angle brackets',
  'do not render the words "kicker", "headline", "accent", "opacity", "leading", "muted", or any other styling or slot jargon as literal text',
  'the ONLY text that may appear on the image is the text listed in TEXT CONTENT below, nothing more',
];

const GLOBAL_DO_NOT = [
  'no charts, graphs, plotted lines, or axis labels — image models render them as gibberish and it destroys credibility',
  'no stock photography clichés (handshakes, boardroom high-fives, laptop-and-coffee flat lays)',
  'no clip-art, cartoon, 3D-render, or pixel-art styling',
  'no social-network UI chrome (like/comment icons, profile headers, progress bars)',
  'no watermarks, no invented logos, no lorem ipsum, no placeholder text',
  'no emoji anywhere on the image',
  'no misspelled words — every rendered word must match the TEXT CONTENT exactly',
];

// ── The deterministic prompt builder ──
//
// Block architecture is copied from buildCarouselSlidePrompt(): strict
// separation of WHAT text to render (TEXT CONTENT) from HOW to render it
// (VISUAL STYLE), because image models will otherwise print hex codes and
// "48px" onto the canvas as visible words.
export function buildImagePostPrompt({ template, platform = 'instagram', copy = {}, brandDna = null }) {
  const t = template || IMAGE_POST_TEMPLATES[0];
  const p = platform === 'linkedin' ? 'linkedin' : 'instagram';
  const cfg = IMAGE_POST_PLATFORM_CONFIG[p];
  const pal = resolvePalette(t, brandDna);
  const font = String(brandDna?.main_font || '').trim();
  const budget = t.copyBudget || {};

  const kicker = cleanCopy(copy.kicker).toUpperCase();
  const headline = cleanCopy(copy.headline);
  const support = cleanCopy(copy.support);
  const attribution = cleanCopy(copy.attribution);
  const cta = cleanCopy(copy.cta);
  const metricValue = cleanCopy(copy.metric_value);
  const metricLabel = cleanCopy(copy.metric_label);
  const visualSubject = cleanCopy(copy.visual_subject);
  // Cap the item COUNT deterministically (never truncate a string
  // mid-sentence — that ships broken copy). Word budgets are enforced
  // upstream by the tool description and the catalog block.
  const maxItems = Number.isFinite(budget.items) ? budget.items : 5;
  const items = (Array.isArray(copy.items) ? copy.items : [])
    .map(cleanCopy)
    .filter(Boolean)
    .slice(0, Math.max(0, maxItems));

  const slots = new Set((t.slots || []).map((s) => s.replace('?', '')));
  const textLines = [];
  if (kicker && slots.has('kicker')) textLines.push(`  • Kicker / label (small, uppercase, wide letter-spacing): "${kicker}"`);
  if (metricValue && slots.has('metric_value')) textLines.push(`  • Metric value (the hero element): "${metricValue}"`);
  if (metricLabel && slots.has('metric_label')) textLines.push(`  • Metric label (directly under the value): "${metricLabel}"`);
  if (headline && slots.has('headline')) textLines.push(`  • Headline: "${headline}"`);
  if (items.length && slots.has('items')) {
    textLines.push(`  • List items (render in this exact order, one per row):`);
    items.forEach((it, i) => textLines.push(`      ${i + 1}. "${it}"`));
  }
  if (support && slots.has('support')) textLines.push(`  • Support line: "${support}"`);
  if (attribution && slots.has('attribution')) textLines.push(`  • Attribution: "${attribution}"`);
  if (cta && slots.has('cta')) textLines.push(`  • CTA: "${cta}"`);

  const visualStyle = [
    `Canvas: ${cfg.canvas}, high resolution.`,
    `Ground: solid ${pal.background} filling the entire canvas${t.surface === 'ink' ? ', with an extremely subtle darker vignette toward the corners and fine grain at about 3 percent opacity' : t.surface === 'paper' ? ', with a barely perceptible paper grain at about 3 percent opacity' : ', flat and clean with no gradient or texture'}.`,
    `Primary text color: ${pal.text}. Muted / secondary text color: ${pal.muted}. Accent color: ${pal.accent} (use it for at most two elements — the accent is a highlight, not a theme). Text sitting ON the accent color renders in ${pal.onAccent}.`,
    `Typography: ${font ? `the ${font} family (or the closest clean neutral sans-serif)` : 'a clean modern neutral sans-serif such as Inter or Söhne'}. Headline sizing around ${cfg.headlinePx} pixels on this canvas, body around ${cfg.bodyPx} pixels. Never a decorative script, never a condensed display face, never a serif unless the layout explicitly calls for one.`,
    `Margins: at least ${cfg.marginPx} pixels of clear space on every edge. Nothing touches or bleeds off the canvas edge except elements the layout explicitly bleeds.`,
    `Color lock: use ONLY ${pal.background}, ${pal.text}, ${pal.muted}, and ${pal.accent}. Do not introduce any other color.`,
  ].join('\n');

  const layoutBlock = [
    `LAYOUT — ${IMAGE_POST_PROMPT_MARKER} "${t.name}" (${t.intent}). Build the composition exactly as described; this layout is a hard requirement, not a suggestion:`,
    t.layout,
    PERSON_TREATMENT[t.founderTreatment] || PERSON_TREATMENT.none,
    t.notes ? `STYLE SIGNATURE: ${t.notes}` : '',
    BREATHING_ROOM,
    visualSubject ? `SUBJECT HINT (for any photographic or textural element this layout calls for — never render this text on the image): ${visualSubject}` : '',
  ].filter(Boolean).join('\n');

  return [
    `You are rendering ONE finished ${cfg.label} single-image post (${cfg.canvasShort}) using the "${t.name}" layout template.`,
    ``,
    `=== ROLE OF THIS IMAGE ON ${cfg.label.toUpperCase()} ===`,
    cfg.role,
    ``,
    `=== TEXT CONTENT (render EXACTLY these strings — same words, same punctuation, same capitalization — and NO other text) ===`,
    textLines.length ? textLines.join('\n') : `  • Headline: "${headline || ''}"`,
    ``,
    `=== VISUAL STYLE (hex codes and sizes are styling instructions — they live HERE and must never appear as text on the image) ===`,
    visualStyle,
    ``,
    `=== LAYOUT ===`,
    layoutBlock,
    ``,
    `=== DO NOT RENDER AS TEXT (strict) ===`,
    DO_NOT_RENDER_AS_TEXT.map((s) => `- ${s}`).join('\n'),
    ``,
    `=== DO NOT INCLUDE (visual) ===`,
    [...GLOBAL_DO_NOT, ...(t.doNot || []).map((s) => `no ${s}`)].map((s) => `- ${s}`).join('\n'),
    ``,
    `HARD RULES: Every word on the image must be copied exactly from TEXT CONTENT above. Any word not listed there must not appear. If you are tempted to render a hex code, a size, a measurement, or a styling term as visible text, STOP — those are instructions, not content. The finished image must look like a designer made it in Figma for a serious business audience: one idea, generous whitespace, perfect spelling.`,
  ].join('\n');
}

// ── Relay enforcement ──
//
// Same role applyCuratedTemplateToPlanArgs() plays for carousels: the
// model's tool args go in, a fully composed prompt comes out, so the
// template is applied deterministically instead of depending on the model
// following prose instructions.
//
// `repair` is an optional async fallback (image-post-composer.js) used when
// the model declared a post image but skipped the structured copy fields.
// Returns the applied template id, or null when nothing was applied.
export async function applyImagePostTemplateToArgs(args, {
  platform = null,
  brandDna = null,
  explicitTemplateId = null,
  repair = null,
  logLabel = 'image-post',
} = {}) {
  if (!args || typeof args !== 'object') return null;

  const purpose = String(args.purpose || '').trim();
  const rawPlatform = String(args.post_platform || platform || '').toLowerCase();
  const p = rawPlatform === 'linkedin' ? 'linkedin' : rawPlatform === 'instagram' ? 'instagram' : null;

  const strip = () => {
    delete args.purpose;
    delete args.post_platform;
    delete args.post_template;
    delete args.post_copy;
  };

  // Only feed-post images on IG/LI are templated. Stories, thumbnails,
  // plain images and edits keep their existing free-form behavior.
  if (!p || (purpose && purpose !== 'post_image')) {
    strip();
    return null;
  }
  if (!purpose && !args.post_copy && !args.post_template) {
    // No signal at all that this is a post image — leave it alone.
    strip();
    return null;
  }

  let copy = (args.post_copy && typeof args.post_copy === 'object') ? { ...args.post_copy } : null;
  let source = copy?.headline || copy?.metric_value ? 'model' : null;

  if (!source && typeof repair === 'function') {
    try {
      const spec = await repair({ platform: p, brief: String(args.prompt || '') });
      if (spec?.copy?.headline || spec?.copy?.metric_value) {
        copy = spec.copy;
        if (!args.post_template && spec.template) args.post_template = spec.template;
        source = 'repair';
      }
    } catch (err) {
      console.warn(`[${logLabel}] repair pass failed: ${err?.message || err}`);
    }
  }

  if (!source) {
    console.warn(`[${logLabel}] platform=${p} purpose=${purpose || 'n/a'} — no structured copy and no repair; leaving the model's own prompt`);
    strip();
    return null;
  }

  let template = getImagePostTemplate(explicitTemplateId);
  let templateSource = template ? 'explicit' : null;
  if (!template) {
    template = getImagePostTemplate(args.post_template);
    if (template) templateSource = 'model';
  }
  if (!template || !template.platforms.includes(p)) {
    template = pickImagePostTemplate({ platform: p, copy });
    templateSource = 'auto';
  }

  args.prompt = buildImagePostPrompt({ template, platform: p, copy, brandDna });
  strip();
  console.log(`[${logLabel}] template=${template.id} platform=${p} copy=${source} pick=${templateSource}`);
  return template.id;
}
