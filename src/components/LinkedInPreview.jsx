import { useState, useRef, useEffect } from 'react';
import { Copy, Check, ImagePlus, Loader, X } from 'lucide-react';
import './LinkedInPreview.css';

export default function LinkedInPreview({ content, images, userName, userAvatar, onClose, onGenerateImage, isGeneratingImage }) {
  const [text, setText] = useState(content || '');
  const [copied, setCopied] = useState(false);
  const textRef = useRef(null);

  // Sync when new content arrives (streaming)
  useEffect(() => {
    if (content) setText(content);
  }, [content]);

  const handleCopy = async () => {
    await navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleTextInput = (e) => {
    setText(e.currentTarget.innerText);
  };

  const sortedImages = images ? [...images].sort((a, b) => a.idx - b.idx) : [];
  const hasImage = sortedImages.length > 0;

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
              <span className="li-name">{userName || 'Your Name'}</span>
              <span className="li-headline">Your headline here</span>
              <span className="li-time">Just now · <svg width="12" height="12" viewBox="0 0 16 16" fill="currentColor"><path d="M8 1a7 7 0 1 0 0 14A7 7 0 0 0 8 1zM3 8a5 5 0 1 1 10 0A5 5 0 0 1 3 8z"/><path d="M8 4a.75.75 0 0 1 .75.75v2.69l1.78 1.07a.75.75 0 1 1-.76 1.3l-2.14-1.29A.75.75 0 0 1 7.25 8V4.75A.75.75 0 0 1 8 4z"/></svg></span>
            </div>
          </div>

          {/* Post text — editable */}
          <div
            className="li-card-text"
            ref={textRef}
            contentEditable
            suppressContentEditableWarning
            onInput={handleTextInput}
          >
            {text}
          </div>

          {/* Post image */}
          {hasImage && (
            <div className="li-card-image">
              <img src={sortedImages[0].src} alt="" />
            </div>
          )}

          {/* Reactions bar */}
          <div className="li-reactions">
            <div className="li-reactions-icons">
              <span className="li-reaction">&#x1F44D;</span>
              <span className="li-reaction">&#x1F44F;</span>
              <span className="li-reaction">&#x2764;&#xFE0F;</span>
            </div>
            <span className="li-reactions-count">Be the first to react</span>
          </div>

          <div className="li-divider" />

          {/* Action buttons */}
          <div className="li-actions">
            <button className="li-action">
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                <path d="M14 9V5a3 3 0 0 0-3-3l-4 9v11h11.28a2 2 0 0 0 2-1.7l1.38-9a2 2 0 0 0-2-2.3H14z"/>
                <path d="M7 22H4a2 2 0 0 1-2-2v-7a2 2 0 0 1 2-2h3"/>
              </svg>
              Like
            </button>
            <button className="li-action">
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/>
              </svg>
              Comment
            </button>
            <button className="li-action">
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                <path d="M17 1l4 4-4 4"/>
                <path d="M3 11V9a4 4 0 0 1 4-4h14"/>
                <path d="M7 23l-4-4 4-4"/>
                <path d="M21 13v2a4 4 0 0 1-4 4H3"/>
              </svg>
              Repost
            </button>
            <button className="li-action">
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                <path d="M22 2L11 13"/>
                <path d="M22 2l-7 20-4-9-9-4 20-7z"/>
              </svg>
              Send
            </button>
          </div>
        </div>
      </div>

      {/* Bottom toolbar */}
      <div className="li-preview-toolbar">
        <button className="li-toolbar-btn" onClick={handleCopy}>
          {copied ? <><Check size={14} /> Copied</> : <><Copy size={14} /> Copy Text</>}
        </button>
        {onGenerateImage && (
          <button
            className="li-toolbar-btn li-toolbar-btn--primary"
            onClick={() => onGenerateImage(text)}
            disabled={isGeneratingImage || !text.trim()}
          >
            {isGeneratingImage ? <><Loader size={14} className="li-spin" /> Generating...</> : <><ImagePlus size={14} /> Generate Image</>}
          </button>
        )}
      </div>
    </div>
  );
}
