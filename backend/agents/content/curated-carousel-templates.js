// Curated carousel template registry — the client-supplied example decks
// (docs/Carousels/*, digested 2026-07-21 by reading every slide PNG).
// ONE source of truth for every tab:
//   - GET /api/carousel-templates/curated serves this list to the
//     /Content picker
//   - the carousel renderers (backend/agents/content/carousel-slide-prompt.js
//     + src/lib/carouselGen.js) switch to a template's layout spec when
//     plan.designSystem.templateId matches an entry here
//   - build-system-prompt.js locks plan_carousel's designSystem to the
//     preset when the user has one selected
//
// Entry shape: id/name/description (picker), platforms, preview
// (frontend public/ path), designSystem (EXACT plan_carousel schema),
// layout {common,hook,middle,final} = generation-prompt prose (colors by
// palette ROLE name, never hex), founderTreatment, notes.
//
// The people/names/taglines in the source decks belong to the example
// authors — at render time the USER's name, tagline, and reference
// photos are substituted (layout strings describe treatment only).
// Keep ids STABLE once shipped: saved plans reference designSystem.templateId.
// Excluded from the source folder: "Lessons from World-Class Product
// Leaders" (a 4200x700 YouTube banner, not a carousel) and
// "Your Brand Has No Authority on LinkedIn(1)" (byte-identical duplicate).

export const CURATED_CAROUSEL_TEMPLATES = [
  {
    id: 'emerald-founder-authority',
    name: 'Emerald Authority Dark',
    description: 'Premium dark charcoal-green deck with a single emerald accent, solid green content cards, bold rounded sans headlines with alternating accent words, and a consistent creator header chip on every slide.',
    platforms: ['linkedin', 'instagram'],
    preview: '/carousel-templates/everything-felt-urgent-but-nothing-got-done.jpg',
    sourceFolder: 'Everything felt urgent, but nothing got done',
    slideCount: 6,
    designSystem: {
      mode: 'dark',
      palette: { background: '#0B0F0D', accentPrimary: '#4EA983', accentSecondary: '#3D8268', gradientStart: '#0B0F0D', gradientEnd: '#12241C', textPrimary: '#FFFFFF', textMuted: '#C7D2CC', glow: '#1E3A2E' },
      texture: 'very subtle dark-green radial gradient wash; hook and CTA slides add a heavily darkened city-skyline photo with a faint rising line-chart overlay at ~10% opacity; interior slides are near-flat black-green',
      card: { style: 'solid', borderOpacity: 0.6, blurPx: 0, radiusPx: 32 },
      badge: { shape: 'pill', fill: 'solid accentPrimary', border: 'none', textColor: '#FFFFFF', letterSpacing: 'normal' },
      typography: { family: 'Poppins', fallback: 'sans-serif', headlineWeight: 700, bodyWeight: 400 },
      brandStrip: { brandName: '', show: false },
      accentTreatment: 'individual key words inside white headlines are recolored accentPrimary (no italic, no underline); inside body text key words are bold white or bold accentPrimary',
      glowCorners: ['TR', 'BL'],
      mood: 'Calm executive authority: feels like a leadership-coach brand system, quiet and premium rather than loud. The single emerald accent against near-black reads trustworthy and systematic. Minimal ornamentation, generous negative space, everything grid-aligned and repeatable.',
    },
    layout: {
      common: 'Every slide: header chip top-left (circular founder avatar photo ~120px on 1080 canvas with thin accentPrimary ring, at x ≈ 10%, y ≈ 4%; to its right bold white name ~30px and a two-line textMuted tagline ~24px), and a solid accentPrimary "Repost" pill with repost arrows icon top-right (~220x64px, white text). Side margins ≈ 10%. Background is near-flat dark with subtle green gradient wash. No page numbers, no footer strip.',
      hook: 'Slide 1: large centered founder cutout photo (waist-up, ~55% of canvas width) occupying vertical middle, layered OVER a rotated rounded-square accentPrimary diamond containing a large white exclamation mark at mid-left, with darkened city-skyline texture behind. Huge centered headline (~80px, weight 700) overlaps the lower chest area, alternating accentPrimary and white words across 3 lines. Below it an outlined rounded-rectangle card (1px accentPrimary border at ~50% opacity, transparent fill, radius ~32px, width ~80%) holding 3 lines of white body text (~34px) with bold and accentPrimary emphasis words. Small accentPrimary circle-arrow glyph at right edge, y ≈ 40%.',
      middle: 'Middle slides: huge left-aligned headline at y ≈ 22-30% (72-84px, weight 700), white with one accentPrimary word, ending with a period. Then one of three patterns: (a) short white lead sentence + full-width solid accentPrimary rounded card (radius ~32px, padding ~48px) with white body text and bold emphasis; (b) bullet list inside a solid accentPrimary card (white dot bullets, bold lead words) with a flat accentPrimary pictogram (stick figure at whiteboard / scribble ball doodle) to the right; (c) card-free bullet list where each bullet lead-in phrase is bold accentPrimary followed by white text, with small white outline icons right-aligned beside each bullet. Occasionally a thin white hand-drawn connector arrow links an icon to the card.',
      final: 'Last slide: founder cutout photo (shoulders-up, large, ~60% width) anchored right from y ≈ 25% to bottom. Left column: headline with white + accentPrimary words, then 2 short white paragraphs (~36px) with bold emphasis, then CTA line in bold accentPrimary followed by a white arrow and supporting white text. No button shape — the CTA is colored text.',
    },
    founderTreatment: 'Founder appears twice as a large photographic cutout (hook slide: centered hero waist-up; final slide: right-anchored shoulders-up) and on EVERY slide as the small avatar-in-ring header chip with name + tagline. Ring color is accentPrimary; crop is circular on the chip, rectangular soft cutout on hero usages.',
    notes: 'Interior slides mix flat accentPrimary vector pictograms (stick figures, scribbles) with thin white outline icons. Solid green cards always use radius ≈ 32px and pure white text — no glass or blur anywhere. Emphasis system is strictly two-tone: white + one green. No page numbers, no emoji, no drop shadows.',
  },
  {
    id: 'vivid-gradient-saas',
    name: 'Vivid Gradient SaaS',
    description: 'High-energy violet-to-dark gradient brand deck with motion-streak texture, photoreal 3D imagery fading in from the bottom, chunky rounded white headlines, green pill badges and orange accents.',
    platforms: ['linkedin', 'instagram'],
    preview: '/carousel-templates/giosg-carousel.jpg',
    sourceFolder: 'Giosg Carousel',
    slideCount: 10,
    designSystem: {
      mode: 'dark',
      palette: { background: '#7A6CE8', accentPrimary: '#3DC47E', accentSecondary: '#F0883E', gradientStart: '#8B7CF0', gradientEnd: '#171030', textPrimary: '#FFFFFF', textMuted: '#D9D4F5', glow: '#B39DF7' },
      texture: 'horizontal light-speed streaks and lens flares at low opacity across the gradient; lower third of most slides dissolves into a darkened photorealistic scene blended under the gradient',
      card: { style: 'outlined', borderOpacity: 0.9, blurPx: 0, radiusPx: 40 },
      badge: { shape: 'pill', fill: 'solid accentPrimary', border: 'none', textColor: '#FFFFFF', letterSpacing: 'normal' },
      typography: { family: 'Nunito', fallback: 'sans-serif', headlineWeight: 800, bodyWeight: 600 },
      brandStrip: { brandName: '', show: true },
      accentTreatment: 'key phrases isolated on their own line in accentSecondary orange or accentPrimary green (e.g. timeline times in orange, stat numbers in green); occasional full green pill behind a subheading',
      glowCorners: ['TL', 'TR'],
      mood: 'Loud, kinetic B2B-SaaS ad energy — racing metaphors, speed streaks and neon gradients. Feels like a polished paid-social campaign: big friendly rounded type, saturated candy colors, photoreal renders emerging from darkness at the bottom of each frame.',
    },
    layout: {
      common: 'Every slide: brand logo/wordmark top-left (~200px wide, x ≈ 9%, y ≈ 4.5%), white "Repost" label with repost-arrows icon top-right (no pill fill), and a centered italic white footer tagline (~30px) at y ≈ 96%. Background: vertical gradient from gradientStart at top to near-black gradientEnd at bottom with horizontal light streaks; bottom 40% usually hosts a darkened photoreal image blended into the gradient. Side margins ≈ 9%. One mid-deck slide may invert to a teal-green gradient background for pattern-interrupt.',
      hook: 'Slide 1: giant centered all-caps headline (3 lines, ~92px, weight 800, white) at y ≈ 18-38% with a small motion-streak glyph off the last word; directly below, a solid accentPrimary rounded-rectangle badge (radius ~24px, width ~80%) holding a one-line white subtitle (~44px). Bottom 55%: large photoreal hero render themed to the topic, emerging from the dark gradient, side-lit with pink/orange flares.',
      middle: 'Middle slides rotate patterns: (a) left-aligned two-line headline (~84px) + vertical icon list — white circles (~120px) containing flat line icons, each with a white label (~48px) to the right; (b) headline + list rows where a small orange X-in-circle icon or green tag precedes each white label; (c) centered stacked statements with an accentPrimary equals-sign divider and italic contrast lines; (d) timeline slide: orange bold times at line start + white events; (e) numbered outlined pill rows (1px accentPrimary border, transparent fill, radius ~40px, full width) with numbered white text, followed by a solid green badge stat line; (f) proof slide: green pill section header top-left, then rows of client references left + big green stat / white label right. Bottom of most middle slides carries a themed darkened photoreal render.',
      final: 'Last slide: left column with huge all-caps white stacked headline (~100px), a two-line white subtitle, then a solid accentSecondary orange CTA pill (~46% width, radius ~48px) with bold italic white CTA text; brand wordmark + tagline lower-left. Right half: full-height photorealistic person cut against the gradient.',
    },
    founderTreatment: 'Company-branded deck — the logo chip replaces the avatar header. The user photo takes the final CTA slide position: full-height, waist-up, no ring, blended into the gradient. No founder presence on other slides unless brand photos exist, in which case keep it to the CTA slide only.',
    notes: 'Photoreal AI-rendered scenes always darkened and blended into the lower gradient. Icon rows use white circles with flat line icons. Stat typography pairs green numbers with white labels. All-caps only on hook and CTA; sentence case elsewhere. Footer tagline is a fixed brand element.',
  },
  {
    id: 'crimson-editorial-tutorial',
    name: 'Crimson Tutorial Steps',
    description: 'Near-black tutorial deck with a dotted-grid texture, crimson serif-italic step labels paired with bold white sans headlines, embedded UI screenshots in rounded cards, and page numbers.',
    platforms: ['linkedin', 'instagram'],
    preview: '/carousel-templates/how-to-create-viral-hand-drawn-linkedin-infographics-in-less-than-5-minutes.jpg',
    sourceFolder: 'How to Create Viral Hand-Drawn LinkedIn Infographics in Less than 5 minutes!',
    slideCount: 11,
    designSystem: {
      mode: 'dark',
      palette: { background: '#0C0A0B', accentPrimary: '#E8274B', accentSecondary: '#5B1220', gradientStart: '#0C0A0B', gradientEnd: '#2A0E14', textPrimary: '#FFFFFF', textMuted: '#B9B4B6', glow: '#3A1018' },
      texture: 'faint dark dot-grid (polka rows at ~4% opacity) across the whole canvas, plus a soft maroon radial glow bleeding in from a corner of most slides',
      card: { style: 'solid', borderOpacity: 0.15, blurPx: 0, radiusPx: 28 },
      badge: { shape: 'pill', fill: 'solid accentPrimary', border: 'none', textColor: '#FFFFFF', letterSpacing: 'normal' },
      typography: { family: 'Poppins + Playfair Display italic for step labels and accent words', fallback: 'sans-serif', headlineWeight: 700, bodyWeight: 300 },
      brandStrip: { brandName: '', show: false },
      accentTreatment: 'step labels ("Step 1:") set in large accentPrimary high-contrast serif italic; individual headline words switch to serif italic (white or accentPrimary); hook slide highlights a serif-italic phrase on a solid dark-maroon (accentSecondary) full-width bar; body emphasis is bold or italic white',
      glowCorners: ['BR', 'TL'],
      mood: 'Sleek creator-educator noir: black editorial canvas where a fashion-magazine serif italic collides with clean geometric sans. The crimson accent and embedded product screenshots make it feel like a premium step-by-step masterclass rather than an ad.',
    },
    layout: {
      common: 'Every slide: header chip top-left (circular creator avatar ~110px with thin accentPrimary ring at x ≈ 10%, y ≈ 4.5%, bold white name ~34px to its right — no tagline), solid accentPrimary "Repost" pill with repost-arrows icon top-right (~230x66px). Small white page number (~34px) bottom-right at x ≈ 91%, y ≈ 95%. Background near-black with faint dot-grid texture and a soft maroon corner glow. Side margins ≈ 10%.',
      hook: 'Slide 1: centered stacked title at y ≈ 16-45% mixing three voices — textMuted light sans lines, one line of large white serif italic sitting on a full-width solid accentSecondary maroon bar, and a bold white sans-italic payoff line. Below: a white-bordered rounded card (radius ~28px, accentPrimary 2px border) containing a topic-relevant visual (~55% width), flanked by two floating 3D app icons — left one with a red X badge, right one with a green check badge — plus a small hand-drawn accentPrimary arrow pointing at the card. Bottom: two centered italic textMuted lines with bold white emphasis. Page number "1".',
      middle: 'Middle slides: "Step N:" in huge accentPrimary serif italic (~90px) at y ≈ 20%, then the step title in bold white sans (~84px, 1-2 lines). Below, 2-4 lines of light textMuted body (~40px, weight 300) with bold white emphasis phrases. Lower half: an embedded UI screenshot inside a dark rounded card (radius ~28px, ~70-85% width), sometimes annotated with a hand-drawn accentPrimary arrow and small white handwritten-style label. A prompt-focused slide wraps the prompt text in a white-outlined rounded card above the screenshot. Later non-step slides drop the serif label and lead with a bold white sans headline where one word is large accentPrimary italic, plus a floating white stat card (rounded, drop shadow) showing a metric with a green arrow.',
      final: 'Last slide: right half is a full-height photographic cutout of the creator (waist-up) over a darkened collage background. Left column: "Want more" white sans + theme word in giant white serif italic + "like this?" white sans (~y 25-45%); below, light body text where the trigger word is bold accentPrimary in quotes; a blue "+ Follow" pill sits beside the header name; a large accentPrimary "Repost" pill sits lower-left. No page number.',
    },
    founderTreatment: 'Creator appears on EVERY slide as the small circular avatar with accentPrimary ring + bold name in the header (no tagline), and once more as a large photographic cutout on the final CTA slide (right-anchored, waist-up).',
    notes: 'Signature move: serif-italic/sans collision (crimson serif-italic step labels + bold white sans titles) and real product screenshots framed in dark rounded cards as proof-of-process. Hand-drawn accentPrimary squiggle arrows and handwritten annotations connect text to screenshots. Page numbers on every slide except the final CTA.',
  },
  {
    id: 'crimson-editorial-dark',
    name: 'Crimson App Playbook',
    description: 'Near-black editorial deck with crimson accents, elegant serif-italic step labels, 3D app-icon collages, and red-bordered screenshot cards.',
    platforms: ['linkedin', 'instagram'],
    preview: '/carousel-templates/i-deleted-chatgpt-after-5-years.jpg',
    sourceFolder: 'I deleted ChatGPT after 5 years',
    slideCount: 14,
    designSystem: {
      mode: 'dark',
      palette: { background: '#0a0708', accentPrimary: '#ee2b4e', accentSecondary: '#d97757', gradientStart: '#0a0708', gradientEnd: '#2a070f', textPrimary: '#ffffff', textMuted: '#9b9b9b', glow: '#3a0a14' },
      texture: 'very low-opacity dot-grid / halftone pattern across the whole canvas, slightly more visible along the bottom-left edge',
      card: { style: 'outlined', borderOpacity: 0.9, blurPx: 0, radiusPx: 24 },
      badge: { shape: 'pill', fill: 'solid accentPrimary', border: 'none', textColor: '#ffffff', letterSpacing: 'normal' },
      typography: { family: 'Poppins', fallback: 'sans-serif', headlineWeight: 600, bodyWeight: 300 },
      brandStrip: { brandName: '', show: false },
      accentTreatment: 'single emotional word set in high-contrast Didone serif italic in accentPrimary inside an otherwise white sans headline; section labels like "Step N:" fully in accentPrimary serif italic; occasionally a full sentence on a solid accentPrimary highlight bar with white text',
      glowCorners: ['BL', 'BR'],
      mood: 'Premium late-night editorial tech deck: jet-black pages with a faint maroon glow rising from the bottom, punchy crimson punctuation and glossy 3D app icons. Feels like a magazine cover crossed with a SaaS launch page — confident, urgent, a little theatrical.',
    },
    layout: {
      common: 'On the canvas: top-left header chip — circular founder avatar photo ≈80px with a 3px accentPrimary ring, founder name in white sans ≈34px to its right (no tagline). Top-right a solid accentPrimary Repost pill (repost arrows icon + word, white text, fully rounded, ≈180x60px). Bottom-right page number in textMuted ≈30px. Background is the background color with dot-grid texture and a soft glow-colored radial gradient hugging the bottom edge. Side margins ≈ 6%; content column starts at y ≈ 28%.',
      hook: 'Slide 1: center-aligned stacked headline occupying y ≈ 18-42%, white sans semibold ≈90px, with any product name rendered as its recognizable logo style inline on its own line; below it at y ≈ 46% a 2-line italic light subtitle ≈44px in white with the key phrase in bold italic. Bottom half is a 3D hero collage themed to the topic (e.g. glossy 3D props, one element carrying a red X badge, another a green checkmark badge). Page number 1 bottom-right.',
      middle: 'Three recurring middle patterns. (a) Statement slide: a single sentence on a solid accentPrimary highlight bar (white bold text ≈54px, bar hugs the text with ≈24px padding), followed by 2 short paragraphs — first words bold white, key phrases in light italic. (b) Step slide: label "Step N:" in accentPrimary Didone serif italic ≈80px at y ≈ 20%, then white sans semibold headline ≈72px over 2 lines, then a light ≈44px body paragraph; bottom 35-45% holds a dark UI screenshot in a rounded (≈24px) card with a thin accentPrimary border. (c) Use-case slide: label "Use Case N:" in textMuted sans semibold ≈64px, white sans semibold headline ≈76px, then "Prompt to use:" in accentPrimary ≈44px, followed by a long italic light prompt paragraph ≈44px in white; optionally a red-bordered screenshot card in the lower third. Breather slides use only a giant left-aligned light sans phrase ≈100px with the last two words in accentPrimary serif italic plus a long thin accentPrimary arrow pointing right.',
      final: 'Last slide: right 45% is a photographic waist-up cutout of the founder. Left column y ≈ 20-50%: mixed-typography headline — "Want more" in textMuted light sans, the theme phrase in accentPrimary Didone serif italic ≈100px on its own lines, remainder in white sans. At y ≈ 55% the CTA line "Comment {keyword} below." with the keyword in accentPrimary bold in quotes. Below, a short light paragraph describing the offer. Header chip gains a blue +Follow pill next to the name.',
    },
    founderTreatment: 'Avatar chip (small circular photo, accentPrimary ring, name in white) at top-left of every slide; full photographic person cutout only on the final CTA slide, right-aligned, overlapping the bottom edge.',
    notes: 'Distinctive: solid accentPrimary highlight-bar sentences; Didone serif italic for Step/label numerals against geometric sans; glossy 3D icons and props as hero elements; screenshots always inside rounded cards with a thin accentPrimary stroke; recap slide lists "Step N:" prefixes in accentPrimary bold sans. No emoji. Left-aligned except the centered hook.',
  },
  {
    id: 'serif-noir-typographic',
    name: 'Serif Noir Essay',
    description: 'Type-first black deck alternating white geometric sans with elegant serif italic labels, almost no imagery, big airy text pages with crimson use-case numerals.',
    platforms: ['linkedin', 'instagram'],
    preview: '/carousel-templates/i-let-claude-handle-linkedin-for-me.jpg',
    sourceFolder: 'I let Claude handle LinkedIn for me',
    slideCount: 11,
    designSystem: {
      mode: 'dark',
      palette: { background: '#0a0708', accentPrimary: '#ee2b4e', accentSecondary: '#d97757', gradientStart: '#0a0708', gradientEnd: '#26060d', textPrimary: '#ffffff', textMuted: '#8f8f8f', glow: '#330912' },
      texture: 'faint dot-grid / halftone texture over the whole page, subtly denser near the bottom-left corner',
      card: { style: 'solid', borderOpacity: 0.15, blurPx: 0, radiusPx: 20 },
      badge: { shape: 'pill', fill: 'solid accentPrimary', border: 'none', textColor: '#ffffff', letterSpacing: 'normal' },
      typography: { family: 'Poppins', fallback: 'sans-serif', headlineWeight: 600, bodyWeight: 300 },
      brandStrip: { brandName: '', show: false },
      accentTreatment: 'section labels ("Step N:", "Use Case N:") set entirely in accentPrimary Didone serif italic above white sans headlines; inside body copy single brand words are colored accentPrimary bold, and emphasis phrases are light italic; muted-gray sans italic used for de-emphasized headline lines',
      glowCorners: ['BL'],
      mood: 'Quiet, literary dark-mode deck that relies on typography instead of graphics — big serif italic numerals, generous empty space, and a whisper of maroon glow. Reads like a premium ghostwritten essay: calm, editorial, expensive.',
    },
    layout: {
      common: 'Top-left chip with circular founder photo ≈80px ringed in accentPrimary and the name in white ≈34px; top-right solid accentPrimary Repost pill ≈180x60px; bottom-right page number in textMuted; background color with faint dot-grid and a soft glow gradient at the bottom-left. Left margin ≈ 6%, headline block usually starts y ≈ 20%. Most slides are pure typography with no imagery.',
      hook: 'Slide 1: fully centered composition. Headline at y ≈ 20-42% mixes typefaces line by line — one line in white high-contrast serif, following lines in white sans semibold ≈95px, with any platform logo embedded inline as a small rounded logo tile. Below at y ≈ 47% an italic light parenthetical subtitle ≈52px followed by a long white arrow. Bottom half: two large glossy 3D icon tiles side by side (each ≈300px rounded squares) centered at y ≈ 65-85%. Page number bottom-right.',
      middle: 'Two patterns. (a) Plain-text narrative slide: 3 short left-aligned paragraphs of light sans ≈46px starting y ≈ 35%, one-line hook sentence first, a 2-word italic rebuttal second, then a paragraph where the key word is accentPrimary bold and skill phrases are italic. (b) Step/Use-case slide: label in accentPrimary Didone serif italic ≈80px at y ≈ 19%, white sans semibold headline ≈78px over 2-3 lines directly below, then one light ≈46px paragraph (quotes around example prompts, key nouns bolded). Occasional imagery: a floating white UI chrome chip top-right of the headline, a white store-listing card full-width in the lower third, or a tall light-mode app panel screenshot right-aligned ≈40% width beside the body text. One transition slide sets the pivot headline entirely in muted-gray sans italic ≈90px with body below.',
      final: 'Last slide: founder cutout photo fills the right half from y ≈ 15% to bottom. Left column: "Want more" in textMuted light sans, theme word in large white Didone serif italic ≈110px, remaining lines in textMuted sans ≈60px, ending with a question mark. Below: a blue +Follow pill rendered inline with the follow sentence in white light sans, and a large accentPrimary Repost pill anchored bottom-left at y ≈ 88%.',
    },
    founderTreatment: 'Small circular avatar with accentPrimary ring plus white name at top-left on every slide; no person imagery anywhere else until the final slide, where a studio waist-up cutout occupies the right 45-50%, slightly overlapping the text column.',
    notes: 'Most text-dense of the family: several slides are 100% typography. Serif italic used both for numbered labels and de-emphasis (gray italic headlines). Inline UI chrome as decoration. Inline logo tiles replace brand names inside headlines. No page-number on the final slide; the Repost pill is duplicated bottom-left as an explicit CTA.',
  },
  {
    id: 'coral-proof-dark',
    name: 'Coral Proof Dark',
    description: 'Black deck pairing crimson serif-italic step labels with coral brand words, floating social-proof chips, and embedded screenshot evidence under every step.',
    platforms: ['linkedin', 'instagram'],
    preview: '/carousel-templates/i-trained-claude-to-write-like-me.jpg',
    sourceFolder: 'I Trained Claude to Write Like Me',
    slideCount: 11,
    designSystem: {
      mode: 'dark',
      palette: { background: '#0a0708', accentPrimary: '#ee2b4e', accentSecondary: '#d97757', gradientStart: '#0a0708', gradientEnd: '#2a070f', textPrimary: '#ffffff', textMuted: '#a0a0a0', glow: '#380a13' },
      texture: 'low-opacity dot-grid / halftone across the canvas, faintly stronger along the bottom edge',
      card: { style: 'solid', borderOpacity: 0.12, blurPx: 0, radiusPx: 22 },
      badge: { shape: 'pill', fill: 'white or solid accentPrimary depending on role', border: 'none', textColor: '#111111', letterSpacing: 'normal' },
      typography: { family: 'Poppins', fallback: 'sans-serif', headlineWeight: 600, bodyWeight: 300 },
      brandStrip: { brandName: '', show: false },
      accentTreatment: 'two-tier accenting: step labels and urgency words in accentPrimary Didone serif italic or bold sans; the featured brand name inside headlines colored accentSecondary (coral) while the rest stays white; body emphasis via bold-italic white phrases and quoted prompts in italic',
      glowCorners: ['BL', 'BR'],
      mood: 'Evidence-driven dark playbook: a theatrical black-and-crimson stage warmed by coral brand accents and studded with receipts — reaction bars, metric chips, chat screenshots. Feels like a case study told as a magazine spread.',
    },
    layout: {
      common: 'Top-left circular founder photo ≈80px with accentPrimary ring + white name ≈34px; top-right solid accentPrimary Repost pill ≈180x60px; page number bottom-right in textMuted; background color with dot-grid texture and a soft maroon glow rising from the bottom corners. Left margin ≈ 6%; step slides keep a consistent label → headline → body → screenshot rhythm.',
      hook: 'Slide 1: centered. Headline y ≈ 17-40%: line 1 in textMuted light sans, line 2 featuring the topic brand in white high-contrast serif with a small accentSecondary glyph, line 3 in textMuted sans with a tiny circular founder avatar (accentPrimary ring, ≈70px) attached to the end of the line like a superscript. Subtitle y ≈ 44%: 2-line white italic light ≈46px with the metric phrase in bold italic. Center-bottom y ≈ 55-85%: large glossy 3D icon tile ≈420px, with a floating white reaction-bar chip (thumbs-up, clap, heart) tilted above-right and a white pill chip with an icon and a metric floating left. Bottom center: white semibold caption ending with an arrow. Page number bottom-right.',
      middle: 'Step slides: "Step N:" in accentPrimary Didone serif italic ≈82px at y ≈ 19%; white sans semibold headline ≈76px over 2 lines — featured brand names colored accentSecondary; then a light ≈46px paragraph (short imperative sentences, quoted prompt text in italic). Lower third holds evidence: either a white light-mode file-grid card (rounded ≈22px, full-width) or a dark chat-UI screenshot card, edge-to-edge within margins. A problem slide replaces the step label with a white headline whose pain phrase is accentPrimary, followed by paragraphs where cliché words appear in quotes. A proof slide is typography-only: giant 3-line white sans headline y ≈ 25-50% with the key phrase in accentPrimary bold, then an italic client-quote paragraph.',
      final: 'Last slide: founder waist-up cutout on the right 50%, from y ≈ 12% to bottom edge. Left column: "Want more" in textMuted sans, theme word in huge white Didone serif italic ≈115px, "like this?" in textMuted sans; below, CTA "Comment {keyword} below." with keyword in accentPrimary quotes; then a short light paragraph on the offer; large accentPrimary Repost pill bottom-left y ≈ 85%. Header shows the +Follow pill variant beside the name.',
    },
    founderTreatment: 'Ringed avatar chip top-left on all slides; a second miniature avatar circle decorates the hook headline (attached to the end of the title line); the final slide uses a large studio cutout of the founder on the right half.',
    notes: 'Signature moves: floating social-proof chips (reaction bar, metric pill) around the hero icon; per-step screenshot receipts alternating white light-mode cards against the black page; dual accent logic (crimson = urgency/labels, coral = the featured brand); prompt text always quoted in italic; explicit engagement CTAs (Comment keyword, Repost, Follow) on the closer.',
  },
  {
    id: 'crimson-serif-authority',
    name: 'Crimson Serif Authority',
    description: 'A moody near-black editorial deck where muted grey sans headlines flip into white italic serif emphasis words, punctuated by thin crimson-outlined glass cards and a red-ringed avatar header.',
    platforms: ['linkedin', 'instagram'],
    preview: '/carousel-templates/your-brand-has-no-authority-on-linkedin.jpg',
    sourceFolder: 'Your Brand Has No Authority on LinkedIn',
    slideCount: 13,
    designSystem: {
      mode: 'dark',
      palette: { background: '#0A0708', accentPrimary: '#F0264F', accentSecondary: '#3A0D16', gradientStart: '#2A060E', gradientEnd: '#050304', textPrimary: '#FFFFFF', textMuted: '#8F8B8C', glow: '#C41E3F' },
      texture: 'very faint dot-grid / halftone dot pattern across the whole canvas, slightly more visible along bottom edge; barely-there dark red radial glow bleeding in from an edge of each slide',
      card: { style: 'outlined', borderOpacity: 0.85, blurPx: 0, radiusPx: 28 },
      badge: { shape: 'fully rounded pill with repost arrows icon left of label', fill: 'solid accentPrimary crimson', border: 'none', textColor: '#FFFFFF', letterSpacing: 'normal' },
      typography: { family: 'Poppins for sans + Playfair Display italic for serif accents', fallback: 'sans-serif', headlineWeight: 500, bodyWeight: 300 },
      brandStrip: { brandName: '', show: false },
      accentTreatment: 'one key word per headline set in white italic high-contrast serif while the rest of the headline is muted grey sans; occasional single phrase in accentPrimary red within body copy; thin red connector lines, L-shaped arrow brackets, red circular check/x bullet chips, and red speech-bubble outlines as diagram accents',
      glowCorners: ['BL', 'BR'],
      mood: 'Premium, cinematic and confident — like a luxury magazine spread rendered as a slide deck. The near-black canvas with restrained crimson accents feels authoritative and exclusive. Serif italic emphasis words give an editorial, hand-finished voice against clinical grey sans.',
    },
    layout: {
      common: 'Top-left header chip with a ~95px circular avatar ringed in accentPrimary plus author name in white 30px sans to its right; top-right crimson Repost pill ~220x70px; small white page number bottom-right; faint dot texture and a soft red glow along the bottom. Final slide relocates the Repost pill and drops the page number.',
      hook: 'Header chip top-left, Repost pill top-right. Centered 3-line mega headline starting y ≈ 18%, ~90px: lines 1 and 3 muted grey sans, the key word in line 2 in white italic serif. Below at y ≈ 52% a floating UI-prop card (thin accentPrimary outline, dark accentSecondary fill) themed to the topic — e.g. a progress bar or score widget with a red X close button. Bottom half: large phone mockup rising from the bottom edge showing a relevant UI, with a 3D app tile overlapping its top-right corner. Red glow behind the phone.',
      middle: 'Left-aligned two-line headline at y ≈ 33% (~72px): muted grey sans with one white italic serif word. Below, left column of white 44px body copy in short 2-4 line stanzas with generous leading, italic for key phrases. Variations: (a) an accentPrimary-outlined widget card ~420x400 on the right showing a 3-icon grid with the slide-relevant icon lit white and others dimmed; (b) a full-width red-outlined quote capsule near the bottom holding one italic-serif-accented sentence; (c) red L-shaped bracket line grouping a 3-line staccato list; (d) red icon-and-speech-bubble doodle beside the copy; (e) checklist rows with red circular check/X chips; (f) small white icon tiles + red arrow diagram with italic serif captions.',
      final: 'Full-bleed founder photo occupying the right ~55% from top to bottom edge, dark background left. Header chip top-left only. Left column: three-line headline y ≈ 33% with the power word in white italic serif, rest muted grey sans; below it 3 lines of white body copy with italic emphasis words; crimson Repost pill moved to bottom-left as the CTA. Red glow behind the subject.',
    },
    founderTreatment: 'Every slide carries a small circular avatar (~95px, thin accentPrimary ring) in the top-left header chip next to the name. The person appears large only on the final slide: a waist-up studio cutout filling the right half, warmly lit against the black/red-glow background.',
    notes: 'Signature moves: grey-sans + white-italic-serif headline pairing on every slide; a recurring widget card that re-lights a different icon as the deck progresses (a progress motif); all diagram artwork drawn as thin crimson line-work on dark translucent panels; page numbers on every slide except first and last.',
  },
  {
    id: 'royal-blue-rounded-cards',
    name: 'Royal Blue Rounded',
    description: 'A bright royal-blue B2B deck built from big friendly rounded-sans headlines and stacked pill-cornered cards in light blue, white, and navy, with flat white line icons and a forward-arrow motif on every slide.',
    platforms: ['linkedin', 'instagram'],
    preview: '/carousel-templates/your-profile-isn-t-a-r-sum.jpg',
    sourceFolder: 'Your profile isn’t a résumé',
    slideCount: 13,
    designSystem: {
      mode: 'light',
      palette: { background: '#1E45C4', accentPrimary: '#4A7DF8', accentSecondary: '#152A6E', gradientStart: '#16339B', gradientEnd: '#3B72E8', textPrimary: '#FFFFFF', textMuted: '#C9D6F5', glow: '#FFFFFF' },
      texture: 'smooth diagonal royal-blue gradient with a subtle lighter diagonal sheen band crossing the canvas; no grain or pattern',
      card: { style: 'solid', borderOpacity: 0, blurPx: 0, radiusPx: 48 },
      badge: { shape: 'fully rounded pill with a circular-arrows repost icon left of label', fill: 'solid white', border: 'none', textColor: '#1E45C4', letterSpacing: 'normal' },
      typography: { family: 'Nunito or Quicksand (rounded humanist sans)', fallback: 'sans-serif', headlineWeight: 800, bodyWeight: 500 },
      brandStrip: { brandName: '', show: false },
      accentTreatment: 'emphasis via bold-italic words inside otherwise regular sentences and one headline word recolored accentPrimary bright blue on photo slides; alternating card colors (accentPrimary light blue, solid white with navy text, accentSecondary navy) create rhythm; flat white line icons, thin white connector lines with dot terminals, and a centered white forward arrow near the bottom of every continuing slide',
      glowCorners: [],
      mood: 'Energetic, clean and corporate-friendly — classic LinkedIn blue turned up in saturation. Chunky rounded type and pill-shaped cards feel approachable and salesy rather than moody. Icon-driven diagrams keep it explanatory and skimmable.',
    },
    layout: {
      common: 'Top-left header with ~90px circular avatar (thin white ring) plus author name in bold white 32px and a two-line muted 26px positioning tagline; top-right white Repost pill ~250x75px with blue text; centered white forward arrow at the bottom of every slide except the last; royal-blue gradient background throughout.',
      hook: 'Full-bleed outdoor founder photo with a blue gradient overlay rising from the bottom two-thirds. Header chip and Repost pill on top. Giant 3-line left-aligned headline ~110px starting y ≈ 55% overlapping the subject: white extra-bold rounded sans with one word in accentPrimary bright blue and the final noun in bold italic; a small white line-icon doodle tucked beside the first line. Long white left-to-right arrow at bottom-left.',
      middle: 'Two main patterns: (a) headline-first — left-aligned 2-line white extra-bold headline ~80px at y ≈ 32%, then a large accentPrimary rounded card (radius ~48, ~85% width) holding 3-4 lines of white 48px body with bold-italic emphasis, plus a white rounded-square icon tile (~180px, flat blue glyph) overlapping the card corner; (b) card-first — a big accentPrimary or white card at y ≈ 26% containing the headline itself (white on blue, or navy text on white), followed by body copy directly on the background or in a second navy card, with flat white icons, thin connector lines with dot terminals, or an icon-vs-icon comparison diagram below. A list variant stacks three pill-shaped accentPrimary bars, each with a white numbered circle (1/2/3) on its left and short bold label, linked by a white bracket line to a central white circular icon. Small red-X and green-check marks punctuate do/dont lines.',
      final: 'Full-bleed founder photo again (subject centered-right) under a navy-blue overlay heavier at the edges. Header and Repost pill on top. Left column: 4-line white extra-bold headline ~90px starting y ≈ 43%, a short white horizontal rule under it, then 3 lines of white 44px supporting copy with bold emphasis; large white line icon anchored bottom-left, a second themed icon floating right of the headline. No bottom arrow.',
    },
    founderTreatment: 'Header of every slide shows a small ~90px circular headshot (white ring) beside the name and tagline. The person appears full-bleed on the first and last slides only, color-graded into the blue palette by gradient overlays.',
    notes: 'Every continuing slide ends with a centered white forward arrow (swipe cue) instead of page numbers; the header includes a two-line niche positioning tagline under the name, repeated verbatim on all slides; card colors rotate light-blue / white / navy to alternate figure-ground; bold-italic inline emphasis replaces color-change emphasis on interior slides.',
  },
  {
    id: 'noir-crimson-editorial',
    name: 'Noir Magazine Spread',
    description: 'A near-black editorial deck with crimson keyword pops, clean white geometric type, and light UI-screenshot cards floating on the dark canvas.',
    platforms: ['linkedin', 'instagram'],
    preview: '/carousel-templates/i-can-t-switch-to-claude-i-ve-trained-chatgpt-for-years.jpg',
    sourceFolder: '“I can_t switch to Claude, I_ve trained ChatGPT for years”',
    slideCount: 10,
    designSystem: {
      mode: 'dark',
      palette: { background: '#0D0A0B', accentPrimary: '#E82148', accentSecondary: '#E8955C', gradientStart: '#1A0D10', gradientEnd: '#050405', textPrimary: '#F5F2F0', textMuted: '#C9C2BE', glow: '#3A0D14' },
      texture: 'very low-opacity dot-grid / dotted halftone pattern over the black background, slightly denser near edges',
      card: { style: 'solid', borderOpacity: 0.9, blurPx: 0, radiusPx: 24 },
      badge: { shape: 'pill', fill: 'solid accentPrimary', border: 'none', textColor: '#FFFFFF', letterSpacing: 'normal, sentence case' },
      typography: { family: 'Poppins', fallback: 'sans-serif', headlineWeight: 500, bodyWeight: 400 },
      brandStrip: { brandName: '', show: false },
      accentTreatment: 'key phrases colored accentPrimary (crimson); occasional italic on emphasized words; on the hook slide brand words may take their own brand colors; "Step N:" prefix always in accentPrimary',
      glowCorners: [],
      mood: 'Quiet, premium, editorial dark mode. Feels like a well-typeset tech magazine spread: huge breathing room, one crimson idea per slide, tiny light-mode UI screenshots dropped in as evidence. Confident and calm rather than loud.',
    },
    layout: {
      common: 'Every slide: header row at top (y ≈ 4-6%) with circular avatar photo ~90px in a thin accentPrimary ring at far left, author name in white ~40px to its right; solid accentPrimary "Repost" pill with repost-arrows icon at top-right (~230x70px); small white page number bottom-right (y ≈ 96%); background is near-black with faint dot texture; side margins ≈ 10%; generous vertical whitespace between zones.',
      hook: 'Slide 1: header row; centered quoted headline at y ≈ 25-40% in large white type (~90px) with one or two accent-colored key words and one italic word; centered smaller subhead paragraph at y ≈ 48-58% with italic and bold emphasis spans; bottom third is a diagram: two outlined rounded cards left and right (each holding a logo/icon + small stacked UI rows), connected by a stream of flying documents converging into a glowing arrow pointing right; page number bottom-right.',
      middle: 'Left-aligned huge headline at y ≈ 20-30% (~85px, 2-3 lines) in white with the "Step N:" prefix or one key phrase in accentPrimary; body paragraph below at y ≈ 42-65%, left-aligned, ~44px white with accentPrimary bold spans; optional evidence zone in bottom third: a light (near-white) rounded-corner UI screenshot card spanning ~80% width, or a small tilted white label chip. Variations: a thin accentPrimary elbow-line arrow connecting a headline word down to a body line; an italic quoted prompt as body text; a full-width rounded rectangle outlined in accentPrimary containing 4 bold-number bullet rows; centered headline slides with no imagery.',
      final: 'Header row plus a blue "Follow" pill next to the author name; right half of the canvas is a waist-up cutout photo of the person (~55% height, anchored bottom-right); left column: 4-line headline at y ≈ 20-40% with one phrase in accentPrimary, then body paragraph, then a bold CTA line "Comment {word} below" with the keyword in accentPrimary; page number bottom-right.',
    },
    founderTreatment: 'Small circular avatar photo (~90px) inside a thin accentPrimary ring in the header of every slide next to the name; full waist-up studio cutout of the same person only on the final CTA slide, occupying the right half against the dark background.',
    notes: 'Crimson "Step N:" prefixes on process slides; light-mode product screenshots used as proof inside rounded cards that contrast hard against the black; thin crimson elbow-arrow annotations; no emoji; page numbers are plain digits.',
  },
  {
    id: 'poster-red-glow-condensed',
    name: 'Poster Red Glow',
    description: 'A loud poster-style dark deck: condensed all-caps white headlines with one crimson word, magenta-red corner glows, big white app-icon tiles and device mockups.',
    platforms: ['linkedin', 'instagram'],
    preview: '/carousel-templates/stop-using-chatgpt-for-everything.jpg',
    sourceFolder: 'Stop Using ChatGPT for Everything',
    slideCount: 10,
    designSystem: {
      mode: 'dark',
      palette: { background: '#0A0507', accentPrimary: '#E82148', accentSecondary: '#FFFFFF', gradientStart: '#7A0F26', gradientEnd: '#0A0507', textPrimary: '#FFFFFF', textMuted: '#D8D0D2', glow: '#C2183A' },
      texture: 'none — clean black canvas with soft radial red-magenta glows bleeding in from corners',
      card: { style: 'solid', borderOpacity: 1, blurPx: 0, radiusPx: 48 },
      badge: { shape: 'pill', fill: 'none (text + icon only)', border: 'none', textColor: '#FFFFFF', letterSpacing: 'all-caps condensed, tight' },
      typography: { family: 'Anton / Oswald condensed for headlines, Poppins for body', fallback: 'sans-serif', headlineWeight: 700, bodyWeight: 400 },
      brandStrip: { brandName: '', show: false },
      accentTreatment: 'exactly one word or phrase of each all-caps condensed headline set in accentPrimary (crimson), everything else pure white; body emphasis kept minimal',
      glowCorners: ['TR', 'BL'],
      mood: 'High-energy street-poster meets tech review channel. Massive condensed uppercase type, hard black, hot crimson glow spilling from corners, glossy white app tiles like collectible cards. Feels punchy, swipeable, and unapologetically promotional.',
    },
    layout: {
      common: 'Every slide: header at top-left with circular avatar photo ~150px ringed in accentPrimary, bold white name (~42px) plus a two-line muted tagline underneath; top-right bold all-caps "REPOST" wordmark with repost icon in white (~48px); small white page number bottom-right; soft red radial glow in top-right and bottom-left corners; side margins ≈ 9%.',
      hook: 'Full-bleed composition: person cutout (head + torso, ~65% canvas height) centered, overlapping a large tilted rounded-square logo card behind them on the left (with a red X badge on its corner) and a scattered cluster of 7-8 white rounded icon tiles of varying sizes on the right (one carrying a green check badge); giant condensed all-caps headline in bottom third (~110px, 2 lines) in white with the final word in accentPrimary; one-line italic subhead beneath it; page number bottom-right.',
      middle: 'Repeatable formula slide: left column all-caps condensed headline at y ≈ 20-38% (2-3 lines, ~100px) with the key tool/topic name in accentPrimary; big white rounded-square tile (~420px, radius ≈ 90px) at top-right containing a relevant logo or icon; body block of short punchy lines (~44px, white) at y ≈ 45-65% left-aligned; bottom third holds an evidence visual — laptop mockup, phone mockup, or floating UI screenshot card, sometimes bleeding off the bottom edge; page number bottom-right.',
      final: 'Person cutout occupies right half (waist-up, ~80% height, anchored bottom); left column: 3-line all-caps condensed headline at y ≈ 20-42% in pure white, then a body paragraph (~40px) describing the offer/positioning; the headline acts as the takeaway; page number bottom-right.',
    },
    founderTreatment: 'Circular avatar (~150px, accentPrimary ring) with name and two-line tagline in the header of every slide; large hero cutout of the person on slide 1 (center, overlapped by icon tiles) and on the final slide (right half). Person in dark clothing so the cutout melts into the background.',
    notes: 'Signature repeating formula headlines with one big white icon tile per slide; red X vs green check badges to mark bad/good options on the hook; device mockups as proof; strongly condensed uppercase headline font against a rounded geometric sans body — that pairing is the core of the look.',
  },
  {
    id: 'navy-electric-blue-explainer',
    name: 'Navy Electric Explainer',
    description: 'A deep navy corporate-tech deck with electric-blue accent words, thin-line blue icon triads, and stat callouts — clean, systematic, B2B briefing energy.',
    platforms: ['linkedin', 'instagram'],
    preview: '/carousel-templates/the-cybersecurity-skills-that-ai-cannot-automate.jpg',
    sourceFolder: 'The Cybersecurity Skills That AI Cannot Automate',
    slideCount: 10,
    designSystem: {
      mode: 'dark',
      palette: { background: '#0B1128', accentPrimary: '#3D9BF5', accentSecondary: '#2563EB', gradientStart: '#1A2250', gradientEnd: '#070B1A', textPrimary: '#F4F6FA', textMuted: '#B9C2D8', glow: '#22307A' },
      texture: 'none — smooth diagonal navy gradient, slightly lighter toward top-right and bottom-left',
      card: { style: 'outlined', borderOpacity: 0.7, blurPx: 0, radiusPx: 28 },
      badge: { shape: 'pill', fill: 'solid accentPrimary', border: 'none', textColor: '#FFFFFF', letterSpacing: 'normal, sentence case' },
      typography: { family: 'Poppins', fallback: 'sans-serif', headlineWeight: 600, bodyWeight: 400 },
      brandStrip: { brandName: '', show: false },
      accentTreatment: 'one to two key words per headline colored accentPrimary (electric blue); body emphasis via bold white numbers/percentages; blue check-circle and red x-circle bullet badges',
      glowCorners: ['TR'],
      mood: 'Authoritative enterprise briefing. Deep navy calm with precise electric-blue line icons and stat-driven copy. Feels like a polished analyst deck — trustworthy, structured, zero playfulness.',
    },
    layout: {
      common: 'Every slide: header at top with circular avatar ~130px on an accentPrimary disc at left, bold white name (~44px) and one-line muted tagline; solid accentPrimary "Repost" pill with icon top-right (~260x80px); no page numbers anywhere; diagonal navy gradient background; side margins ≈ 9%.',
      hook: 'Centered stacked headline at y ≈ 12-30%: large white bold lines with one word in accentPrimary and a small solid-blue tag chip tucked above the first line; beneath it a thin blue-outlined rounded bar (~70% width) holding a one-line subtitle; bottom two-thirds: person cutout (head + shoulders, centered, ~55% height) overlapping two tilted solid accentPrimary rounded cards behind them left and right, each filled with white thin-line topic icons; a red X circle badge tags the left card and a white check circle tags the right card.',
      middle: 'Left-aligned headline at y ≈ 18-34% (~90px, 2-4 lines) in white with one phrase in accentPrimary; below, one of three body patterns: (a) intro sentence then a 3-column row of thin-line blue icons (~140px) with white labels underneath, plus a closing takeaway line; (b) 2-3 stat rows where a bold-number sentence sits left and a thin white arrow points right to a blue line icon; (c) check/X bullet list where each row starts with a solid blue check-circle or red X-circle (~70px) followed by a sentence with bold numbers; occasional single large blue line icon floated right of the headline; final takeaway line sometimes bold-italic.',
      final: 'Person cutout occupies the left half (waist-up, ~85% height, anchored bottom-left); right column: right-aligned stacked headline at y ≈ 20-42% with the topic phrase in accentPrimary; below it a blue-outlined rounded panel (~55% width) containing the follow CTA copy with bold lead-in words; header and repost pill as usual.',
    },
    founderTreatment: 'Circular avatar (~130px) on a solid accentPrimary disc in every header with name + tagline; hero cutout of the person centered on the hook slide between two tilted icon cards, and anchored to the left half on the final CTA slide. Clean studio cutout, no ring, overlapping the graphic cards.',
    notes: 'Thin-line (stroke-style) blue icons everywhere, always monochrome accentPrimary; three-icon labeled triads are the signature middle-slide device; stats carry the argument, always in bold white; red X circles are the only non-blue accent.',
  },
  {
    id: 'forest-mint-infographic',
    name: 'Forest Mint Infographic',
    description: 'A blackened-green deck with mint accent words, hand-drawn circle annotations, elbow-arrow connectors, and green line-icon flows — warm systems-thinking infographic style.',
    platforms: ['linkedin', 'instagram'],
    preview: '/carousel-templates/why-your-culture-feels-off.jpg',
    sourceFolder: 'Why Your Culture Feels Off',
    slideCount: 12,
    designSystem: {
      mode: 'dark',
      palette: { background: '#0A120E', accentPrimary: '#57A981', accentSecondary: '#8FD3B2', gradientStart: '#16241C', gradientEnd: '#060A08', textPrimary: '#F7F7F3', textMuted: '#C5CFC8', glow: '#1E3A2C' },
      texture: 'none — soft dark-green vignette gradient, faint lighter wash top-right and bottom-left',
      card: { style: 'outlined', borderOpacity: 0.8, blurPx: 0, radiusPx: 36 },
      badge: { shape: 'pill', fill: 'solid accentPrimary (muted green)', border: 'none', textColor: '#0A120E', letterSpacing: 'normal, sentence case' },
      typography: { family: 'Quicksand / rounded Poppins', fallback: 'sans-serif', headlineWeight: 600, bodyWeight: 400 },
      brandStrip: { brandName: '', show: false },
      accentTreatment: 'alternating words within the same headline switch between white and accentPrimary green; bold spans in body copy; hand-drawn green circle sketched around one headline word; green underline stroke under another',
      glowCorners: ['TR', 'BL'],
      mood: 'Calm coach-consultant energy: dark forest green instead of harsh black, rounded friendly type, and sketchy hand-annotated diagrams. Feels like a thoughtful whiteboard session distilled into slides — organic, systematic, human.',
    },
    layout: {
      common: 'Every slide: header top-left with circular avatar ~150px on an accentPrimary disc with thin white ring, bold white name (~46px) and a two-line muted tagline; accentPrimary "Repost" pill with dark text top-right (~280x80px); "Page N" label in white bottom-right; dark green vignette background; side margins ≈ 9%; middle slides center almost everything.',
      hook: 'Giant 3-line headline across the top third (~120px) alternating white and accentPrimary words, with a small glyph replacing one letter of a key word; italic two-line subhead to the right of line 3 with the key phrase in bold accentPrimary; person cutout (head + torso, ~60% height) centered in the lower two thirds, flanked by a tilted accentPrimary rounded card with a white line icon on the left and a themed graphic pair on the right (e.g. off/on toggles); header chip with avatar + name + tagline sits bottom-left over the photo; "Page 1" plus a small white swipe hand icon bottom-right.',
      middle: 'Centered big headline at y ≈ 20-35% (~95px, 1-3 lines) mixing white and accentPrimary words, decorated with one hand-drawn flourish per slide (sketched circle around a word, underline stroke, or thin elbow-arrow dropping from a word down to the body); middle zone is an icon diagram: green stroke-style line icons (~220px) arranged as icon → white arrow → icon flows (sometimes bleeding off the canvas edge to imply continuation), or icon ≠ icon comparisons with a white not-equal sign, or a single centered icon above the headline; one slide may replace the diagram with a large accentPrimary-outlined rounded speech panel holding a bold question, tagged by a green question-mark bubble; centered body paragraph (~48px) in the lower third with bold white or bold accentPrimary emphasis spans; "Page N" bottom-right.',
      final: 'Person cutout fills the right half (waist-up, ~90% height, anchored bottom-right); left column: 3-line stacked headline at y ≈ 18-45% (~110px) in white with a small green line icon inline beside one word; body paragraph below (~48px) with bold emphasis on the promise phrase; a second Repost pill placed mid-left (y ≈ 78%); "Page N" near bottom-right over the photo.',
    },
    founderTreatment: 'Circular avatar (~150px) on a green disc in every header with name + two-line tagline; full hero cutout of the person on the hook slide (centered, layered over icon cards and themed graphics, with the header chip moved to bottom-left) and on the final slide (right half). Cutouts are studio-lit, no ring.',
    notes: 'Signature hand-drawn annotations (sketched ellipse around a headline word, marker underline) plus thin elbow-line arrows that route from headline words into diagrams; icon flows deliberately bleed off canvas edges to chain slides together like one continuous whiteboard; page labels use the word "Page"; all icons are stroke-style in the same mint green.',
  },
];

export function getCuratedTemplate(templateId) {
  if (!templateId) return null;
  return CURATED_CAROUSEL_TEMPLATES.find((t) => t.id === templateId) || null;
}

// Deterministic template enforcement on a plan_carousel tool call —
// applied SERVER-SIDE at the relay so the template never depends on the
// model obeying the "copy templateId" prompt instruction (the fragile
// link behind the 2026-07-21 "template not applied" bug).
// Priority: explicit user selection > model-set templateId (CEO by-name)
// > the user's stored default (brand_dna.default_carousel_template_id).
// Keeps the user's brand name in the template's brandStrip.
export function applyCuratedTemplateToPlanArgs(args, { explicitCuratedId = null, defaultTemplateId = null } = {}) {
  if (!args || typeof args !== 'object') return args;
  const chosenId = explicitCuratedId || args.designSystem?.templateId || defaultTemplateId;
  const curated = getCuratedTemplate(chosenId);
  if (!curated) return args;
  const brandName = args.designSystem?.brandStrip?.brandName || curated.designSystem.brandStrip?.brandName || '';
  args.designSystem = {
    ...curated.designSystem,
    templateId: curated.id,
    brandStrip: { ...(curated.designSystem.brandStrip || {}), brandName },
  };
  return args;
}
