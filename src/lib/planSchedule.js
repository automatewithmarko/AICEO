// Date math for "Schedule all" on content plans.
//
// Plan items carry only a 1-based `day` number — no calendar anchor. The
// optional `item.date` label ("Mon Jul 20") is model-discretionary and
// cosmetic, but when present its weekday prefix is a usable hint: a plan
// whose Day 1 says "Mon" should start on the NEXT Monday from today
// (founder spec, 2026-07-22). Without a hint we start tomorrow.

import { createCalendarPost, uploadImageToStorage } from './api';

const WEEKDAYS = { sun: 0, mon: 1, tue: 2, wed: 3, thu: 4, fri: 5, sat: 6 };

export function toLocalYMD(d) {
  const pad = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

export function parseYMD(ymd) {
  const [y, m, d] = String(ymd).split('-').map(Number);
  return new Date(y, (m || 1) - 1, d || 1);
}

export function addDays(date, n) {
  const d = new Date(date);
  d.setDate(d.getDate() + n);
  return d;
}

// Weekday hint from the plan's Day-1 label ("Mon Jul 20" → 1). Null when
// no parseable hint exists.
export function planWeekdayHint(items) {
  const first = (items || []).find((it) => (it.day || 0) === 1) || (items || [])[0];
  const label = String(first?.date || '').trim().toLowerCase();
  const m = label.match(/^(sun|mon|tue|wed|thu|fri|sat)/);
  return m ? WEEKDAYS[m[1]] : null;
}

// Default start date: next occurrence of the hinted weekday (today counts
// when it matches), else tomorrow.
export function defaultStartDate(items, now = new Date()) {
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const hint = planWeekdayHint(items);
  if (hint == null) return addDays(today, 1);
  let d = today;
  while (d.getDay() !== hint) d = addDays(d, 1);
  return d;
}

// Map every item to a YYYY-MM-DD from the start date + its day offset.
// Items may share a day (multiple posts per day) — same date, both pills.
export function buildDefaultAssignments(items, startYMD) {
  const start = parseYMD(startYMD);
  const out = {};
  (items || []).forEach((item, i) => {
    const dayNum = Number.isFinite(item?.day) && item.day > 0 ? item.day : i + 1;
    out[i] = toLocalYMD(addDays(start, dayNum - 1));
  });
  return out;
}

// Bulk-create scheduled posts through the SAME calendar pipeline the
// one-by-one schedule flows use (createCalendarPost → social_posts →
// scheduled-posts dispatcher). One post per assignment; failures are
// collected, not fatal — partial success still schedules the rest.
//
// entries: [{ index, platform, caption, media: [{src|url}], contentType }]
// assignments: [{ index, date: 'YYYY-MM-DD' }]
// time: 'HH:MM' local wall-clock, encoded to UTC ISO like every existing
//       schedule flow (new Date(y,m,d,hh,mm) → toISOString()).
export async function bulkSchedulePieces({ entries, assignments, time, onProgress }) {
  const byIndex = new Map((entries || []).map((e) => [e.index, e]));
  const scheduled = [];
  const failed = [];
  let n = 0;

  for (const a of assignments || []) {
    n++;
    if (onProgress) onProgress(n, assignments.length);
    const piece = byIndex.get(a.index);
    if (!piece || !a.date) continue;
    try {
      // Hosted URLs only — single_image pieces can still carry base64
      // data: URLs; upload them first (same as saveToCalendar's
      // collectMedia).
      const media = [];
      for (const im of piece.media || []) {
        let url = im?.src || im?.url;
        if (!url) continue;
        if (url.startsWith('data:')) {
          const comma = url.indexOf(',');
          const mimeMatch = url.match(/^data:([^;]+);/);
          if (comma !== -1) {
            const up = await uploadImageToStorage(url.slice(comma + 1), mimeMatch?.[1] || 'image/png');
            url = up?.url || up?.publicUrl || null;
          }
        }
        if (url && !url.startsWith('data:')) media.push({ type: 'image', url });
      }
      if (piece.contentType !== 'text' && media.length === 0) {
        throw new Error('no hosted media — regenerate the piece and try again');
      }

      const [y, m, d] = a.date.split('-').map(Number);
      const [hh, mm] = String(time || '10:00').split(':').map(Number);
      let dt = new Date(y, (m || 1) - 1, d || 1, Number.isFinite(hh) ? hh : 10, Number.isFinite(mm) ? mm : 0, 0);
      // A same-day slot whose time already passed would fire on the next
      // dispatcher tick — push it 30 minutes out instead.
      if (dt.getTime() <= Date.now()) dt = new Date(Date.now() + 30 * 60 * 1000);

      const { post } = await createCalendarPost({
        platform: piece.platform,
        caption: piece.caption,
        content_type: piece.contentType,
        scheduled_at: dt.toISOString(),
        media,
        status: 'scheduled',
      });
      scheduled.push({ index: a.index, scheduledAt: dt.toISOString(), postId: post?.id });
    } catch (err) {
      failed.push({ index: a.index, error: err?.message || 'scheduling failed' });
    }
  }
  return { scheduled, failed };
}
