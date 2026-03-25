// ── Injectable script for contentEditable text editing inside newsletter iframes ──
// Injected alongside the CTA link editor. Elements must have data-edit-id attributes.

export function getIframeEditScript() {
  return `
(function() {
  var editing = false;
  var originalHtml = '';
  var activeEl = null;
  window.__textEditing = false;

  // ── Styles ──
  var style = document.createElement('style');
  style.textContent = [
    '[data-edit-id] { transition: outline 0.15s ease; }',
    '[data-edit-id]:hover:not([contenteditable="true"]) { outline: 1px dashed rgba(124,58,237,0.35); outline-offset: 2px; cursor: text; }',
    '[data-edit-id][contenteditable="true"] { outline: 2px solid rgba(124,58,237,0.7); outline-offset: 2px; min-height: 1em; }',
    '.edit-disabled [data-edit-id]:hover { outline: none !important; cursor: default !important; }',
  ].join('\\n');
  document.head.appendChild(style);

  // ── Click to edit ──
  document.addEventListener('click', function(e) {
    if (document.body.classList.contains('edit-disabled')) return;
    // Skip clicks on image editing elements — let the image resize/move script handle those
    if (e.target.closest('.img-edit-wrap') || e.target.closest('.img-resize-handle') || e.target.closest('.img-align-bar')) return;
    var el = e.target.closest('[data-edit-id]');
    if (!el || el === activeEl) return;

    // Finish any current edit first
    if (activeEl) finishEdit(activeEl);

    e.preventDefault();
    e.stopPropagation();
    startEdit(el);
  }, true);

  function startEdit(el) {
    activeEl = el;
    editing = true;
    window.__textEditing = true;
    originalHtml = el.innerHTML;
    el.setAttribute('contenteditable', 'true');
    el.focus();

    // Place cursor at end
    var range = document.createRange();
    range.selectNodeContents(el);
    range.collapse(false);
    var sel = window.getSelection();
    sel.removeAllRanges();
    sel.addRange(range);
  }

  function finishEdit(el) {
    if (!el) return;
    el.setAttribute('contenteditable', 'false');
    var newHtml = normalizeHtml(el.innerHTML);
    var editId = el.getAttribute('data-edit-id');

    if (newHtml !== originalHtml && editId != null) {
      window.parent.postMessage({
        type: 'text-edit',
        editId: editId,
        oldHtml: originalHtml,
        newHtml: newHtml
      }, '*');
    }

    editing = false;
    window.__textEditing = false;
    activeEl = null;
    originalHtml = '';
  }

  function cancelEdit(el) {
    if (!el) return;
    el.innerHTML = originalHtml;
    el.setAttribute('contenteditable', 'false');
    editing = false;
    window.__textEditing = false;
    activeEl = null;
    originalHtml = '';
  }

  // ── Blur → save ──
  document.addEventListener('focusout', function(e) {
    var el = e.target.closest('[data-edit-id][contenteditable="true"]');
    if (el) {
      // Small delay to allow click on another editable element
      setTimeout(function() { if (activeEl === el) finishEdit(el); }, 100);
    }
  });

  // ── Keyboard ──
  document.addEventListener('keydown', function(e) {
    if (!activeEl) return;

    if (e.key === 'Escape') {
      e.preventDefault();
      cancelEdit(activeEl);
      return;
    }

    if (e.key === 'Enter' && !e.shiftKey) {
      var tag = activeEl.tagName;
      // Single-line elements: Enter saves
      if (/^(H[1-6]|A|SPAN|BUTTON)$/.test(tag)) {
        e.preventDefault();
        finishEdit(activeEl);
      }
      // Multi-line elements (P, TD, LI, DIV): Enter inserts <br> (default contentEditable behavior)
    }
  });

  // ── Paste as plain text ──
  document.addEventListener('paste', function(e) {
    if (!activeEl) return;
    e.preventDefault();
    var text = (e.clipboardData || window.clipboardData).getData('text/plain');
    document.execCommand('insertText', false, text);
  });

  // ── Normalize browser contentEditable quirks ──
  function normalizeHtml(html) {
    // Chrome wraps lines in <div>, Safari uses <br>
    html = html.replace(/<div><br\\s*\\/?><\\/div>/gi, '<br>');
    html = html.replace(/<div>(.*?)<\\/div>/gi, '$1<br>');
    // Remove trailing <br>
    html = html.replace(/(<br\\s*\\/?>)+$/i, '');
    return html;
  }

  // ── Parent can disable/enable editing ──
  window.addEventListener('message', function(e) {
    if (e.data && e.data.type === 'set-editable') {
      if (e.data.enabled === false) {
        if (activeEl) cancelEdit(activeEl);
        document.body.classList.add('edit-disabled');
      } else {
        document.body.classList.remove('edit-disabled');
      }
    }
  });
})();
`;
}
