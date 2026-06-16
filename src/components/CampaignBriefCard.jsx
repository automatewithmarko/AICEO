import { useState, useEffect, useRef } from 'react';
import { ClipboardList, Pencil, Trash2, ChevronDown, ChevronUp, Loader, Check, X } from 'lucide-react';
import { getMarketingBrief, updateMarketingBrief, clearMarketingBrief } from '../lib/api';
import './CampaignBriefCard.css';

// One active campaign brief per user, shared by every Marketing tool so
// the user doesn't re-explain offer/audience/tone/goal/key benefit per
// tab. Two states: EMPTY (small "Tell me about your campaign" prompt
// expanding into a 5-field form) and LOADED (compact summary with edit
// + clear). The card auto-refreshes after each generation completes so
// auto-captured fields from the agent flow show up immediately.

const FIELDS = [
  { key: 'offer', label: 'Offer / topic', placeholder: 'e.g. $497 coaching program for first-time founders', hint: 'What the campaign is about — product, course, service, or topic.' },
  { key: 'audience', label: 'Target audience', placeholder: 'e.g. solo founders past $10K/mo who can\'t justify hiring a CMO', hint: 'Who it\'s for + the pain they have.' },
  { key: 'tone', label: 'Tone / voice', placeholder: 'e.g. direct, no-fluff, Hormozi-style', hint: 'How it should read.' },
  { key: 'goal', label: 'Primary goal / CTA', placeholder: 'e.g. book a call, buy now, join waitlist', hint: 'What action the campaign should drive.' },
  { key: 'key_benefit', label: 'Key benefit (optional)', placeholder: 'e.g. ship a landing page in 30 seconds instead of two days', hint: 'The main promise / outcome.' },
];

export default function CampaignBriefCard({ onBriefChange }) {
  const [brief, setBrief] = useState(null);
  const [loading, setLoading] = useState(true);
  const [expanded, setExpanded] = useState(false);
  const [draft, setDraft] = useState({});
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);
  // Suppresses the auto-expand on first empty load — we open the form
  // when the user explicitly clicks the empty-state CTA, not on initial
  // mount (otherwise the panel feels noisy on every Marketing page
  // visit before they've decided to fill it).
  const userOpenedRef = useRef(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const { brief: b } = await getMarketingBrief();
        if (cancelled) return;
        setBrief(b || null);
        if (b) {
          setDraft(b);
          onBriefChange?.(b);
        }
      } catch (err) {
        console.warn('[brief] load failed:', err?.message);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [onBriefChange]);

  // Imperatively refresh after a turn completes (parent calls this via
  // its own effect when isGenerating flips back to false). Reuses the
  // same load path so auto-captured fields land in state cleanly.
  CampaignBriefCard.lastRefresh = async function refresh() {
    try {
      const { brief: b } = await getMarketingBrief();
      return b || null;
    } catch { return null; }
  };

  const hasBrief = !!(brief && (brief.offer || brief.audience || brief.tone || brief.goal || brief.key_benefit));
  const isEmpty = !hasBrief;

  const startEdit = () => {
    setDraft(brief || {});
    setExpanded(true);
    userOpenedRef.current = true;
  };

  const cancelEdit = () => {
    setDraft(brief || {});
    setExpanded(false);
    setError(null);
  };

  const handleFieldChange = (key, value) => {
    setDraft((prev) => ({ ...prev, [key]: value }));
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
      onBriefChange?.(saved);
    } catch (err) {
      setError(err?.message || 'Save failed');
    } finally {
      setSaving(false);
    }
  };

  const handleClear = async () => {
    if (!hasBrief) return;
    if (!confirm('Clear the active campaign brief? The Marketing tools will start asking discovery questions again until you fill in a new brief.')) return;
    setSaving(true);
    try {
      await clearMarketingBrief();
      setBrief(null);
      setDraft({});
      setExpanded(false);
      onBriefChange?.(null);
    } catch (err) {
      setError(err?.message || 'Clear failed');
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <div className="brief-card brief-card--loading">
        <Loader size={14} className="brief-card-spin" />
        <span>Loading campaign brief…</span>
      </div>
    );
  }

  // Empty + collapsed: small prompt with click to fill OR skip.
  if (isEmpty && !expanded) {
    return (
      <div className="brief-card brief-card--empty">
        <ClipboardList size={15} />
        <div className="brief-card-empty-text">
          <strong>Tell me about your campaign once.</strong> I'll use it across newsletter, landing, squeeze, and other tools so you don't have to repeat yourself.
        </div>
        <button
          type="button"
          className="brief-card-btn brief-card-btn--primary"
          onClick={() => { setExpanded(true); userOpenedRef.current = true; }}
        >
          Fill it in
        </button>
      </div>
    );
  }

  // Expanded edit form (covers both empty-but-editing AND edit-existing).
  if (expanded) {
    return (
      <div className="brief-card brief-card--editing">
        <div className="brief-card-head">
          <ClipboardList size={15} />
          <span className="brief-card-title">Campaign brief</span>
          <button type="button" className="brief-card-iconbtn" onClick={cancelEdit} title="Cancel">
            <X size={14} />
          </button>
        </div>
        <div className="brief-card-fields">
          {FIELDS.map((f) => (
            <label key={f.key} className="brief-card-field">
              <span className="brief-card-field-label">{f.label}</span>
              <input
                type="text"
                className="brief-card-input"
                value={draft[f.key] || ''}
                onChange={(e) => handleFieldChange(f.key, e.target.value)}
                placeholder={f.placeholder}
              />
              <span className="brief-card-field-hint">{f.hint}</span>
            </label>
          ))}
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
            {saving ? <Loader size={13} className="brief-card-spin" /> : <Check size={13} />} Save brief
          </button>
        </div>
      </div>
    );
  }

  // Loaded + collapsed: compact summary with edit / clear.
  const summary = [brief.offer, brief.audience].filter(Boolean).join(' · ');
  return (
    <div className="brief-card brief-card--loaded">
      <ClipboardList size={15} />
      <div className="brief-card-summary">
        <div className="brief-card-summary-line">{summary || 'Campaign brief saved'}</div>
        {(brief.tone || brief.goal) && (
          <div className="brief-card-summary-sub">
            {[brief.tone && `${brief.tone} tone`, brief.goal && `goal: ${brief.goal}`].filter(Boolean).join(' · ')}
          </div>
        )}
      </div>
      <button
        type="button"
        className="brief-card-iconbtn"
        onClick={startEdit}
        title="Edit campaign brief"
      >
        <Pencil size={13} />
      </button>
      <button
        type="button"
        className="brief-card-iconbtn brief-card-iconbtn--danger"
        onClick={handleClear}
        title="Clear / start a new campaign"
        disabled={saving}
      >
        <Trash2 size={13} />
      </button>
    </div>
  );
}
