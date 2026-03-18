// ── Newsletter inline text editing utilities ──
// Tags editable text elements with data-edit-id for contentEditable editing in iframes.
// The canonical HTML state (canvasHtml / artifact.content) NEVER contains these IDs.

const EDITABLE_TAGS = new Set(['H1','H2','H3','H4','H5','H6','P','LI','SPAN','BUTTON','A','TD','TH','DIV']);

// Elements that are structural / should NOT be editable even if they match tag names
function shouldSkip(el) {
  // Skip elements that only contain other elements (no direct text)
  const hasDirectText = Array.from(el.childNodes).some(n => n.nodeType === 3 && n.textContent.trim().length > 0);
  const hasEditableChildren = Array.from(el.children).some(c => EDITABLE_TAGS.has(c.tagName));
  // If element has editable children but no direct text, skip it (let children be editable instead)
  if (!hasDirectText && hasEditableChildren) return true;
  // Skip empty elements
  if (el.textContent.trim().length === 0) return true;
  // Skip elements that are just wrappers for images
  if (el.children.length === 1 && el.children[0].tagName === 'IMG') return true;
  return false;
}

/**
 * Injects data-edit-id attributes onto editable text elements.
 * Returns { taggedHtml, editMap } where editMap is Map<id, { tag, originalInner }>
 * The editMap is used by applyTextEdit to locate elements in the original HTML.
 */
export function injectEditIds(html) {
  if (!html) return { taggedHtml: html, editMap: new Map() };

  const parser = new DOMParser();
  const doc = parser.parseFromString(html, 'text/html');
  const editMap = new Map();
  let idCounter = 0;

  const walker = doc.createTreeWalker(doc.body, NodeFilter.SHOW_ELEMENT);
  const elements = [];
  while (walker.nextNode()) elements.push(walker.currentNode);

  for (const el of elements) {
    if (!EDITABLE_TAGS.has(el.tagName)) continue;
    if (shouldSkip(el)) continue;
    // Don't tag elements inside other tagged elements (avoid double-editing)
    if (el.closest('[data-edit-id]')) continue;

    const id = String(idCounter++);
    el.setAttribute('data-edit-id', id);
    editMap.set(id, { tag: el.tagName, originalInner: el.innerHTML });
  }

  // Serialize back — preserve the full document structure
  const taggedHtml = doc.documentElement.outerHTML;
  return { taggedHtml, editMap };
}

/**
 * Applies a text edit from the iframe back to the original (un-tagged) HTML.
 * Uses text content matching to find and replace the right element.
 */
export function applyTextEdit(originalHtml, editMap, editId, newInnerHtml) {
  if (!originalHtml || !editMap) return originalHtml;

  const entry = editMap.get(editId);
  if (!entry) return originalHtml;

  const oldInner = entry.originalInner;
  if (!oldInner || oldInner === newInnerHtml) return originalHtml;

  // Parse the original HTML, find the element by matching tag + innerHTML
  const parser = new DOMParser();
  const doc = parser.parseFromString(originalHtml, 'text/html');

  const candidates = doc.querySelectorAll(entry.tag);
  let target = null;

  for (const el of candidates) {
    if (el.innerHTML.trim() === oldInner.trim()) {
      target = el;
      break;
    }
  }

  if (!target) {
    // Fallback: try matching by text content
    const oldText = new DOMParser().parseFromString(oldInner, 'text/html').body.textContent.trim();
    for (const el of candidates) {
      if (el.textContent.trim() === oldText) {
        target = el;
        break;
      }
    }
  }

  if (!target) return originalHtml; // Can't find it, return unchanged

  target.innerHTML = newInnerHtml;

  // Serialize — we need to return the same structure as the original
  // The original might be a full document or a fragment
  if (originalHtml.includes('<!DOCTYPE') || originalHtml.includes('<html')) {
    return '<!DOCTYPE html>\n' + doc.documentElement.outerHTML;
  }
  return doc.body.innerHTML;
}
