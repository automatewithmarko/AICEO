import { useState } from 'react';
import { CalendarDays, CalendarClock, CalendarCheck2, Check, Loader2, AlertCircle, ImageOff, Square, RefreshCw, Sparkles } from 'lucide-react';
import './ContentPlanMessage.css';

const FORMAT_LABELS = {
  text_post: 'Text post',
  single_image: 'Image post',
  carousel: 'Carousel',
  reel_script: 'Reel script',
  youtube_script: 'YouTube script',
};
const PLATFORM_LABELS = { linkedin: 'LinkedIn', instagram: 'Instagram', x: 'X', youtube: 'YouTube' };
const IMAGE_FORMATS = new Set(['single_image', 'carousel']);

// In-chat day-by-day content plan (from the create_content_plan tool) with
// the "Generate content" batch flow. Pure presentational: every state
// transition runs through the handlers AiCeo passes in; the only local
// state is the pre-run confirm step, which is never persisted.
export default function ContentPlanMessage({
  plan,
  isRunActive,
  runLocked,
  onGenerate,
  onRetryFailed,
  onStop,
  onOpenItem,
  onRegenerateItem,
  onScheduleAll,
}) {
  const [confirming, setConfirming] = useState(false);
  // Per-item Regenerate: which item's instruction box is open + its draft.
  const [regenIdx, setRegenIdx] = useState(null);
  const [regenText, setRegenText] = useState('');

  const items = plan.items || [];
  const states = plan.itemStates || [];
  const total = items.length;
  const doneCount = states.filter((s) => s?.status === 'done').length;
  const failedCount = states.filter((s) => s?.status === 'failed').length;
  const imagePieces = items.filter((it) => IMAGE_FORMATS.has(it.format)).length;
  const runningIdx = states.findIndex((s) => s?.status === 'running');
  const runningItem = runningIdx !== -1 ? items[runningIdx] : null;
  const runningProgress = runningIdx !== -1 ? states[runningIdx]?.progress : null;

  // A persisted 'running' state with no live runner means the page was
  // reloaded (or the session switched) mid-run — offer Resume.
  const effective = (plan.runState === 'running' || plan.runState === 'stopping') && !isRunActive ? 'interrupted' : (plan.runState || 'idle');

  const platformsLabel = (plan.platforms || []).map((p) => PLATFORM_LABELS[p] || p).join(' · ');

  return (
    <div className="cpm">
      <div className="cpm-header">
        <div className="cpm-header-top">
          <CalendarDays size={15} className="cpm-header-icon" />
          <span className="cpm-title">{plan.title}</span>
        </div>
        <div className="cpm-meta">
          {platformsLabel && <span className="cpm-meta-item">{platformsLabel}</span>}
          <span className="cpm-meta-item">{total} pieces · {plan.timeframeDays} days</span>
        </div>
        {plan.summary && <p className="cpm-summary">{plan.summary}</p>}
      </div>

      <div className="cpm-days">
        {items.map((item, i) => {
          const st = states[i] || { status: 'pending' };
          const clickable = st.status === 'done' && st.msgId;
          const canRegen = st.status === 'done' && !isRunActive && !runLocked && typeof onRegenerateItem === 'function';
          return (
            <div key={i} className="cpm-day-wrap">
              <div
                className={`cpm-day cpm-day--${st.status} ${clickable ? 'cpm-day--clickable' : ''}`}
                onClick={clickable ? () => onOpenItem(st.msgId) : undefined}
                title={st.status === 'failed' ? (st.error || 'Generation failed') : clickable ? 'Open this piece' : undefined}
              >
                <div className="cpm-day-left">
                  <span className="cpm-day-num">Day {item.day}</span>
                  <span className={`cpm-pill cpm-pill--${item.platform}`}>{PLATFORM_LABELS[item.platform] || item.platform}</span>
                  <span className="cpm-format">{FORMAT_LABELS[item.format] || item.format}</span>
                </div>
                <div className="cpm-day-body">
                  <span className="cpm-topic">{item.topic}</span>
                  {item.hook && <span className="cpm-hook">&ldquo;{item.hook}&rdquo;</span>}
                  {item.details && <span className="cpm-details">{item.details}</span>}
                </div>
                <span className="cpm-status">
                  {st.status === 'running' && (
                    <>
                      {runningProgress?.total ? (
                        <span className="cpm-subprogress">slide {Math.min((runningProgress.done || 0) + 1, runningProgress.total)}/{runningProgress.total}</span>
                      ) : null}
                      <Loader2 size={14} className="cpm-spin" />
                    </>
                  )}
                  {st.status === 'done' && (
                    <>
                      {st.scheduledAt && (
                        <span className="cpm-scheduled" title={`Scheduled for ${new Date(st.scheduledAt).toLocaleString()}`}>
                          <CalendarCheck2 size={13} />
                        </span>
                      )}
                      {st.imageFailed && (
                        <span className="cpm-imgfail" title="An image failed — open the piece to regenerate it">
                          <ImageOff size={13} />
                        </span>
                      )}
                      {canRegen && (
                        <button
                          className="cpm-regen-btn"
                          title="Not happy with this piece? Regenerate it with instructions"
                          onClick={(e) => {
                            e.stopPropagation();
                            setRegenText('');
                            setRegenIdx(regenIdx === i ? null : i);
                          }}
                        >
                          <RefreshCw size={13} />
                        </button>
                      )}
                      <Check size={14} className="cpm-check" />
                    </>
                  )}
                  {st.status === 'failed' && <AlertCircle size={14} className="cpm-fail" />}
                  {st.status === 'pending' && <span className="cpm-dot" />}
                </span>
              </div>
              {regenIdx === i && canRegen && (
                <div className="cpm-regen">
                  <input
                    autoFocus
                    className="cpm-regen-input"
                    placeholder="What should change? e.g. different hook, lighter tone, focus on pricing…"
                    value={regenText}
                    onChange={(e) => setRegenText(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') {
                        e.preventDefault();
                        setRegenIdx(null);
                        onRegenerateItem(i, regenText.trim());
                      }
                      if (e.key === 'Escape') setRegenIdx(null);
                    }}
                  />
                  <button
                    className="cpm-btn cpm-btn--primary cpm-regen-go"
                    onClick={() => { setRegenIdx(null); onRegenerateItem(i, regenText.trim()); }}
                  >
                    <RefreshCw size={13} /> Regenerate
                  </button>
                  <button className="cpm-btn cpm-btn--ghost" onClick={() => setRegenIdx(null)}>Cancel</button>
                </div>
              )}
            </div>
          );
        })}
      </div>

      <div className="cpm-footer">
        {effective === 'idle' && !confirming && (
          <button className="cpm-btn cpm-btn--primary" disabled={runLocked} onClick={() => setConfirming(true)}>
            <Sparkles size={14} /> Generate content
          </button>
        )}

        {effective === 'idle' && confirming && (
          <div className="cpm-confirm">
            <p className="cpm-confirm-text">
              You are about to generate <strong>{total} pieces of content</strong>
              {imagePieces > 0 ? <> ({imagePieces} include images — carousels render every slide, so this can take a few minutes)</> : null}.
              They&apos;ll be generated one by one and appear in this chat as they finish.
            </p>
            <div className="cpm-confirm-actions">
              <button className="cpm-btn cpm-btn--primary" onClick={() => { setConfirming(false); onGenerate(); }}>
                <Check size={14} /> Confirm — generate {total} pieces
              </button>
              <button className="cpm-btn cpm-btn--ghost" onClick={() => setConfirming(false)}>Cancel</button>
            </div>
          </div>
        )}

        {isRunActive && plan.runState === 'stopping' && (
          <div className="cpm-running">
            <Loader2 size={14} className="cpm-spin" />
            <span className="cpm-running-text">Stopping&hellip;</span>
          </div>
        )}

        {isRunActive && plan.runState !== 'stopping' && (
          <div className="cpm-running">
            <Loader2 size={14} className="cpm-spin" />
            <span className="cpm-running-text">
              {runningItem ? (
                <>Generating piece {runningIdx + 1} of {total} — Day {runningItem.day} ({FORMAT_LABELS[runningItem.format] || runningItem.format}
                {runningProgress?.total ? `, slide ${Math.min((runningProgress.done || 0) + 1, runningProgress.total)}/${runningProgress.total}` : ''})&hellip;</>
              ) : (
                <>Generating&hellip;</>
              )}
            </span>
            <button className="cpm-btn cpm-btn--ghost cpm-btn--stop" onClick={onStop}>
              <Square size={12} /> Stop
            </button>
          </div>
        )}

        {(effective === 'stopped' || effective === 'interrupted') && !isRunActive && (
          <div className="cpm-resume">
            <span className="cpm-progress-note">
              {effective === 'interrupted' ? 'Run was interrupted' : 'Stopped'} — {doneCount} of {total} done{failedCount ? `, ${failedCount} failed` : ''}.
            </span>
            <div className="cpm-confirm-actions">
              <button className="cpm-btn cpm-btn--primary" disabled={runLocked} onClick={onGenerate}>
                <Sparkles size={14} /> Resume
              </button>
              {failedCount > 0 && (
                <button className="cpm-btn cpm-btn--ghost" disabled={runLocked} onClick={onRetryFailed}>
                  <RefreshCw size={13} /> Retry failed
                </button>
              )}
              {doneCount > 0 && onScheduleAll && (
                <button className="cpm-btn cpm-btn--ghost" disabled={runLocked} onClick={onScheduleAll} title="Pick dates on a calendar and bulk-schedule the generated pieces">
                  <CalendarClock size={13} /> Schedule
                </button>
              )}
            </div>
          </div>
        )}

        {effective === 'done' && !isRunActive && (
          <div className="cpm-done">
            {failedCount === 0 ? (
              <span className="cpm-done-text cpm-done-text--ok"><Check size={14} /> All {total} pieces generated</span>
            ) : (
              <>
                <span className="cpm-done-text">Generated {doneCount} of {total} — {failedCount} failed</span>
                <button className="cpm-btn cpm-btn--ghost" disabled={runLocked} onClick={onRetryFailed}>
                  <RefreshCw size={13} /> Retry failed
                </button>
              </>
            )}
            {doneCount > 0 && onScheduleAll && (
              <button className="cpm-btn cpm-btn--primary" disabled={runLocked} onClick={onScheduleAll} title="Pick dates on a calendar and bulk-schedule the generated pieces">
                <CalendarClock size={13} /> Schedule
              </button>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
