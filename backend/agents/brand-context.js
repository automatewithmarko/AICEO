// Shared brand DNA context builder for all agents
// Converts a brand_dna DB row into prompt context

export function buildBrandContext(brandDna) {
  if (!brandDna) return '';

  const parts = ['\n=== BRAND DNA — USE ALL OF THESE ==='];

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

  // Logo
  if (brandDna.logo_url) {
    parts.push('\n### Logo');
    parts.push(`- Logo URL: ${brandDna.logo_url}`);
    parts.push('- Use as <img> in headers/navbars and footers');
  }

  // Photos
  const photos = brandDna.photo_urls || [];
  if (photos.length > 0) {
    parts.push('\n### Brand Photos');
    parts.push('These photos are various sizes and aspect ratios. You MUST handle them responsively:');
    photos.forEach((url, i) => {
      const usage = i === 0 ? '(hero/header image)' :
                    i === 1 ? '(features/about section)' :
                    i === 2 ? '(testimonials or supporting section)' :
                    '(use where appropriate)';
      parts.push(`- Photo ${i + 1}: ${url} ${usage}`);
    });
    parts.push('- Insert as <img src="URL"> tags, NOT CSS backgrounds');
    parts.push('- ALWAYS use width:100%;height:auto; — NEVER set a fixed pixel height (it distorts images)');
    parts.push('- For logos: max-height:44px;width:auto;');
    parts.push('- For hero images: width:100%;height:auto;display:block;border-radius:8px;');
    parts.push('- If a photo doesn\'t fit the context, skip it — don\'t force it in');
  }

  // Brand description
  if (brandDna.description) {
    parts.push('\n### Brand Description');
    parts.push(brandDna.description);
  }

  // Documents — extracted text for copywriting context
  if (brandDna.documents && typeof brandDna.documents === 'object') {
    const docs = Object.values(brandDna.documents);
    const withText = docs.filter(d => d.extracted_text);
    if (withText.length > 0) {
      parts.push('\n### Brand Documents — USE FOR COPY');
      parts.push('Extract value propositions, features, testimonials, stats, and terminology:');
      for (const doc of withText) {
        parts.push(`\n--- Document: "${doc.name}" ---`);
        parts.push(doc.extracted_text.slice(0, 4000));
      }
    }
  }

  return parts.join('\n');
}
