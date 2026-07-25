// Global generation tracker — lets users leave the page while a long
// image/carousel/story run finishes (founder ask 2026-07-26: "don't make
// them wait 5-6 minutes staring at the chat").
//
// Module-level singleton: it survives SPA route changes (the async run
// closures keep executing after the page component unmounts — React
// state updates just stop landing). Pages register mount state; run
// completions ALWAYS fire a clickable toast, and when the user is no
// longer on the owning page the completion also lands in the top-right
// notification bell with a deep link (?session=…) back to the chat.
//
// Persistence: when the owning page unmounted mid-run, its autosave never
// captured the results — the run's completion callback passes `persist`,
// an async function that patches the session row in the DB directly so
// the deep link reopens onto the finished result.

import { createNotification } from './api';

const runs = new Map();
const mountedTabs = new Set();
let nextId = 1;

export function setPageMounted(tab, mounted) {
  if (mounted) mountedTabs.add(tab);
  else mountedTabs.delete(tab);
}

export function isPageMounted(tab) {
  return mountedTabs.has(tab);
}

// Register a long-running generation. Returns the run id.
// meta: { kind: 'carousel'|'images'|'story', tab: 'content'|'aiceo',
//         sessionId, title, deepLink }
export function beginRun(meta) {
  const id = `run-${nextId++}`;
  runs.set(id, { ...meta, startedAt: Date.now() });
  return id;
}

function showToast(detail) {
  window.dispatchEvent(new CustomEvent('generation-toast', { detail }));
}

// Complete a run.
// outcome: { ok, failedCount = 0, persist = null }
//   - persist: async () => void — direct-DB patch of the session with the
//     run's results; invoked ONLY when the owning page is unmounted
//     (mounted pages already captured results via normal state+autosave).
export async function endRun(id, { ok = true, failedCount = 0, persist = null } = {}) {
  const run = runs.get(id);
  if (!run) return;
  runs.delete(id);

  const away = !isPageMounted(run.tab);
  const secs = Math.round((Date.now() - run.startedAt) / 1000);
  const label = run.title || (run.kind === 'carousel' ? 'Carousel' : run.kind === 'story' ? 'Story sequence' : 'Post images');
  const title = ok && failedCount === 0
    ? `${label} is ready`
    : failedCount > 0
      ? `${label}: ${failedCount} image(s) need a retry`
      : `${label} failed`;

  if (away && typeof persist === 'function') {
    try {
      await persist();
    } catch (err) {
      console.error('[generation-tracker] result persistence failed:', err);
    }
  }

  // Toast always (harmless when they're already looking at the result);
  // bell entry only when they navigated away — that's the "come back to
  // it later" surface, and it survives the toast's auto-dismiss.
  showToast({ title, ok: ok && failedCount === 0, deepLink: run.deepLink, tab: run.tab, secs });
  if (away) {
    try {
      await createNotification({
        title,
        message: ok && failedCount === 0
          ? `Finished in ${secs}s — click to open it in the chat.`
          : 'Open the chat to review and retry.',
        type: ok && failedCount === 0 ? 'success' : 'action_needed',
        actionUrl: run.deepLink || null,
      });
      window.dispatchEvent(new Event('notifications-changed'));
    } catch (err) {
      console.error('[generation-tracker] bell notification failed:', err);
    }
  }
}
