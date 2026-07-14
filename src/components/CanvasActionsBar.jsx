// Canvas toolbar for AICEO chat's social-post artifacts (Instagram /
// Facebook / X / TikTok) — mirrors the button set LinkedInPreview builds
// inline. Passed to SocialPreview via its `actionsSlot` prop.
//
// Built as a separate component so ArtifactPanel doesn't balloon with
// popover state / positioning logic, and so future platforms plug in
// with a single addition here rather than another inline toolbar row.
//
// Props:
//   text          — post caption (string) — for the "Post to <platform>" click
//   images        — [{ src, idx }] — for the post request
//   platform      — 'instagram' | 'twitter' | 'tiktok' | 'facebook'
//   onUploadImages(files)                    — file picker → parent uploader
//   onPostToPlatform({ text, images })       — publish now
//   onSchedule({ text, images, date, time, platform }) — schedule for later
//   streaming     — bool; disables buttons while a stream is in flight
//   isConnected   — bool for the primary platform; when false, the post
//                   button becomes "Connect <platform>"
//   onConnect     — click handler for the connect state

import { useState, useRef, useEffect } from 'react';
import { Upload, CalendarClock, Send, Loader, Check, X, ExternalLink } from 'lucide-react';
import './CanvasActionsBar.css';

const PLATFORM_LABEL = {
  instagram: 'Instagram',
  twitter: 'X',
  tiktok: 'TikTok',
  facebook: 'Facebook',
};

export default function CanvasActionsBar({
  text,
  images,
  platform = 'instagram',
  onUploadImages,
  onPostToPlatform,
  onSchedule,
  streaming = false,
  isConnected = false,
  onConnect,
}) {
  const uploadRef = useRef(null);
  const scheduleBtnRef = useRef(null);
  const [scheduleOpen, setScheduleOpen] = useState(false);
  const [schedulePos, setSchedulePos] = useState({ left: 0, top: 0 });
  const [schedDate, setSchedDate] = useState('');
  const [schedTime, setSchedTime] = useState('');
  const [schedState, setSchedState] = useState('idle'); // idle|saving|saved|error
  const [schedError, setSchedError] = useState('');
  const [postState, setPostState] = useState('idle'); // idle|posting|posted|error
  const [postError, setPostError] = useState('');

  // Close popover on outside click / scroll / resize (same pattern as
  // LinkedInPreview — toolbar row has overflow:auto so we anchor with
  // position:fixed and dismiss on any layout shift).
  useEffect(() => {
    if (!scheduleOpen) return;
    const onDoc = (e) => {
      if (!scheduleBtnRef.current) return;
      const popover = document.querySelector('.cab-schedule-popover');
      if (popover && popover.contains(e.target)) return;
      if (scheduleBtnRef.current.contains(e.target)) return;
      setScheduleOpen(false);
    };
    const close = () => setScheduleOpen(false);
    document.addEventListener('mousedown', onDoc);
    window.addEventListener('resize', close);
    window.addEventListener('scroll', close, true);
    return () => {
      document.removeEventListener('mousedown', onDoc);
      window.removeEventListener('resize', close);
      window.removeEventListener('scroll', close, true);
    };
  }, [scheduleOpen]);

  const handleOpenSchedule = () => {
    if (!scheduleOpen && scheduleBtnRef.current) {
      const rect = scheduleBtnRef.current.getBoundingClientRect();
      const POP_W = 260;
      const POP_H = 220;
      const spaceAbove = rect.top;
      const top = spaceAbove > POP_H + 12 ? rect.top - POP_H - 8 : rect.bottom + 8;
      const left = Math.max(8, Math.min(rect.left, window.innerWidth - POP_W - 8));
      setSchedulePos({ left, top });
    }
    setScheduleOpen((o) => !o);
  };

  const handleSchedule = async () => {
    if (!schedDate || !schedTime || !onSchedule) return;
    setSchedState('saving');
    setSchedError('');
    try {
      await onSchedule({ text, images, date: schedDate, time: schedTime, platform });
      setSchedState('saved');
      setTimeout(() => {
        setScheduleOpen(false);
        setSchedState('idle');
      }, 1200);
    } catch (err) {
      setSchedState('error');
      setSchedError(err?.message || 'Failed to schedule');
    }
  };

  const handlePost = async () => {
    if (!onPostToPlatform || postState === 'posting' || postState === 'posted') return;
    setPostState('posting');
    setPostError('');
    try {
      await onPostToPlatform({ text, images });
      setPostState('posted');
    } catch (err) {
      setPostState('error');
      setPostError(err?.message || 'Failed to post');
    }
  };

  const platformLabel = PLATFORM_LABEL[platform] || 'Platform';

  // Rendered INSIDE SocialPreview's .content-ig-toolbar which is already
  // a flex row with 8px gap + horizontal scroll. Using a Fragment (not a
  // wrapper div) lets each of our buttons flow as a direct child of that
  // toolbar, so gap + overflow work naturally and no double-flex nesting.
  return (
    <>
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

      {/* Upload Image */}
      {onUploadImages && !streaming && (
        <button
          className="cab-btn"
          onClick={() => uploadRef.current?.click()}
          title="Upload images to this post"
        >
          <Upload size={14} /> Upload Image
        </button>
      )}

      {/* Schedule popover */}
      {onSchedule && !streaming && (
        <div className="cab-schedule-wrap">
          <button
            ref={scheduleBtnRef}
            className="cab-btn cab-btn--outline"
            onClick={handleOpenSchedule}
            disabled={streaming}
          >
            <CalendarClock size={14} /> Schedule
          </button>
          {scheduleOpen && (
            <div
              className="cab-schedule-popover"
              style={{ position: 'fixed', left: schedulePos.left, top: schedulePos.top }}
            >
              <div className="cab-schedule-title">Schedule for {platformLabel}</div>
              <label className="cab-schedule-label">
                Date
                <input
                  type="date"
                  className="cab-schedule-input"
                  value={schedDate}
                  onChange={(e) => setSchedDate(e.target.value)}
                  min={new Date().toISOString().split('T')[0]}
                />
              </label>
              <label className="cab-schedule-label">
                Time
                <input
                  type="time"
                  className="cab-schedule-input"
                  value={schedTime}
                  onChange={(e) => setSchedTime(e.target.value)}
                />
              </label>
              <button
                className="cab-btn cab-btn--primary cab-schedule-confirm"
                onClick={handleSchedule}
                disabled={schedState === 'saving' || !schedDate || !schedTime}
              >
                {schedState === 'saving' ? (
                  <><Loader size={14} className="cab-spin" /> Saving...</>
                ) : schedState === 'saved' ? (
                  <><Check size={14} /> Scheduled!</>
                ) : schedState === 'error' ? (
                  <><X size={14} /> Retry</>
                ) : (
                  <><CalendarClock size={14} /> Confirm Schedule</>
                )}
              </button>
              {schedState === 'error' && schedError && (
                <div className="cab-schedule-error" role="alert">
                  <span>{schedError}</span>
                  {/does not exist|missing permissions|cannot be loaded|invalid access token|expired|boosend|reconnect/i.test(schedError) && onConnect && (
                    <button
                      type="button"
                      className="cab-schedule-error-action"
                      onClick={() => onConnect?.()}
                    >
                      <ExternalLink size={12} /> Reconnect {platformLabel}
                    </button>
                  )}
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {/* Post to <platform> */}
      {onPostToPlatform && !streaming && (
        isConnected ? (
          <>
            <button
              className={`cab-btn cab-btn--${platform}`}
              onClick={handlePost}
              disabled={postState === 'posting' || postState === 'posted'}
            >
              {postState === 'posting' ? (
                <><Loader size={14} className="cab-spin" /> Posting...</>
              ) : postState === 'posted' ? (
                <><Check size={14} /> Posted!</>
              ) : postState === 'error' ? (
                <><X size={14} /> {postError.slice(0, 40) || 'Failed'}</>
              ) : (
                <><Send size={14} /> Post to {platformLabel}</>
              )}
            </button>
            {postState === 'error' && /does not exist|missing permissions|cannot be loaded|invalid access token|expired|boosend|reconnect/i.test(postError) && onConnect && (
              <button
                type="button"
                className="cab-btn cab-btn--connect"
                onClick={() => onConnect?.()}
                title={`Your ${platformLabel} token can't post to this account — reconnect to grant fresh permissions.`}
              >
                <ExternalLink size={14} /> Reconnect {platformLabel}
              </button>
            )}
          </>
        ) : (
          <button
            className="cab-btn cab-btn--connect"
            onClick={() => onConnect?.()}
            title={`Connect your ${platformLabel} account to post directly`}
          >
            <ExternalLink size={14} /> Connect {platformLabel}
          </button>
        )
      )}
    </>
  );
}
