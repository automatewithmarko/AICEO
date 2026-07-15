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
import { Upload, CalendarClock, Send, Loader, Check, X, ExternalLink, Download } from 'lucide-react';
import './CanvasActionsBar.css';

const PLATFORM_LABEL = {
  instagram: 'Instagram',
  linkedin: 'LinkedIn',
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
  // Carousel hook headline — bundled as hook.txt in the ZIP download
  // (parity with /Content's ZIP export). Optional.
  hook = '',
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
  const [downloadState, setDownloadState] = useState('idle'); // idle|downloading|done|error

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

  // Load one image (data URL or CORS-safe remote URL) and return
  // { dataUrl, width, height, format } ready to hand to jsPDF.
  const loadImageForPdf = (src) => new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => {
      // Normalize to a data URL so jsPDF can consume both data: and
      // remote sources through the same path.
      let dataUrl = src;
      if (!src.startsWith('data:')) {
        try {
          const canvas = document.createElement('canvas');
          canvas.width = img.naturalWidth;
          canvas.height = img.naturalHeight;
          const ctx = canvas.getContext('2d');
          ctx.drawImage(img, 0, 0);
          dataUrl = canvas.toDataURL('image/jpeg', 0.92);
        } catch (canvasErr) {
          // CORS taint — fall back to the raw URL string and let jsPDF
          // try. If that fails, the caller marks the page failed and
          // continues with the rest.
          console.warn('[cab-download] canvas taint on', src?.slice(0, 60), canvasErr);
        }
      }
      const format = /^data:image\/png/i.test(dataUrl) ? 'PNG' : 'JPEG';
      resolve({ dataUrl, width: img.naturalWidth, height: img.naturalHeight, format });
    };
    img.onerror = () => reject(new Error('image load failed'));
    img.src = src;
  });

  const handleDownload = async () => {
    if (downloadState === 'downloading') return;
    setDownloadState('downloading');
    try {
      if (!images?.length) {
        setDownloadState('idle');
        return;
      }
      // Single image: direct download (no PDF wrapping — the user just
      // wants the image file for a single post).
      if (images.length === 1) {
        const img = images[0];
        const a = document.createElement('a');
        a.href = img.src;
        a.download = `${platform || 'post'}-image.${img.src.startsWith('data:image/png') ? 'png' : 'jpg'}`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        setDownloadState('done');
        setTimeout(() => setDownloadState('idle'), 1200);
        return;
      }
      // Multi-slide carousel: bundle as a PDF document, one slide per
      // page, sized to the source image so LinkedIn's document-carousel
      // upload accepts it natively.
      //
      // Slides are stored keyed by idx (not insertion order) — sort here
      // so the PDF pages read left-to-right.
      const ordered = [...images].sort((a, b) => (a.idx ?? 0) - (b.idx ?? 0));
      const loaded = [];
      for (const im of ordered) {
        if (!im?.src) continue;
        try {
          loaded.push(await loadImageForPdf(im.src));
        } catch (imgErr) {
          console.warn(`[cab-download] slide load failed:`, imgErr);
        }
      }
      if (loaded.length === 0) throw new Error('No slides could be loaded.');
      const { jsPDF } = await import('jspdf');
      const first = loaded[0];
      const isPortrait = first.height > first.width;
      const pdf = new jsPDF({
        orientation: isPortrait ? 'portrait' : (first.width === first.height ? 'portrait' : 'landscape'),
        unit: 'px',
        format: [first.width, first.height],
        hotfixes: ['px_scaling'],
      });
      pdf.addImage(first.dataUrl, first.format, 0, 0, first.width, first.height);
      for (let i = 1; i < loaded.length; i++) {
        const im = loaded[i];
        // Each page can carry its own size — supports mixed dimensions
        // (unlikely but robust). LinkedIn document carousels are always
        // portrait 1080x1440; Instagram carousels are 1080x1080.
        pdf.addPage([im.width, im.height], im.width > im.height ? 'landscape' : 'portrait');
        pdf.addImage(im.dataUrl, im.format, 0, 0, im.width, im.height);
      }
      const stamp = new Date().toISOString().slice(0, 10);
      pdf.save(`${platform || 'carousel'}-${stamp}.pdf`);
      setDownloadState('done');
      setTimeout(() => setDownloadState('idle'), 1200);
    } catch (err) {
      console.error('[cab-download] failed:', err);
      setDownloadState('error');
      setTimeout(() => setDownloadState('idle'), 1600);
    }
  };

  // ZIP download — every slide as an image file + caption.txt + hook.txt.
  // Parity with /Content's ZIP export (Phase 3, unified canvas actions):
  // users who post manually want the raw images, not a PDF.
  const [zipState, setZipState] = useState('idle'); // idle|downloading|done|error
  const handleDownloadZip = async () => {
    if (zipState === 'downloading' || !images?.length) return;
    setZipState('downloading');
    try {
      const { default: JSZip } = await import('jszip');
      const zip = new JSZip();
      const ordered = [...images].sort((a, b) => (a.idx ?? 0) - (b.idx ?? 0));
      let added = 0;
      for (let i = 0; i < ordered.length; i++) {
        const src = ordered[i]?.src;
        if (!src) continue;
        try {
          const blob = await (await fetch(src)).blob();
          const ext = /png/i.test(blob.type) ? 'png' : 'jpg';
          zip.file(`slide-${String(i + 1).padStart(2, '0')}.${ext}`, blob);
          added++;
        } catch (imgErr) {
          console.warn(`[cab-zip] slide ${i + 1} fetch failed:`, imgErr);
        }
      }
      if (added === 0) throw new Error('No slides could be loaded.');
      if (text) zip.file('caption.txt', text);
      if (hook) zip.file('hook.txt', hook.replace(/\{\{\/?accent\}\}/g, ''));
      const blob = await zip.generateAsync({ type: 'blob' });
      const a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      const stamp = new Date().toISOString().slice(0, 10);
      a.download = `${platform || 'carousel'}-${stamp}.zip`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      setTimeout(() => URL.revokeObjectURL(a.href), 5000);
      setZipState('done');
      setTimeout(() => setZipState('idle'), 1200);
    } catch (err) {
      console.error('[cab-zip] failed:', err);
      setZipState('error');
      setTimeout(() => setZipState('idle'), 1600);
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

      {/* Download — PDF (one page per slide) for carousels, single
          image otherwise. LinkedIn document carousels upload natively
          from PDF; Instagram users can screenshot pages if they need
          them back as images. */}
      {images?.length > 0 && !streaming && (
        <button
          className="cab-btn"
          onClick={handleDownload}
          disabled={downloadState === 'downloading'}
          title={images.length > 1 ? 'Download carousel as PDF' : 'Download image'}
        >
          {downloadState === 'downloading' ? (
            <><Loader size={14} className="cab-spin" /> Building PDF…</>
          ) : downloadState === 'done' ? (
            <><Check size={14} /> Downloaded</>
          ) : downloadState === 'error' ? (
            <><X size={14} /> Failed</>
          ) : (
            <><Download size={14} /> {images.length > 1 ? 'Download PDF' : 'Download'}</>
          )}
        </button>
      )}

      {/* Download ZIP — multi-slide carousels only. Slides as image files
          + caption.txt + hook.txt, matching /Content's ZIP export. */}
      {images?.length > 1 && !streaming && (
        <button
          className="cab-btn"
          onClick={handleDownloadZip}
          disabled={zipState === 'downloading'}
          title="Download all slides as images (ZIP with caption + hook)"
        >
          {zipState === 'downloading' ? (
            <><Loader size={14} className="cab-spin" /> Zipping…</>
          ) : zipState === 'done' ? (
            <><Check size={14} /> Downloaded</>
          ) : zipState === 'error' ? (
            <><X size={14} /> Failed</>
          ) : (
            <><Download size={14} /> Download ZIP</>
          )}
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
