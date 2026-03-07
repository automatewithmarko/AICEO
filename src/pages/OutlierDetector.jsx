import { useState } from 'react';
import { X, UserPlus, Play, User } from 'lucide-react';
import './Pages.css';
import './OutlierDetector.css';

const PLATFORMS = [
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
];

const METRICS = ['Views', 'Likes', 'Comments'];
const MULTIPLIERS = ['2x', '5x', '10x'];

const MOCK_OUTLIER_CARDS = [
  { id: 1, creatorUsername: '@garyvee', platform: 'instagram', multiplier: 12.4, metric: 'Views', metricValue: '2.4M', avgValue: '194K', thumbnailHue: 280 },
  { id: 2, creatorUsername: '@mrbeast', platform: 'youtube', multiplier: 8.7, metric: 'Likes', metricValue: '1.8M', avgValue: '207K', thumbnailHue: 200 },
  { id: 3, creatorUsername: '@charlidamelio', platform: 'tiktok', multiplier: 5.2, metric: 'Views', metricValue: '18M', avgValue: '3.5M', thumbnailHue: 320 },
  { id: 4, creatorUsername: '@garyvee', platform: 'tiktok', multiplier: 4.8, metric: 'Comments', metricValue: '24K', avgValue: '5K', thumbnailHue: 160 },
  { id: 5, creatorUsername: '@mrbeast', platform: 'youtube', multiplier: 6.1, metric: 'Views', metricValue: '45M', avgValue: '7.4M', thumbnailHue: 40 },
  { id: 6, creatorUsername: '@charlidamelio', platform: 'instagram', multiplier: 3.5, metric: 'Likes', metricValue: '890K', avgValue: '254K', thumbnailHue: 260 },
  { id: 7, creatorUsername: '@garyvee', platform: 'youtube', multiplier: 7.3, metric: 'Views', metricValue: '5.1M', avgValue: '699K', thumbnailHue: 120 },
  { id: 8, creatorUsername: '@charlidamelio', platform: 'tiktok', multiplier: 2.8, metric: 'Comments', metricValue: '15K', avgValue: '5.4K', thumbnailHue: 350 },
];

function getPlatform(id) {
  return PLATFORMS.find((p) => p.id === id);
}

export default function OutlierDetector() {
  const [addCreatorOpen, setAddCreatorOpen] = useState(false);
  const [selectedPlatform, setSelectedPlatform] = useState(null);
  const [usernameInput, setUsernameInput] = useState('');
  const [creators, setCreators] = useState([]);

  const [activeMetric, setActiveMetric] = useState('Views');
  const [activeMultiplier, setActiveMultiplier] = useState(null);
  const [activeCreatorFilter, setActiveCreatorFilter] = useState(null);
  const [activePlatformFilter, setActivePlatformFilter] = useState(null);
  const [deleteConfirmId, setDeleteConfirmId] = useState(null);

  const handleFollowCreator = () => {
    if (!usernameInput.trim() || !selectedPlatform) return;
    const username = usernameInput.trim().startsWith('@') ? usernameInput.trim() : '@' + usernameInput.trim();
    setCreators((prev) => [
      ...prev,
      { id: Date.now().toString(), username, platform: selectedPlatform },
    ]);
    setUsernameInput('');
    setSelectedPlatform(null);
    setAddCreatorOpen(false);
  };

  const handleRemoveCreator = (id) => {
    setCreators((prev) => prev.filter((c) => c.id !== id));
    if (activeCreatorFilter === id) setActiveCreatorFilter(null);
    setDeleteConfirmId(null);
  };

  const filteredCards = MOCK_OUTLIER_CARDS.filter((card) => {
    if (activeMultiplier) {
      const threshold = parseFloat(activeMultiplier);
      if (card.multiplier < threshold) return false;
    }
    if (activeCreatorFilter) {
      const creator = creators.find((c) => c.id === activeCreatorFilter);
      if (creator && card.creatorUsername !== creator.username) return false;
    }
    if (activePlatformFilter && card.platform !== activePlatformFilter) return false;
    return true;
  });

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
              <p className="od-add-creator-hint">Or press Ctrl+V with a creator's URL in your clipboard.</p>
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
                      onClick={() => setSelectedPlatform(null)}
                    >
                      Change
                    </button>
                  </div>
                  <div className="od-username-entry">
                    <input
                      type="text"
                      className="od-username-input"
                      placeholder="@username"
                      value={usernameInput}
                      onChange={(e) => setUsernameInput(e.target.value)}
                      onKeyDown={(e) => e.key === 'Enter' && handleFollowCreator()}
                      autoFocus
                    />
                    <button
                      className="od-follow-btn"
                      disabled={!usernameInput.trim()}
                      onClick={handleFollowCreator}
                    >
                      Follow Creator
                    </button>
                  </div>
                </>
              )}
              <button
                className="od-flow-cancel"
                onClick={() => {
                  setAddCreatorOpen(false);
                  setSelectedPlatform(null);
                  setUsernameInput('');
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
                    <User size={14} />
                  </div>
                  <span className="od-creator-chip-plat" style={{ color: plat?.color }}>
                    {plat?.icon}
                  </span>
                  <span className="od-creator-chip-name">{c.username}</span>
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
                {m}
              </button>
            ))}
          </div>
        </div>

        {creators.length > 0 && (
          <div className="od-filter-group">
            <span className="od-filter-label">Creator</span>
            <div className="od-filter-pills">
              {creators.map((c) => (
                <button
                  key={c.id}
                  className={`od-filter-pill od-filter-pill--creator ${activeCreatorFilter === c.id ? 'od-filter-pill--active' : ''}`}
                  onClick={() => setActiveCreatorFilter(activeCreatorFilter === c.id ? null : c.id)}
                >
                  <span className="od-filter-pill-avatar"><User size={10} /></span>
                  {c.username}
                </button>
              ))}
            </div>
          </div>
        )}

        <div className="od-filter-group">
          <span className="od-filter-label">Platform</span>
          <div className="od-filter-pills">
            {PLATFORMS.map((p) => (
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
      </div>

      {/* Content Grid */}
      <div className="od-grid">
        {filteredCards.map((card) => {
          const plat = getPlatform(card.platform);
          return (
            <div key={card.id} className={`od-card ${card.platform === 'youtube' ? 'od-card--landscape' : ''}`}>
              <div
                className={`od-card-thumbnail ${card.platform === 'youtube' ? 'od-card-thumbnail--landscape' : ''}`}
                style={{
                  background: `linear-gradient(135deg, hsl(${card.thumbnailHue}, 40%, 92%) 0%, hsl(${card.thumbnailHue + 30}, 35%, 85%) 100%)`,
                }}
              >
                <div className="od-card-play">
                  <Play size={24} fill="white" />
                </div>
                <div className="od-card-platform-badge" style={{ color: plat?.color }}>
                  {plat?.icon}
                </div>
              </div>
              <div className="od-card-info">
                <div className="od-card-info-left">
                  <div className="od-card-multiplier">
                    <span className="od-card-multiplier-value">{card.multiplier}x</span>
                    <span className="od-card-multiplier-label">{card.metric}</span>
                  </div>
                  <div className="od-card-stats">
                    {card.metricValue} vs avg {card.avgValue}
                  </div>
                  <div className="od-card-creator">{card.creatorUsername}</div>
                </div>
                <button className="od-add-context-btn">Add to context</button>
              </div>
            </div>
          );
        })}
      </div>

      {filteredCards.length === 0 && (
        <div className="od-empty">
          No outlier content matches your filters.
        </div>
      )}

      {deleteConfirmId && (
        <div className="od-modal-overlay" onClick={() => setDeleteConfirmId(null)}>
          <div className="od-modal" onClick={(e) => e.stopPropagation()}>
            <p className="od-modal-text">Are you sure you want to delete this creator?</p>
            <div className="od-modal-actions">
              <button className="od-modal-cancel" onClick={() => setDeleteConfirmId(null)}>
                Cancel
              </button>
              <button className="od-modal-confirm" onClick={() => handleRemoveCreator(deleteConfirmId)}>
                Delete
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
