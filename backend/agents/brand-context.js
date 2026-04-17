// Shared brand DNA context builder for all agents
// Converts a brand_dna DB row into prompt context

export function buildBrandContext(brandDna) {
  if (!brandDna) return '';

  const parts = ['\n=== BRAND DNA  -  USE ALL OF THESE ==='];

  // Colors
  if (brandDna.colors) {
    const c = brandDna.colors;
    parts.push('\n### Colors');
    if (c.primary) parts.push(`- Primary: ${c.primary} (CTAs, accents, highlights, links)`);
    if (c.secondary) parts.push(`- Secondary: ${c.secondary} (secondary buttons, subtle backgrounds, borders)`);
    if (c.text) parts.push(`- Text: ${c.text} (body text and headings)`);
    if (c.accent) parts.push(`- Accent: ${c.accent}`);
  }

  // Fonts
  if (brandDna.main_font || brandDna.secondary_font) {
    parts.push('\n### Typography');
    if (brandDna.main_font) parts.push(`- Main font: "${brandDna.main_font}" (headings and display text)`);
    if (brandDna.secondary_font) parts.push(`- Secondary font: "${brandDna.secondary_font}" (body text)`);
  }

  // Logo(s)
  const logos = brandDna.logos?.length ? brandDna.logos : (brandDna.logo_url ? [{ url: brandDna.logo_url, name: 'Logo', isDefault: true }] : []);
  if (logos.length > 0) {
    parts.push('\n### Logo');
    const defaultLogo = logos.find(l => l.isDefault) || logos[0];
    parts.push(`- Default logo "${defaultLogo.name}": ${defaultLogo.url}`);
    parts.push('- Use the default logo as <img> in headers/navbars and footers');
    if (logos.length > 1) {
      logos.filter(l => !l.isDefault).forEach(l => parts.push(`- Alternate logo "${l.name}": ${l.url}`));
      parts.push('- Use alternate logos only when the user specifically requests them by name');
    }
  }

  // Photos
  const photos = brandDna.photo_urls || [];
  if (photos.length > 0) {
    parts.push('\n### Brand Photos (reference images of the user/product)');
    parts.push('Use these ONLY where the actual user, their team, or their product should appear (testimonials, about, social proof). Do NOT use as hero images  -  use {{GENERATE:prompt}} for conceptual hero visuals instead.');
    photos.forEach((url, i) => {
      parts.push(`- Photo ${i + 1}: ${url}`);
    });
    parts.push('- Insert as <img src="URL"> tags when contextually appropriate');
    parts.push('- ALWAYS use width:100%;height:auto;  -  NEVER set a fixed pixel height');
    parts.push('- If a photo doesn\'t fit the section context, skip it  -  don\'t force it in');
  }

  // Brand description
  if (brandDna.description) {
    parts.push('\n### Brand Description');
    parts.push(brandDna.description);
  }

  // Documents  -  extracted text for copywriting context
  if (brandDna.documents && typeof brandDna.documents === 'object') {
    const docs = Object.values(brandDna.documents);
    const withText = docs.filter(d => d.extracted_text);
    if (withText.length > 0) {
      parts.push('\n### Brand Documents  -  USE FOR COPY');
      parts.push('Extract value propositions, features, testimonials, stats, and terminology:');
      for (const doc of withText) {
        parts.push(`\n--- Document: "${doc.name}" ---`);
        parts.push(doc.extracted_text.slice(0, 4000));
      }
    }
  }

  return parts.join('\n');
}

// Appendix for agents (landing-page, newsletter, squeeze-page, etc.) with the
// user's product catalog — full names, every pricing tier, checkout links,
// photo URLs, and descriptions. Lets agents wire real product assets into the
// generated HTML instead of relying on whatever the CEO happened to quote in
// the task_description.
export function buildProductsContext(products) {
  if (!Array.isArray(products) || products.length === 0) return '';

  const parts = [`\n=== PRODUCTS (${products.length}) — USE REAL ASSETS ===`];
  parts.push('For any product the user asks you to market, prefer these real assets over placeholders or {{GENERATE}}. Photo URLs drop straight into <img src="...">. Checkout URLs go in CTA buttons.');

  products.forEach((p, idx) => {
    parts.push(`\n--- Product ${idx + 1}: ${p.name || 'Untitled'} ---`);
    if (p.type) parts.push(`Type: ${p.type}`);

    const priceLines = [];
    if (Array.isArray(p.pricing_options) && p.pricing_options.length) {
      p.pricing_options.forEach((opt) => {
        const dollars = opt.price_cents != null ? (opt.price_cents / 100).toFixed(2) : null;
        if (dollars != null) {
          const mode = opt.price_mode === 'monthly' ? '/month' : ' one-time';
          priceLines.push(`$${dollars}${mode}${opt.payment_link_url ? ` — checkout: ${opt.payment_link_url}` : ''}`);
        }
      });
    } else if (p.price_cents != null) {
      priceLines.push(`$${(p.price_cents / 100).toFixed(2)}`);
    } else if (p.price != null) {
      priceLines.push(`$${p.price}`);
    }
    if (priceLines.length === 1) parts.push(`Price: ${priceLines[0]}`);
    else if (priceLines.length > 1) parts.push(`Pricing tiers:\n${priceLines.map((l) => `  - ${l}`).join('\n')}`);

    if (p.payment_link_url && !priceLines.some((l) => l.includes(p.payment_link_url))) {
      parts.push(`Checkout URL: ${p.payment_link_url}`);
    }

    const photoUrls = (Array.isArray(p.photos) ? p.photos : [])
      .map((ph) => (typeof ph === 'string' ? ph : ph?.url))
      .filter(Boolean);
    if (p.image_url && !photoUrls.includes(p.image_url)) photoUrls.unshift(p.image_url);
    if (photoUrls.length) {
      parts.push(`Photos (${photoUrls.length}) — use as <img src="URL">:`);
      photoUrls.forEach((u, i) => parts.push(`  - Photo ${i + 1}: ${u}`));
    }

    if (p.description) parts.push(`Description: ${p.description.slice(0, 1500)}`);
  });

  return parts.join('\n');
}
