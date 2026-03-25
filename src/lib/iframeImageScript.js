// ── Injectable script for image resize/move/align inside newsletter/landing page iframes ──

export function getIframeImageScript() {
  return `
(function() {
  var style = document.createElement('style');
  style.textContent = [
    '.img-edit-wrap { position: relative; display: inline-block; cursor: move; }',
    '.img-edit-wrap:hover { outline: 2px solid #a78bfa; outline-offset: 2px; }',
    '.img-edit-wrap.img-editing { outline: 2px solid #a78bfa; outline-offset: 2px; }',
    '.img-resize-handle { position: absolute; width: 12px; height: 12px; background: #a78bfa; border: 2px solid #fff; border-radius: 2px; z-index: 10; box-shadow: 0 1px 4px rgba(0,0,0,0.3); }',
    '.img-resize-handle--se { bottom: -6px; right: -6px; cursor: nwse-resize; }',
    '.img-resize-handle--sw { bottom: -6px; left: -6px; cursor: nesw-resize; }',
    '.img-resize-handle--ne { top: -6px; right: -6px; cursor: nesw-resize; }',
    '.img-resize-handle--nw { top: -6px; left: -6px; cursor: nwse-resize; }',
    '.img-size-label { position: absolute; bottom: -24px; left: 50%; transform: translateX(-50%); background: #1a1a2e; color: #fff; font: 10px/1 Inter,system-ui,sans-serif; padding: 3px 6px; border-radius: 4px; white-space: nowrap; z-index: 10; pointer-events: none; }',
    '.img-align-bar { position: absolute; top: -32px; left: 50%; transform: translateX(-50%); display: none; gap: 2px; background: #1a1a2e; padding: 4px 6px; border-radius: 6px; z-index: 10; box-shadow: 0 2px 8px rgba(0,0,0,0.25); }',
    '.img-editing .img-align-bar { display: flex; }',
    '.img-editing .img-resize-handle { display: block; }',
    '.img-resize-handle { display: none; }',
    '.img-align-btn { background: none; border: none; color: #fff; cursor: pointer; padding: 3px 6px; border-radius: 3px; font: 11px/1 Inter,system-ui,sans-serif; opacity: 0.7; }',
    '.img-align-btn:hover, .img-align-btn.active { opacity: 1; background: rgba(255,255,255,0.15); }',
    '.img-align-btn svg { width: 14px; height: 14px; vertical-align: middle; }',
  ].join('\\n');
  document.head.appendChild(style);

  var activeWrap = null;

  var icons = {
    left: '<svg viewBox="0 0 16 16" fill="currentColor"><rect x="1" y="3" width="10" height="2" rx="1"/><rect x="1" y="7" width="14" height="2" rx="1"/><rect x="1" y="11" width="10" height="2" rx="1"/></svg>',
    center: '<svg viewBox="0 0 16 16" fill="currentColor"><rect x="3" y="3" width="10" height="2" rx="1"/><rect x="1" y="7" width="14" height="2" rx="1"/><rect x="3" y="11" width="10" height="2" rx="1"/></svg>',
    right: '<svg viewBox="0 0 16 16" fill="currentColor"><rect x="5" y="3" width="10" height="2" rx="1"/><rect x="1" y="7" width="14" height="2" rx="1"/><rect x="5" y="11" width="10" height="2" rx="1"/></svg>',
  };

  function wrapImage(img) {
    if (img.closest('.img-edit-wrap') || img.closest('.gen-shimmer')) return;
    if (img.naturalWidth && img.naturalWidth < 40) return;
    if (img.width && img.width < 40) return;

    var wrap = document.createElement('div');
    wrap.className = 'img-edit-wrap';
    var imgW = img.style.width || (img.getAttribute('width') ? img.getAttribute('width') + 'px' : null);
    if (!imgW && img.naturalWidth) {
      imgW = Math.min(img.naturalWidth, img.parentNode ? img.parentNode.offsetWidth : 600) + 'px';
    }
    wrap.style.width = imgW || '100%';
    wrap.style.maxWidth = '100%';

    var alignBar = document.createElement('div');
    alignBar.className = 'img-align-bar';
    ['left','center','right'].forEach(function(align) {
      var btn = document.createElement('button');
      btn.className = 'img-align-btn';
      btn.setAttribute('data-align', align);
      btn.innerHTML = icons[align];
      btn.title = align.charAt(0).toUpperCase() + align.slice(1);
      alignBar.appendChild(btn);
    });
    wrap.appendChild(alignBar);

    ['se','sw','ne','nw'].forEach(function(pos) {
      var handle = document.createElement('div');
      handle.className = 'img-resize-handle img-resize-handle--' + pos;
      handle.setAttribute('data-handle', pos);
      wrap.appendChild(handle);
    });

    var sizeLabel = document.createElement('div');
    sizeLabel.className = 'img-size-label';
    sizeLabel.style.display = 'none';
    wrap.appendChild(sizeLabel);

    img.parentNode.insertBefore(wrap, img);
    wrap.insertBefore(img, alignBar.nextSibling);
    img.style.width = '100%';
    img.style.height = 'auto';
    img.style.display = 'block';
    img.draggable = false;
    var parent = wrap.parentNode;
    if (parent && parent !== document.body) {
      parent.style.overflow = 'visible';
    }
  }

  function wrapAllImages() {
    var imgs = document.querySelectorAll('img[src]:not([src*="GENERATE"])');
    imgs.forEach(function(img) {
      if (img.complete) { wrapImage(img); }
      else { img.addEventListener('load', function() { wrapImage(img); }, { once: true }); }
    });
  }

  var observer = new MutationObserver(function() { wrapAllImages(); });
  observer.observe(document.body, { childList: true, subtree: true });
  wrapAllImages();

  document.addEventListener('mousedown', function(e) {
    var wrap = e.target.closest('.img-edit-wrap');
    var handle = e.target.closest('.img-resize-handle');
    var alignBtn = e.target.closest('.img-align-btn');

    if (alignBtn && activeWrap) {
      e.preventDefault();
      e.stopPropagation();
      var align = alignBtn.getAttribute('data-align');
      var parent = activeWrap.parentNode;
      if (align === 'left') {
        activeWrap.style.marginLeft = '0'; activeWrap.style.marginRight = 'auto';
        if (parent) parent.style.textAlign = 'left';
      } else if (align === 'center') {
        activeWrap.style.marginLeft = 'auto'; activeWrap.style.marginRight = 'auto';
        if (parent) parent.style.textAlign = 'center';
      } else {
        activeWrap.style.marginLeft = 'auto'; activeWrap.style.marginRight = '0';
        if (parent) parent.style.textAlign = 'right';
      }
      notifyChange(activeWrap);
      return;
    }

    if (handle && wrap) {
      e.preventDefault();
      e.stopPropagation();
      if (activeWrap && activeWrap !== wrap) activeWrap.classList.remove('img-editing');
      activeWrap = wrap;
      wrap.classList.add('img-editing');
      startResize(e, handle);
      return;
    }

    if (wrap) {
      e.preventDefault();
      e.stopPropagation();
      if (activeWrap && activeWrap !== wrap) activeWrap.classList.remove('img-editing');
      activeWrap = wrap;
      wrap.classList.add('img-editing');
    } else {
      if (activeWrap) { activeWrap.classList.remove('img-editing'); activeWrap = null; }
    }
  });

  function startResize(e, handle) {
    if (!activeWrap) return;
    var pos = handle.getAttribute('data-handle');
    var startX = e.clientX;
    var startW = activeWrap.offsetWidth;
    var sizeLabel = activeWrap.querySelector('.img-size-label');
    var maxW = activeWrap.parentNode ? activeWrap.parentNode.offsetWidth : 600;
    sizeLabel.style.display = 'block';

    function onMove(ev) {
      var dx = ev.clientX - startX;
      if (pos === 'sw' || pos === 'nw') dx = -dx;
      var newW = Math.max(80, Math.min(maxW, startW + dx));
      activeWrap.style.width = newW + 'px';
      sizeLabel.textContent = Math.round(newW) + 'px';
    }

    function onUp() {
      document.removeEventListener('mousemove', onMove);
      document.removeEventListener('mouseup', onUp);
      sizeLabel.style.display = 'none';
      notifyChange(activeWrap);
    }

    document.addEventListener('mousemove', onMove);
    document.addEventListener('mouseup', onUp);
  }

  function notifyChange(wrap) {
    var img = wrap.querySelector('img');
    if (!img) return;
    var src = img.getAttribute('src') || '';
    var w = wrap.style.width || '';
    var ml = wrap.style.marginLeft || '';
    var mr = wrap.style.marginRight || '';
    var parentAlign = wrap.parentNode ? wrap.parentNode.style.textAlign || '' : '';
    window.parent.postMessage({
      type: 'image-edit',
      src: src,
      width: w,
      marginLeft: ml,
      marginRight: mr,
      textAlign: parentAlign,
    }, '*');
  }
})();
`;
}
