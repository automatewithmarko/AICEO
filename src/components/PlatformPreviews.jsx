// Dedicated canvas previews for X (Twitter) posts and YouTube thumbnails
// (founder feedback #3b, 2026-07-24: X / YouTube content was rendering in
// the Instagram-chrome canvas). Deliberately NEW components — the working
// Instagram/LinkedIn previews (SocialPreview / LinkedInPreview) stay
// byte-untouched; Content.jsx routes here by panelMsg.platform.
import { useState, useRef, useEffect } from 'react';
import { X as XIcon, MessageCircle, Repeat2, Heart, BarChart2, Bookmark, Share } from 'lucide-react';
import './PlatformPreviews.css';

function useEditableText(value, onChange) {
  const ref = useRef(null);
  const edited = useRef(false);
  useEffect(() => {
    if (!ref.current) return;
    if (!edited.current && ref.current.innerText !== (value || '')) {
      ref.current.innerText = value || '';
    }
  }, [value]);
  const handlers = {
    ref,
    contentEditable: !!onChange,
    suppressContentEditableWarning: true,
    onInput: () => { edited.current = true; },
    onBlur: () => {
      if (!onChange || !ref.current) return;
      edited.current = false;
      onChange(ref.current.innerText);
    },
  };
  return handlers;
}

function PreviewShell({ label, onClose, children }) {
  return (
    <div className="pfp-panel" role="dialog" aria-label={label}>
      <div className="pfp-header">
        <span className="pfp-title">{label}</span>
        {onClose && (
          <button className="pfp-close" onClick={onClose} title="Close side preview (ESC)">
            <XIcon size={16} />
          </button>
        )}
      </div>
      <div className="pfp-feed">{children}</div>
    </div>
  );
}

export function XPreview({ content, images = [], brandDna, user, onClose, onContentChange, pendingImages = 0 }) {
  const displayName = brandDna?.brand_name || user?.name || 'Your Brand';
  const handle = displayName.toLowerCase().replace(/\s+/g, '').slice(0, 15);
  const avatarUrl = brandDna?.logos?.find((l) => l.isDefault)?.url || brandDna?.logos?.[0]?.url || brandDna?.logo_url || brandDna?.photo_urls?.[0];
  const text = useEditableText(content, onContentChange);
  const img = images.find((i) => i?.src);
  return (
    <PreviewShell label="X post preview" onClose={onClose}>
      <div className="pfp-x-card">
        <div className="pfp-x-head">
          {avatarUrl
            ? <img src={avatarUrl} alt="" className="pfp-x-avatar" onError={(e) => { e.target.style.display = 'none'; }} />
            : <div className="pfp-x-avatar pfp-avatar-fallback">{displayName.charAt(0).toUpperCase()}</div>}
          <div className="pfp-x-names">
            <span className="pfp-x-name">{displayName}</span>
            <span className="pfp-x-handle">@{handle} · now</span>
          </div>
          <span className="pfp-more">⋯</span>
        </div>
        <div className="pfp-x-text" {...text} />
        {(img || pendingImages > 0) && (
          <div className="pfp-x-media">
            {img
              ? <img src={img.src} alt="" />
              : <div className="pfp-media-skeleton" />}
          </div>
        )}
        <div className="pfp-x-actions">
          <span><MessageCircle size={16} /> 12</span>
          <span><Repeat2 size={16} /> 34</span>
          <span><Heart size={16} /> 128</span>
          <span><BarChart2 size={16} /> 5.2K</span>
          <span><Bookmark size={16} /></span>
          <span><Share size={16} /></span>
        </div>
      </div>
    </PreviewShell>
  );
}

export function YouTubePreview({ content, title, images = [], brandDna, user, onClose, onContentChange, pendingImages = 0 }) {
  const channelName = brandDna?.brand_name || user?.name || 'Your Channel';
  const avatarUrl = brandDna?.logos?.find((l) => l.isDefault)?.url || brandDna?.logos?.[0]?.url || brandDna?.logo_url || brandDna?.photo_urls?.[0];
  // The video title is the first non-empty line of the caption/copy.
  const videoTitle = (title || (content || '').split('\n').find((l) => l.trim()) || 'Your video title').trim();
  const [expanded, setExpanded] = useState(false);
  const img = images.find((i) => i?.src);
  const desc = (content || '').split('\n').slice(1).join('\n').trim();
  const titleEdit = useEditableText(videoTitle, onContentChange ? (next) => {
    const rest = (content || '').split('\n').slice(1).join('\n');
    onContentChange(rest ? `${next}\n${rest}` : next);
  } : null);
  return (
    <PreviewShell label="YouTube thumbnail preview" onClose={onClose}>
      <div className="pfp-yt-card">
        <div className="pfp-yt-thumb">
          {img
            ? <img src={img.src} alt="" />
            : <div className="pfp-media-skeleton">{pendingImages > 0 ? '' : 'No thumbnail yet'}</div>}
          <span className="pfp-yt-duration">12:34</span>
        </div>
        <div className="pfp-yt-meta">
          {avatarUrl
            ? <img src={avatarUrl} alt="" className="pfp-yt-avatar" onError={(e) => { e.target.style.display = 'none'; }} />
            : <div className="pfp-yt-avatar pfp-avatar-fallback">{channelName.charAt(0).toUpperCase()}</div>}
          <div className="pfp-yt-text">
            <div className="pfp-yt-title" {...titleEdit} />
            <div className="pfp-yt-channel">{channelName}</div>
            <div className="pfp-yt-stats">24K views · 1 hour ago</div>
          </div>
        </div>
        {desc && (
          <div className={`pfp-yt-desc${expanded ? ' pfp-yt-desc--open' : ''}`} onClick={() => setExpanded((v) => !v)}>
            {expanded ? desc : `${desc.slice(0, 140)}${desc.length > 140 ? '… more' : ''}`}
          </div>
        )}
      </div>
    </PreviewShell>
  );
}
