// Carousel plan approval card — shown in AICEO chat's canvas when
// Sonnet emits plan_carousel and BEFORE the per-slide image generation
// loop runs. Mirrors /Content tab's two-step UX: user sees the plan
// (hook + slide list + palette + caption) and clicks Approve to kick
// off image gen. Without this step, the canvas jumped straight to
// spinner-then-images with no way to catch a bad plan early.
//
// Kept intentionally minimal — the /Content CarouselPlanCard has
// per-slide editing, template loading, and much more; we only need the
// approve step in AICEO for now. Users who want deeper editing can go
// to the /Content tab.
//
// Props:
//   plan       — { hook, angle, caption, slides[], designSystem: { palette, mode, typography, ... } }
//   platform   — 'linkedin' | 'instagram' — drives the header label + slide-count expectation
//   onApprove  — click handler for the "Approve & generate slides" button
//   generating — bool; when true, button disables and label changes to "Generating slides…"

import { Check, Sparkles } from 'lucide-react';
import './CarouselPlanApproval.css';

export default function CarouselPlanApproval({ plan, platform = 'instagram', onApprove, generating = false }) {
  if (!plan) return null;
  const slides = plan.slides || [];
  const ds = plan.designSystem || {};
  const p = ds.palette || {};
  const platformLabel = platform === 'linkedin' ? 'LinkedIn' : 'Instagram';

  // Palette swatches — the ones that actually drive the visual look.
  // Ordered so background sits first (largest visual weight) and text
  // colors close them out.
  const swatches = [
    { key: 'background', label: 'BG', hex: p.background },
    { key: 'accentPrimary', label: 'Accent', hex: p.accentPrimary },
    { key: 'gradientStart', label: 'Grad ↺', hex: p.gradientStart },
    { key: 'gradientEnd', label: 'Grad →', hex: p.gradientEnd },
    { key: 'glow', label: 'Glow', hex: p.glow },
    { key: 'textPrimary', label: 'Text', hex: p.textPrimary },
    { key: 'textMuted', label: 'Muted', hex: p.textMuted },
  ].filter((s) => s.hex);

  return (
    <div className="cpa-container">
      <div className="cpa-header">
        <Sparkles size={16} className="cpa-header-icon" />
        <div>
          <div className="cpa-header-title">{platformLabel} carousel plan ready</div>
          <div className="cpa-header-sub">Approve to render the slides. {slides.length} slides, {ds.mode || 'auto'} theme.</div>
        </div>
      </div>

      {plan.hook && (
        <div className="cpa-section">
          <div className="cpa-section-label">Hook</div>
          <div className="cpa-hook">{plan.hook}</div>
        </div>
      )}

      {slides.length > 0 && (
        <div className="cpa-section">
          <div className="cpa-section-label">Slides ({slides.length})</div>
          <ol className="cpa-slides-list">
            {slides.map((s, i) => {
              const badge = String(s.badge || '').toUpperCase();
              // Strip {{accent}}...{{/accent}} markers so the plan-card
              // preview never leaks marker syntax as visible text.
              const cleanHeadline = String(s.headline || '')
                .replace(/\{\{\/?accent\}\}/gi, '')
                .replace(/\[\/?ACCENT\]/gi, '')
                .replace(/\s{2,}/g, ' ')
                .trim();
              return (
                <li key={i} className="cpa-slide">
                  <span className="cpa-slide-num">{String(i + 1).padStart(2, '0')}</span>
                  {badge && <span className="cpa-slide-badge">{badge}</span>}
                  <span className="cpa-slide-headline">{cleanHeadline}</span>
                </li>
              );
            })}
          </ol>
        </div>
      )}

      {swatches.length > 0 && (
        <div className="cpa-section">
          <div className="cpa-section-label">Palette</div>
          <div className="cpa-swatches">
            {swatches.map((s) => (
              <div key={s.key} className="cpa-swatch" title={s.hex}>
                <span className="cpa-swatch-chip" style={{ background: s.hex }} />
                <span className="cpa-swatch-label">{s.label}</span>
              </div>
            ))}
          </div>
          {(ds.typography?.family || ds.card?.style) && (
            <div className="cpa-meta">
              {ds.typography?.family && <span><strong>Font:</strong> {ds.typography.family}</span>}
              {ds.card?.style && <span><strong>Card:</strong> {ds.card.style}</span>}
              {ds.mood && <span className="cpa-meta-mood"><strong>Mood:</strong> {ds.mood}</span>}
            </div>
          )}
        </div>
      )}

      {plan.caption && (
        <div className="cpa-section">
          <div className="cpa-section-label">Caption</div>
          <div className="cpa-caption">{plan.caption}</div>
        </div>
      )}

      <button
        type="button"
        className="cpa-approve-btn"
        onClick={onApprove}
        disabled={generating}
      >
        {generating ? (
          <>
            <span className="cpa-spinner" aria-hidden="true" />
            Generating slides…
          </>
        ) : (
          <>
            <Check size={16} />
            Approve &amp; generate {slides.length} slides
          </>
        )}
      </button>
    </div>
  );
}
