import { useMemo, useState } from 'react';
import { X, CalendarClock, ChevronLeft, ChevronRight, GripVertical, Check, Loader2, AlertCircle } from 'lucide-react';
import { toLocalYMD, parseYMD, addDays, defaultStartDate, buildDefaultAssignments } from '../lib/planSchedule';
import './SchedulePlanModal.css';

// Bulk-schedule preview for a generated content plan (founder spec,
// 2026-07-22): shows every generated piece on a real month calendar at
// its computed date (start = next occurrence of the plan's Day-1 weekday
// hint, else tomorrow), lets the user drag pills between dates, then
// Confirm bulk-creates scheduled posts through the SAME calendar
// pipeline the one-by-one schedule flows use. Pure presentational —
// the parent owns the piece extraction and the createCalendarPost loop.
//
// Props:
//   planTitle   — heading
//   items       — plan.items (day/platform/format/topic)
//   entries     — [{ index, schedulable, reason, mediaCount, caption }]
//                 parent-derived; index matches plan.items order
//   busy        — confirm in flight (parent-driven)
//   progress    — string shown while busy ("Scheduling 3/9…")
//   onClose()
//   onConfirm(assignments, time) — assignments: [{ index, date: 'YYYY-MM-DD' }]

const PLATFORM_COLORS = {
  linkedin: '#0a66c2',
  instagram: '#d62976',
  x: '#111111',
  facebook: '#1877f2',
  tiktok: '#00bfa5',
  youtube: '#ff0033',
};
const FORMAT_SHORT = {
  text_post: 'Text',
  single_image: 'Image',
  carousel: 'Carousel',
  reel_script: 'Reel script',
  youtube_script: 'YT script',
};
const TIME_PRESETS = ['08:00', '10:00', '12:00', '17:00', '19:00'];
const WEEKDAY_HEAD = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

export default function SchedulePlanModal({ planTitle, items = [], entries = [], busy = false, progress = '', onClose, onConfirm }) {
  const todayYMD = toLocalYMD(new Date());
  const [startYMD, setStartYMD] = useState(() => toLocalYMD(defaultStartDate(items)));
  const [assignments, setAssignments] = useState(() => buildDefaultAssignments(items, toLocalYMD(defaultStartDate(items))));
  const [time, setTime] = useState('10:00');
  const [dragIndex, setDragIndex] = useState(null);
  const [monthCursor, setMonthCursor] = useState(0); // offset from the month of startYMD

  const schedulable = useMemo(() => entries.filter((e) => e.schedulable), [entries]);
  const excluded = useMemo(() => entries.filter((e) => !e.schedulable), [entries]);

  // Re-lay every post out from a new start date (drags are reset — the
  // whole grid shifts, which is what "start next Wednesday instead"
  // means).
  const applyStartDate = (ymd) => {
    if (!ymd) return;
    setStartYMD(ymd);
    setAssignments(buildDefaultAssignments(items, ymd));
    setMonthCursor(0);
  };

  // Month grid (6×7, Sunday-first — same shape as the Calendar tab).
  const baseMonth = useMemo(() => {
    const s = parseYMD(startYMD);
    return new Date(s.getFullYear(), s.getMonth() + monthCursor, 1);
  }, [startYMD, monthCursor]);

  const cells = useMemo(() => {
    const startCell = addDays(baseMonth, -baseMonth.getDay());
    return Array.from({ length: 42 }, (_, i) => addDays(startCell, i));
  }, [baseMonth]);

  const pillsByDate = useMemo(() => {
    const map = new Map();
    for (const e of schedulable) {
      const ymd = assignments[e.index];
      if (!ymd) continue;
      if (!map.has(ymd)) map.set(ymd, []);
      map.get(ymd).push(e);
    }
    for (const list of map.values()) list.sort((a, b) => a.index - b.index);
    return map;
  }, [schedulable, assignments]);

  const monthLabel = baseMonth.toLocaleDateString(undefined, { month: 'long', year: 'numeric' });

  const handleDrop = (ymd) => {
    if (dragIndex == null || ymd < todayYMD) return;
    setAssignments((prev) => ({ ...prev, [dragIndex]: ymd }));
    setDragIndex(null);
  };

  const confirm = () => {
    const list = schedulable
      .map((e) => ({ index: e.index, date: assignments[e.index] }))
      .filter((a) => !!a.date);
    onConfirm(list, time);
  };

  return (
    <div className="spm-overlay" onClick={busy ? undefined : onClose}>
      <div className="spm" onClick={(e) => e.stopPropagation()}>
        <div className="spm-header">
          <div className="spm-header-text">
            <CalendarClock size={16} className="spm-header-icon" />
            <div>
              <div className="spm-title">Schedule &ldquo;{planTitle || 'Content plan'}&rdquo;</div>
              <div className="spm-subtitle">
                {schedulable.length} post{schedulable.length === 1 ? '' : 's'} · drag any post to a different date · fine-tune later in the Calendar tab
              </div>
            </div>
          </div>
          <button className="spm-close" onClick={onClose} disabled={busy}><X size={18} /></button>
        </div>

        <div className="spm-controls">
          <label className="spm-control">
            <span>Start date</span>
            <input
              type="date"
              value={startYMD}
              min={todayYMD}
              onChange={(e) => applyStartDate(e.target.value)}
              disabled={busy}
            />
          </label>
          <label className="spm-control">
            <span>Posting time</span>
            <div className="spm-time-row">
              <input type="time" value={time} onChange={(e) => setTime(e.target.value)} disabled={busy} />
              {TIME_PRESETS.map((t) => (
                <button
                  key={t}
                  type="button"
                  className={`spm-time-preset ${time === t ? 'spm-time-preset--on' : ''}`}
                  onClick={() => setTime(t)}
                  disabled={busy}
                >
                  {t}
                </button>
              ))}
            </div>
          </label>
        </div>

        <div className="spm-month-nav">
          <button onClick={() => setMonthCursor((c) => c - 1)} disabled={busy}><ChevronLeft size={16} /></button>
          <span className="spm-month-label">{monthLabel}</span>
          <button onClick={() => setMonthCursor((c) => c + 1)} disabled={busy}><ChevronRight size={16} /></button>
        </div>

        <div className="spm-weekdays">
          {WEEKDAY_HEAD.map((w) => <span key={w}>{w}</span>)}
        </div>
        <div className="spm-grid">
          {cells.map((day) => {
            const ymd = toLocalYMD(day);
            const inMonth = day.getMonth() === baseMonth.getMonth();
            const isPast = ymd < todayYMD;
            const isToday = ymd === todayYMD;
            const pills = pillsByDate.get(ymd) || [];
            return (
              <div
                key={ymd}
                className={`spm-cell ${inMonth ? '' : 'spm-cell--out'} ${isPast ? 'spm-cell--past' : ''} ${isToday ? 'spm-cell--today' : ''} ${dragIndex != null && !isPast ? 'spm-cell--droppable' : ''}`}
                onDragOver={(e) => { if (!isPast && dragIndex != null) e.preventDefault(); }}
                onDrop={(e) => { e.preventDefault(); handleDrop(ymd); }}
              >
                <span className={`spm-cell-num ${isToday ? 'spm-cell-num--today' : ''}`}>{day.getDate()}</span>
                <div className="spm-cell-pills">
                  {pills.map((e) => {
                    const item = items[e.index] || {};
                    return (
                      <div
                        key={e.index}
                        className={`spm-pill ${dragIndex === e.index ? 'spm-pill--dragging' : ''}`}
                        style={{ '--pill-color': PLATFORM_COLORS[item.platform] || '#888' }}
                        draggable={!busy}
                        onDragStart={(ev) => {
                          setDragIndex(e.index);
                          ev.dataTransfer.effectAllowed = 'move';
                          try { ev.dataTransfer.setData('text/plain', String(e.index)); } catch { /* IE */ }
                        }}
                        onDragEnd={() => setDragIndex(null)}
                        title={`Day ${item.day} — ${item.topic || ''}`}
                      >
                        <GripVertical size={11} className="spm-pill-grip" />
                        <span className="spm-pill-dot" />
                        <span className="spm-pill-text">D{item.day} {FORMAT_SHORT[item.format] || item.format}</span>
                      </div>
                    );
                  })}
                </div>
              </div>
            );
          })}
        </div>

        {excluded.length > 0 && (
          <div className="spm-excluded">
            <div className="spm-excluded-title"><AlertCircle size={13} /> Not included ({excluded.length})</div>
            {excluded.map((e) => {
              const item = items[e.index] || {};
              return (
                <div key={e.index} className="spm-excluded-row">
                  <span>Day {item.day} — {item.platform} {FORMAT_SHORT[item.format] || item.format}</span>
                  <span className="spm-excluded-reason">{e.reason}</span>
                </div>
              );
            })}
          </div>
        )}

        <div className="spm-footer">
          <span className="spm-footer-note">
            {busy ? progress : `Posts go out at ${time} — reschedule or edit any of them in the Calendar tab.`}
          </span>
          <div className="spm-footer-actions">
            <button className="spm-btn spm-btn--ghost" onClick={onClose} disabled={busy}>Cancel</button>
            <button className="spm-btn spm-btn--primary" onClick={confirm} disabled={busy || schedulable.length === 0}>
              {busy ? <><Loader2 size={14} className="spm-spin" /> Scheduling…</> : <><Check size={14} /> Confirm — schedule {schedulable.length} post{schedulable.length === 1 ? '' : 's'}</>}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
