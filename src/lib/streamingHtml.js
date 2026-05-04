// Shared streaming-preview parsing for the chat → live-canvas pipeline used
// across Marketing, AI CEO, and any other section that watches an agent
// stream and renders the HTML payload as it arrives.
//
// Why this exists: agents are instructed to return
//
//   {"type":"html","html":"<complete HTML>","summary":"..."}
//
// but model fidelity to that contract varies. Claude follows it strictly;
// Kimi (the Moonshot reroute behind the Mentor gateway) and other models
// often wrap the output in a markdown code fence with a chatty preamble:
//
//   Here's your landing page:
//   ```html
//   <!DOCTYPE html>...
//   ```
//
// or just emit raw HTML. The detector used to gate on the literal substring
// "type":"html" and missed every non-Claude shape, dumping the response into
// chat instead of the preview canvas. This module accepts all three shapes
// and returns the HTML body if anything plausibly HTML-shaped is in the text.

/**
 * Extract HTML from a (possibly partial) streaming agent response.
 *
 * Recognised shapes, tried in order:
 *   1. JSON envelope            — {"type":"html","html":"<escaped>","summary":"..."}
 *   2. Markdown code fence      — ```html\n<!DOCTYPE...\n```  (also bare ```)
 *   3. Raw document             — <!DOCTYPE html>... or <html>...
 *
 * Returns the unescaped HTML string when the result looks like a real HTML
 * document (contains <!DOCTYPE / <html / <body / <table / <style); otherwise
 * null. Designed to be called repeatedly as new chunks arrive — handles
 * partial input by extracting whatever's parseable so far rather than
 * waiting for a complete response.
 *
 * @param {string} text — raw stream chunk (or accumulated content)
 * @returns {string | null}
 */
export function extractStreamingHtml(text) {
  if (!text || typeof text !== 'string') return null;

  // 1. JSON envelope. Tolerates partial values: the regex anchors at end-of-
  //    string so it grabs an unfinished html field as well as a closed one.
  const jsonMatch = text.match(/"html"\s*:\s*"([\s\S]*?)(?:"\s*[,}]|$)/);
  if (jsonMatch) {
    let html = jsonMatch[1];
    // Strip an unfinished trailing `"}` or `"` that crept in from the regex.
    if (html.endsWith('"}')) html = html.slice(0, -2);
    else if (html.endsWith('"')) html = html.slice(0, -1);
    // Unescape JSON string escapes. JSON.parse is the strict path; a manual
    // replace covers partial input that JSON.parse would reject.
    try {
      html = JSON.parse('"' + html + '"');
    } catch {
      html = html
        .replace(/\\n/g, '\n')
        .replace(/\\t/g, '\t')
        .replace(/\\r/g, '\r')
        .replace(/\\"/g, '"')
        .replace(/\\\\/g, '\\');
    }
    if (looksLikeHtml(html)) return html;
  }

  // 2. Markdown code fence. Matches ```html / ```HTML / bare ``` followed by
  //    HTML-shaped content. Used by Kimi / GPT / open-source models that
  //    ignore "respond with ONLY valid JSON" directives.
  const fenceMatch = text.match(/```(?:html?|HTML)?\s*\n([\s\S]*?)(?:\n```|$)/);
  if (fenceMatch) {
    const inner = fenceMatch[1];
    if (looksLikeHtml(inner)) return inner;
  }

  // 3. Raw document. The model just emitted HTML with no wrapper at all.
  const docStart = text.indexOf('<!DOCTYPE');
  const htmlStart = docStart !== -1 ? docStart : text.indexOf('<html');
  if (htmlStart !== -1) {
    let extracted = text.slice(htmlStart);
    // If a closing markdown fence is present after the HTML, trim there.
    const fenceEnd = extracted.indexOf('\n```');
    if (fenceEnd !== -1) extracted = extracted.slice(0, fenceEnd);
    if (looksLikeHtml(extracted)) return extracted;
  }

  return null;
}

/**
 * Cheap predicate — does this chunk plausibly contain HTML worth attempting
 * to extract? Used as a gate so we don't run the parser on every chat token.
 * Matches the union of shapes recognised by extractStreamingHtml.
 *
 * @param {string} text
 * @returns {boolean}
 */
export function looksLikeHtmlChunk(text) {
  if (!text || typeof text !== 'string') return false;
  return (
    text.includes('"type":"html"') ||
    text.includes('"type": "html"') ||
    text.includes('"type":"newsletter"') ||
    text.includes('"type": "newsletter"') ||
    text.includes('"html":"') ||
    text.includes('"html": "') ||
    text.includes('<!DOCTYPE') ||
    text.includes('<html') ||
    text.includes('```html') ||
    text.includes('```HTML')
  );
}

function looksLikeHtml(text) {
  if (!text || text.length < 30) return false;
  return (
    text.includes('<!DOCTYPE') ||
    text.includes('<html') ||
    text.includes('<body') ||
    text.includes('<table') ||
    text.includes('<style')
  );
}
