// Server-side copy of the deterministic per-slide carousel prompt builder
// (Phase 2, docs/unified-content-backend-plan.md).
//
// VERBATIM copy of src/lib/carouselGen.js (the canonical shared lib used
// by the AICEO chat; Content.jsx holds byte-identical local copies) as of
// 2026-07-15. Consumed by POST /api/generate/carousel so slide rendering
// happens server-side with the exact same locked design-system prompts.
//
// NOTE: src/lib/carouselGen.js still holds the frontend copy used by the
// single-slide edit/regenerate flows — keep it in sync with this file.


// Shared carousel-generation helpers. Currently consumed by AICEO chat
// (src/pages/AiCeo.jsx) — /Content still has its own local copies of
// these functions in src/pages/Content.jsx while its chat pipeline stays
// intact. When /Content migrates to the shared pipeline, it can drop
// those and import from here — the definitions below are byte-identical
// to Content's originals so behavior matches exactly.
//
// Exports:
//   extractAccent(text)                                  — pull {{accent}}...{{/accent}} spans out of a headline
//   sanitizeStyleText(s)                                 — strip CSS-like syntax so image models don't render it as text
//   CAROUSEL_PLATFORM_CONFIG                             — per-platform layout constants
//   buildCarouselSlidePrompt({...})                      — deterministic per-slide prompt for /api/generate/image

// ── Accent-marker extraction ──
//
// Pulls text between {{accent}}...{{/accent}} or [ACCENT]...[/ACCENT] out
// as separate strings so we can describe the highlight to the image model
// in plain English rather than leaving marker syntax in the visible text.
//
// Also strips ANY OTHER curly-brace / angle-bracket wrapper that Sonnet
// might have introduced ({{sales team}}, <highlight>foo</highlight>, etc.)
// — image models were literally rendering those brackets on the slide.
// Wrapped tokens are kept, only the brackets are stripped.
export function extractAccent(text) {
  const accentWords = [];
  const capture = (_, w) => { const t = w.trim(); if (t) accentWords.push(t); return w; };
  let cleaned = String(text || '')
    // Structured accent markers: capture the inner word first.
    .replace(/\{\{accent\}\}([\s\S]*?)\{\{\/accent\}\}/gi, capture)
    .replace(/\[ACCENT\]([\s\S]*?)\[\/ACCENT\]/gi, capture);
  cleaned = cleaned
    // Defensive cleanup of stray / malformed accent tags.
    .replace(/\{\{\/?accent\}\}/gi, '')
    .replace(/\[\/?ACCENT\]/gi, '')
    // Universal cleanup of any remaining bracket wrappers Sonnet may have
    // slipped in ({{sales team}}, {{key point}}, <highlight>foo</highlight>,
    // <em>bar</em>). Keep the inner text, drop the wrapper.
    .replace(/\{\{([^{}]+?)\}\}/g, '$1')
    .replace(/<\/?[a-zA-Z][^<>]*>/g, '')
    // Also strip stray single-brace [something] wrappers when they look
    // like a marker (all-caps or short keyword).
    .replace(/\[([A-Z][A-Z0-9_-]{1,30})\]/g, '$1')
    .replace(/\s{2,}/g, ' ')
    .trim();
  return { cleaned, accentWords };
}

// ── Style-text sanitizer ──
//
// Removes CSS / code-like syntax that an LLM might have placed in a
// styling field (e.g. "linear-gradient(90deg, #f4d19a)"). Image models
// will render such strings as literal text on the image — this strips
// them so our own natural-language sentences carry the styling.
export function sanitizeStyleText(s) {
  return String(s || '')
    .replace(/linear-gradient\([^)]*\)/gi, '')
    .replace(/radial-gradient\([^)]*\)/gi, '')
    .replace(/rgba?\([^)]*\)/gi, '')
    .replace(/hsla?\([^)]*\)/gi, '')
    .replace(/[{}<>;]/g, '')
    .replace(/\s{2,}/g, ' ')
    .trim();
}

// ── Per-platform layout config ──
//
// Rendering parameters the image model honors. Adding a new platform =
// one config object, not a fork of the prompt builder.
export const CAROUSEL_PLATFORM_CONFIG = {
  instagram: {
    canvas: '1080 x 1080 pixels (square, 1:1 aspect ratio)',
    canvasShort: '1080x1080 square',
    aspectLabel: 'square',
    headlineHookPx: '88-110',
    headlineMiddlePx: '92-108',
    headlineFinalPx: '64-80',
    bodyPx: '22-24',
    bodyPxHook: 22,
    leftMarginPx: 96,
    rightMarginPx: 120,
    moodReferences: 'an editorial Instagram spread — think Offscreen, Kinfolk, or It\'s Nice That: premium, visually expressive, trend-aware',
    ghostNumeralPx: 520,
    defaultSlideCountLabel: '5-9',
    slideCountGuidance: '5-9 slides is standard for Instagram — 7 is the sweet spot for depth without swipe fatigue',
    toneNote: 'IG audiences reward visually rich design and confident editorial energy',
  },
  linkedin: {
    canvas: '1080 x 1440 pixels (portrait, 3:4 aspect ratio — LinkedIn document carousel standard)',
    canvasShort: '1080x1440 portrait',
    aspectLabel: '3:4 portrait',
    headlineHookPx: '76-96',
    headlineMiddlePx: '80-100',
    headlineFinalPx: '60-76',
    bodyPx: '24-28',
    bodyPxHook: 24,
    leftMarginPx: 80,
    rightMarginPx: 100,
    moodReferences: 'a professional thought-leadership document — think Harvard Business Review cover, a Stripe engineering blog hero, or a Basecamp article header: confident, data-forward, restrained',
    ghostNumeralPx: 480,
    defaultSlideCountLabel: '7-12',
    slideCountGuidance: '7-12 slides is standard for LinkedIn — longer carousels perform because LI audiences expect depth and substance',
    toneNote: 'LinkedIn readers reward substance, specificity, and a professional tone — no trendy-design language, no emoji',
  },
};

// ── Deterministic per-slide prompt builder ──
//
// IMPORTANT: image models will literally render code-looking fragments
// ("span", "linear-gradient(...)", "18px, 400", raw hex codes) as text.
// So this prompt uses strict separation:
//   TEXT CONTENT   — exact strings that should appear on the image.
//   VISUAL STYLE   — how to render them. Hex/sizes go here, in parens.
//   DO NOT RENDER  — hard list of tokens forbidden as visible text.
export function buildCarouselSlidePrompt({ designSystem: ds, slide, index, total, brand, platform = 'instagram', template = null }) {
  const cfg = CAROUSEL_PLATFORM_CONFIG[platform] || CAROUSEL_PLATFORM_CONFIG.instagram;
  const p = ds.palette || {};
  const card = ds.card || {};
  const badge = ds.badge || {};
  const typo = ds.typography || {};
  const brandStrip = ds.brandStrip || {};
  const corner = (ds.glowCorners && ds.glowCorners[index]) || ['TL', 'TR', 'BR', 'BL'][index % 4];
  const cornerLabel = { TL: 'top-left', TR: 'top-right', BL: 'bottom-left', BR: 'bottom-right', CENTER: 'center' }[corner] || 'top-right';
  const slideNum = String(index + 1).padStart(2, '0');
  const totalNum = String(total).padStart(2, '0');
  const isFinal = index === total - 1;
  const isHook = index === 0;
  const isMiddle = !isHook && !isFinal;
  // Subtle founder presence on middle slides (founder request
  // 2026-07-20): hook + CTA carry the prominent founder visuals; exactly
  // ONE middle slide (TWO when the deck is 9+ slides) gets a quiet
  // founder byline chip so the person threads through the whole set.
  const founderMiddleIdxs = (() => {
    if (total < 5) return new Set();
    const center = Math.floor((total - 1) / 2);
    const set = new Set([center]);
    if (total >= 9) {
      const late = Math.floor(((total - 1) * 3) / 4);
      if (late !== center && late > 0 && late < total - 1) set.add(late);
    }
    return set;
  })();
  const isFounderByline = isMiddle && founderMiddleIdxs.has(index);

  const { cleaned: headlineClean, accentWords } = extractAccent(slide.headline);
  // Same universal marker-stripper we apply to the headline via
  // extractAccent — Sonnet's body copy also arrived with {{key term}},
  // <em>foo</em> etc. and the image models were rendering the brackets
  // as literal characters.
  const bodyClean = String(slide.body || '')
    .replace(/\{\{\/?accent\}\}/gi, '')
    .replace(/\[\/?ACCENT\]/gi, '')
    .replace(/\{\{([^{}]+?)\}\}/g, '$1')
    .replace(/<\/?[a-zA-Z][^<>]*>/g, '')
    .replace(/\[([A-Z][A-Z0-9_-]{1,30})\]/g, '$1')
    .replace(/\s{2,}/g, ' ')
    .trim();
  const badgeText = String(slide.badge || '').toUpperCase().replace(/[{}<>]/g, '').trim();
  const brandName = String(brandStrip.brandName || brand?.name || '').trim();
  const chapterNum = `CH ${String(index).padStart(2, '0')}`;
  const ghostNumeral = String(index + 1).padStart(2, '0');
  const ctaText = String(slide.cta || (isFinal ? 'Follow for more' : '')).trim();

  const accentPhrase = accentWords.length
    ? `Highlighted word${accentWords.length === 1 ? '' : 's'}: ${accentWords.map(w => `"${w}"`).join(' and ')}. Render only ${accentWords.length === 1 ? 'that word' : 'those words'} with a smooth left-to-right gradient fill from ${p.gradientStart || p.accentPrimary || 'the highlight color'} to ${p.gradientEnd || p.accentPrimary || 'the highlight color'}. No underline. No outline. No glow on the letters.`
    : `No highlighted word on this slide — render the headline in a single solid color (primary text color).`;

  let visualStyle = [
    `Canvas: ${cfg.canvas}, high resolution.`,
    `Background: solid ${p.background || '#0f1115'} across the entire canvas, with a soft radial gradient glow of ${p.glow || p.accentPrimary || '#e5a82c'} anchored in the ${cornerLabel} corner and fading to transparent. Overlay a very subtle ${sanitizeStyleText(ds.texture) || 'fine grain noise at about 4 percent opacity'}.`,
    `Typography: modern clean sans-serif in the ${typo.family || 'Inter'} family (or a close neutral sans-serif fallback). Never serif. Never decorative script.`,
    `Headline color: ${p.textPrimary || '#ffffff'} (primary text). Body color: ${p.textMuted || '#b5b9c4'} (muted text).`,
    `Accent gradient: smooth two-stop gradient from ${p.gradientStart || p.accentPrimary || '#ffb75a'} to ${p.gradientEnd || p.accentPrimary || '#e5a82c'}, applied ONLY to the accent word(s) in the headline. Never apply the gradient to any other text.`,
    `Badge pill: rounded pill with a thin 1px border in the primary text color at about 20 percent opacity, transparent or very dark fill, uppercase label, wide letter-spacing.`,
    `Branding strip at the top: ${brandName ? `the brand wordmark "${brandName}" rendered as clean text in the muted text color, small (~18 pixels tall), top-left at 48 pixels from the edges. No hex codes, no size labels — just the word "${brandName}".` : `no wordmark — leave the top-left empty.`}`,
    `Slide counter at the top-right: the literal text "${slideNum} / ${totalNum}" in a monospaced font, muted text color at ~40 percent opacity, 48 pixels from the edges.`,
    `Color lock: use only these colors — background ${p.background || '#0f1115'}, primary text ${p.textPrimary || '#ffffff'}, muted text ${p.textMuted || '#b5b9c4'}, accent ${p.accentPrimary || '#e5a82c'}, gradient pair ${p.gradientStart || ''} to ${p.gradientEnd || ''}, glow ${p.glow || p.accentPrimary || '#e5a82c'}. Do not introduce any other color.`,
    ds.mood ? `Overall mood: ${sanitizeStyleText(ds.mood)}.` : '',
  ].filter(Boolean).join('\n');

  let textContent;
  let layoutNotes;

  const verticalGrid = `
UNIVERSAL VERTICAL GRID (ALL slides in this carousel follow these EXACT vertical anchor points — do not vary between slides):
• Canvas outer padding: 48px on all edges (branding strip and slide counter sit inside this).
• Branding strip + slide counter: at y ≈ 8% from top (anchored to the top padding line).
• Badge pill row: at y ≈ 18% from top, aligned to the left margin.
• Headline top edge: at y ≈ 28% from top. This is the SAME y-position on every slide.
• Body copy top edge (when body exists): at y ≈ 70% from top.
• Body copy bottom edge: no lower than y ≈ 82% from top.
• Bottom hint pill / footer row: at y ≈ 92% from top.
• Horizontal margins: ${cfg.leftMarginPx}px left, ${cfg.rightMarginPx}px right, consistent on every slide.
The reader swipes and NOTHING shifts vertically except the content itself. Same margins, same anchor lines, every slide.`;

  if (template) {
    // ── PREMADE TEMPLATE MODE ──
    // The curated template's digested layout spec replaces the built-in
    // editorial layout entirely; the design system is the template's own
    // (locked at plan time via designSystem.templateId).
    const role = isHook ? 'hook' : isFinal ? 'final' : 'middle';
    visualStyle = [
      `Canvas: ${cfg.canvas}, high resolution.`,
      `Background: base color ${p.background || '#0f1115'}; ${sanitizeStyleText(ds.texture) || 'clean'}.`,
      `Typography: ${typo.family || 'Inter'} (${typo.fallback || 'sans-serif'} fallback), headline weight ${typo.headlineWeight || 700}, body weight ${typo.bodyWeight || 400}. Follow the template's type pairing exactly (including serif-italic accents when the template uses them).`,
      `Headline color: ${p.textPrimary || '#ffffff'}. Body/muted color: ${p.textMuted || '#b5b9c4'}.`,
      ds.accentTreatment ? `Accent treatment: ${sanitizeStyleText(ds.accentTreatment)}.` : '',
      `Color lock: use ONLY these colors — background ${p.background || ''}, primary text ${p.textPrimary || ''}, muted ${p.textMuted || ''}, accentPrimary ${p.accentPrimary || ''}, accentSecondary ${p.accentSecondary || ''}, gradient ${p.gradientStart || ''} to ${p.gradientEnd || ''}, glow ${p.glow || ''}. No other colors.`,
      ds.mood ? `Overall mood: ${sanitizeStyleText(ds.mood)}.` : '',
    ].filter(Boolean).join('\n');
    layoutNotes = [
      `LAYOUT — PREMADE TEMPLATE "${template.name}" (${role} slide, ${slideNum} of ${totalNum}). Recreate this template's ${role}-slide layout EXACTLY, substituting the TEXT CONTENT below and the USER'S OWN name, brand, and reference photos for the example author's:`,
      `ELEMENTS ON EVERY SLIDE: ${template.layout && template.layout.common ? template.layout.common : ''}`,
      `THIS SLIDE (${role}): ${template.layout && template.layout[role] ? template.layout[role] : ''}`,
      `PERSON TREATMENT: ${template.founderTreatment || 'none'} — use the attached founder reference photos with exact likeness and natural photographic skin texture (never airbrushed). If NO founder reference photo is attached, OMIT every person/avatar element entirely — never invent a face.`,
      template.notes ? `STYLE SIGNATURES: ${template.notes}` : '',
    ].filter(Boolean).join('\n');
    textContent = [
      `  • Headline: "${headlineClean}"`,
      `    ${accentPhrase}`,
      bodyClean ? `  • Body copy: "${bodyClean}"` : '',
      badgeText ? `  • Badge/label: "${badgeText}"` : '',
      (isFinal && ctaText) ? `  • CTA: "${ctaText}"` : '',
      brandName ? `  • Creator/brand name for the header chip: "${brandName}"` : '',
      `  • Slide counter: "${slideNum} / ${totalNum}" — render in the template's page-number style, or omit if the template omits it on ${role} slides.`,
      '',
      "Place each string into the template layout's corresponding zone. Render EXACTLY these strings and no other text.",
      (slide.visualElement && slide.visualElement.description) ? `(Planner visual hint: ${sanitizeStyleText(slide.visualElement.description)})` : '',
    ].filter(Boolean).join('\n');
  } else if (isHook) {
    layoutNotes = `LAYOUT — OPENING SPREAD (slide 01): visually the richest slide in the set, but it follows the SAME vertical grid as the others so the swipe reads as aligned. The headline lands at the 28% top anchor. The hero visual (founder portrait / card stack / product mockup) sits BEHIND or BESIDE the text grid — not above it pushing the headline down. Think of it as the cover of ${cfg.moodReferences}: compositional depth through layering, not by moving the text lines around.${verticalGrid}`;
    textContent = [
      brandName ? `  • Top-left wordmark (at y ≈ 8%, x = 48px): "${brandName}"` : `  • Top-left (y ≈ 8%): nothing`,
      `  • Top-right slide counter (at y ≈ 8%, x = right - 48px): "${slideNum} / ${totalNum}"`,
      badgeText ? `  • Badge pill (at y ≈ 18%, x = ${cfg.leftMarginPx}px): "${badgeText}"` : '',
      `  • Headline (top edge at y ≈ 28%, display size ${cfg.headlineHookPx}px, weight 700, tight leading 1.0, left-aligned): "${headlineClean}"`,
      `    ${accentPhrase}`,
      bodyClean ? `  • Supporting line (top edge at y ≈ 70%, ${cfg.bodyPxHook}px, muted color, max 2 lines): "${bodyClean}"` : `  • No body copy on this slide — the headline carries it.`,
      `  • Bottom-right hint pill (at y ≈ 92%, x = right - 48px): "Keep swiping →"`,
      ``,
      `HERO VISUAL DIRECTION (planner brief — composition hint, not literal text. Visual lives BEHIND or BESIDE the text grid, never displaces the anchor points above):`,
      `  ${sanitizeStyleText(slide.visualElement?.description) || 'A confident editorial composition that pairs with the headline.'}`,
    ].filter(Boolean).join('\n');
  } else if (isFinal) {
    layoutNotes = `LAYOUT — CLOSING SPREAD (final slide): minimal and confident, same vertical grid as every other slide. Most zones are intentionally EMPTY — the power is in the restraint. Badge + CTA headline + CTA button sit where the body copy would normally go on a middle slide.${verticalGrid}`;
    textContent = [
      brandName ? `  • Top-left wordmark (at y ≈ 8%, x = 48px): "${brandName}"` : `  • Top-left (y ≈ 8%): nothing`,
      `  • Top-right slide counter (at y ≈ 8%, x = right - 48px): "${slideNum} / ${totalNum}"`,
      `  • Badge pill (at y ≈ 18%, CENTERED horizontally for this slide type): "${(badgeText || 'ONE LAST THING')}"`,
      `  • CTA headline (top edge at y ≈ 28%, centered horizontally, ${cfg.headlineFinalPx}px, weight 700, max 3 lines): "${headlineClean}"`,
      `    ${accentPhrase}`,
      bodyClean ? `  • Supporting line (top edge at y ≈ 52%, centered, 20px, muted, max 2 lines): "${bodyClean}"` : '',
      ctaText ? `  • CTA button (at y ≈ 68%, centered horizontally, solid pill, accent color fill, dark text, weight 700, 16px): "${ctaText}"` : '',
      slide.visualElement?.description ? `  • (Optional) small proof chip (at y ≈ 78%, centered, ~44px high, glass pill): short phrase from the planner direction below.` : '',
      `  • Footer (at y ≈ 92%, centered, muted at 50% opacity, 11px): "save for later"`,
    ].filter(Boolean).join('\n');
  } else {
    layoutNotes = `LAYOUT — EDITORIAL CHAPTER PAGE (middle slide): typography-led ${platform === 'linkedin' ? 'document' : 'magazine'} spread. Left-aligned, three text zones, same vertical grid as hook and CTA. The only non-text element is a large ghosted slide-index numeral behind the text.${verticalGrid}`;
    textContent = [
      brandName ? `  • Top-left wordmark (at y ≈ 8%, x = 48px): "${brandName}"` : `  • Top-left (y ≈ 8%): nothing`,
      `  • Top-right slide counter (at y ≈ 8%, x = right - 48px): "${slideNum} / ${totalNum}"`,
      `  • Chapter mark (at y ≈ 14%, x = ${cfg.leftMarginPx}px, small accent-color monospaced text with a thin 56px horizontal rule to its right): "${chapterNum}"`,
      badgeText ? `  • Badge pill (at y ≈ 18%, immediately to the right of the chapter rule): "${badgeText}"` : '',
      `  • Display headline (top edge at y ≈ 28%, ${cfg.headlineMiddlePx}px, weight 700, tight leading 1.02, left-aligned at ${cfg.leftMarginPx}px, preserve line breaks): "${headlineClean}"`,
      `    ${accentPhrase}`,
      bodyClean ? `  • Hairline rule (at y ≈ 66%, thin 40px line in muted color at ~30% opacity, aligned to left margin) then body copy directly below (top edge y ≈ 70%, bottom edge by y ≈ 82%, ${cfg.bodyPx}px, muted color, weight 400, leading 1.5, left-aligned, readable column width, max 3 lines): "${bodyClean}"` : '',
      `  • Bottom-right hint pill (at y ≈ 92%, x = right - 48px): "Keep swiping →"`,
      isFounderByline
        ? `  • FOUNDER FEATURE (this slide only — slightly more prominent than the other middle slides): a circular founder portrait about 140px diameter at the footer row (y ≈ 92%, x = left margin), cropped from the attached founder reference photo — exact likeness, natural photographic skin texture, never airbrushed. Noticeable but still secondary to the typography; it must not compete with the headline or shift any anchor point. If NO founder reference photo is attached to this request, OMIT this element entirely — never invent a face.`
        : `  • FOUNDER PROFILE CHIP (very subtle — same spot on EVERY middle slide so the swipe reads consistent): a small circular founder avatar, about 64px diameter, at the footer row (y ≈ 92%, x = left margin), cropped from the attached founder reference photo — exact likeness, natural photographic skin texture. A quiet profile-picture byline, like the poster's avatar on a social feed — never a hero portrait. If NO founder reference photo is attached to this request, OMIT this element entirely — never invent a face.`,
      ``,
      `EDITORIAL ANCHOR (with the founder avatar, the only non-text elements on this slide): a single ghosted slide-index numeral "${ghostNumeral}" rendered very large (around ${cfg.ghostNumeralPx}px tall), heavy weight, in the accent color at only 6–8 percent opacity, positioned in the top-right area so it bleeds partially off the right edge of the canvas. It sits BEHIND the main text as a typographic flourish — no outline, no shadow, no other decoration. This exact motif repeats on every middle slide to create rhythm.`,
      ``,
      `CRAFT NOTES: breathe. Every middle slide uses the same vertical anchors so the swipe reads as aligned. Feel of ${cfg.moodReferences}, not an infographic. No icons, no illustrations, no cards, no diagrams, no emoji. ${cfg.toneNote}.`,
      (slide.visualElement?.description ? `(Planner hint — use ONLY for body phrasing if useful, ignore any visual suggestion: ${sanitizeStyleText(slide.visualElement.description)})` : ''),
    ].filter(Boolean).join('\n');
  }

  const doNotRenderAsText = [
    'do not render any hex color codes (like #abc123) anywhere on the image',
    'do not render any CSS syntax or fragments such as "linear-gradient", "radial-gradient", "rgba", "span", "div", "px", "em", "weight"',
    'do not render font size numbers followed by px (for example "18px") anywhere on the image',
    'do not render font weight numbers (for example "400", "700") anywhere on the image',
    'do not render curly braces, square brackets, or angle brackets',
    'do not render the words "accent", "gradient", "opacity", "leading", "tracking", or any other styling jargon as literal text',
    'do not render any marker-like tokens on the image — anything in double curly braces or square brackets is an instruction, never text to render',
    'the ONLY text that should appear on the image is the text listed in TEXT CONTENT below, nothing more',
  ];

  const doNotBase = (slide.doNot && slide.doNot.length
    ? slide.doNot
    : ['stock photography', 'clipart', 'cartoon illustration', 'gradient-rainbow color bars', 'Instagram UI chrome']
  ).map(s => `no ${s}`);

  const doNotExtra = isMiddle
    ? [
      'no card stack, chat UI, node diagram, UI mockup, or any compositional card',
      'no icon set, sticker, or emoji',
      'no illustration or graphic filling more than 10% of the canvas',
      'no small cramped copy — if it does not breathe, the layout is wrong',
      'no centered alignment — editorial pages are left-aligned with a defined column',
    ]
    : [];

  const platformLabel = platform === 'linkedin' ? 'LinkedIn' : 'Instagram';
  return [
    `You are rendering slide ${slideNum} of a ${totalNum}-slide ${platformLabel} carousel (${cfg.canvasShort}).`,
    `Think of the carousel as a designed ${platform === 'linkedin' ? 'document' : 'book'}: slide 01 is the cover, slides 02–${String(total - 1).padStart(2, '0')} are editorial chapter pages (typography is the design), slide ${totalNum} is the closing spread.`,
    ``,
    `=== TEXT CONTENT (render EXACTLY these strings and no other text on the image) ===`,
    textContent,
    ``,
    `=== VISUAL STYLE (how to render — hex codes and sizes live HERE as styling, never as text on the image) ===`,
    visualStyle,
    ``,
    `=== LAYOUT ===`,
    layoutNotes,
    ``,
    `=== DO NOT RENDER AS TEXT (strict) ===`,
    doNotRenderAsText.map(s => `- ${s}`).join('\n'),
    ``,
    `=== DO NOT INCLUDE (visual) ===`,
    [...doNotBase, ...doNotExtra].map(s => `- ${s}`).join('\n'),
    ``,
    `HARD RULES: Every piece of text that appears on the image must be copied exactly from TEXT CONTENT above (same words, same punctuation, same capitalization). Any word not listed in TEXT CONTENT must not appear. If you are tempted to render a hex code, size, or any styling term as visible text, STOP — those are instructions, not content.`,
  ].join('\n');
}
