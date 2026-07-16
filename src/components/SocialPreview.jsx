// src/components/SocialPreview.jsx
//
// Instagram / LinkedIn social-post preview — the rich one with real
// brand avatar, per-platform chrome, per-slide hover tools (edit /
// regenerate / download / fullscreen), and a fullscreen slide viewer.
//
// One source of truth. Used by:
//   - Content page (chat → side-preview panel after generating a post)
//   - AICEO chat ArtifactPanel (when an artifact has type='content_post')
//
// API: takes a `msg`-shaped object so both callers feed it the same way.
// Adapters live in the callers — they construct the msg shape from their
// own state.
//
// Required msg fields:
//   id            — string, for stable dummy social counts (likes etc.)
//   platform      — 'instagram' | 'linkedin' (anything else → instagram)
//   images        — [{ src, idx }]; idx not strictly required but stable
//                   sort order helps when slides arrive out-of-band
//   content       — caption text (string)
// Optional msg fields:
//   carouselPlan  — { caption?: string }; if carouselPlan.caption is set
//                   it overrides msg.content (Content-page-specific)
//   pendingImages — count of images still loading (for skeleton state)
//   editingIdx    — idx currently being regenerated (shows loading
//                   overlay on that slide)
//
// Callbacks (all optional):
//   onClose       — close the preview
//   onEdit(idx, src, instruction) — apply an inline edit
//   onRegenerate(idx)              — re-roll a slide
//   onFullscreen(idx)              — open SlideViewerModal at that slide
//   isGenerating  — bool; disables interactive tools while a slide is in
//                   flight
//   actionsSlot   — optional React node rendered in the bottom toolbar
//                   (Content uses this for download-zip / schedule /
//                   save-template buttons)
//   showHeader    — bool (default true). AICEO chat hides the header
//                   because ArtifactPanel has its own.

import { useState, useEffect, useMemo, useRef } from 'react';
import { X, ChevronLeft, ChevronRight, Pencil, RefreshCw, Maximize2, Download, Heart, MessageCircle, Send, Bookmark, Loader, Check } from 'lucide-react';
import './SocialPreview.css';

// True when a keydown originated inside a text-entry element — global
// keyboard-nav listeners must ignore those so arrow keys keep moving the
// cursor in the chat input / caption editor instead of flipping slides.
function isTypingTarget(e) {
  const t = e.target;
  if (!t) return false;
  const tag = (t.tagName || '').toLowerCase();
  return tag === 'input' || tag === 'textarea' || tag === 'select' || !!t.isContentEditable;
}

// Stable hash + range so the dummy social counts (likes, comments,
// reposts) stay put for the lifetime of a given message rather than
// re-rolling on every render.
export function stableHash(seed) {
  let h = 0;
  const s = String(seed || '');
  for (let i = 0; i < s.length; i++) h = ((h * 31) + s.charCodeAt(i)) | 0;
  return Math.abs(h);
}
export function stableRange(seed, min, max) {
  const h = stableHash(seed);
  return min + (h % Math.max(1, (max - min + 1)));
}

export default function SocialPreview({ msg, brandDna, user, onClose, onEdit, onRegenerate, onFullscreen, isGenerating, actionsSlot, showHeader = true, onContentChange, onUploadImages, onSchedule }) {
  const images = useMemo(() => [...(msg?.images || [])].sort((a, b) => (a.idx || 0) - (b.idx || 0)), [msg]);
  const [idx, setIdx] = useState(0);
  const [captionExpanded, setCaptionExpanded] = useState(false);
  const [editingSlideIdx, setEditingSlideIdx] = useState(null);
  const [editDraft, setEditDraft] = useState('');
  // Inline caption editing state. Same pattern as LinkedInPreview: a
  // contentEditable div seeded from the incoming caption prop, cursor
  // stability guaranteed by only re-syncing before the user has typed.
  // We only expose editing when the parent passed onContentChange —
  // read-only callers (calendar preview, etc.) render the fold as
  // before.
  const captionRef = useRef(null);
  const captionUserEdited = useRef(false);
  const [captionDirty, setCaptionDirty] = useState(false);
  const [captionSaved, setCaptionSaved] = useState(false);

  // Stable dummy counts for this post — derived from msg.id, so they
  // don't change as the user scrolls or re-renders.
  const dummyCounts = useMemo(() => ({
    likes: stableRange(msg?.id + ':likes', 240, 980),
    comments: stableRange(msg?.id + ':comments', 8, 54),
    shares: stableRange(msg?.id + ':shares', 3, 42),
    saves: stableRange(msg?.id + ':saves', 12, 120),
    liReactions: stableRange(msg?.id + ':lireac', 80, 420),
    liComments: stableRange(msg?.id + ':licmt', 6, 38),
    liReposts: stableRange(msg?.id + ':lirep', 2, 18),
  }), [msg?.id]);

  // Clamp idx if images list shrinks (e.g. a regenerate happens mid-view).
  useEffect(() => {
    if (idx > images.length - 1) setIdx(Math.max(0, images.length - 1));
  }, [images.length, idx]);

  // Seed the contentEditable when the incoming caption prop changes.
  // If the user hasn't typed, always mirror the prop (streaming). If they
  // HAVE typed, their draft normally wins — but an EXTERNAL caption
  // change (the AI shipped an update, or the preview re-bound to another
  // message/version) must override the stale draft; freezing forever was
  // the "edits only appear after refresh" bug. A save round-trip comes
  // back as an identical prop and is ignored (no cursor jump).
  useEffect(() => {
    if (!captionRef.current) return;
    const incoming = (msg?.carouselPlan?.caption) || (msg?.content) || '';
    if (captionUserEdited.current) {
      const current = captionRef.current.innerText ?? '';
      if (incoming === current) return;
      captionUserEdited.current = false;
      setCaptionDirty(false);
    }
    if (captionRef.current.innerText !== incoming) {
      captionRef.current.innerText = incoming;
    }
  }, [msg?.content, msg?.carouselPlan?.caption]);

  const handleCaptionInput = () => {
    captionUserEdited.current = true;
    setCaptionDirty(true);
    setCaptionSaved(false);
    // Expand automatically once the user starts typing so they see
    // the whole caption they're editing.
    if (!captionExpanded) setCaptionExpanded(true);
  };
  const saveCaption = () => {
    if (!captionRef.current || !onContentChange) return;
    const next = captionRef.current.innerText;
    onContentChange(next);
    setCaptionDirty(false);
    setCaptionSaved(true);
    setTimeout(() => setCaptionSaved(false), 1500);
  };

  // Keyboard nav + ESC. Scoped to when the panel is open — and ONLY when
  // the user isn't typing: this is a global window listener, so without
  // the guard, arrow keys pressed inside the chat input (or any
  // input/textarea/contentEditable, e.g. the caption editor) were
  // hijacked to flip slides instead of moving the cursor.
  useEffect(() => {
    const onKey = (e) => {
      if (isTypingTarget(e)) return;
      if (e.key === 'Escape' && onClose) { e.preventDefault(); onClose(); }
      else if (e.key === 'ArrowLeft') { e.preventDefault(); setIdx(i => Math.max(0, i - 1)); }
      else if (e.key === 'ArrowRight') { e.preventDefault(); setIdx(i => Math.min(images.length - 1, i + 1)); }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [images.length, onClose]);

  if (!msg) return null;
  const plan = msg.carouselPlan || {};
  const isLinkedin = msg.platform === 'linkedin';
  const panelClass = `content-ig-preview${isLinkedin ? ' content-ig-preview--linkedin' : ''}`;
  const previewLabel = isLinkedin ? 'LinkedIn preview' : 'Instagram preview';

  // Distinguish "actively waiting for images" from "this post simply has
  // no image". The skeleton (spinner + 'Preparing…') is appropriate for
  // the FIRST case but freezes forever in the second. AICEO chat creates
  // text-only IG posts via create_artifact with no image generation —
  // those previously got stuck on the skeleton.
  const planSlideCount = plan.slides?.length || 0;
  const pendingCount = msg.pendingImages || 0;
  const isGeneratingMedia = planSlideCount > 0 || pendingCount > 0;
  const captionText = plan.caption || msg.content || '';

  // Empty-state SKELETON — only while we're actually still waiting on
  // image generation. Otherwise drop through to the text-only render
  // below.
  if (images.length === 0 && isGeneratingMedia) {
    return (
      <div className={panelClass} role="dialog" aria-label={previewLabel}>
        {showHeader && (
          <div className="content-ig-preview-header">
            <span className="content-ig-preview-title">{previewLabel}</span>
            {onClose && (
              <button className="content-ig-preview-close" onClick={onClose} title="Close">
                <X size={16} />
              </button>
            )}
          </div>
        )}
        <div className="content-ig-feed">
          <div className="content-ig-post">
            <div className="content-ig-post-header">
              <div className="content-ig-avatar-ring">
                <div className="content-ig-avatar content-ig-avatar--fallback">·</div>
              </div>
              <span className="content-ig-username">preparing post…</span>
            </div>
            <div className="content-ig-media content-ig-media--skeleton">
              <Loader size={24} className="cs-spinner" />
              <div className="content-ig-skeleton-label">
                {planSlideCount > 0 ? `Rendering 0 / ${planSlideCount} slides…` : 'Preparing…'}
              </div>
            </div>
          </div>
        </div>
      </div>
    );
  }

  // Nothing to show at all — no images, no text, nothing pending.
  if (images.length === 0 && !captionText.trim()) {
    return null;
  }
  const current = images[idx] || null;
  const caption = captionText;
  // LinkedIn captions usually aren't truncated aggressively on feed; IG
  // folds at ~125 chars. Different fold per platform keeps the preview honest.
  const CAPTION_FOLD = isLinkedin ? 210 : 125;
  const captionIsLong = caption.length > CAPTION_FOLD;
  const captionDisplay = captionIsLong && !captionExpanded ? caption.slice(0, CAPTION_FOLD).trimEnd() + '…' : caption;

  const username = (brandDna?.brand_name || user?.name || 'your_brand').toLowerCase().replace(/\s+/g, '_').slice(0, 30);
  const displayName = brandDna?.brand_name || user?.name || 'Your Brand';
  const avatarUrl = brandDna?.logos?.find(l => l.isDefault)?.url || brandDna?.logos?.[0]?.url || brandDna?.logo_url || brandDna?.photo_urls?.[0];

  const slideIdx = current ? (current.idx ?? idx) : idx;
  const atStart = idx === 0;
  const atEnd = idx === Math.max(0, images.length - 1);
  const hasMedia = !!current;

  return (
    <div className={panelClass} role="dialog" aria-label={previewLabel}>
      {showHeader && (
        <div className="content-ig-preview-header">
          <span className="content-ig-preview-title">{previewLabel}</span>
          {onClose && (
            <button className="content-ig-preview-close" onClick={onClose} title="Close side preview (ESC)">
              <X size={16} />
            </button>
          )}
        </div>
      )}
      <div className="content-ig-feed">
        <div className="content-ig-post">
          {/* Post header */}
          <div className="content-ig-post-header">
            {isLinkedin ? (
              <>
                {avatarUrl
                  ? <img src={avatarUrl} alt="" className="content-ig-avatar-li" onError={(e) => { e.target.style.display = 'none'; }} />
                  : <div className="content-ig-avatar-li content-ig-avatar--fallback">{displayName.charAt(0).toUpperCase()}</div>
                }
                <div className="content-ig-li-names">
                  <div className="content-ig-li-name">{displayName}</div>
                  <div className="content-ig-li-sub">Author · Just now</div>
                </div>
                <span className="content-ig-more-menu">⋯</span>
              </>
            ) : (
              <>
                <div className="content-ig-avatar-ring">
                  {avatarUrl
                    ? <img src={avatarUrl} alt="" className="content-ig-avatar" onError={(e) => { e.target.style.display = 'none'; }} />
                    : <div className="content-ig-avatar content-ig-avatar--fallback">{username.charAt(0).toUpperCase()}</div>
                  }
                </div>
                <span className="content-ig-username">{username}</span>
                <span className="content-ig-dot-sep">·</span>
                <span className="content-ig-follow">Following</span>
                <span className="content-ig-more-menu">⋯</span>
              </>
            )}
          </div>

          {/* Media — aspect swaps per platform. Text-only posts (e.g.
              AICEO Instagram drafts created via create_artifact with
              no image generation) skip this block entirely so the user
              sees the caption + actions instead of a stuck spinner. */}
          {hasMedia && (
          <div className="content-ig-media">
            <img src={current.src} alt={`Slide ${idx + 1}`} className="content-ig-slide" />
            <div className="content-ig-counter">{idx + 1}/{images.length}</div>
            {!atStart && (
              <button className="content-ig-nav content-ig-nav--prev" onClick={() => setIdx(i => i - 1)} aria-label="Previous slide">
                <ChevronLeft size={20} />
              </button>
            )}
            {!atEnd && (
              <button className="content-ig-nav content-ig-nav--next" onClick={() => setIdx(i => i + 1)} aria-label="Next slide">
                <ChevronRight size={20} />
              </button>
            )}
            {/* Hover tools — only for this slide. Live actions, not fake icons. */}
            <div className="content-ig-tools">
              {onFullscreen && (
                <button className="content-ig-tool" onClick={() => onFullscreen(slideIdx)} title="Full screen" disabled={isGenerating}>
                  <Maximize2 size={14} />
                </button>
              )}
              {onEdit && (
                <button className="content-ig-tool" onClick={() => { setEditingSlideIdx(slideIdx); setEditDraft(''); }} title="Edit slide (keeps design)" disabled={isGenerating}>
                  <Pencil size={14} />
                </button>
              )}
              {onRegenerate && (
                <button className="content-ig-tool" onClick={() => onRegenerate(slideIdx)} title="Re-roll slide (same spec)" disabled={isGenerating}>
                  <RefreshCw size={14} />
                </button>
              )}
              <button
                type="button"
                className="content-ig-tool"
                title="Download this slide"
                onClick={async (e) => {
                  // <a download> is silently ignored for cross-origin URLs.
                  // Fetch as blob and trigger via an ephemeral object URL so
                  // downloads work whether src is a data URL or Supabase URL.
                  e.stopPropagation();
                  try {
                    const res = await fetch(current.src, { mode: 'cors' });
                    const blob = await res.blob();
                    const ext = (blob.type.split('/')[1] || 'png').split('+')[0];
                    const objectUrl = URL.createObjectURL(blob);
                    const a = document.createElement('a');
                    a.href = objectUrl;
                    a.download = `slide-${slideIdx + 1}.${ext}`;
                    document.body.appendChild(a);
                    a.click();
                    a.remove();
                    setTimeout(() => URL.revokeObjectURL(objectUrl), 2000);
                  } catch (err) {
                    console.error('Slide download failed:', err);
                    window.open(current.src, '_blank', 'noopener');
                  }
                }}
              >
                <Download size={14} />
              </button>
            </div>
            {/* Inline edit instruction overlay on the slide */}
            {editingSlideIdx === slideIdx && onEdit && (
              <div className="content-ig-edit-overlay" onClick={(e) => e.stopPropagation()}>
                <input
                  type="text"
                  className="content-ig-edit-input"
                  placeholder="Describe the change…"
                  value={editDraft}
                  autoFocus
                  disabled={isGenerating}
                  onChange={(e) => setEditDraft(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Escape') { setEditingSlideIdx(null); setEditDraft(''); }
                    if (e.key === 'Enter' && editDraft.trim() && !isGenerating) {
                      const draft = editDraft.trim();
                      setEditingSlideIdx(null);
                      setEditDraft('');
                      onEdit(slideIdx, current.src, draft);
                    }
                  }}
                />
                <button
                  type="button"
                  className="content-ig-edit-submit"
                  disabled={!editDraft.trim() || isGenerating}
                  onClick={() => {
                    const draft = editDraft.trim();
                    setEditingSlideIdx(null);
                    setEditDraft('');
                    onEdit(slideIdx, current.src, draft);
                  }}
                >
                  Apply
                </button>
                <button type="button" className="content-ig-edit-cancel" onClick={() => { setEditingSlideIdx(null); setEditDraft(''); }}>
                  <X size={14} />
                </button>
              </div>
            )}
            {/* Loading overlay while regen/edit runs for any slide */}
            {isGenerating && editingSlideIdx === null && (msg.editingIdx === slideIdx || (msg.pendingImages || 0) > 0) && (
              <div className="content-ig-loading-overlay">
                <Loader size={24} className="cs-spinner" />
              </div>
            )}
          </div>
          )}

          {/* Dots indicator — both platforms */}
          {images.length > 1 && (
            <div className="content-ig-indicator">
              {images.map((_, i) => (
                <span key={i} className={`content-ig-indicator-dot${i === idx ? ' content-ig-indicator-dot--active' : ''}`} />
              ))}
            </div>
          )}

          {/* Platform-specific caption + action row */}
          {isLinkedin ? (
            <>
              <div className="content-li-caption">
                {onContentChange ? (
                  <>
                    <div
                      className="content-li-caption-body content-caption-editable"
                      ref={captionRef}
                      contentEditable
                      suppressContentEditableWarning
                      onInput={handleCaptionInput}
                      onBlur={handleCaptionInput}
                      spellCheck
                    />
                    {(captionDirty || captionSaved) && (
                      <div className="content-caption-save-row">
                        <span className={`content-caption-save-status${captionSaved ? ' content-caption-save-status--ok' : ''}`}>
                          {captionSaved ? 'Saved' : 'Unsaved edits'}
                        </span>
                        <button
                          type="button"
                          className="content-caption-save-btn"
                          onClick={saveCaption}
                          disabled={!captionDirty}
                        >
                          {captionSaved ? <><Check size={12} /> Saved</> : 'Save'}
                        </button>
                      </div>
                    )}
                  </>
                ) : (
                  <span className="content-li-caption-body">
                    {captionDisplay}
                    {captionIsLong && !captionExpanded && (
                      <button className="content-li-more-link" onClick={() => setCaptionExpanded(true)}>…see more</button>
                    )}
                  </span>
                )}
              </div>
              {/* Branded LinkedIn reaction SVGs — same set used in LinkedInPreview component */}
              <div className="content-li-reactions">
                <div className="content-li-reactions-icons">
                  <span className="content-li-reaction-emoji">
                    <svg width="16" height="16" viewBox="0 0 16 16"><defs><linearGradient id="liCarLikeGrad" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor="#378FE9"/><stop offset="100%" stopColor="#0D6BC6"/></linearGradient></defs><circle cx="8" cy="8" r="8" fill="url(#liCarLikeGrad)"/><path d="M11.5 7.2h-2l.3-1.5c.1-.5-.1-1-.5-1.2-.2-.1-.5 0-.6.2L7 7.2H5.5c-.3 0-.5.2-.5.5v3.8c0 .3.2.5.5.5h4.8c.4 0 .7-.2.8-.6l.8-2.6c.2-.5-.2-1.1-.7-1.1L11.5 7.2z" fill="#fff"/></svg>
                  </span>
                  <span className="content-li-reaction-emoji">
                    <svg width="16" height="16" viewBox="0 0 16 16"><circle cx="8" cy="8" r="8" fill="#44712E"/><path d="M6 10.5l1-4.5 2 1.5L8 12l-2-1.5z" fill="#fff" opacity="0.9"/><path d="M5 5l1.5 1M10 4.5l-1 1.5M7.5 3.5V5M11 6l-1 .5" stroke="#FFC233" strokeWidth="1" strokeLinecap="round"/></svg>
                  </span>
                  <span className="content-li-reaction-emoji">
                    <svg width="16" height="16" viewBox="0 0 16 16"><circle cx="8" cy="8" r="8" fill="#DF704D"/><path d="M8 12s-3.5-2.2-3.5-4.5C4.5 6.1 5.6 5 7 5c.8 0 1.4.4 1.7.9h.1c.3-.5 1-.9 1.7-.9 1.4 0 2.5 1.1 2.5 2.5C13 9.8 9.5 12 8 12z" fill="#fff"/></svg>
                  </span>
                </div>
                <span className="content-li-reaction-count">{dummyCounts.liReactions.toLocaleString()}</span>
                <span className="content-li-reaction-sep">·</span>
                <span className="content-li-comments-count">{dummyCounts.liComments} comments · {dummyCounts.liReposts} reposts</span>
              </div>
              <div className="content-li-divider" />
              <div className="content-li-actions">
                <button className="content-li-action" type="button">
                  <svg width="22" height="22" viewBox="0 0 24 24" fill="none"><path d="M19.46 11l-3.91-3.91a7 7 0 01-1.69-2.74l-.49-1.47A2.76 2.76 0 0010.76 1 2.75 2.75 0 008 3.74v1.12a9.19 9.19 0 00.46 2.85L8.89 9H4.12A2.12 2.12 0 002 11.12a2.16 2.16 0 00.92 1.76A2.11 2.11 0 002 14.62a2.14 2.14 0 001.28 2 2 2 0 00-.28 1 2.12 2.12 0 002 2.12v.14A2.12 2.12 0 007.12 22h7.49a8.08 8.08 0 003.58-.84l.31-.16H21V11z" stroke="#666" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/></svg>
                  <span>Like</span>
                </button>
                <button className="content-li-action" type="button">
                  <svg width="22" height="22" viewBox="0 0 24 24" fill="none"><path d="M7 9h10M7 13h6M21 20l-4-4H5a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v8a2 2 0 01-2 2h-1v4z" stroke="#666" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/></svg>
                  <span>Comment</span>
                </button>
                <button className="content-li-action" type="button">
                  <svg width="22" height="22" viewBox="0 0 24 24" fill="none"><path d="M13.5 2L17 5.5 13.5 9" stroke="#666" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/><path d="M6 10.5V8a2.5 2.5 0 012.5-2.5H17" stroke="#666" strokeWidth="1.5" strokeLinecap="round"/><path d="M10.5 22L7 18.5 10.5 15" stroke="#666" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/><path d="M18 13.5V16a2.5 2.5 0 01-2.5 2.5H7" stroke="#666" strokeWidth="1.5" strokeLinecap="round"/></svg>
                  <span>Repost</span>
                </button>
                <button className="content-li-action" type="button">
                  <svg width="22" height="22" viewBox="0 0 24 24" fill="none"><path d="M21 3L14.5 21l-3-7.5L4 10.5 21 3z" stroke="#666" strokeWidth="1.5" strokeLinejoin="round"/></svg>
                  <span>Send</span>
                </button>
              </div>
              {/* Comment area — matches LinkedInPreview's styling */}
              <div className="content-li-comment-area">
                <div className="content-li-comment-avatar">
                  {avatarUrl
                    ? <img src={avatarUrl} alt="" onError={(e) => { e.target.style.display = 'none'; }} />
                    : <div className="content-li-comment-avatar-ph">{displayName.charAt(0).toUpperCase()}</div>
                  }
                </div>
                <div className="content-li-comment-input">
                  <span className="content-li-comment-placeholder">Add a comment...</span>
                </div>
              </div>
            </>
          ) : (
            <>
              {/* IG action row — icons with per-action counts (Reel-style) */}
              <div className="content-ig-actions">
                <div className="content-ig-action">
                  <Heart size={26} strokeWidth={1.8} />
                  <span className="content-ig-action-count">{dummyCounts.likes.toLocaleString()}</span>
                </div>
                <div className="content-ig-action">
                  <MessageCircle size={26} strokeWidth={1.8} />
                  <span className="content-ig-action-count">{dummyCounts.comments}</span>
                </div>
                <div className="content-ig-action">
                  <Send size={26} strokeWidth={1.8} />
                  <span className="content-ig-action-count">{dummyCounts.shares}</span>
                </div>
                <div className="content-ig-action content-ig-action-save">
                  <Bookmark size={26} strokeWidth={1.8} />
                </div>
              </div>
              {/* Caption with IG's 125-char fold */}
              <div className="content-ig-caption">
                <span className="content-ig-caption-username">{username}</span>
                {onContentChange ? (
                  <>
                    <div
                      className="content-ig-caption-body content-caption-editable"
                      ref={captionRef}
                      contentEditable
                      suppressContentEditableWarning
                      onInput={handleCaptionInput}
                      onBlur={handleCaptionInput}
                      spellCheck
                    />
                    {(captionDirty || captionSaved) && (
                      <div className="content-caption-save-row">
                        <span className={`content-caption-save-status${captionSaved ? ' content-caption-save-status--ok' : ''}`}>
                          {captionSaved ? 'Saved' : 'Unsaved edits'}
                        </span>
                        <button
                          type="button"
                          className="content-caption-save-btn"
                          onClick={saveCaption}
                          disabled={!captionDirty}
                        >
                          {captionSaved ? <><Check size={12} /> Saved</> : 'Save'}
                        </button>
                      </div>
                    )}
                  </>
                ) : (
                  <span className="content-ig-caption-body">
                    {captionDisplay}
                    {captionIsLong && !captionExpanded && (
                      <button className="content-ig-more-link" onClick={() => setCaptionExpanded(true)}>more</button>
                    )}
                  </span>
                )}
              </div>
              <div className="content-ig-meta">
                <span>View all {dummyCounts.comments} comments</span>
                <span className="content-ig-meta-time">Just now</span>
              </div>
              {/* IG-style comment input row — visual only */}
              <div className="content-ig-comment-row">
                <div className="content-ig-avatar-sm">
                  {avatarUrl
                    ? <img src={avatarUrl} alt="" onError={(e) => { e.target.style.display = 'none'; }} />
                    : <div className="content-ig-avatar-sm-fallback">{username.charAt(0).toUpperCase()}</div>
                  }
                </div>
                <span className="content-ig-comment-placeholder">Add a comment…</span>
                <span className="content-ig-comment-emoji">😊</span>
                <span className="content-ig-comment-more">⋯</span>
              </div>
            </>
          )}
        </div>
      </div>
      {/* Bottom toolbar — Download / Schedule / Save-as-template live here,
          same place you're looking at the post. Rendered by parent. */}
      {actionsSlot && <div className="content-ig-toolbar">{actionsSlot}</div>}
    </div>
  );
}

// Full-screen slide viewer modal. ESC closes (falls back to chat),
// arrow keys navigate between slides. Pencil/refresh icons route back
// into the parent handlers (they close the viewer first so the user
// sees the slide's inline state update in context).
export function SlideViewerModal({ image, position, total, onClose, onPrev, onNext, onEdit, onRegenerate, isGenerating }) {
  useEffect(() => {
    const onKey = (e) => {
      // Don't hijack keys while the user is typing (edit-instruction
      // inputs inside the viewer, or anything else that took focus).
      if (isTypingTarget(e)) return;
      if (e.key === 'Escape') { e.preventDefault(); onClose(); }
      else if (e.key === 'ArrowLeft') { e.preventDefault(); onPrev(); }
      else if (e.key === 'ArrowRight') { e.preventDefault(); onNext(); }
    };
    window.addEventListener('keydown', onKey);
    // Lock body scroll while modal is open.
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      window.removeEventListener('keydown', onKey);
      document.body.style.overflow = prevOverflow;
    };
  }, [onClose, onPrev, onNext]);
  const atStart = position <= 0;
  const atEnd = position >= total - 1;
  return (
    <div className="content-slide-viewer" onClick={onClose} role="dialog" aria-modal="true">
      <div className="content-slide-viewer-toolbar" onClick={(e) => e.stopPropagation()}>
        {onEdit && (
          <button className="content-slide-viewer-tool" onClick={onEdit} title="Edit this slide (keeps design locked)" disabled={isGenerating}>
            <Pencil size={16} />
          </button>
        )}
        {onRegenerate && (
          <button className="content-slide-viewer-tool" onClick={onRegenerate} title="Re-roll this slide (same spec, new render)" disabled={isGenerating}>
            <RefreshCw size={16} />
          </button>
        )}
      </div>
      <button className="content-slide-viewer-close" onClick={(e) => { e.stopPropagation(); onClose(); }} aria-label="Close">
        <X size={22} />
      </button>
      <div className="content-slide-viewer-counter">{position + 1} / {total}</div>
      {!atStart && (
        <button className="content-slide-viewer-nav content-slide-viewer-nav--prev" onClick={(e) => { e.stopPropagation(); onPrev(); }} aria-label="Previous slide">
          <ChevronLeft size={28} />
        </button>
      )}
      {!atEnd && (
        <button className="content-slide-viewer-nav content-slide-viewer-nav--next" onClick={(e) => { e.stopPropagation(); onNext(); }} aria-label="Next slide">
          <ChevronRight size={28} />
        </button>
      )}
      <img src={image.src} alt={`Slide ${position + 1}`} className="content-slide-viewer-img" onClick={(e) => e.stopPropagation()} />
      <div className="content-slide-viewer-hint">ESC to close · ← → to navigate</div>
    </div>
  );
}
