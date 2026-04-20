import { useState, useEffect, useCallback } from 'react';
import { X, UserPlus, Play, User, Loader, RefreshCw, ExternalLink, PlusCircle, Check } from 'lucide-react';
import { getOutlierCreators, addOutlierCreator, deleteOutlierCreator, getOutlierVideos, addOutlierToContext, getOutlierThumbnailUrl, getContentItems } from '../lib/api';
import './Pages.css';
import './OutlierDetector.css';

const PLATFORMS = [
  {
    id: 'youtube',
    name: 'YouTube',
    color: '#FF0000',
    bgLight: '#fff5f5',
    icon: (
      <svg viewBox="0 0 24 24" fill="currentColor" className="od-platform-icon">
        <path d="M23.498 6.186a3.016 3.016 0 00-2.122-2.136C19.505 3.546 12 3.546 12 3.546s-7.505 0-9.377.504A3.017 3.017 0 00.502 6.186C0 8.07 0 12 0 12s0 3.93.502 5.814a3.016 3.016 0 002.122 2.136c1.871.504 9.376.504 9.376.504s7.505 0 9.377-.504a3.015 3.015 0 002.122-2.136C24 15.93 24 12 24 12s0-3.93-.502-5.814zM9.545 15.568V8.432L15.818 12l-6.273 3.568z" />
      </svg>
    ),
  },
  {
    id: 'instagram',
    name: 'Instagram',
    color: '#E4405F',
    bgLight: '#fef2f4',
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className="od-platform-icon">
        <rect x="2" y="2" width="20" height="20" rx="5" />
        <circle cx="12" cy="12" r="5" />
        <circle cx="17.5" cy="6.5" r="1" fill="currentColor" stroke="none" />
      </svg>
    ),
  },
  {
    id: 'tiktok',
    name: 'TikTok',
    color: '#010101',
    bgLight: '#f5f5f5',
    icon: (
      <svg viewBox="0 0 24 24" fill="currentColor" className="od-platform-icon">
        <path d="M19.59 6.69a4.83 4.83 0 01-3.77-4.25V2h-3.45v13.67a2.89 2.89 0 01-2.88 2.5 2.89 2.89 0 01-2.89-2.89 2.89 2.89 0 012.89-2.89c.28 0 .54.04.79.1v-3.5a6.37 6.37 0 00-.79-.05A6.34 6.34 0 003.15 15a6.34 6.34 0 006.34 6.34 6.34 6.34 0 006.34-6.34V8.72a8.2 8.2 0 004.76 1.52V6.79a4.84 4.84 0 01-1-.1z" />
      </svg>
    ),
  },
  {
    id: 'linkedin',
    name: 'LinkedIn',
    color: '#0A66C2',
    bgLight: '#eff6fb',
    icon: (
      <svg viewBox="0 0 24 24" fill="currentColor" className="od-platform-icon">
        <path d="M20.447 20.452h-3.554v-5.569c0-1.328-.027-3.037-1.852-3.037-1.853 0-2.136 1.445-2.136 2.939v5.667H9.351V9h3.414v1.561h.046c.477-.9 1.637-1.85 3.37-1.85 3.601 0 4.267 2.37 4.267 5.455v6.286zM5.337 7.433a2.062 2.062 0 01-2.063-2.065 2.063 2.063 0 112.063 2.065zm1.782 13.019H3.555V9h3.564v11.452zM22.225 0H1.771C.792 0 0 .774 0 1.729v20.542C0 23.227.792 24 1.771 24h20.451C23.2 24 24 23.227 24 22.271V1.729C24 .774 23.2 0 22.222 0h.003z" />
      </svg>
    ),
  },
];

const METRICS = ['Views', 'Likes', 'Comments'];
const MULTIPLIERS = ['2x', '5x', '10x'];
const RECENT_KEY = 'recent';

function getPlatform(id) {
  return PLATFORMS.find((p) => p.id === id);
}

function formatNumber(n) {
  if (n >= 1_000_000) return (n / 1_000_000).toFixed(1).replace(/\.0$/, '') + 'M';
  if (n >= 1_000) return (n / 1_000).toFixed(1).replace(/\.0$/, '') + 'K';
  return n.toString();
}

function getMultiplier(video, metric) {
  if (metric === 'Views') return video.views_multiplier;
  if (metric === 'Likes') return video.likes_multiplier;
  if (metric === 'Comments') return video.comments_multiplier;
  return video.views_multiplier;
}

function getMetricValue(video, metric) {
  if (metric === 'Views') return video.views;
  if (metric === 'Likes') return video.likes;
  if (metric === 'Comments') return video.comments;
  return video.views;
}

function getAvgValue(creator, metric) {
  if (metric === 'Views') return creator.avg_views;
  if (metric === 'Likes') return creator.avg_likes;
  if (metric === 'Comments') return creator.avg_comments;
  return creator.avg_views;
}

export default function OutlierDetector() {
  const [addCreatorOpen, setAddCreatorOpen] = useState(false);
  const [selectedPlatform, setSelectedPlatform] = useState(null);
  const [usernameInput, setUsernameInput] = useState('');
  const [creators, setCreators] = useState([]);
  const [videos, setVideos] = useState([]);
  const [loading, setLoading] = useState(true);
  const [adding, setAdding] = useState(false);
  const [addError, setAddError] = useState('');

  const [activeMetric, setActiveMetric] = useState('Views');
  const [activeMultiplier, setActiveMultiplier] = useState(null);
  const [activeCreatorFilter, setActiveCreatorFilter] = useState(null);
  const [activePlatformFilter, setActivePlatformFilter] = useState(null);
  const [deleteConfirmId, setDeleteConfirmId] = useState(null);
  // URLs of videos already added to the content-context pool. Seeded from
  // content_items on mount so the green "Added" badge persists across
  // navigation — using URLs (not video IDs) because that's the column that
  // survives outside this page's local state.
  const [addedToContext, setAddedToContext] = useState(new Set());
  const [addingToContext, setAddingToContext] = useState(null);
  const [hasMore, setHasMore] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const PAGE_SIZE = 50;

  // When activeMultiplier is 'recent' we switch the backend sort to
  // published_at DESC so deep-paginated recent posts aren't missed.
  const sortMode = activeMultiplier === RECENT_KEY ? 'recent' : undefined;

  // Filtering by a single creator should show that creator's full catalog,
  // not whatever happens to land in the top-N by multiplier across everyone.
  // Push the filter down to the backend query with a larger page size.
  const fetchParams = () => ({
    limit: PAGE_SIZE,
    sort: sortMode,
    creatorId: activeCreatorFilter || undefined,
    platform: activePlatformFilter || undefined,
  });

  // Load creators and videos on mount
  useEffect(() => {
    Promise.all([getOutlierCreators(), getOutlierVideos({ limit: PAGE_SIZE })])
      .then(([c, v]) => {
        setCreators(c.creators || []);
        const vids = v.videos || [];
        setVideos(vids);
        setHasMore(vids.length >= PAGE_SIZE);
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  // Seed addedToContext from existing content_items so the "Added" badge
  // persists across navigation. Matches on URL since that's what the
  // /api/content-items/from-outlier endpoint stores.
  useEffect(() => {
    getContentItems().then(({ items }) => {
      const savedUrls = (items || [])
        .filter((item) => item.type === 'social' && item.metadata?.source === 'outlier-detector' && item.url)
        .map((item) => item.url);
      if (savedUrls.length) {
        setAddedToContext((prev) => {
          const next = new Set(prev);
          for (const u of savedUrls) next.add(u);
          return next;
        });
      }
    }).catch(() => {});
  }, []);

  // Refetch whenever sort / creator / platform filters change so results
  // match the active filter.
  useEffect(() => {
    if (loading) return;
    getOutlierVideos(fetchParams()).then(({ videos: v }) => {
      const vids = v || [];
      setVideos(vids);
      setHasMore(vids.length >= PAGE_SIZE);
    }).catch(() => {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sortMode, activeCreatorFilter, activePlatformFilter]);

  const refreshVideos = useCallback(() => {
    getOutlierVideos(fetchParams()).then(({ videos: v }) => {
      const vids = v || [];
      setVideos(vids);
      setHasMore(vids.length >= PAGE_SIZE);
    }).catch(() => {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sortMode, activeCreatorFilter, activePlatformFilter]);

  const loadMoreVideos = useCallback(async () => {
    if (loadingMore || !hasMore) return;
    setLoadingMore(true);
    try {
      const { videos: more } = await getOutlierVideos({ ...fetchParams(), offset: videos.length });
      const fetched = more || [];
      setVideos(prev => [...prev, ...fetched]);
      setHasMore(fetched.length >= PAGE_SIZE);
    } catch { /* noop */ }
    setLoadingMore(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loadingMore, hasMore, videos.length, sortMode, activeCreatorFilter, activePlatformFilter]);

  const handleFollowCreator = async () => {
    if (!usernameInput.trim() || !selectedPlatform) return;
    const username = usernameInput.trim().startsWith('@') ? usernameInput.trim() : '@' + usernameInput.trim();

    setAdding(true);
    setAddError('');
    try {
      const { creator } = await addOutlierCreator(selectedPlatform, username);
      setCreators((prev) => {
        const exists = prev.find((c) => c.id === creator.id);
        if (exists) return prev.map((c) => c.id === creator.id ? creator : c);
        return [creator, ...prev];
      });
      setUsernameInput('');
      setSelectedPlatform(null);
      setAddCreatorOpen(false);
      // Refresh videos
      refreshVideos();
    } catch (err) {
      setAddError(err.message);
    } finally {
      setAdding(false);
    }
  };

  const handleRemoveCreator = async (id) => {
    setCreators((prev) => prev.filter((c) => c.id !== id));
    setVideos((prev) => prev.filter((v) => v.creator_id !== id));
    if (activeCreatorFilter === id) setActiveCreatorFilter(null);
    setDeleteConfirmId(null);
    deleteOutlierCreator(id).catch(() => {});
  };

  const handleAddToContext = async (video) => {
    const creator = video.outlier_creators || {};
    setAddingToContext(video.id);
    try {
      await addOutlierToContext({
        url: video.url,
        title: video.title,
        thumbnail_url: video.thumbnail_url,
        platform: video.platform,
        video_id: video.video_id,
        creator_name: creator.display_name || creator.username || '',
      });
      setAddedToContext((prev) => new Set([...prev, video.url]));
    } catch (err) {
      console.error('Failed to add to context:', err);
    } finally {
      setAddingToContext(null);
    }
  };

  // Apply filters. "Most Recent" disables the multiplier threshold and
  // swaps the sort order to published_at DESC.
  const filteredVideos = videos.filter((video) => {
    if (activeMultiplier && activeMultiplier !== RECENT_KEY) {
      const threshold = parseFloat(activeMultiplier);
      const multiplier = getMultiplier(video, activeMetric);
      if (multiplier < threshold) return false;
    }

    if (activeCreatorFilter && video.creator_id !== activeCreatorFilter) return false;
    if (activePlatformFilter && video.platform !== activePlatformFilter) return false;

    return true;
  }).sort((a, b) => {
    if (activeMultiplier === RECENT_KEY) {
      return new Date(b.published_at || 0) - new Date(a.published_at || 0);
    }
    return getMultiplier(b, activeMetric) - getMultiplier(a, activeMetric);
  });

  if (loading) {
    return (
      <div className="page-container">
        <h1 className="page-title">Outlier Detector</h1>
        <div className="od-loading"><Loader size={24} className="od-spin" /> Loading...</div>
      </div>
    );
  }

  return (
    <div className="page-container">
      <h1 className="page-title">Outlier Detector</h1>

      {/* Add Creators Section */}
      <div className="od-creators-section">
        <div className="od-add-creator">
          {!addCreatorOpen ? (
            <>
              <button
                className="od-add-creator-btn"
                onClick={() => setAddCreatorOpen(true)}
              >
                <UserPlus size={18} />
                Add Creators to Follow
              </button>
              <p className="od-add-creator-hint">Follow creators to detect their outlier content.</p>
            </>
          ) : (
            <div className="od-add-creator-flow">
              {!selectedPlatform ? (
                <>
                  <span className="od-flow-label">Select platform</span>
                  <div className="od-platform-pills">
                    {PLATFORMS.map((p) => (
                      <button
                        key={p.id}
                        className="od-platform-pill"
                        style={{ borderColor: p.color, color: p.color }}
                        onClick={() => setSelectedPlatform(p.id)}
                      >
                        {p.icon}
                        {p.name}
                      </button>
                    ))}
                  </div>
                </>
              ) : (
                <>
                  <div className="od-username-row">
                    <div
                      className="od-selected-badge"
                      style={{
                        background: getPlatform(selectedPlatform)?.bgLight,
                        color: getPlatform(selectedPlatform)?.color,
                      }}
                    >
                      {getPlatform(selectedPlatform)?.icon}
                      {getPlatform(selectedPlatform)?.name}
                    </div>
                    <button
                      className="od-change-platform"
                      onClick={() => { setSelectedPlatform(null); setAddError(''); }}
                    >
                      Change
                    </button>
                  </div>
                  <div className="od-username-entry">
                    <input
                      type="text"
                      className="od-username-input"
                      placeholder="@username or channel name"
                      value={usernameInput}
                      onChange={(e) => setUsernameInput(e.target.value)}
                      onKeyDown={(e) => e.key === 'Enter' && handleFollowCreator()}
                      autoFocus
                      disabled={adding}
                    />
                    <button
                      className="od-follow-btn"
                      disabled={!usernameInput.trim() || adding}
                      onClick={handleFollowCreator}
                    >
                      {adding ? <Loader size={14} className="od-spin" /> : 'Follow Creator'}
                    </button>
                  </div>
                  {addError && <span className="od-add-error">{addError}</span>}
                </>
              )}
              <button
                className="od-flow-cancel"
                onClick={() => {
                  setAddCreatorOpen(false);
                  setSelectedPlatform(null);
                  setUsernameInput('');
                  setAddError('');
                }}
              >
                Cancel
              </button>
            </div>
          )}
        </div>

        {creators.length > 0 && (
          <div className="od-creator-chips">
            {creators.map((c) => {
              const plat = getPlatform(c.platform);
              return (
                <div key={c.id} className="od-creator-chip">
                  <div className="od-creator-avatar">
                    {c.avatar_url ? (
                      <img src={c.avatar_url} alt="" className="od-creator-avatar-img" referrerPolicy="no-referrer" />
                    ) : (
                      <User size={14} />
                    )}
                  </div>
                  <span className="od-creator-chip-plat" style={{ color: plat?.color }}>
                    {plat?.icon}
                  </span>
                  <span className="od-creator-chip-name">{c.display_name || c.username}</span>
                  <button
                    className="od-creator-chip-remove"
                    onClick={() => setDeleteConfirmId(c.id)}
                  >
                    <X size={12} />
                  </button>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Filters */}
      {creators.length > 0 && (
        <div className="od-filters">
          <div className="od-filter-group">
            <span className="od-filter-label">Metric</span>
            <div className="od-filter-pills">
              {METRICS.map((m) => (
                <button
                  key={m}
                  className={`od-filter-pill ${activeMetric === m ? 'od-filter-pill--active' : ''}`}
                  onClick={() => setActiveMetric(m)}
                >
                  {m}
                </button>
              ))}
            </div>
          </div>

          <div className="od-filter-group">
            <span className="od-filter-label">Outlier</span>
            <div className="od-filter-pills">
              {MULTIPLIERS.map((m) => (
                <button
                  key={m}
                  className={`od-filter-pill ${activeMultiplier === m ? 'od-filter-pill--active' : ''}`}
                  onClick={() => setActiveMultiplier(activeMultiplier === m ? null : m)}
                >
                  {m}+
                </button>
              ))}
              <button
                className={`od-filter-pill ${activeMultiplier === RECENT_KEY ? 'od-filter-pill--active' : ''}`}
                onClick={() => setActiveMultiplier(activeMultiplier === RECENT_KEY ? null : RECENT_KEY)}
              >
                Most Recent
              </button>
            </div>
          </div>

          {creators.length > 1 && (
            <div className="od-filter-group">
              <span className="od-filter-label">Creator</span>
              <div className="od-filter-pills">
                {creators.map((c) => (
                  <button
                    key={c.id}
                    className={`od-filter-pill od-filter-pill--creator ${activeCreatorFilter === c.id ? 'od-filter-pill--active' : ''}`}
                    onClick={() => setActiveCreatorFilter(activeCreatorFilter === c.id ? null : c.id)}
                  >
                    {c.avatar_url ? (
                      <img src={c.avatar_url} alt="" className="od-filter-pill-img" referrerPolicy="no-referrer" />
                    ) : (
                      <span className="od-filter-pill-avatar"><User size={10} /></span>
                    )}
                    {c.display_name || c.username}
                  </button>
                ))}
              </div>
            </div>
          )}

          {creators.some((c) => c.platform !== creators[0]?.platform) && (
            <div className="od-filter-group">
              <span className="od-filter-label">Platform</span>
              <div className="od-filter-pills">
                {PLATFORMS.filter((p) => creators.some((c) => c.platform === p.id)).map((p) => (
                  <button
                    key={p.id}
                    className={`od-filter-pill ${activePlatformFilter === p.id ? 'od-filter-pill--active' : ''}`}
                    onClick={() => setActivePlatformFilter(activePlatformFilter === p.id ? null : p.id)}
                  >
                    {p.icon}
                    {p.name}
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {/* Content Grid */}
      <div className="od-grid">
        {filteredVideos.map((video) => {
          const creator = video.outlier_creators || {};
          const plat = getPlatform(video.platform);
          const multiplier = getMultiplier(video, activeMetric);
          const metricValue = getMetricValue(video, activeMetric);
          const avgValue = getAvgValue(creator, activeMetric);

          return (
            <div key={video.id} className="od-card od-card--landscape">
              <a href={video.url} target="_blank" rel="noopener noreferrer" className="od-card-link">
                <div className="od-card-thumbnail od-card-thumbnail--landscape">
                  {video.thumbnail_url || video.platform === 'youtube' ? (
                    <img
                      // YouTube CDN is friendly in the browser — use the
                      // standard img.youtube.com path. For every other
                      // platform go through the backend proxy immediately:
                      // Instagram/TikTok/LinkedIn CDNs gate by Referer and
                      // their signed URLs expire, so direct <img> loads
                      // silently produce broken images where onError may
                      // never fire. The proxy bypasses both problems.
                      src={video.platform === 'youtube'
                        ? (video.thumbnail_url || '').replace('i.ytimg.com', 'img.youtube.com')
                          || `https://img.youtube.com/vi/${video.video_id}/mqdefault.jpg`
                        : getOutlierThumbnailUrl(video.id)}
                      alt=""
                      className="od-card-thumb-img"
                      loading="lazy"
                      referrerPolicy="no-referrer"
                      onError={(e) => {
                        const step = e.target.dataset.fallback || '0';
                        if (step === '0' && video.platform === 'youtube') {
                          e.target.dataset.fallback = '1';
                          // mqdefault exists for every YouTube video id.
                          e.target.src = `https://img.youtube.com/vi/${video.video_id}/mqdefault.jpg`;
                        } else if (step === '0') {
                          // Proxy failed (upstream 4xx/expired signed URL).
                          // Fall back to the creator avatar so the card
                          // isn't empty.
                          e.target.dataset.fallback = '1';
                          const avatar = video.outlier_creators?.avatar_url || creator.avatar_url;
                          if (avatar) {
                            e.target.src = avatar;
                            e.target.classList.add('od-card-thumb-img--avatar-fallback');
                          } else {
                            e.target.style.display = 'none';
                          }
                        } else {
                          e.target.style.display = 'none';
                        }
                      }}
                    />
                  ) : (
                    <div className="od-card-thumb-placeholder" />
                  )}
                  <div className="od-card-play">
                    <Play size={24} fill="white" />
                  </div>
                  <div className="od-card-platform-badge" style={{ color: plat?.color }}>
                    {plat?.icon}
                  </div>
                </div>
              </a>
              <div className="od-card-info">
                <div className="od-card-info-left">
                  <div className="od-card-multiplier">
                    <span className="od-card-multiplier-value">{multiplier}x</span>
                    <span className="od-card-multiplier-label">{activeMetric}</span>
                  </div>
                  <div className="od-card-stats">
                    {formatNumber(metricValue)} vs avg {formatNumber(avgValue)}
                  </div>
                  <div className="od-card-title" title={video.title}>{video.title}</div>
                  <div className="od-card-creator">
                    {creator.avatar_url && <img src={creator.avatar_url} alt="" className="od-card-creator-img" referrerPolicy="no-referrer" />}
                    {creator.display_name || creator.username}
                  </div>
                </div>
                {addedToContext.has(video.url) ? (
                  <button className="od-add-context-btn od-add-context-btn--added" disabled>
                    <Check size={14} /> Added
                  </button>
                ) : (
                  <button
                    className="od-add-context-btn"
                    onClick={() => handleAddToContext(video)}
                    disabled={addingToContext === video.id}
                  >
                    {addingToContext === video.id ? <Loader size={14} className="od-spin" /> : <PlusCircle size={14} />}
                    {addingToContext === video.id ? 'Adding...' : 'Add to Context'}
                  </button>
                )}
              </div>
            </div>
          );
        })}
      </div>

      {hasMore && filteredVideos.length > 0 && (
        <div style={{ display: 'flex', justifyContent: 'center', padding: '20px 0 32px' }}>
          <button
            onClick={loadMoreVideos}
            disabled={loadingMore}
            style={{
              padding: '10px 32px',
              borderRadius: 10,
              border: '1px solid var(--border-light)',
              background: 'var(--bg-white)',
              color: 'var(--text-primary)',
              fontSize: 13,
              fontWeight: 600,
              fontFamily: 'inherit',
              cursor: loadingMore ? 'default' : 'pointer',
              opacity: loadingMore ? 0.6 : 1,
            }}
          >
            {loadingMore ? 'Loading...' : 'Load More'}
          </button>
        </div>
      )}

      {filteredVideos.length === 0 && creators.length > 0 && (
        <div className="od-empty">
          No outlier content matches your filters. Try lowering the multiplier threshold.
        </div>
      )}

      {creators.length === 0 && (
        <div className="od-empty">
          Follow creators to start detecting their viral outlier content.
        </div>
      )}

      {deleteConfirmId && (
        <div className="od-modal-overlay" onClick={() => setDeleteConfirmId(null)}>
          <div className="od-modal" onClick={(e) => e.stopPropagation()}>
            <p className="od-modal-text">Remove this creator and all their videos?</p>
            <div className="od-modal-actions">
              <button className="od-modal-cancel" onClick={() => setDeleteConfirmId(null)}>
                Cancel
              </button>
              <button className="od-modal-confirm" onClick={() => handleRemoveCreator(deleteConfirmId)}>
                Remove
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
