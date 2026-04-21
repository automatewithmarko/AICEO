import { useState, useRef, useEffect } from 'react';
import { Copy, Check, ImagePlus, Loader, X, ChevronLeft, ChevronRight, Download, Upload, Send, CalendarClock, ExternalLink, Pencil, RefreshCw, Trash2, Plus, Maximize2 } from 'lucide-react';
import './LinkedInPreview.css';

export default function LinkedInPreview({ content, images, userName, userAvatar, onClose, onGenerateImage, isGeneratingImage, streaming, totalSlides, onUploadImages, onPostToLinkedIn, onSchedule, isLinkedInConnected, userSubtitle, followerCount, postAge, onEditSlide, onRegenerateSlide, onDeleteImage, isGenerating, actionsSlot, onContentChange, plan, onAddSlide, onRemoveSlide, onFullscreen }) {
  const [editedText, setEditedText] = useState(null);
  const [copied, setCopied] = useState(false);
  const [slideIdx, setSlideIdx] = useState(0);
  const [postState, setPostState] = useState('idle'); // idle | posting | posted | error
  const [postError, setPostError] = useState('');
  const [scheduleOpen, setScheduleOpen] = useState(false);
  const [schedDate, setSchedDate] = useState('');
  const [schedTime, setSchedTime] = useState('09:00');
  const [schedState, setSchedState] = useState('idle'); // idle | saving | saved
  // Edit overlay: which slide is being edited + the instruction draft
  const [editingSlideIdx, setEditingSlideIdx] = useState(null);
  const [editDraft, setEditDraft] = useState('');
  const uploadRef = useRef(null);
  const textRef = useRef(null);
  const schedRef = useRef(null);

  const text = editedText !== null ? editedText : (content || '');

  const sortedImages = images ? [...images].sort((a, b) => a.idx - b.idx) : [];
  const hasImage = sortedImages.length > 0;
  const isCarousel = totalSlides > 0;

  // Auto-advance to newly arrived slide
  const prevCountRef = useRef(0);
  useEffect(() => {
    if (sortedImages.length > prevCountRef.current && prevCountRef.current > 0) {
      setSlideIdx(sortedImages.length - 1);
    }
    prevCountRef.current = sortedImages.length;
  }, [sortedImages.length]);

  // Close schedule popover on outside click
  useEffect(() => {
    if (!scheduleOpen) return;
    const handleClick = (e) => {
      if (schedRef.current && !schedRef.current.contains(e.target)) {
        setScheduleOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, [scheduleOpen]);

  // Set default schedule date to tomorrow
  useEffect(() => {
    if (scheduleOpen && !schedDate) {
      const tomorrow = new Date();
      tomorrow.setDate(tomorrow.getDate() + 1);
      const yyyy = tomorrow.getFullYear();
      const mm = String(tomorrow.getMonth() + 1).padStart(2, '0');
      const dd = String(tomorrow.getDate()).padStart(2, '0');
      setSchedDate(`${yyyy}-${mm}-${dd}`);
    }
  }, [scheduleOpen, schedDate]);

  // Auto-dismiss posted state
  useEffect(() => {
    if (postState === 'posted') {
      const t = setTimeout(() => setPostState('idle'), 2000);
      return () => clearTimeout(t);
    }
  }, [postState]);

  // Auto-dismiss schedule saved state
  useEffect(() => {
    if (schedState === 'saved') {
      const t = setTimeout(() => {
        setSchedState('idle');
        setScheduleOpen(false);
      }, 1500);
      return () => clearTimeout(t);
    }
  }, [schedState]);

  const handleCopy = async () => {
    await navigator.clipboard.writeText(getCurrentText());
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  // Read the current text lazily from the DOM so we don't need to
  // re-render on every keystroke. The contentEditable div is no longer
  // a React-controlled input — React only seeds it when props change.
  const getCurrentText = () => {
    const fromDom = textRef.current?.innerText;
    if (typeof fromDom === 'string') return fromDom;
    return editedText !== null ? editedText : (content || '');
  };

  const handlePostToLinkedIn = async () => {
    if (!onPostToLinkedIn || postState === 'posting') return;
    setPostState('posting');
    setPostError('');
    try {
      await onPostToLinkedIn({ text: getCurrentText(), images: sortedImages });
      setPostState('posted');
    } catch (err) {
      setPostState('error');
      setPostError(err.message || 'Failed to post');
      setTimeout(() => setPostState('idle'), 3000);
    }
  };

  const handleSchedule = async () => {
    if (!onSchedule || schedState === 'saving' || !schedDate || !schedTime) return;
    setSchedState('saving');
    try {
      await onSchedule({ text: getCurrentText(), images: sortedImages, date: schedDate, time: schedTime, platform: 'linkedin' });
      setSchedState('saved');
    } catch {
      setSchedState('idle');
    }
  };

  // Sync the contentEditable's innerText only when the incoming stream
  // updates the content prop AND the user hasn't started typing yet.
  // After the first edit we stop overwriting, so the cursor never jumps.
  const userHasEditedRef = useRef(false);
  useEffect(() => {
    if (!textRef.current) return;
    if (userHasEditedRef.current) return;
    const incoming = content || '';
    if (textRef.current.innerText !== incoming) {
      textRef.current.innerText = incoming;
    }
  }, [content]);

  // Track whether the user has unsaved edits — shown as a "Save" badge
  // that pulses until they commit. Keystrokes don't touch state (to keep
  // the cursor stable); this flag flips in a useEffect via an input
  // listener attached to the div.
  const [dirty, setDirty] = useState(false);
  const [saved, setSaved] = useState(false);
  const handleTextInput = () => {
    userHasEditedRef.current = true;
    setDirty(true);
    setSaved(false);
  };
  const handleTextBlur = () => {
    if (!textRef.current) return;
    userHasEditedRef.current = true;
    const current = textRef.current.innerText;
    setEditedText(current);
  };
  const saveTextEdit = () => {
    if (!textRef.current) return;
    const current = textRef.current.innerText;
    setEditedText(current);
    setDirty(false);
    setSaved(true);
    if (onContentChange) onContentChange(current);
    setTimeout(() => setSaved(false), 2000);
  };

  // Build carousel slots: plan slides is authoritative (so blank slides
  // inserted by the user are preserved). Fall back to images + pending
  // count when no plan is available (e.g. a LinkedIn text-post gallery).
  const planSlides = plan?.slides || [];
  const totalDisplaySlots = planSlides.length > 0 ? planSlides.length : Math.max(totalSlides || 0, sortedImages.length);
  const imageByIdx = (idx) => sortedImages.find(img => img.idx === idx) || null;
  const slideSpec = (idx) => planSlides[idx] || null;
  const currentImage = imageByIdx(slideIdx);
  const currentSlide = slideSpec(slideIdx);
  const isBlankSlide = currentSlide && !currentImage && currentSlide.blank === true;
  const isPendingSlide = !currentImage && !isBlankSlide;
  // Middle-slide indices are removable (hook and CTA stay locked).
  const canRemoveCurrent = planSlides.length > 0 && slideIdx > 0 && slideIdx < planSlides.length - 1;

  return (
    <div className="li-preview">
      <div className="li-preview-header">
        <span className="li-preview-title">LinkedIn Preview</span>
        <button className="li-preview-close" onClick={onClose}><X size={18} /></button>
      </div>

      <div className="li-preview-body">
        <div className="li-card">
          {/* Post header */}
          <div className="li-card-header">
            <div className="li-avatar">
              {userAvatar ? (
                <img src={userAvatar} alt="" />
              ) : (
                <div className="li-avatar-placeholder">{(userName || 'U')[0]}</div>
              )}
            </div>
            <div className="li-meta">
              <div className="li-name-row">
                <span className="li-name">{userName || 'Your Name'}</span>
                <span className="li-degree">· 1st</span>
              </div>
              {(userSubtitle || followerCount) && (
                <span className="li-subtitle">
                  {userSubtitle || ''}
                  {userSubtitle && followerCount ? ' • ' : ''}
                  {followerCount ? `${followerCount} followers` : ''}
                </span>
              )}
              <span className="li-time">
                {postAge || 'Just now'} ·{' '}
                <svg width="12" height="12" viewBox="0 0 16 16" fill="currentColor" className="li-globe">
                  <path d="M8 1a7 7 0 110 14A7 7 0 018 1zM3.17 9H5.1c.1 1.63.44 3.04.95 3.9A6.02 6.02 0 013.17 9zm-.01-2c.38-1.86 1.49-3.44 3.03-4.37C5.68 3.76 5.2 5.37 5.1 7H3.16zm9.67 0h-1.95c-.1-1.63-.58-3.24-1.09-4.37A6.02 6.02 0 0112.83 7zM7.1 7c.12-1.8.64-3.57 1.18-4.46.4.68.85 2.35.97 4.46H7.1zm2.15 2H7.1c.12 1.56.5 3.06.9 3.93.54-.89.97-2.37 1.09-3.93h.16zm3.58 0h-1.95c-.1 1.63-.44 3.04-.95 3.9A6.02 6.02 0 0012.83 9z"/>
                </svg>
              </span>
            </div>
            <button className="li-more-btn">
              <svg width="20" height="20" viewBox="0 0 24 24" fill="#666">
                <circle cx="5" cy="12" r="2"/><circle cx="12" cy="12" r="2"/><circle cx="19" cy="12" r="2"/>
              </svg>
            </button>
          </div>

          {/* Post text.
              - While streaming: React seeds text via the useEffect above,
                so a plain div with a trailing cursor reads correctly.
              - After streaming: contentEditable with NO child — React
                never touches it, user edits stay local, blur commits to
                state. No cursor jumps. */}
          {streaming ? (
            <div className="li-card-text li-card-text--streaming" ref={textRef}>
              <span className="li-cursor" />
            </div>
          ) : (
            <>
              <div
                className="li-card-text"
                ref={textRef}
                contentEditable
                suppressContentEditableWarning
                onInput={handleTextInput}
                onBlur={handleTextBlur}
              />
              {(dirty || saved) && (
                <div className="li-card-save-row">
                  <span className={`li-card-save-status${saved ? ' li-card-save-status--ok' : ''}`}>
                    {saved ? 'Saved' : 'Unsaved edits'}
                  </span>
                  <button
                    type="button"
                    className="li-card-save-btn"
                    onClick={saveTextEdit}
                    disabled={!dirty}
                    title="Save your edits to the post"
                  >
                    {saved ? <><Check size={12} /> Saved</> : 'Save'}
                  </button>
                </div>
              )}
            </>
          )}

          {/* Carousel / Image area */}
          {(isCarousel || hasImage) && (
            <div className="li-card-image">
              {isCarousel ? (
                /* Carousel view — completed slides + pending/blank placeholders. */
                <>
                <div className="li-carousel">
                  {/* Current slot: completed image, blank placeholder, or pending */}
                  {currentImage ? (
                    <img src={currentImage.src} alt={`Slide ${slideIdx + 1}`} className="li-carousel-img" />
                  ) : isBlankSlide ? (
                    <div className="li-carousel-blank-slide">
                      <div className="li-carousel-blank-label">Blank slide</div>
                      <div className="li-carousel-blank-hint">Click <Pencil size={12} /> and describe what this slide should say — we'll render it in the locked design system.</div>
                      {onEditSlide && (
                        <button
                          type="button"
                          className="li-carousel-blank-edit-btn"
                          onClick={() => { setEditingSlideIdx(slideIdx); setEditDraft(''); }}
                          disabled={isGenerating}
                        >
                          <Pencil size={14} /> Describe this slide
                        </button>
                      )}
                    </div>
                  ) : (
                    <div className="li-carousel-pending-slide">
                      <Loader size={24} className="li-spin" />
                      <span>Generating slide {slideIdx + 1}...</span>
                    </div>
                  )}

                  {/* Nav arrows */}
                  {slideIdx > 0 && (
                    <button className="li-carousel-nav li-carousel-nav--left" onClick={() => setSlideIdx(i => i - 1)}>
                      <ChevronLeft size={20} />
                    </button>
                  )}
                  {slideIdx < totalDisplaySlots - 1 && (
                    <button className="li-carousel-nav li-carousel-nav--right" onClick={() => setSlideIdx(i => i + 1)}>
                      <ChevronRight size={20} />
                    </button>
                  )}

                  {/* Counter */}
                  <span className="li-carousel-counter">{slideIdx + 1} / {totalDisplaySlots}</span>

                  {/* Slide toolbar — fullscreen / edit / regenerate /
                      download / remove. Regen + download only on completed
                      slides; edit + remove apply to blank slides too. */}
                  <div className="li-carousel-tools">
                    {onFullscreen && currentImage && (
                      <button
                        type="button"
                        className="li-carousel-tool"
                        onClick={() => onFullscreen(slideIdx)}
                        disabled={isGenerating}
                        title="Full screen"
                      >
                        <Maximize2 size={14} />
                      </button>
                    )}
                    {onEditSlide && (
                      <button
                        type="button"
                        className="li-carousel-tool"
                        onClick={() => { setEditingSlideIdx(slideIdx); setEditDraft(''); }}
                        disabled={isGenerating}
                        title={isBlankSlide ? 'Describe this blank slide' : 'Edit this slide (design system stays locked)'}
                      >
                        <Pencil size={14} />
                      </button>
                    )}
                    {onRegenerateSlide && currentImage && (
                      <button
                        type="button"
                        className="li-carousel-tool"
                        onClick={() => onRegenerateSlide(slideIdx)}
                        disabled={isGenerating}
                        title="Re-roll this slide with the same spec"
                      >
                        <RefreshCw size={14} />
                      </button>
                    )}
                    {currentImage && (
                      <a
                        className="li-carousel-tool"
                        href={currentImage.src}
                        download={`slide-${slideIdx + 1}.png`}
                        title="Download slide"
                        onClick={(e) => e.stopPropagation()}
                      >
                        <Download size={14} />
                      </a>
                    )}
                    {onRemoveSlide && canRemoveCurrent && (
                      <button
                        type="button"
                        className="li-carousel-tool li-carousel-tool--danger"
                        onClick={() => {
                          if (confirm('Remove this slide?')) {
                            onRemoveSlide(slideIdx);
                            setSlideIdx(Math.max(0, slideIdx - 1));
                          }
                        }}
                        disabled={isGenerating}
                        title="Remove this slide"
                      >
                        <Trash2 size={14} />
                      </button>
                    )}
                  </div>
                  {/* Edit overlay — inline instruction input ON THE SLIDE */}
                  {editingSlideIdx === slideIdx && (
                    <div className="li-carousel-edit-overlay" onClick={(e) => e.stopPropagation()}>
                      <input
                        type="text"
                        className="li-carousel-edit-input"
                        placeholder={isBlankSlide ? 'Describe this slide (e.g. "Why most founders miss X…")' : 'Describe the change (e.g. bigger headline, swap icon...)'}
                        value={editDraft}
                        autoFocus
                        disabled={isGenerating}
                        onChange={(e) => setEditDraft(e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === 'Escape') { setEditingSlideIdx(null); setEditDraft(''); }
                          if (e.key === 'Enter' && editDraft.trim() && !isGenerating) {
                            const src = currentImage?.src || null;
                            setEditingSlideIdx(null);
                            onEditSlide(slideIdx, src, editDraft.trim());
                            setEditDraft('');
                          }
                        }}
                      />
                      <button
                        type="button"
                        className="li-carousel-edit-submit"
                        disabled={!editDraft.trim() || isGenerating}
                        onClick={() => {
                          const src = currentImage?.src || null;
                          setEditingSlideIdx(null);
                          onEditSlide(slideIdx, src, editDraft.trim());
                          setEditDraft('');
                        }}
                      >
                        Apply
                      </button>
                      <button type="button" className="li-carousel-edit-cancel" onClick={() => { setEditingSlideIdx(null); setEditDraft(''); }}>
                        <X size={14} />
                      </button>
                    </div>
                  )}
                  {/* Loading overlay during edit/regen generation for this slide */}
                  {isGenerating && editingSlideIdx === null && (
                    <div className="li-carousel-loading-overlay">
                      <Loader size={22} className="li-spin" />
                    </div>
                  )}

                  {/* Dots */}
                  <div className="li-carousel-dots">
                    {Array.from({ length: totalDisplaySlots }).map((_, i) => {
                      const hasImg = imageByIdx(i) !== null;
                      const spec = slideSpec(i);
                      const isBlank = !hasImg && spec?.blank === true;
                      return (
                        <span
                          key={i}
                          className={`li-carousel-dot${i === slideIdx ? ' li-carousel-dot--active' : ''}${!hasImg ? ' li-carousel-dot--pending' : ''}${isBlank ? ' li-carousel-dot--blank' : ''}`}
                          onClick={() => setSlideIdx(i)}
                        />
                      );
                    })}
                  </div>
                </div>
                {onAddSlide && planSlides.length > 0 && (
                  <div className="li-carousel-add-row">
                    <button
                      type="button"
                      className="li-carousel-add-btn"
                      onClick={() => {
                        // Insert after the current slide unless current is the
                        // CTA (locked at end) — then insert before it.
                        const anchor = slideIdx >= planSlides.length - 1 ? planSlides.length - 2 : slideIdx;
                        onAddSlide(anchor);
                        setSlideIdx(anchor + 1);
                      }}
                      disabled={isGenerating}
                      title="Insert a blank slide — describe it with the edit button"
                    >
                      <Plus size={14} /> Add slide after {slideIdx + 1}
                    </button>
                  </div>
                )}
                </>
              ) : hasImage ? (
                /* Single image (text post with generated image) */
                <div className="li-single-image-wrap">
                  <img src={sortedImages[0].src} alt="" />
                  {onDeleteImage && (
                    <button
                      type="button"
                      className="li-single-image-delete"
                      onClick={onDeleteImage}
                      title="Remove image"
                    >
                      <Trash2 size={14} />
                    </button>
                  )}
                </div>
              ) : null}
            </div>
          )}

          {/* Reactions bar */}
          <div className="li-reactions">
            <div className="li-reactions-left">
              <div className="li-reactions-icons">
                <span className="li-reaction-emoji li-reaction-emoji--like">
                  <svg width="16" height="16" viewBox="0 0 16 16"><defs><linearGradient id="likeGrad" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor="#378FE9"/><stop offset="100%" stopColor="#0D6BC6"/></linearGradient></defs><circle cx="8" cy="8" r="8" fill="url(#likeGrad)"/><path d="M11.5 7.2h-2l.3-1.5c.1-.5-.1-1-.5-1.2-.2-.1-.5 0-.6.2L7 7.2H5.5c-.3 0-.5.2-.5.5v3.8c0 .3.2.5.5.5h4.8c.4 0 .7-.2.8-.6l.8-2.6c.2-.5-.2-1.1-.7-1.1L11.5 7.2z" fill="#fff"/></svg>
                </span>
                <span className="li-reaction-emoji li-reaction-emoji--celebrate">
                  <svg width="16" height="16" viewBox="0 0 16 16"><circle cx="8" cy="8" r="8" fill="#44712E"/><path d="M6 10.5l1-4.5 2 1.5L8 12l-2-1.5z" fill="#fff" opacity="0.9"/><path d="M5 5l1.5 1M10 4.5l-1 1.5M7.5 3.5V5M11 6l-1 .5" stroke="#FFC233" strokeWidth="1" strokeLinecap="round"/></svg>
                </span>
                <span className="li-reaction-emoji li-reaction-emoji--love">
                  <svg width="16" height="16" viewBox="0 0 16 16"><circle cx="8" cy="8" r="8" fill="#DF704D"/><path d="M8 12s-3.5-2.2-3.5-4.5C4.5 6.1 5.6 5 7 5c.8 0 1.4.4 1.7.9h.1c.3-.5 1-.9 1.7-.9 1.4 0 2.5 1.1 2.5 2.5C13 9.8 9.5 12 8 12z" fill="#fff"/></svg>
                </span>
              </div>
              <span className="li-reactions-count">Be the first to react</span>
            </div>
          </div>

          <div className="li-divider" />

          {/* Action buttons */}
          <div className="li-actions">
            <button className="li-action">
              <svg width="24" height="24" viewBox="0 0 24 24" fill="none" className="li-action-icon"><path d="M19.46 11l-3.91-3.91a7 7 0 01-1.69-2.74l-.49-1.47A2.76 2.76 0 0010.76 1 2.75 2.75 0 008 3.74v1.12a9.19 9.19 0 00.46 2.85L8.89 9H4.12A2.12 2.12 0 002 11.12a2.16 2.16 0 00.92 1.76A2.11 2.11 0 002 14.62a2.14 2.14 0 001.28 2 2 2 0 00-.28 1 2.12 2.12 0 002 2.12v.14A2.12 2.12 0 007.12 22h7.49a8.08 8.08 0 003.58-.84l.31-.16H21V11z" stroke="#666" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/></svg>
              <span>Like</span>
            </button>
            <button className="li-action">
              <svg width="24" height="24" viewBox="0 0 24 24" fill="none" className="li-action-icon"><path d="M7 9h10M7 13h6M21 20l-4-4H5a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v8a2 2 0 01-2 2h-1v4z" stroke="#666" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/></svg>
              <span>Comment</span>
            </button>
            <button className="li-action">
              <svg width="24" height="24" viewBox="0 0 24 24" fill="none" className="li-action-icon"><path d="M13.5 2L17 5.5 13.5 9" stroke="#666" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/><path d="M6 10.5V8a2.5 2.5 0 012.5-2.5H17" stroke="#666" strokeWidth="1.5" strokeLinecap="round"/><path d="M10.5 22L7 18.5 10.5 15" stroke="#666" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/><path d="M18 13.5V16a2.5 2.5 0 01-2.5 2.5H7" stroke="#666" strokeWidth="1.5" strokeLinecap="round"/></svg>
              <span>Repost</span>
            </button>
            <button className="li-action">
              <svg width="24" height="24" viewBox="0 0 24 24" fill="none" className="li-action-icon"><path d="M21 3L14.5 21l-3-7.5L4 10.5 21 3z" stroke="#666" strokeWidth="1.5" strokeLinejoin="round"/></svg>
              <span>Send</span>
            </button>
          </div>

          {/* Comment area */}
          <div className="li-comment-area">
            <div className="li-comment-avatar">
              {userAvatar ? <img src={userAvatar} alt="" /> : <div className="li-comment-avatar-ph">{(userName || 'U')[0]}</div>}
            </div>
            <div className="li-comment-input">
              <span className="li-comment-placeholder">Add a comment...</span>
              <div className="li-comment-icons">
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#666" strokeWidth="1.5"><circle cx="12" cy="12" r="10"/><path d="M8 14s1.5 2 4 2 4-2 4-2M9 9h.01M15 9h.01"/></svg>
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#666" strokeWidth="1.5"><rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="8.5" cy="8.5" r="1.5"/><path d="M21 15l-5-5L5 21"/></svg>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Bottom toolbar — ONE row for everything: Download / Schedule /
          Template (carousel actions from actionsSlot) + Upload / Generate
          (text-post helpers) + Schedule / Post to LinkedIn (native).
          Horizontal scroll if it overflows the preview width. */}
      <div className="li-preview-toolbar">
        {!streaming && (
          <input
            ref={uploadRef}
            type="file"
            accept="image/*"
            multiple
            style={{ display: 'none' }}
            onChange={(e) => {
              const files = Array.from(e.target.files || []);
              if (files.length > 0 && onUploadImages) onUploadImages(files);
              e.target.value = '';
            }}
          />
        )}
        {!streaming && text.trim() && (
          <div className="li-toolbar-row li-toolbar-row--actions">
            {/* Carousel actions (Download / Schedule / Template) injected by parent */}
            {actionsSlot}
            {/* Upload: hidden for carousels (their slides are designed, not uploaded) */}
            {!isCarousel && (
              <button className="li-toolbar-btn" onClick={() => uploadRef.current?.click()}>
                <Upload size={14} /> Upload Image
              </button>
            )}
            {/* Generate image: only for text posts that don't have one yet */}
            {onGenerateImage && !isCarousel && (
              <button
                className="li-toolbar-btn"
                onClick={() => onGenerateImage(text)}
                disabled={isGeneratingImage || !text.trim()}
              >
                {isGeneratingImage ? <><Loader size={14} className="li-spin" /> Generating...</> : <><ImagePlus size={14} /> Generate Image</>}
              </button>
            )}
            {/* Schedule button with popover — only for text posts.
                Carousels get a richer draft/schedule/publish modal from
                the actionsSlot (CarouselActionsBar) above. Two Schedule
                buttons would be confusing. */}
            {!isCarousel && (
              <div className="li-schedule-wrap" ref={schedRef}>
                <button
                  className="li-toolbar-btn li-toolbar-btn--outline"
                  onClick={() => setScheduleOpen(o => !o)}
                  disabled={streaming}
                >
                  <CalendarClock size={14} /> Schedule
                </button>
                {scheduleOpen && (
                  <div className="li-schedule-popover">
                    <div className="li-schedule-title">Schedule post</div>
                    <label className="li-schedule-label">
                      Date
                      <input
                        type="date"
                        className="li-schedule-input"
                        value={schedDate}
                        onChange={(e) => setSchedDate(e.target.value)}
                        min={new Date().toISOString().split('T')[0]}
                      />
                    </label>
                    <label className="li-schedule-label">
                      Time
                      <input
                        type="time"
                        className="li-schedule-input"
                        value={schedTime}
                        onChange={(e) => setSchedTime(e.target.value)}
                      />
                    </label>
                    <button
                      className="li-toolbar-btn li-toolbar-btn--primary li-schedule-confirm"
                      onClick={handleSchedule}
                      disabled={schedState === 'saving' || !schedDate || !schedTime}
                    >
                      {schedState === 'saving' ? (
                        <><Loader size={14} className="li-spin" /> Saving...</>
                      ) : schedState === 'saved' ? (
                        <><Check size={14} /> Scheduled!</>
                      ) : (
                        <><CalendarClock size={14} /> Confirm Schedule</>
                      )}
                    </button>
                  </div>
                )}
              </div>
            )}

            {/* Post to LinkedIn button */}
            {isLinkedInConnected ? (
              <button
                className="li-toolbar-btn li-toolbar-btn--linkedin"
                onClick={handlePostToLinkedIn}
                disabled={postState === 'posting' || postState === 'posted'}
              >
                {postState === 'posting' ? (
                  <><Loader size={14} className="li-spin" /> Posting...</>
                ) : postState === 'posted' ? (
                  <><Check size={14} /> Posted!</>
                ) : postState === 'error' ? (
                  <><X size={14} /> {postError || 'Failed'}</>
                ) : (
                  <><Send size={14} /> Post to LinkedIn</>
                )}
              </button>
            ) : (
              <button
                className="li-toolbar-btn li-toolbar-btn--linkedin-connect"
                onClick={() => onPostToLinkedIn?.({ connect: true })}
              >
                <ExternalLink size={14} /> Connect LinkedIn
              </button>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
