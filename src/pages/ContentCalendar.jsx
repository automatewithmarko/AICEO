import { useEffect, useMemo, useRef, useState } from 'react';
import { ChevronLeft, ChevronRight, Plus, X, ArrowLeft, ArrowRight, Check, Image as ImageIcon, Clock, CalendarDays, Video, Layers, Camera, Play, Send, Loader } from 'lucide-react';
import { getCalendarPosts, createCalendarPost, updateCalendarPost, deleteCalendarPost, publishCalendarPost } from '../lib/api';
import './Pages.css';
import './ContentCalendar.css';

// ─── Platforms ──────────────────────────────────────────────────────────────

const PLATFORMS = [
  {
    id: 'instagram',
    name: 'Instagram',
    color: '#E4405F',
    tagline: 'Feed, Reel, or Story',
    limit: 2200,
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
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
    tagline: 'Feed post',
    limit: 63206,
    icon: (
      <svg viewBox="0 0 24 24" fill="currentColor">
        <path d="M18 2h-3a5 5 0 00-5 5v3H7v4h3v8h4v-8h3l1-4h-4V7a1 1 0 011-1h3V2z" />
      </svg>
    ),
  },
  {
    id: 'linkedin',
    name: 'LinkedIn',
    color: '#0A66C2',
    tagline: 'Text or article',
    limit: 3000,
    icon: (
      <svg viewBox="0 0 24 24" fill="currentColor">
        <path d="M16 8a6 6 0 016 6v7h-4v-7a2 2 0 00-4 0v7h-4v-7a6 6 0 016-6z" />
        <rect x="2" y="9" width="4" height="12" />
        <circle cx="4" cy="4" r="2" />
      </svg>
    ),
  },
];

const getPlatform = (id) => PLATFORMS.find((p) => p.id === id);

// Instagram content types. Media required for all three.
const IG_TYPES = [
  { id: 'post',     name: 'Post',     tagline: 'Single image or video',       Icon: Camera, aspect: '1 / 1',  maxFiles: 1,  accept: 'image/*,video/*' },
  { id: 'reel',     name: 'Reel',     tagline: 'Short vertical video',        Icon: Video,  aspect: '9 / 16', maxFiles: 1,  accept: 'video/*' },
  { id: 'carousel', name: 'Carousel', tagline: 'Multiple images or videos',   Icon: Layers, aspect: '1 / 1',  maxFiles: 10, accept: 'image/*,video/*' },
];
const getIgType = (id) => IG_TYPES.find((t) => t.id === id);

// Display label for a content type per platform.  Instagram calls it a
// "Reel", Facebook calls it "Reels", LinkedIn calls it "Short".
function typeLabel(platformId, typeId) {
  if (typeId === 'reel') {
    if (platformId === 'instagram') return 'Reel';
    if (platformId === 'facebook') return 'Reels';
    if (platformId === 'linkedin') return 'Short';
    return 'Reel';
  }
  const t = getIgType(typeId);
  return t ? t.name : '';
}

// ─── Date utils ─────────────────────────────────────────────────────────────

const pad = (n) => String(n).padStart(2, '0');
const toISODate = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const parseISODate = (s) => {
  const [y, m, d] = s.split('-').map(Number);
  return new Date(y, m - 1, d);
};
const isSameDay = (a, b) => a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
const addDays = (d, n) => { const x = new Date(d); x.setDate(x.getDate() + n); return x; };
const addMonths = (d, n) => { const x = new Date(d); x.setMonth(x.getMonth() + n); return x; };
const startOfMonth = (d) => new Date(d.getFullYear(), d.getMonth(), 1);
const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

// Build a 6x7 grid of Date objects covering the month.
function buildMonthGrid(cursor) {
  const first = startOfMonth(cursor);
  const startDay = first.getDay(); // 0=Sun
  const gridStart = addDays(first, -startDay);
  const cells = [];
  for (let i = 0; i < 42; i++) cells.push(addDays(gridStart, i));
  return cells;
}

// ─── Seed data (relative to today so the calendar always feels alive) ───────

// Convert DB row to local post shape
function dbToLocal(row) {
  const dt = row.scheduled_at ? new Date(row.scheduled_at) : null;
  return {
    id: row.id,
    platform: row.platform,
    igType: row.content_type || undefined,
    date: dt ? toISODate(dt) : toISODate(new Date()),
    time: dt ? `${pad(dt.getHours())}:${pad(dt.getMinutes())}` : '09:00',
    content: row.caption || '',
    media: row.media || [],
    status: row.status || 'draft',
    url: row.url || null,
    externalPostId: row.external_post_id || null,
  };
}

// ─── Component ──────────────────────────────────────────────────────────────

export default function ContentCalendar() {
  const today = useMemo(() => new Date(), []);
  const [cursor, setCursor] = useState(today);
  const [posts, setPosts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [modal, setModal] = useState(null);
  // modal shape: { step: 'pick' | 'compose', date: 'YYYY-MM-DD', platform?: 'instagram', editId?: 'p1' }

  // Load posts from Supabase on mount
  useEffect(() => {
    getCalendarPosts()
      .then(({ posts: dbPosts }) => setPosts((dbPosts || []).map(dbToLocal)))
      .catch((err) => console.error('Failed to load calendar posts:', err))
      .finally(() => setLoading(false));
  }, []);

  const grid = useMemo(() => buildMonthGrid(cursor), [cursor]);
  const postsByDate = useMemo(() => {
    const map = new Map();
    for (const p of posts) {
      if (!map.has(p.date)) map.set(p.date, []);
      map.get(p.date).push(p);
    }
    for (const arr of map.values()) arr.sort((a, b) => a.time.localeCompare(b.time));
    return map;
  }, [posts]);

  const openNewPost = (dateObj) => {
    setModal({ step: 'pick', date: toISODate(dateObj || today) });
  };
  const openEditPost = (post) => {
    const step = post.status === 'scheduled' ? 'view' : 'compose';
    setModal({ step, date: post.date, platform: post.platform, igType: post.igType, editId: post.id });
  };
  const pickPlatform = (platformId) => {
    setModal((m) => ({ ...m, step: 'compose', platform: platformId, igType: undefined }));
  };
  const closeModal = () => setModal(null);

  const savePost = async (draft) => {
    const scheduledAt = draft.date && draft.time
      ? new Date(`${draft.date}T${draft.time}:00`).toISOString()
      : null;

    try {
      if (modal?.editId) {
        const { post } = await updateCalendarPost(modal.editId, {
          caption: draft.content,
          scheduled_at: scheduledAt,
          content_type: draft.igType || null,
          media: draft.media || [],
          status: draft.status || 'scheduled',
        });
        setPosts((prev) => prev.map((p) => p.id === modal.editId ? dbToLocal(post) : p));
      } else {
        const { post } = await createCalendarPost({
          platform: draft.platform,
          caption: draft.content,
          content_type: draft.igType || null,
          scheduled_at: scheduledAt,
          media: draft.media || [],
          status: draft.status || 'scheduled',
        });
        setPosts((prev) => [...prev, dbToLocal(post)]);
      }
    } catch (err) {
      console.error('Failed to save post:', err);
    }
    closeModal();
  };

  const deletePost = async () => {
    if (!modal?.editId) return;
    try {
      await deleteCalendarPost(modal.editId);
      setPosts((prev) => prev.filter((p) => p.id !== modal.editId));
    } catch (err) {
      console.error('Failed to delete post:', err);
    }
    closeModal();
  };

  // Escape closes the modal.
  useEffect(() => {
    if (!modal) return;
    const onKey = (e) => { if (e.key === 'Escape') closeModal(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [modal]);

  const scheduledCount = useMemo(() => posts.filter((p) => p.status === 'scheduled').length, [posts]);

  return (
    <div className="cc-page">
      {/* ─── Header ────────────────────────────────────────────────── */}
      <header className="cc-header">
        <div className="cc-header-left">
          <div className="cc-title-icon"><CalendarDays size={22} strokeWidth={1.8} /></div>
          <div>
            <h1 className="cc-title">Content Calendar</h1>
            <p className="cc-subtitle">{scheduledCount} scheduled · {posts.length - scheduledCount} drafts</p>
          </div>
        </div>
        <div className="cc-header-right">
          <div className="cc-month-nav">
            <button className="cc-icon-btn" onClick={() => setCursor((c) => addMonths(c, -1))} aria-label="Previous month">
              <ChevronLeft size={16} />
            </button>
            <span className="cc-month-label">{MONTHS[cursor.getMonth()]} {cursor.getFullYear()}</span>
            <button className="cc-icon-btn" onClick={() => setCursor((c) => addMonths(c, 1))} aria-label="Next month">
              <ChevronRight size={16} />
            </button>
          </div>
          <button className="cc-today-btn" onClick={() => setCursor(new Date())}>Today</button>
          <button className="cc-primary-btn" onClick={() => openNewPost(today)}>
            <Plus size={16} /> New post
          </button>
        </div>
      </header>

      {/* ─── Grid ──────────────────────────────────────────────────── */}
      <div className="cc-grid-wrap">
        <div className="cc-weekdays">
          {WEEKDAYS.map((w) => <div key={w} className="cc-weekday">{w}</div>)}
        </div>
        <div className="cc-grid">
          {grid.map((day, i) => {
            const inMonth = day.getMonth() === cursor.getMonth();
            const isTodayCell = isSameDay(day, today);
            const dayPosts = postsByDate.get(toISODate(day)) || [];
            const visible = dayPosts.slice(0, 2);
            const overflow = dayPosts.length - visible.length;
            return (
              <div
                key={i}
                className={`cc-cell${inMonth ? '' : ' cc-cell--out'}${isTodayCell ? ' cc-cell--today' : ''}`}
                onClick={() => openNewPost(day)}
              >
                <div className="cc-cell-head">
                  <span className={`cc-cell-num${isTodayCell ? ' cc-cell-num--today' : ''}`}>{day.getDate()}</span>
                  <button
                    className="cc-cell-add"
                    aria-label="Add post on this day"
                    onClick={(e) => { e.stopPropagation(); openNewPost(day); }}
                  >
                    <Plus size={12} />
                  </button>
                </div>
                <div className="cc-cell-posts">
                  {visible.map((p) => {
                    const plat = getPlatform(p.platform);
                    return (
                      <button
                        key={p.id}
                        className={`cc-pill${p.status === 'draft' ? ' cc-pill--draft' : ''}`}
                        style={{ '--pill-color': plat.color }}
                        onClick={(e) => { e.stopPropagation(); openEditPost(p); }}
                        title={`${plat.name} · ${p.content}`}
                      >
                        <span className="cc-pill-icon" style={{ color: plat.color }}>{plat.icon}</span>
                        <span className="cc-pill-text">{p.content}</span>
                      </button>
                    );
                  })}
                  {overflow > 0 && (
                    <span className="cc-cell-more">+{overflow} more</span>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* ─── Modals ────────────────────────────────────────────────── */}
      {modal && (
        <div className="cc-modal-overlay" onClick={closeModal}>
          <div
            className={`cc-modal${modal.step === 'compose' ? ' cc-modal--wide' : ''}`}
            onClick={(e) => e.stopPropagation()}
          >
            <button className="cc-modal-close" onClick={closeModal} aria-label="Close"><X size={18} /></button>

            {modal.step === 'pick' && (
              <PlatformPicker onPick={pickPlatform} />
            )}
            {modal.step === 'compose' && (
              <Composer
                modal={modal}
                onClose={closeModal}
                onBackToPicker={() => setModal((m) => ({ ...m, step: 'pick' }))}
                onSave={savePost}
                onDelete={modal.editId ? deletePost : null}
                existing={modal.editId ? posts.find((p) => p.id === modal.editId) : null}
              />
            )}
            {modal.step === 'view' && (
              <ScheduledView
                post={posts.find((p) => p.id === modal.editId)}
                onClose={closeModal}
                onDelete={deletePost}
                onPublish={async (postId) => {
                  const result = await publishCalendarPost(postId);
                  // Update local state to reflect published status
                  setPosts((prev) => prev.map((p) => p.id === postId ? { ...p, status: 'published', url: result.postUrl } : p));
                  return result;
                }}
              />
            )}
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Step 1: Platform Picker ────────────────────────────────────────────────

function PlatformPicker({ onPick }) {
  return (
    <div className="cc-picker">
      <h2 className="cc-modal-title">Where are you posting?</h2>
      <p className="cc-modal-sub">Pick a platform to get started.</p>
      <div className="cc-platform-grid">
        {PLATFORMS.map((p) => (
          <button
            key={p.id}
            className="cc-platform-card"
            style={{ '--pc': p.color }}
            onClick={() => onPick(p.id)}
          >
            <span className="cc-platform-badge" style={{ color: p.color }}>{p.icon}</span>
            <span className="cc-platform-name">{p.name}</span>
            <span className="cc-platform-tagline">{p.tagline}</span>
          </button>
        ))}
      </div>
    </div>
  );
}

// ─── Scheduled post view (read-only) ───────────────────────────────────────

function ScheduledView({ post, onClose, onDelete, onPublish }) {
  const [publishing, setPublishing] = useState(false);
  const [publishResult, setPublishResult] = useState(null); // { ok, error, url }
  if (!post) return null;
  const platform = getPlatform(post.platform);
  const igConfig = post.igType ? getIgType(post.igType) : null;
  const dateObj = parseISODate(post.date);
  const dateLabel = dateObj.toLocaleDateString(undefined, {
    weekday: 'long', month: 'long', day: 'numeric', year: 'numeric',
  });
  const [h, m] = post.time.split(':').map(Number);
  const period = h >= 12 ? 'PM' : 'AM';
  const h12 = ((h + 11) % 12) + 1;
  const timeLabel = `${h12}:${pad(m)} ${period}`;
  const eyebrow = igConfig ? `Scheduled · ${platform.name} ${typeLabel(platform.id, igConfig.id)}` : `Scheduled · ${platform.name}`;

  return (
    <div className="cc-view">
      <div className="cc-view-header">
        <span className="cc-posting-badge" style={{ '--pc': platform.color, color: platform.color }}>
          {platform.icon}
        </span>
        <div className="cc-view-header-text">
          <span className="cc-view-eyebrow">{eyebrow}</span>
          <h2 className="cc-view-title">{dateLabel}</h2>
        </div>
      </div>

      {post.media && post.media.length > 0 && (
        <div className={`cc-media-list${post.igType === 'reel' ? ' cc-media-list--reel' : ''}`}>
          {post.media.map((m, idx) => (
            <div
              key={idx}
              className="cc-media-thumb cc-media-thumb--view"
              style={{ aspectRatio: igConfig?.aspect || '1 / 1' }}
            >
              {m.type === 'video' ? (
                <VideoPlayer src={m.url} size={16} />
              ) : (
                <img src={m.url} alt="" />
              )}
            </div>
          ))}
        </div>
      )}

      <div className="cc-view-content">{post.content}</div>

      <div className="cc-view-meta">
        <div className="cc-view-meta-item">
          <CalendarDays size={13} />
          <span>{dateLabel}</span>
        </div>
        <div className="cc-view-meta-item">
          <Clock size={13} />
          <span>{timeLabel}</span>
        </div>
      </div>

      <div className="cc-view-note">
        <span>Scheduled posts can't be edited. Cancel the schedule to make changes.</span>
      </div>

      {publishResult?.ok && (
        <div className="cc-publish-success">
          <Check size={14} /> Published! {publishResult.url && <a href={publishResult.url} target="_blank" rel="noopener noreferrer">View post</a>}
        </div>
      )}
      {publishResult?.error && (
        <div className="cc-publish-error">{publishResult.error}</div>
      )}

      <div className="cc-actions">
        <button className="cc-ghost-btn cc-ghost-btn--danger" onClick={onDelete}>
          Cancel schedule
        </button>
        <div className="cc-actions-right">
          {(post.platform === 'linkedin' || post.platform === 'instagram') && post.status !== 'published' && (
            <button
              className="cc-primary-btn cc-primary-btn--lg"
              style={{ background: post.platform === 'linkedin' ? '#0a66c2' : '#E4405F' }}
              disabled={publishing}
              onClick={async () => {
                setPublishing(true);
                setPublishResult(null);
                try {
                  const result = await onPublish(post.id);
                  setPublishResult({ ok: true, url: result?.postUrl });
                } catch (err) {
                  setPublishResult({ error: err.message });
                } finally {
                  setPublishing(false);
                }
              }}
            >
              {publishing ? <><Loader size={14} className="cc-spin" /> Publishing...</> : <><Send size={14} /> Publish Now</>}
            </button>
          )}
          <button className="cc-primary-btn cc-primary-btn--lg" onClick={onClose}>Done</button>
        </div>
      </div>
    </div>
  );
}

// ─── Multi-step Composer (BooSend-style) ────────────────────────────────────

function Composer({ modal, onClose, onBackToPicker, onSave, onDelete, existing }) {
  const platform = getPlatform(modal.platform);

  // All platforms use the same 4-step flow: type → media → caption → time.
  const steps = ['type', 'media', 'caption', 'time'];

  const [stepIdx, setStepIdx] = useState(0);
  const [igType, setIgType] = useState(existing?.igType || 'post');
  const [media, setMedia] = useState(existing?.media || []);
  const [caption, setCaption] = useState(existing?.content || '');
  const [date, setDate] = useState(existing?.date || modal.date);
  const [time, setTime] = useState(existing?.time || '09:00');
  const [slideIdx, setSlideIdx] = useState(0);
  const fileInputRef = useRef(null);

  const currentStep = steps[stepIdx];
  const igConfig = getIgType(igType);
  const overLimit = caption.length > platform.limit;
  const needsMedia = !!igConfig;
  const reachedMax = igConfig && media.length >= igConfig.maxFiles;

  useEffect(() => () => {
    // Cleanup blob URLs on unmount.
    media.forEach((m) => { if (m.url?.startsWith('blob:')) URL.revokeObjectURL(m.url); });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const canProceed = () => {
    if (currentStep === 'type') return !!igType;
    if (currentStep === 'media') return !needsMedia || media.length > 0;
    if (currentStep === 'caption') return !overLimit;
    if (currentStep === 'time') return !!date && !!time;
    return true;
  };

  const handleNext = () => setStepIdx((i) => Math.min(i + 1, steps.length - 1));
  const handlePrev = () => {
    if (stepIdx > 0) setStepIdx((i) => i - 1);
    else if (onBackToPicker) onBackToPicker();
  };

  const handleFiles = (e) => {
    const files = Array.from(e.target.files || []);
    if (!files.length) return;
    const remaining = igConfig ? igConfig.maxFiles - media.length : files.length;
    const next = files.slice(0, Math.max(0, remaining)).map((f) => ({
      url: URL.createObjectURL(f),
      type: f.type.startsWith('video/') ? 'video' : 'image',
      name: f.name,
    }));
    setMedia((prev) => [...prev, ...next]);
    e.target.value = '';
  };

  const removeMedia = (idx) => {
    setMedia((prev) => {
      const removed = prev[idx];
      if (removed?.url?.startsWith('blob:')) URL.revokeObjectURL(removed.url);
      const next = prev.filter((_, i) => i !== idx);
      if (slideIdx >= next.length) setSlideIdx(Math.max(0, next.length - 1));
      return next;
    });
  };

  const clearAllMedia = () => {
    media.forEach((m) => { if (m.url?.startsWith('blob:')) URL.revokeObjectURL(m.url); });
    setMedia([]);
    setSlideIdx(0);
  };

  const pickIgType = (t) => {
    if (igType !== t) {
      // Reel changes media format; drop incompatible media.
      if (t === 'reel' || igType === 'reel') clearAllMedia();
      if (t !== 'carousel' && media.length > 1) {
        // Non-carousel types cap at 1.
        media.slice(1).forEach((m) => { if (m.url?.startsWith('blob:')) URL.revokeObjectURL(m.url); });
        setMedia((prev) => prev.slice(0, 1));
      }
      setIgType(t);
    }
  };

  const submit = (status) => {
    onSave({
      platform: platform.id,
      igType,
      content: caption.trim() || `New ${platform.name} post`,
      date,
      time,
      media,
      status,
    });
  };

  return (
    <div className="cc-stepped">
      {/* ── Header ─────────────────────────────────── */}
      <div className="cc-stepped-header">
        <div className="cc-stepped-header-left">
          <span className="cc-posting-badge cc-posting-badge--sm" style={{ '--pc': platform.color, color: platform.color }}>
            {platform.icon}
          </span>
          <div className="cc-stepped-title">
            <span className="cc-stepped-eyebrow">
              {existing ? 'Edit' : 'Schedule'}
              {igConfig ? ` · ${platform.name} ${typeLabel(platform.id, igConfig.id)}` : ` · ${platform.name}`}
            </span>
            <span className="cc-stepped-counter">Step {stepIdx + 1} of {steps.length}</span>
          </div>
        </div>
        <div className="cc-step-indicator">
          {steps.map((_, i) => (
            <div key={i} className="cc-step-cell">
              <div className={`cc-step-dot${i < stepIdx ? ' cc-step-dot--done' : ''}${i === stepIdx ? ' cc-step-dot--current' : ''}`}>
                {i < stepIdx ? <Check size={13} strokeWidth={3} /> : i + 1}
              </div>
              {i < steps.length - 1 && (
                <div className={`cc-step-line${i < stepIdx ? ' cc-step-line--done' : ''}`} />
              )}
            </div>
          ))}
        </div>
      </div>

      {/* ── Body ───────────────────────────────────── */}
      <div className="cc-stepped-body">
        {currentStep === 'type' && (
          <StepType platform={platform} igType={igType} onPick={pickIgType} />
        )}
        {currentStep === 'media' && (
          <StepMedia
            platform={platform}
            igType={igType}
            igConfig={igConfig}
            needsMedia={needsMedia}
            media={media}
            reachedMax={reachedMax}
            onPick={() => fileInputRef.current?.click()}
            onRemove={removeMedia}
            onClearAll={clearAllMedia}
          />
        )}
        {currentStep === 'caption' && (
          <StepCaption
            platform={platform}
            igType={igType}
            igConfig={igConfig}
            caption={caption}
            setCaption={setCaption}
            overLimit={overLimit}
            media={media}
            slideIdx={slideIdx}
            setSlideIdx={setSlideIdx}
            date={date}
            time={time}
          />
        )}
        {currentStep === 'time' && (
          <StepTime
            date={date}
            setDate={setDate}
            time={time}
            setTime={setTime}
          />
        )}

        {/* Hidden file input — shared across steps. */}
        <input
          ref={fileInputRef}
          type="file"
          accept={igConfig?.accept || 'image/*,video/*'}
          multiple={igType === 'carousel'}
          onChange={handleFiles}
          style={{ display: 'none' }}
        />
      </div>

      {/* ── Footer ─────────────────────────────────── */}
      <div className="cc-stepped-footer">
        <button
          className="cc-link-btn"
          onClick={handlePrev}
          disabled={stepIdx === 0 && !onBackToPicker}
        >
          <ArrowLeft size={14} /> Previous
        </button>

        <div className="cc-stepped-actions">
          {onDelete && (
            <button className="cc-ghost-btn cc-ghost-btn--danger" onClick={onDelete}>Delete</button>
          )}
          <button className="cc-ghost-btn" onClick={onClose}>Cancel</button>
          {stepIdx < steps.length - 1 ? (
            <button
              className="cc-primary-btn cc-primary-btn--lg"
              onClick={handleNext}
              disabled={!canProceed()}
            >
              Next <ArrowRight size={14} />
            </button>
          ) : (
            <button
              className="cc-primary-btn cc-primary-btn--lg"
              onClick={() => submit('scheduled')}
              disabled={!canProceed() || (needsMedia && media.length === 0)}
            >
              <Clock size={14} /> {existing ? 'Update post' : 'Schedule post'}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

// ─── Step: Instagram post type ─────────────────────────────────────────────

function StepType({ platform, igType, onPick }) {
  return (
    <div className="cc-step cc-step--centered">
      <h3 className="cc-step-title">What kind of {platform.name} content?</h3>
      <p className="cc-step-sub">Pick a format to continue.</p>
      <div className="cc-type-grid">
        {IG_TYPES.map((t) => {
          const active = igType === t.id;
          const label = typeLabel(platform.id, t.id);
          return (
            <button
              key={t.id}
              type="button"
              className={`cc-type-card cc-type-card--${platform.id}${active ? ' cc-type-card--active' : ''}`}
              onClick={() => onPick(t.id)}
            >
              <span className={`cc-type-icon cc-type-icon--${platform.id}`}>
                <t.Icon size={28} strokeWidth={1.75} />
              </span>
              <span className="cc-type-name">{label}</span>
              <span className="cc-type-desc">{t.tagline}</span>
            </button>
          );
        })}
      </div>
    </div>
  );
}

// ─── Step: Media upload ────────────────────────────────────────────────────

function StepMedia({ platform, igType, igConfig, needsMedia, media, reachedMax, onPick, onRemove, onClearAll }) {
  const tLabel = typeLabel(platform.id, igType);
  const title = igConfig ? `Upload your ${tLabel}` : 'Add media';
  const sub = igType === 'reel' ? 'A single vertical video · MP4'
    : igType === 'carousel' ? `Up to ${igConfig?.maxFiles || 10} images or videos`
    : igType === 'post' ? 'One image or video · JPG · PNG · MP4'
    : `Optional for ${platform.name}. JPG · PNG · MP4`;

  const gridAspect = igConfig?.aspect || '1 / 1';

  return (
    <div className="cc-step cc-step--centered">
      <h3 className="cc-step-title">{title}</h3>
      <p className="cc-step-sub">{sub}</p>

      {media.length === 0 ? (
        <button type="button" className="cc-drop-zone" onClick={onPick}>
          <span className="cc-drop-icon">
            {igType === 'reel' ? <Video size={28} /> : igType === 'carousel' ? <Layers size={28} /> : <ImageIcon size={28} />}
          </span>
          <span className="cc-drop-title">
            {igType === 'reel' ? 'Drop your video here or click to browse'
              : igType === 'carousel' ? 'Drop files here or click to browse'
              : 'Drop your file here or click to browse'}
          </span>
          <span className="cc-drop-sub">
            {igType === 'reel' ? 'Vertical 9:16 · MP4' : 'Images · videos · up to 100 MB each'}
          </span>
        </button>
      ) : (
        <div className="cc-media-grid-wrap">
          <button type="button" className="cc-media-clear" onClick={onClearAll}>
            Remove all
          </button>
          <div className={`cc-media-grid${igType === 'reel' ? ' cc-media-grid--reel' : ''}${igType !== 'reel' && igType !== 'carousel' ? ' cc-media-grid--single' : ''}`}>
            {media.map((m, idx) => (
              <div
                key={idx}
                className="cc-media-tile"
                style={{ aspectRatio: gridAspect }}
              >
                {m.type === 'video' ? (
                  <VideoPlayer src={m.url} />
                ) : (
                  <img src={m.url} alt={m.name} />
                )}
                <button
                  type="button"
                  className="cc-media-remove"
                  onClick={(e) => { e.stopPropagation(); onRemove(idx); }}
                  aria-label="Remove"
                >
                  <X size={12} />
                </button>
                {igType === 'carousel' && <span className="cc-media-index">{idx + 1}</span>}
              </div>
            ))}
            {igType === 'carousel' && !reachedMax && (
              <button
                type="button"
                className="cc-media-tile cc-media-tile--add"
                onClick={onPick}
                style={{ aspectRatio: gridAspect }}
              >
                <Plus size={28} />
              </button>
            )}
          </div>
          {needsMedia && igConfig && (
            <div className="cc-media-meta">
              {media.length} / {igConfig.maxFiles} {media.length === 1 ? 'file' : 'files'}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ─── Step: Caption with IG preview ─────────────────────────────────────────

function StepCaption({ platform, igType, igConfig, caption, setCaption, overLimit, media, slideIdx, setSlideIdx, date }) {
  const isIg = platform.id === 'instagram';
  const isFb = platform.id === 'facebook';
  const isLi = platform.id === 'linkedin';
  const captionFirst = isLi;

  const prettyDate = (() => {
    try {
      const d = parseISODate(date);
      return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
    } catch { return ''; }
  })();

  const aspectRatio = igConfig?.aspect || '1 / 1';
  const showMedia = isIg ? true : media.length > 0;

  const mediaBlock = (
    <div
      className={`cc-ig-preview-media${igType === 'reel' ? ' cc-ig-preview-media--reel' : ''}`}
      style={{ aspectRatio }}
    >
      {media.length > 0 ? (
        <>
          {media[slideIdx].type === 'video' ? (
            <VideoPlayer key={media[slideIdx].url} src={media[slideIdx].url} size={22} />
          ) : (
            <img src={media[slideIdx].url} alt="" />
          )}
          {igType === 'carousel' && media.length > 1 && (
            <>
              {slideIdx > 0 && (
                <button
                  type="button"
                  className="cc-ig-nav cc-ig-nav--prev"
                  onClick={() => setSlideIdx((i) => Math.max(0, i - 1))}
                >
                  <ChevronLeft size={16} />
                </button>
              )}
              {slideIdx < media.length - 1 && (
                <button
                  type="button"
                  className="cc-ig-nav cc-ig-nav--next"
                  onClick={() => setSlideIdx((i) => Math.min(media.length - 1, i + 1))}
                >
                  <ChevronRight size={16} />
                </button>
              )}
              <div className="cc-ig-dots">
                {media.map((_, i) => (
                  <span key={i} className={`cc-ig-dot${i === slideIdx ? ' cc-ig-dot--active' : ''}`} />
                ))}
              </div>
            </>
          )}
        </>
      ) : (
        <div className="cc-ig-empty">No media yet</div>
      )}
    </div>
  );

  const placeholder = isIg ? 'Type your caption here'
    : isFb ? 'Share what\u2019s on your mind…'
    : 'What do you want to talk about?';

  const captionBlock = (
    <div className={`cc-ig-preview-caption${captionFirst ? ' cc-ig-preview-caption--top' : ''}`}>
      <CaptionEditor
        value={caption}
        onChange={setCaption}
        placeholder={placeholder}
        prefix={isIg ? 'your_account' : null}
      />
      <div className={`cc-ig-inline-counter${overLimit ? ' cc-ig-inline-counter--over' : ''}`}>
        {caption.length.toLocaleString()} / {platform.limit.toLocaleString()}
      </div>
    </div>
  );

  return (
    <div className="cc-step">
      <h3 className="cc-step-title cc-step-title--left">Write your caption</h3>
      <p className="cc-step-sub cc-step-sub--left">
        Preview how your post will look on {platform.name}.
      </p>

      <div className={`cc-ig-preview cc-ig-preview--${platform.id}`}>
        <PreviewHeader platform={platform} prettyDate={prettyDate} />
        {captionFirst ? (
          <>
            {captionBlock}
            {showMedia && mediaBlock}
          </>
        ) : (
          <>
            {showMedia && mediaBlock}
            {captionBlock}
          </>
        )}
      </div>

      {igConfig && (
        <div className="cc-chip-row">
          <span className="cc-chip">{typeLabel(platform.id, igConfig.id)}</span>
          <span className="cc-chip">{media.length} {media.length === 1 ? 'file' : 'files'}</span>
        </div>
      )}
    </div>
  );
}

// ─── Preview header (avatar + name + date) ─────────────────────────────────

function PreviewHeader({ platform, prettyDate }) {
  const isIg = platform.id === 'instagram';
  const displayName = isIg ? 'your_account' : 'Your Name';
  const subline = platform.id === 'linkedin'
    ? 'Founder & CEO · Scheduled'
    : isIg
      ? (prettyDate || 'Scheduled')
      : `Scheduled · ${prettyDate || ''}`.trim();

  return (
    <div className="cc-ig-preview-head">
      <span className={`cc-ig-avatar cc-ig-avatar--${platform.id}`}>
        {isIg ? (
          <span className="cc-ig-avatar-inner" />
        ) : (
          <span className="cc-ig-avatar-icon" style={{ color: '#fff' }}>
            {platform.icon}
          </span>
        )}
      </span>
      <div className="cc-ig-preview-meta">
        <span className="cc-ig-username">{displayName}</span>
        <span className="cc-ig-date">{subline}</span>
      </div>
    </div>
  );
}

// ─── Playable video thumbnail ──────────────────────────────────────────────

function VideoPlayer({ src, size = 18 }) {
  const ref = useRef(null);
  const [playing, setPlaying] = useState(false);

  const toggle = (e) => {
    if (e) e.stopPropagation();
    const v = ref.current;
    if (!v) return;
    if (playing) v.pause();
    else v.play();
  };

  return (
    <>
      <video
        ref={ref}
        src={src}
        muted
        playsInline
        loop
        onPlay={() => setPlaying(true)}
        onPause={() => setPlaying(false)}
        onEnded={() => setPlaying(false)}
        onClick={toggle}
      />
      {!playing && (
        <button
          type="button"
          className="cc-media-play"
          onClick={toggle}
          aria-label="Play video"
        >
          <Play size={size} fill="currentColor" />
        </button>
      )}
    </>
  );
}

// ─── Inline Instagram caption editor ───────────────────────────────────────
// A contentEditable div whose ::before pseudo-element renders "your_account "
// inline, so typed text flows right after the username and wraps to the left
// margin on subsequent lines — matching how Instagram actually renders captions.

// Zero-width space — invisible but gives an empty contentEditable span
// enough layout to render a caret.
const ZWSP = '\u200B';

function CaptionEditor({ value, onChange, placeholder, prefix = null }) {
  const ref = useRef(null);

  const caretToEnd = () => {
    const el = ref.current;
    if (!el) return;
    const sel = window.getSelection();
    if (!sel) return;
    const range = document.createRange();
    range.selectNodeContents(el);
    range.collapse(false);
    sel.removeAllRanges();
    sel.addRange(range);
  };

  useEffect(() => {
    if (!ref.current) return;
    ref.current.textContent = value === '' ? ZWSP : value;
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleInput = (e) => {
    const raw = e.currentTarget.innerText.replace(/\u200B/g, '');
    onChange(raw);
    if (raw === '' && e.currentTarget.textContent !== ZWSP) {
      e.currentTarget.textContent = ZWSP;
      caretToEnd();
    }
  };

  const handlePaste = (e) => {
    e.preventDefault();
    const text = e.clipboardData.getData('text/plain');
    document.execCommand('insertText', false, text);
  };

  const focusEditable = () => {
    const el = ref.current;
    if (!el) return;
    el.focus();
    caretToEnd();
  };

  return (
    <div
      className={`cc-ig-caption-wrap${prefix ? '' : ' cc-ig-caption-wrap--block'}`}
      onMouseDown={(e) => {
        if (e.target !== ref.current) {
          e.preventDefault();
          focusEditable();
        }
      }}
    >
      {prefix && (
        <span className="cc-ig-inline-username" contentEditable={false}>{prefix} </span>
      )}
      <span
        ref={ref}
        className={`cc-ig-caption-edit${value.length === 0 ? ' cc-ig-caption-edit--empty' : ''}`}
        contentEditable
        suppressContentEditableWarning
        onInput={handleInput}
        onPaste={handlePaste}
        onFocus={() => {
          if (value.length === 0) caretToEnd();
        }}
        data-placeholder={placeholder}
        role="textbox"
        aria-label="Caption"
      />
    </div>
  );
}

// ─── Step: Date and time ───────────────────────────────────────────────────

const TIME_PRESETS = [
  { time: '09:00', label: 'Morning' },
  { time: '12:00', label: 'Noon' },
  { time: '15:00', label: 'Afternoon' },
  { time: '18:00', label: 'Evening' },
  { time: '20:00', label: 'Prime time' },
  { time: '22:00', label: 'Night' },
];

function StepTime({ date, setDate, time, setTime }) {
  const dateObj = parseISODate(date);
  const dateLabel = dateObj.toLocaleDateString(undefined, {
    weekday: 'long', month: 'long', day: 'numeric', year: 'numeric',
  });

  return (
    <div className="cc-step cc-step--centered">
      <div className="cc-step-hero">
        <Clock size={28} strokeWidth={1.9} />
      </div>
      <h3 className="cc-step-title">When should it go live?</h3>
      <p className="cc-step-sub">Pick the date and time. Your audience's timezone is auto-detected.</p>

      <div className="cc-time-card">
        <div className="cc-time-card-label">Selected date</div>
        <div className="cc-time-card-value">{dateLabel}</div>
        <input
          type="date"
          className="cc-input cc-input--lg"
          value={date}
          onChange={(e) => setDate(e.target.value)}
        />
      </div>

      <div className="cc-time-big-wrap">
        <input
          type="time"
          className="cc-time-big"
          value={time}
          onChange={(e) => setTime(e.target.value)}
        />
      </div>

      <div className="cc-preset-grid">
        {TIME_PRESETS.map((p) => (
          <button
            key={p.time}
            type="button"
            className={`cc-preset-btn${time === p.time ? ' cc-preset-btn--active' : ''}`}
            onClick={() => setTime(p.time)}
          >
            <span className="cc-preset-time">{p.time}</span>
            <span className="cc-preset-label">{p.label}</span>
          </button>
        ))}
      </div>

      <p className="cc-tz-note">
        Timezone: {Intl.DateTimeFormat().resolvedOptions().timeZone}
      </p>
    </div>
  );
}
