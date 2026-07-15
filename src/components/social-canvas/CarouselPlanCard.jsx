// Shared rich carousel-plan editor (Phase 3, docs/unified-content-backend-plan.md).
//
// VERBATIM copy of the CarouselPlanCard component in src/pages/Content.jsx
// (@2750-3122 as of 2026-07-15) — the full-featured plan card: per-slide
// text editing, insert/delete/reorder (hook + CTA locked), palette swatch
// editing, caption editing with fold counter, saved design-system template
// picker, approve + retry-failed actions.
//
// Extracted so the AI CEO canvas can render the SAME plan editor /Content
// users get (its legacy CarouselPlanApproval card is approve-only). The
// Content.jsx original stays in place as the flag-off path until Phase 5.
import { useState, useEffect } from 'react';
import { Trash2, Pencil, Plus, ChevronLeft, ChevronRight } from 'lucide-react';
import { getCarouselTemplates, deleteCarouselTemplate } from '../../lib/api';
import './CarouselPlanCard.css';

export default
function CarouselPlanCard({ plan, onApprove, onRetryFailed, onUpdatePlan }) {
  const ds = plan.designSystem || {};
  const p = ds.palette || {};
  const slides = plan.slides || [];
  const failed = plan.failedSlides || [];
  const hasFailed = failed.length > 0 && !plan.generating;
  const editable = !plan.approved; // Only editable BEFORE approval.
  const [activeSlide, setActiveSlide] = useState(0);
  const [templates, setTemplates] = useState([]);
  const [templatesOpen, setTemplatesOpen] = useState(false);
  const [loadingTemplates, setLoadingTemplates] = useState(false);

  // Clamp activeSlide if slides array shrinks (e.g., delete).
  useEffect(() => {
    if (activeSlide >= slides.length) setActiveSlide(Math.max(0, slides.length - 1));
  }, [slides.length, activeSlide]);

  // Lazy-fetch saved templates only when the picker is opened.
  const loadTemplates = async () => {
    if (templates.length > 0 || loadingTemplates) return;
    setLoadingTemplates(true);
    try {
      const { templates: list } = await getCarouselTemplates();
      setTemplates(list || []);
    } catch (err) {
      console.warn('[templates] load failed:', err);
    } finally {
      setLoadingTemplates(false);
    }
  };

  const applyTemplate = (template) => {
    if (!editable || !onUpdatePlan || !template?.design_system) return;
    onUpdatePlan({ ...plan, designSystem: template.design_system });
    setTemplatesOpen(false);
  };

  const removeTemplate = async (id) => {
    try {
      await deleteCarouselTemplate(id);
      setTemplates(prev => prev.filter(t => t.id !== id));
    } catch (err) {
      alert(err.message || 'Failed to delete template');
    }
  };

  const updateSlide = (idx, patch) => {
    if (!editable || !onUpdatePlan) return;
    const next = slides.map((s, i) => i === idx ? { ...s, ...patch } : s);
    onUpdatePlan({ ...plan, slides: next });
  };
  const deleteSlide = (idx) => {
    if (!editable || !onUpdatePlan) return;
    // Hook (0) and last (CTA) cannot be removed.
    if (idx === 0 || idx === slides.length - 1) return;
    onUpdatePlan({ ...plan, slides: slides.filter((_, i) => i !== idx) });
    setActiveSlide((cur) => Math.max(0, cur >= idx ? cur - 1 : cur));
  };
  const insertSlideAfter = (idx) => {
    if (!editable || !onUpdatePlan) return;
    const newSlide = {
      type: 'explanation',
      badge: 'NEW POINT',
      headline: 'New slide headline — mark the {{accent}}key word{{/accent}}',
      body: 'One short idea. Keep it to 2–4 lines.',
      visualElement: { kind: 'minimal-icon', description: 'Small supporting accent only.' },
      doNot: [],
    };
    const next = [...slides.slice(0, idx + 1), newSlide, ...slides.slice(idx + 1)];
    onUpdatePlan({ ...plan, slides: next });
    setActiveSlide(idx + 1); // jump to the newly-inserted slide
  };
  const moveSlide = (from, to) => {
    if (!editable || !onUpdatePlan) return;
    if (from === to) return;
    // Hook stays at 0, CTA stays last.
    if (from === 0 || from === slides.length - 1) return;
    if (to === 0 || to >= slides.length - 1) return;
    const next = [...slides];
    const [moved] = next.splice(from, 1);
    next.splice(to, 0, moved);
    onUpdatePlan({ ...plan, slides: next });
    setActiveSlide(to); // follow the moved slide
  };

  return (
    <div className="content-carousel-plan">
      <div className="content-carousel-plan-header">
        <span className="content-carousel-plan-badge">CAROUSEL PLAN</span>
        <span className="content-carousel-plan-slides-count">{slides.length} slides{editable ? ' · editable' : ''}</span>
        {editable && (
          <div className="content-carousel-plan-templates-wrap">
            <button
              type="button"
              className="content-carousel-plan-templates-btn"
              onClick={() => { setTemplatesOpen(v => !v); if (!templatesOpen) loadTemplates(); }}
              title="Apply a saved design system"
            >
              Load template ▾
            </button>
            {templatesOpen && (
              <div className="content-carousel-plan-templates-pop" onClick={(e) => e.stopPropagation()}>
                {loadingTemplates && <div className="content-carousel-plan-templates-empty">Loading…</div>}
                {!loadingTemplates && templates.length === 0 && (
                  <div className="content-carousel-plan-templates-empty">No saved templates yet. After generating a carousel, click "Save as template" to capture its design system.</div>
                )}
                {templates.map(t => (
                  <div key={t.id} className="content-carousel-plan-template-row">
                    <button type="button" className="content-carousel-plan-template-apply" onClick={() => applyTemplate(t)}>
                      {t.preview_url ? <img src={t.preview_url} alt="" className="content-carousel-plan-template-thumb" /> : null}
                      <div className="content-carousel-plan-template-info">
                        <div className="content-carousel-plan-template-name">{t.name}</div>
                        <div className="content-carousel-plan-template-swatches">
                          {[t.design_system?.palette?.background, t.design_system?.palette?.accentPrimary, t.design_system?.palette?.gradientStart, t.design_system?.palette?.gradientEnd].filter(Boolean).map((hex, i) => (
                            <span key={i} className="content-carousel-plan-template-swatch" style={{ background: hex }} />
                          ))}
                        </div>
                      </div>
                    </button>
                    <button type="button" className="content-carousel-plan-template-delete" title="Delete template" onClick={() => removeTemplate(t.id)}>
                      <Trash2 size={12} />
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </div>
      {plan.hook && (
        <div className="content-carousel-plan-hook">
          <div className="content-carousel-plan-label">Hook</div>
          {editable
            ? <input
                className="content-carousel-plan-hook-input"
                value={plan.hook}
                onChange={(e) => onUpdatePlan && onUpdatePlan({ ...plan, hook: e.target.value })}
                placeholder="Hook headline"
              />
            : <div className="content-carousel-plan-hook-text">"{plan.hook}"</div>
          }
        </div>
      )}
      {plan.angle && (
        <div className="content-carousel-plan-angle">
          <span className="content-carousel-plan-label">Angle:</span> {plan.angle}
        </div>
      )}
      <div className="content-carousel-plan-section">
        <div className="content-carousel-plan-slide-header">
          <div className="content-carousel-plan-label">Slides</div>
          {editable && (
            <div className="content-carousel-plan-edit-hint">
              <Pencil size={11} />
              <span>Tap any text to edit. Use arrows or dots to move between slides.</span>
            </div>
          )}
        </div>
        {slides.length > 0 && (() => {
          const clampedActive = Math.min(activeSlide, slides.length - 1);
          const s = slides[clampedActive] || {};
          const i = clampedActive;
          const isHook = i === 0;
          const isFinal = i === slides.length - 1;
          const isLocked = isHook || isFinal;
          const canMoveLeft = editable && !isLocked && i > 1;
          const canMoveRight = editable && !isLocked && i < slides.length - 2;
          const canDelete = editable && !isLocked;
          const canInsertAfter = editable && !isFinal;
          return (
            <div className="content-carousel-plan-carousel">
              <button
                type="button"
                className="content-carousel-plan-carousel-nav content-carousel-plan-carousel-nav--prev"
                onClick={() => setActiveSlide((cur) => Math.max(0, cur - 1))}
                disabled={i === 0}
                aria-label="Previous slide"
              >
                <ChevronLeft size={20} />
              </button>
              <div className="content-carousel-plan-viewport">
                <div className={`content-carousel-plan-slide-card content-carousel-plan-slide-card--focused${isLocked ? ' content-carousel-plan-slide-card--locked' : ''}`}>
                  <div className="content-carousel-plan-slide-card-head">
                    <span className="content-carousel-plan-slide-num">{String(i + 1).padStart(2, '0')} / {String(slides.length).padStart(2, '0')}</span>
                    <span className="content-carousel-plan-slide-type">{isHook ? 'HOOK' : isFinal ? 'CTA' : String(s.type || 'SLIDE').toUpperCase()}</span>
                    {editable && (
                      <div className="content-carousel-plan-slide-actions">
                        {canMoveLeft && (
                          <button type="button" className="content-carousel-plan-slide-action" title="Move slide left" onClick={() => moveSlide(i, i - 1)}>
                            <ChevronLeft size={12} />
                          </button>
                        )}
                        {canMoveRight && (
                          <button type="button" className="content-carousel-plan-slide-action" title="Move slide right" onClick={() => moveSlide(i, i + 1)}>
                            <ChevronRight size={12} />
                          </button>
                        )}
                        {canInsertAfter && (
                          <button type="button" className="content-carousel-plan-slide-action" title="Insert slide after this one" onClick={() => insertSlideAfter(i)}>
                            <Plus size={12} />
                          </button>
                        )}
                        {canDelete && (
                          <button type="button" className="content-carousel-plan-slide-action content-carousel-plan-slide-action--danger" title="Delete slide" onClick={() => deleteSlide(i)}>
                            <Trash2 size={12} />
                          </button>
                        )}
                      </div>
                    )}
                  </div>
                  {editable
                    ? <input
                        className="content-carousel-plan-slide-badge-input"
                        value={s.badge || ''}
                        onChange={(e) => updateSlide(i, { badge: e.target.value })}
                        placeholder="BADGE LABEL"
                      />
                    : <div className="content-carousel-plan-slide-badge">{s.badge || ''}</div>
                  }
                  {editable
                    ? <>
                        <textarea
                          className="content-carousel-plan-slide-headline-input"
                          value={s.headline || ''}
                          onChange={(e) => updateSlide(i, { headline: e.target.value })}
                          placeholder="Headline"
                          rows={3}
                        />
                        <div className="content-carousel-plan-accent-hint">
                          Tip: wrap a word in <code>{'{{accent}}'}word{'{{/accent}}'}</code> to highlight it in your brand color on the final slide.
                        </div>
                      </>
                    : <div className="content-carousel-plan-slide-headline">
                        {(s.headline || '').replace(/\{\{accent\}\}|\{\{\/accent\}\}/g, '')}
                      </div>
                  }
                  {editable
                    ? <textarea
                        className="content-carousel-plan-slide-body-input"
                        value={s.body || ''}
                        onChange={(e) => updateSlide(i, { body: e.target.value })}
                        placeholder="Body copy (2–4 lines)"
                        rows={6}
                      />
                    : (s.body && <div className="content-carousel-plan-slide-body">{s.body}</div>)
                  }
                  {isFinal && (
                    editable
                      ? <input
                          className="content-carousel-plan-slide-cta-input"
                          value={s.cta || ''}
                          onChange={(e) => updateSlide(i, { cta: e.target.value })}
                          placeholder="CTA button text"
                        />
                      : (s.cta && <div className="content-carousel-plan-slide-cta">CTA: {s.cta}</div>)
                  )}
                </div>
              </div>
              <button
                type="button"
                className="content-carousel-plan-carousel-nav content-carousel-plan-carousel-nav--next"
                onClick={() => setActiveSlide((cur) => Math.min(slides.length - 1, cur + 1))}
                disabled={i === slides.length - 1}
                aria-label="Next slide"
              >
                <ChevronRight size={20} />
              </button>
            </div>
          );
        })()}
        {slides.length > 1 && (
          <div className="content-carousel-plan-dots">
            {slides.map((_, i) => (
              <button
                key={i}
                type="button"
                className={`content-carousel-plan-dot${i === activeSlide ? ' content-carousel-plan-dot--active' : ''}`}
                onClick={() => setActiveSlide(i)}
                title={`Slide ${i + 1}${i === 0 ? ' — Hook' : i === slides.length - 1 ? ' — CTA' : ''}`}
                aria-label={`Go to slide ${i + 1}`}
              >
                {i + 1}
              </button>
            ))}
          </div>
        )}
      </div>
      <div className="content-carousel-plan-section">
        <div className="content-carousel-plan-label">Design system {editable ? '(tap a swatch to change)' : '(locked)'}</div>
        <div className="content-carousel-plan-palette">
          {[
            { key: 'background', label: 'BG', hex: p.background },
            { key: 'accentPrimary', label: 'Accent', hex: p.accentPrimary },
            { key: 'gradientStart', label: 'Grad A', hex: p.gradientStart },
            { key: 'gradientEnd', label: 'Grad B', hex: p.gradientEnd },
            { key: 'textPrimary', label: 'Text', hex: p.textPrimary },
            { key: 'glow', label: 'Glow', hex: p.glow },
          ].filter(s => s.hex).map(s => (
            <label key={s.key} className={`content-carousel-plan-swatch${editable ? ' content-carousel-plan-swatch--editable' : ''}`} style={{ background: s.hex }} title={`${s.label}: ${s.hex}`}>
              {editable && onUpdatePlan && (
                <input
                  type="color"
                  value={s.hex}
                  onChange={(e) => onUpdatePlan({ ...plan, designSystem: { ...ds, palette: { ...p, [s.key]: e.target.value } } })}
                  className="content-carousel-plan-swatch-input"
                />
              )}
              <span>{s.hex}</span>
            </label>
          ))}
        </div>
        <div className="content-carousel-plan-meta">
          <div><strong>Mode:</strong> {ds.mode || '—'}</div>
          <div><strong>Card:</strong> {ds.card?.style || '—'}</div>
          <div><strong>Font:</strong> {ds.typography?.family || '—'}</div>
          <div><strong>Accent:</strong> {ds.accentTreatment?.slice(0, 80) || '—'}</div>
        </div>
      </div>
      {(plan.caption || editable) && (
        <div className="content-carousel-plan-section">
          <div className="content-carousel-plan-label">Caption</div>
          {editable
            ? <textarea
                className="content-carousel-plan-caption-input"
                value={plan.caption || ''}
                onChange={(e) => onUpdatePlan && onUpdatePlan({ ...plan, caption: e.target.value })}
                placeholder="IG caption (first ~125 chars show before 'more')"
                rows={4}
              />
            : <div className="content-carousel-plan-caption">{plan.caption}</div>
          }
          {editable && (
            <div className="content-carousel-plan-caption-counter">
              {(plan.caption || '').length} chars
              {(plan.caption || '').length > 125 && <span className="content-carousel-plan-caption-counter-fold"> · fold at 125</span>}
            </div>
          )}
        </div>
      )}
      {!plan.approved && (
        <button
          type="button"
          className="content-carousel-plan-approve"
          onClick={onApprove}
        >
          Approve & generate slides
        </button>
      )}
      {plan.approved && plan.generating && (
        <div className="content-carousel-plan-approve content-carousel-plan-approve--disabled">
          Generating slides…
        </div>
      )}
      {hasFailed && (
        <div className="content-carousel-plan-retry-row">
          <div className="content-carousel-plan-retry-msg">
            {failed.length === 1
              ? `Slide ${failed[0] + 1} failed to render.`
              : `${failed.length} slides failed to render: ${failed.map(i => i + 1).join(', ')}.`}
          </div>
          <button
            type="button"
            className="content-carousel-plan-retry-btn"
            onClick={onRetryFailed}
          >
            Retry {failed.length === 1 ? 'failed slide' : `${failed.length} slides`}
          </button>
        </div>
      )}
      {plan.error && <div className="content-carousel-plan-error">{plan.error}</div>}
    </div>
  );
}
