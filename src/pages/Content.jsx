import { useState, useRef, useCallback, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Send, Image, FileText, Link2, ChevronRight, ChevronLeft, X, Plus, History } from 'lucide-react';
import './Content.css';

const platforms = [
  {
    id: 'instagram',
    name: 'Instagram',
    color: '#E4405F',
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className="content-pill-icon">
        <rect x="2" y="2" width="20" height="20" rx="5" />
        <circle cx="12" cy="12" r="5" />
        <circle cx="17.5" cy="6.5" r="1" fill="currentColor" stroke="none" />
      </svg>
    ),
  },
  {
    id: 'facebook',
    name: 'Facebook',
    color: '#1877F2',
    icon: (
      <svg viewBox="0 0 24 24" fill="currentColor" className="content-pill-icon">
        <path d="M18 2h-3a5 5 0 00-5 5v3H7v4h3v8h4v-8h3l1-4h-4V7a1 1 0 011-1h3V2z" />
      </svg>
    ),
  },
  {
    id: 'linkedin',
    name: 'LinkedIn',
    color: '#0A66C2',
    icon: (
      <svg viewBox="0 0 24 24" fill="currentColor" className="content-pill-icon">
        <path d="M16 8a6 6 0 016 6v7h-4v-7a2 2 0 00-4 0v7h-4v-7a6 6 0 016-6z" />
        <rect x="2" y="9" width="4" height="12" />
        <circle cx="4" cy="4" r="2" />
      </svg>
    ),
  },
  {
    id: 'youtube',
    name: 'YouTube',
    color: '#FF0000',
    icon: (
      <svg viewBox="0 0 24 24" fill="currentColor" className="content-pill-icon">
        <path d="M23.498 6.186a3.016 3.016 0 00-2.122-2.136C19.505 3.546 12 3.546 12 3.546s-7.505 0-9.377.504A3.017 3.017 0 00.502 6.186C0 8.07 0 12 0 12s0 3.93.502 5.814a3.016 3.016 0 002.122 2.136c1.871.504 9.376.504 9.376.504s7.505 0 9.377-.504a3.015 3.015 0 002.122-2.136C24 15.93 24 12 24 12s0-3.93-.502-5.814zM9.545 15.568V8.432L15.818 12l-6.273 3.568z" />
      </svg>
    ),
  },
  {
    id: 'x',
    name: 'X',
    color: '#000000',
    icon: (
      <svg viewBox="0 0 24 24" fill="currentColor" className="content-pill-icon">
        <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z" />
      </svg>
    ),
  },
  {
    id: 'tiktok',
    name: 'TikTok',
    color: '#010101',
    icon: (
      <svg viewBox="0 0 24 24" fill="currentColor" className="content-pill-icon">
        <path d="M19.59 6.69a4.83 4.83 0 01-3.77-4.25V2h-3.45v13.67a2.89 2.89 0 01-2.88 2.5 2.89 2.89 0 01-2.89-2.89 2.89 2.89 0 012.89-2.89c.28 0 .54.04.79.1v-3.5a6.37 6.37 0 00-.79-.05A6.34 6.34 0 003.15 15a6.34 6.34 0 006.34 6.34 6.34 6.34 0 006.34-6.34V8.72a8.2 8.2 0 004.76 1.52V6.79a4.84 4.84 0 01-1-.1z" />
      </svg>
    ),
  },
];

const SOCIAL_URL_PATTERN = /^https?:\/\/(www\.)?(instagram\.com|facebook\.com|fb\.watch|linkedin\.com|youtube\.com|youtu\.be|x\.com|twitter\.com|tiktok\.com)\//i;

export default function Content() {
  const navigate = useNavigate();
  const [selectedPlatform, setSelectedPlatform] = useState('instagram');
  const [input, setInput] = useState('');
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [photos, setPhotos] = useState([]);
  const [documents, setDocuments] = useState([]);
  const [socialUrls, setSocialUrls] = useState([]);
  const [socialError, setSocialError] = useState('');
  const [socialHover, setSocialHover] = useState(false);
  const [photoDragOver, setPhotoDragOver] = useState(false);
  const [docDragOver, setDocDragOver] = useState(false);
  const [tooltip, setTooltip] = useState({ text: '', x: 0, y: 0, visible: false });
  const [contextSheetOpen, setContextSheetOpen] = useState(false);
  const [showPasteBtn, setShowPasteBtn] = useState(false);
  const longPressTimer = useRef(null);

  const photoInputRef = useRef(null);
  const docInputRef = useRef(null);
  const socialZoneRef = useRef(null);

  const activeIndex = platforms.findIndex((p) => p.id === selectedPlatform);
  const activePlatform = platforms[activeIndex];

  const handleKeyDown = (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
    }
  };

  const autoResize = (e) => {
    const el = e.target;
    el.style.height = 'auto';
    el.style.height = el.scrollHeight + 'px';
  };

  const openSidebar = useCallback(() => { setSidebarOpen(true); setTooltip(t => ({ ...t, visible: false })); }, []);

  const addPhotos = useCallback((newFiles) => {
    setPhotos((prev) => {
      const remaining = 4 - prev.length;
      if (remaining <= 0) return prev;
      return [...prev, ...Array.from(newFiles).slice(0, remaining)];
    });
  }, []);

  const addFiles = useCallback((newFiles, setter) => {
    setter((prev) => [...prev, ...Array.from(newFiles)]);
  }, []);

  const removeFile = useCallback((index, setter) => {
    setter((prev) => prev.filter((_, i) => i !== index));
  }, []);

  const handleDrop = useCallback((e, accept, setter) => {
    e.preventDefault();
    const files = Array.from(e.dataTransfer.files).filter((f) => {
      if (accept === 'image/*') return f.type.startsWith('image/');
      return /\.(pdf|doc|docx|txt)$/i.test(f.name);
    });
    if (files.length) addFiles(files, setter);
  }, [addFiles]);

  const handleSocialPaste = useCallback((e) => {
    const text = (e.clipboardData || window.clipboardData).getData('text').trim();
    if (!text) return;

    if (!SOCIAL_URL_PATTERN.test(text)) {
      setSocialError('Not a valid social media URL');
      return;
    }

    if (socialUrls.includes(text)) {
      setSocialError('Already added');
      return;
    }

    setSocialError('');
    setSocialUrls((prev) => [...prev, text]);
  }, [socialUrls]);

  const handleClipboardPaste = useCallback(async () => {
    setShowPasteBtn(false);
    try {
      const text = (await navigator.clipboard.readText()).trim();
      if (!text) return;
      if (!SOCIAL_URL_PATTERN.test(text)) {
        setSocialError('Not a valid social media URL');
        return;
      }
      if (socialUrls.includes(text)) {
        setSocialError('Already added');
        return;
      }
      setSocialError('');
      setSocialUrls((prev) => [...prev, text]);
    } catch {
      setSocialError('Clipboard access denied');
    }
  }, [socialUrls]);

  const handleLongPressStart = useCallback(() => {
    longPressTimer.current = setTimeout(() => setShowPasteBtn(true), 500);
  }, []);

  const handleLongPressEnd = useCallback(() => {
    if (longPressTimer.current) clearTimeout(longPressTimer.current);
  }, []);

  // Clear error after a delay
  useEffect(() => {
    if (!socialError) return;
    const t = setTimeout(() => setSocialError(''), 3000);
    return () => clearTimeout(t);
  }, [socialError]);

  // Listen for paste when hovering over the social zone
  useEffect(() => {
    if (!socialHover) return;
    const handler = (e) => handleSocialPaste(e);
    document.addEventListener('paste', handler);
    return () => document.removeEventListener('paste', handler);
  }, [socialHover, handleSocialPaste]);

  const contextContent = (isSheet) => (
    <>
      {/* Photo thumbnails */}
      {photos.length > 0 && (
        <div className="cs-photo-grid">
          {photos.map((f, i) => (
            <div key={i} className="cs-photo-thumb">
              <img src={URL.createObjectURL(f)} alt={f.name} className="cs-photo-img" />
              <button className="cs-photo-remove" onClick={() => removeFile(i, setPhotos)}>
                <X size={10} />
              </button>
            </div>
          ))}
        </div>
      )}

      {/* Photos upload */}
      <input
        ref={isSheet ? undefined : photoInputRef}
        type="file"
        accept="image/*"
        multiple
        style={{ display: 'none' }}
        onChange={(e) => {
          const files = Array.from(e.target.files);
          if (files.length) addPhotos(files);
          e.target.value = '';
        }}
      />
      {photos.length < 4 && (
        <div
          className={`cs-upload-zone cs-upload-zone--expanded ${photoDragOver ? 'cs-upload-zone--dragover' : ''}`}
          onClick={() => photoInputRef.current?.click()}
          onDragOver={(e) => { e.preventDefault(); setPhotoDragOver(true); }}
          onDragLeave={() => setPhotoDragOver(false)}
          onDrop={(e) => {
            e.preventDefault();
            setPhotoDragOver(false);
            const files = Array.from(e.dataTransfer.files).filter((f) => f.type.startsWith('image/'));
            if (files.length) addPhotos(files);
          }}
        >
          <Image size={20} className="cs-upload-icon" />
          <span className="cs-upload-label cs-upload-label--show">Add reference photos</span>
          <span className="cs-upload-hint cs-upload-hint--show">{photos.length}/4 photos</span>
        </div>
      )}

      {/* Document thumbnails */}
      {documents.length > 0 && (
        <div className="cs-doc-grid">
          {documents.map((f, i) => {
            const ext = f.name.split('.').pop().toLowerCase();
            return (
              <div
                key={i}
                className="cs-doc-thumb"
                onMouseEnter={(e) => {
                  const rect = e.currentTarget.getBoundingClientRect();
                  setTooltip({ text: f.name, x: rect.left + rect.width / 2, y: rect.top - 6, visible: true });
                }}
                onMouseLeave={() => setTooltip((t) => ({ ...t, visible: false }))}
              >
                <span className="cs-doc-ext">{ext}</span>
                <button className="cs-doc-remove" onClick={() => { removeFile(i, setDocuments); setTooltip(t => ({ ...t, visible: false })); }}>
                  <X size={10} />
                </button>
              </div>
            );
          })}
        </div>
      )}

      {/* Documents upload */}
      <input
        ref={isSheet ? undefined : docInputRef}
        type="file"
        accept=".pdf,.doc,.docx,.txt,.json,.csv"
        multiple
        style={{ display: 'none' }}
        onChange={(e) => {
          const files = Array.from(e.target.files);
          if (files.length) addFiles(files, setDocuments);
          e.target.value = '';
        }}
      />
      <div
        className={`cs-upload-zone cs-upload-zone--expanded ${docDragOver ? 'cs-upload-zone--dragover' : ''}`}
        onClick={() => docInputRef.current?.click()}
        onDragOver={(e) => { e.preventDefault(); setDocDragOver(true); }}
        onDragLeave={() => setDocDragOver(false)}
        onDrop={(e) => { handleDrop(e, 'docs', setDocuments); setDocDragOver(false); }}
      >
        <FileText size={20} className="cs-upload-icon" />
        <span className="cs-upload-label cs-upload-label--show">Add documents</span>
        <span className="cs-upload-hint cs-upload-hint--show">PDF, DOC, DOCX, TXT</span>
      </div>

      {/* Social URL paste zone */}
      <div
        ref={isSheet ? undefined : socialZoneRef}
        className={`cs-upload-zone cs-upload-zone--expanded cs-social-zone ${socialHover ? 'cs-social-zone--active' : ''} ${socialError ? 'cs-social-zone--error' : ''}`}
        onMouseEnter={() => setSocialHover(true)}
        onMouseLeave={() => { setSocialHover(false); setSocialError(''); }}
        {...(isSheet ? {
          onTouchStart: handleLongPressStart,
          onTouchEnd: handleLongPressEnd,
          onTouchMove: handleLongPressEnd,
        } : {})}
      >
        <div className="cs-social-icons" style={{ height: 32, gap: 0 }}>
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className="cs-social-float cs-social-float--sheet" style={{ animationDelay: '0s' }}>
            <rect x="2" y="2" width="20" height="20" rx="5" /><circle cx="12" cy="12" r="5" /><circle cx="17.5" cy="6.5" r="1" fill="currentColor" stroke="none" />
          </svg>
          <svg viewBox="0 0 24 24" fill="currentColor" className="cs-social-float cs-social-float--sheet" style={{ animationDelay: '0.8s' }}>
            <path d="M23.498 6.186a3.016 3.016 0 00-2.122-2.136C19.505 3.546 12 3.546 12 3.546s-7.505 0-9.377.504A3.017 3.017 0 00.502 6.186C0 8.07 0 12 0 12s0 3.93.502 5.814a3.016 3.016 0 002.122 2.136c1.871.504 9.376.504 9.376.504s7.505 0 9.377-.504a3.015 3.015 0 002.122-2.136C24 15.93 24 12 24 12s0-3.93-.502-5.814zM9.545 15.568V8.432L15.818 12l-6.273 3.568z" />
          </svg>
          <svg viewBox="0 0 24 24" fill="currentColor" className="cs-social-float cs-social-float--sheet" style={{ animationDelay: '1.6s' }}>
            <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z" />
          </svg>
          <svg viewBox="0 0 24 24" fill="currentColor" className="cs-social-float cs-social-float--sheet" style={{ animationDelay: '2.4s' }}>
            <path d="M16 8a6 6 0 016 6v7h-4v-7a2 2 0 00-4 0v7h-4v-7a6 6 0 016-6z" /><rect x="2" y="9" width="4" height="12" /><circle cx="4" cy="4" r="2" />
          </svg>
          <svg viewBox="0 0 24 24" fill="currentColor" className="cs-social-float cs-social-float--sheet" style={{ animationDelay: '3.2s' }}>
            <path d="M19.59 6.69a4.83 4.83 0 01-3.77-4.25V2h-3.45v13.67a2.89 2.89 0 01-2.88 2.5 2.89 2.89 0 01-2.89-2.89 2.89 2.89 0 012.89-2.89c.28 0 .54.04.79.1v-3.5a6.37 6.37 0 00-.79-.05A6.34 6.34 0 003.15 15a6.34 6.34 0 006.34 6.34 6.34 6.34 0 006.34-6.34V8.72a8.2 8.2 0 004.76 1.52V6.79a4.84 4.84 0 01-1-.1z" />
          </svg>
        </div>
        {isSheet && showPasteBtn && (
          <button className="cs-paste-btn" onClick={handleClipboardPaste}>
            Paste
          </button>
        )}
        <span className="cs-upload-label cs-upload-label--show">
          {socialError || 'Paste a social media link'}
        </span>
        <span className="cs-upload-hint cs-upload-hint--show">
          {isSheet ? 'Press & hold to paste' : 'Hover + Ctrl V'}
        </span>
      </div>
      {socialUrls.length > 0 && (
        <div className="cs-file-list" style={{ display: 'flex' }}>
          {socialUrls.map((url, i) => (
            <div key={i} className="cs-file-chip cs-url-chip">
              <Link2 size={12} />
              <span className="cs-file-chip-name">{url.replace(/^https?:\/\/(www\.)?/, '')}</span>
              <button className="cs-file-chip-remove" onClick={() => setSocialUrls((prev) => prev.filter((_, j) => j !== i))}>
                <X size={12} />
              </button>
            </div>
          ))}
        </div>
      )}

      {/* Brand DNA */}
      <div className="cs-branddna cs-branddna--expanded">
        <img src="/favicon.png" alt="Brand DNA" className="cs-branddna-logo" />
        <span className="cs-branddna-title cs-branddna-title--show">Brand DNA</span>
        <p className="cs-branddna-desc cs-branddna-desc--show">
          Your brand voice, identity, and visual style used to personalize content.
        </p>
        <button className="cs-branddna-btn cs-branddna-btn--show" onClick={(e) => { e.stopPropagation(); navigate('/settings', { state: { scrollTo: 'brand-dna' } }); }}>
          Edit Brand DNA
        </button>
      </div>
    </>
  );

  return (
    <div className="content-page">
      {/* Content Sidebar (desktop only) */}
      <aside
        className={`content-sidebar ${sidebarOpen ? 'content-sidebar--open' : ''}`}
        onClick={!sidebarOpen ? openSidebar : undefined}
      >
        {/* Header */}
        <div className="cs-header">
          {sidebarOpen ? (
            <>
              <span className="cs-title">Context</span>
              <button className="cs-collapse-btn" onClick={(e) => { e.stopPropagation(); setSidebarOpen(false); setTooltip(t => ({ ...t, visible: false })); }} title="Collapse">
                <ChevronLeft size={18} />
              </button>
            </>
          ) : (
            <button className="cs-expand-btn" onClick={openSidebar} title="Expand">
              <ChevronRight size={18} />
            </button>
          )}
        </div>

        <div className="cs-items">
          {/* Photo thumbnails */}
          {photos.length > 0 && (
            <div className="cs-photo-grid">
              {photos.map((f, i) => (
                <div key={i} className="cs-photo-thumb">
                  <img src={URL.createObjectURL(f)} alt={f.name} className="cs-photo-img" />
                  <button className="cs-photo-remove" onClick={() => removeFile(i, setPhotos)}>
                    <X size={10} />
                  </button>
                </div>
              ))}
            </div>
          )}

          {/* Photos upload */}
          <input
            ref={photoInputRef}
            type="file"
            accept="image/*"
            multiple
            style={{ display: 'none' }}
            onChange={(e) => {
              const files = Array.from(e.target.files);
              if (files.length) addPhotos(files);
              e.target.value = '';
            }}
          />
          {photos.length < 4 && (
            <div
              className={`cs-upload-zone ${photoDragOver ? 'cs-upload-zone--dragover' : ''}`}
              onClick={() => { if (sidebarOpen) photoInputRef.current?.click(); }}
              onDragOver={(e) => { e.preventDefault(); setPhotoDragOver(true); }}
              onDragLeave={() => setPhotoDragOver(false)}
              onDrop={(e) => {
                e.preventDefault();
                setPhotoDragOver(false);
                const files = Array.from(e.dataTransfer.files).filter((f) => f.type.startsWith('image/'));
                if (files.length) addPhotos(files);
              }}
            >
              <Image size={20} className="cs-upload-icon" />
              <span className="cs-upload-label">Add reference photos</span>
              <span className="cs-upload-hint">{photos.length}/4 photos</span>
            </div>
          )}

          {/* Document thumbnails */}
          {documents.length > 0 && (
            <div className="cs-doc-grid">
              {documents.map((f, i) => {
                const ext = f.name.split('.').pop().toLowerCase();
                return (
                  <div
                    key={i}
                    className="cs-doc-thumb"
                    onMouseEnter={(e) => {
                      const rect = e.currentTarget.getBoundingClientRect();
                      setTooltip({ text: f.name, x: rect.left + rect.width / 2, y: rect.top - 6, visible: true });
                    }}
                    onMouseLeave={() => setTooltip((t) => ({ ...t, visible: false }))}
                  >
                    <span className="cs-doc-ext">{ext}</span>
                    <button className="cs-doc-remove" onClick={() => { removeFile(i, setDocuments); setTooltip(t => ({ ...t, visible: false })); }}>
                      <X size={10} />
                    </button>
                  </div>
                );
              })}
            </div>
          )}

          {/* Documents upload */}
          <input
            ref={docInputRef}
            type="file"
            accept=".pdf,.doc,.docx,.txt,.json,.csv"
            multiple
            style={{ display: 'none' }}
            onChange={(e) => {
              const files = Array.from(e.target.files);
              if (files.length) addFiles(files, setDocuments);
              e.target.value = '';
            }}
          />
          <div
            className={`cs-upload-zone ${docDragOver ? 'cs-upload-zone--dragover' : ''}`}
            onClick={() => { if (sidebarOpen) docInputRef.current?.click(); }}
            onDragOver={(e) => { e.preventDefault(); setDocDragOver(true); }}
            onDragLeave={() => setDocDragOver(false)}
            onDrop={(e) => { handleDrop(e, 'docs', setDocuments); setDocDragOver(false); }}
          >
            <FileText size={20} className="cs-upload-icon" />
            <span className="cs-upload-label">Add documents</span>
            <span className="cs-upload-hint">PDF, DOC, DOCX, TXT</span>
          </div>

          {/* Social URL paste zone */}
          <div
            ref={socialZoneRef}
            className={`cs-upload-zone cs-social-zone ${socialHover ? 'cs-social-zone--active' : ''} ${socialError ? 'cs-social-zone--error' : ''}`}
            onMouseEnter={() => setSocialHover(true)}
            onMouseLeave={() => { setSocialHover(false); setSocialError(''); }}
          >
            <div className="cs-social-icons">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className="cs-social-float" style={{ animationDelay: '0s' }}>
                <rect x="2" y="2" width="20" height="20" rx="5" /><circle cx="12" cy="12" r="5" /><circle cx="17.5" cy="6.5" r="1" fill="currentColor" stroke="none" />
              </svg>
              <svg viewBox="0 0 24 24" fill="currentColor" className="cs-social-float" style={{ animationDelay: '0.8s' }}>
                <path d="M23.498 6.186a3.016 3.016 0 00-2.122-2.136C19.505 3.546 12 3.546 12 3.546s-7.505 0-9.377.504A3.017 3.017 0 00.502 6.186C0 8.07 0 12 0 12s0 3.93.502 5.814a3.016 3.016 0 002.122 2.136c1.871.504 9.376.504 9.376.504s7.505 0 9.377-.504a3.015 3.015 0 002.122-2.136C24 15.93 24 12 24 12s0-3.93-.502-5.814zM9.545 15.568V8.432L15.818 12l-6.273 3.568z" />
              </svg>
              <svg viewBox="0 0 24 24" fill="currentColor" className="cs-social-float" style={{ animationDelay: '1.6s' }}>
                <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z" />
              </svg>
              <svg viewBox="0 0 24 24" fill="currentColor" className="cs-social-float" style={{ animationDelay: '2.4s' }}>
                <path d="M16 8a6 6 0 016 6v7h-4v-7a2 2 0 00-4 0v7h-4v-7a6 6 0 016-6z" /><rect x="2" y="9" width="4" height="12" /><circle cx="4" cy="4" r="2" />
              </svg>
              <svg viewBox="0 0 24 24" fill="currentColor" className="cs-social-float" style={{ animationDelay: '3.2s' }}>
                <path d="M19.59 6.69a4.83 4.83 0 01-3.77-4.25V2h-3.45v13.67a2.89 2.89 0 01-2.88 2.5 2.89 2.89 0 01-2.89-2.89 2.89 2.89 0 012.89-2.89c.28 0 .54.04.79.1v-3.5a6.37 6.37 0 00-.79-.05A6.34 6.34 0 003.15 15a6.34 6.34 0 006.34 6.34 6.34 6.34 0 006.34-6.34V8.72a8.2 8.2 0 004.76 1.52V6.79a4.84 4.84 0 01-1-.1z" />
              </svg>
            </div>
            <span className="cs-upload-label">
              {socialError || 'Paste a social media link'}
            </span>
            <span className="cs-upload-hint">Hover + Ctrl V</span>
          </div>
          {socialUrls.length > 0 && (
            <div className="cs-file-list">
              {socialUrls.map((url, i) => (
                <div key={i} className="cs-file-chip cs-url-chip">
                  <Link2 size={12} />
                  <span className="cs-file-chip-name">{url.replace(/^https?:\/\/(www\.)?/, '')}</span>
                  <button className="cs-file-chip-remove" onClick={() => setSocialUrls((prev) => prev.filter((_, j) => j !== i))}>
                    <X size={12} />
                  </button>
                </div>
              ))}
            </div>
          )}

          {/* Brand DNA */}
          <div className="cs-branddna">
            <img src="/favicon.png" alt="Brand DNA" className="cs-branddna-logo" />
            <span className="cs-branddna-title">Brand DNA</span>
            <p className="cs-branddna-desc">
              Your brand voice, identity, and visual style used to personalize content.
            </p>
            <button className="cs-branddna-btn" onClick={(e) => { e.stopPropagation(); navigate('/settings', { state: { scrollTo: 'brand-dna' } }); }}>
              Edit Brand DNA
            </button>
          </div>
        </div>
      </aside>

      {/* Doc tooltip — rendered outside sidebar to avoid overflow clipping */}
      {tooltip.visible && (
        <div
          className="cs-doc-tooltip"
          style={{ left: tooltip.x, top: tooltip.y }}
        >
          {tooltip.text}
        </div>
      )}

      {/* Mobile Context Bottom Sheet */}
      <div
        className={`context-sheet-overlay ${contextSheetOpen ? 'context-sheet-overlay--open' : ''}`}
        onClick={() => { setContextSheetOpen(false); setShowPasteBtn(false); }}
      />
      <div className={`context-sheet ${contextSheetOpen ? 'context-sheet--open' : ''}`}>
        <div className="context-sheet-handle" onClick={() => { setContextSheetOpen(false); setShowPasteBtn(false); }}>
          <div className="context-sheet-bar" />
        </div>
        <div className="context-sheet-body">
          {contextContent(true)}
        </div>
      </div>

      {/* Main content area */}
      <div className="content-main">
        {/* Platform Pill Selector */}
        <div className="content-top-bar">
          <button className="content-prev-convos" title="Previous conversations">
            <History size={18} className="content-prev-convos-icon" />
            <span className="content-prev-convos-label">Previous conversations</span>
          </button>
          <div className="content-pill-bar">
            <div className="content-pill">
              <div
                className="content-pill-slider"
                style={{ transform: `translateX(calc(${activeIndex} * var(--pill-size)))` }}
              />
              {platforms.map((p) => (
                <button
                  key={p.id}
                  className={`content-pill-btn ${selectedPlatform === p.id ? 'content-pill-btn--active' : ''}`}
                  onClick={() => setSelectedPlatform(p.id)}
                  title={p.name}
                >
                  {p.icon}
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* Chat area — hero state when empty */}
        <div className="content-chat-area">
          <div className="content-hero">
            <div className="content-hero-cards">
              {/* Instagram Post */}
              <div className="content-mock content-mock--ig">
                <div className="content-mock-header">
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className="content-mock-logo">
                    <rect x="2" y="2" width="20" height="20" rx="5" /><circle cx="12" cy="12" r="5" /><circle cx="17.5" cy="6.5" r="1" fill="currentColor" stroke="none" />
                  </svg>
                  <span className="content-mock-handle">yourpage</span>
                </div>
                <div className="content-mock-img">
                  <svg viewBox="0 0 48 48" fill="none" className="content-mock-placeholder-icon"><rect width="48" height="48" rx="6" fill="currentColor" opacity="0.08"/><path d="M14 34l8-10 6 7 4-5 6 8H14z" fill="currentColor" opacity="0.15"/><circle cx="18" cy="18" r="3" fill="currentColor" opacity="0.15"/></svg>
                </div>
                <div className="content-mock-caption">
                  <div className="content-mock-line" style={{ width: '80%' }} />
                  <div className="content-mock-line" style={{ width: '55%' }} />
                </div>
              </div>

              {/* YouTube Video */}
              <div className="content-mock content-mock--yt">
                <div className="content-mock-img content-mock-img--wide">
                  <svg viewBox="0 0 48 28" fill="none" className="content-mock-placeholder-icon"><rect width="48" height="28" rx="4" fill="currentColor" opacity="0.08"/><path d="M19 9v10l9-5-9-5z" fill="currentColor" opacity="0.18"/></svg>
                </div>
                <div className="content-mock-meta">
                  <svg viewBox="0 0 24 24" fill="currentColor" className="content-mock-logo">
                    <path d="M23.498 6.186a3.016 3.016 0 00-2.122-2.136C19.505 3.546 12 3.546 12 3.546s-7.505 0-9.377.504A3.017 3.017 0 00.502 6.186C0 8.07 0 12 0 12s0 3.93.502 5.814a3.016 3.016 0 002.122 2.136c1.871.504 9.376.504 9.376.504s7.505 0 9.377-.504a3.015 3.015 0 002.122-2.136C24 15.93 24 12 24 12s0-3.93-.502-5.814zM9.545 15.568V8.432L15.818 12l-6.273 3.568z" />
                  </svg>
                  <div className="content-mock-caption">
                    <div className="content-mock-line" style={{ width: '90%' }} />
                    <div className="content-mock-line" style={{ width: '40%' }} />
                  </div>
                </div>
              </div>

              {/* X Tweet */}
              <div className="content-mock content-mock--x">
                <div className="content-mock-header">
                  <svg viewBox="0 0 24 24" fill="currentColor" className="content-mock-logo">
                    <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z" />
                  </svg>
                  <span className="content-mock-handle">@yourbrand</span>
                </div>
                <div className="content-mock-caption content-mock-caption--tweet">
                  <div className="content-mock-line" style={{ width: '95%' }} />
                  <div className="content-mock-line" style={{ width: '80%' }} />
                  <div className="content-mock-line" style={{ width: '50%' }} />
                </div>
                <div className="content-mock-actions">
                  <div className="content-mock-line" style={{ width: '20%', height: 6 }} />
                  <div className="content-mock-line" style={{ width: '20%', height: 6 }} />
                  <div className="content-mock-line" style={{ width: '20%', height: 6 }} />
                </div>
              </div>

              {/* TikTok Video */}
              <div className="content-mock content-mock--tt">
                <div className="content-mock-img content-mock-img--tall">
                  <svg viewBox="0 0 36 48" fill="none" className="content-mock-placeholder-icon"><rect width="36" height="48" rx="6" fill="currentColor" opacity="0.08"/><path d="M15 18v12l9-6-9-6z" fill="currentColor" opacity="0.18"/></svg>
                </div>
                <div className="content-mock-meta">
                  <svg viewBox="0 0 24 24" fill="currentColor" className="content-mock-logo">
                    <path d="M19.59 6.69a4.83 4.83 0 01-3.77-4.25V2h-3.45v13.67a2.89 2.89 0 01-2.88 2.5 2.89 2.89 0 01-2.89-2.89 2.89 2.89 0 012.89-2.89c.28 0 .54.04.79.1v-3.5a6.37 6.37 0 00-.79-.05A6.34 6.34 0 003.15 15a6.34 6.34 0 006.34 6.34 6.34 6.34 0 006.34-6.34V8.72a8.2 8.2 0 004.76 1.52V6.79a4.84 4.84 0 01-1-.1z" />
                  </svg>
                  <div className="content-mock-caption">
                    <div className="content-mock-line" style={{ width: '75%' }} />
                  </div>
                </div>
              </div>
            </div>

            <p className="content-hero-text">Ask your AI CEO to Plan, Ideate or Generate content.</p>
          </div>
        </div>

        {/* Chat Input */}
        <div className="content-input-area">
          <div className="content-input-wrapper">
            <textarea
              className="content-input"
              placeholder={`Create content for ${activePlatform.name}...`}
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onInput={autoResize}
              onKeyDown={handleKeyDown}
              rows={1}
            />
            <div className="content-input-footer">
              <button
                className="content-context-btn"
                style={{ background: 'var(--brand-red)' }}
                onClick={() => setContextSheetOpen(true)}
              >
                <Plus size={16} />
                <span>Add context</span>
              </button>
              <button
                className="content-send-btn"
                disabled={!input.trim()}
              >
                <Send size={18} />
              </button>
            </div>
            <button
              className="content-send-btn content-send-btn--desktop"
              disabled={!input.trim()}
            >
              <Send size={18} />
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
