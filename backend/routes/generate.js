import { Router } from 'express';
import { createClient } from '@supabase/supabase-js';
import sharp from 'sharp';

const router = Router();

const GEMINI_MODEL_FAST = 'gemini-3.1-flash-image-preview';
const GEMINI_MODEL_PRO = 'gemini-3-pro-image-preview'; // Best text rendering + reasoning
const GEMINI_BASE = 'https://generativelanguage.googleapis.com/v1beta';
const GEMINI_TIMEOUT_MS = 90_000; // 90s for fast model
const GEMINI_PRO_TIMEOUT_MS = 120_000; // 120s for pro model (more thinking time)

// Per-platform config: model, aspect ratio, image size, thinking level
const PLATFORM_CONFIG = {
  newsletter:       { model: GEMINI_MODEL_FAST, aspectRatio: '16:9', imageSize: '1K' },
  instagram:        { model: GEMINI_MODEL_FAST, aspectRatio: '1:1',  imageSize: '1K' },
  instagram_story:  { model: GEMINI_MODEL_PRO,  aspectRatio: '9:16', imageSize: '2K', thinkingLevel: 'High' },
  youtube:          { model: GEMINI_MODEL_FAST, aspectRatio: '16:9', imageSize: '1K' },
  tiktok:           { model: GEMINI_MODEL_PRO,  aspectRatio: '9:16', imageSize: '2K', thinkingLevel: 'High' },
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

  instagram: `INSTAGRAM IMAGE RULES:
- Aspect ratio: SQUARE (1:1) — this is critical, the image MUST be perfectly square
- This is an Instagram carousel slide / post graphic
- Put bold, large, readable TEXT directly on the image — this is what Instagram posts look like
- Typography: clean sans-serif font (like Helvetica, Inter, or Montserrat style), high contrast against background
- Text should be the main focal point — large, centered or left-aligned, with clear hierarchy
- Background: either a clean solid/gradient color, a blurred photo, or a subtle textured background
- Style reference: think @garyvee carousel slides, @chriswillx infographic posts, @thedesignmilk aesthetics
- Colors: bold, high contrast. Dark bg + white text OR light bg + dark text. One accent color max
- NO tiny text, NO cluttered layouts, NO more than 2-3 lines of text per image
- Make it look like a real designer made it in Figma or Canva Pro`,

  youtube: `YOUTUBE THUMBNAIL RULES:
- Aspect ratio: LANDSCAPE 16:9 — wide format
- This is a YouTube thumbnail that needs to get clicks
- Large expressive face or striking visual as the main element
- Bold text: 3-4 words MAX, huge font, slight outline/shadow for readability
- High contrast, saturated colors, dramatic lighting
- Style reference: think MrBeast, MKBHD, or Ali Abdaal thumbnail quality
- NO cluttered designs, NO small text, NO generic stock imagery`,

  instagram_story: `INSTAGRAM STORY RULES:
- Aspect ratio: PORTRAIT 9:16 (1080x1920) — enforced via API, but composition must be vertical-first
- This is an Instagram Story frame — it must look like a REAL Instagram Story screenshot

=== TEXT OVERLAY — THIS IS THE #1 PRIORITY ===

You are replicating Instagram's NATIVE text sticker tool. This is what it looks like when someone taps "Aa" in Instagram Stories and uses the "Classic" style:

EXACT SPECIFICATIONS:
1. BACKGROUND BLOCK: A solid, flat, fully opaque #FFFFFF white rectangle. Corners are rounded (~8px radius). The block fits snugly around the text — it is NOT full-width, it is only as wide as the text + ~16px horizontal padding on each side, + ~8px vertical padding top and bottom.
2. TEXT: #000000 pure black. Font is SF Pro Display or Helvetica Neue — a clean, modern, system sans-serif at regular weight (400). NOT bold, NOT light. Size is medium-large, easily readable.
3. POSITIONING: The white text block sits on TOP of the photo as a floating UI sticker. There must be a clear visual separation — the block is a distinct layer hovering over the photo, NOT blended, NOT transparent, NOT part of the photo.
4. ALIGNMENT: Center-aligned horizontally on the frame. Vertically positioned in the center or upper third.
5. SINGLE BLOCK: If there are multiple lines, they are ALL inside ONE white rectangle. Do NOT create separate blocks per line.
6. LOOK & FEEL: It should look IDENTICAL to taking a screenshot of an actual Instagram Story with text added via the app's built-in text tool. If someone saw this image, they should think "that person typed text on their Instagram Story" — NOT "a graphic designer made this."

ABSOLUTE PROHIBITIONS FOR TEXT:
- NO fancy fonts, NO serif fonts, NO handwriting, NO decorative type
- NO text shadows, NO text outlines, NO text glow, NO neon effects
- NO gradient text, NO colored text (must be black on white)
- NO colored background blocks (must be white)
- NO text burned directly onto the photo without the white block
- NO text block stretching edge-to-edge across the image
- NO semi-transparent or frosted glass text blocks
- NO text that looks designed, artistic, or typographic — it must look like Instagram's simple text tool

BACKGROUND PHOTO:
- iPhone-quality photograph — natural mobile photography, casual but polished
- Real lighting, real textures, real environments, natural color grading
- Slight natural grain is fine — looks more authentic
- The photo fills the entire 9:16 frame edge to edge
- NOT a studio shot, NOT overly edited, NOT HDR
- NO illustrations, NO vector art, NO flat design, NO abstract backgrounds
- Should look like something a real creator actually shot on their phone camera
- The photo is the BACKGROUND — the text sticker sits ON TOP of it as a separate layer`,

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
- Bold headline text, minimal design, corporate-friendly colors
- Think thought-leader post graphics — clean, sharp, authoritative`,

  facebook: `FACEBOOK IMAGE RULES:
- Aspect ratio: SQUARE 1:1 or LANDSCAPE 16:9
- Eye-catching, shareable visual
- Clear text overlay if needed, high contrast`,
};

// Fetch an image URL and return as base64 inline data for Gemini (with cache)
async function fetchImageAsBase64(url) {
  try {
    // Check cache first
    const cached = brandImageCache.get(url);
    if (cached && cached.expiry > Date.now()) {
      return cached.data;
    }

    const res = await fetch(url, { signal: AbortSignal.timeout(15_000) });
    if (!res.ok) return null;
    const buffer = await res.arrayBuffer();
    const base64 = Buffer.from(buffer).toString('base64');
    const contentType = res.headers.get('content-type') || 'image/jpeg';
    const result = { inlineData: { data: base64, mimeType: contentType } };

    // Store in cache
    brandImageCache.set(url, { data: result, expiry: Date.now() + BRAND_IMAGE_TTL });

    return result;
  } catch {
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
router.post('/api/generate/image', async (req, res) => {
  const { prompt, platform, brandData } = req.body;
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
MANDATORY BRAND ASSET USAGE:
- The FIRST attached image is the user's BRAND LOGO. You MUST place this logo in the design — typically in a corner or as a watermark. Reproduce the logo exactly as shown.
- The REMAINING attached images are REFERENCE PHOTOS of the user/founder. If this content features a person, you MUST use their exact face and likeness from these reference photos. Do NOT generate a different person.
- These brand assets are NON-NEGOTIABLE. Every generated image must include the brand logo and use the person's real appearance.`;
    } else if (hasLogo) {
      brandImageInstructions = `
MANDATORY BRAND ASSET USAGE:
- The attached image is the user's BRAND LOGO. You MUST incorporate this logo in the design — place it in a corner, header, or as a subtle watermark. Reproduce the logo exactly as shown.`;
    } else if (hasPhotos) {
      brandImageInstructions = `
MANDATORY BRAND ASSET USAGE:
- The attached images are REFERENCE PHOTOS of the user/founder. If this content features a person, you MUST use their exact face and likeness from these photos. Do NOT generate a different face or body. Match their appearance precisely.`;
    }

    const imagePrompt = `You are a professional graphic designer creating social media content. You have a reputation for brand-consistent, on-brand designs.

${platformRules}
${brandContext}
${brandImageInstructions}

GENERAL QUALITY RULES:
- Photorealistic or modern graphic design ONLY — NO cartoons, NO pixel art, NO illustrations, NO clip-art, NO AI-looking generic imagery
- Any text on the image must be spelled correctly, large, and perfectly readable
- Clean composition with clear visual hierarchy
- ALWAYS use the brand colors and fonts specified above — these are not suggestions, they are requirements
- The design should look like it came from a professional studio that knows this brand

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
        const imageParts = await Promise.all(imageUrls.map(fetchImageAsBase64));
        const attached = imageParts.filter(Boolean);
        for (const part of attached) {
          requestParts.push(part);
        }
        console.log(`[generate/image] ✅ Attached ${attached.length}/${imageUrls.length} reference image(s) to Gemini request`);
      } else {
        console.log(`[generate/image] ⚠️ No brand images to attach`);
      }
    } else {
      console.log(`[generate/image] ⚠️ No brand data available — generating without brand references`);
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

    // Enable high reasoning for platforms that need precise text rendering
    if (pConfig.thinkingLevel) {
      requestBody.thinkingConfig = {
        thinkingLevel: pConfig.thinkingLevel,
        includeThoughts: false,
      };
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
