import { Router } from 'express';
import { createClient } from '@supabase/supabase-js';
import sharp from 'sharp';
import { requireCredits } from '../middleware/gate.js';

const router = Router();

const GEMINI_MODEL_FAST = 'gemini-3.1-flash-image-preview';
const GEMINI_MODEL_PRO = 'gemini-3-pro-image-preview'; // Best text rendering + reasoning
const GEMINI_BASE = 'https://generativelanguage.googleapis.com/v1beta';
const GEMINI_TIMEOUT_MS = 90_000; // 90s for fast model
const GEMINI_PRO_TIMEOUT_MS = 120_000; // 120s for pro model (more thinking time)

// Per-platform config: model, aspect ratio, image size, thinking level
const PLATFORM_CONFIG = {
  newsletter:       { model: GEMINI_MODEL_FAST, aspectRatio: '16:9', imageSize: '1K' },
  landing_page:     { model: GEMINI_MODEL_FAST, aspectRatio: '16:9', imageSize: '1K' },
  landing_page_sq:  { model: GEMINI_MODEL_FAST, aspectRatio: '1:1',  imageSize: '1K' },
  instagram:        { model: GEMINI_MODEL_FAST, aspectRatio: '1:1',  imageSize: '1K' },
  instagram_story:  { model: GEMINI_MODEL_PRO,  aspectRatio: '9:16', imageSize: '2K' },
  youtube:          { model: GEMINI_MODEL_FAST, aspectRatio: '16:9', imageSize: '1K' },
  tiktok:           { model: GEMINI_MODEL_PRO,  aspectRatio: '9:16', imageSize: '2K' },
  x:                { model: GEMINI_MODEL_FAST, aspectRatio: '16:9', imageSize: '1K' },
  linkedin:         { model: GEMINI_MODEL_FAST, aspectRatio: '4:3',  imageSize: '1K' },
  facebook:         { model: GEMINI_MODEL_FAST, aspectRatio: '1:1',  imageSize: '1K' },
};

// Supabase client for fetching brand data as fallback
const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

function getApiKey() {
  const key = process.env.GEMINI_API_KEY;
  if (!key) throw new Error('GEMINI_API_KEY not configured');
  return key;
}

// ─── Caches ───
// Brand asset base64 cache — keyed by URL, avoids re-downloading the same images
const brandImageCache = new Map(); // url -> { data, expiry }
const BRAND_IMAGE_TTL = 10 * 60 * 1000; // 10 minutes

// Brand data cache — keyed by userId, avoids re-querying DB every call
const brandDataCache = new Map(); // userId -> { data, expiry }
const BRAND_DATA_TTL = 5 * 60 * 1000; // 5 minutes

const PLATFORM_IMAGE_RULES = {
  landing_page: `LANDING PAGE IMAGE RULES:
- These images are for a website landing page — they sit INSIDE a designed HTML page that already has its own text, headings, buttons, and layout.

CRITICAL — NO TEXT ON THE IMAGE:
- Do NOT put any text, headlines, captions, labels, or words on the image. The website already has text.
- Do NOT put any logos on the image. The website nav/footer already has the logo.
- Do NOT put watermarks, brand marks, or badges on the image.
- The image should be PURELY visual — a photo, illustration, or graphic with ZERO text elements.

WHAT TO GENERATE:
- Hero images: Atmospheric, aspirational lifestyle/product photography. Wide cinematic shots. Think premium SaaS landing pages (Linear, Stripe, Notion) — clean, modern, evocative.
- Feature illustrations: Clean conceptual visuals representing the feature (e.g. a dashboard mockup, abstract data visualization, hands using a device, workflow diagram). Minimal and modern.
- How-it-works: Step-by-step visual moments — hands on keyboard, phone screen, person having an aha moment. Real and relatable.
- Testimonial backgrounds: Subtle, soft, blurred lifestyle shots or abstract gradients. Should not compete with the testimonial text.
- CTA section: Aspirational result imagery — success, growth, freedom, the "after" state.

PERSON/FOUNDER:
- If reference photos are attached, include the person naturally in hero or about sections.
- Show them in context — working, presenting, in their element. Not a passport photo.

STYLE:
- Modern, premium, editorial quality
- Clean compositions with breathing room — not cluttered
- Natural lighting, subtle depth of field
- Brand colors can influence lighting/mood/color grading but should not be garish
- Think Unsplash editorial quality, not stock photo cheese`,

  landing_page_sq: `LANDING PAGE SQUARE IMAGE RULES:
- Same as landing page rules but in SQUARE 1:1 format
- NO text, NO logos, NO watermarks on the image
- Clean conceptual visual — feature illustration, icon-style graphic, or product detail shot
- Minimal, modern, premium quality`,

  newsletter: `NEWSLETTER COVER IMAGE RULES:
- Aspect ratio: LANDSCAPE approximately 1200x628 (roughly 2:1) — wide format for email headers
- This is a hero/cover image for an email newsletter — it needs to be visually striking at small sizes

TEXT & BRANDING — CRITICAL:
- INCLUDE bold, large, readable headline text on the image — this is the newsletter title/hook
- Text should be the primary visual element: big, clean sans-serif typography with clear hierarchy
- If a brand logo is attached, place it prominently in the design (corner, top-center, or integrated into the layout)
- Use the brand colors and fonts as the design foundation — this should look like it came from the brand's design team

PERSON/FOUNDER:
- If reference photos of the user/founder are attached, include their likeness in the cover image
- Show them naturally — as the face behind the newsletter, a professional headshot style, or contextually related to the topic
- The person adds authenticity and personal connection — newsletters perform better with a human face

COMPOSITION & STYLE:
- Bold, magazine-cover quality — think Morning Brew, The Hustle, or Milk Road cover graphics
- High contrast, readable at 300px wide on a phone
- Clean background (solid color, gradient, or subtle texture) that makes text pop
- 2-3 visual elements maximum — text + logo + person/graphic
- Colors: use brand colors as dominant palette. Dark or medium backgrounds work best for contrast
- Premium, polished feel — like a designer made it in Figma
- The image should make someone STOP scrolling in their inbox`,

  instagram: `INSTAGRAM CAROUSEL SLIDE RULES:
- Aspect ratio: SQUARE (1:1) — this is critical
- This slide is part of a CAROUSEL SET — a series of informational slides, like a thread or mini-article

THERE ARE 3 TYPES OF CAROUSEL SLIDES — follow the prompt to determine which type this is:

TYPE 1 — HOOK SLIDE (slide 1):
- This is the ONLY slide that can be photographic/visual
- Bold hook text (large, 2-3 lines) + founder photo if reference images are attached
- Eye-catching background: can use photography, gradient, or bold color
- The text should create curiosity and make people swipe
- If the founder is included, show them naturally — like a real Instagram photo

TYPE 2 — CONTENT SLIDE (slides 2 through N-1) — THE MOST COMMON TYPE:
- Solid black (#000000) background. ALWAYS black for content slides.
- Default layout (unless the prompt specifies "tweet-style"):
  • Numbered point title in large white bold text (e.g. "1. Skill-creator" or "2. Content-ideas")
  • Below title: 2-3 SHORT PARAGRAPHS of body text in light gray (#b0b0b0 or #cccccc), normal weight (NOT bold), left-aligned, readable (~18-20px feel)
  • Bottom center: optional small relevant icon or illustration (a folder icon, a gear, a chart — simple, clean)
- If the prompt says "tweet-style": ALSO add a small circular profile picture + bold white name + gray @handle at the top, and small gray "@username" bottom-left + "save for later" bottom-right
- This is INFORMATIONAL content — the reader is LEARNING something. Include real substance in the body text.
- Text is LEFT-ALIGNED. Reads like a social media post, NOT a centered headline.
- DO NOT just put a big headline. Include actual explanation text that teaches something.

TYPE 3 — CTA SLIDE (last slide):
- Same dark/black background as content slides
- Founder photo (if reference images attached) + product screenshot or visual
- Clear CTA: "Comment [KEYWORD] for an invite" or "Follow @handle for more"
- Hand-drawn style arrow pointing to the CTA
- Bottom: "@username" + "save for later"

VISUAL CONSISTENCY:
- Content slides (type 2) MUST all use identical layout: same black bg, same profile section, same text styling
- Follow the EXACT style described in the prompt. Do NOT improvise a different background or layout.
- The ONLY thing that changes between content slides is the numbered point and body text.

WHAT TO AVOID:
- NO making every slide look like a poster with just a big headline — content slides need body text
- NO switching visual styles between content slides
- NO photograph backgrounds on content slides (only hook slide)
- NO centered text on content slides — left-align like a tweet
- NO tiny unreadable text
- NO cluttered layouts
- NO generic stock imagery`,

  youtube: `YOUTUBE THUMBNAIL RULES:
- Aspect ratio: LANDSCAPE 16:9 — wide format, this is critical
- This is a YouTube thumbnail that needs to get clicks — it competes with millions of others

PERSON (MANDATORY when reference photos are attached):
- The person from the reference photos MUST be the main subject — large, expressive face taking up 40-60% of the frame
- Show a strong emotion: surprise, excitement, shock, curiosity — exaggerated expressions work best
- The person should be looking at the camera or at the text element
- Use their EXACT face and likeness from the reference photos

TEXT ON THUMBNAIL:
- 3-5 words MAX in huge bold text — this text comes from the user's prompt, use their exact words or a punchier version
- Text should be the second focal point after the face
- High contrast: white or yellow text with dark outline/shadow for readability on any background
- Position text on the opposite side of the person
- The text should create curiosity or urgency

DESIGN:
- High contrast, saturated colors, dramatic lighting
- Clean background that doesn't compete with the face and text
- Style reference: MrBeast, MKBHD, Ali Abdaal thumbnail quality
- NO logos unless explicitly requested — YouTube thumbnails never have logos
- NO cluttered designs, NO small text, NO generic stock imagery
- NO brand watermarks — this is YouTube, not a corporate presentation`,

  instagram_story: `INSTAGRAM STORY RULES:
- Aspect ratio: PORTRAIT 9:16 (1080x1920) — composition must be vertical-first

BACKGROUND PHOTO — THIS IS CRITICAL:
- Must look like an iPhone photo. Natural mobile photography — the kind of image someone posts to their Instagram Story.
- NATURAL lighting only: daylight, indoor ambient light, golden hour, overcast. No studio setups.
- Real environments: office, coffee shop, desk, street, home, gym — wherever a real person would be.
- Natural color grading — the way an iPhone processes photos. Slightly warm, natural saturation.
- Slight grain/noise is GOOD — makes it feel authentic and real.
- The photo fills the entire 9:16 frame edge to edge.

WHAT THE PHOTO MUST NOT LOOK LIKE:
- NO studio lighting, NO dramatic rim lights, NO three-point lighting setups
- NO neon purple/cyan/magenta color grading — this is the #1 problem. Real iPhone photos do NOT have sci-fi lighting.
- NO futuristic screens, holographic displays, glowing interfaces, or sci-fi aesthetics
- NO hyper-saturated HDR look, NO cinematic teal-and-orange color grading
- NO DSLR shallow depth-of-field bokeh (iPhones have wider DOF)
- NO illustrations, NO vector art, NO flat design, NO abstract backgrounds
- NO overly polished commercial photography — it should feel CASUAL, not produced
- If the scene involves a computer/phone, show a REAL normal screen — not a glowing futuristic hologram

PERSON (when reference photos attached):
- Show the person naturally — as if they took a selfie or someone nearby snapped the photo
- Natural expression, casual pose, real environment
- NOT a model pose, NOT a corporate headshot, NOT a magazine shoot

DO NOT RENDER ANY INSTAGRAM UI:
- No progress bars, no profile pictures, no usernames, no timestamps
- No close buttons, no send message bar, no heart/share icons
- No story viewer interface at all — just the raw photo

TEXT OVERLAY is handled separately by the system — focus ONLY on generating the photo.`,

  tiktok: `TIKTOK COVER RULES:
- Aspect ratio: PORTRAIT 9:16 — tall vertical format
- Bold text overlay centered in the frame
- Clean, eye-catching, works as a video cover/thumbnail
- High contrast, readable at small sizes on mobile`,

  x: `X/TWITTER IMAGE RULES:
- Aspect ratio: LANDSCAPE 16:9 or SQUARE 1:1
- Clean, minimal design with bold statement text
- High contrast, professional look`,

  linkedin: `LINKEDIN IMAGE RULES:
- Aspect ratio: LANDSCAPE 4:3 — this is critical, the image MUST be 4:3 landscape format
- Professional, clean design with authority
- Bold headline text as the main element, minimal layout, corporate-friendly colors
- If reference photos of the founder/user are attached, FEATURE THEM prominently — LinkedIn posts with a real person get 2-3x more engagement. Show their face, natural expression, professional but approachable.
- Composition: person on one side, bold text on the other. Or person as background with text overlay.
- Think thought-leader post graphics — the kind of image that makes someone stop scrolling on their LinkedIn feed
- Logo: small, subtle, corner watermark only — NOT the main element`,

  facebook: `FACEBOOK IMAGE RULES:
- Aspect ratio: SQUARE 1:1 or LANDSCAPE 16:9
- Eye-catching, shareable visual
- Clear text overlay if needed, high contrast`,
};

// Fetch an image URL and return as base64 inline data for Gemini (with cache)
async function fetchImageAsBase64(url) {
  try {
    if (!url) return null;
    // Check cache first
    const cached = brandImageCache.get(url);
    if (cached && cached.expiry > Date.now()) {
      return cached.data;
    }

    const res = await fetch(url, { signal: AbortSignal.timeout(15_000) });
    if (!res.ok) {
      console.warn(`[fetchImage] Failed to fetch ${url?.slice(0, 80)}: ${res.status} ${res.statusText}`);
      return null;
    }
    const buffer = await res.arrayBuffer();
    const base64 = Buffer.from(buffer).toString('base64');
    const contentType = res.headers.get('content-type') || 'image/jpeg';
    const result = { inlineData: { data: base64, mimeType: contentType } };

    // Store in cache
    brandImageCache.set(url, { data: result, expiry: Date.now() + BRAND_IMAGE_TTL });

    return result;
  } catch (err) {
    console.warn(`[fetchImage] Error fetching ${url?.slice(0, 80)}:`, err.message);
    return null;
  }
}

// Fetch brand data from DB with cache
async function getCachedBrandData(userId) {
  const cached = brandDataCache.get(userId);
  if (cached && cached.expiry > Date.now()) {
    return cached.data;
  }

  const { data: dbBrandRows } = await supabase
    .from('brand_dna')
    .select('logo_url, logos, photo_urls, colors, main_font')
    .eq('user_id', userId)
    .order('updated_at', { ascending: true })
    .limit(1);
  const dbBrand = dbBrandRows?.[0] || null;

  let brand = null;
  if (dbBrand) {
    const dbDefaultLogo = dbBrand.logos?.find(l => l.isDefault) || dbBrand.logos?.[0];
    brand = {
      logoUrl: dbDefaultLogo?.url || dbBrand.logo_url || null,
      photoUrls: dbBrand.photo_urls || [],
      colors: dbBrand.colors || {},
      mainFont: dbBrand.main_font || null,
    };
  }

  brandDataCache.set(userId, { data: brand, expiry: Date.now() + BRAND_DATA_TTL });
  return brand;
}

// ─── Image generation ───
router.post('/api/generate/image', requireCredits('image_generation'), async (req, res) => {
  const { prompt, platform, brandData, referenceImages } = req.body;
  if (!prompt) {
    return res.status(400).json({ error: 'prompt is required' });
  }

  try {
    const apiKey = getApiKey();
    const platformRules = PLATFORM_IMAGE_RULES[platform] || PLATFORM_IMAGE_RULES.instagram;

    // Resolve brand data — use provided data or fetch from cache/DB as fallback
    let brand = brandData;
    if (!brand || (!brand.logoUrl && !brand.photoUrls?.length)) {
      const userId = req.user?.id;
      if (userId && userId !== 'anonymous') {
        console.log(`[generate/image] No brand data from frontend — checking cache/DB for user ${userId}`);
        brand = await getCachedBrandData(userId);
        if (brand) {
          console.log(`[generate/image] Brand data resolved — logo: ${!!brand.logoUrl}, photos: ${brand.photoUrls.length}, colors: ${JSON.stringify(brand.colors)}`);
        }
      }
    }

    // Build brand context for the prompt
    let brandContext = '';
    if (brand) {
      if (brand.colors) {
        const c = brand.colors;
        const colorParts = [];
        if (c.primary) colorParts.push(`primary: ${c.primary}`);
        if (c.text) colorParts.push(`text: ${c.text}`);
        if (c.secondary) colorParts.push(`secondary: ${c.secondary}`);
        if (colorParts.length) brandContext += `\nBRAND COLORS (use these in the design): ${colorParts.join(', ')}`;
      }
      if (brand.mainFont) brandContext += `\nBRAND FONT: ${brand.mainFont} (use this typography style)`;
    }

    // Determine what brand assets are available for stronger prompting
    const hasLogo = brand?.logoUrl;
    const hasPhotos = brand?.photoUrls?.length > 0;

    let brandImageInstructions = '';
    if (hasLogo && hasPhotos) {
      brandImageInstructions = `
BRAND ASSETS (attached as reference images):
- FIRST attached image = BRAND LOGO. Place it small and subtle (corner watermark, max 24px height). The logo is NOT the hero — it's a subtle brand mark.
- REMAINING attached images = REFERENCE PHOTOS of the user/founder. You MUST include this person in the image — use their exact face and likeness from these photos. They should be a prominent, visible part of the composition. Do NOT generate a random person or leave the person out. Social media content with a real human face gets 2-3x more engagement.`;
    } else if (hasLogo) {
      brandImageInstructions = `
BRAND ASSETS (attached as reference):
- The attached image is the user's BRAND LOGO. Place it small and subtle — corner watermark, max 24px height. The logo should NOT dominate the design.`;
    } else if (hasPhotos) {
      brandImageInstructions = `
BRAND ASSETS (attached as reference):
- The attached images are REFERENCE PHOTOS of the user/founder. You MUST include this person in the image — use their exact face and likeness from these photos. They should be a prominent, visible part of the composition. Do NOT generate a random person or leave the person out.`;
    }

    // Platform-specific quality framing — stories/social photos need iPhone-natural look, not studio
    const isPhotoFirst = platform === 'instagram_story' || platform === 'tiktok';
    const isCarousel = platform === 'instagram';
    const qualityRules = isPhotoFirst
      ? `PHOTO STYLE — CRITICAL:
- iPhone camera quality. Natural mobile photography — the kind of photo a real person takes on their phone.
- Natural indoor/outdoor lighting. NO studio lighting, NO dramatic rim lights, NO neon/purple/cyan color grading.
- Real environments, real textures, natural colors. Slight grain is fine — makes it authentic.
- NO futuristic screens, NO holographic displays, NO sci-fi aesthetics, NO glowing interfaces.
- NO hyper-edited HDR, NO cinematic color grading, NO teal-and-orange film look.
- The photo should look like it was taken TODAY by a real person — casual, authentic, relatable.
- If the prompt describes a scene, imagine how a regular person would photograph it with their iPhone.
- NO cartoons, NO illustrations, NO vector art, NO AI-looking generic imagery.`
      : isCarousel
      ? `DESIGN QUALITY RULES:
- Clean, modern graphic design for carousel slides — bold text, minimal layout.
- NOT a photograph for text-heavy slides — use solid/gradient backgrounds with typography.
- Photorealistic ONLY when showing a person (hook slide). All other slides = designed graphics.
- NO cartoons, NO pixel art, NO clip-art, NO AI-looking generic imagery.
- Text must be spelled correctly, large, and perfectly readable.
- Use brand colors and fonts as specified — they are requirements, not suggestions.`
      : `GENERAL QUALITY RULES:
- Photorealistic or modern graphic design — NO cartoons, NO pixel art, NO illustrations, NO clip-art, NO AI-looking generic imagery.
- Natural, authentic look. Avoid over-produced studio aesthetics, neon lighting, and sci-fi visuals unless explicitly requested.
- Any text on the image must be spelled correctly, large, and perfectly readable.
- Clean composition with clear visual hierarchy.
- Use brand colors and fonts as specified — they are requirements, not suggestions.`;

    const imagePrompt = `You are creating visual content for social media.

${platformRules}
${brandContext}
${brandImageInstructions}

${qualityRules}

NOW GENERATE THIS IMAGE:
${prompt}`;

    // Fetch brand photos/logo as reference images for Gemini
    const requestParts = [{ text: imagePrompt }];

    if (brand) {
      const imageUrls = [];
      if (brand.logoUrl) imageUrls.push(brand.logoUrl);
      // Send ALL brand photos as reference
      if (brand.photoUrls?.length) {
        imageUrls.push(...brand.photoUrls);
      }

      if (imageUrls.length > 0) {
        console.log(`[generate/image] Fetching ${imageUrls.length} brand reference image(s)...`);
        imageUrls.forEach((url, i) => console.log(`  [${i}] ${url?.slice(0, 100)}`));
        const imageParts = await Promise.all(imageUrls.map(fetchImageAsBase64));
        const attached = imageParts.filter(Boolean);
        const failed = imageUrls.filter((_, i) => !imageParts[i]);
        for (const part of attached) {
          requestParts.push(part);
        }
        console.log(`[generate/image] ✅ Attached ${attached.length}/${imageUrls.length} reference image(s) to Gemini request`);
        if (failed.length > 0) {
          console.warn(`[generate/image] ⚠️ Failed to fetch ${failed.length} image(s):`, failed.map(u => u?.slice(0, 100)));
        }
      } else {
        console.log(`[generate/image] ⚠️ No brand images to attach`);
      }
    } else {
      console.log(`[generate/image] ⚠️ No brand data available — generating without brand references`);
    }

    // Attach previous images as reference when regenerating
    if (referenceImages?.length) {
      requestParts.push({ text: '\n\nPREVIOUS VERSION (the user wants you to IMPROVE on this image — keep the same overall style, layout, and composition but apply the requested changes. Do NOT start from scratch):' });
      for (const refImg of referenceImages) {
        if (refImg?.data && refImg?.mimeType) {
          requestParts.push({ inlineData: { data: refImg.data, mimeType: refImg.mimeType } });
        }
      }
      console.log(`[generate/image] 🔄 Regeneration mode — attached ${referenceImages.length} previous image(s) as reference`);
    }

    // Select model + config based on platform
    const pConfig = PLATFORM_CONFIG[platform] || PLATFORM_CONFIG.instagram;
    const model = pConfig.model;
    const timeout = model === GEMINI_MODEL_PRO ? GEMINI_PRO_TIMEOUT_MS : GEMINI_TIMEOUT_MS;

    console.log(`[generate/image] Platform: ${platform || 'default'}, Model: ${model}, Parts: ${requestParts.length} (1 text + ${requestParts.length - 1} images), Prompt: ${prompt.slice(0, 120)}...`);

    // Build request body with imageConfig and optional thinking
    const requestBody = {
      contents: [{ parts: requestParts }],
      generationConfig: {
        responseModalities: ['TEXT', 'IMAGE'],
        imageConfig: {
          aspectRatio: pConfig.aspectRatio,
          imageSize: pConfig.imageSize,
        },
      },
    };

    // Enable Google Search grounding for story sequences — gives Gemini
    // access to current trends, styles, and references for better results
    if (platform === 'instagram_story' || platform === 'tiktok') {
      requestBody.tools = [{ google_search: {} }];
    }

    const geminiRes = await fetch(
      `${GEMINI_BASE}/models/${model}:generateContent?key=${apiKey}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        signal: AbortSignal.timeout(timeout),
        body: JSON.stringify(requestBody),
      }
    );

    if (!geminiRes.ok) {
      const errText = await geminiRes.text();
      console.log(`[generate/image] Gemini error: ${geminiRes.status} ${errText}`);
      return res.status(geminiRes.status).json({ error: errText });
    }

    const result = await geminiRes.json();
    const responseParts = result.candidates?.[0]?.content?.parts || [];

    let text = '';
    let imageData = null;
    let imageMimeType = null;

    for (const part of responseParts) {
      if (part.text) {
        text += part.text;
      }
      if (part.inlineData) {
        imageData = part.inlineData.data;
        imageMimeType = part.inlineData.mimeType;
      }
    }

    console.log(`[generate/image] Generated image: ${imageData ? 'yes' : 'no'}, text: ${text.length} chars`);

    res.json({
      text: text || null,
      image: imageData ? {
        data: imageData,
        mimeType: imageMimeType,
      } : null,
    });
  } catch (err) {
    const isTimeout = err.name === 'TimeoutError' || err.name === 'AbortError';
    console.log(`[generate/image] ${isTimeout ? 'TIMEOUT' : 'Error'}: ${err.message}`);
    res.status(isTimeout ? 504 : 500).json({
      error: isTimeout ? 'Image generation timed out — try again or simplify the prompt' : err.message,
    });
  }
});

// ─── Upload base64 image to Supabase storage ───
router.post('/api/generate/upload-image', async (req, res) => {
  const { base64, mimeType, filename } = req.body;
  if (!base64) return res.status(400).json({ error: 'base64 is required' });

  try {
    const rawBuffer = Buffer.from(base64, 'base64');
    const origSize = rawBuffer.length;

    // Compress: resize to max 1200px wide, convert to JPEG quality 80
    let buffer;
    let finalMime = 'image/jpeg';
    let ext = 'jpg';
    try {
      buffer = await sharp(rawBuffer)
        .resize(1200, null, { withoutEnlargement: true, fit: 'inside' })
        .jpeg({ quality: 80 })
        .toBuffer();
      console.log(`[upload-image] Compressed ${Math.round(origSize/1024)}KB → ${Math.round(buffer.length/1024)}KB`);
    } catch {
      // If sharp fails, upload original
      buffer = rawBuffer;
      finalMime = mimeType || 'image/png';
      ext = (finalMime).split('/')[1] || 'png';
    }

    const name = filename || `nl-${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${ext}`;

    const { error } = await supabase.storage
      .from('newsletter-images')
      .upload(name, buffer, {
        contentType: finalMime,
        upsert: true,
      });

    if (error) {
      console.log(`[upload-image] Storage error: ${error.message}`);
      return res.status(500).json({ error: error.message });
    }

    const { data: urlData } = supabase.storage
      .from('newsletter-images')
      .getPublicUrl(name);

    console.log(`[upload-image] Uploaded ${name} → ${urlData.publicUrl}`);
    res.json({ url: urlData.publicUrl });
  } catch (err) {
    console.log(`[upload-image] Error: ${err.message}`);
    res.status(500).json({ error: err.message });
  }
});

export default router;
