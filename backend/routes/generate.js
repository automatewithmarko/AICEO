import { Router } from 'express';
import { createClient } from '@supabase/supabase-js';

const router = Router();

const GEMINI_MODEL = 'gemini-3.1-flash-image-preview';
const GEMINI_BASE = 'https://generativelanguage.googleapis.com/v1beta';

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

const PLATFORM_IMAGE_RULES = {
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
- Aspect ratio: PORTRAIT 9:16 (1080x1920) — the image MUST be tall vertical portrait format
- This is an Instagram Story frame — full-screen vertical content shot on an iPhone

TEXT OVERLAY — MUST LOOK EXACTLY LIKE INSTAGRAM'S NATIVE TEXT TOOL:
Instagram has a specific text sticker UI. When you open Instagram Stories and tap the "Aa" text button, then tap the "A" button to cycle through styles, the "Classic" style looks like this:
- A solid opaque WHITE rectangular pill/block sits on top of the photo
- Inside the white block: BLACK text in a clean sans-serif font (SF Pro / Helvetica Neue style)
- The white block has rounded corners (about 8-10px radius), with horizontal padding (~16px) and vertical padding (~8px)
- The block is exactly the width of the text content plus padding — it does NOT stretch edge to edge
- The block casts NO shadow, has NO border, NO gradient — just a flat solid white rectangle
- The text inside is regular weight (not bold, not thin), clean, simple, perfectly legible
- The text block FLOATS on top of the photo — it is clearly a separate UI element overlaid on the image, NOT burned into or blended with the photo
- Position the text block in the center or upper-third of the frame
- Multiple lines of text = one white block containing all lines, NOT separate blocks per line
- The white block should look like it was placed there by the Instagram app's text editor, not designed in Photoshop
- This is the SINGLE MOST IMPORTANT visual element — if the text doesn't look like Instagram's native text sticker, the image is wrong
- Reference: Google "Instagram story text classic style" to see exactly what this looks like

DO NOT:
- Do NOT use fancy fonts, script fonts, serif fonts, or decorative typography
- Do NOT render text with gradients, shadows, outlines, 3D effects, or neon glow
- Do NOT burn text directly into the photo without the white background block
- Do NOT use colored text blocks — the block is WHITE with BLACK text (classic style)
- Do NOT stretch the text block to fill the width of the image

PHOTO STYLE:
- iPhone quality — natural mobile photography, casual but polished
- Real lighting, real textures, real environments, slight natural grain
- NOT overly produced studio shots
- NO illustrations, NO SVG, NO flat design, NO vector art
- The photo should look like something a creator actually shot on their phone
- NO landscape images, NO square crops`,

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

// Fetch an image URL and return as base64 inline data for Gemini
async function fetchImageAsBase64(url) {
  try {
    const res = await fetch(url);
    if (!res.ok) return null;
    const buffer = await res.arrayBuffer();
    const base64 = Buffer.from(buffer).toString('base64');
    const contentType = res.headers.get('content-type') || 'image/jpeg';
    return { inlineData: { data: base64, mimeType: contentType } };
  } catch {
    return null;
  }
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

    // Resolve brand data — use provided data or fetch from DB as fallback
    let brand = brandData;
    if (!brand || (!brand.logoUrl && !brand.photoUrls?.length)) {
      // Try to fetch brand data from DB using the authenticated user
      const userId = req.user?.id;
      if (userId && userId !== 'anonymous') {
        console.log(`[generate/image] No brand data from frontend — fetching from DB for user ${userId}`);
        const { data: dbBrandRows } = await supabase
          .from('brand_dna')
          .select('logo_url, photo_urls, colors, main_font')
          .eq('user_id', userId)
          .order('updated_at', { ascending: true })
          .limit(1);
        const dbBrand = dbBrandRows?.[0] || null;
        if (dbBrand) {
          brand = {
            logoUrl: dbBrand.logo_url || null,
            photoUrls: dbBrand.photo_urls || [],
            colors: dbBrand.colors || {},
            mainFont: dbBrand.main_font || null,
          };
          console.log(`[generate/image] Brand data from DB — logo: ${!!brand.logoUrl}, photos: ${brand.photoUrls.length}, colors: ${JSON.stringify(brand.colors)}`);
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

    console.log(`[generate/image] Platform: ${platform || 'default'}, Parts: ${requestParts.length} (1 text + ${requestParts.length - 1} images), Prompt: ${prompt.slice(0, 120)}...`);

    const geminiRes = await fetch(
      `${GEMINI_BASE}/models/${GEMINI_MODEL}:generateContent?key=${apiKey}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [{
            parts: requestParts,
          }],
          generationConfig: {
            responseModalities: ['TEXT', 'IMAGE'],
          },
        }),
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
    console.log(`[generate/image] Error: ${err.message}`);
    res.status(500).json({ error: err.message });
  }
});

// ─── Upload base64 image to Supabase storage ───
router.post('/api/generate/upload-image', async (req, res) => {
  const { base64, mimeType, filename } = req.body;
  if (!base64) return res.status(400).json({ error: 'base64 is required' });

  try {
    const ext = (mimeType || 'image/png').split('/')[1] || 'png';
    const name = filename || `nl-${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${ext}`;
    const buffer = Buffer.from(base64, 'base64');

    const { data, error } = await supabase.storage
      .from('newsletter-images')
      .upload(name, buffer, {
        contentType: mimeType || 'image/png',
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
