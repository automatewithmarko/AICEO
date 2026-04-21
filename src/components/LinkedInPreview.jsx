import { useState, useRef, useEffect } from 'react';
import { Copy, Check, ImagePlus, Loader, X, ChevronLeft, ChevronRight, Download, Upload, Send, CalendarClock, ExternalLink, Pencil, RefreshCw, Trash2 } from 'lucide-react';
import './LinkedInPreview.css';

export default function LinkedInPreview({ content, images, userName, userAvatar, onClose, onGenerateImage, isGeneratingImage, streaming, totalSlides, onUploadImages, onPostToLinkedIn, onSchedule, isLinkedInConnected, userSubtitle, followerCount, postAge, onEditSlide, onRegenerateSlide, onDeleteImage, isGenerating }) {
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
    await navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handlePostToLinkedIn = async () => {
    if (!onPostToLinkedIn || postState === 'posting') return;
    setPostState('posting');
    setPostError('');
    try {
      await onPostToLinkedIn({ text, images: sortedImages });
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
      await onSchedule({ text, images: sortedImages, date: schedDate, time: schedTime, platform: 'linkedin' });
      setSchedState('saved');
    } catch {
      setSchedState('idle');
    }
  };

  const handleTextInput = (e) => {
    setEditedText(e.currentTarget.innerText);
  };

  // Build carousel slots: completed images + pending placeholders
  const pendingCount = Math.max(0, (totalSlides || 0) - sortedImages.length);
  const totalDisplaySlots = sortedImages.length + pendingCount;

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

          {/* Post text */}
          {streaming ? (
            <div className="li-card-text li-card-text--streaming" ref={textRef}>
              {text}
              <span className="li-cursor" />
            </div>
          ) : (
            <div
              className="li-card-text"
              ref={textRef}
              contentEditable
              suppressContentEditableWarning
              onInput={handleTextInput}
            >
              {text}
            </div>
          )}

          {/* Carousel / Image area */}
          {(isCarousel || hasImage) && (
            <div className="li-card-image">
              {isCarousel ? (
                /* Carousel view — shows completed slides + pending placeholders */
                <div className="li-carousel">
                  {/* Current slot: either a completed image or a pending placeholder */}
                  {slideIdx < sortedImages.length ? (
                    <img src={sortedImages[slideIdx].src} alt={`Slide ${slideIdx + 1}`} className="li-carousel-img" />
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

                  {/* Slide toolbar — download / edit / regenerate. Only on completed slides. */}
                  {slideIdx < sortedImages.length && (
                    <div className="li-carousel-tools">
                      {onEditSlide && (
                        <button
                          type="button"
                          className="li-carousel-tool"
                          onClick={() => { setEditingSlideIdx(sortedImages[slideIdx].idx); setEditDraft(''); }}
                          disabled={isGenerating}
                          title="Edit this slide (design system stays locked)"
                        >
                          <Pencil size={14} />
                        </button>
                      )}
                      {onRegenerateSlide && (
                        <button
                          type="button"
                          className="li-carousel-tool"
                          onClick={() => onRegenerateSlide(sortedImages[slideIdx].idx)}
                          disabled={isGenerating}
                          title="Re-roll this slide with the same spec"
                        >
                          <RefreshCw size={14} />
                        </button>
                      )}
                      <a
                        className="li-carousel-tool"
                        href={sortedImages[slideIdx].src}
                        download={`slide-${slideIdx + 1}.png`}
                        title="Download slide"
                        onClick={(e) => e.stopPropagation()}
                      >
                        <Download size={14} />
                      </a>
                    </div>
                  )}
                  {/* Edit overlay — inline instruction input ON THE SLIDE */}
                  {editingSlideIdx === sortedImages[slideIdx]?.idx && (
                    <div className="li-carousel-edit-overlay" onClick={(e) => e.stopPropagation()}>
                      <input
                        type="text"
                        className="li-carousel-edit-input"
                        placeholder="Describe the change (e.g. bigger headline, swap icon...)"
                        value={editDraft}
                        autoFocus
                        disabled={isGenerating}
                        onChange={(e) => setEditDraft(e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === 'Escape') { setEditingSlideIdx(null); setEditDraft(''); }
                          if (e.key === 'Enter' && editDraft.trim() && !isGenerating) {
                            const idx = sortedImages[slideIdx].idx;
                            const src = sortedImages[slideIdx].src;
                            setEditingSlideIdx(null);
                            onEditSlide(idx, src, editDraft.trim());
                            setEditDraft('');
                          }
                        }}
                      />
                      <button
                        type="button"
                        className="li-carousel-edit-submit"
                        disabled={!editDraft.trim() || isGenerating}
                        onClick={() => {
                          const idx = sortedImages[slideIdx].idx;
                          const src = sortedImages[slideIdx].src;
                          setEditingSlideIdx(null);
                          onEditSlide(idx, src, editDraft.trim());
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
                    {Array.from({ length: totalDisplaySlots }).map((_, i) => (
                      <span
                        key={i}
                        className={`li-carousel-dot${i === slideIdx ? ' li-carousel-dot--active' : ''}${i >= sortedImages.length ? ' li-carousel-dot--pending' : ''}`}
                        onClick={() => setSlideIdx(i)}
                      />
                    ))}
                  </div>
                </div>
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

      {/* Bottom toolbar — single row */}
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
            {/* Schedule button with popover */}
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
