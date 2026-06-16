import { useState, useEffect, useRef } from 'react';
import { ClipboardList, Pencil, Trash2, Loader, Check, X, Sparkles } from 'lucide-react';
import { getMarketingBrief, updateMarketingBrief, clearMarketingBrief } from '../lib/api';
import './CampaignBriefCard.css';

// One active campaign brief per user, shared across every Marketing tool
// so the user doesn't re-explain offer / audience / tone / goal / key
// benefit per tab. Three states share the same root .brief-card class:
// loading, empty (small CTA expanding into form), and loaded (compact
// summary with edit + clear). Each tone / goal / audience field gets
// suggestion chips so the user can pick a known archetype OR type
// their own — chips fill the input on click, plain typing overrides.

const TONE_CHIPS = [
  'Direct, no-fluff (Hormozi)',
  'Witty + clever (Morning Brew)',
  'Thoughtful + evergreen (James Clear)',
  'Growth + motivational (Sahil Bloom)',
  'Friendly + conversational',
  'Professional + authoritative',
  'Bold + provocative',
  'Warm + personal',
];

const GOAL_CHIPS = [
  'Sell now / buy',
  'Book a call',
  'List-build / waitlist',
  'Educate / build authority',
  'Launch / event',
  'Drive engagement',
];

const AUDIENCE_CHIPS = [
  'Solo founders',
  'First-time founders',
  'Coaches + creators',
  'E-commerce founders',
  'Agency owners',
  'Course creators',
  'SaaS / product builders',
  'Service businesses',
];

const FIELDS = [
  {
    key: 'offer',
    label: 'Offer',
    placeholder: 'e.g. $497 coaching program for first-time founders',
    chips: null,
  },
  {
    key: 'audience',
    label: 'Audience',
    placeholder: 'e.g. solo founders past $10K/mo',
    chips: AUDIENCE_CHIPS,
  },
  {
    key: 'tone',
    label: 'Tone',
    placeholder: 'e.g. direct, no-fluff, with a personal story angle',
    chips: TONE_CHIPS,
  },
  {
    key: 'goal',
    label: 'Goal',
    placeholder: 'e.g. book a free consult call',
    chips: GOAL_CHIPS,
  },
  {
    key: 'key_benefit',
    label: 'Key benefit',
    placeholder: 'optional — main promise or outcome',
    chips: null,
  },
];

export default function CampaignBriefCard({ onBriefChange }) {
  const [brief, setBrief] = useState(null);
  const [loading, setLoading] = useState(true);
  const [expanded, setExpanded] = useState(false);
  const [draft, setDraft] = useState({});
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);
  // Per-field "Suggestions" open/closed. Default closed so the input
  // reads as the primary call-to-action; user opts in to chips when
  // they want ideas. Keyed by field key so each toggle is independent.
  const [openChips, setOpenChips] = useState({});
  // Shown when the user clicks the trash icon — confirms before
  // wiping the brief. Inline modal instead of window.confirm so the
  // copy can explain the consequences and the buttons match the
  // page's theme.
  const [showClearConfirm, setShowClearConfirm] = useState(false);
  const onBriefChangeRef = useRef(onBriefChange);
  useEffect(() => { onBriefChangeRef.current = onBriefChange; }, [onBriefChange]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const { brief: b } = await getMarketingBrief();
        if (cancelled) return;
        setBrief(b || null);
        if (b) {
          setDraft(b);
          onBriefChangeRef.current?.(b);
        }
      } catch (err) {
        console.warn('[brief] load failed:', err?.message);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, []);

  const hasBrief = !!(brief && (brief.offer || brief.audience || brief.tone || brief.goal || brief.key_benefit));
  const isEmpty = !hasBrief;

  const startEdit = () => {
    setDraft(brief || {});
    setExpanded(true);
  };

  const cancelEdit = () => {
    setDraft(brief || {});
    setExpanded(false);
    setError(null);
  };

  const handleFieldChange = (key, value) => {
    setDraft((prev) => ({ ...prev, [key]: value }));
  };

  const handleChipClick = (key, value) => {
    setDraft((prev) => ({ ...prev, [key]: value }));
  };

  const toggleChips = (key) => {
    setOpenChips((prev) => ({ ...prev, [key]: !prev[key] }));
  };

  const handleSave = async () => {
    setError(null);
    setSaving(true);
    try {
      const patch = {};
      for (const f of FIELDS) {
        patch[f.key] = (draft[f.key] || '').trim();
      }
      const { brief: saved } = await updateMarketingBrief(patch);
      setBrief(saved);
      setDraft(saved || {});
      setExpanded(false);
      onBriefChangeRef.current?.(saved);
    } catch (err) {
      setError(err?.message || 'Save failed');
    } finally {
      setSaving(false);
    }
  };

  const handleClearClick = () => {
    if (!hasBrief) return;
    setShowClearConfirm(true);
  };

  const confirmClear = async () => {
    setSaving(true);
    try {
      await clearMarketingBrief();
      setBrief(null);
      setDraft({});
      setExpanded(false);
      setShowClearConfirm(false);
      onBriefChangeRef.current?.(null);
    } catch (err) {
      setError(err?.message || 'Clear failed');
    } finally {
      setSaving(false);
    }
  };

  const cancelClear = () => {
    if (saving) return;
    setShowClearConfirm(false);
  };

  if (loading) {
    return (
      <div className="brief-card brief-card--loading">
        <Loader size={15} className="brief-card-spin" />
        <span>Loading campaign brief…</span>
      </div>
    );
  }

  // Expanded edit form (used for both fresh-fill and edit-existing).
  if (expanded) {
    return (
      <div className="brief-card brief-card--editing">
        <header className="brief-card-header">
          <div className="brief-card-header-icon">
            <ClipboardList size={18} />
          </div>
          <div className="brief-card-header-text">
            <h3 className="brief-card-title">Campaign brief</h3>
            <p className="brief-card-subtitle">
              Tell me once. Every Marketing tool will reuse this so you skip the same questions per tab.
            </p>
          </div>
          <button type="button" className="brief-card-iconbtn" onClick={cancelEdit} title="Cancel">
            <X size={16} />
          </button>
        </header>

        <div className="brief-card-fields">
          {FIELDS.map((f) => {
            const value = draft[f.key] || '';
            const showChips = !!openChips[f.key];
            return (
              <div key={f.key} className="brief-card-field">
                <div className="brief-card-field-head">
                  <label className="brief-card-field-label" htmlFor={`brief-${f.key}`}>
                    {f.label}
                  </label>
                  {f.chips && (
                    <button
                      type="button"
                      className={`brief-card-suggest-toggle${showChips ? ' brief-card-suggest-toggle--open' : ''}`}
                      onClick={() => toggleChips(f.key)}
                    >
                      {showChips ? 'Hide suggestions' : 'Suggestions'}
                    </button>
                  )}
                </div>
                <input
                  id={`brief-${f.key}`}
                  type="text"
                  className="brief-card-input"
                  value={value}
                  onChange={(e) => handleFieldChange(f.key, e.target.value)}
                  placeholder={f.placeholder}
                />
                {f.chips && showChips && (
                  <div className="brief-card-chips">
                    {f.chips.map((chip) => {
                      const active = value === chip;
                      return (
                        <button
                          key={chip}
                          type="button"
                          className={`brief-card-chip${active ? ' brief-card-chip--active' : ''}`}
                          onClick={() => handleChipClick(f.key, chip)}
                        >
                          {chip}
                        </button>
                      );
                    })}
                  </div>
                )}
              </div>
            );
          })}
        </div>

        {error && <div className="brief-card-error">{error}</div>}

        <div className="brief-card-actions">
          <button
            type="button"
            className="brief-card-btn brief-card-btn--ghost"
            onClick={cancelEdit}
            disabled={saving}
          >
            Cancel
          </button>
          <button
            type="button"
            className="brief-card-btn brief-card-btn--primary"
            onClick={handleSave}
            disabled={saving}
          >
            {saving ? <Loader size={14} className="brief-card-spin" /> : <Check size={14} />}
            <span>Save brief</span>
          </button>
        </div>
      </div>
    );
  }

  // Empty + collapsed: prompt to fill.
  if (isEmpty) {
    return (
      <div className="brief-card brief-card--empty">
        <div className="brief-card-empty-icon">
          <Sparkles size={18} />
        </div>
        <div className="brief-card-empty-text">
          <h3 className="brief-card-title">Tell me about your campaign once</h3>
          <p className="brief-card-subtitle">
            I'll reuse it across newsletter, landing, squeeze, and every other tool so you don't repeat yourself.
          </p>
        </div>
        <button
          type="button"
          className="brief-card-btn brief-card-btn--primary"
          onClick={() => setExpanded(true)}
        >
          <span>Fill brief</span>
        </button>
      </div>
    );
  }

  // Loaded + collapsed: compact summary with edit / clear.
  const summary = [brief.offer, brief.audience].filter(Boolean).join(' · ');
  const subline = [brief.tone && `${brief.tone} tone`, brief.goal && `goal: ${brief.goal}`].filter(Boolean).join(' · ');
  return (
    <div className="brief-card brief-card--loaded">
      <div className="brief-card-loaded-icon">
        <ClipboardList size={18} />
      </div>
      <div className="brief-card-loaded-text">
        <div className="brief-card-loaded-summary">
          {summary || 'Campaign brief saved'}
        </div>
        {subline && (
          <div className="brief-card-loaded-sub">{subline}</div>
        )}
      </div>
      <div className="brief-card-loaded-actions">
        <button
          type="button"
          className="brief-card-iconbtn"
          onClick={startEdit}
          title="Edit campaign brief"
        >
          <Pencil size={15} />
        </button>
        <button
          type="button"
          className="brief-card-iconbtn brief-card-iconbtn--danger"
          onClick={handleClearClick}
          title="Clear / start a new campaign"
          disabled={saving}
        >
          <Trash2 size={15} />
        </button>
      </div>
      {showClearConfirm && (
        <ClearBriefConfirm
          onConfirm={confirmClear}
          onCancel={cancelClear}
          saving={saving}
        />
      )}
    </div>
  );
}

// Inline confirmation modal — replaces window.confirm so the copy can
// explain what "clear" means and the buttons can match the page theme.
// Light enough not to need a separate file. Esc and backdrop click
// cancel; Enter on the focused confirm button submits.
function ClearBriefConfirm({ onConfirm, onCancel, saving }) {
  useEffect(() => {
    const onKey = (e) => {
      if (e.key === 'Escape') onCancel();
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [onCancel]);

  return (
    <div
      className="brief-confirm-backdrop"
      onClick={(e) => { if (e.target === e.currentTarget) onCancel(); }}
    >
      <div className="brief-confirm" role="dialog" aria-modal="true" aria-labelledby="brief-confirm-title">
        <div className="brief-confirm-icon">
          <Trash2 size={20} />
        </div>
        <h3 id="brief-confirm-title" className="brief-confirm-title">Clear campaign brief?</h3>
        <p className="brief-confirm-body">
          Marketing tools will start asking discovery questions again until you fill in a new brief. The artifacts you already generated are not affected.
        </p>
        <div className="brief-confirm-actions">
          <button
            type="button"
            className="brief-card-btn brief-card-btn--ghost"
            onClick={onCancel}
            disabled={saving}
          >
            Keep brief
          </button>
          <button
            type="button"
            className="brief-card-btn brief-card-btn--danger"
            onClick={onConfirm}
            disabled={saving}
            autoFocus
          >
            {saving ? <Loader size={14} className="brief-card-spin" /> : <Trash2 size={14} />}
            <span>Clear brief</span>
          </button>
        </div>
      </div>
    </div>
  );
}
